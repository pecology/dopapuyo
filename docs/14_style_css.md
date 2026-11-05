# src/style.css

見た目を決める CSS。盤面そのものは canvas に描くので、ここで扱うのはその周り（上部の表示、メニュー、ボタン、結果画面など）。

CSS の基本の形は `セレクタ { プロパティ: 値; }`。
- セレクタ … どの要素に効かせるか。`.名前` はクラス、`#名前` は id、`[属性]` は属性を持つ要素。
- 後に書いたもの・より詳しく指定したものが優先される。

## 色と書体の変数

**L1–16**

```css
  1 | /* 夜の宝石箱: 深い藍のベルベットに、くすんだ金の縁取り。主役は盤面の宝石 */
  2 | :root {
  3 |   --ink: #0e0d1a;
  4 |   --velvet: #17152a;
  5 |   --velvet-2: #201d38;
  6 |   --gold: #d6be8c;
  7 |   --gold-dim: rgba(214, 190, 140, 0.28);
  8 |   --text: #ece8f6;
  9 |   --muted: #9a94b8;
 10 |   --good: #8ff0c0;
 11 |   --bad: #ff8fa8;
 12 |   --font-display: 'Dela Gothic One', 'Zen Kaku Gothic New', sans-serif;
 13 |   --font-body: 'Zen Kaku Gothic New', 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
 14 |   --font-num: 'Chakra Petch', 'Consolas', monospace;
 15 |   color-scheme: dark;
 16 | }
```

`:root` はページ全体（html 要素）。ここで `--名前: 値` と書くと**CSS変数**になり、ほかの場所で `var(--名前)` として使える。色を1か所で管理できる。
- `--ink` 背景の一番暗い色、`--velvet` / `--velvet-2` パネルの色、`--gold` くすんだ金（見出しや選択中のボタン）、`--text` 文字、`--muted` 控えめな文字、`--good` 緑（速くなった）、`--bad` 赤（遅くなった・警告）。
- `--font-*` … 書体。カンマで区切って複数書くと、最初の書体がなければ次を使う。
- `color-scheme: dark` … ブラウザ標準の部品（スクロールバーや入力欄）も暗い見た目にする。

**L17–21**

```css
 17 | 
 18 | * {
 19 |   box-sizing: border-box;
 20 | }
 21 | 
```

`*` はすべての要素。`box-sizing: border-box` にすると、`width` に枠線と内側の余白が含まれるようになり、大きさの計算が直感的になる（定番の指定）。

**L22–25**

```css
 22 | [hidden] {
 23 |   display: none !important;
 24 | }
 25 | 
```

`hidden` 属性を持つ要素は必ず非表示にする。`.overlay` などで `display: grid` を指定すると `hidden` が効かなくなるため、`!important`（最優先）で上書きしている。

**L26–31**

```css
 26 | html,
 27 | body {
 28 |   height: 100%;
 29 |   margin: 0;
 30 | }
 31 | 
```

ページの高さを画面いっぱいに。ブラウザが最初から付けている外側の余白を0にする。

**L32–44**

```css
 32 | body {
 33 |   background:
 34 |     radial-gradient(ellipse 80% 60% at 50% 35%, #231c3f 0%, transparent 70%),
 35 |     var(--ink);
 36 |   color: var(--text);
 37 |   font-family: var(--font-body);
 38 |   font-size: 15px;
 39 |   overflow: hidden;
 40 |   -webkit-user-select: none;
 41 |   user-select: none;
 42 |   -webkit-tap-highlight-color: transparent;
 43 | }
 44 | 
```

ページ全体。
- `background` … 楕円の放射グラデーション（上のほうがほんのり紫に明るい）を、暗い背景色の上に重ねる。カンマで区切ると複数の背景を重ねられ、先に書いたものが上になる。
- `overflow: hidden` … ページ自体をスクロールさせない（ゲーム中に画面が動かないように）。
- `user-select: none` … 長押しや連打で文字が選択されないようにする。`-webkit-` 付きは Safari 用。
- `-webkit-tap-highlight-color: transparent` … スマホでタップしたときの灰色の四角を消す。

## 全体の配置

**L45–53**

```css
 45 | #app {
 46 |   height: 100%;
 47 |   display: grid;
 48 |   grid-template-rows: auto minmax(0, 1fr) auto;
 49 |   grid-template-areas: 'hud' 'stage' 'pad';
 50 |   padding: env(safe-area-inset-top, 0px) max(8px, env(safe-area-inset-right, 0px)) env(safe-area-inset-bottom, 0px)
 51 |     max(8px, env(safe-area-inset-left, 0px));
 52 | }
 53 | 
```

