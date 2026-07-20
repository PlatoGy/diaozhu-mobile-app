import WebSocket from "ws";

import {
  serializeServerMessage,
  type GameActionType,
  type ServerWebSocketMessage,
} from "./protocol";
import type { Seat } from "../game/types";

type RoomClient = {
  id: string;
  roomId: string;
  seat: Seat;
  socket: WebSocket;
};

type StateChangedInput = {
  roomId: string;
  stateVersion: number;
  actionType: GameActionType;
};

export class RoomWebSocketHub {
  private readonly clientsByRoom = new Map<string, Map<string, RoomClient>>();

  addClient(client: RoomClient): void {
    const roomClients = this.clientsByRoom.get(client.roomId) ?? new Map<string, RoomClient>();
    roomClients.set(client.id, client);
    this.clientsByRoom.set(client.roomId, roomClients);
  }

  removeClient(clientId: string): void {
    for (const [roomId, clients] of this.clientsByRoom.entries()) {
      if (!clients.delete(clientId)) {
        continue;
      }

      if (clients.size === 0) {
        this.clientsByRoom.delete(roomId);
      }

      return;
    }
  }

  getRoomConnectionCount(roomId: string): number {
    return this.clientsByRoom.get(roomId)?.size ?? 0;
  }

  broadcastStateChanged(input: StateChangedInput): void {
    this.broadcast(input.roomId, {
      type: "ROOM_STATE_CHANGED",
      roomId: input.roomId,
      stateVersion: input.stateVersion,
      actionType: input.actionType,
    });
  }

  private broadcast(roomId: string, message: ServerWebSocketMessage): void {
    const clients = this.clientsByRoom.get(roomId);

    if (!clients) {
      return;
    }

    const serialized = serializeServerMessage(message);

    for (const client of clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(serialized);
      }
    }
  }
}

const globalHubKey = Symbol.for("diaozhu.roomWebSocketHub");

type GlobalWithHub = typeof globalThis & {
  [globalHubKey]?: RoomWebSocketHub;
};

export function getRoomWebSocketHub(): RoomWebSocketHub {
  const globalWithHub = globalThis as GlobalWithHub;

  if (!globalWithHub[globalHubKey]) {
    globalWithHub[globalHubKey] = new RoomWebSocketHub();
  }

  return globalWithHub[globalHubKey];
}
