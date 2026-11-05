import { CONFIG } from '../config';

/** 色番号（0 〜 4。描画側の GEMS の並び＝赤・緑・青・黄・紫） */
export type Color = number;
export interface Pair {
  axis: Color;
  child: Color;
}

/** 1ループの手数 */
const LOOP = 128;
/** 色の数をそろえる単位（8手＝16個） */
const BLOCK_PAIRS = 8;
/** 本家の色の総数 */
const ALL_COLORS = 5;

/**
 * 線形合同法の乱数（ぷよぷよeスポーツと同じ定数）。
 * 状態を進めてから、上位16bitを 0〜m-1 に縮めて返す（剰余ではなく掛けて16bitずらす）。
 */
export function createRng(seed: number): (m: number) => number {
  let s = seed >>> 0;
  return (m) => {
    s = (Math.imul(s, 0x5d588b65) + 0x269ec3) >>> 0;
    return ((s >>> 16) * m) >>> 16;
  };
}

/**
 * シードから1ループ分（128手）の配ぷよを生成する。ぷよぷよeスポーツのチャレンジモードの性質に合わせた本作独自の方式。
 * - 8手（16個）ごとに区切り、区切りの中で各色の数をそろえる（4色なら4個ずつ）
 *   3色・5色は16個を割り切れないので、1色だけ1個多くし、その色を8手ごとに順番に替える（9〜128手目の合計は全色同じ）
 * - 最初の2手（4個）には必ずちょうど3色が入る
 * - 区切りの中の並びは乱数でシャッフルする
 */
export function generateTsumo(seed: number, colorCount: number = CONFIG.COLOR_COUNT): Pair[] {
  const rand = createRng(seed & 0xffff);
  const n = Math.min(Math.max(colorCount, 3), ALL_COLORS);

  // 5色のうちどれをどの番号に使うか（カラーマップ）
  const remaining = Array.from({ length: ALL_COLORS }, (_, i) => i);
  const colorMap: Color[] = [];
  for (let k = ALL_COLORS; k >= 1; k--) {
    colorMap.push(remaining.splice(rand(k), 1)[0]);
  }

  const size = BLOCK_PAIRS * 2;
  const base = Math.floor(size / n);
  const hasExtra = size % n !== 0;
  const puyos: Color[] = [];
  for (let block = 0; block < LOOP / BLOCK_PAIRS; block++) {
    // 1個多くする色。最初の区切りは乱数、以降は順番に替える
    const extra = block === 0 ? rand(n) : (block - 1) % n;
    const pool: number[] = [];
    for (let c = 0; c < n; c++) {
      const count = base + (hasExtra && c === extra ? 1 : 0);
      for (let k = 0; k < count; k++) pool.push(c);
    }
    do {
      shuffle(pool, rand);
    } while (block === 0 && new Set(pool.slice(0, 4)).size !== 3);
    for (const c of pool) puyos.push(colorMap[c]);
  }

  const pairs: Pair[] = [];
  for (let i = 0; i < puyos.length; i += 2) {
    pairs.push({ axis: puyos[i], child: puyos[i + 1] });
  }
  return pairs;
}

/** 配列をその場でシャッフルする（フィッシャー–イェーツ） */
function shuffle(a: number[], rand: (m: number) => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
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
