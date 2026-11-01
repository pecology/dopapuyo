# vite.config.ts

Vite（開発サーバーとビルドの道具）の設定ファイル。

**L1–4**

```ts
 1 | import { defineConfig } from 'vite';
 2 | 
 3 | // GitHub Pages のサブパス（/<repo>/）でも動くよう相対パスで出力する
 4 | export default defineConfig({
```

- L1: 設定を書くための関数 `defineConfig` を読み込む。これで包むと、設定項目の補完やチェックが効く。
- L4: `export default` … このファイルの「メインの値」として設定を書き出す。

**L5–10**

```ts
 5 |   base: './',
 6 |   build: {
 7 |     outDir: 'dist',
 8 |     target: 'es2022',
 9 |   },
10 | });
```

- `base: './'` … ビルドしたファイル同士の参照を相対パスにする。GitHub Pages では `https://ユーザー名.github.io/リポジトリ名/` のように1段深い場所で公開されるので、`/` から始まる絶対パスだとファイルが見つからなくなる。相対パスならどこに置いても動く。
- `outDir: 'dist'` … ビルド結果を入れるフォルダ。
- `target: 'es2022'` … 出力する JavaScript の版。
