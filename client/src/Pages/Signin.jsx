import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginAPI } from "../Redux/authentication/auth.action";
import { validateEmail } from "../lib/validators";
import { error } from "../Utils/notification";
import AuthShell from "../Components/Layout/AuthShell";
import PasswordInput from "../Components/Layout/PasswordInput";

export default function Signin() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useSelector((s) => s.auth.data.isAuthenticated);
  const dest = location.state?.from || "/";
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Sign in · RaahiGo"; }, []);
  useEffect(() => { if (isAuthenticated) navigate(dest, { replace: true }); }, [isAuthenticated, dest, navigate]);

  const set = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((x) => ({ ...x, [e.target.name]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!validateEmail(form.email)) next.email = "Enter a valid email address";
    if (!form.password) next.password = "Enter your password";
    setErrors(next);
    if (Object.keys(next).length) return error("Please check the highlighted fields");
    setBusy(true);
    // The page decides where to go next — back to where the user was headed, or home.
    const ok = await dispatch(loginAPI({ ...form, email: form.email.trim() }, () => navigate(dest, { replace: true })));
    if (!ok) setBusy(false);
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={location.state?.from ? "Sign in to continue your booking." : "Sign in to manage trips and rewards."}
      footer={<>New to RaahiGo? <Link to="/signup" state={location.state}>Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 18 }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" autoFocus placeholder="you@example.com"
            value={form.email} onChange={set} aria-invalid={Boolean(errors.email)} />
          {errors.email && <span className="field-error" role="alert">{errors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" autoComplete="current-password" placeholder="Your password"
            value={form.password} onChange={set} aria-invalid={Boolean(errors.password)} />
          {errors.password && <span className="field-error" role="alert">{errors.password}</span>}
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
