import { ArrowDown, BarChart3, Download, Edit3, Plus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { PageSubnavigation } from "../components/AuthenticatedLayout.jsx";
import CatalogItemVisual from "../components/CatalogItemVisual.jsx";
import TagIcon from "../components/TagIcon.jsx";
import { useStore } from "../store.js";
import { authenticatedFetch } from "../utils/authenticatedFetch.js";
import { buildApiUrl, buildAssetUrl } from "../utils/connection.js";

const sections = [
  { key: "users", label: "Users", to: "/admin/users" },
  { key: "audit", label: "Audit", to: "/admin/audit" },
  { key: "statistics", label: "Statistics", to: "/admin/statistics" },
  { key: "catalog-inspector", label: "Catalog Inspector", to: "/admin/catalog-inspector" },
  { key: "tags", label: "Tags", to: "/admin/tags" },
  { key: "images", label: "Images", to: "/admin/images" },
  { key: "structures", label: "Structures", to: "/admin/structures" },
  { key: "cities", label: "Cities", to: "/admin/cities" },
  { key: "build-paths", label: "Build Paths", to: "/admin/build-paths" },
  { key: "ministries", label: "Ministries", to: "/admin/ministries" },
  { key: "pillars", label: "Pillars", to: "/admin/pillars" },
  { key: "tokens", label: "Tokens", to: "/admin/tokens" },
  { key: "effect-icons", label: "Effect Icons", to: "/admin/effect-icons" },
  { key: "agendas", label: "Agendas", to: "/admin/agendas" },
  { key: "edicts", label: "Edicts", to: "/admin/edicts" },
  { key: "crises", label: "Crises", to: "/admin/crises" },
  { key: "decks", label: "Decks", to: "/admin/decks" },
  { key: "levels", label: "Levels", to: "/admin/levels" },
];

const catalogSections = new Set([
  "tags",
  "images",
  "cards",
  "ministries",
  "pillars",
  "tokens",
  "effect-icons",
  "agendas",
  "events",
  "levels",
  "decks",
]);
const readOnlyCatalogSections = new Set([
  "tags",
  "images",
  "ministries",
  "pillars",
  "tokens",
  "effect-icons",
]);

const DataPill = ({ children }) => (
  <span className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
    {children}
  </span>
);

const CatalogFilterSelect = ({ label, value, options, onChange }) => (
  <label className="block min-w-[9rem] text-left">
    <span className="block text-[0.65rem] font-semibold uppercase text-slate-500">{label}</span>
    <select
      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 outline-none focus:border-teal-400"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Any</option>
      {options.map((option) => (
        <option key={option.value || option.id} value={option.value || option.id}>
          {option.label || option.name}
        </option>
      ))}
    </select>
  </label>
);

const emptyCatalogForm = {
  id: "",
  name: "",
  category: "",
  summary: "",
  color: "#64748b",
  dataText: "{}",
};

const filterableCardSections = new Set(["structures", "cities", "edicts", "crises"]);

const entryEffects = (entry) => {
  const data = entry?.data || {};
  return [
    ...(Array.isArray(data.on_build_effects) ? data.on_build_effects : []),
    ...(Array.isArray(data.persistent_effects) ? data.persistent_effects : []),
    ...(Array.isArray(data.main_effects) ? data.main_effects : []),
    ...(Array.isArray(data.alternative_effects) ? data.alternative_effects : []),
  ];
};

const effectTypeLabel = (effectType) => eventEffectOptions.find((option) => option.value === effectType)?.label
  || ({ storage: "Add storage", add_building_slots: "Add building slots", modify_token: "Modify token" }[effectType])
  || String(effectType || "").replaceAll("_", " ");

const matchesCatalogEffectFilters = (
  entry,
  { providedTag = "", producedResource = "", effectType = "", modifiedPillar = "" }
) => {
  const effects = entryEffects(entry);
  return (!providedTag || Number(entry.data?.tags?.[providedTag] || 0) > 0)
    && (!producedResource
      || Number(entry.data?.production?.[producedResource] || 0) > 0
      || effects.some((effect) => effect.effect_type === "modify_resources"
        && effect.payload?.resource_id === producedResource
        && Number(effect.payload?.amount || 0) > 0))
    && (!effectType || effects.some((effect) => effect.effect_type === effectType))
    && (!modifiedPillar || effects.some((effect) => (
      effect.effect_type === "modify_pillar" && effect.payload?.pillar_id === modifiedPillar
    )));
};

const defaultAgendaData = {
  max_points: 8,
  win_threshold: 6,
  primary_mandatory: true,
  forbidden_is_veto: false,
  primary: {
    name: "Primary Legacy",
    points: 4,
    text: "",
    conditions: [{ type: "tag_count", tag: "", operator: "gte", amount: 1 }],
  },
  secondary: {
    name: "Secondary Legacy",
    points: 2,
    text: "",
    conditions: [{ type: "tag_count", tag: "", operator: "gte", amount: 1 }],
  },
  collapse: {
    name: "Collapse Preference",
    points: 2,
    text: "",
    conditions: [{ type: "collapsed_pillar", pillar: "" }],
  },
  forbidden: {
    name: "Forbidden Future",
    points: -1,
    text: "",
    conditions: [{ type: "tag_is_highest", tag: "" }],
  },
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
  cards: [],
  ministries: [],
  agendas: [],
  events: [],
  pillars: [],
  "effect-icons": [],
  decks: [],
  levels: [],
};

const tagCountFieldsBySection = {
  cards: [],
  ministries: [],
  agendas: [],
  events: [],
  pillars: [],
  "effect-icons": [],
  decks: [],
  levels: [],
};

const tagSingleFieldsBySection = {
  cards: [],
  ministries: [],
  agendas: [],
  events: [],
  pillars: [],
  "effect-icons": [],
  decks: [],
  levels: [],
};

const placementOptions = [
  { value: "city", label: "City" },
  { value: "empire", label: "Empire Zone" },
];

const emptyRequirement = { type: "not_condition", tag_id: "", card_id: "", scope: "city" };
const emptyEffect = { effect_type: "add_resources", payload: { resources: [] } };
const defaultManualNode = {
  name: "Manual Action",
  trigger: "manual_action",
  ends_turn: false,
  preconditions: { exhaust: true, empire_tags: [] },
  effects: [emptyEffect],
};

const groupedTags = (tags) =>
  (tags || []).reduce((groups, tag) => {
    const category = tag.category || "uncategorized";
    return { ...groups, [category]: [...(groups[category] || []), tag] };
  }, {});

const orderedGroupedTagEntries = (tags) =>
  Object.entries(groupedTags(tags)).sort(([left], [right]) => left.localeCompare(right));

const tagLabel = (value) => String(value || "").replace(/_/g, " ");

const catalogIdFromText = (value) =>
  String(value || "")
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const assetSrc = (value) => {
  return buildAssetUrl(value);
};

const tagIsVolatileResource = (tag) => tag?.data?.resource_type === "volatile";

const volatileResourceTags = (tags) => (tags || []).filter(tagIsVolatileResource);
const permanentOnlyTags = (tags) => (tags || []).filter((tag) => !tagIsVolatileResource(tag));

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

const removeBackground = (image, crop, outputSize = 96) => {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = outputSize;
  sourceCanvas.height = outputSize;
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, outputSize, outputSize);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputSize, outputSize);
  const imageData = context.getImageData(0, 0, outputSize, outputSize);
  const data = imageData.data;
  const background = [data[0], data[1], data[2]];
  const tolerance = 48;
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.sqrt(
      (data[index] - background[0]) ** 2 +
      (data[index + 1] - background[1]) ** 2 +
      (data[index + 2] - background[2]) ** 2
    );
    if (distance <= tolerance) data[index + 3] = 0;
  }
  context.putImageData(imageData, 0, 0);
  return sourceCanvas.toDataURL("image/png");
};

const IconImageEditor = ({ label, value, onChange }) => {
  const imageRef = useRef(null);
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [mode, setMode] = useState("choose");
  const [crop, setCrop] = useState({ x: 16, y: 16, width: 96, height: 96 });
  const [dragStart, setDragStart] = useState(null);
  const [saving, setSaving] = useState(false);

  const imageRect = () => imageRef.current?.getBoundingClientRect();
  const pointFromEvent = (event) => {
    const rect = imageRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  };

  const beginCrop = (event) => {
    if (mode !== "crop") return;
    const point = pointFromEvent(event);
    setDragStart(point);
    setCrop({ x: point.x, y: point.y, width: 1, height: 1 });
  };

  const updateCrop = (event) => {
    if (!dragStart || mode !== "crop") return;
    const point = pointFromEvent(event);
    setCrop({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.max(1, Math.abs(point.x - dragStart.x)),
      height: Math.max(1, Math.abs(point.y - dragStart.y)),
    });
  };

  const commitImage = async (dataUrl) => {
    setSaving(true);
    try {
      await onChange(dataUrl, sourceName);
      setSource("");
      setSourceName("");
      setMode("choose");
      setDragStart(null);
    } finally {
      setSaving(false);
    }
  };

  const saveCrop = () => {
    const image = imageRef.current;
    const rect = imageRect();
    if (!image || !rect) return;
    const naturalCrop = {
      x: Math.round((crop.x / rect.width) * image.naturalWidth),
      y: Math.round((crop.y / rect.height) * image.naturalHeight),
      width: Math.max(1, Math.round((crop.width / rect.width) * image.naturalWidth)),
      height: Math.max(1, Math.round((crop.height / rect.height) * image.naturalHeight)),
    };
    void commitImage(removeBackground(image, naturalCrop));
  };

  const closePanel = () => {
    setSource("");
    setSourceName("");
    setMode("choose");
    setDragStart(null);
  };

  const saveOriginal = () => {
    void commitImage(source);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{label}</h3>
          <p className="mt-1 text-xs text-slate-500">Upload an image as-is, or crop it and remove the crop background.</p>
        </div>
        {value ? <img alt="" className="h-10 w-10 rounded-md border border-slate-700 object-contain" src={assetSrc(value)} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload image
          <input
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ""));
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              setSource(dataUrl);
              setSourceName(file.name || "");
              setMode("choose");
              event.target.value = "";
            }}
            type="file"
          />
        </label>
        {value ? (
          <button
            className="rounded-md border border-rose-900/80 px-3 py-2 text-sm text-rose-200 hover:bg-rose-950/70"
            onClick={() => onChange("")}
            type="button"
          >
            Remove icon
          </button>
        ) : null}
      </div>
      {source ? (
        <div className="fixed inset-0 z-[1300] flex items-start justify-center overflow-y-auto bg-slate-950/85 px-4 py-8">
          <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Icon Image</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {mode === "crop" ? "Drag a rectangle. The top-left crop pixel becomes the removed background color." : "Choose how to save this upload."}
                </p>
              </div>
              <button className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" onClick={closePanel} type="button">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`rounded-md border px-3 py-2 text-sm ${mode === "choose" ? "border-teal-500 bg-teal-400/10 text-teal-100" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                onClick={() => setMode("choose")}
                type="button"
              >
                Original
              </button>
              <button
                className={`rounded-md border px-3 py-2 text-sm ${mode === "crop" ? "border-teal-500 bg-teal-400/10 text-teal-100" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                onClick={() => setMode("crop")}
                type="button"
              >
                Crop and remove background
              </button>
            </div>
            <div
              className="relative mt-4 inline-block max-w-full select-none overflow-visible rounded-md border border-slate-700"
              onMouseDown={beginCrop}
              onMouseMove={updateCrop}
              onMouseUp={() => setDragStart(null)}
              onMouseLeave={() => setDragStart(null)}
            >
              <img ref={imageRef} alt="" className="max-h-[65vh] max-w-full" src={source} draggable={false} />
              {mode === "crop" ? (
                <div
                  className="pointer-events-none absolute border-2 border-teal-300 bg-teal-300/15"
                  style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
                />
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={closePanel} type="button">
                Cancel
              </button>
              <button
                className="rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
                disabled={saving}
                onClick={mode === "crop" ? saveCrop : saveOriginal}
                type="button"
              >
                {saving ? "Saving..." : mode === "crop" ? "Save Cropped Icon" : "Use Original Image"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const ImageAssetSelect = ({ label, images, selectedId, onSelect }) => {
  const selected = (images || []).find((image) => image.id === selectedId);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{label}</h3>
          <p className="mt-1 text-xs text-slate-500">Select one of the images uploaded in the Images page.</p>
        </div>
        {selected?.data?.src ? <img alt="" className="h-12 w-12 rounded-md object-contain" src={assetSrc(selected.data.src)} /> : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(images || []).map((image) => {
          const active = selectedId === image.id;
          return (
            <button
              key={image.id}
              className={`flex min-h-24 flex-col items-center justify-between gap-2 rounded-md border p-2 text-left text-xs ${
                active ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => onSelect(image)}
              type="button"
            >
              {image.data?.src ? (
                <img alt="" className="h-14 w-full object-contain" src={assetSrc(image.data.src)} />
              ) : (
                <span className="flex h-14 w-full items-center justify-center rounded bg-slate-900 text-slate-600">No preview</span>
              )}
              <span className="w-full truncate text-center font-medium">{image.name}</span>
            </button>
          );
        })}
      </div>
      {(images || []).length === 0 ? <p className="mt-3 text-sm text-slate-500">No uploaded images yet.</p> : null}
      {selectedId ? (
        <button className="mt-3 rounded-md border border-rose-900/80 px-3 py-2 text-sm text-rose-200 hover:bg-rose-950/70" onClick={() => onSelect(null)} type="button">
          Clear image
        </button>
      ) : null}
    </div>
  );
};

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

const repeatedListToCounts = (items) => {
  if (!Array.isArray(items)) {
    return Object.fromEntries(
      Object.entries(items || {})
        .map(([tagId, count]) => [tagId, Number(count || 0)])
        .filter(([, count]) => count > 0)
    );
  }
  return items.reduce((counts, tagId) => {
    if (!tagId) return counts;
    return { ...counts, [tagId]: Number(counts[tagId] || 0) + 1 };
  }, {});
};

const defaultFoundationInitialSetup = (items) => {
  const ids = items
    .filter((item) => item.kind === "cards" && item.category === "structure")
    .map((item) => item.id)
    .slice(0, 10);
  return {
    "3": ids.slice(0, 6),
    "4": ids.slice(6, 8),
    "5": ids.slice(8, 10),
  };
};

const countsToRepeatedList = (counts) =>
  Object.entries(counts || {}).flatMap(([tagId, count]) =>
    Array.from({ length: Math.max(0, Number(count || 0)) }, () => tagId)
  );

