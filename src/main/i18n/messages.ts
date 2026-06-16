export type Locale = 'en' | 'zh' | 'ja';

export type Messages = {
  status: Record<'idle' | 'working' | 'waiting_user' | 'offline', string>;
  tray: {
    hubTooltip: string;
    settings: string;
    about: string;
    quit: string;
    appSettings: string;
    reinstallHooks: string;
    removeApp: string;
  };
  notify: {
    title: () => string;
    subtitle: (displayName: string) => string;
    body: string;
  };
  settings: {
    windowTitle: string;
    hint: string;
    notifications: string;
    launchAtLogin: string;
    launchAtLoginFailed: string;
    launchAtLoginApproval: string;
    launchAtLoginDisabled: string;
    showTrayAbbrev: string;
    eventLogging: string;
    language: string;
    localeEn: string;
    localeZh: string;
    localeJa: string;
    abbrevHint: string;
    abbrevHintDisabled: string;
    add: string;
    remove: string;
    connectError: string;
    slackSection: string;
    slackEnabled: string;
    slackBotToken: string;
    slackAppToken: string;
    slackChannelId: string;
    slackTest: string;
    slackStatusConnected: string;
    slackStatusDisconnected: string;
    hardwareSection: string;
    hardwareEnabled: string;
    hardwareConnect: string;
    hardwareDisconnect: string;
    hardwareTestDisplay: string;
    hardwareStatusConnected: string;
    hardwareStatusDisconnected: string;
    hardwareStatusNeedsReconnect: string;
    slackCardTitle: string;
    slackSetupGuide: string;
    slackSetupGuideTitle: string;
  };
  remotePairing: {
    title: string;
    description: string;
    button: string;
    initialStatus: string;
    scanningStatus: string;
    connectingStatus: string;
    connectedStatus: string;
    errorPrefix: string;
  };
  slackCard: {
    allowOnce: string;
    deny: string;
    allowAlways: (detail: string) => string;
    resolvedAllowSlack: (userId: string) => string;
    resolvedAllowLocal: () => string;
    resolvedAllowAlwaysSlack: (detail: string, userId: string) => string;
    resolvedAllowAlwaysLocal: (detail: string) => string;
    resolvedDenySlack: (userId: string) => string;
    resolvedDenyLocal: () => string;
    resolvedOptionSlack: (optionLabel: string, userId: string) => string;
    resolvedOptionLocal: () => string;
    resolvedAlready: () => string;
    cardRequestedAt: (time: string) => string;
    cardResolvedAt: (requested: string, resolved: string) => string;
  };
  about: {
    windowTitle: string;
    description: string;
    versionPrefix: string;
    ok: string;
  };
  app: {
    hooksReinstalledTitle: string;
    hooksReinstalledBody: (displayName: string, hooksPath: string) => string;
    installFailedTitle: string;
    unknownError: string;
  };
};

