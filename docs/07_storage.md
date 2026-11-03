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
  5 | /** タッチ操作: 片手（タップ列＋フリック）／両手（左で列・右で向き） */
  6 | export type TouchScheme = 'single' | 'twohand';
  7 | 
```

- `ControlScheme` … キーボード操作の方式。`'arrow'`（矢印キー）か `'direct'`（直接指定）。
- `SpawnMode` … 置いた後の次ペアの開始位置。`'reset'`（3列目・子が上に戻す）か `'keep'`（引き継ぐ）。
- `TouchScheme` … タッチ操作の方式。`'single'`（片手: タップした列＋フリック）か `'twohand'`（両手: 左半分で列・右半分で向き）。

文字列リテラルのユニオン型にしておくと、`'arow'` のような打ち間違いを TypeScript が見つけてくれる。

**L8–19**

```ts
  8 | export interface Options {
  9 |   controlScheme: ControlScheme;
 10 |   spawnMode: SpawnMode;
 11 |   touchScheme: TouchScheme;
 12 |   /** フリック判定のしきい値（px） */
 13 |   flickThreshold: number;
 14 |   /** 両手モードで1列動かすのに必要なスワイプ距離（px） */
 15 |   columnStep: number;
 16 |   /** 効果音の音量 0〜1 */
 17 |   sfxVolume: number;
 18 | }
 19 | 
```

`Options` … オプション画面で変えられる設定の形。
- `columnStep` … 両手モードで、左の指を何px横に動かすと1列動くか。

**L20–30**

```ts
 20 | export interface RunRecord {
 21 |   timeMs: number;
 22 |   seed: number;
 23 |   maxChain: number;
 24 |   moves: number;
 25 |   /** 1手戻した回数 */
 26 |   undos?: number;
 27 |   date: string;
 28 |   controlScheme: ControlScheme;
 29 | }
 30 | 
```

`RunRecord` … ランキングに残す1回分の記録。
- `undos?: number` の `?` は「無くてもよい」。1手戻す機能を入れる前に保存された記録には `undos` がないので、省略可能にしてある。
- `date` … 日時。`new Date().toISOString()` で作る `"2026-11-01T14:30:00.000Z"` 形式の文字列。

**L31–35**

```ts
 31 | const OPTIONS_KEY = 'dopapuyo.options.v1';
 32 | // v2: 配ぷよをぷよぷよeスポーツ方式に変えたので、v1 の記録とは分けて保存する
 33 | const RECORDS_KEY = 'dopapuyo.records.v2';
 34 | const RANK_LIMIT = 10;
 35 | 
```

保存に使う名前（キー）と、ランキングに残す件数。
キー名に `.v1` を付けておくと、将来保存形式を変えたときに `.v2` にして古いデータと混ざらないようにできる。
記録は配ぷよの生成方式をぷよぷよeスポーツ方式に変えたときに `.v2` にした。同じシード番号でも配ぷよが変わったので、それ以前の記録とはタイムを比べられないためだ（古い記録は消さずに残るが、表示はされない）。

**L36–44**

```ts
 36 | export const DEFAULT_OPTIONS: Options = {
 37 |   controlScheme: 'arrow',
 38 |   spawnMode: 'reset',
 39 |   touchScheme: 'single',
 40 |   flickThreshold: 24,
 41 |   columnStep: 32,
 42 |   sfxVolume: 0.7,
 43 | };
 44 | 
```

オプションの初期値。

## 読み書きの土台

**L45–52**

```ts
 45 | function read<T>(key: string, fallback: T): T {
 46 |   try {
 47 |     const raw = localStorage.getItem(key);
 48 |     return raw ? (JSON.parse(raw) as T) : fallback;
 49 |   } catch {
 50 |     return fallback;
 51 |   }
 52 | }
```

`read<T>(key, fallback)` … localStorage から読んで JSON として復元する。
- `<T>` は**ジェネリクス**。呼ぶ側が `read<Options>(...)` のように「何の型として読むか」を指定できる。
- L47: 保存されていなければ `getItem` は `null` を返す。
- L48: あれば `JSON.parse` でオブジェクトに戻す。なければ `fallback`（代わりの値）を返す。
- `try { ... } catch { ... }` … 中でエラーが起きたら `catch` に飛ぶ。プライベートモードや、保存が禁止された環境では localStorage を触るだけでエラーになることがあるので、そのときも `fallback` を返してゲームを止めない。

**L53–61**

```ts
 53 | 
 54 | function write(key: string, value: unknown): void {
 55 |   try {
 56 |     localStorage.setItem(key, JSON.stringify(value));
 57 |   } catch {
 58 |     // 保存できない環境（プライベートモードなど）では記録しない
 59 |   }
 60 | }
 61 | 
```

`write(key, value)` … `JSON.stringify` でオブジェクトを文字列にして保存する。失敗しても何もしない（記録が残らないだけでゲームは続けられる）。
`value: unknown` は「何でも受け取る、ただし中身は確かめずには使えない」型。保存するだけなので中身を気にしない。

**L62–65**

```ts
 62 | export function loadOptions(): Options {
 63 |   return { ...DEFAULT_OPTIONS, ...read<Partial<Options>>(OPTIONS_KEY, {}) };
 64 | }
 65 | 
