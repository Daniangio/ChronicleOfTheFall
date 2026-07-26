import { Archive, Grid2X2, Hand, Scale } from "lucide-react";
import TagIcon from "./TagIcon.jsx";

const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");

const countRepeatedTags = (value) => {
  if (Array.isArray(value)) {
    return value.reduce((counts, tagId) => {
      if (!tagId) return counts;
      return { ...counts, [tagId]: Number(counts[tagId] || 0) + 1 };
    }, {});
  }
  return value || {};
};

const tagEntries = (value) => {
  if (Array.isArray(value)) return value.map((tagId) => [tagId, null]);
  return Object.entries(value || {});
};

const IconPill = ({ children, title, tone = "slate", compact = false }) => {
  const toneClass = tone === "amber"
    ? "border-amber-700 text-amber-200"
    : tone === "teal"
      ? "border-teal-700 text-teal-200"
      : "border-slate-700 text-slate-300";
  return (
    <span className={`inline-flex items-center justify-center rounded-md border ${compact ? "h-6 min-w-6 px-1" : "h-7 min-w-7 px-2"} text-[0.65rem] font-semibold ${toneClass}`} title={title}>
      {children}
    </span>
  );
};

const ResourceIcons = ({ resources = {}, tagLookup, compact = false }) => (
  <>
    {Object.entries(countRepeatedTags(resources)).filter(([tagId]) => tagId).map(([tagId, count]) => (
      <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={count} size={compact ? "xs" : "sm"} />
    ))}
  </>
);

