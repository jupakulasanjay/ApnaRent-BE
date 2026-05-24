import { Router } from "express";
import {
  create,
  createGeneral,
} from "../../controllers/contacts/contactController.js";
import { authenticate, requireRole } from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validateMiddleware.js";
import {
  createContactBody,
  createGeneralContactBody,
} from "../../validators/contacts/contactValidators.js";
import { USER_ROLE } from "../../utils/constants.js";

const contactRoute = Router();

contactRoute.post(
  "/",
  authenticate,
  requireRole(USER_ROLE.TENANT, USER_ROLE.OWNER),
  validate({ body: createContactBody }),
  create,
);

contactRoute.post(
  "/general",
  authenticate,
  requireRole(USER_ROLE.TENANT, USER_ROLE.OWNER),
  validate({ body: createGeneralContactBody }),
  createGeneral,
);

export default contactRoute;
