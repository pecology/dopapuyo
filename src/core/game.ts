import { CONFIG } from '../config';
import { resolveChain, type ChainResult } from './chain';
import { Field, type Move, type Rotation } from './field';
import { TsumoSequence, type Pair } from './tsumo';

/** 1手ぶんのアニメーションの区切り（ターン開始からの経過ミリ秒） */
export interface Timeline {
  /** 設置の落下が終わる時刻 */
  placeEnd: number;
  /** 各連鎖の [消去開始, 落下開始, 落下終了] */
  steps: { popStart: number; fallStart: number; fallEnd: number }[];
  /** ターン全体の長さ */
  total: number;
}

export interface TurnResult {
  pair: Pair;
  placeMoves: Move[];
  chain: ChainResult;
  scoreBefore: number;
  scoreAfter: number;
  timeline: Timeline;
  cleared: boolean;
  dead: boolean;
}

function maxFall(moves: Move[]): number {
  return moves.reduce((m, mv) => Math.max(m, mv.fromY - mv.toY), 0);
}

export function buildTimeline(placeMoves: Move[], chain: ChainResult): Timeline {
  let t = maxFall(placeMoves) * CONFIG.PLACE_FALL_MS_PER_ROW;
  const placeEnd = t;
  const steps = chain.steps.map((s) => {
    const popStart = t;
    const fallStart = popStart + CONFIG.CHAIN_POP_MS;
    const fallEnd = fallStart + maxFall(s.falls) * CONFIG.CHAIN_FALL_MS_PER_ROW;
    t = fallEnd + CONFIG.CHAIN_GAP_MS;
    return { popStart, fallStart, fallEnd };
  });
  // 最後の連鎖のあとの待ち時間は不要
  const total = steps.length ? steps[steps.length - 1].fallEnd : placeEnd;
  return { placeEnd, steps, total };
}

/**
 * ゲーム本体（時間を持たない純粋なロジック）。
 * 1手ごとに place() を呼ぶと、連鎖まで解決した結果とアニメーション時間を返す。
 */
export class Game {
  readonly field = new Field();
  readonly tsumo: TsumoSequence;
  score = 0;
  moves = 0;
  maxChain = 0;
  pendingAllClear = false;
  finished: 'cleared' | 'dead' | null = null;
  /** 1手戻した回数 */
  undos = 0;
  private history: {
    cols: number[][];
    score: number;
    maxChain: number;
    pendingAllClear: boolean;
    x: number;
    rot: Rotation;
  }[] = [];

  constructor(
    readonly seed: number,
    readonly target: number,
  ) {
    this.tsumo = new TsumoSequence(seed);
  }

  current(): Pair {
    return this.tsumo.at(this.moves);
  }

  nexts(count = CONFIG.NEXT_COUNT): Pair[] {
    return Array.from({ length: count }, (_, i) => this.tsumo.at(this.moves + 1 + i));
  }

  place(axisX: number, rot: Rotation): TurnResult {
    if (this.finished) throw new Error('game already finished');
    const pair = this.current();
    this.history.push({
      cols: this.field.cols.map((c) => [...c]),
      score: this.score,
      maxChain: this.maxChain,
      pendingAllClear: this.pendingAllClear,
      x: axisX,
      rot,
    });
    const placeMoves = this.field.place(pair, axisX, rot);
    const bonus = this.pendingAllClear ? CONFIG.ALL_CLEAR_BONUS : 0;
    const chain = resolveChain(this.field, bonus);
    if (chain.steps.length > 0) this.pendingAllClear = false;
    if (chain.allClear) this.pendingAllClear = true;

    const scoreBefore = this.score;
    this.score += chain.totalScore;
    this.moves++;
    this.maxChain = Math.max(this.maxChain, chain.steps.length);

    const cleared = this.score >= this.target;
    const dead = !cleared && this.field.isDead();
    if (cleared) this.finished = 'cleared';
    else if (dead) this.finished = 'dead';

    return {
      pair,
      placeMoves,
      chain,
      scoreBefore,
      scoreAfter: this.score,
      timeline: buildTimeline(placeMoves, chain),
      cleared,
      dead,
    };
  }

  /** 1手戻せるか（クリア後は不可、窒息後は可） */
  canUndo(): boolean {
    return this.history.length > 0 && this.finished !== 'cleared';
  }

  /** 直前の1手を取り消す。取り消した手の位置と向きを返す */
  undo(): { x: number; rot: Rotation } | null {
    if (!this.canUndo()) return null;
    const h = this.history.pop()!;
    this.field.cols = h.cols;
    this.score = h.score;
    this.maxChain = h.maxChain;
    this.pendingAllClear = h.pendingAllClear;
    this.moves--;
    this.finished = null;
    this.undos++;
    return { x: h.x, rot: h.rot };
  }
}
