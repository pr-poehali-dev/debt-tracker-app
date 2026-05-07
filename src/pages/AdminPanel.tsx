import { useEffect, useState } from "react";
import func2url from "../../backend/func2url.json";

interface AdminStats {
  total_users: number;
  active_sessions: number;
  total_debts: number;
  users: { id: number; full_name: string; email: string; created_at: string }[];
}

interface Props {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("df-token");
    fetch(func2url["admin-stats"], {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Нет доступа");
        return r.json();
      })
      .then((data) => {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        setStats(parsed);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0f1a",
        color: "#e2ddf5",
        fontFamily: "Golos Text, sans-serif",
        padding: "24px 16px",
      }}
    >
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <button
            onClick={onBack}
            style={{
              background: "rgba(168,85,247,0.15)",
              border: "1px solid rgba(168,85,247,0.3)",
              color: "#a855f7",
              borderRadius: 10,
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ← Назад
          </button>
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                fontFamily: "Montserrat, sans-serif",
                background: "linear-gradient(135deg, #a855f7, #6366f1)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Админ-панель
            </div>
            <div style={{ fontSize: 13, color: "rgba(180,170,210,0.5)", marginTop: 2 }}>
              Статистика приложения
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "rgba(180,170,210,0.5)", marginTop: 60 }}>
            Загружаю данные...
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 12,
              padding: 20,
              color: "#f87171",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {stats && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
                marginBottom: 32,
              }}
            >
              {[
                { label: "Пользователей", value: stats.total_users, color: "#a855f7" },
                { label: "Активных сессий", value: stats.active_sessions, color: "#6366f1" },
                { label: "Долгов", value: stats.total_debts, color: "#8b5cf6" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    padding: "20px 16px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      color: item.color,
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    {item.value}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(180,170,210,0.5)", marginTop: 4 }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                Список пользователей
              </div>
              {stats.users.length === 0 ? (
                <div
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: "rgba(180,170,210,0.4)",
                  }}
                >
                  Пользователей пока нет
                </div>
              ) : (
                stats.users.map((u, i) => (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 20px",
                      borderBottom:
                        i < stats.users.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #a855f7, #6366f1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {(u.full_name || u.email)[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {u.full_name || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(180,170,210,0.5)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {u.email}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(180,170,210,0.35)",
                        flexShrink: 0,
                      }}
                    >
                      {new Date(u.created_at).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
