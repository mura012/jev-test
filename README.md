# jev-test

[Jev](https://typesafe.ai)（TypeSafe AI の System One モデル）を試すための最小アプリです。
「〇〇」を入力し、「〇〇は△△か？」という判定項目をいくつか入力すると、Jev が各項目を yes/no の確率（0〜1）で返します。

## Jev とは

- 文章を生成せず、**型の決まった質問**に**確率付きで**答えるモデル。
- 質問は 3 種類だけ:
  - `noul`: はい/いいえ（`noul: 0.93` のように「はい」の確率が返る）
  - `choice`: 選択肢から 1 つ選ぶ（`choice` + 各選択肢の `probabilities` + `confidence`）
  - `score`: 自分で定義した段階（2〜10 段階）のどこか（`score` + `probabilities` + `confidence`）
- 1 回の呼び出しは 100ms 前後、入力 $0.042 / 1M tokens、出力は無料。
- エンドポイントは 1 つ: `POST https://api.typesafe.ai/v1/systemone`

このアプリは `noul` だけを使っています。

## 使い方

### 1. API キーを用意する

1. [typesafe.ai](https://typesafe.ai) でウェイトリストに登録（数日でメールが来ます）
2. [console.typesafe.ai](https://console.typesafe.ai) → **API Keys** でキーを発行
3. `.env` を作る

```sh
cp .env.example .env
# .env の TYPESAFE_API_KEY=... を書き換える
```

### 2. 起動する

Node.js 20 以上が必要です。

```sh
npm install
npm start
# → http://localhost:3000
```

キーが未取得でも UI だけ試したい場合はモックモード（ランダムな結果を返す）で起動できます。

```sh
npm run mock
```

### 3. 画面で判定する

- 「〇〇」欄に単語や文章を入れる（例: `りんご`）
- 「判定するもの」に項目を入れる（例: `果物` `赤い` `野菜`）
  - 各項目は `` `target` は「果物」か？`` という noul 質問に変換されます
  - 末尾に `？` を付けると、その文をそのまま質問として送ります（例: `返金を求めているか？`）
- 「判定する」を押すと、項目ごとに「はい」の確率が表示されます

## コードで見る Jev の呼び方

このアプリの中身（`server.js`）は要するにこれだけです。

```js
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // TYPESAFE_API_KEY を環境変数から読む

const { answers, model, usage } = await client.systemOne({
  state: { target: "りんご" },
  questions: {
    q0: noul("`target` は「果物」か？"),
    q1: noul("`target` は「赤い」か？"),
  },
});

console.log(answers.q0.noul); // 0.98 のような「はい」の確率
console.log(answers.q1.noul);
console.log(model); // 実際に答えたバージョン (例: jev-1.13.0)
```

`state` に判定対象を入れ、`questions` に質問を並べます。質問文の中で `` `target` `` のように state のキーをバッククォートで参照します。質問は同じ state に対して並列・独立に評価されるので、まとめて 1 リクエストで送るのが速くて安いです。

curl で直接叩くなら:

```sh
curl -s https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev-latest",
    "state": { "target": "りんご" },
    "questions": {
      "is_fruit": { "type": "noul", "instructions": "`target` は「果物」か？" }
    }
  }'
```

## 質問を書くときのコツ

- 「はい」が高確率になる向きで聞く（「怒っているか？」は OK、「怒っていないか？」は避ける）
- noul の 0.5 は「中くらい」ではなく「わからない」。程度を測りたいときは `score` を使う
- `choice` には `other` のような逃げ道の選択肢を入れる
- `state` には判定に必要なものだけを入れる（余計な文脈が多いと精度が落ちる）
- 閾値を調整したらモデルのバージョン（`jev-1.13.0` など）を固定する

## ファイル構成

- `server.js` — Node 標準の `http` だけで動く小さなサーバー。`POST /api/judge` で Jev を呼ぶ
- `public/index.html` — 入力フォームと結果表示
- `.env.example` — 環境変数のテンプレート
