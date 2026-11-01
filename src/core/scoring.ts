/** ぷよぷよeスポーツ（通ルール）準拠の得点ボーナス */

const CHAIN_BONUS = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
const LINK_BONUS: Record<number, number> = { 4: 0, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7 };
const COLOR_BONUS = [0, 0, 3, 6, 12, 24];

export function chainBonus(chain: number): number {
  if (chain <= CHAIN_BONUS.length) return CHAIN_BONUS[chain - 1];
  // 理論上ほぼ起きないが、20連鎖以上は+32ずつ伸ばす
  return CHAIN_BONUS[CHAIN_BONUS.length - 1] + 32 * (chain - CHAIN_BONUS.length);
}

export function linkBonus(size: number): number {
  return size >= 11 ? 10 : LINK_BONUS[size] ?? 0;
}

export function colorBonus(colors: number): number {
  return COLOR_BONUS[colors] ?? 0;
}

/**
 * 1連鎖ぶんの得点
 * 消したぷよ数 × 10 × (連鎖ボーナス + 連結ボーナス + 色数ボーナス)。合計0なら1として計算
 */
export function stepScore(chain: number, groupSizes: number[], colorCount: number): number {
  const cleared = groupSizes.reduce((a, b) => a + b, 0);
  const bonus = chainBonus(chain) + groupSizes.reduce((a, s) => a + linkBonus(s), 0) + colorBonus(colorCount);
  return cleared * 10 * Math.max(1, bonus);
}
