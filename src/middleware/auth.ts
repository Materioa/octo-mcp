import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    email?: string;
    hasAdminPrivileges: boolean;
    isPlusUser: boolean;
  };
  anonymousId?: string;
}

const DEFAULT_MATERIO_PROFILE_URL = process.env.MATERIO_PROFILE_URL || "https://getmaterio.app/api/v2/profile";

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.header("authorization");
    const anonymousId = req.header("x-anonymous-id");

    if (anonymousId) {
      req.anonymousId = anonymousId;
    }

    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      // Allow unauthenticated requests, but downstream handlers will check req.user vs req.anonymousId
      return next();
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return next();
    }

    const response = await fetch(DEFAULT_MATERIO_PROFILE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const payload: any = await response.json();
      const userData = payload.user ?? payload.profile ?? payload.data ?? payload;
      
      if (userData && userData.id) {
        req.user = {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          hasAdminPrivileges: Boolean(userData.hasAdminPrivileges ?? userData.hasAdminPrivilages),
          isPlusUser: Boolean(userData.isPlusUser),
        };
      }
    }

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    next();
  }
}
