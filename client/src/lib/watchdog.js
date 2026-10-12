/**
 * Safety net for the "page opened but nothing is on screen" failure.
 *
 * After every in-app navigation, look at the page a moment later. If the app root is empty (React crashed
 * or was torn down by something outside the app), recover automatically with one reload instead of
 * leaving a blank screen that needs a manual refresh. Reloads are rate-limited so it can never loop,
 * and every runtime error is remembered so the cause can be read from the console.
 */
const KEY = "rg-watchdog-at";
const LOG = "rg-last-error";

function remember(kind, err) {
  try {
    const msg = `${kind}: ${err?.message || err}`;
    sessionStorage.setItem(LOG, `${new Date().toISOString()} ${msg}`.slice(0, 400));
    // eslint-disable-next-line no-console
    console.error("[RaahiGo]", msg);
  } catch { /* storage blocked */ }
}

function blank() {
  const root = document.getElementById("root");
  if (!root) return false;
  return root.childElementCount === 0 || (root.innerText || "").trim().length < 12;
}

function check() {
  if (!blank()) return;
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* ignore */ }
  if (Date.now() - last < 15000) return; // already tried recently — don't loop
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
  window.location.reload();
}

export function startWatchdog() {
  window.addEventListener("error", (e) => remember("error", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => remember("promise", e.reason));

  const later = () => { setTimeout(check, 2500); };
  for (const fn of ["pushState", "replaceState"]) {
    const orig = window.history[fn];
    window.history[fn] = function patched(...args) {
      const out = orig.apply(this, args);
      later();
      return out;
    };
  }
  window.addEventListener("popstate", later);
  later();
}
