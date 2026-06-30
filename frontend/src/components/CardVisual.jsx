import { Hand, RotateCcw, ScrollText, Zap } from "lucide-react";
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

const manualActionNode = (data = {}) => (data.logic_nodes || []).find((entry) => ["manual", "manual_action"].includes(entry?.trigger));

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

const EffectIcons = ({ effects = [], tagLookup, compact = false }) => (
  <>
    {effects.flatMap((effect, index) => {
      const payload = effect?.payload || {};
      if (effect?.effect_type === "add_resources" || effect?.effect_type === "modify_mana") {
        const resources = effect.effect_type === "modify_mana"
          ? { [payload.mana_type || payload.tag_id]: Number(payload.amount || 1) }
          : countRepeatedTags(payload.resources || payload.mana);
        return Object.entries(resources).filter(([tagId]) => tagId).map(([tagId, count]) => (
          <TagIcon key={`${index}-${tagId}`} tag={tagLookup[normalize(tagId)]} label={tagId} count={count} size={compact ? "xs" : "sm"} />
        ));
      }
      if (effect?.effect_type === "draw_card") {
        return (
          <IconPill key={index} title={`Draw ${Number(payload.amount || 1)} card(s)`} compact={compact}>
            <ScrollText className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
            {Number(payload.amount || 1) > 1 ? <span className="ml-1">{Number(payload.amount || 1)}</span> : null}
          </IconPill>
        );
      }
      if (effect?.effect_type === "ready_building") {
        return (
          <IconPill key={index} title="Ready a building" tone="teal" compact={compact}>
            <RotateCcw className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
          </IconPill>
        );
      }
      return [];
    })}
  </>
);

const RequirementIcons = ({ requirements = [], tagLookup, compact = false }) => {
  if (!requirements.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {requirements.map((requirement, index) => {
        if (requirement?.type === "not_condition") {
          return (
            <span key={index} className="inline-flex items-center gap-1 rounded-md border border-rose-800/80 bg-rose-950/40 px-1.5 py-0.5 text-[0.58rem] font-bold text-rose-200">
              NO
              <TagIcon tag={tagLookup[normalize(requirement.tag_id)]} label={requirement.tag_id} size={compact ? "xs" : "sm"} />
            </span>
          );
        }
        return (
          <span key={index} className="rounded-md border border-slate-700/80 bg-slate-950/70 px-1.5 py-1 text-[0.58rem] font-bold uppercase text-slate-300">
            HAS {String(requirement.card_id || requirement.scope || "card").replace(/[-_]+/g, " ")}
          </span>
        );
      })}
    </div>
  );
};

const CardVisual = ({
  card,
  tagLookup = {},
  exhausted = false,
  canExhaust = false,
  onExhaust,
  canPropose = false,
  onPropose,
  disabled = false,
  size = "table",
  className = "",
}) => {
  const data = card?.data || {};
  const cost = data.cost || {};
  const requiredCityTags = data.required_city_tags || {};
  const tags = data.tags || {};
  const manualNode = manualActionNode(data);
  const preconditions = manualNode?.preconditions || {};
  const effects = manualNode?.effects || [];
  const preconditionTags = countRepeatedTags(preconditions.empire_tags || preconditions.required_empire_tags);
  const compact = size === "hand";
  const widthClass = compact ? "w-[clamp(9rem,13vw,11rem)]" : "w-[clamp(10.5rem,12vw,13rem)]";

  const effectStrip = (
    <div className="flex min-h-8 flex-wrap items-center justify-center gap-1 border-t border-amber-900/50 pt-2">
      {Object.entries(preconditionTags).map(([tagId, count]) => (
        <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={count} size={compact ? "xs" : "sm"} />
      ))}
      {preconditions.exhaust ? (
        <IconPill title={exhausted ? "Exhausted" : "Exhaust"} tone="amber" compact={compact}>
          <Zap className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
        </IconPill>
      ) : null}
      {(Object.keys(preconditionTags).length || preconditions.exhaust) && effects.length ? <span className="text-xs font-semibold text-amber-700">:</span> : null}
      <EffectIcons effects={effects} tagLookup={tagLookup} compact={compact} />
    </div>
  );

  return (
    <article
      className={`relative flex aspect-[5/7] ${widthClass} shrink-0 flex-col overflow-hidden rounded-lg border bg-stone-950/95 p-2 shadow-xl ${
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
          {Object.entries(requiredCityTags).flatMap(([tagId, count]) => (
            Array.from({ length: Math.max(1, Number(count) || 1) }).map((_, index) => (
              <span key={`required-${tagId}-${index}`} className="rounded-full ring-1 ring-amber-300/80" title={`Requires ${tagId} in city`}>
                <TagIcon tag={tagLookup[normalize(tagId)]} label={tagId} size="xs" />
              </span>
            ))
          ))}
        </div>
        <div className="min-w-0 text-right">
          <h3 className="line-clamp-2 text-[0.78rem] font-bold leading-tight text-amber-50">{card?.name || "Unknown Card"}</h3>
          <p className="mt-0.5 truncate text-[0.55rem] uppercase text-amber-700">{data.card_type || card?.category || "card"}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
        <RequirementIcons requirements={Array.isArray(data.requirements) ? data.requirements : []} tagLookup={tagLookup} compact={compact} />
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

      {effects.length ? (
        canExhaust ? (
          <button
            className="rounded-md text-left transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || exhausted}
            onClick={onExhaust}
            type="button"
          >
            {effectStrip}
          </button>
        ) : effectStrip
      ) : <div className="min-h-8 border-t border-amber-900/50 pt-2" />}

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
    </article>
  );
};

export default CardVisual;
