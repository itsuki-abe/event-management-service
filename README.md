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

http://localhost:3000 で起動します。開発時のD1はローカルの `.wrangler/state` に保存します。閲覧とDB接続にはCloudflareへのログインは不要です。運営操作には後述の `ORGANIZER_KEY` を設定します。

## PC・モバイルの画面構成

参照デザインの **Workshop Commons** に合わせ、紙色（`#FAF9F4`）・青（`#3054DB`）・杏（`#F5B28C`）・黄色（`#F5DB67`）とZen Maru Gothicを使用します。参照デザインに合わせて生成した共同制作イラスト・アバターを `public/assets/commons/` に同梱し、ホーム・チーム・登壇者表示に使用しています。

参加登録前のホームは、現在のイベント名、スマホで登録するためのQRコードと簡単な案内を表示します。QRは同じ公開URLのイベント別参加ページを開きます。スマホで閲覧している場合は「参加登録へ進む」から直接登録できます。登録状態の確認中やイベントが未作成の場合は、参加用リンクを表示しません。登録ページでも参加者メニューを隠し、登録完了後にライブ・会場・チーム、プロフィールと端末接続の導線を表示します。

登録後はPCで上部ナビゲーションと左右2カラム、760px以下のモバイルで縦並びと固定の下部4タブ（ホーム・会場・ライブ・チーム）に切り替わります。ホームは `/`、参加登録は `/events/1`、PC／Mac接続は `/events/1/connect` です。ヘッダーのプロフィール・PCアイコンから登録と端末接続へ進めます。

会場案内 `/events/1/guide` は `event_guides` の公開データを表示し、モバイルでは開閉式、PCでは項目選択式です。重要なお知らせはホームにも表示します。チーム画面 `/events/1/team` は未案内時の表示のみで、編成・所属管理機能は別Issueの範囲です。架空の参加者・発表・Wi-Fi・チーム情報は表示しません。

## 会場案内を設定する（#10・#11・#12）

運営用リンクでログインしたあと、運営画面の「会場案内の設定」から `/admin/guide?eventId=1` を開きます。重要なお知らせ、Wi-Fi、トイレ、入退館、ハウスルール、問い合わせ先、ハッシュタグ、その他を設定できます。各項目の「参加者に公開する」を選び、「変更を保存」で反映します。見出しや本文が未入力の項目、非表示の項目は参加者画面に出ません。Wi-FiはSSIDが未入力の場合に表示されず、パスワードが空欄ならパスワード不要の案内になります。

参加者は `/events/1/guide` から登録なしで閲覧できます。重要なお知らせを先頭に表示し、SSID・パスワード・ハッシュタグを個別にコピーできます。コピーが許可されない端末では値を手動選択できます。案内内のHTTP(S)・メール・電話リンクを開けます。案内は約15秒ごとと画面への復帰時に更新します。通信失敗時は取得済みの情報を残し、再試行できます。

編集APIは `GET /api/events/:eventId/guide/manage` と `POST /api/events/:eventId/guide/manage` で、既存の運営用Cookieが必要です。保存は対象イベントの案内一式をトランザクションで置き換えます。同時に編集する場合は最後に保存した内容が反映されます。公開APIは既存の `GET /api/events/:eventId/guide` を使い、空欄・非表示項目を返しません。Wi-Fiの `content` は `{ "ssid": "...", "password": "...", "note": "..." }` のJSON文字列で、SSIDとパスワードの空白や記号をそのまま保持します。

`bun run test:venue:browser` はビルド後に一時DBとローカルWorkerで参加者画面・運営設定・コピー・非表示・通信エラー・PC／スマホ表示を検証します。確認画像は `output/venue-qa/` に保存します。

## LTを進行する

`.dev.vars.example` を `.dev.vars` にコピーし、`ORGANIZER_KEY` を推測できない固有の値に変更してから開発サーバーを起動します。

運営者は運営用リンク `/api/login?key=<ORGANIZER_KEY>` を一度開きます。ブラウザーに運営用のCookieが保存され、`/admin` に移動します。運営チームにはこのリンクを共有してください。キーを入力する画面はありません。

1. 初回はイベント名を登録します。
2. 「発表を追加」からタイトル・発表者・持ち時間（`5` や `3:30`）を登録します。順番は発表一覧の上下ボタンで変更し、未開始の発表は編集・削除できます。
3. 発表一覧から発表を選び、準備ができたら「タイマー開始」を押します。
4. 「一時停止」「再開」「発表を終了」「次の発表へ」で進行します。次へ進めてもタイマーは自動開始しません。誤って開始・終了した場合は「タイマーを開始前に戻す」で戻せます。

