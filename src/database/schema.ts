import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    db = await SQLite.openDatabaseAsync('dormsplit.db');
    await initDatabase(db);
    return db;
  })();

  try {
    return await initPromise;
  } catch (e) {
    initPromise = null;
    db = null;
    throw e;
  }
}

async function initDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_by_id INTEGER,
      category TEXT DEFAULT 'other',
      split_type TEXT DEFAULT 'equal',
      date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (paid_by_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount_owed REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER,
      to_id INTEGER,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_id) REFERENCES members(id),
      FOREIGN KEY (to_id) REFERENCES members(id),
      CHECK (from_id IS NOT NULL OR to_id IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add 'tag' column to members if it doesn't exist
  const cols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(members)'
  );
  const hasTag = cols.some(c => c.name === 'tag');
  if (!hasTag) {
    await database.execAsync(`ALTER TABLE members ADD COLUMN tag TEXT DEFAULT 'roommate';`);
  }

  // Migration: settlements from_id/to_id used to be NOT NULL (person-to-person only).
  // The shared-fund model needs deposits (from only) and withdrawals (to only).
  const settleCols = await database.getAllAsync<{ name: string; notnull: number }>(
    'PRAGMA table_info(settlements)'
  );
  const fromCol = settleCols.find(c => c.name === 'from_id');
  const toCol = settleCols.find(c => c.name === 'to_id');
  const needsRebuild = !!(fromCol && fromCol.notnull === 1) || !!(toCol && toCol.notnull === 1);
  if (needsRebuild) {
    await database.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS settlements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_id INTEGER,
          to_id INTEGER,
          amount REAL NOT NULL,
          note TEXT DEFAULT '',
          date TEXT DEFAULT (date('now')),
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (from_id) REFERENCES members(id),
          FOREIGN KEY (to_id) REFERENCES members(id),
          CHECK (from_id IS NOT NULL OR to_id IS NOT NULL)
        );
        INSERT INTO settlements_new (id, from_id, to_id, amount, note, date, created_at)
          SELECT id, from_id, to_id, amount, note, date, created_at FROM settlements;
        DROP TABLE settlements;
        ALTER TABLE settlements_new RENAME TO settlements;
      `);
    });
  }

  // Migration: expenses.paid_by_id used to be NOT NULL. Fund-paid expenses
  // (money spent straight from the shared fund) have no personal payer.
  const expCols = await database.getAllAsync<{ name: string; notnull: number }>(
    'PRAGMA table_info(expenses)'
  );
  const paidByCol = expCols.find(c => c.name === 'paid_by_id');
  if (paidByCol && paidByCol.notnull === 1) {
    await database.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS expenses_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          paid_by_id INTEGER,
          category TEXT DEFAULT 'other',
          split_type TEXT DEFAULT 'equal',
          date TEXT DEFAULT (date('now')),
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (paid_by_id) REFERENCES members(id)
        );
        INSERT INTO expenses_new (id, description, amount, paid_by_id, category, split_type, date, created_at)
          SELECT id, description, amount, paid_by_id, category, split_type, date, created_at FROM expenses;
        DROP TABLE expenses;
        ALTER TABLE expenses_new RENAME TO expenses;
      `);
    });
  }
}
