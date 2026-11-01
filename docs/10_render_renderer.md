# src/render/renderer.ts

画面に盤面を描くファイル。毎フレーム（1秒に約60回）`render()` が呼ばれ、そのたびに画面を消して全部描き直す。

担当していること:
- 盤面・操作中のペア・置き先プレビュー・ネクストの描画
- 1手ぶんのアニメーション（落下 → 消去 → 落下…）を、経過時間から「今どの瞬間か」を計算して描く
- 砕ける破片、連鎖数のポップアップ、画面揺れ、フラッシュ、中央の大きな文字（バナー）
- タッチ位置から列を求める計算

**座標の約束**: ここでは2種類の座標が出てくる。
- 盤面の座標（`x` 列、`y` 段。y は下が0）
- 画面のピクセル座標（左上が0、下に行くほど大きい）

`cellX` / `cellY` が盤面の座標を画面の座標に変換する。

**L1–7**

```ts
  1 | import { COLS, CONFIG, DEATH_COL, VISIBLE_ROWS } from '../config';
  2 | import type { ChainStep } from '../core/chain';
  3 | import { CHILD_DX, Field, clampPlacement, type Move, type Rotation } from '../core/field';
  4 | import type { TurnResult } from '../core/game';
  5 | import type { Pair } from '../core/tsumo';
  6 | import { clearGemCache, drawSparkle, gemSprite, gemStyle } from './gems';
  7 | 
```

必要なものを読み込む。盤面の寸法、連鎖・1手の結果の型、盤面クラス、宝石の絵を作る関数など。

## 描画に渡すデータの型

**L8–16**

```ts
  8 | export interface TurnAnimation {
  9 |   turn: TurnResult;
 10 |   /** 設置前の盤面 */
 11 |   before: Field;
 12 |   /** frames[0]: 設置直後 / frames[i]: i連鎖目の消去・落下後 */
 13 |   frames: Field[];
 14 |   start: number;
 15 | }
 16 | 
```

`TurnAnimation` … 再生中の1手ぶんのアニメーション。
- `turn` … `Game.place()` が返した結果（時刻表つき）。
- `before` … 置く前の盤面。
- `frames` … 各段階の盤面のスナップショット。`frames[0]` が置いた直後、`frames[1]` が1連鎖目を消して詰めた後…。`main.ts` が作って渡す。
- `start` … このアニメーションが始まった時刻。

**L17–21**

```ts
 17 | export interface Cursor {
 18 |   x: number;
 19 |   rot: Rotation;
 20 | }
 21 | 
```

`Cursor` … 操作中ペアの位置（軸ぷよの列）と向き。

**L22–33**

```ts
 22 | export interface RenderState {
 23 |   field: Field;
 24 |   anim: TurnAnimation | null;
 25 |   current: Pair | null;
 26 |   cursor: Cursor;
 27 |   nexts: Pair[];
 28 |   /** 置き先プレビューを出すか */
 29 |   ghost: boolean;
 30 |   /** 指が盤面の外にあり、離すとキャンセルになる */
 31 |   cancelHint: boolean;
 32 | }
 33 | 
```

`RenderState` … `render()` に毎フレーム渡す「今描くべきもの」一式。描画クラスはゲームの状態を自分では持たず、毎回これを受け取って描くだけにしている。
- `anim` … 再生中のアニメーション。なければ `null`（静止状態）。
- `current` … 操作中のペア。ゲームが終わっていれば `null`。
- `ghost` … 置き先プレビューを出すか。
- `cancelHint` … 「× 離すとキャンセル」を出すか。

**L34–47**

```ts
 34 | interface Particle {
 35 |   x: number;
 36 |   y: number;
 37 |   vx: number;
 38 |   vy: number;
 39 |   life: number;
 40 |   maxLife: number;
 41 |   size: number;
 42 |   color: string;
 43 |   kind: 'shard' | 'spark';
 44 |   rot: number;
 45 |   vr: number;
 46 | }
 47 | 
```

`Particle` … 破片や光の粒1つぶん。
- `x, y` 位置、`vx, vy` 速度（1秒あたりのピクセル）。
- `life` 経過秒、`maxLife` 寿命。寿命が来たら消す。
- `kind` … `'shard'`（色付きの破片、重力で落ちる）か `'spark'`（白い光、ふわっと上がる）。
- `rot, vr` … 破片の回転角と回転速度。

**L48–56**

```ts
 48 | interface Popup {
 49 |   x: number;
 50 |   y: number;
 51 |   chain: number;
 52 |   score: number;
 53 |   born: number;
 54 |   allClearBonus: boolean;
 55 | }
 56 | 
```

`Popup` … 「3連鎖 +1,280」のような浮かび上がる文字。`born` は出た時刻。

## レイアウトの定数

**L57–64**

```ts
 57 | /** 盤面の上の操作ペア表示エリア（軸ぷよは常に中段） */
 58 | const SPAWN_ROWS = 3;
 59 | const NEXT_W = 1.7;
 60 | const GAP = 0.4;
 61 | const PAD = 0.3;
 62 | 
 63 | const key = (x: number, y: number) => y * COLS + x;
 64 | 
```

単位はすべて「マス何個ぶん」。
- `SPAWN_ROWS = 3` … 盤面の上にある、操作中ペアを表示する3段ぶんの空間。軸ぷよを中段に固定するために3段ある。
- `NEXT_W = 1.7` … ネクスト列の幅。
- `GAP = 0.4` … 盤面とネクストの間の隙間。
- `PAD = 0.3` … 周りの余白。
- `key` … (x, y) を1つの数値にする関数（`field.ts` と同じ考え方）。

## Renderer クラスの状態

**L65–84**

```ts
 65 | export class Renderer {
 66 |   private g: CanvasRenderingContext2D;
 67 |   private dpr = 1;
 68 |   private w = 0;
 69 |   private h = 0;
 70 |   /** 1マスの大きさ（CSS px） */
 71 |   s = 32;
 72 |   private fx = 0;
 73 |   private fy = 0;
 74 |   private nx = 0;
 75 |   private particles: Particle[] = [];
 76 |   private popups: Popup[] = [];
 77 |   private shakeUntil = 0;
 78 |   private shakeAmp = 0;
 79 |   private flashUntil = 0;
 80 |   private flashStart = 0;
 81 |   private bannerText = '';
 82 |   private bannerUntil = 0;
 83 |   private bannerStart = 0;
 84 | 
```

