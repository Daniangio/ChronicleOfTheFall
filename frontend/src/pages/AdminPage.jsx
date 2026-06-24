import { Edit3, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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
];

const catalogSections = new Set(["tags", "cards", "roles", "agendas", "events"]);

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
  cards: ["tags", "requires"],
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

const GuidedMetadataEditor = ({ activeSection, catalogForm, setCatalogForm, tagEntries }) => {
  if (activeSection === "tags") return null;

  const data = dataForForm(catalogForm);
  const countFields = tagCountFieldsBySection[activeSection] || [];
  const listFields = tagListFieldsBySection[activeSection] || [];
  const singleFields = tagSingleFieldsBySection[activeSection] || [];
  const usefulFields = [...countFields, ...listFields, ...singleFields];
  if (!usefulFields.length) return null;

  const setField = (field, value) => {
    const nextData = { ...data };
    if (
      (Array.isArray(value) && value.length === 0) ||
      (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
    ) {
      delete nextData[field];
    } else {
      nextData[field] = value;
    }
    setCatalogForm((state) => ({ ...state, dataText: stringifyData(nextData) }));
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
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [tagEntries, setTagEntries] = useState([]);
  const [catalogSummary, setCatalogSummary] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [tagCategoryFilter, setTagCategoryFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeSection = sections.some((entry) => entry.key === section) ? section : null;
  const isCatalogSection = catalogSections.has(activeSection);

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
      const [summary, entries, tags = entries] = await Promise.all(requests);
      setCatalogSummary(summary);
      setCatalogEntries(entries);
      setTagEntries(targetSection === "tags" ? entries : tags);
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
      void loadCatalog(activeSection);
    }
  }, [activeSection, isCatalogSection, token]);

  const filteredCatalogEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalogEntries.filter((entry) => {
      const matchesQuery = !normalized || [entry.id, entry.name, entry.kind, entry.category, entry.summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
      const matchesCategory =
        activeSection !== "tags" ||
        tagCategoryFilter === "all" ||
        entry.category === tagCategoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [activeSection, catalogEntries, query, tagCategoryFilter]);

  const tagCategories = useMemo(
    () => Array.from(new Set(catalogEntries.map((entry) => entry.category || "uncategorized"))).sort(),
    [catalogEntries]
  );

  const groupedCatalogEntries = useMemo(() => {
    if (activeSection !== "tags") return [["", filteredCatalogEntries]];
    return Object.entries(groupedTags(filteredCatalogEntries)).sort(([left], [right]) =>
      left.localeCompare(right)
    );
  }, [activeSection, filteredCatalogEntries]);

  const beginCreateCatalogEntry = () => {
    setEditingEntry(null);
    setCatalogForm({
      ...emptyCatalogForm,
      color: activeSection === "tags" ? "#64748b" : "",
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
      const payload = {
        name: catalogForm.name,
        category: catalogForm.category,
        summary: catalogForm.summary,
        color: activeSection === "tags" ? catalogForm.color : null,
        data: parseCatalogData(),
      };
      const path = editingEntry
        ? `/api/admin/${activeSection}/${editingEntry.id}`
        : `/api/admin/${activeSection}`;
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
      if (activeSection === "tags") {
        setTagEntries((entries) => {
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
      await request(`/api/admin/${activeSection}/${entry.id}`, { method: "DELETE" });
      setCatalogEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
      if (activeSection === "tags") {
        setTagEntries((entries) => entries.filter((candidate) => candidate.id !== entry.id));
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
            <button
              className="inline-flex items-center gap-2 rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300"
              onClick={beginCreateCatalogEntry}
              type="button"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New {activeSection.slice(0, -1)}
            </button>
          </div>
          <div className="space-y-6">
            {groupedCatalogEntries.map(([category, entries]) => (
              <section key={category || "all"} className="space-y-3">
                {activeSection === "tags" ? (
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
                <label className="block">
                  <span className="text-sm font-medium text-slate-300">Category</span>
                  <input
                    value={catalogForm.category}
                    onChange={(event) => setCatalogForm((state) => ({ ...state, category: event.target.value }))}
                    className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-400"
                  />
                </label>
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
                tagEntries={tagEntries}
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
