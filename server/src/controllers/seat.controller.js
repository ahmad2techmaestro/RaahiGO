const express = require("express");
const BusModel = require("../models/bus.model");
const seatLock = require("../services/seatLock.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../utils/errors");
const { emitSeatsLocked, emitSeatsReleased } = require("../configs/socket");

const app = express.Router();

app.use(requireAuth);

/**
 * POST /seats/lock
 * Called when the user confirms their seat selection and moves to the
 * passenger-details / payment step. Holds the seats for LOCK_TTL_SECONDS
 * so nobody else can pay for them mid-checkout.
 */
app.post(
  "/lock",
  asyncHandler(async (req, res) => {
    const { busId, date, seats } = req.body;

    if (!busId || !date || !Array.isArray(seats) || seats.length === 0) {
      throw new AppError("busId, date and a non-empty seats array are required", 400);
    }
    if (seats.length > 6) {
      throw new AppError("You can book at most 6 seats at a time", 400);
    }

    // Seats already permanently booked in MongoDB can never be locked.
    const bus = await BusModel.findById(busId);
    if (!bus) throw new AppError("Bus not found", 404);

    const requestedDay = new Date(date).toDateString();
    const bookedSeats = [];
    (bus.seats || []).forEach((entry) => {
      const [entryDate, entrySeats] = entry.split("@");
      if (new Date(entryDate).toDateString() === requestedDay) {
        bookedSeats.push(...(entrySeats || "").split(","));
      }
    });

    const alreadyBooked = seats.filter((s) => bookedSeats.includes(String(s)));
    if (alreadyBooked.length > 0) {
      throw new AppError(
        `Seat(s) ${alreadyBooked.join(", ")} are already booked. Please choose different seats.`,
        409
      );
    }

    const result = await seatLock.lockSeats(busId, date, seats.map(String));

    if (!result.ok) {
      throw new AppError(
        `Seat(s) ${result.conflictingSeats.join(", ")} were just selected by another passenger. Please choose different seats.`,
        409
      );
    }

    // Tell everyone else viewing this bus/date that these seats just
    // became unavailable, so their seat map greys out immediately.
    emitSeatsLocked(busId, date, seats.map(String));

    res.json({
      lockToken: result.lockToken,
      expiresInSeconds: result.ttlSeconds ?? seatLock.LOCK_TTL_SECONDS,
      seats,
      lockingEnabled: !result.skipped,
    });
  })
);

/**
 * POST /seats/release
 * Called when the user abandons checkout (navigates back, cancels).
 * Locks also expire on their own via TTL, so this is an optimisation
 * that frees seats immediately rather than a correctness requirement.
 */
app.post(
  "/release",
  asyncHandler(async (req, res) => {
    const { busId, date, seats, lockToken } = req.body;
    if (!busId || !date || !Array.isArray(seats)) {
      throw new AppError("busId, date and seats are required", 400);
    }

    const result = await seatLock.releaseSeats(busId, date, seats.map(String), lockToken);

    // Only broadcast if we actually released something — a stale token
    // releases nothing and must not make other users think seats freed up.
    if ((result.released ?? 0) > 0 || result.skipped) {
      emitSeatsReleased(busId, date, seats.map(String));
    }

    res.json({ released: result.released ?? 0 });
  })
);

/**
 * POST /seats/availability
 * Returns which seats are currently unavailable (booked in MongoDB, or
 * locked by another user mid-checkout) for a bus on a given date.
 */
app.post(
  "/availability",
  asyncHandler(async (req, res) => {
    const { busId, date, seats } = req.body;
    if (!busId || !date) {
      throw new AppError("busId and date are required", 400);
    }

    const bus = await BusModel.findById(busId);
    if (!bus) throw new AppError("Bus not found", 404);

    const requestedDay = new Date(date).toDateString();
    const booked = [];
    (bus.seats || []).forEach((entry) => {
      const [entryDate, entrySeats] = entry.split("@");
      if (new Date(entryDate).toDateString() === requestedDay) {
        booked.push(...(entrySeats || "").split(",").filter(Boolean));
      }
    });

    const candidateSeats =
      Array.isArray(seats) && seats.length > 0
        ? seats.map(String)
        : Array.from({ length: 40 }, (_, i) => String(i + 1));

    const locked = await seatLock.getUnavailableSeats(busId, date, candidateSeats);

    // A seat locked by *this* user shouldn't look unavailable to them, but
    // distinguishing that needs the caller's token; the checkout UI passes
    // its own selection separately, so we just report the union here.
    const unavailable = Array.from(new Set([...booked, ...locked]));

    res.json({ booked, unavailable });
  })
);

module.exports = app;
