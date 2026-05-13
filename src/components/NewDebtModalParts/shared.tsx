import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";
import { getT, type Lang } from "@/i18n";
import func2url from "../../../backend/func2url.json";

export const API_URL = func2url["debts"];
export const AUTH_URL = func2url["auth"];

export function useT() {
  const saved = (typeof window !== "undefined" ? localStorage.getItem("df-lang") : null) as Lang | null;
  const lang: Lang = saved === "en" ? "en" : "ru";
  return { t: getT(lang), lang };
}

export function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#a855f7", light: "#13152a" },
    });
  }, [value, size]);
  return <canvas ref={canvasRef} className="rounded-2xl" style={{ width: size, height: size }} />;
}

export type AuthStep = "check_auth" | "phone" | "register" | "code" | "pin_login" | "set_pin" | "decision" | "done" | "rejected";

export function formatPhoneInput(raw: string): string {
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

export function phoneToE164Local(formatted: string): string {
  const d = formatted.replace(/\D/g, "");
  if (d.length !== 11) return "";
  return "+" + (d.startsWith("8") ? "7" + d.slice(1) : d);
}
