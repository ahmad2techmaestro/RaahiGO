import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { FiGift } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { validateEmail } from "../lib/validators";
import { error, success } from "../Utils/notification";
import AuthShell from "../Components/Layout/AuthShell";
import PasswordInput from "../Components/Layout/PasswordInput";

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}
const LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];

export default function Signup() {
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref") || "";
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "", gender: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const score = useMemo(() => strength(form.password), [form.password]);

  useEffect(() => { document.title = "Create account · RaahiGo"; }, []);

  const set = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((x) => ({ ...x, [e.target.name]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!validateEmail(form.email)) next.email = "Enter a valid email address";
    if (form.password.length < 6) next.password = "Use at least 6 characters";
    if (!form.gender) next.gender = "Select an option";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/user/signup`, {
        ...form, email: form.email.trim(), referralCode: referralCode || undefined,
      });
      if (data.status === "Failed") return error(data.message);
      success(data.message || "Account created — please sign in");
      navigate("/signin", { state: location.state });
    } catch (err) {
      error(err?.response?.data?.message || "Couldn't create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Hold seats, pay securely and track every trip."
      footer={<>Already have an account? <Link to="/signin" state={location.state}>Sign in</Link></>}
    >
      {referralCode && (
        <div className="badge badge-accent" style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 12, fontSize: 13, display: "flex", gap: 8 }}>
          <FiGift /> Referral <b className="mono">{referralCode}</b> applied. Your friend earns a bonus after your first booking.
        </div>
      )}
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 18 }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" autoFocus placeholder="you@example.com"
            value={form.email} onChange={set} aria-invalid={Boolean(errors.email)} />
          {errors.email && <span className="field-error" role="alert">{errors.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" autoComplete="new-password" placeholder="At least 6 characters"
            value={form.password} onChange={set} aria-invalid={Boolean(errors.password)} />
          {form.password && (
            <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} style={{ height: 4, borderRadius: 4, background: i < score ? (score < 2 ? "var(--danger)" : score < 3 ? "var(--warn)" : "var(--success)") : "var(--line)" }} />
                ))}
              </div>
              <span className="field-hint">{LABELS[score]}</span>
            </div>
          )}
          {errors.password && <span className="field-error" role="alert">{errors.password}</span>}
        </div>
        <div className="field">
          <label htmlFor="gender">Gender</label>
          <select id="gender" name="gender" className="select" value={form.gender} onChange={set} aria-invalid={Boolean(errors.gender)}>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          {errors.gender && <span className="field-error" role="alert">{errors.gender}</span>}
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
