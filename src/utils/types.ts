export type MemberTag = 'roommate' | 'hostel' | 'other';

export interface Member {
  id: number;
  name: string;
  color: string;
  tag: MemberTag;
  created_at: string;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  // null = paid from the shared fund (not out of anyone's pocket)
  paid_by_id: number | null;
  category: string;
  split_type: 'equal' | 'custom';
  date: string;
  created_at: string;
}

export interface Split {
  id: number;
  expense_id: number;
  member_id: number;
  amount_owed: number;
}

export interface Settlement {
  id: number;
  // A deposit into the fund has only from_id; a withdrawal only to_id;
  // a direct person-to-person transfer has both.
  from_id: number | null;
  to_id: number | null;
  amount: number;
  note: string;
  date: string;
  created_at: string;
}

export interface Balance {
  from_id: number;
  from_name: string;
  to_id: number;
  to_name: string;
  amount: number;
}

export interface ExpenseWithSplits extends Expense {
  paid_by_name: string | null;
  splits: { member_id: number; member_name: string; amount_owed: number }[];
}

export const MEMBER_COLORS = [
  '#E57373', '#81C784', '#64B5F6', '#FFB74D',
  '#BA68C8', '#4DD0E1', '#FF8A65', '#A1887F',
  '#90A4AE', '#F06292', '#7986CB', '#AED581',
];

export const MEMBER_TAGS: { key: MemberTag; label: string; emoji: string }[] = [
  { key: 'roommate', label: 'Roommate', emoji: '🏠' },
  { key: 'hostel', label: 'Hostel', emoji: '🎓' },
  { key: 'other', label: 'Other', emoji: '👤' },
];

export const CATEGORIES = [
  { key: 'food', label: 'Food', emoji: '🍔' },
  { key: 'grocery', label: 'Grocery', emoji: '🛒' },
  { key: 'transport', label: 'Transport', emoji: '🚗' },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { key: 'other', label: 'Other', emoji: '📦' },
];

export const CURRENCIES: { key: string; symbol: string; label: string }[] = [
  { key: 'INR', symbol: '₹', label: '₹ Indian Rupee' },
  { key: 'USD', symbol: '$', label: '$ US Dollar' },
  { key: 'EUR', symbol: '€', label: '€ Euro' },
  { key: 'GBP', symbol: '£', label: '£ British Pound' },
  { key: 'AED', symbol: 'د.إ', label: 'د.إ UAE Dirham' },
  { key: 'SAR', symbol: 'ر.س', label: 'ر.س Saudi Riyal' },
];