参加者は `/live`、発表者は `/speaker`、会場スクリーンは表示専用の `/screen` を開きます。閲覧に運営用リンクは不要です。約1.5秒ごとに状態を取得し、端末の時計との差を補正して残り時間を表示します。時間超過は超過時間として表示し、自動では終了しません。再読込・再接続後はD1に保存した状態へ戻ります。

同時に進行できる発表は1件で、別の運営者の操作と競合した場合は最新の状態で再操作を求めます。終了時には実際の経過秒数を保存します。

`GET /api/lt` はイベント・発表一覧・選択中の発表・共有時刻を返します。`POST /api/lt` の変更には運営用Cookieが必要です。リアクション・コメントは `/engagement`、コメント管理は `/admin/comments` で利用できます。画面共有は別Issueの範囲です。参加QRについては次の節を参照してください。

## 参加者登録とスマホ・PCの接続（Issue #22）

ローカルの `db:seed` はID 1のサンプルイベントを作成します。既存イベントは上書きしません。本番イベントは運営画面で事前に作成してください。未認証のイベント作成APIや運営権限の自己登録は用意していません。

| ページ | 用途 |
| --- | --- |
| `/` | Workshop Commonsのホーム・現在の発表 |
| `/events/1/qr` | 会場に掲示・印刷する参加QR |
| `/events/1` | スマホでの初回登録、プロフィール編集、端末接続・解除 |
| `/events/1/connect` | PC／Macで接続QRを表示し、接続完了を待つ |

1. スマホでホームまたは会場のQRを読み取り、ニックネーム（1〜40文字）を登録します。Xのユーザ名（半角英数字・アンダースコアで15文字以内、先頭の`@`は任意）と自己紹介（500文字以内）は任意です。Xのユーザ名はプロフィールから編集・削除でき、接続したPC／Macでも共有されます。
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

LTのAPI動作を確認する場合は、空のローカルDBで開発サーバーを起動し、そのサーバーと同じ `ORGANIZER_KEY` を環境変数に設定して実行します。既存イベントがあるDBでは変更せず停止します。

```sh
ORGANIZER_KEY=... bun run test:lt http://localhost:3000
```

運営用リンク、発表の登録・編集・並べ替え・削除、競合する開始、一時停止・再開・超過・やり直し・終了、次の発表への切り替え、状態の再取得を確認します。

ブラウザーでの通し確認は、ビルドしたWorkerを空の一時DBで起動して実行します。Playwrightのブラウザーが必要です。

```sh
bun run test:browser
```

運営画面・参加者画面・発表者画面・会場スクリーンの同期、再読込、再接続、スマートフォン幅での表示を確認します。

`bun run format` で整形します。D1バインディングを変更した場合は `bun run cf-typegen` で型を再生成してください。

## Cloudflareに公開する

### Sitesに公開する

Sitesの公開先は `.openai/hosting.json` に記録します。`bun run build:sites` は既存のTanStack Start Worker・静的アセットに加え、Sites用の設定と `drizzle/` のマイグレーションを `dist/.openai/` に同梱し、Cloudflareがローカルプレビュー用に出力したシークレットを取り除きます。Sitesが `DB` のD1を作成し、公開時にマイグレーションを適用します。ローカルのDB・サンプルデータは公開先へコピーしません。

本番の運営操作にはSitesの環境変数で `ORGANIZER_KEY` をシークレットとして設定します。新規Sitesは所有者限定で、共有範囲はSites側で管理します。

### Cloudflareへ直接公開する

リモートのD1とWorkerは未作成です。`wrangler.jsonc` の `database_id` はローカル開発用の仮値です。

公開する場合はCloudflareにログインし、D1を作成します。

```sh
bunx wrangler login
bunx wrangler d1 create event-management-service
```

出力されたデータベースIDで `wrangler.jsonc` の `d1_databases[0].database_id` を置き換えてください。`binding` は `DB`、`migrations_dir` は `drizzle` を維持します。

