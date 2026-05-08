import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

const CHAT_URL = func2url["chat"];

interface Message {
  id: number;
  sender_user_id: number;
  sender_name: string;
  text: string;
  created_at: string;
  is_mine: boolean;
  is_read: boolean;
}

interface Props {
  debtId?: string;
  rentalId?: number;
  title: string;
  token: string;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

let notifSound: AudioContext | null = null;

function playNotifSound() {
  try {
    if (!notifSound) notifSound = new AudioContext();
    const ctx = notifSound;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_e) { /* звук не поддерживается */ }
}

export default function ChatWindow({ debtId, rentalId, title, token, onClose, onUnreadChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragStartY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) panelRef.current.style.transform = `translateY(${dy}px)`;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    panelRef.current.style.transform = "";
    if (dy > 80) onClose();
    dragStartY.current = null;
  }

  function buildQuery() {
    if (debtId) return `?debt_id=${debtId}`;
    if (rentalId) return `?rental_id=${rentalId}`;
    return "";
  }

  async function loadMessages(silent = false) {
    if (!silent) setLoading(true);
    const res = await fetch(`${CHAT_URL}${buildQuery()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      const newMsgs: Message[] = d.messages;
      setMessages(prev => {
        const prevIds = new Set(prev.map(m => m.id));
        const incoming = newMsgs.filter(m => !m.is_mine && !prevIds.has(m.id));
        if (incoming.length > 0 && prev.length > 0) {
          playNotifSound();
        }
        return newMsgs;
      });
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(() => loadMessages(true), 4000);
    return () => clearInterval(interval);
  }, [debtId, rentalId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const body: Record<string, unknown> = { text: t };
    if (debtId) body.debt_id = debtId;
    if (rentalId) body.rental_id = rentalId;
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
    }
    setSending(false);
  }

  function handleTextInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  }

  function formatTime(s: string) {
    const d = new Date(s);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function groupMessages() {
    const groups: { date: string; msgs: Message[] }[] = [];
    let lastDate = "";
    for (const m of messages) {
      const d = new Date(m.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      if (d !== lastDate) { groups.push({ date: d, msgs: [] }); lastDate = d; }
      groups[groups.length - 1].msgs.push(m);
    }
    return groups;
  }

  const chatType = debtId ? "долгу" : "аренде";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        className="relative w-full flex flex-col animate-slide-up"
        style={{ height: "80dvh", maxHeight: "80dvh", background: "var(--app-bg)", borderRadius: "20px 20px 0 0", maxWidth: 640, transition: "transform 0.1s ease" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mesh-bg absolute inset-0 pointer-events-none rounded-t-[20px]" />

        {/* Drag handle — свайп вниз закрывает */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={onClose}
        >
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div className="relative z-10 px-4 pt-1 pb-3 flex items-center gap-3 border-b border-white/5">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground">Чат по {chatType}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-muted-foreground">онлайн</span>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
              <Icon name="X" size={15} />
            </button>
          </div>
        </div>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-10">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "rgba(168,85,247,0.12)" }}>
              <Icon name="MessageCircle" size={28} style={{ color: "#a855f7" }} />
            </div>
            <p className="font-medium text-foreground mb-1">Начните общение</p>
            <p className="text-xs text-muted-foreground">Напишите первое сообщение</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupMessages().map(group => (
              <div key={group.date}>
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] text-muted-foreground">{group.date}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="space-y-2">
                  {group.msgs.map((m, i) => {
                    const prev = group.msgs[i - 1];
                    const showName = !m.is_mine && prev?.sender_user_id !== m.sender_user_id;
                    return (
                      <div key={m.id} className={`flex ${m.is_mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] flex flex-col gap-0.5 ${m.is_mine ? "items-end" : "items-start"}`}>
                          {showName && (
                            <p className="text-[10px] text-purple-400 px-1 font-medium">{m.sender_name}</p>
                          )}
                          <div
                            className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                            style={m.is_mine
                              ? { background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "white", borderBottomRightRadius: 5 }
                              : { background: "rgba(255,255,255,0.08)", color: "var(--foreground)", borderBottomLeftRadius: 5 }
                            }
                          >
                            {m.text}
                          </div>
                          <div className="flex items-center gap-1 px-1">
                            <p className="text-[10px] text-muted-foreground">{formatTime(m.created_at)}</p>
                            {m.is_mine && (
                              m.is_read
                                ? <span title="Прочитано" style={{ color: "#a855f7", fontSize: 11, lineHeight: 1 }}>✓✓</span>
                                : <span title="Доставлено" style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, lineHeight: 1 }}>✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 px-4 pb-safe-6 pt-2 border-t border-white/5" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextInput}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Написать сообщение..."
            rows={1}
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors resize-none"
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Icon name="Send" size={18} className="text-white" />
            }
          </button>
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}