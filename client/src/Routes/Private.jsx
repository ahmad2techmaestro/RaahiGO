import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { getToken } from "../lib/session";

/** Redirects anonymous visitors to sign-in, remembering where they were headed. */
export const Private = ({ children }) => {
  const { pathname, search } = useLocation();
  const token = useSelector((state) => state.auth.data.token);
  if (!token || !getToken()) {
    return <Navigate to="/signin" state={{ from: pathname + search }} replace />;
  }
  return children;
};
