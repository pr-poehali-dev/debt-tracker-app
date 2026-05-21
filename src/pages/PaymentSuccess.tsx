import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import urls from "../../backend/func2url.json";

type Status = "checking" | "paid" | "pending" | "failed" | "unknown";

export default function PaymentSuccess() {
  const [status, setStatus] = useState<Status>("checking");
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    const token = localStorage.getItem("df-token") || "";
    let cancelled = false;
    let attempts = 0;

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
        if (s === "CONFIRMED") setStatus("paid");
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