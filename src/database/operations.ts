import { getDatabase } from './schema';
import { Member, Expense, Split, Settlement, ExpenseWithSplits, MEMBER_COLORS, MemberTag } from '../utils/types';

// ============ MEMBERS ============

export async function addMember(name: string, tag: MemberTag = 'roommate'): Promise<number> {
  const db = await getDatabase();
  const colorIndex = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM members'
  ))?.count ?? 0;
  const color = MEMBER_COLORS[colorIndex % MEMBER_COLORS.length];
  const result = await db.runAsync(
    'INSERT INTO members (name, color, tag) VALUES (?, ?, ?)',
    name.trim(), color, tag
  );
  return result.lastInsertRowId;
}

export async function getMembers(): Promise<Member[]> {
  const db = await getDatabase();
  return db.getAllAsync<Member>('SELECT * FROM members ORDER BY id');
}

export async function updateMember(id: number, name: string, tag?: MemberTag): Promise<void> {
  const db = await getDatabase();
  if (tag) {
    await db.runAsync('UPDATE members SET name = ?, tag = ? WHERE id = ?', name.trim(), tag, id);
  } else {
    await db.runAsync('UPDATE members SET name = ? WHERE id = ?', name.trim(), id);
  }
}

export async function updateMemberTag(id: number, tag: MemberTag): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE members SET tag = ? WHERE id = ?', tag, id);
}

export async function deleteMember(id: number): Promise<void> {
  const db = await getDatabase();
  // Remove everything tied to this member first (FK constraints are ON), then the member.
  await db.withExclusiveTransactionAsync(async (txn) => {
    const paidExpenses = await txn.getAllAsync<{ id: number }>(
      'SELECT id FROM expenses WHERE paid_by_id = ?', id
    );
    for (const e of paidExpenses) {
      await txn.runAsync('DELETE FROM splits WHERE expense_id = ?', e.id);
    }
    await txn.runAsync('DELETE FROM expenses WHERE paid_by_id = ?', id);
    await txn.runAsync('DELETE FROM splits WHERE member_id = ?', id);
    await txn.runAsync('DELETE FROM settlements WHERE from_id = ? OR to_id = ?', id, id);
    await txn.runAsync('DELETE FROM members WHERE id = ?', id);
  });
}

// ============ EXPENSES ============

export async function addExpense(
  description: string,
  amount: number,
  paidById: number | null,
  category: string,
  splitType: 'equal' | 'custom',
  splits: { member_id: number; amount_owed: number }[]
): Promise<number> {
  const db = await getDatabase();
  let expenseId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      'INSERT INTO expenses (description, amount, paid_by_id, category, split_type) VALUES (?, ?, ?, ?, ?)',
      description.trim(), amount, paidById, category, splitType
    );
    expenseId = result.lastInsertRowId;
    for (const split of splits) {
      await txn.runAsync(
        'INSERT INTO splits (expense_id, member_id, amount_owed) VALUES (?, ?, ?)',
        expenseId, split.member_id, split.amount_owed
      );
    }
  });
  return expenseId;
}

export async function deleteExpense(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', id);
}

export async function getExpenses(): Promise<ExpenseWithSplits[]> {
  const db = await getDatabase();
  const expenses = await db.getAllAsync<Expense>(
    `SELECT e.*, m.name as paid_by_name
     FROM expenses e
     LEFT JOIN members m ON e.paid_by_id = m.id
     ORDER BY e.date DESC, e.created_at DESC`
  );

  const result: ExpenseWithSplits[] = [];
  for (const exp of expenses) {
    const splits = await db.getAllAsync<{ member_id: number; member_name: string; amount_owed: number }>(
      `SELECT s.member_id, m.name as member_name, s.amount_owed
       FROM splits s
       JOIN members m ON s.member_id = m.id
       WHERE s.expense_id = ?`,
      exp.id
    );
    const paidByName = (exp as unknown as Record<string, unknown>).paid_by_name as string | null;
    result.push({ ...exp, paid_by_name: paidByName, splits });
  }
  return result;
}

// ============ BALANCES ============

export interface SimplifiedBalance {
  from_id: number;
  from_name: string;
  from_color: string;
  to_id: number;
  to_name: string;
  to_color: string;
  amount: number;
}

