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

**L24–45**

```html
 24 | 
 25 |       <aside class="hud" id="hud">
 26 |         <div class="hud-brand">どぱぷよ</div>
 27 |         <div class="hud-time">
 28 |           <span class="label">TIME</span>
 29 |           <span class="value" id="time">0:00.00</span>
 30 |           <span class="penalty" id="penalty" hidden></span>
 31 |         </div>
 32 |         <div class="hud-score">
 33 |           <span class="label">SCORE</span>
 34 |           <span class="value" id="score">0</span>
 35 |           <span class="target">/ <span id="target">100,000</span></span>
 36 |           <div class="bar"><div class="bar-fill" id="bar"></div></div>
 37 |         </div>
 38 |         <dl class="hud-meta">
 39 |           <div><dt>SEED</dt><dd id="seed">-</dd></div>
 40 |           <div><dt>MAX</dt><dd id="maxchain">0連鎖</dd></div>
 41 |           <div><dt>手数</dt><dd id="moves">0</dd></div>
 42 |         </dl>
 43 |         <div class="hud-keys" id="keyhelp"></div>
 44 |       </aside>
 45 | 
```

上部（PCでは右側）の情報表示。`aside` は「補足的な内容」を表す要素。
- L26: PCのときだけ出るロゴ。
- L27–31: タイム。`penalty` はペナルティ合計の表示で、1手戻すまでは隠しておく。
- L32–37: スコア。`/ 100,000` の目標点と、進み具合のバー（`bar` の中の `bar-fill` の幅を変えて伸ばす）。
- L38–42: シード・最大連鎖・手数。`dl`（説明リスト）は「見出し `dt` と内容 `dd` の組」を並べるための要素。
- L43: PCのときだけ出る操作説明。中身は `main.ts` が書き込む。

## メニュー画面

**L46–56**

```html
 46 |       <!-- メニュー -->
 47 |       <section class="overlay" id="menu">
 48 |         <div class="panel menu">
 49 |           <h1 class="logo">どぱぷよ</h1>
 50 |           <p class="tagline">上級者向け 連鎖スコアアタック</p>
 51 | 
 52 |           <div class="field-group">
 53 |             <div class="group-label">目標点</div>
 54 |             <div class="seg" id="targets" role="radiogroup" aria-label="目標点"></div>
 55 |           </div>
 56 | 
```

画面の上に重ねて表示する画面（オーバーレイ）。`section` はひとまとまりの区画。
- L49: ロゴ。`h1` はページの一番大きな見出し。
- L52–55: 目標点のボタンを入れる場所。ボタン自体は `main.ts` が作る。`role="radiogroup"` は「この中から1つを選ぶ」グループだと読み上げソフトに伝える。

**L57–67**

```html
 57 |           <div class="field-group">
 58 |             <div class="group-label">シード（配ぷよ）</div>
 59 |             <div class="seed-row">
 60 |               <div class="seg" role="radiogroup" aria-label="シードの選び方">
 61 |                 <button type="button" class="seg-btn" id="seed-random" aria-pressed="true">ランダム</button>
 62 |                 <button type="button" class="seg-btn" id="seed-fixed" aria-pressed="false">番号指定</button>
 63 |               </div>
 64 |               <input id="seed-input" type="number" inputmode="numeric" min="1" max="65536" placeholder="1〜65536" disabled />
 65 |             </div>
 66 |           </div>
 67 | 
```

シードの選び方。ランダム／番号指定のボタンと、番号の入力欄。
- `aria-pressed` … ボタンが押された（選ばれた）状態か。CSS がこれを見て見た目を変える。
- L64: 数字の入力欄。`inputmode="numeric"` でスマホでは数字キーボードが出る。最初は `disabled`（入力できない）。

**L68–78**

