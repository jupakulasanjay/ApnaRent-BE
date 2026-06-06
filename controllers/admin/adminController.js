import * as adminService from "../../services/admin/adminService.js";

export async function listPendingListings(req, res, next) {
  try {
    const rows = await adminService.listPendingListings();
    res.json({ count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function approveListing(req, res, next) {
  try {
    const listing = await adminService.approveListing(
      req.params.id,
      req.user.id,
    );
    res.json(listing);
  } catch (err) {
    next(err);
  }
}

export async function rejectListing(req, res, next) {
  try {
    const listing = await adminService.rejectListing(
      req.params.id,
      req.user.id,
      req.body.reason,
    );
    res.json(listing);
  } catch (err) {
    next(err);
  }
}
