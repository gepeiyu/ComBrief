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

/** osascript 无法自定义图标，仅作 Electron 通知失败时的兜底 */
function notifyViaOsascript(options: SystemNotificationOptions): void {
  const subtitle = options.subtitle
    ? ` subtitle "${escapeAppleScriptString(options.subtitle)}"`
    : '';
  const script =
    `display notification "${escapeAppleScriptString(options.body)}" ` +
    `with title "${escapeAppleScriptString(options.title)}"${subtitle}`;
  execFile('osascript', ['-e', script], () => {
    // ignore errors
  });
}

/**
 * macOS 须走 Electron Notification 才会显示应用 bundle 图标；
 * osascript 的通知归属脚本进程，图标不是 ComBrief。
 */
export function showSystemNotification(options: SystemNotificationOptions): void {
  if (!Notification.isSupported()) {
    if (process.platform === 'darwin') notifyViaOsascript(options);
    return;
  }

  const notification = new Notification({
    title: options.title,
    subtitle: process.platform === 'darwin' ? options.subtitle : undefined,
    body: options.body,
    icon: process.platform === 'win32' ? resolveAppIconPath() : undefined,
    silent: false,
  });

  notification.on('failed', () => {
    if (process.platform === 'darwin') notifyViaOsascript(options);
  });

  notification.show();
}