const en: Messages = {
  status: {
    idle: 'Idle',
    working: 'Working',
    waiting_user: 'Needs approval',
    offline: 'Offline',
  },
  tray: {
    hubTooltip: 'ComBrief — Right-click for settings and add AI apps',
    settings: 'Settings…',
    about: 'About',
    quit: 'Quit ComBrief',
    appSettings: 'ComBrief Settings…',
    reinstallHooks: 'Reinstall Hooks',
    removeApp: 'Remove This App',
  },
  notify: {
    title: () => 'ComBrief',
    subtitle: (displayName) => `${displayName} needs you`,
    body: 'Return to approve a command or continue the conversation',
  },
  settings: {
    windowTitle: 'ComBrief Settings',
    hint: 'After adding an app, a status dot appears in the menu bar (gray / green / yellow / red). With no apps added, only a gray hub dot is shown.',
    notifications: 'System notification on red light',
    launchAtLogin: 'Launch at login',
    launchAtLoginFailed:
      'Could not enable launch at login. On Windows, check Task Manager → Startup apps; on macOS, sign and notarize the app or allow it under Login Items.',
    launchAtLoginApproval:
      'Allow ComBrief under System Settings → General → Login Items, then turn this on again.',
    launchAtLoginDisabled:
      'ComBrief is disabled under Task Manager → Startup apps. Enable it there, then turn this on again.',
    showTrayAbbrev: 'Show abbreviation inside dot',
    eventLogging: 'Write debug logs (~/.combrief/logs)',
    language: 'Language',
    localeEn: 'English',
    localeZh: '中文',
    localeJa: '日本語',
    abbrevHint: 'Inside dot: up to 2 letters or 1 CJK character, white text',
    abbrevHintDisabled: 'Add the app first to edit',
    add: 'Add',
    remove: 'Remove',
    connectError: 'Cannot connect to ComBrief. Please restart the app.',
    slackSection: 'Slack remote approval (Claude Code)',
    slackEnabled: 'Enable Slack remote approval',
    slackBotToken: 'Bot User OAuth Token (xoxb-…)',
    slackAppToken: 'App-Level Token for Socket Mode (xapp-…)',
    slackChannelId: 'Channel ID (C… or G… for private)',
    slackTest: 'Send test message',
    slackStatusConnected: 'Slack: connected',
    slackStatusDisconnected: 'Slack: disconnected',
    hardwareSection: 'ComBrief Remote',
    hardwareEnabled: 'Enable ComBrief Remote',
    hardwareConnect: 'Connect Remote',
    hardwareDisconnect: 'Disconnect',
    hardwareTestDisplay: 'Test display',
    hardwareStatusConnected: 'Remote: connected',
    hardwareStatusDisconnected: 'Remote: disconnected',
    hardwareStatusNeedsReconnect: 'Needs reconnect',
    slackCardTitle: 'Claude Code needs your approval',
    slackSetupGuide: 'Open Slack setup guide…',
    slackSetupGuideTitle: 'Slack remote approval — setup guide',
  },
  remotePairing: {
    title: 'Pair ComBrief Remote',
    description: 'Click the button below, then choose your ComBrief Remote in the Bluetooth picker.',
    button: 'Connect ComBrief Remote',
    initialStatus: 'Waiting for your click to start Bluetooth pairing.',
    scanningStatus: 'Scanning for ComBrief Remote… Keep the HaaS EDU K1 powered on and showing Waiting BLE.',
    connectingStatus: 'Device selected. Connecting to ComBrief Remote…',
    connectedStatus: 'Connected. You can leave this window open.',
    errorPrefix: 'Connection failed: ',
  },
  slackCard: {
    allowOnce: 'Allow once',
    deny: 'Deny',
    allowAlways: (detail) => `Always allow: ${detail}`,
    resolvedAllowSlack: (userId) => `✅ *Allowed once* — <@${userId}>`,
    resolvedAllowLocal: () => '✅ *Allowed once* — confirmed on this Mac',
    resolvedAllowAlwaysSlack: (detail, userId) =>
      `✅ *Always allow: ${detail}* — <@${userId}>`,
    resolvedAllowAlwaysLocal: (detail) =>
      `✅ *Always allow: ${detail}* — confirmed in terminal`,
    resolvedDenySlack: (userId) => `❌ *Denied* — <@${userId}>`,
    resolvedDenyLocal: () => '❌ *Denied* — confirmed on this Mac',
    resolvedOptionSlack: (optionLabel, userId) =>
      `📌 *Selected: ${optionLabel}* — <@${userId}>`,
    resolvedOptionLocal: () => '📌 *Confirmed on this Mac*',
    resolvedAlready: () => 'ℹ️ This request was already handled',
    cardRequestedAt: (time) => `🕐 *Requested* ${time}`,
    cardResolvedAt: (requested, resolved) =>
      `🕐 *Requested* ${requested}  ·  *Handled* ${resolved}`,
  },
  about: {
    windowTitle: 'About',
    description:
      'Menu bar status lights for Cursor, Claude Code, and other AI tools.',
    versionPrefix: 'Version',
    ok: 'OK',
  },
  app: {
    hooksReinstalledTitle: 'ComBrief',
    hooksReinstalledBody: (displayName, hooksPath) =>
      `${displayName} hooks reinstalled\n${hooksPath}`,
    installFailedTitle: 'ComBrief — Install failed',
    unknownError: 'Unknown error',
  },
};

