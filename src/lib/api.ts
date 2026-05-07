type GetToken = () => Promise<string | null>;

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export async function authorizedFetch(
  path: string,
  getToken: GetToken,
  init: RequestInit = {},
) {
  const token = await getToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}
