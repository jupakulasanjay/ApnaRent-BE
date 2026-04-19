import {
  listUsers,
  findUserById,
  approveUserById,
  rejectUserById
} from "../models/userModel.js"
import {
  listProperties,
  getPropertyById,
  approvePropertyById,
  rejectPropertyById
} from "../models/propertyModel.js"

// ---------- users ----------

export async function listPendingAdmins(req, res, next) {
  try {
    const rows = await listUsers({ role: "admin", status: "pending" })
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function approveUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const target = await findUserById(id)
    if (!target) return next({ status: 404, message: "User not found" })
    if (target.role !== "admin") {
      return next({ status: 400, message: "Only admin accounts require approval" })
    }
    if (target.status === "active") {
      return next({ status: 400, message: "Admin is already active" })
    }

    const updated = await approveUserById(id, req.user.id)
    res.json(updated)
  } catch (err) {
    next(err)
  }
}

export async function rejectUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const updated = await rejectUserById(id, req.user.id, req.body?.reason)
    if (!updated) return next({ status: 404, message: "User not found" })
    res.json(updated)
  } catch (err) {
    next(err)
  }
}

// ---------- properties ----------

export async function listPendingProperties(req, res, next) {
  try {
    const rows = await listProperties({ status: "pending", limit: 100 })
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function approveProperty(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const existing = await getPropertyById(id)
    if (!existing) return next({ status: 404, message: "Property not found" })

    const updated = await approvePropertyById(id, req.user.id)
    res.json(updated)
  } catch (err) {
    next(err)
  }
}

export async function rejectProperty(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const updated = await rejectPropertyById(id, req.user.id, req.body?.reason)
    if (!updated) return next({ status: 404, message: "Property not found" })
    res.json(updated)
  } catch (err) {
    next(err)
  }
}
