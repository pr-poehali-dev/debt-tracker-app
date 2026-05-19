import Icon from "@/components/ui/icon";

export default function PaymentFail() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-sm w-full text-center space-y-5 rounded-3xl border border-white/10 p-8" style={{ background: "#1a1d2e" }}>
        <div
          className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
          style={{ background: "rgba(244,63,94,0.2)", border: "2px solid rgba(244,63,94,0.4)" }}
        >
          <Icon name="XCircle" size={36} style={{ color: "#f43f5e" }} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black font-heading text-foreground">Оплата отменена</h1>
          <p className="text-sm text-muted-foreground">Деньги не списаны. Можно попробовать снова в любой момент.</p>
        </div>
        <a
          href="/"
          className="block w-full py-3 rounded-2xl font-bold text-white text-base active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)" }}
        >
          Вернуться в приложение
        </a>
      </div>
    </div>
  );
}
