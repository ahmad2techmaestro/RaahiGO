// Centralized API base URL. Set REACT_APP_API_URL in client/.env for
// local dev / your own deployed backend. Falls back to localhost.
export const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";
