/** Digits of a CNPJ, or null when the value is not a valid CNPJ (length, repeated digits or check digits). */
export function normalizeCnpj(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return null;
  const numbers = [...digits].map(Number);
  const check = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + weight * (numbers[index] ?? 0), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  if (check(12) !== numbers[12] || check(13) !== numbers[13]) return null;
  return digits;
}
