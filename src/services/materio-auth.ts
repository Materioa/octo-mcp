import crypto from "crypto";
import type { Request } from "express";

const DEFAULT_MATERIO_PROFILE_URL = "https://getmaterio.app/api/v2/profile";
const DEFAULT_MATERIO_LOGIN_URL = "https://getmaterio.app/api/v2/login";

export interface MaterioProtectedUser {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  hasAdminPrivileges: boolean;
  isPlusUser: boolean;
  profilePicture?: string;
  [key: string]: unknown;
}

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface MaterioAccessResult {
  user: MaterioProtectedUser;
  accessLevel: "admin" | "plus";
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequestBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

function getHeaderOrBodyValue(req: Request, headerName: string, bodyKeys: string[]): string {
  const body = getRequestBody(req);
  const headerValue = toTrimmedString(req.header(headerName));

  if (headerValue) {
    return headerValue;
  }

  for (const key of bodyKeys) {
    const candidate = toTrimmedString(body[key]);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function getOAuthCredentials(req: Request): { clientId: string; clientSecret: string } {
  const clientId = getHeaderOrBodyValue(req, "x-oauth-client-id", ["clientId", "client_id"]);
  const clientSecret = getHeaderOrBodyValue(req, "x-oauth-client-secret", ["clientSecret", "client_secret"]);

  if (!clientId || !clientSecret) {
    throw new AuthError(400, "OAuth client id and secret are required");
  }

  const expectedClientId = toTrimmedString(process.env.MATERIO_OAUTH_CLIENT_ID);
  const expectedClientSecret = toTrimmedString(process.env.MATERIO_OAUTH_CLIENT_SECRET);

  if (!expectedClientId || !expectedClientSecret) {
    throw new AuthError(500, "Materio OAuth client credentials are not configured");
  }

  if (!safeEquals(clientId, expectedClientId) || !safeEquals(clientSecret, expectedClientSecret)) {
    throw new AuthError(401, "Invalid OAuth client credentials");
  }

  return { clientId, clientSecret };
}

function getBearerToken(req: Request): string {
  const headerToken = toTrimmedString(req.header("authorization"));
  const body = getRequestBody(req);
  const bodyToken = toTrimmedString(body.token ?? body.accessToken ?? body.jwt);

  if (bodyToken) {
    return bodyToken;
  }

  const match = headerToken.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  throw new AuthError(401, "Bearer token required");
}

function getHandoffCode(req: Request): string {
  const body = getRequestBody(req);
  return toTrimmedString(body.handoffCode ?? body.code);
}

async function exchangeHandoffCode(handoffCode: string): Promise<string> {
  const loginUrl = toTrimmedString(process.env.MATERIO_LOGIN_URL) || DEFAULT_MATERIO_LOGIN_URL;
  const response = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      action: "exchange",
      code: handoffCode,
    }),
  });

  if (!response.ok) {
    if (response.status === 400) {
      throw new AuthError(400, "Handoff code is required");
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(401, "Invalid or expired handoff code");
    }

    throw new AuthError(502, `Materio handoff exchange failed with status ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const token = toTrimmedString(payload?.token ?? payload?.accessToken ?? payload?.jwt);

  if (!token) {
    throw new AuthError(502, "Materio handoff exchange did not return a valid token");
  }

  return token;
}

async function getAuthToken(req: Request): Promise<string> {
  const directToken = (() => {
    try {
      return getBearerToken(req);
    } catch {
      return "";
    }
  })();

  if (directToken) {
    return directToken;
  }

  const handoffCode = getHandoffCode(req);
  if (!handoffCode) {
    throw new AuthError(401, "Bearer token or handoff code required");
  }

  return exchangeHandoffCode(handoffCode);
}

function normalizeUser(payload: unknown): MaterioProtectedUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate =
    (payload as Record<string, unknown>).user ??
    (payload as Record<string, unknown>).profile ??
    (payload as Record<string, unknown>).data ??
    payload;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = toTrimmedString(record.id);

  if (!id) {
    return null;
  }

  const hasAdminPrivileges = Boolean(record.hasAdminPrivileges ?? record.hasAdminPrivilages);
  const isPlusUser = Boolean(record.isPlusUser);

  return {
    ...record,
    id,
    hasAdminPrivileges,
    isPlusUser,
  } as MaterioProtectedUser;
}

async function fetchMaterioUser(token: string): Promise<MaterioProtectedUser> {
  const profileUrl = toTrimmedString(process.env.MATERIO_PROFILE_URL) || DEFAULT_MATERIO_PROFILE_URL;
  const response = await fetch(profileUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(401, "Invalid or expired token");
    }

    throw new AuthError(502, `Materio profile lookup failed with status ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const user = normalizeUser(payload);

  if (!user) {
    throw new AuthError(502, "Materio profile response did not include a valid user");
  }

  return user;
}

export async function authorizeMaterioAccess(req: Request): Promise<MaterioAccessResult> {
  getOAuthCredentials(req);
  const token = await getAuthToken(req);
  const user = await fetchMaterioUser(token);

  if (!user.hasAdminPrivileges && !user.isPlusUser) {
    throw new AuthError(403, "Access restricted to admin or plus users");
  }

  return {
    user,
    accessLevel: user.hasAdminPrivileges ? "admin" : "plus",
  };
}