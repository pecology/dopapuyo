# package.json

プロジェクトの基本情報と、使う道具（パッケージ）、よく使うコマンドを書いたファイル。`npm install` はこれを読んで必要な道具を `node_modules` フォルダに入れる。JSON 形式なので、コメントは書けない。

**L1–6**

```json
 1 | {
 2 |   "name": "dopapuyo",
 3 |   "private": true,
 4 |   "version": "0.1.0",
 5 |   "description": "上級者向け連鎖スコアアタック（非公式ファンメイド）",
 6 |   "type": "module",
```

- `name` … プロジェクト名。
- `private: true` … npm の公開サイトにうっかり公開しないための指定。
- `version` / `description` … 版数と説明。
- `"type": "module"` … このプロジェクトの JavaScript ファイルを、`import` / `export` を使う形式（ESモジュール）として扱う。

## コマンド scripts

**L7–13**

```json
 7 |   "scripts": {
 8 |     "dev": "vite",
 9 |     "build": "tsc --noEmit && vite build",
10 |     "preview": "vite preview",
11 |     "test": "vitest run",
12 |     "typecheck": "tsc --noEmit"
13 |   },
```

`npm run 名前` で実行できるコマンドの一覧（`test` だけは `npm test` でも動く）。
- `dev` … 開発サーバーを起動。ファイルを保存すると即座にブラウザに反映される。
- `build` … まず `tsc --noEmit` で型のチェックだけを行い（`--noEmit` はファイルを出力しない指定）、問題なければ `vite build` で公開用のファイルを `dist` フォルダに作る。`&&` は「前が成功したら次を実行」。
- `preview` … `build` で作ったものを、手元で確認するためのサーバー。
- `test` … テストを1回実行（`vitest` だけだとファイルの変更を監視し続けるので、`run` を付けて1回で終わらせる）。
- `typecheck` … 型のチェックだけ。

## 使う道具 devDependencies

**L14–20**

```json
14 |   "devDependencies": {
15 |     "typescript": "^5.8.3",
16 |     "vite": "^6.3.5",
17 |     "vite-plugin-pwa": "^1.3.0",
18 |     "vitest": "^3.2.4"
19 |   }
20 | }
```

開発に使う道具とその版数。`dev` 付きなのは、完成したゲームには含まれず、作るときだけ使う道具だから。
- `typescript` … TypeScript のチェックをする道具。
- `vite` … 開発サーバーとビルドの道具。
- `vite-plugin-pwa` … オフラインで遊べるようにする（PWA）ための Vite の追加機能。ビルド時に Service Worker とマニフェストを作る。
- `vitest` … テストの道具。
- `^5.8.3` の `^` は「5.x.x の範囲で、5.8.3 以上の最新」を入れてよいという意味。

