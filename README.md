# どぱぷよ

上級者向けの連鎖スコアアタック。目標点に到達するまでの最速タイムを競う。
ルールとスコア計算はぷよぷよeスポーツ（通ルール）準拠。仕様は [requirements.md](requirements.md) を参照。

> 非公式のファンメイド作品です。株式会社セガとは関係ありません。非商用で公開しています。

## 遊び方

| 操作 | 矢印キー方式（デフォルト） | 直接指定方式 |
|---|---|---|
| 移動 | `←` `→` | ― |
| 回転 / 向き | `Z` `X` | `W` `A` `S` `D`（子ぷよの向き） |
| 設置 | `↓` または `↑` | `H` `J` `K` `L` `;` `'`（その列に即設置） |
| 1手戻す（+5秒） | `Q` / `Backspace` | `Q` / `Backspace` |

共通: `R` リトライ（同じシード）／ `N` 新しいシード／ `Esc` メニュー
タッチ: 列をタップで縦置き、フリックで子ぷよの向き（上下左右）。1手戻すは画面の「1手戻す」ボタン
置く前の取り消し: 盤面の外まで引っぱって離す／2本目の指でタップ／（マウス）押したまま右クリック

## ソースコードの解説

全ファイルを1行ずつ解説した資料を [docs/](docs/README.md) に置いている。読む順番もそこに書いてある。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm test         # ロジックの単体テスト（Vitest）
npm run build    # dist/ に出力
```

演出時間・色数・全消しボーナスなどの調整は `src/config.ts` の `CONFIG` を書き換える。
デフォルトから変えた場合、ランキングは別枠で記録される。

## 構成

```
src/
  config.ts          調整用の定数
  core/              ゲームロジック（描画に依存しない）
    tsumo.ts         シード→配ぷよ生成（65536通り・128手ループ・初手2手3色以内）
    field.ts         盤面・設置・13/14段目・重力
    chain.ts         連鎖の解決
    scoring.ts       得点計算
    game.ts          1手ごとの進行とアニメーション時間
  render/            Canvas 描画（宝石・エフェクト）
  input/controls.ts  キーボード・タッチ
  audio/sound.ts     効果音（Web Audio で合成）
  storage.ts         オプションとローカルランキング（localStorage）
  main.ts            画面遷移と全体の組み立て
tests/core.test.ts   ロジックのテスト
```

## GitHub Pages で公開

`main` に push するたびに `.github/workflows/deploy.yml` がテスト・ビルドして公開する。
リポジトリの Settings → Pages → Source は「GitHub Actions」にしておく。
