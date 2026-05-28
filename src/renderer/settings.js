const appsEl = document.getElementById('apps');
const errorEl = document.getElementById('error');
const notificationsEl = document.getElementById('notifications');
const launchEl = document.getElementById('launchAtLogin');
const showTrayAbbrevEl = document.getElementById('showTrayAbbrev');
const eventLoggingEl = document.getElementById('eventLogging');
const abbrevsEl = document.getElementById('abbrevs');

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

async function refresh() {
  if (!window.combrief) {
    showError('无法连接 ComBrief，请重启应用。');
    return;
  }

  try {
    const [apps, cfg] = await Promise.all([
      window.combrief.listApps(),
      window.combrief.getConfig(),
    ]);

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
      name.textContent = `${app.displayName}：`;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 2;
      input.placeholder = app.trayAbbrev;
      input.value = cfg.trayAbbrevs?.[app.id] ?? app.trayAbbrev;
      input.disabled = !app.installed;
      input.title = app.installed
        ? '圆点内：最多 2 个字母或 1 个汉字，白色字'
        : '添加 App 后可编辑';
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
      btn.textContent = app.installed ? '移除' : '添加';
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