const zh: Messages = {
  status: {
    idle: '空闲',
    working: '工作中',
    waiting_user: '等待确认',
    offline: '离线',
  },
  tray: {
    hubTooltip: 'ComBrief — 右键打开设置，添加 AI App',
    settings: '设置…',
    about: '关于',
    quit: '退出 ComBrief',
    appSettings: 'ComBrief 设置…',
    reinstallHooks: '重新安装 Hooks',
    removeApp: '移除此 App',
  },
  notify: {
    title: () => 'ComBrief',
    subtitle: (displayName) => `${displayName} 需要你`,
    body: '请返回确认运行命令或继续对话',
  },
  settings: {
    windowTitle: 'ComBrief 设置',
    hint: '添加 App 后，菜单栏会出现对应状态灯（灰/绿/黄/红圆点）。未添加时仅显示一个灰色圆点。',
    notifications: '红灯时系统通知',
    launchAtLogin: '开机自启',
    launchAtLoginFailed:
      '未能启用开机自启。Windows 请在任务管理器 → 启动应用 中检查；macOS 需签名公证应用，或在 登录项 中允许。',
    launchAtLoginApproval:
      '请在 系统设置 → 通用 → 登录项 中允许 ComBrief，然后重新勾选。',
    launchAtLoginDisabled:
      'ComBrief 在任务管理器 → 启动应用 中被禁用，请先启用后再勾选。',
    showTrayAbbrev: '圆点内显示缩写',
    eventLogging: '写入调试日志（~/.combrief/logs）',
    language: '语言',
    localeEn: 'English',
    localeZh: '中文',
    localeJa: '日本語',
    abbrevHint: '圆点内：最多 2 个字母或 1 个汉字，白色字',
    abbrevHintDisabled: '添加 App 后可编辑',
    add: '添加',
    remove: '移除',
    connectError: '无法连接 ComBrief，请重启应用。',
    slackSection: 'Slack 远程确认（Claude Code）',
    slackEnabled: '启用 Slack 远程确认',
    slackBotToken: 'Bot User OAuth Token (xoxb-…)',
    slackAppToken: 'Socket Mode App Token (xapp-…)',
    slackChannelId: '频道 ID（私有频道多为 C… 或 G…）',
    slackTest: '发送测试消息',
    slackStatusConnected: 'Slack：已连接',
    slackStatusDisconnected: 'Slack：未连接',
    hardwareSection: 'ComBrief Remote',
    hardwareEnabled: '启用 ComBrief Remote',
    hardwareConnect: '连接遥控器',
    hardwareDisconnect: '断开连接',
    hardwareTestDisplay: '测试显示',
    hardwareStatusConnected: 'Remote：已连接',
    hardwareStatusDisconnected: 'Remote：未连接',
    hardwareStatusNeedsReconnect: '需要重新连接',
    slackCardTitle: 'Claude Code 需要你确认',
    slackSetupGuide: '打开 Slack 配置指南…',
    slackSetupGuideTitle: 'Slack 远程确认 — 配置指南',
  },
  remotePairing: {
    title: '配对 ComBrief Remote',
    description: '点击下面的按钮，然后在蓝牙选择器中选择你的 ComBrief Remote。',
    button: '连接 ComBrief Remote',
    initialStatus: '等待点击按钮开始蓝牙配对。',
    scanningStatus: '正在扫描 ComBrief Remote… 请保持 HaaS EDU K1 开机，并显示 Waiting BLE。',
    connectingStatus: '已选择设备，正在连接 ComBrief Remote…',
    connectedStatus: '已连接。此窗口可以保持打开。',
    errorPrefix: '连接失败：',
  },
  slackCard: {
    allowOnce: '允许（本次）',
    deny: '拒绝',
    allowAlways: (detail) => `始终允许：${detail}`,
    resolvedAllowSlack: (userId) => `✅ *已允许（本次）* — <@${userId}>`,
    resolvedAllowLocal: () => '✅ *已允许（本次）* — 本机已确认',
    resolvedAllowAlwaysSlack: (detail, userId) =>
      `✅ *始终允许：${detail}* — <@${userId}>`,
    resolvedAllowAlwaysLocal: (detail) =>
      `✅ *始终允许：${detail}* — 本机终端已确认`,
    resolvedDenySlack: (userId) => `❌ *已拒绝* — <@${userId}>`,
    resolvedDenyLocal: () => '❌ *已拒绝* — 本机已确认',
    resolvedOptionSlack: (optionLabel, userId) =>
      `📌 *已选择：${optionLabel}* — <@${userId}>`,
    resolvedOptionLocal: () => '📌 *已在本机确认*',
    resolvedAlready: () => 'ℹ️ 该待办已处理',
    cardRequestedAt: (time) => `🕐 *请求时间* ${time}`,
    cardResolvedAt: (requested, resolved) =>
      `🕐 *请求* ${requested}  ·  *处理* ${resolved}`,
  },
  about: {
    windowTitle: '关于',
    description: '为 Cursor、Claude Code 等 AI 工具显示菜单栏状态灯。',
    versionPrefix: '版本',
    ok: '好',
  },
  app: {
    hooksReinstalledTitle: 'ComBrief',
    hooksReinstalledBody: (displayName, hooksPath) =>
      `${displayName} Hooks 已重新安装\n${hooksPath}`,
    installFailedTitle: 'ComBrief — 安装失败',
    unknownError: '未知错误',
  },
};