const CardVisual = ({
  card,
  tagLookup = {},
  exhausted = false,
  canExhaust = false,
  onExhaust,
  canPropose = false,
  onPropose,
  canAct = false,
  actionLabel = "",
  onAction,
  disabled = false,
  size = "table",
  className = "",
  pillarLookup = {},
  tokenLookup = {},
  storageIconSrc = "",
}) => {
  const data = card?.data || {};
  const cost = data.cost || {};
  const requiredTags = data.required_tags || {};
  const tags = data.tags || {};
  const production = data.production || {};
  const onBuildEffects = Array.isArray(data.on_build_effects) ? data.on_build_effects : [];
  const persistentEffects = Array.isArray(data.persistent_effects) ? data.persistent_effects : [];
  const storageEffects = persistentEffects.filter((effect) => effect.effect_type === "storage");
  const slotEffects = persistentEffects.filter((effect) => effect.effect_type === "add_building_slots");
  const compact = size === "hand";
  const widthClass = compact ? "w-[clamp(9rem,13vw,11rem)]" : "w-[clamp(10.5rem,12vw,13rem)]";

  return (
    <article
      className={`relative flex aspect-[5/7] ${widthClass} shrink-0 flex-col rounded-lg border bg-stone-950/95 p-2 shadow-xl ${
        exhausted ? "border-amber-500/80 opacity-70" : "border-amber-900/80"
      } ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-amber-700/70" />
      <div className="grid grid-cols-[4.4rem_minmax(0,1fr)] gap-1">
        <div className="grid max-h-[5.8rem] grid-flow-col grid-rows-4 content-start justify-start gap-0.5">
          {Object.entries(cost).flatMap(([tagId, count]) => (
            Array.from({ length: Math.max(1, Number(count) || 1) }).map((_, index) => (
              <TagIcon key={`${tagId}-${index}`} tag={tagLookup[normalize(tagId)]} label={tagId} size="xs" />
            ))
          ))}
          {Object.entries(requiredTags).flatMap(([tagId, count]) => (
            Array.from({ length: Math.max(1, Number(count) || 1) }).map((_, index) => (
              <span key={`required-${tagId}-${index}`} className="rounded-full ring-1 ring-amber-300/80" title={`Requires ${tagId} in city`}>
                <TagIcon tag={tagLookup[normalize(tagId)]} label={tagId} size="xs" />
              </span>
            ))
          ))}
        </div>
        <div className="min-w-0 text-right">
          <h3 className="line-clamp-2 text-[0.78rem] font-bold leading-tight text-amber-50">{card?.name || "Unknown Card"}</h3>
          <p className="mt-0.5 truncate text-[0.55rem] uppercase text-amber-700">{card?.category || "card"}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
        {card?.summary ? <p className="line-clamp-3 text-center text-[0.62rem] leading-5 text-stone-300">{card.summary}</p> : null}
      </div>

      {tagEntries(tags).length ? (
        <div className="mb-2 flex min-h-10 flex-wrap items-center justify-center gap-1 rounded-md border border-amber-900/50 bg-amber-950/25 px-1.5 py-1">
          {tagEntries(tags).flatMap(([tagId, count]) => (
            Array.from({ length: Math.max(1, Number(count) || 1) }).map((_, index) => (
              <TagIcon key={`${tagId}-${index}`} tag={tagLookup[normalize(tagId)]} label={tagId} size={compact ? "xs" : "sm"} />
            ))
          ))}
        </div>
      ) : null}

      {storageEffects.length || slotEffects.length || onBuildEffects.length ? (
        <div className="mb-1 flex flex-wrap items-center justify-center gap-1">
          {storageEffects.map((effect, index) => {
            const amount = Number(effect.payload?.amount || 1);
            const resourceId = effect.payload?.resource_id || "";
            return (
            <IconPill
              key={`storage-${index}`}
              title={`Stores ${amount} ${resourceId || "resources"}`}
              tone="teal"
              compact={compact}
            >
              {storageIconSrc ? (
                <img alt="" className={compact ? "h-3.5 w-3.5 object-contain" : "h-4 w-4 object-contain"} src={storageIconSrc} />
              ) : (
                <Archive className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
              )}
              <span className="ml-1">{amount}</span>
              {resourceId ? (
                <span className="ml-1">
                  <TagIcon tag={tagLookup[normalize(resourceId)]} label={resourceId} size="xs" />
                </span>
              ) : null}
            </IconPill>
            );
          })}
          {slotEffects.map((effect, index) => (
            <IconPill key={`slots-${index}`} title={`Adds ${Number(effect.payload?.amount || 1)} building slots`} tone="teal" compact={compact}>
              <Grid2X2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
              <span className="ml-1">+{Number(effect.payload?.amount || 1)}</span>
            </IconPill>
          ))}
          {onBuildEffects.map((effect, index) => {
            const pillarId = effect.payload?.pillar_id;
            const tokenId = effect.payload?.token_id;
            const amount = Number(effect.payload?.amount || 0);
            if (effect.effect_type === "modify_token") {
              return (
                <IconPill
                  key={`token-${tokenId}-${index}`}
                  title={`${amount >= 0 ? "Add" : "Remove"} ${Math.abs(amount)} ${tokenLookup[normalize(tokenId)]?.name || tokenId} when built`}
                  tone={amount >= 0 ? "teal" : "amber"}
                  compact={compact}
                >
                  <TagIcon tag={tokenLookup[normalize(tokenId)]} label={tokenId} size="xs" />
                  <span className="ml-1">{amount >= 0 ? `+${amount}` : amount}</span>
                </IconPill>
              );
            }
            return (
              <IconPill
                key={`${pillarId}-${index}`}
                title={`${amount >= 0 ? "+" : ""}${amount} ${pillarLookup[normalize(pillarId)]?.name || pillarId} when built`}
                tone={amount >= 0 ? "teal" : "amber"}
                compact={compact}
              >
                <Scale className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
                <span className="ml-1">{amount >= 0 ? `+${amount}` : amount}</span>
              </IconPill>
            );
          })}
        </div>
      ) : null}

      {Object.keys(production).length ? (
        <div className="mb-1 flex min-h-7 flex-wrap items-center justify-center gap-1 border-t border-teal-900/50 pt-1" title="Production">
          <ResourceIcons resources={production} tagLookup={tagLookup} compact={compact} />
        </div>
      ) : null}

      <div className="min-h-2 border-t border-amber-900/50 pt-1" />

      {canPropose ? (
        <button
          className="mt-2 inline-flex items-center justify-center gap-1 rounded-md bg-amber-300 px-2 py-1.5 text-[0.68rem] font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-60"
          disabled={disabled}
          onClick={onPropose}
          type="button"
        >
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          Project
        </button>
      ) : null}
      {canAct ? (
        <button
          className="mt-2 inline-flex items-center justify-center gap-1 rounded-md bg-amber-300 px-2 py-1.5 text-[0.68rem] font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-60"
          disabled={disabled}
          onClick={onAction}
          type="button"
        >
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          {actionLabel || "Choose"}
        </button>
      ) : null}
    </article>
  );
};

export default CardVisual;
