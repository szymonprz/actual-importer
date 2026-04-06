import { createHash } from "node:crypto";

export function computeImportedId(
  date: string,
  amount: number,
  description: string,
  bankAccountNumber: string
): string {
  const input = `${date}|${amount}|${description}|${bankAccountNumber}`;
  return createHash("sha256").update(input).digest("hex");
}
