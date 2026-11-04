# vite.config.ts

Vite（開発サーバーとビルドの道具）の設定ファイル。オフラインで遊べるようにする（PWA）設定もここに書く。

**L1–5**

```ts
 1 | import { defineConfig } from 'vite';
 2 | import { VitePWA } from 'vite-plugin-pwa';
 3 | 
 4 | // GitHub Pages のサブパス（/<repo>/）でも動くよう相対パスで出力する
 5 | export default defineConfig({
```

- L1: 設定を書くための関数 `defineConfig` を読み込む。これで包むと、設定項目の補完やチェックが効く。
- L2: PWA 用の追加機能（vite-plugin-pwa）を読み込む。
- L5: `export default` … このファイルの「メインの値」として設定を書き出す。

**L6–10**

```ts
 6 |   base: './',
 7 |   build: {
 8 |     outDir: 'dist',
 9 |     target: 'es2022',
10 |   },
```

- `base: './'` … ビルドしたファイル同士の参照を相対パスにする。GitHub Pages では `https://ユーザー名.github.io/リポジトリ名/` のように1段深い場所で公開されるので、`/` から始まる絶対パスだとファイルが見つからなくなる。相対パスならどこに置いても動く。
- `outDir: 'dist'` … ビルド結果を入れるフォルダ。
- `target: 'es2022'` … 出力する JavaScript の版。

## オフライン対応（PWA）

ビルドすると、ゲームのファイルを端末に保存する Service Worker（`sw.js`）と、アプリ名やアイコンを書いたマニフェスト（`manifest.webmanifest`）が `dist` に作られる。

**L11–16**

```ts
11 |   plugins: [
12 |     // PWA: 一度開けば、以後はオフラインでも遊べるようにする
13 |     VitePWA({
14 |       // 新しい版は勝手に切り替えず、main.ts がメニュー画面のときに切り替える
15 |       registerType: 'prompt',
16 |       injectRegister: false,
```

- `plugins` … Vite に足す追加機能の一覧。
- `registerType: 'prompt'` … 新しい版が届いても、勝手には切り替えない。切り替えるタイミングは `main.ts` が決める（メニュー画面にいるとき）。
- `injectRegister: false` … Service Worker を登録するコードを自動では入れない。`main.ts` で自分で登録する。

**L17–33**

```ts
17 |       manifest: {
18 |         name: 'どぱぷよ',
19 |         short_name: 'どぱぷよ',
20 |         description: '上級者向け連鎖スコアアタック（非公式ファンメイド作品）',
21 |         lang: 'ja',
22 |         start_url: './',
23 |         scope: './',
24 |         display: 'standalone',
25 |         orientation: 'portrait',
26 |         background_color: '#0e0d1a',
27 |         theme_color: '#0e0d1a',
28 |         icons: [
29 |           { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
30 |           { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
31 |           { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
32 |         ],
33 |       },
```

**マニフェスト**。ホーム画面に追加したときの名前やアイコン、見た目を決める。
- `name` / `short_name` … アプリ名（短いほうはアイコンの下に出る）。
- `start_url` / `scope` … 起動したときに開くページと、アプリとして扱う範囲。`'./'` なので `/dopapuyo/` 以下になり、同じ `pecology.github.io` で公開している他のページには影響しない。
- `display: 'standalone'` … アプリとして起動したとき、アドレスバーなどを出さない。
- `orientation: 'portrait'` … 縦画面。
- `background_color` / `theme_color` … 起動中の画面とバーの色。ゲームの背景と同じ暗い色。
- `icons` … アイコン画像（`public/icons/`）。`purpose: 'maskable'` は、Android などがアイコンを丸や角丸に切り抜いても絵が欠けないことを示す（ぷよは中央に寄せて描いてある）。

**L34–60**

```ts
34 |       workbox: {
35 |         globPatterns: ['**/*.{html,js,css,png,webmanifest}'],
36 |         // 文字のフォント（Google Fonts）も一度読んだら端末に保存しておく。
37 |         // 日本語フォントは文字の範囲ごとに細かいファイルに分かれているので、フォント本体は多めに保存できるようにする
38 |         runtimeCaching: [
39 |           {
40 |             urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
41 |             handler: 'StaleWhileRevalidate',
42 |             options: {
43 |               cacheName: 'google-fonts-css',
44 |               cacheableResponse: { statuses: [0, 200] },
45 |             },
46 |           },
47 |           {
48 |             urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
49 |             handler: 'CacheFirst',
50 |             options: {
51 |               cacheName: 'google-fonts-files',
52 |               expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
53 |               cacheableResponse: { statuses: [0, 200] },
54 |             },
55 |           },
56 |         ],
57 |       },
58 |     }),
59 |   ],
60 | });
```

**workbox**（Service Worker を作る道具）の設定。
- L35: `globPatterns` … ビルド結果のうち、端末に保存しておくファイルの種類。HTML・JavaScript・CSS・画像・マニフェスト。
- L36–56: `runtimeCaching` … 遊んでいる途中で読み込んだファイルを保存するルール。文字のフォントは Google Fonts から読み込んでいるので、オフラインでも同じ書体で表示できるよう保存しておく。
  - L39–46: フォントの指定を書いた CSS（`fonts.googleapis.com`）。`StaleWhileRevalidate` は「保存してあるものをすぐ使い、裏で新しいものを取ってきて差し替える」。
  - L47–55: フォント本体（`fonts.gstatic.com`）。`CacheFirst` は「保存してあればそれを使い、なければ取りに行く」。日本語のフォントは文字の範囲ごとに細かいファイルに分かれているので、300個まで、1年間保存する。
  - `cacheableResponse: { statuses: [0, 200] }` … 別のサイトから読み込んだファイルは中身の状態が見えない（ステータス 0）ので、それも保存してよいと指定する。
- フォントは、Service Worker が動き始めた後に読み込んだものから保存される。初めて開いたときはまだ保存されないので、オンラインのうちにもう一度開いておくと、オフラインでも同じ書体になる。
