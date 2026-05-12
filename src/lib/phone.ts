/**
 * Утилиты для работы с телефонными номерами (РФ).
 * Приводят любые форматы (+7, 8, без кода, со скобками/пробелами/дефисами)
 * к единому каноническому виду +7XXXXXXXXXX.
 */

/** Извлекает только цифры из строки. */
export function digitsOnly(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Нормализует телефон РФ к виду +7XXXXXXXXXX.
 * Если номер не похож на валидный — возвращает исходную строку.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = digitsOnly(phone);
  if (!digits) return "";
  if (digits.length === 11 && digits[0] === "8") return "+7" + digits.slice(1);
  if (digits.length === 11 && digits[0] === "7") return "+" + digits;
  if (digits.length === 10) return "+7" + digits;
  return phone.trim();
}

/** Проверяет, является ли строка валидным телефоном РФ. */
export function isValidRuPhone(phone: string | null | undefined): boolean {
  const digits = digitsOnly(phone);
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) return true;
  if (digits.length === 10) return true;
  return false;
}

/**
 * Форматирует телефон для отображения: +7 (999) 123-45-67
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const digits = digitsOnly(phone);
  if (digits.length !== 11) return phone || "";
  const d = digits[0] === "8" ? "7" + digits.slice(1) : digits;
  return `+${d[0]} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}
