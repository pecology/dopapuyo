# どぱぷよ ソースコード解説

ソースコードを1行ずつ理解するための解説集。各ファイルの解説は、コードを数行ずつ区切って抜き出し、その直後に説明を書いている。**全ファイルの全行がどこかの区切りに含まれている**ので、上から順に読めば漏れなく追える。

コードの抜粋には行番号（`L12` など）を付けている。説明文の `L12–15` はその範囲を指す。
ソースを書き換えると行番号がずれるので、その場合は解説も合わせて直す必要がある。

## 読む順番

ルール → 画面 → 全体の組み立て、の順に読むと理解しやすい。

| # | 解説 | 対象ファイル | 内容 |
|---|---|---|---|
| 1 | [01_config.md](01_config.md) | `src/config.ts` | 調整用の定数と盤面の寸法 |
| 2 | [02_core_tsumo.md](02_core_tsumo.md) | `src/core/tsumo.ts` | シードから配ぷよを作る |
| 3 | [03_core_scoring.md](03_core_scoring.md) | `src/core/scoring.ts` | 得点計算 |
| 4 | [04_core_field.md](04_core_field.md) | `src/core/field.ts` | 盤面（置く・つながりを探す・消して詰める） |
| 5 | [05_core_chain.md](05_core_chain.md) | `src/core/chain.ts` | 連鎖を最後まで解決する |
| 6 | [06_core_game.md](06_core_game.md) | `src/core/game.ts` | 1ゲームの進行、1手戻す、演出の時刻表 |
| 7 | [07_storage.md](07_storage.md) | `src/storage.ts` | オプションとランキングの保存 |
| 8 | [08_audio_sound.md](08_audio_sound.md) | `src/audio/sound.ts` | 効果音の合成（キィン音） |
| 9 | [09_render_gems.md](09_render_gems.md) | `src/render/gems.ts` | 宝石ぷよ1個の絵 |
| 10 | [10_render_renderer.md](10_render_renderer.md) | `src/render/renderer.ts` | 盤面・アニメーション・エフェクトの描画 |
| 11 | [11_input_controls.md](11_input_controls.md) | `src/input/controls.ts` | キーボード・タッチ入力 |
| 12 | [12_main.md](12_main.md) | `src/main.ts` | 全体の組み立て、時間の管理、画面の切り替え |
| 13 | [13_index_html.md](13_index_html.md) | `index.html` | 画面の部品 |
| 14 | [14_style_css.md](14_style_css.md) | `src/style.css` | 見た目 |
| 15 | [15_tests.md](15_tests.md) | `tests/core.test.ts` | ルール部分の自動テスト |
| 16 | [16_package_json.md](16_package_json.md) | `package.json` | 使う道具とコマンド |
| 17 | [17_tsconfig_json.md](17_tsconfig_json.md) | `tsconfig.json` | TypeScript の設定 |
| 18 | [18_vite_config.md](18_vite_config.md) | `vite.config.ts` | Vite の設定、オフライン対応（PWA） |
| 19 | [19_vite_env_d_ts.md](19_vite_env_d_ts.md) | `src/vite-env.d.ts` | CSS と PWA 登録モジュールを読み込むための宣言 |
| 20 | [20_deploy_yml.md](20_deploy_yml.md) | `.github/workflows/deploy.yml` | GitHub Pages への自動公開 |

## 全体の構造

```
                 ┌──────────────┐
  キー・タッチ → │ controls.ts  │ 「左へ」「ここに置いて」と頼む
                 └──────┬───────┘
                        ↓
                 ┌──────────────┐   置く・戻す   ┌──────────────────────────┐
                 │   main.ts    │ ─────────────→ │ core/（ルール）           │
                 │ 時間の管理   │ ←───────────── │ game → field, chain,     │
                 │ 画面の切替   │  結果＋時刻表  │        scoring, tsumo     │
                 └──┬────────┬──┘                └──────────────────────────┘
        毎フレーム │        │ 音を鳴らす・記録を保存
                   ↓        ↓
         ┌─────────────┐  ┌──────────┐ ┌────────────┐
         │ renderer.ts │  │ sound.ts │ │ storage.ts │
         │ （gems.ts） │  └──────────┘ └────────────┘
         └─────────────┘
```

