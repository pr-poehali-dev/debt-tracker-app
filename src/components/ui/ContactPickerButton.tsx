import { useState } from "react";
import Icon from "@/components/ui/icon";
import { formatPhoneInput } from "@/components/NewDebtModalParts/shared";

interface Props {
  onPick: (name: string, phone: string) => void;
  className?: string;
}

interface ContactPickerNavigator extends Navigator {
  contacts?: {
    select: (
      properties: string[],
      options?: { multiple?: boolean }
    ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
  };
}

export default function ContactPickerButton({ onPick, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nav = typeof navigator !== "undefined" ? (navigator as ContactPickerNavigator) : null;
  const supported = !!(nav && nav.contacts && typeof nav.contacts.select === "function");

  async function pick() {
    if (!supported || !nav?.contacts) {
      setError("Доступно только в Chrome на Android");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contacts = await nav.contacts.select(["name", "tel"], { multiple: false });
      if (contacts && contacts.length > 0) {
        const c = contacts[0];
        const name = (c.name && c.name[0]) || "";
        const rawPhone = (c.tel && c.tel[0]) || "";
        const phone = rawPhone ? formatPhoneInput(rawPhone) : "";
        onPick(name, phone);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("aborted") && !msg.includes("cancel")) {
        setError("Не удалось получить контакт");
        setTimeout(() => setError(null), 3000);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={pick}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-300 hover:text-purple-200 transition-colors disabled:opacity-50"
        title="Выбрать из контактов телефона"
      >
        {loading ? (
          <Icon name="Loader2" size={14} className="animate-spin" />
        ) : (
          <Icon name="BookUser" size={14} />
        )}
        <span>Из контактов</span>
      </button>
      {error && <p className="text-[10px] text-amber-400 mt-1">{error}</p>}
    </div>
  );
}
