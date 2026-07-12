import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  isBookable: boolean;
};
type Booking = {
  id: string;
  assetId: string;
  title: string;
  startAt: string;
  endAt: string;
  effectiveStartAt: string;
  effectiveEndAt: string;
  status: string;
  participantCount: number;
};
type Profile = {
  assetId: string;
  capacity: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requiresApproval: boolean;
  allowRecurring: boolean;
  availabilityJson: Record<
    string,
    Array<{ start: string; end: string }>
  > | null;
};
type WaitlistEntry = {
  id: string;
  assetId: string;
  title: string;
  desiredStartAt: string;
  status: string;
  expiresAt: string | null;
};

const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);
const shortTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
    new Date(value),
  );

export function BookingsPage() {
  const auth = useAuth();
  const client = useQueryClient();
  const [view, setView] = useState<"week" | "month">("week");
  const [cursor, setCursor] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Asset | null>(null);
  const assets = useQuery({
    queryKey: ["booking-assets"],
    queryFn: () => api<Asset[]>("/assets?pageSize=100").then((r) => r.data),
  });
  const bookings = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<Booking[]>("/bookings?pageSize=200").then((r) => r.data),
  });
  const approvals = useQuery({
    queryKey: ["booking-approvals"],
    queryFn: () =>
      api<Booking[]>("/bookings/approval-queue?pageSize=100").then(
        (r) => r.data,
      ),
    enabled: auth.hasRole("ASSET_MANAGER"),
  });
  const resources = (assets.data ?? []).filter((asset) => asset.isBookable);
  const profiles = useQuery({
    queryKey: [
      "booking-profiles",
      resources.map((asset) => asset.id).join(","),
    ],
    enabled: resources.length > 0,
    queryFn: async () =>
      Promise.all(
        resources.map(async (asset) => {
          try {
            return await api<Profile>(`/resources/${asset.id}/profile`).then(
              (r) => r.data,
            );
          } catch {
            return null;
          }
        }),
      ),
  });
  const waitlists = useQuery({
    queryKey: [
      "booking-waitlist",
      resources.map((asset) => asset.id).join(","),
    ],
    enabled: resources.length > 0,
    queryFn: async () =>
      (
        await Promise.all(
          resources.map((asset) =>
            api<WaitlistEntry[]>(`/resources/${asset.id}/waitlist`).then(
              (r) => r.data,
            ),
          ),
        )
      ).flat(),
  });
  const preferences = useQuery({
    queryKey: ["booking-preferences"],
    queryFn: () =>
      api<Array<{ id: string; type: string; isEnabled: boolean }>>(
        "/notifications/preferences",
      ).then((r) => r.data),
  });
  const jobs = useQuery({
    queryKey: ["booking-jobs"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          jobName: string;
          status: string;
          startedAt: string;
          resultJson: { sent?: boolean } | null;
        }>
      >("/operations/jobs").then((r) => r.data),
    enabled: auth.hasRole("ADMIN"),
  });
  const profile = (assetId: string) =>
    profiles.data?.find((item) => item?.assetId === assetId) ?? null;
  const command = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      post(path, body ?? {}),
    onSuccess: () => {
      [
        "bookings",
        "booking-approvals",
        "booking-profiles",
        "booking-waitlist",
      ].forEach((key) => client.invalidateQueries({ queryKey: [key] }));
      setOpen(false);
    },
  });
  const days = useMemo(() => {
    const start = new Date(cursor);
    start.setHours(0, 0, 0, 0);
    if (view === "week")
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    else {
      start.setDate(1);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    }
    return Array.from({ length: view === "week" ? 7 : 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [cursor, view]);
  const move = (amount: number) =>
    setCursor((current) => {
      const date = new Date(current);
      date.setDate(date.getDate() + amount * (view === "week" ? 7 : 30));
      return date;
    });
  return (
    <Page
      title="Resource scheduling"
      description="Plan shared resources, approvals, capacity, buffers and waitlists."
      action={
        <div className="actions">
          <button onClick={() => move(-1)}>←</button>
          <button onClick={() => setCursor(new Date())}>Today</button>
          <button onClick={() => move(1)}>→</button>
          <button onClick={() => setView(view === "week" ? "month" : "week")}>
            {view === "week" ? "Month view" : "Week view"}
          </button>
          <button className="primary" onClick={() => setOpen(true)}>
            ＋ Book resource
          </button>
        </div>
      }
    >
      <Card>
        <div className={`schedule-grid ${view}`}>
          {bookings.isLoading ? (
            <Loading />
          ) : bookings.error ? (
            <ErrorState error={bookings.error} />
          ) : (
            days.map((day) => {
              const key = dayKey(day.toISOString());
              const rows = (bookings.data ?? []).filter(
                (booking) => dayKey(booking.startAt) === key,
              );
              return (
                <section className="schedule-day" key={key}>
                  <header>
                    <strong>
                      {new Intl.DateTimeFormat(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      }).format(day)}
                    </strong>
                    <small>
                      {rows.length} booking{rows.length === 1 ? "" : "s"}
                    </small>
                  </header>
                  {rows.map((booking) => {
                    const item = profile(booking.assetId);
                    return (
                      <article className="schedule-booking" key={booking.id}>
                        <strong>{booking.title}</strong>
                        <small>
                          {resources.find(
                            (asset) => asset.id === booking.assetId,
                          )?.name ?? "Resource"}{" "}
                          · {shortTime(booking.startAt)}–
                          {shortTime(booking.endAt)}
                        </small>
                        <small>
                          {booking.participantCount}/{item?.capacity ?? 1}{" "}
                          capacity
                          {item?.bufferBeforeMinutes || item?.bufferAfterMinutes
                            ? ` · buffers ${item?.bufferBeforeMinutes ?? 0}/${item?.bufferAfterMinutes ?? 0}m`
                            : ""}
                        </small>
                        <Badge tone={statusTone(booking.status)}>
                          {booking.status}
                        </Badge>
                      </article>
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
      </Card>
      <div className="two-column">
        <Card>
          <h2>Resource policies</h2>
          {resources.map((asset) => {
            const item = profile(asset.id);
            return (
              <article className="list-row" key={asset.id}>
                <div>
                  <strong>
                    {asset.assetTag} · {asset.name}
                  </strong>
                  <small>
                    {item
                      ? `${item.capacity} capacity · ${item.requiresApproval ? "approval required" : "instant confirmation"} · ${item.allowRecurring ? "recurring enabled" : "single bookings"}`
                      : "No booking profile"}
                  </small>
                  {item?.availabilityJson && (
                    <small>
                      {Object.entries(item.availabilityJson)
                        .map(
                          ([day, ranges]) =>
                            `${day.slice(0, 3)} ${ranges.map((range) => `${range.start}–${range.end}`).join(", ")}`,
                        )
                        .join(" · ")}
                    </small>
                  )}
                </div>
                {auth.hasRole("ASSET_MANAGER") && (
                  <button onClick={() => setSettings(asset)}>Configure</button>
                )}
              </article>
            );
          })}
        </Card>
        {auth.hasRole("ASSET_MANAGER") && (
          <Card>
            <h2>Approval queue</h2>
            {approvals.isLoading ? (
              <Loading />
            ) : !approvals.data?.length ? (
              <Empty>No booking approvals pending.</Empty>
            ) : (
              approvals.data.map((booking) => (
                <article className="list-row" key={booking.id}>
                  <div>
                    <strong>{booking.title}</strong>
                    <small>
                      {
                        resources.find((asset) => asset.id === booking.assetId)
                          ?.name
                      }{" "}
                      · {displayDate(booking.startAt)}
                    </small>
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() =>
                        command.mutate({
                          path: `/bookings/${booking.id}/approve`,
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        const reason = window.prompt("Reason for rejection");
                        if (reason)
                          command.mutate({
                            path: `/bookings/${booking.id}/reject`,
                            body: { reason },
                          });
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))
            )}
          </Card>
        )}
      </div>
      <Card>
        <h2>Bookings</h2>
        {!bookings.data?.length ? (
          <Empty>No bookings yet.</Empty>
        ) : (
          bookings.data.map((booking) => (
            <article className="list-row" key={booking.id}>
              <div>
                <strong>{booking.title}</strong>
                <small>
                  {
                    resources.find((asset) => asset.id === booking.assetId)
                      ?.name
                  }{" "}
                  · {displayDate(booking.startAt)}–{shortTime(booking.endAt)}
                </small>
              </div>
              <Badge tone={statusTone(booking.status)}>{booking.status}</Badge>
              {["PENDING", "CONFIRMED"].includes(booking.status) &&
                new Date(booking.startAt) > new Date() && (
                  <button
                    onClick={() =>
                      command.mutate({
                        path: `/bookings/${booking.id}/cancel`,
                        body: { reason: "Cancelled by requester" },
                      })
                    }
                  >
                    Cancel
                  </button>
                )}
            </article>
          ))
        )}
      </Card>
      <div className="two-column">
        <Card>
          <h2>Waitlist offers</h2>
          {waitlists.isLoading ? (
            <Loading />
          ) : !waitlists.data?.length ? (
            <Empty>No waitlist requests.</Empty>
          ) : (
            waitlists.data.map((entry) => (
              <article className="list-row" key={entry.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <small>
                    {
                      resources.find((asset) => asset.id === entry.assetId)
                        ?.name
                    }{" "}
                    · {displayDate(entry.desiredStartAt)}
                  </small>
                </div>
                <Badge tone={entry.status === "OFFERED" ? "good" : "neutral"}>
                  {entry.status}
                </Badge>
                {entry.status === "OFFERED" && (
                  <button
                    className="primary"
                    onClick={() =>
                      command.mutate({ path: `/waitlist/${entry.id}/accept` })
                    }
                  >
                    Accept offer
                  </button>
                )}
                {["PENDING", "OFFERED"].includes(entry.status) && (
                  <button
                    onClick={() =>
                      command.mutate({ path: `/waitlist/${entry.id}/cancel` })
                    }
                  >
                    Leave
                  </button>
                )}
              </article>
            ))
          )}
        </Card>
        <Card>
          <h2>Booking reminders</h2>
          <p className="muted">
            Receive an in-app reminder during the 24 hours before a confirmed
            booking.
          </p>
          <label>
            <input
              type="checkbox"
              checked={
                preferences.data?.find(
                  (item) => item.type === "BOOKING_REMINDER",
                )?.isEnabled ?? true
              }
              onChange={(event) => {
                void api(`/notifications/preferences/BOOKING_REMINDER`, {
                  method: "PUT",
                  body: JSON.stringify({ isEnabled: event.target.checked }),
                }).then(() =>
                  client.invalidateQueries({
                    queryKey: ["booking-preferences"],
                  }),
                );
              }}
            />{" "}
            Booking reminders enabled
          </label>
          {auth.hasRole("ADMIN") && (
            <div className="form-actions">
              <button
                onClick={() =>
                  command.mutate({ path: "/operations/jobs/booking-reminders" })
                }
              >
                Run reminder job
              </button>
            </div>
          )}
          {auth.hasRole("ADMIN") && (
            <div className="booking-list">
              {jobs.data?.slice(0, 3).map((job) => (
                <small key={job.id}>
                  {job.jobName} · {job.status} · {displayDate(job.startedAt)}
                </small>
              ))}
            </div>
          )}
        </Card>
      </div>
      <BookingForm
        open={open}
        resources={resources}
        error={command.error}
        onClose={() => setOpen(false)}
        onSubmit={(body, waitlist) =>
          command.mutate({
            path: waitlist
              ? `/resources/${body.assetId}/waitlist`
              : "/bookings",
            body: waitlist ? { ...body, assetId: undefined } : body,
          })
        }
      />
      {settings && (
        <SettingsForm
          asset={settings}
          profile={profile(settings.id)}
          onClose={() => setSettings(null)}
          onSave={(body) =>
            patch(`/resources/${settings.id}/profile`, body).then(() => {
              client.invalidateQueries({ queryKey: ["booking-profiles"] });
              setSettings(null);
            })
          }
        />
      )}
    </Page>
  );
}

function BookingForm({
  open,
  resources,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  resources: Asset[];
  error: unknown;
  onClose(): void;
  onSubmit(
    body: { assetId: string; [key: string]: unknown },
    waitlist: boolean,
  ): void;
}) {
  const [waitlist, setWaitlist] = useState(false);
  return (
    <Modal
      title={waitlist ? "Join booking waitlist" : "Book resource"}
      open={open}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          const recurrence = String(values.recurrence);
          onSubmit(
            {
              assetId: String(values.assetId),
              title: values.title,
              purpose: values.purpose || undefined,
              startAt: new Date(String(values.startAt)).toISOString(),
              endAt: new Date(String(values.endAt)).toISOString(),
              participantCount: Number(values.participantCount),
              ...(recurrence === "none"
                ? {}
                : {
                    recurrence: {
                      frequency: recurrence,
                      occurrences: Number(values.occurrences),
                    },
                  }),
            },
            waitlist,
          );
        }}
      >
        <Field label="Resource">
          <select name="assetId" required>
            <option value="">Select a resource</option>
            {resources.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.assetTag} · {asset.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input name="title" required />
        </Field>
        <div className="form-grid">
          <Field label="Starts">
            <input
              name="startAt"
              type="datetime-local"
              defaultValue={localInput(new Date(Date.now() + 3_600_000))}
              required
            />
          </Field>
          <Field label="Ends">
            <input
              name="endAt"
              type="datetime-local"
              defaultValue={localInput(new Date(Date.now() + 7_200_000))}
              required
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Participants">
            <input
              name="participantCount"
              type="number"
              min="1"
              defaultValue="1"
              required
            />
          </Field>
          <Field label="Repeat">
            <select name="recurrence">
              <option value="none">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </Field>
        </div>
        <Field label="Occurrences">
          <input
            name="occurrences"
            type="number"
            min="2"
            max="52"
            defaultValue="2"
          />
        </Field>
        <Field label="Purpose">
          <textarea name="purpose" />
        </Field>
        {Boolean(error) && (
          <p className="form-error">
            {error instanceof Error
              ? error.message
              : "Request could not be saved."}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={() => setWaitlist(!waitlist)}>
            {waitlist ? "Book instead" : "Join waitlist"}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">
            {waitlist ? "Join waitlist" : "Book resource"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SettingsForm({
  asset,
  profile,
  onClose,
  onSave,
}: {
  asset: Asset;
  profile: Profile | null;
  onClose(): void;
  onSave(body: unknown): void;
}) {
  return (
    <Modal title={`Configure ${asset.name}`} open onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          const hours = String(values.hours);
          const [start, end] = hours.split("-");
          const availability =
            start && end
              ? ["monday", "tuesday", "wednesday", "thursday", "friday"].reduce<
                  Record<string, Array<{ start: string; end: string }>>
                >((all, day) => ({ ...all, [day]: [{ start, end }] }), {})
              : null;
          onSave({
            capacity: Number(values.capacity),
            bufferBeforeMinutes: Number(values.before),
            bufferAfterMinutes: Number(values.after),
            requiresApproval: values.approval === "on",
            allowRecurring: values.recurring === "on",
            availability,
          });
        }}
      >
        <Field label="Capacity">
          <input
            name="capacity"
            type="number"
            min="1"
            defaultValue={profile?.capacity ?? 1}
          />
        </Field>
        <div className="form-grid">
          <Field label="Buffer before (minutes)">
            <input
              name="before"
              type="number"
              min="0"
              defaultValue={profile?.bufferBeforeMinutes ?? 0}
            />
          </Field>
          <Field label="Buffer after (minutes)">
            <input
              name="after"
              type="number"
              min="0"
              defaultValue={profile?.bufferAfterMinutes ?? 0}
            />
          </Field>
        </div>
        <Field
          label="Weekday availability"
          hint="One interval for Monday–Friday, e.g. 09:00-17:00"
        >
          <input
            name="hours"
            pattern="^\\d{2}:\\d{2}-\\d{2}:\\d{2}$"
            defaultValue={
              profile?.availabilityJson?.monday?.[0]
                ? `${profile.availabilityJson.monday[0].start}-${profile.availabilityJson.monday[0].end}`
                : ""
            }
          />
        </Field>
        <label>
          <input
            name="approval"
            type="checkbox"
            defaultChecked={profile?.requiresApproval}
          />{" "}
          Require approval
        </label>
        <label>
          <input
            name="recurring"
            type="checkbox"
            defaultChecked={profile?.allowRecurring}
          />{" "}
          Allow recurring bookings
        </label>
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Save policy</button>
        </div>
      </form>
    </Modal>
  );
}
