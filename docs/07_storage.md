# src/storage.ts

オプション設定とローカルランキングを、ブラウザの **localStorage** に保存・読み込みするファイル。
localStorage はブラウザがサイトごとに用意してくれる小さな保存場所で、ページを閉じても消えない。文字列しか保存できないので、オブジェクトは JSON 文字列に変換して保存する。

**L1–2**

```ts
  1 | import { configSignature } from './config';
  2 | 
```

ランキングを設定ごとに分けるため、設定の署名を作る関数を読み込む。

**L3–7**

```ts
  3 | export type ControlScheme = 'arrow' | 'direct';
  4 | export type SpawnMode = 'reset' | 'keep';
  5 | /** タッチ操作: 片手（タップ列＋フリック）／両手（左で列・右で向き）／ボタン（置き方22パターンのボタン） */
  6 | export type TouchScheme = 'single' | 'twohand' | 'buttons';
  7 | 
```

- `ControlScheme` … キーボード操作の方式。`'arrow'`（矢印キー）か `'direct'`（直接指定）。
- `SpawnMode` … 置いた後の次ペアの開始位置を戻すか引き継ぐか。`'reset'`（戻す）か `'keep'`（引き継ぐ）。列と向きで別々に使う。
- `TouchScheme` … タッチ操作の方式。`'single'`（片手: タップした列＋フリック）、`'twohand'`（両手: 左半分で列・右半分で向き）、`'buttons'`（ボタン: 置き方22パターンのボタン）。

文字列リテラルのユニオン型にしておくと、`'arow'` のような打ち間違いを TypeScript が見つけてくれる。

**L8–22**

```ts
  8 | export interface Options {
  9 |   controlScheme: ControlScheme;
 10 |   /** 置いた後の次ペアの列（3列目に戻す／引き継ぐ） */
 11 |   spawnCol: SpawnMode;
 12 |   /** 置いた後の次ペアの子ぷよの向き（上に戻す／引き継ぐ） */
 13 |   spawnRot: SpawnMode;
 14 |   touchScheme: TouchScheme;
 15 |   /** フリック判定のしきい値（px） */
 16 |   flickThreshold: number;
 17 |   /** 両手モードで1列動かすのに必要なスワイプ距離（px） */
 18 |   columnStep: number;
 19 |   /** 効果音の音量 0〜1 */
 20 |   sfxVolume: number;
 21 | }
 22 | 
```

`Options` … オプション画面で変えられる設定の形。
- `spawnCol` … 置いた後、次のペアを3列目に戻すか、直前の列を引き継ぐか。
- `spawnRot` … 置いた後、次のペアの子ぷよを上に戻すか、直前の向きを引き継ぐか。列とは別に選べる。
- `columnStep` … 両手モードで、左の指を何px横に動かすと1列動くか。


**L23–33**

```ts
 23 | export interface RunRecord {
 24 |   timeMs: number;
 25 |   seed: number;
 26 |   maxChain: number;
 27 |   moves: number;
 28 |   /** 1手戻した回数 */
 29 |   undos?: number;
 30 |   date: string;
 31 |   controlScheme: ControlScheme;
 32 | }
 33 | 
```

`RunRecord` … ランキングに残す1回分の記録。
- `undos?: number` の `?` は「無くてもよい」。1手戻す機能を入れる前に保存された記録には `undos` がないので、省略可能にしてある。
- `date` … 日時。`new Date().toISOString()` で作る `"2026-11-01T14:30:00.000Z"` 形式の文字列。

**L34–38**

```ts
 34 | const OPTIONS_KEY = 'dopapuyo.options.v1';
 35 | // 配ぷよの作り方を変えるたびに版を上げ、前の記録とは分けて保存する（v3: チャレンジモード風の配ぷよ）
 36 | const RECORDS_KEY = 'dopapuyo.records.v3';
 37 | const RANK_LIMIT = 10;
 38 | 
```

保存に使う名前（キー）と、ランキングに残す件数。
キー名に `.v1` を付けておくと、将来保存形式を変えたときに `.v2` にして古いデータと混ざらないようにできる。
記録は配ぷよの作り方を変えるたびに版を上げている（今は `.v3`、チャレンジモード風の配ぷよ）。同じシード番号でも配ぷよが変わるので、それ以前の記録とはタイムを比べられないためだ（古い記録は消さずに残るが、表示はされない）。

**L39–48**

