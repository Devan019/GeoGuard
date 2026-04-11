import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function toText(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  return str ? str : fallback;
}

function toNumberLabel(value, suffix = "") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${parsed}${suffix}`;
}

function drawWrappedText(page, text, options) {
  const {
    x,
    y,
    maxWidth,
    lineHeight,
    font,
    size,
    color = rgb(0.15, 0.2, 0.28),
  } = options;

  const words = String(text || "").split(/\s+/).filter(Boolean);
  let cursorY = y;
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= lineHeight;
    }

    line = word;
  }

  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

async function fetchImageBytes(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";

    return {
      bytes: new Uint8Array(arrayBuffer),
      contentType,
    };
  } catch {
    return null;
  }
}

async function embedImage(pdfDoc, imageData) {
  if (!imageData) return null;

  try {
    if (imageData.contentType.includes("png")) {
      return await pdfDoc.embedPng(imageData.bytes);
    }
    if (imageData.contentType.includes("jpeg") || imageData.contentType.includes("jpg")) {
      return await pdfDoc.embedJpg(imageData.bytes);
    }

    try {
      return await pdfDoc.embedPng(imageData.bytes);
    } catch {
      return await pdfDoc.embedJpg(imageData.bytes);
    }
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const summary = body?.summary || {};
    const reportTitle = toText(body?.reportTitle, "Compliance Detection Report");
    const images = Array.isArray(body?.images)
      ? body.images.filter((item) => typeof item?.url === "string" && item.url)
      : [];
    const violations = Array.isArray(body?.violations) ? body.violations : [];

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let cursorY = PAGE_HEIGHT - MARGIN;

    page.drawText(reportTitle, {
      x: MARGIN,
      y: cursorY,
      size: 20,
      font: fontBold,
      color: rgb(0.07, 0.12, 0.2),
    });

    cursorY -= 22;
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: MARGIN,
      y: cursorY,
      size: 10,
      font,
      color: rgb(0.36, 0.42, 0.5),
    });

    cursorY -= 26;
    page.drawText("Compliance Summary", {
      x: MARGIN,
      y: cursorY,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.18, 0.28),
    });

    const summaryRows = [
      ["Total Changes", toNumberLabel(summary?.totalChanges)],
      ["Total Violations", toNumberLabel(summary?.totalViolations)],
      ["Compliant", toNumberLabel(summary?.compliantCount)],
      ["Non-compliant", toNumberLabel(summary?.nonCompliantCount)],
      ["Severity (H / M / L)", `${toNumberLabel(summary?.severity?.high)} / ${toNumberLabel(summary?.severity?.medium)} / ${toNumberLabel(summary?.severity?.low)}`],
      ["Dominant Entity", toText(summary?.dominantResult)],
      ["Trend", toText(summary?.dominantTrend)],
      ["Area Change", Number.isFinite(Number(summary?.dominantAreaPercentage)) ? `${Number(summary?.dominantAreaPercentage).toFixed(2)}%` : "-"],
      ["Max Confidence", Number.isFinite(Number(summary?.maxConfidencePercentage)) ? `${Number(summary?.maxConfidencePercentage).toFixed(2)}%` : "-"],
    ];

    cursorY -= 20;
    for (const [label, value] of summaryRows) {
      page.drawText(`${label}:`, {
        x: MARGIN,
        y: cursorY,
        size: 10,
        font: fontBold,
        color: rgb(0.2, 0.24, 0.3),
      });
      page.drawText(toText(value), {
        x: MARGIN + 150,
        y: cursorY,
        size: 10,
        font,
        color: rgb(0.18, 0.22, 0.28),
      });
      cursorY -= 14;
    }

    cursorY -= 6;
    page.drawText(`Violation Snapshot (${violations.length})`, {
      x: MARGIN,
      y: cursorY,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.18, 0.28),
    });

    cursorY -= 16;
    const maxViolationRows = 24;
    const violationRows = violations.slice(0, maxViolationRows);

    for (const item of violationRows) {
      if (cursorY < MARGIN + 30) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        cursorY = PAGE_HEIGHT - MARGIN;
      }

      const line = `CHG-${toText(item?.changeId)} | ${toText(item?.detectedType)} | ${toText(item?.severity).toUpperCase()} | Rule: ${toText(item?.spatialRelation)} | Threshold: ${toText(item?.threshold)}${toText(item?.thresholdUnit, "")} | Violations: ${toText(item?.metricsCount)}`;
      cursorY = drawWrappedText(page, line, {
        x: MARGIN,
        y: cursorY,
        maxWidth: CONTENT_WIDTH,
        lineHeight: 12,
        font,
        size: 9,
      });
      cursorY -= 4;
    }

    for (const image of images) {
      const imageData = await fetchImageBytes(image.url);
      const embedded = await embedImage(pdfDoc, imageData);
      if (!embedded) {
        continue;
      }

      const imgPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const label = toText(image.label, "Detection Image");

      imgPage.drawText(label, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN,
        size: 14,
        font: fontBold,
        color: rgb(0.1, 0.18, 0.28),
      });

      const maxImageWidth = CONTENT_WIDTH;
      const maxImageHeight = PAGE_HEIGHT - MARGIN * 2 - 28;
      const ratio = Math.min(
        maxImageWidth / embedded.width,
        maxImageHeight / embedded.height,
      );
      const width = embedded.width * ratio;
      const height = embedded.height * ratio;
      const x = MARGIN + (CONTENT_WIDTH - width) / 2;
      const y = MARGIN + (maxImageHeight - height) / 2;

      imgPage.drawImage(embedded, { x, y, width, height });
    }

    const pdfBytes = await pdfDoc.save();
    const fileName = `compliance-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate compliance PDF report.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
