import { useState } from "react";
import { useSubscription, PaywallReason } from "@/hooks/useSubscription";
import Icon from "@/components/ui/icon";
import urls from "../../backend/func2url.json";

interface Props {
  onClose: () => void;
  reason: PaywallReason | null;
}

const FEATURES = [
  { icon: "Infinity", text: "Безлимит активных долгов" },
  { icon: "Home", text: "Безлимит аренд" },
  { icon: "MessageCircle", text: "Безлимит сообщений в чатах" },
  { icon: "FileText", text: "Экспорт договоров и истории в PDF" },
  { icon: "Fingerprint", text: "Биометрия + усиленная защита PIN" },
  { icon: "Headphones", text: "Приоритетная поддержка" },
];

function reasonHeader(reason: PaywallReason | null): { title: string; subtitle: string } {
  if (!reason || reason.type === "manual") {
    return { title: "Pro — без ограничений", subtitle: "Все возможности приложения" };
  }
  if (reason.type === "debts") {
    return {
      title: "Достигнут лимит долгов",
      subtitle: reason.message || `На бесплатном тарифе можно вести до ${reason.limit ?? 5} активных долгов`,
    };
  }
  if (reason.type === "rentals") {
    return {
      title: "Достигнут лимит аренд",
      subtitle: reason.message || `На бесплатном тарифе можно вести до ${reason.limit ?? 2} аренд`,
    };
  }
  if (reason.type === "messages") {
    return {
      title: "Достигнут лимит сообщений",
      subtitle: reason.message || `На бесплатном тарифе можно отправить до ${reason.limit ?? 100} сообщений в одном чате`,
    };
  }
  return { title: "Pro — без ограничений", subtitle: "Все возможности приложения" };
}

export default function PaywallModal({ onClose, reason }: Props) {
  const { info } = useSubscription();
  const price = info?.price_rub ?? 199;
  const { title, subtitle } = reasonHeader(reason);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleBuy() {
    setErrorText(null);
    setLoading(true);
    try {
      const token = localStorage.getItem("df-token") || "";
      const returnUrl = window.location.origin;
      const res = await fetch(urls["payments"], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: "pro_month", return_url: returnUrl }),
      });
      const data = await res.json();
      if (res.ok && data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }
      setErrorText(data.error || "Не удалось создать счёт. Попробуйте позже.");
    } catch {
      setErrorText("Нет соединения с платёжным сервисом");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl animate-fade-in border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "#1a1d2e" }}
      >
        <div className="px-5 pt-5 pb-6 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-indigo-600 rounded-t-3xl">
          <div className="flex items-start justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider">
              <Icon name="Sparkles" size={12} /> Pro
            </span>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="w-9 h-9 rounded-2xl flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
            >
              <Icon name="X" size={18} className="text-white" />
            </button>
          </div>
          <h2 className="text-2xl font-black text-white font-heading mb-1">{title}</h2>
          <p className="text-white/85 text-sm">{subtitle}</p>
        </div>

        <div className="px-5 py-5 space-y-3">
          {FEATURES.map((f) => (
            <div key={f.text} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <Icon name={f.icon} size={18} className="text-purple-400" />
              </div>
              <p className="text-sm text-foreground">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5">
          <div className="rounded-2xl p-4 mb-3 border border-purple-500/30" style={{ background: "rgba(168,85,247,0.08)" }}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-muted-foreground">Подписка Pro</span>
              <span className="text-xs text-muted-foreground">в месяц</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black font-heading text-foreground">{price}</span>
              <span className="text-lg font-bold text-foreground">₽</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBuy}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-base shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)", boxShadow: "0 8px 24px rgba(168,85,247,0.35)" }}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <Icon name="Loader2" size={16} className="animate-spin" />
                Переходим к оплате…
              </span>
            ) : (
              <>Подключить Pro за {price} ₽</>
            )}
          </button>

          {errorText && (
            <div className="mt-3 rounded-xl px-3 py-2 text-xs text-rose-300 flex items-start gap-2"
                 style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)" }}>
              <Icon name="AlertCircle" size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Оплата через <a href="https://www.tbank.ru" target="_blank" rel="noopener noreferrer" className="underline">T-Pay (Т-Банк)</a>. Подписка продлевается каждый период, отменить можно в любой момент.
          </p>

          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2 text-[10px]">
            <a href="/legal/offer" target="_blank" className="text-muted-foreground hover:text-foreground underline">Оферта</a>
            <a href="/legal/privacy" target="_blank" className="text-muted-foreground hover:text-foreground underline">Политика</a>
            <a href="/legal/refund" target="_blank" className="text-muted-foreground hover:text-foreground underline">Возврат</a>
            <a href="/legal/contacts" target="_blank" className="text-muted-foreground hover:text-foreground underline">Контакты</a>
          </div>
        </div>
      </div>
    </div>
  );
}