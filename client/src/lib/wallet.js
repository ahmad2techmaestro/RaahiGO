import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { authHeader, getToken } from "./session";

const EVENT = "rg:wallet-changed";

/** Call after anything that moves wallet money (booking, cancellation) so every balance on screen refreshes. */
export const notifyWalletChanged = () => window.dispatchEvent(new Event(EVENT));

/** Live wallet balance for the signed-in traveller; null while loading or signed out. */
export function useWalletBalance(enabled = true) {
  const [balance, setBalance] = useState(null);

  const refresh = useCallback(() => {
    if (!enabled || !getToken()) return setBalance(null);
    axios.get(`${API_BASE_URL}/wallet`, authHeader())
      .then(({ data }) => setBalance(data.balance))
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);

  return balance;
}