- `g` … 描画用のコンテキスト。
- `dpr` … **デバイスピクセル比**。スマホや高解像度ディスプレイでは、CSS の 1px が実際には 2〜3 ピクセルある。canvas をその倍率で大きく作っておかないとぼやけるので、この値を使う。
- `w, h` … canvas の CSS 上の幅と高さ。
- `s` … 1マスの大きさ（CSS px）。画面サイズから毎回計算する。
- `fx, fy` … 盤面の左上の位置。`nx` … ネクスト列の左端。
- 以降はエフェクト用: 粒の一覧、ポップアップの一覧、揺れの終了時刻と強さ、フラッシュの開始・終了時刻、バナーの文字と表示期間。

**L85–89**

```ts
 85 |   constructor(private canvas: HTMLCanvasElement) {
 86 |     this.g = canvas.getContext('2d')!;
 87 |     this.resize();
 88 |   }
 89 | 
```

コンストラクタ。`private canvas` と書くと、引数をそのまま private プロパティにする省略記法。描画コンテキストを取って、最初のレイアウト計算をする。

## 画面サイズに合わせる resize

**L90–107**

```ts
 90 |   resize(): void {
 91 |     const rect = this.canvas.getBoundingClientRect();
 92 |     this.dpr = Math.min(window.devicePixelRatio || 1, 2);
 93 |     this.w = rect.width;
 94 |     this.h = rect.height;
 95 |     this.canvas.width = Math.round(rect.width * this.dpr);
 96 |     this.canvas.height = Math.round(rect.height * this.dpr);
 97 |     const unitsW = COLS + GAP + NEXT_W + PAD * 2;
 98 |     const unitsH = VISIBLE_ROWS + SPAWN_ROWS + PAD * 2;
 99 |     this.s = Math.max(8, Math.floor(Math.min(this.w / unitsW, this.h / unitsH)));
100 |     const contentW = this.s * (COLS + GAP + NEXT_W);
101 |     const contentH = this.s * (VISIBLE_ROWS + SPAWN_ROWS);
102 |     this.fx = Math.round((this.w - contentW) / 2);
103 |     this.fy = Math.round((this.h - contentH) / 2 + this.s * SPAWN_ROWS);
104 |     this.nx = this.fx + this.s * (COLS + GAP);
105 |     clearGemCache();
106 |   }
107 | 
```

画面サイズが変わるたびに呼ばれる（`main.ts` の `ResizeObserver`）。
- L91: `getBoundingClientRect()` で canvas が画面上で実際に何px×何pxで表示されているかを取る。
- L92: デバイスピクセル比。上限2にしているのは、3倍の端末でも描画が重くなりすぎないため。
- L95–96: canvas の内部の解像度を、表示サイズ×倍率にする。これでくっきり描ける。
- L97–98: 必要な広さを「マス何個ぶん」で計算。横は 盤面6＋隙間＋ネクスト＋余白、縦は 盤面12＋上の3段＋余白。
- L99: 縦横どちらにも収まる最大のマスの大きさ。`Math.floor` で整数にしてにじみを防ぎ、`Math.max(8, ...)` で極端に小さくならないようにする。
- L100–104: 中身全体を画面の中央に置くように、盤面とネクストの位置を決める。`fy` は上の3段ぶん下げた位置。
- L105: マスの大きさが変わったので、宝石の絵を描き直させる。

**L108–112**

```ts
108 |   /** ネクスト列の下端あたり（CSS px、canvas 基準）。1手戻すボタンの配置に使う */
109 |   sideSlot(): { left: number; bottom: number; width: number } {
110 |     return { left: this.nx, bottom: this.fy + this.s * VISIBLE_ROWS, width: this.s * NEXT_W };
111 |   }
112 | 
```

`sideSlot()` … ネクスト列の下端の位置。「1手戻す」ボタン（HTMLのボタン）を canvas の上に重ねて置くとき、どこに置けばいいかを `main.ts` に教える。

**L113–121**

```ts
113 |   /** 盤面から十分離れた位置か（ここで離すとキャンセル）。上方向は子ぷよの向き操作に使うので含めない */
114 |   isOutside(clientX: number, clientY: number): boolean {
115 |     const rect = this.canvas.getBoundingClientRect();
116 |     const x = clientX - rect.left;
117 |     const y = clientY - rect.top;
118 |     const s = this.s;
119 |     return x < this.fx - s || x > this.fx + s * (COLS + 1) || y > this.fy + s * (VISIBLE_ROWS + 0.5);
120 |   }
121 | 
```

`isOutside()` … タッチ位置が「盤面から十分離れた場所」か。離すとキャンセルになる範囲の判定。
- `clientX/Y` は画面全体での座標なので、canvas の左上を引いて canvas 内の座標にする。
- 盤面の左右に1マス以上はみ出すか、盤面の下端より半マス以上下ならキャンセル範囲。上方向は「子ぷよを上に向ける」フリックに使うので含めない。

**L122–131**

```ts
122 |   /** 画面座標から列（0〜5）を求める。盤面の外なら null */
123 |   columnAt(clientX: number, clientY: number): number | null {
124 |     const rect = this.canvas.getBoundingClientRect();
125 |     const x = clientX - rect.left;
126 |     const y = clientY - rect.top;
127 |     if (y < this.fy - this.s * SPAWN_ROWS - this.s || y > this.fy + this.s * VISIBLE_ROWS + this.s) return null;
128 |     if (x < this.fx - this.s * 0.6 || x > this.fx + this.s * (COLS + 0.2)) return null;
129 |     return Math.min(COLS - 1, Math.max(0, Math.floor((x - this.fx) / this.s)));
130 |   }
131 | 
```

`columnAt()` … タッチ位置が何列目か。盤面から大きく外れていれば `null`（反応しない）。
- L127: 縦は、上の3段エリアのさらに1マス上から、盤面の下1マスまでを受け付ける。
- L128: 横は、盤面の少し外側まで受け付ける（端の列を押しやすくするため）。
- L129: `(x - 盤面の左端) / マスの大きさ` を切り捨てると列番号。0〜5 の範囲に収める。

**L132–138**

```ts
132 |   private cellX(x: number): number {
133 |     return this.fx + x * this.s;
134 |   }
135 |   private cellY(y: number): number {
136 |     return this.fy + (VISIBLE_ROWS - 1 - y) * this.s;
137 |   }
138 | 
```

