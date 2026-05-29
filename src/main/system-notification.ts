import { execFile } from 'node:child_process';
import { Notification } from 'electron';
import { resolveAppIconPath } from './app-icon';

export interface SystemNotificationOptions {
  title: string;
  subtitle?: string;
  body: string;
}

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function notifyViaOsascript(options: SystemNotificationOptions): void {
  const subtitle = options.subtitle
    ? ` subtitle "${escapeAppleScriptString(options.subtitle)}"`
    : '';
  const script =
    `display notification "${escapeAppleScriptString(options.body)}" ` +
    `with title "${escapeAppleScriptString(options.title)}"${subtitle}`;
  execFile('osascript', ['-e', script], () => {
    // ignore errors (e.g. sandbox); Electron path may still work
  });
}

/** 菜单栏应用在开发态下 Electron Notification 常被系统忽略，macOS 用 osascript 更可靠 */
export function showSystemNotification(options: SystemNotificationOptions): void {
  if (process.platform === 'darwin') {
    notifyViaOsascript(options);
    return;
  }

  if (!Notification.isSupported()) return;
  const icon = resolveAppIconPath();
  new Notification({
    title: options.title,
    body: options.subtitle
      ? `${options.subtitle}\n${options.body}`
      : options.body,
    icon,
    silent: false,
  }).show();
}
