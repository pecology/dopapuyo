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

**L3–8**

```html
  3 |   <head>
  4 |     <meta charset="UTF-8" />
  5 |     <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  6 |     <title>どぱぷよ</title>
  7 |     <meta name="description" content="上級者向け連鎖スコアアタック（非公式ファンメイド作品）" />
  8 |     <meta name="theme-color" content="#0e0d1a" />
```

- L4: 文字コードを UTF-8 に。
- L5: スマホ向けの表示設定。画面幅に合わせ（`width=device-width`）、拡大縮小しない（`user-scalable=no`、ゲーム中のダブルタップで拡大されるのを防ぐ）。`viewport-fit=cover` はノッチのある iPhone でも画面いっぱいに使う設定。
- L6: タブに出るタイトル。
- L7: 検索結果などに出る説明文。
- L8: スマホのブラウザのアドレスバーの色。背景と同じ暗い色にする。

**L9–15**

```html
  9 |     <link rel="preconnect" href="https://fonts.googleapis.com" />
 10 |     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
 11 |     <link
 12 |       rel="stylesheet"
 13 |       href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
 14 |     />
 15 |   </head>
```

Google Fonts からフォントを読み込む。
- L9–10: `preconnect` … フォントのサーバーに先に接続しておき、読み込みを速くする。
- L11–14: 使う3つの書体。Chakra Petch（数字・英字）、Dela Gothic One（ロゴや連鎖表示の太い文字）、Zen Kaku Gothic New（日本語の本文）。`wght@500;600` は使う太さ。`display=swap` は、読み込み中は代わりの書体で表示しておき、届いたら差し替える指定。

## プレイ画面

**L16–21**

```html
 16 |   <body>
 17 |     <div id="app">
 18 |       <main class="stage" id="stage">
 19 |         <canvas id="board" aria-label="ゲーム盤面"></canvas>
 20 |         <button type="button" class="undo-btn" id="undo" hidden>1手戻す<small>+5秒</small></button>
 21 |       </main>
```

- L17: アプリ全体を包む箱。CSS でこの中を格子状（grid）に並べる。
- L18: 盤面のエリア。`main` は「ページの主な内容」を表す要素。
- L19: 盤面を描く canvas。`aria-label` は読み上げソフト用の名前。
- L20: 「1手戻す」ボタン。最初は `hidden`（非表示）で、プレイ中に `main.ts` が表示し、位置も合わせる。`type="button"` は、フォームの送信ボタンとして扱われないようにするための指定。

**L22–43**

```html
 22 | 
 23 |       <aside class="hud" id="hud">
 24 |         <div class="hud-brand">どぱぷよ</div>
 25 |         <div class="hud-time">
 26 |           <span class="label">TIME</span>
 27 |           <span class="value" id="time">0:00.00</span>
 28 |           <span class="penalty" id="penalty" hidden></span>
 29 |         </div>
 30 |         <div class="hud-score">
 31 |           <span class="label">SCORE</span>
 32 |           <span class="value" id="score">0</span>
 33 |           <span class="target">/ <span id="target">100,000</span></span>
 34 |           <div class="bar"><div class="bar-fill" id="bar"></div></div>
 35 |         </div>
 36 |         <dl class="hud-meta">
 37 |           <div><dt>SEED</dt><dd id="seed">-</dd></div>
 38 |           <div><dt>MAX</dt><dd id="maxchain">0連鎖</dd></div>
 39 |           <div><dt>手数</dt><dd id="moves">0</dd></div>
 40 |         </dl>
 41 |         <div class="hud-keys" id="keyhelp"></div>
 42 |       </aside>
 43 | 
```

上部（PCでは右側）の情報表示。`aside` は「補足的な内容」を表す要素。
- L24: PCのときだけ出るロゴ。
- L25–29: タイム。`penalty` はペナルティ合計の表示で、1手戻すまでは隠しておく。
- L30–35: スコア。`/ 100,000` の目標点と、進み具合のバー（`bar` の中の `bar-fill` の幅を変えて伸ばす）。
- L36–40: シード・最大連鎖・手数。`dl`（説明リスト）は「見出し `dt` と内容 `dd` の組」を並べるための要素。
- L41: PCのときだけ出る操作説明。中身は `main.ts` が書き込む。

## メニュー画面

**L44–54**

```html
 44 |       <!-- メニュー -->
 45 |       <section class="overlay" id="menu">
 46 |         <div class="panel menu">
 47 |           <h1 class="logo">どぱぷよ</h1>
 48 |           <p class="tagline">上級者向け 連鎖スコアアタック</p>
 49 | 
 50 |           <div class="field-group">
 51 |             <div class="group-label">目標点</div>
 52 |             <div class="seg" id="targets" role="radiogroup" aria-label="目標点"></div>
 53 |           </div>
 54 | 
```

