/** A hash with a broken percent escape (like %E0%A4%A) must not crash the page; it matches nothing. */
export function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return "";
  }
}
