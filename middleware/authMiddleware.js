import jwt from "jsonwebtoken"
import { findUserById } from "../db/userDb.js"

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")

  if (scheme !== "Bearer" || !token) {
    return next({ status: 401, message: "Missing or malformed Authorization header" })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return next({ status: 401, message: "Invalid or expired token" })
  }

  // Reject tokens whose subject no longer exists (e.g. after db:reset or account deletion).
  const user = await findUserById(payload.sub)
  if (!user) {
    return next({ status: 401, message: "Account no longer exists — please sign in again" })
  }
  if (user.role !== payload.role) {
    return next({ status: 401, message: "Session invalid — please sign in again" })
  }

  req.user = { id: user.id, email: user.email, role: user.role }
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next({ status: 401, message: "Not authenticated" })
    if (!roles.includes(req.user.role)) return next({ status: 403, message: "Forbidden" })
    next()
  }
}

export const requireTenant = requireRole("tenant")
export const requireOwner = requireRole("owner")
export const requireAdmin = requireRole("admin")
