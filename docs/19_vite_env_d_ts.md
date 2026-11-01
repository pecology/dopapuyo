# src/vite-env.d.ts

TypeScript に「こういうものがある」と教えるだけの宣言ファイル（`.d.ts`）。中身のコードは実行されない。

**L1–2**

```ts
1 | // CSS を import できるようにする（Vite が処理する）
2 | declare module '*.css';
```

`main.ts` の1行目で `import './style.css'` と CSS を読み込んでいるが、TypeScript は本来 CSS ファイルを知らないのでエラーになる。
`declare module '*.css';` で「`.css` で終わるものは読み込んでよい」と宣言している。実際に CSS を処理するのは Vite。
