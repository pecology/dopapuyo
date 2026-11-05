# index.html

ブラウザが最初に開くページ。画面の部品（盤面の canvas、上部の表示、メニューなどの各画面）をすべてここに並べておき、表示・非表示は `main.ts` が切り替える。
各部品に付けた `id` は `main.ts` の `$('id名')` で、`class` は `style.css` の見た目指定で使われる。

**L1–2**

```html
  1 | <!doctype html>
  2 | <html lang="ja">
```

- L1: 「HTML5 の文書です」という宣言。
- L2: ページ全体の始まり。`lang="ja"` で日本語のページだと伝える（読み上げや文字の表示に使われる）。

## head（ページの設定）

**L3–10**

```html
  3 |   <head>
  4 |     <meta charset="UTF-8" />
  5 |     <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  6 |     <title>どぱぷよ</title>
  7 |     <meta name="description" content="上級者向け連鎖スコアアタック（非公式ファンメイド作品）" />
  8 |     <meta name="theme-color" content="#0e0d1a" />
  9 |     <link rel="icon" href="./icons/icon-192.png" type="image/png" />
 10 |     <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
```

- L4: 文字コードを UTF-8 に。
- L5: スマホ向けの表示設定。画面幅に合わせ（`width=device-width`）、拡大縮小しない（`user-scalable=no`、ゲーム中のダブルタップで拡大されるのを防ぐ）。`viewport-fit=cover` はノッチのある iPhone でも画面いっぱいに使う設定。
- L6: タブに出るタイトル。
- L7: 検索結果などに出る説明文。
- L8: スマホのブラウザのアドレスバーの色。背景と同じ暗い色にする。
- L9: タブに出る小さなアイコン。
- L10: iPhone などでホーム画面に追加したときのアイコン。画像は `public/icons/` にあり、ビルドするとそのまま `dist/icons/` にコピーされる。
- アプリ名やアイコンを書いた**マニフェスト**（`manifest.webmanifest`）へのリンクは、ビルド時に vite-plugin-pwa が自動で書き足す。


**L11–17**

```html
 11 |     <link rel="preconnect" href="https://fonts.googleapis.com" />
 12 |     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
 13 |     <link
 14 |       rel="stylesheet"
 15 |       href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
 16 |     />
 17 |   </head>
```

Google Fonts からフォントを読み込む。
- L11–12: `preconnect` … フォントのサーバーに先に接続しておき、読み込みを速くする。
- L13–16: 使う3つの書体。Chakra Petch（数字・英字）、Dela Gothic One（ロゴや連鎖表示の太い文字）、Zen Kaku Gothic New（日本語の本文）。`wght@500;600` は使う太さ。`display=swap` は、読み込み中は代わりの書体で表示しておき、届いたら差し替える指定。

## プレイ画面

**L18–23**

```html
 18 |   <body>
 19 |     <div id="app">
 20 |       <main class="stage" id="stage">
 21 |         <canvas id="board" aria-label="ゲーム盤面"></canvas>
 22 |         <button type="button" class="undo-btn" id="undo" hidden>1手戻す<small>+5秒</small></button>
 23 |       </main>
```

- L19: アプリ全体を包む箱。CSS でこの中を格子状（grid）に並べる。
- L20: 盤面のエリア。`main` は「ページの主な内容」を表す要素。
- L21: 盤面を描く canvas。`aria-label` は読み上げソフト用の名前。
- L22: 「1手戻す」ボタン。最初は `hidden`（非表示）で、プレイ中に `main.ts` が表示し、位置も合わせる。`type="button"` は、フォームの送信ボタンとして扱われないようにするための指定。

**L24–26**

```html
 24 | 
 25 |       <!-- ボタン方式のタッチ操作（置き方22パターン）。中身は input/pad.ts が作る -->
 26 |       <div class="pad" id="pad" hidden></div>
```

ボタン方式のタッチ操作で使う、置き方22パターンのボタンの置き場所。中身のボタンは `input/pad.ts` が作って入れる。最初は `hidden` で、オプションでボタン方式を選んだときだけ表示する。

