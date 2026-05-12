import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

const CONTRACTS_URL = func2url["contracts"];
const AUTH_URL = func2url["auth"];

interface PassportData {
  full_name: string;
  passport_series: string;
  passport_number: string;
  passport_issued_by: string;
  passport_issued_date: string;
  passport_dept_code: string;
  birth_date: string;
  registration_address: string;
  phone?: string;
}

interface ContractRecord {
  id: number;
  contract_type: string;
  debt_id: string | null;
  rental_id: number | null;
  created_by_user_id: number;
  party_a_user_id: number;
  party_b_user_id: number | null;
  data: Record<string, unknown>;
  status: "draft" | "active" | string;
  signed_by_a_at: string | null;
  signed_by_b_at: string | null;
  pdf_url: string | null;
}

interface Props {
  token: string;
  userId: number;
  debtId: string;
  defaultAmount: number;
  defaultDueDate: string;
  defaultInterest?: number;
  counterpartyName?: string;
  onClose: () => void;
}

function emptyPassport(): PassportData {
  return {
    full_name: "",
    passport_series: "",
    passport_number: "",
    passport_issued_by: "",
    passport_issued_date: "",
    passport_dept_code: "",
    birth_date: "",
    registration_address: "",
  };
}

export default function ContractModal({
  token, userId, debtId, defaultAmount, defaultDueDate, defaultInterest, counterpartyName, onClose
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [step, setStep] = useState<"passport" | "fields" | "preview">("passport");
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [myPassport, setMyPassport] = useState<PassportData>(emptyPassport());
  const [city, setCity] = useState("");
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Загрузка текущего профиля и существующего договора
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [meRes, ctRes] = await Promise.all([
          fetch(`${AUTH_URL}?action=me`, { headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } }),
          fetch(`${CONTRACTS_URL}?debt_id=${debtId}`, { headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } }),
        ]);
        if (meRes.ok) {
          const me = await meRes.json();
          setMyPassport({
            full_name: me.full_name || "",
            passport_series: me.passport_series || "",
            passport_number: me.passport_number || "",
            passport_issued_by: me.passport_issued_by || "",
            passport_issued_date: me.passport_issued_date || "",
            passport_dept_code: me.passport_dept_code || "",
            birth_date: me.birth_date || "",
            registration_address: me.registration_address || "",
            phone: me.phone,
          });
        }
        if (ctRes.ok) {
          const data = await ctRes.json();
          if (data.contract) {
            setContract(data.contract);
            const d = data.contract.data || {};
            setCity(String(d.city || ""));
            setAmountText(String(d.amount_text || ""));
            if (data.contract.status === "active" || (data.contract.signed_by_a_at && data.contract.signed_by_b_at)) {
              setStep("preview");
            } else {
              setStep("passport");
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token, debtId]);

  function field<K extends keyof PassportData>(key: K, label: string, placeholder?: string, type: string = "text") {
    return (
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
        <input
          type={type}
          value={String(myPassport[key] || "")}
          onChange={e => setMyPassport(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
        />
      </div>
    );
  }

  async function savePassport(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${AUTH_URL}?action=update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          full_name: myPassport.full_name,
          passport_series: myPassport.passport_series,
          passport_number: myPassport.passport_number,
          passport_issued_by: myPassport.passport_issued_by,
          passport_issued_date: myPassport.passport_issued_date || null,
          passport_dept_code: myPassport.passport_dept_code,
          birth_date: myPassport.birth_date || null,
          registration_address: myPassport.registration_address,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Не удалось сохранить данные");
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function createContract(): Promise<ContractRecord | null> {
    const body = {
      contract_type: "loan",
      debt_id: debtId,
      data: {
        amount: defaultAmount,
        amount_text: amountText,
        interest_rate: defaultInterest || 0,
        due_date: defaultDueDate,
        contract_date: new Date().toISOString().slice(0, 10),
        city,
      },
    };
    const res = await fetch(CONTRACTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Не удалось создать договор");
      return null;
    }
    const data = await res.json();
    const reload = await fetch(`${CONTRACTS_URL}?id=${data.id}`, { headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } });
    if (reload.ok) {
      const r = await reload.json();
      return r.contract as ContractRecord;
    }
    return null;
  }

  async function goToFields() {
    const ok = await savePassport();
    if (!ok) return;
    setStep("fields");
  }

  async function goToPreview() {
    setSaving(true);
    setError(null);
    try {
      let c = contract;
      if (!c) {
        c = await createContract();
        if (!c) return;
        setContract(c);
      } else {
        // обновим data
        const res = await fetch(`${CONTRACTS_URL}?id=${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            data: {
              ...c.data,
              amount: defaultAmount,
              amount_text: amountText,
              interest_rate: defaultInterest || 0,
              due_date: defaultDueDate,
              contract_date: c.data?.contract_date || new Date().toISOString().slice(0, 10),
              city,
            },
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "Не удалось сохранить");
          return;
        }
      }
      setStep("preview");
    } finally {
      setSaving(false);
    }
  }

  async function sign() {
    if (!contract) return;
    setSigning(true);
    setError(null);
    try {
      const res = await fetch(`${CONTRACTS_URL}?action=sign&id=${contract.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Не удалось подписать");
        return;
      }
      const data = await res.json();
      setContract(data.contract);
    } finally {
      setSigning(false);
    }
  }

  function downloadOrPrint() {
    if (!contract) return;
    const url = `${CONTRACTS_URL}?action=html&id=${contract.id}`;
    const win = window.open(url, "_blank");
    if (win) {
      setTimeout(() => { try { win.print(); } catch { /* ignore */ } }, 800);
    }
  }

  const iAmA = contract && contract.party_a_user_id === userId;
  const iAmB = contract && contract.party_b_user_id === userId;
  const mySigned = (iAmA && contract?.signed_by_a_at) || (iAmB && contract?.signed_by_b_at);
  const otherSigned = (iAmA && contract?.signed_by_b_at) || (iAmB && contract?.signed_by_a_at);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl animate-slide-up"
        style={{ background: "#1a1d2e", paddingBottom: "max(100px, calc(env(safe-area-inset-bottom) + 100px))" }}>
        <div className="sticky top-0 z-10 px-5 py-4 border-b border-white/10 flex items-center justify-between"
          style={{ background: "#1a1d2e" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(168,85,247,0.18)" }}>
              <Icon name="FileSignature" size={20} className="text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Договор займа</p>
              <p className="text-xs text-muted-foreground">
                {step === "passport" && "Шаг 1 из 3 · паспортные данные"}
                {step === "fields" && "Шаг 2 из 3 · условия договора"}
                {step === "preview" && "Шаг 3 из 3 · предпросмотр и подпись"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Icon name="Loader2" size={24} className="animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex gap-2 items-start">
                <Icon name="AlertCircle" size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {step === "passport" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Эти данные будут указаны в договоре. Они сохраняются в твоём профиле и подтянутся автоматически в следующий раз.
                </p>
                <div className="space-y-3">
                  {field("full_name", "ФИО полностью *", "Иванов Иван Иванович")}
                  <div className="grid grid-cols-2 gap-3">
                    {field("passport_series", "Серия паспорта *", "1234")}
                    {field("passport_number", "Номер паспорта *", "567890")}
                  </div>
                  {field("passport_issued_by", "Кем выдан *", "ОВД района ...")}
                  <div className="grid grid-cols-2 gap-3">
                    {field("passport_issued_date", "Дата выдачи *", undefined, "date")}
                    {field("passport_dept_code", "Код подразделения", "770-123")}
                  </div>
                  {field("birth_date", "Дата рождения", undefined, "date")}
                  {field("registration_address", "Адрес регистрации *", "г. Москва, ул. ...")}
                </div>
                <button
                  onClick={goToFields}
                  disabled={saving || !myPassport.full_name || !myPassport.passport_series || !myPassport.passport_number || !myPassport.registration_address}
                  className="w-full py-3 rounded-2xl font-semibold text-white text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
                >
                  {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <>Дальше <Icon name="ArrowRight" size={16} /></>}
                </button>
              </>
            )}

            {step === "fields" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Параметры долга подтянуты автоматически. Добавь город заключения и сумму прописью.
                </p>
                <div className="glass rounded-2xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Сумма:</span>
                    <span className="font-semibold text-foreground">{defaultAmount.toLocaleString("ru-RU")} ₽</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Срок возврата:</span>
                    <span className="font-semibold text-foreground">{defaultDueDate}</span>
                  </div>
                  {defaultInterest != null && defaultInterest > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Процент:</span>
                      <span className="font-semibold text-foreground">{defaultInterest}% годовых</span>
                    </div>
                  )}
                  {counterpartyName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Вторая сторона:</span>
                      <span className="font-semibold text-foreground">{counterpartyName}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Город заключения договора</label>
                  <input
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="Москва"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Сумма прописью</label>
                  <input
                    value={amountText}
                    onChange={e => setAmountText(e.target.value)}
                    placeholder="пятьдесят тысяч рублей"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep("passport")} className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10">
                    Назад
                  </button>
                  <button
                    onClick={goToPreview}
                    disabled={saving || !city}
                    className="flex-[2] py-3 rounded-2xl font-semibold text-white text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
                  >
                    {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <>Сформировать <Icon name="ArrowRight" size={16} /></>}
                  </button>
                </div>
              </>
            )}

            {step === "preview" && contract && (
              <>
                <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#fff" }}>
                  <iframe
                    title="Договор"
                    src={`${CONTRACTS_URL}?action=html&id=${contract.id}`}
                    className="w-full"
                    style={{ height: 460, border: 0, background: "#fff" }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                    <p className="text-muted-foreground mb-1">Займодавец</p>
                    <p className={`font-semibold ${contract.signed_by_a_at ? "text-emerald-400" : "text-amber-400"}`}>
                      {contract.signed_by_a_at ? "✓ Подписано" : "○ Ожидает"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                    <p className="text-muted-foreground mb-1">Заёмщик</p>
                    <p className={`font-semibold ${contract.signed_by_b_at ? "text-emerald-400" : "text-amber-400"}`}>
                      {contract.signed_by_b_at ? "✓ Подписано" : "○ Ожидает"}
                    </p>
                  </div>
                </div>

                {!mySigned ? (
                  <button
                    onClick={sign}
                    disabled={signing}
                    className="w-full py-3 rounded-2xl font-semibold text-white text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                  >
                    {signing ? <Icon name="Loader2" size={16} className="animate-spin" /> : <><Icon name="PenLine" size={16} /> Подписать электронно</>}
                  </button>
                ) : (
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm flex gap-2 items-start">
                    <Icon name="CheckCircle2" size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>
                      Ты подписал договор. {otherSigned ? "Договор полностью заключён." : "Ждём подпись второй стороны."}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep("fields")} disabled={!!mySigned} className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10 disabled:opacity-40">
                    Изменить
                  </button>
                  <button onClick={downloadOrPrint} className="flex-[2] py-3 rounded-2xl font-semibold text-foreground text-sm border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2">
                    <Icon name="Download" size={16} /> Скачать / Печать
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}