```ts
 39 | export const DEFAULT_OPTIONS: Options = {
 40 |   controlScheme: 'arrow',
 41 |   spawnCol: 'reset',
 42 |   spawnRot: 'reset',
 43 |   touchScheme: 'single',
 44 |   flickThreshold: 24,
 45 |   columnStep: 32,
 46 |   sfxVolume: 0.7,
 47 | };
 48 | 
```

オプションの初期値。


## 読み書きの土台

**L49–56**

```ts
 49 | function read<T>(key: string, fallback: T): T {
 50 |   try {
 51 |     const raw = localStorage.getItem(key);
 52 |     return raw ? (JSON.parse(raw) as T) : fallback;
 53 |   } catch {
 54 |     return fallback;
 55 |   }
 56 | }
```

`read<T>(key, fallback)` … localStorage から読んで JSON として復元する。
- `<T>` は**ジェネリクス**。呼ぶ側が `read<Options>(...)` のように「何の型として読むか」を指定できる。
- L51: 保存されていなければ `getItem` は `null` を返す。
- L52: あれば `JSON.parse` でオブジェクトに戻す。なければ `fallback`（代わりの値）を返す。
- `try { ... } catch { ... }` … 中でエラーが起きたら `catch` に飛ぶ。プライベートモードや、保存が禁止された環境では localStorage を触るだけでエラーになることがあるので、そのときも `fallback` を返してゲームを止めない。

**L57–65**

```ts
 57 | 
 58 | function write(key: string, value: unknown): void {
 59 |   try {
 60 |     localStorage.setItem(key, JSON.stringify(value));
 61 |   } catch {
 62 |     // 保存できない環境（プライベートモードなど）では記録しない
 63 |   }
 64 | }
 65 | 
```

`write(key, value)` … `JSON.stringify` でオブジェクトを文字列にして保存する。失敗しても何もしない（記録が残らないだけでゲームは続けられる）。
`value: unknown` は「何でも受け取る、ただし中身は確かめずには使えない」型。保存するだけなので中身を気にしない。

**L66–73**

```ts
 66 | export function loadOptions(): Options {
 67 |   const saved = read<Partial<Options> & { spawnMode?: SpawnMode }>(OPTIONS_KEY, {});
 68 |   // 列と向きを別々に設定できるようになる前の保存形式（spawnMode が両方を兼ねていた）
 69 |   const { spawnMode, ...rest } = saved;
 70 |   const legacy = spawnMode ? { spawnCol: spawnMode, spawnRot: spawnMode } : {};
 71 |   return { ...DEFAULT_OPTIONS, ...legacy, ...rest };
 72 | }
 73 | 
```

`loadOptions()` … 保存されたオプションを読み込む。
`{ ...DEFAULT_OPTIONS, ...保存された値 }` は、**スプレッド構文**でオブジェクトを合成する書き方。後に書いたほうが優先されるので、「初期値の上に、保存されている項目だけ上書き」になる。
将来オプション項目を増やしても、古い保存データには無い項目が初期値で埋まる。`Partial<Options>` は「Options の項目がそろっていなくてもよい」型。
- L69: 以前は列と向きをまとめて `spawnMode` という1つの項目で保存していた。`const { spawnMode, ...rest } = saved` は、`spawnMode` だけ取り出し、残りを `rest` にまとめる書き方（分割代入）。
- L70: 古い `spawnMode` があれば、その値を列と向きの両方に引き継ぐ。
- L71: 初期値 → 古い形式からの引き継ぎ → 新しい形式で保存された値、の順に上書きする。次に保存するときは新しい形式で書かれるので、`spawnMode` は消える。


**L74–77**

```ts
 74 | export function saveOptions(o: Options): void {
 75 |   write(OPTIONS_KEY, o);
 76 | }
 77 | 
```

`saveOptions()` … オプションを保存する。

## ランキングの保存形式

**L78–84**

```ts
 78 | interface RecordStore {
 79 |   /** key: `${signature}|${target}` → 上位記録 */
 80 |   top: Record<string, RunRecord[]>;
 81 |   /** key: `${signature}|${target}|${seed}` → そのシードの自己ベスト */
 82 |   seedBest: Record<string, RunRecord>;
 83 | }
 84 | 
```

