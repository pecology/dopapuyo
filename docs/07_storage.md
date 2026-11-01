# src/storage.ts

オプション設定とローカルランキングを、ブラウザの **localStorage** に保存・読み込みするファイル。
localStorage はブラウザがサイトごとに用意してくれる小さな保存場所で、ページを閉じても消えない。文字列しか保存できないので、オブジェクトは JSON 文字列に変換して保存する。

**L1–2**

```ts
  1 | import { configSignature } from './config';
  2 | 
```

ランキングを設定ごとに分けるため、設定の署名を作る関数を読み込む。

**L3–5**

```ts
  3 | export type ControlScheme = 'arrow' | 'direct';
  4 | export type SpawnMode = 'reset' | 'keep';
  5 | 
```

- `ControlScheme` … キーボード操作の方式。`'arrow'`（矢印キー）か `'direct'`（直接指定）。
- `SpawnMode` … 置いた後の次ペアの開始位置。`'reset'`（3列目・子が上に戻す）か `'keep'`（引き継ぐ）。

文字列リテラルのユニオン型にしておくと、`'arow'` のような打ち間違いを TypeScript が見つけてくれる。

**L6–14**

```ts
  6 | export interface Options {
  7 |   controlScheme: ControlScheme;
  8 |   spawnMode: SpawnMode;
  9 |   /** フリック判定のしきい値（px） */
 10 |   flickThreshold: number;
 11 |   /** 効果音の音量 0〜1 */
 12 |   sfxVolume: number;
 13 | }
 14 | 
```

`Options` … オプション画面で変えられる設定の形。

**L15–25**

```ts
 15 | export interface RunRecord {
 16 |   timeMs: number;
 17 |   seed: number;
 18 |   maxChain: number;
 19 |   moves: number;
 20 |   /** 1手戻した回数 */
 21 |   undos?: number;
 22 |   date: string;
 23 |   controlScheme: ControlScheme;
 24 | }
 25 | 
```

`RunRecord` … ランキングに残す1回分の記録。
- `undos?: number` の `?` は「無くてもよい」。1手戻す機能を入れる前に保存された記録には `undos` がないので、省略可能にしてある。
- `date` … 日時。`new Date().toISOString()` で作る `"2026-11-01T14:30:00.000Z"` 形式の文字列。

**L26–29**

```ts
 26 | const OPTIONS_KEY = 'dopapuyo.options.v1';
 27 | const RECORDS_KEY = 'dopapuyo.records.v1';
 28 | const RANK_LIMIT = 10;
 29 | 
```

保存に使う名前（キー）と、ランキングに残す件数。
キー名に `.v1` を付けておくと、将来保存形式を変えたときに `.v2` にして古いデータと混ざらないようにできる。

**L30–36**

```ts
 30 | export const DEFAULT_OPTIONS: Options = {
 31 |   controlScheme: 'arrow',
 32 |   spawnMode: 'reset',
 33 |   flickThreshold: 24,
 34 |   sfxVolume: 0.7,
 35 | };
 36 | 
```

オプションの初期値。

## 読み書きの土台

**L37–44**

```ts
 37 | function read<T>(key: string, fallback: T): T {
 38 |   try {
 39 |     const raw = localStorage.getItem(key);
 40 |     return raw ? (JSON.parse(raw) as T) : fallback;
 41 |   } catch {
 42 |     return fallback;
 43 |   }
 44 | }
```

`read<T>(key, fallback)` … localStorage から読んで JSON として復元する。
- `<T>` は**ジェネリクス**。呼ぶ側が `read<Options>(...)` のように「何の型として読むか」を指定できる。
- L39: 保存されていなければ `getItem` は `null` を返す。
- L40: あれば `JSON.parse` でオブジェクトに戻す。なければ `fallback`（代わりの値）を返す。
- `try { ... } catch { ... }` … 中でエラーが起きたら `catch` に飛ぶ。プライベートモードや、保存が禁止された環境では localStorage を触るだけでエラーになることがあるので、そのときも `fallback` を返してゲームを止めない。

**L45–53**

```ts
 45 | 
 46 | function write(key: string, value: unknown): void {
 47 |   try {
 48 |     localStorage.setItem(key, JSON.stringify(value));
 49 |   } catch {
 50 |     // 保存できない環境（プライベートモードなど）では記録しない
 51 |   }
 52 | }
 53 | 
```

`write(key, value)` … `JSON.stringify` でオブジェクトを文字列にして保存する。失敗しても何もしない（記録が残らないだけでゲームは続けられる）。
`value: unknown` は「何でも受け取る、ただし中身は確かめずには使えない」型。保存するだけなので中身を気にしない。

**L54–57**

```ts
 54 | export function loadOptions(): Options {
 55 |   return { ...DEFAULT_OPTIONS, ...read<Partial<Options>>(OPTIONS_KEY, {}) };
 56 | }
 57 | 
```

`loadOptions()` … 保存されたオプションを読み込む。
`{ ...DEFAULT_OPTIONS, ...保存された値 }` は、**スプレッド構文**でオブジェクトを合成する書き方。後に書いたほうが優先されるので、「初期値の上に、保存されている項目だけ上書き」になる。
将来オプション項目を増やしても、古い保存データには無い項目が初期値で埋まる。`Partial<Options>` は「Options の項目がそろっていなくてもよい」型。

