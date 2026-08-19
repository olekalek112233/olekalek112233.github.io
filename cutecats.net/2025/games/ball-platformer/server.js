const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8080;
const WS_PATH = "/2025/games/ball-platformer/ws";

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("CuteCats multiplayer server is running.");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true });

let nextPlayerId = 1;
const players = new Map();

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

function broadcast(message, except = null) {
  for (const player of players.values()) {
    if (player.ws !== except) {
      send(player.ws, message);
    }
  }
}

function makePosList() {
  const parts = ["poslist"];
  for (const player of players.values()) {
    if (player.x == null || player.y == null) continue;
    parts.push(player.id, player.x, player.y, player.time ?? Date.now());
  }
  return parts.join(" ");
}

function broadcastPositions() {
  broadcast(makePosList());
}

function removePlayer(player) {
  if (!players.has(player.id)) return;

  players.delete(player.id);
  broadcast(`leave ${player.id}`);
  broadcastPositions();

  console.log(`Player ${player.id} disconnected. Players: ${players.size}`);
}

wss.on("connection", (ws, request) => {
  const id = nextPlayerId++;
  const player = {
    id,
    ws,
    x: null,
    y: null,
    time: Date.now()
  };

  players.set(id, player);

  // The original client uses the "platformer-game" WebSocket subprotocol.
  // Tell the newly connected client its ID.
  send(ws, `id ${id}`);

  // Immediately give the new player the current state.
  send(ws, makePosList());

  // Tell existing players that a new connection exists.
  broadcast(`join ${id}`, ws);

  console.log(
    `Player ${id} connected from ${request.socket.remoteAddress}. Players: ${players.size}`
  );

  ws.on("message", (data) => {
    const message = data.toString().trim();
    if (!message) return;

    const parts = message.split(/\s+/);
    const command = parts[0];

    // Expected by the game client:
    // pos X Y TIME
    if (command === "pos") {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const time = Number(parts[3]);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }

      player.x = x;
      player.y = y;
      player.time = Number.isFinite(time) ? time : Date.now();

      // Broadcast the complete player position list.
      broadcastPositions();
      return;
    }

    // Optional ping/pong-style application message.
    if (command === "ping") {
      send(ws, "pong");
    }
  });

  ws.on("close", () => removePlayer(player));
  ws.on("error", (err) => {
    console.error(`WebSocket error for player ${id}:`, err.message);
  });
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");

  if (url.pathname !== WS_PATH) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Keep connections healthy when deployed behind a proxy.
const heartbeat = setInterval(() => {
  for (const player of players.values()) {
    if (player.ws.isAlive === false) {
      player.ws.terminate();
      continue;
    }

    player.ws.isAlive = false;
    player.ws.ping();
  }
}, 30000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CuteCats multiplayer listening on port ${PORT}`);
  console.log(`WebSocket path: ${WS_PATH}`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const player of players.values()) {
    player.ws.close(1001, "Server shutting down");
  }

  wss.close(() => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