盤面座標 → 画面座標の変換。
- `cellX(x)` … 列 x の左端。
- `cellY(y)` … 段 y の上端。y は下が0なので、`(12 - 1 - y)` で上下をひっくり返している。

## エフェクトのきっかけ onPop

**L139–147**

```ts
139 |   // ---------- エフェクトのきっかけ（アプリから呼ぶ） ----------
140 | 
141 |   onPop(step: ChainStep, now: number): void {
142 |     const s = this.s;
143 |     let sx = 0;
144 |     let sy = 0;
145 |     step.cleared.forEach((c, i) => {
146 |       const px = this.cellX(c.x) + s / 2;
147 |       const py = this.cellY(c.y) + s / 2;
```

1連鎖ぶんが消える瞬間に `main.ts` から呼ばれ、破片・ポップアップ・揺れ・フラッシュを仕込む。実際に動かして描くのは毎フレームの `render()`。
- L143–144: 消えたマスの位置の合計（あとで平均＝中心を出し、ポップアップの位置にする）。
- L145: 消えたマスを1つずつ処理。
- L146–147: そのマスの中心の画面座標。

**L148–168**

```ts
148 |       sx += px;
149 |       sy += py;
150 |       const st = gemStyle(step.clearedColors[i]);
151 |       const shards = 5 + Math.min(step.chain, 10);
152 |       for (let k = 0; k < shards; k++) {
153 |         const a = Math.random() * Math.PI * 2;
154 |         const v = (0.6 + Math.random() * 1.6) * s * (1 + step.chain * 0.08);
155 |         this.particles.push({
156 |           x: px,
157 |           y: py,
158 |           vx: Math.cos(a) * v,
159 |           vy: Math.sin(a) * v - s * 1.2,
160 |           life: 0,
161 |           maxLife: 0.45 + Math.random() * 0.4,
162 |           size: s * (0.08 + Math.random() * 0.1),
163 |           color: Math.random() < 0.35 ? st.light : st.mid,
164 |           kind: 'shard',
165 |           rot: Math.random() * Math.PI,
166 |           vr: (Math.random() - 0.5) * 20,
167 |         });
168 |       }
```

色付きの破片を作る。
- L150: 消えた宝石の色。
- L151: 破片の数。連鎖が進むほど増える（最大15個）。
- L153: 飛ぶ方向をランダムな角度で決める。
- L154: 速さもランダム。連鎖が進むほど速く飛び散る。
- L158–159: 角度と速さから、横・縦の速度に分ける。`- s * 1.2` で少し上向きの勢いを足し、噴き上がってから落ちるようにする。
- L163: 35%の確率で明るい色、それ以外は本体の色。

**L169–184**

```ts
169 |       for (let k = 0; k < 2; k++) {
170 |         this.particles.push({
171 |           x: px + (Math.random() - 0.5) * s,
172 |           y: py + (Math.random() - 0.5) * s,
173 |           vx: (Math.random() - 0.5) * s,
174 |           vy: -s * (0.5 + Math.random()),
175 |           life: 0,
176 |           maxLife: 0.5 + Math.random() * 0.3,
177 |           size: s * (0.15 + Math.random() * 0.12),
178 |           color: '#fff',
179 |           kind: 'spark',
180 |           rot: 0,
181 |           vr: 0,
182 |         });
183 |       }
184 |     });
```

白い光の粒を2つずつ作る。マスの周りのランダムな位置から、上向きにふわっと上がる。

**L185–195**

```ts
185 |     const n = step.cleared.length;
186 |     this.popups.push({ x: sx / n, y: sy / n, chain: step.chain, score: step.score, born: now, allClearBonus: step.allClearBonusApplied });
187 |     // 揺れは控えめに: 連鎖数に比例して少しずつ強くし、上限を低めに抑える
188 |     this.shakeAmp = Math.min(s * 0.16, s * (0.015 + 0.008 * step.chain));
189 |     this.shakeUntil = now + 90 + Math.min(step.chain, 10) * 12;
190 |     if (step.chain >= 7) {
191 |       this.flashStart = now;
192 |       this.flashUntil = now + 90 + step.chain * 8;
193 |     }
194 |   }
195 | 
```

- L186: ポップアップを、消えたマスの中心（平均位置）に出す。
- L188: 揺れの強さ。連鎖数に比例して少しずつ強くし、最大でもマスの16%に抑える。
- L189: 揺れる時間。連鎖数に応じて少し長く（10連鎖で頭打ち）。
- L190–193: 7連鎖以上で画面全体を白く光らせる。

**L196–201**

```ts
196 |   banner(text: string, now: number, ms = 900): void {
197 |     this.bannerText = text;
198 |     this.bannerStart = now;
199 |     this.bannerUntil = now + ms;
200 |   }
201 | 
```

`banner()` … 画面中央に大きな文字を一定時間出す（「ALL CLEAR」「CLEAR!」「+5秒」など）。`ms = 900` は省略時の表示時間。

**L202–209**

```ts
202 |   clearEffects(): void {
203 |     this.particles = [];
204 |     this.popups = [];
205 |     this.shakeUntil = 0;
206 |     this.flashUntil = 0;
207 |     this.bannerUntil = 0;
208 |   }
209 | 
```

`clearEffects()` … エフェクトを全部消す。リトライや1手戻すのときに、前の破片が残らないようにする。

## 毎フレームの描画 render

**L210–216**

```ts
210 |   // ---------- 描画 ----------
211 | 
212 |   render(st: RenderState, now: number, dt: number): void {
213 |     const g = this.g;
214 |     g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
215 |     g.clearRect(0, 0, this.w, this.h);
216 | 
```

- 引数: 描くもの `st`、現在時刻 `now`（ミリ秒）、前のフレームからの経過時間 `dt`。
- L214: `setTransform(dpr, 0, 0, dpr, 0, 0)` で「以降の座標をすべて dpr 倍する」設定にする。これで、この後は CSS px で考えて描くだけで高解像度に描ける。
- L215: 前のフレームの絵を全部消す。

**L217–226**

```ts
217 |     let ox = 0;
218 |     let oy = 0;
219 |     if (now < this.shakeUntil) {
220 |       const k = (this.shakeUntil - now) / 250;
221 |       ox = (Math.random() - 0.5) * this.shakeAmp * Math.min(1, k) * 2;
222 |       oy = (Math.random() - 0.5) * this.shakeAmp * Math.min(1, k) * 2;
223 |     }
224 |     g.save();
225 |     g.translate(ox, oy);
226 | 
```

