import axios from "axios";
import { API_BASE_URL } from "../config/api";

let p = null;
/** /ai/status is asked by several widgets on every page — ask once per session. */
export function getAiStatus() {
  if (!p) p = axios.get(`${API_BASE_URL}/ai/status`).then((r) => r.data).catch(() => { p = null; return { aiEnabled: false }; });
  return p;
}
