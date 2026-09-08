# DormSplit

Split expenses with roommates and hostel-mates without ever arguing about who owes what.

DormSplit is an **offline-first** React Native app that tracks shared expenses, balances who owes whom, and simplifies debts down to the fewest transfers. All data lives locally on your device — no account, no cloud, no login.

## Features

- **Members with tags** — folks are marked as `roommate`, `hostel`, or `other`, each with their own color
- **Expenses** — record costs with categories (food, grocery, transport, entertainment) and equal or custom splits
- **Smart balance simplification** — a greedy debtor→creditor algorithm reduces complex webs of debt into the minimum number of settlements
- **Shared fund** — deposit money in, withdraw money out, or pay an expense straight from the fund; per-member positions show exactly what each person contributed
- **Settlements** — log person-to-person transfers or fund transactions with notes, and keep full history
- **Stats** — total spent, expense count, and current fund balance at a glance
- **Backup & restore** — export all data to a JSON file and restore it any time
- **Multi-currency** — INR, USD, EUR, GBP, AED, SAR
- **Sliding-scale UX** — works fully offline, no servers to run

## Tech Stack

| Layer | Choice |
|-------|--------|
| Mobile | React Native 0.86 · Expo SDK 57 · expo-router file-based routing |
| UI | React Native Paper 5 · reanimated + glass-effect styling |
| Data | expo-sqlite (local, offline-first, WAL mode + foreign keys) |
| Language | TypeScript |

## Getting Started

```bash
npm install
npx expo start
```

Then open it in the Expo Go app, an Android/iOS emulator, or on the web (`npx expo start --web`).

## Project Structure

```
src/
├── app/          # expo-router screens (home, add, payments, history, settings)
├── components/   # reusable UI components
├── database/     # schema, migrations, and all SQL operations
├── hooks/        # color-scheme, currency
└── utils/        # types, money helpers, backup format
```

## Data Model

- `members` — people in the group (name, color, tag)
- `expenses` — shared costs (amount, payer, category, split type)
- `splits` — each member's share of an expense
- `settlements` — fund deposits/withdrawals and person-to-person transfers
- `settings` — key/value app preferences (e.g. currency)

## License

[MIT](LICENSE)