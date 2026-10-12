import { io } from "socket.io-client";
import Cookies from "js-cookie";
import { API_BASE_URL } from "./api";

let socket = null;

/**
 * Lazily creates a single shared socket connection for the whole app.
 * Real-time is an enhancement layered on top of the REST API — if the
 * socket never connects, every page still works, it just won't update
 * without a refresh.
 */
export function getSocket() {
  if (socket) return socket;

  socket = io(API_BASE_URL, {
    auth: { token: Cookies.get("jwttoken") || null },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect_error", (err) => {
    // Non-fatal: log once and let the app carry on over plain HTTP.
    console.warn("[socket] could not connect:", err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
