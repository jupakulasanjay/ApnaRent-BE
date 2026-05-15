import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3"

const region = process.env.AWS_REGION
const bucket = process.env.S3_BUCKET

if (!region || !bucket) {
  throw new Error("AWS_REGION and S3_BUCKET must be set in environment")
}

const s3 = new S3Client({ region })

const defaultBase = `https://${bucket}.s3.${region}.amazonaws.com`
const publicBase = process.env.S3_PUBLIC_URL_BASE?.replace(/\/$/, "") || defaultBase

export async function uploadBuffer(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable"
  }))
  return `${publicBase}/${key}`
}

// Returns the S3 key for URLs we issued, or null for legacy /uploads/* rows
// (pre-S3 local files — those have no S3 object to clean up).
export function s3KeyFromUrl(url) {
  if (typeof url !== "string") return null
  for (const base of [publicBase, defaultBase]) {
    const prefix = `${base}/`
    if (url.startsWith(prefix)) return url.slice(prefix.length)
  }
  return null
}

// NoSuchKey is treated as success — the object is already gone, which is
// the post-condition the caller wants.
export async function deleteObject(key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch (err) {
    if (err?.name === "NoSuchKey") return
    throw err
  }
}

// Best-effort batched delete. Returns { deleted, errors } so callers can log
// partial failures without aborting (FE sees a clean state once the DB row is
// gone — orphaned S3 bytes only cost storage).
export async function deleteObjects(keys) {
  if (!keys.length) return { deleted: 0, errors: [] }
  const errors = []
  let deleted = 0

  // DeleteObjects caps at 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    const res = await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true }
    }))
    deleted += chunk.length - (res.Errors?.length || 0)
    if (res.Errors?.length) errors.push(...res.Errors)
  }
  return { deleted, errors }
}
