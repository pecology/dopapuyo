# src/render/gems.ts

宝石ぷよ1個の絵を作るファイル。HTML の **Canvas 2D**（`<canvas>` に図形を描く機能）を使う。

毎フレーム宝石を一から描くと重いので、色と大きさごとに**一度だけ小さな canvas に描いて保存（キャッシュ）**し、以降はそれを貼り付ける（スプライト方式）。

Canvas 2D の描き方の基本:
1. `beginPath()` で新しい図形を始める
2. `moveTo` / `lineTo` / `arc` などで形をなぞる
3. `fillStyle` に色を入れて `fill()`（塗る）、または `strokeStyle` を入れて `stroke()`（線を引く）

座標は左上が (0, 0)、右が +x、**下が +y**。角度はラジアン（`Math.PI` が180度）で、0 が右向き、時計回りに増える。

**L1–5**

```ts
  1 | /**
  2 |  * 宝石ぷよの描画。色ごとにカット（面の数）を変えて、色だけでなく形でも見分けられるようにする。
  3 |  * 色数を増やしても破綻しないよう、6色目以降は既存の色を回転させて使う。
  4 |  */
  5 | 
```

ファイルの説明。色覚に頼らず形でも見分けられるようにしていること、色数を増やしても動くことを書いている。

## 宝石の見た目の定義

**L6–16**

```ts
  6 | export interface GemStyle {
  7 |   name: string;
  8 |   light: string;
  9 |   mid: string;
 10 |   dark: string;
 11 |   /** 中央テーブル面の角数（色覚に頼らない識別用） */
 12 |   facets: number;
 13 |   /** テーブル面の回転（ラジアン） */
 14 |   turn: number;
 15 | }
 16 | 
```

`GemStyle` … 1色ぶんの見た目。
- `light` / `mid` / `dark` … 明るい色・本体の色・暗い色。グラデーションに使う。`'#ff8aa3'` のような書き方は16進数の色コード（赤・緑・青を2桁ずつ）。
- `facets` … 中央の面（テーブル面）の角の数。色ごとに変えて、形でも区別できるようにする。
- `turn` … その多角形を何度回して置くか。

**L17–24**

```ts
 17 | export const GEMS: GemStyle[] = [
 18 |   { name: 'ruby', light: '#ff8aa3', mid: '#e0234b', dark: '#5c0719', facets: 8, turn: Math.PI / 8 },
 19 |   { name: 'emerald', light: '#8af5c6', mid: '#12b878', dark: '#033f26', facets: 4, turn: 0 },
 20 |   { name: 'sapphire', light: '#93c0ff', mid: '#2f66e8', dark: '#0a1d5c', facets: 3, turn: -Math.PI / 2 },
 21 |   { name: 'topaz', light: '#ffe9a3', mid: '#f0b41e', dark: '#6b4100', facets: 6, turn: 0 },
 22 |   { name: 'amethyst', light: '#e2bdff', mid: '#9a4de6', dark: '#33105e', facets: 5, turn: -Math.PI / 2 },
 23 | ];
 24 | 
```

5色ぶんの定義。ルビー（八角形）、エメラルド（四角）、サファイア（三角）、トパーズ（六角形）、アメジスト（五角形）。
`-Math.PI / 2` は −90度で、三角形や五角形の頂点を真上に向けるため。

**L25–28**

```ts
 25 | export function gemStyle(color: number): GemStyle {
 26 |   return GEMS[color % GEMS.length];
 27 | }
 28 | 
```

`gemStyle(color)` … 色番号から見た目を引く。`%`（余り）を使うので、色数を6以上にしても0番目から繰り返し使われ、エラーにならない。

**L29–30**

```ts
 29 | const cache = new Map<string, HTMLCanvasElement>();
 30 | 
```

描いた宝石を保存しておく入れ物。`Map` はキーと値の組を持つデータ構造で、キーは `"色@大きさ"` の文字列、値は描き終わった canvas。

## 宝石の絵を作る gemSprite

**L31–36**

```ts
 31 | /** 1マスぶんの宝石画像（size は実ピクセル） */
 32 | export function gemSprite(color: number, size: number): HTMLCanvasElement {
 33 |   const key = `${color}@${size}`;
 34 |   const hit = cache.get(key);
 35 |   if (hit) return hit;
 36 | 
```

- L33–35: すでに同じ色・同じ大きさで描いたものがあれば、それを返して終わり。

**L37–44**

```ts
 37 |   const c = document.createElement('canvas');
 38 |   c.width = c.height = size;
 39 |   const g = c.getContext('2d')!;
 40 |   const st = gemStyle(color);
 41 |   const cx = size / 2;
 42 |   const cy = size / 2;
 43 |   const r = size * 0.44;
 44 | 
```

