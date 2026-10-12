import { useEffect } from "react";

/** Closes a modal on Escape — standard, expected keyboard behavior that
 * was missing across every modal in this app before this pass. */
export function useEscapeKey(onClose, active = true) {
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, active]);
}
