import { getStore } from "@netlify/blobs";

const STORE = "veyra-mp-rooms";
const TTL_MS = 45000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function store() {
  return getStore({ name: STORE, consistency: "strong" });
}

function now() {
  return Date.now();
}

function isAlive(room) {
  return room && typeof room.lastSeen === "number" && now() - room.lastSeen < TTL_MS;
}

async function listRooms(s) {
  const { blobs } = await s.list();
  const rooms = [];
  for (const b of blobs) {
    if (!b.key || b.key.startsWith("_")) continue;
    try {
      const room = await s.get(b.key, { type: "json" });
      if (isAlive(room)) rooms.push(room);
      else await s.delete(b.key).catch(() => {});
    } catch {
      /* skip bad entries */
    }
  }
  rooms.sort((a, b) => (b.created || 0) - (a.created || 0));
  return rooms;
}

function roomId() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "r";
  for (let i = 0; i < 10; i++) id += a[(Math.random() * a.length) | 0];
  return id;
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  const roomsIdx = parts.lastIndexOf("rooms");
  if (roomsIdx >= 0 && parts[roomsIdx + 1]) id = parts[roomsIdx + 1];
  if (!id) id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      if (id) {
        const room = await s.get(id, { type: "json" });
        if (!room || !isAlive(room)) return json({ ok: false, error: "room not found or expired" }, 404);
        return json({
          ok: true,
          id: room.id,
          name: room.name,
          host: room.host,
          hostPeerId: room.hostPeerId,
          players: room.players || 1,
          maxPlayers: room.maxPlayers || 2,
          open: (room.players || 1) < (room.maxPlayers || 2),
        });
      }
      const rooms = await listRooms(s);
      return json({
        ok: true,
        rooms: rooms.map((r) => ({
          id: r.id,
          name: r.name,
          host: r.host,
          players: r.players || 1,
          maxPlayers: r.maxPlayers || 2,
          open: (r.players || 1) < (r.maxPlayers || 2),
          ageSec: Math.max(0, Math.floor((now() - (r.created || now())) / 1000)),
        })),
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const hostPeerId = String(body.hostPeerId || "").trim();
      if (!hostPeerId) return json({ ok: false, error: "hostPeerId required" }, 400);
      const name = String(body.name || "Veyra Server").slice(0, 40) || "Veyra Server";
      const host = String(body.host || "Host").slice(0, 24) || "Host";
      const idNew = roomId();
      const room = {
        id: idNew,
        name,
        host,
        hostPeerId,
        players: 1,
        maxPlayers: 2,
        created: now(),
        lastSeen: now(),
      };
      await s.setJSON(idNew, room);
      return json({ ok: true, room: { id: room.id, name: room.name, host: room.host, players: 1, maxPlayers: 2 } });
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!id) return json({ ok: false, error: "room id required" }, 400);
      const existing = await s.get(id, { type: "json" });
      if (!existing) return json({ ok: false, error: "room not found" }, 404);
      const body = await req.json().catch(() => ({}));
      if (typeof body.players === "number") existing.players = Math.max(1, Math.min(existing.maxPlayers || 2, body.players | 0));
      if (body.hostPeerId) existing.hostPeerId = String(body.hostPeerId);
      if (body.name) existing.name = String(body.name).slice(0, 40);
      existing.lastSeen = now();
      await s.setJSON(id, existing);
      return json({
        ok: true,
        room: {
          id: existing.id,
          name: existing.name,
          host: existing.host,
          players: existing.players,
          maxPlayers: existing.maxPlayers,
          open: existing.players < (existing.maxPlayers || 2),
        },
      });
    }

    if (req.method === "DELETE") {
      if (!id) return json({ ok: false, error: "room id required" }, 400);
      await s.delete(id);
      return json({ ok: true });
    }

    if (req.method === "OPTIONS") return new Response(null, { status: 204 });

    return json({ ok: false, error: "method not allowed" }, 405);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
};

export const config = {
  path: ["/api/rooms", "/api/rooms/:id"],
};
