import { describe, expect, it } from "vitest";
import WebSocket from "ws";

import { parseClientWebSocketMessage } from "./protocol";
import { RoomWebSocketHub } from "./room-hub";

function fakeSocket(sent: string[]): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: (message: string) => {
      sent.push(message);
    },
  } as unknown as WebSocket;
}

describe("realtime protocol", () => {
  it("parses auth and rejects invalid subscription-like messages", () => {
    expect(parseClientWebSocketMessage({
      type: "AUTH",
      roomId: "room-a",
      playerToken: "token",
    })).toEqual({
      type: "AUTH",
      roomId: "room-a",
      playerToken: "token",
    });
    expect(parseClientWebSocketMessage({ type: "SUBSCRIBE", roomId: "room-a" })).toBeNull();
  });
});

describe("RoomWebSocketHub", () => {
  it("broadcasts only to the matching room without sensitive state", () => {
    const hub = new RoomWebSocketHub();
    const roomASent: string[] = [];
    const roomBSent: string[] = [];

    hub.addClient({
      id: "a",
      roomId: "room-a",
      seat: 0,
      socket: fakeSocket(roomASent),
    });
    hub.addClient({
      id: "b",
      roomId: "room-b",
      seat: 1,
      socket: fakeSocket(roomBSent),
    });

    hub.broadcastStateChanged({
      roomId: "room-a",
      stateVersion: 7,
      actionType: "PLAY_CARDS",
    });

    expect(roomASent).toHaveLength(1);
    expect(roomBSent).toHaveLength(0);

    const payload = JSON.parse(roomASent[0] ?? "{}") as Record<string, unknown>;
    expect(payload).toEqual({
      type: "ROOM_STATE_CHANGED",
      roomId: "room-a",
      stateVersion: 7,
      actionType: "PLAY_CARDS",
    });
    expect(JSON.stringify(payload)).not.toContain("current_state");
    expect(JSON.stringify(payload)).not.toContain("ownHand");
    expect(JSON.stringify(payload)).not.toContain("playerToken");
    expect(JSON.stringify(payload)).not.toContain("requestId");
  });
});
