# src/audio/sound.ts

効果音をすべて担当するファイル。音声ファイルは使わず、**Web Audio API** でその場で波形を作って鳴らす。

Web Audio の基本の考え方は「部品（ノード）を線でつなぐ」こと。
音の発生源（オシレーター＝発振器、またはノイズ）→ 音量つまみ（GainNode）→ スピーカー（destination）、のように `connect` でつないで鳴らす。
このファイルでは次のようにつないでいる。

```
[各効果音] → sfx（効果音の音量） ┐
                                 ├→ master → スピーカー
[将来のBGM] → bgm（BGMの音量）  ┘
```

**L1–5**

```ts
  1 | /**
  2 |  * 効果音（Web Audio API でその場で合成）。
  3 |  * 音はすべてここを通す。将来の BGM 用に bgm バスを用意してある。
  4 |  */
  5 | 
```

ファイルの説明。BGM を後から足せるよう、効果音とは別の音量つまみ（bgm バス）を用意してあることを書いている。

**L6–8**

```ts
  6 | // 連鎖ごとに上がっていく音階（ペンタトニック、半音単位）
  7 | const CHAIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36, 38, 40, 43];
  8 | 
```

連鎖ごとの音の高さ。数字は「基準の音から何半音上げるか」。0, 2, 4, 7, 9 は「ド・レ・ミ・ソ・ラ」で、**ペンタトニック（5音音階）**と呼ばれる並び。どの音を続けて鳴らしても濁りにくく、上がっていく感じが気持ちよく聞こえる。12 で1オクターブ上。

## Sound クラスの状態

**L9–17**

```ts
  9 | class Sound {
 10 |   private ctx: AudioContext | null = null;
 11 |   private master: GainNode | null = null;
 12 |   private sfx: GainNode | null = null;
 13 |   /** 将来の BGM 用 */
 14 |   bgm: GainNode | null = null;
 15 |   private noise: AudioBuffer | null = null;
 16 |   private volume = 0.7;
 17 | 
```

- `ctx` … AudioContext。Web Audio のすべての部品はこれから作る。最初は `null`（まだ作っていない）。
- `master` / `sfx` / `bgm` … 音量つまみ（GainNode）。
- `noise` … 「サー」という雑音の波形データ。打撃音や破砕音の素材にする。
- `volume` … 効果音の音量（0〜1）。

## 音を使えるようにする unlock

**L18–30**

```ts
 18 |   /** ユーザー操作の中で呼ぶ（ブラウザの自動再生制限のため） */
 19 |   unlock(): void {
 20 |     if (!this.ctx) {
 21 |       try {
 22 |         const ctx = new AudioContext();
 23 |         this.ctx = ctx;
 24 |         this.master = ctx.createGain();
 25 |         this.master.connect(ctx.destination);
 26 |         this.sfx = ctx.createGain();
 27 |         this.sfx.connect(this.master);
 28 |         this.bgm = ctx.createGain();
 29 |         this.bgm.connect(this.master);
 30 |         this.setVolume(this.volume);
```

ブラウザには「ユーザーが何か操作するまで音を鳴らしてはいけない」という制限がある。そのため、スタートボタンなどを押した瞬間にこの関数を呼んで、そこで初めて AudioContext を作る。
- L20: まだ作っていなければ作る（2回目以降は作らない）。
- L22–23: AudioContext を作る。
- L24–29: 音量つまみを3つ作り、図のとおりにつなぐ。`ctx.destination` がスピーカー。
- L30: 保存されている音量を反映。

**L31–40**

```ts
 31 |         const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
 32 |         const d = buf.getChannelData(0);
 33 |         for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
 34 |         this.noise = buf;
 35 |       } catch {
 36 |         return;
 37 |       }
 38 |     }
 39 |     if (this.ctx.state === 'suspended') void this.ctx.resume();
 40 |   }
```

