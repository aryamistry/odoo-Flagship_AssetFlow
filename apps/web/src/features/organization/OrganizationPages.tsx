import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, patch, post, put } from "../../lib/api";
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
type Master = {
  id: string;
  code: string;
  name: string;
  status: string;
  type?: string;
  description?: string | null;
  parentDepartmentId?: string | null;
  parentLocationId?: string | null;
  defaultUsefulLifeMonths?: number | null;
};
const tabs = [
  { key: "departments", label: "Departments" },
  { key: "locations", label: "Locations" },
  { key: "categories", label: "Categories" },
];
export function OrganizationSetupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const key =
    tabs.find((tab) => location.pathname.endsWith(tab.key))?.key ??
    "departments";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Master | null>(null);
  const query = useQuery({
    queryKey: [key],
    queryFn: () => api<Master[]>(`/${key}`).then((r) => r.data),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => post(`/${key}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [key] });
      setOpen(false);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      patch(`/${key}/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] }),
  });
  return (
    <Page
      title="Organization setup"
      description="Define the master data used by every AssetFlow workflow."
      action={
        <button className="primary" onClick={() => setOpen(true)}>
          ＋ Add {key.slice(0, -1)}
        </button>
      }
    >
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            className={key === tab.key ? "active" : ""}
            key={tab.key}
            onClick={() => navigate(`/organization/${tab.key}`)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Card>
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : !query.data?.length ? (
          <Empty>No {key} configured.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type / detail</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.code}</strong>
                  </td>
                  <td>{item.name}</td>
                  <td>
                    {item.type ??
                      item.description ??
                      (item.defaultUsefulLifeMonths
                        ? `${item.defaultUsefulLifeMonths} months useful life`
                        : "—")}
                  </td>
                  <td>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td className="actions">
                    {key === "categories" && (
                      <button onClick={() => setSelectedCategory(item)}>
                        Fields
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const name = window.prompt("Updated name", item.name);
                        if (name?.trim())
                          update.mutate({
                            id: item.id,
                            body: { name: name.trim() },
                          });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        update.mutate({
                          id: item.id,
                          body: {
                            status:
                              item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          },
                        })
                      }
                    >
                      {item.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <MasterModal
        kind={key}
        open={open}
        onClose={() => setOpen(false)}
        items={query.data ?? []}
        pending={create.isPending}
        error={create.error}
        onSubmit={(values) => create.mutate(values)}
      />
      <CategoryFieldsPanel
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
      />
    </Page>
  );
}
type CategoryField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  optionsJson: unknown;
  validationJson: unknown;
  sortOrder: number;
  status: string;
};
function CategoryFieldsPanel({
  category,
  onClose,
}: {
  category: Master | null;
  onClose(): void;
}) {
  const client = useQueryClient();
  const fields = useQuery({
    queryKey: ["category-fields", category?.id],
    queryFn: () =>
      api<CategoryField[]>(`/categories/${category!.id}/fields`).then(
        (r) => r.data,
      ),
    enabled: Boolean(category),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      post(`/categories/${category!.id}/fields`, body),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["category-fields", category?.id] }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      patch(`/category-fields/${id}`, body),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["category-fields", category?.id] }),
  });
  return (
    <Modal
      title={`${category?.name ?? "Category"} fields`}
      open={Boolean(category)}
      onClose={onClose}
    >
      <p>
        Define validated, typed fields rendered when registering assets in this
        category.
      </p>
      {fields.isLoading ? (
        <Loading />
      ) : fields.error ? (
        <ErrorState error={fields.error} />
      ) : !fields.data?.length ? (
        <Empty>No custom fields defined.</Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.data.map((field) => (
              <tr key={field.id}>
                <td>
                  <strong>{field.label}</strong>
                  <small className="block">{field.fieldKey}</small>
                </td>
                <td>{field.fieldType}</td>
                <td>{field.isRequired ? "Yes" : "No"}</td>
                <td>
                  <Badge tone={statusTone(field.status)}>{field.status}</Badge>
                </td>
                <td>
                  <button
                    onClick={() =>
                      update.mutate({
                        id: field.id,
                        body: {
                          status:
                            field.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        },
                      })
                    }
                  >
                    {field.status === "ACTIVE" ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          const options = String(values.options ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          create.mutate({
            fieldKey: values.fieldKey,
            label: values.label,
            fieldType: values.fieldType,
            isRequired: values.isRequired === "on",
            optionsJson: options.length ? options : undefined,
            validationJson: values.pattern
              ? { pattern: values.pattern }
              : undefined,
            sortOrder: Number(values.sortOrder || 0),
          });
          event.currentTarget.reset();
        }}
      >
        <h3>Add field</h3>
        <div className="form-grid">
          <Field label="Stable field key">
            <input
              name="fieldKey"
              pattern="[a-z][a-z0-9_]*"
              required
              placeholder="warranty_period"
            />
          </Field>
          <Field label="Label">
            <input name="label" required placeholder="Warranty period" />
          </Field>
          <Field label="Type">
            <select name="fieldType">
              {[
                "TEXT",
                "LONG_TEXT",
                "INTEGER",
                "DECIMAL",
                "BOOLEAN",
                "DATE",
                "DATETIME",
                "SELECT",
                "MULTI_SELECT",
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Sort order">
            <input name="sortOrder" type="number" defaultValue="0" />
          </Field>
        </div>
        <Field
          label="Select options"
          hint="Comma-separated; used for Select and Multi-select"
        >
          <input name="options" />
        </Field>
        <Field label="Validation pattern" hint="Optional regular expression">
          <input name="pattern" />
        </Field>
        <label className="check-row">
          <input type="checkbox" name="isRequired" />
          Required
        </label>
        {create.error && <p className="form-error">{create.error.message}</p>}
        <div className="form-actions">
          <button className="primary">Add field</button>
        </div>
      </form>
    </Modal>
  );
}
function MasterModal({
  kind,
  open,
  onClose,
  onSubmit,
  pending,
  error,
  items,
}: {
  kind: string;
  open: boolean;
  onClose(): void;
  onSubmit(v: Record<string, unknown>): void;
  pending: boolean;
  error: unknown;
  items: Master[];
}) {
  return (
    <Modal title={`Add ${kind.slice(0, -1)}`} open={open} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          onSubmit({
            ...values,
            ...(kind === "locations"
              ? {
                  type: values.type || "AREA",
                  parentLocationId: values.parentLocationId || undefined,
                }
              : {}),
            ...(kind === "departments"
              ? { parentDepartmentId: values.parentDepartmentId || undefined }
              : {}),
            ...(kind === "categories" && values.defaultUsefulLifeMonths
              ? {
                  defaultUsefulLifeMonths: Number(
                    values.defaultUsefulLifeMonths,
                  ),
                }
              : {}),
          });
        }}
      >
        <div className="form-grid">
          <Field label="Code">
            <input name="code" required />
          </Field>
          <Field label="Name">
            <input name="name" required />
          </Field>
        </div>
        {kind === "locations" && (
          <>
            <Field label="Location type">
              <select name="type">
                <option>SITE</option>
                <option>BUILDING</option>
                <option>FLOOR</option>
                <option>ROOM</option>
                <option>AREA</option>
              </select>
            </Field>
            <Field label="Parent location">
              <select name="parentLocationId">
                <option value="">No parent</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {kind === "departments" && (
          <Field label="Parent department">
            <select name="parentDepartmentId">
              <option value="">No parent</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "categories" && (
          <Field label="Default useful life (months)">
            <input name="defaultUsefulLifeMonths" type="number" min="1" />
          </Field>
        )}
        <Field label="Description">
          <textarea name="description" rows={3} />
        </Field>
        {Boolean(error) && (
          <p className="form-error">
            {error instanceof Error ? error.message : "Unable to save."}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={pending}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
type Employee = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  employeeCode: string | null;
  status: string;
  roles: Array<{ role: string; departmentId: string | null }>;
};
export function EmployeesPage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Employee | null>(null);
  const query = useQuery({
    queryKey: ["employees"],
    queryFn: () =>
      api<Employee[]>("/employees?pageSize=100").then((r) => r.data),
  });
  const roles = useMutation({
    mutationFn: ({
      id,
      roles,
    }: {
      id: string;
      roles: Array<{ role: string }>;
    }) => put(`/employees/${id}/roles`, roles),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["employees"] });
      setSelected(null);
    },
  });
  const status = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      patch(`/employees/${id}`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["employees"] }),
  });
  return (
    <Page
      title="Employees"
      description="Manage access, roles, and employee account status."
    >
      <Card>
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : !query.data?.length ? (
          <Empty />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <strong>
                      {employee.firstName} {employee.lastName}
                    </strong>
                    <small className="block">{employee.employeeCode}</small>
                  </td>
                  <td>{employee.email}</td>
                  <td>
                    <div className="tag-row">
                      {employee.roles.map((role) => (
                        <Badge key={role.role} tone="info">
                          {role.role.replaceAll("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Badge tone={statusTone(employee.status)}>
                      {employee.status}
                    </Badge>
                  </td>
                  <td className="actions">
                    <button onClick={() => setSelected(employee)}>Roles</button>
                    <button
                      onClick={() =>
                        status.mutate({
                          id: employee.id,
                          status:
                            employee.status === "ACTIVE"
                              ? "INACTIVE"
                              : "ACTIVE",
                        })
                      }
                    >
                      {employee.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal
        title="Assign roles"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const chosenRole = formData.get("role");
            const selectedRoles = chosenRole ? [{ role: String(chosenRole) }] : [];
            if (selected)
              roles.mutate({ id: selected.id, roles: selectedRoles });
          }}
        >
          <p>
            Select exactly one role for this employee. Employee access is always
            included as a baseline.
          </p>
          <div className="role-radio-group">
            {["EMPLOYEE", "ADMIN", "ASSET_MANAGER", "DEPARTMENT_HEAD"].map(
              (role) => (
                <label className="role-radio-row" key={role}>
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    defaultChecked={
                      selected?.roles.length
                        ? selected.roles[selected.roles.length - 1].role === role
                        : role === "EMPLOYEE"
                    }
                  />
                  <span className="role-radio-label">
                    <strong>{role.replaceAll("_", " ")}</strong>
                  </span>
                </label>
              ),
            )}
          </div>
          {roles.error && <p className="form-error">{roles.error.message}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setSelected(null)}>
              Cancel
            </button>
            <button className="primary">Update role</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
