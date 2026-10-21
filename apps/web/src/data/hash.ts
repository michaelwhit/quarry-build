/** Decodes one part of the address; null when it has a broken percent escape (like %E0%A4%A). */
export function safeDecode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}
