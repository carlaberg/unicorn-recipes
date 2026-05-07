import { verifyToken } from "@clerk/backend";
import db from "../db";

function parseLegacyTestUserId(
  headers: Record<string, string | string[] | undefined>,
): number {
  const header = headers["x-user-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return parseInt(value ?? "1", 10);
}

function parseBearerToken(
  headers: Record<string, string | string[] | undefined>,
) {
  const authorizationHeader = headers.authorization;
  const value = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  if (!value || !value.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing Authorization bearer token");
  }

  return value.slice(7).trim();
}

function getClaim(claim: unknown) {
  return typeof claim === "string" && claim.length > 0 ? claim : undefined;
}

export async function getUserIdFromRequest(
  headers: Record<string, string | string[] | undefined>,
): Promise<number> {
  if (process.env.NODE_ENV === "test") {
    return parseLegacyTestUserId(headers);
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing CLERK_SECRET_KEY on API server");
  }

  const token = parseBearerToken(headers);
  const payload = await verifyToken(token, { secretKey });

  const clerkId = getClaim(payload.sub);
  if (!clerkId) {
    throw new Error("Invalid Clerk token payload");
  }

  const emailFromClaims = getClaim(payload.email);
  const usernameFromClaims =
    getClaim(payload.username) ??
    getClaim(payload.preferred_username) ??
    getClaim(payload.given_name);

  const email = emailFromClaims ?? `${clerkId}@clerk.local`;
  const usernameBase =
    usernameFromClaims ?? email.split("@")[0] ?? clerkId.slice(-12);

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    const expectedUsername = `${usernameBase.replace(/[^a-zA-Z0-9_]/g, "_")}_${clerkId.slice(
      -6,
    )}`;
    throw new Error(
      `Authenticated user is not synced yet (clerkId=${clerkId}, email=${email}, username=${expectedUsername})`,
    );
  }

  return user.id;
}
