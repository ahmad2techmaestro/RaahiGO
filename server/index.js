require("dotenv").config();

// Every bus runs on Indian time. Pinning the process timezone makes "departure hour" (a local hour) mean
// the same thing on a laptop, in Docker and on any host — override with TZ if you serve another country.
process.env.TZ = process.env.TZ || "Asia/Kolkata";

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const app = express();
const port = process.env.PORT || 8080;
// CLIENT_ORIGIN may be one URL or a comma-separated list (e.g. production + a Netlify preview URL).
const clientOrigin = (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);

const cityRouter = require("./src/controllers/city.controller");
const busRouter = require("./src/controllers/bus.controller");
const userRouter = require("./src/controllers/user.controller");
const orderRouter = require("./src/controllers/order.controller");
const paymentController = require("./src/controllers/payment.controller");
const seatRouter = require("./src/controllers/seat.controller");
const aiRouter = require("./src/controllers/ai.controller");
const profileRouter = require("./src/controllers/profile.controller");
const savedRoutesRouter = require("./src/controllers/savedRoutes.controller");
const searchHistoryRouter = require("./src/controllers/searchHistory.controller");
const couponRouter = require("./src/controllers/coupon.controller");
const ticketVerifyRouter = require("./src/controllers/ticketVerify.controller");
const trackingRouter = require("./src/controllers/tracking.controller");
const webhookRouter = require("./src/controllers/webhook.controller");
const notificationsRouter = require("./src/controllers/notifications.controller");
const operatorRouter = require("./src/controllers/operator.controller");
const adminRouter = require("./src/controllers/admin.controller");
const walletRouter = require("./src/controllers/wallet.controller");

const connect = require("./src/configs/db");
const { initRedis } = require("./src/configs/redis");
const { initSocket } = require("./src/configs/socket");
const { startReminderScheduler } = require("./src/services/notifications/reminderScheduler");
const { logger, httpLogger } = require("./src/configs/logger");

const compression = require("compression");
app.use(compression()); // JSON/HTML shrink ~70% — a big win on mobile networks
// Behind Render/Netlify-style proxies: trust the first hop so rate limiting sees the real client IP.
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: clientOrigin }));
app.use(httpLogger);

// Razorpay webhook signatures are computed over the RAW request body, so
// this route must be mounted with a raw-body parser BEFORE the app-wide
// express.json() below — once JSON has re-serialized the body, the exact
// original bytes (and therefore the signature) can no longer be verified.
app.use("/webhooks", express.raw({ type: "application/json" }), webhookRouter);

app.use(express.json({ limit: "1mb" }));

// Interactive API documentation at /api-docs, generated from docs/openapi.yaml.
const openapiSpec = YAML.load(path.join(__dirname, "docs", "openapi.yaml"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get("/", (req, res) => {
  res.send("RaahiGo API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use("/user", userRouter);
app.use("/city", cityRouter);
app.use("/bus", busRouter);
app.use("/order", orderRouter);
app.use("/api/payment", paymentController);
app.use("/seats", seatRouter);
app.use("/ai", aiRouter);
app.use("/profile", profileRouter);
app.use("/saved-routes", savedRoutesRouter);
app.use("/search-history", searchHistoryRouter);
app.use("/coupons", couponRouter);
app.use("/verify", ticketVerifyRouter);
app.use("/tracking", trackingRouter);
app.use("/notifications", notificationsRouter);
app.use("/operator", operatorRouter);
app.use("/admin", adminRouter);
app.use("/wallet", walletRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Centralized error handler. Controllers either throw an AppError (which
// carries its own statusCode) or let unexpected errors bubble up here,
// where they're logged and turned into a generic 500 — internals are
// never leaked to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ message: "Something went wrong on the server" });
});

initRedis();
startReminderScheduler();

// Socket.IO attaches to the same HTTP server as Express, so both share
// one port and one CORS origin.
const httpServer = http.createServer(app);
initSocket(httpServer, clientOrigin);

connect()
  .then(() => {
    httpServer.listen(port, () => {
      logger.info({ port, docs: `/api-docs` }, "RaahiGo API listening");
    });
  })
  .catch((error) => {
    logger.error({ err: error }, "Failed to connect to MongoDB");
    process.exit(1);
  });