**L27–48**

```html
 27 | 
 28 |       <aside class="hud" id="hud">
 29 |         <div class="hud-brand">どぱぷよ</div>
 30 |         <div class="hud-time">
 31 |           <span class="label">TIME</span>
 32 |           <span class="value" id="time">0:00.00</span>
 33 |           <span class="penalty" id="penalty" hidden></span>
 34 |         </div>
 35 |         <div class="hud-score">
 36 |           <span class="label">SCORE</span>
 37 |           <span class="value" id="score">0</span>
 38 |           <span class="target">/ <span id="target">100,000</span></span>
 39 |           <div class="bar"><div class="bar-fill" id="bar"></div></div>
 40 |         </div>
 41 |         <dl class="hud-meta">
 42 |           <div><dt>SEED</dt><dd id="seed">-</dd></div>
 43 |           <div><dt>MAX</dt><dd id="maxchain">0連鎖</dd></div>
 44 |           <div><dt>手数</dt><dd id="moves">0</dd></div>
 45 |         </dl>
 46 |         <div class="hud-keys" id="keyhelp"></div>
 47 |       </aside>
 48 | 
```

上部（PCでは右側）の情報表示。`aside` は「補足的な内容」を表す要素。
- L29: PCのときだけ出るロゴ。
- L30–34: タイム。`penalty` はペナルティ合計の表示で、1手戻すまでは隠しておく。
- L35–40: スコア。`/ 100,000` の目標点と、進み具合のバー（`bar` の中の `bar-fill` の幅を変えて伸ばす）。
- L41–45: シード・最大連鎖・手数。`dl`（説明リスト）は「見出し `dt` と内容 `dd` の組」を並べるための要素。
- L46: PCのときだけ出る操作説明。中身は `main.ts` が書き込む。

## メニュー画面

**L49–59**

```html
 49 |       <!-- メニュー -->
 50 |       <section class="overlay" id="menu">
 51 |         <div class="panel menu">
 52 |           <h1 class="logo">どぱぷよ</h1>
 53 |           <p class="tagline">上級者向け 連鎖スコアアタック</p>
 54 | 
 55 |           <div class="field-group">
 56 |             <div class="group-label">目標点</div>
 57 |             <div class="seg" id="targets" role="radiogroup" aria-label="目標点"></div>
 58 |           </div>
 59 | 
```

画面の上に重ねて表示する画面（オーバーレイ）。`section` はひとまとまりの区画。
- L52: ロゴ。`h1` はページの一番大きな見出し。
- L55–58: 目標点のボタンを入れる場所。ボタン自体は `main.ts` が作る。`role="radiogroup"` は「この中から1つを選ぶ」グループだと読み上げソフトに伝える。

**L60–70**

```html
 60 |           <div class="field-group">
 61 |             <div class="group-label">シード（配ぷよ）</div>
 62 |             <div class="seed-row">
 63 |               <div class="seg" role="radiogroup" aria-label="シードの選び方">
 64 |                 <button type="button" class="seg-btn" id="seed-random" aria-pressed="true">ランダム</button>
 65 |                 <button type="button" class="seg-btn" id="seed-fixed" aria-pressed="false">番号指定</button>
 66 |               </div>
 67 |               <input id="seed-input" type="number" inputmode="numeric" min="1" max="65536" placeholder="1〜65536" disabled />
 68 |             </div>
 69 |           </div>
 70 | 
```

シードの選び方。ランダム／番号指定のボタンと、番号の入力欄。
- `aria-pressed` … ボタンが押された（選ばれた）状態か。CSS がこれを見て見た目を変える。
- L67: 数字の入力欄。`inputmode="numeric"` でスマホでは数字キーボードが出る。最初は `disabled`（入力できない）。

**L71–81**

