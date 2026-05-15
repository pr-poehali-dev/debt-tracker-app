import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  debtId: string;
  debtTitle: string;
  defaultAmount: number;
  token: string;
  onClose: () => void;
  onSent?: () => void;
  principal?: number;
  interestRate?: number;
  interestType?: "simple" | "compound";
  createdAt?: string;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

function readAsBase64(file: File): Promise<string> {
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

export default function ManualReturnModal({ debtId, debtTitle, defaultAmount, token, onClose, onSent, principal, interestRate, interestType, createdAt }: Props) {
  const daysFromStart = createdAt ? Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86400000)) : null;
  const accruedInterest = principal != null && defaultAmount > principal ? defaultAmount - principal : 0;
  const showInterestHint = !!interestRate && !!createdAt && accruedInterest > 0;
  function daysLabel(n: number) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "день";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
    return "дней";
  }
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [remaining, setRemaining] = useState<number>(Math.round(defaultAmount));
  const [loadingRemaining, setLoadingRemaining] = useState(true);
  const [attachment, setAttachment] = useState<{ file: File; preview: string | null; isImage: boolean } | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function pickFile(kind: "image" | "file") {
    setShowAttachMenu(false);
    if (kind === "image") imageInputRef.current?.click();
    else fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("Файл больше 15 МБ");
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: urls } = await import("../../backend/func2url.json");
        const res = await fetch(`${urls["debts"]}?action=pay&debt_id=${debtId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list: Array<{ amount: number; status: string }> = Array.isArray(data.requests) ? data.requests : [];
        const paid = list.filter(p => p.status === "accepted").reduce((s, p) => s + p.amount, 0);
        const rem = Math.max(0, Math.round(defaultAmount - paid));
        if (!cancelled) {
          setRemaining(rem);
          setAmount(String(rem));
        }
      } catch {
        if (!cancelled) setAmount(String(Math.round(defaultAmount)));
      } finally {
        if (!cancelled) setLoadingRemaining(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debtId, token, defaultAmount]);

  const numAmount = parseFloat(amount.replace(/\s/g, "").replace(",", "."));

  async function send() {
    if (!numAmount || numAmount <= 0) {
      setError("Введите сумму больше нуля");
      return;
    }
    if (!loadingRemaining && remaining > 0 && numAmount > remaining) {
      setError(`Сумма больше остатка (${fmt(remaining)})`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { default: urls } = await import("../../backend/func2url.json");

      // 1) Загрузить вложение (если есть)
      let uploaded: { url: string; type: string; name: string; size: number } | null = null;
      if (attachment) {
        const base64 = await readAsBase64(attachment.file);
        const upRes = await fetch(`${urls["chat"]}?action=upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            file_base64: base64,
            file_name: attachment.file.name,
            content_type: attachment.file.type || "application/octet-stream",
          }),
        });
        if (!upRes.ok) {
          const data = await upRes.json().catch(() => ({}));
          throw new Error(data.error || "Не удалось загрузить файл");
        }
        uploaded = await upRes.json();
      }

      // 2) Создать запрос возврата
      const noteText = note.trim();
      const noteForPayment = uploaded
        ? (noteText ? `${noteText} (📎 ${uploaded.name})` : `📎 ${uploaded.name}`)
        : (noteText || null);
      const res = await fetch(`${urls["debts"]}?action=pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ debt_id: debtId, amount: numAmount, note: noteForPayment }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось отправить запрос");
      }

      // 3) Отправить вложение в чат долга, чтобы кредитор увидел файл
      if (uploaded) {
        try {
          await fetch(urls["chat"], {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              debt_id: debtId,
              text: noteText
                ? `Возврат ${fmt(numAmount)} — ${noteText}`
                : `Возврат ${fmt(numAmount)}`,
              attachment_url: uploaded.url,
              attachment_type: uploaded.type,
              attachment_name: uploaded.name,
              attachment_size: uploaded.size,
            }),
          });
        } catch { /* не критично */ }
      }

      setSuccess(true);
      clearAttachment();
      onSent?.();
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={loading ? undefined : onClose} />
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden animate-fade-in border border-white/10 shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: "#1a1d2e" }}
      >
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-white/20 text-white">Возврат вне приложения</span>
            <button onClick={onClose} disabled={loading} aria-label="Закрыть" className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-50 flex-shrink-0">
              <Icon name="X" size={20} className="text-white" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-3">Вернул лично</p>
          <p className="text-xl font-bold text-white font-heading mt-1 truncate">{debtTitle}</p>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto">
          {success ? (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                <Icon name="Check" size={28} className="text-green-400" />
              </div>
              <p className="font-semibold text-foreground">Запрос отправлен</p>
              <p className="text-xs text-muted-foreground max-w-xs">Кредитор увидит уведомление и подтвердит или отклонит возврат</p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-muted-foreground">Сумма возврата</label>
                  {!loadingRemaining && remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => { setAmount(String(remaining)); setError(null); }}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Остаток: {fmt(remaining)}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setError(null); }}
                    className="w-full glass rounded-2xl px-4 py-3 pr-12 text-lg font-bold font-heading text-foreground outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                    placeholder={loadingRemaining ? "Загрузка…" : "0"}
                    disabled={loadingRemaining}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₽</span>
                </div>
                {numAmount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Будет отправлено: <span className="text-green-400 font-medium">{fmt(numAmount)}</span>
                    {!loadingRemaining && numAmount > remaining && remaining > 0 && (
                      <span className="text-amber-400 ml-2">больше остатка</span>
                    )}
                  </p>
                )}
                {showInterestHint && (
                  <p className="text-[11px] text-violet-300/80 mt-1 flex items-center gap-1">
                    <Icon name="Percent" size={11} />
                    <span>
                      На сегодня{daysFromStart != null ? `, ${daysFromStart} ${daysLabel(daysFromStart)} с даты выдачи` : ""}
                      {principal != null ? ` · тело ${fmt(principal)} + проценты ${fmt(accruedInterest)}` : ""}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Комментарий (необязательно)</label>
                <div className="relative">
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={2}
                    className="w-full glass rounded-2xl px-4 py-3 pr-12 text-sm text-foreground outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none"
                    placeholder="Например: вернул наличкой при встрече"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAttachMenu(v => !v)}
                    disabled={loading}
                    className="absolute right-2 bottom-2 w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                    aria-label="Прикрепить"
                  >
                    <Icon name="Paperclip" size={16} className="text-emerald-400" />
                  </button>
                  {showAttachMenu && (
                    <>
                      <div className="fixed inset-0 z-[101]" onClick={() => setShowAttachMenu(false)} />
                      <div className="absolute right-2 bottom-12 z-[102] rounded-2xl border border-white/10 shadow-2xl overflow-hidden min-w-[170px]" style={{ background: "rgba(26,29,46,0.98)" }}>
                        <button
                          type="button"
                          onClick={() => pickFile("image")}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                            <Icon name="Image" size={16} className="text-emerald-400" />
                          </div>
                          <span className="text-foreground">Фото</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => pickFile("file")}
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
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" onChange={onFileSelected} className="hidden" />
                <input ref={fileInputRef} type="file" onChange={onFileSelected} className="hidden" />

                {attachment && (
                  <div className="mt-2 flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/10">
                    {attachment.isImage && attachment.preview ? (
                      <img src={attachment.preview} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                        <Icon name="FileText" size={20} className="text-emerald-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{attachment.file.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatSize(attachment.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAttachment}
                      disabled={loading}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 disabled:opacity-40"
                    >
                      <Icon name="X" size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <Icon name="Info" size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">Кредитор должен подтвердить возврат. До его согласия долг останется активным.</p>
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">{error}</div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={send}
                  disabled={loading || !numAmount || loadingRemaining || (remaining > 0 && numAmount > remaining)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-sm shadow-lg shadow-green-500/20 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Icon name="HandCoins" size={16} />
                      Отправить
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}