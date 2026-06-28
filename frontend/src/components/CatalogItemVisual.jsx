import { RotateCcw, ScrollText, Zap } from "lucide-react";
import TagIcon from "./TagIcon.jsx";

const fallbackColor = "#64748b";
const tagKeyNames = new Set([
  "tags",
  "cost",
  "required_city_tags",
  "pitches",
  "infrastructure_resources",
  "administered_event_types",
  "local_tags",
  "global_tags",
  "replacement_effects",
  "defense_requirement",
]);

const normalizeTagId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const buildTagLookup = (tags = []) =>
  Object.fromEntries((tags || []).map((tag) => [normalizeTagId(tag.id || tag.name), tag]));

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

const CatalogItemVisual = ({ entry, tags = [], cards = [], groups = [], ministries = [], images = [], actions = null }) => {
  const color = entry?.color || fallbackColor;
  const tagLookup = buildTagLookup(tags);
  const cardLookup = Object.fromEntries((cards || []).map((card) => [normalizeTagId(card.id || card.name), card]));
  const groupLookup = Object.fromEntries((groups || []).map((group) => [normalizeTagId(group.id || group.name), group]));
  const imageLookup = Object.fromEntries((images || []).map((image) => [image.id, image]));
  const domainMinistry = (ministries || []).find((ministry) => ministry.data?.domain_id && ministry.data.domain_id === entry?.data?.domain_id);
  const domainIcon = domainMinistry?.data?.domain_icon || imageLookup[domainMinistry?.data?.domain_icon_image_id]?.data?.src || "";
  const dataEntries = Object.entries(entry?.data || {}).filter(([key]) => key !== "src").slice(0, 6);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-white">{entry.name}</h3>
              {entry.kind === "tags" ? (
                <TagIcon tag={entry} />
              ) : entry.kind === "events" && domainMinistry ? (
                <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
                  {domainIcon ? (
                    <img alt="" className="h-4 w-4 rounded object-cover" src={domainIcon} />
                  ) : (
                    <span className="font-semibold">{String(domainMinistry.data?.domain_symbol || domainMinistry.data?.domain_id || "").slice(0, 3).toUpperCase()}</span>
                  )}
                  {domainMinistry.name}
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
            <img alt="" className="max-h-full max-w-full object-contain" src={entry.data.src} />
          </div>
        ) : null}

        {dataEntries.length ? (
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
