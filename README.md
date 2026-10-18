# Workshop Commons

LT会・勉強会・ハッカソンの参加登録、発表進行、交流をまとめたWebアプリです。参加者・登壇者・運営に、それぞれの役割に合った画面を提供します。共有画面を見ながらリアクションやコメントで参加できます。

[公開アプリ](https://workshop-commons-main-oct18.yamichi.chatgpt.site)

## 主な機能

- QRによる参加登録、プロフィール編集、スマホとPCのペアリング、端末解除
- 重要なお知らせ、Wi-Fiの個別コピー、会場案内の閲覧と運営設定
- 参加者一覧、自己紹介・Xプロフィールの検索と表示
- 発表の登録・編集・並べ替え、開始・一時停止・再開・終了とタイマー
- 参加者・登壇者・視聴ページでの進行状態の共有
- 発表者本人による画面共有と、運営による投影対象の切り替え
- 4種類のリアクション、発表別コメント、運営による受付制御・非表示

チーム編成、スライドファイル配信、コメントのスクリーン投影は未実装です。画面共有の利用条件と会場案内の操作は[開発・運営ガイド](docs/development.md)を参照してください。

## ローカルで起動する

Node.js 22.12以降とBun 1.3.13を用意してください。

```sh
bun install
bun run db:migrate
bun run db:seed
bun run cf-typegen
bun run dev
```

[http://localhost:3000](http://localhost:3000)で起動します。開発用D1はローカルに保存され、閲覧とDB接続にCloudflareへのログインは不要です。

運営操作を試す場合は、起動前に `.dev.vars.example` を `.dev.vars` としてコピーし、`ORGANIZER_KEY` を固有の値へ変更してください。既存の `.dev.vars` は上書きしないでください。[運営用リンクと操作手順](docs/development.md#ltを進行する)を参照できます。

## 主な画面

| URL | 用途 |
| --- | --- |
| `/` | ホーム・参加登録への案内 |
| `/events/1` | 参加登録・プロフィール・端末管理 |
| `/events/1/connect` | PCの接続用QR |
| `/events/1/guide` | 会場案内 |
| `/events/1/participants` | 参加者一覧・Xプロフィール（参加登録が必要） |
| `/speaker` | 登壇者向け表示 |
| `/screen` | 共有画面の視聴・リアクション・コメント |
| `/admin` | LT進行（運営認証が必要） |
| `/admin/comments?eventId=1` | コメント管理（運営認証が必要） |
| `/admin/guide?eventId=1` | 会場案内の設定（運営認証が必要） |

`1` はローカルサンプルイベントのIDです。スマホとPCで試す場合は、両方から開ける同一のHTTPS URLを使います。

## 技術構成

TanStack Start / React / TypeScript、Cloudflare Workers / D1、Drizzle ORM、Bunを使用しています。

## 資料

- [使い方ガイド](docs/usage-guide.md)：ログイン・参加登録後の役割別案内と画面共有の手順
- [開発・運営ガイド](docs/development.md)：セットアップ、運営操作、API、DB、検証、公開手順
- [ハッカソン作品紹介](docs/hackathon.md)：解決する課題、設計の狙い、DevDay新機能の活用、実装へのリンク
