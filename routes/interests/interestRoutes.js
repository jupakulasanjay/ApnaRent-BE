import { Router } from "express";
import {
  list,
  create,
  remove,
} from "../../controllers/interests/interestController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validateMiddleware.js";
import {
  createInterestBody,
  interestPathParams,
} from "../../validators/interests/interestValidators.js";

const interestRoute = Router();

interestRoute.get("/", authenticate, list);

interestRoute.post(
  "/",
  authenticate,
  validate({ body: createInterestBody }),
  create,
);

interestRoute.delete(
  "/:kind/:id",
  authenticate,
  validate({ params: interestPathParams }),
  remove,
);

export default interestRoute;