- L37–38: 宝石1個ぶんの、画面に出さない canvas を作る。`c.width = c.height = size` は両方に同じ値を入れる書き方。
- L39: 描画用の道具（コンテキスト）を取り出す。`!` は「必ず取れる」という TypeScript への宣言。
- L41–43: 中心座標と半径。マスの大きさの44%を半径にして、隣の宝石との間に少し隙間を空ける。

**L45–54**

```ts
 45 |   // 本体: 左上から光が当たる球
 46 |   const body = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
 47 |   body.addColorStop(0, st.light);
 48 |   body.addColorStop(0.45, st.mid);
 49 |   body.addColorStop(1, st.dark);
 50 |   g.fillStyle = body;
 51 |   g.beginPath();
 52 |   g.arc(cx, cy, r, 0, Math.PI * 2);
 53 |   g.fill();
 54 | 
```

本体の球。
- L46: **放射グラデーション**を作る。最初の3つの数は「明るい中心」（左上に少しずらした位置・小さな半径）、後の3つは「外側の円」。こうすると左上から光が当たった球に見える。
- L47–49: 色の段階。中心は明るい色、45%で本体の色、外周で暗い色。
- L50–53: そのグラデーションで円を塗る。`arc(中心x, 中心y, 半径, 開始角, 終了角)` で 0〜2π（一周）を描く。

**L55–62**

```ts
 55 |   // カット面: 中央のテーブル面と、そこから外周へ伸びる稜線
 56 |   const n = st.facets;
 57 |   const tr = r * 0.46;
 58 |   const table: [number, number][] = [];
 59 |   for (let i = 0; i < n; i++) {
 60 |     const a = st.turn + (i / n) * Math.PI * 2;
 61 |     table.push([cx + Math.cos(a) * tr, cy + Math.sin(a) * tr]);
 62 |   }
```

カット面の準備。
- L57: テーブル面（中央の多角形）の大きさ。半径の46%。
- L58–62: 多角形の頂点を計算して配列に入れる。円周上を `n` 等分した角度 `a` で、`(cos a, sin a)` に半径を掛けると円周上の点になる（三角関数で円周上の点を求める定番の方法）。

**L63–78**

```ts
 63 |   // 稜線の間を交互に明暗で塗ってファセット感を出す
 64 |   for (let i = 0; i < n; i++) {
 65 |     const [x1, y1] = table[i];
 66 |     const [x2, y2] = table[(i + 1) % n];
 67 |     const a1 = st.turn + (i / n) * Math.PI * 2;
 68 |     const a2 = st.turn + ((i + 1) / n) * Math.PI * 2;
 69 |     g.beginPath();
 70 |     g.moveTo(x1, y1);
 71 |     g.lineTo(cx + Math.cos(a1) * r * 0.97, cy + Math.sin(a1) * r * 0.97);
 72 |     g.arc(cx, cy, r * 0.97, a1, a2);
 73 |     g.lineTo(x2, y2);
 74 |     g.closePath();
 75 |     const lightSide = Math.cos((a1 + a2) / 2 + Math.PI * 0.75); // 左上ほど明るい
 76 |     g.fillStyle = lightSide > 0 ? `rgba(255,255,255,${0.1 * lightSide})` : `rgba(0,0,0,${-0.22 * lightSide})`;
 77 |     g.fill();
 78 |   }
```

テーブル面の各辺から外周へ向かう扇形の面を、1枚ずつ明るさを変えて塗る。これで宝石のカットっぽい凹凸感が出る。
- L65–66: 辺の両端の頂点。`(i + 1) % n` で最後の頂点の次は最初の頂点に戻る。
- L67–68: その2頂点の角度。
- L69–74: 「頂点1 → 外周 → 外周に沿って弧 → 頂点2 → 閉じる」で扇形の面をなぞる。
- L75: その面の向きが左上ほど1に近く、右下ほど−1に近くなる値。`cos(角度 + 135度)` で、左上を向いた面が最大になる。
- L76: 左上向きの面は白をうっすら重ねて明るく、右下向きの面は黒を重ねて暗くする。`rgba(赤,緑,青,不透明度)` の不透明度で濃さを変えている。

**L79–90**

