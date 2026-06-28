const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const method = (options.method ?? "GET").toUpperCase();
  const hasBody = options.body !== undefined;

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(hasBody || ["POST", "PUT", "PATCH"].includes(method) ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      json?.error?.code ?? "UNKNOWN",
      json?.error?.message ?? "An error occurred",
      res.status
    );
  }

  return json;
}

export const api = {
  get: <T>(path: string, orgId?: string) =>
    request<T>(path, {
      headers: orgId ? { "x-organization-id": orgId } : {},
    }),

  post: <T>(path: string, body: unknown, orgId?: string) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: orgId ? { "x-organization-id": orgId } : {},
    }),

  put: <T>(path: string, body: unknown, orgId?: string) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: orgId ? { "x-organization-id": orgId } : {},
    }),

  patch: <T>(path: string, body: unknown, orgId?: string) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: orgId ? { "x-organization-id": orgId } : {},
    }),

  delete: <T>(path: string, orgId?: string) =>
    request<T>(path, {
      method: "DELETE",
      headers: orgId ? { "x-organization-id": orgId } : {},
    }),
};

export { ApiError };
