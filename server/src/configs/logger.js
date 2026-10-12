const pino = require("pino");
const pinoHttp = require("pino-http");

/**
 * Structured (JSON) logging instead of scattered console.log/console.error
 * calls throughout the codebase. In production this is what makes logs
 * actually searchable/filterable in a real log aggregator (Render's log
 * stream, Datadog, CloudWatch, etc.) — "something failed" printed as a
 * plain string tells you nothing a log query can filter on.
 *
 * Pretty-printed in development (readable in a terminal), plain JSON in
 * production (what a log aggregator actually wants).
 */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
});

/**
 * Express middleware: logs every request with method, path, status code
 * and duration, and attaches req.log so individual routes can log with
 * request-scoped context (a requestId) rather than a bare string.
 */
const httpLogger = pinoHttp({
  logger,
  // One short line per request. The default dumps every header — including the user's Bearer token — into the logs.
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  redact: ["req.headers.authorization", "req.headers.cookie"],
  autoLogging: {
    ignore: (req) => req.url === "/health", // keep the log stream readable — health checks poll frequently
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});

module.exports = { logger, httpLogger };
