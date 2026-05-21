import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import urls from "../../backend/func2url.json";

export type Plan = "free" | "pro";

export interface SubscriptionLimits {
  max_active_debts: number;
  max_active_rentals: number;
  max_messages_per_chat: number;
}

export interface SubscriptionUsage {
  active_debts: number;
  active_rentals: number;
}

export interface PlanOption {
  code: string;
  title: string;
  subtitle: string;
  amount_rub: number;
  period_days: number;
  per_month_rub: number;
  badge: string | null;
}

export interface SubscriptionInfo {
  plan: Plan;
  source: string;
  expires_at: string | null;
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  price_rub: number;
  plans?: PlanOption[];
}

interface SubscriptionContextValue {
  info: SubscriptionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  isPro: boolean;
  showPaywall: (reason?: PaywallReason | null) => void;
  paywallReason: PaywallReason | null;
  hidePaywall: () => void;
}

export interface PaywallReason {
  type: "debts" | "rentals" | "messages" | "manual";
  message?: string;
  limit?: number;
  current?: number;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setInfo(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(urls["subscriptions"], {
        headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as SubscriptionInfo;
        setInfo(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showPaywall = useCallback((reason?: PaywallReason | null) => {
    setPaywallReason(reason || { type: "manual" });
  }, []);

  const hidePaywall = useCallback(() => setPaywallReason(null), []);

  const value = useMemo<SubscriptionContextValue>(() => ({
    info,
    loading,
    refresh,
    isPro: info?.plan === "pro",
    showPaywall,
    paywallReason,
    hidePaywall,
  }), [info, loading, refresh, showPaywall, paywallReason, hidePaywall]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}

/** Парсит ответ 402 limit_reached и возвращает PaywallReason или null. */
export async function parseLimitError(res: Response): Promise<PaywallReason | null> {
  if (res.status !== 402) return null;
  try {
    const data = await res.json();
    if (data?.error === "limit_reached" && data?.limit_type) {
      return {
        type: data.limit_type as PaywallReason["type"],
        message: data.message,
        limit: data.limit,
        current: data.current,
      };
    }
  } catch { /* ignore */ }
  return null;
}