`#app` を **CSS Grid**（格子状の配置）にする。
- `grid-template-rows: auto minmax(0, 1fr) auto` … 1段目は中身の高さ、2段目は残り全部、3段目は中身の高さ。`minmax(0, 1fr)` は「残り全部、ただし中身が大きくても縮んでよい」。
- `grid-template-areas: 'hud' 'stage' 'pad'` … 1段目に `hud`（上部の表示）、2段目に `stage`（盤面）、3段目に `pad`（ボタン方式のボタン）という名前の領域を置く。ボタン方式でないときは `pad` が隠れているので、3段目の高さは0になる。
- `padding: env(safe-area-inset-...)` … iPhone のノッチやホームバーに隠れないよう、端末が教えてくれる安全な余白（セーフエリア）を確保する。`max(8px, ...)` で左右は最低8px。

**L54–59**

```css
 54 | .stage {
 55 |   grid-area: stage;
 56 |   min-height: 0;
 57 |   position: relative;
 58 | }
 59 | 
```

盤面のエリア。
- `min-height: 0` … grid の中の要素は、中身より小さくならないのが標準。これを0にしておかないと、canvas が大きいときにはみ出してしまう。
- `position: relative` … 中の canvas と「1手戻す」ボタンを、このエリアを基準に配置するため。

**L60–68**

```css
 60 | #board {
 61 |   position: absolute;
 62 |   inset: 0;
 63 |   width: 100%;
 64 |   height: 100%;
 65 |   touch-action: none;
 66 |   display: block;
 67 | }
 68 | 
```

盤面の canvas をエリアいっぱいに広げる。
- `position: absolute; inset: 0;` … 親の上下左右0の位置にぴったり合わせる。
- `touch-action: none` … canvas の上でのスワイプで、ページがスクロールしたり拡大したりしないようにする（フリック操作のため必須）。

## 上部の表示（HUD）

**L69–81**

```css
 69 | /* ---------- HUD ---------- */
 70 | .hud {
 71 |   grid-area: hud;
 72 |   display: grid;
 73 |   grid-template-columns: max-content minmax(0, 1fr);
 74 |   grid-template-areas:
 75 |     'time score'
 76 |     'meta meta';
 77 |   align-items: end;
 78 |   gap: 4px 14px;
 79 |   padding: 8px 4px 2px;
 80 | }
 81 | 
```

HUD は Heads-Up Display（ゲーム画面に重ねて出す情報）の略。
スマホ向けの基本の配置は2段。1段目に「タイム｜スコア」、2段目にシード・最大連鎖・手数。
- `grid-template-columns: max-content minmax(0, 1fr)` … 1列目はタイムの幅ぴったり、2列目は残り全部（ただし0まで縮んでよい）。
- `align-items: end` … 各セルの中身を下揃えにする。
- `gap: 4px 14px` … 縦4px・横14pxの隙間。

**L82–86**

```css
 82 | .hud-brand,
 83 | .hud-keys {
 84 |   display: none;
 85 | }
 86 | 
```

ロゴと操作説明は、スマホでは出さない（PC用の指定で表示する）。

**L87–97**

```css
 87 | .label,
 88 | .hud-meta dt {
 89 |   display: block;
 90 |   font-family: var(--font-num);
 91 |   font-size: 11px;
 92 |   font-weight: 600;
 93 |   letter-spacing: 0.14em;
 94 |   color: var(--gold);
 95 |   opacity: 0.8;
 96 | }
 97 | 
```

「TIME」「SCORE」などの小さな見出し。金色の小さな英字で、文字の間隔を少し広げる（`letter-spacing`）。

**L98–112**

```css
 98 | .hud-time {
 99 |   grid-area: time;
100 | }
101 | 
102 | .hud-time .value {
103 |   display: inline-block;
104 |   /* 数字の幅が変わってもレイアウトが動かないよう幅を固定 */
105 |   min-width: 7.5ch;
106 |   font-family: var(--font-num);
107 |   font-weight: 600;
108 |   font-size: 26px;
109 |   font-variant-numeric: tabular-nums;
110 |   line-height: 1;
111 | }
112 | 
```

タイムの数字。
- `display: inline-block` と `min-width: 7.5ch` … 最低でも数字7.5文字ぶんの幅を確保する。`ch` は「0」の文字の幅。桁や数字が変わっても幅が変わらないので、隣のスコアがずれない。
- `font-variant-numeric: tabular-nums` … 数字をすべて同じ幅で表示する（等幅数字）。「1」と「8」の幅が違うと、時計の表示が毎フレームぴくぴく動いてしまう。

**L113–133**

