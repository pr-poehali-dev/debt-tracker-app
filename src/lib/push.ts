import func2url from "../../backend/func2url.json";

const CHAT_URL = func2url["chat"];
const PUSH_RESET_VERSION = "v2-2026-05-12";
const PUSH_RESET_KEY = "push_reset_version";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function hardResetPush(token: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* ignore */ }
    }
    // Удаляем ВСЕ подписки пользователя на backend (без endpoint в теле — чистит всё)
    try {
      await fetch(`${CHAT_URL}?action=unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
    } catch { /* ignore */ }
    try { localStorage.removeItem(PUSH_RESET_KEY); } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

export async function ensurePushSubscription(
  token: string,
  opts: { silent?: boolean } = {}
): Promise<"granted" | "denied" | "default" | "unsupported" | "error"> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return "unsupported";
    }

    let permission = Notification.permission;
    if (permission === "default") {
      if (opts.silent) return "default";
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") return permission;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    // Принудительный одноразовый сброс после смены VAPID-ключей
    let storedVersion: string | null = null;
    try { storedVersion = localStorage.getItem(PUSH_RESET_KEY); } catch { /* ignore */ }
    if (storedVersion !== PUSH_RESET_VERSION && sub) {
      const oldEndpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch { /* ignore */ }
      try {
        await fetch(`${CHAT_URL}?action=unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: oldEndpoint }),
        });
      } catch { /* ignore */ }
      sub = null;
    }

    const keyRes = await fetch(`${CHAT_URL}?action=vapid-key`);
    if (!keyRes.ok) return "error";
    const { public_key } = await keyRes.json();
    if (!public_key) return "error";
    const serverKey = urlBase64ToUint8Array(public_key);

    if (sub) {
      const existingKey = sub.options?.applicationServerKey;
      let same = false;
      if (existingKey) {
        const a = new Uint8Array(existingKey as ArrayBuffer);
        if (a.length === serverKey.length) {
          same = true;
          for (let i = 0; i < a.length; i++) {
            if (a[i] !== serverKey[i]) { same = false; break; }
          }
        }
      }
      if (!same) {
        try { await sub.unsubscribe(); } catch { /* ignore */ }
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey,
      });
    }

    const subJson = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    await fetch(`${CHAT_URL}?action=subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      }),
    });

    try { localStorage.setItem(PUSH_RESET_KEY, PUSH_RESET_VERSION); } catch { /* ignore */ }
    return "granted";
  } catch {
    return "error";
  }
}

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
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
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
  } catch {
    return false;
  }
}