画面揺れ。
- L220: 揺れの残り時間から、終わりに近づくほど弱める係数を作る。
- L221–222: 毎フレームランダムな方向に少しずらす量。
- L224–225: `save()` で設定を保存してから `translate` で全体をずらす。これ以降に描くものがすべてずれる＝画面が揺れて見える。

**L227–238**

```ts
227 |     this.drawWell(now);
228 | 
229 |     // 盤面
230 |     g.save();
231 |     g.beginPath();
232 |     g.rect(this.fx, this.fy, this.s * COLS, this.s * VISIBLE_ROWS);
233 |     g.clip();
234 |     if (st.anim) this.drawAnimation(st.anim, now);
235 |     else this.drawStatic(st.field, now);
236 |     if (!st.anim && st.ghost && st.current && !st.cancelHint) this.drawGhost(st.field, st.current, st.cursor);
237 |     g.restore();
238 | 
```

- L227: 盤面の背景（枠や窒息マーク）。
- L230–233: **クリッピング**。盤面の四角形を「ここからはみ出した部分は描かない」範囲に設定する。落ちてくるぷよが盤面より上で見えたり、13段目のぷよが見えたりしないようにするため。
- L234–235: アニメーション中ならそれを、そうでなければ静止した盤面を描く。
- L236: 置き先プレビュー。アニメーション中やキャンセル表示中は出さない。
- L237: クリッピングを解除。

**L239–248**

```ts
239 |     // 操作中のペア
240 |     if (!st.anim && st.current) this.drawCurrent(st.current, st.cursor, now);
241 |     if (st.cancelHint) this.drawCancelHint();
242 |     this.drawNext(st.nexts);
243 | 
244 |     this.updateParticles(dt);
245 |     this.drawParticles();
246 |     this.drawPopups(now);
247 |     g.restore();
248 | 
```

- L240: 操作中のペア（盤面の上の3段エリア、クリッピングの外）。
- L241: 「× 離すとキャンセル」。
- L242: ネクスト。
- L244–246: 破片を動かしてから描き、ポップアップを描く。
- L247: 揺れのずらしを解除。

**L249–256**

```ts
249 |     if (now < this.flashUntil) {
250 |       const p = (now - this.flashStart) / (this.flashUntil - this.flashStart);
251 |       g.fillStyle = `rgba(255,255,255,${0.22 * (1 - p)})`;
252 |       g.fillRect(0, 0, this.w, this.h);
253 |     }
254 |     this.drawBanner(now);
255 |   }
256 | 
```

- L249–253: フラッシュ中なら、画面全体に白を重ねる。時間とともに薄くする。揺れの外で描くので、揺れの影響を受けない。
- L254: 中央の大きな文字。

## 盤面の背景 drawWell

**L257–264**

```ts
257 |   private drawWell(now: number): void {
258 |     const g = this.g;
259 |     const s = this.s;
260 |     const x = this.fx;
261 |     const y = this.fy;
262 |     const w = s * COLS;
263 |     const h = s * VISIBLE_ROWS;
264 | 
```

盤面の背景、列の区切り線、窒息マーク、枠を描く。
- L260–263: 盤面の左上 (x, y) と幅・高さを、短い名前の変数に入れておく。

**L265–280**

```ts
265 |     // 宝石箱のベルベット
266 |     const bg = g.createLinearGradient(0, y, 0, y + h);
267 |     bg.addColorStop(0, '#1a1830');
268 |     bg.addColorStop(1, '#100f1f');
269 |     g.fillStyle = bg;
270 |     g.fillRect(x, y, w, h);
271 |     // 列のうっすらした区切り
272 |     g.strokeStyle = 'rgba(180,170,230,0.05)';
273 |     g.lineWidth = 1;
274 |     for (let c = 1; c < COLS; c++) {
275 |       g.beginPath();
276 |       g.moveTo(x + c * s + 0.5, y);
277 |       g.lineTo(x + c * s + 0.5, y + h);
278 |       g.stroke();
279 |     }
280 |     // 窒息点のマーク
```

- L266–270: 上から下へ、少しだけ暗くなる縦方向のグラデーションで背景を塗る（宝石箱の内張りのイメージ）。
- L272–279: 列の境目にごく薄い縦線。`+ 0.5` は、1pxの線をピクセルの境目ではなく真ん中に引いてにじませないための小技。

**L281–291**

```ts
281 |     const dx = this.cellX(DEATH_COL) + s / 2;
282 |     const dy = this.cellY(VISIBLE_ROWS - 1) + s / 2;
283 |     const r = s * 0.18;
284 |     g.strokeStyle = `rgba(255,110,140,${0.35 + 0.1 * Math.sin(now / 400)})`;
285 |     g.lineWidth = Math.max(1.5, s * 0.05);
286 |     g.beginPath();
287 |     g.moveTo(dx - r, dy - r);
288 |     g.lineTo(dx + r, dy + r);
289 |     g.moveTo(dx + r, dy - r);
290 |     g.lineTo(dx - r, dy + r);
291 |     g.stroke();
```

窒息点（3列目12段目）の × マーク。
- L281–283: マスの中心と、× の大きさ。
- L284: 不透明度を `Math.sin(now / 400)` で時間とともに揺らし、ゆっくり明滅させる。
- L286–291: 2本の斜め線で × を描く。

**L292–305**

```ts
292 |     // 枠
293 |     g.strokeStyle = 'rgba(214,190,140,0.55)';
294 |     g.lineWidth = 1.5;
295 |     g.strokeRect(x - 1, y - 1, w + 2, h + 2);
296 |     // 出現エリアの床線
297 |     g.strokeStyle = 'rgba(214,190,140,0.18)';
298 |     g.setLineDash([3, 5]);
299 |     g.beginPath();
300 |     g.moveTo(x, y - 0.5);
301 |     g.lineTo(x + w, y - 0.5);
302 |     g.stroke();
303 |     g.setLineDash([]);
304 |   }
305 | 
```

- L293–295: 盤面の外枠。くすんだ金色。
- L297–303: 盤面の上端に点線。`setLineDash([3, 5])` は「3px描いて5px空ける」点線の設定。使い終わったら `setLineDash([])` で実線に戻す。

