import * as React from 'react';
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { ensurePushSubscription } from './lib/push'

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("/sw.js").then((reg) => {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
    setInterval(() => { reg.update().catch(() => {}); }, 60 * 1000);

    const refreshPush = () => {
      const token = localStorage.getItem("df-token") || "";
      if (!token) return;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        ensurePushSubscription(token, { silent: true }).catch(() => {});
      }
    };
    refreshPush();
    setInterval(refreshPush, 6 * 60 * 60 * 1000);
    window.addEventListener("focus", refreshPush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshPush();
    });
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "PUSH_RESUBSCRIBE") refreshPush();
    });
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);