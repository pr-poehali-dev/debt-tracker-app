import { useEffect, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import Icon from "@/components/ui/icon";
import ModalCloseButton from "@/components/ui/ModalCloseButton";

interface Props {
  open: boolean;
  onClose: () => void;
  inviteUrl: string;
}

const APP_DESC = "Долговая книга: фиксируй долги, аренду и платежи. Чат с должником, напоминания, история — всё в одном месте.";

export default function InviteFriendModal({ open, onClose, inviteUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, inviteUrl, {
      width: 240,
      margin: 1,
      color: { dark: "#1a1d2e", light: "#ffffff" },
    }).catch(() => {});
  }, [open, inviteUrl]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const shareText = `${APP_DESC}\n\n${inviteUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Долговая книга", text: APP_DESC, url: inviteUrl });
        return;
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <ModalCloseButton onClose={onClose} zIndex={110} />
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden animate-slide-up"
        style={{ background: "#1a1d2e" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-5">
          <div className="flex items-center justify-start">
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-white/20 text-white">Пригласить друга</span>
          </div>
          <p className="text-white text-xl font-bold font-heading mt-3 pr-14">Поделись приложением</p>
          <p className="text-white/80 text-sm mt-1">{APP_DESC}</p>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto">
          <div className="flex justify-center">
            <div className="p-3 rounded-2xl bg-white">
              <canvas ref={canvasRef} className="block rounded-xl" />
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
            <p className="text-[11px] text-muted-foreground mb-1">Реферальная ссылка</p>
            <p className="text-sm text-foreground break-all">{inviteUrl}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 text-foreground text-sm font-medium hover:bg-white/10 transition"
            >
              <Icon name={copied ? "Check" : "Copy"} size={16} className={copied ? "text-emerald-400" : ""} />
              {copied ? "Скопировано" : "Скопировать"}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold transition"
              style={{ background: "linear-gradient(135deg,#a855f7,#6366f1)" }}
            >
              <Icon name="Share2" size={16} />
              Поделиться
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">Друг отсканирует QR или перейдёт по ссылке и сразу попадёт в приложение.</p>
        </div>
      </div>
    </div>
  );
}