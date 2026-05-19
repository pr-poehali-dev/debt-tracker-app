import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import Icon from "@/components/ui/icon";
import { fmt } from "@/components/index/types";
import ChatWindow from "@/components/ChatWindow";
import { type getT } from "@/i18n";
import func2url from "../../backend/func2url.json";
import { normalizePhone } from "@/lib/phone";
import { formatPhoneInput } from "@/components/NewDebtModalParts/shared";
import ContactPickerButton from "@/components/ui/ContactPickerButton";

const CHAT_URL = func2url["chat"];

export interface Rental {
  id: string;
  share_token: string;
  title: string;
  amount: number;
  note?: string;
  payment_day: number;
  landlord_name: string;
  landlord_phone?: string;
  tenant_name?: string;
  tenant_phone?: string;
  landlord_user_id?: number;
  tenant_user_id?: number;
  tenant_decision?: string;
  status: string;
  current_month_status_landlord: string;
  current_month_status_tenant: string;
  last_payment_month?: string;
  pending_amount?: number;
  created_at: string;
  landlord_avatar_url?: string;
  tenant_avatar_url?: string;
  paid_until?: string | null;
}

interface Props {
  userId: number;
  token: string;
  myName: string;
  isDemo: boolean;
  openNew?: boolean;
  onNewClose?: () => void;
  t?: ReturnType<typeof getT>;
  rentals?: Rental[];
  setRentals?: React.Dispatch<React.SetStateAction<Rental[]>>;
  onLimitReached?: (info: { type: string; message?: string; limit?: number; current?: number }) => void;
}

const DEMO_RENTALS: Rental[] = [
  {
    id: "1", share_token: "DEMO0001", title: "Гараж на Ленина, 12", amount: 8000, payment_day: 5,
    landlord_name: "Сергей Иванов", tenant_name: "Вы", status: "active",
    current_month_status_landlord: "unpaid", current_month_status_tenant: "unpaid",
    tenant_decision: "accepted", created_at: new Date().toISOString(),
  },
  {
    id: "2", share_token: "DEMO0002", title: "Кладовка №7", amount: 2500, payment_day: 10,
    landlord_name: "Вы", tenant_name: "Анна Петрова", status: "active",
    current_month_status_landlord: "unpaid", current_month_status_tenant: "paid",
    tenant_decision: "accepted", created_at: new Date().toISOString(),
  },
];

