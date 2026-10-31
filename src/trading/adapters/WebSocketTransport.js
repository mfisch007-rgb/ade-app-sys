/**
 * ESM-safe WebSocket transport for the broker adapters.
 *
 * The adapters historically called `require("ws")` from ES modules, which
 * throws `ReferenceError: require is not defined` before any handshake can be
 * attempted. This module resolves the transport without changing the provider
 * authentication protocol:
 *
 *  1. Node's built-in global WebSocket (Node >= 22), already present on the
 *     supported Node 24 runtime.
 *  2. The optional `ws` package through a dynamic import, for installations
 *     that deliberately add it.
 *
 * If neither is available the caller receives `null` and must report the
 * transport as unavailable instead of fabricating a connection.
 */

const CONNECTING = 0;
const OPEN = 1;

export async function openWebSocket(url) {
  if (!url) return null;

  const NativeWebSocket = globalThis.WebSocket;
  if (typeof NativeWebSocket === "function") {
    try {
      return adaptSocket(new NativeWebSocket(url), false);
    } catch {
      return null;
    }
  }

  try {
    const mod = await import("ws");
    const WebSocketImpl = mod?.WebSocket || mod?.default || mod;
    if (typeof WebSocketImpl !== "function") return null;
    return adaptSocket(new WebSocketImpl(url), true);
  } catch {
    return null;
  }
}

function adaptSocket(socket, usesNodeEvents) {
  const listeners = new Map();

  const emit = (event, payload) => {
    const handlers = listeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch {}
    }
  };

  if (usesNodeEvents) {
    socket.on("open", () => emit("open", {}));
    socket.on("message", (data) => emit("message", data));
    socket.on("error", (error) => emit("error", error));
    socket.on("close", () => emit("close", {}));
  } else {
    socket.addEventListener("open", () => emit("open", {}));
    socket.addEventListener("message", (event) => emit("message", event?.data));
    socket.addEventListener("error", (error) => emit("error", error));
    socket.addEventListener("close", () => emit("close", {}));
  }

  return {
    raw: socket,
    get readyState() {
      return socket.readyState;
    },
    on(event, handler) {
      if (typeof handler !== "function") return this;
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return this;
    },
    send(payload) {
      try {
        socket.send(payload);
        return true;
      } catch {
        return false;
      }
    },
    close() {
      try {
        socket.close();
      } catch {}
    }
  };
}

export const WEBSOCKET_STATES = Object.freeze({ CONNECTING, OPEN });

export default openWebSocket;
