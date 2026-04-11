import { NextResponse } from "next/server";
import { getSignedObjectUrl } from "@/lib/s3";

const MAX_KEYS = 8;

export async function POST(request) {
  try {
    const body = await request.json();
    const bucket = typeof body?.bucket === "string" ? body.bucket : undefined;
    const keys = Array.isArray(body?.keys) ? body.keys.filter(Boolean) : [];

    if (!keys.length) {
      return NextResponse.json(
        { error: "Provide one or more S3 keys in 'keys'." },
        { status: 400 },
      );
    }

    if (keys.length > MAX_KEYS) {
      return NextResponse.json(
        { error: `Too many keys. Max ${MAX_KEYS} allowed.` },
        { status: 400 },
      );
    }

    const signed = await Promise.all(
      keys.map(async (key) => {
        const url = await getSignedObjectUrl({ key, bucketName: bucket });
        return { key, url };
      }),
    );

    return NextResponse.json({ images: signed });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create signed URLs.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
