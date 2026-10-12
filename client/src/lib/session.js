import Cookies from "js-cookie";

const COOKIE_OPTS = () => ({ expires: new Date(Date.now() + 60 * 60 * 1000), sameSite: "lax" });

export const getToken = () => Cookies.get("jwttoken") || "";

export function authHeader() {
  return { headers: { Authorization: `Bearer ${getToken()}` } };
}

export function saveSession({ token, user }) {
  Cookies.set("jwttoken", token, COOKIE_OPTS());
  Cookies.set("userid", user._id, COOKIE_OPTS());
  Cookies.set("usergender", user.gender || "", COOKIE_OPTS());
  Cookies.set("userrole", user.role || "PASSENGER", COOKIE_OPTS());
  Cookies.set("useremail", user.email || "", COOKIE_OPTS());
}

export function clearSession() {
  ["jwttoken", "userid", "usergender", "userrole", "useremail"].forEach((k) => Cookies.remove(k));
}

export const getRole = () => Cookies.get("userrole") || "PASSENGER";
export const getEmail = () => Cookies.get("useremail") || "";
