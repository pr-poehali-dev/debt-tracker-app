import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

interface InviteInfo {
  found: boolean;
  full_name?: string;
  avatar_url?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

export default function InviteWelcome() {
  const refPhone =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("ref") || ""
      : "";
  const [info, setInfo] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!refPhone) return;
    fetch(`${func2url["auth"]}?action=invite-info&ref=${encodeURIComponent(refPhone)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setInfo(data);
      })
      .catch(() => {});
  }, [refPhone]);

  if (!refPhone) return null;

  const inviter = info?.found ? info.full_name || "Друг" : "";

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 mb-6 animate-fade-in"
      style={{
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.16))",
        border: "1px solid rgba(168,85,247,0.35)",
        boxShadow:
          "0 0 40px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 0% 0%, rgba(168,85,247,0.25) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(99,102,241,0.18) 0%, transparent 55%)",
        }}
      />
      <div className="relative">
        {inviter ? (
          <div className="flex items-center gap-3 mb-3">
            {info?.avatar_url ? (
              <img
                src={info.avatar_url}
                alt={inviter}
                className="w-11 h-11 rounded-2xl object-cover"
                style={{
                  boxShadow: "0 0 20px rgba(168,85,247,0.45)",
                }}
              />
            ) : (
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold"
                style={{
                  background: "linear-gradient(135deg,#a855f7,#6366f1)",
                  boxShadow: "0 0 20px rgba(168,85,247,0.45)",
                }}
              >
                {getInitials(inviter)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-white/60">
                Тебя приглашает
              </p>
              <p className="text-white font-semibold truncate">{inviter}</p>
            </div>
            <div
              className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#a855f7,#6366f1)" }}
            >
              +1 контакт
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg,#a855f7,#6366f1)",
                boxShadow: "0 0 20px rgba(168,85,247,0.45)",
              }}
            >
              <Icon name="Gift" size={22} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-white/60">
                Приглашение
              </p>
              <p className="text-white font-semibold">Добро пожаловать в Debt-Debt</p>
            </div>
          </div>
        )}

        <p className="text-sm text-white/85 leading-snug mb-3">
          <span className="font-semibold text-white">Debt-Debt</span> — личная
          долговая книга. Фиксируй долги, займы и аренду, отслеживай платежи и
          сроки возврата, обменивайся подтверждениями в чате.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <Feature icon="Wallet" label="Долги и займы" />
          <Feature icon="CalendarClock" label="Напоминания" />
          <Feature icon="MessagesSquare" label="Чат с должником" />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="flex flex-col items-center text-center gap-1.5 py-2 px-1 rounded-xl"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Icon name={icon} size={18} className="text-white/90" />
      <span className="text-[10px] text-white/70 leading-tight">{label}</span>
    </div>
  );
}
