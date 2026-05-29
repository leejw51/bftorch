// Typed JSON client for the PyTorch Sandbox backend.
// Calls are same-origin (/api, /ws) and proxied to the FastAPI backend by Vite.

import type {
  HealthResponse,
  Lesson,
  LessonsResponse,
  Demo,
  DemosResponse,
  RunResult,
  RunRequest,
  TrainConfig,
  TrainFrame,
  TrainMessage,
} from './types';

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return getJSON<HealthResponse>('/api/health');
}

export async function getLessons(): Promise<Lesson[]> {
  const data = await getJSON<LessonsResponse>('/api/lessons');
  return data.lessons ?? [];
}

export async function getDemos(): Promise<Demo[]> {
  const data = await getJSON<DemosResponse>('/api/demos');
  return data.demos ?? [];
}

export async function runCode(code: string): Promise<RunResult> {
  const body: RunRequest = { code };
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST /api/run failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as RunResult;
}

export interface TrainHandlers {
  onFrame: (frame: TrainFrame) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

/** Build a ws(s)://<host>/ws/train URL from the current location. */
function trainSocketURL(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/train`;
}

/**
 * Open a WebSocket to /ws/train, send `config`, dispatch frames.
 * Returns a cancel() function that closes the socket.
 */
export function trainStream(config: TrainConfig, handlers: TrainHandlers): () => void {
  const { onFrame, onError, onDone } = handlers;
  const ws = new WebSocket(trainSocketURL());
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  ws.onopen = () => {
    ws.send(JSON.stringify(config));
  };

  ws.onmessage = (ev) => {
    let msg: TrainMessage;
    try {
      msg = JSON.parse(ev.data as string) as TrainMessage;
    } catch (err) {
      onError?.(`Bad message from server: ${(err as Error).message}`);
      return;
    }
    if (msg.type === 'error') {
      onError?.(msg.message);
      return;
    }
    if (msg.type === 'frame') {
      onFrame(msg);
      if (msg.done) {
        finish();
      }
    }
  };

  ws.onerror = () => {
    if (!finished) {
      onError?.('WebSocket connection error.');
    }
  };

  ws.onclose = () => {
    finish();
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    finish();
  };
}