## 宝石を1個描く drawGem

**L306–316**

```ts
306 |   private drawGem(color: number, px: number, py: number, scale = 1, alpha = 1): void {
307 |     const s = this.s;
308 |     const size = Math.round(s * this.dpr);
309 |     const sprite = gemSprite(color, size);
310 |     const g = this.g;
311 |     if (alpha !== 1) g.globalAlpha = alpha;
312 |     const d = s * scale;
313 |     g.drawImage(sprite, px + (s - d) / 2, py + (s - d) / 2, d, d);
314 |     if (alpha !== 1) g.globalAlpha = 1;
315 |   }
316 | 
```

- `scale` … 大きさの倍率（消えるときに膨らませる）。`alpha` … 不透明度（置き先プレビューは半透明）。
- L308–309: 実際のピクセル数の大きさで宝石の絵を取り出す（キャッシュがあればそれ）。
- L311, 314: 不透明度を変えたら、描いた後に必ず1に戻す。
- L312–313: 拡大・縮小しても中心がずれないよう、マスの中央に合わせて貼り付ける。`drawImage(画像, x, y, 幅, 高さ)`。

## 同色のつながり drawLinks

**L317–339**

```ts
317 |   /** 隣り合う同色の宝石をつなぐ光の帯 */
318 |   private drawLinks(field: Field, skip: Set<number>): void {
319 |     const g = this.g;
320 |     const s = this.s;
321 |     for (let x = 0; x < COLS; x++) {
322 |       const h = Math.min(field.height(x), VISIBLE_ROWS);
323 |       for (let y = 0; y < h; y++) {
324 |         if (skip.has(key(x, y))) continue;
325 |         const c = field.get(x, y)!;
326 |         const st = gemStyle(c);
327 |         g.fillStyle = st.mid;
328 |         g.globalAlpha = 0.55;
329 |         if (x + 1 < COLS && y < field.height(x + 1) && field.get(x + 1, y) === c && !skip.has(key(x + 1, y))) {
330 |           g.fillRect(this.cellX(x) + s / 2, this.cellY(y) + s * 0.32, s, s * 0.36);
331 |         }
332 |         if (y + 1 < h && field.get(x, y + 1) === c && !skip.has(key(x, y + 1))) {
333 |           g.fillRect(this.cellX(x) + s * 0.32, this.cellY(y + 1) + s / 2, s * 0.36, s);
334 |         }
335 |         g.globalAlpha = 1;
336 |       }
337 |     }
338 |   }
339 | 
```

隣り合う同じ色の宝石の間に、半透明の帯を描いてつながりを見やすくする。宝石より先に描くので、帯は宝石の裏に隠れて「間」だけ見える。
- `skip` … 描かないマス（消えている途中・落ちている途中のぷよ）。
- L322: 13段目は見えないので12段目まで。
- L329–331: 右隣が同じ色なら、このマスの中心から右隣の中心まで横長の帯。条件の `y < field.height(x + 1)` は「右の列にその段のぷよがあるか」。
- L332–334: 上隣が同じ色なら縦長の帯。

## 静止した盤面 drawStatic

**L340–341**

```ts
340 |   private drawStatic(field: Field, now: number, skip = new Set<number>(), popping?: Map<number, number>): void {
341 |     this.drawLinks(field, popping ? new Set([...skip, ...popping.keys()]) : skip);
```

盤面のぷよを全部描く。アニメーション中は、消える途中のマス（`popping`）と描かないマス（`skip`）を指定して呼ばれる。
- `popping?: Map<number, number>` … マス番号 → 消える進み具合（0〜1）。
- L341: つながりの帯。消える途中のマスもつながりを描かないよう、`skip` と `popping` のマスを合わせた Set を渡す。`new Set([...A, ...B])` は2つを合わせた Set を作る書き方。

**L342–355**

```ts
342 |     for (let x = 0; x < COLS; x++) {
343 |       const h = Math.min(field.height(x), VISIBLE_ROWS);
344 |       for (let y = 0; y < h; y++) {
345 |         const k = key(x, y);
346 |         if (skip.has(k)) continue;
347 |         const c = field.get(x, y)!;
348 |         const px = this.cellX(x);
349 |         const py = this.cellY(y);
350 |         const p = popping?.get(k);
351 |         if (p !== undefined) {
352 |           this.drawPopping(c, px, py, p);
353 |           continue;
354 |         }
355 |         this.drawGem(c, px, py);
```

- L346: 描かないマスなら飛ばす。
- L350–354: 消える途中のマスなら、専用の描き方をして次へ。`popping?.get(k)` は `popping` があればそこから値を取る。
- L355: 普通に宝石を描く。

**L356–366**

```ts
356 |         // ときどき走るきらめき
357 |         const phase = ((x * 7.13 + y * 3.71 + c * 1.9) % 4.7) * 1000;
358 |         const t = (now + phase) % 4200;
359 |         if (t < 260) {
360 |           const a = Math.sin((t / 260) * Math.PI);
361 |           drawSparkle(this.g, px + this.s * 0.3, py + this.s * 0.28, this.s * 0.22, a * 0.9);
362 |         }
363 |       }
364 |     }
365 |   }
366 | 
```

ときどき宝石がキラッと光る演出。
- L357: マスごとにずらし量 `phase` を決める。位置と色から計算するだけなので、同じマスは毎回同じずれになり、ランダムに見えるのに点滅しない。
- L358: 4.2秒周期のうち、今どこにいるか。
- L359–361: 周期の最初の0.26秒だけ光る。`Math.sin(0〜π)` で、0 → 1 → 0 と滑らかに明るくなって消える。

## 消える瞬間 drawPopping

**L367–383**

```ts
367 |   private drawPopping(color: number, px: number, py: number, p: number): void {
368 |     // 膨らんで白く光り、砕ける
369 |     const scale = p < 0.5 ? 1 + p * 0.5 : 1.25 * (1 - (p - 0.5) * 2);
370 |     this.drawGem(color, px, py, Math.max(0, scale), 1);
371 |     const g = this.g;
372 |     g.save();
373 |     g.globalCompositeOperation = 'lighter';
374 |     g.globalAlpha = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.8;
375 |     const r = this.s * 0.5 * Math.max(0.1, scale);
376 |     const grad = g.createRadialGradient(px + this.s / 2, py + this.s / 2, 0, px + this.s / 2, py + this.s / 2, r);
377 |     grad.addColorStop(0, '#ffffff');
378 |     grad.addColorStop(1, 'rgba(255,255,255,0)');
379 |     g.fillStyle = grad;
380 |     g.fillRect(px - this.s * 0.2, py - this.s * 0.2, this.s * 1.4, this.s * 1.4);
381 |     g.restore();
382 |   }
383 | 
```

