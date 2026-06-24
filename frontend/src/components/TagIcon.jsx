import { AlertTriangle, Badge, CircleDollarSign, Landmark, Sparkles } from "lucide-react";

const fallbackTagColor = "#64748b";

const categoryIcons = {
  mana: CircleDollarSign,
  transient: CircleDollarSign,
  state: Landmark,
  condition: AlertTriangle,
  domain: Badge,
};

const normalizeLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .trim()
    .toUpperCase();

const TagIcon = ({ tag, label, count = null, className = "" }) => {
  const color = tag?.color || fallbackTagColor;
  const text = normalizeLabel(tag?.name || label || tag?.id);
  const Icon = categoryIcons[String(tag?.category || "").toLowerCase()] || Sparkles;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md border bg-slate-950/60 px-2 py-1 text-xs font-semibold ${className}`}
      style={{ borderColor: color, color }}
      title={tag?.id || label || text}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
      {count !== null && count !== undefined ? <span className="text-[0.68rem]">x{count}</span> : null}
    </span>
  );
};

export default TagIcon;