```css
113 | .hud-score {
114 |   grid-area: score;
115 |   min-width: 0;
116 | }
117 | 
118 | .hud-score .value {
119 |   display: inline-block;
120 |   text-align: right;
121 |   font-family: var(--font-num);
122 |   font-weight: 600;
123 |   font-size: 20px;
124 |   font-variant-numeric: tabular-nums;
125 | }
126 | 
127 | .hud-score .target {
128 |   font-family: var(--font-num);
129 |   color: var(--muted);
130 |   font-size: 13px;
131 |   font-variant-numeric: tabular-nums;
132 | }
133 | 
```

スコア。
- `.hud-score` の `min-width: 0` … grid の中で縮めるようにする。
- スコアの数字は右揃えにし、幅は `main.ts` が目標点の桁数ぶん確保する。これで点数が増えても「/ 100,000」の位置が動かない。

**L134–148**

```css
134 | .bar {
135 |   height: 4px;
136 |   margin-top: 4px;
137 |   background: rgba(255, 255, 255, 0.08);
138 |   border-radius: 2px;
139 |   overflow: hidden;
140 | }
141 | 
142 | .bar-fill {
143 |   height: 100%;
144 |   width: 0;
145 |   background: linear-gradient(90deg, #9a4de6, #2f66e8, #12b878, #f0b41e);
146 |   transition: width 0.12s linear;
147 | }
148 | 
```

目標点への進み具合のバー。
- `.bar` が溝、`.bar-fill` が中身。`overflow: hidden` で、中身の角も溝の丸みに合わせて切る。
- `linear-gradient(90deg, ...)` … 左から右へ、紫→青→緑→黄（宝石の色）のグラデーション。
- `transition: width 0.12s linear` … 幅が変わるとき0.12秒かけて滑らかに伸ばす。

**L149–168**

```css
149 | .hud-meta {
150 |   grid-area: meta;
151 |   display: grid;
152 |   grid-template-columns: repeat(3, 1fr);
153 |   gap: 12px;
154 |   margin: 0;
155 | }
156 | 
157 | .hud-meta div {
158 |   min-width: 4.5em;
159 | }
160 | 
161 | .hud-meta dd {
162 |   margin: 0;
163 |   font-family: var(--font-num);
164 |   font-variant-numeric: tabular-nums;
165 |   font-size: 14px;
166 | }
167 | 
168 | 
```

シード・最大連鎖・手数の段。`repeat(3, 1fr)` で同じ幅の3列に分ける。各項目に最低幅をつけ、`dd` は等幅数字にして、値が変わっても位置が動かないようにする。

## PC向けの配置

**L169–186**

```css
169 | /* PC: 盤面を中央に、横に情報 */
170 | @media (min-width: 820px) and (min-aspect-ratio: 1/1) {
171 |   #app {
172 |     grid-template-rows: minmax(0, 1fr) auto;
173 |     grid-template-columns: minmax(200px, 280px) minmax(0, 1fr) minmax(200px, 280px);
174 |     grid-template-areas: '. stage hud' '. pad hud';
175 |   }
176 |   .hud {
177 |     grid-template-columns: 1fr;
178 |     grid-template-areas: none;
179 |     align-content: center;
180 |     align-items: start;
181 |     gap: 22px;
182 |     padding: 24px 8px;
183 |   }
184 |   .hud > * {
185 |     grid-area: auto;
186 |   }
```

`@media (条件) { ... }` … 条件に合うときだけ中の指定が効く（**メディアクエリ**）。ここでは「幅820px以上、かつ横長（縦横比1:1以上）」のとき。
- `#app` を3列2段にし、真ん中の列の上に盤面、その下にボタン方式のボタン、右の列に HUD、左は空き（`.`）にする。左右を同じ幅にすることで盤面が画面の中央に来る。
- `.hud` を縦1列にして、上下中央に寄せる。
- `.hud > *` … HUD の直接の子要素すべて。スマホ用に付けた領域名の指定を解除して、上から順に並べる。

**L187–217**

```css
187 |   .hud-brand {
188 |     display: block;
189 |     font-family: var(--font-display);
190 |     font-size: 28px;
191 |     letter-spacing: 0.04em;
192 |     background: linear-gradient(120deg, #ffd0e0, #c9b0ff 45%, #9fe8ff);
193 |     -webkit-background-clip: text;
194 |     background-clip: text;
195 |     color: transparent;
196 |   }
197 |   .hud-time .value {
198 |     font-size: 44px;
199 |   }
200 |   .hud-score .value {
201 |     font-size: 28px;
202 |   }
203 |   .hud-meta {
204 |     grid-template-columns: 1fr;
205 |     gap: 10px;
206 |   }
207 |   .hud-meta dd {
208 |     font-size: 18px;
209 |   }
210 |   .hud-keys {
211 |     display: block;
212 |     font-size: 12px;
213 |     color: var(--muted);
214 |     line-height: 1.9;
215 |   }
216 | }
217 | 
```

