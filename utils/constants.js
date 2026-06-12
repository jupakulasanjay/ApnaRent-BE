export const LISTING_STATUS = Object.freeze({
  DRAFT: "draft",
  PENDING: "pending_verification",
  ACTIVE: "active",
  REJECTED: "rejected",
  EXPIRED: "expired",
});

export const USER_ROLE = Object.freeze({
  TENANT: "tenant",
  OWNER: "owner",
  ADMIN: "admin",
});

export const CONTACT_KIND = Object.freeze({
  LISTING: "listing",
  PROPERTY: "property",
  GENERAL: "general",
});

export const INTEREST_KIND = Object.freeze({
  LISTING: "listing",
});

export const INTEREST_LIMIT_PER_USER = 50;

export const APNARENT_TAG = "ApnaRent";

export const AUTH = Object.freeze({
  BCRYPT_ROUNDS: 10,
  DEFAULT_JWT_EXPIRES_IN: "7d",
});
