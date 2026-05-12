import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { ColorPicker } from "@/components/index/SharedComponents";
import { type Contact, type ContactColor } from "@/components/index/types";

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let d = digits;
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7") && d.length > 0) d = "7" + d;
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  let out = "+7";
  if (d.length > 1) out += " (" + d.slice(1, 4);
  if (d.length >= 4) out += ") " + d.slice(4, 7);
  if (d.length >= 7) out += "-" + d.slice(7, 9);
  if (d.length >= 9) out += "-" + d.slice(9, 11);
  return out;
}

export interface ContactFormValues {
  name: string;
  phone: string;
  email: string;
  telegram: string;
  note: string;
  color: ContactColor;
}

export default function ContactModal({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  initial?: Partial<Contact> | null;
  onClose: () => void;
  onSave: (values: ContactFormValues, opts?: { forceDuplicate?: boolean }) => Promise<{ duplicate?: boolean } | void>;
  onDelete?: () => Promise<void> | void;
  saving?: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState<ContactColor>("purple");
  const [error, setError] = useState<string | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setPhone(initial?.phone || "");
    setEmail(initial?.email || "");
    setTelegram(initial?.telegram || "");
    setNote(initial?.note || "");
    setColor((initial?.color as ContactColor) || "purple");
    setError(null);
    setDuplicateConfirm(false);
  }, [open, initial]);

  if (!open) return null;

  async function handleSave(force = false) {
    setError(null);
    if (!name.trim()) {
      setError("Введите имя");
      return;
    }
    const values: ContactFormValues = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      telegram: telegram.trim().replace(/^@/, ""),
      note: note.trim(),
      color,
    };
    const res = await onSave(values, { forceDuplicate: force });
    if (res && res.duplicate) {
      setDuplicateConfirm(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-card border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">
            {initial?.id ? "Редактировать контакт" : "Новый контакт"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Имя *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Петров"
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-purple-500/50 outline-none text-foreground"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              onFocus={() => { if (!phone) setPhone("+7 ("); }}
              onBlur={() => { if (phone === "+7 (" || phone === "+7") setPhone(""); }}
              placeholder="+7 (999) 123-45-67"
              type="tel"
              inputMode="numeric"
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-purple-500/50 outline-none text-foreground"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ivan@example.com"
              inputMode="email"
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-purple-500/50 outline-none text-foreground"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Telegram</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <input
                value={telegram}
                onChange={(e) => setTelegram(e.target.value.replace(/^@/, ""))}
                placeholder="username"
                className="w-full pl-8 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-purple-500/50 outline-none text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Заметка</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: работает в баре, отдаёт со смены"
              rows={3}
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-purple-500/50 outline-none text-foreground resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Цвет</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {error && (
            <p className="text-xs text-rose-400 flex items-center gap-1">
              <Icon name="AlertCircle" size={12} />{error}
            </p>
          )}

          {duplicateConfirm && (
            <div className="rounded-2xl p-3 bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-300 font-semibold mb-2">Контакт с таким телефоном уже существует</p>
              <p className="text-xs text-muted-foreground mb-3">Всё равно создать новый?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDuplicateConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-sm"
                >
                  Отмена
                </button>
                <button
                  onClick={() => handleSave(true)}
                  className="flex-1 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-semibold"
                >
                  Всё равно создать
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {initial?.id && onDelete && (
              <button
                onClick={onDelete}
                disabled={saving}
                className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-medium disabled:opacity-50"
                title="Удалить"
              >
                <Icon name="Trash2" size={18} />
              </button>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={saving || duplicateConfirm}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-semibold disabled:opacity-50"
            >
              {saving ? "Сохраняю..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}