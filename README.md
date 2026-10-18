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

`src/db/schema.ts` を編集して、SQLを生成・適用します。初期スキーマには、ID・タイトル・作成日時を持つ `events` テーブルがあります。

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

## Workshop Commons UI

The selected Commons design is implemented in the existing TanStack Start app. Run `bun run dev` and open http://localhost:3000.

| Route | Screen |
| --- | --- |
| / | Event home |
| /venue | Venue guide with Wi-Fi copy and detail accordions |
| /live | Live talk, reactions and comment/name flow |
| /team | Team participation and assignment |
| /admin | Talk controls, moderation and team preview |
| /presenter | Presenter preparation and reaction display |
| /screen | Venue projection with a real participant QR |

The header menu switches roles. The UI adapts at 760px. This is a frontend interaction prototype: data is in memory for the current browser tab. Authentication, backend persistence, cross-device realtime updates and WebRTC media transport are not connected. Sharing preparation currently displays UI states and does not capture a screen.

The original design render functions are scoped to a React host in src/components/commons-page.tsx. CSS lives in src/styles.css; generated illustrations and avatars live in public/assets/commons. Zen Maru Gothic is self-hosted. Standard icons are local assets generated with Phosphor, and qrcode.react encodes the current participant URL.

Validation: `bun run check`, `bun run typecheck`, `bun run build`. An optional browser check is available as `bun run scripts/check-commons-ui.mjs` when Edge is running with a clean profile on debugging port 9228 and Vite is running on port 3000. It verifies all seven views, 390px layout, reactions, comments and navigation.
