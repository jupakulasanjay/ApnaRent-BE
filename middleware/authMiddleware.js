import jwt from "jsonwebtoken"

export function authenticate(req, res, next) {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")

  if (scheme !== "Bearer" || !token) {
    return next({ status: 401, message: "Missing or malformed Authorization header" })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.sub, email: payload.email, role: payload.role, status: payload.status }
    next()
  } catch {
    next({ status: 401, message: "Invalid or expired token" })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next({ status: 401, message: "Not authenticated" })
    if (!roles.includes(req.user.role)) return next({ status: 403, message: "Forbidden" })
    next()
  }
}
