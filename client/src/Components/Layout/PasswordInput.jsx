import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

export default function PasswordInput({ id, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-affix">
      <input id={id} className="input" type={show ? "text" : "password"} {...props} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        {show ? <FiEyeOff size={18} /> : <FiEye size={18} />}
      </button>
    </div>
  );
}
