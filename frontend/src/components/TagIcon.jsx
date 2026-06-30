import { AlertTriangle, Badge, CircleDollarSign, Landmark, Sparkles } from "lucide-react";
import { buildApiUrl } from "../utils/connection.js";

const fallbackTagColor = "#64748b";

const categoryIcons = {
  mana: CircleDollarSign,
  transient: CircleDollarSign,
  state: Landmark,
  condition: AlertTriangle,
  jurisdiction: Badge,
};

const normalizeLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .trim()
    .toUpperCase();

const assetSrc = (value) => {
  const src = String(value || "");
  if (!src || src.startsWith("data:") || /^https?:\/\//i.test(src)) return src;
  return buildApiUrl(src);
};

const sizeClasses = {
  xs: "h-5 w-5",
  sm: "h-7 w-7",
  md: "h-12 w-12",
  lg: "h-14 w-14",
};

const fallbackSizeClasses = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

const TagIcon = ({ tag, label, count = null, className = "", size = "md" }) => {
  const color = tag?.color || fallbackTagColor;
  const text = normalizeLabel(tag?.name || label || tag?.id);
  const Icon = categoryIcons[String(tag?.category || "").toLowerCase()] || Sparkles;
  const icon = assetSrc(tag?.data?.icon || "");
  const numericCount = Number(count);
  const iconCount = Number.isFinite(numericCount) && numericCount > 0 ? Math.min(12, Math.floor(numericCount)) : 1;
  const countLabel = count !== null && count !== undefined && String(count) !== "1" ? String(count) : "";
  const iconSize = sizeClasses[size] || sizeClasses.md;
  const fallbackIconSize = fallbackSizeClasses[size] || fallbackSizeClasses.md;

  if (icon) {
    return (
      <span className={`group relative inline-flex items-center gap-0.5 ${className}`}>
        {Array.from({ length: iconCount }).map((_, index) => (
          <img key={index} alt="" className={`${iconSize} shrink-0 object-contain`} src={icon} />
        ))}
        <span className="sr-only">{[text, countLabel].filter(Boolean).join(" ")}</span>
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-slate-950 px-2 py-1 text-xs font-semibold shadow-lg group-hover:inline-flex"
          style={{ borderColor: color, color }}
        >
          {text}{countLabel ? ` ${countLabel}` : ""}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md border bg-slate-950/60 px-2 py-1 text-xs font-semibold ${className}`}
      style={{ borderColor: color, color }}
      title={[text, countLabel].filter(Boolean).join(" ")}
    >
      <Icon className={`${fallbackIconSize} shrink-0`} aria-hidden="true" />
      <span className="truncate">{text}</span>
      {countLabel ? <span className="text-[0.68rem]">{countLabel}</span> : null}
    </span>
  );
};

export default TagIcon;
