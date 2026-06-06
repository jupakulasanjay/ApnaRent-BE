import {
  getCatalogueForKind,
  getAllAmenities,
  getSupportedKinds,
} from "../../db/amenities/amenityDb.js";

export async function get(req, res, next) {
  try {
    const { kind } = req.query;

    if (!kind) {
      const all = await getAllAmenities();
      return res.json(all);
    }

    const catalogue = await getCatalogueForKind(kind);
    if (!catalogue) {
      const supported = await getSupportedKinds();
      return next({
        status: 400,
        message: `Unknown kind '${kind}'`,
        details: { supported },
      });
    }
    res.json(catalogue);
  } catch (err) {
    next(err);
  }
}
