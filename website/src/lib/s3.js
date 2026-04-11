import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client;

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

export function getS3Config() {
  return {
    region: requiredEnv("AWS_REGION"),
    bucketName: requiredEnv("AWS_S3_BUCKET_NAME"),
    prefix: process.env.AWS_S3_COMPLAINTS_PREFIX || "geoguard/complice",
  };
}

export function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  s3Client = new S3Client({
    region: requiredEnv("AWS_REGION"),
    credentials: {
      accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });

  return s3Client;
}

function toSafeFileBase(fileName) {
  if (!fileName) {
    return "complaint";
  }

  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function buildObjectKey({ fileName, prefix }) {
  const safeBase = toSafeFileBase(fileName);
  const stamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}/${safeBase}-${stamp}-${randomPart}.pdf`;
}

export async function uploadPdfToS3({ buffer, fileName }) {
  const client = getS3Client();
  const { bucketName, prefix } = getS3Config();
  const key = buildObjectKey({ fileName, prefix });

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    }),
  );

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn: 3600 },
  );

  return {
    key,
    bucketName,
    bytes: buffer.length,
    signedUrl,
  };
}

export async function getSignedObjectUrl({
  key,
  bucketName,
  expiresIn = 3600,
}) {
  if (!key) {
    throw new Error("Missing object key.");
  }

  const client = getS3Client();
  const bucket = bucketName || requiredEnv("AWS_S3_BUCKET_NAME");

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn },
  );
}