export async function getBalances(): Promise<SimplifiedBalance[]> {
  const db = await getDatabase();
  const members = await getMembers();
  if (members.length === 0) return [];

  // Calculate net balance for each member
  // positive = others owe them, negative = they owe others
  const netBalances: Record<number, number> = {};
  for (const m of members) netBalances[m.id] = 0;

  const expenses = await db.getAllAsync<Expense>(
    'SELECT * FROM expenses ORDER BY date DESC'
  );

  for (const exp of expenses) {
    const splits = await db.getAllAsync<Split>(
      'SELECT * FROM splits WHERE expense_id = ?', exp.id
    );
    // The payer paid the full amount, so others owe their share.
    // If paid_by_id is null, the money came straight out of the shared fund
    // (no member gets credited), but everyone's share is still debited.
    if (exp.paid_by_id != null) {
      netBalances[exp.paid_by_id] = (netBalances[exp.paid_by_id] || 0) + exp.amount;
    }
    for (const s of splits) {
      netBalances[s.member_id] = (netBalances[s.member_id] || 0) - s.amount_owed;
    }
  }

  // Apply fund settlements. This is a shared-company (fund) model:
  //   - deposit (from only):      member put cash INTO the fund  -> they are credited
  //   - withdrawal (to only):     member took cash OUT of the fund -> they are debited
  //   - transfer (from + to):     cash handed person-to-person   -> payer credited, receiver debited
  const settlements = await db.getAllAsync<Settlement>('SELECT * FROM settlements');
  for (const s of settlements) {
    if (s.from_id != null) netBalances[s.from_id] = (netBalances[s.from_id] || 0) + s.amount;
    if (s.to_id != null) netBalances[s.to_id] = (netBalances[s.to_id] || 0) - s.amount;
  }

  // Simplify debts using greedy algorithm
  const debtors: { id: number; amount: number }[] = [];
  const creditors: { id: number; amount: number }[] = [];

  for (const [id, balance] of Object.entries(netBalances)) {
    const numId = Number(id);
    if (balance < -0.01) {
      debtors.push({ id: numId, amount: -balance });
    } else if (balance > 0.01) {
      creditors.push({ id: numId, amount: balance });
    }
  }

  // Sort for optimal simplification
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const balances: SimplifiedBalance[] = [];
  let di = 0, ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].amount, creditors[ci].amount);
    if (amount > 0.01) {
      const debtor = members.find(m => m.id === debtors[di].id)!;
      const creditor = members.find(m => m.id === creditors[ci].id)!;
      balances.push({
        from_id: debtors[di].id,
        from_name: debtor.name,
        from_color: debtor.color,
        to_id: creditors[ci].id,
        to_name: creditor.name,
        to_color: creditor.color,
        amount: Math.round(amount * 100) / 100,
      });
    }
    debtors[di].amount -= amount;
    creditors[ci].amount -= amount;
    if (debtors[di].amount < 0.01) di++;
    if (creditors[ci].amount < 0.01) ci++;
  }

  return balances;
}

// ============ SETTLEMENTS ============

export interface SettlementWithNames extends Settlement {
  from_name: string | null;
  to_name: string | null;
}

export async function addSettlement(
  fromId: number | null,
  toId: number | null,
  amount: number,
  note: string
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO settlements (from_id, to_id, amount, note) VALUES (?, ?, ?, ?)',
    fromId, toId, amount, note.trim()
  );
  return result.lastInsertRowId;
}

export async function getSettlements(): Promise<SettlementWithNames[]> {
  const db = await getDatabase();
  return db.getAllAsync<SettlementWithNames>(
    `SELECT s.*, f.name as from_name, t.name as to_name
     FROM settlements s
     LEFT JOIN members f ON s.from_id = f.id
     LEFT JOIN members t ON s.to_id = t.id
     ORDER BY s.date DESC, s.created_at DESC`
  );
}

export async function deleteSettlement(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM settlements WHERE id = ?', id);
}

export async function getTotalReceivedIncome(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM settlements WHERE from_id IS NOT NULL'
  );
  return result?.total ?? 0;
}

// Cash currently in the shared fund = deposits - withdrawals - fund-paid expenses.
export async function getFundTotal(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN from_id IS NOT NULL THEN amount ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN to_id IS NOT NULL THEN amount ELSE 0 END), 0)
              - COALESCE((SELECT SUM(amount) FROM expenses WHERE paid_by_id IS NULL), 0) as total
     FROM settlements`
  );
  return Math.round((result?.total ?? 0) * 100) / 100;
}

// ============ STATS ============

export async function getTotalSpent(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM expenses'
  );
  return result?.total ?? 0;
}

export async function getExpenseCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses'
  );
  return result?.count ?? 0;
}

export async function deleteAllData(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM settlements;
    DELETE FROM splits;
    DELETE FROM expenses;
    DELETE FROM members;
  `);
}

// ============ SETTINGS ============

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value
  );
}

// ============ SHARED ACCOUNT POSITIONS ============

export interface MemberPosition {
  member_id: number;
  name: string;
  color: string;
  paid_for: number; // what they've paid out of pocket for the group's expenses
  share: number;    // their share of the group's expenses
  paid_in: number;  // cash deposits they've put INTO the shared account
  paid_out: number; // cash they've taken OUT of the shared account
  net: number;      // positive = the account owes them (credit), negative = they owe the account
}

