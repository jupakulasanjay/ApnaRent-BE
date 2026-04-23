import * as propertyService from "../services/propertyService.js"

export async function create(req, res, next) {
  try {
    const property = await propertyService.createPropertyForOwner(req.user.id, req.body)
    res.status(201).json(property)
  } catch (err) {
    next(err)
  }
}

export async function update(req, res, next) {
  try {
    const property = await propertyService.updatePropertyForOwner(req.user.id, req.params.id, req.body)
    res.json(property)
  } catch (err) {
    next(err)
  }
}

export async function submit(req, res, next) {
  try {
    const property = await propertyService.submitPropertyForVerification(req.user.id, req.params.id)
    res.json(property)
  } catch (err) {
    next(err)
  }
}

export async function uploadImages(req, res, next) {
  try {
    const images = await propertyService.addImagesToProperty(req.user.id, req.params.id, req.imagePaths || [])
    res.status(201).json({ count: images.length, data: images })
  } catch (err) {
    next(err)
  }
}

export async function listMy(req, res, next) {
  try {
    const rows = await propertyService.listMyProperties(req.user.id)
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function listPublic(req, res, next) {
  try {
    const rows = await propertyService.listPublic(req.query)
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function getPublic(req, res, next) {
  try {
    const property = await propertyService.getPropertyForRequester(req.params.id, req.user || null)
    res.json(property)
  } catch (err) {
    next(err)
  }
}