**L58–61**

```ts
 58 | export function saveOptions(o: Options): void {
 59 |   write(OPTIONS_KEY, o);
 60 | }
 61 | 
```

`saveOptions()` … オプションを保存する。

## ランキングの保存形式

**L62–68**

```ts
 62 | interface RecordStore {
 63 |   /** key: `${signature}|${target}` → 上位記録 */
 64 |   top: Record<string, RunRecord[]>;
 65 |   /** key: `${signature}|${target}|${seed}` → そのシードの自己ベスト */
 66 |   seedBest: Record<string, RunRecord>;
 67 | }
 68 | 
```

ランキング全体を1つのオブジェクトにまとめて保存する。
- `top` … 「設定の署名|目標点」をキーに、上位10件の配列。例: `"default|100000"`。
- `seedBest` … 「設定の署名|目標点|シード」をキーに、そのシードでの自己ベスト1件。
- `Record<string, RunRecord[]>` は「キーが文字列、値が記録の配列のオブジェクト」。

**L69–73**

```ts
 69 | function loadStore(): RecordStore {
 70 |   const s = read<Partial<RecordStore>>(RECORDS_KEY, {});
 71 |   return { top: s.top ?? {}, seedBest: s.seedBest ?? {} };
 72 | }
 73 | 
```

`loadStore()` … 保存されたランキングを読む。項目が欠けていても `?? {}` で空のオブジェクトにして、必ず両方そろった形で返す。

**L74–76**

```ts
 74 | const topKey = (target: number) => `${configSignature()}|${target}`;
 75 | const seedKey = (target: number, seed: number) => `${configSignature()}|${target}|${seed}`;
 76 | 
```

保存キーを作る関数。`` `${A}|${B}` `` は**テンプレート文字列**で、バッククォートの中に `${}` で値を埋め込める。
`configSignature()` を毎回呼ぶので、設定定数を変えると自動的に別のキーになり、別枠のランキングになる。

**L77–80**

```ts
 77 | export function getRanking(target: number): RunRecord[] {
 78 |   return loadStore().top[topKey(target)] ?? [];
 79 | }
 80 | 
```

`getRanking(target)` … その目標点の上位記録。まだなければ空配列。

**L81–84**

```ts
 81 | export function getSeedBest(target: number, seed: number): RunRecord | undefined {
 82 |   return loadStore().seedBest[seedKey(target, seed)];
 83 | }
 84 | 
```

`getSeedBest(target, seed)` … そのシードの自己ベスト。現在の画面では使っていない（結果画面では `submitRecord` の戻り値を使っている）。シード別のベストを画面に出したくなったとき用に残している。

**L85–93**

```ts
 85 | export interface SubmitResult {
 86 |   /** ランキング内の順位（1始まり）。圏外なら null */
 87 |   rank: number | null;
 88 |   /** 記録前の全体ベスト */
 89 |   prevBest?: RunRecord;
 90 |   /** 記録前のこのシードのベスト */
 91 |   prevSeedBest?: RunRecord;
 92 | }
 93 | 
```

`SubmitResult` … 記録を登録したときの結果。順位と、登録**前**のベスト（全体・シード別）。結果画面の「ベスト −0:01.23」のような差分表示に使う。

## 記録の登録 submitRecord

**L94–101**

```ts
 94 | export function submitRecord(target: number, rec: RunRecord): SubmitResult {
 95 |   const store = loadStore();
 96 |   const tk = topKey(target);
 97 |   const sk = seedKey(target, rec.seed);
 98 |   const list = store.top[tk] ?? [];
 99 |   const prevBest = list[0];
100 |   const prevSeedBest = store.seedBest[sk];
101 | 
```

- L95–97: 保存データとキーを用意。
- L98: 今の上位記録。
- L99: 配列は速い順に並べてあるので、先頭が今までのベスト。
- L100: このシードの今までのベスト。

**L102–109**

```ts
102 |   const next = [...list, rec].sort((a, b) => a.timeMs - b.timeMs).slice(0, RANK_LIMIT);
103 |   const idx = next.indexOf(rec);
104 |   store.top[tk] = next;
105 |   if (!prevSeedBest || rec.timeMs < prevSeedBest.timeMs) store.seedBest[sk] = rec;
106 |   write(RECORDS_KEY, store);
107 |   return { rank: idx >= 0 ? idx + 1 : null, prevBest, prevSeedBest };
108 | }
109 | 
```

- L102: 既存の記録に今回の記録を加え、タイムの小さい順に並べ替え（`sort` に「a − b」を返す関数を渡すと小さい順）、上位10件だけ残す（`slice(0, 10)`）。
- L103: 今回の記録が何番目に入ったか。10件からあふれていれば `-1`。
- L104: 上位記録を更新。
- L105: シード別ベストは、まだ無いか、今回のほうが速ければ更新。`!prevSeedBest` は「無ければ」。
- L106: まとめて保存。
- L107: 順位は人間向けに1から数える。圏外なら `null`。

**L110–112**

```ts
110 | export function clearRecords(): void {
111 |   write(RECORDS_KEY, { top: {}, seedBest: {} });
112 | }
```

`clearRecords()` … 記録をすべて消す（空の状態で上書き保存）。
