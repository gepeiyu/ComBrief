import { execFile } from 'node:child_process';
import { Notification } from 'electron';

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function notifyViaOsascript(title: string, body: string): void {
  const script = `display notification "${escapeAppleScriptString(body)}" with title "${escapeAppleScriptString(title)}"`;
  execFile('osascript', ['-e', script], () => {
    // ignore errors (e.g. sandbox); Electron path may still work
  });
}

/** 菜单栏应用在开发态下 Electron Notification 常被系统忽略，macOS 用 osascript 更可靠 */
export function showSystemNotification(title: string, body: string): void {
  if (process.platform === 'darwin') {
    notifyViaOsascript(title, body);
    return;
  }

  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}
