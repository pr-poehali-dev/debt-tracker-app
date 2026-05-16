import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

const ICON = "https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/3c85fb56-a239-44e8-94ff-1f08ccc35bb7.jpg";
const DISMISS_KEY = "dd-install-dismissed-at";
const DISMISS_DAYS = 7;

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS() {
  const ua = navigator.userAgent || navigator.vendor || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function dismissedRecently() {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const days = (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24);
  return days < DISMISS_DAYS;
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"ios" | "android" | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    if (isIOS()) {
      setMode("ios");
      const t = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(t);
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setMode("android");
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function close() {
    setVisible(false);
    setShowIosGuide(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  async function handleAndroidInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted" || outcome === "dismissed") {
        setDeferred(null);
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } catch {
      setVisible(false);
    }
  }

  if (!visible || !mode) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 9998,
          background: "linear-gradient(135deg, rgba(30,20,55,0.96), rgba(20,15,40,0.96))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(168,85,247,0.35)",
          borderRadius: 20,
          padding: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.45), 0 0 40px rgba(168,85,247,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          animation: "ipSlideUp 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          fontFamily: "Golos Text, sans-serif",
        }}
      >
        <img
          src={ICON}
          alt=""
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            flexShrink: 0,
            boxShadow: "0 4px 14px rgba(168,85,247,0.4)",
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
            Установить Debt-Debt
          </div>
          <div style={{ fontSize: 12, color: "rgba(200,190,225,0.75)", marginTop: 2, lineHeight: 1.3 }}>
            {mode === "ios" ? "Добавь на главный экран" : "Запускай как обычное приложение"}
          </div>
        </div>

        <button
          onClick={mode === "ios" ? () => setShowIosGuide(true) : handleAndroidInstall}
          style={{
            background: "linear-gradient(135deg, #a855f7, #6366f1)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
            boxShadow: "0 4px 14px rgba(168,85,247,0.4)",
            fontFamily: "inherit",
          }}
        >
          Установить
        </button>

        <button
          onClick={close}
          aria-label="Закрыть"
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(200,190,225,0.6)",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="X" size={18} />
        </button>
      </div>

      {showIosGuide && (
        <div
          onClick={() => setShowIosGuide(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(8,5,20,0.75)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            animation: "ipFadeIn 0.25s ease both",
            fontFamily: "Golos Text, sans-serif",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "linear-gradient(180deg, #1a1230, #0f0a22)",
              borderTop: "1px solid rgba(168,85,247,0.4)",
              borderRadius: "24px 24px 0 0",
              padding: "22px 20px 30px",
              animation: "ipSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "rgba(200,190,225,0.25)",
                margin: "0 auto 18px",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <img src={ICON} alt="" style={{ width: 48, height: 48, borderRadius: 12 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>
                  Установка на iPhone
                </div>
                <div style={{ fontSize: 12, color: "rgba(200,190,225,0.7)" }}>
                  Займёт 10 секунд
                </div>
              </div>
            </div>

            <Step
              n={1}
              title="Нажми «Поделиться»"
              desc="Кнопка внизу экрана Safari (квадрат со стрелкой вверх)"
              icon="Share"
            />
            <Step
              n={2}
              title="Выбери «На экран Домой»"
              desc="Прокрути список вниз и нажми этот пункт"
              icon="Plus"
            />
            <Step
              n={3}
              title="Нажми «Добавить»"
              desc="Иконка появится на главном экране как обычное приложение"
              icon="Check"
              last
            />

            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "rgba(168,85,247,0.1)",
                border: "1px solid rgba(168,85,247,0.25)",
                borderRadius: 12,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Icon name="Info" size={16} className="text-purple-400" />
              <div style={{ fontSize: 12, color: "rgba(220,210,240,0.85)", lineHeight: 1.45 }}>
                Открывай эту страницу именно в <b>Safari</b> — в других браузерах кнопки «На экран Домой» нет.
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              style={{
                width: "100%",
                marginTop: 16,
                background: "linear-gradient(135deg, #a855f7, #6366f1)",
                color: "#fff",
                border: "none",
                borderRadius: 14,
                padding: "14px 16px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 6px 20px rgba(168,85,247,0.4)",
              }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ipSlideUp {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes ipFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}

function Step({
  n,
  title,
  desc,
  icon,
  last,
}: {
  n: number;
  title: string;
  desc: string;
  icon: string;
  last?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: last ? 0 : 14 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(99,102,241,0.2))",
          border: "1px solid rgba(168,85,247,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#c4a8ff",
          position: "relative",
        }}
      >
        <Icon name={icon} size={18} />
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #a855f7, #6366f1)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {n}
        </div>
      </div>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(200,190,225,0.7)", marginTop: 2, lineHeight: 1.35 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}