const ja: Messages = {
  status: {
    idle: '待機',
    working: '作業中',
    waiting_user: '確認待ち',
    offline: 'オフライン',
  },
  tray: {
    hubTooltip:
      'ComBrief — 右クリックで設定と AI アプリの追加',
    settings: '設定…',
    about: 'ComBrief について',
    quit: 'ComBrief を終了',
    appSettings: 'ComBrief 設定…',
    reinstallHooks: 'Hooks を再インストール',
    removeApp: 'この App を削除',
  },
  notify: {
    title: () => 'ComBrief',
    subtitle: (displayName) => `${displayName} — 確認が必要です`,
    body: 'コマンドの承認または会話の続行をお願いします',
  },
  settings: {
    windowTitle: 'ComBrief 設定',
    hint: 'App を追加するとメニューバーにステータスドット（灰/緑/黄/赤）が表示されます。未追加時は灰色のハブドットのみです。',
    notifications: '赤ランプ時にシステム通知',
    launchAtLogin: 'ログイン時に起動',
    launchAtLoginFailed:
      'ログイン時の起動を有効にできませんでした。Windows はタスクマネージャー → スタートアップ、macOS は署名・公証またはログイン項目での許可を確認してください。',
    launchAtLoginApproval:
      'システム設定 → 一般 → ログイン項目 で ComBrief を許可してから、再度オンにしてください。',
    launchAtLoginDisabled:
      'タスクマネージャー → スタートアップ で ComBrief が無効です。有効にしてから再度オンにしてください。',
    showTrayAbbrev: 'ドット内に略称を表示',
    eventLogging: 'デバッグログを書き込む（~/.combrief/logs）',
    language: '言語',
    localeEn: 'English',
    localeZh: '中文',
    localeJa: '日本語',
    abbrevHint: 'ドット内：英字2文字または漢字1文字、白文字',
    abbrevHintDisabled: 'App 追加後に編集できます',
    add: '追加',
    remove: '削除',
    connectError: 'ComBrief に接続できません。アプリを再起動してください。',
    slackSection: 'Slack リモート承認（Claude Code）',
    slackEnabled: 'Slack リモート承認を有効化',
    slackBotToken: 'Bot User OAuth Token (xoxb-…)',
    slackAppToken: 'Socket Mode App Token (xapp-…)',
    slackChannelId: 'チャンネル ID（非公開は C… または G…）',
    slackTest: 'テストメッセージを送信',
    slackStatusConnected: 'Slack: 接続済み',
    slackStatusDisconnected: 'Slack: 未接続',
    hardwareSection: 'ComBrief Remote',
    hardwareEnabled: 'ComBrief Remote を有効化',
    hardwareConnect: 'リモコンに接続',
    hardwareDisconnect: '切断',
    hardwareTestDisplay: '表示をテスト',
    hardwareStatusConnected: 'Remote: 接続済み',
    hardwareStatusDisconnected: 'Remote: 未接続',
    hardwareStatusNeedsReconnect: '再接続が必要です',
    slackCardTitle: 'Claude Code の承認が必要です',
    slackSetupGuide: 'Slack 設定ガイドを開く…',
    slackSetupGuideTitle: 'Slack リモート承認 — 設定ガイド',
  },
  remotePairing: {
    title: 'ComBrief Remote をペアリング',
    description: '下のボタンをクリックし、Bluetooth ピッカーで ComBrief Remote を選択してください。',
    button: 'ComBrief Remote に接続',
    initialStatus: 'Bluetooth ペアリング開始待ちです。',
    scanningStatus: 'ComBrief Remote をスキャン中… HaaS EDU K1 の電源を入れ、Waiting BLE 表示を確認してください。',
    connectingStatus: 'デバイスを選択しました。ComBrief Remote に接続中…',
    connectedStatus: '接続しました。このウィンドウは開いたままで構いません。',
    errorPrefix: '接続失敗: ',
  },
  slackCard: {
    allowOnce: '許可（今回のみ）',
    deny: '拒否',
    allowAlways: (detail) => `常に許可: ${detail}`,
    resolvedAllowSlack: (userId) => `✅ *許可（今回のみ）* — <@${userId}>`,
    resolvedAllowLocal: () => '✅ *許可（今回のみ）* — この Mac で確認',
    resolvedAllowAlwaysSlack: (detail, userId) =>
      `✅ *常に許可: ${detail}* — <@${userId}>`,
    resolvedAllowAlwaysLocal: (detail) =>
      `✅ *常に許可: ${detail}* — ターミナルで確認`,
    resolvedDenySlack: (userId) => `❌ *拒否* — <@${userId}>`,
    resolvedDenyLocal: () => '❌ *拒否* — この Mac で確認',
    resolvedOptionSlack: (optionLabel, userId) =>
      `📌 *選択: ${optionLabel}* — <@${userId}>`,
    resolvedOptionLocal: () => '📌 *この Mac で確認済み*',
    resolvedAlready: () => 'ℹ️ このリクエストは処理済みです',
    cardRequestedAt: (time) => `🕐 *リクエスト* ${time}`,
    cardResolvedAt: (requested, resolved) =>
      `🕐 *リクエスト* ${requested}  ·  *処理* ${resolved}`,
  },
  about: {
    windowTitle: 'ComBrief について',
    description:
      'Cursor、Claude Code などの AI ツール用メニューバーステータスランプ。',
    versionPrefix: 'バージョン',
    ok: 'OK',
  },
  app: {
    hooksReinstalledTitle: 'ComBrief',
    hooksReinstalledBody: (displayName, hooksPath) =>
      `${displayName} の Hooks を再インストールしました\n${hooksPath}`,
    installFailedTitle: 'ComBrief — インストール失敗',
    unknownError: '不明なエラー',
  },
};

