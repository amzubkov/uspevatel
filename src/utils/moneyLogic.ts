export interface BalancePart {
  amount: number;
  isCorrection: boolean;
}

/** A correction is always derived from the ledger without old corrections. */
export function calculateCorrectionAmount(actualBalance: number, transactions: BalancePart[]): number {
  const ledgerBalance = transactions
    .filter((transaction) => !transaction.isCorrection)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  return actualBalance - ledgerBalance;
}

/** A paid occurrence gets one stable ledger row even if the action is retried. */
export function recurringPaymentTransactionId(paymentId: string, dueDate: string): string {
  return `recurring-payment:${paymentId}:${dueDate}`;
}

export interface ImportComparableTransaction {
  date: string;
  timestamp?: string;
  amount: number;
  comment: string;
}

export function transactionImportKey(transaction: ImportComparableTransaction): string {
  return `${transaction.timestamp || `${transaction.date}T00:00:00`}|${transaction.amount}|${transaction.comment}`;
}

/** Subtract existing rows as a multiset without collapsing legitimate twins in a statement. */
export function filterAlreadyImportedTransactions<T extends ImportComparableTransaction>(
  existing: readonly ImportComparableTransaction[],
  incoming: readonly T[],
): T[] {
  const remainingExisting = new Map<string, number>();
  for (const transaction of existing) {
    const key = transactionImportKey(transaction);
    remainingExisting.set(key, (remainingExisting.get(key) || 0) + 1);
  }
  return incoming.filter((transaction) => {
    const key = transactionImportKey(transaction);
    const remaining = remainingExisting.get(key) || 0;
    if (remaining <= 0) return true;
    remainingExisting.set(key, remaining - 1);
    return false;
  });
}

/** Preserve an imported transaction's clock time when only its calendar date changes. */
export function timestampForEditedDate(
  originalDate: string,
  originalTimestamp: string | undefined,
  nextDate: string,
): string | undefined {
  if (nextDate === originalDate) return undefined;
  const timePart = originalTimestamp?.match(/T(.+)$/)?.[1] || '00:00:00';
  return `${nextDate}T${timePart}`;
}
