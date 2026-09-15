"use client";

/** Thin fetch wrapper that surfaces the API's error message. */
export async function api<T>(
  path: string,
  options?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...init } = options ?? {};

  const response = await fetch(path, {
    ...init,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.error ??
      (payload?.details?.[0]
        ? `${payload.details[0].path}: ${payload.details[0].message}`
        : `Request failed (${response.status})`);
    throw new Error(message);
  }

  return payload as T;
}

export const fetcher = <T>(url: string): Promise<T> => api<T>(url);