画面の上に重ねて表示する画面（オーバーレイ）。`section` はひとまとまりの区画。
- L47: ロゴ。`h1` はページの一番大きな見出し。
- L50–53: 目標点のボタンを入れる場所。ボタン自体は `main.ts` が作る。`role="radiogroup"` は「この中から1つを選ぶ」グループだと読み上げソフトに伝える。

**L55–65**

```html
 55 |           <div class="field-group">
 56 |             <div class="group-label">シード（配ぷよ）</div>
 57 |             <div class="seed-row">
 58 |               <div class="seg" role="radiogroup" aria-label="シードの選び方">
 59 |                 <button type="button" class="seg-btn" id="seed-random" aria-pressed="true">ランダム</button>
 60 |                 <button type="button" class="seg-btn" id="seed-fixed" aria-pressed="false">番号指定</button>
 61 |               </div>
 62 |               <input id="seed-input" type="number" inputmode="numeric" min="1" max="65536" placeholder="1〜65536" disabled />
 63 |             </div>
 64 |           </div>
 65 | 
```

シードの選び方。ランダム／番号指定のボタンと、番号の入力欄。
- `aria-pressed` … ボタンが押された（選ばれた）状態か。CSS がこれを見て見た目を変える。
- L62: 数字の入力欄。`inputmode="numeric"` でスマホでは数字キーボードが出る。最初は `disabled`（入力できない）。

**L66–76**

```html
 66 |           <button type="button" class="btn primary" id="start">スタート <kbd>Enter</kbd></button>
 67 |           <div class="row">
 68 |             <button type="button" class="btn" id="open-ranking">ランキング</button>
 69 |             <button type="button" class="btn" id="open-options">オプション</button>
 70 |           </div>
 71 | 
 72 |           <div class="howto" id="howto"></div>
 73 |           <p class="disclaimer">非公式のファンメイド作品です。株式会社セガとは関係ありません。</p>
 74 |         </div>
 75 |       </section>
 76 | 
```

- L66: スタートボタン。`<kbd>` はキーボードのキーを表す要素。
- L67–70: ランキングとオプションのボタン。
- L72: 遊び方の説明（`main.ts` が書き込む）。
- L73: 非公式であることの表示。

## オプション画面

**L77–127**

```html
 77 |       <!-- オプション -->
 78 |       <section class="overlay" id="options" hidden>
 79 |         <div class="panel">
 80 |           <h2>オプション</h2>
 81 |           <div class="field-group">
 82 |             <div class="group-label">キーボード操作</div>
 83 |             <div class="seg" id="opt-scheme">
 84 |               <button type="button" class="seg-btn" data-value="arrow">矢印キー</button>
 85 |               <button type="button" class="seg-btn" data-value="direct">直接指定</button>
 86 |             </div>
 87 |           </div>
 88 |           <div class="field-group">
 89 |             <div class="group-label">次のペアの列</div>
 90 |             <div class="seg" id="opt-spawn-col">
 91 |               <button type="button" class="seg-btn" data-value="reset">3列目に戻す</button>
 92 |               <button type="button" class="seg-btn" data-value="keep">直前の列を引き継ぐ</button>
 93 |             </div>
 94 |           </div>
 95 |           <div class="field-group">
 96 |             <div class="group-label">次のペアの子ぷよの向き</div>
 97 |             <div class="seg" id="opt-spawn-rot">
 98 |               <button type="button" class="seg-btn" data-value="reset">上に戻す</button>
 99 |               <button type="button" class="seg-btn" data-value="keep">直前の向きを引き継ぐ</button>
100 |             </div>
101 |           </div>
102 |           <div class="field-group">
103 |             <div class="group-label">タッチ操作</div>
104 |             <div class="seg" id="opt-touch">
105 |               <button type="button" class="seg-btn" data-value="single">片手（タップ＋フリック）</button>
106 |               <button type="button" class="seg-btn" data-value="twohand">両手（左で列・右で向き）</button>
107 |             </div>
108 |           </div>
109 |           <div class="field-group" id="opt-step-group">
110 |             <label class="group-label" for="opt-step">両手モードで1列動かす距離 <output id="opt-step-out"></output></label>
111 |             <input id="opt-step" type="range" min="12" max="80" step="2" />
112 |           </div>
113 |           <div class="field-group">
114 |             <label class="group-label" for="opt-flick">フリック判定の距離 <output id="opt-flick-out"></output></label>
115 |             <input id="opt-flick" type="range" min="8" max="64" step="2" />
116 |           </div>
117 |           <div class="field-group">
118 |             <label class="group-label" for="opt-volume">効果音 <output id="opt-volume-out"></output></label>
119 |             <input id="opt-volume" type="range" min="0" max="1" step="0.05" />
120 |           </div>
121 |           <div class="row">
122 |             <button type="button" class="btn danger" id="clear-records">記録をすべて削除</button>
123 |             <button type="button" class="btn primary" id="close-options">閉じる</button>
124 |           </div>
125 |         </div>
126 |       </section>
127 | 
```

