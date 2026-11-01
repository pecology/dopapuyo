import { CONFIG } from '../config';

/** 色番号（0 〜 COLOR_COUNT-1） */
export type Color = number;
export interface Pair {
  axis: Color;
  child: Color;
}

/** 決定的な32bit擬似乱数（mulberry32） */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * シードから1ループ分（TSUMO_LOOP 手）の配ぷよを生成する。
 * - 最初の2手（4個）は OPENING_COLOR_LIMIT 色以内
 * - 3手目以降は各ぷよが独立に一様ランダム
 */
export function generateTsumo(
  seed: number,
  colorCount: number = CONFIG.COLOR_COUNT,
  loop: number = CONFIG.TSUMO_LOOP,
  openingLimit: number = CONFIG.OPENING_COLOR_LIMIT,
): Pair[] {
  // シード値をかき混ぜてから使う（隣り合うシードの相関を避ける）
  const rng = createRng(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35);

  // 開幕用の色の部分集合
  const all = Array.from({ length: colorCount }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  const opening = all.slice(0, Math.min(openingLimit, colorCount));

  const pairs: Pair[] = [];
  for (let i = 0; i < loop; i++) {
    const pool = i < 2 ? opening : null;
    const pick = () => (pool ? pool[randInt(rng, pool.length)] : randInt(rng, colorCount));
    pairs.push({ axis: pick(), child: pick() });
  }
  return pairs;
}

/** シードをランダムに選ぶ（1〜SEED_COUNT） */
export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * CONFIG.SEED_COUNT);
}

/** ループするツモ列 */
export class TsumoSequence {
  private readonly pairs: Pair[];
  constructor(public readonly seed: number) {
    this.pairs = generateTsumo(seed);
  }
  at(index: number): Pair {
    return this.pairs[index % this.pairs.length];
  }
}
