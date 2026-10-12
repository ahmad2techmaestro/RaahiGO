import { Component, Fragment } from "react";

/**
 * A render error used to unmount the whole app and leave a blank screen until a manual refresh.
 * This catches it, retries the page once automatically (most failures are one-off — a stale chunk,
 * a half-loaded response), and otherwise shows a recoverable message instead of nothing.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, retried: false, attempt: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("[RaahiGo] page crashed:", error);
    const chunk = /Loading chunk|ChunkLoadError|Unexpected token '<'|dynamically imported module/i.test(String(error?.message || error));
    if (chunk) {
      try {
        if (!sessionStorage.getItem("rg-chunk-reload")) {
          sessionStorage.setItem("rg-chunk-reload", "1");
          window.location.reload();
          return;
        }
      } catch { /* ignore */ }
    }
    // Remount the subtree from scratch (fresh DOM — also discards anything a browser extension did to the old one).
    if (!this.state.retried) setTimeout(() => this.setState((s) => ({ error: null, retried: true, attempt: s.attempt + 1 })), 120);
  }

  componentDidUpdate(prev) {
    // Navigating somewhere else always gets a fresh start.
    if (prev.resetKey !== this.props.resetKey && (this.state.error || this.state.retried)) this.setState((s) => ({ error: null, retried: false, attempt: s.attempt + 1 }));
  }

  render() {
    if (!this.state.error) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    if (!this.state.retried) return null; // the automatic retry is about to run
    return (
      <div className="container" style={{ padding: "96px 0", textAlign: "center" }}>
        <h1 style={{ fontSize: "var(--fs-2xl)", marginBottom: 12 }}>This page hit a snag.</h1>
        <p className="muted" style={{ maxWidth: "46ch", margin: "0 auto 24px" }}>
          Nothing was lost. Try again, or head back to the home page.
        </p>
        <pre style={{ maxWidth: 640, margin: "0 auto 20px", padding: 12, textAlign: "left", fontSize: 12, whiteSpace: "pre-wrap", background: "var(--bg-sunk, #eee)", borderRadius: 8, color: "var(--ink-2, #444)" }}>
          {String(this.state.error?.message || this.state.error).slice(0, 300)}
        </pre>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => this.setState((s) => ({ error: null, retried: false, attempt: s.attempt + 1 }))}>Try again</button>
          <a className="btn btn-outline" href="/">Home</a>
        </div>
      </div>
    );
  }
}
