import * as searchService from "../../services/search/searchService.js";

export async function search(req, res, next) {
  try {
    const result = await searchService.naturalLanguageSearch({
      query: req.body.query,
      filters: req.body.filters,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
