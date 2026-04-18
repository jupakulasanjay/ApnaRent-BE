import jwt from "jsonwebtoken"

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")

  if (scheme !== "Bearer" || !token) {
    return next({ status: 401, message: "Missing or malformed Authorization header" })
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    next({ status: 401, message: "Invalid or expired token" })
  }
}

export default authMiddleware