export const MESSAGES: Record<Locale, Messages> = { en, zh, ja };

export function resolveLocale(raw?: string): Locale {
  if (raw === 'zh' || raw === 'ja' || raw === 'en') return raw;
  return 'en';
}

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

export type SlackCardLabels = {
  slackCardTitle: string;
  slackAllowOnce: string;
  slackDeny: string;
  slackAllowAlways: (detail: string) => string;
  slackResolvedAllowSlack: (userId: string) => string;
  slackResolvedAllowLocal: () => string;
  slackResolvedAllowAlwaysSlack: (detail: string, userId: string) => string;
  slackResolvedAllowAlwaysLocal: (detail: string) => string;
  slackResolvedDenySlack: (userId: string) => string;
  slackResolvedDenyLocal: () => string;
  slackResolvedOptionSlack: (optionLabel: string, userId: string) => string;
  slackResolvedOptionLocal: () => string;
  slackResolvedAlready: () => string;
  slackCardRequestedAt: (time: string) => string;
  slackCardResolvedAt: (requested: string, resolved: string) => string;
};

export function getSlackCardLabels(locale: Locale): SlackCardLabels {
  const m = getMessages(locale);
  const c = m.slackCard;
  return {
    slackCardTitle: m.settings.slackCardTitle,
    slackAllowOnce: c.allowOnce,
    slackDeny: c.deny,
    slackAllowAlways: c.allowAlways,
    slackResolvedAllowSlack: c.resolvedAllowSlack,
    slackResolvedAllowLocal: c.resolvedAllowLocal,
    slackResolvedAllowAlwaysSlack: c.resolvedAllowAlwaysSlack,
    slackResolvedAllowAlwaysLocal: c.resolvedAllowAlwaysLocal,
    slackResolvedDenySlack: c.resolvedDenySlack,
    slackResolvedDenyLocal: c.resolvedDenyLocal,
    slackResolvedOptionSlack: c.resolvedOptionSlack,
    slackResolvedOptionLocal: c.resolvedOptionLocal,
    slackResolvedAlready: c.resolvedAlready,
    slackCardRequestedAt: c.cardRequestedAt,
    slackCardResolvedAt: c.cardResolvedAt,
  };
}

/** IPC-safe subset (no functions) for settings / about renderer */
export type RendererMessages = {
  settings: Messages['settings'];
  about: Messages['about'];
};

export function getRendererMessages(locale: Locale): RendererMessages {
  const m = getMessages(locale);
  return { settings: m.settings, about: m.about };
}
