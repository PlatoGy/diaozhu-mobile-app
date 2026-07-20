import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import next from "next";
import WebSocket, { WebSocketServer } from "ws";

import { getPlayerStateForToken } from "./src/lib/game/state-service";
import { parseClientWebSocketMessage, serializeServerMessage } from "./src/lib/realtime/protocol";
import { getRoomWebSocketHub } from "./src/lib/realtime/room-hub";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname, port, webpack: true });
const handle = app.getRequestHandler();
const hub = getRoomWebSocketHub();

type ConnectionState = {
  id: string;
  authenticated: boolean;
  isAlive: boolean;
};

function send(socket: WebSocket, message: Parameters<typeof serializeServerMessage>[0]): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(serializeServerMessage(message));
  }
}

function closeWithError(socket: WebSocket, code: string, message: string): void {
  send(socket, {
    type: "ERROR",
    code,
    message,
  });
  socket.close();
}

app.prepare().then(() => {
  const server = createServer((request, response) => {
    handle(request, response);
  });
  const nextUpgradeHandler = app.getUpgradeHandler();
  const webSocketServer = new WebSocketServer({ noServer: true });
  const connections = new Map<WebSocket, ConnectionState>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname !== "/ws") {
      void nextUpgradeHandler(request, socket, head).catch(() => {
        socket.destroy();
      });
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    const connection: ConnectionState = {
      id: randomUUID(),
      authenticated: false,
      isAlive: true,
    };
    connections.set(socket, connection);

    socket.on("pong", () => {
      connection.isAlive = true;
    });

    socket.on("message", (rawMessage) => {
      void (async () => {
        let parsedJson: unknown;

        try {
          parsedJson = JSON.parse(rawMessage.toString());
        } catch {
          closeWithError(socket, "INVALID_MESSAGE", "消息格式无效");
          return;
        }

        const message = parseClientWebSocketMessage(parsedJson);

        if (!message) {
          closeWithError(socket, "INVALID_MESSAGE", "消息格式无效");
          return;
        }

        if (message.type === "PING") {
          send(socket, { type: "PONG" });
          return;
        }

        if (connection.authenticated) {
          closeWithError(socket, "ALREADY_AUTHENTICATED", "连接已经完成认证");
          return;
        }

        const state = await getPlayerStateForToken(message.roomId, message.playerToken);

        if (!state.ok) {
          closeWithError(socket, "AUTH_FAILED", "玩家身份验证失败");
          return;
        }

        connection.authenticated = true;
        hub.addClient({
          id: connection.id,
          roomId: state.state.room.id,
          seat: state.state.me.seat,
          socket,
        });
        send(socket, {
          type: "AUTH_OK",
          roomId: state.state.room.id,
          seat: state.state.me.seat,
          stateVersion: state.state.room.version,
        });
      })();
    });

    socket.on("close", () => {
      hub.removeClient(connection.id);
      connections.delete(socket);
    });

    socket.on("error", () => {
      hub.removeClient(connection.id);
      connections.delete(socket);
    });
  });

  const heartbeat = setInterval(() => {
    for (const [socket, connection] of connections.entries()) {
      if (!connection.isAlive) {
        hub.removeClient(connection.id);
        connections.delete(socket);
        socket.terminate();
        continue;
      }

      connection.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  webSocketServer.on("close", () => {
    clearInterval(heartbeat);
  });

  server.listen(port, hostname, () => {
    console.log(`> Server listening at http://${hostname}:${port}`);
  });
});