const LogicNodeEditor = ({ logicNodes, setLogicNodes, tagEntries }) => {
  const updateNode = (index, patch) => {
    const next = [...logicNodes];
    next[index] = { ...next[index], ...patch };
    setLogicNodes(next);
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
  const resourceTags = volatileResourceTags(tagEntries);
  const permanentTags = permanentOnlyTags(tagEntries);

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
        const preconditions = node.preconditions || {};
        const empireTagCounts = repeatedListToCounts(preconditions.empire_tags || preconditions.required_empire_tags || {});
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
                  { value: "manual_action", label: "Manual" },
                  { value: "persistent", label: "Persistent effect" },
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
              <h5 className="text-sm font-semibold text-slate-300">Preconditions</h5>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <input
                  checked={Boolean(preconditions.exhaust)}
                  onChange={(event) => updateNode(nodeIndex, { preconditions: { ...preconditions, exhaust: event.target.checked } })}
                  type="checkbox"
                />
                Exhaust this card if it is ready
              </label>
              <TagCounterGroup
                label="Required Empire Tags"
                tags={permanentTags}
                values={empireTagCounts}
                onChange={(tagId, count) => {
                  const nextCounts = { ...empireTagCounts };
                  if (count <= 0) delete nextCounts[tagId];
                  else nextCounts[tagId] = count;
                  updateNode(nodeIndex, {
                    preconditions: { ...preconditions, empire_tags: countsToRepeatedList(nextCounts) },
                  });
                }}
              />
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
                    value={effect.effect_type || "add_resources"}
                    options={[
                      { value: "draw_card", label: "Draw from empire deck" },
                      { value: "add_resources", label: "Add resources" },
                      { value: "ready_building", label: "Ready a building" },
                    ]}
                    onChange={(value) => updateEffect(nodeIndex, effectIndex, {
                      effect_type: value,
                      payload: value === "draw_card" ? { amount: 1 } : value === "ready_building" ? {} : { resources: [] },
                    })}
                  />
                  {(effect.effect_type || "add_resources") === "add_resources" ? (
                    <>
                      <div className="sm:col-span-2">
                        <TagCounterGroup
                          label="Resources"
                          tags={resourceTags}
                          values={repeatedListToCounts(effect.payload?.resources || effect.payload?.mana || {})}
                          onChange={(tagId, count) => {
                            const currentCounts = repeatedListToCounts(effect.payload?.resources || effect.payload?.mana || {});
                            if (count <= 0) delete currentCounts[tagId];
                            else currentCounts[tagId] = count;
                            updateEffectPayload(nodeIndex, effectIndex, { resources: countsToRepeatedList(currentCounts) });
                          }}
                        />
                      </div>
                      <span />
                    </>
                  ) : effect.effect_type === "draw_card" ? (
                    <>
                      <span />
                      <label className="block">
                        <span className="text-sm font-medium text-slate-300">Cards</span>
                        <input
                          type="number"
                          min="1"
                          value={Number(effect.payload?.amount || 1)}
                          onChange={(event) => updateEffectPayload(nodeIndex, effectIndex, { amount: Number(event.target.value || 1) })}
                          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                        />
                      </label>
                    </>
                  ) : effect.effect_type === "ready_building" ? (
                    <p className="self-end pb-2 text-sm text-slate-400 sm:col-span-2">Readies one exhausted building.</p>
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
    </div>
  );
};

const CardGuidedFields = ({ category, data, setField, tagEntries, cardEntries, pillarEntries }) => {
  const conditionTags = tagEntries.filter((tag) => tag.category === "condition");
  const resourceTags = volatileResourceTags(tagEntries);
  const permanentTags = permanentOnlyTags(tagEntries);
  const cardOptions = cardEntries.filter((entry) => entry.kind === "cards");
  const requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const logicNodes = Array.isArray(data.logic_nodes) ? data.logic_nodes : [];
  const storage = data.storage && typeof data.storage === "object"
    ? data.storage
    : { capacity: Number(data.storage || 0), mode: "generic", resource_id: "" };
  const pillarModifiers = Array.isArray(data.built_pillar_modifiers) ? data.built_pillar_modifiers : [];

  const updateRequirement = (index, patch) => {
    const next = [...requirements];
    next[index] = { ...next[index], ...patch };
    setField("requirements", next);
  };

  return (
    <>
      <SelectField
        label="Placement"
        value={data.placement || "city"}
        options={placementOptions}
        onChange={(value) => setField("placement", value)}
      />

      {category === "city" ? (
        <NumberField
          label="Building Slots"
          value={data.building_slots || 3}
          onChange={(value) => setField("building_slots", Math.max(0, value))}
        />
      ) : null}

      <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-3">
        <h4 className="text-sm font-semibold text-slate-300">Resource Storage</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Capacity"
            value={storage.capacity || 0}
            onChange={(value) => {
              const capacity = Math.max(0, value);
              setField("storage", capacity ? { ...storage, capacity } : null);
            }}
          />
          <SelectField
            label="Storage Type"
            value={storage.mode || "generic"}
            options={[
              { value: "generic", label: "Any resource" },
              { value: "specific", label: "Specific resource" },
            ]}
            onChange={(mode) => setField("storage", { ...storage, capacity: Math.max(1, Number(storage.capacity || 1)), mode, resource_id: mode === "specific" ? storage.resource_id || "" : "" })}
          />
          {storage.mode === "specific" ? (
            <SelectField
              label="Resource"
              value={storage.resource_id || ""}
              options={[{ value: "", label: "Select resource" }, ...resourceTags.map((tag) => ({ value: tag.id, label: tag.name }))]}
              onChange={(resourceId) => setField("storage", { ...storage, capacity: Math.max(1, Number(storage.capacity || 1)), mode: "specific", resource_id: resourceId })}
            />
          ) : <span />}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">Pillar Changes When Built</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("built_pillar_modifiers", [...pillarModifiers, { pillar_id: "", amount: 1 }])}
            type="button"
          >
            Add change
          </button>
        </div>
        {pillarModifiers.map((modifier, index) => (
          <div key={index} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1fr_8rem_auto]">
            <SelectField
              label="Pillar"
              value={modifier.pillar_id || ""}
              options={[{ value: "", label: "Select pillar" }, ...pillarEntries.map((pillar) => ({ value: pillar.id, label: pillar.name }))]}
              onChange={(pillarId) => {
                const next = [...pillarModifiers];
                next[index] = { ...modifier, pillar_id: pillarId };
                setField("built_pillar_modifiers", next);
              }}
            />
            <NumberField
              label="Change"
              value={modifier.amount || 0}
              onChange={(amount) => {
                const next = [...pillarModifiers];
                next[index] = { ...modifier, amount };
                setField("built_pillar_modifiers", next);
              }}
            />
            <button
              className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setField("built_pillar_modifiers", pillarModifiers.filter((_, itemIndex) => itemIndex !== index))}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <TagCounterGroup
        label="Permanent Tags"
        tags={permanentTags}
        values={data.tags || {}}
        onChange={(tagId, count) => {
          const current = data.tags && typeof data.tags === "object" && !Array.isArray(data.tags) ? { ...data.tags } : {};
          if (count <= 0) delete current[tagId];
          else current[tagId] = count;
          setField("tags", current);
        }}
      />

      <TagCounterGroup
        label="Volatile Resource Cost"
        tags={resourceTags}
        values={data.cost || {}}
        onChange={(tagId, count) => {
          const current = data.cost && typeof data.cost === "object" && !Array.isArray(data.cost) ? { ...data.cost } : {};
          if (count <= 0) delete current[tagId];
          else current[tagId] = count;
          setField("cost", current);
        }}
      />

      <TagCounterGroup
        label="Required City Tags"
        tags={permanentTags}
        values={data.required_city_tags || {}}
        onChange={(tagId, count) => {
          const current = data.required_city_tags && typeof data.required_city_tags === "object" && !Array.isArray(data.required_city_tags) ? { ...data.required_city_tags } : {};
          if (count <= 0) delete current[tagId];
          else current[tagId] = count;
          setField("required_city_tags", current);
        }}
      />

      <TagCounterGroup
        label="Pitch Tags"
        tags={permanentTags}
        values={data.pitches || {}}
        onChange={(tagId, count) => {
          const current = data.pitches && typeof data.pitches === "object" && !Array.isArray(data.pitches) ? { ...data.pitches } : {};
          if (count <= 0) delete current[tagId];
          else current[tagId] = count;
          setField("pitches", current);
        }}
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

    </>
  );
};

const MinistryGuidedFields = ({ data, setField, imageEntries }) => {
  const ministerSymbol = data.symbol ?? "";
  const ministerIconImageId = data.icon_image_id ?? "";

  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-slate-300">Minister Symbol</span>
        <input
          value={ministerSymbol}
          onChange={(event) => setField("symbol", event.target.value)}
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
          placeholder="WAR"
        />
      </label>
      <ImageAssetSelect
        label="Minister Icon"
        images={imageEntries}
        selectedId={ministerIconImageId}
        onSelect={(image) => {
          setField("icon_image_id", image?.id || "");
          setField("icon", "");
        }}
      />

      <SelectField
        label="Ministry Office"
        value={data.role || ""}
        options={[
          { value: "", label: "Select office" },
          { value: "empire", label: "Minister of the Empire" },
          { value: "cities", label: "Minister of Cities" },
          { value: "state", label: "Minister of State" },
          { value: "health", label: "Minister of Health & Harvest" },
          { value: "war", label: "Minister of War" },
        ]}
        onChange={(value) => setField("role", value)}
      />
    </>
  );
};

const effectIconCodeOptions = [
  { value: "modify_pillar", label: "Modify Pillar" },
  { value: "modify_resources", label: "Modify Resources" },
  { value: "convert_resources", label: "Convert Resources" },
  { value: "draw_card", label: "Pending Draw" },
  { value: "reduce_refill_draws", label: "Reduce Refill Draws" },
  { value: "destroy_building", label: "Destroy Building" },
  { value: "remove_all_resources", label: "Remove All Resources" },
  { value: "discard_cards", label: "Discard Cards" },
  { value: "modify_plague", label: "Modify Plague" },
  { value: "modify_unrest", label: "Modify Unrest" },
  { value: "modify_fortified", label: "Modify Fortified" },
  { value: "modify_city_tokens", label: "Modify Multiple Tokens on One City" },
  { value: "suppress_plague_morale", label: "Plague Does Not Reduce Morale This Era" },
  { value: "waive_next_structure_tag_requirement", label: "Waive Next Structure Tag Requirement" },
  { value: "add_building_slots", label: "Add Building Slots" },
  { value: "storage", label: "Storage" },
];

const effectIconOptionLabel = (effectType) =>
  effectIconCodeOptions.find((option) => option.value === effectType)?.label || tagLabel(effectType);

const effectIconCatalogIdentity = (effectType) => {
  const baseId = catalogIdFromText(effectType || "effect");
  return {
    id: `${baseId || "effect"}-icon`,
    name: `${effectIconOptionLabel(effectType || "effect")} Icon`,
  };
};

const NumberField = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-slate-300">{label}</span>
    <input
      type="number"
      value={Number(value || 0)}
      onChange={(event) => onChange(Number(event.target.value || 0))}
      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
    />
  </label>
);

const TextField = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-slate-300">{label}</span>
    <input
      type="text"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
    />
  </label>
);

const agendaConditionOptions = [
  ["tag_count", "Tag count"],
  ["tag_compare", "Compare two tags"],
  ["tag_sum_compare", "Compare tag groups"],
  ["production", "Resource production"],
  ["capacity", "Resource capacity"],
  ["collapsed_pillar", "Collapsed Pillar"],
  ["not_collapsed_pillar", "Pillar survives"],
  ["highest_surviving_pillar", "Highest surviving Pillar"],
  ["token_count", "Token count"],
  ["tag_plus_token_count", "Tag plus token count"],
  ["no_city_has_plague_exceeding_sanitary", "Plague does not exceed Sanitary"],
  ["distinct_tags_at_least", "Distinct tags"],
  ["all_tags_at_most", "All selected tags at most"],
  ["tag_is_highest", "Tag is highest"],
].map(([value, label]) => ({ value, label }));

const comparisonOptions = [
  { value: "gt", label: "More than" },
  { value: "gte", label: "At least" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "At most" },
  { value: "eq", label: "Exactly" },
];

const defaultAgendaCondition = (type) => {
  const defaults = {
    tag_count: { tag: "", operator: "gte", amount: 1 },
    tag_compare: { left: "", operator: "gt", right: "" },
    tag_sum_compare: { left_tags: [], operator: "gt", right_tags: [] },
    production: { resource: "", operator: "gte", amount: 1 },
    capacity: { resource: "", operator: "gte", amount: 1 },
    collapsed_pillar: { pillar: "" },
    not_collapsed_pillar: { pillar: "" },
    highest_surviving_pillar: { pillar: "" },
    token_count: { token: "plague", scope: "empire", operator: "gte", amount: 1 },
    tag_plus_token_count: { tag: "", token: "fortified", scope: "empire", operator: "gte", amount: 1 },
    no_city_has_plague_exceeding_sanitary: {},
    distinct_tags_at_least: { tags: [], minimum_distinct: 4, minimum_each: 1 },
    all_tags_at_most: { tags: [], amount: 3 },
    tag_is_highest: { tag: "" },
  };
  return { type, ...(defaults[type] || {}) };
};

