import TagIcon from "./TagIcon.jsx";

const fallbackColor = "#64748b";
const tagKeyNames = new Set([
  "tags",
  "cost",
  "exhaust",
  "required_city_tags",
  "pitches",
  "mitigation",
  "infrastructure_resources",
  "administered_event_types",
  "exhaust_tags",
  "condition_tags",
  "local_tags",
  "global_tags",
  "default_jurisdiction",
  "jurisdiction_tags",
  "event_domain",
  "replacement_effects",
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

const DataValue = ({ itemKey, value, tagLookup, cardLookup, groupLookup }) => {
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

const CatalogItemVisual = ({ entry, tags = [], cards = [], groups = [], actions = null }) => {
  const color = entry?.color || fallbackColor;
  const tagLookup = buildTagLookup(tags);
  const cardLookup = Object.fromEntries((cards || []).map((card) => [normalizeTagId(card.id || card.name), card]));
  const groupLookup = Object.fromEntries((groups || []).map((group) => [normalizeTagId(group.id || group.name), group]));
  const dataEntries = Object.entries(entry?.data || {}).slice(0, 6);

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
