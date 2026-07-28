import { Archive, ArrowRight, CirclePlus, Coins, Flame, Grid2X2, Hammer, HeartPulse, RotateCcw, ScrollText, Shield, ShieldX, Zap } from "lucide-react";
import CardVisual from "./CardVisual.jsx";
import TagIcon from "./TagIcon.jsx";
import { buildAssetUrl } from "../utils/connection.js";

const fallbackColor = "#64748b";
const tagKeyNames = new Set([
  "tags",
  "cost",
  "required_tags",
  "production",
  "infrastructure_resources",
  "local_tags",
  "global_tags",
  "replacement_effects",
]);

const normalizeTagId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const withResolvedTagIcon = (tag, imageLookup = {}) => {
  const imageId = tag?.data?.icon_image_id;
  const imageSrc = imageLookup?.[imageId]?.data?.src;
  if (!imageSrc || tag?.data?.icon) return tag;
  return { ...tag, data: { ...(tag.data || {}), icon: imageSrc } };
};

const buildTagLookup = (tags = [], imageLookup = {}) =>
  Object.fromEntries((tags || []).map((tag) => [normalizeTagId(tag.id || tag.name), withResolvedTagIcon(tag, imageLookup)]));

const ministrySymbol = (ministry) => ministry?.data?.symbol || "";

const assetSrc = (value) => {
  return buildAssetUrl(value);
};

const ministryIcon = (ministry, imageLookup) => {
  const imageId = ministry?.data?.icon_image_id;
  return assetSrc(ministry?.data?.icon || imageLookup?.[imageId]?.data?.src || "");
};

const catalogIcon = (entry, imageLookup) => {
  const imageId = entry?.data?.icon_image_id || entry?.data?.image_id;
  return assetSrc(entry?.data?.icon || entry?.data?.image || imageLookup?.[imageId]?.data?.src || "");
};

const effectFallbackIcon = (effectType) => ({
  modify_pillar: ShieldX,
  modify_resources: Coins,
  convert_resources: ArrowRight,
  draw_card: ScrollText,
  destroy_building: Hammer,
  remove_all_resources: Coins,
  discard_cards: ScrollText,
  modify_plague: HeartPulse,
  modify_unrest: Flame,
  modify_fortified: Shield,
  suppress_plague_morale: HeartPulse,
  waive_next_structure_tag_requirement: CirclePlus,
  add_building_slots: Grid2X2,
  storage: Archive,
  modify_token: CirclePlus,
}[effectType] || Zap);

const humanizeKey = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const primitiveText = (value) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const smallIconSizes = {
  xs: "h-5 w-5",
  sm: "h-7 w-7",
  md: "h-12 w-12",
};

const SmallIcon = ({ src, fallback, label, tone = "slate", size = "md" }) => {
  const toneClass = tone === "rose"
    ? "border-rose-800/70 text-rose-200"
    : tone === "emerald"
      ? "border-emerald-800/70 text-emerald-200"
      : tone === "amber"
        ? "border-amber-800/70 text-amber-200"
        : "border-slate-700 text-slate-300";
  const Fallback = fallback;
  const iconSize = smallIconSizes[size] || smallIconSizes.md;
  return (
    <span>
      {src ? <img alt="" className={`${iconSize} object-contain`} src={src} /> : Fallback ? <Fallback className={size === "xs" ? "h-3.5 w-3.5" : size === "sm" ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" /> : String(label || "").slice(0, 3).toUpperCase()}
    </span>
  );
};

const TagValue = ({ value, tagLookup }) => {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item) => {
          const tag = tagLookup[normalizeTagId(item)];
          return <TagIcon key={String(item)} tag={tag} label={item} />;
        })}
      </div>
    );
  }

  if (value && typeof value === "object") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(value).map(([tagId, count]) => {
          const tag = tagLookup[normalizeTagId(tagId)];
          return <TagIcon key={tagId} tag={tag} label={tagId} count={count} />;
        })}
      </div>
    );
  }

  return <TagIcon tag={tagLookup[normalizeTagId(value)]} label={value} />;
};

