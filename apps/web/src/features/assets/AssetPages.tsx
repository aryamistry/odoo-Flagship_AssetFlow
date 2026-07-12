import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import QRCode from "qrcode";
import { api, displayDate, patch, post } from "../../lib/api";
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  Page,
  statusTone,
} from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";

type Asset = {
  id: string;
  assetTag: string;
  name: string;
  status: string;
  condition: string;
  categoryId: string;
  currentLocationId: string | null;
  owningDepartmentId: string | null;
  serialNumber: string | null;
  qrCode?: string | null;
  qrToken?: string | null;
  description?: string | null;
  attachmentUrl?: string | null;
  expectedRetirementOn?: string | null;
  warrantyExpiryDate?: string | null;
  isBookable: boolean;
  version: number;
  createdAt: string;
  category?: { name: string };
  department?: { name: string } | null;
  location?: { name: string } | null;
  activeAllocation?: {
    allocatedToUserId: string | null;
    allocatedToDepartmentId: string | null;
    expectedReturnAt: string | null;
  } | null;
  nextBookings?: unknown[];
  maintenance?: unknown;
  fields?: Array<{ fieldDefinitionId: string; valueJson: unknown }>;
};
type Master = { id: string; name: string; code: string };
type CategoryField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  optionsJson: unknown;
  validationJson: unknown;
  status: string;
  sortOrder: number;
};

