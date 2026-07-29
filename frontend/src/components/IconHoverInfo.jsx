import { useState } from "react";
import { createPortal } from "react-dom";

const toneColors = {
  amber: "#fbbf24",
  emerald: "#6ee7b7",
  rose: "#fda4af",
  slate: "#cbd5e1",
  teal: "#5eead4",
};

const IconHoverInfo = ({ children, label, tone = "slate", className = "" }) => {
  const [anchor, setAnchor] = useState(null);
  const showTooltip = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnchor({
      left: bounds.left + bounds.width / 2,
      top: bounds.top,
    });
  };

  return (
    <span
      className={`relative inline-flex ${className}`}
      onBlur={() => setAnchor(null)}
      onFocus={showTooltip}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setAnchor(null)}
    >
      {children}
      {anchor && typeof document !== "undefined" ? createPortal(
        <span
          className="pointer-events-none fixed z-[9999] inline-flex -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-slate-950 px-2 py-1 text-xs font-semibold shadow-lg"
          style={{
            borderColor: toneColors[tone] || toneColors.slate,
            color: toneColors[tone] || toneColors.slate,
            left: anchor.left,
            top: anchor.top - 4,
          }}
          role="tooltip"
        >
          {label}
        </span>,
        document.body,
      ) : null}
    </span>
  );
};

export default IconHoverInfo;
