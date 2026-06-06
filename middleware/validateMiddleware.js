import { ZodError } from "zod"

// Express 5 makes req.query a getter, so we overwrite via defineProperty
// for query/params. req.body remains a plain writable property.
function overwrite(req, key, value) {
  Object.defineProperty(req, key, { value, writable: true, configurable: true })
}

export function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body)   req.body = schemas.body.parse(req.body ?? {})
      if (schemas.params) overwrite(req, "params", schemas.params.parse(req.params ?? {}))
      if (schemas.query)  overwrite(req, "query",  schemas.query.parse(req.query ?? {}))
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        return next({
          status: 400,
          message: "Validation failed",
          details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message }))
        })
      }
      next(err)
    }
  }
}
