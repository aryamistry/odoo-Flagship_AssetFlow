import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  description?: string | null;
  attachmentUrl?: string | null;
  expectedRetirementOn?: string | null;
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
export function AssetsPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Master[]>("/categories").then((r) => r.data),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Master[]>("/departments").then((r) => r.data),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<Master[]>("/locations").then((r) => r.data),
  });
  const query = useQuery({
    queryKey: ["assets", params.toString()],
    queryFn: () => api<Asset[]>(`/assets?${params}`).then((r) => r),
  });
  return (
    <Page
      title="Assets"
      description="Search and manage the organization’s physical assets and shared resources."
      action={
        auth.hasRole("ASSET_MANAGER") ? (
          <Link className="button primary" to="/assets/new">
            ＋ Register asset
          </Link>
        ) : undefined
      }
    >
      <Card>
        <div className="filters">
          <input
            aria-label="Search assets"
            placeholder="Search tag, name, serial or QR…"
            defaultValue={params.get("search") ?? ""}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              e.target.value
                ? next.set("search", e.target.value)
                : next.delete("search");
              setParams(next);
            }}
          />
          <select
            aria-label="Asset status"
            defaultValue={params.get("status") ?? ""}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              e.target.value
                ? next.set("status", e.target.value)
                : next.delete("status");
              setParams(next);
            }}
          >
            <option value="">All statuses</option>
            {[
              "AVAILABLE",
              "ALLOCATED",
              "UNDER_MAINTENANCE",
              "LOST",
              "RETIRED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <FilterSelect
            label="Asset category"
            value={params.get("categoryId") ?? ""}
            options={categories.data ?? []}
            onChange={(value) =>
              setFilter(params, setParams, "categoryId", value)
            }
          />
          <FilterSelect
            label="Owning department"
            value={params.get("departmentId") ?? ""}
            options={departments.data ?? []}
            onChange={(value) =>
              setFilter(params, setParams, "departmentId", value)
            }
          />
          <FilterSelect
            label="Asset location"
            value={params.get("locationId") ?? ""}
            options={locations.data ?? []}
            onChange={(value) =>
              setFilter(params, setParams, "locationId", value)
            }
          />
        </div>
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : !query.data?.data.length ? (
          <Empty>No assets match these filters.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Bookable</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <Link className="table-link" to={`/assets/${asset.id}`}>
                      <strong>{asset.assetTag}</strong>
                      <span>{asset.name}</span>
                    </Link>
                  </td>
                  <td>{asset.condition}</td>
                  <td>
                    <Badge tone={statusTone(asset.status)}>
                      {asset.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td>{asset.isBookable ? "Yes" : "No"}</td>
                  <td>{displayDate(asset.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}
function setFilter(
  params: URLSearchParams,
  setParams: (value: URLSearchParams) => void,
  key: string,
  value: string,
) {
  const next = new URLSearchParams(params);
  value ? next.set(key, value) : next.delete(key);
  setParams(next);
}
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Master[];
  onChange(value: string): void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
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
});
export function NewAssetPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Master[]>("/categories").then((r) => r.data),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Master[]>("/departments").then((r) => r.data),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<Master[]>("/locations").then((r) => r.data),
  });
  const form = useForm({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      condition: "GOOD" as const,
      serialNumber: "",
      qrCode: "",
      owningDepartmentId: "",
      currentLocationId: "",
      isBookable: false,
      acquisitionDate: "",
      expectedRetirementOn: "",
    },
  });
  const categoryId = form.watch("categoryId");
  const categoryFields = useQuery({
    queryKey: ["category-fields", categoryId],
    queryFn: () =>
      api<CategoryField[]>(`/categories/${categoryId}/fields`).then(
        (r) => r.data,
      ),
    enabled: Boolean(categoryId),
  });
  return (
    <Page
      title="Register asset"
      description="Create a traceable asset record. Lifecycle status starts as Available."
    >
      <Card className="form-card">
        <form
          onSubmit={form.handleSubmit(async (values) => {
            setError("");
            try {
              const body = Object.fromEntries(
                Object.entries(values).filter(([, value]) => value !== ""),
              );
              const fields = (categoryFields.data ?? [])
                .filter(
                  (field) =>
                    customValues[field.id] !== undefined &&
                    customValues[field.id] !== "",
                )
                .map((field) => ({
                  fieldDefinitionId: field.id,
                  value: customValues[field.id],
                }));
              const result = await post<Asset>("/assets", { ...body, fields });
              navigate(`/assets/${result.data.id}`);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to register asset.",
              );
            }
          })}
        >
          <h2>Core details</h2>
          <div className="form-grid">
            <Field label="Asset name">
              <input {...form.register("name")} />
              {form.formState.errors.name && (
                <small>{form.formState.errors.name.message}</small>
              )}
            </Field>
            <Field label="Category">
              <select {...form.register("categoryId")}>
                <option value="">Select category</option>
                {categories.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select {...form.register("condition")}>
                {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Serial number">
              <input {...form.register("serialNumber")} />
            </Field>
            <Field label="QR code value">
              <input {...form.register("qrCode")} />
            </Field>
            <Field label="Owning department">
              <select {...form.register("owningDepartmentId")}>
                <option value="">None</option>
                {departments.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <select {...form.register("currentLocationId")}>
                <option value="">None</option>
                {locations.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Acquisition date">
              <input type="date" {...form.register("acquisitionDate")} />
            </Field>
            <Field label="Expected retirement">
              <input type="date" {...form.register("expectedRetirementOn")} />
            </Field>
          </div>
          {categoryFields.data?.length ? (
            <section>
              <h2>Category details</h2>
              <div className="form-grid">
                {categoryFields.data
                  .filter((field) => field.status === "ACTIVE")
                  .map((field) => (
                    <DynamicCategoryField
                      key={field.id}
                      field={field}
                      value={customValues[field.id]}
                      onChange={(value) =>
                        setCustomValues((current) => ({
                          ...current,
                          [field.id]: value,
                        }))
                      }
                    />
                  ))}
              </div>
            </section>
          ) : null}
          <label className="check-row">
            <input type="checkbox" {...form.register("isBookable")} />
            This asset can be booked by time
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => navigate("/assets")}>
              Cancel
            </button>
            <button className="primary" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Registering…" : "Register asset"}
            </button>
          </div>
        </form>
      </Card>
    </Page>
  );
}
function DynamicCategoryField({
  field,
  value,
  onChange,
}: {
  field: CategoryField;
  value: unknown;
  onChange(value: unknown): void;
}) {
  const options = Array.isArray(field.optionsJson)
    ? field.optionsJson.map(String)
    : [];
  if (field.fieldType === "BOOLEAN")
    return (
      <label className="check-row">
        <input
          type="checkbox"
          required={field.isRequired}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.fieldType === "SELECT")
    return (
      <Field label={field.label}>
        <select
          required={field.isRequired}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </Field>
    );
  if (field.fieldType === "MULTI_SELECT")
    return (
      <Field label={field.label} hint="Hold Ctrl/Cmd to select multiple">
        <select
          multiple
          required={field.isRequired}
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={(event) =>
            onChange(
              Array.from(
                event.target.selectedOptions,
                (option) => option.value,
              ),
            )
          }
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </Field>
    );
  if (field.fieldType === "LONG_TEXT")
    return (
      <Field label={field.label}>
        <textarea
          required={field.isRequired}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  const type =
    field.fieldType === "INTEGER" || field.fieldType === "DECIMAL"
      ? "number"
      : field.fieldType === "DATE"
        ? "date"
        : field.fieldType === "DATETIME"
          ? "datetime-local"
          : "text";
  return (
    <Field label={field.label}>
      <input
        type={type}
        required={field.isRequired}
        step={field.fieldType === "DECIMAL" ? "any" : undefined}
        value={String(value ?? "")}
        onChange={(event) =>
          onChange(
            type === "number" && event.target.value !== ""
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </Field>
  );
}
export function AssetDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
  const history = useQuery({
    queryKey: ["asset-history", id],
    queryFn: () =>
      api<Record<string, Array<Record<string, unknown>>>>(
        `/assets/${id}/history`,
      ).then((r) => r.data),
    enabled: Boolean(id),
  });
  const definitions = useQuery({
    queryKey: ["category-fields", query.data?.categoryId],
    queryFn: () =>
      api<CategoryField[]>(`/categories/${query.data!.categoryId}/fields`).then(
        (r) => r.data,
      ),
    enabled: Boolean(query.data?.categoryId),
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      patch<Asset>(`/assets/${id}`, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["asset", id] });
      setEditing(false);
    },
  });
  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const asset = query.data;
  return (
    <Page
      title={`${asset.assetTag} · ${asset.name}`}
      description="Complete operational context and immutable workflow history."
      action={
        <div className="actions">
          {auth.hasRole("ASSET_MANAGER") && (
            <button onClick={() => setEditing(true)}>Edit metadata</button>
          )}
          <Badge tone={statusTone(asset.status)}>
            {asset.status.replaceAll("_", " ")}
          </Badge>
        </div>
      }
    >
      <div className="detail-grid">
        <Card>
          <h2>Asset profile</h2>
          <dl>
            <dt>Category</dt>
            <dd>{asset.category?.name ?? asset.categoryId}</dd>
            <dt>Condition</dt>
            <dd>{asset.condition}</dd>
            <dt>Serial</dt>
            <dd>{asset.serialNumber ?? "—"}</dd>
            <dt>QR code</dt>
            <dd>{asset.qrCode ?? "—"}</dd>
            <dt>Department</dt>
            <dd>{asset.department?.name ?? "—"}</dd>
            <dt>Location</dt>
            <dd>{asset.location?.name ?? "—"}</dd>
            <dt>Bookable</dt>
            <dd>{asset.isBookable ? "Yes" : "No"}</dd>
          </dl>
          {asset.fields?.length ? (
            <div className="custom-values">
              {asset.fields.map((value) => {
                const definition = definitions.data?.find(
                  (field) => field.id === value.fieldDefinitionId,
                );
                return (
                  <div key={value.fieldDefinitionId}>
                    <span>
                      {definition?.label ?? value.fieldDefinitionId.slice(0, 8)}
                    </span>
                    <strong>
                      {Array.isArray(value.valueJson)
                        ? value.valueJson.join(", ")
                        : String(value.valueJson)}
                    </strong>
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
              <p>
                Expected return:{" "}
                {displayDate(asset.activeAllocation.expectedReturnAt)}
              </p>
            </div>
          ) : (
            <Empty>No active allocation.</Empty>
          )}
          {Boolean(asset.maintenance) && (
            <p className="form-error">
              An open maintenance request affects this asset.
            </p>
          )}
        </Card>
      </div>
      <Card>
        <h2>History</h2>
        {history.isLoading ? (
          <Loading />
        ) : (
          <div className="history-groups">
            {history.data &&
              Object.entries(history.data).map(([group, rows]) => (
                <section key={group}>
                  <h3>{group.replaceAll(/([A-Z])/g, " $1")}</h3>
                  <strong>{rows.length}</strong>
                </section>
              ))}
          </div>
        )}
      </Card>
      <Modal
        title="Edit asset metadata"
        open={editing}
        onClose={() => setEditing(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            update.mutate({
              name: values.name,
              description: values.description || null,
              serialNumber: values.serialNumber || null,
              qrCode: values.qrCode || null,
              attachmentUrl: values.attachmentUrl || null,
              expectedRetirementOn: values.expectedRetirementOn || null,
              version: asset.version,
            });
          }}
        >
          <Field label="Asset name">
            <input name="name" defaultValue={asset.name} required />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              defaultValue={asset.description ?? ""}
            />
          </Field>
          <div className="form-grid">
            <Field label="Serial number">
              <input
                name="serialNumber"
                defaultValue={asset.serialNumber ?? ""}
              />
            </Field>
            <Field label="QR code">
              <input name="qrCode" defaultValue={asset.qrCode ?? ""} />
            </Field>
            <Field label="Expected retirement">
              <input
                type="date"
                name="expectedRetirementOn"
                defaultValue={asset.expectedRetirementOn?.slice(0, 10) ?? ""}
              />
            </Field>
            <Field label="Attachment URL">
              <input
                type="url"
                name="attachmentUrl"
                defaultValue={asset.attachmentUrl ?? ""}
              />
            </Field>
          </div>
          {update.error && <p className="form-error">{update.error.message}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="primary">Save metadata</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
