
import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AdminPanel from "./pages/AdminPanel";
import PwaIconGenerator from "./components/PwaIconGenerator";
import func2url from "../backend/func2url.json";

const queryClient = new QueryClient();

const ICON = "https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/3c85fb56-a239-44e8-94ff-1f08ccc35bb7.jpg";

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 2200);
    const t2 = setTimeout(() => onDone(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#0d0f1a",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: "24px",
        transition: "opacity 0.5s ease",
        opacity: hiding ? 0 : 1,
        pointerEvents: hiding ? "none" : "all",
      }}
    >
      {/* Mesh glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse at 30% 30%, rgba(168,85,247,0.18) 0%, transparent 55%),
          radial-gradient(ellipse at 70% 70%, rgba(99,102,241,0.14) 0%, transparent 50%)
        `,
      }} />

      {/* Animated icon */}
      <div style={{
        position: "relative",
        width: 160, height: 160,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {/* Rotating aura */}
        <div style={{
          position: "absolute", inset: -30,
          borderRadius: "50%",
          background: "conic-gradient(from 0deg, rgba(168,85,247,0.0), rgba(168,85,247,0.55), rgba(99,102,241,0.35), rgba(168,85,247,0.0))",
          filter: "blur(18px)",
          animation: "splashAura 3s linear infinite",
          opacity: 0.9,
        }} />

        {/* Outer pulse ring 1 */}
        <div style={{
          position: "absolute",
          width: 140, height: 140, borderRadius: "50%",
          border: "2px solid rgba(168,85,247,0.55)",
          animation: "splashPulse 2.2s 0.6s ease-out infinite",
          opacity: 0,
        }} />

        {/* Outer pulse ring 2 */}
        <div style={{
          position: "absolute",
          width: 140, height: 140, borderRadius: "50%",
          border: "2px solid rgba(99,102,241,0.45)",
          animation: "splashPulse 2.2s 1.3s ease-out infinite",
          opacity: 0,
        }} />

        {/* The actual app icon */}
        <img
          src={ICON}
          alt="Debt-Debt"
          style={{
            position: "relative",
            width: 140, height: 140,
            borderRadius: 32,
            boxShadow: "0 0 50px rgba(168,85,247,0.45), 0 0 90px rgba(99,102,241,0.25)",
            animation: "splashIconIn 0.9s cubic-bezier(0.34,1.56,0.64,1) both, splashIconFloat 3.2s 0.9s ease-in-out infinite",
            willChange: "transform",
          }}
        />

        {/* Shine sweep overlay */}
        <div style={{
          position: "absolute",
          width: 140, height: 140, borderRadius: 32,
          overflow: "hidden",
          pointerEvents: "none",
          animation: "splashIconIn 0.9s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          <div style={{
            position: "absolute",
            top: 0, left: "-60%",
            width: "60%", height: "100%",
            background: "linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.0) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.0) 65%, transparent 100%)",
            animation: "splashShine 2.6s 1.1s ease-in-out infinite",
          }} />
        </div>
      </div>

      {/* Name */}
      <div style={{ textAlign: "center", animation: "splashFade 0.6s 1.2s ease forwards", opacity: 0 }}>
        <div style={{
          fontSize: 28, fontWeight: 900, fontFamily: "Montserrat, sans-serif",
          background: "linear-gradient(135deg, #a855f7, #6366f1)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "-0.5px",
        }}>
          Debt-Debt
        </div>
        <div style={{ fontSize: 13, color: "rgba(180,170,210,0.6)", marginTop: 4, fontFamily: "Golos Text, sans-serif" }}>
          управление долгами
        </div>
      </div>

      {/* Loader dots */}
      <div style={{ display: "flex", gap: 8, animation: "splashFade 0.6s 1.5s ease forwards", opacity: 0 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "linear-gradient(135deg, #a855f7, #6366f1)",
            animation: `splashDot 1s ${i * 0.18}s ease-in-out infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes splashIconIn {
          0%   { transform: scale(0.5) rotate(-18deg); opacity: 0; }
          60%  { transform: scale(1.08) rotate(4deg);  opacity: 1; }
          80%  { transform: scale(0.97) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0);        opacity: 1; }
        }
        @keyframes splashIconFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-6px) scale(1.02); }
        }
        @keyframes splashAura {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes splashPulse {
          0%   { transform: scale(0.85); opacity: 0.8; }
          80%  { opacity: 0; }
          100% { transform: scale(1.6);  opacity: 0; }
        }
        @keyframes splashShine {
          0%   { left: -60%; }
          60%  { left: 120%; }
          100% { left: 120%; }
        }
        @keyframes splashFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashDot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

interface AuthUser { id: number; full_name: string; phone: string; email: string; }

export const DEMO_USER: AuthUser = {
  id: 0,
  full_name: "Демо Пользователь",
  phone: "+7 999 000 00 00",
  email: "demo@debt-debt.ru",
};

const App = () => {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("df-token");
    if (!token) { setAuthChecked(true); return; }
    fetch(`${func2url["auth"]}?action=me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.id) setUser(data); })
      .finally(() => setAuthChecked(true));
  }, []);

  function handleAuth(_token: string, u: AuthUser) {
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem("df-token");
    setUser(null);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PwaIconGenerator />
        {!ready && <SplashScreen onDone={() => setReady(true)} />}
        <div style={{ opacity: ready ? 1 : 0, transition: "opacity 0.4s ease" }}>
          {authChecked && (
            user
              ? <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Index user={user} onLogout={handleLogout} />} />
                    <Route path="/admin" element={
                      user.phone.replace(/\D/g, "") === "79680066666"
                        ? <AdminPanel onBack={() => window.history.back()} />
                        : <NotFound />
                    } />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              : <Auth onAuth={handleAuth} />
          )}
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;