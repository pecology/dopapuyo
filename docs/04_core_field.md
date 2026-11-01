# src/core/field.ts

盤面（フィールド）を表すファイル。ぷよを置く、つながりを探す、消して詰める、という盤面の基本操作がすべてここにある。

**座標の約束**: `x` は列（0〜5、左から）、`y` は段（0が一番下）。画面の上下とは逆なので注意。
盤面は「列ごとに、下から積んだ配列」で持つ。たとえば `cols[0] = [2, 2, 1]` なら、1列目の下から 色2・色2・色1 が積まれている。
ぷよぷよは常に重力で下に詰まっているので、この持ち方なら「空中に浮いたぷよ」が表現できず、扱いが楽になる。

**L1–3**

```ts
  1 | import { COLS, DEATH_COL, STORED_ROWS, VISIBLE_ROWS } from '../config';
  2 | import type { Color, Pair } from './tsumo';
  3 | 
```

- L1: 盤面の寸法を `config.ts` から読み込む。
- L2: `import type` は「型だけ」を読み込む書き方。実行時のコードには何も残らない。

## 型の定義

**L4–8**

```ts
  4 | /**
  5 |  * 子ぷよの向き
  6 |  * 0: 上 / 1: 右 / 2: 下 / 3: 左（右回転で +1）
  7 |  */
  8 | export type Rotation = 0 | 1 | 2 | 3;
```

`Rotation` は子ぷよの向き。`0 | 1 | 2 | 3` は「この4つの値のどれか」という**ユニオン型**で、5 などを入れようとするとエラーになる。
0=上、1=右、2=下、3=左。右回転すると +1 される並びにしてあるので、回転は `(rot + 1) % 4` で計算できる。

**L9–13**

```ts
  9 | 
 10 | export interface Cell {
 11 |   x: number;
 12 |   y: number;
 13 | }
```

`Cell` は盤面上の1マスの位置（x, y）。

**L14–23**

```ts
 14 | 
 15 | /** 落下アニメーション用の移動情報（y は 0 が最下段） */
 16 | export interface Move {
 17 |   x: number;
 18 |   fromY: number;
 19 |   toY: number;
 20 |   color: Color;
 21 |   /** 14段目以上に入って消滅したか */
 22 |   vanished: boolean;
 23 | }
```

`Move` は「1個のぷよがどこからどこへ落ちたか」。描画側（renderer）がこれを見て落下アニメーションを作る。
- `fromY` / `toY` … 落ち始めと着地の段。
- `vanished` … 14段目に入って消えたぷよなら true（描画しない）。

**L24–26**

```ts
 24 | 
 25 | /** 子ぷよの列オフセット */
 26 | export const CHILD_DX: Record<Rotation, number> = { 0: 0, 1: 1, 2: 0, 3: -1 };
```

`CHILD_DX` … 向きごとの「子ぷよが軸ぷよから何列ずれるか」。上下なら0、右なら+1、左なら-1。
`Record<Rotation, number>` は「キーが Rotation、値が number のオブジェクト」という型。4つの向きすべてにキーがないとエラーになるので、書き漏れを防げる。

## はみ出し補正 clampPlacement

**L27–34**

```ts
 27 | 
 28 | /** 軸ぷよの列と向きを、盤面内に収まるよう内側に寄せる */
 29 | export function clampPlacement(axisX: number, rot: Rotation): number {
 30 |   const dx = CHILD_DX[rot];
 31 |   const min = Math.max(0, -dx);
 32 |   const max = Math.min(COLS - 1, COLS - 1 - dx);
 33 |   return Math.min(max, Math.max(min, axisX));
 34 | }
```

横置きで盤面からはみ出す位置を指定されたとき、内側に寄せる関数。
- L30: 子ぷよの列のずれ `dx` を取る。
- L31: 軸ぷよの列の下限。子が左（dx=-1）なら、子が0列目に来られるよう軸は1列目以上。それ以外は0。
- L32: 上限。子が右（dx=+1）なら軸は4列目まで。それ以外は5。
- L33: `Math.max(min, axisX)` で下限より小さければ下限に、`Math.min(max, ...)` で上限より大きければ上限にする。値を範囲内に収める定番の書き方。

**L35–38**