PC のときの見た目の調整。
- `.hud-brand` … ロゴを表示。`background-clip: text` と `color: transparent` の組み合わせで、背景のグラデーションを文字の形に切り抜く（文字がグラデーション色になる）。
- タイム・スコア・各数値を大きくする。
- 操作説明を表示。

**L218–233**

```css
218 | kbd {
219 |   display: inline-block;
220 |   min-width: 1.6em;
221 |   padding: 0 0.4em;
222 |   margin: 0 1px;
223 |   border: 1px solid var(--gold-dim);
224 |   border-bottom-width: 2px;
225 |   border-radius: 4px;
226 |   font-family: var(--font-num);
227 |   font-size: 0.85em;
228 |   line-height: 1.5;
229 |   text-align: center;
230 |   color: var(--text);
231 |   background: rgba(255, 255, 255, 0.04);
232 | }
233 | 
```

`<kbd>`（キーボードのキー）を、小さなキーキャップのような見た目にする。下の枠線だけ太くして、立体感を出している。

## 重ねて出す画面（オーバーレイ）

**L234–247**

```css
234 | /* ---------- オーバーレイ ---------- */
235 | .overlay {
236 |   position: fixed;
237 |   inset: 0;
238 |   display: grid;
239 |   place-items: center;
240 |   padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
241 |     max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
242 |   background: rgba(8, 7, 16, 0.72);
243 |   backdrop-filter: blur(6px);
244 |   overflow-y: auto;
245 |   z-index: 10;
246 | }
247 | 
```

メニュー・オプション・ランキング・結果の画面を、プレイ画面の上に重ねる。
- `position: fixed; inset: 0;` … 画面全体を覆う。
- `display: grid; place-items: center;` … 中身を上下左右の中央に置く。
- `background: rgba(...)` と `backdrop-filter: blur(6px)` … 後ろのプレイ画面を暗くし、ぼかす。
- `overflow-y: auto` … 画面が低いときは縦にスクロールできるように。
- `z-index: 10` … ほかの要素より手前に表示。

**L248–271**

```css
248 | .panel {
249 |   width: min(440px, 100%);
250 |   display: flex;
251 |   flex-direction: column;
252 |   gap: 16px;
253 |   padding: 26px 24px;
254 |   background: linear-gradient(180deg, var(--velvet-2), var(--velvet));
255 |   border: 1px solid var(--gold-dim);
256 |   border-radius: 14px;
257 |   box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
258 | }
259 | 
260 | .panel.wide {
261 |   width: min(620px, 100%);
262 | }
263 | 
264 | .panel h2 {
265 |   margin: 0;
266 |   font-family: var(--font-display);
267 |   font-weight: 400;
268 |   font-size: 22px;
269 |   color: var(--gold);
270 | }
271 | 
```

画面の中の枠（パネル）。
- `width: min(440px, 100%)` … 440pxか画面幅のうち小さいほう。スマホでもはみ出さない。
- `display: flex; flex-direction: column; gap: 16px;` … 中身を縦に並べ、16pxずつ空ける（**Flexbox**）。
- `box-shadow` … 大きな影で浮いて見せる。`inset` 付きの影は内側の上端に細い光の線。
- `.panel.wide` … ランキング画面だけ広め。`.panel h2` … パネルの見出し。

**L272–294**

```css
272 | .logo {
273 |   margin: 0;
274 |   text-align: center;
275 |   font-family: var(--font-display);
276 |   font-weight: 400;
277 |   font-size: clamp(48px, 14vw, 64px);
278 |   line-height: 1.05;
279 |   letter-spacing: 0.02em;
280 |   background: linear-gradient(115deg, #ff9ab4 0%, #d2a6ff 30%, #8fb8ff 55%, #8af5c6 75%, #ffe08a 100%);
281 |   background-size: 200% 100%;
282 |   -webkit-background-clip: text;
283 |   background-clip: text;
284 |   color: transparent;
285 |   filter: drop-shadow(0 4px 18px rgba(180, 140, 255, 0.35));
286 |   animation: shimmer 6s ease-in-out infinite alternate;
287 | }
288 | 
289 | @keyframes shimmer {
290 |   to {
291 |     background-position: 100% 0;
292 |   }
293 | }
294 | 
```

メニューのロゴ。
- `clamp(48px, 14vw, 64px)` … 画面幅の14%を基本に、48px〜64pxの範囲に収める。`vw` は画面幅の1%。
- 宝石5色のグラデーションを文字に切り抜き、`background-size: 200%` で2倍に広げておく。
- `animation: shimmer 6s ease-in-out infinite alternate` … 下の `@keyframes shimmer` のアニメーションを6秒かけて、無限に、往復（alternate）で再生。背景の位置が左右に動くので、文字の色がゆっくり流れる。
- `filter: drop-shadow(...)` … 文字の形に沿った紫の光の影。

