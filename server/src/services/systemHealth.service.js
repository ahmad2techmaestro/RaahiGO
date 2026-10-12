const mongoose = require("mongoose");
const { isRedisEnabled } = require("../configs/redis");
const { isAIEnabled } = require("./ai/llmClient");
const { isEmailConfigured } = require("./notifications/emailProvider");
const { getIO } = require("../configs/socket");

const MONGO_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

/**
 * Every field here is a genuine, queryable fact about the running process
 * — nothing simulated or invented, unlike the live-tracking positions in
 * Phase 8. A database is either connected or it isn't; that's real.
 */
function getSystemHealth() {
  const io = getIO();

  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      connected: mongoose.connection.readyState === 1,
      state: MONGO_STATES[mongoose.connection.readyState] || "unknown",
    },
    redis: {
      configured: isRedisEnabled(),
    },
    ai: {
      configured: isAIEnabled(),
    },
    email: {
      configured: isEmailConfigured(),
    },
    realtime: {
      active: Boolean(io),
      connectedClients: io ? io.engine.clientsCount : 0,
    },
    memory: {
      usedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };
}

module.exports = { getSystemHealth };
