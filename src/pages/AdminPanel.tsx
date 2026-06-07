import { useEffect, useState, useRef } from "react";
import func2url from "../../backend/func2url.json";
import Icon from "@/components/ui/icon";

interface AdminStats {
  total_users: number;
  active_sessions: number;
  total_debts: number;
  users: { id: number; full_name: string; email: string; created_at: string }[];
}

interface Ticket {
  id: number;
  user_id: number;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  unread: number;
  user_name: string;
  user_email: string;
}

interface Message {
  id: number;
  role: "user" | "admin";
  text: string;
  created_at: string;
  author: string;
}

interface Props {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showTickets, setShowTickets] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const token = localStorage.getItem("df-token");

  async function loadStats() {
    try {
      const r = await fetch(func2url["admin-stats"], { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Нет доступа");
      const data = await r.json();
      setStats(typeof data === "string" ? JSON.parse(data) : data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function loadTickets() {
    const r = await fetch(func2url["support"], { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const data = await r.json();
      setTickets(data.tickets || []);
      const total = (data.tickets || []).reduce((s: number, t: Ticket) => s + (t.unread || 0), 0);
      setUnreadTotal(total);
    }
  }

  async function loadMessages(t: Ticket) {
    const r = await fetch(`${func2url["support"]}?ticket_id=${t.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const data = await r.json();
      setMessages(data.messages || []);
      await fetch(func2url["support"], {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticket_id: t.id }),
      });
      loadTickets();
    }
  }

  useEffect(() => {
    loadStats();
    loadTickets();
    const iv = setInterval(loadTickets, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (activeTicket) loadMessages(activeTicket);
  }, [activeTicket]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  async function sendReply() {
    if (!reply.trim() || !activeTicket) return;
    setSending(true);
    try {
      const r = await fetch(func2url["support"], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticket_id: activeTicket.id, text: reply.trim() }),
      });
      if (r.ok) {
        setReply("");
        await loadMessages(activeTicket);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f1a", color: "#e2ddf5", fontFamily: "Golos Text, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={onBack}
              style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", color: "#a855f7", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>
              ← Назад
            </button>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "Montserrat, sans-serif", background: "linear-gradient(135deg, #a855f7, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Админ-панель
              </div>
              <div style={{ fontSize: 13, color: "rgba(180,170,210,0.5)", marginTop: 2 }}>Статистика и поддержка</div>
            </div>
          </div>
          <button onClick={() => setShowTickets(true)}
            style={{ position: "relative", width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2ddf5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="Bell" size={20} />
            {unreadTotal > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, padding: "0 5px", background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}
          </button>
        </div>

        {loading && <div style={{ textAlign: "center", color: "rgba(180,170,210,0.5)", marginTop: 60 }}>Загружаю данные...</div>}

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 20, color: "#f87171", textAlign: "center" }}>
            {error}
          </div>
        )}

        {stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Пользователей", value: stats.total_users, color: "#a855f7" },
                { label: "Активных сессий", value: stats.active_sessions, color: "#6366f1" },
                { label: "Долгов", value: stats.total_debts, color: "#8b5cf6" },
              ].map((item) => (
                <div key={item.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: item.color, fontFamily: "Montserrat, sans-serif" }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: "rgba(180,170,210,0.5)", marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setShowTickets(true)}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 20px", color: "#e2ddf5", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, marginBottom: 24, textAlign: "left" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(168,85,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="MessageSquare" size={20} className="text-purple-400" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Обращения в поддержку</div>
                <div style={{ fontSize: 12, color: "rgba(180,170,210,0.5)", marginTop: 2 }}>
                  Всего: {tickets.length}{unreadTotal > 0 && ` · ${unreadTotal} непрочитанных`}
                </div>
              </div>
              <Icon name="ChevronRight" size={18} />
            </button>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700, fontSize: 15 }}>
                Список пользователей
              </div>
              {stats.users.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "rgba(180,170,210,0.4)" }}>Пользователей пока нет</div>
              ) : (
                stats.users.map((u, i) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < stats.users.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #a855f7, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0 }}>
                      {(u.full_name || u.email)[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name || "—"}</div>
                      <div style={{ fontSize: 12, color: "rgba(180,170,210,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(180,170,210,0.35)", flexShrink: 0 }}>{new Date(u.created_at).toLocaleDateString("ru-RU")}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {showTickets && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={(e) => { if (e.currentTarget === e.target) { setShowTickets(false); setActiveTicket(null); setMessages([]); } }}>
          <div style={{ width: "100%", maxWidth: 600, maxHeight: "92dvh", background: "#0d0f1a", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {activeTicket && (
                  <button onClick={() => { setActiveTicket(null); setMessages([]); }}
                    style={{ background: "transparent", border: "none", color: "#e2ddf5", cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <Icon name="ChevronLeft" size={22} />
                  </button>
                )}
                <div style={{ fontWeight: 800, fontSize: 17, fontFamily: "Montserrat, sans-serif" }}>
                  {activeTicket ? activeTicket.subject : "Обращения"}
                </div>
              </div>
              <button onClick={() => { setShowTickets(false); setActiveTicket(null); setMessages([]); }}
                style={{ background: "transparent", border: "none", color: "#e2ddf5", cursor: "pointer" }}>
                <Icon name="X" size={20} />
              </button>
            </div>

            {!activeTicket && (
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
                {tickets.length === 0 && (
                  <div style={{ textAlign: "center", color: "rgba(180,170,210,0.4)", padding: 40 }}>Обращений пока нет</div>
                )}
                {tickets.map((t) => (
                  <button key={t.id} onClick={() => setActiveTicket(t)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, marginBottom: 8, color: "#e2ddf5", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t.subject}</div>
                      {t.unread > 0 && (
                        <span style={{ minWidth: 20, height: 20, padding: "0 6px", background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {t.unread > 9 ? "9+" : t.unread}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(180,170,210,0.6)" }}>{t.user_name} · {t.user_email}</div>
                    <div style={{ fontSize: 11, color: "rgba(180,170,210,0.4)", marginTop: 2 }}>{new Date(t.updated_at).toLocaleString("ru-RU")}</div>
                  </button>
                ))}
              </div>
            )}

            {activeTicket && (
              <>
                <div ref={messagesRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "rgba(180,170,210,0.5)", textAlign: "center", marginBottom: 8 }}>
                    {activeTicket.user_name} · {activeTicket.user_email}
                  </div>
                  {messages.map((m) => (
                    <div key={m.id} style={{ display: "flex", justifyContent: m.role === "admin" ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "80%", borderRadius: 14, padding: "8px 12px", background: m.role === "admin" ? "linear-gradient(135deg, #a855f7, #6366f1)" : "rgba(255,255,255,0.05)", border: m.role === "admin" ? "none" : "1px solid rgba(255,255,255,0.08)", color: m.role === "admin" ? "#fff" : "#e2ddf5" }}>
                        {m.role === "admin" && <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, marginBottom: 2 }}>Администратор</div>}
                        <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{new Date(m.created_at).toLocaleString("ru-RU")}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <input value={reply} onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Ответ от администратора..."
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 14px", color: "#e2ddf5", fontSize: 14, outline: "none" }} />
                  <button onClick={sendReply} disabled={sending || !reply.trim()}
                    style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #a855f7, #6366f1)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: sending || !reply.trim() ? 0.5 : 1 }}>
                    <Icon name="Send" size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}