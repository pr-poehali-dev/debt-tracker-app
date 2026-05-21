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

function formatExpires(iso: string | null): string {
  if (!iso) return "бессрочно";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function sourceLabel(src: string): string {
  if (src === "paid") return "Оплачено";
  if (src === "grandfather") return "Подарочный доступ";
  if (src === "trial") return "Пробный период";
  if (src === "promo") return "По промокоду";
  return "Активна";
}

const DEFAULT_PLANS = [
  { code: "pro_month", title: "Месяц", subtitle: "Pro на 30 дней", amount_rub: 199, period_days: 30, per_month_rub: 199, badge: null },
  { code: "pro_6month", title: "6 месяцев", subtitle: "Pro на полгода", amount_rub: 350, period_days: 182, per_month_rub: 58, badge: "Выгодно −71%" },
  { code: "pro_year", title: "Год", subtitle: "Pro на 12 месяцев", amount_rub: 690, period_days: 365, per_month_rub: 58, badge: "Лучшая цена" },
];

export default function PaywallModal({ onClose, reason }: Props) {
  const { info } = useSubscription();
  const plans = info?.plans && info.plans.length > 0 ? info.plans : DEFAULT_PLANS;
  const { title, subtitle } = reasonHeader(reason);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>(() => {
    const six = plans.find((p) => p.code === "pro_6month");
    return six ? six.code : plans[0]?.code || "pro_month";
  });
  const isPro = info?.plan === "pro";
  const current = plans.find((p) => p.code === selectedPlan) || plans[0];
  const price = current?.amount_rub ?? 199;

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
        body: JSON.stringify({ plan: selectedPlan, return_url: returnUrl }),
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

  if (isPro && (!reason || reason.type === "manual")) {
    const expires = info?.expires_at || null;
    const left = daysLeft(expires);
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
                <Icon name="Sparkles" size={12} /> Pro активна
              </span>
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="w-9 h-9 rounded-2xl flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
              >
                <Icon name="X" size={18} className="text-white" />
              </button>
            </div>
            <h2 className="text-2xl font-black text-white font-heading mb-1">У вас подписка Pro</h2>
            <p className="text-white/85 text-sm">{sourceLabel(info?.source || "")} · {info?.usage ? `${info.usage.active_debts} долгов, ${info.usage.active_rentals} аренд` : "все функции доступны"}</p>
          </div>

          <div className="px-5 pt-5 pb-2 space-y-3">
            <div className="rounded-2xl p-4 border border-purple-500/30" style={{ background: "rgba(168,85,247,0.08)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Действует до</span>
                {left !== null && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: left > 7 ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: left > 7 ? "#22c55e" : "#f59e0b" }}>
                    {left > 0 ? `осталось ${left} дн.` : "истекает сегодня"}
                  </span>
                )}
              </div>
              <div className="text-xl font-black font-heading text-foreground">{formatExpires(expires)}</div>
            </div>

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">Что включено</div>
            <div className="space-y-2.5">
              {FEATURES.map((f) => (
                <div key={f.text} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                    <Icon name={f.icon} size={18} className="text-purple-400" />
                  </div>
                  <p className="text-sm text-foreground">{f.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl font-bold text-white text-base active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)" }}
            >
              Отлично, спасибо!
            </button>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Подписка продлевается автоматически. Управление и отмена — через <a href="/legal/refund" target="_blank" className="underline">страницу возврата</a> или в поддержке.
            </p>
          </div>
        </div>
      </div>
    );
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
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-2">Выберите период</div>
          <div className="space-y-2 mb-4">
            {plans.map((p) => {
              const active = p.code === selectedPlan;
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setSelectedPlan(p.code)}
                  className="w-full text-left rounded-2xl p-3.5 border transition-all active:scale-[0.99]"
                  style={{
                    background: active ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: active ? "#a855f7" : "rgba(255,255,255,0.10)",
                    boxShadow: active ? "0 0 0 1px #a855f7" : "none",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ border: active ? "2px solid #a855f7" : "2px solid rgba(255,255,255,0.25)" }}
                    >
                      {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#a855f7" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{p.title}</span>
                        {p.badge && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                                style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff" }}>
                            {p.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {p.per_month_rub < p.amount_rub ? `≈ ${p.per_month_rub} ₽ / мес` : p.subtitle}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-black font-heading text-foreground leading-none">{p.amount_rub} ₽</div>
                      <div className="text-[10px] text-muted-foreground mt-1">разово</div>
                    </div>
                  </div>
                </button>
              );
            })}
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
              <>Оплатить {price} ₽</>
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