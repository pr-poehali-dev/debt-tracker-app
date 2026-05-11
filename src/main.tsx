import * as React from 'react';
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

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
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
