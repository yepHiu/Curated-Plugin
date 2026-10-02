import './index.css';
import { sendMessage } from '@/utils/messaging';
import { setButtonBusy } from '@/ui/button-state';
import {
  DEFAULT_SERVER_URL,
  DEFAULT_DEVELOPER_SERVER_URL,
  isDeveloperMode,
  normalizeServerUrl,
  STORAGE_KEY,
  type PluginSettings,
} from '@/utils/settings';

const form = document.getElementById('settings-form') as HTMLFormElement;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const autoRemoveInput = document.getElementById('auto-remove') as HTMLInputElement;
const testBtn = document.getElementById('test-btn') as HTMLButtonElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const developerModeInput = document.getElementById('developer-mode') as HTMLInputElement;
let customServerUrl = DEFAULT_DEVELOPER_SERVER_URL;

/** 根据草稿开关显示实际目标，关闭时保留自定义输入以便再次开启。 */
function renderDeveloperMode() {
  serverUrlInput.readOnly = !developerModeInput.checked;
  serverUrlInput.value = displayUrl(developerModeInput.checked ? customServerUrl : DEFAULT_SERVER_URL);
  serverUrlInput.placeholder = developerModeInput.checked ? DEFAULT_DEVELOPER_SERVER_URL : DEFAULT_SERVER_URL;
}

developerModeInput.addEventListener('change', () => { /* 开关切换不丢弃尚未保存的自定义地址。 */
  if (!developerModeInput.checked) customServerUrl = serverUrlInput.value;
  renderDeveloperMode();
});

/** 显示设置操作的结果。 */
function setStatus(text: string, type: 'success' | 'error' | '' = ''): void {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

/** 展示地址时省略内部 API 后缀。 */
function displayUrl(url: string): string {
  return url.replace(/\/api$/, '');
}

/** 载入统一设置，并兼容旧插件已经保存的自定义地址。 */
async function loadSettings(): Promise<void> {
  try {
    const settings = await sendMessage<PluginSettings>({
      type: 'STORAGE_GET',
      payload: STORAGE_KEY,
    });

    developerModeInput.checked = isDeveloperMode(settings);
    customServerUrl = settings?.serverUrl ?? DEFAULT_DEVELOPER_SERVER_URL;
    renderDeveloperMode();
    autoRemoveInput.checked = settings?.autoRemoveFromWantList ?? false;
  } catch (err) {
    setStatus(`加载失败: ${(err as Error).message}`, 'error');
  }
}

testBtn.addEventListener('click', async () => { /* 测试当前显示的草稿地址，不要求先保存。 */
  const url = normalizeServerUrl(serverUrlInput.value);
  if (!url) {
    setStatus('请输入服务端地址', 'error');
    return;
  }

  setButtonBusy(testBtn, true, '测试中...');
  setStatus('正在测试连接...');
  try {
    const result = await sendMessage<{
      ok: boolean;
      health: { name: string; version: string };
    }>({
      type: 'CHECK_HEALTH',
      payload: url,
    });
    setStatus(
      `连接成功：${result.health.name} (${result.health.version})`,
      'success'
    );
  } catch (err) {
    setStatus(`连接失败: ${(err as Error).message}`, 'error');
  } finally {
    setButtonBusy(testBtn, false);
  }
});

form.addEventListener('submit', async (e) => { /* 保存开关与自定义地址。 */
  e.preventDefault();

  if (developerModeInput.checked) customServerUrl = serverUrlInput.value;
  const settings: PluginSettings = {
    serverUrl: normalizeServerUrl(customServerUrl),
    developerMode: developerModeInput.checked,
    autoRemoveFromWantList: autoRemoveInput.checked,
  };

  if (!settings.serverUrl) {
    setStatus('请输入有效的服务端地址', 'error');
    return;
  }

  setButtonBusy(saveBtn, true, '保存中...');
  try {
    await sendMessage({
      type: 'STORAGE_SET',
      payload: { key: STORAGE_KEY, value: settings },
    });
    customServerUrl = settings.serverUrl;
    renderDeveloperMode();
    setStatus('设置已保存', 'success');
  } catch (err) {
    setStatus(`保存失败: ${(err as Error).message}`, 'error');
  } finally {
    setButtonBusy(saveBtn, false);
  }
});

renderDeveloperMode();
loadSettings();