**L295–322**

```css
295 | .tagline {
296 |   margin: -10px 0 4px;
297 |   text-align: center;
298 |   color: var(--muted);
299 |   letter-spacing: 0.2em;
300 |   font-size: 13px;
301 | }
302 | 
303 | .field-group {
304 |   display: flex;
305 |   flex-direction: column;
306 |   gap: 8px;
307 | }
308 | 
309 | .group-label {
310 |   font-size: 12px;
311 |   font-weight: 700;
312 |   letter-spacing: 0.12em;
313 |   color: var(--gold);
314 | }
315 | 
316 | .group-label output {
317 |   margin-left: 6px;
318 |   color: var(--text);
319 |   font-family: var(--font-num);
320 |   letter-spacing: 0;
321 | }
322 | 
```

- `.tagline` … ロゴ下のキャッチコピー。マイナスの margin でロゴに少し近づける。
- `.field-group` … 「見出し＋選択肢」のまとまり。
- `.group-label` … 「目標点」などの小見出し。`output` は横の数値表示。

## 選択式のボタン

**L323–354**

```css
323 | .seg {
324 |   display: flex;
325 |   flex-wrap: wrap;
326 |   gap: 6px;
327 | }
328 | 
329 | .seg-btn {
330 |   flex: 1 1 auto;
331 |   padding: 9px 10px;
332 |   border: 1px solid rgba(255, 255, 255, 0.1);
333 |   border-radius: 8px;
334 |   background: rgba(255, 255, 255, 0.03);
335 |   color: var(--muted);
336 |   font: inherit;
337 |   font-size: 14px;
338 |   font-weight: 500;
339 |   cursor: pointer;
340 |   transition: background 0.15s, color 0.15s, border-color 0.15s;
341 | }
342 | 
343 | .seg-btn:hover {
344 |   color: var(--text);
345 |   border-color: var(--gold-dim);
346 | }
347 | 
348 | .seg-btn[aria-pressed='true'] {
349 |   color: var(--ink);
350 |   background: var(--gold);
351 |   border-color: var(--gold);
352 |   font-weight: 700;
353 | }
354 | 
```

- `.seg` … ボタンを横に並べ、入りきらなければ折り返す（`flex-wrap: wrap`）。
- `.seg-btn` … 各ボタン。`flex: 1 1 auto` で、余った幅を均等に分けて広がる。`font: inherit` は、ボタンはブラウザ標準の書体になってしまうので、親と同じ書体に戻す指定。
- `:hover` … マウスを乗せたとき。
- `[aria-pressed='true']` … 選ばれているボタン。金色の背景に暗い文字。

**L355–385**

```css
355 | .seed-row {
356 |   display: flex;
357 |   gap: 8px;
358 |   flex-wrap: wrap;
359 | }
360 | 
361 | .seed-row .seg {
362 |   flex: 1 1 200px;
363 | }
364 | 
365 | input[type='number'] {
366 |   flex: 1 1 120px;
367 |   min-width: 0;
368 |   padding: 9px 12px;
369 |   border: 1px solid rgba(255, 255, 255, 0.14);
370 |   border-radius: 8px;
371 |   background: rgba(0, 0, 0, 0.25);
372 |   color: var(--text);
373 |   font-family: var(--font-num);
374 |   font-size: 16px;
375 | }
376 | 
377 | input[type='number']:disabled {
378 |   opacity: 0.4;
379 | }
380 | 
381 | input[type='range'] {
382 |   width: 100%;
383 |   accent-color: var(--gold);
384 | }
385 | 
```

- `.seed-row` … シードのボタンと入力欄の並び。狭いときは入力欄が下に折り返す。
- `input[type='number']` … 数字入力欄。`font-size: 16px` 以上にしているのは、iPhone で16px未満の入力欄を触ると画面が勝手に拡大されるため。
- `:disabled` … 入力できないときは薄く。
- `input[type='range']` … スライダー。`accent-color` でつまみの色を金に。

## ボタン

**L386–445**

