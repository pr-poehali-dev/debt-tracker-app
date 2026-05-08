import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import NewDebtModal, { SharedDebtView } from "@/components/NewDebtModal";
import DebtChat from "@/components/DebtChat";
import RentalSection, { SharedRentalView, RentalInviteModal } from "@/components/RentalSection";
import { type Lang, getT } from "@/i18n";
import {
  type Section, type Theme, type Contact, type Debt, type Notification, type ContactColor,
  DEMO_CONTACTS, DEMO_LENT, DEMO_BORROWED, DEMO_ARCHIVE, INIT_CONTACTS,
} from "@/components/index/types";
import {
  Dashboard, DebtList, CalendarSection, NotificationsSection,
  ArchiveSection, ContactsSection, SettingsSection, InstallBanner,
} from "@/components/index/Sections";

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
  const [rentalInvite, setRentalInvite] = useState<string | null>(() => new URLSearchParams(window.location.search).get("rental"));
  const [activeChat, setActiveChat] = useState<{ debtId: string; title: string } | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);

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

          debts.forEach((d) => {
            const isLender = d.lender_user_id === user.id;
            const decision = d.borrower_decision as string | null;
            const status = d.status as string;

            const debt: Debt = {
              id: Number(d.id),
              contactId: 0,
              name: String(d.title),
              amount: Number(d.amount),
              dueDate: String(d.due_date || new Date().toISOString().slice(0, 10)),
              status: status === "archived" ? "paid" : (new Date(String(d.due_date)) < new Date() && decision !== "accepted" ? "overdue" : "active"),
              avatar: String(isLender ? (d.borrower_name || "?") : d.lender_name).slice(0, 2).toUpperCase(),
              note: d.note ? String(d.note) : undefined,
              debtDbId: String(d.id),
              borrowerDecision: decision || undefined,
              interestRate: d.interest_rate != null ? Number(d.interest_rate) : undefined,
              interestType: d.interest_type as "simple" | "compound" | undefined,
            };

            if (status === "archived") {
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

          setLentDebts(lent);
          setBorrowedDebts(borrowed);
          setArchiveDebts(archive);
          if (newNotifs.length > 0) setNotifs(prev => [...newNotifs, ...prev]);
        });
    });
  }, [isDemo, user.id, token]);

  useEffect(() => {
    if (isDemo) return;
    import("../../backend/func2url.json").then(({ default: urls }) => {
      fetch(urls["notifications"], {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : { notifications: [] })
        .then(data => {
          const dbNotifs: Notification[] = (data.notifications || []).map((n: Record<string, unknown>) => ({
            id: Number(n.id) + 1000000,
            type: (n.type === "rental_decision"
              ? (String((n.data as Record<string, unknown>)?.decision) === "accepted" ? "success" : "warning")
              : "info") as Notification["type"],
            title: String(n.title),
            message: String(n.body || ""),
            date: new Date(String(n.created_at)).toLocaleDateString("ru-RU"),
            read: Boolean(n.is_read),
          }));
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

    async function poll() {
      const urls = (await import("../../backend/func2url.json")).default;
      const res = await fetch(urls["notifications"], { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const unread: number = data.unread || 0;
      const newNotifs: Array<Record<string, unknown>> = (data.notifications || []).filter((n: Record<string, unknown>) => !n.is_read);

      if (unread > lastKnownUnread && lastKnownUnread !== 0) {
        playSound();
        setNotifs(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const fresh: Notification[] = newNotifs
            .filter((n) => !existingIds.has(Number(n.id) + 1000000))
            .map((n) => ({
              id: Number(n.id) + 1000000,
              type: (n.type === "rental_decision"
                ? (String((n.data as Record<string, unknown>)?.decision) === "accepted" ? "success" : "warning")
                : "info") as Notification["type"],
              title: String(n.title),
              message: String(n.body || ""),
              date: new Date(String(n.created_at)).toLocaleDateString("ru-RU"),
              read: false,
            }));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      }
      lastKnownUnread = unread;
    }

    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [isDemo, token]);

  async function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    if (!isDemo) {
      const urls = (await import("../../backend/func2url.json")).default;
      fetch(urls["notifications"], {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [id - 1000000] }),
      });
    }
  }

  const unreadCount = notifs.filter(n => !n.read).length;

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("df-theme") as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const [profile, setProfile] = useState<{ name: string; phone: string }>({
    name: user.full_name,
    phone: user.phone,
  });

  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem("df-lang") as Lang) || "ru";
  });

  function handleLangChange(l: Lang) {
    setLang(l);
    localStorage.setItem("df-lang", l);
  }

  const t = getT(lang);
  const locale = lang === "zh" ? "zh-CN" : lang === "fr" ? "fr-FR" : lang === "en" ? "en-US" : "ru-RU";

  const navItems = [
    { id: "dashboard" as Section,     icon: "LayoutDashboard", label: t.navDashboard },
    { id: "lent" as Section,          icon: "TrendingUp",       label: t.navLent },
    { id: "borrowed" as Section,      icon: "TrendingDown",     label: t.navBorrowed },
    { id: "rental" as Section,        icon: "Home",             label: "Аренда" },
    { id: "calendar" as Section,      icon: "CalendarDays",     label: t.navCalendar },
    { id: "notifications" as Section, icon: "Bell",             label: t.navNotifications },
    { id: "archive" as Section,       icon: "Archive",          label: t.navArchive },
  ];

  const sectionTitles: Record<Section, string> = {
    dashboard: t.appName, lent: t.titleLent, borrowed: t.titleBorrowed,
    rental: "Аренда",
    calendar: t.titleCalendar, notifications: t.titleNotifications,
    archive: t.titleArchive, contacts: t.titleContacts, settings: t.navSettings,
  };

  function handleProfileChange(p: { name: string; phone: string }) {
    setProfile(p);
    localStorage.setItem("df-profile", JSON.stringify(p));
  }

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("theme-light", theme === "light");
    document.body.style.background = theme === "light" ? "#f0f2f8" : "#0d0f1a";
    localStorage.setItem("df-theme", theme);
  }, [theme]);

  const debtToken = new URLSearchParams(window.location.search).get("debt");
  if (debtToken) return <SharedDebtView token={debtToken} />;

  function handleColorChange(id: number, color: ContactColor) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, color } : c));
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
    });
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
      {rentalInvite && (
        <RentalInviteModal token={rentalInvite} authToken={token} onClose={() => {
          setRentalInvite(null);
          window.history.replaceState({}, "", "/");
          setSection("rental");
        }} />
      )}
      {activeChat && !isDemo && (
        <DebtChat
          debtId={activeChat.debtId}
          debtTitle={activeChat.title}
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
            {section !== "notifications" && (
              <button onClick={() => setSection("notifications")} className="relative w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <Icon name="Bell" size={17} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            )}
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

      <main className="relative z-10 flex-1 px-4 pb-32 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          {section === "dashboard"     && <Dashboard onNav={setSection} contacts={contacts} t={t} lentDebts={lentDebts} borrowedDebts={borrowedDebts} />}
          {section === "lent"          && <DebtList debts={lentDebts} dir="lent" contacts={contacts} t={t} locale={locale} onOpenChat={(id, title) => setActiveChat({ debtId: id, title })} onMarkPaid={handleMarkPaid} />}
          {section === "borrowed"      && <DebtList debts={borrowedDebts} dir="borrowed" contacts={contacts} t={t} locale={locale} onOpenChat={(id, title) => setActiveChat({ debtId: id, title })} onMarkPaid={handleMarkPaid} />}
          {section === "calendar"      && <CalendarSection contacts={contacts} t={t} debts={[...lentDebts, ...borrowedDebts]} />}
          {section === "notifications" && <NotificationsSection notifs={notifs} onMarkAllRead={handleMarkAllRead} onMarkRead={handleMarkRead} t={t} />}
          {section === "archive"       && <ArchiveSection contacts={contacts} t={t} locale={locale} archiveDebts={archiveDebts} />}
          {section === "rental"        && <RentalSection userId={user.id} token={token} myName={profile.name} isDemo={isDemo} openNew={showNewRental} onNewClose={() => setShowNewRental(false)} />}
          {section === "contacts"      && <ContactsSection contacts={contacts} onColorChange={handleColorChange} t={t} />}
          {section === "settings"      && <SettingsSection theme={theme} onThemeChange={setTheme} profile={profile} onProfileChange={handleProfileChange} t={t} lang={lang} onLangChange={handleLangChange} email={user.email} onLogout={onLogout} isDemo={isDemo} />}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 px-2 pb-safe">
        <div className="max-w-lg mx-auto">
          <div className="glass rounded-2xl px-2 py-2 flex items-center justify-around" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)" }}>
            {navItems.map(item => {
              const active = section === item.id;
              const isNotif = item.id === "notifications";
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 ${active ? "gradient-purple glow-purple" : "hover:bg-white/5"}`}
                >
                  <div className="relative">
                    <Icon name={item.icon} size={20} className={active ? "text-white" : "text-muted-foreground"} />
                    {isNotif && unreadCount > 0 && !active && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none">
                        {unreadCount > 9 ? "9" : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium leading-none ${active ? "text-white" : "text-muted-foreground"}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}