export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export type Envelope<T> = { data: T; meta: { requestId: string; page?: number; pageSize?: number; total?: number } };
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]!) : null;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<Envelope<T>> {
  const csrf = getCookie("csrf-token");
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(`/api/v1${path}`, { credentials: "include", headers, ...options });
  if (response.status === 204) return { data: undefined as T, meta: { requestId: "" } };
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.code ?? "REQUEST_FAILED", body.detail ?? body.title ?? "Request failed.");
  return body as Envelope<T>;
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const displayDate = (value: string | Date | null | undefined) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: typeof value === "string" && value.includes("T") ? "short" : undefined }).format(new Date(value)) : "—";

