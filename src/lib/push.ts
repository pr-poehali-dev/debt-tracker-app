import func2url from "../../backend/func2url.json";

const CHAT_URL = func2url["chat"];

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let lastError = "";
export function getLastPushError(): string { return lastError; }

export async function getPushStatus(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function isSubscribedToPush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}

async function fetchVapidKey(): Promise<Uint8Array | null> {
  try {
    const r = await fetch(`${CHAT_URL}?action=vapid-key`);
    if (!r.ok) { lastError = `vapid-key HTTP ${r.status}`; return null; }
    const j = await r.json();
    if (!j.public_key) { lastError = "vapid-key empty"; return null; }
    return b64ToBytes(j.public_key);
  } catch (e) {
    lastError = `vapid-key fetch: ${(e as Error).message}`;
    return null;
  }
}

async function saveSubOnBackend(token: string, sub: PushSubscription): Promise<boolean> {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    const r = await fetch(`${CHAT_URL}?action=subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }),
    });
    if (!r.ok) { lastError = `subscribe save HTTP ${r.status}`; return false; }
    return true;
  } catch (e) {
    lastError = `subscribe save: ${(e as Error).message}`;
    return false;
  }
}

export async function hardResetPush(token: string): Promise<void> {
  lastError = "";
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* ignore */ }
    }
    try {
      await fetch(`${CHAT_URL}?action=unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

export async function ensurePushSubscription(
  token: string,
  opts: { silent?: boolean } = {}
): Promise<"granted" | "denied" | "default" | "unsupported" | "error"> {
  lastError = "";
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      lastError = "no SW/Push/Notification API";
      return "unsupported";
    }

    let permission = Notification.permission;
    if (permission === "default") {
      if (opts.silent) return "default";
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      lastError = `permission ${permission}`;
      return permission;
    }

    const reg = await navigator.serviceWorker.ready;
    const serverKey = await fetchVapidKey();
    if (!serverKey) return "error";

    let sub = await reg.pushManager.getSubscription();

    if (sub) {
      const existing = sub.options?.applicationServerKey;
      let same = false;
      if (existing) {
        const a = new Uint8Array(existing as ArrayBuffer);
        if (a.length === serverKey.length) {
          same = true;
          for (let i = 0; i < a.length; i++) if (a[i] !== serverKey[i]) { same = false; break; }
        }
      }
      if (!same) {
        try { await sub.unsubscribe(); } catch { /* ignore */ }
        sub = null;
      }
    }

    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
      } catch (e) {
        const err = e as Error;
        lastError = `${err.name}: ${err.message}`.slice(0, 200);
        return "error";
      }
    }

    const ok = await saveSubOnBackend(token, sub);
    if (!ok) return "error";
    return "granted";
  } catch (e) {
    const err = e as Error;
    lastError = `${err.name}: ${err.message}`.slice(0, 200);
    return "error";
  }
}

export async function unsubscribeFromPush(token: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(`${CHAT_URL}?action=unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
    return true;
  } catch { return false; }
}
