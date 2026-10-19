/** Small seeded PRNG (mulberry32) so every run of the generator produces identical output. */
export class Random {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("pick from empty list");
    return item;
  }

  /** Fisher-Yates shuffle into a new array (sort with a random comparator is engine-dependent). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * A UUIDv7 whose timestamp is `ms` and whose random bits come from this generator, so ids are
   * stable across runs and still sort by creation time like real client-generated ids.
   */
  uuidv7(ms: number): string {
    const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");
    const time = hex(ms, 12);
    const randA = hex(this.int(0, 0xfff), 3);
    const variant = hex(0x8000 | this.int(0, 0x3fff), 4);
    const randB = hex(this.int(0, 0xffffff), 6) + hex(this.int(0, 0xffffff), 6);
    return `${time.slice(0, 8)}-${time.slice(8, 12)}-7${randA}-${variant}-${randB}`;
  }
}
