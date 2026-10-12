/**
 * Socket.IO real-time tests.
 *
 * Run with: node src/tests/socket.test.js
 *
 * These spin up a real HTTP + Socket.IO server and connect real clients
 * over the network stack — no mocking of the transport. That's the only
 * way to be confident room isolation and auth actually behave.
 */
const http = require("http");
const jwt = require("jsonwebtoken");
const { io: ioClient } = require("socket.io-client");
const {
  initSocket,
  emitSeatsLocked,
  emitSeatsReleased,
  emitSeatsBooked,
  emitBookingUpdate,
} = require("../configs/socket");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-socket-tests";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

/** Waits for an event, or resolves null after `ms` if it never arrives. */
function waitFor(socket, event, ms = 400) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

function connectClient(port, token = null) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

function joinSeatMap(socket, busId, date) {
  socket.emit("seatmap:join", { busId, date });
  // Give the server a moment to process the join before we broadcast.
  return new Promise((r) => setTimeout(r, 60));
}

async function run() {
  const httpServer = http.createServer();
  initSocket(httpServer, "*");

  await new Promise((r) => httpServer.listen(0, r));
  const port = httpServer.address().port;

  const BUS = "507f1f77bcf86cd799439011";
  const DATE = "2026-10-15";
  const OTHER_DATE = "2026-10-16";
  const OTHER_BUS = "507f1f77bcf86cd799439022";

  const sockets = [];
  const track = (s) => {
    sockets.push(s);
    return s;
  };

  console.log("\nConnection & auth");

  {
    const s = track(await connectClient(port));
    assert(s.connected === true, "client connects without a token (public seat map)");
  }

  {
    const token = jwt.sign({ user: { _id: "user-1" } }, process.env.JWT_SECRET);
    const s = track(await connectClient(port, token));
    assert(s.connected === true, "client connects with a valid token");
  }

  {
    const s = track(await connectClient(port, "not-a-real-token"));
    assert(
      s.connected === true,
      "invalid token does not block connection (falls back to anonymous)"
    );
  }

  console.log("\nSeat map rooms");

  {
    const a = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);

    const received = waitFor(a, "seats:locked");
    emitSeatsLocked(BUS, DATE, ["12", "13"]);
    const payload = await received;

    assert(payload !== null, "joined client receives seats:locked");
    assert(
      payload && Array.isArray(payload.seats) && payload.seats.includes("12"),
      "payload carries the locked seat numbers"
    );
  }

  {
    const a = track(await connectClient(port));
    // deliberately NOT joining any room
    const received = waitFor(a, "seats:locked");
    emitSeatsLocked(BUS, DATE, ["20"]);
    const payload = await received;
    assert(payload === null, "client that never joined receives nothing");
  }

  {
    const a = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);

    const received = waitFor(a, "seats:locked");
    emitSeatsLocked(BUS, OTHER_DATE, ["30"]); // same bus, different date
    const payload = await received;
    assert(payload === null, "a different journey date does not leak into this room");
  }

  {
    const a = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);

    const received = waitFor(a, "seats:locked");
    emitSeatsLocked(OTHER_BUS, DATE, ["30"]); // different bus, same date
    const payload = await received;
    assert(payload === null, "a different bus does not leak into this room");
  }

  {
    // Two users on the same seat map both get the update — this is the
    // actual product behaviour we care about.
    const a = track(await connectClient(port));
    const b = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);
    await joinSeatMap(b, BUS, DATE);

    const gotA = waitFor(a, "seats:locked");
    const gotB = waitFor(b, "seats:locked");
    emitSeatsLocked(BUS, DATE, ["41"]);

    const [pa, pb] = await Promise.all([gotA, gotB]);
    assert(pa !== null && pb !== null, "both users on the same seat map are notified");
  }

  {
    const a = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);
    a.emit("seatmap:leave", { busId: BUS, date: DATE });
    await new Promise((r) => setTimeout(r, 60));

    const received = waitFor(a, "seats:locked");
    emitSeatsLocked(BUS, DATE, ["50"]);
    assert((await received) === null, "client stops receiving after leaving the room");
  }

  console.log("\nRelease & booked events");

  {
    const a = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);

    const received = waitFor(a, "seats:released");
    emitSeatsReleased(BUS, DATE, ["12"]);
    assert((await received) !== null, "seats:released reaches the room");
  }

  {
    const a = track(await connectClient(port));
    await joinSeatMap(a, BUS, DATE);

    const received = waitFor(a, "seats:booked");
    emitSeatsBooked(BUS, DATE, ["12"]);
    assert((await received) !== null, "seats:booked reaches the room");
  }

  console.log("\nPer-user booking updates");

  {
    const token = jwt.sign({ user: { _id: "user-abc" } }, process.env.JWT_SECRET);
    const a = track(await connectClient(port, token));
    await new Promise((r) => setTimeout(r, 60));

    const received = waitFor(a, "booking:update");
    emitBookingUpdate("user-abc", { status: "CONFIRMED", orderId: "order-1" });
    const payload = await received;

    assert(payload !== null, "authenticated user receives their own booking update");
    assert(payload && payload.status === "CONFIRMED", "booking payload carries the status");
  }

  {
    const token = jwt.sign({ user: { _id: "user-abc" } }, process.env.JWT_SECRET);
    const a = track(await connectClient(port, token));
    await new Promise((r) => setTimeout(r, 60));

    const received = waitFor(a, "booking:update");
    emitBookingUpdate("user-xyz", { status: "CONFIRMED" }); // someone else
    assert((await received) === null, "a user does NOT receive another user's booking update");
  }

  {
    const a = track(await connectClient(port)); // anonymous
    await new Promise((r) => setTimeout(r, 60));

    const received = waitFor(a, "booking:update");
    emitBookingUpdate("user-abc", { status: "CONFIRMED" });
    assert((await received) === null, "anonymous client receives no booking updates");
  }

  sockets.forEach((s) => s.close());
  await new Promise((r) => httpServer.close(r));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
