import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, displayDate, post } from "../../lib/api";
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
  isBookable: boolean;
};
type Employee = { id: string; firstName: string; lastName: string | null };
type Department = { id: string; name: string };
type Allocation = {
  id: string;
  assetId: string;
  allocatedToUserId: string | null;
  allocatedToDepartmentId: string | null;
  allocatedAt: string;
  expectedReturnAt: string | null;
  endedAt: string | null;
  checkoutCondition: string;
};
function useReferenceData() {
  const assets = useQuery({
    queryKey: ["assets-ref"],
    queryFn: () => api<Asset[]>("/assets?pageSize=100").then((r) => r.data),
  });
  const employees = useQuery({
    queryKey: ["employees-ref"],
    queryFn: () =>
      api<Employee[]>("/employees?pageSize=100").then((r) => r.data),
    retry: false,
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Department[]>("/departments").then((r) => r.data),
  });
  return {
    assets: assets.data ?? [],
    employees: employees.data ?? [],
    departments: departments.data ?? [],
  };
}
export function AllocationsPage() {
  const auth = useAuth();
  const refs = useReferenceData();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["allocations"],
    queryFn: () => api<Allocation[]>("/allocations").then((r) => r.data),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => post("/allocations", body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["allocations"] });
      client.invalidateQueries({ queryKey: ["assets-ref"] });
      setOpen(false);
    },
  });
  const requestReturn = useMutation({
    mutationFn: (id: string) => post(`/allocations/${id}/request-return`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ["allocations"] }),
  });
  return (
    <Page
      title="Allocations"
      description="Track physical custody, expected returns, and immutable allocation history."
      action={
        auth.hasRole("ASSET_MANAGER") ? (
          <button className="primary" onClick={() => setOpen(true)}>
            ＋ Allocate asset
          </button>
        ) : undefined
      }
    >
      <Card>
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : !query.data?.length ? (
          <Empty>No allocation history.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Holder</th>
                <th>Allocated</th>
                <th>Expected return</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.map((item) => {
                const asset = refs.assets.find((a) => a.id === item.assetId);
                const holder = refs.employees.find(
                  (e) => e.id === item.allocatedToUserId,
                );
                const department = refs.departments.find(
                  (d) => d.id === item.allocatedToDepartmentId,
                );
                const overdue =
                  !item.endedAt &&
                  item.expectedReturnAt &&
                  new Date(item.expectedReturnAt) < new Date();
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {asset?.assetTag ?? item.assetId.slice(0, 8)}
                      </strong>
                      <small className="block">{asset?.name}</small>
                    </td>
                    <td>
                      {holder
                        ? `${holder.firstName} ${holder.lastName ?? ""}`
                        : (department?.name ?? "—")}
                    </td>
                    <td>{displayDate(item.allocatedAt)}</td>
                    <td>{displayDate(item.expectedReturnAt)}</td>
                    <td>
                      <Badge
                        tone={
                          overdue ? "bad" : item.endedAt ? "neutral" : "info"
                        }
                      >
                        {overdue
                          ? "OVERDUE"
                          : item.endedAt
                            ? "CLOSED"
                            : "ACTIVE"}
                      </Badge>
                    </td>
                    <td>
                      {!item.endedAt &&
                        item.allocatedToUserId === auth.user?.id && (
                          <button onClick={() => requestReturn.mutate(item.id)}>
                            Request return
                          </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Modal title="Allocate asset" open={open} onClose={() => setOpen(false)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            create.mutate({
              assetId: values.assetId,
              allocatedToUserId: values.allocatedToUserId || undefined,
              allocatedToDepartmentId:
                values.allocatedToDepartmentId || undefined,
              expectedReturnAt: values.expectedReturnAt
                ? new Date(String(values.expectedReturnAt)).toISOString()
                : undefined,
              checkoutCondition: values.checkoutCondition,
              checkoutNotes: values.checkoutNotes,
            });
          }}
        >
          <Field label="Available asset">
            <select name="assetId" required>
              <option value="">Select asset</option>
              {refs.assets
                .filter((a) => a.status === "AVAILABLE")
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.assetTag} · {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Employee">
              <select name="allocatedToUserId">
                <option value="">None</option>
                {refs.employees.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select name="allocatedToDepartmentId">
                <option value="">None</option>
                {refs.departments.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected return">
              <input type="datetime-local" name="expectedReturnAt" />
            </Field>
            <Field label="Checkout condition">
              <select name="checkoutCondition">
                {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="checkoutNotes" />
          </Field>
          {create.error && <p className="form-error">{create.error.message}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary">Allocate</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
type Transfer = {
  id: string;
  assetId: string;
  sourceAllocationId: string;
  toUserId: string | null;
  toDepartmentId: string | null;
  reason: string;
  status: string;
  createdAt: string;
};
export function TransfersPage() {
  const refs = useReferenceData();
  const auth = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api<Transfer[]>("/transfer-requests").then((r) => r.data),
  });
  const allocations = useQuery({
    queryKey: ["active-allocations"],
    queryFn: () =>
      api<Allocation[]>("/allocations?active=true").then((r) => r.data),
  });
  const command = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      post(path, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["transfers"] });
      setOpen(false);
    },
  });
  return (
    <Page
      title="Transfers"
      description="Move custody atomically without losing allocation history."
      action={
        <button className="primary" onClick={() => setOpen(true)}>
          ＋ Request transfer
        </button>
      }
    >
      <Card>
        {query.isLoading ? (
          <Loading />
        ) : !query.data?.length ? (
          <Empty>No transfer requests.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Destination</th>
                <th>Reason</th>
                <th>Requested</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.map((item) => (
                <tr key={item.id}>
                  <td>
                    {refs.assets.find((a) => a.id === item.assetId)?.name ??
                      item.assetId.slice(0, 8)}
                  </td>
                  <td>
                    {refs.employees.find((e) => e.id === item.toUserId)
                      ?.firstName ??
                      refs.departments.find((d) => d.id === item.toDepartmentId)
                        ?.name}
                  </td>
                  <td>{item.reason}</td>
                  <td>{displayDate(item.createdAt)}</td>
                  <td>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td className="actions">
                    {item.status === "PENDING" &&
                      auth.hasRole("ASSET_MANAGER", "DEPARTMENT_HEAD") && (
                        <>
                          <button
                            onClick={() =>
                              command.mutate({
                                path: `/transfer-requests/${item.id}/approve`,
                                body: {},
                              })
                            }
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              command.mutate({
                                path: `/transfer-requests/${item.id}/reject`,
                                body: { notes: "Not approved" },
                              })
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal
        title="Request transfer"
        open={open}
        onClose={() => setOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            command.mutate({
              path: "/transfer-requests",
              body: {
                sourceAllocationId: values.sourceAllocationId,
                toUserId: values.toUserId || undefined,
                toDepartmentId: values.toDepartmentId || undefined,
                reason: values.reason,
              },
            });
          }}
        >
          <Field label="Current allocation">
            <select name="sourceAllocationId" required>
              <option value="">Select</option>
              {allocations.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {refs.assets.find((asset) => asset.id === a.assetId)?.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Destination employee">
              <select name="toUserId">
                <option value="">None</option>
                {refs.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination department">
              <select name="toDepartmentId">
                <option value="">None</option>
                {refs.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Reason">
            <textarea name="reason" required />
          </Field>
          {command.error && (
            <p className="form-error">{command.error.message}</p>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary">Request transfer</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
type Booking = {
  id: string;
  assetId: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  purpose: string | null;
};
export function BookingsPage() {
  const refs = useReferenceData();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<Booking[]>("/bookings").then((r) => r.data),
  });
  const command = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      post(path, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["bookings"] });
      setOpen(false);
    },
  });
  return (
    <Page
      title="Resource bookings"
      description="Reserve shared assets using conflict-safe time intervals."
      action={
        <button className="primary" onClick={() => setOpen(true)}>
          ＋ Book resource
        </button>
      }
    >
      <Card>
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : !query.data?.length ? (
          <Empty>No bookings yet.</Empty>
        ) : (
          <div className="booking-list">
            {query.data.map((booking) => {
              const derived =
                booking.status === "CONFIRMED"
                  ? new Date(booking.startAt) > new Date()
                    ? "UPCOMING"
                    : new Date(booking.endAt) > new Date()
                      ? "ONGOING"
                      : "COMPLETED"
                  : booking.status;
              return (
                <article key={booking.id}>
                  <div className="calendar-date">
                    <strong>{new Date(booking.startAt).getDate()}</strong>
                    <span>
                      {new Intl.DateTimeFormat(undefined, {
                        month: "short",
                      }).format(new Date(booking.startAt))}
                    </span>
                  </div>
                  <div>
                    <h3>{booking.title}</h3>
                    <p>
                      {refs.assets.find((a) => a.id === booking.assetId)?.name}{" "}
                      · {displayDate(booking.startAt)}–
                      {new Intl.DateTimeFormat(undefined, {
                        timeStyle: "short",
                      }).format(new Date(booking.endAt))}
                    </p>
                  </div>
                  <Badge tone={statusTone(derived)}>{derived}</Badge>
                  {["PENDING", "CONFIRMED"].includes(booking.status) &&
                    new Date(booking.startAt) > new Date() && (
                      <div className="actions">
                        <button
                          onClick={() => {
                            const startAt = window.prompt("New start time (ISO 8601)", booking.startAt);
                            const endAt = window.prompt("New end time (ISO 8601)", booking.endAt);
                            if (startAt && endAt)
                              command.mutate({
                                path: `/bookings/${booking.id}/reschedule`,
                                body: { startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), reason: "Cancel and rebook" },
                              });
                          }}
                        >
                          Cancel &amp; rebook
                        </button>
                        <button
                          onClick={() =>
                            command.mutate({
                              path: `/bookings/${booking.id}/cancel`,
                              body: { reason: "Cancelled by user" },
                            })
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
      <Modal title="Book resource" open={open} onClose={() => setOpen(false)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            command.mutate({
              path: "/bookings",
              body: {
                assetId: values.assetId,
                title: values.title,
                purpose: values.purpose,
                startAt: new Date(String(values.startAt)).toISOString(),
                endAt: new Date(String(values.endAt)).toISOString(),
              },
            });
          }}
        >
          <Field label="Resource">
            <select name="assetId" required>
              <option value="">Select</option>
              {refs.assets
                .filter((a) => a.isBookable)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetTag} · {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Title">
            <input name="title" required />
          </Field>
          <div className="form-grid">
            <Field label="Starts">
              <input name="startAt" type="datetime-local" required />
            </Field>
            <Field label="Ends">
              <input name="endAt" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Purpose">
            <textarea name="purpose" />
          </Field>
          {command.error && (
            <p className="form-error">{command.error.message}</p>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary">Book</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
type Maintenance = {
  id: string;
  assetId: string;
  issueDescription: string;
  priority: string;
  status: string;
  assignedTechnicianUserId: string | null;
  createdAt: string;
};
const columns = [
  "PENDING",
  "APPROVED",
  "TECHNICIAN_ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
];
export function MaintenancePage() {
  const refs = useReferenceData();
  const auth = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["maintenance"],
    queryFn: () =>
      api<Maintenance[]>("/maintenance-requests").then((r) => r.data),
  });
  const command = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      post(path, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["maintenance"] });
      client.invalidateQueries({ queryKey: ["assets-ref"] });
      setOpen(false);
    },
  });
  const next = (item: Maintenance) => {
    if (item.status === "PENDING")
      command.mutate({
        path: `/maintenance-requests/${item.id}/approve`,
        body: { confirmBookingCancellations: true },
      });
    else if (item.status === "APPROVED") {
      const technicianUserId = refs.employees[0]?.id;
      if (technicianUserId)
        command.mutate({
          path: `/maintenance-requests/${item.id}/assign-technician`,
          body: { technicianUserId },
        });
    } else if (item.status === "TECHNICIAN_ASSIGNED")
      command.mutate({
        path: `/maintenance-requests/${item.id}/start`,
        body: {},
      });
    else if (item.status === "IN_PROGRESS")
      command.mutate({
        path: `/maintenance-requests/${item.id}/resolve`,
        body: {
          outcome: "MAKE_AVAILABLE",
          notes: "Repair completed and operational check passed.",
        },
      });
  };
  return (
    <Page
      title="Maintenance"
      description="Move issues through approval, technician assignment, repair, and resolution."
      action={
        <button className="primary" onClick={() => setOpen(true)}>
          ＋ Raise request
        </button>
      }
    >
      <div className="kanban">
        {columns.map((column) => (
          <section className="kanban-column" key={column}>
            <header>
              <h2>{column.replaceAll("_", " ")}</h2>
              <Badge>
                {query.data?.filter((item) => item.status === column).length ??
                  0}
              </Badge>
            </header>
            {query.isLoading ? (
              <Loading />
            ) : (
              query.data
                ?.filter((item) => item.status === column)
                .map((item) => (
                  <Card key={item.id} className="maintenance-card">
                    <div className="card-top">
                      <Badge
                        tone={
                          item.priority === "CRITICAL" ||
                          item.priority === "HIGH"
                            ? "bad"
                            : "warn"
                        }
                      >
                        {item.priority}
                      </Badge>
                      <small>{displayDate(item.createdAt)}</small>
                    </div>
                    <h3>
                      {refs.assets.find((a) => a.id === item.assetId)?.name ??
                        "Asset"}
                    </h3>
                    <p>{item.issueDescription}</p>
                    {auth.hasRole("ASSET_MANAGER") &&
                      item.status !== "RESOLVED" && (
                        <button
                          className="small-action"
                          onClick={() => next(item)}
                        >
                          {item.status === "PENDING"
                            ? "Approve"
                            : item.status === "APPROVED"
                              ? "Assign technician"
                              : item.status === "TECHNICIAN_ASSIGNED"
                                ? "Start work"
                                : "Resolve"}{" "}
                          →
                        </button>
                      )}
                  </Card>
                ))
            )}
          </section>
        ))}
      </div>
      <Modal
        title="Raise maintenance request"
        open={open}
        onClose={() => setOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            command.mutate({ path: "/maintenance-requests", body: values });
          }}
        >
          <Field label="Asset">
            <select name="assetId" required>
              <option value="">Select</option>
              {refs.assets
                .filter(
                  (a) => !["LOST", "RETIRED", "DISPOSED"].includes(a.status),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetTag} · {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority">
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option>CRITICAL</option>
            </select>
          </Field>
          <Field label="Issue description">
            <textarea name="issueDescription" required minLength={5} rows={4} />
          </Field>
          {command.error && (
            <p className="form-error">{command.error.message}</p>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary">Raise request</button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
