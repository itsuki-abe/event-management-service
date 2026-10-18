# Event management service

TanStack Start・React・TypeScript、Cloudflare Workers / D1、Drizzle ORMで構成した開発環境です。パッケージ管理にはBunを使います。

## 開発を始める

Node.js 22.12以降とBun 1.3.13を用意してください。

```sh
bun install
bun run db:migrate
bun run cf-typegen
bun run dev
```

http://localhost:3000 で起動します。開発時のD1はローカルの `.wrangler/state` に保存します。Cloudflareへのログインや環境変数の設定は不要です。

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

交流機能は以下のAPIで実装しています。参加・ペアリング・LT進行操作の本体は別領域です。ペアリング実装時は期限・未使用条件付きのコード消費を行ってください。

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

`bun run format` で整形します。D1バインディングを変更した場合は `bun run cf-typegen` で型を再生成してください。

## Cloudflareに公開する

リモートのD1とWorkerは未作成です。`wrangler.jsonc` の `database_id` はローカル開発用の仮値です。

公開する場合はCloudflareにログインし、D1を作成します。

```sh
bunx wrangler login
bunx wrangler d1 create event-management-service
```

出力されたデータベースIDで `wrangler.jsonc` の `d1_databases[0].database_id` を置き換えてください。`binding` は `DB`、`migrations_dir` は `drizzle` を維持します。

```sh
bun run cf-typegen
bun run db:migrate:remote
bun run deploy
```

`db:migrate:remote` と `deploy` はCloudflare上のリソースを変更します。

