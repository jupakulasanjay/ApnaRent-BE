import * as searchService from "../services/searchService.js"

export async function search(req, res, next) {
  try {
    const result = await searchService.naturalLanguageSearch(req.body.query)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function searchProperties(req, res, next) {
  try {
    const result = await searchService.naturalLanguagePropertySearch(req.body.query)
    res.json(result)
  } catch (err) {
    next(err)
  }
}
