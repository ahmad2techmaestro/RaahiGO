# Deploying RaahiGo

Order of work: **A** GitHub → **B** Atlas + Render (API) → **C** Netlify (web app) → **D** test the live app.
Do them in this order — the frontend needs the API's URL, and the API needs the frontend's URL for CORS.

## Phase A — GitHub

1. Check nothing secret is tracked: `server/.env` and `client/.env` must **not** appear in `git status` (they are in `.gitignore`).
2. Create an empty repository on GitHub (no README/licence — they already exist), e.g. `RaahiGo`.
3. From the project root:
   ```bash
   git init
   git add .
   git status          # confirm: no .env files, no node_modules, no client/build
   git commit -m "RaahiGo: initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/RaahiGo.git
   git push -u origin main
   ```
4. If a secret was ever committed by mistake: rotate it (new JWT secret / DB password / Razorpay key) — deleting the file is not enough, history keeps it.

## Phase B — Database + API

### MongoDB Atlas
1. Create a free **M0** cluster → *Database Access*: add a user with a strong password → *Network Access*: allow `0.0.0.0/0` (Render's free tier has no fixed IP).
2. *Connect → Drivers* → copy the `mongodb+srv://…` string, put your database name before the `?` (`…mongodb.net/raahigo?retryWrites=true&w=majority`). URL-encode special characters in the password.

### Render (Node web service)
Either use the Blueprint (**New → Blueprint** → pick the repo; it reads `render.yaml`) or create it manually:

| Setting | Value |
|---|---|
| Root directory | `server` |
| Build command | `npm ci --legacy-peer-deps` |
| Start command | `npm start` |
| Health check path | `/health` |
| Node version | 20 (`NODE_VERSION=20`) |

Environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | the Atlas string above |
| `JWT_SECRET` | long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CLIENT_ORIGIN` | your Netlify URL (set after Phase C; no trailing slash). Several origins: comma-separated |
| `PAYMENT_MODE` | `demo` first; `razorpay` after you add test keys |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **test** keys (optional at first) |
| `RAZORPAY_WEBHOOK_SECRET` | from the Razorpay webhook (Phase D) |
| `REDIS_URL` | optional — Upstash free tier. Without it seat holds fall back to the pre-confirmation check |
| `ANTHROPIC_API_KEY` | optional — the built-in smart engine works without it |

After the first deploy:
1. Open `https://<service>.onrender.com/health` → `{"status":"ok"}`.
2. Seed the database once (Render → *Shell*): `npm run seed`. (In production it refuses to wipe an existing database unless you pass `--force`.)
3. Open `https://<service>.onrender.com/api-docs` and `/city` — you should see data.

> Free Render services sleep after ~15 min idle; the first request then takes ~30–60 s. The web app pings the API on load to wake it early.

## Phase C — Netlify (React client)

New site → *Import from Git* → pick the repo. `netlify.toml` provides:

| Setting | Value |
|---|---|
| Base directory | `client` |
| Build command | `npm run build` |
| Publish directory | `client/build` |

Environment variable (*Site settings → Environment variables*):

| Key | Value |
|---|---|
| `REACT_APP_API_URL` | your Render URL, e.g. `https://raahigo-api.onrender.com` (no trailing slash) |

`REACT_APP_*` values are baked in **at build time** — if you change it, trigger *Deploys → Trigger deploy*.
Then copy the Netlify URL into Render's `CLIENT_ORIGIN` and let Render redeploy. (`localhost:8080` can never work in production.)

## Phase D — Test the live app

Work through this checklist on the Netlify URL (desktop and a phone):

- [ ] Sign up, sign in, sign out; refresh on a deep link such as `/selectbus` (must not 404)
- [ ] Search a route; filters and sorting work; the AI box on the home page returns a search
- [ ] Open a seat map; open it in a second browser and watch seats change live (WebSocket)
- [ ] Book a ticket → success page → printable boarding pass → QR opens the verification page
- [ ] Wallet: add money, cashback credited after payment, pay part of a ticket from the wallet
- [ ] My trips shows the booking; cancel it → refund preview → wallet/bank refund → seats freed
- [ ] Operator (`/operator`) and admin (`/admin`) dashboards open with the seeded demo accounts — **change those demo passwords or delete the accounts before sharing the URL publicly**
- [ ] Layout at 390 px width: no horizontal scroll, buttons reachable

### Payments: test mode first
1. With `PAYMENT_MODE=demo` the sandbox gateway runs the whole flow with no account.
2. Switch to Razorpay **test mode**: add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (`rzp_test_…`), set `PAYMENT_MODE=razorpay`, redeploy. Pay with Razorpay's test UPI/card details.
3. Webhook: Razorpay Dashboard → *Settings → Webhooks* → URL `https://<api>/webhooks/razorpay`, event `payment.failed`, set a secret and put the same value in `RAZORPAY_WEBHOOK_SECRET`. Send a test event and confirm a 200.
4. **Going live** is a separate step: Razorpay KYC approval → live keys (`rzp_live_…`) in Render only (never in git) → one small real payment + refund to verify end to end.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser console: CORS error | `CLIENT_ORIGIN` on Render must exactly equal the Netlify URL (scheme + host, no trailing slash) |
| Requests go to `localhost:8080` | `REACT_APP_API_URL` not set on Netlify, or you didn't redeploy after setting it |
| First request very slow, then fine | Render free-tier cold start |
| `ERR_CONNECTION_REFUSED` | API not running / wrong URL |
| Live seat map never connects | CORS (`CLIENT_ORIGIN`) — Socket.IO uses the same allow-list; the app still works without it |
| Render deploy fails on `npm ci` | use `npm ci --legacy-peer-deps` (set in `render.yaml`) |
| Atlas connection timeout | Network Access doesn't allow `0.0.0.0/0`, or password has unescaped characters |
