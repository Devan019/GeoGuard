import { NextResponse } from "next/server";
import { uploadPdfToS3 } from "@/lib/s3";

const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024;

const FASTAPI_URL = "http://127.0.0.1:8000";

function isPdfFile(file) {
  if (!file) return false;

  const byMime = file.type === "application/pdf";
  const byName = typeof file.name === "string" && /\.pdf$/i.test(file.name);

  return byMime || byName;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Please provide a PDF file in form field 'file'." },
        { status: 400 }
      );
    }

    if (!isPdfFile(file)) {
      return NextResponse.json(
        { error: "Only PDF files are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { error: "PDF is too large. Max size is 10MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const upload = await uploadPdfToS3({
      buffer,
      fileName: file.name,
    });

    try {
      await fetch(`${FASTAPI_URL}/pdf-uploaded`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileKey: upload.key,
        }),
      });
    } catch (err) {
      console.error("FastAPI notify failed:", err);
    }

    return NextResponse.json(
      {
        message: "Complaint PDF uploaded successfully.",
        file: {
          key: upload.key,
          secureUrl: upload.signedUrl,
          bucketName: upload.bucketName,
          bytes: upload.bytes,
          format: "pdf",
          resourceType: "object",
        },
      },
      { status: 201 }
    );

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to upload complaint PDF.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}