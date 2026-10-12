import axios from "axios";
import { AUTH_LOG_IN_SUCCESS, AUTH_LOG_IN_ERROR, AUTH_LOG_OUT } from "./auth.types";
import { API_BASE_URL } from "../../config/api";
import { saveSession } from "../../lib/session";
import { error, success } from "../../Utils/notification";

/**
 * Logs in and, on success, calls `onSuccess` so the page decides where to go
 * next (e.g. back to the protected page the user was bounced from).
 * Resolves to true/false so the form can manage its own loading state.
 */
export const loginAPI = (credentials, onSuccess) => async (dispatch) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/user/login`, credentials);
    if (response.data.status === "Failed") {
      dispatch({ type: AUTH_LOG_IN_ERROR });
      error(response.data.message);
      return false;
    }
    saveSession(response.data.message);
    dispatch({ type: AUTH_LOG_IN_SUCCESS, payload: response.data });
    success("Welcome back");
    if (typeof onSuccess === "function") onSuccess();
    return true;
  } catch (err) {
    dispatch({ type: AUTH_LOG_IN_ERROR });
    error(err?.response?.data?.message || "Could not sign you in. Check your connection and try again.");
    return false;
  }
};

export const logoutAPI = () => ({ type: AUTH_LOG_OUT });
