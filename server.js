// Simple WebSocket relay for Gomoku.
// Usage:
//   npm install ws
//   node server.js
// Default port: 3001

const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3001;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// room -> { clients: Set<WebSocket>, colors: Map<WebSocket,string> }
const rooms = new Map();

function joinRoom(ws, room) {
  if (!rooms.has(room)) rooms.set(room, { clients: new Set(), colors: new Map() });
  const entry = rooms.get(room);
  const set = entry.clients;
  // Limit to 2 players
  if (set.size >= 2) {
    ws.send(JSON.stringify({ type: "full", room }));
    return false;
  }
  set.add(ws);
  ws._room = room;
  // Assign colors deterministically: first black, second white
  const assigned = set.size === 1 ? "black" : "white";
  entry.colors.set(ws, assigned);
  ws.send(JSON.stringify({ type: "assigned", room, color: assigned }));
  broadcast(room, { type: "players", room, count: set.size, colors: Array.from(entry.colors.values()) });
  return true;
}

function leaveRoom(ws) {
  const room = ws._room;
  if (!room) return;
  const entry = rooms.get(room);
  if (entry) {
    entry.clients.delete(ws);
    entry.colors.delete(ws);
    if (!entry.clients.size) {
      rooms.delete(room);
    } else {
      broadcast(room, { type: "players", room, count: entry.clients.size, colors: Array.from(entry.colors.values()) });
    }
  }
  ws._room = null;
}

function broadcast(room, data, exclude) {
  const entry = rooms.get(room);
  if (!entry) return;
  const set = entry.clients;
  const msg = JSON.stringify(data);
  for (const client of set) {
    if (client === exclude) continue;
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      return;
    }
    const { type, room } = msg || {};
    if (!room) return;

    if (type === "join") {
      const ok = joinRoom(ws, room);
      if (!ok) return;
      return;
    }

    if (!ws._room || ws._room !== room) return;

    if (type === "move" || type === "reset" || type === "win" || type === "draw" || type === "state" || type === "state-request") {
      broadcast(room, msg, ws);
    }
  });

  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => leaveRoom(ws));
});

server.listen(PORT, () => {
  console.log(`Gomoku relay server listening on ${PORT}`);
});
