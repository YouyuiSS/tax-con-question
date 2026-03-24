import type { QuestionEvent } from '../types.js';

export type SseClient = {
  id: string;
  send: (event: QuestionEvent) => void;
};

const clients = new Map<string, SseClient>();

export function addClient(client: SseClient): void {
  clients.set(client.id, client);
}

export function removeClient(id: string): void {
  clients.delete(id);
}

export function broadcast(event: QuestionEvent): void {
  clients.forEach((client) => {
    client.send(event);
  });
}