[CloudflareのTanStack Startガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)と[DrizzleのD1ガイド](https://orm.drizzle.team/docs/get-started/d1-new)を参照できます。

## 交流機能（#4 / #14 / #15 / #16）

Workshop Commons案をベースに、参加者のLTライブ画面と運営のコメント管理画面を実装しています。書体はZen Maru Gothic、アイコンはMaterial Symbols Roundedをパッケージから配信します。モバイルは縦並び、PCは発表・リアクションとコメントを横並びで表示します。今回は交流領域のみで、会場案内・チーム画面・投影画面は含みません。

### ローカルで試す

```sh
bun run db:migrate
bun run db:seed
cp .dev.vars.example .dev.vars
```

`.dev.vars` の `ENGAGEMENT_ADMIN_TOKEN` を十分に長いランダムな値に変更してから `bun run dev` で起動します。既存の `.dev.vars` は上書きしないでください。参加者の閲覧・投稿にはキーは不要です。運営用キーは端末ペアリング・運営セッション統合までの暫定認証で、API側で検証します。キー未設定なら運営操作は拒否します。本番で利用する場合は `wrangler secret put ENGAGEMENT_ADMIN_TOKEN` で設定し、参加者に公開しないでください。

- `/?eventId=1`：LTライブ。`event_live_state.selected_talk_id` の発表を表示し、初回コメント送信時に表示名を入力します。
- `/admin?eventId=1`：運営用キーで接続。発表別のコメント・集計、受付停止／再開、非表示、投影許可の切り替え。
- サンプルはイベント1・発表1と2。再投入は既存データ・現在の進行状態を上書きしません。既存のIDと重なるDBでは、イベント／登壇者の関係を確認してから投入してください。

### APIと他領域との接続

`GET /api/engagement?eventId=1` は現在の発表・全発表一覧・反応数・コメント・受付／投影許可を返します。`talkId` を付けると特定の発表を参照できます。表示名や本文の入力なしで閲覧できます。タイマーは共通DBの `duration_seconds`・`elapsed_seconds`・`resumed_at`・`status` から表示し、DBへ毎秒書き込みません。タイマーの操作は行いません。

`POST /api/engagement` のJSONは共通の `eventId` と `talkId` に加えて次を指定します。

- リアクション：`action: "reaction"`, `kind: "applause" | "like" | "learn" | "hot"`。
- コメント：`action: "comment"`, `displayName`（空白を除き1〜40文字）, `body`（1〜200文字、Unicodeコードポイント単位）。

初回送信で `participants` と `device_sessions` を作り、24時間のHttpOnly Cookieを返します。セッショントークンはSHA-256ハッシュのみをDBへ保存します。リアクションは同じ参加者が毎秒最大1回送信でき、重複を許容して送信数を数えます。Cookieの削除による制限回避を防ぐ仕組みではありません。

`PATCH /api/engagement` は `Authorization: Bearer <運営用キー>` が必要です。

- `action: "settings"`, `eventId`, `commentsEnabled`, `commentsProjectionEnabled`：受付と投影許可を独立して設定。
- `action: "hide"`, `eventId`, `commentId`：対象イベントのコメントを非表示にする。
- `GET` に `admin=1` と同じ認証ヘッダーを付けると、非表示コメントも管理用に取得できます。一般向け取得には含めません。

コメントとリアクションは、#7の整数ID・イベント一致の複合外部キーを使います。追加マイグレーションは投稿時の表示名を保持する `talk_comments.display_name` と、送信間隔チェック用インデックスだけです。コメント成功時は共通参加者のニックネームも更新し、過去の投稿の表示名は変えません。

各画面は2秒ごとに状態を再取得します。発表が切り替わっても下書きの投稿対象は保持し、本人が明示的に切り替えるまでは元の発表へ送信します。受付停止はサーバーの保存時にも検証します。失敗時は入力を保持し、再接続後に再送できます。コメント一覧は最新200件です。

`comments_projection_enabled` は設定の保存までです。実際の会場投影画面はこの状態と非表示を除いたコメントを参照して接続してください。運営用キーは画面のメモリーだけで保持し、再読込で再認証します。

### 交流機能の確認

ローカルサンプルDBと開発サーバーを起動した状態で実行します。テストはサンプルイベント1にリアクションとコメントを作り、最後にテストコメントを非表示、受付・投影設定を元に戻します。本番イベントには実行しないでください。

```sh
bun run test:engagement
```

4種類の送信・別リクエストからの取得・発表ごとの分離・連打制限・200文字と表示名の検証・受付停止／再開・非表示・運営認証・別サイトからの送信拒否を確認します。

## Sitesの確認環境

Sites向け変更は交流機能のPRに依存する別ブランチで管理します。`.openai/hosting.json` の `project_id` は確認用SiteのID、`d1: "DB"` はSitesが作成する専用DBのバインディングです。GitHubの開発DB・Cloudflareの既存DBとは別です。

```sh
bun run db:generate:sites # 共通スキーマを変更したときのみ
bun run sites:prepare
```

`sites:prepare` は、秘密値・ローカルDB・GitHubのGit履歴を含めず、`.sites/commons-review` に公開用ソースを作ります。Sitesのソース同期・ビルド・パッケージ・公開は、このコピー内でSitesプラグインのヘルパーを使います。GitHubのoriginは変更しません。

Sitesのマイグレーションは `sites/drizzle` の独立した履歴です。既存DB用の移行・バックフィルは再利用せず、新しい確認DBに現在の共通スキーマを作成します。将来のスキーマ変更時には、通常の `db:generate` と `db:generate:sites` の両方で追加マイグレーションを生成してください。適用済みの履歴は変更しません。サンプルデータはマイグレーションに含めません。

Sitesの実行環境には次を設定します。秘密値はソースやhosting.jsonへ記載しません。

- `ENGAGEMENT_ADMIN_TOKEN`（secret）：運営画面で使用するキー。
- `ENGAGEMENT_REVIEW_MODE=enabled`：確認用データの作成・発表切替を有効化。通常のイベント環境では設定しないでください。

初回は `/admin?eventId=1` で運営用キーを入力し、「確認用データを準備する」を押します。既存データは上書きしません。運営画面の「動作確認用」から発表を切り替え、別端末の参加者画面で下書きの保持を確認できます。`/api/review-setup` はGET・POST・PATCHのすべてで運営キーを要求し、確認モードが無効なら使用できません。初期データと切り替えの対象はイベント1です。

Siteは初期状態では所有者のみが開ける非公開設定です。Sitesの認証とアプリの運営キーは別の役割です。共有範囲を変更する場合は、確認用データを扱う人と運営キーを渡す人を区別してください。

ホスト先でも `scripts/review-smoke.mjs`、`test:smoke`、`test:engagement` を実行できます。所有者のみのSiteをスクリプトから確認する場合は、Sitesから取得したサービスアクセストークンを `SITES_SERVICE_TOKEN` に、運営キーを `ENGAGEMENT_ADMIN_TOKEN` に一時的に渡します。トークンはURL・引数・ソース・ログへ記載しません。
