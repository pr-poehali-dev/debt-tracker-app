import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

const CHAT_URL = func2url["chat"];

interface Message {
  id: number;
  sender_user_id: number;
  sender_name: string;
  text: string;
  created_at: string;
  is_mine: boolean;
  is_read: boolean;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  sender_avatar_url?: string | null;
  is_system?: boolean;
}

interface Props {
  debtId?: string;
  rentalId?: number;
  title: string;
  contactName?: string;
  contactAvatarUrl?: string;
  token: string;
  onClose: () => void;
  onLimitReached?: (info: { type: string; message?: string; limit?: number; current?: number }) => void;
}

let notifSound: AudioContext | null = null;

function playNotifSound() {
  try {
    if (!notifSound) notifSound = new AudioContext();
    const ctx = notifSound;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_e) { /* звук не поддерживается */ }
}

export default function ChatWindow({ debtId, rentalId, title, contactName, contactAvatarUrl, token, onClose, onLimitReached }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{
    file: File;
    preview: string | null;
    isImage: boolean;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [saveHint, setSaveHint] = useState<{ url: string; name: string } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) panelRef.current.style.transform = `translateY(${dy}px)`;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    panelRef.current.style.transform = "";
    if (dy > 80) onClose();
    dragStartY.current = null;
  }

  function buildQuery() {
    if (debtId) return `?debt_id=${debtId}`;
    if (rentalId) return `?rental_id=${rentalId}`;
    return "";
  }

  async function blobToFile(blob: Blob, name: string): Promise<"shared" | "downloaded" | "cancelled" | "unsupported"> {
    const safeName = (name || "file").replace(/[\\/:*?"<>|]/g, "_");
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    const file = new File([blob], safeName, { type: blob.type || "application/octet-stream" });

    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try {
        await nav.share({
          files: [file],
          title: "Debt-Debt.ru",
          text: "Debt-Debt.ru",
        });
        return "shared";
      } catch (e) {
        const err = e as Error;
        if (err?.name === "AbortError") return "cancelled";
        /* fallback на обычное скачивание */
      }
    }

    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) return "unsupported";

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = safeName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    return "downloaded";
  }

  function loadImageAsBlob(url: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no ctx"));
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("toBlob failed"));
          }, "image/jpeg", 0.95);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
  }

  function startLongPress(url: string, name: string) {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* ignore */ }
      downloadAttachment(url, name);
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  async function downloadAttachment(url: string, fileName: string) {
    setDownloading(true);
    const isImg = /\.(jpe?g|png|gif|webp|bmp)$/i.test(url) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(fileName);
    const label = isImg ? "Фото" : "Файл";
    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let attemptedResult: "shared" | "downloaded" | "cancelled" | "unsupported" | null = null;
    try {
      // 1) Пробуем fetch (работает если CDN отдаёт CORS-заголовки)
      try {
        const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
        if (res.ok) {
          const blob = await res.blob();
          attemptedResult = await blobToFile(blob, fileName);
          if (attemptedResult === "downloaded" || attemptedResult === "shared") {
            toast.success(`${label} сохранён`);
            return;
          }
          if (attemptedResult === "cancelled") return;
        }
      } catch (_e) { /* fallback */ }

      // 2) Для изображений — рисуем в canvas и сохраняем (требует CORS на CDN)
      if (isImg && attemptedResult !== "unsupported") {
        try {
          const blob = await loadImageAsBlob(url);
          const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          const baseName = fileName.replace(/\.[^.]+$/, "");
          attemptedResult = await blobToFile(blob, `${baseName}.${ext}`);
          if (attemptedResult === "downloaded" || attemptedResult === "shared") {
            toast.success(`${label} сохранён`);
            return;
          }
          if (attemptedResult === "cancelled") return;
        } catch (_e) { /* последний fallback */ }
      }

      // 3) Android: открываем фото в новой вкладке — там Chrome даст
      //    меню «Сохранить изображение». Атрибут download на cross-origin
      //    Android Chrome игнорирует, поэтому именно открываем превью.
      if (isAndroid) {
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (w) {
          toast(isImg ? "Долгое нажатие → Сохранить изображение" : `${label} открыт — сохрани вручную`);
        } else {
          // Если попап заблокирован — кладём ссылку как обычную
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast(isImg ? "Долгое нажатие → Сохранить изображение" : `${label} открыт — сохрани вручную`);
        }
        return;
      }

      // 4) iOS без Share API — показываем модалку с long-press
      if (isImg && isIOS) {
        setSaveHint({ url, name: fileName });
        return;
      }

      // 5) Файлы / прочие — открываем по ссылке
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast(`${label} открыт — сохрани вручную`);
    } catch (e) {
      console.error("[download] error:", e);
      toast.error(`Не удалось сохранить ${label.toLowerCase()}`);
    } finally {
      setDownloading(false);
    }
  }

  async function loadMessages(silent = false) {
    if (!silent) setLoading(true);
    const res = await fetch(`${CHAT_URL}${buildQuery()}&limit=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      const newMsgs: Message[] = d.messages;
      setHasMore(prev => prev !== Boolean(d.has_more) ? Boolean(d.has_more) : prev);
      setMessages(prev => {
        const prevIds = new Set(prev.map(m => m.id));
        const incoming = newMsgs.filter(m => !m.is_mine && !prevIds.has(m.id));
        if (incoming.length > 0 && prev.length > 0) {
          playNotifSound();
        }
        // При тихой подгрузке — добавляем ТОЛЬКО новые сообщения, не пересоздавая массив,
        // если ничего нового нет (чтобы избежать ремоунта аватарок и «моргания»).
        if (silent && prev.length > 0) {
          const toAppend = newMsgs.filter(m => !prevIds.has(m.id));
          if (toAppend.length === 0) return prev;
          const merged = [...prev, ...toAppend];
          merged.sort((a, b) => a.id - b.id);
          return merged;
        }
        // Первая загрузка / явный refresh: если набор и порядок ID совпадают — не меняем ссылку
        if (prev.length === newMsgs.length && prev.every((m, i) => m.id === newMsgs[i].id)) {
          return prev;
        }
        return newMsgs;
      });
    }
    if (!silent) setLoading(false);
  }

  async function loadOlder() {
    if (loadingOlderRef.current || !hasMore || messages.length === 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;
    const oldestId = messages[0].id;
    try {
      const res = await fetch(`${CHAT_URL}${buildQuery()}&limit=30&before_id=${oldestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const older: Message[] = d.messages || [];
        setHasMore(Boolean(d.has_more));
        if (older.length > 0) {
          setMessages(prev => {
            const ids = new Set(prev.map(m => m.id));
            const fresh = older.filter(m => !ids.has(m.id));
            return [...fresh, ...prev];
          });
          // Сохраняем позицию скролла после prepend
          requestAnimationFrame(() => {
            const node = scrollRef.current;
            if (node) node.scrollTop = node.scrollHeight - prevScrollHeight + prevScrollTop;
          });
        }
      }
    } finally {
      setLoadingOlder(false);
      loadingOlderRef.current = false;
    }
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(() => loadMessages(true), 60000);
    function onRealtimeMessage(e: Event) {
      const detail = (e as CustomEvent).detail as Array<{ debt_id?: string | null; rental_id?: number | null }>;
      const match = detail?.some(m =>
        (debtId && m.debt_id === debtId) ||
        (rentalId && m.rental_id === rentalId)
      );
      if (match) loadMessages(true);
    }
    window.addEventListener("realtime:message", onRealtimeMessage);
    return () => {
      clearInterval(interval);
      window.removeEventListener("realtime:message", onRealtimeMessage);
    };
  }, [debtId, rentalId]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    setHasMore(false);
    setMessages([]);
  }, [debtId, rentalId]);

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop < 80 && hasMore && !loadingOlderRef.current) {
      loadOlder();
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!didInitialScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
    } else {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (nearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages]);

  function readAsBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function addWatermark(file: File): Promise<{ blob: Blob; name: string; type: string }> {
    const MAX_SIDE = 2048;
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("img load"));
        i.src = objectUrl!;
      });

      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) throw new Error("zero size");

      const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
      const outW = Math.max(1, Math.round(srcW * scale));
      const outH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      ctx.drawImage(img, 0, 0, outW, outH);

      const text = "Debt-Debt.ru";
      const base = Math.min(outW, outH);
      const fontSize = Math.max(14, Math.round(base * 0.028));
      const padX = Math.round(fontSize * 0.7);
      const padY = Math.round(fontSize * 0.45);
      const margin = Math.round(base * 0.025);

      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = "middle";
      const textWidth = ctx.measureText(text).width;
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;
      const x = outW - margin - boxW;
      const y = outH - margin - boxH;

      const radius = boxH / 2;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + boxW, y, x + boxW, y + boxH, radius);
      ctx.arcTo(x + boxW, y + boxH, x, y + boxH, radius);
      ctx.arcTo(x, y + boxH, x, y, radius);
      ctx.arcTo(x, y, x + boxW, y, radius);
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.fillText(text, x + padX, y + boxH / 2 + 1);

      const outType = "image/jpeg";
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob")), outType, 0.85);
      });
      const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
      return { blob, name: `${baseName}.jpg`, type: outType };
    } catch (e) {
      console.warn("[addWatermark] fallback to original:", e);
      return { blob: file, name: file.name, type: file.type || "image/jpeg" };
    } finally {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
      }
    }
  }

  function onPickFile(kind: "image" | "file") {
    setShowAttachMenu(false);
    if (kind === "image") imageInputRef.current?.click();
    else fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert("Файл больше 15 МБ");
      return;
    }
    const isImage = file.type.startsWith("image/");
    const preview = isImage ? URL.createObjectURL(file) : null;
    setAttachment({ file, preview, isImage });
  }

  function clearAttachment() {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  }

  async function send() {
    const t = text.trim();
    if ((!t && !attachment) || sending || uploading) return;

    setSending(true);

    let uploaded: { url: string; type: string; name: string; size: number } | null = null;
    if (attachment) {
      setUploading(true);
      try {
        let uploadBlob: Blob = attachment.file;
        let uploadName = attachment.file.name;
        let uploadType = attachment.file.type || "application/octet-stream";
        if (attachment.isImage) {
          const wm = await addWatermark(attachment.file);
          uploadBlob = wm.blob;
          uploadName = wm.name;
          uploadType = wm.type;
        }

        if (uploadBlob.size > 15 * 1024 * 1024) {
          alert("Фото слишком большое. Попробуй сделать снимок поменьше.");
          setUploading(false);
          setSending(false);
          return;
        }

        const base64 = await readAsBase64(uploadBlob);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90000);
        let upRes: Response;
        try {
          upRes = await fetch(`${CHAT_URL}?action=upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              file_base64: base64,
              file_name: uploadName,
              content_type: uploadType,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!upRes.ok) {
          const errData = await upRes.json().catch(() => ({}));
          console.warn("[chat upload] HTTP error", upRes.status, errData);
          alert(errData.error || `Не удалось загрузить файл (код ${upRes.status})`);
          setUploading(false);
          setSending(false);
          return;
        }
        uploaded = await upRes.json();
      } catch (e) {
        const err = e as Error;
        console.error("[chat upload] failed:", err);
        const msg = err?.name === "AbortError"
          ? "Слишком медленный интернет — загрузка прервана"
          : err?.message
            ? `Ошибка загрузки: ${err.message}`
            : "Ошибка загрузки";
        alert(msg);
        setUploading(false);
        setSending(false);
        return;
      }
      setUploading(false);
    }

    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const wasAttachment = attachment;
    clearAttachment();

    const body: Record<string, unknown> = { text: t };
    if (debtId) body.debt_id = debtId;
    if (rentalId) body.rental_id = rentalId;
    if (uploaded) {
      body.attachment_url = uploaded.url;
      body.attachment_type = uploaded.type;
      body.attachment_name = uploaded.name;
      body.attachment_size = uploaded.size;
    }
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
    } else if (res.status === 402) {
      try {
        const data = await res.json();
        if (data?.error === "limit_reached") {
          onLimitReached?.({
            type: data.limit_type || "messages",
            message: data.message,
            limit: data.limit,
            current: data.current,
          });
        }
      } catch { /* ignore */ }
      if (wasAttachment) setAttachment(wasAttachment);
      setText(t);
    } else {
      if (wasAttachment) setAttachment(wasAttachment);
      setText(t);
    }
    setSending(false);
  }

  function formatSize(bytes?: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
    return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
  }

  function handleTextInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  }

  function formatTime(s: string) {
    const d = new Date(s);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function groupMessages() {
    const groups: { date: string; msgs: Message[] }[] = [];
    let lastDate = "";
    for (const m of messages) {
      const d = new Date(m.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      if (d !== lastDate) { groups.push({ date: d, msgs: [] }); lastDate = d; }
      groups[groups.length - 1].msgs.push(m);
    }
    return groups;
  }

  const chatType = debtId ? "долгу" : "аренде";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        className="relative w-full flex flex-col animate-slide-up"
        style={{ height: "80dvh", maxHeight: "80dvh", background: "var(--app-bg)", borderRadius: "20px 20px 0 0", maxWidth: 640, transition: "transform 0.1s ease" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mesh-bg absolute inset-0 pointer-events-none rounded-t-[20px]" />

        {/* Drag handle — свайп вниз закрывает */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={onClose}
        >
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div className="relative z-10 px-4 pt-1 pb-3 flex items-center gap-3 border-b border-white/5">
          {contactName && (
            contactAvatarUrl ? (
              <img
                src={contactAvatarUrl}
                alt={contactName}
                className="w-9 h-9 rounded-full object-cover border border-purple-400/30 flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-purple-300">
                  {contactName.trim().charAt(0).toUpperCase() || "?"}
                </span>
              </div>
            )
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">
              {contactName || title}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {contactName ? `${title} • Чат по ${chatType}` : `Чат по ${chatType}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-muted-foreground">онлайн</span>
            </div>
            <button onClick={onClose}
              aria-label="Закрыть"
              className="w-10 h-10 glass rounded-xl flex items-center justify-center hover:bg-white/15 transition-colors"
              style={{ background: "rgba(255,255,255,0.12)" }}>
              <Icon name="X" size={20} />
            </button>
          </div>
        </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleMessagesScroll} className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-10">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "rgba(168,85,247,0.12)" }}>
              <Icon name="MessageCircle" size={28} style={{ color: "#a855f7" }} />
            </div>
            <p className="font-medium text-foreground mb-1">Начните общение</p>
            <p className="text-xs text-muted-foreground">Напишите первое сообщение</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupMessages().map(group => (
              <div key={group.date}>
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] text-muted-foreground">{group.date}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="space-y-2">
                  {group.msgs.map((m, i) => {
                    const prev = group.msgs[i - 1];
                    const next = group.msgs[i + 1];
                    const showName = !m.is_mine && prev?.sender_user_id !== m.sender_user_id;
                    const isLastInBlock = !m.is_mine && next?.sender_user_id !== m.sender_user_id;
                    if (m.is_system) {
                      return (
                        <div key={m.id} className="flex justify-center my-2">
                          <div className="max-w-[88%] px-3 py-1.5 rounded-full text-[11px] text-center"
                            style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", color: "#c4b5fd" }}>
                            <Icon name="Info" size={10} className="inline mr-1 -mt-0.5" />
                            {m.text}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={m.id} className={`flex items-end gap-2 ${m.is_mine ? "justify-end" : "justify-start"}`}>
                        {!m.is_mine && (
                          isLastInBlock ? (
                            m.sender_avatar_url ? (
                              <img
                                src={m.sender_avatar_url}
                                alt={m.sender_name}
                                width={28}
                                height={28}
                                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-semibold text-purple-300">
                                  {(m.sender_name || "?").trim().charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )
                          ) : (
                            <div className="w-7 flex-shrink-0" />
                          )
                        )}
                        <div className={`max-w-[78%] flex flex-col gap-0.5 ${m.is_mine ? "items-end" : "items-start"}`}>
                          {showName && (
                            <p className="text-[10px] text-purple-400 px-1 font-medium">{m.sender_name}</p>
                          )}
                          <div
                            className="rounded-2xl text-sm leading-relaxed overflow-hidden"
                            style={m.is_mine
                              ? { background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "white", borderBottomRightRadius: 5 }
                              : { background: "rgba(255,255,255,0.08)", color: "var(--foreground)", borderBottomLeftRadius: 5 }
                            }
                          >
                            {m.attachment_url && m.attachment_type === "image" && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                                  setPreviewImage({ url: m.attachment_url!, name: m.attachment_name || "photo.jpg" });
                                }}
                                onTouchStart={() => startLongPress(m.attachment_url!, m.attachment_name || "photo.jpg")}
                                onTouchEnd={cancelLongPress}
                                onTouchMove={cancelLongPress}
                                onTouchCancel={cancelLongPress}
                                onMouseDown={() => startLongPress(m.attachment_url!, m.attachment_name || "photo.jpg")}
                                onMouseUp={cancelLongPress}
                                onMouseLeave={cancelLongPress}
                                onContextMenu={(e) => { e.preventDefault(); downloadAttachment(m.attachment_url!, m.attachment_name || "photo.jpg"); }}
                                className="block w-full select-none"
                                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
                              >
                                <img
                                  src={m.attachment_url}
                                  alt={m.attachment_name || "Фото"}
                                  className="max-h-72 w-full object-cover pointer-events-none"
                                  style={{ display: "block" }}
                                  draggable={false}
                                />
                              </button>
                            )}
                            {m.attachment_url && m.attachment_type !== "image" && (
                              <button
                                type="button"
                                onClick={() => downloadAttachment(m.attachment_url!, m.attachment_name || "file")}
                                disabled={downloading}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
                                style={{ background: m.is_mine ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.04)" }}
                              >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.is_mine ? "bg-white/20" : "bg-white/10"}`}>
                                  <Icon name="FileText" size={18} className={m.is_mine ? "text-white" : "text-purple-400"} />
                                </div>
                                <div className="min-w-0 flex-1 text-left">
                                  <p className="truncate text-sm font-medium">{m.attachment_name || "Файл"}</p>
                                  <p className={`text-[10px] ${m.is_mine ? "text-white/70" : "text-muted-foreground"}`}>{formatSize(m.attachment_size)}</p>
                                </div>
                                {downloading
                                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  : <Icon name="Download" size={16} className={m.is_mine ? "text-white/80" : "text-muted-foreground"} />}
                              </button>
                            )}
                            {m.text && (
                              <div className="px-3.5 py-2.5 whitespace-pre-wrap break-words">{m.text}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 px-1">
                            <p className="text-[10px] text-muted-foreground">{formatTime(m.created_at)}</p>
                            {m.is_mine && (
                              m.is_read
                                ? <span title="Прочитано" style={{ color: "#a855f7", fontSize: 11, lineHeight: 1 }}>✓✓</span>
                                : <span title="Доставлено" style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, lineHeight: 1 }}>✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 px-4 pb-safe-6 pt-2 border-t border-white/5" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        {attachment && (
          <div className="mb-2 flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/10">
            {attachment.isImage && attachment.preview ? (
              <img src={attachment.preview} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <Icon name="FileText" size={20} className="text-purple-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{attachment.file.name}</p>
              <p className="text-[11px] text-muted-foreground">{formatSize(attachment.file.size)}{uploading ? " · загрузка…" : ""}</p>
            </div>
            <button
              onClick={clearAttachment}
              disabled={uploading}
              className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 disabled:opacity-40"
            >
              <Icon name="X" size={16} />
            </button>
          </div>
        )}

        {showAttachMenu && (
          <>
            <div className="fixed inset-0 z-[10000]" onClick={() => setShowAttachMenu(false)} />
            <div className="absolute bottom-[calc(100%+8px)] left-4 z-[10001] glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden min-w-[180px]" style={{ background: "rgba(26,29,46,0.98)" }}>
              <button
                onClick={() => onPickFile("image")}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Icon name="Image" size={16} className="text-purple-400" />
                </div>
                <span className="text-foreground">Фото</span>
              </button>
              <button
                onClick={() => onPickFile("file")}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors border-t border-white/5"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
                  <Icon name="Paperclip" size={16} className="text-sky-400" />
                </div>
                <span className="text-foreground">Файл</span>
              </button>
            </div>
          </>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={onFileSelected}
          className="hidden"
        />

        <div className="flex gap-2 items-end">
          <button
            onClick={() => setShowAttachMenu(v => !v)}
            disabled={sending || uploading}
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-40"
            aria-label="Прикрепить"
          >
            <Icon name="Paperclip" size={18} className="text-purple-400" />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextInput}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Написать сообщение..."
            rows={1}
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors resize-none"
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={send}
            disabled={(!text.trim() && !attachment) || sending || uploading}
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
          >
            {sending || uploading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Icon name="Send" size={18} className="text-white" />
            }
          </button>
        </div>
      </div>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setPreviewImage(null)}
          style={{ paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          <img
            src={previewImage.url}
            alt=""
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center hover:bg-white/25 transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top))" }}
            aria-label="Закрыть"
          >
            <Icon name="X" size={20} className="text-white" />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (downloading) return;
              await downloadAttachment(previewImage.url, previewImage.name);
            }}
            disabled={downloading}
            className="absolute left-1/2 -translate-x-1/2 px-5 h-12 rounded-full flex items-center justify-center gap-2 text-sm font-semibold text-white shadow-2xl active:scale-95 transition-all disabled:opacity-60"
            style={{
              bottom: "max(20px, calc(env(safe-area-inset-bottom) + 12px))",
              background: "linear-gradient(135deg, #a855f7, #6366f1)",
              boxShadow: "0 8px 24px rgba(168,85,247,0.45)",
            }}
            aria-label="Сохранить фото"
          >
            {downloading
              ? <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Сохраняем…</span>
                </>
              : <>
                  <Icon name="Download" size={18} className="text-white" />
                  <span>Сохранить фото</span>
                </>}
          </button>
        </div>
      )}

      {saveHint && (
        <div
          className="fixed inset-0 z-[10020] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSaveHint(null)}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden border border-purple-500/30 shadow-2xl max-h-[90vh] flex flex-col"
            style={{ background: "#1a1d2e", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <button
                onClick={async () => {
                  if (downloading) return;
                  await downloadAttachment(saveHint.url, saveHint.name);
                }}
                disabled={downloading}
                className="flex items-center gap-3 active:scale-95 transition-transform disabled:opacity-60"
                aria-label="Сохранить фото"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  {downloading
                    ? <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                    : <Icon name="Download" size={18} className="text-purple-300" />}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-white">Сохранить фото</p>
                  <p className="text-[11px] text-white/60">Нажми, чтобы скачать</p>
                </div>
              </button>
              <button
                onClick={() => setSaveHint(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
                aria-label="Закрыть"
              >
                <Icon name="X" size={18} className="text-white/70" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ maxHeight: "60vh" }}>
                <img
                  src={saveHint.url}
                  alt=""
                  className="w-full h-auto max-h-[60vh] object-contain select-none"
                  style={{ WebkitTouchCallout: "default", WebkitUserSelect: "auto", userSelect: "auto" } as React.CSSProperties}
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}