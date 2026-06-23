import { Router } from "express";
import {
  listPublic,
  getOne,
  listRentals,
  listProperties,
} from "../../controllers/communities/communityController.js";
import { validate } from "../../middleware/validateMiddleware.js";
import { idParam } from "../../validators/_shared/common.js";
import { publicCommunitiesQuery } from "../../validators/communities/communityValidators.js";

const communityRoute = Router();

communityRoute.get(
  "/",
  validate({ query: publicCommunitiesQuery }),
  listPublic,
);
communityRoute.get("/:id", validate({ params: idParam }), getOne);
communityRoute.get("/:id/rentals", validate({ params: idParam }), listRentals);
communityRoute.get(
  "/:id/properties",
  validate({ params: idParam }),
  listProperties,
);

export default communityRoute;
