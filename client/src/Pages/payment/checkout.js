import axios from "axios";
import { API_BASE_URL } from "../../config/api";
import logo from "../../Images/logo.png";

let configPromise = null;

/** Which gateway the server is running ("razorpay" or the sandbox "demo"). Cached for the session. */
export function getPaymentConfig() {
  if (!configPromise) {
    configPromise = axios.get(`${API_BASE_URL}/api/payment/config`).then((r) => r.data).catch(() => {
      configPromise = null;
      return { mode: "razorpay", keyId: process.env.REACT_APP_RAZORPAY_KEY_ID || null };
    });
  }
  return configPromise;
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

/** Server-side verification: the only call that can create a confirmed booking. */
export async function verifyBooking({ payment, creds, lockToken, token }) {
  const { data } = await axios.post(`${API_BASE_URL}/api/payment/verify`, { ...payment, userDetails: creds, lockToken }, bearer(token));
  return data;
}

/** Demo gateway: authorises the chosen method and returns the signed payment to verify. */
export async function demoAuthorise({ orderId, method, token }) {
  const { data } = await axios.post(`${API_BASE_URL}/api/payment/demo/confirm`, { orderId, method }, bearer(token));
  return data;
}

/** The traveller walked away: free the wallet amount that was reserved for this checkout. */
export function abandonCheckout({ orderId, token }) {
  return axios.post(`${API_BASE_URL}/api/payment/abandon`, { orderId }, bearer(token)).catch(() => {});
}

/** Opens Razorpay Checkout for a server-created order. Resolves callbacks; never creates a booking itself. */
export function openRazorpay({ keyId, checkout, creds, preferred, onPaid, onDismiss, onFailed }) {
  if (!window.Razorpay) {
    onFailed?.("Payment gateway failed to load. Check your connection and refresh.");
    return;
  }
  const rzp = new window.Razorpay({
    key: keyId,
    order_id: checkout.id,
    amount: checkout.amount,
    currency: checkout.currency,
    image: logo,
    name: "RaahiGo",
    description: "Thanks for booking — happy journey!",
    prefill: { name: creds.name, email: creds.email, contact: creds.phone },
    theme: { color: "#0d4a42" },
    // If the traveller tapped a method in the cashback list, open Razorpay on just that method.
    ...(preferred ? { method: { upi: preferred === "UPI", card: preferred === "CARD", netbanking: preferred === "NETBANKING", wallet: preferred === "WALLET", emi: false, paylater: false } } : {}),
    handler: (response) => onPaid(response),
    modal: { ondismiss: () => onDismiss?.() },
  });
  rzp.on("payment.failed", (r) => onFailed?.(r?.error?.description || "Payment failed, please try again"));
  rzp.open();
}

/* ---------- Wallet top-up (same gateway, same signature check) ---------- */
export async function createTopup({ amount, token }) {
  const { data } = await axios.post(`${API_BASE_URL}/wallet/topup/order`, { amount }, bearer(token));
  return data;
}
export async function demoTopupAuthorise({ orderId, method, token }) {
  const { data } = await axios.post(`${API_BASE_URL}/wallet/topup/demo-confirm`, { orderId, method }, bearer(token));
  return data;
}
export async function verifyTopup({ payment, token }) {
  const { data } = await axios.post(`${API_BASE_URL}/wallet/topup/verify`, payment, bearer(token));
  return data;
}
