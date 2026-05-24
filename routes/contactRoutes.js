import { Router } from "express";
import { create, createGeneral } from "../controllers/contactController.js";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import {
  createContactBody,
  createGeneralContactBody,
} from "../validators/contactValidators.js";

const contactRoute = Router();

// Any logged-in non-admin (tenant or owner) can contact about a listing.
contactRoute.post(
  "/",
  authenticate,
  requireRole("tenant", "owner"),
  validate({ body: createContactBody }),
  create,
);

// General "contact us" form — no listing target.
contactRoute.post(
  "/general",
  authenticate,
  requireRole("tenant", "owner"),
  validate({ body: createGeneralContactBody }),
  createGeneral,
);

export default contactRoute;
