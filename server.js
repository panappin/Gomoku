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
  const assigned = pickColor(entry);
  if (!assigned) {
    ws.send(JSON.stringify({ type: "full", room }));
    return false;
  }
  set.add(ws);
  ws._room = room;
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

function pickColor(entry) {
  const used = new Set(entry.colors ? Array.from(entry.colors.values()) : []);
  if (used.has("black") && used.has("white")) return null; // both taken
  if (!used.has("black")) return "black";
  if (!used.has("white")) return "white";
  return null;
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
    } else if (type === "chat") {
      const text = sanitizeText(msg.text || "");
      if (!text) return;
      broadcast(room, { type: "chat", room, from: msg.from || "Player", text }, ws);
    }
  });

  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => leaveRoom(ws));
});

server.listen(PORT, () => {
  console.log(`Gomoku relay server listening on ${PORT}`);
});

function sanitizeText(str) {
  if (typeof str !== "string") return "";
  const trimmed = str.slice(0, 200);
  return trimmed.replace(/</g, "").replace(/>/g, "").trim();
}