ランキング全体を1つのオブジェクトにまとめて保存する。
- `top` … 「設定の署名|目標点」をキーに、上位10件の配列。例: `"default|100000"`。
- `seedBest` … 「設定の署名|目標点|シード」をキーに、そのシードでの自己ベスト1件。
- `Record<string, RunRecord[]>` は「キーが文字列、値が記録の配列のオブジェクト」。

**L85–89**

```ts
 85 | function loadStore(): RecordStore {
 86 |   const s = read<Partial<RecordStore>>(RECORDS_KEY, {});
 87 |   return { top: s.top ?? {}, seedBest: s.seedBest ?? {} };
 88 | }
 89 | 
```

`loadStore()` … 保存されたランキングを読む。項目が欠けていても `?? {}` で空のオブジェクトにして、必ず両方そろった形で返す。

**L90–92**

```ts
 90 | const topKey = (target: number) => `${configSignature()}|${target}`;
 91 | const seedKey = (target: number, seed: number) => `${configSignature()}|${target}|${seed}`;
 92 | 
```

保存キーを作る関数。`` `${A}|${B}` `` は**テンプレート文字列**で、バッククォートの中に `${}` で値を埋め込める。
`configSignature()` を毎回呼ぶので、設定定数を変えると自動的に別のキーになり、別枠のランキングになる。

**L93–96**

```ts
 93 | export function getRanking(target: number): RunRecord[] {
 94 |   return loadStore().top[topKey(target)] ?? [];
 95 | }
 96 | 
```

`getRanking(target)` … その目標点の上位記録。まだなければ空配列。

**L97–100**

```ts
 97 | export function getSeedBest(target: number, seed: number): RunRecord | undefined {
 98 |   return loadStore().seedBest[seedKey(target, seed)];
 99 | }
100 | 
```

`getSeedBest(target, seed)` … そのシードの自己ベスト。現在の画面では使っていない（結果画面では `submitRecord` の戻り値を使っている）。シード別のベストを画面に出したくなったとき用に残している。

**L101–109**

```ts
101 | export interface SubmitResult {
102 |   /** ランキング内の順位（1始まり）。圏外なら null */
103 |   rank: number | null;
104 |   /** 記録前の全体ベスト */
105 |   prevBest?: RunRecord;
106 |   /** 記録前のこのシードのベスト */
107 |   prevSeedBest?: RunRecord;
108 | }
109 | 
```

`SubmitResult` … 記録を登録したときの結果。順位と、登録**前**のベスト（全体・シード別）。結果画面の「ベスト −0:01.23」のような差分表示に使う。

## 記録の登録 submitRecord

**L110–117**

```ts
110 | export function submitRecord(target: number, rec: RunRecord): SubmitResult {
111 |   const store = loadStore();
112 |   const tk = topKey(target);
113 |   const sk = seedKey(target, rec.seed);
114 |   const list = store.top[tk] ?? [];
115 |   const prevBest = list[0];
116 |   const prevSeedBest = store.seedBest[sk];
117 | 
```

- L111–113: 保存データとキーを用意。
- L114: 今の上位記録。
- L115: 配列は速い順に並べてあるので、先頭が今までのベスト。
- L116: このシードの今までのベスト。

**L118–125**

```ts
118 |   const next = [...list, rec].sort((a, b) => a.timeMs - b.timeMs).slice(0, RANK_LIMIT);
119 |   const idx = next.indexOf(rec);
120 |   store.top[tk] = next;
121 |   if (!prevSeedBest || rec.timeMs < prevSeedBest.timeMs) store.seedBest[sk] = rec;
122 |   write(RECORDS_KEY, store);
123 |   return { rank: idx >= 0 ? idx + 1 : null, prevBest, prevSeedBest };
124 | }
125 | 
```

- L118: 既存の記録に今回の記録を加え、タイムの小さい順に並べ替え（`sort` に「a − b」を返す関数を渡すと小さい順）、上位10件だけ残す（`slice(0, 10)`）。
- L119: 今回の記録が何番目に入ったか。10件からあふれていれば `-1`。
- L120: 上位記録を更新。
- L121: シード別ベストは、まだ無いか、今回のほうが速ければ更新。`!prevSeedBest` は「無ければ」。
- L122: まとめて保存。
- L123: 順位は人間向けに1から数える。圏外なら `null`。

**L126–128**

```ts
126 | export function clearRecords(): void {
127 |   write(RECORDS_KEY, { top: {}, seedBest: {} });
128 | }
```

`clearRecords()` … 記録をすべて消す（空の状態で上書き保存）。