function PaymentCalendar({ rental, token, userId, onClose, t }: { rental: Rental; token: string; userId: number; onClose: () => void; t?: ReturnType<typeof getT> }) {
  const [payments, setPayments] = useState<{ month: string; role: string; status: string; amount: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [confirmMonth, setConfirmMonth] = useState<string | null>(null);

  useEffect(() => {
    const tm = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(tm);
  }, []);

  async function loadHistory() {
    const { default: urls } = await import("../../backend/func2url.json");
    const res = await fetch(`${urls["rentals"]}?token=${rental.share_token}&history=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = res.ok ? await res.json() : { payments: [] };
    setPayments(d.payments || []);
    setLoading(false);
  }

  useEffect(() => { loadHistory(); }, [rental.share_token, token]);

  const isLandlord = rental.landlord_user_id === userId;
  const myRole: "landlord" | "tenant" = isLandlord ? "landlord" : "tenant";
  const currentKey = new Date().toISOString().slice(0, 7);

  // 6 будущих месяцев + текущий + 11 прошлых (сверху — самый дальний будущий)
  const today = new Date();
  const months = Array.from({ length: 18 }, (_, i) => {
    const offset = 6 - i; // от +6 до -11
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
  });

  const MONTHS_RU = t?.monthsShort ?? ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

  function getStatus(monthKey: string, role: string) {
    return payments.find(p => p.month === monthKey && p.role === role)?.status || null;
  }

  async function payMonth(monthKey: string) {
    setPaying(monthKey);
    setConfirmMonth(null);
    try {
      const { default: urls } = await import("../../backend/func2url.json");
      const res = await fetch(`${urls["rentals"]}?token=${rental.share_token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_status: "paid", role: myRole, month: monthKey }),
      });
      if (res.ok) await loadHistory();
    } finally {
      setPaying(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (!ready) return; if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-5 space-y-4" style={{ background: "#13152a", maxHeight: "80vh", overflowY: "auto", paddingBottom: "max(100px, calc(env(safe-area-inset-bottom) + 100px))" }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-bold text-foreground truncate">{rental.title}</p>
            <p className="text-xs text-muted-foreground">{(t?.rentalHistoryTitle ?? "История платежей · {day}-е число").replace("{day}", String(rental.payment_day))}</p>
          </div>
          <button onClick={onClose}
            aria-label={t?.close ?? "Закрыть"}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-white/15 transition-colors"
            style={{ background: "rgba(255,255,255,0.12)" }}>
            <Icon name="X" size={20} className="text-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Icon name="Loader2" size={24} className="text-teal-400 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground font-medium px-1">
              <span>{t?.rentalColMonth ?? "Месяц"}</span>
              <span className="text-center">{t?.rentalColLandlord ?? "Арендодатель"}</span>
              <span className="text-center">{t?.rentalColTenant ?? "Арендатор"}</span>
            </div>
            {months.map(({ year, month, key }) => {
              const landlordStatus = getStatus(key, "landlord");
              const tenantStatus = getStatus(key, "tenant");
              const isCurrentMonth = key === currentKey;
              const isFuture = key > currentKey;
              const isPast = key < currentKey;
              const myStatus = myRole === "landlord" ? landlordStatus : tenantStatus;
              const canPay = !isPast && myStatus !== "paid";
              const isConfirming = confirmMonth === key;

              const renderCell = (role: "landlord" | "tenant", status: string | null) => {
                if (status === "paid") {
                  return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}><Icon name="Check" size={9} />{t?.rentalPaidStatus ?? "Оплачено"}</span>;
                }
                if (role === myRole && canPay) {
                  if (paying === key) {
                    return <Icon name="Loader2" size={12} className="text-teal-400 animate-spin" />;
                  }
                  return (
                    <button
                      onClick={() => isFuture ? setConfirmMonth(key) : payMonth(key)}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                      style={{ background: isFuture ? "rgba(168,85,247,0.15)" : "rgba(20,184,166,0.18)", color: isFuture ? "#c084fc" : "#5eead4", border: `1px solid ${isFuture ? "rgba(168,85,247,0.3)" : "rgba(20,184,166,0.35)"}` }}
                    >
                      <Icon name={isFuture ? "Zap" : "CheckCircle2"} size={10} />
                      {isFuture ? (t?.rentalPayEarly ?? "Заранее") : (t?.rentalPay ?? "Оплатить")}
                    </button>
                  );
                }
                return <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#6b7280" }}>—</span>;
              };

              return (
                <div key={key}>
                  <div className="grid grid-cols-3 gap-1 items-center rounded-xl px-3 py-2.5"
                    style={{ background: isCurrentMonth ? "rgba(20,184,166,0.08)" : isFuture ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.03)", border: isCurrentMonth ? "1px solid rgba(20,184,166,0.2)" : "1px solid transparent" }}>
                    <span className={`text-xs font-medium ${isCurrentMonth ? "text-teal-400" : isFuture ? "text-purple-300" : "text-foreground"}`}>
                      {MONTHS_RU[month]} {year !== new Date().getFullYear() ? year : ""}
                    </span>
                    <div className="flex justify-center">{renderCell("landlord", landlordStatus)}</div>
                    <div className="flex justify-center">{renderCell("tenant", tenantStatus)}</div>
                  </div>
                  {isConfirming && (
                    <div className="rounded-xl p-3 mt-1 space-y-2" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)" }}>
                      <p className="text-xs text-center text-foreground">
                        Оплатить {MONTHS_RU[month]} {year} заранее на сумму {new Intl.NumberFormat("ru-RU").format(rental.amount)} ₽?
                      </p>
                      <p className="text-[10px] text-center text-muted-foreground">Отменить это действие будет нельзя</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmMonth(null)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-muted-foreground"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          Отмена
                        </button>
                        <button onClick={() => payMonth(key)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
                          style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>
                          Подтвердить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function RentalCard({ rental, userId, token, onUpdate, onDelete, t, onOpenCalendar }: { rental: Rental; userId: number; token: string; onUpdate: (token: string, body: Record<string, unknown>) => void; onDelete: (token: string) => void; t?: ReturnType<typeof getT>; onOpenCalendar: (rental: Rental) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unread, setUnread] = useState(0);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const isLandlord = rental.landlord_user_id === userId;
  const canChat = rental.tenant_decision === "accepted" &&
    rental.tenant_user_id && rental.landlord_user_id &&
    (rental.landlord_user_id === userId || rental.tenant_user_id === userId);

  useEffect(() => {
    if (!canChat) return;
    let cancelled = false;
    async function fetchUnread() {
      const res = await fetch(`${CHAT_URL}?unread=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) return;
      const d = await res.json() as { chats?: { rental_id?: number | null; unread: number }[] };
      const mine = (d.chats || []).find(c => c.rental_id === Number(rental.id));
      setUnread(mine?.unread || 0);
    }
    fetchUnread();
    const iv = setInterval(fetchUnread, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [rental.id, canChat, token, showChat]);

  const isPendingAmount = rental.tenant_decision === "pending_amount";
  const today = new Date().getDate();
  const daysUntil = rental.payment_day >= today ? rental.payment_day - today : (rental.payment_day + 30 - today);
  const isNear = daysUntil <= 3;
  const myPayStatus = isLandlord ? rental.current_month_status_landlord : rental.current_month_status_tenant;

  const roleColor = isLandlord
    ? { bg: "rgba(168,85,247,0.18)", icon: "#c084fc", badge: "rgba(168,85,247,0.2)", badgeText: "#c084fc", border: "rgba(168,85,247,0.25)", amount: "#c084fc" }
    : { bg: "rgba(56,189,248,0.15)", icon: "#7dd3fc", badge: "rgba(56,189,248,0.15)", badgeText: "#7dd3fc", border: "rgba(56,189,248,0.2)", amount: "#7dd3fc" };

  return (
    <div className="glass rounded-2xl p-4 space-y-3" style={{ borderLeft: `3px solid ${roleColor.border}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            {(() => {
              const counterpartyAvatar = isLandlord ? rental.tenant_avatar_url : rental.landlord_avatar_url;
              const counterpartyName = isLandlord ? (rental.tenant_name || "?") : rental.landlord_name;
              if (counterpartyAvatar) {
                return (
                  <img
                    src={counterpartyAvatar}
                    alt={counterpartyName}
                    className="w-10 h-10 rounded-xl object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                );
              }
              return (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: roleColor.bg }}>
                  <Icon name={isLandlord ? "KeyRound" : "Home"} size={20} style={{ color: roleColor.icon }} />
                </div>
              );
            })()}
            <span className="absolute -bottom-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded-full leading-none"
              style={{ background: roleColor.badge, color: roleColor.badgeText, border: `1px solid ${roleColor.border}` }}>
              {isLandlord ? (t?.rentalAsLandlord ?? "Сдаю") : (t?.rentalAsTenant ?? "Снимаю")}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{rental.title}</p>
            <p className="text-xs text-muted-foreground">
              {isLandlord ? `${t?.rentalTenantLabel ?? "Арендатор"}: ${rental.tenant_name || "—"}` : `${t?.rentalLandlord ?? "Арендодатель"}: ${rental.landlord_name}`}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="flex items-center justify-end gap-1.5">
            <p className="text-lg font-bold font-heading" style={{ color: roleColor.amount }}>{fmt(rental.amount)}</p>
            {isLandlord && !isPendingAmount && rental.tenant_decision === "accepted" && (
              <button
                onClick={() => { setNewPrice(String(Math.round(rental.amount))); setShowPriceEdit(true); }}
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.25)" }}
                title="Изменить цену"
              >
                <Icon name="Pencil" size={11} style={{ color: "#c084fc" }} />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t?.perMonth ?? "в месяц"}</p>
        </div>
      </div>

      {isPendingAmount && rental.pending_amount && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <p className="text-xs font-medium" style={{ color: "#fcd34d" }}>
            {isLandlord
              ? `Ожидаем согласования арендатором: ${fmt(rental.amount)} → ${fmt(rental.pending_amount)}/мес`
              : `Арендодатель изменил сумму: ${fmt(rental.amount)} → ${fmt(rental.pending_amount)}/мес`}
          </p>
          {!isLandlord && (
            <div className="flex gap-2">
              <button onClick={() => onUpdate(rental.share_token, { accept_new_amount: true })}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: "#22c55e" }}>
                Принять
              </button>
              <button onClick={() => onUpdate(rental.share_token, { accept_new_amount: false })}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: "#f43f5e" }}>
                Отклонить
              </button>
            </div>
          )}
          {isLandlord && (
            <button onClick={() => onUpdate(rental.share_token, { accept_new_amount: false })}
              className="w-full py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fcd34d" }}>
              Отменить предложение
            </button>
          )}
        </div>
      )}

      {showPriceEdit && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={e => { if (e.currentTarget === e.target) setShowPriceEdit(false); }}>
          <div className="w-full max-w-md rounded-t-3xl p-5 space-y-4" style={{ background: "#13152a", paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 40px))" }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">Изменить цену аренды</p>
              <button onClick={() => setShowPriceEdit(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <Icon name="X" size={14} className="text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              «{rental.title}» · текущая цена {fmt(rental.amount)}/мес. Новая цена начнёт действовать только после подтверждения арендатором.
            </p>
            <div>
              <label className="text-[11px] text-muted-foreground">Новая сумма, ₽</label>
              <input
                type="number"
                inputMode="numeric"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Например, 27000"
                className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-transparent text-foreground outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowPriceEdit(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                Отмена
              </button>
              <button
                disabled={!newPrice || Number(newPrice) <= 0 || Number(newPrice) === rental.amount}
                onClick={() => {
                  onUpdate(rental.share_token, { new_amount: Number(newPrice) });
                  setShowPriceEdit(false);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>
                Предложить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {rental.tenant_decision === "pending" && !isLandlord && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)" }}>
          <p className="text-xs font-medium text-purple-300">Вас приглашают как арендатора. Согласиться?</p>
          <div className="flex gap-2">
            <button onClick={() => onUpdate(rental.share_token, { tenant_decision: "accepted" })}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: "#22c55e" }}>
              Принять
            </button>
            <button onClick={() => onUpdate(rental.share_token, { tenant_decision: "rejected" })}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: "#f43f5e" }}>
              Отклонить
            </button>
          </div>
        </div>
      )}

      {/* Оплачено вперёд — если есть оплаченные будущие месяцы */}
      {(() => {
        const currentKey = new Date().toISOString().slice(0, 7);
        if (!rental.paid_until || rental.paid_until <= currentKey) return null;
        const [yStr, mStr] = rental.paid_until.split("-");
        const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
        const monthLabel = `${MONTHS_RU[parseInt(mStr, 10) - 1]} ${yStr}`;
        return (
          <div className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)" }}>
            <Icon name="Zap" size={14} style={{ color: "#c084fc" }} />
            <p className="text-xs font-medium" style={{ color: "#c084fc" }}>
              Оплачено вперёд: до {monthLabel}
            </p>
          </div>
        );
      })()}

      {/* Статус оплаты текущего месяца — главный визуальный индикатор */}
      {myPayStatus === "paid" ? (
        <div className="rounded-xl p-3 flex items-center justify-between"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)" }}>
              <Icon name="Check" size={16} style={{ color: "#4ade80" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>{t?.paidThisMonth ?? "Оплачено в этом месяце"}</p>
              {(() => {
                const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
                const now = new Date();
                const next = new Date(now.getFullYear(), now.getMonth() + 1, rental.payment_day);
                return (
                  <p className="text-sm mt-0.5" style={{ color: "rgba(74,222,128,0.85)" }}>
                    Следующий платёж: <span className="font-semibold">{rental.payment_day} {MONTHS_RU[next.getMonth()]}{next.getFullYear() !== now.getFullYear() ? ` ${next.getFullYear()}` : ""}</span>
                  </p>
                );
              })()}
            </div>
          </div>
          <button onClick={() => onOpenCalendar(rental)} className="text-[11px] text-teal-400 hover:opacity-70">
            {t?.historyShort ?? "История"}
          </button>
        </div>
      ) : confirmPay ? (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.3)" }}>
          <p className="text-xs text-center text-foreground">
            {isLandlord
              ? `Подтвердить получение оплаты ${fmt(rental.amount)} за этот месяц?`
              : `Отметить оплату ${fmt(rental.amount)} за этот месяц?`}
          </p>
          <p className="text-[10px] text-center text-muted-foreground">Отменить это действие будет нельзя</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmPay(false)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-muted-foreground"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Отмена
            </button>
            <button onClick={() => { onUpdate(rental.share_token, { payment_status: "paid", role: isLandlord ? "landlord" : "tenant" }); setConfirmPay(false); }}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #14b8a6, #0d9488)" }}>
              Подтвердить
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {(() => {
            const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
            const now = new Date();
            const due = rental.payment_day >= now.getDate()
              ? new Date(now.getFullYear(), now.getMonth(), rental.payment_day)
              : new Date(now.getFullYear(), now.getMonth() + 1, rental.payment_day);
            const dueLabel = `${rental.payment_day} ${MONTHS_RU[due.getMonth()]}`;
            return (
              <button onClick={() => onOpenCalendar(rental)}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2 hover:opacity-80 transition-opacity"
                style={{
                  background: isNear ? "rgba(245,158,11,0.1)" : "rgba(20,184,166,0.08)",
                  border: `1px solid ${isNear ? "rgba(245,158,11,0.25)" : "rgba(20,184,166,0.2)"}`,
                }}>
                <div className="flex items-center gap-2">
                  <Icon name="CalendarDays" size={16} style={{ color: isNear ? "#fbbf24" : "#5eead4" }} />
                  <div className="text-left">
                    <p className="text-sm font-bold" style={{ color: isNear ? "#fbbf24" : "#5eead4" }}>
                      {daysUntil === 0 ? "Сегодня платёж" : `Платёж ${dueLabel}`}
                    </p>
                    {daysUntil > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">через {daysUntil} {daysUntil === 1 ? "день" : daysUntil < 5 ? "дня" : "дн."}</p>
                    )}
                  </div>
                </div>
                <Icon name="ChevronRight" size={14} className="text-muted-foreground" />
              </button>
            );
          })()}
          <button
            onClick={() => setConfirmPay(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #14b8a6, #0d9488)" }}
          >
            <Icon name="CheckCircle2" size={16} />
            {isLandlord ? "Отметить оплачено" : "Отметить вручную"}
          </button>
        </div>
      )}

      {/* Дополнительные действия: QR, чат, удалить — компактная панель иконок */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          {isLandlord && <QRButton shareToken={rental.share_token} />}
          {canChat && (
            <button
              onClick={() => { setShowChat(true); setUnread(0); }}
              className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}
            >
              <Icon name="MessageCircle" size={15} style={{ color: "#a855f7" }} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                  style={{ background: "#a855f7" }}>{unread > 9 ? "9+" : unread}</span>
              )}
            </button>
          )}
          {/* Статус арендатора — только если не подтверждено (важная информация) */}
          {isLandlord && rental.tenant_decision !== "accepted" && (
            <>
              {rental.tenant_decision === "rejected" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium" style={{ background: "rgba(244,63,94,0.15)", color: "#fb7185" }}>
                  <Icon name="XCircle" size={10} /> Арендатор отклонил
                </span>
              )}
              {(!rental.tenant_decision || rental.tenant_decision === "pending") && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                  <Icon name="Clock" size={10} /> Ждём арендатора
                </span>
              )}
            </>
          )}
        </div>
        {isLandlord && (
          <button onClick={() => setConfirmDelete(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-70"
            style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)" }}
            title="Удалить аренду">
            <Icon name="Trash2" size={14} style={{ color: "#fb7185" }} />
          </button>
        )}
      </div>

      {showChat && (
        <ChatWindow
          rentalId={Number(rental.id)}
          title={rental.title}
          contactName={isLandlord ? rental.tenant_name : rental.landlord_name}
          contactAvatarUrl={isLandlord ? rental.tenant_avatar_url : rental.landlord_avatar_url}
          token={token}
          onClose={() => setShowChat(false)}
        />
      )}

      {confirmDelete && isLandlord ? (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
          <p className="text-xs text-center text-muted-foreground">
            Удалить аренду безвозвратно?
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-muted-foreground"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Отмена
            </button>
            <button onClick={() => onDelete(rental.share_token)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: "#f43f5e" }}>
              Удалить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PayBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
        <Icon name="CheckCircle" size={10} /> Оплачено
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
      <Icon name="Clock" size={10} /> Не оплачено
    </span>
  );
}

function QRCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    }
  }, [url]);
  return <canvas ref={canvasRef} className="rounded-xl" />;
}