`p` は 0（消え始め）〜 1（消え終わり）。
- L369: 前半は1倍から1.25倍に膨らみ、後半で0まで縮む。
- L373: `globalCompositeOperation = 'lighter'` … 色を「足し算」で重ねる合成方法。重なるほど明るくなるので、光っている感じが出る。
- L374: 光の強さ。途中で最大になり、また弱まる。
- L376–380: 中心が白く外側が透明な丸い光を、宝石の上に重ねる。
- L372, 381: 合成方法と透明度を変えたので save/restore で元に戻す。

## 落ちているぷよ drawMovers

**L384–392**

```ts
384 |   private drawMovers(moves: Move[], elapsed: number, msPerRow: number): void {
385 |     for (const m of moves) {
386 |       if (m.vanished) continue;
387 |       const fallen = msPerRow > 0 ? elapsed / msPerRow : Infinity;
388 |       const y = Math.max(m.toY, m.fromY - fallen);
389 |       this.drawGem(m.color, this.cellX(m.x), this.fy + (VISIBLE_ROWS - 1 - y) * this.s);
390 |     }
391 |   }
392 | 
```

- `elapsed` … 落ち始めてからの経過時間、`msPerRow` … 1段落ちるのにかかる時間。
- L387: 何段ぶん落ちたか。時間が0の設定なら一瞬で着地（`Infinity` は無限大）。
- L388: 落ち始めの段から落ちた段数を引く。ただし着地点より下には行かない。段が小数になるので、マスの途中にいる状態が描ける＝滑らかに落ちる。
- L389: 小数の段を画面の座標に変換して描く。

## 1手のアニメーション drawAnimation

**L393–402**

```ts
393 |   private drawAnimation(anim: TurnAnimation, now: number): void {
394 |     const e = now - anim.start;
395 |     const tl = anim.turn.timeline;
396 |     if (e < tl.placeEnd) {
397 |       this.drawStatic(anim.before, now);
398 |       this.g.save();
399 |       this.drawMovers(anim.turn.placeMoves, e, CONFIG.PLACE_FALL_MS_PER_ROW);
400 |       this.g.restore();
401 |       return;
402 |     }
```

経過時間 `e` と時刻表を比べて、「今どの場面か」を判定して描く。時間を巻き戻したり飛ばしたりしても、その時刻の絵が正しく描ける作り。
- L396–402: 置いたぷよの落下中。置く前の盤面を描き、その上に落ちているぷよを描く。（L398 と L400 の save/restore は描画設定を変えていないので実質的な意味はなく、消しても動作は変わらない。）

**L403–410**

```ts
403 |     const steps = anim.turn.chain.steps;
404 |     for (let i = 0; i < steps.length; i++) {
405 |       const t = tl.steps[i];
406 |       const frame = anim.frames[i];
407 |       if (e < t.popStart) {
408 |         this.drawStatic(frame, now);
409 |         return;
410 |       }
```

連鎖ごとに場面を判定する。
- L405–406: i連鎖目の時刻と、その連鎖の前の盤面。
- L407–410: まだ消え始めていない（連鎖間の小休止）なら、その盤面をそのまま描く。

**L411–416**

```ts
411 |       if (e < t.fallStart) {
412 |         const p = CONFIG.CHAIN_POP_MS > 0 ? (e - t.popStart) / CONFIG.CHAIN_POP_MS : 1;
413 |         const popping = new Map(steps[i].cleared.map((c) => [key(c.x, c.y), p] as [number, number]));
414 |         this.drawStatic(frame, now, new Set(), popping);
415 |         return;
416 |       }
```

消えている最中。
- L412: 消える進み具合 0〜1。
- L413: 消えるマスそれぞれに進み具合を対応づけた Map を作る。`as [number, number]` は「2要素の組」だと TypeScript に教えるための書き方。

**L417–427**

```ts
417 |       if (e < t.fallEnd) {
418 |         const skip = new Set(steps[i].cleared.map((c) => key(c.x, c.y)));
419 |         for (const m of steps[i].falls) skip.add(key(m.x, m.fromY));
420 |         this.drawStatic(frame, now, skip);
421 |         this.drawMovers(steps[i].falls, e - t.fallStart, CONFIG.CHAIN_FALL_MS_PER_ROW);
422 |         return;
423 |       }
424 |     }
425 |     this.drawStatic(anim.frames[anim.frames.length - 1], now);
426 |   }
427 | 
```

消えた後に落ちている最中。
- L418–419: 描かないマス＝消えたマスと、落ちているぷよの元の位置。
- L420–421: 残っているぷよを描き、落ちているぷよを途中の位置に描く。
- L425: 全部の連鎖が終わっていれば、最後の盤面を描く。

**L428–432**

```ts
428 |   private pairCells(cursor: Cursor): { ax: number; cx: number } {
429 |     const ax = clampPlacement(cursor.x, cursor.rot);
430 |     return { ax, cx: ax + CHILD_DX[cursor.rot] };
431 |   }
432 | 
```

`pairCells()` … カーソルから、軸ぷよの列と子ぷよの列を求める。

## 置き先プレビュー drawGhost

**L433–448**

```ts
433 |   private drawGhost(field: Field, pair: Pair, cursor: Cursor): void {
434 |     const probe = field.clone();
435 |     const moves = probe.place(pair, cursor.x, cursor.rot);
436 |     for (const m of moves) {
437 |       if (m.vanished || m.toY >= VISIBLE_ROWS) continue;
438 |       const px = this.cellX(m.x);
439 |       const py = this.cellY(m.toY);
440 |       this.drawGem(m.color, px, py, 0.9, 0.32);
441 |       this.g.strokeStyle = 'rgba(255,255,255,0.35)';
442 |       this.g.lineWidth = 1;
443 |       this.g.beginPath();
444 |       this.g.arc(px + this.s / 2, py + this.s / 2, this.s * 0.44, 0, Math.PI * 2);
445 |       this.g.stroke();
446 |     }
447 |   }
448 | 
```

