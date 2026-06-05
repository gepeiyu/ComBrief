const appsEl = document.getElementById('apps');
const errorEl = document.getElementById('error');
const hintEl = document.getElementById('hint');
const notificationsEl = document.getElementById('notifications');
const launchEl = document.getElementById('launchAtLogin');
const launchHintEl = document.getElementById('launchAtLoginHint');
const showTrayAbbrevEl = document.getElementById('showTrayAbbrev');
const eventLoggingEl = document.getElementById('eventLogging');
const abbrevsEl = document.getElementById('abbrevs');
const localeEl = document.getElementById('locale');
const slackEnabledEl = document.getElementById('slackEnabled');
const slackBotTokenEl = document.getElementById('slackBotToken');
const slackAppTokenEl = document.getElementById('slackAppToken');
const slackChannelIdEl = document.getElementById('slackChannelId');
const slackTestEl = document.getElementById('slackTest');
const slackSetupGuideEl = document.getElementById('slackSetupGuide');
const slackStatusEl = document.getElementById('slackStatus');

let strings = null;

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function launchAtLoginHintMessage(issue, m) {
  if (!issue || !m?.settings) return '';
  if (issue === 'requires-approval') return m.settings.launchAtLoginApproval;
  if (issue === 'disabled') return m.settings.launchAtLoginDisabled;
  return m.settings.launchAtLoginFailed;
}

function showLaunchAtLoginHint(issue, m) {
  if (!launchHintEl) return;
  const text = launchAtLoginHintMessage(issue, m);
  launchHintEl.textContent = text;
  launchHintEl.hidden = !text;
}

function applyStaticStrings(m) {
  const loc = localeEl?.value ?? 'en';
  document.documentElement.lang =
    loc === 'zh' ? 'zh-CN' : loc === 'ja' ? 'ja' : 'en';
  if (hintEl) hintEl.textContent = m.settings.hint;
  const textNotifications = document.getElementById('text-notifications');
  const textLaunch = document.getElementById('text-launchAtLogin');
  const textAbbrev = document.getElementById('text-showTrayAbbrev');
  const textLogging = document.getElementById('text-eventLogging');
  const textLanguage = document.getElementById('text-language');
  if (textNotifications) textNotifications.textContent = m.settings.notifications;
  if (textLaunch) textLaunch.textContent = m.settings.launchAtLogin;
  if (textAbbrev) textAbbrev.textContent = m.settings.showTrayAbbrev;
  if (textLogging) textLogging.textContent = m.settings.eventLogging;
  if (textLanguage) textLanguage.textContent = m.settings.language;
  const textSlackSection = document.getElementById('text-slackSection');
  const textSlackEnabled = document.getElementById('text-slackEnabled');
  const textSlackBot = document.getElementById('text-slackBotToken');
  const textSlackApp = document.getElementById('text-slackAppToken');
  const textSlackChannel = document.getElementById('text-slackChannelId');
  if (textSlackSection) textSlackSection.textContent = m.settings.slackSection;
  if (textSlackEnabled) textSlackEnabled.textContent = m.settings.slackEnabled;
  if (textSlackBot) textSlackBot.textContent = m.settings.slackBotToken;
  if (textSlackApp) textSlackApp.textContent = m.settings.slackAppToken;
  if (textSlackChannel) textSlackChannel.textContent = m.settings.slackChannelId;
  if (slackTestEl) slackTestEl.textContent = m.settings.slackTest;
  if (slackSetupGuideEl) {
    slackSetupGuideEl.textContent = m.settings.slackSetupGuide;
  }
  document.title = m.settings.windowTitle;
}

async function refreshSlackStatus(m) {
  if (!slackStatusEl || !window.combrief?.slackStatus) return;
  try {
    const st = await window.combrief.slackStatus();
    slackStatusEl.textContent = st.connected
      ? m.settings.slackStatusConnected
      : m.settings.slackStatusDisconnected;
    if (st.lastError) {
      slackStatusEl.textContent += ` — ${st.lastError}`;
    }
  } catch {
    slackStatusEl.textContent = m.settings.slackStatusDisconnected;
  }
}