const AgendaConditionFields = ({ condition, onChange, onReplace, tagEntries, pillarEntries }) => {
  const conditionType = condition.type || "tag_count";
  const resources = volatileResourceTags(tagEntries);
  const tags = permanentOnlyTags(tagEntries);
  const tagOptions = [{ value: "", label: "Select tag" }, ...tags.map((tag) => ({ value: tag.id, label: tag.name }))];
  const resourceOptions = [{ value: "", label: "Select resource" }, ...resources.map((tag) => ({ value: tag.id, label: tag.name }))];
  const pillarOptions = [{ value: "", label: "Select Pillar" }, ...pillarEntries.map((pillar) => ({ value: pillar.id, label: pillar.name }))];
  const tokenOptions = [
    { value: "plague", label: "Plague" },
    { value: "global_unrest", label: "Global Unrest" },
    { value: "fortified", label: "Fortified" },
  ];
  const toggleTag = (field, tagId) => {
    const current = Array.isArray(condition[field]) ? condition[field] : [];
    onChange({
      [field]: current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId],
    });
  };
  const comparisonAndAmount = (
    <>
      <SelectField label="Comparison" value={condition.operator || "gte"} options={comparisonOptions} onChange={(operator) => onChange({ operator })} />
      <NumberField label="Amount" value={condition.amount ?? 1} onChange={(amount) => onChange({ amount })} />
    </>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Condition"
        value={conditionType}
        options={agendaConditionOptions}
        onChange={(type) => onReplace(defaultAgendaCondition(type))}
      />
      {conditionType === "tag_count" ? (
        <>
          <SelectField label="Tag" value={condition.tag || ""} options={tagOptions} onChange={(tag) => onChange({ tag })} />
          {comparisonAndAmount}
        </>
      ) : conditionType === "tag_compare" ? (
        <>
          <SelectField label="Left Tag" value={condition.left || ""} options={tagOptions} onChange={(left) => onChange({ left })} />
          <SelectField label="Comparison" value={condition.operator || "gt"} options={comparisonOptions} onChange={(operator) => onChange({ operator })} />
          <SelectField label="Right Tag" value={condition.right || ""} options={tagOptions} onChange={(right) => onChange({ right })} />
        </>
      ) : conditionType === "tag_sum_compare" ? (
        <div className="space-y-3 sm:col-span-2">
          <TagToggleGroup label="Left Tags" tags={tags} selectedIds={condition.left_tags || []} onToggle={(tagId) => toggleTag("left_tags", tagId)} />
          <SelectField label="Comparison" value={condition.operator || "gt"} options={comparisonOptions} onChange={(operator) => onChange({ operator })} />
          <TagToggleGroup label="Right Tags" tags={tags} selectedIds={condition.right_tags || []} onToggle={(tagId) => toggleTag("right_tags", tagId)} />
        </div>
      ) : ["production", "capacity"].includes(conditionType) ? (
        <>
          <SelectField label="Resource" value={condition.resource || ""} options={resourceOptions} onChange={(resource) => onChange({ resource })} />
          {comparisonAndAmount}
        </>
      ) : ["collapsed_pillar", "not_collapsed_pillar", "highest_surviving_pillar"].includes(conditionType) ? (
        <SelectField label="Pillar" value={condition.pillar || ""} options={pillarOptions} onChange={(pillar) => onChange({ pillar })} />
      ) : conditionType === "token_count" ? (
        <>
          <SelectField label="Token" value={condition.token || "plague"} options={tokenOptions} onChange={(token) => onChange({ token, scope: "empire" })} />
          {comparisonAndAmount}
        </>
      ) : conditionType === "tag_plus_token_count" ? (
        <>
          <SelectField label="Tag" value={condition.tag || ""} options={tagOptions} onChange={(tag) => onChange({ tag })} />
          <SelectField label="Token" value={condition.token || "fortified"} options={tokenOptions} onChange={(token) => onChange({ token, scope: "empire" })} />
          {comparisonAndAmount}
        </>
      ) : conditionType === "distinct_tags_at_least" ? (
        <div className="space-y-3 sm:col-span-2">
          <TagToggleGroup label="Eligible Tags" tags={tags} selectedIds={condition.tags || []} onToggle={(tagId) => toggleTag("tags", tagId)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Minimum Distinct" value={condition.minimum_distinct ?? 4} onChange={(minimum_distinct) => onChange({ minimum_distinct })} />
            <NumberField label="Minimum Each" value={condition.minimum_each ?? 1} onChange={(minimum_each) => onChange({ minimum_each })} />
          </div>
        </div>
      ) : conditionType === "all_tags_at_most" ? (
        <div className="space-y-3 sm:col-span-2">
          <TagToggleGroup label="Tags" tags={tags} selectedIds={condition.tags || []} onToggle={(tagId) => toggleTag("tags", tagId)} />
          <NumberField label="Maximum Each" value={condition.amount ?? 3} onChange={(amount) => onChange({ amount })} />
        </div>
      ) : conditionType === "tag_is_highest" ? (
        <SelectField label="Tag" value={condition.tag || ""} options={tagOptions} onChange={(tag) => onChange({ tag })} />
      ) : null}
    </div>
  );
};