- L434–435: 盤面を複製して試しに置いてみる。本物の盤面は変わらない。
- L437: 消えるぷよや、12段目より上に乗るぷよは描かない。
- L440: 少し小さく（0.9倍）、半透明（0.32）で描く。
- L441–445: 白い細い円で輪郭をつけて、本物のぷよと区別しやすくする。

## 操作中のペア drawCurrent

**L449–465**

```ts
449 |   private drawCurrent(pair: Pair, cursor: Cursor, now: number): void {
450 |     const s = this.s;
451 |     const { ax, cx } = this.pairCells(cursor);
452 |     // 軸ぷよは常に中段に固定し、子ぷよだけを向きに応じて上下左右に出す
453 |     const axisY = this.fy - 2 * s;
454 |     const childY = cursor.rot === 0 ? axisY - s : cursor.rot === 2 ? axisY + s : axisY;
455 |     this.drawGem(pair.child, this.cellX(cx), childY);
456 |     this.drawGem(pair.axis, this.cellX(ax), axisY);
457 |     // 軸ぷよの目印
458 |     const g = this.g;
459 |     g.strokeStyle = `rgba(255,236,190,${0.65 + 0.25 * Math.sin(now / 180)})`;
460 |     g.lineWidth = Math.max(1.5, s * 0.06);
461 |     g.beginPath();
462 |     g.arc(this.cellX(ax) + s / 2, axisY + s / 2, s * 0.49, 0, Math.PI * 2);
463 |     g.stroke();
464 |   }
465 | 
```

盤面の上の3段エリアに、今置こうとしているペアを描く。
- L453: 軸ぷよは常に中段（盤面の上端から2マス上）に固定。
- L454: 子ぷよは、上向きなら1段上、下向きなら1段下、横向きなら同じ段。
- L455–456: 子ぷよ → 軸ぷよの順に描く。
- L459: 軸ぷよの目印のリング。`Math.sin(now / 180)` で明るさを揺らして脈打つように見せる。

## キャンセル表示 drawCancelHint

**L466–488**

```ts
466 |   private drawCancelHint(): void {
467 |     const g = this.g;
468 |     const s = this.s;
469 |     const cx = this.fx + (s * COLS) / 2;
470 |     const cy = this.fy + s * 3;
471 |     g.save();
472 |     g.fillStyle = 'rgba(14,13,26,0.82)';
473 |     g.strokeStyle = 'rgba(255,143,168,0.8)';
474 |     g.lineWidth = 1.5;
475 |     const w = s * 4.6;
476 |     const h = s * 1.5;
477 |     g.beginPath();
478 |     g.roundRect(cx - w / 2, cy - h / 2, w, h, s * 0.25);
479 |     g.fill();
480 |     g.stroke();
481 |     g.textAlign = 'center';
482 |     g.textBaseline = 'middle';
483 |     g.fillStyle = '#ff8fa8';
484 |     g.font = `700 ${Math.round(s * 0.42)}px "Zen Kaku Gothic New", sans-serif`;
485 |     g.fillText('× 離すとキャンセル', cx, cy);
486 |     g.restore();
487 |   }
488 | 
```

盤面の上のほうに「× 離すとキャンセル」の札を出す。
- L478: `roundRect(x, y, 幅, 高さ, 角の丸み)` で角の丸い四角形。
- L481–482: 文字を中心揃え・上下中央揃えにする。
- L484: フォント指定。CSS の `font` と同じ書き方（太さ 大きさ 書体名）。

## ネクスト drawNext

**L489–509**

```ts
489 |   private drawNext(nexts: Pair[]): void {
490 |     const g = this.g;
491 |     const s = this.s;
492 |     g.fillStyle = 'rgba(214,190,140,0.75)';
493 |     g.font = `600 ${Math.max(10, Math.round(s * 0.34))}px "Chakra Petch", "Zen Kaku Gothic New", sans-serif`;
494 |     g.textAlign = 'left';
495 |     g.textBaseline = 'top';
496 |     g.fillText('NEXT', this.nx, this.fy - s * SPAWN_ROWS);
497 |     let y = this.fy - s * (SPAWN_ROWS - 0.55);
498 |     nexts.forEach((p, i) => {
499 |       const scale = i === 0 ? 1 : 0.72;
500 |       const ps = s * scale;
501 |       const x = this.nx + (i === 0 ? 0 : s * 0.1);
502 |       g.fillStyle = 'rgba(30,28,56,0.8)';
503 |       g.fillRect(x - 3, y - 3, ps + 6, ps * 2 + 6);
504 |       this.drawGemSized(p.child, x, y, ps);
505 |       this.drawGemSized(p.axis, x, y + ps, ps);
506 |       y += ps * 2 + s * 0.45;
507 |     });
508 |   }
509 | 
```

- L492–496: 「NEXT」の文字を、上の3段エリアの上端の高さに書く。
- L498–507: ネクストを上から順に描く。1つ目は等倍、2つ目は0.72倍の小さめ。子ぷよが上、軸ぷよが下（実際に出てくるときの向き）。
- L503: 宝石の後ろに暗い四角を敷く。
- L506: 次のペアを描く位置へ下げる。

**L510–514**

```ts
510 |   private drawGemSized(color: number, x: number, y: number, size: number): void {
511 |     const sprite = gemSprite(color, Math.round(this.s * this.dpr));
512 |     this.g.drawImage(sprite, x, y, size, size);
513 |   }
514 | 
```

`drawGemSized()` … 好きな大きさで宝石を描く（ネクスト用）。絵は盤面と同じ大きさのものを縮小して使う。

## 破片を動かす updateParticles

**L515–527**

```ts
515 |   private updateParticles(dt: number): void {
516 |     const sec = dt / 1000;
517 |     for (const p of this.particles) {
518 |       p.life += sec;
519 |       p.x += p.vx * sec;
520 |       p.y += p.vy * sec;
521 |       if (p.kind === 'shard') p.vy += this.s * 9 * sec;
522 |       p.vx *= 1 - 1.5 * sec;
523 |       p.rot += p.vr * sec;
524 |     }
525 |     this.particles = this.particles.filter((p) => p.life < p.maxLife);
526 |   }
527 | 
```

