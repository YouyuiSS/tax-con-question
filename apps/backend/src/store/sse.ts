export type SseEvent = {
  type: string;
  payload: unknown;
};

export type SseClient = {
  id: string;
  send: (event: SseEvent) => void;
};

const adminClients = new Map<string, SseClient>();
const boardClients = new Map<string, SseClient>();

export function addAdminClient(client: SseClient): void {
  adminClients.set(client.id, client);
}

export function removeAdminClient(id: string): void {
  adminClients.delete(id);
}

export function addBoardClient(client: SseClient): void {
  boardClients.set(client.id, client);
}

export function removeBoardClient(id: string): void {
  boardClients.delete(id);
}

export function broadcastAdmin(event: SseEvent): void {
  adminClients.forEach((client) => {
    client.send(event);
  });
}

export function broadcastBoard(event: SseEvent): void {
  boardClients.forEach((client) => {
    client.send(event);
  });
}