```css
386 | .btn {
387 |   padding: 11px 16px;
388 |   border: 1px solid rgba(255, 255, 255, 0.14);
389 |   border-radius: 10px;
390 |   background: rgba(255, 255, 255, 0.04);
391 |   color: var(--text);
392 |   font: inherit;
393 |   font-size: 15px;
394 |   font-weight: 700;
395 |   cursor: pointer;
396 |   transition: transform 0.08s, background 0.15s, border-color 0.15s;
397 | }
398 | 
399 | .btn:hover {
400 |   border-color: var(--gold-dim);
401 |   background: rgba(255, 255, 255, 0.08);
402 | }
403 | 
404 | .btn:active {
405 |   transform: translateY(1px);
406 | }
407 | 
408 | .btn.primary {
409 |   background: linear-gradient(180deg, #e6d1a2, #c2a46a);
410 |   border-color: #e6d1a2;
411 |   color: #1a1426;
412 |   font-size: 17px;
413 | }
414 | 
415 | .btn.primary kbd {
416 |   color: #1a1426;
417 |   border-color: rgba(26, 20, 38, 0.3);
418 |   background: rgba(255, 255, 255, 0.25);
419 | }
420 | 
421 | .btn.danger {
422 |   color: var(--bad);
423 | }
424 | 
425 | .btn.danger[data-armed='true'] {
426 |   background: rgba(255, 110, 140, 0.18);
427 |   border-color: var(--bad);
428 | }
429 | 
430 | .btn.ghost {
431 |   background: none;
432 |   border-color: transparent;
433 |   color: var(--muted);
434 |   font-weight: 500;
435 | }
436 | 
437 | .row {
438 |   display: flex;
439 |   gap: 10px;
440 | }
441 | 
442 | .row > .btn {
443 |   flex: 1;
444 | }
445 | 
```

- `.btn` … 普通のボタン。`:active`（押している間）に1px下げて、押した感触を出す。
- `.btn.primary` … 一番大事なボタン（スタート、リトライなど）。金のグラデーション。中の `kbd` も見やすい色に。
- `.btn.danger` … 記録削除。赤い文字。`[data-armed='true']`（もう一度押すと削除の状態）では背景も赤っぽく。
- `.btn.ghost` … 枠のない控えめなボタン（メニューへ）。
- `.row` … ボタンを横に並べ、`.row > .btn` で同じ幅に分ける。

**L446–450**

```css
446 | :focus-visible {
447 |   outline: 2px solid #9fe8ff;
448 |   outline-offset: 2px;
449 | }
450 | 
```

`:focus-visible` … キーボード操作でフォーカスが当たっている要素に、水色の枠を出す。マウスでクリックしたときには出ず、Tab キーで移動したときだけ出る。

**L451–477**

```css
451 | .howto {
452 |   font-size: 12.5px;
453 |   line-height: 1.9;
454 |   color: var(--muted);
455 |   border-top: 1px solid rgba(255, 255, 255, 0.07);
456 |   padding-top: 12px;
457 | }
458 | 
459 | .howto b {
460 |   color: var(--text);
461 |   font-weight: 500;
462 | }
463 | 
464 | .disclaimer {
465 |   margin: 0;
466 |   font-size: 11px;
467 |   color: var(--muted);
468 |   opacity: 0.75;
469 |   text-align: center;
470 | }
471 | 
472 | .note {
473 |   margin: 0;
474 |   font-size: 12px;
475 |   color: var(--bad);
476 | }
477 | 
```

- `.howto` … メニュー下の遊び方。上に区切り線。
- `.disclaimer` … 非公式表示。小さく薄く。
- `.note` … ランキングの注意書き。

## ランキングの表

**L478–523**

```css
478 | .table-wrap {
479 |   overflow-x: auto;
480 | }
481 | 
482 | .rank-table {
483 |   width: 100%;
484 |   border-collapse: collapse;
485 |   font-size: 14px;
486 |   font-variant-numeric: tabular-nums;
487 | }
488 | 
489 | .rank-table th {
490 |   font-size: 11px;
491 |   letter-spacing: 0.1em;
492 |   color: var(--gold);
493 |   font-weight: 700;
494 |   text-align: right;
495 |   padding: 6px 8px;
496 |   border-bottom: 1px solid var(--gold-dim);
497 |   white-space: nowrap;
498 | }
499 | 
500 | .rank-table td {
501 |   font-family: var(--font-num);
502 |   text-align: right;
503 |   padding: 7px 8px;
504 |   border-bottom: 1px solid rgba(255, 255, 255, 0.05);
505 |   white-space: nowrap;
506 | }
507 | 
508 | .rank-table th:first-child,
509 | .rank-table td:first-child {
510 |   text-align: center;
511 | }
512 | 
513 | .rank-table tr.top td {
514 |   color: #ffe28a;
515 | }
516 | 
517 | .rank-table .empty {
518 |   text-align: center;
519 |   color: var(--muted);
520 |   font-family: var(--font-body);
521 |   padding: 22px;
522 | }
523 | 
```

- `.table-wrap` … 表が画面より広いときは、この中だけ横スクロール。
- `border-collapse: collapse` … セルの枠線を重ねて1本にする。
- 見出しは金の小さな文字、数字は右揃え、順位の列（`:first-child` ＝最初のセル）だけ中央揃え。
- `white-space: nowrap` … セルの中で折り返さない。
- `tr.top td` … 1位の行を金色に。`.empty` … 「まだ記録がありません」の行。