```html
 71 |           <button type="button" class="btn primary" id="start">スタート <kbd>Enter</kbd></button>
 72 |           <div class="row">
 73 |             <button type="button" class="btn" id="open-ranking">ランキング</button>
 74 |             <button type="button" class="btn" id="open-options">オプション</button>
 75 |           </div>
 76 | 
 77 |           <div class="howto" id="howto"></div>
 78 |           <p class="disclaimer">非公式のファンメイド作品です。株式会社セガとは関係ありません。</p>
 79 |         </div>
 80 |       </section>
 81 | 
```

- L71: スタートボタン。`<kbd>` はキーボードのキーを表す要素。
- L72–75: ランキングとオプションのボタン。
- L77: 遊び方の説明（`main.ts` が書き込む）。
- L78: 非公式であることの表示。

## オプション画面

**L82–133**

```html
 82 |       <!-- オプション -->
 83 |       <section class="overlay" id="options" hidden>
 84 |         <div class="panel">
 85 |           <h2>オプション</h2>
 86 |           <div class="field-group">
 87 |             <div class="group-label">キーボード操作</div>
 88 |             <div class="seg" id="opt-scheme">
 89 |               <button type="button" class="seg-btn" data-value="arrow">矢印キー</button>
 90 |               <button type="button" class="seg-btn" data-value="direct">直接指定</button>
 91 |             </div>
 92 |           </div>
 93 |           <div class="field-group">
 94 |             <div class="group-label">次のペアの列</div>
 95 |             <div class="seg" id="opt-spawn-col">
 96 |               <button type="button" class="seg-btn" data-value="reset">3列目に戻す</button>
 97 |               <button type="button" class="seg-btn" data-value="keep">直前の列を引き継ぐ</button>
 98 |             </div>
 99 |           </div>
100 |           <div class="field-group">
101 |             <div class="group-label">次のペアの子ぷよの向き</div>
102 |             <div class="seg" id="opt-spawn-rot">
103 |               <button type="button" class="seg-btn" data-value="reset">上に戻す</button>
104 |               <button type="button" class="seg-btn" data-value="keep">直前の向きを引き継ぐ</button>
105 |             </div>
106 |           </div>
107 |           <div class="field-group">
108 |             <div class="group-label">タッチ操作</div>
109 |             <div class="seg" id="opt-touch">
110 |               <button type="button" class="seg-btn" data-value="single">片手（タップ＋フリック）</button>
111 |               <button type="button" class="seg-btn" data-value="twohand">両手（左で列・右で向き）</button>
112 |               <button type="button" class="seg-btn" data-value="buttons">ボタン（置き方を選ぶ）</button>
113 |             </div>
114 |           </div>
115 |           <div class="field-group" id="opt-step-group">
116 |             <label class="group-label" for="opt-step">両手モードで1列動かす距離 <output id="opt-step-out"></output></label>
117 |             <input id="opt-step" type="range" min="12" max="80" step="2" />
118 |           </div>
119 |           <div class="field-group">
120 |             <label class="group-label" for="opt-flick">フリック判定の距離 <output id="opt-flick-out"></output></label>
121 |             <input id="opt-flick" type="range" min="8" max="64" step="2" />
122 |           </div>
123 |           <div class="field-group">
124 |             <label class="group-label" for="opt-volume">効果音 <output id="opt-volume-out"></output></label>
125 |             <input id="opt-volume" type="range" min="0" max="1" step="0.05" />
126 |           </div>
127 |           <div class="row">
128 |             <button type="button" class="btn danger" id="clear-records">記録をすべて削除</button>
129 |             <button type="button" class="btn primary" id="close-options">閉じる</button>
130 |           </div>
131 |         </div>
132 |       </section>
133 | 
```

最初は `hidden`。
- L88–91, L95–98, L102–105, L109–113: 選択式のボタン（キーボード操作・次のペアの列・次のペアの子ぷよの向き・タッチ操作）。`data-value` 属性に設定値を書いておき、`main.ts` が `dataset.value` で読む。タッチ操作は片手・両手・ボタンの3つ。
- L115–118: 両手モードで1列動かす距離のスライダー（`id="opt-step-group"` の囲みごと）。両手モードのときだけ表示する。
- L120–121: フリック判定の距離のスライダー（`type="range"`）。`label` の `for="opt-flick"` で、文字を押してもスライダーが操作対象になる。`output` は計算結果などを表示する要素で、今の値（`24px` など）を出す。
- L124–125: 効果音の音量スライダー。0〜1 を 0.05 刻み。
- L127–130: 記録削除と閉じるボタン。