簡単な物理計算。`dt` はミリ秒なので秒に直して使う。
- L518: 経過時間を足す。
- L519–520: 位置 += 速度 × 時間。
- L521: 色付きの破片だけ重力で下向きに加速する。
- L522: 横方向は空気抵抗のように少しずつ減速。
- L523: 回転。
- L525: 寿命が来た粒を取り除く。`filter` は条件を満たす要素だけを残した新しい配列を作る。

## 破片を描く drawParticles

**L528–551**

```ts
528 |   private drawParticles(): void {
529 |     const g = this.g;
530 |     for (const p of this.particles) {
531 |       const a = 1 - p.life / p.maxLife;
532 |       if (p.kind === 'spark') {
533 |         drawSparkle(g, p.x, p.y, p.size * (0.6 + a * 0.6), a);
534 |         continue;
535 |       }
536 |       g.save();
537 |       g.globalAlpha = a;
538 |       g.translate(p.x, p.y);
539 |       g.rotate(p.rot);
540 |       g.fillStyle = p.color;
541 |       g.beginPath();
542 |       g.moveTo(0, -p.size);
543 |       g.lineTo(p.size * 0.6, 0);
544 |       g.lineTo(0, p.size);
545 |       g.lineTo(-p.size * 0.6, 0);
546 |       g.closePath();
547 |       g.fill();
548 |       g.restore();
549 |     }
550 |   }
551 | 
```

- L531: 残り寿命の割合を不透明度にして、だんだん消えていくようにする。
- L532–535: 白い光の粒は十字のきらめきで描く。
- L536–548: 色付きの破片はひし形。`translate` で破片の位置に原点を移し、`rotate` で回してから、原点を中心にひし形を描く。こうすると回転の計算を自分で書かずに済む。

## 連鎖のポップアップ drawPopups

**L552–565**

```ts
552 |   private drawPopups(now: number): void {
553 |     const g = this.g;
554 |     const s = this.s;
555 |     const LIFE = 700;
556 |     this.popups = this.popups.filter((p) => now - p.born < LIFE);
557 |     for (const p of this.popups) {
558 |       const t = (now - p.born) / LIFE;
559 |       const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
560 |       const rise = s * 0.8 * Math.sqrt(t);
561 |       const big = Math.min(1.9, 0.9 + p.chain * 0.07);
562 |       const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.4 : 1;
563 |       const x = Math.min(Math.max(p.x, this.fx + s * 1.6), this.fx + s * (COLS - 1.6));
564 |       const y = p.y - rise;
565 |       g.save();
```

- L555–556: 表示時間は0.7秒。過ぎたものは取り除く。
- L558: 進み具合 0〜1。
- L559: 70%までは不透明、そこから消えていく。
- L560: 上に浮かぶ量。`Math.sqrt` を使うと、最初は速く後でゆっくりになる。
- L561: 連鎖数が多いほど文字を大きく（最大1.9倍）。
- L562: 出た瞬間だけ小さい状態からポンと大きくなる。
- L563: 文字が盤面からはみ出さないよう、横位置を内側に収める。

**L566–589**

```ts
566 |       g.globalAlpha = a;
567 |       g.textAlign = 'center';
568 |       g.textBaseline = 'middle';
569 |       g.font = `400 ${Math.round(s * 0.62 * big * pop)}px "Dela Gothic One", "Zen Kaku Gothic New", sans-serif`;
570 |       g.lineWidth = Math.max(2, s * 0.12);
571 |       g.strokeStyle = 'rgba(10,8,24,0.85)';
572 |       g.fillStyle = p.chain >= 10 ? '#ffe28a' : p.chain >= 5 ? '#ffd0f0' : '#ffffff';
573 |       const label = `${p.chain}連鎖`;
574 |       g.strokeText(label, x, y);
575 |       g.fillText(label, x, y);
576 |       g.font = `600 ${Math.round(s * 0.36)}px "Chakra Petch", sans-serif`;
577 |       const sc = `+${p.score.toLocaleString('en-US')}`;
578 |       g.strokeText(sc, x, y + s * 0.55 * big);
579 |       g.fillStyle = '#d8f6ff';
580 |       g.fillText(sc, x, y + s * 0.55 * big);
581 |       if (p.allClearBonus) {
582 |         g.fillStyle = '#9fffd6';
583 |         g.strokeText('ALL CLEAR BONUS', x, y + s * 0.95 * big);
584 |         g.fillText('ALL CLEAR BONUS', x, y + s * 0.95 * big);
585 |       }
586 |       g.restore();
587 |     }
588 |   }
589 | 
```

- L569–575: 「3連鎖」の文字。太い暗い縁取り（`strokeText`）を先に描き、その上に塗り（`fillText`）を重ねると、背景に関係なく読みやすい。色は 10連鎖以上で金、5連鎖以上でピンク、それ以外は白。
- L576–580: 「+1,280」の得点。`toLocaleString('en-US')` で3桁ごとにカンマを入れる。
- L581–585: 全消しボーナスが乗っていれば、その下に「ALL CLEAR BONUS」。

## 中央の大きな文字 drawBanner

**L590–610**

```ts
590 |   private drawBanner(now: number): void {
591 |     if (now >= this.bannerUntil) return;
592 |     const g = this.g;
593 |     const s = this.s;
594 |     const t = (now - this.bannerStart) / (this.bannerUntil - this.bannerStart);
595 |     const a = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
596 |     const cx = this.fx + (s * COLS) / 2;
597 |     const cy = this.fy + (s * VISIBLE_ROWS) * 0.42;
598 |     g.save();
599 |     g.globalAlpha = Math.max(0, a);
600 |     g.textAlign = 'center';
601 |     g.textBaseline = 'middle';
602 |     g.font = `400 ${Math.round(s * 0.8)}px "Dela Gothic One", sans-serif`;
603 |     g.lineWidth = s * 0.16;
604 |     g.strokeStyle = 'rgba(10,8,24,0.9)';
605 |     g.fillStyle = '#ffe9a8';
606 |     g.strokeText(this.bannerText, cx, cy);
607 |     g.fillText(this.bannerText, cx, cy);
608 |     g.restore();
609 |   }
610 | }
```

- L591: 表示期間が過ぎていれば何もしない。
- L594: 進み具合 0〜1。
- L595: 最初の15%でふわっと現れ、最後の25%で消える。
- L597: 盤面の高さの42%あたり（中央より少し上）に出す。
- L602–607: ポップアップと同じく、縁取り→塗りの順で描く。
