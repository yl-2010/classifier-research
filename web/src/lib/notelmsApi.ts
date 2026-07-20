import { fetchMacToken, useNotelmsRuntimeConfig } from "./useNotelmsRuntimeConfig";

export { useNotelmsRuntimeConfig, fetchMacToken };

/**
 * Call the Mac Studio Express API with a freshly minted Bearer token.
 */
export async function notelmsFetch(
  apiBase: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await fetchMacToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = `${apiBase.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers });
}
