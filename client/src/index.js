import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider as ReduxProvider } from "react-redux";
import "./Styles/base.css";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./Components/Layout/ErrorBoundary";
import "./lib/domGuard";
import { startWatchdog } from "./lib/watchdog";
import "./lib/http";
import { preconnectApi } from "./lib/http";
import { startPrefetching } from "./lib/routes";
import { store } from "./Redux/store/store";

ReactDOM.createRoot(document.getElementById("root")).render(
  <ReduxProvider store={store}>
    <BrowserRouter>
      <ErrorBoundary resetKey="root">
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </ReduxProvider>
);

preconnectApi();
startPrefetching();
startWatchdog();
