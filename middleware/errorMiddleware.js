export function notFound(req, res, next) {
  next({ status: 404, message: `Route not found: ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err, req, res, next) {
  let status = err.status || 500
  let message = err.message || "Internal server error"

  // pg error codes → friendly status
  if (err.code) {
    if (err.code === "23505") {
      status = 409
      message = "Duplicate value violates unique constraint"
    }
    else if (err.code === "23503") {
      status = 400
      // err.constraint is like "listings_property_id_fkey" or "contacts_user_id_fkey"
      // Extract the entity and include it in the message.
      const m = /^[a-z_]+_([a-z_]+)_id_fkey$/.exec(err.constraint || "")
      const entity = m ? m[1].replace(/_/g, " ") : "record"
      message = `Referenced ${entity} does not exist`
    }
    else if (err.code === "23502") { status = 400; message = "Required field is missing" }
    else if (err.code === "22P02") { status = 400; message = "Invalid input format" }
  }

  if (err.name === "ValidationError") status = 400
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    status = 401
    message = "Invalid or expired token"
  }

  if (status >= 500) console.error(err)

  res.status(status).json({
    error: message,
    ...(err.details ? { details: err.details } : {}),
    ...(process.env.NODE_ENV !== "production" && status >= 500 ? { stack: err.stack } : {})
  })
}