const AgendaGuidedFields = ({ data, setField, tagEntries, pillarEntries }) => {
  const sectionDefinitions = [
    ["primary", "Primary Legacy", 4],
    ["secondary", "Secondary Legacy", 2],
    ["collapse", "Collapse Preference", 2],
    ["forbidden", "Forbidden Future", -1],
  ];
  const updateSection = (sectionKey, patch) => {
    setField(sectionKey, { ...(data[sectionKey] || {}), ...patch });
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Maximum Points" value={data.max_points ?? 8} onChange={(value) => setField("max_points", Math.max(1, value))} />
        <NumberField label="Win Threshold" value={data.win_threshold ?? 6} onChange={(value) => setField("win_threshold", Math.max(1, value))} />
      </div>
      {sectionDefinitions.map(([sectionKey, label, points]) => {
        const section = data[sectionKey] || { name: "", text: "", points, conditions: [] };
        const conditions = Array.isArray(section.conditions) ? section.conditions : [];
        return (
          <section key={sectionKey} className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-200">{label} · {points} points</h4>
              <button
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => updateSection(sectionKey, {
                  points,
                  conditions: [...conditions, defaultAgendaCondition("tag_count")],
                })}
                type="button"
              >
                Add condition
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Objective Name" value={section.name || ""} onChange={(name) => updateSection(sectionKey, { name, points })} />
              <TextField label="Card Text" value={section.text || ""} onChange={(text) => updateSection(sectionKey, { text, points })} />
            </div>
            {conditions.map((condition, index) => (
              <div key={index} className="rounded-md border border-slate-800 bg-slate-900 p-3">
                <AgendaConditionFields
                  condition={condition}
                  tagEntries={tagEntries}
                  pillarEntries={pillarEntries}
                  onChange={(patch) => {
                    const next = [...conditions];
                    next[index] = { ...next[index], ...patch };
                    updateSection(sectionKey, { points, conditions: next });
                  }}
                  onReplace={(replacement) => {
                    const next = [...conditions];
                    next[index] = replacement;
                    updateSection(sectionKey, { points, conditions: next });
                  }}
                />
                <button
                  className="mt-3 text-xs font-semibold text-rose-300 hover:text-rose-200"
                  onClick={() => updateSection(sectionKey, {
                    points,
                    conditions: conditions.filter((_, conditionIndex) => conditionIndex !== index),
                  })}
                  type="button"
                >
                  Remove condition
                </button>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
};

const PillarGuidedFields = ({ data, setField, imageEntries }) => {
  const rangeEffectsText = JSON.stringify(Array.isArray(data.range_effects) ? data.range_effects : [], null, 2);
  return (
    <>
      <ImageAssetSelect
        label="Pillar Icon"
        images={imageEntries}
        selectedId={data.icon_image_id || ""}
        onSelect={(image) => {
          setField("icon_image_id", image?.id || "");
          setField("icon", "");
        }}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Minimum" value={data.min ?? 0} onChange={(value) => setField("min", value)} />
        <NumberField label="Maximum" value={data.max ?? 10} onChange={(value) => setField("max", value)} />
        <NumberField label="Starting Value" value={data.start ?? 5} onChange={(value) => setField("start", value)} />
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-300">Range Effects JSON</span>
        <textarea
          value={rangeEffectsText}
          onChange={(event) => {
            try {
              const parsed = JSON.parse(event.target.value || "[]");
              setField("range_effects", Array.isArray(parsed) ? parsed : []);
            } catch (_error) {
              setField("range_effects_text", event.target.value);
            }
          }}
          className="mt-2 min-h-[7rem] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-teal-400"
          spellCheck={false}
        />
      </label>
    </>
  );
};

const EffectIconGuidedFields = ({ data, setField, imageEntries, editingEntry, setCatalogForm }) => {
  const applyEffectIdentity = (effectType) => {
    if (!effectType || editingEntry) return;
    const identity = effectIconCatalogIdentity(effectType);
    setCatalogForm((state) => ({
      ...state,
      id: identity.id,
      name: identity.name,
    }));
  };

  return (
    <>
      <SelectField
        label="Effect Code"
        value={data.effect_type || ""}
        options={[{ value: "", label: "Select effect code" }, ...effectIconCodeOptions]}
        onChange={(value) => {
          setField("effect_type", value);
          applyEffectIdentity(value);
        }}
      />
      <ImageAssetSelect
        label="Effect Icon"
        images={imageEntries}
        selectedId={data.icon_image_id || ""}
        onSelect={(image) => {
          setField("icon_image_id", image?.id || "");
          setField("icon", "");
        }}
      />
      <p className="text-xs text-slate-500">Effect icon id and name are generated from the selected effect code.</p>
    </>
  );
};

const updateCountMap = (value, itemId, count) => {
  const next = { ...(value || {}) };
  if (count <= 0) delete next[itemId];
  else next[itemId] = count;
  return next;
};

const DevelopmentCardGuidedFields = ({ category, data, setField, tagEntries, pillarEntries, tokenEntries = [], imageEntries = [] }) => {
  const onBuildEffects = Array.isArray(data.on_build_effects) ? data.on_build_effects : [];
  const persistentEffects = Array.isArray(data.persistent_effects) ? data.persistent_effects : [];
  const imageLookup = Object.fromEntries((imageEntries || []).map((image) => [image.id, image]));
  const resolvedTagEntries = (tagEntries || []).map((tag) => {
    const iconSrc = imageLookup[tag.data?.icon_image_id]?.data?.src;
    return iconSrc ? { ...tag, data: { ...(tag.data || {}), icon: iconSrc } } : tag;
  });
  const resources = volatileResourceTags(resolvedTagEntries);
  const permanentTags = permanentOnlyTags(resolvedTagEntries);

  const updateEffect = (field, effects, index, patch) => {
    const next = [...effects];
    next[index] = { ...next[index], ...patch };
    setField(field, next);
  };

  return (
    <>
      {category === "city" ? (
        <NumberField
          label="Building Slots"
          value={data.building_slots ?? 0}
          onChange={(value) => setField("building_slots", Math.max(0, value))}
        />
      ) : null}
      <TagCounterGroup
        label="Required Tags to Build"
        tags={permanentTags}
        values={data.required_tags || {}}
        onChange={(tagId, count) => setField("required_tags", updateCountMap(data.required_tags, tagId, count))}
      />
      <TagCounterGroup
        label="Required Resources to Build"
        tags={resources}
        values={data.cost || {}}
        onChange={(tagId, count) => setField("cost", updateCountMap(data.cost, tagId, count))}
      />
      <TagCounterGroup
        label="Tags Provided"
        tags={permanentTags}
        values={data.tags || {}}
        onChange={(tagId, count) => setField("tags", updateCountMap(data.tags, tagId, count))}
      />
      <TagCounterGroup
        label="Resources Provided Each Era"
        tags={resources}
        values={data.production || {}}
        onChange={(tagId, count) => setField("production", updateCountMap(data.production, tagId, count))}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">When Built Effects</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("on_build_effects", [...onBuildEffects, { effect_type: "modify_pillar", payload: { pillar_id: "", amount: 1 } }])}
            type="button"
          >
            Add effect
          </button>
        </div>
        {onBuildEffects.map((effect, index) => (
          <div key={index} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[11rem_1fr_8rem_auto]">
            <SelectField
              label="Effect"
              value={effect.effect_type || "modify_pillar"}
              options={[
                { value: "modify_pillar", label: "Modify pillar" },
                { value: "modify_token", label: "Modify token" },
              ]}
              onChange={(effectType) => updateEffect("on_build_effects", onBuildEffects, index, {
                effect_type: effectType,
                payload: effectType === "modify_token"
                  ? { token_id: "", amount: 1 }
                  : { pillar_id: "", amount: 1 },
              })}
            />
            {effect.effect_type === "modify_token" ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Token</span>
                <span className="mt-2 flex items-center gap-2">
                  {effect.payload?.token_id ? (
                    <img
                      alt=""
                      className="h-8 w-8 object-contain"
                      src={assetSrc(imageLookup[tokenEntries.find((token) => token.id === effect.payload?.token_id)?.data?.icon_image_id]?.data?.src || "")}
                    />
                  ) : null}
                  <select
                    value={effect.payload?.token_id || ""}
                    onChange={(event) => updateEffect("on_build_effects", onBuildEffects, index, {
                      payload: { ...(effect.payload || {}), token_id: event.target.value },
                    })}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                  >
                    <option value="">Select token</option>
                    {tokenEntries.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}
                  </select>
                </span>
              </label>
            ) : (
              <SelectField
                label="Pillar"
                value={effect.payload?.pillar_id || ""}
                options={[{ value: "", label: "Select pillar" }, ...pillarEntries.map((pillar) => ({ value: pillar.id, label: pillar.name }))]}
                onChange={(pillarId) => updateEffect("on_build_effects", onBuildEffects, index, {
                  payload: { ...(effect.payload || {}), pillar_id: pillarId },
                })}
              />
            )}
            <NumberField
              label="Change"
              value={effect.payload?.amount ?? 1}
              onChange={(amount) => updateEffect("on_build_effects", onBuildEffects, index, {
                payload: { ...(effect.payload || {}), amount },
              })}
            />
            <button
              className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setField("on_build_effects", onBuildEffects.filter((_, effectIndex) => effectIndex !== index))}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">Persistent Effects</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("persistent_effects", [...persistentEffects, { effect_type: "storage", payload: { amount: 1, resource_id: "" } }])}
            type="button"
          >
            Add effect
          </button>
        </div>
        {persistentEffects.map((effect, index) => (
          <div key={index} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[12rem_1fr_8rem_auto]">
            <SelectField
              label="Effect"
              value={effect.effect_type || "storage"}
              options={[
                { value: "storage", label: "Add storage" },
                { value: "add_building_slots", label: "Add building slots" },
              ]}
              onChange={(effectType) => updateEffect("persistent_effects", persistentEffects, index, {
                effect_type: effectType,
                payload: effectType === "storage" ? { amount: 1, resource_id: "" } : { amount: 1 },
              })}
            />
            {effect.effect_type === "add_building_slots" ? (
              <p className="self-end pb-2 text-sm text-slate-400">Adds slots to this City.</p>
            ) : (
              <SelectField
                label="Stored Resource"
                value={effect.payload?.resource_id || ""}
                options={[{ value: "", label: "Any resource" }, ...resources.map((resource) => ({ value: resource.id, label: resource.name }))]}
                onChange={(resourceId) => updateEffect("persistent_effects", persistentEffects, index, {
                  payload: { ...(effect.payload || {}), resource_id: resourceId },
                })}
              />
            )}
            <NumberField
              label={effect.effect_type === "add_building_slots" ? "Slots" : "Capacity"}
              value={effect.payload?.amount ?? 1}
              onChange={(amount) => updateEffect("persistent_effects", persistentEffects, index, {
                payload: { ...(effect.payload || {}), amount: Math.max(1, amount) },
              })}
            />
            <button
              className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setField("persistent_effects", persistentEffects.filter((_, effectIndex) => effectIndex !== index))}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </>
  );
};

const eventEffectOptions = [
  { value: "modify_pillar", label: "Modify pillar" },
  { value: "modify_resources", label: "Add or remove resources" },
  { value: "convert_resources", label: "Convert resources" },
  { value: "draw_card", label: "Choice Minister gains a pending draw" },
  { value: "reduce_refill_draws", label: "All players draw 1 less during refill" },
  { value: "destroy_building", label: "Destroy building" },
  { value: "remove_all_resources", label: "Remove all remaining resources" },
  { value: "discard_cards", label: "Discard cards from hand" },
  { value: "modify_plague", label: "Add or remove Plague tokens" },
  { value: "modify_unrest", label: "Add or remove Unrest tokens" },
  { value: "modify_fortified", label: "Add or remove Fortified tokens" },
  { value: "modify_city_tokens", label: "Add or remove multiple tokens on one City" },
  { value: "suppress_plague_morale", label: "Plague does not reduce Morale this Era" },
  { value: "waive_next_structure_tag_requirement", label: "Waive 1 tag on next Structure" },
];

const EventEffects = ({ effects, setEffects, tagEntries, pillarEntries }) => {
  const resources = volatileResourceTags(tagEntries);
  const permanentTags = permanentOnlyTags(tagEntries);
  const updateEffect = (index, patch) => {
    const next = [...effects];
    next[index] = { ...next[index], ...patch };
    setEffects(next);
  };
  const updatePayload = (index, patch) => updateEffect(index, {
    payload: { ...(effects[index]?.payload || {}), ...patch },
  });

  return (
    <div className="space-y-2">
      {effects.map((effect, index) => (
        <div key={index} className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-3">
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr_8rem_auto]">
            <SelectField
              label="Effect"
              value={effect.effect_type || "modify_pillar"}
              options={eventEffectOptions}
              onChange={(effectType) => updateEffect(index, { effect_type: effectType, payload: {} })}
            />
            {effect.effect_type === "modify_pillar" ? (
              <>
                <SelectField
                  label="Pillar"
                  value={effect.payload?.pillar_id || ""}
                  options={[{ value: "", label: "Select pillar" }, ...pillarEntries.map((pillar) => ({ value: pillar.id, label: pillar.name }))]}
                  onChange={(pillarId) => updatePayload(index, { pillar_id: pillarId })}
                />
                <NumberField label="Change" value={effect.payload?.amount ?? -1} onChange={(amount) => updatePayload(index, { amount })} />
              </>
            ) : effect.effect_type === "modify_resources" ? (
              <>
                <SelectField
                  label="Resource"
                  value={effect.payload?.resource_id ? "specific" : "general"}
                  options={[
                    { value: "general", label: "General - Health & Harvest decides" },
                    { value: "specific", label: "Specified resource" },
                  ]}
                  onChange={(mode) => updateEffect(index, {
                    payload: {
                      amount: effect.payload?.amount || 1,
                      resource_id: mode === "specific" ? resources[0]?.id || "" : "",
                    },
                  })}
                />
                {effect.payload?.resource_id ? (
                  <SelectField
                    label="Resource Type"
                    value={effect.payload.resource_id}
                    options={resources.map((resource) => ({ value: resource.id, label: resource.name }))}
                    onChange={(resourceId) => updatePayload(index, { resource_id: resourceId })}
                  />
                ) : null}
                <NumberField
                  label="Change"
                  value={effect.payload?.amount ?? 1}
                  onChange={(amount) => updatePayload(index, { amount })}
                />
              </>
            ) : effect.effect_type === "convert_resources" ? (
              <>
                <SelectField
                  label="From"
                  value={effect.payload?.source_resource_id || ""}
                  options={[
                    { value: "", label: "General - minister chooses" },
                    ...resources.map((resource) => ({ value: resource.id, label: resource.name })),
                  ]}
                  onChange={(sourceResourceId) => updatePayload(index, {
                    source_resource_id: sourceResourceId,
                  })}
                />
                <SelectField
                  label="To"
                  value={effect.payload?.target_resource_id || ""}
                  options={[
                    { value: "", label: "General - minister chooses" },
                    ...resources
                      .filter((resource) => resource.id !== effect.payload?.source_resource_id)
                      .map((resource) => ({ value: resource.id, label: resource.name })),
                  ]}
                  onChange={(targetResourceId) => updatePayload(index, {
                    target_resource_id: targetResourceId,
                  })}
                />
                <NumberField
                  label="Up to"
                  value={effect.payload?.amount ?? 1}
                  onChange={(amount) => updatePayload(index, { amount: Math.max(1, amount) })}
                />
              </>
            ) : effect.effect_type === "destroy_building" ? (
              <>
                <SelectField
                  label="Eligible Building Tag"
                  value={effect.payload?.tag_id || ""}
                  options={[{ value: "", label: "Any building" }, ...permanentTags.map((tag) => ({ value: tag.id, label: tag.name }))]}
                  onChange={(tagId) => updatePayload(index, { tag_id: tagId, decider: "minister-of-state" })}
                />
                <NumberField label="Buildings" value={effect.payload?.amount ?? 1} onChange={(amount) => updatePayload(index, { amount: Math.max(1, amount), decider: "minister-of-state" })} />
              </>
            ) : effect.effect_type === "draw_card" ? (
              <p className="self-end pb-2 text-sm text-slate-400 sm:col-span-2">
                The Choice Minister draws one additional card during this Era's Hand Refill. The Minister of the Empire receives it if missing.
              </p>
            ) : effect.effect_type === "reduce_refill_draws" ? (
              <p className="self-end pb-2 text-sm text-slate-400 sm:col-span-2">
                Every player draws one fewer card during this Era&apos;s Hand Refill.
              </p>
            ) : effect.effect_type === "discard_cards" ? (
              <>
                <SelectField
                  label="Discard"
                  value={effect.payload?.amount == null ? "all" : "amount"}
                  options={[{ value: "all", label: "All cards" }, { value: "amount", label: "Specific amount" }]}
                  onChange={(mode) => updateEffect(index, { payload: { target: "all_players", amount: mode === "all" ? null : 1 } })}
                />
                {effect.payload?.amount == null ? <span /> : (
                  <NumberField label="Cards" value={effect.payload?.amount ?? 1} onChange={(amount) => updatePayload(index, { amount: Math.max(1, amount), target: "all_players" })} />
                )}
              </>
            ) : ["modify_plague", "modify_unrest", "modify_fortified"].includes(effect.effect_type) ? (
              <>
                <SelectField
                  label="Placement"
                  value={effect.payload?.scope || (effect.effect_type === "modify_unrest" ? "unspecified" : "city")}
                  options={[
                    { value: "city", label: "City" },
                    ...(effect.effect_type === "modify_unrest"
                      ? [{ value: "global", label: "Global" }, { value: "unspecified", label: "Minister decides" }]
                      : []),
                  ]}
                  onChange={(scope) => updatePayload(index, { scope })}
                />
                <NumberField label="Change" value={effect.payload?.amount ?? 1} onChange={(amount) => updatePayload(index, { amount })} />
              </>
            ) : effect.effect_type === "modify_city_tokens" ? (
              <>
                <NumberField
                  label="Plague"
                  value={effect.payload?.tokens?.["plague-token"] ?? 0}
                  onChange={(amount) => updatePayload(index, {
                    tokens: { ...(effect.payload?.tokens || {}), "plague-token": amount },
                  })}
                />
                <NumberField
                  label="Unrest"
                  value={effect.payload?.tokens?.["unrest-token"] ?? 0}
                  onChange={(amount) => updatePayload(index, {
                    tokens: { ...(effect.payload?.tokens || {}), "unrest-token": amount },
                  })}
                />
                <NumberField
                  label="Fortified"
                  value={effect.payload?.tokens?.["fortified-token"] ?? 0}
                  onChange={(amount) => updatePayload(index, {
                    tokens: { ...(effect.payload?.tokens || {}), "fortified-token": amount },
                  })}
                />
              </>
            ) : effect.effect_type === "suppress_plague_morale" ? (
              <p className="self-end pb-2 text-sm text-slate-400 sm:col-span-2">
                Until this Era ends, Plague checks do not reduce Morale.
              </p>
            ) : (
              <p className="self-end pb-2 text-sm text-slate-400 sm:col-span-2">Applies to the shared Empire pool.</p>
            )}
            <button
              className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
              onClick={() => setEffects(effects.filter((_, effectIndex) => effectIndex !== index))}
              type="button"
            >
              Remove
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <input
              checked={Boolean(effect.condition)}
              onChange={(event) => updateEffect(index, {
                condition: event.target.checked
                  ? { source_type: "resource", source_id: "", operator: "gte", target_type: "number", amount: 1 }
                  : null,
              })}
              type="checkbox"
            />
            Apply only when a condition is met
          </label>
          {effect.condition ? (
            <div className="grid gap-2 sm:grid-cols-5">
              <SelectField
                label="Condition Type"
                value={effect.condition.source_type || "resource"}
                options={[
                  { value: "resource", label: "Resource" },
                  { value: "tag", label: "Tag" },
                  { value: "pillar", label: "Pillar" },
                ]}
                onChange={(sourceType) => updateEffect(index, {
                  condition: {
                    ...effect.condition,
                    source_type: sourceType,
                    source_id: "",
                    target_type: sourceType === "tag" ? effect.condition.target_type || "number" : "number",
                    target_id: "",
                  },
                })}
              />
              <SelectField
                label="Value"
                value={effect.condition.source_id || ""}
                options={[
                  { value: "", label: "Select value" },
                  ...(effect.condition.source_type === "pillar"
                    ? pillarEntries
                    : effect.condition.source_type === "tag"
                      ? permanentTags
                      : resources
                  ).map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
                onChange={(sourceId) => updateEffect(index, { condition: { ...effect.condition, source_id: sourceId } })}
              />
              <SelectField
                label="Comparison"
                value={effect.condition.operator || "gte"}
                options={[
                  { value: "gt", label: "More than" },
                  { value: "gte", label: "At least" },
                  { value: "lt", label: "Less than" },
                  { value: "lte", label: "At most" },
                  { value: "eq", label: "Exactly" },
                ]}
                onChange={(operator) => updateEffect(index, { condition: { ...effect.condition, operator } })}
              />
              <SelectField
                label="Compare Against"
                value={effect.condition.target_type || "number"}
                options={[
                  { value: "number", label: "Fixed number" },
                  ...(effect.condition.source_type === "tag"
                    ? [{ value: "tag", label: "Another tag count" }]
                    : []),
                ]}
                onChange={(targetType) => updateEffect(index, {
                  condition: {
                    ...effect.condition,
                    target_type: targetType,
                    target_id: "",
                    amount: targetType === "number" ? effect.condition.amount ?? 1 : undefined,
                  },
                })}
              />
              {effect.condition.target_type === "tag" ? (
                <SelectField
                  label="Comparison Tag"
                  value={effect.condition.target_id || ""}
                  options={[
                    { value: "", label: "Select tag" },
                    ...permanentTags.map((tag) => ({ value: tag.id, label: tag.name })),
                  ]}
                  onChange={(targetId) => updateEffect(index, {
                    condition: { ...effect.condition, target_id: targetId },
                  })}
                />
              ) : (
                <NumberField label="Amount" value={effect.condition.amount ?? 1} onChange={(amount) => updateEffect(index, { condition: { ...effect.condition, amount } })} />
              )}
            </div>
          ) : null}
        </div>
      ))}
      <button
        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        onClick={() => setEffects([...effects, { effect_type: "modify_pillar", payload: { pillar_id: "", amount: -1 } }])}
        type="button"
      >
        Add effect
      </button>
    </div>
  );
};

const EventGuidedFields = ({ data, setField, tagEntries, ministryEntries, pillarEntries }) => {
  const requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const updateRequirement = (index, patch) => {
    const next = [...requirements];
    next[index] = { ...next[index], ...patch };
    setField("requirements", next);
  };
  return (
    <>
      <SelectField
        label="Choice Minister (Optional)"
        value={data.ministry_id || ""}
        options={[
          { value: "", label: "None - use normal rules" },
          ...ministryEntries.map((ministry) => ({ value: ministry.id, label: ministry.name })),
        ]}
        onChange={(ministryId) => setField("ministry_id", ministryId)}
      />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">Resolution Requirements</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("requirements", [...requirements, { type: "resource", item_id: "", amount: 1 }])}
            type="button"
          >
            Add requirement
          </button>
        </div>
        {requirements.map((requirement, index) => {
          const options = requirement.type === "pillar"
            ? pillarEntries
            : requirement.type === "tag"
              ? permanentOnlyTags(tagEntries)
              : volatileResourceTags(tagEntries);
          return (
            <div key={index} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[10rem_1fr_9rem_7rem_auto]">
              <SelectField
                label="Type"
                value={requirement.type || "resource"}
                options={[
                  { value: "resource", label: "Resource cost" },
                  { value: "tag", label: "Tag requirement" },
                  { value: "pillar", label: "Pillar condition" },
                ]}
                onChange={(type) => updateRequirement(index, type === "pillar"
                  ? { type, pillar_id: "", operator: "gte", value: 1, item_id: undefined, amount: undefined }
                  : { type, item_id: "", amount: 1, pillar_id: undefined, operator: undefined, value: undefined })}
              />
              <SelectField
                label={requirement.type === "pillar" ? "Pillar" : "Item"}
                value={requirement.type === "pillar" ? requirement.pillar_id || "" : requirement.item_id || ""}
                options={[{ value: "", label: "Select item" }, ...options.map((entry) => ({ value: entry.id, label: entry.name }))]}
                onChange={(value) => updateRequirement(index, requirement.type === "pillar" ? { pillar_id: value } : { item_id: value })}
              />
              {requirement.type === "pillar" ? (
                <SelectField
                  label="Comparison"
                  value={requirement.operator || "gte"}
                  options={[
                    { value: "gt", label: "More than" },
                    { value: "gte", label: "At least" },
                    { value: "lt", label: "Less than" },
                    { value: "lte", label: "At most" },
                    { value: "eq", label: "Exactly" },
                  ]}
                  onChange={(operator) => updateRequirement(index, { operator })}
                />
              ) : <span />}
              <NumberField
                label={requirement.type === "pillar" ? "Value" : "Amount"}
                value={requirement.type === "pillar" ? requirement.value ?? 1 : requirement.amount ?? 1}
                onChange={(value) => updateRequirement(index, requirement.type === "pillar" ? { value } : { amount: Math.max(1, value) })}
              />
              <button
                className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
                onClick={() => setField("requirements", requirements.filter((_, requirementIndex) => requirementIndex !== index))}
                type="button"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">Main Effects</h4>
        <EventEffects
          effects={Array.isArray(data.main_effects) ? data.main_effects : []}
          setEffects={(effects) => setField("main_effects", effects)}
          tagEntries={tagEntries}
          pillarEntries={pillarEntries}
        />
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">Alternative Effects</h4>
        <p className="text-xs text-slate-500">These resolve only when one or more requirements are not satisfied.</p>
        <EventEffects
          effects={Array.isArray(data.alternative_effects) ? data.alternative_effects : []}
          setEffects={(effects) => setField("alternative_effects", effects)}
          tagEntries={tagEntries}
          pillarEntries={pillarEntries}
        />
      </div>
    </>
  );
};

const UnifiedDeckGuidedFields = ({
  data,
  setField,
  items,
  cardEntries,
  tagEntries,
  ministryEntries,
  imageEntries,
  pillarEntries,
  tokenEntries,
  effectIconEntries,
  deckEntries,
  currentDeckId,
}) => {
  const [preview, setPreview] = useState(null);
  const [excludedDeckId, setExcludedDeckId] = useState("");
  const deckType = ["foundation", "institution", "crisis"].includes(data.deck_type)
    ? data.deck_type
    : "foundation";
  const isFoundation = deckType === "foundation";
  const eligibleItems = items.filter((item) => (
    deckType === "crisis"
      ? item.kind === "events" && item.data?.subtype === "crisis"
      : (item.kind === "cards" && item.category === "structure")
        || (item.kind === "events" && item.data?.subtype === "edict")
  ));
  const itemIds = Array.isArray(data.item_ids) ? data.item_ids : [];
  const setup = data.initial_setup && typeof data.initial_setup === "object"
    ? data.initial_setup
    : { "3": [], "4": [], "5": [] };
  const deckCounts = repeatedListToCounts(itemIds);
  const tierCounts = Object.fromEntries(["3", "4", "5"].map((tier) => [tier, repeatedListToCounts(setup[tier] || [])]));
  const tierTargets = { "3": 6, "4": 2, "5": 2 };
  const exclusionDecks = (deckEntries || []).filter((deck) => deck.id !== currentDeckId);
  const excludedDeck = exclusionDecks.find((deck) => deck.id === excludedDeckId);
  const excludedItemIds = new Set(excludedDeck?.data?.item_ids || []);

  const showPreview = (item, target) => {
    const rect = target.getBoundingClientRect();
    const previewWidth = item.kind === "events" ? 272 : 248;
    const previewHeight = item.kind === "events" ? 360 : 330;
    const rightPosition = rect.right + 12;
    const left = rightPosition + previewWidth <= window.innerWidth - 12
      ? rightPosition
      : Math.max(12, rect.left - previewWidth - 12);
    const top = Math.max(12, Math.min(rect.top - 12, window.innerHeight - previewHeight - 12));
    setPreview({ item, left, top });
  };

  const setDeckCopies = (itemId, copies) => {
    const normalized = Math.max(0, Math.min(99, Number(copies) || 0));
    const otherIds = itemIds.filter((id) => id !== itemId);
    setField("item_ids", [...otherIds, ...Array.from({ length: normalized }, () => itemId)]);
    if (!isFoundation) return;
    const nextSetup = Object.fromEntries(["3", "4", "5"].map((tier) => {
      const allowed = Math.max(0, normalized - ["3", "4", "5"]
        .filter((candidate) => candidate !== tier)
        .reduce((total, candidate) => total + Number(tierCounts[candidate][itemId] || 0), 0));
      const count = Math.min(Number(tierCounts[tier][itemId] || 0), allowed);
      const withoutItem = (setup[tier] || []).filter((id) => id !== itemId);
      return [tier, [...withoutItem, ...Array.from({ length: count }, () => itemId)]];
    }));
    setField("initial_setup", nextSetup);
  };
  const setTierCopies = (tier, itemId, copies) => {
    const otherTierCount = ["3", "4", "5"]
      .filter((candidate) => candidate !== tier)
      .reduce((total, candidate) => total + Number(tierCounts[candidate][itemId] || 0), 0);
    const maxForTier = Math.max(0, Number(deckCounts[itemId] || 0) - otherTierCount);
    const normalized = Math.max(0, Math.min(maxForTier, Number(copies) || 0));
    setField("initial_setup", {
      ...setup,
      [tier]: [
        ...(setup[tier] || []).filter((id) => id !== itemId),
        ...Array.from({ length: normalized }, () => itemId),
      ],
    });
  };

  const selectExclusionDeck = (deckId) => {
    setExcludedDeckId(deckId);
    const selectedDeck = exclusionDecks.find((deck) => deck.id === deckId);
    if (!selectedDeck) return;
    const excludedIds = new Set(selectedDeck.data?.item_ids || []);
    setField("item_ids", itemIds.filter((itemId) => !excludedIds.has(itemId)));
    if (isFoundation) {
      setField("initial_setup", Object.fromEntries(
        ["3", "4", "5"].map((tier) => [
          tier,
          (setup[tier] || []).filter((itemId) => !excludedIds.has(itemId)),
        ])
      ));
    }
  };

  return (
    <div className="space-y-4">
      <SelectField
        label="Deck Type"
        value={deckType}
        options={[
          { value: "foundation", label: "Foundation" },
          { value: "institution", label: "Institution" },
          { value: "crisis", label: "Crisis" },
        ]}
        onChange={(value) => {
          setExcludedDeckId("");
          const defaultItems = items.filter((item) => (
            value === "crisis"
              ? item.kind === "events" && item.data?.subtype === "crisis"
              : (item.kind === "cards" && item.category === "structure")
                || (item.kind === "events" && item.data?.subtype === "edict")
          ));
          setField("deck_type", value);
          setField("item_ids", defaultItems.map((item) => item.id));
          setField("initial_setup", value === "foundation" ? defaultFoundationInitialSetup(defaultItems) : {});
        }}
      />
      <SelectField
        label="Exclude Cards Already In"
        value={excludedDeckId}
        options={[
          { value: "", label: "Do not exclude another deck" },
          ...exclusionDecks.map((deck) => ({
            value: deck.id,
            label: `${deck.name} (${deck.data?.deck_type || "deck"})`,
          })),
        ]}
        onChange={selectExclusionDeck}
      />
      <div className={`grid gap-2 px-3 text-xs font-semibold text-slate-500 ${isFoundation ? "grid-cols-[minmax(0,1fr)_5rem_repeat(3,5.5rem)]" : "grid-cols-[minmax(0,1fr)_5rem]"}`}>
        <span>Card</span><span>Deck</span>
        {isFoundation ? <><span>Initial 3+</span><span>Initial 4+</span><span>Initial 5</span></> : null}
      </div>
      {eligibleItems.map((item) => {
        const excluded = excludedItemIds.has(item.id);
        return (
          <div key={item.id} className={`grid items-center gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 ${excluded ? "opacity-40" : ""} ${isFoundation ? "grid-cols-[minmax(0,1fr)_5rem_repeat(3,5.5rem)]" : "grid-cols-[minmax(0,1fr)_5rem]"}`}>
            <span className="min-w-0">
              <span
                className="block cursor-help truncate text-sm font-semibold text-slate-200 outline-none hover:text-amber-200 focus:text-amber-200"
                onBlur={() => setPreview(null)}
                onFocus={(event) => showPreview(item, event.currentTarget)}
                onMouseEnter={(event) => showPreview(item, event.currentTarget)}
                onMouseLeave={() => setPreview(null)}
                tabIndex={0}
              >
                {item.name}
              </span>
              <span className="block text-xs text-slate-500">{item.kind === "events" ? `Event - ${item.data?.subtype || "event"}` : item.category}</span>
            </span>
            <input className="h-8 rounded border border-slate-700 bg-slate-900 px-1 text-center text-sm text-white" disabled={excluded} min="0" max="99" type="number" value={excluded ? 0 : deckCounts[item.id] || 0} onChange={(event) => setDeckCopies(item.id, event.target.value)} />
            {isFoundation ? ["3", "4", "5"].map((tier) => (
              <input key={tier} className="h-8 rounded border border-slate-700 bg-slate-900 px-1 text-center text-sm text-white disabled:opacity-40" disabled={excluded || !deckCounts[item.id]} min="0" max={deckCounts[item.id] || 0} type="number" value={excluded ? 0 : tierCounts[tier][item.id] || 0} onChange={(event) => setTierCopies(tier, item.id, event.target.value)} />
            )) : null}
          </div>
        );
      })}
      {isFoundation ? <div className="grid gap-2 sm:grid-cols-3">
        {["3", "4", "5"].map((tier) => {
          const total = (setup[tier] || []).length;
          return (
            <p key={tier} className={`rounded-md border px-3 py-2 text-sm ${total === tierTargets[tier] ? "border-emerald-800 text-emerald-200" : "border-amber-800 text-amber-200"}`}>
              {tier === "3" ? "Initial 3+" : tier === "4" ? "Initial 4+" : "Initial 5"}: {total}/{tierTargets[tier]}
            </p>
          );
        })}
      </div> : null}
      {preview ? (
        <div
          className="pointer-events-none fixed z-[1500] drop-shadow-2xl"
          style={{ left: preview.left, top: preview.top }}
        >
          <CatalogItemVisual
            entry={preview.item}
            tags={tagEntries}
            cards={cardEntries}
            ministries={ministryEntries}
            images={imageEntries}
            pillars={pillarEntries}
            tokens={tokenEntries}
            effectIcons={effectIconEntries}
          />
        </div>
      ) : null}
    </div>
  );
};

const LevelGuidedFields = ({ data, setField, cardEntries, deckEntries }) => {
  const cityCards = cardEntries.filter((card) => card.category === "city");
  const foundationDecks = deckEntries.filter((deck) => deck.data?.deck_type === "foundation");
  const institutionDecks = deckEntries.filter((deck) => deck.data?.deck_type === "institution");
  const crisisDecks = deckEntries.filter((deck) => deck.data?.deck_type === "crisis");
  const cityPoolIds = Array.isArray(data.city_pool_card_ids) ? data.city_pool_card_ids : [];
  return (
    <>
      <SelectField
        label="Initial City Card"
        value={data.initial_city_card_id || ""}
        options={[{ value: "", label: "Select city card" }, ...cityCards.map((card) => ({ value: card.id, label: card.name }))]}
        onChange={(value) => setField("initial_city_card_id", value)}
      />
      <SelectField
        label="Foundation Deck"
        value={data.foundation_deck_id || ""}
        options={[{ value: "", label: "Select Foundation deck" }, ...foundationDecks.map((deck) => ({ value: deck.id, label: deck.name }))]}
        onChange={(value) => setField("foundation_deck_id", value)}
      />
      <SelectField
        label="Institution Deck"
        value={data.institution_deck_id || ""}
        options={[{ value: "", label: "Select Institution deck" }, ...institutionDecks.map((deck) => ({ value: deck.id, label: deck.name }))]}
        onChange={(value) => setField("institution_deck_id", value)}
      />
      <SelectField
        label="Crisis Deck"
        value={data.crisis_deck_id || ""}
        options={[{ value: "", label: "Select Crisis deck" }, ...crisisDecks.map((deck) => ({ value: deck.id, label: deck.name }))]}
        onChange={(value) => setField("crisis_deck_id", value)}
      />
      <NumberField
        label="Available Cities at Setup"
        value={data.available_city_count ?? Math.min(5, cityPoolIds.length)}
        onChange={(value) => setField("available_city_count", Math.max(0, Math.min(cityPoolIds.length, value)))}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-300">City Charter Pool</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {cityCards
            .filter((card) => card.id !== data.initial_city_card_id)
            .map((card) => (
              <label key={card.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={cityPoolIds.includes(card.id)}
                  onChange={(event) => setField(
                    "city_pool_card_ids",
                    event.target.checked
                      ? [...cityPoolIds, card.id]
                      : cityPoolIds.filter((itemId) => itemId !== card.id)
                  )}
                />
                {card.name}
              </label>
            ))}
        </div>
      </fieldset>
    </>
  );
};

const SystemEffectIconGuidedFields = ({ data, setField, imageEntries }) => (
  <>
    <p className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
      Effect code: <span className="font-semibold text-white">{effectIconOptionLabel(data.effect_type)}</span>
    </p>
    <ImageAssetSelect
      label="Effect Image"
      images={imageEntries}
      selectedId={data.icon_image_id || ""}
      onSelect={(image) => setField("icon_image_id", image?.id || "")}
    />
  </>
);

const GuidedMetadataEditor = ({
  activeSection,
  catalogForm,
  setCatalogForm,
  isEditing,
  tagEntries,
  cardEntries,
  eventEntries,
  deckEntries,
  ministryEntries,
  imageEntries,
  pillarEntries,
  tokenEntries,
  effectIconEntries,
  editingEntryId,
}) => {
  const data = dataForForm(catalogForm);
  if (readOnlyCatalogSections.has(activeSection)) return null;

  const countFields = tagCountFieldsBySection[activeSection] || [];
  const listFields = tagListFieldsBySection[activeSection] || [];
  const singleFields = tagSingleFieldsBySection[activeSection] || [];
  const usefulFields = [...countFields, ...listFields, ...singleFields];
  const hasCardGuidance = activeSection === "structures" || activeSection === "cities";
  const hasDeckGuidance = activeSection === "decks";
  const hasLevelGuidance = activeSection === "levels";
  const hasMinistryGuidance = activeSection === "ministries";
  const hasEventGuidance = activeSection === "edicts" || activeSection === "crises";
  const hasAgendaGuidance = activeSection === "agendas";
  const hasPillarGuidance = activeSection === "pillars";
  const hasEffectIconGuidance = activeSection === "effect-icons";
  if (!usefulFields.length && !hasCardGuidance && !hasDeckGuidance && !hasLevelGuidance && !hasMinistryGuidance && !hasEventGuidance && !hasAgendaGuidance && !hasPillarGuidance && !hasEffectIconGuidance) return null;

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
        value === "" ||
        value === false ||
        value == null ||
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
        <DevelopmentCardGuidedFields
          category={catalogForm.category}
          data={data}
          setField={setField}
          tagEntries={tagEntries}
          pillarEntries={pillarEntries}
          tokenEntries={tokenEntries}
          imageEntries={imageEntries}
        />
      ) : null}
      {hasDeckGuidance ? (
        <UnifiedDeckGuidedFields
          data={data}
          setField={setField}
          items={[...cardEntries, ...eventEntries]}
          cardEntries={cardEntries}
          tagEntries={tagEntries}
          ministryEntries={ministryEntries}
          imageEntries={imageEntries}
          pillarEntries={pillarEntries}
          tokenEntries={tokenEntries}
          effectIconEntries={effectIconEntries}
          deckEntries={deckEntries}
          currentDeckId={editingEntryId}
        />
      ) : null}
      {hasLevelGuidance ? (
        <LevelGuidedFields
          data={data}
          setField={setField}
          cardEntries={cardEntries}
          deckEntries={deckEntries}
        />
      ) : null}
      {hasMinistryGuidance ? (
        <MinistryGuidedFields
          data={data}
          setField={setField}
          imageEntries={imageEntries}
        />
      ) : null}
      {hasEventGuidance ? (
        <EventGuidedFields
          data={data}
          setField={setField}
          tagEntries={tagEntries}
          ministryEntries={ministryEntries}
          pillarEntries={pillarEntries}
        />
      ) : null}
      {hasAgendaGuidance ? (
        <AgendaGuidedFields
          data={data}
          setField={setField}
          tagEntries={tagEntries}
          pillarEntries={pillarEntries}
        />
      ) : null}
      {hasPillarGuidance ? (
        <PillarGuidedFields data={data} setField={setField} imageEntries={imageEntries} />
      ) : null}
      {hasEffectIconGuidance ? (
        <SystemEffectIconGuidedFields
          data={data}
          setField={setField}
          imageEntries={imageEntries}
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
  const { section = "users" } = useParams();
  const { token, user } = useStore();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [replayEntries, setReplayEntries] = useState([]);
  const [replayStatistics, setReplayStatistics] = useState(null);
  const [selectedReplayIds, setSelectedReplayIds] = useState([]);
  const [replaySelectorOpen, setReplaySelectorOpen] = useState(false);
  const [inspectorEntries, setInspectorEntries] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [tagEntries, setTagEntries] = useState([]);
  const [imageEntries, setImageEntries] = useState([]);
  const [cardEntries, setCardEntries] = useState([]);
  const [eventEntries, setEventEntries] = useState([]);
  const [pillarEntries, setPillarEntries] = useState([]);
  const [tokenEntries, setTokenEntries] = useState([]);
  const [effectIconEntries, setEffectIconEntries] = useState([]);
  const [ministryEntries, setMinistryEntries] = useState([]);
  const [deckEntries, setDeckEntries] = useState([]);
  const [levelEntries, setLevelEntries] = useState([]);
  const [buildPathCityId, setBuildPathCityId] = useState("");
  const [buildPathTargetId, setBuildPathTargetId] = useState("");
  const [buildPathResult, setBuildPathResult] = useState(null);
  const [buildPathsLoading, setBuildPathsLoading] = useState(false);
  const [catalogSummary, setCatalogSummary] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [tagCategoryFilter, setTagCategoryFilter] = useState("all");
  const [providedTagFilter, setProvidedTagFilter] = useState("");
  const [producedResourceFilter, setProducedResourceFilter] = useState("");
  const [effectTypeFilter, setEffectTypeFilter] = useState("");
  const [modifiedPillarFilter, setModifiedPillarFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeSection = sections.some((entry) => entry.key === section) ? section : null;
  const activeEventSubtype = activeSection === "crises" ? "crisis" : activeSection === "edicts" ? "edict" : "";
  const activeCardCategory = activeSection === "structures"
    ? "structure"
    : activeSection === "cities"
      ? "city"
      : "";
  const activeCatalogKind = activeEventSubtype
    ? "events"
    : activeCardCategory
      ? "cards"
      : activeSection;
  const isCatalogSection = catalogSections.has(activeCatalogKind);
  const isReadOnlyCatalogSection = readOnlyCatalogSections.has(activeCatalogKind);
  const showsCardFilters = filterableCardSections.has(activeSection);

  useEffect(() => {
    setProvidedTagFilter("");
    setProducedResourceFilter("");
    setEffectTypeFilter("");
    setModifiedPillarFilter("");
  }, [activeSection]);

  const request = async (path, options = {}) => {
    const response = await authenticatedFetch(buildApiUrl(path), {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(payload.detail)
        ? payload.detail.map((entry) => entry.msg || JSON.stringify(entry)).join("; ")
        : typeof payload.detail === "object" && payload.detail
          ? JSON.stringify(payload.detail)
          : payload.detail;
      throw new Error(detail || "Admin request failed.");
    }
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

  const loadReplayStatistics = async (requestedIds = null) => {
    if (!token) return;
    setError("");
    try {
      const replays = replayEntries.length ? replayEntries : await request("/api/admin/replays");
      const ids = requestedIds || (selectedReplayIds.length ? selectedReplayIds : replays.map((entry) => entry.id));
      const statistics = await request("/api/admin/replays/statistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replay_ids: ids }),
      });
      setReplayEntries(replays);
      setSelectedReplayIds(ids);
      setReplayStatistics(statistics);
    } catch (loadError) {
      setError(loadError.message || "Failed to calculate replay statistics.");
    }
  };

  const loadCatalogInspector = async () => {
    if (!token) return;
    setError("");
    try {
      setInspectorEntries(await request(`/api/admin/catalog/entries?query=${encodeURIComponent(query)}`));
    } catch (loadError) {
      setError(loadError.message || "Failed to load catalog entries.");
      setInspectorEntries([]);
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
      if (targetSection !== "images") {
        requests.push(request("/api/admin/images"));
      }
      if (targetSection !== "cards") {
        requests.push(request("/api/admin/cards"));
      }
      if (targetSection !== "events") {
        requests.push(request("/api/admin/events"));
      }
      if (targetSection !== "pillars") {
        requests.push(request("/api/admin/pillars"));
      }
      if (targetSection !== "tokens") {
        requests.push(request("/api/admin/tokens"));
      }
      if (targetSection !== "effect-icons") {
        requests.push(request("/api/admin/effect-icons"));
      }
      if (targetSection !== "ministries") {
        requests.push(request("/api/admin/ministries"));
      }
      if (targetSection !== "decks") {
        requests.push(request("/api/admin/decks"));
      }
      if (targetSection !== "levels") {
        requests.push(request("/api/admin/levels"));
      }
      const results = await Promise.all(requests);
      const [summary, entries] = results;
      let resultIndex = 2;
      const tags = targetSection === "tags" ? entries : results[resultIndex++];
      const images = targetSection === "images" ? entries : results[resultIndex++];
      const cards = targetSection === "cards" ? entries : results[resultIndex++];
      const events = targetSection === "events" ? entries : results[resultIndex++];
      const pillars = targetSection === "pillars" ? entries : results[resultIndex++];
      const tokens = targetSection === "tokens" ? entries : results[resultIndex++];
      const effectIcons = targetSection === "effect-icons" ? entries : results[resultIndex++];
      const ministries = targetSection === "ministries" ? entries : results[resultIndex++];
      const decks = targetSection === "decks" ? entries : results[resultIndex++];
      const levels = targetSection === "levels" ? entries : results[resultIndex++];
      setCatalogSummary(summary);
      setCatalogEntries(entries);
      setTagEntries(targetSection === "tags" ? entries : tags);
      setImageEntries(targetSection === "images" ? entries : images);
      setCardEntries(targetSection === "cards" ? entries : cards);
      setEventEntries(targetSection === "events" ? entries : events);
      setPillarEntries(targetSection === "pillars" ? entries : pillars);
      setTokenEntries(targetSection === "tokens" ? entries : tokens);
      setEffectIconEntries(targetSection === "effect-icons" ? entries : effectIcons);
      setMinistryEntries(targetSection === "ministries" ? entries : ministries);
      setDeckEntries(targetSection === "decks" ? entries : decks);
      setLevelEntries(targetSection === "levels" ? entries : levels);
      setEditingEntry(null);
      setCatalogForm(emptyCatalogForm);
      setEditorOpen(false);
    } catch (loadError) {
      setError(loadError.message || "Failed to load catalog.");
      setCatalogEntries([]);
    }
  };

  const loadBuildPathCatalog = async () => {
    if (!token) return;
    setError("");
    try {
      const [cards, tags, images, pillars, tokens, effectIcons] = await Promise.all([
        request("/api/admin/cards"),
        request("/api/admin/tags"),
        request("/api/admin/images"),
        request("/api/admin/pillars"),
        request("/api/admin/tokens"),
        request("/api/admin/effect-icons"),
      ]);
      setCardEntries(cards);
      setTagEntries(tags);
      setImageEntries(images);
      setPillarEntries(pillars);
      setTokenEntries(tokens);
      setEffectIconEntries(effectIcons);
      const cities = cards.filter((entry) => entry.category === "city");
      const structures = cards.filter((entry) => entry.category === "structure");
      setBuildPathCityId((current) => (
        cities.some((entry) => entry.id === current) ? current : cities[0]?.id || ""
      ));
      setBuildPathTargetId((current) => (
        structures.some((entry) => entry.id === current) ? current : structures[0]?.id || ""
      ));
    } catch (loadError) {
      setError(loadError.message || "Failed to load build path cards.");
      setCardEntries([]);
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
    } else if (activeSection === "statistics") {
      void loadReplayStatistics();
    } else if (activeSection === "catalog-inspector") {
      void loadCatalogInspector();
    } else if (activeSection === "build-paths") {
      void loadBuildPathCatalog();
    } else if (isCatalogSection) {
      void loadCatalog(activeCatalogKind);
    }
  }, [activeCatalogKind, activeSection, isCatalogSection, token]);

  useEffect(() => {
    if (activeSection !== "build-paths" || !buildPathCityId || !buildPathTargetId) {
      setBuildPathResult(null);
      return undefined;
    }
    let cancelled = false;
    setBuildPathsLoading(true);
    setError("");
    request(
      `/api/admin/build-paths?city_card_id=${encodeURIComponent(buildPathCityId)}&target_card_id=${encodeURIComponent(buildPathTargetId)}`
    )
      .then((result) => {
        if (!cancelled) setBuildPathResult(result);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message || "Failed to calculate build paths.");
          setBuildPathResult(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBuildPathsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection, buildPathCityId, buildPathTargetId, token]);

  const cityCardEntries = useMemo(
    () => cardEntries
      .filter((entry) => entry.category === "city")
      .sort((left, right) => left.name.localeCompare(right.name)),
    [cardEntries]
  );
  const structureCardEntries = useMemo(
    () => cardEntries
      .filter((entry) => entry.category === "structure")
      .sort((left, right) => left.name.localeCompare(right.name)),
    [cardEntries]
  );
  const buildPathCardById = useMemo(
    () => Object.fromEntries(cardEntries.map((entry) => [entry.id, entry])),
    [cardEntries]
  );

  const cardFilterOptions = useMemo(() => {
    const pageEntries = catalogEntries.filter((entry) => {
      const matchesSubtype = !activeEventSubtype || String(entry.data?.subtype || "edict") === activeEventSubtype;
      const matchesCategory = !activeCardCategory || entry.category === activeCardCategory;
      return matchesSubtype && matchesCategory;
    });
    const providedTagIds = new Set();
    const producedResourceIds = new Set();
    const effectTypes = new Set();
    const modifiedPillarIds = new Set();
    pageEntries.forEach((entry) => {
      Object.entries(entry.data?.tags || {}).forEach(([id, count]) => {
        if (Number(count) > 0) providedTagIds.add(id);
      });
      Object.entries(entry.data?.production || {}).forEach(([id, count]) => {
        if (Number(count) > 0) producedResourceIds.add(id);
      });
      entryEffects(entry).forEach((effect) => {
        if (effect?.effect_type) effectTypes.add(effect.effect_type);
        if (effect?.effect_type === "modify_pillar" && effect.payload?.pillar_id) {
          modifiedPillarIds.add(effect.payload.pillar_id);
        }
        if (effect?.effect_type === "modify_resources" && Number(effect.payload?.amount || 0) > 0 && effect.payload?.resource_id) {
          producedResourceIds.add(effect.payload.resource_id);
        }
      });
    });
    const byName = (left, right) => left.name.localeCompare(right.name);
    return {
      tags: tagEntries.filter((entry) => providedTagIds.has(entry.id)).sort(byName),
      resources: tagEntries.filter((entry) => producedResourceIds.has(entry.id)).sort(byName),
      effects: Array.from(effectTypes).map((value) => ({ value, label: effectTypeLabel(value) }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      pillars: pillarEntries.filter((entry) => modifiedPillarIds.has(entry.id)).sort(byName),
    };
  }, [activeCardCategory, activeEventSubtype, catalogEntries, pillarEntries, tagEntries]);

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
      const matchesEventSubtype =
        !activeEventSubtype ||
        String(entry.data?.subtype || "edict") === activeEventSubtype;
      const matchesCardCategory = !activeCardCategory || entry.category === activeCardCategory;
      return matchesQuery && matchesCategory && matchesEventSubtype && matchesCardCategory
        && matchesCatalogEffectFilters(entry, {
          providedTag: providedTagFilter,
          producedResource: producedResourceFilter,
          effectType: effectTypeFilter,
          modifiedPillar: modifiedPillarFilter,
        });
    });
  }, [
    activeCardCategory,
    activeCatalogKind,
    activeEventSubtype,
    catalogEntries,
    effectTypeFilter,
    modifiedPillarFilter,
    producedResourceFilter,
    providedTagFilter,
    query,
    tagCategoryFilter,
  ]);

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
    if (isReadOnlyCatalogSection) return;
    setEditingEntry(null);
    setCatalogForm({
      ...emptyCatalogForm,
      color: activeCatalogKind === "tags" ? "#64748b" : "",
      category:
        activeCatalogKind === "cards"
            ? activeCardCategory
            : activeCatalogKind === "decks"
              ? "deck"
            : activeCatalogKind === "levels"
              ? "level"
            : activeCatalogKind === "agendas"
              ? "hidden_agenda"
            : activeCatalogKind === "events"
              ? "event"
            : activeCatalogKind === "pillars"
              ? "pillar"
            : activeCatalogKind === "effect-icons"
              ? "effect-icon"
            : activeCatalogKind === "tags"
              ? "permanent"
            : activeCatalogKind === "images"
              ? "image"
            : "",
      dataText:
        activeCatalogKind === "decks"
              ? (() => {
                  const defaultItems = [
                    ...cardEntries.filter((entry) => entry.category === "structure"),
                    ...eventEntries.filter((entry) => entry.data?.subtype === "edict"),
                  ];
                  return stringifyData({
                    deck_type: "foundation",
                    item_ids: defaultItems.map((entry) => entry.id),
                    initial_setup: defaultFoundationInitialSetup(defaultItems),
                  });
                })()
            : activeCatalogKind === "levels"
              ? stringifyData({
                  initial_city_card_id: "",
                  foundation_deck_id: "",
                  institution_deck_id: "",
                  crisis_deck_id: "",
                  city_pool_card_ids: [],
                  available_city_count: 0,
                  suspicion_start_era: 5,
                })
            : activeCatalogKind === "ministries"
              ? stringifyData({
                  infrastructure_resources: [],
                })
              : activeCatalogKind === "agendas"
                ? stringifyData(defaultAgendaData)
              : activeCatalogKind === "events"
                ? stringifyData({ subtype: activeEventSubtype, requirements: [], main_effects: [], alternative_effects: [] })
              : activeCatalogKind === "pillars"
                ? stringifyData({ min: 0, max: 10, start: 5, range_effects: [] })
              : activeCatalogKind === "tags"
                ? stringifyData({ resource_type: "permanent" })
                : activeCatalogKind === "images"
                  ? stringifyData({ src: "" })
            : "{}",
    });
    setEditorOpen(true);
    setError("");
  };

  const beginEditCatalogEntry = (entry) => {
    if (isReadOnlyCatalogSection) return;
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
    if (!isCatalogSection || isReadOnlyCatalogSection || busy) return;
    setBusy(true);
    setError("");
    try {
      const parsedData = parseCatalogData();
      const normalizedData = activeCatalogKind === "events"
        ? { ...parsedData, subtype: activeEventSubtype }
        : parsedData;
      const tagResourceType = normalizedData.resource_type === "volatile" ? "volatile" : "permanent";
      const effectIconIdentity = effectIconCatalogIdentity(normalizedData.effect_type || catalogForm.name || "effect");
      const effectIconName = activeCatalogKind === "effect-icons"
        ? (catalogForm.name || effectIconIdentity.name)
        : catalogForm.name;
      const effectIconId = activeCatalogKind === "effect-icons"
        ? catalogForm.id || effectIconIdentity.id
        : catalogForm.id;
      const imageIdentitySource = activeCatalogKind === "images"
        ? catalogForm.name || catalogForm.id || String(parsedData.src || "").split("/").pop() || "image"
        : "";
      const catalogName = activeCatalogKind === "effect-icons"
        ? effectIconName
        : activeCatalogKind === "images"
          ? String(imageIdentitySource).trim()
          : catalogForm.name;
      const catalogId = activeCatalogKind === "effect-icons"
        ? effectIconId
        : activeCatalogKind === "images"
          ? catalogForm.id || catalogIdFromText(imageIdentitySource) || "image"
          : catalogForm.id;
      const payload = {
        name: catalogName,
        category:
          activeCatalogKind === "decks"
                ? "deck"
              : activeCatalogKind === "levels"
                ? "level"
              : activeCatalogKind === "events"
                ? "event"
              : activeCatalogKind === "pillars"
                ? "pillar"
              : activeCatalogKind === "effect-icons"
                ? "effect-icon"
              : activeCatalogKind === "tags"
                ? tagResourceType
              : activeCatalogKind === "cards" && activeCardCategory
                ? activeCardCategory
                : catalogForm.category,
        summary: catalogForm.summary,
        color: activeCatalogKind === "tags" ? catalogForm.color : null,
        data: activeCatalogKind === "decks"
            ? {
                ...normalizedData,
                deck_type: ["foundation", "institution", "crisis"].includes(normalizedData.deck_type)
                  ? normalizedData.deck_type
                  : "foundation",
                item_ids: Array.isArray(normalizedData.item_ids) ? normalizedData.item_ids : [],
                ...(normalizedData.deck_type === "foundation"
                  ? { initial_setup: normalizedData.initial_setup || { "3": [], "4": [], "5": [] } }
                  : { initial_setup: {} }),
              }
          : activeCatalogKind === "levels"
            ? {
                ...normalizedData,
                initial_city_card_id: normalizedData.initial_city_card_id || "",
                foundation_deck_id: normalizedData.foundation_deck_id || "",
                institution_deck_id: normalizedData.institution_deck_id || "",
                crisis_deck_id: normalizedData.crisis_deck_id || "",
                city_pool_card_ids: Array.isArray(normalizedData.city_pool_card_ids)
                  ? normalizedData.city_pool_card_ids
                  : [],
                available_city_count: Math.max(0, Number(normalizedData.available_city_count) || 0),
                suspicion_start_era: Math.max(1, Number(normalizedData.suspicion_start_era) || 5),
              }
          : activeCatalogKind === "tags"
              ? { ...normalizedData, resource_type: tagResourceType }
            : normalizedData,
      };
      const path = editingEntry
        ? `/api/admin/${activeCatalogKind}/${editingEntry.id}`
        : `/api/admin/${activeCatalogKind}`;
      const saved = await request(path, {
        method: editingEntry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: catalogId }),
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
      if (activeCatalogKind === "images") {
        setImageEntries((entries) => {
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
      if (activeCatalogKind === "events") {
        setEventEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "pillars") {
        setPillarEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "effect-icons") {
        setEffectIconEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "ministries") {
        setMinistryEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "decks") {
        setDeckEntries((entries) => {
          const withoutSaved = entries.filter((entry) => entry.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) =>
            `${a.category}:${a.name}:${a.id}`.localeCompare(`${b.category}:${b.name}:${b.id}`)
          );
        });
      }
      if (activeCatalogKind === "levels") {
        setLevelEntries((entries) => {
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
    if (!entry?.id || isReadOnlyCatalogSection || busy) return;
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
      if (activeCatalogKind === "images") {
        setImageEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "cards") {
        setCardEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "events") {
        setEventEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "pillars") {
        setPillarEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "effect-icons") {
        setEffectIconEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "ministries") {
        setMinistryEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "decks") {
        setDeckEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "levels") {
        setLevelEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
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

  const deleteInspectorEntry = async (entry) => {
    if (!entry?.id || !entry?.kind || busy) return;
    const confirmed = window.confirm(`Delete ${entry.kind}:${entry.id}?`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/${entry.kind}/${entry.id}`, { method: "DELETE" });
      setInspectorEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
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
      const scopedPayload = kind === "events" && activeEventSubtype
        ? {
            ...payload,
            entries: (payload.entries || []).filter(
              (entry) => String(entry.data?.subtype || "edict") === activeEventSubtype
            ),
          }
        : kind === "cards" && activeCardCategory
          ? {
              ...payload,
              entries: (payload.entries || []).filter(
                (entry) => entry.category === activeCardCategory
              ),
            }
        : payload;
      const exportedKind = activeEventSubtype || activeCardCategory || kind || "all";
      downloadJson(scopedPayload, `chronicle-catalog-${exportedKind}.json`);
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
        entries: entries.map((entry) => ({
          ...entry,
          kind: entry.kind || activeCatalogKind,
          category: !importAll && activeCardCategory && (entry.kind || activeCatalogKind) === "cards"
            ? activeCardCategory
            : entry.category,
          data: !importAll && activeEventSubtype && (entry.kind || activeCatalogKind) === "events"
            ? { ...(entry.data || {}), subtype: activeEventSubtype }
            : entry.data,
        })),
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
        {activeSection === "users" || activeSection === "catalog-inspector" || isCatalogSection ? (
          <div className="flex min-w-[16rem] items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
              placeholder={
                activeSection === "users"
                  ? "Search users"
                  : activeSection === "catalog-inspector"
                    ? "Search id, kind, name"
                    : `Search ${activeSection}`
              }
            />
            {activeSection === "users" || activeSection === "catalog-inspector" ? (
              <button className="text-sm font-semibold text-teal-300" onClick={activeSection === "users" ? loadUsers : loadCatalogInspector} type="button">
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

      {activeSection === "statistics" ? (
        <ReplayStatisticsPanel
          replays={replayEntries}
          statistics={replayStatistics}
          selectedIds={selectedReplayIds}
          selectorOpen={replaySelectorOpen}
          setSelectorOpen={setReplaySelectorOpen}
          setSelectedIds={setSelectedReplayIds}
          applySelection={() => {
            setReplaySelectorOpen(false);
            void loadReplayStatistics(selectedReplayIds);
          }}
        />
      ) : null}

      {activeSection === "catalog-inspector" ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Catalog Inspector</h2>
              <p className="mt-1 text-sm text-slate-500">Search all catalog kinds by id, kind, name, or category. Use this to remove stale entries blocking reused ids.</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              disabled={busy}
              onClick={loadCatalogInspector}
              type="button"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Kind</th>
                  <th className="py-2 pr-3">Id</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {inspectorEntries.map((entry) => (
                  <tr key={`${entry.kind}:${entry.id}`} className="align-top">
                    <td className="py-3 pr-3 text-slate-300">{entry.kind}</td>
                    <td className="py-3 pr-3 font-mono text-xs text-white">{entry.id}</td>
                    <td className="py-3 pr-3 text-slate-200">{entry.name}</td>
                    <td className="py-3 pr-3 text-slate-400">{entry.category || "-"}</td>
                    <td className="py-3 pr-3">
                      <code className="line-clamp-2 break-all text-xs text-slate-500">{JSON.stringify(entry.data || {})}</code>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        className="inline-flex items-center gap-2 rounded-md border border-rose-900/80 px-3 py-2 text-sm text-rose-200 hover:bg-rose-950/70 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => deleteInspectorEntry(entry)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inspectorEntries.length === 0 ? <p className="py-5 text-slate-400">No catalog entries found.</p> : null}
          </div>
        </section>
      ) : null}

      {activeSection === "build-paths" ? (
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="block font-medium text-white">Starting City</span>
                <select
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                  value={buildPathCityId}
                  onChange={(event) => setBuildPathCityId(event.target.value)}
                >
                  {cityCardEntries.length === 0 ? <option value="">No city cards available</option> : null}
                  {cityCardEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="block font-medium text-white">Target Structure</span>
                <select
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                  value={buildPathTargetId}
                  onChange={(event) => setBuildPathTargetId(event.target.value)}
                >
                  {structureCardEntries.length === 0 ? <option value="">No structure cards available</option> : null}
                  {structureCardEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="min-h-[24rem] overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-6">
            {buildPathsLoading ? <p className="text-sm text-slate-400">Calculating minimum build paths...</p> : null}
            {!buildPathsLoading && buildPathResult?.paths?.length ? (
              <div className="min-w-max">
                <div className="flex justify-center">
                  <CatalogItemVisual
                    entry={buildPathCardById[buildPathResult.city_card_id]}
                    tags={tagEntries}
                    cards={cardEntries}
                    images={imageEntries}
                    pillars={pillarEntries}
                    tokens={tokenEntries}
                    effectIcons={effectIconEntries}
                  />
                </div>
                <div className="mx-auto h-7 w-px bg-slate-600" />
                <div className="mx-auto h-px bg-slate-600" style={{ width: `max(1px, calc(100% - 12rem))` }} />
                <div className="flex items-start justify-center gap-10 px-6">
                  {buildPathResult.paths.map((path, pathIndex) => (
                    <div
                      key={`${path.building_card_ids.join(":")}:${pathIndex}`}
                      className="flex w-[clamp(12rem,16vw,15rem)] flex-col items-center"
                    >
                      <div className="h-7 w-px bg-slate-600" />
                      <span className="mb-3 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
                        Path {pathIndex + 1}
                      </span>
                      {path.building_card_ids.map((cardId, cardIndex) => (
                        <div key={`${cardId}:${cardIndex}`} className="flex flex-col items-center">
                          <CatalogItemVisual
                            entry={buildPathCardById[cardId]}
                            tags={tagEntries}
                            cards={cardEntries}
                            images={imageEntries}
                            pillars={pillarEntries}
                            tokens={tokenEntries}
                            effectIcons={effectIconEntries}
                          />
                          <ArrowDown className="my-3 h-5 w-5 text-slate-500" aria-hidden="true" />
                        </div>
                      ))}
                      <CatalogItemVisual
                        entry={buildPathCardById[buildPathResult.target_card_id]}
                        tags={tagEntries}
                        cards={cardEntries}
                        images={imageEntries}
                        pillars={pillarEntries}
                        tokens={tokenEntries}
                        effectIcons={effectIconEntries}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-center text-sm text-slate-400">
                  {buildPathResult.minimum_buildings === 0
                    ? "The starting city already satisfies this structure."
                    : `${buildPathResult.paths.length} minimum path${buildPathResult.paths.length === 1 ? "" : "s"}, ${buildPathResult.minimum_buildings} prerequisite structure${buildPathResult.minimum_buildings === 1 ? "" : "s"} each.`}
                </p>
              </div>
            ) : null}
            {!buildPathsLoading && buildPathResult && buildPathResult.paths.length === 0 ? (
              <div className="flex min-h-[20rem] items-center justify-center text-center">
                <div>
                  <h2 className="font-semibold text-white">No build path found</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {Object.keys(buildPathCardById[buildPathCityId]?.data?.production || {}).length === 0
                      && Object.keys(buildPathCardById[buildPathCityId]?.data?.tags || {}).length === 0
                      ? `${buildPathCardById[buildPathCityId]?.name || "The starting city"} provides no resources or tags, so no first structure can be built.`
                      : "Existing structures cannot provide all resources and tags required by this target."}
                  </p>
                </div>
              </div>
            ) : null}
            {!buildPathsLoading && !buildPathResult && (!buildPathCityId || !buildPathTargetId) ? (
              <p className="text-sm text-slate-400">Create at least one city and one structure card to calculate build paths.</p>
            ) : null}
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
            ) : showsCardFilters ? (
              <div className="flex flex-wrap items-end gap-2">
                <CatalogFilterSelect
                  label="Provides tag"
                  value={providedTagFilter}
                  options={cardFilterOptions.tags}
                  onChange={setProvidedTagFilter}
                />
                <CatalogFilterSelect
                  label="Produces"
                  value={producedResourceFilter}
                  options={cardFilterOptions.resources}
                  onChange={setProducedResourceFilter}
                />
                <CatalogFilterSelect
                  label="Effect"
                  value={effectTypeFilter}
                  options={cardFilterOptions.effects}
                  onChange={setEffectTypeFilter}
                />
                <CatalogFilterSelect
                  label="Modifies pillar"
                  value={modifiedPillarFilter}
                  options={cardFilterOptions.pillars}
                  onChange={setModifiedPillarFilter}
                />
                {(providedTagFilter || producedResourceFilter || effectTypeFilter || modifiedPillarFilter) ? (
                  <button
                    className="mb-px rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    onClick={() => {
                      setProvidedTagFilter("");
                      setProducedResourceFilter("");
                      setEffectTypeFilter("");
                      setModifiedPillarFilter("");
                    }}
                    type="button"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              {isReadOnlyCatalogSection ? null : (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => exportCatalog(activeCatalogKind)}
                    type="button"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {activeEventSubtype ? `Export ${activeEventSubtype === "crisis" ? "Crisis" : "Edict"} JSON` : "Export Page"}
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
                    {activeEventSubtype ? `Import ${activeEventSubtype === "crisis" ? "Crisis" : "Edict"} JSON` : "Import Page"}
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
                    New {activeEventSubtype === "crisis"
                      ? "Crisis"
                      : activeEventSubtype === "edict"
                        ? "Edict"
                        : activeCardCategory === "structure"
                          ? "Structure"
                          : activeCardCategory === "city"
                            ? "City"
                            : activeSection.slice(0, -1)}
                  </button>
                </>
              )}
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
                <div className={activeCatalogKind === "agendas"
                  ? "grid gap-6 lg:grid-cols-2 min-[1400px]:grid-cols-3"
                  : "grid gap-4 md:grid-cols-5 xl:grid-cols-6"}>
                  {entries.map((entry) => {
                    const actionButtons = isReadOnlyCatalogSection ? null : (
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
                    );
                    return (
                      <div
                        key={entry.id}
                        className={activeCatalogKind === "agendas"
                          ? "w-full max-w-[30rem] justify-self-center space-y-3"
                          : "space-y-3"}
                      >
                        <CatalogItemVisual
                          entry={entry}
                          tags={tagEntries}
                          cards={cardEntries}
                          ministries={ministryEntries}
                          images={imageEntries}
                          pillars={pillarEntries}
                          tokens={tokenEntries}
                          effectIcons={effectIconEntries}
                          actions={entry.kind === "events" ? null : actionButtons}
                        />
                        {entry.kind === "events" && actionButtons ? (
                          <div className="flex flex-wrap gap-2 w-[clamp(12rem,16vw,15rem)] rounded-lg border border-slate-800 bg-slate-900 p-3">
                            {actionButtons}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {filteredCatalogEntries.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-slate-400">No catalog entries found.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {editorOpen && isCatalogSection && !isReadOnlyCatalogSection ? (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-8">
          <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">{editingEntry ? "Edit Item" : "Create Item"}</h2>
                <p className="mt-1 text-xs text-slate-500">{activeSection}</p>
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
              {activeCatalogKind === "effect-icons" ? null : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Id</span>
                    <input
                      value={catalogForm.id}
                      onChange={(event) => setCatalogForm((state) => ({ ...state, id: event.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
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
              )}

              <div className={`grid gap-4 ${activeCatalogKind === "events" ? "" : "sm:grid-cols-2"}`}>
                {activeCatalogKind === "cards" ? null : (
                  activeCatalogKind === "tags" ? (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Type</span>
                    <select
                      value={dataForForm(catalogForm).resource_type === "volatile" ? "volatile" : "permanent"}
                      onChange={(event) => {
                        const resourceType = event.target.value;
                        setCatalogForm((state) => {
                          let currentData = {};
                          try {
                            currentData = parseDataText(state.dataText);
                          } catch (_error) {
                            currentData = {};
                          }
                          return {
                            ...state,
                            category: resourceType,
                            dataText: stringifyData({ ...currentData, resource_type: resourceType }),
                          };
                        });
                      }}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                    >
                      <option value="permanent">Permanent Tag</option>
                      <option value="volatile">Volatile Resource</option>
                    </select>
                  </label>
                  ) : activeCatalogKind === "events" ? null : (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Category</span>
                    <input
                      value={catalogForm.category}
                      onChange={(event) => setCatalogForm((state) => ({ ...state, category: event.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400 disabled:text-slate-500"
                    />
                  </label>
                  )
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
                activeSection={activeSection}
                catalogForm={catalogForm}
                setCatalogForm={setCatalogForm}
                isEditing={Boolean(editingEntry)}
                tagEntries={tagEntries}
                cardEntries={cardEntries}
                eventEntries={eventEntries}
                deckEntries={deckEntries}
                ministryEntries={ministryEntries}
                imageEntries={imageEntries}
                pillarEntries={pillarEntries}
                tokenEntries={tokenEntries}
                effectIconEntries={effectIconEntries}
                editingEntryId={editingEntry?.id || ""}
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

const ReplayStatisticsPanel = ({
  replays,
  statistics,
  selectedIds,
  selectorOpen,
  setSelectorOpen,
  setSelectedIds,
  applySelection,
}) => {
  const metricSections = [
    { title: "Tags by Era", kind: "tags", rows: statistics?.tags_by_era || [] },
    { title: "Structures built by Era", kind: "structures", rows: statistics?.structures_by_era || [] },
    { title: "Edicts played by Era", kind: "edicts", rows: statistics?.edicts_by_era || [] },
    { title: "Crises played by Era", kind: "crises", rows: statistics?.crises_by_era || [] },
  ];
  return (
    <>
      <section className="border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-teal-400" /><h2 className="text-lg font-bold text-white">Bot Replay Statistics</h2></div>
            <p className="mt-1 text-xs text-slate-500">{statistics?.game_count || 0} selected replays</p>
          </div>
          <button className="border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={() => setSelectorOpen(true)} type="button">Select replays</button>
        </div>
      </section>

      {metricSections.map(({ title, kind, rows }) => (
        <StatisticsDistributionSection
          key={kind}
          title={title}
          kind={kind}
          rows={rows}
          catalog={statistics?.catalog || {}}
        />
      ))}

      <section className="mt-4 border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-bold uppercase text-amber-100">Points by Agenda</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-500"><tr><th className="px-2 py-2">Agenda</th><th className="px-2 py-2">Mean</th><th className="px-2 py-2">Distribution</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {(statistics?.agenda_points || []).map((row) => <StatisticsRow key={row.item_id} row={row} hideEra />)}
            </tbody>
          </table>
        </div>
      </section>

      {selectorOpen ? (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/90 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectorOpen(false); }}>
          <section className="max-h-[82vh] w-full max-w-3xl overflow-y-auto border border-amber-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-amber-50">Statistics Replay Set</h3><button className="h-8 w-8 border border-slate-700" onClick={() => setSelectorOpen(false)} type="button"><X className="mx-auto h-4 w-4" /></button></div>
            <div className="mt-4 flex gap-2"><button className="border border-slate-700 px-3 py-1.5 text-xs" onClick={() => setSelectedIds(replays.map((entry) => entry.id))} type="button">Select all</button><button className="border border-slate-700 px-3 py-1.5 text-xs" onClick={() => setSelectedIds([])} type="button">Select none</button></div>
            <div className="mt-3 divide-y divide-slate-800 border-y border-slate-800">
              {replays.map((entry) => (
                <label key={entry.id} className="flex cursor-pointer items-center gap-3 py-3">
                  <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => setSelectedIds((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])} />
                  <span className="flex-1 text-sm text-slate-200">{new Date(entry.created_at).toLocaleString()}</span>
                  <span className="text-xs text-slate-500">Era {entry.era} · {entry.player_count} bots</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><button className="bg-teal-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40" disabled={!selectedIds.length} onClick={applySelection} type="button">Compute statistics</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
};

const STATISTICS_COLORS = [
  "#2dd4bf", "#fbbf24", "#60a5fa", "#fb7185", "#a78bfa", "#4ade80",
  "#f97316", "#22d3ee", "#e879f9", "#facc15", "#818cf8", "#34d399",
];

const StatisticsDistributionSection = ({ title, kind, rows, catalog }) => {
  const [query, setQuery] = useState("");
  const [hiddenIds, setHiddenIds] = useState([]);
  const [providedTag, setProvidedTag] = useState("");
  const [producedResource, setProducedResource] = useState("");
  const [effectType, setEffectType] = useState("");
  const [modifiedPillar, setModifiedPillar] = useState("");
  const [hoveredId, setHoveredId] = useState("");
  const rowNames = Object.fromEntries(rows.map((row) => [row.item_id, row.name || row.item_id]));
  const rowIds = new Set(rows.map((row) => row.item_id));
  const catalogEntries = (catalog[kind] || []).filter((entry) => rowIds.has(entry.id));
  const entries = catalogEntries.length
    ? catalogEntries
    : Array.from(new Set(rows.map((row) => row.item_id))).map((id) => ({ id, name: rowNames[id], data: {} }));
  const tags = catalog.tags || [];
  const resources = tags.filter(tagIsVolatileResource);
  const effects = entries.flatMap(entryEffects);
  const filterOptions = {
    tags: tags.filter((tag) => entries.some((entry) => Number(entry.data?.tags?.[tag.id] || 0) > 0)),
    resources: resources.filter((resource) => entries.some((entry) => (
      Number(entry.data?.production?.[resource.id] || 0) > 0
      || entryEffects(entry).some((effect) => effect.effect_type === "modify_resources" && effect.payload?.resource_id === resource.id)
    ))),
    effects: Array.from(new Set(effects.map((effect) => effect.effect_type).filter(Boolean)))
      .map((value) => ({ value, label: effectTypeLabel(value) })),
    pillars: (catalog.pillars || []).filter((pillar) => effects.some((effect) => (
      effect.effect_type === "modify_pillar" && effect.payload?.pillar_id === pillar.id
    ))),
  };
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = entries
    .filter((entry) => !normalizedQuery || `${entry.name || ""} ${entry.id || ""}`.toLowerCase().includes(normalizedQuery))
    .filter((entry) => kind === "tags" || matchesCatalogEffectFilters(entry, {
      providedTag,
      producedResource,
      effectType,
      modifiedPillar,
    }))
    .sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id)));
  const visibleEntries = filteredEntries.filter((entry) => !hiddenIds.includes(entry.id));
  const imageLookup = Object.fromEntries((catalog.images || []).map((image) => [image.id, image]));

  return (
    <section className="mt-4 border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase text-amber-100">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">Each lane is one item. Point size represents sample frequency; the line connects Era means.</p>
        </div>
        <input
          className="w-52 border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-teal-400"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filter ${kind}`}
          value={query}
        />
      </div>

      {kind !== "tags" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-y border-slate-800 py-3">
          <CatalogFilterSelect label="Provides tag" value={providedTag} options={filterOptions.tags} onChange={setProvidedTag} />
          <CatalogFilterSelect label="Produces" value={producedResource} options={filterOptions.resources} onChange={setProducedResource} />
          <CatalogFilterSelect label="Effect" value={effectType} options={filterOptions.effects} onChange={setEffectType} />
          <CatalogFilterSelect label="Modifies pillar" value={modifiedPillar} options={filterOptions.pillars} onChange={setModifiedPillar} />
          {(providedTag || producedResource || effectType || modifiedPillar) ? (
            <button
              className="mb-px border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              onClick={() => {
                setProvidedTag("");
                setProducedResource("");
                setEffectType("");
                setModifiedPillar("");
              }}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={`${title} legend`}>
        <button className="border border-slate-700 px-2 py-1 text-[0.65rem] font-bold text-slate-300 hover:bg-slate-800" onClick={() => setHiddenIds([])} type="button">Show all</button>
        <button className="border border-slate-700 px-2 py-1 text-[0.65rem] font-bold text-slate-300 hover:bg-slate-800" onClick={() => setHiddenIds(filteredEntries.map((entry) => entry.id))} type="button">Hide all</button>
        {filteredEntries.map((entry, index) => {
          const hidden = hiddenIds.includes(entry.id);
          const iconSrc = buildAssetUrl(imageLookup[entry.data?.icon_image_id]?.data?.src || "");
          return (
            <button
              key={entry.id}
              className={`inline-flex h-8 items-center gap-1.5 border px-2 text-xs font-semibold ${hidden ? "border-slate-800 bg-slate-950 text-slate-600" : "border-slate-600 bg-slate-950 text-slate-200"}`}
              onClick={() => setHiddenIds((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])}
              type="button"
            >
              {iconSrc ? <img alt="" className="h-6 w-6 object-contain" src={iconSrc} /> : <span className="h-2.5 w-2.5" style={{ backgroundColor: entry.color || STATISTICS_COLORS[index % STATISTICS_COLORS.length] }} />}
              {entry.name || entry.id}
            </button>
          );
        })}
      </div>

      <DistributionLaneChart
        entries={visibleEntries}
        rows={rows}
        imageLookup={imageLookup}
        hoveredId={hoveredId}
        setHoveredId={setHoveredId}
      />
    </section>
  );
};

const DistributionLaneChart = ({ entries, rows, imageLookup, hoveredId, setHoveredId }) => {
  const eras = Array.from(new Set(rows.map((row) => Number(row.era)))).sort((left, right) => left - right);
  if (!entries.length || !eras.length) return <p className="py-8 text-sm text-slate-500">No visible samples.</p>;
  const left = 190;
  const top = 42;
  const laneHeight = 68;
  const eraWidth = 105;
  const width = Math.max(760, left + Math.max(1, eras.length - 1) * eraWidth + 65);
  const height = top + entries.length * laneHeight + 28;
  const rowLookup = Object.fromEntries(rows.map((row) => [`${row.item_id}:${row.era}`, row]));
  const maxValue = Math.max(1, ...rows.flatMap((row) => [
    Number(row.mean || 0),
    ...Object.keys(row.distribution || {}).map(Number),
  ]));
  const pointX = (era) => left + eras.indexOf(era) * eraWidth;
  const valueY = (center, value) => center + 22 - (Number(value || 0) / maxValue) * 44;

  return (
    <div className="mt-4 overflow-x-auto border border-slate-800 bg-slate-950/70">
      <svg aria-label="Interactive replay distribution chart" className="block" height={height} role="img" width={width}>
        {eras.map((era) => (
          <g key={era}>
            <line stroke="#334155" strokeDasharray="2 5" x1={pointX(era)} x2={pointX(era)} y1={28} y2={height - 20} />
            <text fill="#94a3b8" fontSize="10" textAnchor="middle" x={pointX(era)} y={18}>Era {era}</text>
          </g>
        ))}
        {entries.map((entry, entryIndex) => {
          const center = top + entryIndex * laneHeight + laneHeight / 2;
          const color = entry.color || STATISTICS_COLORS[entryIndex % STATISTICS_COLORS.length];
          const iconSrc = buildAssetUrl(imageLookup[entry.data?.icon_image_id]?.data?.src || "");
          const points = eras.map((era) => {
            const row = rowLookup[`${entry.id}:${era}`] || { mean: 0, distribution: { 0: 0 }, samples: 0 };
            return { era, row, x: pointX(era), y: valueY(center, row.mean) };
          });
          const dimmed = hoveredId && hoveredId !== entry.id;
          return (
            <g key={entry.id} opacity={dimmed ? 0.2 : 1} onMouseEnter={() => setHoveredId(entry.id)} onMouseLeave={() => setHoveredId("")}>
              <line stroke="#1e293b" x1="0" x2={width} y1={center + 26} y2={center + 26} />
              {iconSrc ? <image height="28" href={iconSrc} preserveAspectRatio="xMidYMid meet" width="28" x="10" y={center - 14} /> : <circle cx="24" cy={center} fill={color} r="5" />}
              <text fill="#e2e8f0" fontSize="11" fontWeight="600" x="45" y={center + 4}>{entry.name || entry.id}</text>
              <polyline fill="none" points={points.map((point) => `${point.x},${point.y}`).join(" ")} stroke={color} strokeWidth="2" />
              {points.map(({ era, row, x, y }) => (
                <g key={era}>
                  {Object.entries(row.distribution || {}).map(([value, count]) => Number(count) > 0 ? (
                    <circle key={value} cx={x} cy={valueY(center, value)} fill={color} fillOpacity="0.38" r={Math.min(11, 2.5 + Math.sqrt(Number(count)) * 2)} stroke={color} strokeWidth="0.7">
                      <title>{`${entry.name || entry.id} · Era ${era} · value ${value}: ${count} game${Number(count) === 1 ? "" : "s"}`}</title>
                    </circle>
                  ) : null)}
                  <circle cx={x} cy={y} fill={color} r="3.5" stroke="#f8fafc" strokeWidth="1">
                    <title>{`${entry.name || entry.id} · Era ${era} · mean ${row.mean} · ${row.samples || 0} samples`}</title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const StatisticsRow = ({ row, hideEra = false }) => (
  <tr>
    {!hideEra ? <td className="px-2 py-2 text-slate-400">{row.era}</td> : null}
    <td className="px-2 py-2 font-semibold text-slate-200">{row.name || row.item_id}</td>
    <td className="px-2 py-2 text-teal-300">{row.mean}</td>
    <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{Object.entries(row.distribution || {}).map(([value, count]) => <span key={value} className="border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">{value}: {count}</span>)}</div></td>
  </tr>
);

export default AdminPage;
