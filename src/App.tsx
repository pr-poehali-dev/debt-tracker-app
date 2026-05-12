
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

      {/* Animated DD icon */}
      <div style={{
        position: "relative",
        width: 140, height: 140, borderRadius: 32,
        background: "radial-gradient(circle at 50% 50%, #1a1f5c 0%, #0d1240 100%)",
        boxShadow: "0 0 50px rgba(168,85,247,0.35), 0 0 90px rgba(99,102,241,0.18)",
        overflow: "hidden",
        animation: "splashIconPop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {/* Soft inner glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 30% 30%, rgba(168,85,247,0.25) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />

        {/* Left D — magenta with glow */}
        <div style={{
          position: "absolute",
          left: 14, top: "50%", transform: "translateY(-50%)",
          fontSize: 92, lineHeight: 1, fontWeight: 900,
          fontFamily: "Montserrat, sans-serif",
          color: "#c026d3",
          textShadow: "0 0 18px rgba(217,70,239,0.85), 0 0 35px rgba(168,85,247,0.6)",
          animation: "splashLeftD 0.8s 0.1s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>D</div>

        {/* Right D — solid blue */}
        <div style={{
          position: "absolute",
          right: 14, top: "50%", transform: "translateY(-50%)",
          fontSize: 92, lineHeight: 1, fontWeight: 900,
          fontFamily: "Montserrat, sans-serif",
          color: "#4f6df5",
          textShadow: "0 0 14px rgba(99,102,241,0.6)",
          animation: "splashRightD 0.8s 0.1s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>D</div>

        {/* Triangle between */}
        <div style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 0, height: 0,
          borderTop: "9px solid transparent",
          borderBottom: "9px solid transparent",
          borderLeft: "13px solid #c026d3",
          transform: "translate(-50%, -50%)",
          filter: "drop-shadow(0 0 8px rgba(217,70,239,0.95)) drop-shadow(0 0 14px rgba(168,85,247,0.6))",
          animation: "splashTriangle 0.5s 0.85s cubic-bezier(0.34,1.56,0.64,1) both",
        }} />

        {/* Pulse ring on impact */}
        <div style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 14, height: 14,
          borderRadius: "50%",
          border: "2px solid #c026d3",
          transform: "translate(-50%, -50%)",
          animation: "splashRing 0.9s 0.95s ease-out both",
          opacity: 0,
          pointerEvents: "none",
        }} />
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
        @keyframes splashIconPop {
          from { transform: scale(0.7); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes splashLeftD {
          0%   { transform: translate(-120px, -50%) rotate(-12deg); opacity: 0; }
          70%  { transform: translate(6px, -50%) rotate(2deg); opacity: 1; }
          100% { transform: translate(0, -50%) rotate(0); opacity: 1; }
        }
        @keyframes splashRightD {
          0%   { transform: translate(120px, -50%) rotate(12deg); opacity: 0; }
          70%  { transform: translate(-6px, -50%) rotate(-2deg); opacity: 1; }
          100% { transform: translate(0, -50%) rotate(0); opacity: 1; }
        }
        @keyframes splashTriangle {
          0%   { transform: translate(-50%, -50%) scale(0) rotate(-90deg); opacity: 0; }
          60%  { transform: translate(-50%, -50%) scale(1.4) rotate(0deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes splashRing {
          0%   { width: 14px;  height: 14px; opacity: 0.9; border-width: 2px; }
          100% { width: 120px; height: 120px; opacity: 0;  border-width: 1px; }
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