## ランキング画面

**L134–151**

```html
134 |       <!-- ランキング -->
135 |       <section class="overlay" id="ranking" hidden>
136 |         <div class="panel wide">
137 |           <h2>ランキング</h2>
138 |           <div class="seg" id="rank-tabs"></div>
139 |           <p class="note" id="rank-note" hidden>設定定数がデフォルトと違うため、別枠の記録を表示しています。</p>
140 |           <div class="table-wrap">
141 |             <table class="rank-table">
142 |               <thead>
143 |                 <tr><th>#</th><th>タイム</th><th>シード</th><th>最大連鎖</th><th>手数</th><th>戻し</th><th>日付</th></tr>
144 |               </thead>
145 |               <tbody id="rank-body"></tbody>
146 |             </table>
147 |           </div>
148 |           <button type="button" class="btn primary" id="close-ranking">閉じる</button>
149 |         </div>
150 |       </section>
151 | 
```

- L138: 目標点ごとのタブ（`main.ts` が作る）。
- L139: 設定定数を変えているときの注意書き。
- L140–147: 記録の表。`thead` が見出し行、`tbody` が中身（`main.ts` が行を作って入れる）。`table-wrap` で包むのは、スマホで表が横にはみ出したときにその部分だけ横スクロールさせるため。

## 結果画面

**L152–174**

```html
152 |       <!-- 結果 -->
153 |       <section class="overlay" id="result" hidden>
154 |         <div class="panel result">
155 |           <p class="result-kind" id="result-kind">CLEAR</p>
156 |           <p class="result-time" id="result-time">0:00.00</p>
157 |           <p class="result-delta" id="result-delta"></p>
158 |           <dl class="result-meta">
159 |             <div><dt>目標点</dt><dd id="result-target"></dd></div>
160 |             <div><dt>スコア</dt><dd id="result-score"></dd></div>
161 |             <div><dt>シード</dt><dd id="result-seed"></dd></div>
162 |             <div><dt>最大連鎖</dt><dd id="result-chain"></dd></div>
163 |             <div><dt>手数</dt><dd id="result-moves"></dd></div>
164 |             <div><dt>戻し</dt><dd id="result-undos"></dd></div>
165 |           </dl>
166 |           <div class="row">
167 |             <button type="button" class="btn primary" id="retry">リトライ <kbd>R</kbd></button>
168 |             <button type="button" class="btn" id="new-seed">新しいシード <kbd>N</kbd></button>
169 |           </div>
170 |           <button type="button" class="btn" id="result-undo" hidden>1手戻して続ける <kbd>Q</kbd></button>
171 |           <button type="button" class="btn ghost" id="to-menu">メニューへ <kbd>Esc</kbd></button>
172 |         </div>
173 |       </section>
174 |     </div>
```

- L155–157: 見出し（CLEAR / NEW RECORD / 窒息）、タイム、ベストとの差。
- L158–165: 詳細の数値。
- L166–171: リトライ、新しいシード、1手戻して続ける（窒息時だけ表示）、メニューへ。
- L174: アプリ全体の箱の終わり。

**L175–177**

```html
175 |     <script type="module" src="./src/main.ts"></script>
176 |   </body>
177 | </html>
```

- L175: プログラムを読み込む。`type="module"` は、`import` / `export` を使った書き方（ESモジュール）のファイルだという指定。開発中は Vite が `main.ts` をその場でブラウザが読める形に変換し、`npm run build` では全部を1つの JavaScript ファイルにまとめて、この行をそのファイルへの参照に書き換える。
- L176–177: ページの終わり。
