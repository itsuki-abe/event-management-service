# Event management service

TanStack Start・React・TypeScript、Cloudflare Workers / D1、Drizzle ORMで構成した開発環境です。パッケージ管理にはBunを使います。

## 開発を始める

Node.js 22.12以降とBun 1.3.13を用意してください。

Bunが未インストールの場合は、下記の `bun` を `npx --yes bun@1.3.13` に置き換えて実行できます。

```sh
bun install
bun run db:migrate
bun run db:seed
bun run cf-typegen
bun run dev
```

http://localhost:3000 で起動します。開発時のD1はローカルの `.wrangler/state` に保存します。閲覧とDB接続にはCloudflareへのログインは不要です。運営操作には後述の運営キーを設定します。

## PC・モバイルの画面構成

参照デザインの **Workshop Commons** に合わせ、紙色（`#FAF9F4`）・青（`#3054DB`）・杏（`#F5B28C`）・黄色（`#F5DB67`）とZen Maru Gothicを使用します。提供されたデザインHTML内の共同制作イラストを `public/images/workshop-commons-hero.png` に同梱しています。

PCは上部ナビゲーションと左右2カラム、760px以下のモバイルは縦並びと固定の下部4タブ（ホーム・会場・ライブ・チーム）に切り替わります。ホームは `/`、参加登録は `/events/1`、PC／Mac接続は `/events/1/connect` です。ヘッダーのプロフィール・PCアイコンから登録と端末接続へ進めます。

会場案内 `/events/1/guide` は `event_guides` の公開データを表示し、モバイルでは開閉式、PCでは項目選択式です。重要なお知らせはホームにも表示します。チーム画面 `/events/1/team` は未案内時の表示のみで、編成・所属管理機能は別Issueの範囲です。架空の参加者・発表・Wi-Fi・チーム情報は表示しません。

## LTを進行する

`.dev.vars.example` を `.dev.vars` にコピーし、`ORGANIZER_KEY` を推測できない固有の値に変更してから開発サーバーを起動します。

1. `/admin` を開き、`.dev.vars` の運営キーを入力します。
2. イベント名を登録し、発表者名・タイトル・持ち時間・発表順を追加します。既存イベントがある場合はそのイベントを使います。
3. 進行リストから発表を選び、準備ができたら「タイマー開始」を押します。
4. 「一時停止」「タイマー再開」「発表を終了」「次の発表へ」で進行します。次へ進めてもタイマーは自動開始しません。

参加者は `/live`、発表者は `/speaker`、会場投影は表示専用の `/screen` を開きます。閲覧に運営キーは不要です。約1.5秒ごとに同じ状態を取得し、端末の時計との差を補正して残り時間を表示します。残り1分と時間超過は文字と色で知らせ、0秒でも自動終了しません。再読込・再接続後はD1に保存した状態へ戻ります。

未開始の発表は編集できます。同時に進行できる発表は1件で、競合した運営操作は再操作を求めます。終了時には実際の経過秒数を保存します。投影対象・コメント受付の設定はLT操作では変更しません。

`GET /api/lt` はイベント・発表一覧・選択中の発表・共有時刻を返します。`POST /api/lt` の変更には運営キーが必要です。運営キーはURLに含めず、ブラウザーのタブ内で保持します。画面共有・リアクション・コメントは別Issueの範囲です。参加QRについては次の節を参照してください。

## 参加者登録とスマホ・PCの接続（Issue #22）

ローカルの `db:seed` はID 1のサンプルイベントを作成します。既存イベントは上書きしません。本番イベントは運営が事前に `events` へ登録してください。未認証のイベント作成APIや運営権限の自己登録は用意していません。

| ページ | 用途 |
| --- | --- |
| `/` | Workshop Commonsのホーム・現在の発表 |
| `/events/1/qr` | 会場に掲示・印刷する参加QR |
| `/events/1` | スマホでの初回登録、プロフィール編集、端末接続・解除 |
| `/events/1/connect` | PC／Macで接続QRを表示し、接続完了を待つ |

1. スマホで会場のQRを読み取り、ニックネーム（1〜40文字）と任意の自己紹介（500文字以内）で参加します。
2. 自分のPC／Macで接続ページを開き、「接続用QRを表示する」を押します。
3. 登録したスマホのカメラでPCのQRを読み取ります。同じブラウザーで開いてください。読み取れない場合は、スマホの参加ページに16文字のコードを入力します。
4. スマホで接続先を確認し、「この端末を接続する」を押します。コードは開くだけでは消費されません。
5. PCは2秒間隔で接続状態を確認し、同じ参加者のプロフィールと接続済み端末を表示します。

