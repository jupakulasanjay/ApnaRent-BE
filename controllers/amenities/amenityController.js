import {
  getCatalogueForKind,
  SUPPORTED_KINDS,
} from "../../config/amenities.js";

export function get(req, res, next) {
  try {
    const catalogue = getCatalogueForKind(req.query.kind);
    if (!catalogue) {
      return next({
        status: 400,
        message: `Unknown kind '${req.query.kind}'`,
        details: { supported: SUPPORTED_KINDS },
      });
    }
    res.json(catalogue);
  } catch (err) {
    next(err);
  }
}
