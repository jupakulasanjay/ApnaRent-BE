import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import {
  findUserByEmailAndRole,
  findUserByPhoneAndRole,
  findUserById,
  createUser
} from "../db/userDb.js"

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  )
}

function sanitize(user) {
  const { password_hash, ...rest } = user
  return rest
}

export async function register({ email, password, name, phone, role }) {
  if (await findUserByEmailAndRole(email, role)) {
    throw httpError(409, `Email already registered as ${role}`)
  }
  if (phone && await findUserByPhoneAndRole(phone, role)) {
    throw httpError(409, `Phone already registered as ${role}`)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await createUser({ email, passwordHash, name, phone, role })
  return { token: signToken(user), user }
}

export async function login({ email, password, role }) {
  const user = await findUserByEmailAndRole(email, role)
  if (!user) throw httpError(401, "Invalid credentials")

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) throw httpError(401, "Invalid credentials")

  const safe = sanitize(user)
  return { token: signToken(safe), user: safe }
}

export async function getMe(userId) {
  const user = await findUserById(userId)
  if (!user) throw httpError(404, "User not found")
  return user
}
