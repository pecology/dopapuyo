# src/vite-env.d.ts

TypeScript に「こういうものがある」と教えるだけの宣言ファイル（`.d.ts`）。中身のコードは実行されない。

**L1–2**

```ts
1 | // PWA の登録用モジュール（vite-plugin-pwa が用意する）の型。/// の行はファイルの先頭に書く必要がある
2 | /// <reference types="vite-plugin-pwa/client" />
```

`main.ts` は `virtual:pwa-register` という、ビルドの道具（vite-plugin-pwa）がその場で用意するモジュールを読み込んでいる。TypeScript はこのモジュールを知らないので、vite-plugin-pwa が用意している型の説明を `/// <reference types="..." />` で読み込む。
`///` で始まるこの書き方は、ファイルの先頭（コメント以外のコードより前）に書かないと効かない。

**L3–5**

```ts
3 | 
4 | // CSS を import できるようにする（Vite が処理する）
5 | declare module '*.css';
```

`main.ts` の1行目で `import './style.css'` と CSS を読み込んでいるが、TypeScript は本来 CSS ファイルを知らないのでエラーになる。
`declare module '*.css';` で「`.css` で終わるものは読み込んでよい」と宣言している。実際に CSS を処理するのは Vite。
