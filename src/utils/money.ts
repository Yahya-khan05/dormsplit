export function formatAmount(amount: number, symbol: string = '₹', decimals: number = 0): string {
  return `${symbol}${amount.toFixed(decimals)}`;
}