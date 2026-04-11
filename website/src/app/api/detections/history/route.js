import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function getHistoryRowsWithFallback() {
  const detectDetailsDelegate = prisma.detect_details;

  if (detectDetailsDelegate?.findMany) {
    return await detectDetailsDelegate.findMany({
      include: {
        rule_violations: {
          orderBy: { id: "asc" },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 30,
    });
  }

  const details = await prisma.$queryRawUnsafe(`
    SELECT
      id,
      dominant_result,
      dominant_trend,
      dominant_area_percentage,
      dominant_image_metadata,
      ai_bucket,
      ai_image_keys,
      ai_max_confidence,
      dominant_change,
      ai_results,
      payload,
      created_at
    FROM detect_details
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 30
  `);

  const detailIds = details
    .map((row) => Number(row?.id))
    .filter((id) => Number.isInteger(id));

  if (!detailIds.length) {
    return [];
  }

  const idList = detailIds.join(",");
  const violations = await prisma.$queryRawUnsafe(`
    SELECT
      id,
      detect_details_id,
      change_id,
      detected_type,
      is_compliant,
      rule_broken,
      metrics,
      feature_geometry,
      created_at
    FROM rule_violations
    WHERE detect_details_id IN (${idList})
    ORDER BY id ASC
  `);

  const violationsByDetailId = violations.reduce((acc, row) => {
    const key = Number(row?.detect_details_id);
    if (!acc.has(key)) {
      acc.set(key, []);
    }
    acc.get(key).push(row);
    return acc;
  }, new Map());

  return details.map((detail) => ({
    ...detail,
    rule_violations: violationsByDetailId.get(Number(detail.id)) || [],
  }));
}

function buildFeatureCollectionFromViolations(violations = []) {
  const grouped = new Map();

  for (const row of violations) {
    const key = row.change_id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        type: "Feature",
        properties: {
          change_id: row.change_id,
          detected_type: row.detected_type,
          violations: [],
          is_compliant: row.is_compliant,
        },
        geometry: row.feature_geometry || null,
      });
    }

    const feature = grouped.get(key);

    feature.properties.violations.push({
      rule_broken: row.rule_broken,
      metrics: row.metrics,
    });

    if (!feature.geometry && row.feature_geometry) {
      feature.geometry = row.feature_geometry;
    }

    feature.properties.is_compliant =
      feature.properties.is_compliant && row.is_compliant;
  }

  const features = Array.from(grouped.values()).filter((f) => f.geometry);

  return {
    type: "FeatureCollection",
    features,
  };
}

function normalizeDetectPayload(detail) {
  if (detail?.payload && typeof detail.payload === "object") {
    return detail.payload;
  }

  return {
    feature_collection: buildFeatureCollectionFromViolations(detail?.rule_violations || []),
    dominant_change:
      detail?.dominant_change ||
      {
        result: detail?.dominant_result || "unknown",
        trend: detail?.dominant_trend || "unknown",
        area_percentage: detail?.dominant_area_percentage ?? null,
        image_metadata: detail?.dominant_image_metadata || null,
      },
    ai_results:
      detail?.ai_results ||
      {
        bucket: detail?.ai_bucket || null,
        image_keys: detail?.ai_image_keys || null,
        max_confidence: detail?.ai_max_confidence ?? null,
      },
  };
}

export async function GET() {
  try {
    const rows = await getHistoryRowsWithFallback();

    const history = rows.map((row) => {
      const payload = normalizeDetectPayload(row);
      const featureCount = payload?.feature_collection?.features?.length || 0;
      const violationCount = (payload?.feature_collection?.features || []).reduce(
        (sum, feature) => sum + (feature?.properties?.violations?.length || 0),
        0,
      );

      return {
        id: row.id,
        created_at: row.created_at,
        dominant_result: row.dominant_result || payload?.dominant_change?.result || "unknown",
        dominant_trend: row.dominant_trend || payload?.dominant_change?.trend || "unknown",
        dominant_area_percentage:
          row.dominant_area_percentage ?? payload?.dominant_change?.area_percentage ?? null,
        feature_count: featureCount,
        violation_count: violationCount,
        payload,
      };
    });

    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error("Failed to fetch detection history:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load detection history." },
      { status: 500 },
    );
  }
}
