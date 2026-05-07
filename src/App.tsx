
import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PwaIconGenerator from "./components/PwaIconGenerator";

const queryClient = new QueryClient();

const ICON = "https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/d627eb19-1149-4ab5-9c92-bf50148879de.jpg";

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 1600);
    const t2 = setTimeout(() => onDone(), 2100);
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

      {/* Icon */}
      <div style={{
        width: 112, height: 112, borderRadius: 28,
        overflow: "hidden",
        boxShadow: "0 0 40px rgba(168,85,247,0.35), 0 0 80px rgba(168,85,247,0.15)",
        animation: "splashPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}>
        <img src={ICON} alt="Debt-Debt" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Name */}
      <div style={{ textAlign: "center", animation: "splashFade 0.6s 0.3s ease forwards", opacity: 0 }}>
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
      <div style={{ display: "flex", gap: 8, animation: "splashFade 0.6s 0.6s ease forwards", opacity: 0 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "linear-gradient(135deg, #a855f7, #6366f1)",
            animation: `splashDot 1s ${i * 0.18}s ease-in-out infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes splashPop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
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

const App = () => {
  const [ready, setReady] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PwaIconGenerator />
        {!ready && <SplashScreen onDone={() => setReady(true)} />}
        <div style={{ opacity: ready ? 1 : 0, transition: "opacity 0.4s ease" }}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;