async function refresh() {
  if (!window.combrief) {
    showError(strings?.settings.connectError ?? 'Cannot connect to ComBrief. Please restart the app.');
    return;
  }

  try {
    const [apps, cfg, m] = await Promise.all([
      window.combrief.listApps(),
      window.combrief.getConfig(),
      window.combrief.getMessages(),
    ]);
    strings = m;
    applyStaticStrings(m);

    localeEl.value = cfg.locale ?? 'en';
    notificationsEl.checked = cfg.notificationsEnabled;
    launchEl.checked = cfg.launchAtLogin;
    showLaunchAtLoginHint(cfg.launchAtLoginIssue, m);
    showTrayAbbrevEl.checked = cfg.showTrayAbbrev !== false;
    eventLoggingEl.checked = cfg.eventLoggingEnabled === true;
    if (slackEnabledEl) slackEnabledEl.checked = cfg.slack?.enabled === true;
    if (slackBotTokenEl) slackBotTokenEl.value = cfg.slack?.botToken ?? '';
    if (slackAppTokenEl) slackAppTokenEl.value = cfg.slack?.appToken ?? '';
    if (slackChannelIdEl) slackChannelIdEl.value = cfg.slack?.channelId ?? '';
    await refreshSlackStatus(m);
    if (errorEl) errorEl.hidden = true;

    abbrevsEl.innerHTML = '';
    for (const app of apps) {
      const row = document.createElement('div');
      row.className = 'abbrev-row';
      const name = document.createElement('span');
      name.textContent = `${app.displayName}: `;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 2;
      input.placeholder = app.trayAbbrev;
      input.value = cfg.trayAbbrevs?.[app.id] ?? app.trayAbbrev;
      input.disabled = !app.installed;
      input.title = app.installed
        ? m.settings.abbrevHint
        : m.settings.abbrevHintDisabled;
      input.onchange = () => {
        const raw = input.value.trim();
        void window.combrief?.setConfig({
          trayAbbrevs: { [app.id]: raw },
        }).then(() => refresh());
      };
      row.append(name, input);
      abbrevsEl.append(row);
    }

    appsEl.innerHTML = '';
    for (const app of apps) {
      const row = document.createElement('div');
      row.className = 'app';

      const label = document.createElement('span');
      label.textContent = app.displayName;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = app.installed ? m.settings.remove : m.settings.add;
      btn.className = app.installed ? '' : 'primary';
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          if (app.installed) {
            await window.combrief.uninstallApp(app.id);
          } else {
            await window.combrief.installApp(app.id);
          }
          await refresh();
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
        } finally {
          btn.disabled = false;
        }
      };

      row.append(label, btn);
      appsEl.append(row);
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
}

localeEl.onchange = () => {
  void window.combrief
    ?.setConfig({ locale: localeEl.value })
    .then(() => refresh());
};

notificationsEl.onchange = () => {
  void window.combrief?.setConfig({
    notificationsEnabled: notificationsEl.checked,
  });
};

launchEl.onchange = () => {
  void window.combrief
    ?.setConfig({ launchAtLogin: launchEl.checked })
    .then((cfg) => {
      if (!cfg) return;
      launchEl.checked = cfg.launchAtLogin;
      showLaunchAtLoginHint(cfg.launchAtLoginIssue, strings);
    });
};

showTrayAbbrevEl.onchange = () => {
  void window.combrief?.setConfig({ showTrayAbbrev: showTrayAbbrevEl.checked });
};

eventLoggingEl.onchange = () => {
  void window.combrief?.setConfig({
    eventLoggingEnabled: eventLoggingEl.checked,
  });
};

function slackPatch() {
  return {
    slack: {
      enabled: slackEnabledEl?.checked ?? false,
      botToken: slackBotTokenEl?.value?.trim() ?? '',
      appToken: slackAppTokenEl?.value?.trim() ?? '',
      channelId: slackChannelIdEl?.value?.trim() ?? '',
    },
  };
}

if (slackEnabledEl) {
  slackEnabledEl.onchange = () => {
    void window.combrief?.setConfig(slackPatch()).then(() => refresh());
  };
}
for (const el of [slackBotTokenEl, slackAppTokenEl, slackChannelIdEl]) {
  if (!el) continue;
  el.onchange = () => {
    void window.combrief?.setConfig(slackPatch()).then(() => refresh());
  };
}
if (slackSetupGuideEl) {
  slackSetupGuideEl.onclick = () => {
    void window.combrief?.openSlackSetupGuide();
  };
}
if (slackTestEl) {
  slackTestEl.onclick = async () => {
    slackTestEl.disabled = true;
    try {
      const patch = slackPatch();
      if (!patch.slack.enabled) {
        patch.slack.enabled = true;
        if (slackEnabledEl) slackEnabledEl.checked = true;
      }
      await window.combrief?.setConfig(patch);
      await window.combrief?.testSlack();
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      slackTestEl.disabled = false;
    }
  };
}

void refresh();
