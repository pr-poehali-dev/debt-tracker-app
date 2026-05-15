import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";

interface Props {
  onClose: () => void;
  disabled?: boolean;
  zIndex?: number;
}

export default function ModalCloseButton({ onClose, disabled, zIndex = 99999 }: Props) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <button
      onClick={onClose}
      disabled={disabled}
      aria-label="Закрыть"
      className="flex items-center justify-center disabled:opacity-50"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 70px)",
        right: "16px",
        width: "48px",
        height: "48px",
        borderRadius: "9999px",
        background: "rgba(0, 0, 0, 0.85)",
        border: "2px solid rgba(255, 255, 255, 0.4)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        zIndex,
        cursor: "pointer",
      }}
    >
      <Icon name="X" size={26} className="text-white" />
    </button>,
    document.body
  );
}