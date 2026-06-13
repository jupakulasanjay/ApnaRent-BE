import * as propertyService from "../../services/properties/propertyService.js";

export async function create(req, res, next) {
  try {
    const property = await propertyService.createPropertyForOwner(
      req.user.id,
      req.body,
    );
    res.status(201).json(property);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const property = await propertyService.updatePropertyForOwner(
      req.user.id,
      req.params.id,
      req.body,
    );
    res.json(property);
  } catch (err) {
    next(err);
  }
}

export async function submit(req, res, next) {
  try {
    const property = await propertyService.submitPropertyForVerification(
      req.user.id,
      req.params.id,
    );
    res.json(property);
  } catch (err) {
    next(err);
  }
}

export async function uploadImages(req, res, next) {
  try {
    const images = await propertyService.addImagesToProperty(
      req.user.id,
      req.params.id,
      req.imagePaths || [],
    );
    res.status(201).json({ count: images.length, data: images });
  } catch (err) {
    next(err);
  }
}

export async function listMy(req, res, next) {
  try {
    const { status, limit, offset } = req.query;
    const result = await propertyService.listMyProperties(req.user.id, {
      status,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listPublic(req, res, next) {
  try {
    const {
      city,
      locality,
      property_type,
      property_facing,
      max_price,
      max_area,
      limit,
      offset,
    } = req.query;
    const { rows, total } = await propertyService.listPublic({
      city,
      locality,
      propertyType: property_type,
      propertyFacing: property_facing,
      maxPrice: max_price,
      maxArea: max_area,
      limit,
      offset,
    });
    res.json({ count: total, limit, offset, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getPublic(req, res, next) {
  try {
    const property = await propertyService.getPropertyForRequester(
      req.params.id,
      req.user || null,
    );
    res.json(property);
  } catch (err) {
    next(err);
  }
}

export async function removeImage(req, res, next) {
  try {
    await propertyService.removePropertyImage(
      req.user,
      req.params.id,
      req.params.imageId,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await propertyService.removeProperty(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
