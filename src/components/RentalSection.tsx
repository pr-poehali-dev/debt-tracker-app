import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";
import { fmt } from "@/components/index/types";

interface Rental {
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
}

interface Props {
  userId: number;
  token: string;
  myName: string;
  isDemo: boolean;
  openNew?: boolean;
  onNewClose?: () => void;
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

function RentalCard({ rental, userId, onUpdate }: { rental: Rental; userId: number; onUpdate: (token: string, body: Record<string, unknown>) => void }) {
  const isLandlord = rental.landlord_user_id === userId;
  const isPendingAmount = rental.tenant_decision === "pending_amount";
  const today = new Date().getDate();
  const daysUntil = rental.payment_day >= today ? rental.payment_day - today : (rental.payment_day + 30 - today);
  const isNear = daysUntil <= 3;
  const myPayStatus = isLandlord ? rental.current_month_status_landlord : rental.current_month_status_tenant;

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(20,184,166,0.2)" }}>
            <Icon name="Home" size={20} style={{ color: "#5eead4" }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{rental.title}</p>
            <p className="text-xs text-muted-foreground">
              {isLandlord ? `Арендатор: ${rental.tenant_name || "—"}` : `Арендодатель: ${rental.landlord_name}`}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold font-heading" style={{ color: "#5eead4" }}>{fmt(rental.amount)}</p>
          <p className="text-xs text-muted-foreground">в месяц</p>
        </div>
      </div>

      {isPendingAmount && rental.pending_amount && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <p className="text-xs font-medium" style={{ color: "#fcd34d" }}>
            Арендодатель изменил сумму: {fmt(rental.pending_amount)}/мес
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
        </div>
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="CalendarDays" size={13} className="text-muted-foreground" />
          <span className={`text-xs ${isNear ? "text-amber-400 font-medium" : "text-muted-foreground"}`}>
            {daysUntil === 0 ? "Сегодня платёж" : `Платёж ${rental.payment_day}-го (через ${daysUntil} дн.)`}
          </span>
        </div>
        <PayBadge status={myPayStatus} />
      </div>

      <div className="flex gap-2">
        {myPayStatus !== "paid" ? (
          <button
            onClick={() => onUpdate(rental.share_token, { payment_status: "paid", role: isLandlord ? "landlord" : "tenant" })}
            className="flex-1 py-2 rounded-xl text-xs font-medium text-white transition-all"
            style={{ background: "rgba(20,184,166,0.3)", border: "1px solid rgba(20,184,166,0.5)" }}
          >
            Отметить оплачено
          </button>
        ) : (
          <button
            onClick={() => onUpdate(rental.share_token, { payment_status: "unpaid", role: isLandlord ? "landlord" : "tenant" })}
            className="flex-1 py-2 rounded-xl text-xs font-medium text-muted-foreground transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Отменить оплату
          </button>
        )}
        {isLandlord && <QRButton shareToken={rental.share_token} />}
      </div>

      {isLandlord && (
        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <span className="text-xs text-muted-foreground">Статус арендатора:</span>
          <PayBadge status={rental.current_month_status_tenant} />
        </div>
      )}
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
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
              alt="QR" className="rounded-xl" width={200} height={200}
            />
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

export default function RentalSection({ userId, token, myName, isDemo, openNew, onNewClose }: Props) {
  const [rentals, setRentals] = useState<Rental[]>(isDemo ? DEMO_RENTALS : []);
  const [showNew, setShowNew] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (openNew) setShowNew(true);
  }, [openNew]);
  const [loading, setLoading] = useState(!isDemo);

  useEffect(() => {
    if (isDemo) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(`${urls["rentals"]}?user_id=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then(data => { setRentals(data); setLoading(false); });
    });
  }, [isDemo, userId, token]);

  useEffect(() => {
    if (rentals.length === 0) return;
    checkAndNotify(rentals, myName);
  }, [rentals, myName]);

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

  function handleCreated(rental: Rental) {
    setRentals(prev => [rental, ...prev]);
    setShowNew(false);
  }

  const active = rentals.filter(r => r.status === "active");
  const archived = rentals.filter(r => r.status === "archived");

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
        />
      )}

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
            <p className="font-semibold text-foreground mb-1">Нет активных аренд</p>
            <p className="text-xs text-muted-foreground">Нажмите + чтобы добавить первую аренду</p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="mt-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white gradient-purple glow-purple">
            Добавить аренду
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map(r => (
            <RentalCard key={r.id} rental={r} userId={userId} onUpdate={handleUpdate} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium px-1">Архив</p>
          {archived.map(r => (
            <RentalCard key={r.id} rental={r} userId={userId} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewRentalModal({ myName, token, onClose, onCreated }: {
  myName: string;
  token: string;
  onClose: () => void;
  onCreated: (r: Rental) => void;
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
        tenant_phone: form.tenant_phone || undefined,
        note: form.note || undefined,
      }),
    });
    if (res.ok) {
      const rental = await res.json();
      onCreated(rental);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="glass rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
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
            <label className="text-xs text-muted-foreground mb-1 block">Имя арендатора</label>
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
              value={form.tenant_phone}
              onChange={e => set("tenant_phone", e.target.value)}
              placeholder="+7 900 000 00 00"
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