```ts
 35 | 
 36 | /** 出現位置（アニメーション開始位置）。軸ぷよは14段目の高さから落ちてくる */
 37 | const SPAWN_AXIS_Y = STORED_ROWS;
 38 | 
```

置いたぷよが落ち始める高さ。`STORED_ROWS`（13）＝ 14段目の位置から落ちてくるように見せる。これはアニメーション用の値で、ルールには影響しない。

## Field クラス

**L39–48**

```ts
 39 | /**
 40 |  * 盤面。列ごとに下から積んだ配列で持つ（常に重力で詰まった状態）。
 41 |  * y = 0 が1段目、y = 12 が13段目。
 42 |  */
 43 | export class Field {
 44 |   cols: Color[][];
 45 | 
 46 |   constructor(cols?: Color[][]) {
 47 |     this.cols = cols ? cols.map((c) => [...c]) : Array.from({ length: COLS }, () => []);
 48 |   }
```

- L44: `cols: Color[][]` … 色の配列の配列。外側が列（6個）、内側がその列に積まれたぷよ。
- L46: `constructor(cols?: Color[][])` … `?` は省略可能な引数。
- L47: 引数があればそれを**コピー**して使い、なければ空の列を6本作る。
  - `cols.map((c) => [...c])` … 各列を `[...c]`（スプレッド構文）で複製する。元の配列をそのまま使うと、コピー先を変えたときに元まで変わってしまうため。
  - `Array.from({ length: COLS }, () => [])` … 空配列を6個並べた配列を作る。

**L49–52**

```ts
 49 | 
 50 |   clone(): Field {
 51 |     return new Field(this.cols);
 52 |   }
```

`clone()` … 盤面の複製を返す。コンストラクタがコピーしてくれるので、`new Field(this.cols)` だけでよい。
置き先プレビュー（試しに置いてみる）や、1手戻す用の保存で使う。

**L53–56**

```ts
 53 | 
 54 |   get(x: number, y: number): Color | undefined {
 55 |     return this.cols[x]?.[y];
 56 |   }
```

`get(x, y)` … そのマスの色。ぷよがなければ `undefined`。
`this.cols[x]?.[y]` の `?.` は**オプショナルチェーン**。`cols[x]` が存在しない（列番号が範囲外）ときにエラーにせず `undefined` を返す。

**L57–60**

```ts
 57 | 
 58 |   height(x: number): number {
 59 |     return this.cols[x].length;
 60 |   }
```

`height(x)` … その列に積まれている個数＝高さ。配列の長さそのもの。

**L61–64**

```ts
 61 | 
 62 |   isEmpty(): boolean {
 63 |     return this.cols.every((c) => c.length === 0);
 64 |   }
```

`isEmpty()` … 盤面が空か（全消し判定）。`every` は「全要素が条件を満たすか」を返す。全列の長さが0なら空。

**L65–68**

```ts
 65 | 
 66 |   isDead(): boolean {
 67 |     return this.height(DEATH_COL) >= VISIBLE_ROWS;
 68 |   }
```

`isDead()` … 窒息判定。3列目（`DEATH_COL`）の高さが12以上、つまり12段目にぷよがあれば窒息。

## ペアを置く place

**L69–79**

```ts
 69 | 
 70 |   /**
 71 |    * ペアを置く（置けない位置はない）。
 72 |    * 縦置きは同じ列に積み、横置きは各列に個別に落ちる（ちぎり）。
 73 |    * 14段目以上に入るぷよは消滅する。
 74 |    */
 75 |   place(pair: Pair, axisX: number, rot: Rotation): Move[] {
 76 |     const x = clampPlacement(axisX, rot);
 77 |     const childX = x + CHILD_DX[rot];
 78 |     const childSpawnY = SPAWN_AXIS_Y + (rot === 0 ? 1 : rot === 2 ? -1 : 0);
 79 | 
```

- L76: まず横置きのはみ出しを補正して、軸ぷよの列 `x` を決める。
- L77: 子ぷよの列。
- L78: 子ぷよが落ち始める高さ。子が上なら軸の1段上、下なら1段下、横なら同じ高さ。`a ? b : c ? d : e` は三項演算子を2つつなげたもので、「rot が0なら1、rot が2なら-1、それ以外は0」。