```html
 68 |           <button type="button" class="btn primary" id="start">スタート <kbd>Enter</kbd></button>
 69 |           <div class="row">
 70 |             <button type="button" class="btn" id="open-ranking">ランキング</button>
 71 |             <button type="button" class="btn" id="open-options">オプション</button>
 72 |           </div>
 73 | 
 74 |           <div class="howto" id="howto"></div>
 75 |           <p class="disclaimer">非公式のファンメイド作品です。株式会社セガとは関係ありません。</p>
 76 |         </div>
 77 |       </section>
 78 | 
```

- L68: スタートボタン。`<kbd>` はキーボードのキーを表す要素。
- L69–72: ランキングとオプションのボタン。
- L74: 遊び方の説明（`main.ts` が書き込む）。
- L75: 非公式であることの表示。

## オプション画面

**L79–129**

```html
 79 |       <!-- オプション -->
 80 |       <section class="overlay" id="options" hidden>
 81 |         <div class="panel">
 82 |           <h2>オプション</h2>
 83 |           <div class="field-group">
 84 |             <div class="group-label">キーボード操作</div>
 85 |             <div class="seg" id="opt-scheme">
 86 |               <button type="button" class="seg-btn" data-value="arrow">矢印キー</button>
 87 |               <button type="button" class="seg-btn" data-value="direct">直接指定</button>
 88 |             </div>
 89 |           </div>
 90 |           <div class="field-group">
 91 |             <div class="group-label">次のペアの列</div>
 92 |             <div class="seg" id="opt-spawn-col">
 93 |               <button type="button" class="seg-btn" data-value="reset">3列目に戻す</button>
 94 |               <button type="button" class="seg-btn" data-value="keep">直前の列を引き継ぐ</button>
 95 |             </div>
 96 |           </div>
 97 |           <div class="field-group">
 98 |             <div class="group-label">次のペアの子ぷよの向き</div>
 99 |             <div class="seg" id="opt-spawn-rot">
100 |               <button type="button" class="seg-btn" data-value="reset">上に戻す</button>
101 |               <button type="button" class="seg-btn" data-value="keep">直前の向きを引き継ぐ</button>
102 |             </div>
103 |           </div>
104 |           <div class="field-group">
105 |             <div class="group-label">タッチ操作</div>
106 |             <div class="seg" id="opt-touch">
107 |               <button type="button" class="seg-btn" data-value="single">片手（タップ＋フリック）</button>
108 |               <button type="button" class="seg-btn" data-value="twohand">両手（左で列・右で向き）</button>
109 |             </div>
110 |           </div>
111 |           <div class="field-group" id="opt-step-group">
112 |             <label class="group-label" for="opt-step">両手モードで1列動かす距離 <output id="opt-step-out"></output></label>
113 |             <input id="opt-step" type="range" min="12" max="80" step="2" />
114 |           </div>
115 |           <div class="field-group">
116 |             <label class="group-label" for="opt-flick">フリック判定の距離 <output id="opt-flick-out"></output></label>
117 |             <input id="opt-flick" type="range" min="8" max="64" step="2" />
118 |           </div>
119 |           <div class="field-group">
120 |             <label class="group-label" for="opt-volume">効果音 <output id="opt-volume-out"></output></label>
121 |             <input id="opt-volume" type="range" min="0" max="1" step="0.05" />
122 |           </div>
123 |           <div class="row">
124 |             <button type="button" class="btn danger" id="clear-records">記録をすべて削除</button>
125 |             <button type="button" class="btn primary" id="close-options">閉じる</button>
126 |           </div>
127 |         </div>
128 |       </section>
129 | 
```

最初は `hidden`。
- L85–88, L92–95, L99–102, L106–109: 選択式のボタン（キーボード操作・次のペアの列・次のペアの子ぷよの向き・タッチ操作）。`data-value` 属性に設定値を書いておき、`main.ts` が `dataset.value` で読む。
- L111–114: 両手モードで1列動かす距離のスライダー（`id="opt-step-group"` の囲みごと）。両手モードのときだけ表示する。
- L116–117: フリック判定の距離のスライダー（`type="range"`）。`label` の `for="opt-flick"` で、文字を押してもスライダーが操作対象になる。`output` は計算結果などを表示する要素で、今の値（`24px` など）を出す。
- L120–121: 効果音の音量スライダー。0〜1 を 0.05 刻み。
- L123–126: 記録削除と閉じるボタン。


