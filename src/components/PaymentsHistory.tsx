import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

interface Payment {
  id: number;
  order_number: string;
  amount: number;
  status: string;
  target_type: string | null;
  target_id: string | null;
  target_month: string | null;
  created_at: string | null;
  paid_at: string | null;
}

interface Props {
  token: string;
  onClose: () => void;
}

const TARGET_LABEL: Record<string, { label: string; icon: string; color: string }> = {
  debt:   { label: "Долг",   icon: "ArrowDownCircle", color: "#7dd3fc" },
  loan:   { label: "Займ",   icon: "Landmark",        color: "#c084fc" },
  rental: { label: "Аренда", icon: "Home",            color: "#5eead4" },
};

export default function PaymentsHistory({ token, onClose }: Props) {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = (func2url as Record<string, string>)["payments"];
    if (!url) { setError("Сервис оплаты не настроен"); setLoading(false); return; }
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(d => setItems(d.payments || []))
      .catch(e => setError(e instanceof Error ? e.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }, [token]);

  const total = items.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{ background: "#13152a", maxHeight: "85vh" }}>
        <div className="p-5 pb-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-foreground text-lg">История платежей</p>
            <p className="text-xs text-muted-foreground">Онлайн-оплаты через карту</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <Icon name="X" size={14} className="text-muted-foreground" />
          </button>
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="px-5 pb-3 flex-shrink-0">
            <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(20,184,166,0.1))", border: "1px solid rgba(34,197,94,0.25)" }}>
              <p className="text-xs text-muted-foreground">Всего успешно оплачено</p>
              <p className="text-2xl font-bold font-heading" style={{ color: "#4ade80" }}>
                {total.toLocaleString("ru-RU")} ₽
              </p>
            </div>
          </div>
        )}

        <div className="px-5 pb-5 overflow-y-auto flex-1">
          {loading && (
            <div className="flex justify-center py-8">
              <Icon name="Loader2" size={24} className="text-purple-400 animate-spin" />
            </div>
          )}
          {error && (
            <div className="rounded-xl p-4 text-center text-sm" style={{ background: "rgba(244,63,94,0.1)", color: "#fb7185" }}>
              {error}
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(168,85,247,0.15)" }}>
                <Icon name="Receipt" size={22} className="text-purple-400" />
              </div>
              <p className="text-sm font-medium text-foreground">Платежей пока нет</p>
              <p className="text-xs text-muted-foreground mt-1">Здесь появятся все ваши онлайн-оплаты</p>
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <div className="space-y-2">
              {items.map(p => {
                const meta = p.target_type ? TARGET_LABEL[p.target_type] : null;
                const isPaid = p.status === "paid";
                const isPending = p.status === "pending";
                return (
                  <div key={p.id} className="rounded-xl p-3 flex items-center justify-between gap-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: meta ? `${meta.color}22` : "rgba(255,255,255,0.05)" }}>
                        <Icon name={(meta?.icon || "Receipt") as string} size={16} style={{ color: meta?.color || "#94a3b8" }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {meta?.label || "Платёж"}{p.target_month ? ` · ${p.target_month}` : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {p.order_number} · {fmtDate(p.paid_at || p.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold" style={{ color: isPaid ? "#4ade80" : "#fbbf24" }}>
                        {p.amount.toLocaleString("ru-RU")} ₽
                      </p>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
                        style={{
                          background: isPaid ? "rgba(34,197,94,0.15)" : isPending ? "rgba(245,158,11,0.15)" : "rgba(244,63,94,0.15)",
                          color: isPaid ? "#4ade80" : isPending ? "#fbbf24" : "#fb7185",
                        }}>
                        <Icon name={isPaid ? "Check" : isPending ? "Clock" : "X"} size={8} />
                        {isPaid ? "Оплачено" : isPending ? "Ожидает" : "Отменён"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
