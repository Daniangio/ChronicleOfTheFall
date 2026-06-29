import { Download, Edit3, Plus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  { key: "images", label: "Images", to: "/admin/images" },
  { key: "cards", label: "Cards", to: "/admin/cards" },
  { key: "ministries", label: "Ministries", to: "/admin/ministries" },
  { key: "event-types", label: "Event Types", to: "/admin/event-types" },
  { key: "agendas", label: "Agendas", to: "/admin/agendas" },
  { key: "events", label: "Events", to: "/admin/events" },
  { key: "groups", label: "Groups", to: "/admin/groups" },
  { key: "decks", label: "Decks", to: "/admin/decks" },
];

const catalogSections = new Set([
  "tags",
  "images",
  "cards",
  "ministries",
  "event-types",
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
  cards: [],
  ministries: [],
  agendas: [],
  events: [],
};

const tagCountFieldsBySection = {
  cards: [],
  ministries: [],
  agendas: [],
  events: [],
};

const tagSingleFieldsBySection = {
  cards: [],
  ministries: [],
  agendas: [],
  events: [],
};

const placementOptions = [
  { value: "city", label: "City" },
  { value: "empire", label: "Empire Zone" },
];

const emptyRequirement = { type: "not_condition", tag_id: "", card_id: "", scope: "city" };
const emptyReplacementEffect = { type: "add_condition", tag_id: "", scope: "target", amount: 1 };
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
  const [mode, setMode] = useState("choose");
  const [crop, setCrop] = useState({ x: 16, y: 16, width: 96, height: 96 });
  const [dragStart, setDragStart] = useState(null);

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
    onChange(removeBackground(image, naturalCrop));
    setSource("");
    setMode("choose");
    setDragStart(null);
  };

  const closePanel = () => {
    setSource("");
    setMode("choose");
    setDragStart(null);
  };

  const saveOriginal = () => {
    onChange(source);
    closePanel();
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{label}</h3>
          <p className="mt-1 text-xs text-slate-500">Upload an image as-is, or crop it and remove the crop background.</p>
        </div>
        {value ? <img alt="" className="h-10 w-10 rounded-md border border-slate-700 object-contain" src={value} /> : null}
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
              className="relative mt-4 inline-block max-w-full select-none overflow-hidden rounded-md border border-slate-700"
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
              <button className="rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300" onClick={mode === "crop" ? saveCrop : saveOriginal} type="button">
                {mode === "crop" ? "Save Cropped Icon" : "Use Original Image"}
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
        {selected?.data?.src ? <img alt="" className="h-12 w-12 rounded-md object-contain" src={selected.data.src} /> : null}
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
                <img alt="" className="h-14 w-full object-contain" src={image.data.src} />
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

const ImageGuidedFields = ({ data, setField }) => (
  <IconImageEditor label="Image Asset" value={data.src || ""} onChange={(src) => setField("src", src)} />
);

const TagResourceFields = ({ data, setField, imageEntries }) => (
  <div>
    <ImageAssetSelect
      label="Tag Icon"
      images={imageEntries}
      selectedId={data.icon_image_id || ""}
      onSelect={(image) => {
        setField("icon_image_id", image?.id || "");
        setField("icon", image?.data?.src || "");
      }}
    />
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

const CardGuidedFields = ({ data, setField, tagEntries, cardEntries, groupEntries }) => {
  const conditionTags = tagEntries.filter((tag) => tag.category === "condition");
  const resourceTags = volatileResourceTags(tagEntries);
  const permanentTags = permanentOnlyTags(tagEntries);
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
        label="Card Type"
        value={data.card_type || "building"}
        options={[
          { value: "city", label: "City" },
          { value: "building", label: "Building" },
          { value: "politics", label: "Politics" },
          { value: "economy", label: "Economy" },
        ]}
        onChange={(value) => setField("card_type", value)}
      />

      <SelectField
        label="Placement"
        value={data.placement || "city"}
        options={placementOptions}
        onChange={(value) => setField("placement", value)}
      />

      {data.card_type === "city" ? (
        <NumberField
          label="Building Slots"
          value={data.building_slots || 3}
          onChange={(value) => setField("building_slots", Math.max(0, value))}
        />
      ) : null}

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
  const deckType = ["empire", "events", "common-pool"].includes(data.deck_type) ? data.deck_type : "empire";
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
          { value: "empire", label: "Empire Deck" },
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

const MinistryGuidedFields = ({ data, setField, tagEntries, imageEntries }) => {
  const resourceTags = volatileResourceTags(tagEntries);
  const infrastructureResources = Array.isArray(data.infrastructure_resources)
    ? data.infrastructure_resources
    : Object.keys(data.infrastructure_resources || {});
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
          setField("icon", image?.data?.src || "");
        }}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["is_minister_of_empire", "Minister of the Empire"],
          ["can_finalize_projects", "Can finalize projects"],
          ["can_block_player_council", "Can block a player during Council"],
          ["first_administration_turn", "First during Administration"],
          ["fallback_event_decider", "Decides if responsible minister is missing"],
          ["can_decide_destroyed_building", "Chooses destroyed buildings"],
          ["can_propose_politics_economy", "Can propose Politics and Economy cards"],
          ["can_peek_event_queue", "Can look at one queued Event once per Year"],
        ].map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <input
              checked={Boolean(data[field])}
              onChange={(event) => setField(field, event.target.checked)}
              type="checkbox"
            />
            {label}
          </label>
        ))}
      </div>

      <TagToggleGroup
        label="Infrastructure Resources"
        tags={resourceTags}
        selectedIds={infrastructureResources}
        onToggle={(tagId) => {
          setField(
            "infrastructure_resources",
            infrastructureResources.includes(tagId)
              ? infrastructureResources.filter((item) => item !== tagId)
              : [...infrastructureResources, tagId]
          );
        }}
      />
    </>
  );
};

