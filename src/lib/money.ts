export function roundCurrency(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function assertPositiveAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }
}

export function approxEqual(a: number, b: number, epsilon = 0.01) {
  return Math.abs(a - b) <= epsilon;
}