- L31: 0.5秒ぶんの空の音声データを作る。`sampleRate` は1秒あたりのサンプル数（多くの環境で 44100 や 48000）。
- L32–33: すべてのサンプルに −1〜1 のランダムな値を入れる＝**ホワイトノイズ**。
- L35–37: 古いブラウザなどで AudioContext が作れなくても、ゲームは音なしで続ける。
- L39: いったん止まっている（suspended）状態なら再開する。`void` は「戻り値（Promise）を待たない」ことを明示する書き方。

**L41–46**

```ts
 41 | 
 42 |   setVolume(v: number): void {
 43 |     this.volume = v;
 44 |     if (this.sfx) this.sfx.gain.value = v * 0.6;
 45 |   }
 46 | 
```

`setVolume(v)` … 効果音の音量を変える。`gain.value` は音量の倍率。複数の音が重なっても割れにくいよう、0.6 を掛けて少し控えめにしている。

## 基本の音 tone

**L47–55**

```ts
 47 |   private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
 48 |     const ctx = this.ctx;
 49 |     if (!ctx || !this.sfx) return;
 50 |     const t = ctx.currentTime + delay;
 51 |     const osc = ctx.createOscillator();
 52 |     const g = ctx.createGain();
 53 |     osc.type = type;
 54 |     osc.frequency.setValueAtTime(freq, t);
 55 |     if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
```

1つの音（純音や三角波）を鳴らす部品。ほかの効果音はすべてこれと `burst` の組み合わせでできている。
- 引数: 周波数 `freq`（Hz）、長さ `dur`（秒）、波形 `type`、音量 `gain`、鳴らし始めの遅れ `delay`、音程を滑らせる先 `slideTo`（省略可）。
- L49: まだ音が使えない状態なら何もしない。
- L50: 鳴らし始める時刻。Web Audio は `ctx.currentTime`（秒）を基準に「この時刻にこうする」と予約するので、ずらして鳴らすのが正確にできる。
- L51–52: 発振器（オシレーター）と、その音専用の音量つまみを作る。
- L53: 波形。`'sine'`（正弦波、柔らかい）、`'triangle'`（三角波、少し明るい）、`'square'`（矩形波、ピコピコ）、`'sawtooth'`（のこぎり波、ブザーっぽい）。
- L54–55: 周波数を設定。`slideTo` があれば、鳴っている間にその高さまで滑らかに変える（ヒュンという音）。

**L56–62**

```ts
 56 |     g.gain.setValueAtTime(0, t);
 57 |     g.gain.linearRampToValueAtTime(gain, t + 0.004);
 58 |     g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
 59 |     osc.connect(g).connect(this.sfx);
 60 |     osc.start(t);
 61 |     osc.stop(t + dur + 0.02);
 62 |   }
```

音量の**エンベロープ**（時間による音量の変化）。
- L56: 0から始める。
- L57: 0.004秒で一気に指定の音量まで上げる（アタックが鋭い＝キレのある音になる）。
- L58: そこから `dur` 秒かけて、ほぼ0まで指数的に下げる（自然な余韻）。指数的な変化は0ちょうどを指定できないので 0.0001 にしている。
- L59: 発振器 → 音量つまみ → 効果音バス、とつなぐ。`connect` はつないだ先を返すので、`.connect().connect()` と続けて書ける。
- L60–61: 予約した時刻に開始し、鳴り終わったら止める（止めないと部品が残り続ける）。

## ノイズの音 burst

**L63–80**

```ts
 63 | 
 64 |   private burst(dur: number, freq: number, gain: number, delay = 0): void {
 65 |     const ctx = this.ctx;
 66 |     if (!ctx || !this.sfx || !this.noise) return;
 67 |     const t = ctx.currentTime + delay;
 68 |     const src = ctx.createBufferSource();
 69 |     src.buffer = this.noise;
 70 |     const f = ctx.createBiquadFilter();
 71 |     f.type = 'highpass';
 72 |     f.frequency.value = freq;
 73 |     const g = ctx.createGain();
 74 |     g.gain.setValueAtTime(gain, t);
 75 |     g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
 76 |     src.connect(f).connect(g).connect(this.sfx);
 77 |     src.start(t);
 78 |     src.stop(t + dur + 0.02);
 79 |   }
 80 | 
```

