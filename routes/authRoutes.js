import { Router } from "express"
import { register, login, me, logout } from "../controllers/authController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { registerBody, loginBody } from "../validators/authValidators.js"

const authRoute = Router()

authRoute.post("/register",    validate({ body: registerBody }), register)
authRoute.post("/login",       validate({ body: loginBody }),    login)
authRoute.get("/current-user", authenticate, me)
authRoute.post("/logout",      authenticate, logout)

export default authRoute
