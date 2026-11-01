# tsconfig.json

TypeScript の設定ファイル。どの程度厳しくチェックするか、どのファイルを対象にするかを決める。

**L1–6**

```json
 1 | {
 2 |   "compilerOptions": {
 3 |     "target": "ES2022",
 4 |     "module": "ESNext",
 5 |     "moduleResolution": "Bundler",
 6 |     "lib": ["ES2022", "DOM", "DOM.Iterable"],
```

- `target: ES2022` … どの版の JavaScript の書き方まで使ってよいか。2022年版まで。
- `module: ESNext` … `import` / `export` をそのまま残す。
- `moduleResolution: Bundler` … `import` の読み込み先を、Vite のようなバンドラー（ファイルをまとめる道具）と同じ規則で探す。
- `lib` … 使ってよい標準機能。`DOM` はブラウザの機能（`document` や canvas など）。

**L7–12**

```json
 7 |     "strict": true,
 8 |     "noUnusedLocals": true,
 9 |     "noUnusedParameters": true,
10 |     "noFallthroughCasesInSwitch": true,
11 |     "isolatedModules": true,
12 |     "skipLibCheck": true,
```

チェックの厳しさ。
- `strict: true` … 厳しいチェックを全部オンにする。特に「null かもしれない値をそのまま使う」ミスを見つけてくれる。
- `noUnusedLocals` / `noUnusedParameters` … 使っていない変数や引数があればエラー。消し忘れに気づける。
- `noFallthroughCasesInSwitch` … `switch` の `case` で `return` や `break` を書き忘れて、次の `case` まで実行が続いてしまうのを防ぐ。
- `isolatedModules` … ファイルを1つずつ単独で変換しても問題ない書き方を強制する（Vite はファイルごとに変換するため）。
- `skipLibCheck` … 道具側の型定義ファイルのチェックを省いて速くする。

**L13–16**

```json
13 |     "noEmit": true
14 |   },
15 |   "include": ["src", "tests", "vite.config.ts"]
16 | }
```

- `noEmit` … TypeScript 自身は JavaScript ファイルを出力しない（変換は Vite が行うので、TypeScript はチェック専用）。
- `include` … チェック対象のフォルダとファイル。
