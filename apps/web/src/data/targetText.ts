/** The target as the goal page shows it: the written target, plus the number only if it adds one. */
export function targetText(target: string, value: number, unit: string | null): string {
  const t = target.trim();
  const number = String(value);
  if (new RegExp(`(?<!\\d|\\d\\.)${number.replace(".", "\\.")}(?!\\d|\\.\\d)`).test(t)) return t;
  return `${t} (${number}${unit ? ` ${unit}` : ""})`;
}
