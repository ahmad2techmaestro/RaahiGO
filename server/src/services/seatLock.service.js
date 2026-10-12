const crypto = require("crypto");
const { getRedis, isRedisEnabled } = require("../configs/redis");

// How long a seat stays locked while the user completes checkout.
const LOCK_TTL_SECONDS = Number(process.env.SEAT_LOCK_TTL_SECONDS || 600); // 10 minutes

/**
 * Key for a single seat on a specific bus, on a specific journey date.
 * Availability is per-date, so the date must be part of the key.
 */
function seatKey(busId, date, seat) {
  const day = new Date(date).toISOString().split("T")[0];
  return `seatlock:${busId}:${day}:${seat}`;
}

/**
 * Acquire locks on ALL requested seats, or none at all.
 *
 * Redis SET NX is atomic per key, but locking several seats needs to be
 * all-or-nothing, so this runs as a single Lua script — Redis executes it
 * atomically, meaning no other request can interleave between the
 * "is it free?" check and the "claim it" write. That's what actually
 * prevents two users from paying for the same seat.
 *
 * Returns { ok: true, lockToken } or { ok: false, conflictingSeats }.
 */
const ACQUIRE_SCRIPT = `
  -- First pass: verify every seat is free (or already held by this token)
  for i = 1, #KEYS do
    local holder = redis.call('GET', KEYS[i])
    if holder and holder ~= ARGV[1] then
      return {0, KEYS[i]}
    end
  end
  -- Second pass: claim them all
  for i = 1, #KEYS do
    redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
  end
  return {1, ''}
`;

async function lockSeats(busId, date, seats, existingToken = null) {
  if (!isRedisEnabled()) {
    return { ok: true, lockToken: null, skipped: true };
  }

  const redis = getRedis();
  const lockToken = existingToken || crypto.randomBytes(16).toString("hex");
  const keys = seats.map((s) => seatKey(busId, date, s));

  const [result, conflictKey] = await redis.eval(
    ACQUIRE_SCRIPT,
    keys.length,
    ...keys,
    lockToken,
    String(LOCK_TTL_SECONDS)
  );

  if (Number(result) === 1) {
    return { ok: true, lockToken, ttlSeconds: LOCK_TTL_SECONDS };
  }

  const conflictingSeat = String(conflictKey).split(":").pop();
  return { ok: false, conflictingSeats: [conflictingSeat] };
}

/**
 * Confirms the caller still holds the lock on every seat.
 * Called immediately before writing a confirmed booking — if the user's
 * checkout timer expired and someone else grabbed the seat, this fails.
 */
const VERIFY_SCRIPT = `
  for i = 1, #KEYS do
    local holder = redis.call('GET', KEYS[i])
    if not holder then
      return {0, KEYS[i], 'expired'}
    end
    if holder ~= ARGV[1] then
      return {0, KEYS[i], 'taken'}
    end
  end
  return {1, '', ''}
`;

async function verifyLocks(busId, date, seats, lockToken) {
  if (!isRedisEnabled()) {
    return { ok: true, skipped: true };
  }
  if (!lockToken) {
    return { ok: false, reason: "missing_token" };
  }

  const redis = getRedis();
  const keys = seats.map((s) => seatKey(busId, date, s));

  const [result, conflictKey, reason] = await redis.eval(
    VERIFY_SCRIPT,
    keys.length,
    ...keys,
    lockToken
  );

  if (Number(result) === 1) return { ok: true };

  return {
    ok: false,
    reason: String(reason),
    seat: String(conflictKey).split(":").pop(),
  };
}

/**
 * Releases locks, but only the ones this token actually owns — so a stale
 * request can never release a seat another user has since locked.
 */
const RELEASE_SCRIPT = `
  local released = 0
  for i = 1, #KEYS do
    if redis.call('GET', KEYS[i]) == ARGV[1] then
      redis.call('DEL', KEYS[i])
      released = released + 1
    end
  end
  return released
`;

async function releaseSeats(busId, date, seats, lockToken) {
  if (!isRedisEnabled() || !lockToken) return { released: 0, skipped: true };

  const redis = getRedis();
  const keys = seats.map((s) => seatKey(busId, date, s));
  const released = await redis.eval(RELEASE_SCRIPT, keys.length, ...keys, lockToken);
  return { released: Number(released) };
}

/**
 * Marks seats as permanently taken after a confirmed booking. The
 * authoritative record is the Bus document in MongoDB; this just keeps
 * Redis consistent so in-flight lock attempts fail fast rather than
 * waiting for the DB check.
 */
async function markSeatsBooked(busId, date, seats) {
  if (!isRedisEnabled()) return { skipped: true };

  const redis = getRedis();
  const pipeline = redis.pipeline();
  seats.forEach((s) => {
    // Long TTL rather than persist-forever: MongoDB remains the source of
    // truth, and this key only needs to outlive the journey date.
    pipeline.set(seatKey(busId, date, s), "BOOKED", "EX", 60 * 60 * 24 * 30);
  });
  await pipeline.exec();
  return { ok: true };
}

/**
 * Frees seats that were marked BOOKED — used when a confirmed booking is cancelled so the seat can be
 * sold again immediately. Only keys holding the BOOKED marker are removed, never another user's live lock.
 */
const UNBOOK_SCRIPT = `
  local freed = 0
  for i = 1, #KEYS do
    if redis.call('GET', KEYS[i]) == 'BOOKED' then
      redis.call('DEL', KEYS[i])
      freed = freed + 1
    end
  end
  return freed
`;

async function unmarkSeatsBooked(busId, date, seats) {
  if (!isRedisEnabled() || !seats.length) return { freed: 0, skipped: true };
  const redis = getRedis();
  const keys = seats.map((s) => seatKey(busId, date, s));
  const freed = await redis.eval(UNBOOK_SCRIPT, keys.length, ...keys);
  return { freed: Number(freed) };
}

/**
 * Returns which of the given seats are currently locked or booked,
 * used to render live availability in the seat map.
 */
async function getUnavailableSeats(busId, date, seats) {
  if (!isRedisEnabled()) return [];

  const redis = getRedis();
  const keys = seats.map((s) => seatKey(busId, date, s));
  if (keys.length === 0) return [];

  const values = await redis.mget(...keys);
  return seats.filter((_, i) => values[i] !== null);
}

module.exports = {
  lockSeats,
  verifyLocks,
  releaseSeats,
  markSeatsBooked,
  unmarkSeatsBooked,
  getUnavailableSeats,
  LOCK_TTL_SECONDS,
  seatKey,
};