```ts
 79 |   // テーブル面
 80 |   const tableGrad = g.createLinearGradient(cx - tr, cy - tr, cx + tr, cy + tr);
 81 |   tableGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
 82 |   tableGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
 83 |   g.fillStyle = tableGrad;
 84 |   g.beginPath();
 85 |   table.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
 86 |   g.closePath();
 87 |   g.fill();
 88 |   g.strokeStyle = 'rgba(255,255,255,0.45)';
 89 |   g.lineWidth = Math.max(1, size * 0.02);
 90 |   g.stroke();
```

テーブル面（中央の平らな面）。
- L80–83: 左上から右下へ、白から透明へ変わる**線形グラデーション**。光の反射っぽく見せる。
- L85: 頂点を順になぞる。最初の点（i が0）だけ `moveTo`、残りは `lineTo`。`i ? A : B` は「i が0以外ならA」。
- L88–90: 輪郭を白い細線で描く。`Math.max(1, ...)` で小さく表示されても最低1pxの太さを確保。

**L91–100**

```ts
 91 |   // 稜線
 92 |   g.strokeStyle = 'rgba(255,255,255,0.18)';
 93 |   for (let i = 0; i < n; i++) {
 94 |     const a = st.turn + (i / n) * Math.PI * 2;
 95 |     g.beginPath();
 96 |     g.moveTo(table[i][0], table[i][1]);
 97 |     g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
 98 |     g.stroke();
 99 |   }
100 | 
```

稜線（テーブル面の頂点から外周へ伸びる線）を薄い白で描く。

**L101–107**

```ts
101 |   // 縁取り
102 |   g.strokeStyle = st.dark;
103 |   g.lineWidth = Math.max(1, size * 0.035);
104 |   g.beginPath();
105 |   g.arc(cx, cy, r, 0, Math.PI * 2);
106 |   g.stroke();
107 | 
```

外周の縁取り。暗い色で円の線を引いて、輪郭を締める。

**L108–116**

```ts
108 |   // 鏡面ハイライト
109 |   const hl = g.createRadialGradient(cx - r * 0.42, cy - r * 0.5, 0, cx - r * 0.42, cy - r * 0.5, r * 0.38);
110 |   hl.addColorStop(0, 'rgba(255,255,255,0.95)');
111 |   hl.addColorStop(1, 'rgba(255,255,255,0)');
112 |   g.fillStyle = hl;
113 |   g.beginPath();
114 |   g.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.36, r * 0.24, -0.6, 0, Math.PI * 2);
115 |   g.fill();
116 | 
```

鏡面ハイライト（左上の白い光）。
- L109–111: 中心が白く、外側が透明になる放射グラデーション。
- L114: `ellipse(中心x, 中心y, 横半径, 縦半径, 傾き, 開始角, 終了角)` で斜めに傾けた楕円を描く。

**L117–120**

```ts
117 |   cache.set(key, c);
118 |   return c;
119 | }
120 | 
```

描き終わった canvas をキャッシュに保存して返す。

## きらめき drawSparkle

**L121–138**

```ts
121 | /** 4方向のきらめき（スパークル） */
122 | export function drawSparkle(g: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number): void {
123 |   if (alpha <= 0) return;
124 |   g.save();
125 |   g.globalAlpha = alpha;
126 |   g.fillStyle = '#ffffff';
127 |   g.beginPath();
128 |   const s = size;
129 |   const w = size * 0.18;
130 |   g.moveTo(x, y - s);
131 |   g.quadraticCurveTo(x + w, y - w, x + s, y);
132 |   g.quadraticCurveTo(x + w, y + w, x, y + s);
133 |   g.quadraticCurveTo(x - w, y + w, x - s, y);
134 |   g.quadraticCurveTo(x - w, y - w, x, y - s);
135 |   g.fill();
136 |   g.restore();
137 | }
138 | 
```

十字形の光（✦）を描く関数。宝石がときどき光るときや、消去時の光の粒に使う。
- `g` は描き込む先のコンテキスト。宝石の絵ではなく、メインの画面に直接描く。
- L123: 完全に透明なら描かない。
- L124 と L136: `save()` で今の描画設定（透明度など）を保存し、`restore()` で元に戻す。途中で変えた `globalAlpha` がほかの描画に影響しないようにする定番の書き方。
- L125: `globalAlpha` … これ以降に描くものの不透明度。
- L130–134: 上→右→下→左→上 と、`quadraticCurveTo`（2次ベジェ曲線）で内側にくびれた線でつなぐ。制御点を中心近く（`w` だけずらした点）に置くので、4本のトゲが鋭く伸びた形になる。

**L139–141**

```ts
139 | export function clearGemCache(): void {
140 |   cache.clear();
141 | }
```

`clearGemCache()` … キャッシュを空にする。画面サイズが変わったとき、古い大きさの絵を捨てて描き直させるために使う。
