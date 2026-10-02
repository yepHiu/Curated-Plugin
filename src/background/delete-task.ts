import { deleteTaskKey, type DeleteTask, type DeleteTaskState } from '@/utils/delete-task';
import type { ExtensionMessage } from '@/utils/messaging';

function validTask(value: unknown): value is DeleteTask {
  const task = value as DeleteTask | undefined;
  return !!task && typeof task.id === 'string' && task.id.length > 0 && task.id.length <= 128
    && Number.isInteger(task.tabId) && task.tabId >= 0;
}

function validState(value: unknown, task: DeleteTask): value is DeleteTaskState {
  const state = value as DeleteTaskState | undefined;
  if (!state || state.id !== task.id) return false;
  if (state.status === 'pending') return true;
  if (state.status === 'failed') return typeof state.error === 'string';
  if (state.status !== 'completed' || !state.result) return false;
  return [state.result.deleted, state.result.failed, state.result.skipped]
    .every((count) => Number.isInteger(count) && count >= 0);
}

/** Storage remains private to trusted extension contexts, including after upgrades. */
export async function handleDeleteTaskMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  if (sender.id !== chrome.runtime.id) throw new Error('Invalid delete task sender');
  if (message.type === 'READ_DELETE_TASK') {
    if (sender.url !== chrome.runtime.getURL('popup.html')) throw new Error('Invalid delete task reader');
    const task = message.payload;
    if (!validTask(task)) throw new Error('Invalid delete task');
    const data = await chrome.storage.local.get(deleteTaskKey(task));
    const state = data[deleteTaskKey(task)] as DeleteTaskState | undefined;
    return { state: state?.id === task.id ? state : null };
  }
  if (message.type !== 'SAVE_DELETE_TASK') throw new Error('Invalid delete task message');
  const payload = message.payload as { task?: unknown; state?: unknown } | undefined;
  if (!payload || !validTask(payload.task) || !validState(payload.state, payload.task)) {
    throw new Error('Invalid delete task state');
  }
  const { task, state } = payload;
  if (sender.tab?.id !== task.tabId || sender.frameId !== 0
    || !sender.url?.startsWith('https://javdb.com/users/want_watch_videos')) {
    throw new Error('Invalid delete task writer');
  }
  const key = deleteTaskKey(task);
  if (state.status !== 'pending') {
    const data = await chrome.storage.local.get(key);
    const current = data[key] as DeleteTaskState | undefined;
    if (current?.id !== task.id || current.status !== 'pending') {
      throw new Error('删除任务已失效，请检查想看列表');
    }
  }
  await chrome.storage.local.set({ [key]: state });
  return { ok: true };
}
