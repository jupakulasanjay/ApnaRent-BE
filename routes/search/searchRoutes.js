import { Router } from "express";
import {
  search,
  searchProperties,
} from "../../controllers/search/searchController.js";
import { validate } from "../../middleware/validateMiddleware.js";
import {
  searchBody,
  propertySearchBody,
} from "../../validators/search/searchValidators.js";

const searchRoute = Router();

searchRoute.post("/rentals", validate({ body: searchBody }), search);
searchRoute.post(
  "/properties",
  validate({ body: propertySearchBody }),
  searchProperties,
);

export default searchRoute;
