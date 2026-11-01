import { describe, expect, it } from 'vitest';
import { resolveChain } from '../src/core/chain';
import { Field, clampPlacement } from '../src/core/field';
import { Game, buildTimeline } from '../src/core/game';
import { chainBonus, colorBonus, linkBonus, stepScore } from '../src/core/scoring';
import { generateTsumo } from '../src/core/tsumo';
import { CONFIG } from '../src/config';

describe('scoring', () => {
  it('bonus tables follow the esports (Tsu) rules', () => {
    expect([1, 2, 3, 4, 5, 19].map(chainBonus)).toEqual([0, 8, 16, 32, 64, 512]);
    expect([4, 5, 10, 11, 20].map(linkBonus)).toEqual([0, 2, 7, 10, 10]);
    expect([1, 2, 3, 4, 5].map(colorBonus)).toEqual([0, 3, 6, 12, 24]);
  });

  it('single 4-group 1-chain scores 40 (zero bonus counts as 1)', () => {
    expect(stepScore(1, [4], 1)).toBe(40);
  });

  it('combines chain, link and color bonuses', () => {
    expect(stepScore(2, [4], 1)).toBe(4 * 10 * 8);
    expect(stepScore(1, [5], 1)).toBe(5 * 10 * 2);
    expect(stepScore(1, [4, 4], 2)).toBe(8 * 10 * 3);
    expect(stepScore(3, [4, 6], 2)).toBe(10 * 10 * (16 + 0 + 3 + 3));
  });
});

describe('field placement', () => {
  const pair = { axis: 0, child: 1 };

  it('clamps horizontal placements inside the walls', () => {
    expect(clampPlacement(5, 1)).toBe(4);
    expect(clampPlacement(0, 3)).toBe(1);
    expect(clampPlacement(0, 0)).toBe(0);
    expect(clampPlacement(5, 2)).toBe(5);
  });

  it('stacks vertical pairs in the right order', () => {
    const up = new Field();
    up.place(pair, 2, 0);
    expect(up.cols[2]).toEqual([0, 1]);
    const down = new Field();
    down.place(pair, 2, 2);
    expect(down.cols[2]).toEqual([1, 0]);
  });

  it('splits horizontal pairs onto uneven columns (chigiri)', () => {
    const f = Field.fromRows(['.2....', '.2....']);
    const moves = f.place(pair, 0, 1);
    expect(f.cols[0]).toEqual([0]);
    expect(f.cols[1]).toEqual([2, 2, 1]);
    expect(moves.every((m) => !m.vanished)).toBe(true);
  });

  it('keeps puyo on the 13th row but drops anything entering the 14th', () => {
    const f = new Field();
    f.cols[0] = Array(12).fill(3);
    const moves = f.place(pair, 0, 0);
    expect(f.height(0)).toBe(13);
    expect(f.cols[0][12]).toBe(0);
    expect(moves.find((m) => m.color === 1)?.vanished).toBe(true);
  });

  it('ignores the 13th row when looking for groups', () => {
    // 12段目まで埋めた列の13段目に同色を並べても消えない
    const f = new Field();
    for (let x = 0; x < 4; x++) f.cols[x] = [...Array(12).fill(x % 2 ? 1 : 2), 0];
    expect(f.findGroups().some((g) => g.some((c) => c.y === 12))).toBe(false);
  });

  it('detects death only on column 3, row 12', () => {
    const f = new Field();
    f.cols[2] = Array(11).fill(0);
    expect(f.isDead()).toBe(false);
    f.cols[2].push(1);
    expect(f.isDead()).toBe(true);
    const g = new Field();
    g.cols[0] = Array(12).fill(0);
    expect(g.isDead()).toBe(false);
  });
});

describe('chain resolution', () => {
  it('resolves a 2-chain and scores it', () => {
    // 1連鎖目: 色0の縦4つ / 落ちてきた色1が横の色1とつながって2連鎖目
    const f = Field.fromRows([
      '1.....', //
      '0.....',
      '0.....',
      '0111..',
      '0.....',
    ]);
    const r = resolveChain(f);
    expect(r.steps.map((s) => s.chain)).toEqual([1, 2]);
    expect(r.steps[0].score).toBe(40);
    expect(r.steps[1].score).toBe(4 * 10 * 8);
    expect(r.totalScore).toBe(360);
    expect(r.allClear).toBe(true);
  });

  it('adds the all-clear bonus to the first link of the next chain', () => {
    const f = Field.fromRows(['0', '0', '0', '0']);
    const r = resolveChain(f, CONFIG.ALL_CLEAR_BONUS);
    expect(r.steps[0].score).toBe(40 + CONFIG.ALL_CLEAR_BONUS);
    expect(r.steps[0].allClearBonusApplied).toBe(true);
  });
});

