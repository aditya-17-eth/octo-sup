import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { HttpError } from "./http";
const localDirectory = () =>
  path.resolve(process.env.EVIDENCE_DIR || "data/evidence");
function s3() {
  if (
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY
  )
    throw new HttpError(503, "Configure a private S3 bucket and credentials.");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
}
function checkKey(key: string) {
  if (!/^[0-9a-f-]{36}\.jpg$/.test(key))
    throw new Error("Invalid evidence key");
}
export async function storeEvidence(file: File) {
  if (
    file.size > 6 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new HttpError(400, "Use a JPEG, PNG, or WebP image under 6 MB.");
  let image: Buffer;
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 24000000,
      animated: false,
    });
    const metadata = await input.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1
    )
      throw new Error("Unsupported image");
    image = await input
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    throw new HttpError(
      400,
      "Image could not be decoded. Capture a new image and try again.",
    );
  }
  const key = `${randomUUID()}.jpg`;
  if (process.env.EVIDENCE_DRIVER === "s3")
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: image,
        ContentType: "image/jpeg",
        ServerSideEncryption: "AES256",
      }),
    );
  else {
    await mkdir(localDirectory(), { recursive: true });
    await writeFile(path.join(localDirectory(), key), image, {
      flag: "wx",
      mode: 0o600,
    });
  }
  return { key, hash: createHash("sha256").update(image).digest("hex") };
}
export async function readEvidence(key: string) {
  checkKey(key);
  if (process.env.EVIDENCE_DRIVER === "s3") {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    if (!result.Body) throw new Error("Evidence unavailable");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return readFile(path.join(localDirectory(), key));
}
export async function deleteEvidence(key: string) {
  checkKey(key);
  if (process.env.EVIDENCE_DRIVER === "s3")
    await s3().send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
  else await unlink(path.join(localDirectory(), key));
}