## ランキング画面

**L130–147**

```html
130 |       <!-- ランキング -->
131 |       <section class="overlay" id="ranking" hidden>
132 |         <div class="panel wide">
133 |           <h2>ランキング</h2>
134 |           <div class="seg" id="rank-tabs"></div>
135 |           <p class="note" id="rank-note" hidden>設定定数がデフォルトと違うため、別枠の記録を表示しています。</p>
136 |           <div class="table-wrap">
137 |             <table class="rank-table">
138 |               <thead>
139 |                 <tr><th>#</th><th>タイム</th><th>シード</th><th>最大連鎖</th><th>手数</th><th>戻し</th><th>日付</th></tr>
140 |               </thead>
141 |               <tbody id="rank-body"></tbody>
142 |             </table>
143 |           </div>
144 |           <button type="button" class="btn primary" id="close-ranking">閉じる</button>
145 |         </div>
146 |       </section>
147 | 
```

- L134: 目標点ごとのタブ（`main.ts` が作る）。
- L135: 設定定数を変えているときの注意書き。
- L136–143: 記録の表。`thead` が見出し行、`tbody` が中身（`main.ts` が行を作って入れる）。`table-wrap` で包むのは、スマホで表が横にはみ出したときにその部分だけ横スクロールさせるため。

## 結果画面

**L148–170**

```html
148 |       <!-- 結果 -->
149 |       <section class="overlay" id="result" hidden>
150 |         <div class="panel result">
151 |           <p class="result-kind" id="result-kind">CLEAR</p>
152 |           <p class="result-time" id="result-time">0:00.00</p>
153 |           <p class="result-delta" id="result-delta"></p>
154 |           <dl class="result-meta">
155 |             <div><dt>目標点</dt><dd id="result-target"></dd></div>
156 |             <div><dt>スコア</dt><dd id="result-score"></dd></div>
157 |             <div><dt>シード</dt><dd id="result-seed"></dd></div>
158 |             <div><dt>最大連鎖</dt><dd id="result-chain"></dd></div>
159 |             <div><dt>手数</dt><dd id="result-moves"></dd></div>
160 |             <div><dt>戻し</dt><dd id="result-undos"></dd></div>
161 |           </dl>
162 |           <div class="row">
163 |             <button type="button" class="btn primary" id="retry">リトライ <kbd>R</kbd></button>
164 |             <button type="button" class="btn" id="new-seed">新しいシード <kbd>N</kbd></button>
165 |           </div>
166 |           <button type="button" class="btn" id="result-undo" hidden>1手戻して続ける <kbd>Q</kbd></button>
167 |           <button type="button" class="btn ghost" id="to-menu">メニューへ <kbd>Esc</kbd></button>
168 |         </div>
169 |       </section>
170 |     </div>
```

- L151–153: 見出し（CLEAR / NEW RECORD / 窒息）、タイム、ベストとの差。
- L154–161: 詳細の数値。
- L162–167: リトライ、新しいシード、1手戻して続ける（窒息時だけ表示）、メニューへ。
- L170: アプリ全体の箱の終わり。

**L171–173**

```html
171 |     <script type="module" src="./src/main.ts"></script>
172 |   </body>
173 | </html>
```

- L171: プログラムを読み込む。`type="module"` は、`import` / `export` を使った書き方（ESモジュール）のファイルだという指定。開発中は Vite が `main.ts` をその場でブラウザが読める形に変換し、`npm run build` では全部を1つの JavaScript ファイルにまとめて、この行をそのファイルへの参照に書き換える。
- L172–173: ページの終わり。
