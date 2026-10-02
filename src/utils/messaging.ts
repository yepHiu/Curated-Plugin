export type MessageType =
  | 'ADD_TO_WISHLIST'
  | 'PING'
  | 'GET_TAB_INFO'
  | 'STORAGE_GET'
  | 'STORAGE_SET'
  | 'CHECK_HEALTH'
  | 'CHECK_MOVIE_CODES'
  | 'OPEN_CURATED_MOVIE'
  | 'GET_PLAYBACK_URL'
  | 'BATCH_DELETE_WANT_LIST'
  | 'SAVE_DELETE_TASK'
  | 'READ_DELETE_TASK'
  | 'RESCAN'
  | 'GET_MOVIES'
  | 'GET_SCAN_STATS';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface TabInfo {
  id?: number;
  title?: string;
  url?: string;
}

export function sendMessage<T = unknown>(
  message: ExtensionMessage
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response as T);
    });
  });
}

export function sendTabMessage<T = unknown>(
  tabId: number,
  message: ExtensionMessage
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response as T);
    });
  });
}

export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender
  ) => Promise<unknown> | unknown
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    Promise.resolve(handler(message, sender))
      .then((result) => sendResponse(result))
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true;
  });
}
