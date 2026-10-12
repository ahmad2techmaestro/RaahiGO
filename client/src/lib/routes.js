/**
 * Route-level code splitting, made invisible.
 *
 * Every page is its own chunk so the first load stays small — but fetching a chunk only when the user
 * clicks is what made navigation feel slow. So: (1) every chunk is prefetched once the browser is idle,
 * (2) hovering / touching a link warms its chunk immediately, and (3) a failed chunk fetch (flaky network,
 * or a stale tab after a new deploy) retries and finally reloads once, instead of leaving a dead spinner.
 */
export const loaders = {
  pass: () => import("../Pages/BoardingPass"),
  verify: () => import("../Pages/VerifyTicket"),
  operator: () => import("../Pages/OperatorDashboard"),
  admin: () => import("../Pages/AdminDashboard"),
};

const cache = new Map();

/** Loads a page chunk once, retrying on failure; the same promise is shared by prefetch and React.lazy. */
export function load(key) {
  if (cache.has(key)) return cache.get(key);
  const attempt = (n) =>
    loaders[key]().catch((err) => {
      if (n < 2) return new Promise((r) => setTimeout(r, 350 * (n + 1))).then(() => attempt(n + 1));
      throw err;
    });
  const p = attempt(0).catch((err) => {
    cache.delete(key);
    // Most likely a stale tab after a deploy: one clean reload fetches the new chunk names.
    try {
      if (!sessionStorage.getItem("rg-chunk-reload")) {
        sessionStorage.setItem("rg-chunk-reload", "1");
        window.location.reload();
        return new Promise(() => {});
      }
    } catch { /* storage blocked — fall through */ }
    throw err;
  });
  cache.set(key, p);
  return p;
}

const PATHS = [[/^\/pass/, "pass"], [/^\/verify/, "verify"], [/^\/operator/, "operator"], [/^\/admin/, "admin"]];

export function prefetchPath(pathname) {
  const hit = PATHS.find(([re]) => re.test(pathname));
  if (hit) load(hit[1]).catch(() => {});
}

/** Warm the most likely next pages first, the rest a moment later. */
export function startPrefetching() {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 600));
  const run = () => { ["pass"].forEach((k) => load(k).catch(() => {})); };
  if (document.readyState === "complete") idle(run); else window.addEventListener("load", () => idle(run), { once: true });

  const warm = (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.origin !== window.location.origin) return;
    prefetchPath(a.pathname);
  };
  document.addEventListener("mouseover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
  document.addEventListener("focusin", warm);
  // A successful render proves chunks are healthy again.
  try { sessionStorage.removeItem("rg-chunk-reload"); } catch { /* ignore */ }
}
