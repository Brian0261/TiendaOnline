// backend/utils/sse.js
const clientsByUser = new Map(); // userId -> Set<res>

function addClient(userId, res) {
  // Cabeceras SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Registrar cliente
  const set = clientsByUser.get(userId) || new Set();
  set.add(res);
  clientsByUser.set(userId, set);

  // “Ping” para mantener vivo el socket (algunos proxies cortan inactividad)
  const hb = setInterval(() => {
    try { res.write(": ping\n\n"); } catch {}
  }, 15000);

  // Limpieza al cerrar
  res.on("close", () => {
    clearInterval(hb);
    set.delete(res);
  });

  // Mensaje de bienvenida
  res.write(`event: connected\ndata: {}\n\n`);
}

function emitToUser(userId, event, payload) {
  const set = clientsByUser.get(userId);
  if (!set || !set.size) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const r of set) { try { r.write(data); } catch {} }
}

module.exports = { addClient, emitToUser };
