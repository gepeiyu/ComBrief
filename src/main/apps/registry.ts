export type AppKind = 'cursor-hooks-json' | 'claude-settings-json';

export interface AppDefinition {
  id: string;
  displayName: string;
  /** 菜单栏圆点旁显示的缩写（macOS setTitle） */
  trayAbbrev: string;
  hooksConfigRelPath: string;
  kind: AppKind;
}

export const APP_REGISTRY: AppDefinition[] = [
  {
    id: 'cursor',
    displayName: 'Cursor',
    trayAbbrev: 'C',
    hooksConfigRelPath: '.cursor/hooks.json',
    kind: 'cursor-hooks-json',
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    trayAbbrev: 'CC',
    hooksConfigRelPath: '.claude/settings.json',
    kind: 'claude-settings-json',
  },
];

export function getAppDefinition(appId: string): AppDefinition {
  const app = APP_REGISTRY.find((a) => a.id === appId);
  if (!app) throw new Error(`Unknown app: ${appId}`);
  return app;
}
