import jwt from "jsonwebtoken";
import { findUserById } from "../db/users/userDb.js";
import { USER_ROLE } from "../utils/constants.js";

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next({
      status: 401,
      message: "Missing or malformed Authorization header",
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next({ status: 401, message: "Invalid or expired token" });
  }

  // Reject tokens whose subject no longer exists (e.g. after db:reset or account deletion).
  const user = await findUserById(payload.sub);
  if (!user) {
    return next({
      status: 401,
      message: "Account no longer exists — please sign in again",
    });
  }
  if (user.role !== payload.role) {
    return next({
      status: 401,
      message: "Session invalid — please sign in again",
    });
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
}

// Sets req.user iff a valid Bearer token is present. Anonymous requests proceed
// with req.user undefined. Use on endpoints whose behavior branches on who's
// asking (e.g. owner-sees-own-drafts).
export async function optionalAuthenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(payload.sub);
    if (user && user.role === payload.role) {
      req.user = { id: user.id, email: user.email, role: user.role };
    }
  } catch {
    // swallow — treat as anonymous
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next({ status: 401, message: "Not authenticated" });
    if (!roles.includes(req.user.role))
      return next({ status: 403, message: "Forbidden" });
    next();
  };
}

export const requireTenant = requireRole(USER_ROLE.TENANT);
export const requireOwner = requireRole(USER_ROLE.OWNER);
export const requireAdmin = requireRole(USER_ROLE.ADMIN);