const RequirementValue = ({ value, tagLookup, cardLookup }) => {
  const requirements = Array.isArray(value) ? value : [];
  if (!requirements.length) return <span className="text-slate-600">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {requirements.map((requirement, index) => {
        if (requirement?.type === "not_condition") {
          const tag = tagLookup[normalizeTagId(requirement.tag_id)];
          return (
            <span key={`${requirement.type}-${requirement.tag_id}-${index}`} className="inline-flex items-center gap-1">
              <span className="rounded-md border border-rose-700 px-2 py-1 text-xs font-semibold text-rose-300">NO</span>
              <TagIcon tag={tag} label={requirement.tag_id} />
            </span>
          );
        }
        if (requirement?.type === "has_card") {
          const card = cardLookup[normalizeTagId(requirement.card_id)];
          return (
            <span
              key={`${requirement.type}-${requirement.card_id}-${index}`}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs font-semibold text-slate-300"
            >
              HAS {(card?.name || requirement.card_id || "").toUpperCase()} · {(requirement.scope || "city").toUpperCase()}
            </span>
          );
        }
        return (
          <span key={index} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">
            {primitiveText(requirement)}
          </span>
        );
      })}
    </div>
  );
};

const ReplacementEffectsValue = ({ value, tagLookup }) => {
  const effects = Array.isArray(value) ? value : [];
  if (!effects.length) return <span className="text-slate-600">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {effects.map((effect, index) => {
        const tag = tagLookup[normalizeTagId(effect?.tag_id)];
        return (
          <span key={index} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
            {(effect?.scope || "target").toUpperCase()}
            <TagIcon tag={tag} label={effect?.tag_id} count={effect?.amount || null} />
          </span>
        );
      })}
    </div>
  );
};

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

