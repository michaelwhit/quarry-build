// Length limits count Unicode code points, the same as the Swift app and the server, not the
// UTF-16 units that String.length counts. An emoji is one code point but two units, so counting
// units would turn a text away that the other apps accept, and cutting at a unit count can split
// an emoji in half and leave an unreadable lone half behind.

/** How many code points the text holds. */
export const count = (s: string): number => [...s].length;

/** True when the text holds at most `max` code points. */
export const within = (s: string, max: number): boolean => count(s) <= max;

/** The first `max` code points, never ending in half an emoji. */
export const clip = (s: string, max: number): string =>
  s.length <= max ? s : [...s].slice(0, max).join("");