ノイズを短く鳴らす部品。「チッ」「シャッ」という打撃・破砕の質感に使う。
- L68–69: さっき作ったノイズデータを再生する部品。
- L70–72: **ハイパスフィルター**。指定した周波数より低い成分を削る。高い周波数だけ残すと、シャリッとした金属・ガラスっぽい雑音になる。
- L73–75: 音量のエンベロープ（いきなり鳴って、すぐ消える）。
- L76–78: つないで、鳴らして、止める。

## 操作音

**L81–88**

```ts
 81 |   move(): void {
 82 |     this.tone(1800, 0.025, 'square', 0.03);
 83 |   }
 84 | 
 85 |   rotate(): void {
 86 |     this.tone(1200, 0.04, 'triangle', 0.06, 0, 1600);
 87 |   }
 88 | 
```

- `move()` … 左右移動のときの小さな「ピッ」。矩形波でごく短く、ごく小さく。
- `rotate()` … 回転のときの「ヒュッ」。1200Hz から 1600Hz へ滑らせる。

**L89–94**

```ts
 89 |   /** 設置音: 短く高い「キィン」 */
 90 |   place(): void {
 91 |     this.kiin(3520, 0.09, 0.28);
 92 |     this.tone(160, 0.05, 'sine', 0.12, 0, 90);
 93 |   }
 94 | 
```

`place()` … 置いたときの音。高い「キィン」（3520Hz＝ピアノの一番上あたりのラの音）と、低い「トン」（160Hz から 90Hz へ下がる正弦波）を重ねて、軽い着地感を出している。

## キィン音の正体 kiin

**L95–106**

```ts
 95 |   /**
 96 |    * 「キィン」と鳴る金属的・クリスタル的な音。
 97 |    * 鐘のような非整数倍音を重ね、アタックを鋭く、余韻を長めにする。
 98 |    */
 99 |   private kiin(f: number, gain: number, decay: number, delay = 0, rich = 0): void {
100 |     const partials: [number, number][] = [
101 |       [1, 1],
102 |       [2.76, 0.45],
103 |       [5.4, 0.22],
104 |       [8.93, 0.1],
105 |     ];
106 |     if (rich > 0) partials.push([13.34, 0.06 * rich], [1.5, 0.25 * rich]);
```

金属やガラスを叩いたような音を作る部品。
楽器の音は普通、基本の音の 2倍・3倍… という**整数倍の倍音**を含む。ところが鐘や金属片は 2.76倍・5.4倍のような**整数でない倍音**を含むので、「キィン」という金属的な響きになる。
- L100–105: `[倍率, 音量]` の組で倍音を並べる。2.76、5.4、8.93 は鐘やグラスの響きに近い比率。
- L106: `rich`（0〜1）が大きいほど、さらに高い倍音と 1.5倍（5度上）の音を足して、きらびやかにする。大連鎖ほど `rich` を大きくする。

**L107–116**

```ts
107 |     for (const [ratio, amp] of partials) {
108 |       const fr = f * ratio;
109 |       if (fr > 18000) continue;
110 |       // 高い倍音ほど早く減衰させると金属っぽくなる
111 |       this.tone(fr, decay / Math.sqrt(ratio), 'sine', gain * amp, delay);
112 |     }
113 |     // 打撃の瞬間の「チッ」
114 |     this.burst(0.018, 7000, gain * 0.5, delay);
115 |   }
116 | 
```

- L107: 各倍音について。
- L109: 18000Hz を超える音は人にはほぼ聞こえないので鳴らさない。
- L111: 倍音を1つずつ `tone` で鳴らす。長さを `decay / √倍率` にして、高い倍音ほど早く消えるようにしている。実際の金属も高い響きから先に消えるので、より本物っぽくなる。
- L114: 叩いた瞬間の「チッ」を、ごく短いノイズで重ねる。

## 消去音 pop

**L117–130**

