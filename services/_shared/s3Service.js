import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;

if (!region || !bucket) {
  throw new Error("AWS_REGION and S3_BUCKET must be set in environment");
}

const s3 = new S3Client({ region });

const defaultBase = `https://${bucket}.s3.${region}.amazonaws.com`;
const publicBase =
  process.env.S3_PUBLIC_URL_BASE?.replace(/\/$/, "") || defaultBase;
const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
const S3_DELETE_BATCH_LIMIT = 1000;

export async function uploadBuffer(key, buffer, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: CACHE_CONTROL_IMMUTABLE,
    }),
  );
  return `${publicBase}/${key}`;
}

export function s3KeyFromUrl(url) {
  if (typeof url !== "string") return null;
  for (const base of [publicBase, defaultBase]) {
    const prefix = `${base}/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length);
  }
  return null;
}

// NoSuchKey is treated as success — the object is already gone.
export async function deleteObject(key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (err?.name === "NoSuchKey") return;
    throw err;
  }
}

// Best-effort: returns { deleted, errors } so callers can log partial failures
// without aborting. Orphaned S3 bytes only cost storage once the DB row is gone.
export async function deleteObjects(keys) {
  if (!keys.length) return { deleted: 0, errors: [] };
  const errors = [];
  let deleted = 0;

  // DeleteObjects caps at 1000 keys per call.
  for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_LIMIT) {
    const chunk = keys.slice(i, i + S3_DELETE_BATCH_LIMIT);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deleted += chunk.length - (res.Errors?.length || 0);
    if (res.Errors?.length) errors.push(...res.Errors);
  }
  return { deleted, errors };
}
