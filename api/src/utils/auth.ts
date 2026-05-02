export function getUserIdFromRequest(
  headers: Record<string, string | string[] | undefined>
): number {
  const header = headers['x-user-id']
  const value = Array.isArray(header) ? header[0] : header
  return parseInt(value ?? '1', 10)
}