function daysUntil(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

function WarrantyBanner({ asset }: { asset: Asset }) {
  const days = daysUntil(asset.warrantyExpiryDate);
  if (days === null) return null;
  if (days < 0) {
    return (
      <div className="warranty-alert expired" role="alert">
        ⚠ Warranty expired {Math.abs(days)} days ago ({displayDate(asset.warrantyExpiryDate!)})
      </div>
    );
  }
  if (days <= 30) {
    return (
      <div className="warranty-alert expiring" role="alert">
        ⏰ Warranty expires in {days} days ({displayDate(asset.warrantyExpiryDate!)})
      </div>
    );
  }
  return null;
}

function QrLabelModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const token = asset.qrToken ?? asset.assetTag;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token, {
      width: 220,
      margin: 2,
      color: { dark: "#1a2e1f", light: "#ffffff" },
    }).catch(() => {});
  }, [token]);

  const handlePrint = useCallback(() => {
    const label = labelRef.current;
    if (!label) return;
    const w = window.open("", "_blank", "width=480,height=560");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QR Label \u2014 ${asset.assetTag}</title>
      <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8faf8;}
      .label{border:2px solid #2a6e38;border-radius:12px;padding:24px;text-align:center;max-width:280px;}
      .label canvas{display:block;margin:0 auto;}
      .label h2{font-size:1.3rem;margin:10px 0 4px;}
      .label p{color:#555;margin:2px 0;font-size:.85rem;}
      @media print{body{background:white;}}</style></head><body>
      <div class="label">${label.innerHTML}</div></body></html>`);
    w.document.close();
    w.onload = () => { w.print(); };
  }, [asset]);

  return (
    <Modal title={`QR Label \u2014 ${asset.assetTag}`} open onClose={onClose}>
      <div className="qr-label-wrap">
        <div ref={labelRef} className="qr-label-inner">
          <canvas ref={canvasRef} />
          <h2>{asset.name}</h2>
          <p><strong>{asset.assetTag}</strong></p>
          {asset.serialNumber && <p>S/N: {asset.serialNumber}</p>}
          {asset.category?.name && <p>{asset.category.name}</p>}
        </div>
        <div className="qr-label-hint">
          Scan this label to instantly look up the asset in AssetFlow.
        </div>
        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <button type="button" onClick={onClose}>Close</button>
          <button className="primary" onClick={handlePrint}>🖨 Print label</button>
        </div>
      </div>
    </Modal>
  );
}

export function QrLookupPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lastKeyTime = useRef<number>(0);
  const buffer = useRef<string>("");

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
  }, []);

  const handleLookup = useCallback(async (val?: string) => {
    const v = (val ?? token).trim();
    if (!v) return;
    setError("");
    setLoading(true);
    try {
      const result = await api<Asset>(`/assets/lookup?token=${encodeURIComponent(v)}`);
      navigate(`/assets/${result.data.id}`);
    } catch {
      setError("No asset found for that code. Check your input and try again.");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      if (e.key === "Enter") {
        const val = buffer.current || token;
        if (val.length > 2) handleLookup(val);
        buffer.current = "";
        return;
      }
      if (now - lastKeyTime.current < 60 && e.key.length === 1) {
        buffer.current += e.key;
      } else {
        buffer.current = e.key.length === 1 ? e.key : "";
      }
      lastKeyTime.current = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleLookup, token]);

  return (
    <Page title="Scan / Lookup" description="Scan a QR label or enter an asset tag, serial number, or QR code to locate an asset instantly.">
      <Card className="scanner-card">
        <div className="scanner-icon">📷</div>
        <p className="scanner-hint">
          Aim your USB / Bluetooth barcode scanner at an asset QR label — it will auto-navigate.<br />
          Or type an Asset Tag, Serial Number, or QR Code below.
        </p>
        <div className="scanner-input-row">
          <input
            id="scanner-token-input"
            ref={inputRef}
            className="scanner-input"
            placeholder="Scan or type asset identifier…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
            autoFocus
          />
          <button
            className="primary"
            onClick={() => handleLookup()}
            disabled={loading || !token.trim()}
            id="scanner-lookup-btn"
          >
            {loading ? "Looking up…" : "Look up \u2192"}
          </button>
        </div>
        {error && <p className="form-error" style={{ marginTop: "0.75rem" }}>{error}</p>}
      </Card>
    </Page>
  );
}

type ImportRow = {
  index: number;
  raw: Record<string, string>;
  errors: string[];
  valid: boolean;
};
type ImportPreview = {
  success: boolean;
  preview: ImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.replace(/^"|"$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function CsvImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setLoading(true);
    setError("");
    try {
      const result = await post<ImportPreview>("/assets/bulk-import", { confirm: false, rows: parsed });
      setPreview(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      await post("/assets/bulk-import", { confirm: true, rows });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Import assets from CSV" open onClose={onClose}>
      {!preview ? (
        <div className="import-drop">
          <div className="import-drop-icon">📂</div>
          <p>Upload a <code>.csv</code> file with columns:<br />
            <code>name, category, condition, serialNumber, qrCode, department, location, isBookable, acquisitionDate, expectedRetirementOn, warrantyExpiryDate</code>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            id="csv-import-file"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            className="primary"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            id="csv-import-browse-btn"
          >
            {loading ? "Validating…" : "Choose CSV file"}
          </button>
          {error && <p className="form-error">{error}</p>}
        </div>
      ) : (
        <div className="import-preview">
          <div className="import-summary">
            <span>Total: {preview.totalRows}</span>
            <span style={{ color: "var(--green-dark)" }}>✓ Valid: {preview.validRows}</span>
            {preview.invalidRows > 0 && (
              <span style={{ color: "var(--danger)" }}>✗ Errors: {preview.invalidRows}</span>
            )}
          </div>
          <div className="import-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Category</th><th>Condition</th><th>Serial</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.index} className={row.valid ? "row-valid" : "row-error"}>
                    <td>{row.index + 1}</td>
                    <td>{row.raw.name || "—"}</td>
                    <td>{row.raw.category || row.raw.categoryCode || "—"}</td>
                    <td>{row.raw.condition || "GOOD"}</td>
                    <td>{row.raw.serialNumber || "—"}</td>
                    <td>
                      {row.valid ? (
                        <span style={{ color: "var(--green-dark)" }}>✓ OK</span>
                      ) : (
                        <span style={{ color: "var(--danger)" }} title={row.errors.join("; ")}>
                          ✗ {row.errors[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => { setPreview(null); setRows([]); }}>Back</button>
            <button type="button" onClick={onClose}>Cancel</button>
            <button
              className="primary"
              disabled={!preview.success || loading}
              onClick={handleConfirm}
              id="csv-confirm-import-btn"
              title={!preview.success ? "Fix errors before importing" : ""}
            >
              {loading ? "Importing…" : `Import ${preview.validRows} assets`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BulkUpdateModal({ ids, onClose, onSuccess }: { ids: string[]; onClose: () => void; onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<Master[]>("/locations").then((r) => r.data),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Master[]>("/departments").then((r) => r.data),
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string | null> = {};
    const locId = fd.get("currentLocationId") as string;
    const deptId = fd.get("owningDepartmentId") as string;
    const condition = fd.get("condition") as string;
    const status = fd.get("status") as string;
    if (locId) body.currentLocationId = locId;
    if (deptId) body.owningDepartmentId = deptId;
    if (condition) body.condition = condition;
    if (status) body.status = status;
    if (!Object.keys(body).length) { setError("Select at least one field to update."); return; }
    setLoading(true);
    setError("");
    try {
      await post("/assets/bulk-update", { ids, ...body });
      onSuccess();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Bulk update failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Bulk update ${ids.length} asset${ids.length === 1 ? "" : "s"}`} open onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="muted" style={{ marginBottom: "1rem" }}>Leave fields blank to keep existing values.</p>
        <div className="form-grid">
          <Field label="Move to location">
            <select name="currentLocationId">
              <option value="">— keep current —</option>
              {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Assign to department">
            <select name="owningDepartmentId">
              <option value="">— keep current —</option>
              {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Update condition">
            <select name="condition">
              <option value="">— keep current —</option>
              {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Lifecycle outcome (status)">
            <select name="status">
              <option value="">— keep current —</option>
              {["AVAILABLE", "UNDER_MAINTENANCE", "RESERVED", "LOST", "RETIRED", "DISPOSED"].map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={loading} id="bulk-update-confirm-btn">
            {loading ? "Updating…" : "Apply to all selected"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AssetsPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const client = useQueryClient();

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<Master[]>("/categories").then((r) => r.data) });
  const departments = useQuery({ queryKey: ["departments"], queryFn: () => api<Master[]>("/departments").then((r) => r.data) });
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => api<Master[]>("/locations").then((r) => r.data) });
  const query = useQuery({ queryKey: ["assets", params.toString()], queryFn: () => api<Asset[]>(`/assets?${params}`).then((r) => r) });

  const handleExport = () => { window.location.href = `/api/v1/assets/export.csv?${params}`; };
  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => { const all = query.data?.data ?? []; selected.size === all.length ? setSelected(new Set()) : setSelected(new Set(all.map((a) => a.id))); };
  const allSelected = !!query.data?.data.length && selected.size === query.data.data.length;
  const isManager = auth.hasRole("ASSET_MANAGER");

  return (
    <Page
      title="Assets"
      description="Search and manage the organization's physical assets and shared resources."
      action={
        <div className="actions">
          <Link className="button" to="/assets/lookup" id="scan-lookup-btn">🔍 Scan</Link>
          {isManager && (
            <>
              <button onClick={() => setShowImport(true)} id="import-csv-btn">⇪ Import CSV</button>
              <button onClick={handleExport} id="export-csv-btn">↓ Export CSV</button>
              <Link className="button primary" to="/assets/new" id="register-asset-btn">＋ Register asset</Link>
            </>
          )}
        </div>
      }
    >
      <Card>
        <div className="filters">
          <input
            aria-label="Search assets"
            placeholder="Search tag, name, serial or QR…"
            defaultValue={params.get("search") ?? ""}
            onChange={(e) => { const n = new URLSearchParams(params); e.target.value ? n.set("search", e.target.value) : n.delete("search"); setParams(n); }}
          />
          <select
            aria-label="Asset status"
            value={params.get("status") ?? ""}
            onChange={(e) => { const n = new URLSearchParams(params); e.target.value ? n.set("status", e.target.value) : n.delete("status"); setParams(n); }}
          >
            <option value="">All statuses</option>
            {["AVAILABLE", "ALLOCATED", "UNDER_MAINTENANCE", "LOST", "RETIRED"].map((v) => <option key={v}>{v}</option>)}
          </select>
          <select
            aria-label="Warranty filter"
            value={params.get("warranty") ?? ""}
            onChange={(e) => { const n = new URLSearchParams(params); e.target.value ? n.set("warranty", e.target.value) : n.delete("warranty"); setParams(n); }}
          >
            <option value="">All warranty</option>
            <option value="expiring">⏰ Expiring in 30 days</option>
            <option value="expired">⚠ Expired</option>
          </select>
          <FilterSelect label="Asset category" value={params.get("categoryId") ?? ""} options={categories.data ?? []} onChange={(v) => setFilter(params, setParams, "categoryId", v)} />
          <FilterSelect label="Owning department" value={params.get("departmentId") ?? ""} options={departments.data ?? []} onChange={(v) => setFilter(params, setParams, "departmentId", v)} />
          <FilterSelect label="Asset location" value={params.get("locationId") ?? ""} options={locations.data ?? []} onChange={(v) => setFilter(params, setParams, "locationId", v)} />
        </div>

        {selected.size > 0 && isManager && (
          <div className="bulk-action-bar" id="bulk-action-bar">
            <span>{selected.size} selected</span>
            <button className="primary" onClick={() => setShowBulkUpdate(true)} id="bulk-update-btn">✏ Bulk update</button>
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {query.isLoading ? <Loading /> : query.error ? <ErrorState error={query.error} /> : !query.data?.data.length ? <Empty>No assets match these filters.</Empty> : (
          <table>
            <thead>
              <tr>
                {isManager && <th><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} /></th>}
                <th>Asset</th><th>Condition</th><th>Status</th><th>Warranty</th><th>Bookable</th><th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((asset) => {
                const wdays = daysUntil(asset.warrantyExpiryDate);
                return (
                  <tr key={asset.id} className={selected.has(asset.id) ? "row-selected" : ""}>
                    {isManager && <td><input type="checkbox" aria-label={`Select ${asset.assetTag}`} checked={selected.has(asset.id)} onChange={() => toggleSelect(asset.id)} /></td>}
                    <td><Link className="table-link" to={`/assets/${asset.id}`}><strong>{asset.assetTag}</strong><span>{asset.name}</span></Link></td>
                    <td>{asset.condition}</td>
                    <td><Badge tone={statusTone(asset.status)}>{asset.status.replaceAll("_", " ")}</Badge></td>
                    <td>
                      {wdays === null ? "—" : wdays < 0 ? (
                        <span style={{ color: "var(--danger)", fontWeight: 700 }}>Expired</span>
                      ) : wdays <= 30 ? (
                        <span style={{ color: "#a87700", fontWeight: 700 }}>{wdays}d left</span>
                      ) : (
                        <span style={{ color: "var(--green-dark)" }}>{displayDate(asset.warrantyExpiryDate!)}</span>
                      )}
                    </td>
                    <td>{asset.isBookable ? "Yes" : "No"}</td>
                    <td>{displayDate(asset.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {showImport && <CsvImportModal onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); client.invalidateQueries({ queryKey: ["assets"] }); }} />}
      {showBulkUpdate && <BulkUpdateModal ids={Array.from(selected)} onClose={() => setShowBulkUpdate(false)} onSuccess={() => { setShowBulkUpdate(false); setSelected(new Set()); client.invalidateQueries({ queryKey: ["assets"] }); }} />}
    </Page>
  );
}

function setFilter(params: URLSearchParams, setParams: (v: URLSearchParams) => void, key: string, value: string) {
  const n = new URLSearchParams(params);
  value ? n.set(key, value) : n.delete(key);
  setParams(n);
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Master[]; onChange(value: string): void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

const assetSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().uuid(),
  condition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"]),
  serialNumber: z.string().optional(),
  qrCode: z.string().optional(),
  owningDepartmentId: z.string().optional(),
  currentLocationId: z.string().optional(),
  isBookable: z.boolean(),
  acquisitionDate: z.string().optional(),
  expectedRetirementOn: z.string().optional(),
  warrantyExpiryDate: z.string().optional(),
});

export function NewAssetPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<Master[]>("/categories").then((r) => r.data) });
  const departments = useQuery({ queryKey: ["departments"], queryFn: () => api<Master[]>("/departments").then((r) => r.data) });
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => api<Master[]>("/locations").then((r) => r.data) });
  const form = useForm({
    resolver: zodResolver(assetSchema),
    defaultValues: { name: "", categoryId: "", condition: "GOOD" as const, serialNumber: "", qrCode: "", owningDepartmentId: "", currentLocationId: "", isBookable: false, acquisitionDate: "", expectedRetirementOn: "", warrantyExpiryDate: "" },
  });
  const errs = form.formState.errors;
  const categoryId = form.watch("categoryId");
  const categoryFields = useQuery({
    queryKey: ["category-fields", categoryId],
    queryFn: () => api<CategoryField[]>(`/categories/${categoryId}/fields`).then((r) => r.data),
    enabled: Boolean(categoryId),
  });
  return (
    <Page title="Register asset" description="Create a traceable asset record. Lifecycle status starts as Available.">
      <Card className="form-card">
        <form onSubmit={form.handleSubmit(async (values) => {
          setError("");
          try {
            const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
            const fields = (categoryFields.data ?? []).filter((f) => customValues[f.id] !== undefined && customValues[f.id] !== "").map((f) => ({ fieldDefinitionId: f.id, value: customValues[f.id] }));
            const result = await post<Asset>("/assets", { ...body, fields });
            navigate(`/assets/${result.data.id}`);
          } catch (e) { setError(e instanceof Error ? e.message : "Unable to register asset."); }
        })}>
          <h2>Core details</h2>
          <div className="form-grid">
            <Field label="Asset name"><input {...form.register("name")} />{errs.name && <span className="field-error">{errs.name.message}</span>}</Field>
            <Field label="Category">
              <select {...form.register("categoryId")}>
                <option value="">Select category</option>
                {categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {errs.categoryId && <span className="field-error">{errs.categoryId.message}</span>}
            </Field>
            <Field label="Condition">
              <select {...form.register("condition")}>
                {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Serial number"><input {...form.register("serialNumber")} /></Field>
            <Field label="QR code value"><input {...form.register("qrCode")} /></Field>
            <Field label="Owning department">
              <select {...form.register("owningDepartmentId")}>
                <option value="">None</option>
                {departments.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select {...form.register("currentLocationId")}>
                <option value="">None</option>
                {locations.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Acquisition date"><input type="date" {...form.register("acquisitionDate")} /></Field>
            <Field label="Expected retirement"><input type="date" {...form.register("expectedRetirementOn")} /></Field>
            <Field label="Warranty expiry date"><input type="date" {...form.register("warrantyExpiryDate")} /></Field>
          </div>
          {categoryFields.data?.length ? (
            <section>
              <h2>Category details</h2>
              <div className="form-grid">
                {categoryFields.data.filter((f) => f.status === "ACTIVE").map((field) => (
                  <DynamicCategoryField key={field.id} field={field} value={customValues[field.id]} onChange={(v) => setCustomValues((c) => ({ ...c, [field.id]: v }))} />
                ))}
              </div>
            </section>
          ) : null}
          <label className="check-row"><input type="checkbox" {...form.register("isBookable")} />This asset can be booked by time</label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => navigate("/assets")}>Cancel</button>
            <button className="primary" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Registering…" : "Register asset"}</button>
          </div>
        </form>
      </Card>
    </Page>
  );
}

function DynamicCategoryField({ field, value, onChange }: { field: CategoryField; value: unknown; onChange(value: unknown): void }) {
  const options = Array.isArray(field.optionsJson) ? field.optionsJson.map(String) : [];
  if (field.fieldType === "BOOLEAN") return (<label className="check-row"><input type="checkbox" required={field.isRequired} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>);
  if (field.fieldType === "SELECT") return (<Field label={field.label}><select required={field.isRequired} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">Select</option>{options.map((o) => <option key={o}>{o}</option>)}</select></Field>);
  if (field.fieldType === "MULTI_SELECT") return (<Field label={field.label} hint="Hold Ctrl/Cmd to select multiple"><select multiple required={field.isRequired} value={Array.isArray(value) ? value.map(String) : []} onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}>{options.map((o) => <option key={o}>{o}</option>)}</select></Field>);
  if (field.fieldType === "LONG_TEXT") return (<Field label={field.label}><textarea required={field.isRequired} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} /></Field>);
  const type = field.fieldType === "INTEGER" || field.fieldType === "DECIMAL" ? "number" : field.fieldType === "DATE" ? "date" : field.fieldType === "DATETIME" ? "datetime-local" : "text";
  return (<Field label={field.label}><input type={type} required={field.isRequired} step={field.fieldType === "DECIMAL" ? "any" : undefined} value={String(value ?? "")} onChange={(e) => onChange(type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} /></Field>);
}

type HistoryTab = "statuses" | "allocations" | "bookings" | "maintenance" | "audits";
type HistoryData = { statuses: Record<string, unknown>[]; allocations: Record<string, unknown>[]; bookings: Record<string, unknown>[]; maintenance: Record<string, unknown>[]; audits: Record<string, unknown>[] };

export function AssetDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("statuses");

  const query = useQuery({ queryKey: ["asset", id], queryFn: () => api<Asset>(`/assets/${id}`).then((r) => r.data), enabled: Boolean(id) });
  const history = useQuery({ queryKey: ["asset-history", id], queryFn: () => api<HistoryData>(`/assets/${id}/history`).then((r) => r.data), enabled: Boolean(id) });
  const definitions = useQuery({ queryKey: ["category-fields", query.data?.categoryId], queryFn: () => api<CategoryField[]>(`/categories/${query.data!.categoryId}/fields`).then((r) => r.data), enabled: Boolean(query.data?.categoryId) });
  const update = useMutation({ mutationFn: (body: Record<string, unknown>) => patch<Asset>(`/assets/${id}`, body), onSuccess: () => { client.invalidateQueries({ queryKey: ["asset", id] }); setEditing(false); } });

  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const asset = query.data;
  const hdata = history.data ?? {} as HistoryData;
  const historyTabs: { key: HistoryTab; label: string }[] = [
    { key: "statuses", label: "Status" },
    { key: "allocations", label: "Allocations" },
    { key: "bookings", label: "Bookings" },
    { key: "maintenance", label: "Maintenance" },
    { key: "audits", label: "Audits" },
  ];

  return (
    <Page
      title={`${asset.assetTag} · ${asset.name}`}
      description="Complete operational context and immutable workflow history."
      action={
        <div className="actions">
          {auth.hasRole("ASSET_MANAGER") && (
            <>
              <button onClick={() => setShowQr(true)} id="print-qr-btn">🏷 Print QR</button>
              <button onClick={() => setEditing(true)}>Edit metadata</button>
            </>
          )}
          <Badge tone={statusTone(asset.status)}>{asset.status.replaceAll("_", " ")}</Badge>
        </div>
      }
    >
      <WarrantyBanner asset={asset} />

      <div className="detail-grid">
        <Card>
          <h2>Asset profile</h2>
          <dl>
            <dt>Category</dt><dd>{asset.category?.name ?? asset.categoryId}</dd>
            <dt>Condition</dt><dd>{asset.condition}</dd>
            <dt>Serial</dt><dd>{asset.serialNumber ?? "—"}</dd>
            <dt>QR code</dt><dd>{asset.qrCode ?? "—"}</dd>
            <dt>Department</dt><dd>{asset.department?.name ?? "—"}</dd>
            <dt>Location</dt><dd>{asset.location?.name ?? "—"}</dd>
            <dt>Bookable</dt><dd>{asset.isBookable ? "Yes" : "No"}</dd>
            <dt>Expected retirement</dt><dd>{asset.expectedRetirementOn ? displayDate(asset.expectedRetirementOn) : "—"}</dd>
            <dt>Warranty expiry</dt>
            <dd>
              {asset.warrantyExpiryDate ? (() => {
                const d = daysUntil(asset.warrantyExpiryDate);
                const color = d !== null && d <= 0 ? "var(--danger)" : d !== null && d <= 30 ? "#a87700" : "inherit";
                return <span style={{ color }}>{displayDate(asset.warrantyExpiryDate)}</span>;
              })() : "—"}
            </dd>
          </dl>
          {asset.fields?.length ? (
            <div className="custom-values">
              {asset.fields.map((value) => {
                const definition = definitions.data?.find((f) => f.id === value.fieldDefinitionId);
                return (
                  <div key={value.fieldDefinitionId}>
                    <span>{definition?.label ?? value.fieldDefinitionId.slice(0, 8)}</span>
                    <strong>{Array.isArray(value.valueJson) ? value.valueJson.join(", ") : String(value.valueJson)}</strong>
                  </div>
                );
              })}
            </div>
          ) : null}
        </Card>
        <Card>
          <h2>Current context</h2>
          {asset.activeAllocation ? (
            <div className="context-block">
              <Badge tone="info">ACTIVE ALLOCATION</Badge>
              <p>Expected return: {displayDate(asset.activeAllocation.expectedReturnAt)}</p>
            </div>
          ) : <Empty>No active allocation.</Empty>}
          {Boolean(asset.maintenance) && <p className="form-error">An open maintenance request affects this asset.</p>}
        </Card>
      </div>

      <Card>
        <div className="history-tabs-header">
          <h2 style={{ margin: 0 }}>History</h2>
          <div className="history-tabs">
            {historyTabs.map((tab) => {
              const count = (hdata[tab.key] ?? []).length;
              return (
                <button key={tab.key} className={`history-tab${historyTab === tab.key ? " active" : ""}`} onClick={() => setHistoryTab(tab.key)}>
                  {tab.label}{count > 0 && <span className="history-tab-badge">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {history.isLoading ? <Loading /> : <HistoryTabContent tab={historyTab} rows={(hdata[historyTab] ?? []) as Record<string, unknown>[]} />}
      </Card>

      {showQr && <QrLabelModal asset={asset} onClose={() => setShowQr(false)} />}

      <Modal title="Edit asset metadata" open={editing} onClose={() => setEditing(false)}>
        <form onSubmit={(e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(e.currentTarget));
          update.mutate({ name: v.name, description: v.description || null, serialNumber: v.serialNumber || null, qrCode: v.qrCode || null, attachmentUrl: v.attachmentUrl || null, expectedRetirementOn: v.expectedRetirementOn || null, warrantyExpiryDate: v.warrantyExpiryDate || null, version: asset.version });
        }}>
          <Field label="Asset name"><input name="name" defaultValue={asset.name} required /></Field>
          <Field label="Description"><textarea name="description" defaultValue={asset.description ?? ""} /></Field>
          <div className="form-grid">
            <Field label="Serial number"><input name="serialNumber" defaultValue={asset.serialNumber ?? ""} /></Field>
            <Field label="QR code"><input name="qrCode" defaultValue={asset.qrCode ?? ""} /></Field>
            <Field label="Expected retirement"><input type="date" name="expectedRetirementOn" defaultValue={asset.expectedRetirementOn?.slice(0, 10) ?? ""} /></Field>
            <Field label="Warranty expiry date"><input type="date" name="warrantyExpiryDate" defaultValue={asset.warrantyExpiryDate?.slice(0, 10) ?? ""} /></Field>
            <Field label="Attachment URL"><input type="url" name="attachmentUrl" defaultValue={asset.attachmentUrl ?? ""} /></Field>
          </div>
          {update.error && <p className="form-error">{update.error.message}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="primary">Save metadata</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

function HistoryTabContent({ tab, rows }: { tab: HistoryTab; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <Empty>No {tab} history for this asset.</Empty>;
  const columnsByTab: Record<HistoryTab, string[]> = {
    statuses: ["toStatus", "reasonCode", "sourceType", "changedAt"],
    allocations: ["allocatedAt", "endedAt", "endReason", "checkoutCondition"],
    bookings: ["title", "startAt", "endAt", "status"],
    maintenance: ["issueDescription", "priority", "status", "createdAt"],
    audits: ["snapshotAssetTag", "result", "checkedAt"],
  };
  const cols = columnsByTab[tab];
  return (
    <div className="history-tab-content">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c.replace(/([A-Z])/g, " $1").trim()}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map((col) => {
                const v = row[col];
                const str = typeof v === "string" && (v.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(v)) ? displayDate(v) : v == null ? "—" : String(v).replaceAll("_", " ");
                return <td key={col}>{str}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
