import { useState, useEffect, useMemo } from "react";
import Icon from "@/components/ui/icon";
import NewDebtModal, { SharedDebtView } from "@/components/NewDebtModal";
import ChatWindow from "@/components/ChatWindow";
import RentalSection, { RentalInviteModal } from "@/components/RentalSection";
import PersonalLoanModal, { type PersonalLoan } from "@/components/PersonalLoanModal";
import SupportModal from "@/components/SupportModal";
import BalanceReportModal from "@/components/BalanceReportModal";
import ContactModal from "@/components/ContactModal";
import ContactDetailModal from "@/components/ContactDetailModal";
import PullToRefresh from "@/components/PullToRefresh";
import { type Lang, getT } from "@/i18n";
import {
  type Section, type Theme, type Contact, type Debt, type Notification, type ContactColor, type ChatMeta,
  DEMO_CONTACTS, DEMO_LENT, DEMO_BORROWED, DEMO_ARCHIVE, INIT_CONTACTS,
} from "@/components/index/types";
import {
  Dashboard, DebtList, CalendarSection, NotificationsSection,
  ArchiveSection, ContactsSection, SettingsSection, InstallBanner,
} from "@/components/index/Sections";
import func2url from "../../backend/func2url.json";
import { normalizePhone } from "@/lib/phone";

// ─── Root ─────────────────────────────────────────────────────────────────────
interface AuthUser { id: number; full_name: string; phone: string; email: string; }

