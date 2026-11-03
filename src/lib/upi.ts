/**
 * UPI deep links (NPCI's `upi://pay` scheme). On a phone, opening one hands
 * the payment to whichever UPI app the user picks — GPay, PhonePe, Paytm,
 * BHIM — with the payee, amount and note filled in. Nothing is charged by
 * opening the link; the user still confirms in their own app, and recording
 * the settlement in Fee-Nance stays a separate, deliberate step.
 */

/** Same rule as the `profiles.upi_id` check constraint. */
export const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export function isValidUpiId(value: string) {
  return UPI_ID_PATTERN.test(value.trim());
}

export function upiPayLink({
  upiId,
  payeeName,
  amount,
  note,
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}) {
  const params: Array<[string, string]> = [
    ["pa", upiId.trim()],
    ["pn", payeeName],
    ["am", amount.toFixed(2)],
    ["cu", "INR"],
  ];
  if (note) params.push(["tn", note.slice(0, 50)]);

  // encodeURIComponent rather than URLSearchParams: several UPI apps read
  // "+" literally instead of as a space.
  return `upi://pay?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}
