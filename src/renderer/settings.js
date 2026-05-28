const appsEl = document.getElementById('apps');
const errorEl = document.getElementById('error');
const hintEl = document.getElementById('hint');
const notificationsEl = document.getElementById('notifications');
const launchEl = document.getElementById('launchAtLogin');
const showTrayAbbrevEl = document.getElementById('showTrayAbbrev');
const eventLoggingEl = document.getElementById('eventLogging');
const abbrevsEl = document.getElementById('abbrevs');
const localeEl = document.getElementById('locale');

let strings = null;

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
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
  document.title = m.settings.windowTitle;
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
    showTrayAbbrevEl.checked = cfg.showTrayAbbrev !== false;
    eventLoggingEl.checked = cfg.eventLoggingEnabled === true;
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
  void window.combrief?.setConfig({ launchAtLogin: launchEl.checked });
};

showTrayAbbrevEl.onchange = () => {
  void window.combrief?.setConfig({ showTrayAbbrev: showTrayAbbrevEl.checked });
};

eventLoggingEl.onchange = () => {
  void window.combrief?.setConfig({
    eventLoggingEnabled: eventLoggingEl.checked,
  });
};

void refresh();
