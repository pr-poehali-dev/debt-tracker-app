import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import urls from "../../backend/func2url.json";

type Status = "checking" | "paid" | "pending" | "failed" | "unknown";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export default function PaymentSuccess() {
  const [status, setStatus] = useState<Status>("checking");
  const [amount, setAmount] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    const token = localStorage.getItem("df-token") || "";
    let cancelled = false;
    let attempts = 0;

    async function fetchSubscription() {
      if (!token) return;
      try {
        const sres = await fetch(urls["subscriptions"], {
          headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
        });
        if (sres.ok) {
          const sdata = await sres.json();
          if (!cancelled && sdata?.expires_at) setExpiresAt(sdata.expires_at);
        }
      } catch { /* ignore */ }
    }

    async function poll() {
      attempts += 1;
      try {
        const url = orderId
          ? `${urls["payments"]}?order_id=${encodeURIComponent(orderId)}`
          : `${urls["payments"]}?action=last`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setStatus("unknown");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setStatus("unknown");
          return;
        }
        if (data.amount_rub) setAmount(data.amount_rub);
        const s: string = data.status || "";
        if (s === "CONFIRMED") {
          setStatus("paid");
          fetchSubscription();
        }
        else if (["REJECTED", "AUTH_FAIL", "DEADLINE_EXPIRED", "CANCELED", "REVERSED", "init_failed"].includes(s)) setStatus("failed");
        else if (attempts < 8) {
          setStatus("pending");
          setTimeout(poll, 2000);
        } else {
          setStatus("pending");
        }
      } catch {
        if (!cancelled) setStatus("unknown");
      }
    }
    poll();
    return () => { cancelled = true; };
  }, []);

  const expiresStr = formatDate(expiresAt);

  const config: Record<Status, { icon: string; color: string; title: string; subtitle: string }> = {
    checking: { icon: "Loader2", color: "#a855f7", title: "Проверяем оплату…", subtitle: "Это займёт пару секунд" },
    pending: { icon: "Clock", color: "#f59e0b", title: "Оплата обрабатывается", subtitle: "T-Bank подтверждает платёж. Подписка активируется автоматически." },
    paid: { icon: "CheckCircle2", color: "#22c55e", title: "Спасибо за оплату!", subtitle: amount ? `Подписка Pro активирована. Списано ${amount} ₽.` : "Подписка Pro активирована." },
    failed: { icon: "XCircle", color: "#f43f5e", title: "Оплата не прошла", subtitle: "Деньги не списаны. Можно попробовать ещё раз." },
    unknown: { icon: "AlertCircle", color: "#94a3b8", title: "Не нашли платёж", subtitle: "Проверьте ссылку или обратитесь в поддержку." },
  };

  const c = config[status];

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-sm w-full text-center space-y-5 rounded-3xl border border-white/10 p-8" style={{ background: "#1a1d2e" }}>
        <div
          className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
          style={{ background: `${c.color}20`, border: `2px solid ${c.color}40` }}
        >
          <Icon name={c.icon} size={36} className={status === "checking" ? "animate-spin" : ""} style={{ color: c.color }} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black font-heading text-foreground">{c.title}</h1>
          <p className="text-sm text-muted-foreground">{c.subtitle}</p>
        </div>

        {status === "paid" && (
          <div className="rounded-2xl p-4 text-left border border-purple-500/30" style={{ background: "rgba(168,85,247,0.10)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff" }}>
                <Icon name="Sparkles" size={10} /> Pro
              </span>
              <span className="text-sm font-bold text-foreground">У вас подписка Pro</span>
            </div>
            {expiresStr && (
              <p className="text-xs text-muted-foreground">Действует до <span className="text-foreground font-semibold">{expiresStr}</span></p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              {[
                { i: "Infinity", t: "Безлимит долгов" },
                { i: "Home", t: "Безлимит аренд" },
                { i: "MessageCircle", t: "Безлимит чата" },
                { i: "Fingerprint", t: "Биометрия" },
              ].map((f) => (
                <div key={f.t} className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon name={f.i} size={12} className="text-purple-400" />
                  <span>{f.t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <a
          href="/"
          className="block w-full py-3 rounded-2xl font-bold text-white text-base active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)" }}
        >
          Вернуться в приложение
        </a>
      </div>
    </div>
  );
}