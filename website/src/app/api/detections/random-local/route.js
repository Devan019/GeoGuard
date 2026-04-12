import { NextResponse } from "next/server";

const FASTAPI_URL = process.env.API_BASE || "http://127.0.0.1:8000";

export async function POST() {
  try {
    const response = await fetch(`${FASTAPI_URL}/inference_local_random_dataset`, {
      method: "POST",
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.detail || payload?.error || "Failed to run random dataset inference.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to reach Python backend random inference endpoint.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
