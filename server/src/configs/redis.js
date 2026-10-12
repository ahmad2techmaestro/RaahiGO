const Redis = require("ioredis");
const { logger } = require("./logger");

let client = null;
let enabled = false;

/**
 * Creates the Redis connection used for seat locking.
 *
 * Redis is treated as an enhancement, not a hard dependency: if REDIS_URL
 * isn't set (e.g. a local dev machine without Redis), the app still boots
 * and every lock call degrades to "no lock held". That keeps the existing
 * booking flow working while making the stronger guarantee available in
 * any environment that does provide Redis.
 */
function initRedis() {
  const url = process.env.REDIS_URL;

  if (!url) {
    logger.warn(
      "[redis] REDIS_URL not set — seat locking is DISABLED. " +
        "Bookings still work, but concurrent seat conflicts are only caught " +
        "by the pre-confirmation check. Set REDIS_URL for full protection."
    );
    enabled = false;
    return null;
  }

  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 4000,    // an unreachable Redis must never stall a request
    commandTimeout: 1500,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  client.on("connect", () => {
    enabled = true;
    logger.info("[redis] connected — seat locking enabled");
  });

  client.on("error", (err) => {
    logger.error({ err }, "[redis] connection error");
  });

  client.on("end", () => {
    enabled = false;
    logger.warn("[redis] connection closed — seat locking disabled");
  });

  return client;
}

function getRedis() {
  return client;
}

function isRedisEnabled() {
  return enabled && client !== null;
}

// Test seam: lets the test suite inject an in-memory Redis implementation.
function __setRedisClientForTests(mockClient) {
  client = mockClient;
  enabled = mockClient !== null;
}

module.exports = { initRedis, getRedis, isRedisEnabled, __setRedisClientForTests };