本番の `ORGANIZER_KEY` を `bunx wrangler secret put ORGANIZER_KEY` で設定してください。`.dev.vars` はローカル開発用です。

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
bun run db:seed:engagement
cp .dev.vars.example .dev.vars
```

`.dev.vars` の `ORGANIZER_KEY` を十分に長いランダムな値に変更してから `bun run dev` で起動します。既存の `.dev.vars` は上書きしないでください。参加者の閲覧・投稿にはキーは不要です。LT進行とコメント管理は共通の運営用リンク・Cookieで認証します。キー未設定なら運営操作は拒否します。本番で利用する場合は `wrangler secret put ORGANIZER_KEY` で設定し、参加者に公開しないでください。

- `/engagement?eventId=1`：交流用LTライブ。`event_live_state.selected_talk_id` の発表を表示し、初回コメント送信時に表示名を入力します。
- `/admin/comments?eventId=1`：運営用リンクでログイン後、共通の運営メニューから移動。発表別のコメント・集計、受付停止／再開、非表示、投影許可の切り替え。
- サンプルはイベント1・発表1と2。再投入は既存データ・現在の進行状態を上書きしません。既存のIDと重なるDBでは、イベント／登壇者の関係を確認してから投入してください。

### APIと他領域との接続

`GET /api/engagement?eventId=1` は現在の発表・全発表一覧・反応数・コメント・受付／投影許可を返します。`talkId` を付けると特定の発表を参照できます。表示名や本文の入力なしで閲覧できます。タイマーは共通DBの `duration_seconds`・`elapsed_seconds`・`resumed_at`・`status` から表示し、DBへ毎秒書き込みません。タイマーの操作は行いません。

`POST /api/engagement` のJSONは共通の `eventId` と `talkId` に加えて次を指定します。

- リアクション：`action: "reaction"`, `kind: "applause" | "like" | "learn" | "hot"`。
- コメント：`action: "comment"`, `displayName`（空白を除き1〜40文字）, `body`（1〜200文字、Unicodeコードポイント単位）。

初回送信で `participants` と `device_sessions` を作り、24時間のHttpOnly Cookieを返します。セッショントークンはSHA-256ハッシュのみをDBへ保存します。リアクションは同じ参加者が毎秒最大1回送信でき、重複を許容して送信数を数えます。Cookieの削除による制限回避を防ぐ仕組みではありません。

`PATCH /api/engagement` は運営用リンクで発行したHttpOnly Cookieが必要です。

- `action: "settings"`, `eventId`, `commentsEnabled`, `commentsProjectionEnabled`：受付と投影許可を独立して設定。
- `action: "hide"`, `eventId`, `commentId`：対象イベントのコメントを非表示にする。
- `GET` に `admin=1` と運営用Cookieを付けると、非表示コメントも管理用に取得できます。一般向け取得には含めません。

コメントとリアクションは、#7の整数ID・イベント一致の複合外部キーを使います。追加マイグレーションは投稿時の表示名を保持する `talk_comments.display_name` と、送信間隔チェック用インデックスだけです。コメント成功時は共通参加者のニックネームも更新し、過去の投稿の表示名は変えません。

各画面は2秒ごとに状態を再取得します。発表が切り替わっても下書きの投稿対象は保持し、本人が明示的に切り替えるまでは元の発表へ送信します。受付停止はサーバーの保存時にも検証します。失敗時は入力を保持し、再接続後に再送できます。コメント一覧は最新200件です。

`comments_projection_enabled` は設定の保存までです。実際の会場投影画面はこの状態と非表示を除いたコメントを参照して接続してください。運営権限はLT進行と共通のHttpOnly Cookieに保存するため、画面の移動・再読込でキーの再入力は不要です。

### 交流機能の確認

ローカルサンプルDBと開発サーバーを起動した状態で実行します。テストはサンプルイベント1にリアクションとコメントを作り、最後にテストコメントを非表示、受付・投影設定を元に戻します。本番イベントには実行しないでください。

```sh
bun run test:engagement
```

4種類の送信・別リクエストからの取得・発表ごとの分離・連打制限・200文字と表示名の検証・受付停止／再開・非表示・運営認証・別サイトからの送信拒否を確認します。

全画面に共通の上部タブからLTライブ・LT進行・コメント管理へ移動できます。LTライブ内では発表・タイマーとリアクション・コメントを切り替えます。LT進行は `/admin`、交流のコメント管理は `/admin/comments` で、共通の「運営管理」メニューにまとめています。参加者は `/` または `/live` の発表画面から「リアクション・コメント」を開けます。

## UI統合の方針（PR #28）

DB連携済みのReact画面へCommonsのアセットを統合しています。ローカルのフォントとアイコンを利用し、Google Fontsへの重複した外部読み込みと旧デモ描画モジュールを削除しました。会場案内・チームはイベントID付きルート、発表者は `/speaker` を使用します。
