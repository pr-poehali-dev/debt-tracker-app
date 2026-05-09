import { useState } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  token: string;
  amount: number;
  description: string;
  targetType?: "debt" | "loan" | "rental";
  targetId?: string | number;
  targetMonth?: string;
  className?: string;
  size?: "sm" | "md";
  label?: string;
  onSuccess?: () => void;
}

export default function PayButton({
  token,
  amount,
  description,
  targetType,
  targetId,
  targetMonth,
  className,
  size = "md",
  label,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const urls = (await import("../../backend/func2url.json")).default as Record<string, string>;
      if (!urls["payments"]) {
        setError("Оплата ещё не подключена");
        return;
      }
      const origin = window.location.origin;
      const res = await fetch(urls["payments"], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount,
          description,
          target_type: targetType,
          target_id: targetId,
          target_month: targetMonth,
          success_url: `${origin}/?payment=success`,
          fail_url: `${origin}/?payment=fail`,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(t || "Не удалось создать платёж");
        return;
      }
      const data = await res.json();
      if (data.payment_url) {
        onSuccess?.();
        window.location.href = data.payment_url;
      } else {
        setError("Платёжная ссылка не получена");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка платежа");
    } finally {
      setLoading(false);
    }
  }

  const sizeCls = size === "sm" ? "py-1.5 px-3 text-xs" : "py-2.5 px-4 text-sm";

  return (
    <div className="flex flex-col items-stretch gap-1 w-full">
      <button
        onClick={pay}
        disabled={loading || amount <= 0}
        className={`${sizeCls} rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${className || ""}`}
        style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
      >
        {loading
          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Icon name="CreditCard" size={size === "sm" ? 12 : 14} />
        }
        {label || `Оплатить ${amount.toLocaleString("ru-RU")} ₽`}
      </button>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}