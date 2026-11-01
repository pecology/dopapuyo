import { COLS, DEATH_COL, STORED_ROWS, VISIBLE_ROWS } from '../config';
import type { Color, Pair } from './tsumo';

/**
 * 子ぷよの向き
 * 0: 上 / 1: 右 / 2: 下 / 3: 左（右回転で +1）
 */
export type Rotation = 0 | 1 | 2 | 3;

export interface Cell {
  x: number;
  y: number;
}

/** 落下アニメーション用の移動情報（y は 0 が最下段） */
export interface Move {
  x: number;
  fromY: number;
  toY: number;
  color: Color;
  /** 14段目以上に入って消滅したか */
  vanished: boolean;
}

/** 子ぷよの列オフセット */
export const CHILD_DX: Record<Rotation, number> = { 0: 0, 1: 1, 2: 0, 3: -1 };

/** 軸ぷよの列と向きを、盤面内に収まるよう内側に寄せる */
export function clampPlacement(axisX: number, rot: Rotation): number {
  const dx = CHILD_DX[rot];
  const min = Math.max(0, -dx);
  const max = Math.min(COLS - 1, COLS - 1 - dx);
  return Math.min(max, Math.max(min, axisX));
}

/** 出現位置（アニメーション開始位置）。軸ぷよは14段目の高さから落ちてくる */
const SPAWN_AXIS_Y = STORED_ROWS;

/**
 * 盤面。列ごとに下から積んだ配列で持つ（常に重力で詰まった状態）。
 * y = 0 が1段目、y = 12 が13段目。
 */
export class Field {
  cols: Color[][];

  constructor(cols?: Color[][]) {
    this.cols = cols ? cols.map((c) => [...c]) : Array.from({ length: COLS }, () => []);
  }

  clone(): Field {
    return new Field(this.cols);
  }

  get(x: number, y: number): Color | undefined {
    return this.cols[x]?.[y];
  }

  height(x: number): number {
    return this.cols[x].length;
  }

  isEmpty(): boolean {
    return this.cols.every((c) => c.length === 0);
  }

  isDead(): boolean {
    return this.height(DEATH_COL) >= VISIBLE_ROWS;
  }

  /**
   * ペアを置く（置けない位置はない）。
   * 縦置きは同じ列に積み、横置きは各列に個別に落ちる（ちぎり）。
   * 14段目以上に入るぷよは消滅する。
   */
  place(pair: Pair, axisX: number, rot: Rotation): Move[] {
    const x = clampPlacement(axisX, rot);
    const childX = x + CHILD_DX[rot];
    const childSpawnY = SPAWN_AXIS_Y + (rot === 0 ? 1 : rot === 2 ? -1 : 0);

    // 下にあるぷよから先に落とす
    const order: { x: number; color: Color; fromY: number }[] =
      rot === 0
        ? [
            { x, color: pair.axis, fromY: SPAWN_AXIS_Y },
            { x: childX, color: pair.child, fromY: childSpawnY },
          ]
        : [
            { x: childX, color: pair.child, fromY: childSpawnY },
            { x, color: pair.axis, fromY: SPAWN_AXIS_Y },
          ];

    const moves: Move[] = [];
    for (const p of order) {
      const toY = this.cols[p.x].length;
      const vanished = toY >= STORED_ROWS;
      if (!vanished) this.cols[p.x].push(p.color);
      moves.push({ x: p.x, fromY: p.fromY, toY, color: p.color, vanished });
    }
    return moves;
  }

  /** 12段目以下で4個以上つながっているグループを探す（13段目は対象外） */
  findGroups(): Cell[][] {
    const seen = new Set<number>();
    const groups: Cell[][] = [];
    const key = (x: number, y: number) => y * COLS + x;
    for (let x = 0; x < COLS; x++) {
      const h = Math.min(this.height(x), VISIBLE_ROWS);
      for (let y = 0; y < h; y++) {
        if (seen.has(key(x, y))) continue;
        const color = this.get(x, y)!;
        const group: Cell[] = [];
        const stack: Cell[] = [{ x, y }];
        seen.add(key(x, y));
        while (stack.length) {
          const c = stack.pop()!;
          group.push(c);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = c.x + dx;
            const ny = c.y + dy;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= VISIBLE_ROWS) continue;
            if (seen.has(key(nx, ny))) continue;
            if (this.get(nx, ny) !== color) continue;
            seen.add(key(nx, ny));
            stack.push({ x: nx, y: ny });
          }
        }
        if (group.length >= 4) groups.push(group);
      }
    }
    return groups;
  }

  /** 指定セルを消して重力で詰める。落下したぷよの移動を返す */
  removeAndFall(cells: Cell[]): Move[] {
    const remove = new Set(cells.map((c) => c.y * COLS + c.x));
    const moves: Move[] = [];
    for (let x = 0; x < COLS; x++) {
      const next: Color[] = [];
      this.cols[x].forEach((color, y) => {
        if (remove.has(y * COLS + x)) return;
        const toY = next.length;
        if (toY !== y) moves.push({ x, fromY: y, toY, color, vanished: false });
        next.push(color);
      });
      this.cols[x] = next;
    }
    return moves;
  }

  /** デバッグ・テスト用: 文字列から盤面を作る（上の行が上段、'.' は空、数字は色） */
  static fromRows(rows: string[]): Field {
    const f = new Field();
    const bottomUp = [...rows].reverse();
    for (let x = 0; x < COLS; x++) {
      for (const row of bottomUp) {
        const ch = row[x];
        if (ch && ch !== '.') f.cols[x].push(Number(ch));
      }
    }
    return f;
  }
}
