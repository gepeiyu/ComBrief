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
    title: (displayName: string) => string;
    body: string;
  };
  settings: {
    windowTitle: string;
    hint: string;
    notifications: string;
    launchAtLogin: string;
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
    title: (displayName) => `${displayName} needs you`,
    body: 'Return to approve a command or continue the conversation',
  },
  settings: {
    windowTitle: 'ComBrief Settings',
    hint: 'After adding an app, a status dot appears in the menu bar (gray / green / yellow / red). With no apps added, only a gray hub dot is shown.',
    notifications: 'System notification on red light',
    launchAtLogin: 'Launch at login',
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
    title: (displayName) => `${displayName} 需要你`,
    body: '请返回确认运行命令或继续对话',
  },
  settings: {
    windowTitle: 'ComBrief 设置',
    hint: '添加 App 后，菜单栏会出现对应状态灯（灰/绿/黄/红圆点）。未添加时仅显示一个灰色圆点。',
    notifications: '红灯时系统通知',
    launchAtLogin: '开机自启',
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
    title: (displayName) => `${displayName} — 確認が必要です`,
    body: 'コマンドの承認または会話の続行をお願いします',
  },
  settings: {
    windowTitle: 'ComBrief 設定',
    hint: 'App を追加するとメニューバーにステータスドット（灰/緑/黄/赤）が表示されます。未追加時は灰色のハブドットのみです。',
    notifications: '赤ランプ時にシステム通知',
    launchAtLogin: 'ログイン時に起動',
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

/** IPC-safe subset (no functions) for settings / about renderer */
export type RendererMessages = {
  settings: Messages['settings'];
  about: Messages['about'];
};

export function getRendererMessages(locale: Locale): RendererMessages {
  const m = getMessages(locale);
  return { settings: m.settings, about: m.about };
}
