import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";

interface Ticket {
  id: number;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  unread: number;
  user_name?: string;
  user_email?: string;
}

interface Message {
  id: number;
  role: "user" | "admin";
  text: string;
  created_at: string;
  author: string;
}

export default function SupportModal({ token, onClose, initialTicketId, isAdmin = false }: { token: string; onClose: () => void; initialTicketId?: number; isAdmin?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<number | null>(initialTicketId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [adminFilter, setAdminFilter] = useState<"open" | "closed" | "all">("open");
  const [activeStatus, setActiveStatus] = useState<string>("open");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  async function loadTickets() {
    setLoading(true);
    try {
      const urls = (await import("../../backend/func2url.json")).default;
      const url = isAdmin && adminFilter !== "all" ? `${urls["support"]}?status=${adminFilter}` : urls["support"];
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const data = await r.json();
        setTickets(data.tickets || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(ticketId: number) {
    const urls = (await import("../../backend/func2url.json")).default;
    const r = await fetch(`${urls["support"]}?ticket_id=${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const data = await r.json();
      setMessages(data.messages || []);
      if (data.ticket?.status) setActiveStatus(data.ticket.status);
      await fetch(urls["support"], {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
    }
  }

  async function changeStatus(newStatus: "open" | "closed") {
    if (!activeTicket || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const urls = (await import("../../backend/func2url.json")).default;
      const r = await fetch(urls["support"], {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticket_id: activeTicket, status: newStatus }),
      });
      if (r.ok) {
        setActiveStatus(newStatus);
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  useEffect(() => { loadTickets(); }, [adminFilter]);

  useEffect(() => {
    if (activeTicket) loadMessages(activeTicket);
  }, [activeTicket]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  async function createTicket() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const urls = (await import("../../backend/func2url.json")).default;
      const r = await fetch(urls["support"], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: subject.trim() || "Без темы", text: text.trim() }),
      });
      if (r.ok) {
        const data = await r.json();
        setSubject(""); setText(""); setShowNew(false);
        await loadTickets();
        if (data.ticket_id) setActiveTicket(data.ticket_id);
      }
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    if (!reply.trim() || !activeTicket) return;
    setSending(true);
    try {
      const urls = (await import("../../backend/func2url.json")).default;
      const r = await fetch(urls["support"], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticket_id: activeTicket, text: reply.trim() }),
      });
      if (r.ok) {
        setReply("");
        await loadMessages(activeTicket);
      }
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col animate-slide-up"
        style={{ maxHeight: "90dvh", background: "var(--app-bg)", borderRadius: "20px 20px 0 0", paddingBottom: "max(96px, calc(env(safe-area-inset-bottom) + 96px))" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={onClose}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            {activeTicket && (
              <button onClick={() => { setActiveTicket(null); setMessages([]); loadTickets(); }} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10">
                <Icon name="ChevronLeft" size={18} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-lg">{activeTicket ? "Обращение" : (isAdmin ? "Обращения пользователей" : "Поддержка")}</h2>
                {activeTicket && (
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${activeStatus === "closed" ? "bg-white/10 text-muted-foreground" : "bg-emerald-500/20 text-emerald-300"}`}>
                    {activeStatus === "closed" ? "закрыт" : "открыт"}
                  </span>
                )}
              </div>
              {!activeTicket && <p className="text-xs text-muted-foreground">{isAdmin ? "Отвечайте на сообщения пользователей" : "Напишите нам — ответим как можно скорее"}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTicket && isAdmin && (
              <button onClick={() => changeStatus(activeStatus === "closed" ? "open" : "closed")} disabled={updatingStatus}
                className={`text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-50 ${activeStatus === "closed" ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-white/10 text-foreground hover:bg-white/15"}`}>
                {activeStatus === "closed" ? "Открыть" : "Закрыть"}
              </button>
            )}
            <button onClick={onClose} aria-label="Закрыть" className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/15 transition-colors flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Icon name="X" size={20} className="text-foreground" />
            </button>
          </div>
        </div>

        {!activeTicket && !showNew && (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {!isAdmin && (
              <button onClick={() => setShowNew(true)}
                className="w-full py-3 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
                <Icon name="Plus" size={16} />
                Написать в поддержку
              </button>
            )}

            {isAdmin && (
              <div className="glass rounded-2xl p-1 flex gap-1">
                {([
                  { id: "open", label: "Открытые" },
                  { id: "closed", label: "Закрытые" },
                  { id: "all", label: "Все" },
                ] as const).map(tab => (
                  <button key={tab.id} onClick={() => setAdminFilter(tab.id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${adminFilter === tab.id ? "text-white" : "text-muted-foreground hover:bg-white/5"}`}
                    style={adminFilter === tab.id ? { background: "linear-gradient(135deg, #a855f7, #6366f1)" } : {}}>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {loading && <p className="text-center text-xs text-muted-foreground py-4">Загрузка...</p>}
            {!loading && tickets.length === 0 && (
              <div className="glass rounded-2xl p-6 text-center">
                <Icon name="MessageSquare" size={32} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{isAdmin ? "Нет обращений от пользователей" : "Нет обращений"}</p>
              </div>
            )}
            {tickets.map(t => (
              <button key={t.id} onClick={() => setActiveTicket(t.id)}
                className="w-full glass rounded-2xl p-4 text-left hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="font-semibold text-sm text-foreground truncate flex-1">{t.subject}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isAdmin && (
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${t.status === "closed" ? "bg-white/10 text-muted-foreground" : "bg-emerald-500/20 text-emerald-300"}`}>
                        {t.status === "closed" ? "закрыт" : "открыт"}
                      </span>
                    )}
                    {t.unread > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {t.unread > 9 ? "9+" : t.unread}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && t.user_name && (
                  <p className="text-xs text-purple-300/80 truncate mb-0.5">
                    <Icon name="User" size={11} className="inline mr-1 -mt-0.5" />
                    {t.user_name}{t.user_email ? ` · ${t.user_email}` : ""}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleString("ru-RU")}</p>
              </button>
            ))}
          </div>
        )}

        {showNew && !activeTicket && !isAdmin && (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Тема</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Кратко о проблеме"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-purple-500/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сообщение</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="Опишите проблему подробно..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-purple-500/50 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowNew(false); setSubject(""); setText(""); }}
                className="flex-1 py-3 rounded-2xl glass text-sm font-medium hover:bg-white/5">Отмена</button>
              <button onClick={createTicket} disabled={sending || !text.trim()}
                className="flex-1 py-3 rounded-2xl font-semibold text-white text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
                {sending ? "Отправка..." : "Отправить"}
              </button>
            </div>
          </div>
        )}

        {activeTicket && (
          <>
            <div ref={messagesRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === "admin" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.role === "admin" ? "bg-white/5 border border-white/10" : "gradient-purple text-white"}`}>
                    {m.role === "admin" && <p className="text-[10px] font-semibold text-purple-400 mb-0.5">Администратор</p>}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.role === "admin" ? "text-muted-foreground" : "text-white/70"}`}>
                      {new Date(m.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex gap-2">
              <input value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Написать сообщение..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500/50" />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
                <Icon name="Send" size={18} className="text-white" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}