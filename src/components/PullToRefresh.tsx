import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  onRefresh: () => Promise<void> | void;
  refreshing?: boolean;
  children: React.ReactNode;
}

const TRIGGER = 70;
const MAX = 110;

export default function PullToRefresh({ onRefresh, refreshing, children }: Props) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    isRefreshingRef.current = !!refreshing;
    if (!refreshing && pull > 0) {
      setPull(0);
    }
  }, [refreshing, pull]);

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (isRefreshingRef.current) return;
    const scroller = findScrollParent(e.target as HTMLElement);
    const top = scroller ? scroller.scrollTop : window.scrollY;
    if (top > 0) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (startY.current === null || isRefreshingRef.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) { setPull(0); setDragging(false); return; }
    setDragging(true);
    const damped = Math.min(MAX, delta * 0.55);
    setPull(damped);
  }

  function onTouchEnd() {
    if (startY.current === null) return;
    const should = pull >= TRIGGER;
    startY.current = null;
    setDragging(false);
    if (should) {
      setPull(60);
      Promise.resolve(onRefresh()).finally(() => {});
    } else {
      setPull(0);
    }
  }

  const showSpinner = (refreshing || dragging) && pull > 0;
  const progress = Math.min(1, pull / TRIGGER);
  const ready = pull >= TRIGGER;

  return (
    <div
      ref={wrapRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ position: "relative", touchAction: dragging ? "none" : "pan-y" }}
    >
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          height: Math.max(0, pull),
          pointerEvents: "none",
          zIndex: 10,
          transition: dragging ? "none" : "height 0.25s ease",
        }}
      >
        {showSpinner && (
          <div
            style={{
              width: 38, height: 38, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(168,85,247,0.15)",
              border: "1px solid rgba(168,85,247,0.35)",
              boxShadow: ready ? "0 0 20px rgba(168,85,247,0.5)" : "none",
              transform: refreshing ? "none" : `rotate(${progress * 360}deg)`,
              transition: dragging ? "none" : "transform 0.2s ease, box-shadow 0.2s",
              opacity: Math.min(1, progress + 0.3),
            }}
          >
            <Icon
              name={refreshing ? "Loader2" : "ArrowDown"}
              size={18}
              className={refreshing ? "animate-spin text-purple-300" : "text-purple-300"}
            />
          </div>
        )}
      </div>
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: dragging ? "none" : "transform 0.25s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
