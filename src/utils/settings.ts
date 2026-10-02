export interface PluginSettings {
  serverUrl: string;
  developerMode: boolean;
  autoRemoveFromWantList: boolean;
}

export const STORAGE_KEY = 'settings';
export const DEFAULT_SERVER_URL = 'http://127.0.0.1:8081';
export const DEFAULT_DEVELOPER_SERVER_URL = 'http://127.0.0.1:8080';

/** 统一地址格式，调用方可直接追加 API 路由。 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  if (!url.endsWith('/api')) {
    url += '/api';
  }
  return url;
}

/** 兼容旧自定义地址，新用户默认关闭开发者模式。 */
export function isDeveloperMode(settings?: Partial<PluginSettings>): boolean {
  return settings?.developerMode ?? Boolean(settings?.serverUrl && normalizeServerUrl(settings.serverUrl) !== normalizeServerUrl(DEFAULT_SERVER_URL));
}

/** 返回当前实际使用的地址，关闭开发者模式时恢复标准端口。 */
export async function getSettings(): Promise<PluginSettings> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<PluginSettings> | undefined;
  const developerMode = isDeveloperMode(stored);
  return {
    serverUrl: normalizeServerUrl(developerMode ? stored?.serverUrl || DEFAULT_DEVELOPER_SERVER_URL : DEFAULT_SERVER_URL),
    developerMode,
    autoRemoveFromWantList: stored?.autoRemoveFromWantList ?? false,
  };
}

/** 保留自定义地址，开关关闭时也不清空用户填写的值。 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
  await chrome.storage.sync.set({
    [STORAGE_KEY]: {
      serverUrl: normalizeServerUrl(settings.serverUrl),
      developerMode: settings.developerMode,
      autoRemoveFromWantList: settings.autoRemoveFromWantList,
    },
  });
}
