import { Download, Edit3, Plus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { PageSubnavigation } from "../components/AuthenticatedLayout.jsx";
import CatalogItemVisual from "../components/CatalogItemVisual.jsx";
import TagIcon from "../components/TagIcon.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const sections = [
  { key: "users", label: "Users", to: "/admin/users" },
  { key: "audit", label: "Audit", to: "/admin/audit" },
  { key: "tags", label: "Tags", to: "/admin/tags" },
  { key: "cards", label: "Cards", to: "/admin/cards" },
  { key: "roles", label: "Roles", to: "/admin/roles" },
  { key: "agendas", label: "Agendas", to: "/admin/agendas" },
  { key: "events", label: "Events", to: "/admin/events" },
  { key: "groups", label: "Groups", to: "/admin/groups" },
  { key: "decks", label: "Decks", to: "/admin/decks" },
];

const catalogSections = new Set([
  "tags",
  "cards",
  "roles",
  "agendas",
  "events",
  "groups",
  "card-categories",
  "decks",
]);

const DataPill = ({ children }) => (
  <span className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
    {children}
  </span>
);

const emptyCatalogForm = {
  id: "",
  name: "",
  category: "",
  summary: "",
  color: "#64748b",
  dataText: "{}",
};

const parseDataText = (dataText) => {
  const parsed = JSON.parse(dataText || "{}");
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Metadata must be a JSON object.");
  }
  return parsed;
};

const dataForForm = (form) => {
  try {
    return parseDataText(form.dataText);
  } catch (_error) {
    return {};
  }
};

const stringifyData = (data) => JSON.stringify(data || {}, null, 2);

const tagListFieldsBySection = {
  cards: ["tags"],
  roles: ["exhaust_tags", "jurisdiction_tags"],
  agendas: [],
  events: ["tags", "condition_tags"],
};

const tagCountFieldsBySection = {
  cards: ["cost", "exhaust"],
  roles: [],
  agendas: [],
  events: ["mitigation"],
};

const tagSingleFieldsBySection = {
  cards: [],
  roles: ["default_jurisdiction"],
  agendas: [],
  events: ["event_domain"],
};

const placementOptions = [
  { value: "city", label: "City" },
  { value: "empire", label: "Empire Zone" },
];

const emptyRequirement = { type: "not_condition", tag_id: "", card_id: "", scope: "city" };
const emptyReplacementEffect = { type: "add_condition", tag_id: "", scope: "target", amount: 1 };
const emptyCondition = { target: "this_card", variable: "is_exhausted", operator: "==", value: false };
const emptyEffect = { effect_type: "modify_mana", payload: { mana_type: "", amount: 1 } };
const defaultManualNode = {
  name: "Manual Action",
  trigger: "manual_action",
  ends_turn: false,
  preconditions: { logic_gate: "AND", conditions: [emptyCondition] },
  effects: [
    { effect_type: "set_state", payload: { variable: "is_exhausted", value: true } },
    emptyEffect,
  ],
};

const groupedTags = (tags) =>
  (tags || []).reduce((groups, tag) => {
    const category = tag.category || "uncategorized";
    return { ...groups, [category]: [...(groups[category] || []), tag] };
  }, {});

const orderedGroupedTagEntries = (tags) =>
  Object.entries(groupedTags(tags)).sort(([left], [right]) => left.localeCompare(right));

const tagLabel = (value) => String(value || "").replace(/_/g, " ");

