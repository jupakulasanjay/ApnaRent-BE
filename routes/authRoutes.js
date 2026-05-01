import { Router } from "express"
import { register, login, me, logout } from "../controllers/authController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { registerBody, loginBody } from "../validators/authValidators.js"

const router = Router()

router.post("/register", validate({ body: registerBody }), register)
router.post("/login",    validate({ body: loginBody }),    login)
router.get("/me",        authenticate, me)
router.post("/logout",   authenticate, logout)

export default router
