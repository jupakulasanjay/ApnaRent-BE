import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { findUserByEmail, findUserById, createUser } from "../models/userModel.js"

const SIGNUP_ROLES = ["user", "owner", "admin"]

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, status: user.status },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  )
}

function sanitize(user) {
  const { password_hash, ...rest } = user
  return rest
}

export async function signup(req, res, next) {
  try {
    const { email, password, name, phone, role = "user" } = req.body || {}

    if (!email || !password) {
      return next({ status: 400, message: "email and password are required" })
    }
    if (!SIGNUP_ROLES.includes(role)) {
      return next({ status: 400, message: `Invalid role (allowed: ${SIGNUP_ROLES.join(", ")})` })
    }

    const existing = await findUserByEmail(email)
    if (existing) return next({ status: 409, message: "Email already in use" })

    const passwordHash = await bcrypt.hash(password, 10)
    const status = role === "admin" ? "pending" : "active"
    const user = await createUser({ email, passwordHash, name, phone, role, status })

    if (status === "active") {
      return res.status(201).json({ token: signToken(user), user })
    }

    res.status(201).json({
      user,
      message: "Admin signup received. An existing admin must approve your account before you can log in."
    })
  } catch (err) {
    next(err)
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return next({ status: 400, message: "email and password are required" })
    }

    const user = await findUserByEmail(email)
    if (!user) return next({ status: 401, message: "Invalid credentials" })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return next({ status: 401, message: "Invalid credentials" })

    if (user.status !== "active") {
      const message = user.status === "pending"
        ? "Account pending approval"
        : "Account has been rejected"
      return next({ status: 403, message })
    }

    const safe = sanitize(user)
    res.json({ token: signToken(safe), user: safe })
  } catch (err) {
    next(err)
  }
}

export async function me(req, res, next) {
  try {
    const user = await findUserById(req.user.id)
    if (!user) return next({ status: 404, message: "User not found" })
    res.json(user)
  } catch (err) {
    next(err)
  }
}