const LogicIconPill = ({ children, title, tone = "slate" }) => {
  const toneClass = tone === "amber"
    ? "border-amber-700 text-amber-200"
    : tone === "teal"
      ? "border-teal-700 text-teal-200"
      : "border-slate-700 text-slate-300";
  return (
    <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold ${toneClass}`} title={title}>
      {children}
    </span>
  );
};

const LogicNodeValue = ({ value, tagLookup }) => {
  const nodes = Array.isArray(value) ? value : [];
  if (!nodes.length) return <span className="text-slate-600">None</span>;
  return (
    <div className="space-y-2">
      {nodes.map((node, nodeIndex) => {
        const preconditions = node.preconditions || {};
        const preconditionTags = countRepeatedTags(preconditions.empire_tags || preconditions.required_empire_tags);
        return (
          <div key={nodeIndex} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(preconditionTags).map(([tagId, count]) => (
                <TagIcon key={tagId} tag={tagLookup[normalizeTagId(tagId)]} label={tagId} count={count} />
              ))}
              {preconditions.exhaust ? (
                <LogicIconPill title="Exhaust" tone="amber">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                </LogicIconPill>
              ) : null}
              {!Object.keys(preconditionTags).length && !preconditions.exhaust ? (
                <span className="text-xs text-slate-600">None</span>
              ) : null}
            </div>
            <span className="text-sm font-semibold text-slate-500">:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(node.effects || []).map((effect, effectIndex) => {
                if (effect.effect_type === "add_resources") {
                  return Object.entries(countRepeatedTags(effect.payload?.resources || effect.payload?.mana)).map(([tagId, count]) => (
                    <TagIcon key={`${effectIndex}-${tagId}`} tag={tagLookup[normalizeTagId(tagId)]} label={tagId} count={count} />
                  ));
                }
                if (effect.effect_type === "draw_card") {
                  return (
                    <LogicIconPill key={effectIndex} title={`Draw ${Number(effect.payload?.amount || 1)} card(s)`}>
                      <ScrollText className="h-4 w-4" aria-hidden="true" />
                      {Number(effect.payload?.amount || 1) > 1 ? <span className="ml-1">{Number(effect.payload?.amount || 1)}</span> : null}
                    </LogicIconPill>
                  );
                }
                if (effect.effect_type === "ready_building") {
                  return (
                    <LogicIconPill key={effectIndex} title="Ready a building" tone="teal">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </LogicIconPill>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const DataValue = ({ itemKey, value, tagLookup, cardLookup, groupLookup }) => {
  if (itemKey === "logic_nodes") {
    return <LogicNodeValue value={value} tagLookup={tagLookup} />;
  }
  if (itemKey === "requirements") {
    return <RequirementValue value={value} tagLookup={tagLookup} cardLookup={cardLookup} />;
  }
  if (itemKey === "replacement_effects") {
    return <ReplacementEffectsValue value={value} tagLookup={tagLookup} />;
  }
  if (itemKey === "mutually_exclusive_group") {
    const group = groupLookup[normalizeTagId(value)];
    return (
      <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs font-semibold text-slate-300">
        {(group?.name || value || "").toUpperCase()}
      </span>
    );
  }
  if (tagKeyNames.has(itemKey)) return <TagValue value={value} tagLookup={tagLookup} />;

  if (Array.isArray(value) && value.every((item) => tagLookup[normalizeTagId(item)])) {
    return <TagValue value={value} tagLookup={tagLookup} />;
  }

  if (typeof value === "string" && tagLookup[normalizeTagId(value)]) {
    return <TagValue value={value} tagLookup={tagLookup} />;
  }

  return <span className="text-slate-300">{primitiveText(value)}</span>;
};

const MinisterAbilities = ({ entry, tagLookup }) => {
  const data = entry?.data || {};
  const identity = `${data.role || ""} ${entry?.id || ""} ${entry?.name || ""}`.toLowerCase();
  const role = data.role
    || (identity.includes("empire") ? "empire"
      : identity.includes("cities") || identity.includes("infrastructure") ? "cities"
        : identity.includes("state") ? "state"
          : identity.includes("health") || identity.includes("harvest") ? "health"
            : identity.includes("war") ? "war"
              : "");
  const abilitiesByRole = {
    empire: [
      "Leads turn order and breaks ties.",
      "Decides for a missing Minister.",
      "Chooses the order of simultaneous effects.",
    ],
    cities: [
      "Places all Buildings and Cities.",
      "Chooses which leftover resources the Empire stores.",
    ],
    state: ["Draws up to two cards during Cleanup without exceeding the hand limit."],
    health: ["Cannot be forced to discard cards from hand or Scheme Slots."],
    war: ["May add +1 Crisis defense, or +2 while the Empire has a Military tag, once per Era."],
  };
  const abilities = abilitiesByRole[role] || [];

  if (!abilities.length) {
    return <p className="mt-4 text-sm text-slate-600">No Ministry office selected.</p>;
  }

  return (
    <div className="mt-4 space-y-2">
      {abilities.map((ability) => (
        <div key={ability} className="rounded-md border border-amber-900/60 bg-stone-950/40 px-3 py-2 text-sm text-amber-100">
          {ability}
        </div>
      ))}
    </div>
  );
};

const EventEffectIcon = ({ effectType, effectIconLookup, imageLookup, fallback, label, tone, size = "sm" }) => {
  const entry = effectIconLookup[normalizeTagId(effectType)];
  return <SmallIcon src={catalogIcon(entry, imageLookup)} fallback={fallback} label={label || entry?.name || effectType} tone={tone} size={size} />;
};

const EventEffectToken = ({ effect, eventMinistry, ministryLookup, effectIconLookup, pillarLookup, tagLookup, imageLookup }) => {
  const payload = effect?.payload || {};
  const amount = Number(payload.amount || 1);
  if (effect?.effect_type === "modify_pillar") {
    const pillar = pillarLookup[normalizeTagId(payload.pillar_id)];
    return (
      <span className="inline-flex items-center gap-1">
        <SmallIcon src={catalogIcon(pillar, imageLookup)} label={pillar?.name || payload.pillar || "Pillar"} tone={amount >= 0 ? "emerald" : "rose"} size="sm" />
        <span className={`text-xs font-bold ${amount >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{amount >= 0 ? `+${amount}` : amount}</span>
      </span>
    );
  }
  if (effect?.effect_type === "modify_resources") {
    const resource = tagLookup[normalizeTagId(payload.resource_id)];
    const healthMinistry = Object.values(ministryLookup).find((ministry) => {
      const identity = `${ministry?.id || ""} ${ministry?.name || ""} ${ministry?.data?.role || ""}`.toLowerCase();
      return identity.includes("health") || identity.includes("harvest");
    });
    return (
      <span className="inline-flex items-center gap-1">
        {!payload.resource_id ? (
          <SmallIcon src={ministryIcon(healthMinistry, imageLookup)} label={healthMinistry?.name || "Minister of Health & Harvest decides"} tone="amber" size="sm" />
        ) : null}
        {payload.resource_id ? (
          <TagIcon tag={resource} label={payload.resource_id} size="sm" />
        ) : (
          <EventEffectIcon effectType="modify_resources" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={Coins} label="Resource chosen by Health & Harvest" tone={amount >= 0 ? "emerald" : "rose"} />
        )}
        <span className={`text-xs font-bold ${amount >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{amount >= 0 ? `+${amount}` : amount}</span>
      </span>
    );
  }
  if (effect?.effect_type === "convert_resources") {
    const source = tagLookup[normalizeTagId(payload.source_resource_id)];
    const target = tagLookup[normalizeTagId(payload.target_resource_id)];
    return (
      <span className="inline-flex items-center gap-1">
        {payload.source_resource_id ? (
          <TagIcon tag={source} label={payload.source_resource_id} size="sm" />
        ) : (
          <EventEffectIcon effectType="convert_resources" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={Coins} label="Minister chooses source resource" tone="amber" />
        )}
        <ArrowRight className="h-4 w-4 text-amber-300" aria-hidden="true" />
        {payload.target_resource_id ? (
          <TagIcon tag={target} label={payload.target_resource_id} size="sm" />
        ) : (
          <EventEffectIcon effectType="convert_resources" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={Coins} label="Minister chooses destination resource" tone="amber" />
        )}
        <span className="text-xs font-bold text-amber-100">×{Math.max(1, amount)}</span>
      </span>
    );
  }
  if (effect?.effect_type === "draw_card") {
    const empireMinistry = Object.values(ministryLookup).find((ministry) => {
      const identity = `${ministry?.id || ""} ${ministry?.name || ""} ${ministry?.data?.role || ""}`.toLowerCase();
      return identity.includes("minister-of-the-empire")
        || identity.includes("minister of the empire")
        || ministry?.data?.is_minister_of_empire;
    });
    const drawingMinistry = eventMinistry || empireMinistry;
    return (
      <span className="inline-flex items-center gap-1">
        <SmallIcon src={ministryIcon(drawingMinistry, imageLookup)} label={drawingMinistry?.name || "Minister of the Empire"} tone="amber" size="sm" />
        <EventEffectIcon effectType="draw_card" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={ScrollText} label="Draw one card" tone="emerald" />
      </span>
    );
  }
  if (effect?.effect_type === "destroy_building") {
    return (
      <span className="inline-flex items-center gap-1">
        <EventEffectIcon effectType="destroy_building" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={Hammer} label="Destroy building" tone="rose" />
        {payload.tag_id ? <TagIcon tag={tagLookup[normalizeTagId(payload.tag_id)]} label={payload.tag_id} count={amount} size="sm" /> : null}
        {!payload.tag_id && amount > 1 ? <span className="text-xs font-bold text-rose-200">{amount}</span> : null}
      </span>
    );
  }
  if (effect?.effect_type === "remove_all_resources") {
    return (
      <span className="inline-flex items-center gap-1">
        <EventEffectIcon effectType="remove_all_resources" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={Coins} label="Remove all resources" tone="rose" />
      </span>
    );
  }
  if (effect?.effect_type === "discard_cards") {
    return (
      <span className="inline-flex items-center gap-1">
        <EventEffectIcon effectType="discard_cards" effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={ScrollText} label="Discard cards" tone="rose" />
        <span className="text-xs font-bold text-rose-200">{payload.amount == null ? "ALL" : amount}</span>
      </span>
    );
  }
  if (["modify_plague", "modify_unrest", "modify_fortified"].includes(effect?.effect_type)) {
    const fallback = effect.effect_type === "modify_plague" ? HeartPulse : effect.effect_type === "modify_unrest" ? Flame : Shield;
    return (
      <span className="inline-flex items-center gap-1">
        <EventEffectIcon effectType={effect.effect_type} effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={fallback} label={humanizeKey(effect.effect_type)} tone={amount >= 0 ? "emerald" : "rose"} />
        <span className={`text-xs font-bold ${amount >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{amount >= 0 ? `+${amount}` : amount}</span>
      </span>
    );
  }
  if (effect?.effect_type === "suppress_plague_morale") {
    return (
      <EventEffectIcon
        effectType="suppress_plague_morale"
        effectIconLookup={effectIconLookup}
        imageLookup={imageLookup}
        fallback={HeartPulse}
        label="Plague does not reduce Morale until the end of this Era"
        tone="emerald"
      />
    );
  }
  if (effect?.effect_type === "waive_next_structure_tag_requirement") {
    return (
      <EventEffectIcon
        effectType="waive_next_structure_tag_requirement"
        effectIconLookup={effectIconLookup}
        imageLookup={imageLookup}
        fallback={CirclePlus}
        label="Next Structure may ignore one required tag"
        tone="emerald"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <EventEffectIcon effectType={effect?.effect_type || "effect"} effectIconLookup={effectIconLookup} imageLookup={imageLookup} fallback={ShieldX} label={effect?.effect_type || "Effect"} />
    </span>
  );
};

const EventRequirementCost = ({ requirements, tagLookup, pillarLookup, imageLookup }) => {
  if (!requirements?.length) return <span className="text-[0.65rem] text-amber-800">No requirements</span>;
  return (
    <div className="flex max-w-[11rem] flex-wrap justify-end gap-1">
      {requirements.map((requirement, index) => requirement.type === "pillar" ? (
        <span key={index} className="inline-flex items-center gap-0.5 text-[0.58rem] font-bold text-amber-200">
          <SmallIcon src={catalogIcon(pillarLookup[normalizeTagId(requirement.pillar_id)], imageLookup)} fallback={ShieldX} label={requirement.pillar_id || "Pillar"} tone="amber" size="xs" />
          {{ gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" }[requirement.operator] || ">="}
          {Number(requirement.value || 0)}
        </span>
      ) : (
        Array.from({ length: Math.max(1, Number(requirement.amount) || 1) }).map((_, copyIndex) => (
          <TagIcon key={`${index}-${copyIndex}`} tag={tagLookup[normalizeTagId(requirement.item_id)]} label={requirement.item_id} size="xs" />
        ))
      ))}
    </div>
  );
};

const EventEffectRow = ({ title, effects, tone, eventMinistry, ministryLookup, effectIconLookup, pillarLookup, tagLookup, imageLookup }) => {
  if (!effects?.length) return null;
  return (
    <div className={`min-h-[4.25rem] rounded-md border ${tone === "success" ? "border-emerald-900/70 bg-emerald-950/15" : "border-rose-900/70 bg-rose-950/15"} p-1.5`}>
      <p className={`mb-2 text-[0.65rem] font-bold uppercase tracking-normal ${tone === "success" ? "text-emerald-200" : "text-rose-200"}`}>{title}</p>
      <div className="flex flex-wrap gap-1">
        {effects.map((effect, index) => (
          <span key={index} className="inline-flex items-center gap-1" title={effect.condition ? "Conditional effect" : undefined}>
            {effect.condition ? (
              <>
                <span className="text-[0.58rem] font-bold uppercase text-amber-300">IF</span>
                {effect.condition.source_type === "pillar" ? (
                  <SmallIcon
                    src={catalogIcon(pillarLookup[normalizeTagId(effect.condition.source_id)], imageLookup)}
                    label={pillarLookup[normalizeTagId(effect.condition.source_id)]?.name || effect.condition.source_id}
                    tone="amber"
                    size="sm"
                  />
                ) : (
                  <TagIcon
                    tag={tagLookup[normalizeTagId(effect.condition.source_id)]}
                    label={effect.condition.source_id}
                    size="xs"
                  />
                )}
                <span className="text-[0.58rem] font-bold text-amber-200">
                  {{ gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" }[effect.condition.operator] || ">="}
                </span>
                {effect.condition.target_type === "tag" ? (
                  <TagIcon
                    tag={tagLookup[normalizeTagId(effect.condition.target_id)]}
                    label={effect.condition.target_id}
                    size="xs"
                  />
                ) : (
                  <span className="text-[0.58rem] font-bold text-amber-200">
                    {Number(effect.condition.amount || 0)}
                  </span>
                )}
                <span className="text-amber-800">:</span>
              </>
            ) : null}
            <EventEffectToken
              effect={effect}
              eventMinistry={eventMinistry}
              ministryLookup={ministryLookup}
              effectIconLookup={effectIconLookup}
              pillarLookup={pillarLookup}
              tagLookup={tagLookup}
              imageLookup={imageLookup}
            />
          </span>
        ))}
      </div>
    </div>
  );
};

const EventCardVisual = ({ entry, eventMinistry, ministryLookup, effectIconLookup, pillarLookup, tagLookup, imageLookup, actions }) => {
  const data = entry?.data || {};
  const mainEffects = Array.isArray(data.main_effects) ? data.main_effects : [];
  const alternativeEffects = Array.isArray(data.alternative_effects) ? data.alternative_effects : [];
  return (
    <article className="flex aspect-[5/7] w-[clamp(12rem,16vw,15rem)] shrink-0 flex-col rounded-lg border border-amber-900/70 bg-stone-950 p-3 shadow-xl">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
        <div className="flex flex-col items-center gap-1">
          {eventMinistry ? (
            <SmallIcon
              src={ministryIcon(eventMinistry, imageLookup)}
              label={`${eventMinistry.name} handles this event's choices`}
              tone="amber"
              size="sm"
            />
          ) : null}
          <span className="text-[0.5rem] font-bold uppercase text-amber-500">{data.subtype || "event"}</span>
        </div>
        <div className="min-w-0 text-right">
          <h3 className="line-clamp-2 text-[0.82rem] font-bold leading-tight text-amber-50">{entry.name}</h3>
          <div className="mt-2 flex justify-end">
            <EventRequirementCost requirements={data.requirements || []} tagLookup={tagLookup} pillarLookup={pillarLookup} imageLookup={imageLookup} />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 pt-2">
        {entry.summary ? <p className="line-clamp-3 text-center text-[0.62rem] leading-4 text-stone-300">{entry.summary}</p> : null}
        {mainEffects.length || alternativeEffects.length ? (
          <div className={`grid gap-2 ${mainEffects.length && alternativeEffects.length ? "grid-cols-2" : ""}`}>
            <EventEffectRow title="Resolved" effects={mainEffects} tone="success" eventMinistry={eventMinistry} ministryLookup={ministryLookup} effectIconLookup={effectIconLookup} pillarLookup={pillarLookup} tagLookup={tagLookup} imageLookup={imageLookup} />
            <EventEffectRow title="Unresolved" effects={alternativeEffects} tone="failure" eventMinistry={eventMinistry} ministryLookup={ministryLookup} effectIconLookup={effectIconLookup} pillarLookup={pillarLookup} tagLookup={tagLookup} imageLookup={imageLookup} />
          </div>
        ) : null}
        {actions ? <div className="flex flex-wrap gap-2 border-t border-amber-900/40 pt-3">{actions}</div> : null}
      </div>
    </article>
  );
};

const CatalogItemVisual = ({ entry, tags = [], cards = [], groups = [], ministries = [], images = [], pillars = [], tokens = [], effectIcons = [], actions = null }) => {
  const color = entry?.color || fallbackColor;
  const cardLookup = Object.fromEntries((cards || []).map((card) => [normalizeTagId(card.id || card.name), card]));
  const groupLookup = Object.fromEntries((groups || []).map((group) => [normalizeTagId(group.id || group.name), group]));
  const imageLookup = Object.fromEntries((images || []).map((image) => [image.id, image]));
  const tagLookup = buildTagLookup(tags, imageLookup);
  const visualEntry = entry?.kind === "tags" ? withResolvedTagIcon(entry, imageLookup) : entry;
  const ministryLookup = Object.fromEntries((ministries || []).map((ministry) => [normalizeTagId(ministry.id || ministry.name), ministry]));
  const pillarLookup = Object.fromEntries((pillars || []).map((pillar) => [normalizeTagId(pillar.id || pillar.name), pillar]));
  const tokenLookup = Object.fromEntries((tokens || []).map((token) => [
    normalizeTagId(token.id || token.name),
    withResolvedTagIcon(token, imageLookup),
  ]));
  const effectIconLookup = Object.fromEntries((effectIcons || []).flatMap((effectIcon) => {
    const keys = [effectIcon.id, effectIcon.data?.effect_type].filter(Boolean).map(normalizeTagId);
    return keys.map((key) => [key, effectIcon]);
  }));
  const eventMinistry = (ministries || []).find((ministry) => ministry.id === visualEntry?.data?.ministry_id);
  const currentMinistryIcon = ministryIcon(visualEntry, imageLookup);
  const currentCatalogIcon = catalogIcon(visualEntry, imageLookup);
  const dataEntries = Object.entries(visualEntry?.data || {}).filter(([key]) => !["src", "icon", "image"].includes(key)).slice(0, 6);

  if (visualEntry.kind === "events") {
    return (
      <EventCardVisual
        entry={visualEntry}
        eventMinistry={eventMinistry}
        ministryLookup={ministryLookup}
        effectIconLookup={effectIconLookup}
        pillarLookup={pillarLookup}
        tagLookup={tagLookup}
        imageLookup={imageLookup}
        actions={actions}
      />
    );
  }

  if (visualEntry.kind === "cards") {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <CardVisual
          card={visualEntry}
          tagLookup={tagLookup}
          pillarLookup={pillarLookup}
          tokenLookup={tokenLookup}
          storageIconSrc={catalogIcon(effectIconLookup.storage, imageLookup)}
          size="table"
        />
        {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-white">{visualEntry.name}</h3>
              {visualEntry.kind === "tags" ? (
                <TagIcon tag={visualEntry} />
              ) : ["pillars", "tokens", "effect-icons"].includes(visualEntry.kind) ? (
                <SmallIcon
                  src={currentCatalogIcon}
                  fallback={visualEntry.kind === "effect-icons" ? effectFallbackIcon(visualEntry.data?.effect_type) : ShieldX}
                  label={entry.name}
                  tone="amber"
                />
              ) : entry.kind === "ministries" ? (
                <span className="inline-flex items-center gap-1 rounded bg-stone-950/70 px-2 py-1 text-xs font-medium text-amber-100">
                  {currentMinistryIcon ? (
                    <img alt="" className="h-7 w-7 object-contain" src={currentMinistryIcon} />
                  ) : (
                    <span className="font-semibold">{String(ministrySymbol(entry) || entry.category || "").slice(0, 3).toUpperCase()}</span>
                  )}
                  {String(ministrySymbol(entry) || "ministry").toUpperCase()}
                </span>
              ) : (
                <span className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
                  {entry.category || "uncategorized"}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{entry.id}</p>
          </div>
        </div>

        {entry.summary ? (
          <p className="mt-3 text-sm leading-6 text-slate-300">{entry.summary}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No summary</p>
        )}

        {entry.kind === "images" && entry.data?.src ? (
          <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-slate-800 bg-slate-950 p-3">
            <img alt="" className="max-h-full max-w-full object-contain" src={assetSrc(entry.data.src)} />
          </div>
        ) : null}

        {entry.kind === "ministries" ? (
          <MinisterAbilities entry={entry} tagLookup={tagLookup} />
        ) : dataEntries.length ? (
          <dl className="mt-4 grid gap-3 text-xs">
            {dataEntries.map(([key, value]) => (
              <div key={key} className="grid gap-1">
                <dt className="text-slate-500">{humanizeKey(key)}</dt>
                <dd className="min-w-0">
                  <DataValue itemKey={key} value={value} tagLookup={tagLookup} cardLookup={cardLookup} groupLookup={groupLookup} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </article>
  );
};

export default CatalogItemVisual;