## 結果画面

**L524–591**

```css
524 | /* ---------- 結果 ---------- */
525 | .result {
526 |   text-align: center;
527 | }
528 | 
529 | .result-kind {
530 |   margin: 0;
531 |   font-family: var(--font-display);
532 |   font-size: 28px;
533 |   letter-spacing: 0.1em;
534 |   color: var(--gold);
535 | }
536 | 
537 | .result-kind.dead {
538 |   color: var(--bad);
539 | }
540 | 
541 | .result-time {
542 |   margin: -6px 0 0;
543 |   font-family: var(--font-num);
544 |   font-weight: 600;
545 |   font-size: clamp(44px, 13vw, 64px);
546 |   line-height: 1;
547 |   font-variant-numeric: tabular-nums;
548 | }
549 | 
550 | .result-delta {
551 |   margin: 0;
552 |   min-height: 1.4em;
553 |   font-family: var(--font-num);
554 |   font-size: 16px;
555 | }
556 | 
557 | .result-delta.better {
558 |   color: var(--good);
559 | }
560 | 
561 | .result-delta.worse {
562 |   color: var(--bad);
563 | }
564 | 
565 | .result-meta {
566 |   display: grid;
567 |   grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
568 |   gap: 10px;
569 |   margin: 0;
570 |   text-align: left;
571 | }
572 | 
573 | .result-meta div {
574 |   padding: 8px 10px;
575 |   border-radius: 8px;
576 |   background: rgba(0, 0, 0, 0.2);
577 | }
578 | 
579 | .result-meta dt {
580 |   font-size: 11px;
581 |   color: var(--gold);
582 |   letter-spacing: 0.1em;
583 | }
584 | 
585 | .result-meta dd {
586 |   margin: 2px 0 0;
587 |   font-family: var(--font-num);
588 |   font-size: 17px;
589 |   font-variant-numeric: tabular-nums;
590 | }
591 | 
```

- `.result-kind` … 見出し（CLEAR など）。窒息のとき（`.dead`）は赤。
- `.result-time` … 大きなタイム。
- `.result-delta` … ベストとの差。`min-height` で、空のときも高さを確保してレイアウトがずれないように。`.better` は緑、`.worse` は赤。
- `.result-meta` … 詳細の数値。`repeat(auto-fit, minmax(110px, 1fr))` は「110px以上の列を、入るだけ並べる」指定で、画面幅に応じて列数が自動で変わる。

**L592–597**

```css
592 | @media (prefers-reduced-motion: reduce) {
593 |   .logo {
594 |     animation: none;
595 |   }
596 | }
597 | 
```

`prefers-reduced-motion: reduce` … OS の設定で「視差効果を減らす」などをオンにしている人には、ロゴのアニメーションを止める（アクセシビリティへの配慮）。

## 1手戻す

**L598–618**

```css
598 | /* ---------- 1手戻す ---------- */
599 | .penalty {
600 |   display: block;
601 |   margin-top: 2px;
602 |   font-family: var(--font-num);
603 |   font-size: 12px;
604 |   color: var(--bad);
605 |   font-variant-numeric: tabular-nums;
606 | }
607 | 
608 | .penalty.flash {
609 |   animation: penalty-flash 0.5s ease-out;
610 | }
611 | 
612 | @keyframes penalty-flash {
613 |   from {
614 |     transform: scale(1.4);
615 |     color: #fff;
616 |   }
617 | }
618 | 
```

- `.penalty` … タイムの下のペナルティ表示。
- `.penalty.flash` … 1手戻した瞬間、1.4倍の白い文字から元に戻るアニメーション。`@keyframes` で `from`（開始時）だけ書くと、そこから通常の見た目へ変化する。

**L619–652**

```css
619 | .undo-btn {
620 |   position: absolute;
621 |   display: flex;
622 |   flex-direction: column;
623 |   align-items: center;
624 |   gap: 1px;
625 |   padding: 7px 4px;
626 |   border: 1px solid var(--gold-dim);
627 |   border-radius: 10px;
628 |   background: rgba(30, 26, 54, 0.85);
629 |   color: var(--text);
630 |   font: inherit;
631 |   font-size: 12px;
632 |   font-weight: 700;
633 |   line-height: 1.2;
634 |   cursor: pointer;
635 |   touch-action: manipulation;
636 | }
637 | 
638 | .undo-btn small {
639 |   font-family: var(--font-num);
640 |   font-size: 10px;
641 |   font-weight: 600;
642 |   color: var(--bad);
643 | }
644 | 
645 | .undo-btn:disabled {
646 |   opacity: 0.35;
647 |   cursor: default;
648 | }
649 | 
650 | .undo-btn:not(:disabled):active {
651 |   transform: translateY(1px);
652 | }
```