ペアリングコードは5分間・一度限り有効です。再発行すると以前のコードは使えません。コードはURLのフラグメントに入れ、通常のHTTPリクエストやRefererには含めません。DBにはコード・セッショントークンのSHA-256ハッシュを保存します。コード消費と端末紐付けはD1の条件付き更新を含む1トランザクションで処理します。

セッションはイベント別のHttpOnly・SameSite=Lax Cookieに保存し、HTTPSではSecureを付与します。有効期間は発行から7日間です。端末の接続解除後は、そのセッションは利用できません。Cookieを削除した場合・期限が切れた場合の本人復旧は今回の範囲外です。同じ表示名の登録は許可し、表示名だけで過去の参加者には接続しません。

実機で試す場合、スマホとPCの両方から開ける同一の公開HTTPS URLを使ってください。`localhost` のQRは別端末から開けません。`wrangler.jsonc` のDB IDは仮値なので、公開には後述のCloudflare設定が必要です。ローカルでは別々のブラウザーセッションで一連の流れを確認できます。

## スキーマを変更する

`src/db/schema.ts` を編集して、SQLを生成・適用します。[Issue #7](https://github.com/itsuki-abe/event-management-service/issues/7) の共通データを次の11テーブルで扱います。

- `events`、`participants`：イベントと参加者・運営者。
- `device_sessions`、`pairing_requests`：端末セッションと期限付きの紐付けコード。
- `event_guides`：会場案内。
- `talks`、`event_live_state`：LT・タイマーと選択中の発表・投影対象・コメント受付。
- `chat_messages`、`talk_comments`、`reactions`、`matching_requests`：会話・質問・反応・交流希望。

IDは整数、日時はUnix秒で保存し、Drizzleでは `Date` として扱います。変更可能なデータの `updated_at` はDrizzleの更新時に設定します。直接SQLで更新する場合は明示的に設定してください。

端末セッションは `event_id` を持ち、紐付け前は `participant_id` がNULLです。登壇者・コメント・リアクション・選択中LT・投影セッションのイベント一致は複合外部キーで検証します。ニックネームの重複と同じ発表への連続リアクションを許可します。

LTの状態は `pending`・`running`・`paused`・`ended` です。`running` と `paused` はイベント内で合わせて1件に制限します。選択中の発表と投影対象はタイマーから独立しています。

LTの登録・編集・進行・タイマーAPIは実装済みです。参加登録・プロフィール編集・端末ペアリング・本人の端末解除のAPIも実装しています。

初期マイグレーションは作り直しています。旧スキーマからのデータ移行はありません。旧ローカルDBがある場合は、開発サーバーを止めて `.wrangler/state` を削除し、再適用してください。

```sh
bun run db:generate
bun run db:migrate
```

生成した `drizzle/` 配下のSQLとメタデータをGitに含めてください。適用済みマイグレーションは再実行時にスキップします。

## 動作を確認する

```sh
bun run check
bun run typecheck
bun run build
bun test
```

開発サーバーの起動中に、SSRとDrizzle経由のD1接続を確認します。

```sh
bun run test:smoke
```

`GET /api/health` が `events` テーブルを問い合わせ、成功時に `{"status":"ok","database":"connected"}` を返します。マイグレーション未適用や接続失敗時はエラーになります。

ビルドしたWorkerを確認する場合は、別のターミナルで次を実行します。

```sh
bun run preview --port 4173
bun run test:smoke http://localhost:4173
```

LTのAPI動作を確認する場合は、空のローカルDBで開発サーバーを起動し、そのサーバーと同じ運営キーを環境変数に設定して実行します。既存イベントがあるDBでは変更せず停止します。

```sh
bun run test:lt http://localhost:3000
```

運営権限、発表登録・編集・順序、競合する開始、一時停止・再開・超過・終了、次の発表への切り替え、状態の再取得を確認します。

`bun run format` で整形します。D1バインディングを変更した場合は `bun run cf-typegen` で型を再生成してください。

## Cloudflareに公開する

リモートのD1とWorkerは未作成です。`wrangler.jsonc` の `database_id` はローカル開発用の仮値です。

公開する場合はCloudflareにログインし、D1を作成します。

```sh
bunx wrangler login
bunx wrangler d1 create event-management-service
```

出力されたデータベースIDで `wrangler.jsonc` の `d1_databases[0].database_id` を置き換えてください。`binding` は `DB`、`migrations_dir` は `drizzle` を維持します。

本番の運営キーを `bunx wrangler secret put ORGANIZER_KEY` で設定してください。`.dev.vars` はローカル開発用です。

```sh
bun run cf-typegen
bun run db:migrate:remote
bun run deploy
```

`db:migrate:remote` と `deploy` はCloudflare上のリソースを変更します。

[CloudflareのTanStack Startガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)と[DrizzleのD1ガイド](https://orm.drizzle.team/docs/get-started/d1-new)を参照できます。