function QRButton({ shareToken }: { shareToken: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/?rental=${shareToken}`;

  function copyLink() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button onClick={() => setShow(true)}
        className="w-10 h-9 rounded-xl flex items-center justify-center transition-all"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <Icon name="QrCode" size={16} className="text-muted-foreground" />
      </button>
      <button onClick={copyLink}
        className="w-10 h-9 rounded-xl flex items-center justify-center transition-all"
        style={{ background: copied ? "rgba(20,184,166,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${copied ? "rgba(20,184,166,0.5)" : "rgba(255,255,255,0.1)"}` }}>
        <Icon name={copied ? "Check" : "Copy"} size={16} className={copied ? "text-teal-400" : "text-muted-foreground"} />
      </button>

      {show && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setShow(false)}>
          <div className="glass rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-foreground text-sm">QR-код для арендатора</p>
            <div className="bg-white p-3 rounded-xl">
              <QRCanvas url={url} />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">{url}</p>
            <button onClick={copyLink} className="w-full py-2 rounded-xl text-xs font-medium gradient-purple text-white flex items-center justify-center gap-2">
              <Icon name={copied ? "Check" : "Copy"} size={14} />
              {copied ? "Скопировано!" : "Скопировать ссылку"}
            </button>
            <button onClick={() => setShow(false)} className="text-xs text-muted-foreground">Закрыть</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function RentalInviteModal({ token: shareToken, authToken, onClose }: { token: string; authToken: string; onClose: () => void }) {
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<string | null>(null);

  useEffect(() => {
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(`${urls["rentals"]}?token=${shareToken}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { setRental(data); setLoading(false); });
    });
  }, [shareToken, authToken]);

  async function handleDecision(d: string) {
    setDecision(d);
    const urls = (await import("../../backend/func2url.json")).default;
    await fetch(`${urls["rentals"]}?token=${shareToken}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ tenant_decision: d }),
    });
    if (d === "accepted") setTimeout(onClose, 1500);
    else setTimeout(onClose, 1200);
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }} onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="glass rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">Приглашение на аренду</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <Icon name="X" size={13} className="text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Icon name="Loader2" size={28} className="text-teal-400 animate-spin" /></div>
        ) : !rental ? (
          <p className="text-sm text-center text-muted-foreground py-4">Аренда не найдена</p>
        ) : decision ? (
          <div className="text-center py-4">
            <Icon name={decision === "accepted" ? "CheckCircle" : "XCircle"} size={44}
              className={`mx-auto mb-2 ${decision === "accepted" ? "text-green-400" : "text-red-400"}`} />
            <p className="font-semibold text-foreground">
              {decision === "accepted" ? "Аренда принята!" : "Аренда отклонена"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Раздел «Аренда» обновится автоматически</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(20,184,166,0.2)" }}>
                <Icon name="Home" size={22} style={{ color: "#5eead4" }} />
              </div>
              <div>
                <p className="font-bold text-foreground">{rental.title}</p>
                <p className="text-xs text-muted-foreground">от {rental.landlord_name}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="text-xs text-muted-foreground mb-1">Сумма</p>
                <p className="font-bold" style={{ color: "#5eead4" }}>{fmt(rental.amount)}/мес</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="text-xs text-muted-foreground mb-1">Дата платежа</p>
                <p className="font-bold text-foreground">{rental.payment_day}-е число</p>
              </div>
            </div>
            {rental.note && <p className="text-sm text-muted-foreground">{rental.note}</p>}
            <div className="flex gap-3">
              <button onClick={() => handleDecision("accepted")}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: "#22c55e" }}>
                Принять
              </button>
              <button onClick={() => handleDecision("rejected")}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: "#f43f5e" }}>
                Отклонить
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export function SharedRentalView({ token: shareToken }: { token: string }) {
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<string | null>(null);

  useEffect(() => {
    import("../../backend/func2url.json").then(({ default: urls }) => {
      const t = localStorage.getItem("df-token");
      fetch(`${urls["rentals"]}?token=${shareToken}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { setRental(data); setLoading(false); });
    });
  }, [shareToken]);

  async function handleDecision(d: string) {
    setDecision(d);
    const urls = (await import("../../backend/func2url.json")).default;
    const t = localStorage.getItem("df-token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (t) headers["Authorization"] = `Bearer ${t}`;
    await fetch(`${urls["rentals"]}?token=${shareToken}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ tenant_decision: d }),
    });
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0f1a" }}>
      <Icon name="Loader2" size={32} className="text-teal-400 animate-spin" />
    </div>
  );

  if (!rental) return (
    <div className="min-h-screen flex items-center justify-center text-foreground" style={{ background: "#0d0f1a" }}>
      <div className="text-center">
        <Icon name="AlertCircle" size={48} className="text-red-400 mx-auto mb-3" />
        <p className="font-semibold">Аренда не найдена</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0d0f1a" }}>
      <div className="max-w-sm w-full space-y-4">
        <div className="text-center mb-6">
          <h1 className="font-heading font-black text-2xl text-gradient-purple">Debt-Debt</h1>
          <p className="text-xs text-muted-foreground mt-1">Приглашение на аренду</p>
        </div>
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(20,184,166,0.2)" }}>
              <Icon name="Home" size={24} style={{ color: "#5eead4" }} />
            </div>
            <div>
              <p className="font-bold text-foreground text-lg">{rental.title}</p>
              <p className="text-xs text-muted-foreground">от {rental.landlord_name}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">Сумма</p>
              <p className="font-bold" style={{ color: "#5eead4" }}>{fmt(rental.amount)}/мес</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">Дата платежа</p>
              <p className="font-bold text-foreground">{rental.payment_day}-е число</p>
            </div>
          </div>
          {rental.note && <p className="text-sm text-muted-foreground">{rental.note}</p>}

          {decision ? (
            <div className="text-center py-4 space-y-4">
              <div>
                <Icon name={decision === "accepted" ? "CheckCircle" : "XCircle"} size={48}
                  className={`mx-auto mb-2 ${decision === "accepted" ? "text-green-400" : "text-red-400"}`} />
                <p className="font-semibold text-foreground">
                  {decision === "accepted" ? "Вы приняли аренду!" : "Вы отклонили аренду"}
                </p>
              </div>
              {decision === "accepted" && (
                <a href="/?section=rental" className="block w-full py-3 rounded-xl font-semibold text-white text-sm text-center"
                  style={{ background: "linear-gradient(135deg, #14b8a6, #6366f1)" }}>
                  Открыть приложение
                </a>
              )}
            </div>
          ) : rental.tenant_decision === "accepted" ? (
            <div className="text-center py-3 space-y-3">
              <div>
                <Icon name="CheckCircle" size={32} className="text-green-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Аренда уже подтверждена</p>
              </div>
              <a href="/?section=rental" className="block w-full py-3 rounded-xl font-semibold text-white text-sm text-center"
                style={{ background: "linear-gradient(135deg, #14b8a6, #6366f1)" }}>
                Открыть приложение
              </a>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => handleDecision("accepted")}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: "#22c55e" }}>
                Принять
              </button>
              <button onClick={() => handleDecision("rejected")}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: "#f43f5e" }}>
                Отклонить
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) { void e; }
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function checkAndNotify(rentals: Rental[], myName: string) {
  const today = new Date().getDate();
  const seenKey = "df-rental-notif-" + new Date().toISOString().slice(0, 7);
  const seen: string[] = JSON.parse(localStorage.getItem(seenKey) || "[]");

  rentals.forEach(r => {
    if (r.status !== "active") return;
    if (r.payment_day !== today) return;
    if (seen.includes(r.share_token)) return;
    if (r.current_month_status_landlord === "paid" && r.current_month_status_tenant === "paid") return;

    seen.push(r.share_token);
    localStorage.setItem(seenKey, JSON.stringify(seen));

    playNotificationSound();

    if (Notification.permission === "granted") {
      new Notification("Напоминание об оплате аренды", {
        body: `${r.title} — ${r.amount.toLocaleString("ru-RU")} ₽`,
        icon: "/favicon.ico",
        tag: `rental-${r.share_token}`,
      });
    }
  });
}