```

`loadOptions()` … 保存されたオプションを読み込む。
`{ ...DEFAULT_OPTIONS, ...保存された値 }` は、**スプレッド構文**でオブジェクトを合成する書き方。後に書いたほうが優先されるので、「初期値の上に、保存されている項目だけ上書き」になる。
将来オプション項目を増やしても、古い保存データには無い項目が初期値で埋まる。`Partial<Options>` は「Options の項目がそろっていなくてもよい」型。

**L66–69**

```ts
 66 | export function saveOptions(o: Options): void {
 67 |   write(OPTIONS_KEY, o);
 68 | }
 69 | 
```

`saveOptions()` … オプションを保存する。

## ランキングの保存形式

**L70–76**

```ts
 70 | interface RecordStore {
 71 |   /** key: `${signature}|${target}` → 上位記録 */
 72 |   top: Record<string, RunRecord[]>;
 73 |   /** key: `${signature}|${target}|${seed}` → そのシードの自己ベスト */
 74 |   seedBest: Record<string, RunRecord>;
 75 | }
 76 | 
```

ランキング全体を1つのオブジェクトにまとめて保存する。
- `top` … 「設定の署名|目標点」をキーに、上位10件の配列。例: `"default|100000"`。
- `seedBest` … 「設定の署名|目標点|シード」をキーに、そのシードでの自己ベスト1件。
- `Record<string, RunRecord[]>` は「キーが文字列、値が記録の配列のオブジェクト」。

**L77–81**

```ts
 77 | function loadStore(): RecordStore {
 78 |   const s = read<Partial<RecordStore>>(RECORDS_KEY, {});
 79 |   return { top: s.top ?? {}, seedBest: s.seedBest ?? {} };
 80 | }
 81 | 
```

`loadStore()` … 保存されたランキングを読む。項目が欠けていても `?? {}` で空のオブジェクトにして、必ず両方そろった形で返す。

**L82–84**

```ts
 82 | const topKey = (target: number) => `${configSignature()}|${target}`;
 83 | const seedKey = (target: number, seed: number) => `${configSignature()}|${target}|${seed}`;
 84 | 
```

保存キーを作る関数。`` `${A}|${B}` `` は**テンプレート文字列**で、バッククォートの中に `${}` で値を埋め込める。
`configSignature()` を毎回呼ぶので、設定定数を変えると自動的に別のキーになり、別枠のランキングになる。

**L85–88**

```ts
 85 | export function getRanking(target: number): RunRecord[] {
 86 |   return loadStore().top[topKey(target)] ?? [];
 87 | }
 88 | 
```

`getRanking(target)` … その目標点の上位記録。まだなければ空配列。

**L89–92**

```ts
 89 | export function getSeedBest(target: number, seed: number): RunRecord | undefined {
 90 |   return loadStore().seedBest[seedKey(target, seed)];
 91 | }
 92 | 
```

`getSeedBest(target, seed)` … そのシードの自己ベスト。現在の画面では使っていない（結果画面では `submitRecord` の戻り値を使っている）。シード別のベストを画面に出したくなったとき用に残している。

**L93–101**

```ts
 93 | export interface SubmitResult {
 94 |   /** ランキング内の順位（1始まり）。圏外なら null */
 95 |   rank: number | null;
 96 |   /** 記録前の全体ベスト */
 97 |   prevBest?: RunRecord;
 98 |   /** 記録前のこのシードのベスト */
 99 |   prevSeedBest?: RunRecord;
100 | }
101 | 
```

`SubmitResult` … 記録を登録したときの結果。順位と、登録**前**のベスト（全体・シード別）。結果画面の「ベスト −0:01.23」のような差分表示に使う。

## 記録の登録 submitRecord

**L102–109**

```ts
102 | export function submitRecord(target: number, rec: RunRecord): SubmitResult {
103 |   const store = loadStore();
104 |   const tk = topKey(target);
105 |   const sk = seedKey(target, rec.seed);
106 |   const list = store.top[tk] ?? [];
107 |   const prevBest = list[0];
108 |   const prevSeedBest = store.seedBest[sk];
109 | 
```

- L103–105: 保存データとキーを用意。
- L106: 今の上位記録。
- L107: 配列は速い順に並べてあるので、先頭が今までのベスト。
- L108: このシードの今までのベスト。

**L110–117**

```ts
110 |   const next = [...list, rec].sort((a, b) => a.timeMs - b.timeMs).slice(0, RANK_LIMIT);
111 |   const idx = next.indexOf(rec);
112 |   store.top[tk] = next;
113 |   if (!prevSeedBest || rec.timeMs < prevSeedBest.timeMs) store.seedBest[sk] = rec;
114 |   write(RECORDS_KEY, store);
115 |   return { rank: idx >= 0 ? idx + 1 : null, prevBest, prevSeedBest };
116 | }
117 | 
```

- L110: 既存の記録に今回の記録を加え、タイムの小さい順に並べ替え（`sort` に「a − b」を返す関数を渡すと小さい順）、上位10件だけ残す（`slice(0, 10)`）。
- L111: 今回の記録が何番目に入ったか。10件からあふれていれば `-1`。
- L112: 上位記録を更新。
- L113: シード別ベストは、まだ無いか、今回のほうが速ければ更新。`!prevSeedBest` は「無ければ」。
- L114: まとめて保存。
- L115: 順位は人間向けに1から数える。圏外なら `null`。

**L118–120**

```ts
118 | export function clearRecords(): void {
119 |   write(RECORDS_KEY, { top: {}, seedBest: {} });
120 | }
```

`clearRecords()` … 記録をすべて消す（空の状態で上書き保存）。