**いちばん大事な設計**: `core/` のルール部分は時間を一切扱わない。置いた瞬間に連鎖の最後まで計算し終え、「演出に何ミリ秒かかるか」の時刻表を返すだけ。時間を進めて絵を動かすのは `main.ts` と `renderer.ts`。こう分けているので、ルールを画面なしでテストできる。

## 1手置いたときの流れ

1. **入力**: ↓キーを押す → `controls.ts` の `Keyboard` が `handlers.place()` を呼ぶ
2. **置く**: `main.ts` の `placeAt()` が `game.place(x, rot)` を呼ぶ
3. **ルールの計算**（一瞬で終わる）: `game.ts` → `field.place()` で置く → `chain.ts` の `resolveChain()` で「探す → 消す → 詰める」を消えなくなるまでくり返す → `scoring.ts` で各連鎖の得点 → `buildTimeline()` で演出の時刻表
4. **演出の準備**: `main.ts` が各段階の盤面を作り、`busyUntil`（操作できない期限）と、クリア・窒息なら `endAt`（タイム確定の時刻）を決める
5. **毎フレーム**（約60回/秒）: `main.ts` の `frame()` が
   - 連鎖が消える時刻を過ぎたら、破片・キィン音・スコア加算を出す（`processAnimation`）
   - 終了時刻を過ぎたら、記録を保存して結果画面を出す（`processEnd`）
   - 上部の表示を更新する（`updateHud`）
   - `renderer.render()` が、経過時間から「今どの場面か」を計算して描く

## よく出てくる用語

| 用語 | 意味 |
|---|---|
| 軸ぷよ / 子ぷよ | 2個組のうち回転の中心になるほう / 周りを回るほう |
| ツモ / 配ぷよ | 次々に出てくるぷよの組。シード番号で並びが決まる |
| ちぎり | 横置きで左右の高さが違うとき、別々に落ちること |
| 13段目 / 14段目 | 画面外の置き場（消えない）/ 回しスペース（置けず消える） |
| DAS / ARR | 長押しで連続移動が始まるまでの時間 / 連続移動の間隔 |
| HUD | 画面に重ねて出す情報（タイム・スコアなど） |
| フレーム | 画面の1回の描き替え。多くの画面で1秒に60回 |
| スプライト | あらかじめ描いておいて貼り付ける小さな絵 |

## TypeScript でよく出てくる書き方

| 書き方 | 意味 |
|---|---|
| `const a = 1` / `let b = 2` | 変更しない変数 / 変更する変数 |
| `(x) => x * 2` | 矢印関数（短く書ける関数） |
| `a ? b : c` | 三項演算子。a が真なら b、偽なら c |
| `a ?? b` | a が null / undefined なら b |
| `a?.b` | a が null / undefined なら、エラーにせず undefined |
| `a!` | 「a は null ではない」と TypeScript に伝える |
| `[...arr]` / `{ ...obj }` | 配列 / オブジェクトの複製（スプレッド構文） |
| `const [x, y] = pair` | 分割代入。配列やオブジェクトから取り出して変数に入れる |
| `` `${a}点` `` | テンプレート文字列。値を埋め込んだ文字列 |
| `type A = 'x' \| 'y'` | 型の別名。この場合は 'x' か 'y' のどちらか |
| `interface P { a: number }` | オブジェクトの形の宣言 |
| `x?: number`（型の中） | 省略してもよい項目 |
| `Array<T>`、`read<T>()` | ジェネリクス。中身の型をあとから指定できる |
| `import type { A }` | 型だけを読み込む（実行時には消える） |
| `export` | 他のファイルから使えるようにする |
