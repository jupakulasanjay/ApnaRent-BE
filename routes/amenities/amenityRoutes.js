import { Router } from "express";
import { get } from "../../controllers/amenities/amenityController.js";
import { validate } from "../../middleware/validateMiddleware.js";
import { amenitiesQuery } from "../../validators/amenities/amenityValidators.js";

const amenityRoute = Router();

amenityRoute.get("/", validate({ query: amenitiesQuery }), get);

export default amenityRoute;