export default function Index({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const isDemo = user.id === 0;
  const token = localStorage.getItem("df-token") || "";
  const initSection = new URLSearchParams(window.location.search).get("section") as Section | null;
  const [section, setSection] = useState<Section>(initSection || "dashboard");
  const [contacts, setContacts] = useState<Contact[]>(isDemo ? DEMO_CONTACTS : INIT_CONTACTS);
  const [lentDebts, setLentDebts] = useState<Debt[]>(isDemo ? DEMO_LENT : []);
  const [borrowedDebts, setBorrowedDebts] = useState<Debt[]>(isDemo ? DEMO_BORROWED : []);
  const [archiveDebts, setArchiveDebts] = useState<Debt[]>(isDemo ? DEMO_ARCHIVE : []);
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [showNewRental, setShowNewRental] = useState(false);
  const [showPersonalLoan, setShowPersonalLoan] = useState(false);
  const [personalLoans, setPersonalLoans] = useState<PersonalLoan[]>(() => {
    try { return JSON.parse(localStorage.getItem("df-personal-loans") || "[]"); } catch { return []; }
  });
  const [activeRentalCount, setActiveRentalCount] = useState(0);
  const [totalRentalAmount, setTotalRentalAmount] = useState(0);
  const [rentals, setRentals] = useState<Array<{ id: string; title: string; amount: number; payment_day: number; landlord_user_id?: number; tenant_user_id?: number; status: string }>>([]);
  const [rentalInvite, setRentalInvite] = useState<string | null>(() => new URLSearchParams(window.location.search).get("rental"));
  const [activeChat, setActiveChat] = useState<{ debtId?: string; rentalId?: number; title: string; contactName?: string; contactAvatarUrl?: string } | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [supportTicketId, setSupportTicketId] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const audioCtxRef = { current: null as AudioContext | null };
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [inAppToast, setInAppToast] = useState<{ id: string; title: string; body: string; deepUrl?: string } | null>(null);

  useEffect(() => {
    if (!inAppToast) return;
    const t = window.setTimeout(() => setInAppToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [inAppToast]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    function onRefresh() { setRefreshTick(t => t + 1); }
    window.addEventListener("debts-refresh", onRefresh);
    return () => window.removeEventListener("debts-refresh", onRefresh);
  }, []);

  useEffect(() => {
    if (isDemo) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      const contactsUrl = (urls as Record<string, string>)["contacts"];
      if (!contactsUrl) return;
      fetch(contactsUrl, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((data: { contacts?: Array<Record<string, unknown>> }) => {
          const list: Contact[] = (data.contacts || []).map((c) => ({
            id: Number(c.id),
            name: String(c.name || ""),
            phone: String(c.phone || ""),
            email: String(c.email || ""),
            telegram: String(c.telegram || ""),
            note: String(c.note || ""),
            avatar: String(c.avatar || (String(c.name || "??")).slice(0, 2).toUpperCase()),
            color: (String(c.color || "purple") as ContactColor),
            totalLent: 0,
            totalBorrowed: 0,
          }));
          setContacts(list);
        })
        .catch(() => {});
    });
  }, [isDemo, token]);

  useEffect(() => {
    if (isDemo) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(`${urls["debts"]}?user_id=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then((debts: Array<Record<string, unknown>>) => {
          const lent: Debt[] = [];
          const borrowed: Debt[] = [];
          const archive: Debt[] = [];
          const newNotifs: Notification[] = [];
          let idCounter = Date.now();
          const seenKey = "df-seen-decisions";
          const seen: string[] = JSON.parse(localStorage.getItem(seenKey) || "[]");

          const normPhone = (p: string) => p.replace(/\D/g, "").replace(/^8(\d{10})$/, "7$1");
          function findContactId(name: string, phone: string): number {
            const np = normPhone(phone || "");
            const ln = (name || "").trim().toLowerCase();
            for (const c of contacts) {
              if (np && normPhone(c.phone || "") === np) return c.id;
              if (ln && (c.name || "").trim().toLowerCase() === ln) return c.id;
            }
            return 0;
          }

          debts.forEach((d) => {
            const isLender = d.lender_user_id === user.id;
            const decision = d.borrower_decision as string | null;
            const status = d.status as string;

            const isDeleted = status === "deleted";
            const cpName = String(isLender ? (d.borrower_name || "") : (d.lender_name || ""));
            const cpPhone = String(isLender ? (d.borrower_phone || "") : (d.lender_phone || ""));
            const linkedId = isLender
              ? (d.borrower_contact_id ? Number(d.borrower_contact_id) : 0)
              : (d.lender_contact_id ? Number(d.lender_contact_id) : 0);
            const debt: Debt = {
              id: Number(d.id),
              contactId: linkedId || findContactId(cpName, cpPhone),
              name: String(d.title),
              amount: Number(d.amount),
              dueDate: d.due_date ? String(d.due_date) : "",
              status: status === "archived" ? "paid" : (isDeleted && isLender) ? "deleted" : ((() => {
                const dueStr = String(d.due_date || "");
                if (!dueStr) return "active" as const;
                const due = new Date(dueStr);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                due.setHours(0, 0, 0, 0);
                const isOverdueByDate = due.getTime() < today.getTime();
                return (isOverdueByDate && decision !== "declined") ? "overdue" as const : "active" as const;
              })()),
              avatar: String(isLender ? (d.borrower_name || "?") : d.lender_name).slice(0, 2).toUpperCase(),
              note: d.note ? String(d.note) : undefined,
              debtDbId: String(d.id),
              shareToken: d.share_token ? String(d.share_token) : undefined,
              borrowerDecision: decision || undefined,
              interestRate: d.interest_rate != null ? Number(d.interest_rate) : undefined,
              interestType: d.interest_type as "simple" | "compound" | undefined,
              deletedByLender: isDeleted && !isLender ? true : undefined,
              deletedByLenderName: isDeleted && !isLender ? String(d.lender_name || "Кредитор") : undefined,
              borrowerDismissed: isLender && d.borrower_dismissed ? true : undefined,
              pendingPaymentsCount: d.pending_payments_count != null ? Number(d.pending_payments_count) : 0,
              pendingTopUpsCount: d.pending_topups_count != null ? Number(d.pending_topups_count) : 0,
              counterpartyName: String(isLender ? (d.borrower_name || "") : (d.lender_name || "")) || undefined,
              archivedDir: (status === "archived" || isDeleted) ? (isLender ? "lent" : "borrowed") : undefined,
              createdAt: d.created_at ? String(d.created_at) : undefined,
              archivedAt: (status === "archived" || isDeleted) && d.updated_at ? String(d.updated_at) : undefined,
              counterpartyAvatarUrl: (isLender ? d.borrower_avatar_url : d.lender_avatar_url) ? String(isLender ? d.borrower_avatar_url : d.lender_avatar_url) : undefined,
            };

            if (status === "archived") {
              archive.push(debt);
            } else if (isDeleted && isLender) {
              archive.push(debt);
            } else if (isLender) {
              lent.push(debt);
            } else {
              borrowed.push(debt);
            }

            const notifKey = `${d.id}_${decision}`;
            if (isLender && decision && !seen.includes(notifKey)) {
              const accepted = decision === "accepted";
              newNotifs.push({
                id: idCounter++,
                type: accepted ? "success" : "warning",
                title: accepted ? `${d.borrower_name} принял долг` : `${d.borrower_name} отклонил долг`,
                message: `«${d.title}» — ${Number(d.amount).toLocaleString("ru-RU")} ₽`,
                date: new Date().toLocaleDateString("ru-RU"),
                read: false,
              });
              seen.push(notifKey);
              localStorage.setItem(seenKey, JSON.stringify(seen));
            }
          });

          const byCreatedDesc = (a: Debt, b: Debt) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
          };
          lent.sort(byCreatedDesc);
          borrowed.sort(byCreatedDesc);
          archive.sort((a, b) => {
            const ta = a.archivedAt ? new Date(a.archivedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const tb = b.archivedAt ? new Date(b.archivedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return tb - ta;
          });
          setLentDebts(lent);
          setBorrowedDebts(borrowed);
          setArchiveDebts(archive);
          if (newNotifs.length > 0) setNotifs(prev => [...newNotifs, ...prev]);
        });
    });
  }, [isDemo, user.id, token, contacts, refreshTick]);

  useEffect(() => {
    if (isDemo) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(`${urls["rentals"]}?user_id=${user.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then((data: Array<Record<string, unknown>>) => {
          const active = data.filter(r => r.status === "active");
          setActiveRentalCount(active.length);
          setTotalRentalAmount(active.reduce((s, r) => s + Number(r.amount), 0));
          setRentals(data.map(r => ({
            id: String(r.id),
            title: String(r.title),
            amount: Number(r.amount),
            payment_day: Number(r.payment_day),
            landlord_user_id: r.landlord_user_id ? Number(r.landlord_user_id) : undefined,
            tenant_user_id: r.tenant_user_id ? Number(r.tenant_user_id) : undefined,
            landlord_name: r.landlord_name ? String(r.landlord_name) : undefined,
            tenant_name: r.tenant_name ? String(r.tenant_name) : undefined,
            status: String(r.status),
          })));
        });
    });
  }, [isDemo, user.id, token, refreshTick]);

  useEffect(() => {
    if (isDemo) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(urls["notifications"], {
        headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : { notifications: [] })
        .then(data => {
          const dbNotifs: Notification[] = (data.notifications || []).map((n: Record<string, unknown>) => {
            const nd = (n.data as Record<string, unknown>) || {};
            const ntype = String(n.type || "");
            const notif: Notification = {
              id: Number(n.id) + 1000000,
              type: (ntype === "rental_decision" || ntype === "payment_response"
                ? (String(nd.decision) === "accepted" ? "success" : "warning")
                : "info") as Notification["type"],
              title: String(n.title),
              message: String(n.body || ""),
              date: new Date(String(n.created_at)).toLocaleDateString("ru-RU"),
              read: Boolean(n.is_read),
            };
            if (ntype === "payment_request" && nd.payment_request_id) {
              notif.paymentRequestMeta = {
                paymentRequestId: Number(nd.payment_request_id),
                debtId: String(nd.debt_id || ""),
                amount: Number(nd.amount || 0),
                fromName: String(nd.from_name || ""),
                debtTitle: String(nd.debt_title || ""),
                note: nd.note ? String(nd.note) : null,
                status: "pending",
              };
            }
            if (ntype === "topup_request" && nd.topup_request_id) {
              notif.topUpRequestMeta = {
                topUpRequestId: Number(nd.topup_request_id),
                debtId: String(nd.debt_id || ""),
                amount: Number(nd.amount || 0),
                fromName: String(nd.from_name || ""),
                debtTitle: String(nd.debt_title || ""),
                note: nd.note ? String(nd.note) : null,
                status: "pending",
              };
            }
            if (nd.deep_url && typeof nd.deep_url === "string") {
              notif.deepUrl = nd.deep_url;
            }
            return notif;
          });
          if (dbNotifs.length > 0) setNotifs(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const fresh = dbNotifs.filter(n => !existingIds.has(n.id));
            return [...fresh, ...prev];
          });
        });
    });
  }, [isDemo, token]);

  useEffect(() => {
    if (isDemo) return;
    let lastKnownUnread = 0;

    function playSound() {
      if (localStorage.getItem("df-sound-notif") === "off") return;
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const t = ctx.currentTime;
        // Россыпь монет — 14 ударов с нарастанием потом затухание потока
        const baseFreqs = [1318, 1567, 1760, 2093, 2349, 2637, 3136];
        const hits = 14;
        for (let i = 0; i < hits; i++) {
          const offset = i * 0.055 + (Math.random() * 0.025);
          const freq = baseFreqs[i % baseFreqs.length] * (0.92 + Math.random() * 0.16);
          // Нарастание потока в начале, затухание в конце
          const envelope = i < 4 ? (i + 1) / 4 : Math.max(0.2, 1 - (i - 4) / 12);
          const vol = 0.45 * envelope;
          const decay = 0.12 + Math.random() * 0.15;
          // Каждая монетка = основной тон + обертон
          [freq, freq * 2.76].forEach((f, hi) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(f, t + offset);
            gain.gain.setValueAtTime(hi === 0 ? vol : vol * 0.35, t + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, t + offset + decay);
            osc.start(t + offset);
            osc.stop(t + offset + decay + 0.05);
          });
        }
      } catch { /* ignore */ }
    }

    function playPaymentSound() {
      if (localStorage.getItem("df-sound-notif") === "off") return;
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const t = ctx.currentTime;
        // Мелодичный аккорд "касса" — три ноты до-ми-соль с гармоникой
        const notes = [1046.5, 1318.5, 1567.98];
        notes.forEach((freq, i) => {
          const start = t + i * 0.12;
          [freq, freq * 2].forEach((f, hi) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = hi === 0 ? "sine" : "triangle";
            osc.frequency.setValueAtTime(f, start);
            const vol = hi === 0 ? 0.4 : 0.12;
            gain.gain.setValueAtTime(vol, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
            osc.start(start);
            osc.stop(start + 0.6);
          });
        });
        // Финальный долгий "блик"
        const oscFinal = ctx.createOscillator();
        const gainFinal = ctx.createGain();
        oscFinal.connect(gainFinal); gainFinal.connect(ctx.destination);
        oscFinal.type = "sine";
        oscFinal.frequency.setValueAtTime(2093, t + 0.4);
        gainFinal.gain.setValueAtTime(0.25, t + 0.4);
        gainFinal.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        oscFinal.start(t + 0.4);
        oscFinal.stop(t + 1.25);
      } catch { /* ignore */ }
    }

    async function poll() {
      const urls = (await import("../../backend/func2url.json")).default;
      const res = await fetch(urls["notifications"], { headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const unread: number = data.unread || 0;
      const newNotifs: Array<Record<string, unknown>> = (data.notifications || []).filter((n: Record<string, unknown>) => !n.is_read);

      // Всегда мерджим новые непрочитанные уведомления, не только при увеличении счётчика
      const grew = unread > lastKnownUnread;
      const hasPaymentRequest = newNotifs.some(n => String(n.type) === "payment_request");
      if (grew && lastKnownUnread !== 0) {
        if (hasPaymentRequest) playPaymentSound();
        else playSound();
      }
      if (newNotifs.length > 0) {
        setNotifs(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const fresh: Notification[] = newNotifs
            .filter((n) => !existingIds.has(Number(n.id) + 1000000))
            .map((n) => {
              const data = (n.data || {}) as Record<string, unknown>;
              const ntype = String(n.type || "");
              let resolvedType: Notification["type"] = "info";
              if (ntype === "rental_decision" || ntype === "payment_response") {
                resolvedType = String(data.decision) === "accepted" ? "success" : "warning";
                if (ntype === "payment_response" && String(data.decision) === "accepted") {
                  const pDebtId = String(data.debt_id || "");
                  const newAmt = Number(data.new_amount);
                  const fully = Boolean(data.fully_paid);
                  if (pDebtId) {
                    if (fully) {
                      setBorrowedDebts(prev => {
                        const debt = prev.find(d => d.debtDbId === pDebtId);
                        if (debt) {
                          const updated = { ...debt, amount: 0, status: "paid" as const };
                          setArchiveDebts(a => [updated, ...a]);
                        }
                        return prev.filter(d => d.debtDbId !== pDebtId);
                      });
                      setLentDebts(prev => prev.filter(d => d.debtDbId !== pDebtId));
                    } else if (!Number.isNaN(newAmt)) {
                      setBorrowedDebts(prev => prev.map(d => d.debtDbId === pDebtId ? { ...d, amount: newAmt } : d));
                      setLentDebts(prev => prev.map(d => d.debtDbId === pDebtId ? { ...d, amount: newAmt } : d));
                    }
                    setRefreshTick(t => t + 1);
                  }
                }
              } else if (ntype === "payment_request") {
                resolvedType = "info";
              } else if (ntype === "topup_request") {
                resolvedType = "info";
              } else if (ntype === "topup_response") {
                resolvedType = String(data.decision) === "accepted" ? "success" : "warning";
                const tDebtId = String(data.debt_id || "");
                if (tDebtId) {
                  const newAmt = Number(data.new_amount);
                  const isAccepted = String(data.decision) === "accepted";
                  const dec = (d: Debt) => d.debtDbId === tDebtId
                    ? {
                        ...d,
                        amount: isAccepted && !Number.isNaN(newAmt) ? newAmt : d.amount,
                        pendingTopUpsCount: Math.max(0, (d.pendingTopUpsCount || 0) - 1),
                      }
                    : d;
                  setLentDebts(prev => prev.map(dec));
                  setBorrowedDebts(prev => prev.map(dec));
                }
              } else if (ntype === "debt_deleted") {
                resolvedType = "warning";
                const delDebtId = String(data.debt_id || "");
                const lenderName = String(data.lender_name || "Кредитор");
                if (delDebtId) {
                  setBorrowedDebts(prev => prev.map(dd => dd.debtDbId === delDebtId ? { ...dd, deletedByLender: true, deletedByLenderName: lenderName } : dd));
                  setLentDebts(prev => prev.filter(dd => dd.debtDbId !== delDebtId));
                }
              } else if (ntype === "debt_dismissed_by_borrower") {
                resolvedType = "warning";
                const dDebtId = String(data.debt_id || "");
                if (dDebtId) {
                  setLentDebts(prev => prev.map(dd => dd.debtDbId === dDebtId ? { ...dd, borrowerDismissed: true } : dd));
                }
              }
              const base: Notification = {
                id: Number(n.id) + 1000000,
                type: resolvedType,
                title: String(n.title),
                message: String(n.body || ""),
                date: new Date(String(n.created_at)).toLocaleDateString("ru-RU"),
                read: false,
              };
              if (ntype === "payment_request" && data.payment_request_id) {
                base.paymentRequestMeta = {
                  paymentRequestId: Number(data.payment_request_id),
                  debtId: String(data.debt_id || ""),
                  amount: Number(data.amount || 0),
                  fromName: String(data.from_name || ""),
                  debtTitle: String(data.debt_title || ""),
                  note: data.note ? String(data.note) : null,
                  status: "pending",
                };
              }
              if (ntype === "topup_request" && data.topup_request_id) {
                base.topUpRequestMeta = {
                  topUpRequestId: Number(data.topup_request_id),
                  debtId: String(data.debt_id || ""),
                  amount: Number(data.amount || 0),
                  fromName: String(data.from_name || ""),
                  debtTitle: String(data.debt_title || ""),
                  note: data.note ? String(data.note) : null,
                  status: "pending",
                };
              }
              if (data.deep_url && typeof data.deep_url === "string") {
                base.deepUrl = data.deep_url;
              }
              return base;
            });
          if (fresh.length > 0) {
            const last = fresh[0];
            setInAppToast({ id: String(last.id), title: last.title, body: last.message, deepUrl: last.deepUrl });
          }
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      }
      lastKnownUnread = unread;
    }

    poll();
    const interval = setInterval(poll, 30000);

    // Real-time long-polling канал
    let cancelled = false;
    let since = new Date().toISOString();
    async function realtimeLoop() {
      const urls = (await import("../../backend/func2url.json")).default;
      while (!cancelled) {
        try {
          const ctrl = new AbortController();
          const timeoutId = setTimeout(() => ctrl.abort(), 35000);
          const res = await fetch(`${urls["realtime"]}?since=${encodeURIComponent(since)}`, {
            headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
            signal: ctrl.signal,
          });
          clearTimeout(timeoutId);
          if (cancelled) break;
          if (!res.ok) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          const data = await res.json();
          if (data.now) since = data.now;
          const events: Array<{ kind: string }> = data.events || [];
          if (events.length > 0) {
            // Уведомления и платежи — заставляем перечитать стандартный endpoint
            const hasNotif = events.some(e => e.kind === "notification" || e.kind === "payment_request");
            if (hasNotif) {
              poll();
            }
            // Сообщения — кидаем кастомное событие, ChatWindow его слушает
            const msgEvents = events.filter(e => e.kind === "message");
            if (msgEvents.length > 0) {
              window.dispatchEvent(new CustomEvent("realtime:message", { detail: msgEvents }));
            }
          }
        } catch {
          if (cancelled) break;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    realtimeLoop();

    // Перезапрашиваем при возврате на вкладку
    function onVisibility() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", poll);
    };
  }, [isDemo, token]);

  // Разблокировка AudioContext при первом касании
  useEffect(() => {
    function unlockAudio() {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      } else if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    }
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("click", unlockAudio, { once: true });
    return () => {
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
    };
  }, []);

  // Счётчик непрочитанных сообщений чата + звук + уведомление в колокольчик
  useEffect(() => {
    if (isDemo) return;
    let prevUnread = -1;

    function playChatSound() {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1046, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch { /* ignore */ }
    }

    async function pollUnreadMessages() {
      const urls = (await import("../../backend/func2url.json")).default;
      const res = await fetch(`${urls["chat"]}?unread=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const d = await res.json();
      const count: number = d.unread || 0;
      const chats: Array<{ debt_id?: string; rental_id?: number; chat_title: string; sender_name: string; last_text: string; unread: number; is_mine: boolean; created_at: string }> = d.chats || [];

      if (count > prevUnread && prevUnread !== -1) {
        playChatSound();
      }

      // Всегда показываем все чаты как треды в колокольчике
      setNotifs(prev => {
        // оставляем не-чатовые уведомления
        const others = prev.filter(n => !n.chatMeta);
        const chatNotifs = chats.map(chat => {
          const meta: ChatMeta = {
            debtId: chat.debt_id || undefined,
            rentalId: chat.rental_id || undefined,
            chatTitle: chat.chat_title,
            senderName: chat.sender_name,
            lastText: chat.last_text,
          };
          const ts = new Date(chat.created_at).getTime() || Date.now();
          const displayText = chat.is_mine ? `Вы: ${chat.last_text}` : chat.last_text;
          const dateStr = new Date(chat.created_at).toLocaleDateString("ru-RU");
          return {
            id: ts,
            type: "info" as const,
            title: `💬 ${chat.sender_name}`,
            message: displayText,
            date: dateStr,
            read: chat.unread === 0,
            chatMeta: meta,
          };
        });
        return [...chatNotifs, ...others];
      });

      prevUnread = count;
      setUnreadMessages(count);
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 3000;

    async function loop() {
      if (stopped) return;
      try {
        await pollUnreadMessages();
        delay = 3000;
      } catch {
        delay = Math.min(delay * 2, 30000);
      }
      if (!stopped) timer = setTimeout(loop, delay);
    }

    function onVisible() {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        loop();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isDemo, token]);

  // Polling сообщений из поддержки → колокольчик
  useEffect(() => {
    if (isDemo) return;

    async function pollSupport() {
      try {
        const urls = (await import("../../backend/func2url.json")).default;
        const res = await fetch(urls["support"], { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json();
        const tickets: Array<{ id: number; subject: string; unread: number; updated_at: string }> = d.tickets || [];
        const unreadTickets = tickets.filter(t => (t.unread || 0) > 0);
        const total = unreadTickets.reduce((s, t) => s + (t.unread || 0), 0);

        setNotifs(prev => {
          let updated = prev.filter(n => !n.supportMeta || n.read);
          unreadTickets.forEach(tk => {
            const meta = { ticketId: tk.id, subject: tk.subject, lastText: "Новый ответ от поддержки" };
            const existing = updated.find(n => n.supportMeta?.ticketId === tk.id && !n.read);
            if (existing) {
              updated = updated.map(n => n === existing ? { ...n, supportMeta: meta } : n);
            } else {
              updated = [{
                id: Date.now() + Math.random(),
                type: "info" as const,
                title: `🛟 Поддержка: ${tk.subject}`,
                message: `Новых сообщений: ${tk.unread}`,
                date: new Date().toLocaleDateString("ru-RU"),
                read: false,
                supportMeta: meta,
              }, ...updated];
            }
          });
          return updated;
        });

        void total;
      } catch { /* ignore */ }
    }

    pollSupport();
    const iv = setInterval(pollSupport, 30000);
    return () => clearInterval(iv);
  }, [isDemo, token]);

  // Web Push: автоматическая подписка после логина.
  // - granted: тихо переподписываемся (обновление endpoint/ключей)
  // - default: один раз показываем системный запрос и подписываемся
  // - denied: уважаем выбор пользователя, ничего не делаем
  useEffect(() => {
    if (isDemo || !token) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = window.Notification.permission;
    if (perm === "denied") return;
    const askedKey = "push_auto_asked_v1";
    if (perm === "default") {
      try {
        if (localStorage.getItem(askedKey)) return;
      } catch { /* ignore */ }
    }
    import("@/lib/push").then(({ ensurePushSubscription }) => {
      ensurePushSubscription(token).catch(() => {}).finally(() => {
        if (perm === "default") {
          try { localStorage.setItem(askedKey, "1"); } catch { /* ignore */ }
        }
      });
    });
  }, [isDemo, token]);

  // Открыть чат/долг из URL (?openChat=debt|rental&id=... ИЛИ ?openDebt=UUID[&contract=1])
  useEffect(() => {
    function openFromUrl(search: string) {
      const params = new URLSearchParams(search);
      const kind = params.get("openChat");
      const id = params.get("id");
      const openDebt = params.get("openDebt");
      const openContract = params.get("contract") === "1";

      let handled = false;

      if (kind && id) {
        if (kind === "debt") {
          const debt = [...lentDebts, ...borrowedDebts, ...archiveDebts].find(d => d.debtDbId === id);
          const contactName = debt ? (contacts.find(c => c.id === debt.contactId)?.name || debt.counterpartyName) : undefined;
          setActiveChat({ debtId: id, title: debt?.title || "Чат по долгу", contactName });
        } else if (kind === "rental") {
          const rental = rentals.find(r => String(r.id) === String(id));
          setActiveChat({ rentalId: Number(id), title: rental?.title || "Чат по аренде" });
        }
        handled = true;
      }

      if (openDebt) {
        // Найдём долг и переключим раздел, потом сообщим DebtList показать его
        const debt = [...lentDebts, ...borrowedDebts, ...archiveDebts].find(d => d.debtDbId === openDebt);
        if (debt) {
          const targetSection: Section = lentDebts.includes(debt) ? "lent" : borrowedDebts.includes(debt) ? "borrowed" : "archive";
          setSection(targetSection);
          // Дадим React переключить раздел, затем шлём событие
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("open-debt", { detail: { debtDbId: openDebt, openContract } }));
          }, 60);
          handled = true;
        }
      }

      if (handled) {
        const url = new URL(window.location.href);
        url.searchParams.delete("openChat");
        url.searchParams.delete("id");
        url.searchParams.delete("openDebt");
        url.searchParams.delete("contract");
        window.history.replaceState({}, "", url.toString());
      }
      return handled;
    }

    openFromUrl(window.location.search);

    function onSwMessage(e: MessageEvent) {
      const data = e.data;
      if (data && data.type === "NAVIGATE" && typeof data.url === "string") {
        const qIndex = data.url.indexOf("?");
        if (qIndex >= 0) openFromUrl(data.url.slice(qIndex));
      }
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, [lentDebts, borrowedDebts, archiveDebts, rentals]);

  // Web Push: запрос разрешения при первом жесте пользователя
  useEffect(() => {
    if (isDemo) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "default") return;
    if (localStorage.getItem("df-push-asked") === "1") return;

    let done = false;
    async function ask() {
      if (done) return;
      done = true;
      localStorage.setItem("df-push-asked", "1");
      const { ensurePushSubscription } = await import("@/lib/push");
      await ensurePushSubscription(token).catch(() => {});
    }
    function onGesture() {
      setTimeout(ask, 1500);
      document.removeEventListener("click", onGesture);
      document.removeEventListener("touchend", onGesture);
    }
    document.addEventListener("click", onGesture, { once: true });
    document.addEventListener("touchend", onGesture, { once: true });
    return () => {
      document.removeEventListener("click", onGesture);
      document.removeEventListener("touchend", onGesture);
    };
  }, [isDemo, token]);

  async function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    if (!isDemo) {
      const urls = (await import("../../backend/func2url.json")).default;
      fetch(urls["notifications"], {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({}),
      });
    }
  }

  async function handleMarkRead(id: number) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (!isDemo && id > 1000000) {
      const urls = (await import("../../backend/func2url.json")).default;
      fetch(urls["notifications"], {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({ ids: [id - 1000000] }),
      });
    }
  }

  // Скрытые локально треды не учитываем — иначе бейдж показывает то, чего юзер не увидит
  const hiddenThreadKeys: string[] = (() => {
    try { return JSON.parse(localStorage.getItem("df-hidden-threads") || "[]"); } catch { return []; }
  })();
  function notifThreadKey(n: Notification): string | null {
    if (n.chatMeta) return `chat:${n.chatMeta.debtId || ""}:${n.chatMeta.rentalId || ""}`;
    if (n.supportMeta) return `support:${n.supportMeta.ticketId}`;
    return null;
  }
  const unreadCount = notifs.filter(n => {
    if (n.read) return false;
    const k = notifThreadKey(n);
    if (k && hiddenThreadKeys.includes(k)) return false;
    return true;
  }).length;
  // Видимые непрочитанные чаты (для пилюли "N новых")
  const visibleUnreadChats = notifs.filter(n => {
    if (n.read || !n.chatMeta) return false;
    const k = notifThreadKey(n);
    return !(k && hiddenThreadKeys.includes(k));
  }).length;

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("df-theme") as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const [profile, setProfile] = useState<{ name: string; phone: string; email: string; avatarUrl?: string }>({
    name: user.full_name,
    phone: user.phone,
    email: (user as { email?: string }).email || "",
    avatarUrl: (user as { avatar_url?: string }).avatar_url || undefined,
  });

  // Подтягиваем актуальный avatar_url с /me при загрузке (если user был получен ДО появления avatar_url)
  useEffect(() => {
    const t = localStorage.getItem("df-token");
    if (!t) return;
    fetch(`${func2url.auth}?action=me`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.avatar_url) {
          setProfile(p => ({ ...p, avatarUrl: d.avatar_url }));
        }
      })
      .catch(() => {});
     
  }, []);

  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("df-lang");
    return saved === "en" || saved === "ru" ? saved : "ru";
  });

  function handleLangChange(l: Lang) {
    setLang(l);
    localStorage.setItem("df-lang", l);
  }

  const t = getT(lang);
  const locale = lang === "en" ? "en-US" : "ru-RU";

  const navItems = [
    { id: "dashboard" as Section,     icon: "LayoutDashboard", label: t.navDashboard },
    { id: "lent" as Section,          icon: "TrendingUp",       label: t.navLent },
    { id: "borrowed" as Section,      icon: "TrendingDown",     label: t.navBorrowed },
    { id: "rental" as Section,        icon: "Home",             label: t.navRental },
    { id: "calendar" as Section,      icon: "CalendarDays",     label: t.navCalendar },
    { id: "archive" as Section,       icon: "Archive",          label: t.navArchive },
  ];

  const sectionTitles: Record<Section, string> = {
    dashboard: t.appName, lent: t.titleLent, borrowed: t.titleBorrowed,
    rental: t.titleRental,
    calendar: t.titleCalendar, notifications: t.titleNotifications,
    archive: t.titleArchive, contacts: t.titleContacts, settings: t.navSettings,
  };

  function handleProfileChange(p: { name: string; phone: string; email: string; avatarUrl?: string }) {
    setProfile(p);
    localStorage.setItem("df-profile", JSON.stringify(p));
  }

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("theme-light", theme === "light");
    document.body.style.background = theme === "light" ? "#f0f2f8" : "#0d0f1a";
    localStorage.setItem("df-theme", theme);
  }, [theme]);

  const contactsWithTotals = useMemo<Contact[]>(() => {
    return contacts.map((c) => {
      const lent = lentDebts.filter((d) => d.contactId === c.id && d.status !== "paid").reduce((s, d) => s + d.amount, 0);
      const borrowed = borrowedDebts.filter((d) => d.contactId === c.id && d.status !== "paid").reduce((s, d) => s + d.amount, 0);
      return { ...c, totalLent: lent, totalBorrowed: borrowed };
    });
  }, [contacts, lentDebts, borrowedDebts]);

  const debtToken = new URLSearchParams(window.location.search).get("debt");
  if (debtToken) return <SharedDebtView token={debtToken} />;

  async function handleSaveContact(values: { name: string; phone: string; email: string; telegram: string; note: string; color: ContactColor }, opts?: { forceDuplicate?: boolean }) {
    if (isDemo) {
      const id = Date.now();
      const avatar = (values.name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join("") || "??").toUpperCase();
      if (editingContact) {
        setContacts(prev => prev.map(c => c.id === editingContact.id ? { ...c, ...values, avatar } : c));
      } else {
        setContacts(prev => [...prev, { id, ...values, avatar, totalLent: 0, totalBorrowed: 0 }]);
      }
      setShowContactModal(false);
      setEditingContact(null);
      return;
    }
    setContactSaving(true);
    try {
      const { default: urls } = await import("../../backend/func2url.json");
      const contactsUrl = (urls as Record<string, string>)["contacts"];
      if (!contactsUrl) return;
      const isEdit = !!editingContact;
      const url = isEdit ? `${contactsUrl}?id=${editingContact!.id}` : contactsUrl;
      const body = {
        ...values,
        phone: values.phone ? normalizePhone(values.phone) : values.phone,
        skip_duplicate_check: opts?.forceDuplicate ? true : false,
      };
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.duplicate) {
        return { duplicate: true } as const;
      }
      const c = data.contact as Record<string, unknown>;
      const updated: Contact = {
        id: Number(c.id),
        name: String(c.name || ""),
        phone: String(c.phone || ""),
        email: String(c.email || ""),
        telegram: String(c.telegram || ""),
        note: String(c.note || ""),
        avatar: String(c.avatar || ""),
        color: String(c.color || "purple") as ContactColor,
        totalLent: 0,
        totalBorrowed: 0,
      };
      if (isEdit) {
        setContacts(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
      } else {
        setContacts(prev => [...prev, updated]);
      }
      setShowContactModal(false);
      setEditingContact(null);
    } finally {
      setContactSaving(false);
    }
  }

  async function handleDeleteContact() {
    if (!editingContact) return;
    if (isDemo) {
      setContacts(prev => prev.filter(c => c.id !== editingContact.id));
      setShowContactModal(false);
      setEditingContact(null);
      setViewingContact(null);
      return;
    }
    const { default: urls } = await import("../../backend/func2url.json");
    const contactsUrl = (urls as Record<string, string>)["contacts"];
    if (!contactsUrl) return;
    const res = await fetch(`${contactsUrl}?id=${editingContact.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    setContacts(prev => prev.filter(c => c.id !== editingContact.id));
    setShowContactModal(false);
    setEditingContact(null);
    setViewingContact(null);
  }

  async function handleImportFromPhonebook() {
    interface ContactsManager {
      select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
      getProperties: () => Promise<string[]>;
    }
    const nav = navigator as Navigator & { contacts?: ContactsManager };
    if (!nav.contacts || typeof nav.contacts.select !== "function") {
      alert("Ваш браузер пока не поддерживает выбор из телефонной книги. Откройте приложение в Chrome на Android или добавьте контакт вручную.");
      return;
    }
    try {
      const props = await nav.contacts.getProperties();
      const want = ["name", "tel", "email"].filter((p) => props.includes(p));
      const picked = await nav.contacts.select(want, { multiple: true });
      if (!picked || picked.length === 0) return;

      const { default: urls } = await import("../../backend/func2url.json");
      const contactsUrl = (urls as Record<string, string>)["contacts"];
      if (!contactsUrl && !isDemo) {
        alert("Сервис контактов недоступен");
        return;
      }

      let added = 0;
      let skipped = 0;
      for (const item of picked) {
        const name = (item.name && item.name[0]) || "";
        const phone = (item.tel && item.tel[0]) || "";
        const email = (item.email && item.email[0]) || "";
        if (!name.trim()) continue;

        if (isDemo) {
          const id = Date.now() + Math.random();
          const avatar = (name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join("") || "??").toUpperCase();
          setContacts(prev => [...prev, { id, name: name.trim(), phone, email, telegram: "", note: "", avatar, color: "purple", totalLent: 0, totalBorrowed: 0 }]);
          added++;
          continue;
        }

        const res = await fetch(contactsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: name.trim(), phone: normalizePhone(phone), email: email.trim() }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.duplicate) {
          skipped++;
          continue;
        }
        const c = data.contact as Record<string, unknown>;
        const newContact: Contact = {
          id: Number(c.id),
          name: String(c.name || ""),
          phone: String(c.phone || ""),
          email: String(c.email || ""),
          telegram: String(c.telegram || ""),
          note: String(c.note || ""),
          avatar: String(c.avatar || ""),
          color: String(c.color || "purple") as ContactColor,
          totalLent: 0,
          totalBorrowed: 0,
        };
        setContacts(prev => [...prev, newContact]);
        added++;
      }
      alert(`Импорт завершён: добавлено ${added}${skipped ? `, пропущено дубликатов: ${skipped}` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|abort/i.test(msg)) {
        alert("Не удалось импортировать контакты: " + msg);
      }
    }
  }



  async function handleMarkPaid(debtDbId: string) {
    import("../../backend/func2url.json").then(async ({ default: urls }) => {
      const debt = [...lentDebts, ...borrowedDebts].find(d => d.debtDbId === debtDbId);
      if (!debt) return;
      const res = await fetch(`${urls["debts"]}?user_id=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const debts: Array<Record<string, unknown>> = await res.json();
      const found = debts.find(d => String(d.id) === debtDbId);
      if (!found) return;
      await fetch(`${urls["debts"]}?token=${found.share_token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "archived" }),
      });
      const updatedDebt = { ...debt, status: "paid" as const };
      setLentDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
      setBorrowedDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
      setArchiveDebts(prev => [updatedDebt, ...prev]);
      setRefreshTick(t => t + 1);
    });
  }

  function handlePaymentAccepted(debtDbId: string, newAmount: number, fullyPaid: boolean) {
    if (fullyPaid) {
      const debt = [...lentDebts, ...borrowedDebts].find(d => d.debtDbId === debtDbId);
      if (debt) {
        const updated = { ...debt, amount: 0, status: "paid" as const, pendingPaymentsCount: 0 };
        setLentDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
        setBorrowedDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
        setArchiveDebts(prev => [updated, ...prev]);
      }
      setRefreshTick(t => t + 1);
      return;
    }
    setLentDebts(prev => prev.map(d => d.debtDbId === debtDbId ? { ...d, amount: newAmount, pendingPaymentsCount: Math.max(0, (d.pendingPaymentsCount || 1) - 1) } : d));
    setBorrowedDebts(prev => prev.map(d => d.debtDbId === debtDbId ? { ...d, amount: newAmount, pendingPaymentsCount: Math.max(0, (d.pendingPaymentsCount || 1) - 1) } : d));
    setRefreshTick(t => t + 1);
  }

  async function doRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshTick(t => t + 1);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  }

  function handleTopUpDecided(debtDbId: string, decision: "accepted" | "rejected", newAmount: number | null) {
    const upd = (d: Debt) => d.debtDbId === debtDbId
      ? {
          ...d,
          amount: decision === "accepted" && newAmount !== null ? newAmount : d.amount,
          pendingTopUpsCount: Math.max(0, (d.pendingTopUpsCount || 1) - 1),
        }
      : d;
    setLentDebts(prev => prev.map(upd));
    setBorrowedDebts(prev => prev.map(upd));
  }

  async function handlePurgeArchivedDebt(debtDbId: string) {
    const { default: urls } = await import("../../backend/func2url.json");
    // Достаём share_token из общего списка
    const res = await fetch(`${urls["debts"]}?user_id=${user.id}&include_deleted=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let found: Record<string, unknown> | undefined;
    if (res.ok) {
      const list: Array<Record<string, unknown>> = await res.json();
      found = list.find(d => String(d.id) === debtDbId);
    }
    if (!found) {
      // fallback — пробуем без include_deleted
      const res2 = await fetch(`${urls["debts"]}?user_id=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res2.ok) {
        const list2: Array<Record<string, unknown>> = await res2.json();
        found = list2.find(d => String(d.id) === debtDbId);
      }
    }
    if (!found) {
      // Удаляем хотя бы локально
      setArchiveDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
      return;
    }
    const delRes = await fetch(`${urls["debts"]}?token=${found.share_token}&purge=1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!delRes.ok) return;
    setArchiveDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
  }

  async function handleDeleteDebt(debtDbId: string) {
    const { default: urls } = await import("../../backend/func2url.json");
    const debt = [...lentDebts, ...borrowedDebts].find(d => d.debtDbId === debtDbId);
    const isLender = !!lentDebts.find(d => d.debtDbId === debtDbId);
    const res = await fetch(`${urls["debts"]}?user_id=${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const debts: Array<Record<string, unknown>> = await res.json();
    const found = debts.find(d => String(d.id) === debtDbId);
    if (!found) return;
    const delRes = await fetch(`${urls["debts"]}?token=${found.share_token}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!delRes.ok) return;
    setLentDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
    setBorrowedDebts(prev => prev.filter(d => d.debtDbId !== debtDbId));
    if (debt && isLender) {
      setArchiveDebts(prev => [{ ...debt, status: "deleted" as const }, ...prev]);
    }
  }

  function handlePersonalLoanSave(loan: PersonalLoan) {
    const updated = [loan, ...personalLoans];
    setPersonalLoans(updated);
    localStorage.setItem("df-personal-loans", JSON.stringify(updated));
  }

  function handleDebtCreated(d: Record<string, string | number | null>) {
    const newDebt: Debt = {
      id: Date.now(),
      contactId: 0,
      name: String(d.title),
      amount: Number(d.amount),
      dueDate: String(d.due_date || new Date().toISOString().slice(0, 10)),
      status: "active",
      avatar: String(d.borrower_name || "?").slice(0, 2).toUpperCase(),
      note: d.note ? String(d.note) : undefined,
      debtDbId: String(d.id),
    };
    setLentDebts(prev => [newDebt, ...prev]);
  }

  return (
    <div className={`min-h-screen text-foreground flex flex-col`} style={{ background: "var(--app-bg)" }}>
      <div className="mesh-bg" />
      <NewDebtModal open={showNewDebt} onClose={() => setShowNewDebt(false)} myName={profile.name} myPhone={profile.phone} onCreated={handleDebtCreated} />
      {showPersonalLoan && <PersonalLoanModal onClose={() => setShowPersonalLoan(false)} onSave={handlePersonalLoanSave} />}
      {rentalInvite && (
        <RentalInviteModal token={rentalInvite} authToken={token} onClose={() => {
          setRentalInvite(null);
          window.history.replaceState({}, "", "/");
          setSection("rental");
        }} />
      )}
      {showSupport && !isDemo && <SupportModal token={token} isAdmin={user.phone.replace(/\D/g, "") === "79680066666"} initialTicketId={supportTicketId ?? undefined} onClose={() => { setShowSupport(false); setSupportTicketId(null); }} />}
      {showReport && (
        <BalanceReportModal
          onClose={() => setShowReport(false)}
          lentDebts={lentDebts}
          borrowedDebts={borrowedDebts}
          archiveDebts={archiveDebts}
          personalLoans={personalLoans}
          totalRentalAmount={totalRentalAmount}
          activeRentalCount={activeRentalCount}
          navItems={navItems}
          currentSection={section}
          onNavigate={(id) => setSection(id as Section)}
        />
      )}
      {activeChat && !isDemo && (
        <ChatWindow
          debtId={activeChat.debtId}
          rentalId={activeChat.rentalId}
          title={activeChat.title}
          contactName={activeChat.contactName}
          contactAvatarUrl={activeChat.contactAvatarUrl}
          token={token}
          onClose={() => setActiveChat(null)}
        />
      )}

      {isDemo && (
        <div className="relative z-10 px-4 pt-3">
          <div className="max-w-lg mx-auto">
            <div className="rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-medium" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d" }}>
              <Icon name="Eye" size={14} />
              Демо-режим — данные ненастоящие. Зарегистрируйтесь, чтобы использовать приложение.
            </div>
          </div>
        </div>
      )}

      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-heading font-black text-xl">
              {section === "dashboard" ? <span className="text-gradient-purple">Debt-Debt</span> : sectionTitles[section]}
            </h1>
            {section === "dashboard" && <p className="text-xs text-muted-foreground">{t.appSubtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {visibleUnreadChats > 0 && section !== "notifications" && (
              <button onClick={() => setSection("notifications")}
                className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-medium animate-pulse"
                style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.5)", color: "#a855f7" }}
                title="Новые сообщения — откройте уведомления">
                <Icon name="MessageCircle" size={12} />
                {visibleUnreadChats} новых
              </button>
            )}
            {section !== "notifications" && (() => {
              // На стороне кредитора ждёт моего действия запрос на возврат (pendingPayments).
              // На стороне должника — запрос на изменение суммы (pendingTopUps).
              const pendingTotal =
                lentDebts.reduce((s, d) => s + (d.pendingPaymentsCount || 0), 0) +
                borrowedDebts.reduce((s, d) => s + (d.pendingTopUpsCount || 0), 0);
              return (
                <button onClick={() => setSection("notifications")} className={`relative w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors ${pendingTotal > 0 ? "pending-green-pulse" : ""}`}>
                  <Icon name="Bell" size={17} className={pendingTotal > 0 ? "text-emerald-300" : ""} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              );
            })()}
            <button onClick={() => setSection("settings")} className={`w-9 h-9 glass rounded-xl flex items-center justify-center transition-colors ${section === "settings" ? "gradient-purple" : "hover:bg-white/10"}`}>
              <Icon name="Settings" size={17} className={section === "settings" ? "text-white" : ""} />
            </button>
            <button
              onClick={() => section === "rental" ? setShowNewRental(true) : setShowNewDebt(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors gradient-purple glow-purple"
            >
              <Icon name="Plus" size={17} className="text-white" />
            </button>
          </div>
        </div>
      </header>

      <InstallBanner t={t} />

      <main
        className="relative z-10 flex-1 px-4 pb-32 overflow-y-auto"
        onTouchStart={(e) => {
          const t = e.touches[0];
          (window as unknown as { __swipeStart?: { x: number; y: number; t: number } }).__swipeStart = { x: t.clientX, y: t.clientY, t: Date.now() };
        }}
        onTouchEnd={(e) => {
          const start = (window as unknown as { __swipeStart?: { x: number; y: number; t: number } }).__swipeStart;
          if (!start) return;
          const tch = e.changedTouches[0];
          const dx = tch.clientX - start.x;
          const dy = tch.clientY - start.y;
          const dt = Date.now() - start.t;
          (window as unknown as { __swipeStart?: unknown }).__swipeStart = undefined;
          if (dt > 600) return;

          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          const idx = navItems.findIndex(n => n.id === section);
          if (idx === -1) return;
          const nextIdx = dx < 0 ? idx + 1 : idx - 1;
          if (nextIdx < 0 || nextIdx >= navItems.length) return;
          setSwipeDir(dx < 0 ? "left" : "right");
          setSection(navItems[nextIdx].id);
        }}
      >
        <PullToRefresh onRefresh={doRefresh} refreshing={refreshing}>
        <div key={section} className={`max-w-lg mx-auto ${swipeDir === "left" ? "animate-slide-in-right" : swipeDir === "right" ? "animate-slide-in-left" : ""}`}>
          {section === "dashboard"     && <Dashboard onNav={setSection} contacts={contactsWithTotals} t={t} lentDebts={lentDebts} borrowedDebts={borrowedDebts} activeRentalCount={activeRentalCount} totalRentalAmount={totalRentalAmount} personalLoans={personalLoans} onOpenReport={() => setShowReport(true)} />}
          {section === "lent"          && <DebtList debts={lentDebts} dir="lent" contacts={contacts} t={t} locale={locale} onOpenChat={(id, title) => { const d = lentDebts.find(x => x.debtDbId === id); const cn = d ? (contacts.find(c => c.id === d.contactId)?.name || d.counterpartyName) : undefined; setActiveChat({ debtId: id, title, contactName: cn, contactAvatarUrl: d?.counterpartyAvatarUrl }); }} onMarkPaid={handleMarkPaid} onDeleteDebt={handleDeleteDebt} onAddNew={() => setShowNewDebt(true)} token={token} userId={user.id} onPaymentAccepted={handlePaymentAccepted} onTopUpDecided={handleTopUpDecided} />}
          {section === "borrowed"      && <DebtList debts={borrowedDebts} dir="borrowed" contacts={contacts} t={t} locale={locale} onOpenChat={(id, title) => { const d = borrowedDebts.find(x => x.debtDbId === id); const cn = d ? (contacts.find(c => c.id === d.contactId)?.name || d.counterpartyName) : undefined; setActiveChat({ debtId: id, title, contactName: cn, contactAvatarUrl: d?.counterpartyAvatarUrl }); }} onMarkPaid={handleMarkPaid} onDeleteDebt={handleDeleteDebt} onAddNew={() => setShowPersonalLoan(true)} personalLoans={personalLoans} onPersonalLoanUpdate={(loans) => { setPersonalLoans(loans); localStorage.setItem("df-personal-loans", JSON.stringify(loans)); }} token={token} userId={user.id} onPaymentAccepted={handlePaymentAccepted} onTopUpDecided={handleTopUpDecided} />}
          {section === "calendar"      && <CalendarSection contacts={contacts} t={t} debts={[...lentDebts.map(d => ({ ...d, archivedDir: "lent" as const })), ...borrowedDebts.map(d => ({ ...d, archivedDir: "borrowed" as const }))]} rentals={rentals} userId={user.id} locale={locale} token={token} onNav={setSection} onOpenChat={(id, title) => { const d = [...lentDebts, ...borrowedDebts].find(x => x.debtDbId === id); const cn = d ? (contacts.find(c => c.id === d.contactId)?.name || d.counterpartyName) : undefined; setActiveChat({ debtId: id, title, contactName: cn, contactAvatarUrl: d?.counterpartyAvatarUrl }); }} onMarkPaid={handleMarkPaid} onPaymentAccepted={handlePaymentAccepted} />}
          {section === "notifications" && <NotificationsSection notifs={notifs} onMarkAllRead={handleMarkAllRead} onMarkRead={handleMarkRead} t={t} token={token} contacts={contacts} allDebts={[...lentDebts, ...borrowedDebts, ...archiveDebts]} onOpenChat={(debtId, rentalId, title) => { const d = debtId ? [...lentDebts, ...borrowedDebts, ...archiveDebts].find(x => x.debtDbId === debtId) : undefined; const cn = d ? (contacts.find(c => c.id === d.contactId)?.name || d.counterpartyName) : undefined; setActiveChat({ debtId: debtId || undefined, rentalId: rentalId || undefined, title, contactName: cn, contactAvatarUrl: d?.counterpartyAvatarUrl }); }} onOpenSupport={(ticketId) => { setSupportTicketId(ticketId); setShowSupport(true); }} onPaymentAccepted={handlePaymentAccepted} />}
          {section === "archive"       && <ArchiveSection contacts={contacts} t={t} locale={locale} archiveDebts={archiveDebts} token={token} onOpenChat={(id, title) => { const d = archiveDebts.find(x => x.debtDbId === id); const cn = d ? (contacts.find(c => c.id === d.contactId)?.name || d.counterpartyName) : undefined; setActiveChat({ debtId: id, title, contactName: cn, contactAvatarUrl: d?.counterpartyAvatarUrl }); }} onPurgeDebt={handlePurgeArchivedDebt} />}
          {section === "rental"        && <RentalSection userId={user.id} token={token} myName={profile.name} isDemo={isDemo} openNew={showNewRental} onNewClose={() => setShowNewRental(false)} t={t} />}
          {section === "contacts"      && (
            <ContactsSection
              contacts={contactsWithTotals}
              onAddContact={() => { setEditingContact(null); setShowContactModal(true); }}
              onSelectContact={(c) => setViewingContact(c)}
              onImportFromPhonebook={handleImportFromPhonebook}
              t={t}
            />
          )}
          {section === "settings"      && <SettingsSection theme={theme} onThemeChange={setTheme} profile={profile} onProfileChange={handleProfileChange} t={t} lang={lang} onLangChange={handleLangChange} onLogout={onLogout} isDemo={isDemo} onOpenSupport={() => setShowSupport(true)} token={token} authUrl={func2url.auth} />}
        </div>
        </PullToRefresh>
      </main>

      {inAppToast && (
        <div className="fixed top-3 left-2 right-2 z-[300] flex justify-center pointer-events-none">
          <div
            className="max-w-md w-full glass-strong rounded-2xl p-3 flex items-start gap-3 cursor-pointer pointer-events-auto animate-slide-down"
            style={{ border: "1px solid rgba(168,85,247,0.35)", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}
            onClick={() => {
              if (inAppToast.deepUrl) {
                const qi = inAppToast.deepUrl.indexOf("?");
                if (qi >= 0) {
                  const params = new URLSearchParams(inAppToast.deepUrl.slice(qi));
                  const openDebt = params.get("openDebt");
                  const contract = params.get("contract") === "1";
                  if (openDebt) {
                    window.dispatchEvent(new CustomEvent("open-debt", { detail: { debtDbId: openDebt, openContract: contract } }));
                  }
                }
              }
              setInAppToast(null);
            }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(168,85,247,0.18)" }}>
              <Icon name="Bell" size={16} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{inAppToast.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{inAppToast.body}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setInAppToast(null); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 flex-shrink-0"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-20 px-2 pb-safe">
        <div className="max-w-lg mx-auto">
          <div className="glass rounded-2xl px-1 py-1.5 flex items-center justify-around" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)" }}>
            {navItems.map(item => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === section) return;
                    const curIdx = navItems.findIndex(n => n.id === section);
                    const newIdx = navItems.findIndex(n => n.id === item.id);
                    setSwipeDir(newIdx > curIdx ? "left" : "right");
                    setSection(item.id);
                  }}
                  className={`relative flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl transition-all duration-200 min-w-0 flex-1 ${active ? "gradient-purple glow-purple" : "hover:bg-white/5"}`}
                >
                  <div className="relative">
                    <Icon name={item.icon} size={18} className={active ? "text-white" : "text-muted-foreground"} />
                  </div>
                  <span className={`text-[8px] font-medium leading-none truncate w-full text-center ${active ? "text-white" : "text-muted-foreground"}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <ContactModal
        open={showContactModal}
        initial={editingContact || undefined}
        onClose={() => { setShowContactModal(false); setEditingContact(null); }}
        onSave={handleSaveContact}
        onDelete={editingContact ? handleDeleteContact : undefined}
        saving={contactSaving}
      />

      {viewingContact && (
        <ContactDetailModal
          contact={contactsWithTotals.find(c => c.id === viewingContact.id) || viewingContact}
          lentDebts={lentDebts}
          borrowedDebts={borrowedDebts}
          archiveDebts={archiveDebts}
          onClose={() => setViewingContact(null)}
          onEdit={() => {
            const fresh = contactsWithTotals.find(c => c.id === viewingContact.id) || viewingContact;
            setEditingContact(fresh);
            setViewingContact(null);
            setShowContactModal(true);
          }}
        />
      )}
    </div>
  );
}