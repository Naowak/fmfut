export class SeededRng {
  private state: number;

  constructor(seed: string) {
    this.state = hashString(seed) || 0x6d2b79f5;
  }

  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  integer(min: number, maxInclusive: number): number {
    return Math.floor(this.between(min, maxInclusive + 1));
  }

  chance(probability: number): boolean {
    return this.next() < Math.max(0, Math.min(1, probability));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("SeededRng.pick() appelé avec une liste vide.");
    }
    return items[this.integer(0, items.length - 1)];
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
