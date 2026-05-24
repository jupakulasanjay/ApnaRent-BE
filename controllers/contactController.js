import * as contactService from "../services/contactService.js";

export async function create(req, res, next) {
  try {
    const contact = await contactService.submitContact({
      userId: req.user.id,
      listingId: req.body.listing_id,
      message: req.body.message,
    });
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

export async function createGeneral(req, res, next) {
  try {
    const contact = await contactService.submitGeneralContact({
      userId: req.user.id,
      subject: req.body.subject,
      message: req.body.message,
    });
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

export async function listGeneralContactsForAdmin(req, res, next) {
  try {
    const data = await contactService.listAllContactsForAdmin(req.user, {
      kind: "general",
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listListingContactsForAdmin(req, res, next) {
  try {
    const data = await contactService.listAllContactsForAdmin(req.user, {
      kind: "listing",
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