「1手戻す」ボタン。
- `position: absolute` … 盤面エリアの中で、`main.ts` が指定した位置（ネクストの下）に置く。
- `flex-direction: column` … 「1手戻す」と「+5秒」を縦に並べる。
- `touch-action: manipulation` … スマホでダブルタップによる拡大を無効にし、タップの反応を速くする。
- `:disabled` … 押せないときは薄く。`:not(:disabled):active` … 押せる状態で押している間だけ1px下げる。

## ボタン方式のボタン

**L653–664**

```css
653 | 
654 | /* ---------- ボタン方式のタッチ操作（置き方22パターン） ---------- */
655 | .pad {
656 |   grid-area: pad;
657 |   width: 100%;
658 |   max-width: 460px;
659 |   margin: 0 auto;
660 |   padding: 6px 0 8px;
661 |   display: grid;
662 |   gap: 5px;
663 |   touch-action: none;
664 | }
```

`.pad` … ボタン方式のボタンを入れる箱。`#app` の `pad` の領域に置く。
- `max-width: 460px` と `margin: 0 auto` … 横に広い画面でも広がりすぎないようにして、中央に寄せる。
- `display: grid` と `gap: 5px` … 4段のボタン列を5px間隔で縦に並べる。
- `touch-action: none` … このあたりを触っても、スクロールや拡大をしない。

**L665–671**

```css
665 | 
666 | /* 半列刻みの12マス。縦置きは2マス、横置きは境目をまたいで2マス使う */
667 | .pad-row {
668 |   display: grid;
669 |   grid-template-columns: repeat(12, minmax(0, 1fr));
670 |   gap: 4px;
671 | }
```

`.pad-row` … ボタン1段。横を**12マス**（半列ずつ）に分ける。`repeat(12, minmax(0, 1fr))` は「同じ幅のマスを12個」。
縦置きのボタンは2マスずつ使うので1列ぶんの幅になり、横置きのボタンは1マスずらして2マス使うので、2列の境目の真下に来る（位置は `pad.ts` が `gridColumn` で決める）。

**L672–686**

```css
672 | 
673 | .pad-btn {
674 |   height: 44px;
675 |   padding: 0;
676 |   display: flex;
677 |   align-items: center;
678 |   justify-content: center;
679 |   border: 1px solid var(--gold-dim);
680 |   border-radius: 9px;
681 |   background: rgba(30, 26, 54, 0.85);
682 |   cursor: pointer;
683 |   touch-action: none;
684 |   -webkit-touch-callout: none;
685 | }
686 | 
```

`.pad-btn` … ボタン1個。高さ44px（指で押しやすい大きさ）。中に描くぷよ2個を `flex` で中央に並べる。
- `-webkit-touch-callout: none` … iPhone で長押ししたときのメニューを出さない。

**L687–690**

```css
687 | .pad-btn.v {
688 |   flex-direction: column;
689 | }
690 | 
```

`.v` は縦置きのボタン。ぷよ2個を縦に並べる（`flex-direction: column`）。

**L691–696**

```css
691 | .pad-gem {
692 |   width: 18px;
693 |   height: 18px;
694 |   background: center / contain no-repeat;
695 | }
696 | 
```

`.pad-gem` … ボタンの中のぷよ1個。画像（宝石の絵）は `pad.ts` が `backgroundImage` で入れる。`center / contain no-repeat` は「中央に、はみ出さない大きさで、1回だけ」。

**L697–702**

```css
697 | /* 軸ぷよの目印 */
698 | .pad-gem.axis {
699 |   border-radius: 50%;
700 |   box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.55);
701 | }
702 | 
```

軸ぷよには白い細い輪を付けて、どちらが軸かを分かるようにする。`box-shadow: 0 0 0 1.5px` はぼかさない影＝外側の線になる。

**L703–707**

```css
703 | /* 同じ色のペアで、結果が他のボタンと同じになるもの */
704 | .pad-btn.dup {
705 |   opacity: 0.4;
706 | }
707 | 
```

同じ色のペアのとき、他のボタンと結果が同じになるボタン（子が下・子が左）を薄くする。

**L708–712**

```css
708 | .pad-btn.active {
709 |   border-color: var(--gold);
710 |   background: rgba(214, 190, 140, 0.28);
711 | }
712 | 
```

押している間のボタンを金色にする。

**L713–715**

```css
713 | .pad.disabled .pad-btn:not(.active) {
714 |   opacity: 0.55;
715 | }
```

連鎖の演出中など、まだ置けないときはボタンを薄くする（押している最中のボタンは除く）。