**L80–91**

```ts
 80 |     // 下にあるぷよから先に落とす
 81 |     const order: { x: number; color: Color; fromY: number }[] =
 82 |       rot === 0
 83 |         ? [
 84 |             { x, color: pair.axis, fromY: SPAWN_AXIS_Y },
 85 |             { x: childX, color: pair.child, fromY: childSpawnY },
 86 |           ]
 87 |         : [
 88 |             { x: childX, color: pair.child, fromY: childSpawnY },
 89 |             { x, color: pair.axis, fromY: SPAWN_AXIS_Y },
 90 |           ];
 91 | 
```

落とす順番を決める。同じ列に縦置きするときは、**下にあるほうから先に積む**必要がある。
- 子が上（rot=0）: 軸ぷよ → 子ぷよ の順。
- それ以外: 子ぷよ → 軸ぷよ の順。子が下（rot=2）ならこれで正しい。横置きは別々の列なので順番は関係ないが、同じ書き方でまとめている。

`order` の型 `{ x: number; color: Color; fromY: number }[]` は、その場で書いたオブジェクトの形の配列。

**L92–100**

```ts
 92 |     const moves: Move[] = [];
 93 |     for (const p of order) {
 94 |       const toY = this.cols[p.x].length;
 95 |       const vanished = toY >= STORED_ROWS;
 96 |       if (!vanished) this.cols[p.x].push(p.color);
 97 |       moves.push({ x: p.x, fromY: p.fromY, toY, color: p.color, vanished });
 98 |     }
 99 |     return moves;
100 |   }
```

実際に積む。
- L94: 着地する段 `toY` は、その時点の列の高さ（＝一番上の空きマス）。1個目を積むと高さが増えるので、縦置きの2個目は自動的にその上に乗る。
- L95: 着地点が13以上（14段目以上）なら消滅扱い。
- L96: 消滅でなければ列の配列に追加（`push`）。
- L97: アニメーション用に移動情報を記録。`{ x: p.x, ..., toY, ... }` の `toY` だけの書き方は `toY: toY` の省略形。
- L99: 記録を返す。

## つながりを探す findGroups

**L101–106**

```ts
101 | 
102 |   /** 12段目以下で4個以上つながっているグループを探す（13段目は対象外） */
103 |   findGroups(): Cell[][] {
104 |     const seen = new Set<number>();
105 |     const groups: Cell[][] = [];
106 |     const key = (x: number, y: number) => y * COLS + x;
```

4個以上つながった同色グループをすべて探す。
- L104: `seen` … もう調べたマスの記録。`Set` は重複しない値の集まりで、`has` で「入っているか」を高速に調べられる。
- L106: `key` … (x, y) を1つの数値にまとめる関数。`y * 6 + x` にすると全マスが別々の番号になり、Set に入れやすい。

**L107–114**

```ts
107 |     for (let x = 0; x < COLS; x++) {
108 |       const h = Math.min(this.height(x), VISIBLE_ROWS);
109 |       for (let y = 0; y < h; y++) {
110 |         if (seen.has(key(x, y))) continue;
111 |         const color = this.get(x, y)!;
112 |         const group: Cell[] = [];
113 |         const stack: Cell[] = [{ x, y }];
114 |         seen.add(key(x, y));
```

- L107–109: 全マスを1つずつ見る。ただし `Math.min(this.height(x), VISIBLE_ROWS)` で**12段目まで**に限る。13段目のぷよは消えないルールなので、ここで探索対象から外している。
- L110: 調べ済みならスキップ（`continue` で次のループへ）。
- L111: そのマスの色。末尾の `!` は「ここは undefined ではない」と TypeScript に伝える記号（高さの範囲内なので必ずぷよがある）。
- L112–114: 新しいグループの探索を始める準備。`stack` は「これから隣を調べるマス」のリスト。

**L115–132**

