import { CONFIG } from '../config';

/** 色番号（0 〜 4。描画側の GEMS の並び＝赤・緑・青・黄・紫） */
export type Color = number;
export interface Pair {
  axis: Color;
  child: Color;
}

/** 配ぷよ1ループの個数（128手ぶん） */
const POOL_SIZE = 256;
/** 本家の色の総数 */
const ALL_COLORS = 5;

/**
 * ぷよぷよeスポーツと同じ線形合同法の乱数。
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
 * シードから1ループ分（128手）の配ぷよを生成する（ぷよぷよeスポーツの方式）。
 * 1. 5色の並び順（カラーマップ）を決める
 * 2. 3色・4色・5色用に 0,1,2,… を順に並べた256個の表を作り、それぞれをシャッフルする
 *    （16個・32個・64個ずつの区画で、隣り合う区画どうしの要素を入れ替える）
 * 3. 4色・5色の表の先頭4個を3色の表で上書きする（最初の2手は必ず3色以内）
 * 表に各色が同じ数ずつ入っているので、1ループ内の色の出現数はほぼ均等になる。
 */
export function generateTsumo(seed: number, colorCount: number = CONFIG.COLOR_COUNT): Pair[] {
  const rand = createRng(seed & 0xffff);

  const remaining = Array.from({ length: ALL_COLORS }, (_, i) => i);
  const colorMap: Color[] = [];
  for (let k = ALL_COLORS; k >= 1; k--) {
    colorMap.push(remaining.splice(rand(k), 1)[0]);
  }

  const pools = [3, 4, 5].map((n) => {
    const pool = Array.from({ length: POOL_SIZE }, (_, i) => i % n);
    for (const len of [16, 32, 64]) {
      for (let row = 0; row < POOL_SIZE / len - 1; row++) {
        for (let k = 0; k < len / 2; k++) {
          const a = row * len + rand(len);
          const b = (row + 1) * len + rand(len);
          [pool[a], pool[b]] = [pool[b], pool[a]];
        }
      }
    }
    return pool;
  });
  for (let i = 0; i < 4; i++) {
    pools[1][i] = pools[0][i];
    pools[2][i] = pools[0][i];
  }

  const pool = pools[Math.min(Math.max(colorCount, 3), 5) - 3];
  const pairs: Pair[] = [];
  for (let i = 0; i < POOL_SIZE; i += 2) {
    pairs.push({ axis: colorMap[pool[i]], child: colorMap[pool[i + 1]] });
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
