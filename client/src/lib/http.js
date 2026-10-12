import axios from "axios";
import { API_BASE_URL } from "../config/api";

/**
 * One place for network resilience. Without a timeout a stalled request leaves a spinner forever —
 * that is the "I had to refresh" feeling. Safe requests are retried a couple of times with a short
 * backoff (free hosting cold starts and flaky mobile networks both look like this).
 */
axios.defaults.timeout = 20000;

const SAFE_POSTS = [/\/bus\/search/, /\/user\/login/, /\/ai\//, /\/payment\/quote/];

function retryable(config) {
  if (!config) return false;
  const method = (config.method || "get").toLowerCase();
  if (method === "get") return true;
  return method === "post" && SAFE_POSTS.some((re) => re.test(config.url || ""));
}

axios.interceptors.response.use(undefined, (error) => {
  const { config, response } = error;
  const transient = !response || [502, 503, 504].includes(response.status) || error.code === "ECONNABORTED";
  if (!config || !transient || !retryable(config)) return Promise.reject(error);
  config.__retries = (config.__retries || 0) + 1;
  if (config.__retries > 2) return Promise.reject(error);
  return new Promise((r) => setTimeout(r, 400 * config.__retries)).then(() => axios(config));
});

/** Open the TCP/TLS connection to the API while the first bundle is still parsing. */
export function preconnectApi() {
  try {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = new URL(API_BASE_URL).origin;
    link.crossOrigin = "";
    document.head.appendChild(link);
    axios.get(`${API_BASE_URL}/city`).catch(() => {}); // also wakes a sleeping free-tier server
  } catch { /* invalid URL in env — nothing to warm */ }
}
