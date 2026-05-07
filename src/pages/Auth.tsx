import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

type Step = "email" | "register" | "code";

interface Props {
  onAuth: (token: string, user: { id: number; full_name: string; phone: string; email: string }) => void;
}

export default function Auth({ onAuth }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const codeRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function checkEmail() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) { setError("Введите корректный email"); return; }
    setLoading(true); setError("");
    const res = await fetch(func2url["auth-send-code"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.status === 409) {
      setIsNewUser(false);
      setCountdown(60);
      setStep("code");
    } else if (res.ok) {
      setIsNewUser(false);
      setCountdown(60);
      setStep("code");
    } else if (res.status === 404) {
      setIsNewUser(true);
      setStep("register");
    } else {
      setError(data.error || "Ошибка");
    }
  }

  async function sendCode() {
    const fn = fullName.trim();
    const ph = phone.trim();
    if (!fn) { setError("Введите ФИО"); return; }
    if (!ph) { setError("Введите телефон"); return; }
    setLoading(true); setError("");
    const res = await fetch(func2url["auth-send-code"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), full_name: fn, phone: ph }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setCountdown(60);
      setStep("code");
    } else {
      setError(data.error || "Ошибка");
    }
  }

  async function verifyCode() {
    const c = code.join("");
    if (c.length < 4) { setError("Введите 4-значный код"); return; }
    setLoading(true); setError("");
    const body: Record<string, string> = { email: email.trim().toLowerCase(), code: c };
    if (isNewUser) { body.full_name = fullName.trim(); body.phone = phone.trim(); }
    const res = await fetch(func2url["auth-verify"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      localStorage.setItem("df-token", data.token);
      onAuth(data.token, data.user);
    } else {
      setError(data.error || "Неверный код");
      setCode(["", "", "", ""]);
      codeRefs[0].current?.focus();
    }
  }

  function handleCodeInput(i: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 3) codeRefs[i + 1].current?.focus();
    if (next.every(d => d !== "")) {
      setTimeout(() => verifyCode(), 100);
    }
  }

  function handleCodeKey(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      codeRefs[i - 1].current?.focus();
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--app-bg)" }}>
      <div className="mesh-bg" />
      <div className="relative z-10 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 gradient-purple rounded-3xl flex items-center justify-center mx-auto mb-4 glow-purple">
            <Icon name="Wallet" size={32} className="text-white" />
          </div>
          <h1 className="font-heading font-black text-2xl text-gradient-purple">Debt-Debt</h1>
          <p className="text-muted-foreground text-sm mt-1">Управление долгами и займами</p>
        </div>

        <div className="glass rounded-3xl p-6">

          {/* Step: email */}
          {step === "email" && (
            <div className="space-y-4">
              <div>
                <h2 className="font-heading font-bold text-lg text-foreground">Войти или зарегистрироваться</h2>
                <p className="text-xs text-muted-foreground mt-1">Введите email — мы пришлём код подтверждения</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && checkEmail()}
                  placeholder="ivan@example.com"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={checkEmail}
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
              >
                {loading ? "Проверяем..." : "Продолжить"}
              </button>
            </div>
          )}

          {/* Step: register */}
          {step === "register" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep("email"); setError(""); }} className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <div>
                  <h2 className="font-heading font-bold text-lg text-foreground">Регистрация</h2>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setError(""); }}
                  placeholder="Иван Иванович Иванов"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && sendCode()}
                  placeholder="+7 999 000 00 00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={sendCode}
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
              >
                {loading ? "Отправляем код..." : "Получить код на email"}
              </button>
            </div>
          )}

          {/* Step: code */}
          {step === "code" && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep(isNewUser ? "register" : "email"); setError(""); setCode(["","","",""]); }} className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <div>
                  <h2 className="font-heading font-bold text-lg text-foreground">Введите код</h2>
                  <p className="text-xs text-muted-foreground">Отправили на {email}</p>
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={codeRefs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleCodeInput(i, e.target.value)}
                    onKeyDown={e => handleCodeKey(i, e)}
                    autoFocus={i === 0}
                    className="w-14 h-14 text-center text-2xl font-black rounded-2xl border-2 outline-none transition-all bg-white/5 text-foreground"
                    style={{ borderColor: d ? "#a855f7" : "rgba(255,255,255,0.1)", boxShadow: d ? "0 0 12px rgba(168,85,247,0.3)" : "none" }}
                  />
                ))}
              </div>

              {error && <p className="text-xs text-red-400 text-center">{error}</p>}

              {loading && (
                <p className="text-xs text-muted-foreground text-center">Проверяем код...</p>
              )}

              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-xs text-muted-foreground">Повторная отправка через {countdown} сек.</p>
                ) : (
                  <button
                    onClick={() => isNewUser ? sendCode() : checkEmail()}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Отправить код повторно
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
