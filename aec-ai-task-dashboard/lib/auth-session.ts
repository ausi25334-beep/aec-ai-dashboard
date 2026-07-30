export const SESSION_COOKIE_NAME = "aec_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export type SessionUser = {
  name: string;
  role: string;
  phoneNumber: string;
  expiresAt: number;
};

export const SETTINGS_ACCESS_ROLES = [
  "Owner",
  "Founder",
  "Principal",
  "General Manager",
] as const;

export function canManageSettings(role: string) {
  return (SETTINGS_ACCESS_ROLES as readonly string[]).includes(role);
}

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  user: Omit<SessionUser, "expiresAt">,
) {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET must contain at least 32 characters.",
    );
  }

  const payload: SessionUser = {
    ...user,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };
  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  );
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload),
  );

  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function readSessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!token || !secret || secret.length < 32) return null;

  try {
    const [encodedPayload, encodedSignature, extraPart] = token.split(".");

    if (!encodedPayload || !encodedSignature || extraPart) return null;

    const key = await getSigningKey(secret);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      encoder.encode(encodedPayload),
    );

    if (!validSignature) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as SessionUser;

    if (
      !payload ||
      typeof payload.name !== "string" ||
      typeof payload.role !== "string" ||
      !payload.role.trim() ||
      typeof payload.phoneNumber !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
