# Slack リモート承認 — 設定ガイド

外出先で **Slack のみ**使える場合（Claude App 不可）、次の 8 手順で ComBrief を接続します。オフィスの Mac で Claude Code を動かし、Slack チャンネルから承認します。

## 概要

```text
Slack App 作成
  → Socket Mode + Bot スコープ
  → Workspace にインストール
  → チャンネル作成、Bot を招待
  → ComBrief 設定に Token + Channel ID
  → Claude Code Hooks を再インストール
  → テスト
```

---

## 手順 1: Slack アプリを作成

1. [Slack API apps](https://api.slack.com/apps) を開く（社内ネットでブロックされている場合は IT に相談）。
2. **Create New App** → **From scratch**。
3. **App Name**: 例 `ComBrief`。
4. **Workspace**: 会社の Workspace を選択。

---

## 手順 2: Socket Mode を有効化（必須）

ComBrief は **Socket Mode**（アウトバウンド）で Slack に接続します。オフィス Mac に **公開 URL は不要**です。

1. 左メニュー **Socket Mode** → **Enable Socket Mode** をオン。
2. **Generate App-Level Token**:
   - Token Name: 例 `combrief-socket`
   - Scope: **`connections:write`**
3. 表示された **`xapp-…`** をコピー（一度だけ表示）→ ComBrief の **Socket Mode App Token**。

---

## 手順 3: Bot スコープ

**OAuth & Permissions** → **Scopes** → **Bot Token Scopes** に最低限:

| Scope | 用途 |
|--------|------|
| `chat:write` | 承認カードを投稿 |
| `channels:read` | 公開チャンネル情報 |

**プライベートチャンネル（推奨）を使う場合は必須:**

| Scope | 用途 |
|--------|------|
| `groups:read` | Bot が招待された**プライベートチャンネル**にアクセス |

> 手順 3 の後に `groups:read` を追加した場合、**Reinstall to Workspace** で権限を反映してください。

---

## 手順 4: Workspace にインストール

1. **OAuth & Permissions** で **Install to Workspace** → 許可。
2. **Bot User OAuth Token**（`xoxb-…`）をコピー → ComBrief の **Bot User OAuth Token**。

---

## 手順 5: チャンネルと Bot 招待

承認カードは **プライベートチャンネル** を推奨（関係者以外の誤操作を防ぐ）。

### プライベートチャンネルを作成

1. Slack 左の **チャンネル** 横の **+** → **チャンネルを作成**。
2. 名前例: `claude-approvals`。
3. 公開範囲は **プライベート**（招待メンバーのみ）。
4. 自分とリモート承認が必要な同僚だけ招待。

### Bot をプライベートチャンネルに招待

Bot はプライベートチャンネルに**自動では入りません**。未招待だとテストもカードも届きません。

1. プライベートチャンネルを開く。
2. `/invite @Bot名` を実行（手順 1 の App 名）。
3. または: チャンネル名 → **メンバー** / **アプリを追加** → Bot を選択。

メンバー一覧にアプリが表示されれば OK。

### チャンネル ID の取得

ComBrief には **チャンネル ID** を入力（`#名前` ではない）。

| 方法 | 操作 |
|------|------|
| Slack クライアント | チャンネルを開く → 上部の名前 → 最下部の **チャンネル ID** をコピー |
| ブラウザ | URL の `…/archives/C01234567` または `…/archives/G01234567` の末尾 |

**ID の接頭辞:** 多くは `C…`、一部は `G…`。詳細に表示された ID を**そのまま**入力。

### 公開チャンネル（任意）

公開でよい場合: **公開**で作成し、同様に Bot を招待。`groups:read` は不要な場合あり（プライベート推奨）。

---

## 手順 6: ComBrief 設定

ComBrief 設定の **Slack リモート承認** で:

1. **Slack リモート承認を有効化** にチェック
2. **Bot User OAuth Token**: `xoxb-…`
3. **App-Level Token**: `xapp-…`
4. **チャンネル ID**: 詳細の ID を貼り付け（`C…` または `G…`、`#名前` ではない）
5. **テストメッセージを送信** → 「ComBrief Slack is connected」
6. 状態が **Slack: 接続済み** になること

`~/.combrief/config.json` の `slack` に保存されます。Token を git や公開チャンネルに載せないでください。

---

## 手順 7: Claude Code Hooks

1. ComBrief 設定の **Claude Code**:
   - 未追加 → **追加**
   - 追加済み → トレイメニューから **Hooks を再インストール**（`remote-gate.mjs`）
2. 本機に **Node.js 20+** が必要です。

---

## 手順 8: 動作確認

1. オフィス Mac: Claude Code 動作、ComBrief 起動、Slack 接続済み。
2. `claude` を実行し、承認が必要な操作を試す。
3. 期待動作:
   - Slack に **ボタン付きカード**;
   - ローカル CLI でも **Allow** 可能（先に処理した側が有効）;
   - 外出時は Slack の **許可/拒否** のみ;
   - クリック後、ボタンが消え処理済み表示になる。

---

## トラブルシューティング

| 問題 | 対処 |
|------|------|
| テスト失敗（プライベート） | Bot を `/invite` 済み？ **`groups:read`** 追加後に **再インストール**？ ID は `C…`/`G…` と一致？ |
| テスト失敗（公開） | Bot 招待済み？ ID は `#名前` ではない |
| `not_in_channel` | プライベートで多い: チャンネル内で `/invite @Bot` |
| Socket 未接続 | `xapp-…` に `connections:write`？ 出站 `*.slack.com` 許可？ |
| ボタン無反応 | ComBrief 起動中？ 設定で **接続済み**？ |
| カスタム App 不可 | Workspace **管理者**の承認が必要 |

---

## セキュリティ

- **プライベートチャンネル**を推奨。
- 任意: `config.json` の `allowedUserIds`（`U…`）。
- Token 漏洩時は Slack で **Revoke して再発行**。
