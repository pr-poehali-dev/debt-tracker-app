import { useState, useMemo, useRef } from "react";
import Icon from "@/components/ui/icon";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { type Debt } from "@/components/index/types";
import { type PersonalLoan } from "@/components/PersonalLoanModal";

interface NavItem { id: string; icon: string; label: string; }
interface Props {
  onClose: () => void;
  lentDebts: Debt[];
  borrowedDebts: Debt[];
  archiveDebts: Debt[];
  personalLoans: PersonalLoan[];
  totalRentalAmount: number;
  activeRentalCount: number;
  navItems?: NavItem[];
  currentSection?: string;
  onNavigate?: (id: string) => void;
}

type ViewMode = "owed" | "owe";

const COLORS = {
  lent: "#a855f7",
  borrowed: "#38bdf8",
  personal: "#6366f1",
  rental: "#14b8a6",
  overdue: "#f87171",
  paid: "#4ade80",
};

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  icon: string;
}

export default function BalanceReportModal({ onClose, lentDebts, borrowedDebts, archiveDebts, personalLoans, totalRentalAmount, activeRentalCount, navItems, currentSection, onNavigate }: Props) {
  const [view, setView] = useState<ViewMode>("owed");

  const personalRemaining = useMemo(() => personalLoans.reduce((s, l) => {
    const monthsTotal = Math.max(1, Math.round((new Date(l.dueDate + "-01").getTime() - new Date(l.startDate + "-01").getTime()) / (30 * 86400000)) + 1);
    const paid = (l.paidMonths?.length || 0) * l.monthlyPayment;
    const fullTotal = l.monthlyPayment * monthsTotal;
    return s + Math.max(0, fullTotal - paid);
  }, 0), [personalLoans]);

  const slices: Slice[] = useMemo(() => {
    if (view === "owed") {
      const active = lentDebts.filter(d => d.status === "active").reduce((s, d) => s + d.amount, 0);
      const overdue = lentDebts.filter(d => d.status === "overdue").reduce((s, d) => s + d.amount, 0);
      const result: Slice[] = [];
      if (active > 0) result.push({ key: "active", label: "Активные", value: active, color: COLORS.lent, icon: "TrendingUp" });
      if (overdue > 0) result.push({ key: "overdue", label: "Просроченные", value: overdue, color: COLORS.overdue, icon: "AlertCircle" });
      return result;
    }
    const borrowedActive = borrowedDebts.filter(d => d.status === "active").reduce((s, d) => s + d.amount, 0);
    const borrowedOverdue = borrowedDebts.filter(d => d.status === "overdue").reduce((s, d) => s + d.amount, 0);
    const result: Slice[] = [];
    if (borrowedActive > 0) result.push({ key: "borrowed_active", label: "Долги активные", value: borrowedActive, color: COLORS.borrowed, icon: "TrendingDown" });
    if (borrowedOverdue > 0) result.push({ key: "borrowed_overdue", label: "Долги просрочены", value: borrowedOverdue, color: COLORS.overdue, icon: "AlertCircle" });
    if (personalRemaining > 0) result.push({ key: "personal", label: "Личные займы", value: personalRemaining, color: COLORS.personal, icon: "Wallet" });
    if (totalRentalAmount > 0) result.push({ key: "rental", label: "Аренда (в мес.)", value: totalRentalAmount, color: COLORS.rental, icon: "Home" });
    return result;
  }, [view, lentDebts, borrowedDebts, personalRemaining, totalRentalAmount]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  const archivedTotal = archiveDebts.filter(d => d.status === "paid").reduce((s, d) => s + d.amount, 0);

  const chartData = slices.length > 0 ? slices : [{ key: "empty", label: "Нет данных", value: 1, color: "rgba(255,255,255,0.08)", icon: "Inbox" }];

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  }
  function handleTouchEnd() {
    if (dragY > 120) {
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="relative w-full sm:max-w-md glass overflow-hidden flex flex-col sm:rounded-3xl animate-fade-in"
        style={{
          background: "var(--app-bg)",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY === 0 ? "transform 0.25s ease" : "none",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-4 border-b border-white/5 touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/20" />
          <div className="w-9 h-9" />
          <p className="font-semibold text-foreground">Отчёт</p>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(168,85,247,0.15)" }}>
            <Icon name="BarChart3" size={18} style={{ color: "#c084fc" }} />
          </div>
        </div>

        <div className="px-4 pt-4 flex gap-2">
          <button
            onClick={() => setView("owed")}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
            style={view === "owed"
              ? { background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }
              : { color: "rgba(180,180,200,0.7)", border: "1px solid transparent" }
            }
          >
            <Icon name="TrendingUp" size={13} />
            Вам должны
          </button>
          <button
            onClick={() => setView("owe")}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
            style={view === "owe"
              ? { background: "rgba(56,189,248,0.15)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,0.3)" }
              : { color: "rgba(180,180,200,0.7)", border: "1px solid transparent" }
            }
          >
            <Icon name="TrendingDown" size={13} />
            Вы должны
          </button>
        </div>

        <div className="px-4 pt-4">
          <p className="text-3xl font-black font-heading text-foreground">{fmt(total)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {view === "owed" ? "Сумма к получению" : "Сумма к выплате"}
            {archivedTotal > 0 && view === "owed" && (
              <span className="ml-2 inline-flex items-center gap-1 text-green-400">
                <Icon name="ArrowUp" size={11} />
                {fmt(archivedTotal)} получено
              </span>
            )}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="relative h-64 my-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={chartData.length > 1 ? 2 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Всего</p>
              <p className="text-xl font-bold font-heading text-foreground">{fmt(total)}</p>
              {slices.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{slices.length} {slices.length === 1 ? "категория" : "категории"}</p>
              )}
            </div>
          </div>

          {slices.length === 0 ? (
            <div className="glass rounded-2xl p-6 flex flex-col items-center text-center gap-2">
              <Icon name="Inbox" size={28} className="text-muted-foreground opacity-50" />
              <p className="font-semibold text-foreground text-sm">Здесь пусто</p>
              <p className="text-xs text-muted-foreground">
                {view === "owed" ? "Вам никто не должен" : "У вас нет активных обязательств"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {slices.map(s => {
                const percent = total > 0 ? Math.round((s.value / total) * 100) : 0;
                return (
                  <div key={s.key} className="glass rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}26` }}>
                      <Icon name={s.icon} size={18} style={{ color: s.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-medium text-foreground text-sm truncate">{s.label}</p>
                        <p className="text-sm font-bold font-heading flex-shrink-0" style={{ color: s.color }}>{fmt(s.value)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: s.color }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{percent}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="glass rounded-2xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Активных</p>
              <p className="text-lg font-bold font-heading text-foreground">
                {view === "owed"
                  ? lentDebts.filter(d => d.status !== "paid").length
                  : borrowedDebts.filter(d => d.status !== "paid").length + activeRentalCount}
              </p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Просрочено</p>
              <p className="text-lg font-bold font-heading text-red-400">
                {(view === "owed" ? lentDebts : borrowedDebts).filter(d => d.status === "overdue").length}
              </p>
            </div>
          </div>
        </div>

        {navItems && onNavigate && (
          <nav className="px-2 pb-safe pt-2 border-t border-white/5">
            <div className="glass rounded-2xl px-1 py-1.5 flex items-center justify-around" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)" }}>
              {navItems.map(item => {
                const active = currentSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); onClose(); }}
                    className={`relative flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl transition-all duration-200 min-w-0 flex-1 ${active ? "gradient-purple glow-purple" : "hover:bg-white/5"}`}
                  >
                    <Icon name={item.icon} size={18} className={active ? "text-white" : "text-muted-foreground"} />
                    <span className={`text-[8px] font-medium leading-none truncate w-full text-center ${active ? "text-white" : "text-muted-foreground"}`}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}