```ts
115 |         while (stack.length) {
116 |           const c = stack.pop()!;
117 |           group.push(c);
118 |           for (const [dx, dy] of [
119 |             [1, 0],
120 |             [-1, 0],
121 |             [0, 1],
122 |             [0, -1],
123 |           ]) {
124 |             const nx = c.x + dx;
125 |             const ny = c.y + dy;
126 |             if (nx < 0 || nx >= COLS || ny < 0 || ny >= VISIBLE_ROWS) continue;
127 |             if (seen.has(key(nx, ny))) continue;
128 |             if (this.get(nx, ny) !== color) continue;
129 |             seen.add(key(nx, ny));
130 |             stack.push({ x: nx, y: ny });
131 |           }
132 |         }
```

**深さ優先探索（DFS）** でつながりを広げる。
- L115: 調べるマスが残っている間くり返す。
- L116–117: 1マス取り出して、グループに加える。
- L118–123: 上下左右の4方向。`for (const [dx, dy] of [...])` は、配列の各要素 `[1, 0]` などを `dx`, `dy` に分割代入しながら回す書き方。
- L126: 盤面外、または13段目以上なら飛ばす。
- L127: 調べ済みなら飛ばす。
- L128: 色が違えば飛ばす。
- L129–130: 同じ色なら「調べ済み」にして、あとで隣を調べるためにスタックに積む。

**L133–137**

```ts
133 |         if (group.length >= 4) groups.push(group);
134 |       }
135 |     }
136 |     return groups;
137 |   }
```

- L133: 探索が終わったグループが4個以上なら、消えるグループとして記録。
- L136: 見つかったグループの一覧を返す。何もなければ空配列 → 連鎖終了の合図になる。

## 消して詰める removeAndFall

**L138–154**

```ts
138 | 
139 |   /** 指定セルを消して重力で詰める。落下したぷよの移動を返す */
140 |   removeAndFall(cells: Cell[]): Move[] {
141 |     const remove = new Set(cells.map((c) => c.y * COLS + c.x));
142 |     const moves: Move[] = [];
143 |     for (let x = 0; x < COLS; x++) {
144 |       const next: Color[] = [];
145 |       this.cols[x].forEach((color, y) => {
146 |         if (remove.has(y * COLS + x)) return;
147 |         const toY = next.length;
148 |         if (toY !== y) moves.push({ x, fromY: y, toY, color, vanished: false });
149 |         next.push(color);
150 |       });
151 |       this.cols[x] = next;
152 |     }
153 |     return moves;
154 |   }
```

- L141: 消すマスを `key` と同じ番号にして Set に入れる。
- L143–152: 列ごとに、消さないぷよだけを下から詰め直した新しい配列 `next` を作る。
  - L145: `forEach((color, y) => ...)` で、列のぷよを下から順に見る（`y` が元の段）。
  - L146: 消すマスなら飛ばす（`forEach` の中の `return` は「この要素は終わり、次へ」）。
  - L147: 詰めた後の段は、`next` に今入っている個数。
  - L148: 段が変わった（落ちた）ぷよだけ、アニメーション用に移動を記録。
  - L149: `next` に追加。
- L151: 列を詰め直した配列に置き換える。13段目のぷよも、下が消えればここで自然に落ちてくる。
- L153: 移動の記録を返す。

## テスト用の盤面作成 fromRows

**L155–168**

```ts
155 | 
156 |   /** デバッグ・テスト用: 文字列から盤面を作る（上の行が上段、'.' は空、数字は色） */
157 |   static fromRows(rows: string[]): Field {
158 |     const f = new Field();
159 |     const bottomUp = [...rows].reverse();
160 |     for (let x = 0; x < COLS; x++) {
161 |       for (const row of bottomUp) {
162 |         const ch = row[x];
163 |         if (ch && ch !== '.') f.cols[x].push(Number(ch));
164 |       }
165 |     }
166 |     return f;
167 |   }
168 | }
```

テストで盤面を手早く作るための関数。`static` は「インスタンスを作らずに `Field.fromRows(...)` と呼べる」関数。
- 引数は画面の見た目どおり、上の行から順に文字列で書く（`'.'` は空き、数字は色）。
- L159: 配列を反転して下の行から処理する。`[...rows]` で複製してから `reverse()` しているのは、`reverse` が元の配列を書き換えてしまうため。
- L160–165: 列ごとに、下の行から順に色を積む。空き `'.'` は飛ばすので、文字列で途中に隙間を書いても重力で詰まった盤面になる。
- L163: `Number(ch)` で文字 `'2'` を数値 2 に変換。
