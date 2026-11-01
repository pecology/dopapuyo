# src/core/chain.ts

連鎖を最後まで解決するファイル。「4個以上のグループを探す → 消す → 詰める」を、消えるものがなくなるまでくり返す。
1連鎖ごとに、得点と、アニメーションに必要な情報（何が消えて、何がどう落ちたか）を記録する。

**L1–3**

```ts
 1 | import type { Cell, Field, Move } from './field';
 2 | import { stepScore } from './scoring';
 3 | 
```

- L1: `Field` などを型として読み込む。このファイルでは盤面のメソッドを呼ぶだけで `new Field()` はしないので、`import type` で足りる。
- L2: 得点計算の関数を読み込む。

## 1連鎖ぶんの記録 ChainStep

**L4–17**

```ts
 4 | export interface ChainStep {
 5 |   chain: number;
 6 |   cleared: Cell[];
 7 |   /** 消えたぷよの色（cleared と同じ順） */
 8 |   clearedColors: number[];
 9 |   groupSizes: number[];
10 |   colorCount: number;
11 |   /** この連鎖の得点（全消しボーナス込み） */
12 |   score: number;
13 |   /** 全消しボーナスがこの連鎖で加算されたか */
14 |   allClearBonusApplied: boolean;
15 |   /** 消去後の落下 */
16 |   falls: Move[];
17 | }
```

- `chain` … 何連鎖目か（1から）。
- `cleared` … 消えたマスの一覧。
- `clearedColors` … 消えたぷよの色。`cleared` と同じ順番。消える前の色が必要なのは、破片エフェクトをその色で出すため（消した後の盤面にはもう色が残っていない）。
- `groupSizes` … 同時に消えた各グループの個数。
- `colorCount` … 同時に消えた色の数。
- `score` … この連鎖の得点。
- `allClearBonusApplied` … 全消しボーナスがこの連鎖で足されたか（「ALL CLEAR BONUS」表示に使う）。
- `falls` … 消えた後に落ちたぷよの移動。

**L18–24**

```ts
18 | 
19 | export interface ChainResult {
20 |   steps: ChainStep[];
21 |   totalScore: number;
22 |   /** 連鎖終了後に盤面が空になったか */
23 |   allClear: boolean;
24 | }
```

`ChainResult` … 1手ぶんの連鎖全体の結果。各連鎖の記録 `steps`、合計点 `totalScore`、連鎖後に盤面が空になったか `allClear`。

## 連鎖の解決 resolveChain

**L25–32**

```ts
25 | 
26 | /**
27 |  * 盤面の連鎖を最後まで解決する（盤面は変更される）。
28 |  * pendingAllClearBonus が 0 より大きければ、1連鎖目にその点数を加算する。
29 |  */
30 | export function resolveChain(field: Field, pendingAllClearBonus = 0): ChainResult {
31 |   const steps: ChainStep[] = [];
32 |   let total = 0;
```

- 引数 `pendingAllClearBonus = 0` … 前の手で全消ししていれば、ここに 2100 が渡される。
- L31: 各連鎖の記録をためる配列。
- L32: 合計点。`let` は後から値を変えられる変数。

**L33–35**

```ts
33 |   for (let chain = 1; ; chain++) {
34 |     const groups = field.findGroups();
35 |     if (groups.length === 0) break;
```

- L33: `for (let chain = 1; ; chain++)` … 真ん中（終了条件）を空にした**無限ループ**。1連鎖目、2連鎖目…と数えながら回し、抜けるのは L35 の `break` だけ。
- L34: 今の盤面で消えるグループを探す。
- L35: なければ連鎖終了。

**L36–41**

```ts
36 |     const cleared = groups.flat();
37 |     const clearedColors = cleared.map((c) => field.get(c.x, c.y)!);
38 |     const colorCount = new Set(clearedColors).size;
39 |     const groupSizes = groups.map((g) => g.length);
40 |     const applyBonus = chain === 1 && pendingAllClearBonus > 0;
41 |     const score = stepScore(chain, groupSizes, colorCount) + (applyBonus ? pendingAllClearBonus : 0);
```

- L36: `groups.flat()` … 「グループの配列の配列」を平らにして、消えるマスを1本の配列にする。
- L37: 消える前に各マスの色を控えておく。
- L38: `new Set(色の配列).size` … Set は重複を取り除くので、その個数＝何色が消えたか。
- L39: 各グループの個数。
- L40: 全消しボーナスを足すのは1連鎖目だけ。
- L41: 得点＝通常の計算 ＋（1連鎖目ならボーナス）。

**L42–54**

```ts
42 |     const falls = field.removeAndFall(cleared);
43 |     total += score;
44 |     steps.push({
45 |       chain,
46 |       cleared,
47 |       clearedColors,
48 |       groupSizes,
49 |       colorCount,
50 |       score,
51 |       allClearBonusApplied: applyBonus,
52 |       falls,
53 |     });
54 |   }
```

- L42: 盤面から実際に消して詰める。落ちたぷよの移動が返ってくる。この時点で盤面が次の連鎖の状態になる。
- L43: 合計に加算。`total += score` は `total = total + score` の省略形。
- L44–53: この連鎖の記録を追加。`chain,` のように名前だけ書くと `chain: chain` の省略形。

**L55–56**

```ts
55 |   return { steps, totalScore: total, allClear: steps.length > 0 && field.isEmpty() };
56 | }
```

結果を返す。全消しは「1回以上連鎖して、かつ盤面が空」で判定する（`&&` は「かつ」）。
