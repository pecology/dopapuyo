# deploy.yml

GitHub Actions（GitHub 上で自動で作業を実行する仕組み）の設定。`main` ブランチに push するたびに、テスト → ビルド → GitHub Pages への公開 を自動で行う。
置き場所は `.github/workflows/deploy.yml`（GitHub はこのフォルダにある設定だけを読む）。

YAML という形式で書かれていて、**インデント（字下げ）で入れ子を表す**。`-` で始まる行は配列の要素。

**L1–2**

```yaml
 1 | name: Deploy to GitHub Pages
 2 | 
```

この自動作業の名前。GitHub の「Actions」タブに表示される。

## いつ動くか on

**L3–7**

```yaml
 3 | on:
 4 |   push:
 5 |     branches: [main]
 6 |   workflow_dispatch:
 7 | 
```

- `push: branches: [main]` … `main` ブランチに push されたとき。
- `workflow_dispatch` … GitHub の画面から手動でも実行できるようにする。

**L8–13**

```yaml
 8 | permissions:
 9 |   contents: read
10 |   pages: write
11 |   id-token: write
12 | 
13 | concurrency:
```

この作業に与える権限。リポジトリの中身を読む、Pages に公開する、公開時の本人確認用のトークンを発行する。必要最小限だけを許可している。

**L14–17**

```yaml
14 |   group: pages
15 |   cancel-in-progress: true
16 | 
17 | jobs:
```

同時に複数回 push したとき、古い実行を取り消して最新だけを公開する。

## ビルドの仕事 build

**L18–31**

```yaml
18 |   build:
19 |     runs-on: ubuntu-latest
20 |     steps:
21 |       - uses: actions/checkout@v4
22 |       - uses: actions/setup-node@v4
23 |         with:
24 |           node-version: 22
25 |       - run: npm install
26 |       - run: npm test
27 |       - run: npm run build
28 |       - uses: actions/upload-pages-artifact@v3
29 |         with:
30 |           path: dist
31 | 
```

- `runs-on: ubuntu-latest` … GitHub が用意する Linux のマシンで実行。
- `actions/checkout@v4` … リポジトリのファイルを取ってくる。
- `actions/setup-node@v4` … Node.js（バージョン22）を用意する。
- `npm install` → `npm test` → `npm run build` … 道具を入れ、テストし、ビルドする。テストが失敗したらここで止まり、壊れたものは公開されない。
- `actions/upload-pages-artifact@v3` … ビルド結果の `dist` フォルダを、公開用にアップロードする。

## 公開の仕事 deploy

**L32–40**

```yaml
32 |   deploy:
33 |     needs: build
34 |     runs-on: ubuntu-latest
35 |     environment:
36 |       name: github-pages
37 |       url: ${{ steps.deployment.outputs.page_url }}
38 |     steps:
39 |       - id: deployment
40 |         uses: actions/deploy-pages@v4
```

- `needs: build` … build が成功してから実行する。
- `environment` … 公開先の情報。`url` には公開されたページのアドレスが入り、Actions の画面からリンクで開ける。`${{ ... }}` は GitHub Actions の式で、下の `deployment` という手順の結果を参照している。
- `actions/deploy-pages@v4` … アップロードしたものを GitHub Pages に公開する。