最初は `hidden`。
- L83–86, L90–93, L97–100, L104–107: 選択式のボタン（キーボード操作・次のペアの列・次のペアの子ぷよの向き・タッチ操作）。`data-value` 属性に設定値を書いておき、`main.ts` が `dataset.value` で読む。
- L109–112: 両手モードで1列動かす距離のスライダー（`id="opt-step-group"` の囲みごと）。両手モードのときだけ表示する。
- L114–115: フリック判定の距離のスライダー（`type="range"`）。`label` の `for="opt-flick"` で、文字を押してもスライダーが操作対象になる。`output` は計算結果などを表示する要素で、今の値（`24px` など）を出す。
- L118–119: 効果音の音量スライダー。0〜1 を 0.05 刻み。
- L121–124: 記録削除と閉じるボタン。


## ランキング画面

**L128–145**

```html
128 |       <!-- ランキング -->
129 |       <section class="overlay" id="ranking" hidden>
130 |         <div class="panel wide">
131 |           <h2>ランキング</h2>
132 |           <div class="seg" id="rank-tabs"></div>
133 |           <p class="note" id="rank-note" hidden>設定定数がデフォルトと違うため、別枠の記録を表示しています。</p>
134 |           <div class="table-wrap">
135 |             <table class="rank-table">
136 |               <thead>
137 |                 <tr><th>#</th><th>タイム</th><th>シード</th><th>最大連鎖</th><th>手数</th><th>戻し</th><th>日付</th></tr>
138 |               </thead>
139 |               <tbody id="rank-body"></tbody>
140 |             </table>
141 |           </div>
142 |           <button type="button" class="btn primary" id="close-ranking">閉じる</button>
143 |         </div>
144 |       </section>
145 | 
```

- L132: 目標点ごとのタブ（`main.ts` が作る）。
- L133: 設定定数を変えているときの注意書き。
- L134–141: 記録の表。`thead` が見出し行、`tbody` が中身（`main.ts` が行を作って入れる）。`table-wrap` で包むのは、スマホで表が横にはみ出したときにその部分だけ横スクロールさせるため。

## 結果画面

**L146–168**

```html
146 |       <!-- 結果 -->
147 |       <section class="overlay" id="result" hidden>
148 |         <div class="panel result">
149 |           <p class="result-kind" id="result-kind">CLEAR</p>
150 |           <p class="result-time" id="result-time">0:00.00</p>
151 |           <p class="result-delta" id="result-delta"></p>
152 |           <dl class="result-meta">
153 |             <div><dt>目標点</dt><dd id="result-target"></dd></div>
154 |             <div><dt>スコア</dt><dd id="result-score"></dd></div>
155 |             <div><dt>シード</dt><dd id="result-seed"></dd></div>
156 |             <div><dt>最大連鎖</dt><dd id="result-chain"></dd></div>
157 |             <div><dt>手数</dt><dd id="result-moves"></dd></div>
158 |             <div><dt>戻し</dt><dd id="result-undos"></dd></div>
159 |           </dl>
160 |           <div class="row">
161 |             <button type="button" class="btn primary" id="retry">リトライ <kbd>R</kbd></button>
162 |             <button type="button" class="btn" id="new-seed">新しいシード <kbd>N</kbd></button>
163 |           </div>
164 |           <button type="button" class="btn" id="result-undo" hidden>1手戻して続ける <kbd>Q</kbd></button>
165 |           <button type="button" class="btn ghost" id="to-menu">メニューへ <kbd>Esc</kbd></button>
166 |         </div>
167 |       </section>
168 |     </div>
```

- L149–151: 見出し（CLEAR / NEW RECORD / 窒息）、タイム、ベストとの差。
- L152–159: 詳細の数値。
- L160–165: リトライ、新しいシード、1手戻して続ける（窒息時だけ表示）、メニューへ。
- L168: アプリ全体の箱の終わり。

**L169–171**

```html
169 |     <script type="module" src="./src/main.ts"></script>
170 |   </body>
171 | </html>
```

- L169: プログラムを読み込む。`type="module"` は、`import` / `export` を使った書き方（ESモジュール）のファイルだという指定。開発中は Vite が `main.ts` をその場でブラウザが読める形に変換し、`npm run build` では全部を1つの JavaScript ファイルにまとめて、この行をそのファイルへの参照に書き換える。
- L170–171: ページの終わり。
