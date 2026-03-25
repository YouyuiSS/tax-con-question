import { clearStoredAdminToken, getStoredAdminToken } from './adminAuth';

export type AdminStreamMessage = {
  event: string;
  data: unknown;
};

type AdminEventStreamOptions = {
  onOpen?: () => void;
  onMessage?: (message: AdminStreamMessage) => void;
  onError?: (error: Error) => void;
};

const MAX_RECONNECT_DELAY_MS = 10000;

function toError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

function dispatchEvent(
  eventName: string,
  dataLines: string[],
  onMessage?: (message: AdminStreamMessage) => void,
): void {
  if (!onMessage || dataLines.length === 0) {
    return;
  }

  const rawData = dataLines.join('\n');

  try {
    onMessage({
      event: eventName,
      data: JSON.parse(rawData),
    });
  } catch {
    onMessage({
      event: eventName,
      data: rawData,
    });
  }
}

async function readEventStream(
  stream: ReadableStream<Uint8Array>,
  onMessage?: (message: AdminStreamMessage) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.length === 0) {
          dispatchEvent(eventName, dataLines, onMessage);
          eventName = 'message';
          dataLines = [];
          continue;
        }

        if (line.startsWith(':')) {
          continue;
        }

        const separatorIndex = line.indexOf(':');
        const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
        const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
        const fieldValue = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

        if (field === 'event' && fieldValue) {
          eventName = fieldValue;
        }

        if (field === 'data') {
          dataLines.push(fieldValue);
        }
      }
    }

    buffer += decoder.decode().replaceAll('\r\n', '\n');

    if (buffer.length > 0) {
      const trailingLines = buffer.split('\n');

      for (const line of trailingLines) {
        if (line.length === 0) {
          dispatchEvent(eventName, dataLines, onMessage);
          eventName = 'message';
          dataLines = [];
          continue;
        }

        if (line.startsWith(':')) {
          continue;
        }

        const separatorIndex = line.indexOf(':');
        const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
        const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
        const fieldValue = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

        if (field === 'event' && fieldValue) {
          eventName = fieldValue;
        }

        if (field === 'data') {
          dataLines.push(fieldValue);
        }
      }
    }

    dispatchEvent(eventName, dataLines, onMessage);
  } finally {
    reader.releaseLock();
  }
}

export function openAdminEventStream(
  input: RequestInfo | URL,
  options: AdminEventStreamOptions = {},
): () => void {
  let isClosed = false;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0;
  let controller: AbortController | null = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (isClosed || reconnectTimer !== null || !getStoredAdminToken()) {
      return;
    }

    const delay = Math.min(1000 * (2 ** reconnectAttempt), MAX_RECONNECT_DELAY_MS);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    const token = getStoredAdminToken();

    if (!token || isClosed) {
      return;
    }

    controller = new AbortController();

    try {
      const response = await fetch(input, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
      });

      if (response.status === 401 || response.status === 403) {
        clearStoredAdminToken();
        throw new Error('管理员令牌无效，请重新输入后再试。');
      }

      if (!response.ok) {
        throw new Error(`实时同步失败（${response.status}）。`);
      }

      if (!response.body) {
        throw new Error('当前环境不支持实时同步。');
      }

      reconnectAttempt = 0;
      options.onOpen?.();
      await readEventStream(response.body, options.onMessage);

      if (!isClosed && !controller.signal.aborted) {
        const error = new Error('实时连接已断开，正在重连。');
        options.onError?.(error);
        scheduleReconnect();
      }
    } catch (error) {
      if (isClosed) {
        return;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      options.onError?.(toError(error, '实时同步失败。'));
      scheduleReconnect();
    }
  };

  void connect();

  return () => {
    isClosed = true;
    clearReconnectTimer();
    controller?.abort();
  };
}
