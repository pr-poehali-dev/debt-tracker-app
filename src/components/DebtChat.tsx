import { useState, useEffect, useRef } from "react";
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
}

interface Props {
  debtId: string;
  debtTitle: string;
  token: string;
  onClose: () => void;
}

export default function DebtChat({ debtId, debtTitle, token, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    const res = await fetch(`${CHAT_URL}?debt_id=${debtId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      setMessages(d.messages);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [debtId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ debt_id: debtId, text: t }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
    }
    setSending(false);
  }

  function formatTime(s: string) {
    return new Date(s).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--app-bg)" }}>
      <div className="mesh-bg fixed inset-0 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 px-4 pt-5 pb-3 flex items-center gap-3 border-b border-white/5">
        <button onClick={onClose} className="w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
          <Icon name="ChevronLeft" size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{debtTitle}</p>
          <p className="text-xs text-muted-foreground">Чат по долгу</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-green-400" title="Онлайн" />
      </div>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm pt-8">
            <Icon name="MessageCircle" size={32} className="mx-auto mb-2 opacity-30" />
            <p>Начните общение</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`flex ${m.is_mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${m.is_mine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                {!m.is_mine && (
                  <p className="text-xs text-muted-foreground px-1">{m.sender_name}</p>
                )}
                <div
                  className="rounded-2xl px-4 py-2.5 text-sm"
                  style={m.is_mine
                    ? { background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "white", borderBottomRightRadius: 4 }
                    : { background: "rgba(255,255,255,0.07)", color: "var(--foreground)", borderBottomLeftRadius: 4 }
                  }
                >
                  {m.text}
                </div>
                <p className="text-[10px] text-muted-foreground px-1">{formatTime(m.created_at)}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 px-4 pb-6 pt-2 border-t border-white/5">
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Написать сообщение..."
            rows={1}
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors resize-none"
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
          >
            <Icon name="Send" size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