export async function getMemberPositions(): Promise<MemberPosition[]> {
  const db = await getDatabase();
  const members = await getMembers();

  const paidFor: Record<number, number> = {};
  const shareMap: Record<number, number> = {};
  const paidIn: Record<number, number> = {};
  const paidOut: Record<number, number> = {};

  for (const r of await db.getAllAsync<{ id: number; t: number }>(
    'SELECT paid_by_id as id, COALESCE(SUM(amount), 0) as t FROM expenses WHERE paid_by_id IS NOT NULL GROUP BY paid_by_id'
  )) paidFor[r.id] = r.t;
  for (const r of await db.getAllAsync<{ id: number; t: number }>(
    'SELECT member_id as id, COALESCE(SUM(amount_owed), 0) as t FROM splits GROUP BY member_id'
  )) shareMap[r.id] = r.t;
  for (const r of await db.getAllAsync<{ id: number; t: number }>(
    'SELECT from_id as id, COALESCE(SUM(amount), 0) as t FROM settlements WHERE from_id IS NOT NULL GROUP BY from_id'
  )) paidIn[r.id] = r.t;
  for (const r of await db.getAllAsync<{ id: number; t: number }>(
    'SELECT to_id as id, COALESCE(SUM(amount), 0) as t FROM settlements WHERE to_id IS NOT NULL GROUP BY to_id'
  )) paidOut[r.id] = r.t;

  return members.map(m => {
    const pf = paidFor[m.id] ?? 0;
    const sh = shareMap[m.id] ?? 0;
    const pi = paidIn[m.id] ?? 0;
    const po = paidOut[m.id] ?? 0;
    const net = Math.round((pf + pi - sh - po) * 100) / 100;
    return { member_id: m.id, name: m.name, color: m.color, paid_for: pf, share: sh, paid_in: pi, paid_out: po, net };
  });
}

// ============ SETTLEMENTS (fund deposits & withdrawals) ============

export async function updateSettlement(
  id: number,
  fromId: number | null,
  toId: number | null,
  amount: number,
  note: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE settlements SET from_id = ?, to_id = ?, amount = ?, note = ? WHERE id = ?',
    fromId, toId, amount, note.trim(), id
  );
}

// ============ BACKUP / RESTORE ============

export interface BackupData {
  version: 1;
  exported_at: string;
  members: Member[];
  expenses: Expense[];
  splits: Split[];
  settlements: Settlement[];
  settings: { key: string; value: string }[];
}

export async function exportAllData(): Promise<BackupData> {
  const db = await getDatabase();
  const [members, expenses, splits, settlements, settings] = await Promise.all([
    db.getAllAsync<Member>('SELECT * FROM members ORDER BY id'),
    db.getAllAsync<Expense>('SELECT * FROM expenses ORDER BY id'),
    db.getAllAsync<Split>('SELECT * FROM splits ORDER BY id'),
    db.getAllAsync<Settlement>('SELECT * FROM settlements ORDER BY id'),
    db.getAllAsync<{ key: string; value: string }>('SELECT * FROM settings'),
  ]);
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    members,
    expenses,
    splits,
    settlements,
    settings,
  };
}

export async function importAllData(data: BackupData): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM settlements;
      DELETE FROM splits;
      DELETE FROM expenses;
      DELETE FROM members;
      DELETE FROM settings;
    `);
    for (const m of data.members || []) {
      await txn.runAsync(
        'INSERT INTO members (id, name, color, tag, created_at) VALUES (?, ?, ?, ?, ?)',
        m.id, m.name, m.color, m.tag ?? 'roommate', m.created_at
      );
    }
    for (const e of data.expenses || []) {
      await txn.runAsync(
        'INSERT INTO expenses (id, description, amount, paid_by_id, category, split_type, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        e.id, e.description, e.amount, e.paid_by_id, e.category ?? 'other', e.split_type ?? 'equal', e.date, e.created_at
      );
    }
    for (const s of data.splits || []) {
      await txn.runAsync(
        'INSERT INTO splits (id, expense_id, member_id, amount_owed) VALUES (?, ?, ?, ?)',
        s.id, s.expense_id, s.member_id, s.amount_owed
      );
    }
    for (const s of data.settlements || []) {
      await txn.runAsync(
        'INSERT INTO settlements (id, from_id, to_id, amount, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        s.id, s.from_id, s.to_id, s.amount, s.note ?? '', s.date, s.created_at
      );
    }
    for (const kv of data.settings || []) {
      await txn.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', kv.key, kv.value);
    }
  });
}