describe('game flow', () => {
  it('carries the all-clear bonus to the next chain', () => {
    const game = new Game(1, 1_000_000);
    // 盤面を直接作って全消しを起こす
    game.field.cols[0] = [5, 5, 5];
    const forcedPair = { axis: 5, child: 6 };
    game.current = () => forcedPair;
    const r = game.place(0, 0);
    expect(r.chain.allClear).toBe(false); // 子ぷよ(6)が残る
    game.field.cols = [[], [], [], [], [], []];
    game.field.cols[0] = [7, 7, 7];
    game.current = () => ({ axis: 7, child: 7 });
    const r2 = game.place(0, 0);
    expect(r2.chain.allClear).toBe(true);
    expect(game.pendingAllClear).toBe(true);
    game.field.cols[1] = [8, 8, 8];
    game.current = () => ({ axis: 8, child: 9 });
    const r3 = game.place(1, 0);
    expect(r3.chain.steps[0].allClearBonusApplied).toBe(true);
    expect(game.pendingAllClear).toBe(false);
  });

  it('finishes when the target is reached', () => {
    const game = new Game(1, 40);
    game.field.cols[0] = [5, 5, 5];
    game.current = () => ({ axis: 5, child: 6 });
    const r = game.place(0, 0);
    expect(r.cleared).toBe(true);
    expect(game.finished).toBe('cleared');
  });

  it('builds a timeline that ends at the last fall', () => {
    const f = Field.fromRows(['1.....', '0.....', '0.....', '0111..', '0.....']);
    const chain = resolveChain(f);
    const tl = buildTimeline([], chain);
    expect(tl.steps).toHaveLength(2);
    expect(tl.total).toBe(tl.steps[1].fallEnd);
    expect(tl.steps[1].popStart).toBe(tl.steps[0].fallEnd + CONFIG.CHAIN_GAP_MS);
  });
});

describe('tsumo', () => {
  it('is deterministic per seed and loops every 128 pairs', () => {
    expect(generateTsumo(123)).toEqual(generateTsumo(123));
    expect(generateTsumo(123)).not.toEqual(generateTsumo(124));
    expect(generateTsumo(1)).toHaveLength(CONFIG.TSUMO_LOOP);
  });

  it('limits the first two pairs to three colors', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const t = generateTsumo(seed);
      const colors = new Set([t[0].axis, t[0].child, t[1].axis, t[1].child]);
      expect(colors.size).toBeLessThanOrEqual(3);
    }
  });

  it('uses every color roughly evenly after the opening', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 1; seed <= 500; seed++) {
      for (const p of generateTsumo(seed).slice(2)) {
        counts[p.axis]++;
        counts[p.child]++;
      }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) expect(Math.abs(c / total - 0.25)).toBeLessThan(0.01);
  });
});

describe('undo', () => {
  it('restores the field, score and tsumo position', () => {
    const game = new Game(77, 1_000_000);
    const first = game.current();
    game.place(0, 0);
    game.place(1, 1);
    const snapshot = game.field.cols.map((c) => [...c]);
    const score = game.score;
    game.place(3, 2);
    expect(game.undo()).toEqual({ x: 3, rot: 2 });
    expect(game.field.cols).toEqual(snapshot);
    expect(game.score).toBe(score);
    expect(game.moves).toBe(2);
    game.undo();
    game.undo();
    expect(game.moves).toBe(0);
    expect(game.current()).toEqual(first);
    expect(game.undo()).toBeNull();
    expect(game.undos).toBe(3);
  });

  it('can undo out of a death but not out of a clear', () => {
    const dead = new Game(1, 1_000_000);
    dead.field.cols[2] = Array(10).fill(0).map((_, i) => i % 2);
    dead.current = () => ({ axis: 2, child: 3 });
    dead.place(2, 0);
    expect(dead.finished).toBe('dead');
    expect(dead.canUndo()).toBe(true);
    dead.undo();
    expect(dead.finished).toBeNull();
    expect(dead.field.height(2)).toBe(10);

    const clear = new Game(1, 40);
    clear.field.cols[0] = [5, 5, 5];
    clear.current = () => ({ axis: 5, child: 6 });
    clear.place(0, 0);
    expect(clear.finished).toBe('cleared');
    expect(clear.canUndo()).toBe(false);
  });
});
