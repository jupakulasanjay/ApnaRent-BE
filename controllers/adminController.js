import * as adminService from "../services/adminService.js"

// ---------- listings ----------

export async function listPendingListings(req, res, next) {
  try {
    const rows = await adminService.listPendingListings()
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function approveListing(req, res, next) {
  try {
    const listing = await adminService.approveListing(req.params.id, req.user.id)
    res.json(listing)
  } catch (err) {
    next(err)
  }
}

export async function rejectListing(req, res, next) {
  try {
    const listing = await adminService.rejectListing(req.params.id, req.user.id, req.body.reason)
    res.json(listing)
  } catch (err) {
    next(err)
  }
}

// ---------- properties ----------

export async function listPendingProperties(req, res, next) {
  try {
    const rows = await adminService.listPendingProperties()
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function approveProperty(req, res, next) {
  try {
    const property = await adminService.approveProperty(req.params.id, req.user.id)
    res.json(property)
  } catch (err) {
    next(err)
  }
}

export async function rejectProperty(req, res, next) {
  try {
    const property = await adminService.rejectProperty(req.params.id, req.user.id, req.body.reason)
    res.json(property)
  } catch (err) {
    next(err)
  }
}