```ts
117 |   /** 連鎖の消去音。連鎖数が増えるほど高く、きらびやかに */
118 |   pop(chain: number): void {
119 |     // 高くなりすぎないよう、上限を設ける
120 |     const step = Math.min(24, CHAIN_STEPS[Math.min(chain, CHAIN_STEPS.length) - 1]);
121 |     const f = 1568 * Math.pow(2, step / 12);
122 |     const rich = Math.min(1, (chain - 1) / 6);
123 |     this.kiin(f, 0.2, 0.55 + Math.min(chain, 12) * 0.05, 0, rich);
124 |     // 少し遅れてオクターブ上が重なり、ハモって伸びる
125 |     this.kiin(f * 2, 0.07 + rich * 0.04, 0.4, 0.012);
126 |     if (chain >= 4) this.kiin(f * 1.5, 0.08, 0.5, 0.03);
127 |     if (chain >= 8) this.kiin(f * 3, 0.05, 0.6, 0.05, 1);
128 |     if (chain >= 12) this.burst(0.5, 9000, 0.06, 0.02);
129 |   }
130 | 
```

連鎖が1つ消えるたびに鳴る音。
- L120: 何連鎖目かで音階表 `CHAIN_STEPS` を引く。連鎖数が表より大きければ最後の値を使い、さらに24半音（2オクターブ）を上限にする。
- L121: 基準 1568Hz（ソの音）から、その半音数だけ上げた周波数。半音1つは周波数が `2^(1/12)` 倍になるので、`2^(step/12)` を掛ける。
- L122: きらびやかさ。1連鎖で0、7連鎖以上で1。
- L123: メインのキィン。連鎖が進むほど余韻を長くする。
- L125: 0.012秒遅れて1オクターブ上を重ねる。わずかな遅れで音に厚みと広がりが出る。
- L126–128: 4連鎖以上で5度上、8連鎖以上でさらに高い音、12連鎖以上で長いシャラーンというノイズを重ねる。連鎖が進むほど音が派手になる。

**L131–139**

```ts
131 |   cancel(): void {
132 |     this.tone(500, 0.06, 'triangle', 0.07, 0, 350);
133 |   }
134 | 
135 |   undo(): void {
136 |     this.tone(900, 0.12, 'triangle', 0.12, 0, 300);
137 |     this.tone(600, 0.12, 'triangle', 0.08, 0.06, 200);
138 |   }
139 | 
```

- `cancel()` … タッチ操作をキャンセルしたときの小さな「ポッ」。
- `undo()` … 1手戻したときの「ヒュンヒュン」。2つの下降音を少しずらして鳴らす。

**L140–148**

```ts
140 |   allClear(): void {
141 |     [0, 4, 7, 12, 16].forEach((s, i) => this.kiin(1318.5 * Math.pow(2, s / 12), 0.12, 0.6, i * 0.05));
142 |   }
143 | 
144 |   clear(): void {
145 |     [0, 7, 12, 16, 19, 24].forEach((s, i) => this.kiin(784 * Math.pow(2, s / 12), 0.13, 0.9, i * 0.07, 1));
146 |     this.burst(0.6, 6000, 0.08, 0.35);
147 |   }
148 | 
```

- `allClear()` … 全消し。ミ・ソ#・シ・ミ・ソ# のアルペジオ（分散和音）をキィン音で 0.05秒ずつずらして鳴らす。`forEach((s, i) => ...)` の `i` が何番目かなので、`i * 0.05` で遅らせている。
- `clear()` … 目標点達成。もっと長く華やかなアルペジオ＋後半にシャラーン。

**L149–154**

```ts
149 |   dead(): void {
150 |     this.tone(220, 0.6, 'sawtooth', 0.12, 0, 55);
151 |   }
152 | }
153 | 
154 | export const sound = new Sound();
```

- `dead()` … 窒息。のこぎり波で低く下がっていく「ブォーン」。
- L154: `Sound` クラスのインスタンスを1つだけ作って `export` する。ほかのファイルは `import { sound }` してこれを共有する（アプリ全体で AudioContext は1つにしたいので）。
