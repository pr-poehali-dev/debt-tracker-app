import Icon from "@/components/ui/icon";

interface Props {
  onClose: () => void;
  disabled?: boolean;
  zIndex?: number;
}

export default function ModalCloseButton({ onClose, disabled, zIndex = 110 }: Props) {
  return (
    <button
      onClick={onClose}
      disabled={disabled}
      aria-label="Закрыть"
      className="fixed w-12 h-12 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center hover:bg-black/85 transition-colors shadow-2xl border-2 border-white/25 disabled:opacity-50"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        right: "12px",
        zIndex,
      }}
    >
      <Icon name="X" size={24} className="text-white" />
    </button>
  );
}
