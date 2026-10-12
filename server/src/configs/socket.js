const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { logger } = require("./logger");

let io = null;

/**
 * Room naming. Clients viewing the same bus on the same journey date get
 * their own room, so a seat lock on 15 Oct doesn't push updates to people
 * looking at 16 Oct.
 */
function busRoom(busId, date) {
  const day = new Date(date).toISOString().split("T")[0];
  return `bus:${busId}:${day}`;
}

/** Per-user room, used for booking/payment status updates. */
function userRoom(userId) {
  return `user:${userId}`;
}

function initSocket(httpServer, clientOrigin) {
  io = new Server(httpServer, {
    cors: { origin: clientOrigin, methods: ["GET", "POST"] },
  });

  // Authentication is optional for seat-map viewing (anyone browsing should
  // see live availability), but when a token IS supplied we verify it and
  // attach the user so they can receive their own booking updates.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.user = null;
      return next();
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded.user;
    } catch (err) {
      // A bad token shouldn't block the public seat-map feed.
      socket.user = null;
    }
    next();
  });

  io.on("connection", (socket) => {
    if (socket.user?._id) {
      socket.join(userRoom(socket.user._id));
    }

    // Client opens a seat map
    socket.on("seatmap:join", ({ busId, date }) => {
      if (!busId || !date) return;
      socket.join(busRoom(busId, date));
    });

    // Client leaves a seat map
    socket.on("seatmap:leave", ({ busId, date }) => {
      if (!busId || !date) return;
      socket.leave(busRoom(busId, date));
    });

    socket.on("disconnect", () => {
      // socket.io cleans up room membership automatically
    });
  });

  logger.info("[socket] real-time server ready");
  return io;
}

function getIO() {
  return io;
}

/**
 * Broadcast helpers.
 *
 * These are deliberately no-ops when io isn't initialised, so the HTTP
 * API keeps working in tests or if real-time is ever disabled — emitting
 * an update is an enhancement, never a precondition for a booking.
 */
function emitSeatsLocked(busId, date, seats) {
  if (!io) return;
  io.to(busRoom(busId, date)).emit("seats:locked", { busId, date, seats });
}

function emitSeatsReleased(busId, date, seats) {
  if (!io) return;
  io.to(busRoom(busId, date)).emit("seats:released", { busId, date, seats });
}

function emitSeatsBooked(busId, date, seats) {
  if (!io) return;
  io.to(busRoom(busId, date)).emit("seats:booked", { busId, date, seats });
}

/** A confirmed booking was cancelled — these seats are on sale again. */
function emitSeatsFreed(busId, date, seats) {
  if (!io) return;
  io.to(busRoom(busId, date)).emit("seats:freed", { busId, date, seats });
}

function emitBookingUpdate(userId, payload) {
  if (!io) return;
  io.to(userRoom(userId)).emit("booking:update", payload);
}

module.exports = {
  initSocket,
  getIO,
  busRoom,
  userRoom,
  emitSeatsLocked,
  emitSeatsReleased,
  emitSeatsBooked,
  emitSeatsFreed,
  emitBookingUpdate,
};
