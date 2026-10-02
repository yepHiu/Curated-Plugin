import type { DeleteResult } from '@/types/movie';
import { sendMessage } from '@/utils/messaging';

export interface DeleteTask {
  id: string;
  tabId: number;
}

export type DeleteTaskState =
  | { id: string; status: 'pending' }
  | { id: string; status: 'completed'; result: DeleteResult }
  | { id: string; status: 'failed'; error: string };

export function deleteTaskKey(task: DeleteTask): string {
  return `curatedPluginDeleteResult:${task.tabId}`;
}

export async function saveDeleteTask(task: DeleteTask, state: DeleteTaskState): Promise<void> {
  await sendMessage({ type: 'SAVE_DELETE_TASK', payload: { task, state } });
}

export async function waitForDeleteResult(
  task: DeleteTask,
  timeoutMs = 120000
): Promise<DeleteResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Only the background accesses storage; no live page is needed to read results.
    const { state } = await sendMessage<{ state: DeleteTaskState | null }>({
      type: 'READ_DELETE_TASK', payload: task,
    });
    if (state?.id === task.id) {
      if (state.status === 'completed') return state.result;
      if (state.status === 'failed') throw new Error(state.error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('未能确认删除结果，页面可能已关闭或刷新，请检查想看列表后再操作');
}
