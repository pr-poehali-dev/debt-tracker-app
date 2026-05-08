import Icon from "@/components/ui/icon";
import { type ContactColor, type Debt, type Notification, COLOR_OPTIONS, getColor } from "./types";
import { type getT } from "@/i18n";

export function ColorPicker({ value, onChange }: { value: ContactColor; onChange: (c: ContactColor) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {COLOR_OPTIONS.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          title={c.label}
          className="w-7 h-7 rounded-full transition-all duration-150 flex items-center justify-center"
          style={{
            background: c.hex,
            boxShadow: value === c.id ? `0 0 0 2px #0d0f1a, 0 0 0 4px ${c.hex}` : "none",
            transform: value === c.id ? "scale(1.2)" : "scale(1)",
          }}
        >
          {value === c.id && <Icon name="Check" size={12} className="text-white" />}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ initials, color, size = "md" }: { initials: string; color?: ContactColor; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" };
  const c = color ? getColor(color) : null;

  if (c) {
    return (
      <div
        className={`${sizes[size]} rounded-2xl flex items-center justify-center font-bold text-white flex-shrink-0`}
        style={{ background: `linear-gradient(135deg, ${c.hex}, ${c.hex}99)`, boxShadow: `0 0 12px ${c.hex}55` }}
      >
        {initials}
      </div>
    );
  }

  const gradients = ["from-purple-500 to-indigo-500","from-sky-500 to-blue-600","from-pink-500 to-purple-500","from-emerald-500 to-teal-500","from-orange-500 to-amber-500"];
  const idx = initials.charCodeAt(0) % gradients.length;
  return (
    <div className={`${sizes[size]} rounded-2xl bg-gradient-to-br ${gradients[idx]} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  );
}

export function StatusBadge({ status, t }: { status: Debt["status"]; t: ReturnType<typeof getT> }) {
  const map = {
    active:  { label: t.statusActive,  cls: "bg-blue-500/15 text-blue-400 border border-blue-500/20"  },
    overdue: { label: t.statusOverdue, cls: "bg-red-500/15 text-red-400 border border-red-500/20"     },
    paid:    { label: t.statusPaid,    cls: "bg-green-500/15 text-green-400 border border-green-500/20"},
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}

export function NotifIcon({ type }: { type: Notification["type"] }) {
  const map: Record<Notification["type"], { icon: string; cls: string }> = {
    danger:  { icon: "AlertCircle",  cls: "text-red-400 bg-red-500/15"   },
    warning: { icon: "Clock",        cls: "text-amber-400 bg-amber-500/15"},
    info:    { icon: "Bell",         cls: "text-blue-400 bg-blue-500/15" },
    success: { icon: "CheckCircle2", cls: "text-green-400 bg-green-500/15"},
  };
  const m = map[type];
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.cls}`}>
      <Icon name={m.icon} size={18} />
    </div>
  );
}
