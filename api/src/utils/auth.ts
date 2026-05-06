export function getUserIdFromRequest(
  headers: Record<string, string | string[] | undefined>,
): number {
  const header = headers["x-user-id"];
  const value = Array.isArray(header) ? header[0] : header;
  const id = parseInt(value ?? "", 10);
  if (isNaN(id)) {
    throw new Error("Missing or invalid x-user-id header");
  }
  return id;
}