const TagToggleGroup = ({ label, tags, selectedIds, onToggle }) => (
  <div>
    <p className="mb-2 text-sm font-medium text-slate-300">{tagLabel(label)}</p>
    <div className="space-y-3">
      {orderedGroupedTagEntries(tags).map(([category, categoryTags]) => (
        <div key={category}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-slate-500">{category}</p>
          <div className="flex flex-wrap gap-2">
            {categoryTags.map((tag) => {
              const selected = selectedIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  className={`rounded-md ${selected ? "bg-slate-800" : "opacity-55 hover:opacity-100"}`}
                  onClick={() => onToggle(tag.id)}
                  type="button"
                >
                  <TagIcon tag={tag} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TagCounterGroup = ({ label, tags, values, onChange }) => (
  <div>
    <p className="mb-2 text-sm font-medium text-slate-300">{tagLabel(label)}</p>
    <div className="space-y-3">
      {orderedGroupedTagEntries(tags).map(([category, categoryTags]) => (
        <div key={category}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-slate-500">{category}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categoryTags.map((tag) => {
              const count = Number(values?.[tag.id] || 0);
              return (
                <div key={tag.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-2">
                  <TagIcon tag={tag} count={count || null} />
                  <div className="flex items-center gap-1">
                    <button
                      className="h-7 w-7 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      disabled={count <= 0}
                      onClick={() => onChange(tag.id, Math.max(0, count - 1))}
                      type="button"
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-sm text-slate-300">{count}</span>
                    <button
                      className="h-7 w-7 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                      onClick={() => onChange(tag.id, count + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TagSingleSelect = ({ label, tags, selectedId, onSelect }) => (
  <div>
    <p className="mb-2 text-sm font-medium text-slate-300">{tagLabel(label)}</p>
    <div className="space-y-3">
      {orderedGroupedTagEntries(tags).map(([category, categoryTags]) => (
        <div key={category}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-slate-500">{category}</p>
          <div className="flex flex-wrap gap-2">
            {categoryTags.map((tag) => {
              const selected = selectedId === tag.id;
              return (
                <button
                  key={tag.id}
                  className={`rounded-md ${selected ? "bg-slate-800" : "opacity-55 hover:opacity-100"}`}
                  onClick={() => onSelect(selected ? "" : tag.id)}
                  type="button"
                >
                  <TagIcon tag={tag} />
                </button>
              );
            })}
            <button
              className="rounded-md border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-800"
              onClick={() => onSelect("")}
              type="button"
            >
              NONE
            </button>
          </div>
        </div>
      ))}
            </div>
  </div>
);

const SelectField = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-slate-300">{label}</span>
    <select
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

const parseConditionValue = (value) => {
  const raw = String(value ?? "").trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
};

const LogicNodeEditor = ({ logicNodes, setLogicNodes, tagEntries }) => {
  const updateNode = (index, patch) => {
    const next = [...logicNodes];
    next[index] = { ...next[index], ...patch };
    setLogicNodes(next);
  };

  const updatePreconditions = (index, patch) => {
    const node = logicNodes[index];
    updateNode(index, { preconditions: { ...(node.preconditions || {}), ...patch } });
  };

  const updateCondition = (nodeIndex, conditionIndex, patch) => {
    const node = logicNodes[nodeIndex];
    const preconditions = node.preconditions || { logic_gate: "AND", conditions: [] };
    const conditions = [...(preconditions.conditions || [])];
    conditions[conditionIndex] = { ...conditions[conditionIndex], ...patch };
    updatePreconditions(nodeIndex, { conditions });
  };

  const updateEffect = (nodeIndex, effectIndex, patch) => {
    const node = logicNodes[nodeIndex];
    const effects = [...(node.effects || [])];
    effects[effectIndex] = { ...effects[effectIndex], ...patch };
    updateNode(nodeIndex, { effects });
  };

  const updateEffectPayload = (nodeIndex, effectIndex, patch) => {
    const effect = logicNodes[nodeIndex]?.effects?.[effectIndex] || emptyEffect;
    updateEffect(nodeIndex, effectIndex, { payload: { ...(effect.payload || {}), ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-300">Logic Nodes</h4>
        <button
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          onClick={() => setLogicNodes([...logicNodes, defaultManualNode])}
          type="button"
        >
          Add node
        </button>
      </div>
      {logicNodes.map((node, nodeIndex) => {
        const preconditions = node.preconditions || { logic_gate: "AND", conditions: [] };
        const conditions = preconditions.conditions || [];
        const effects = node.effects || [];
        return (
          <div key={nodeIndex} className="space-y-4 rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Name</span>
                <input
                  value={node.name || ""}
                  onChange={(event) => updateNode(nodeIndex, { name: event.target.value })}
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                />
              </label>
              <SelectField
                label="Trigger"
                value={node.trigger || "manual_action"}
                options={[
                  { value: "manual_action", label: "Manual action" },
                  { value: "on_event_phase_start", label: "Event phase" },
                  { value: "on_epoch_end", label: "Epoch end" },
                ]}
                onChange={(value) => updateNode(nodeIndex, { trigger: value })}
              />
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-300">
                <input
                  checked={Boolean(node.ends_turn)}
                  onChange={(event) => updateNode(nodeIndex, { ends_turn: event.target.checked })}
                  type="checkbox"
                />
                Ends turn
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <SelectField
                  label="Precondition Gate"
                  value={preconditions.logic_gate || "AND"}
                  options={[
                    { value: "AND", label: "AND" },
                    { value: "OR", label: "OR" },
                  ]}
                  onChange={(value) => updatePreconditions(nodeIndex, { logic_gate: value })}
                />
                <button
                  className="mt-7 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => updatePreconditions(nodeIndex, { conditions: [...conditions, emptyCondition] })}
                  type="button"
                >
                  Add condition
                </button>
              </div>
              {conditions.map((condition, conditionIndex) => (
                <div key={conditionIndex} className="grid gap-2 sm:grid-cols-[8rem_1fr_6rem_8rem_auto]">
                  <SelectField
                    label="Target"
                    value={condition.target || "this_card"}
                    options={[
                      { value: "this_card", label: "This card" },
                      { value: "local_city", label: "Local city" },
                      { value: "global", label: "Global" },
                      { value: "player", label: "Player" },
                    ]}
                    onChange={(value) => updateCondition(nodeIndex, conditionIndex, { target: value })}
                  />
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Variable</span>
                    <input
                      list="logic-token-options"
                      value={condition.variable || ""}
                      onChange={(event) => updateCondition(nodeIndex, conditionIndex, { variable: event.target.value })}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                    />
                  </label>
                  <SelectField
                    label="Op"
                    value={condition.operator || "=="}
                    options={["==", "!=", ">=", "<=", ">", "<"].map((operator) => ({ value: operator, label: operator }))}
                    onChange={(value) => updateCondition(nodeIndex, conditionIndex, { operator: value })}
                  />
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Value</span>
                    <input
                      value={String(condition.value ?? "")}
                      onChange={(event) => updateCondition(nodeIndex, conditionIndex, { value: parseConditionValue(event.target.value) })}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                    />
                  </label>
                  <button
                    className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
                    onClick={() => updatePreconditions(nodeIndex, { conditions: conditions.filter((_, index) => index !== conditionIndex) })}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-slate-300">Effects</h5>
                <button
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => updateNode(nodeIndex, { effects: [...effects, emptyEffect] })}
                  type="button"
                >
                  Add effect
                </button>
              </div>
              {effects.map((effect, effectIndex) => (
                <div key={effectIndex} className="grid gap-2 sm:grid-cols-[11rem_1fr_7rem_auto]">
                  <SelectField
                    label="Type"
                    value={effect.effect_type || "modify_mana"}
                    options={[
                      { value: "modify_mana", label: "Modify mana" },
                      { value: "set_state", label: "Set state" },
                      { value: "modify_token", label: "Modify token" },
                      { value: "move_card", label: "Move card" },
                      { value: "draw_card", label: "Draw card" },
                    ]}
                    onChange={(value) => updateEffect(nodeIndex, effectIndex, { effect_type: value, payload: {} })}
                  />
                  {effect.effect_type === "modify_mana" ? (
                    <>
                      <SelectField
                        label="Mana"
                        value={effect.payload?.mana_type || ""}
                        options={[
                          { value: "", label: "Select mana" },
                          ...tagEntries.map((tag) => ({ value: tag.id, label: tag.name })),
                        ]}
                        onChange={(value) => updateEffectPayload(nodeIndex, effectIndex, { mana_type: value })}
                      />
                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Amount</span>
                        <input
                          type="number"
                          value={Number(effect.payload?.amount || 0)}
                          onChange={(event) => updateEffectPayload(nodeIndex, effectIndex, { amount: Number(event.target.value || 0) })}
                          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                        />
                      </label>
                    </>
                  ) : effect.effect_type === "set_state" ? (
                    <>
                      <SelectField
                        label="Variable"
                        value={effect.payload?.variable || "is_exhausted"}
                        options={[{ value: "is_exhausted", label: "Is exhausted" }]}
                        onChange={(value) => updateEffectPayload(nodeIndex, effectIndex, { variable: value })}
                      />
                      <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-300">
                        <input
                          checked={Boolean(effect.payload?.value)}
                          onChange={(event) => updateEffectPayload(nodeIndex, effectIndex, { value: event.target.checked })}
                          type="checkbox"
                        />
                        True
                      </label>
                    </>
                  ) : (
                    <label className="block sm:col-span-2">
                      <span className="text-sm font-medium text-slate-300">Payload JSON</span>
                      <textarea
                        value={JSON.stringify(effect.payload || {}, null, 2)}
                        onChange={(event) => {
                          try {
                            updateEffect(nodeIndex, effectIndex, { payload: JSON.parse(event.target.value || "{}") });
                          } catch (_error) {
                            updateEffect(nodeIndex, effectIndex, { payload: effect.payload || {} });
                          }
                        }}
                        className="mt-2 min-h-[5rem] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-teal-400"
                      />
                    </label>
                  )}
                  <button
                    className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
                    onClick={() => updateNode(nodeIndex, { effects: effects.filter((_, index) => index !== effectIndex) })}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              className="text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setLogicNodes(logicNodes.filter((_, index) => index !== nodeIndex))}
              type="button"
            >
              Remove node
            </button>
          </div>
        );
      })}
      <datalist id="logic-token-options">
        <option value="is_exhausted" />
        {tagEntries.map((tag) => <option key={tag.id} value={tag.id} />)}
      </datalist>
    </div>
  );
};

const CardGuidedFields = ({ data, setField, tagEntries, cardEntries, groupEntries }) => {
  const conditionTags = tagEntries.filter((tag) => tag.category === "condition");
  const cardOptions = cardEntries.filter((entry) => entry.kind === "cards");
  const groups = groupEntries.filter((entry) => entry.category === "mutually-exclusive" || entry.data?.type === "mutually_exclusive");
  const requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const replacementEffects = Array.isArray(data.replacement_effects) ? data.replacement_effects : [];
  const logicNodes = Array.isArray(data.logic_nodes) ? data.logic_nodes : [];

  const updateRequirement = (index, patch) => {
    const next = [...requirements];
    next[index] = { ...next[index], ...patch };
    setField("requirements", next);
  };

  const updateReplacementEffect = (index, patch) => {
    const next = [...replacementEffects];
    next[index] = { ...next[index], ...patch };
    setField("replacement_effects", next);
  };

  return (
    <>
      <SelectField
        label="Placement"
        value={data.placement || "city"}
        options={placementOptions}
        onChange={(value) => setField("placement", value)}
      />

      <LogicNodeEditor
        logicNodes={logicNodes}
        setLogicNodes={(nextNodes) => setField("logic_nodes", nextNodes)}
        tagEntries={tagEntries}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">Requirements</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("requirements", [...requirements, emptyRequirement])}
            type="button"
          >
            Add requirement
          </button>
        </div>
        {requirements.map((requirement, index) => (
          <div key={index} className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-3">
            <SelectField
              label="Type"
              value={requirement.type}
              options={[
                { value: "not_condition", label: "No condition" },
                { value: "has_card", label: "Has card" },
              ]}
              onChange={(value) => updateRequirement(index, { type: value })}
            />
            {requirement.type === "not_condition" ? (
              <TagSingleSelect
                label="Condition"
                tags={conditionTags}
                selectedId={requirement.tag_id || ""}
                onSelect={(tagId) => updateRequirement(index, { tag_id: tagId })}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Card"
                  value={requirement.card_id || ""}
                  options={[
                    { value: "", label: "Select card" },
                    ...cardOptions.map((card) => ({ value: card.id, label: card.name })),
                  ]}
                  onChange={(value) => updateRequirement(index, { card_id: value })}
                />
                <SelectField
                  label="Scope"
                  value={requirement.scope || "city"}
                  options={[
                    { value: "city", label: "Same city" },
                    { value: "empire", label: "Empire zone" },
                    { value: "global", label: "Anywhere/global" },
                  ]}
                  onChange={(value) => updateRequirement(index, { scope: value })}
                />
              </div>
            )}
            <button
              className="text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setField("requirements", requirements.filter((_, itemIndex) => itemIndex !== index))}
              type="button"
            >
              Remove requirement
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Mutually Exclusive Group"
          value={data.mutually_exclusive_group || ""}
          options={[
            { value: "", label: "None" },
            ...groups.map((group) => ({ value: group.id, label: group.name })),
          ]}
          onChange={(value) => setField("mutually_exclusive_group", value)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">Replacement Effects</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("replacement_effects", [...replacementEffects, emptyReplacementEffect])}
            type="button"
          >
            Add effect
          </button>
        </div>
        {replacementEffects.map((effect, index) => (
          <div key={index} className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                label="Scope"
                value={effect.scope || "target"}
                options={[
                  { value: "target", label: "Target zone" },
                  { value: "empire", label: "Empire zone" },
                  { value: "city", label: "City" },
                ]}
                onChange={(value) => updateReplacementEffect(index, { scope: value })}
              />
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Amount</span>
                <input
                  type="number"
                  min="1"
                  value={Number(effect.amount || 1)}
                  onChange={(event) => updateReplacementEffect(index, { amount: Number(event.target.value || 1) })}
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                />
              </label>
            </div>
            <TagSingleSelect
              label="Condition"
              tags={conditionTags}
              selectedId={effect.tag_id || ""}
              onSelect={(tagId) => updateReplacementEffect(index, { tag_id: tagId })}
            />
            <button
              className="text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setField("replacement_effects", replacementEffects.filter((_, itemIndex) => itemIndex !== index))}
              type="button"
            >
              Remove effect
            </button>
          </div>
        ))}
      </div>
    </>
  );
};

const DeckGuidedFields = ({ data, setField, cardEntries, eventEntries }) => {
  const deckType = data.deck_type === "events" || data.deck_type === "common-pool" ? data.deck_type : "cards";
  const items = deckType === "events" ? eventEntries : cardEntries.filter((entry) => entry.id !== "capital-foundation");
  const selectedIds = Array.isArray(data.item_ids) ? data.item_ids : [];
  const copyCounts = selectedIds.reduce((counts, itemId) => {
    return { ...counts, [itemId]: Number(counts[itemId] || 0) + 1 };
  }, {});

  const setCopies = (itemId, copies) => {
    const normalizedCopies = Math.max(0, Math.min(99, Number(copies) || 0));
    const withoutItem = selectedIds.filter((id) => id !== itemId);
    setField("item_ids", [...withoutItem, ...Array.from({ length: normalizedCopies }, () => itemId)]);
  };

  return (
    <>
      <SelectField
        label="Deck Type"
        value={deckType}
        options={[
          { value: "cards", label: "Cards" },
          { value: "common-pool", label: "Common Pool" },
          { value: "events", label: "Events" },
        ]}
        onChange={(value) => {
          setField("deck_type", value);
          setField("item_ids", []);
        }}
      />
      <div>
        <p className="mb-2 text-sm font-medium text-slate-300">Deck Items</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const copies = Number(copyCounts[item.id] || 0);
            return (
              <div
                key={item.id}
                className={`rounded-md border px-3 py-2 text-sm transition ${
                  copies > 0
                    ? "border-teal-400 bg-teal-400/10 text-teal-100"
                    : "border-slate-800 bg-slate-950 text-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">{item.category || item.id}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      className="h-7 w-7 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      disabled={copies <= 0}
                      onClick={() => setCopies(item.id, copies - 1)}
                      type="button"
                    >
                      -
                    </button>
                    <input
                      aria-label={`${item.name} copies`}
                      className="h-7 w-12 rounded border border-slate-700 bg-slate-950 px-1 text-center text-sm text-white outline-none focus:border-teal-400"
                      min="0"
                      max="99"
                      onChange={(event) => setCopies(item.id, event.target.value)}
                      type="number"
                      value={copies}
                    />
                    <button
                      className="h-7 w-7 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                      onClick={() => setCopies(item.id, copies + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
          {items.length === 0 ? <p className="text-sm text-slate-500">No valid items available.</p> : null}
        </div>
      </div>
    </>
  );
};

const GuidedMetadataEditor = ({
  activeSection,
  catalogForm,
  setCatalogForm,
  tagEntries,
  cardEntries,
  groupEntries,
  eventEntries,
}) => {
  if (activeSection === "tags") return null;

  const data = dataForForm(catalogForm);
  const countFields = tagCountFieldsBySection[activeSection] || [];
  const listFields = tagListFieldsBySection[activeSection] || [];
  const singleFields = tagSingleFieldsBySection[activeSection] || [];
  const usefulFields = [...countFields, ...listFields, ...singleFields];
  const hasCardGuidance = activeSection === "cards";
  const hasDeckGuidance = activeSection === "decks";
  if (!usefulFields.length && !hasCardGuidance && !hasDeckGuidance) return null;

  const setField = (field, value) => {
    setCatalogForm((state) => {
      let currentData = {};
      try {
        currentData = parseDataText(state.dataText);
      } catch (_error) {
        currentData = data;
      }
      const nextData = { ...currentData };
      if (
        (Array.isArray(value) && value.length === 0) ||
        (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
      ) {
        delete nextData[field];
      } else {
        nextData[field] = value;
      }
      return { ...state, dataText: stringifyData(nextData) };
    });
  };

  const updateCount = (field, tagId, count) => {
    const current = data[field] && typeof data[field] === "object" && !Array.isArray(data[field])
      ? { ...data[field] }
      : {};
    if (count <= 0) delete current[tagId];
    else current[tagId] = count;
    setField(field, current);
  };

  const toggleTag = (field, tagId) => {
    const current = Array.isArray(data[field]) ? data[field] : [];
    setField(
      field,
      current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId]
    );
  };

  const selectSingleTag = (field, tagId) => {
    setField(field, tagId || "");
  };

  return (
    <div className="space-y-5 rounded-lg border border-slate-800 bg-slate-950 p-4">
      <h3 className="font-semibold text-white">Guided Metadata</h3>
      {hasCardGuidance ? (
        <CardGuidedFields
          data={data}
          setField={setField}
          tagEntries={tagEntries}
          cardEntries={cardEntries}
          groupEntries={groupEntries}
        />
      ) : null}
      {hasDeckGuidance ? (
        <DeckGuidedFields
          data={data}
          setField={setField}
          cardEntries={cardEntries}
          eventEntries={eventEntries}
        />
      ) : null}
      {countFields.map((field) => (
        <TagCounterGroup
          key={field}
          label={field.replace(/_/g, " ")}
          tags={tagEntries}
          values={data[field] || {}}
          onChange={(tagId, count) => updateCount(field, tagId, count)}
        />
      ))}
      {listFields.map((field) => (
        <TagToggleGroup
          key={field}
          label={field.replace(/_/g, " ")}
          tags={tagEntries}
          selectedIds={Array.isArray(data[field]) ? data[field] : []}
          onToggle={(tagId) => toggleTag(field, tagId)}
        />
      ))}
      {singleFields.map((field) => (
        <TagSingleSelect
          key={field}
          label={field}
          tags={tagEntries}
          selectedId={typeof data[field] === "string" ? data[field] : ""}
          onSelect={(tagId) => selectSingleTag(field, tagId)}
        />
      ))}
    </div>
  );
};

const AdminPage = () => {
  const { section = "users", subsection = "" } = useParams();
  const { token, user } = useStore();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [tagEntries, setTagEntries] = useState([]);
  const [cardEntries, setCardEntries] = useState([]);
  const [eventEntries, setEventEntries] = useState([]);
  const [cardCategories, setCardCategories] = useState([]);
  const [groupEntries, setGroupEntries] = useState([]);
  const [catalogSummary, setCatalogSummary] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [tagCategoryFilter, setTagCategoryFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeSection = sections.some((entry) => entry.key === section) ? section : null;
  const activeCatalogKind =
    activeSection === "cards" && subsection === "categories" ? "card-categories" : activeSection;
  const isCatalogSection = catalogSections.has(activeCatalogKind);
  const isCardCategoriesPage = activeCatalogKind === "card-categories";

  const request = async (path, options = {}) => {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Admin request failed.");
    return payload;
  };

  const loadUsers = async () => {
    if (!token) return;
    setError("");
    try {
      setUsers(await request(`/api/admin/users?query=${encodeURIComponent(query)}`));
    } catch (loadError) {
      setError(loadError.message || "Failed to load users.");
    }
  };

  const loadAudit = async () => {
    if (!token) return;
    setError("");
    try {
      setAuditLogs(await request("/api/admin/audit-logs"));
    } catch (loadError) {
      setError(loadError.message || "Failed to load audit logs.");
    }
  };

  const loadCatalog = async (targetSection) => {
    if (!token || !catalogSections.has(targetSection)) return;
    setError("");
    try {
      const requests = [
        request("/api/admin/catalog/summary"),
        request(`/api/admin/${targetSection}`),
      ];
      if (targetSection !== "tags") {
        requests.push(request("/api/admin/tags"));
      }
      if (targetSection !== "cards") {
        requests.push(request("/api/admin/cards"));
      }
      if (targetSection !== "groups") {
        requests.push(request("/api/admin/groups"));
      }
      if (targetSection !== "events") {
        requests.push(request("/api/admin/events"));
      }
      if (targetSection !== "card-categories") {
        requests.push(request("/api/admin/card-categories"));
      }
      const results = await Promise.all(requests);
      const [summary, entries] = results;
      let resultIndex = 2;
      const tags = targetSection === "tags" ? entries : results[resultIndex++];
      const cards = targetSection === "cards" ? entries : results[resultIndex++];
      const groups = targetSection === "groups" ? entries : results[resultIndex++];
      const events = targetSection === "events" ? entries : results[resultIndex++];
      const categories = targetSection === "card-categories" ? entries : results[resultIndex++];
      setCatalogSummary(summary);
      setCatalogEntries(entries);
      setTagEntries(targetSection === "tags" ? entries : tags);
      setCardEntries(targetSection === "cards" ? entries : cards);
      setGroupEntries(targetSection === "groups" ? entries : groups);
      setEventEntries(targetSection === "events" ? entries : events);
      setCardCategories(targetSection === "card-categories" ? entries : categories);
      setEditingEntry(null);
      setCatalogForm(emptyCatalogForm);
      setEditorOpen(false);
    } catch (loadError) {
      setError(loadError.message || "Failed to load catalog.");
      setCatalogEntries([]);
    }
  };

  const loadUserDetail = async (userId) => {
    setError("");
    try {
      setSelectedUser(await request(`/api/admin/users/${userId}`));
    } catch (loadError) {
      setError(loadError.message || "Failed to load user.");
    }
  };

  useEffect(() => {
    if (activeSection === "users") {
      void loadUsers();
    } else if (activeSection === "audit") {
      void loadAudit();
    } else if (isCatalogSection) {
      void loadCatalog(activeCatalogKind);
    }
  }, [activeCatalogKind, activeSection, isCatalogSection, token]);

  const filteredCatalogEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalogEntries.filter((entry) => {
      const matchesQuery = !normalized || [entry.id, entry.name, entry.kind, entry.category, entry.summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
      const matchesCategory =
        activeCatalogKind !== "tags" ||
        tagCategoryFilter === "all" ||
        entry.category === tagCategoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [activeCatalogKind, catalogEntries, query, tagCategoryFilter]);

  const tagCategories = useMemo(
    () => Array.from(new Set(catalogEntries.map((entry) => entry.category || "uncategorized"))).sort(),
    [catalogEntries]
  );

  const groupedCatalogEntries = useMemo(() => {
    if (activeCatalogKind !== "tags") return [["", filteredCatalogEntries]];
    return Object.entries(groupedTags(filteredCatalogEntries)).sort(([left], [right]) =>
      left.localeCompare(right)
    );
  }, [activeCatalogKind, filteredCatalogEntries]);

  const beginCreateCatalogEntry = () => {
    setEditingEntry(null);
    setCatalogForm({
      ...emptyCatalogForm,
      color: activeCatalogKind === "tags" ? "#64748b" : "",
      category:
        activeCatalogKind === "groups"
          ? "mutually-exclusive"
          : activeCatalogKind === "card-categories"
            ? "card-category"
            : activeCatalogKind === "decks"
              ? "cards"
            : "",
      dataText:
        activeCatalogKind === "groups"
          ? stringifyData({ type: "mutually_exclusive" })
          : activeCatalogKind === "decks"
            ? stringifyData({ deck_type: "cards", item_ids: [] })
            : "{}",
    });
    setEditorOpen(true);
    setError("");
  };

  const beginEditCatalogEntry = (entry) => {
    setEditingEntry(entry);
    setCatalogForm({
      id: entry.id,
      name: entry.name || "",
      category: entry.category || "",
      summary: entry.summary || "",
      color: entry.color || "#64748b",
      dataText: JSON.stringify(entry.data || {}, null, 2),
    });
    setEditorOpen(true);
    setError("");
  };

  const parseCatalogData = () => {
    try {
      return parseDataText(catalogForm.dataText);
    } catch (parseError) {
      throw new Error(parseError.message || "Metadata must be valid JSON.");
    }
  };

  const saveCatalogEntry = async () => {
    if (!isCatalogSection || busy) return;
    setBusy(true);
    setError("");
    try {
      const parsedData = parseCatalogData();
      const payload = {
        name: catalogForm.name,
        category:
          activeCatalogKind === "groups"
            ? "mutually-exclusive"
            : activeCatalogKind === "card-categories"
              ? "card-category"
              : activeCatalogKind === "decks"
                ? parsedData.deck_type || catalogForm.category || "cards"
              : catalogForm.category,
        summary: catalogForm.summary,
        color: activeCatalogKind === "tags" ? catalogForm.color : null,
        data: activeCatalogKind === "groups"
          ? { ...parsedData, type: "mutually_exclusive" }
          : activeCatalogKind === "decks"
            ? { ...parsedData, deck_type: parsedData.deck_type || "cards", item_ids: Array.isArray(parsedData.item_ids) ? parsedData.item_ids : [] }
            : parsedData,
      };
      const path = editingEntry
        ? `/api/admin/${activeCatalogKind}/${editingEntry.id}`
        : `/api/admin/${activeCatalogKind}`;
      const saved = await request(path, {
        method: editingEntry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingEntry ? payload : { ...payload, id: catalogForm.id }),
      });
      setCatalogEntries((entries) => {
        const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
        return [...withoutSaved, saved].sort((a, b) =>
          `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
        );
      });
      if (activeCatalogKind === "tags") {
        setTagEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "cards") {
        setCardEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "groups") {
        setGroupEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "events") {
        setEventEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "card-categories") {
        setCardCategories((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      setEditingEntry(saved);
      setCatalogForm({
        id: saved.id,
        name: saved.name || "",
        category: saved.category || "",
        summary: saved.summary || "",
        color: saved.color || "#64748b",
        dataText: JSON.stringify(saved.data || {}, null, 2),
      });
      setCatalogSummary(await request("/api/admin/catalog/summary"));
      setEditorOpen(false);
    } catch (saveError) {
      setError(saveError.message || "Failed to save catalog entry.");
    } finally {
      setBusy(false);
    }
  };

  const deleteCatalogEntry = async (entry) => {
    if (!entry?.id || busy) return;
    const confirmed = window.confirm(`Delete ${entry.name}?`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/${activeCatalogKind}/${entry.id}`, { method: "DELETE" });
      setCatalogEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      if (activeCatalogKind === "tags") {
        setTagEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "cards") {
        setCardEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "groups") {
        setGroupEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "events") {
        setEventEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "card-categories") {
        setCardCategories((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (editingEntry?.id === entry.id) {
        setEditingEntry(null);
        setCatalogForm(emptyCatalogForm);
        setEditorOpen(false);
      }
      setCatalogSummary(await request("/api/admin/catalog/summary"));
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete catalog entry.");
    } finally {
      setBusy(false);
    }
  };

  const downloadJson = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportCatalog = async (kind = "") => {
    if (!isCatalogSection || busy) return;
    setBusy(true);
    setError("");
    try {
      const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      const payload = await request(`/api/admin/catalog/export${suffix}`);
      const exportedKind = kind || "all";
      downloadJson(payload, `chronicle-catalog-${exportedKind}.json`);
    } catch (exportError) {
      setError(exportError.message || "Failed to export catalog.");
    } finally {
      setBusy(false);
    }
  };

  const importCatalogFile = async (file, importAll = false) => {
    if (!file || !isCatalogSection || busy) return;
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      const normalizedPayload = {
        version: Number(payload.version || 1),
        kind: importAll ? "all" : activeCatalogKind,
        entries: entries.map((entry) => ({ ...entry, kind: entry.kind || activeCatalogKind })),
      };
      const result = await request("/api/admin/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedPayload),
      });
      await loadCatalog(activeCatalogKind);
      window.alert(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
    } catch (importError) {
      setError(importError.message || "Failed to import catalog.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAdmin = async (target) => {
    if (!target?.id) return;
    setBusy(true);
    setError("");
    try {
      const updated = await request(`/api/admin/users/${target.id}/admin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: !target.is_admin }),
      });
      setSelectedUser(updated);
      await loadUsers();
    } catch (actionError) {
      setError(actionError.message || "Failed to update admin flag.");
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-semibold text-white">Admin</h1>
        <p className="mt-2 text-slate-400">Admin access is required.</p>
        <Link className="mt-5 inline-block rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950" to="/lobby">
          Back to lobby
        </Link>
      </div>
    );
  }

  if (!activeSection) return <Navigate to="/admin/users" replace />;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Echoes Admin Console</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage accounts and prepare the Chronicle of the Fall game catalog.
          </p>
        </div>
        {activeSection === "users" || isCatalogSection ? (
          <div className="flex min-w-[16rem] items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
              placeholder={activeSection === "users" ? "Search users" : `Search ${activeSection}`}
            />
            {activeSection === "users" ? (
              <button className="text-sm font-semibold text-teal-300" onClick={loadUsers} type="button">
                Search
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <PageSubnavigation items={sections} />

      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      {activeSection === "users" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 font-semibold text-white">Users</h2>
            <div className="divide-y divide-slate-800">
              {users.map((entry) => (
                <button
                  key={entry.id}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-950"
                  onClick={() => loadUserDetail(entry.id)}
                  type="button"
                >
                  <span>
                    <span className="font-medium text-white">{entry.username}</span>
                    <span className="ml-2 text-xs text-slate-500">{entry.email}</span>
                  </span>
                  <span className="flex gap-2">
                    {entry.is_admin ? <DataPill>admin</DataPill> : null}
                    <span className={`rounded px-2 py-1 text-xs ${entry.online ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-800 text-slate-400"}`}>
                      {entry.online ? "online" : "offline"}
                    </span>
                  </span>
                </button>
              ))}
              {users.length === 0 ? <p className="py-5 text-slate-400">No users found.</p> : null}
            </div>
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold text-white">Selected User</h2>
            {selectedUser ? (
              <div className="mt-4 space-y-3">
                <p className="font-medium text-white">{selectedUser.user.username}</p>
                <p className="break-all text-xs text-slate-500">{selectedUser.user.id}</p>
                <p className="text-sm text-slate-400">Friends: {selectedUser.friends_count}</p>
                <p className="text-sm text-slate-400">Incoming requests: {selectedUser.incoming_requests_count}</p>
                <p className="text-sm text-slate-400">Outgoing requests: {selectedUser.outgoing_requests_count}</p>
                <button
                  className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => toggleAdmin(selectedUser.user)}
                  disabled={busy}
                  type="button"
                >
                  {selectedUser.user.is_admin ? "Remove admin" : "Make admin"}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Select a user to inspect.</p>
            )}
          </aside>
        </section>
      ) : null}

      {activeSection === "audit" ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-3 font-semibold text-white">Audit Logs</h2>
          <div className="divide-y divide-slate-800">
            {auditLogs.map((entry) => (
              <div key={entry.id} className="py-3 text-sm">
                <p className="text-white">
                  {entry.action} <span className="text-slate-500">on</span> {entry.target_type}:{entry.target_id}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.admin_username} · {new Date(entry.created_at).toLocaleString()}
                </p>
              </div>
            ))}
            {auditLogs.length === 0 ? <p className="py-5 text-slate-400">No audit logs yet.</p> : null}
          </div>
        </section>
      ) : null}

      {isCatalogSection ? (
        <section className="space-y-4">
          {catalogSummary ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(catalogSummary).map(([key, count]) => (
                <DataPill key={key}>{key}: {count}</DataPill>
              ))}
            </div>
          ) : null}
          {activeSection === "cards" ? (
            <nav className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
              <NavLink
                to="/admin/cards"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition hover:bg-slate-800 hover:text-white ${isActive ? "bg-slate-800 text-white" : "text-slate-400"}`
                }
              >
                Cards
              </NavLink>
              <NavLink
                to="/admin/cards/categories"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition hover:bg-slate-800 hover:text-white ${isActive ? "bg-slate-800 text-white" : "text-slate-400"}`
                }
              >
                Categories
              </NavLink>
            </nav>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {activeSection === "tags" ? (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <span>Category</span>
                <select
                  value={tagCategoryFilter}
                  onChange={(event) => setTagCategoryFilter(event.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                >
                  <option value="all">All</option>
                  {tagCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                disabled={busy}
                onClick={() => exportCatalog(activeCatalogKind)}
                type="button"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export Page
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                disabled={busy}
                onClick={() => exportCatalog("")}
                type="button"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export All
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import Page
                <input
                  accept="application/json,.json"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void importCatalogFile(file);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import All
                <input
                  accept="application/json,.json"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void importCatalogFile(file, true);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300"
                onClick={beginCreateCatalogEntry}
                type="button"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New {isCardCategoriesPage ? "category" : activeSection.slice(0, -1)}
              </button>
            </div>
          </div>
          <div className="space-y-6">
            {groupedCatalogEntries.map(([category, entries]) => (
              <section key={category || "all"} className="space-y-3">
                {activeCatalogKind === "tags" ? (
                  <h2 className="border-b border-slate-800 pb-2 text-sm font-semibold uppercase tracking-normal text-slate-400">
                    {category}
                  </h2>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  {entries.map((entry) => (
                    <CatalogItemVisual
                      key={entry.id}
                      entry={entry}
                      tags={tagEntries}
                      cards={cardEntries}
                      groups={groupEntries}
                      actions={
                        <>
                          <button
                            className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                            onClick={() => beginEditCatalogEntry(entry)}
                            type="button"
                          >
                            <Edit3 className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            className="inline-flex items-center gap-2 rounded-md border border-rose-900/80 px-3 py-2 text-sm text-rose-200 hover:bg-rose-950/70"
                            onClick={() => deleteCatalogEntry(entry)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
            {filteredCatalogEntries.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-slate-400">No catalog entries found.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {editorOpen && isCatalogSection ? (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-8">
          <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">{editingEntry ? "Edit Item" : "Create Item"}</h2>
                <p className="mt-1 text-xs text-slate-500">{isCardCategoriesPage ? "card category" : activeSection}</p>
              </div>
              <button
                className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  setEditorOpen(false);
                  setEditingEntry(null);
                  setCatalogForm(emptyCatalogForm);
                }}
                type="button"
                title="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-300">Id</span>
                  <input
                    value={catalogForm.id}
                    onChange={(event) => setCatalogForm((state) => ({ ...state, id: event.target.value }))}
                    className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400 disabled:text-slate-500"
                    disabled={Boolean(editingEntry)}
                    placeholder="auto-from-name"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-300">Name</span>
                  <input
                    value={catalogForm.name}
                    onChange={(event) => setCatalogForm((state) => ({ ...state, name: event.target.value }))}
                    className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {activeCatalogKind === "cards" ? (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Category</span>
                    <select
                      value={catalogForm.category}
                      onChange={(event) => setCatalogForm((state) => ({ ...state, category: event.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                    >
                      <option value="">Select category</option>
                      {cardCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Category</span>
                    <input
                      value={catalogForm.category}
                      onChange={(event) => setCatalogForm((state) => ({ ...state, category: event.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400 disabled:text-slate-500"
                      disabled={activeCatalogKind === "card-categories" || activeCatalogKind === "groups"}
                    />
                  </label>
                )}
                {activeSection === "tags" ? (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Color</span>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="color"
                        value={catalogForm.color || "#64748b"}
                        onChange={(event) => setCatalogForm((state) => ({ ...state, color: event.target.value }))}
                        className="h-10 w-14 rounded border border-slate-700 bg-slate-950"
                      />
                      <input
                        value={catalogForm.color || ""}
                        onChange={(event) => setCatalogForm((state) => ({ ...state, color: event.target.value }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                      />
                    </div>
                  </label>
                ) : null}
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-300">Summary</span>
                <textarea
                  value={catalogForm.summary}
                  onChange={(event) => setCatalogForm((state) => ({ ...state, summary: event.target.value }))}
                  className="mt-2 min-h-[5rem] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                />
              </label>

              <GuidedMetadataEditor
                activeSection={activeCatalogKind}
                catalogForm={catalogForm}
                setCatalogForm={setCatalogForm}
                tagEntries={tagEntries}
                cardEntries={cardEntries}
                groupEntries={groupEntries}
                eventEntries={eventEntries}
              />

              <label className="block">
                <span className="text-sm font-medium text-slate-300">Advanced Metadata JSON</span>
                <textarea
                  value={catalogForm.dataText}
                  onChange={(event) => setCatalogForm((state) => ({ ...state, dataText: event.target.value }))}
                  className="mt-2 min-h-[9rem] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-teal-400"
                  spellCheck={false}
                />
              </label>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
                <button
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onClick={() => {
                    setEditorOpen(false);
                    setEditingEntry(null);
                    setCatalogForm(emptyCatalogForm);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
                  onClick={saveCatalogEntry}
                  disabled={busy}
                  type="button"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default AdminPage;
