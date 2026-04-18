import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { findAdminByEmail } from "../models/adminModel.js"

export async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return next({ status: 400, message: "email and password are required" })
    }

    const admin = await findAdminByEmail(email)
    if (!admin) return next({ status: 401, message: "Invalid credentials" })

    const ok = await bcrypt.compare(password, admin.password_hash)
    if (!ok) return next({ status: 401, message: "Invalid credentials" })

    const token = jwt.sign(
      { sub: admin.id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    )

    res.json({
      token,
      admin: { id: admin.id, email: admin.email }
    })
  } catch (err) {
    next(err)
  }
}
