const toneColors = {
  amber: "#fbbf24",
  emerald: "#6ee7b7",
  rose: "#fda4af",
  slate: "#cbd5e1",
  teal: "#5eead4",
};

const IconHoverInfo = ({ children, label, tone = "slate", className = "" }) => (
  <span className={`group/icon-hint relative inline-flex ${className}`}>
    {children}
    <span
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-slate-950 px-2 py-1 text-xs font-semibold shadow-lg group-hover/icon-hint:inline-flex"
      style={{ borderColor: toneColors[tone] || toneColors.slate, color: toneColors[tone] || toneColors.slate }}
      role="tooltip"
    >
      {label}
    </span>
  </span>
);

export default IconHoverInfo;
