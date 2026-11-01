import type { Cell, Field, Move } from './field';
import { stepScore } from './scoring';

export interface ChainStep {
  chain: number;
  cleared: Cell[];
  /** 消えたぷよの色（cleared と同じ順） */
  clearedColors: number[];
  groupSizes: number[];
  colorCount: number;
  /** この連鎖の得点（全消しボーナス込み） */
  score: number;
  /** 全消しボーナスがこの連鎖で加算されたか */
  allClearBonusApplied: boolean;
  /** 消去後の落下 */
  falls: Move[];
}

export interface ChainResult {
  steps: ChainStep[];
  totalScore: number;
  /** 連鎖終了後に盤面が空になったか */
  allClear: boolean;
}

/**
 * 盤面の連鎖を最後まで解決する（盤面は変更される）。
 * pendingAllClearBonus が 0 より大きければ、1連鎖目にその点数を加算する。
 */
export function resolveChain(field: Field, pendingAllClearBonus = 0): ChainResult {
  const steps: ChainStep[] = [];
  let total = 0;
  for (let chain = 1; ; chain++) {
    const groups = field.findGroups();
    if (groups.length === 0) break;
    const cleared = groups.flat();
    const clearedColors = cleared.map((c) => field.get(c.x, c.y)!);
    const colorCount = new Set(clearedColors).size;
    const groupSizes = groups.map((g) => g.length);
    const applyBonus = chain === 1 && pendingAllClearBonus > 0;
    const score = stepScore(chain, groupSizes, colorCount) + (applyBonus ? pendingAllClearBonus : 0);
    const falls = field.removeAndFall(cleared);
    total += score;
    steps.push({
      chain,
      cleared,
      clearedColors,
      groupSizes,
      colorCount,
      score,
      allClearBonusApplied: applyBonus,
      falls,
    });
  }
  return { steps, totalScore: total, allClear: steps.length > 0 && field.isEmpty() };
}
