# Slack remote approval — setup guide

If you can only use **Slack** while away (no Claude App), follow these eight steps to connect ComBrief. Claude Code runs on your office Mac; you approve or deny from a Slack channel.

## Overview

```text
Create Slack App
  → Enable Socket Mode + Bot scopes
  → Install to Workspace
  → Create channel, invite Bot
  → Fill tokens + Channel ID in ComBrief Settings
  → Reinstall Claude Code Hooks
  → Test
```

---

## Step 1: Create a Slack app

1. Open [Slack API apps](https://api.slack.com/apps) (your network must reach Slack API; ask IT if blocked).
2. Click **Create New App** → **From scratch**.
3. **App Name**: e.g. `ComBrief` or `Claude Approvals`.
4. **Workspace**: pick your company workspace.

---

## Step 2: Enable Socket Mode (required)

ComBrief connects to Slack via **Socket Mode** (outbound). Your office machine does **not** need a public URL.

1. Left sidebar **Socket Mode** → turn on **Enable Socket Mode**.
2. Click **Generate App-Level Token**:
   - Token Name: e.g. `combrief-socket`
   - Scope: **`connections:write`**
3. Copy the **`xapp-…`** token (shown once) → ComBrief **App-Level Token for Socket Mode**.

---

## Step 3: Bot scopes

**OAuth & Permissions** → **Scopes** → **Bot Token Scopes**, add at least:

| Scope | Purpose |
|--------|---------|
| `chat:write` | Post approval cards |
| `channels:read` | Read public channel metadata |

**For private channels (recommended), you must also add:**

| Scope | Purpose |
|--------|---------|
| `groups:read` | Lets the bot access **private channels** it has been invited to |

> If you add `groups:read` after Step 3, go back to this page and click **Reinstall to Workspace** so the new scope takes effect.

---

## Step 4: Install to workspace

1. On **OAuth & Permissions**, click **Install to Workspace** → Allow.
2. Copy **Bot User OAuth Token** (`xoxb-…`) → ComBrief **Bot User OAuth Token**.

---

## Step 5: Channel and Bot invite

Use a **private channel** for approval cards so random coworkers cannot click your buttons.

### Create a private channel

1. In Slack, click **+** next to **Channels** → **Create a channel**.
2. Name it e.g. `claude-approvals`.
3. Choose **Private** — only invited members can see it.
4. Invite only yourself and colleagues who need remote approval access.

### Invite the Bot into the private channel

The bot is **not** added to private channels automatically. Without an invite, test messages and cards will fail.

1. Open the private channel.
2. Run: `/invite @YourBotName` (use your app name from Step 1).
3. Or: channel name → **Integrations** / **Members** → **Add apps** → select your bot.

You should see the app listed as a channel member.

### Get the channel ID

ComBrief needs the **channel ID**, not `#channel-name`.

| Method | Steps |
|--------|--------|
| Slack client | Open the private channel → click the name at the top → scroll down → copy **Channel ID** |
| Browser | Open the channel; URL often ends with `…/archives/C01234567` or `…/archives/G01234567` |

**ID prefix:**

- Often `C…` (many workspaces use `C` for private channels too)
- Sometimes `G…` for private channels
- Either works in ComBrief — copy the ID **exactly** as shown in channel details

### Public channel (optional)

If you must use a public channel: create as **Public**, invite the bot the same way. You may skip `groups:read` (private is still recommended).

---

## Step 6: ComBrief settings

In **Slack remote approval** (ComBrief Settings window):

1. Check **Enable Slack remote approval**
2. **Bot User OAuth Token**: `xoxb-…`
3. **App-Level Token**: `xapp-…`
4. **Channel ID**: paste the ID from channel details (`C…` or `G…`, not `#channel-name`)
5. Click **Send test message** → channel should show “ComBrief Slack is connected”
6. Status should show **Slack: connected**

Stored in `~/.combrief/config.json` under `slack`. **Do not** commit tokens to git or paste them in public channels.

---

## Step 7: Claude Code Hooks

1. In ComBrief Settings for **Claude Code**:
   - Not added yet → **Add**
   - Already added → **Reinstall Hooks** from the tray menu (installs `remote-gate.mjs`)
2. **Node.js 20+** must be available on the machine.

---

## Step 8: Verify

1. Office machine: Claude Code works, ComBrief is running, Slack shows connected.
2. Run `claude` and trigger a confirmation (e.g. Bash that needs approval).
3. Expected:
   - Slack channel shows a **button card**;
   - Local CLI can also **Allow** (dual channel; first wins);
   - From away, use Slack **Allow/Deny** only;
   - After you click, buttons disappear and a resolved status line appears.

---

## Troubleshooting

| Issue | Fix |
|------|------|
| Test fails (private channel) | Bot **invited** with `/invite`? **`groups:read`** added and app **reinstalled**? ID matches details (`C…`/`G…`)? |
| Test fails (public channel) | Bot invited? ID is not `#name` |
| `not_in_channel` error | Common for private channels: bot not in channel — run `/invite @Bot` inside the channel |
| Socket disconnected | `xapp-…` has `connections:write`? Outbound `*.slack.com` allowed? |
| Buttons do nothing | Is ComBrief running? Slack still **connected** in settings? |
| Cannot install custom app | Workspace **admin** must approve the app |

---

## Security

- Use a **private channel** with only trusted members.
- Optional: `allowedUserIds` in `config.json` (Slack user IDs `U…`).
- If a token leaks, **revoke and regenerate** in the Slack app settings.
