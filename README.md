# RaahiGo 🚌

A full-stack MERN bus ticket booking platform — search buses across 18+
Indian cities, pick seats on an interactive layout, and pay securely with
Razorpay.

**Built by:** [Shah Ahmad Raza](https://www.linkedin.com/in/shah-ahmad-raza-62a72722) · Full Stack Developer (MERN) · [GitHub](https://github.com/ahmad2techmaestro)

**Live demo:** _add your Netlify URL here after deploying_  
**Screenshots:** _add a screenshot or short GIF here_

## Why I built this

I wanted a project that went beyond CRUD — something with a real booking
workflow: route search, seat selection tied to a specific date, payment
verification, and ticket history. RaahiGo covers all of that end to end.

## Features

- 🔍 Search buses between any two of 18+ supported Indian cities
- 🎫 Interactive seat map with per-date seat availability
- 🔐 JWT authentication with bcrypt-hashed passwords
- 💳 Razorpay checkout with **server-side signature verification** and
  **server-side pricing** (the browser never sends an amount) — plus a built-in
  sandbox gateway so the whole flow runs with no payment account
- 🎁 **Payment-method cashback** — UPI 5%, cards 7%, net banking 3%, wallets 4%
  (+1 to 3 points by loyalty tier), credited instantly to the **RaahiGo Wallet**
- 👛 **RaahiGo Wallet** with an append-only ledger; pay up to 50% of a ticket with it
- ❌ **Smart cancellation & refunds** — tiered 100/90/75/50/25% policy, live refund
  preview, instant wallet refund with bonus, bank-refund tracker, seats go back on sale
- 🖨️ **Printable A4 boarding pass** (QR, payment breakdown), calendar (.ics) export, share
- 🧭 **Journey Passport** — trips, cities, km, savings and CO₂ avoided, from your own bookings
- 🏷️ Smart-pick badges on search results (Cheapest / Fastest / Top rated)
- 🧾 Booking history — today, upcoming, past and cancelled, with refund progress
- 🛡️ Protected routes on the frontend (React Router) and backend (JWT middleware)
- 📱 Responsive UI across desktop and mobile

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, Redux + Redux Thunk, Framer Motion, custom CSS design system (no UI framework) |
| Backend | Node.js, Express |
| Database | MongoDB with Mongoose |
| Auth | JWT + bcrypt |
| Seat locking | Redis (ioredis) with atomic Lua scripts |
| Real-time | Socket.IO (rooms per bus + journey date) |
| AI | Anthropic Claude API (natural-language search, recommendations, trip planning, support) |
| Payments | Razorpay (test mode) |
| Deployment | Netlify (frontend) + Render (backend) |

## Project structure

```
RaahiGo/
  client/     React frontend (Create React App)
  server/     Express + MongoDB REST API
```

## Seat locking (how concurrency is handled)

The hard problem in a booking system is two people paying for the same seat
at the same time. RaahiGo handles it in three stages:

1. **Lock on selection** — when a user proceeds to checkout, `POST /seats/lock`
   claims their seats in Redis with a TTL. Multi-seat requests are
   all-or-nothing: a single Lua script checks every seat is free and claims
   them in one atomic operation, so no other request can interleave between
   the check and the write.
2. **Hold with a timer** — seats stay held for `SEAT_LOCK_TTL_SECONDS`
   (default 10 minutes). The UI shows a countdown; if it expires, Redis drops
   the lock automatically and the seats return to the pool. No cleanup job
   needed.
3. **Verify before confirming** — payment verification re-checks that the user
   still holds the lock before writing a confirmed booking. If their hold
   expired mid-payment, the booking is refused rather than double-sold.

Redis is optional: without `REDIS_URL` the app still boots and bookings still
work, falling back to a pre-confirmation database check. The startup log says
clearly which mode is active.

## Real-time seat maps

Seat availability is pushed over Socket.IO rather than polled. Clients join
a room scoped to a specific bus **and** journey date, so someone viewing the
15 Oct departure never receives updates for 16 Oct.

Events broadcast to a seat-map room:

| Event | Fired when |
|---|---|
| `seats:locked` | Another user holds seats for checkout |
| `seats:released` | A held selection is released or abandoned |
| `seats:booked` | A payment is verified and the booking confirmed |

Authenticated clients also join a private per-user room and receive
`booking:update` events — verified in tests to never leak to other users.

Socket.IO shares the same HTTP server and port as the Express API, so
deployment needs no extra configuration. If the socket fails to connect the
app degrades to plain REST: seat maps still load, they just won't live-update.

## Search

`POST /bus/search` does the filtering server-side rather than shipping every
bus to the browser, so it stays correct as the catalogue grows.

Supported filters: price range, AC/Non-AC, Sleeper/Seater, amenities,
operator, departure and arrival time windows, minimum rating, maximum journey
duration and minimum seats available. Results can be sorted by price,
duration, rating, departure, arrival or availability, and are paginated.

Each response also returns **facets** — the real price range, duration range,
operator list and amenity list for that route — so the filter sidebar shows
only options that actually exist rather than a hardcoded list.

Two details worth calling out, both covered by tests:

- **Overnight journeys.** A bus leaving at 22:00 and arriving at 06:00 takes
  8 hours, not −16. Duration is computed with wraparound so sorting and the
  "max duration" filter behave correctly on night buses.
- **Per-date availability.** Seat counts are derived for the specific journey
  date being searched, so the same bus shows different availability on
  different days.

## AI Copilot

Four AI features, all following the same rule: **the LLM never touches the
database or a payment directly.** It only ever produces text or structured
JSON, which this app's own already-tested code then validates before acting
on it.

| Feature | How it stays grounded |
|---|---|
| Natural-language search | LLM extracts `{from, to, date, filters}` as JSON → validated against the real list of served cities → executed through the exact same `searchBuses()` service the manual filter UI uses. An unrecognised city becomes a clarifying question, never a guessed search. |
| "Help me choose" | The backend fetches real buses first; the LLM only ranks and explains them. Every recommended id is checked against the real list — a hallucinated id is silently dropped rather than shown to the user. |
| Trip planner | Built only from a bus's actual departure/arrival/duration. The prompt explicitly forbids inventing hotels, restaurants or attractions, since there's no way to verify those aren't hallucinated. |
| Customer support | Answers are grounded in a small, honest policy knowledge base (`src/services/ai/policyKB.js`) that describes what this codebase actually does — e.g. the cancellation cutoff and automatic refund really are enforced in `order.controller.js`, not just claimed by the chatbot. A logged-in user's own recent bookings are fetched by the *controller* (a normal authenticated query) and handed to the LLM as read-only context — the LLM cannot query the database itself. |

**Setup:** set `ANTHROPIC_API_KEY` in `server/.env` (get one at
[console.anthropic.com](https://console.anthropic.com)). Like Redis, this is
optional — without a key, search, recommendations and support run on a built-in
rules-based "smart" engine (`services/ai/localEngine.js`: cities, aliases, Hinglish, price/time/type filters,
policy-grounded answers) through the exact same validation, so every AI feature still works. `/ai/status`
reports which engine is active. Trip planning still needs the key. Server timezone defaults to `Asia/Kolkata` (set `TZ` to override).

## Payments, cashback & wallet

- **Gateway abstraction** (`services/payment/gateway.js`): `razorpay` (real orders, payments, refunds) or
  `demo` (a sandbox that moves no money but signs payments with real HMACs, so `/verify` runs the exact same checks).
  `PAYMENT_MODE=demo|razorpay` forces a mode; by default it is `razorpay` when keys exist, otherwise `demo`.
- **Server-side pricing**: `POST /api/payment/ticket` takes bus, date, seats, coupon and wallet choice. Fare, coupon,
  wallet share and payable amount are all computed on the server and stored as a `PaymentIntent`;
  `/verify` confirms from that record. A tampered amount in the request is ignored.
- **Cashback** (`services/offers.service.js`): UPI 5% (max ₹50), card 7% (₹100), net banking 3% (₹40), mobile wallets
  4% (₹30), each with a minimum payment; Traveller/Voyager/Elite tiers add +1/+2/+3 points. The method is read from the
  gateway after payment, so the cashback matches how the traveller really paid.
- **Wallet** (`services/wallet.service.js`): whole-rupee balance changed only through atomic conditional updates, with a
  `WalletTxn` ledger row per movement. Up to 50% of a ticket can be paid from it; abandoned checkouts return the reserved amount.
- **Safety nets**: if a payment lands but the seats were taken or the hold expired, it is refunded automatically.

## Cancellation & refunds

Cancel any time until **2 hours before departure** (IST). The refund depends on timing:

| Time before departure | Refund |
|---|---|
| 48 h or more | 100% |
| 24 – 48 h | 90% |
| 12 – 24 h | 75% |
| 6 – 12 h | 50% |
| 2 – 6 h | 25% |
| under 2 h | not cancellable |

1. The cancel dialog shows the exact refund (same pure function the server uses) and two destinations: **RaahiGo Wallet**
   (instant, +2% bonus on the bank-bound portion, max ₹25) or the **original payment method** (5-7 business days).
2. Money returns where it came from: the wallet part to the wallet, the gateway part to the bank.
3. Cashback earned on the booking is reversed (from the wallet first, otherwise from the bank refund).
4. The status flips atomically, so double-clicks can't refund twice. If a gateway refund can't be started, the amount is
   credited to the wallet instead — never lost.
5. The seat entry is removed from the bus, the Redis marker is cleared, and open seat maps update live (`seats:freed`).
6. `GET /order/:id/refund` powers the refund tracker.

## Personalization

Every feature here actually changes something, rather than being a display
number:

**Loyalty points** — 1 point per ₹100 spent, awarded automatically when a
booking is confirmed (inside the same trusted payment-verification flow from
Phase 1/2, never a separate client-triggered call). Tiers (Explorer →
Traveller → Voyager → Elite) are *derived* from the points total on every
read, not stored separately — there's no way for a displayed tier to drift
out of sync with the actual balance.

**Referrals** — every user gets a unique code (`server/src/services/referral.service.js`,
collision-checked against the database, not just assumed-unique). Signing up
with `?ref=CODE` links the new account to its referrer; the referrer gets a
100-point bonus, but only once — on the referred user's first CONFIRMED
booking, guarded by a `referralBonusPaid` flag so it can never double-fire.

**Coupons** — validated and applied *before* the Razorpay order is created,
so the amount charged already reflects the discount (never "charge full
price, refund the difference"). Redemption uses the same atomic,
limit-respecting `findOneAndUpdate` pattern as seat locking, so two people
racing to use the last redemption of a limited coupon can't both succeed.

**Preferences** feed back into Phase 5's AI recommender: if a logged-in user
asks "help me choose" without typing a preference, their saved seat type,
bus type, budget and preferred departure window are used automatically.

**Recently searched / saved routes** are logged server-side per user (not
just `localStorage`), so they follow the user across devices.

## Digital tickets & QR verification

Each confirmed booking gets a boarding-pass-style ticket (`Components/Ticket/Ticket.jsx`)
with a QR code. The QR encodes a verification URL, not just the booking id —
specifically `https://.../verify/<orderId>?token=<hmac>`, where the token is
an HMAC-SHA256 of the order id, signed server-side
(`src/services/ticketVerification.service.js`). This matters because it
means:

- Nobody can view someone else's ticket by guessing or incrementing an order
  id — only a token this server actually issued will verify.
- The `/verify/:orderId` page works without login (a bus conductor scanning
  a QR isn't signed into the passenger's account), while still being
  tamper-proof — token comparison uses `crypto.timingSafeEqual`, not `===`.
- The verification page deliberately returns *less* than the owner's ticket
  view — no email, phone or payment details, just enough to confirm the
  ticket is real (passenger name, route, date, seat, status).

"View Ticket" is available from the booking history page and opens the
ticket in a modal with a working Print / Save-as-PDF button (browser print
styles hide everything else on the page).

## Live tracking — what's real and what's simulated

Being upfront about this because it's the one feature area where "real" is
impossible without hardware this project doesn't have: **no bus in this
system has GPS.** There's no driver app. What `/tracking/:orderId` returns
is a simulation — and it says so, explicitly, in every response
(`simulated: true`, plus a `disclosure` string).

What *is* real:
- **Coordinates** — genuine, verifiable latitude/longitude for all 18 served cities (`src/data/cityCoordinates.js`).
- **Distance** — calculated with the actual haversine great-circle formula on those real coordinates, not a made-up number (tested against known real-world city distances, e.g. Mumbai–Pune ≈120km, Mumbai–Delhi ≈1150km).
- **Progress** — a genuine elapsed-time calculation against the bus's actual scheduled departure and duration.
- **Position** — linear interpolation between real departure and destination coordinates using that real progress fraction. This is a straight line, not the actual road the bus takes — a real GPS feed would show the bus following actual roads, and the simulation doesn't pretend otherwise.
- **Delay** — genuinely stored and retrieved from Redis via `POST /tracking/:busId/delay`, which shifts the simulated position backward accordingly. This is the real seam where an actual driver/operator app could post real delay (or GPS) data later without changing the response contract.

What's *not* real: the bus isn't actually where the dot says it is, because
there's no hardware reporting where it actually is. Building a fleet of
GPS-equipped buses is out of scope for a portfolio project — building an
honest, well-tested simulation with a real integration point for future real
data is the appropriate scope, and that's what this is.

## Notifications — real triggers, honestly-degrading delivery

Every notification type fires from a genuine event already happening
elsewhere in the app — none of these are demo buttons that just show a
toast:

| Notification | Real trigger |
|---|---|
| Booking confirmation | Inside `/api/payment/verify`, right after a payment-verified order is created (Phase 1/2) |
| Cancellation / refund | Inside the real cancellation route, after the Razorpay refund call (Phase 1) |
| Bus delayed | When `/tracking/:busId/delay` is called, fanned out to every CONFIRMED passenger on that bus/date |
| Payment failed | A genuine Razorpay webhook (`payment.failed`), signature-verified — not a client-side guess |
| Journey / boarding reminders, arrival notice | A background scheduler tick (`reminderScheduler.js`) checking real departure/arrival times against pure, unit-tested eligibility windows |

**Delivery is honest about what's configured.** Without `SMTP_*` env vars,
every notification is still composed and logged to MongoDB
(`NotificationLog`, status `SIMULATED`) — visible on the Profile page —
rather than silently doing nothing or pretending to have sent an email
that never left the server. Configure any real SMTP provider (a Gmail app
password works fine for testing) and the exact same code path actually
sends.

The Razorpay webhook needs the **raw** request body to verify its
signature, so `/webhooks/razorpay` is deliberately mounted before the
app-wide `express.json()` middleware in `index.js` — every other route
gets parsed JSON as usual.

## Roles & the operator dashboard

`User.role` (`PASSENGER` | `OPERATOR` | `ADMIN`) is embedded in the JWT at
login, checked by a real `requireRole()` middleware — not a cosmetic label.
Every operator-only route additionally checks **ownership** of the specific
bus being acted on (`bus.operator` must match the caller, unless they're
ADMIN), the same "not just a role, but *this* resource" pattern used for
booking cancellation back in Phase 1.

**What's genuinely real:**
- Deactivating a bus (`PUT /operator/buses/:busId/status`) actually removes it from `/bus/search` results — Phase 4's search query filters `status !== INACTIVE`. It isn't a cosmetic toggle.
- The dashboard's revenue and occupancy numbers are computed from real `Order` documents via `operatorStats.service.js`, unit-tested against hand-verified totals — not sample/placeholder numbers.
- A demo operator account is seeded (`demo.operator@raahigo.app` / `operator123`, see `npm run seed`) with a handful of real buses assigned to it, so the dashboard has real data to show immediately.

**What's honestly scoped down:** `POST /operator/apply` is self-service —
any passenger can become an operator by naming a company, with no
verification step. A real transport platform would need KYC/business
verification before granting operator access; building a fake "pending
review" screen that doesn't actually gate anything would be worse than
stating plainly that this app doesn't yet verify operator identity.

## Admin dashboard

Everything here is computed from real collections — `computePopularRoutes()`
and `computeUserGrowth()` in `adminStats.service.js` are unit-tested against
hand-verified totals, the same pattern as the operator dashboard's revenue
math.

The **system health** panel (`GET /admin/health`) is worth calling out
specifically: unlike Phase 8's live tracking (which is an honestly-labeled
*simulation* because no real GPS data exists), every field here is a
genuine fact obtainable right now from the running process — MongoDB's
actual connection state, whether Redis/AI/email are actually configured,
the real Socket.IO client count, actual process uptime and memory. There's
nothing to simulate because the underlying state is real and queryable.

Admins can also promote/demote a user's role directly
(`PUT /admin/users/:userId/role`) — the verified counterpart to the
self-service `POST /operator/apply` from Phase 10. A demo admin account is
seeded (`demo.admin@raahigo.app` / `admin123`) alongside the demo operator.

## Theming & accessibility

**Dark/light mode** is a real toggle (top-right of the navbar), not a
cosmetic class swap — every `--rg-*` design token in `theme.css` has a dark
equivalent, and since most of the app's CSS already referenced those tokens
(rather than hardcoded hex) from earlier phases, most of the UI adapts
correctly for free. A few things are **deliberately excluded** from
theming, the same way a physical object doesn't change color with the
room's lighting: the digital ticket's boarding-pass paper look, and the QR
code's white background (QR codes need real contrast to stay scannable —
theming that would be a functional regression, not a polish improvement).

**Accessibility fixes made in this pass:**
- Password-visibility toggles (`Signin`/`Signup`) were a `<span>` with an
  `onClick` — mouse-only, invisible to keyboard and screen-reader users.
  Now real interactive controls with `role="button"`, `tabIndex`, a
  keyboard handler, and an `aria-label` describing the current state.
- Modals (ticket, tracking) close on `Escape`, via a small shared
  `useEscapeKey` hook — previously the only way to close them was clicking
  the backdrop or the × button.
- Modals carry `role="dialog"` / `aria-modal="true"` / `aria-label` for
  screen readers.
- A visible focus ring (`:focus-visible`) is defined globally, since many
  custom buttons had their focus outline silently removed by resets
  elsewhere in the stylesheet.

This is a real pass, not a complete WCAG audit — color contrast in a few
secondary UI elements (status badges, muted captions) hasn't been formally
checked against AA ratios, and that's stated here rather than implied to be
done.

## Logging

Structured (JSON) logs via [Pino](https://getpino.io), not scattered
`console.log`/`console.error` calls — `src/configs/logger.js`. Every HTTP
request is logged with method, path, status code and duration
(`pino-http`); `/health` polling is excluded from the log stream to keep
it readable. Pretty-printed and colorized in development, plain JSON in
production (`NODE_ENV=production`) — what a real log aggregator (Render's
log stream, Datadog, CloudWatch) actually wants to ingest.

## API documentation

Interactive Swagger UI at **`/api-docs`** once the server is running,
generated from `server/docs/openapi.yaml`. Documents the core, most-used
surface (auth, search, booking, AI, tracking, operator, admin) with
request/response schemas and which routes require a JWT — not an
exhaustive dump of every internal route, but enough to actually explore
and try requests against a running server from the browser.

## Docker

```bash
cp server/.env.example server/.env   # fill in real values
docker compose up --build
```

Brings up MongoDB, Redis, the API server and the client together — `client`
on port 3000, `server` on port 8080. Both Dockerfiles use a non-root user
and a `HEALTHCHECK`; the client is a proper multi-stage build (Node to
build the React bundle, then nginx to actually serve it, so the final
image doesn't carry the entire `node_modules` toolchain).

**Honest caveat:** these Dockerfiles and `docker-compose.yml` are written
correctly and YAML-syntax-validated, but the environment used to build this
project has no Docker daemon available, so they were not build-tested here.
Run `docker compose up --build` yourself before relying on this for a real
deployment, the same way you'd verify any infrastructure code you didn't
personally watch build successfully.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`: the full
340+ test backend suite (no external services required — see "Testing"
below for why), a production client build with `CI=true`, and a Docker
build for both images. Same honest caveat as above: written correctly,
YAML-validated, but not executed by an actual GitHub Actions runner in
this environment — push it to a real GitHub repo to see it run for real.

## Testing

```bash
cd server
npm test              # all suites
npm run test:seatlock # concurrency & locking (23 tests)
npm run test:socket   # real-time events & room isolation (16 tests)
npm run test:search   # search filters, duration & facets (34 tests)
npm run test:ai       # AI parsing, hallucination guards & RAG (47 tests)
npm run test:personalization # loyalty, coupons & referrals (31 tests)
npm run test:ticket   # QR verification token security (10 tests)
npm run test:tracking # geo math & simulated live tracking (34 tests)
npm run test:notifications # templates, scheduling & webhook security (35 tests)
npm run test:operator # RBAC & revenue/occupancy math (28 tests)
npm run test:admin # platform analytics & system health (20 tests)
npm run test:payments # cashback, wallet limits, refund policy, signatures, passport (53 tests)
```

Seat-locking tests run against an in-memory Redis, so no Redis server is
needed. Socket tests spin up a real HTTP + Socket.IO server and connect real
clients — the transport is not mocked.

## Running locally

You need two terminals.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGODB_URI` — local MongoDB or a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) cluster
- `JWT_SECRET` — any long random string
- `REDIS_URL` — *optional.* Local Redis (`redis://127.0.0.1:6379`) or a free hosted tier (Upstash, Redis Cloud). Enables atomic seat locking; the app runs without it
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — free test keys from [Razorpay Dashboard](https://dashboard.razorpay.com) (test mode)

Seed the database with cities, buses across 60+ routes, and a demo operator account:
```bash
npm run seed
```
Creates a demo operator login: `demo.operator@raahigo.app` / `operator123` (visit `/operator`) and a demo admin login: `demo.admin@raahigo.app` / `admin123` (visit `/admin`).

Start the API:
```bash
npm run dev
```
Runs on `http://localhost:8080`.

### 2. Frontend

```bash
cd client
npm install
cp .env.example .env
npm start
```

Edit `.env` and set `REACT_APP_RAZORPAY_KEY_ID` to the same test key you used
on the backend. Runs on `http://localhost:3000`.

## API overview

| Method | Route | Description |
|---|---|---|
| POST | `/user/signup` | Create an account (password hashed with bcrypt) |
| POST | `/user/login` | Log in, returns a JWT |
| POST | `/city` | Autocomplete search for a city |
| POST | `/city/showcity` | Validate a source/destination pair |
| POST | `/bus/search` | Premium search: filters, sorting, pagination, facets |
| POST | `/bus/getall` | Simple route search (kept for backward compatibility) |
| POST | `/bus/one` | Get a single bus by id |
| POST | `/order/myticket` | Get a user's bookings |
| POST | `/api/payment/ticket` | Create a Razorpay order |
| POST | `/api/payment/verify` | Verify signature **and** create the confirmed booking |
| POST | `/seats/lock` | Hold seats for the duration of checkout |
| POST | `/seats/release` | Release a held seat selection |
| POST | `/seats/availability` | Booked + currently-locked seats for a bus/date |
| GET | `/profile` | Preferences, loyalty status and referral code |
| PUT | `/profile/preferences` | Update travel preferences |
| GET/POST | `/saved-routes` | List / save a favourite route |
| DELETE | `/saved-routes/:id` | Remove a saved route |
| GET/POST | `/search-history` | Recent distinct searches |
| POST | `/coupons/validate` | Preview a coupon's discount |
| GET | `/ai/status` | Whether AI features are configured on this server |
| GET | `/order/:orderId/ticket` | Full ticket data + QR verification URL (owner only) |
| GET | `/verify/:orderId?token=` | Public ticket verification (what a QR scan resolves to) |
| GET | `/tracking/:orderId` | Live (simulated) position, ETA, distance remaining |
| POST | `/tracking/:busId/delay` | Report a delay for a trip (also triggers delay notifications) |
| GET | `/notifications` | Your own notification history |
| POST | `/webhooks/razorpay` | Razorpay payment.failed webhook (signature-verified) |
| POST | `/operator/apply` | Become an operator (self-service, see caveat below) |
| GET/POST | `/operator/buses` | List / create your own buses |
| PUT | `/operator/buses/:busId` | Update fare/schedule (ownership-checked) |
| PUT | `/operator/buses/:busId/status` | Activate/deactivate a route (genuinely affects search) |
| GET | `/operator/buses/:busId/bookings` | Passenger manifest for one bus |
| GET | `/operator/dashboard` | Real revenue/occupancy, computed from actual Order data |
| GET | `/admin/overview` | Platform-wide KPIs (users, operators, buses, revenue, cancellation rate) |
| GET | `/admin/users` | Paginated user list |
| PUT | `/admin/users/:userId/role` | Admin-verified role change |
| GET | `/admin/popular-routes` | Real booking counts by route |
| GET | `/admin/user-growth` | Real daily signups over time |
| GET | `/admin/health` | Genuine system health — DB, Redis, AI, email, realtime, memory |
| GET | `/api-docs` | Interactive Swagger UI documenting the core API |
| POST | `/ai/search` | Natural-language search → structured params → real DB search |
| POST | `/ai/recommend` | "Help me choose" — explains real search results |
| POST | `/ai/trip-planner` | Pre-journey brief grounded in a real bus's timing |
| POST | `/ai/support` | RAG-lite customer support grounded in real policies |

## Deploying

Full step-by-step guide (with a verification checklist and troubleshooting): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

| Part | Where | Config in this repo |
|------|-------|---------------------|
| Database | MongoDB Atlas (free M0) | `MONGODB_URI` |
| API | Render web service | [`render.yaml`](render.yaml) — root `server`, `npm ci` → `npm start`, health check `/health` |
| Web app | Netlify | [`netlify.toml`](netlify.toml) — base `client`, `npm run build`, publish `client/build`, SPA redirect |

The two environment variables that connect everything: `REACT_APP_API_URL` (Netlify → your Render URL) and
`CLIENT_ORIGIN` (Render → your Netlify URL; comma-separate several origins if needed).

## Security notes

- Passwords are hashed with bcrypt before being stored — never stored in plain text.
- JWT secret and database credentials are read from environment variables, never committed to source.
- **Every booking-related route requires a valid JWT**, verified server-side by `src/middleware/auth.middleware.js`. The frontend's route guards are a UX convenience, not the actual security boundary.
- **Bookings are always scoped to the authenticated user** (`req.user._id` from the verified token) — never trusted from a request body or URL param.
- Razorpay payments are verified server-side via HMAC signature, and **booking creation happens atomically inside the same verified request** — there is no separate endpoint that could create a "paid" booking without a real, verified payment.
- Payment verification is idempotent — retried requests for the same payment return the existing booking instead of creating a duplicate.
- A best-effort seat-conflict check runs immediately before confirming a booking. (Full atomic seat locking under concurrent load is on the roadmap — see below.)
- Cancelling a booking requires ownership of that specific booking (verified against the JWT), not just knowledge of an id.
- `helmet` sets standard security headers; `express-rate-limit` throttles signup/login to slow down brute-force attempts.
- Bookings follow a status lifecycle (`PENDING → CONFIRMED/CANCELLED/EXPIRED/COMPLETED`) instead of being immediately and irreversibly created.

## Roadmap

This is being built incrementally, in phases, with a working build verified after each one:

- ✅ **Phase 1 — Harden the core** (done): JWT-protected booking routes, per-user data isolation, atomic payment-verified booking creation, centralized error handling, rate limiting, security headers.
- ✅ **Phase 2 — Real booking engine** (done): Redis-backed atomic seat locking with TTL, a 10-minute checkout timer, and lock verification immediately before booking confirmation. Covered by 23 automated tests including a concurrency test asserting that exactly one of 20 simultaneous lock attempts wins.
- ✅ **Phase 3 — Real-time updates** (done): Socket.IO broadcasts seat lock/release/booking events to everyone viewing the same bus and date, so seat maps update live. Covered by 16 integration tests using real client-server connections.
- ✅ **Phase 4 — Premium search** (done): server-side filtering, sorting, pagination and route facets, with a redesigned results page — skeleton loaders, empty/error states and live seat-availability counts. Covered by 34 tests.
- ✅ **Phase 5 — AI Travel Copilot** (done): natural-language search, "help me choose" recommendations, a grounded trip-planning brief, and RAG-lite customer support — all backed by real, validated backend functions rather than free-floating LLM calls. Covered by 47 tests using an injectable mock LLM.
- Later: personalization, digital tickets with QR verification, live tracking, notifications, operator/admin dashboards, TypeScript + testing + CI/CD.

## Performance notes

- **Run the production build, not `npm start`.** The dev server compiles on the fly and feels slow; use
  `npm run build` then `npx serve -s build -l 3000` for the real speed.
- Every page chunk is prefetched when the browser is idle and warmed on link hover/touch (`client/src/lib/routes.js`),
  with automatic retry (and one clean reload) if a chunk fails to load.
- All requests have a 20s timeout and safe ones retry with backoff (`client/src/lib/http.js`); the API is pre-connected on load.
- Server: gzip/brotli-style compression, Mongo pool + 8s server-selection timeout, Redis connect/command timeouts, cached city list.
- If the API is on a free tier that sleeps, the first request after idle is slow (cold start) — the app pings it on load to wake it early.

## License

MIT

## Author

**Shah Ahmad Raza** — Full Stack Developer (MERN)

- LinkedIn: https://www.linkedin.com/in/shah-ahmad-raza-62a72722
- GitHub: https://github.com/ahmad2techmaestro

Released under the MIT License.
