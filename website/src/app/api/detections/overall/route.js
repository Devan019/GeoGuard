import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function parseJsonLike(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function buildFeatureCollectionFromViolations(violations = []) {
  const grouped = new Map();

  for (const row of violations) {
    const key = `${row.detect_details_id || "run"}-${row.change_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        type: "Feature",
        properties: {
          change_id: row.change_id,
          detected_type: row.detected_type,
          violations: [],
          is_compliant: row.is_compliant,
          source_run_id: row.detect_details_id || null,
        },
        geometry: parseJsonLike(row.feature_geometry),
      });
    }

    const feature = grouped.get(key);
    feature.properties.violations.push({
      rule_broken: parseJsonLike(row.rule_broken) || row.rule_broken,
      metrics: parseJsonLike(row.metrics) || row.metrics,
    });
    feature.properties.is_compliant = feature.properties.is_compliant && row.is_compliant;
  }

  return {
    type: "FeatureCollection",
    features: Array.from(grouped.values()).filter((f) => f.geometry),
  };
}

export async function GET() {
  try {
    const details = await prisma.$queryRawUnsafe(`
      SELECT
        id,
        payload,
        dominant_change,
        ai_results,
        dominant_result,
        dominant_trend,
        dominant_area_percentage,
        created_at
      FROM detect_details
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 300
    `);

    if (!details.length) {
      return NextResponse.json({
        success: true,
        summary: {
          total_runs: 0,
          total_changes: 0,
          compliant_count: 0,
          non_compliant_count: 0,
          compliance_rate: 0,
        },
        payload: {
          feature_collection: { type: "FeatureCollection", features: [] },
          dominant_change: { result: "unknown", trend: "mixed", area_percentage: null, image_metadata: null },
          ai_results: { bucket: null, image_keys: null, max_confidence: null },
        },
      });
    }

    const detailIds = details
      .map((row) => Number(row?.id))
      .filter((id) => Number.isInteger(id));

    const idList = detailIds.join(",");
    const violations = idList
      ? await prisma.$queryRawUnsafe(`
          SELECT
            detect_details_id,
            change_id,
            detected_type,
            is_compliant,
            rule_broken,
            metrics,
            feature_geometry
          FROM rule_violations
          WHERE detect_details_id IN (${idList})
          ORDER BY id ASC
        `)
      : [];

    const features = [];
    const trendCounts = new Map();
    const typeCounts = new Map();
    const areaValues = [];
    let maxConfidence = null;

    for (const row of details) {
      const payload = parseJsonLike(row.payload);
      const payloadFeatures = payload?.feature_collection?.features;
      if (Array.isArray(payloadFeatures)) {
        for (const feature of payloadFeatures) {
          features.push({
            ...feature,
            properties: {
              ...(feature?.properties || {}),
              source_run_id: row.id,
            },
          });
        }
      }

      const trend = row?.dominant_trend || parseJsonLike(row?.dominant_change)?.trend;
      if (trend) {
        trendCounts.set(trend, (trendCounts.get(trend) || 0) + 1);
      }

      const area = Number(row?.dominant_area_percentage ?? parseJsonLike(row?.dominant_change)?.area_percentage);
      if (Number.isFinite(area)) {
        areaValues.push(area);
      }

      const confidence = Number(parseJsonLike(row?.ai_results)?.max_confidence);
      if (Number.isFinite(confidence)) {
        maxConfidence = maxConfidence == null ? confidence : Math.max(maxConfidence, confidence);
      }
    }

    if (!features.length && violations.length) {
      const rebuilt = buildFeatureCollectionFromViolations(violations);
      features.push(...rebuilt.features);
    }

    for (const feature of features) {
      const type = feature?.properties?.detected_type || "unknown";
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    const dominantResult = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
    const dominantTrend = Array.from(trendCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
    const overallArea = areaValues.length
      ? areaValues.reduce((sum, value) => sum + value, 0) / areaValues.length
      : null;

    const compliantCount = features.filter((f) => f?.properties?.is_compliant).length;
    const nonCompliantCount = Math.max(features.length - compliantCount, 0);
    const complianceRate = features.length ? (compliantCount / features.length) * 100 : 0;

    const payload = {
      feature_collection: {
        type: "FeatureCollection",
        features,
      },
      dominant_change: {
        result: dominantResult,
        trend: dominantTrend,
        area_percentage: overallArea,
        image_metadata: null,
      },
      ai_results: {
        bucket: null,
        image_keys: null,
        max_confidence: maxConfidence,
      },
    };

    return NextResponse.json({
      success: true,
      summary: {
        total_runs: details.length,
        total_changes: features.length,
        compliant_count: compliantCount,
        non_compliant_count: nonCompliantCount,
        compliance_rate: Number(complianceRate.toFixed(2)),
      },
      payload,
    });
  } catch (error) {
    console.error("Failed to build overall detection result:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build overall compliance result." },
      { status: 500 },
    );
  }
}