export default function RentalSection({ userId, token, myName, isDemo, openNew, onNewClose, t, rentals: rentalsProp, setRentals: setRentalsProp, onLimitReached }: Props) {
  const useExternal = !!setRentalsProp;
  const [localRentals, setLocalRentals] = useState<Rental[]>(isDemo ? DEMO_RENTALS : []);
  const rentals = useExternal ? (rentalsProp ?? []) : localRentals;
  const setRentals: React.Dispatch<React.SetStateAction<Rental[]>> = useExternal
    ? (setRentalsProp as React.Dispatch<React.SetStateAction<Rental[]>>)
    : setLocalRentals;
  const [showNew, setShowNew] = useState(false);
  const [calendarRentalId, setCalendarRentalId] = useState<string | number | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (openNew) setShowNew(true);
  }, [openNew]);
  const [loading, setLoading] = useState(!isDemo && !useExternal);

  useEffect(() => {
    if (isDemo || useExternal) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(`${urls["rentals"]}?user_id=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then(data => { setLocalRentals(data); setLoading(false); });
    });
  }, [isDemo, userId, token, useExternal]);

  useEffect(() => {
    if (rentals.length === 0) return;
    checkAndNotify(rentals, myName);
  }, [rentals, myName]);

  useEffect(() => {
    if (loading || rentals.length === 0) return;
    try {
      const url = new URL(window.location.href);
      const target = url.searchParams.get("openRental");
      if (!target) return;
      const found = rentals.find(r => String(r.id) === target);
      if (found) setCalendarRentalId(found.id);
      url.searchParams.delete("openRental");
      window.history.replaceState(null, "", url.toString());
    } catch { /* no-op */ }
  }, [loading, rentals]);

  async function handleRequestPermission() {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? "granted" : "denied");
    if (granted && rentals.length > 0) checkAndNotify(rentals, myName);
  }

  async function handleUpdate(shareToken: string, body: Record<string, unknown>) {
    if (isDemo) {
      setRentals(prev => prev.map(r => {
        if (r.share_token !== shareToken) return r;
        const updated = { ...r };
        if (body.payment_status) {
          if (body.role === "landlord") updated.current_month_status_landlord = body.payment_status as string;
          else updated.current_month_status_tenant = body.payment_status as string;
        }
        if (body.tenant_decision) updated.tenant_decision = body.tenant_decision as string;
        return updated;
      }));
      return;
    }
    const urls = (await import("../../backend/func2url.json")).default;
    const res = await fetch(`${urls["rentals"]}?token=${shareToken}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated: Rental = await res.json();
      setRentals(prev => prev.map(r => r.share_token === shareToken ? updated : r));
    }
  }

  async function handleDelete(shareToken: string) {
    if (isDemo) { setRentals(prev => prev.filter(r => r.share_token !== shareToken)); return; }
    const urls = (await import("../../backend/func2url.json")).default;
    const res = await fetch(`${urls["rentals"]}?token=${shareToken}&user_id=${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRentals(prev => prev.filter(r => r.share_token !== shareToken));
  }

  function handleCreated(rental: Rental) {
    setRentals(prev => [rental, ...prev]);
    setShowNew(false);
  }

  const active = rentals.filter(r => r.status === "active");
  const archived = rentals.filter(r => r.status === "archived");
  const lendingOut = active.filter(r => r.landlord_user_id === userId);
  const renting = active.filter(r => r.tenant_user_id === userId);

  function RentalGroup({ list, label, color, icon }: { list: Rental[]; label: string; color: string; icon: string }) {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}22` }}>
            <Icon name={icon} size={11} style={{ color }} />
          </div>
          <p className="text-xs font-semibold" style={{ color }}>{label}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>
            {list.length}
          </span>
          <div className="flex-1 h-px" style={{ background: `${color}20` }} />
        </div>
        <div className="space-y-3">
          {list.map(r => (
            <RentalCard key={r.id} rental={r} userId={userId} token={token} onUpdate={handleUpdate} onDelete={handleDelete} t={t} onOpenCalendar={(rental) => setCalendarRentalId(rental.id)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      {notifPermission === "default" && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(20,184,166,0.1)", border: "1px solid rgba(20,184,166,0.3)" }}>
          <Icon name="Bell" size={16} style={{ color: "#5eead4", flexShrink: 0 }} />
          <p className="text-xs flex-1" style={{ color: "#5eead4" }}>Включить напоминания в день оплаты?</p>
          <button onClick={handleRequestPermission} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex-shrink-0" style={{ background: "rgba(20,184,166,0.4)" }}>
            Включить
          </button>
        </div>
      )}

      {showNew && (
        <NewRentalModal
          myName={myName}
          token={token}
          onClose={() => { setShowNew(false); onNewClose?.(); }}
          onCreated={handleCreated}
          onLimitReached={onLimitReached}
        />
      )}

      {(() => {
        const r = calendarRentalId != null ? rentals.find(x => x.id === calendarRentalId) : null;
        if (!r) return null;
        return <PaymentCalendar rental={r} token={token} userId={userId} onClose={() => setCalendarRentalId(null)} t={t} />;
      })()}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Icon name="Loader2" size={32} className="text-teal-400 animate-spin" />
        </div>
      ) : active.length === 0 ? (
        <div className="glass rounded-2xl p-10 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(20,184,166,0.15)" }}>
            <Icon name="Home" size={32} style={{ color: "#5eead4" }} />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">{t?.rentalEmptyTitle ?? "Нет активных аренд"}</p>
            <p className="text-xs text-muted-foreground">{t?.rentalEmptyAddHint ?? "Нажмите + чтобы добавить первую аренду"}</p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="mt-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white gradient-purple glow-purple">
            {t?.rentalAddBtn ?? "Добавить аренду"}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <RentalGroup list={lendingOut} label={t?.rentalAsLandlord ?? "Сдаю"} color="#c084fc" icon="KeyRound" />
          <RentalGroup list={renting} label={t?.rentalAsTenant ?? "Снимаю"} color="#7dd3fc" icon="Home" />
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium px-1">Архив</p>
          {archived.map(r => (
            <RentalCard key={r.id} rental={r} userId={userId} token={token} onUpdate={handleUpdate} onDelete={handleDelete} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewRentalModal({ myName, token, onClose, onCreated, onLimitReached }: {
  myName: string;
  token: string;
  onClose: () => void;
  onCreated: (r: Rental) => void;
  onLimitReached?: (info: { type: string; message?: string; limit?: number; current?: number }) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    amount: "",
    payment_day: "5",
    tenant_name: "",
    tenant_phone: "",
    note: "",
  });
  const [loading, setLoading] = useState(false);

  function set(k: string, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.title || !form.amount || !form.payment_day) return;
    setLoading(true);
    const urls = (await import("../../backend/func2url.json")).default;
    const res = await fetch(urls["rentals"], {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: form.title,
        amount: parseFloat(form.amount),
        payment_day: parseInt(form.payment_day),
        landlord_name: myName,
        tenant_name: form.tenant_name || undefined,
        tenant_phone: normalizePhone(form.tenant_phone) || undefined,
        note: form.note || undefined,
      }),
    });
    if (res.status === 402) {
      try {
        const data = await res.json();
        if (data?.error === "limit_reached") {
          onLimitReached?.({
            type: data.limit_type || "rentals",
            message: data.message,
            limit: data.limit,
            current: data.current,
          });
          setLoading(false);
          onClose();
          return;
        }
      } catch { /* ignore */ }
    } else if (res.ok) {
      const rental = await res.json();
      onCreated(rental);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
      <div className="rounded-2xl p-6 w-full max-w-sm space-y-4 border border-white/10 shadow-2xl" style={{ background: "#1a1d2e" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-foreground">Новая аренда</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
            <Icon name="X" size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название объекта *</label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Гараж, кладовка, склад..."
              className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сумма/мес (₽) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => set("amount", e.target.value)}
                placeholder="5000"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">День платежа *</label>
              <input
                type="number"
                min={1} max={31}
                value={form.payment_day}
                onChange={e => set("payment_day", e.target.value)}
                placeholder="5"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Имя арендатора</label>
              <ContactPickerButton onPick={(name, phone) => {
                setForm(p => ({ ...p, tenant_name: name || p.tenant_name, tenant_phone: phone || p.tenant_phone }));
              }} />
            </div>
            <input
              value={form.tenant_name}
              onChange={e => set("tenant_name", e.target.value)}
              placeholder="Иван Иванов"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Телефон арендатора</label>
            <input
              type="tel"
              inputMode="numeric"
              value={form.tenant_phone}
              onFocus={() => { if (!form.tenant_phone) set("tenant_phone", "+7 ("); }}
              onChange={e => set("tenant_phone", formatPhoneInput(e.target.value))}
              placeholder="+7 (900) 000-00-00"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Заметка</label>
            <textarea
              value={form.note}
              onChange={e => set("note", e.target.value)}
              placeholder="Дополнительная информация..."
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !form.title || !form.amount}
          className="w-full py-3 rounded-xl font-semibold text-white gradient-purple glow-purple disabled:opacity-50 transition-all"
        >
          {loading ? "Создаю..." : "Создать аренду"}
        </button>
      </div>
    </div>
  );
}