const emptyEventEffect = { effect_type: "modify_pillar", payload: { pillar: "treasury", amount: -1 } };
const emptyEventThreshold = { tag_id: "unrest", amount: 1, effects: [emptyEventEffect] };

const EventEffectEditor = ({ effects, setEffects, resourceTags, allTags, ministryEntries }) => {
  const updateEffect = (index, patch) => {
    const next = [...effects];
    next[index] = { ...next[index], ...patch };
    setEffects(next);
  };
  const updatePayload = (index, patch) => {
    const current = effects[index] || emptyEventEffect;
    updateEffect(index, { payload: { ...(current.payload || {}), ...patch } });
  };

  return (
    <div className="space-y-2">
      {effects.map((effect, index) => (
        <div key={index} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[12rem_1fr_7rem_auto]">
          <SelectField
            label="Effect"
            value={effect.effect_type || "modify_pillar"}
            options={[
              { value: "generate_resource", label: "Generate resource" },
              { value: "modify_pillar", label: "Modify pillar" },
              { value: "destroy_building_with_tag", label: "Destroy building" },
              { value: "discard_card", label: "Discard card" },
              { value: "freeze_resource_generation", label: "Freeze resource" },
              { value: "block_minister_next_year", label: "Block minister" },
            ]}
            onChange={(value) => updateEffect(index, { effect_type: value, payload: {} })}
          />
          {effect.effect_type === "generate_resource" ? (
            <>
              <SelectField
                label="Resource"
                value={effect.payload?.resource_id || ""}
                options={[{ value: "", label: "Select resource" }, ...resourceTags.map((tag) => ({ value: tag.id, label: tag.name }))]}
                onChange={(value) => updatePayload(index, { resource_id: value, target: "event_minister" })}
              />
              <NumberField label="Amount" value={effect.payload?.amount || 1} onChange={(value) => updatePayload(index, { amount: value })} />
            </>
          ) : effect.effect_type === "modify_pillar" ? (
            <>
              <SelectField
                label="Pillar"
                value={effect.payload?.pillar || "treasury"}
                options={["treasury", "stability", "morale"].map((pillar) => ({ value: pillar, label: tagLabel(pillar) }))}
                onChange={(value) => updatePayload(index, { pillar: value })}
              />
              <NumberField label="Amount" value={effect.payload?.amount || -1} onChange={(value) => updatePayload(index, { amount: value })} />
            </>
          ) : effect.effect_type === "destroy_building_with_tag" ? (
            <>
              <SelectField
                label="Tag"
                value={effect.payload?.tag_id || ""}
                options={[{ value: "", label: "Select tag" }, ...permanentOnlyTags(allTags).map((tag) => ({ value: tag.id, label: tag.name }))]}
                onChange={(value) => updatePayload(index, { tag_id: value, decider: "minister-of-infrastructure" })}
              />
              <NumberField label="Amount" value={effect.payload?.amount || 1} onChange={(value) => updatePayload(index, { amount: value })} />
            </>
          ) : effect.effect_type === "discard_card" ? (
            <>
              <SelectField
                label="Target"
                value={effect.payload?.target || "all_players"}
                options={[
                  { value: "all_players", label: "All players" },
              { value: "event_minister", label: "Event minister" },
              ...ministryEntries.map((ministry) => ({ value: ministry.id, label: ministry.name })),
                ]}
                onChange={(value) => updatePayload(index, { target: value })}
              />
              <NumberField label="Cards" value={effect.payload?.amount || 1} onChange={(value) => updatePayload(index, { amount: value })} />
            </>
          ) : effect.effect_type === "freeze_resource_generation" ? (
            <>
              <SelectField
                label="Resource"
                value={effect.payload?.resource_id || ""}
                options={[{ value: "", label: "Select resource" }, ...resourceTags.map((tag) => ({ value: tag.id, label: tag.name }))]}
                onChange={(value) => updatePayload(index, { resource_id: value, duration: "next_year" })}
              />
              <span />
            </>
          ) : (
            <>
              <SelectField
                label="Minister"
                value={effect.payload?.ministry_id || ""}
                options={[{ value: "", label: "Event minister" }, ...ministryEntries.map((ministry) => ({ value: ministry.id, label: ministry.name }))]}
                onChange={(value) => updatePayload(index, { ministry_id: value, duration: "next_year" })}
              />
              <span />
            </>
          )}
          <button
            className="mt-7 text-xs font-semibold text-rose-300 hover:text-rose-200"
            onClick={() => setEffects(effects.filter((_, itemIndex) => itemIndex !== index))}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        onClick={() => setEffects([...effects, emptyEventEffect])}
        type="button"
      >
        Add effect
      </button>
    </div>
  );
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

const EventGuidedFields = ({ data, setField, tagEntries, ministryEntries }) => {
  const resourceTags = volatileResourceTags(tagEntries);
  const defenseTags = permanentOnlyTags(tagEntries);
  const thresholds = Array.isArray(data.thresholds) ? data.thresholds : [];
  const selectedMinistryId = data.ministry_id || "";
  const ministryOptions = ministryEntries.map((ministry) => {
    const symbol = ministry.data?.symbol || ministry.id;
    return { value: ministry.id, label: `${ministry.name} (${String(symbol).toUpperCase()})` };
  });

  const updateCount = (field, tagId, count) => {
    const current = data[field] && typeof data[field] === "object" && !Array.isArray(data[field]) ? { ...data[field] } : {};
    if (count <= 0) delete current[tagId];
    else current[tagId] = count;
    setField(field, current);
  };

  return (
    <>
      <SelectField
        label="Jurisdiction Minister"
        value={selectedMinistryId}
        options={[{ value: "", label: "Select minister" }, ...ministryOptions]}
        onChange={(value) => {
          const selected = ministryEntries.find((ministry) => ministry.id === value);
          setField("ministry_id", value);
          setField("ministry_symbol", selected ? selected.data?.symbol || "" : "");
        }}
      />
      <TagCounterGroup
        label="Defense Requirement"
        tags={defenseTags}
        values={data.defense_requirement || {}}
        onChange={(tagId, count) => updateCount("defense_requirement", tagId, count)}
      />

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">Success Effects</h4>
        <EventEffectEditor
          effects={Array.isArray(data.success_effects) ? data.success_effects : []}
          setEffects={(effects) => setField("success_effects", effects)}
          resourceTags={resourceTags}
          allTags={tagEntries}
          ministryEntries={ministryEntries}
        />
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">Failure Effects</h4>
        <EventEffectEditor
          effects={Array.isArray(data.failure_effects) ? data.failure_effects : []}
          setEffects={(effects) => setField("failure_effects", effects)}
          resourceTags={resourceTags}
          allTags={tagEntries}
          ministryEntries={ministryEntries}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-300">Threshold Effects</h4>
          <button
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={() => setField("thresholds", [...thresholds, emptyEventThreshold])}
            type="button"
          >
            Add threshold
          </button>
        </div>
        {thresholds.map((threshold, index) => {
          const updateThreshold = (patch) => {
            const next = [...thresholds];
            next[index] = { ...next[index], ...patch };
            setField("thresholds", next);
          };
          return (
            <div key={index} className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Threshold Tag"
                  value={threshold.tag_id || ""}
                  options={[{ value: "", label: "Select tag" }, ...tagEntries.map((tag) => ({ value: tag.id, label: tag.name }))]}
                  onChange={(value) => updateThreshold({ tag_id: value })}
                />
                <NumberField label="Amount" value={threshold.amount || 1} onChange={(value) => updateThreshold({ amount: value })} />
              </div>
              <EventEffectEditor
                effects={Array.isArray(threshold.effects) ? threshold.effects : []}
                setEffects={(effects) => updateThreshold({ effects })}
                resourceTags={resourceTags}
                allTags={tagEntries}
                ministryEntries={ministryEntries}
              />
              <button
                className="text-xs font-semibold text-rose-300 hover:text-rose-200"
                onClick={() => setField("thresholds", thresholds.filter((_, itemIndex) => itemIndex !== index))}
                type="button"
              >
                Remove threshold
              </button>
            </div>
          );
        })}
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
  eventTypeEntries,
  ministryEntries,
  imageEntries,
}) => {
  const data = dataForForm(catalogForm);
  if (activeSection === "tags" || activeSection === "images") {
    const setField = (field, value) => {
      setCatalogForm((state) => {
        let currentData = {};
        try {
          currentData = parseDataText(state.dataText);
        } catch (_error) {
          currentData = data;
        }
        const nextData = { ...currentData };
        if (value === "" || value === false || value == null) delete nextData[field];
        else nextData[field] = value;
        return { ...state, dataText: stringifyData(nextData) };
      });
    };
    if (activeSection === "images") return <ImageGuidedFields data={data} setField={setField} />;
    return <TagResourceFields data={data} setField={setField} imageEntries={imageEntries} />;
  }

  const countFields = tagCountFieldsBySection[activeSection] || [];
  const listFields = tagListFieldsBySection[activeSection] || [];
  const singleFields = tagSingleFieldsBySection[activeSection] || [];
  const usefulFields = [...countFields, ...listFields, ...singleFields];
  const hasCardGuidance = activeSection === "cards";
  const hasDeckGuidance = activeSection === "decks";
  const hasMinistryGuidance = activeSection === "ministries";
  const hasEventGuidance = activeSection === "events";
  if (!usefulFields.length && !hasCardGuidance && !hasDeckGuidance && !hasMinistryGuidance && !hasEventGuidance) return null;

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
      {hasMinistryGuidance ? (
        <MinistryGuidedFields
          data={data}
          setField={setField}
          tagEntries={tagEntries}
          imageEntries={imageEntries}
        />
      ) : null}
      {hasEventGuidance ? (
        <EventGuidedFields
          data={data}
          setField={setField}
          tagEntries={tagEntries}
          ministryEntries={ministryEntries}
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
  const [imageEntries, setImageEntries] = useState([]);
  const [cardEntries, setCardEntries] = useState([]);
  const [eventEntries, setEventEntries] = useState([]);
  const [eventTypeEntries, setEventTypeEntries] = useState([]);
  const [ministryEntries, setMinistryEntries] = useState([]);
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
      if (targetSection !== "images") {
        requests.push(request("/api/admin/images"));
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
      if (targetSection !== "event-types") {
        requests.push(request("/api/admin/event-types"));
      }
      if (targetSection !== "ministries") {
        requests.push(request("/api/admin/ministries"));
      }
      if (targetSection !== "card-categories") {
        requests.push(request("/api/admin/card-categories"));
      }
      const results = await Promise.all(requests);
      const [summary, entries] = results;
      let resultIndex = 2;
      const tags = targetSection === "tags" ? entries : results[resultIndex++];
      const images = targetSection === "images" ? entries : results[resultIndex++];
      const cards = targetSection === "cards" ? entries : results[resultIndex++];
      const groups = targetSection === "groups" ? entries : results[resultIndex++];
      const events = targetSection === "events" ? entries : results[resultIndex++];
      const eventTypes = targetSection === "event-types" ? entries : results[resultIndex++];
      const ministries = targetSection === "ministries" ? entries : results[resultIndex++];
      const categories = targetSection === "card-categories" ? entries : results[resultIndex++];
      setCatalogSummary(summary);
      setCatalogEntries(entries);
      setTagEntries(targetSection === "tags" ? entries : tags);
      setImageEntries(targetSection === "images" ? entries : images);
      setCardEntries(targetSection === "cards" ? entries : cards);
      setGroupEntries(targetSection === "groups" ? entries : groups);
      setEventEntries(targetSection === "events" ? entries : events);
      setEventTypeEntries(targetSection === "event-types" ? entries : eventTypes);
      setMinistryEntries(targetSection === "ministries" ? entries : ministries);
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
              ? "empire"
            : activeCatalogKind === "event-types"
              ? "event-type"
            : activeCatalogKind === "tags"
              ? "permanent"
            : activeCatalogKind === "images"
              ? "image"
            : "",
      dataText:
        activeCatalogKind === "groups"
          ? stringifyData({ type: "mutually_exclusive" })
            : activeCatalogKind === "decks"
              ? stringifyData({ deck_type: "empire", item_ids: [] })
            : activeCatalogKind === "ministries"
              ? stringifyData({
                  infrastructure_resources: [],
                })
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
      const tagResourceType = parsedData.resource_type === "volatile" ? "volatile" : "permanent";
      const payload = {
        name: catalogForm.name,
        category:
          activeCatalogKind === "groups"
            ? "mutually-exclusive"
            : activeCatalogKind === "card-categories"
              ? "card-category"
              : activeCatalogKind === "decks"
                ? parsedData.deck_type || catalogForm.category || "empire"
              : activeCatalogKind === "tags"
                ? tagResourceType
              : catalogForm.category,
        summary: catalogForm.summary,
        color: activeCatalogKind === "tags" ? catalogForm.color : null,
        data: activeCatalogKind === "groups"
          ? { ...parsedData, type: "mutually_exclusive" }
          : activeCatalogKind === "decks"
            ? { ...parsedData, deck_type: parsedData.deck_type || "empire", item_ids: Array.isArray(parsedData.item_ids) ? parsedData.item_ids : [] }
            : activeCatalogKind === "tags"
              ? { ...parsedData, resource_type: tagResourceType }
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
      if (activeCatalogKind === "event-types") {
        setEventTypeEntries((entries) => {
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
      if (activeCatalogKind === "images") {
        setImageEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
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
      if (activeCatalogKind === "event-types") {
        setEventTypeEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      }
      if (activeCatalogKind === "ministries") {
        setMinistryEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
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
                      ministries={ministryEntries}
                      images={imageEntries}
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
                ) : activeCatalogKind === "tags" ? (
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
                eventTypeEntries={eventTypeEntries}
                ministryEntries={ministryEntries}
                imageEntries={imageEntries}
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
