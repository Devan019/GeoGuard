"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/context/SocketContext";
import MapSidebarNav from "./components/MapSidebarNav";
import UploadPanel from "./components/UploadPanel";
import StatusBadge from "./components/StatusBadge";
import ViewModeSwitch from "./components/ViewModeSwitch";
import DetectionSidePanel from "./components/DetectionSidePanel";
import DetectionDashboard from "./components/DetectionDashboard";
import PastDetectionsPanel from "./components/PastDetectionsPanel";
import {
  getFeatureSeverity,
  getSeverityLevel,
} from "./components/detectionHelpers";
import ConnectionStatus from "./components/ConnectionStatus";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const AHMEDABAD_CENTER = [72.585, 23.08];

const AHMEDABAD_BOUNDS = [
  [72.42, 22.95],
  [72.75, 23.2],
];
const STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/light-v11",
};

const ENABLE_SAMPLE_DETECTION_ON_LOAD = false;

const normalizeDominantChange = (payload) => {
  const dominantRaw = payload?.dominant_change;
  if (!dominantRaw) {
    return null;
  }

  // Supports both shapes:
  // 1) dominant_change: { result, trend, area_percentage }
  // 2) dominant_change: { dominant_change: { result, trend, area_percentage } }
  const candidate = dominantRaw?.dominant_change || dominantRaw;
  return {
    ...candidate,
    image_metadata: dominantRaw?.image_metadata || candidate?.image_metadata,
  };
};

const toTitleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatViolationReason = (violation) => {
  const rule = violation?.rule_broken || {};
  const threshold = Number(rule?.threshold_value);
  const thresholdLabel = Number.isFinite(threshold)
    ? `${threshold}${rule?.threshold_unit || ""}`
    : "N/A";

  const metricDistances = (violation?.metrics || [])
    .map((metric) => Number(metric?.data?.[2]))
    .filter((value) => Number.isFinite(value));
  const nearestDistance = metricDistances.length
    ? Math.min(...metricDistances)
    : null;

  return {
    summary: `${toTitleCase(rule?.target_entity)} should be ${rule?.spatial_relation || "within rule"} ${thresholdLabel} from ${toTitleCase(rule?.reference_entity)}.`,
    nearestDistance,
    threshold,
    thresholdUnit: rule?.threshold_unit || "m",
    referenceEntity: toTitleCase(rule?.reference_entity),
    spatialRelation: toTitleCase(rule?.spatial_relation),
  };
};

const SAMPLE_DETECTION_PAYLOAD = {
  feature_collection: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          change_id: 2206,
          detected_type: "waterbody",
          violations: [
            {
              rule_broken: {
                target_entity: "waterbody",
                threshold_unit: "meters",
                threshold_value: 400,
                reference_entity: "residential",
                spatial_relation: "min_distance",
              },
              metrics: [
                { data: [2206, 302, 372.0526494019343] },
                { data: [2206, 923, 304.3433378743811] },
              ],
            },
          ],
          is_compliant: false,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [72.58484375, 23.075],
              [72.58484375, 23.07484375],
              [72.58500000000001, 23.07484375],
              [72.58500000000001, 23.075],
              [72.58484375, 23.075],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          change_id: 2207,
          detected_type: "waterbody",
          violations: [
            {
              rule_broken: {
                target_entity: "waterbody",
                threshold_unit: "meters",
                threshold_value: 400,
                reference_entity: "residential",
                spatial_relation: "min_distance",
              },
              metrics: [{ data: [2207, 918, 391.113131488925] }],
            },
          ],
          is_compliant: false,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [72.576015625, 23.075],
              [72.576015625, 23.074921874999998],
              [72.57593750000001, 23.074921874999998],
              [72.57593750000001, 23.07484375],
              [72.57625, 23.07484375],
              [72.57625, 23.074921874999998],
              [72.576171875, 23.074921874999998],
              [72.576171875, 23.075],
              [72.576015625, 23.075],
            ],
          ],
        },
      },
    ],
  },
  dominant_change: {
    result: "waterbody",
    trend: "expansion",
    area_percentage: 14.71,
    image_metadata: {
      s3_key:
        "ai-detections/change_maps/3effe5a31db741af8f14c7dbe29f4c61_aaf82ee3ccb54b408c03624277e4939d.png",
      bucket: "zennvid",
      url: "https://zennvid.s3.amazonaws.com/ai-detections/change_maps/3effe5a31db741af8f14c7dbe29f4c61_aaf82ee3ccb54b408c03624277e4939d.png",
    },
  },
  ai_results: {
    bucket: "zennvid",
    image_keys: {
      before: "ai-detections/before_f2d40667a5c145f7856219ae6147473f.png",
      after: "ai-detections/after_c2d2cca21f25485fabe7fe6ceabba616.png",
      heatmap: "ai-detections/heatmap_343b593711114af281b6188e007da9fe.png",
      mask: "ai-detections/mask_f1ab2e986b634053966fcb295200740c.png",
    },
    max_confidence: 0.9996289014816284,
  },
};

export default function MapPage() {
  const [viewMode, setViewMode] = useState("satellite");
  const [activeTab, setActiveTab] = useState("home");
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const detectionMarkersRef = useRef([]);
  const [styleLoadTick, setStyleLoadTick] = useState(0);
  const [status, setStatus] = useState("Loading Ahmedabad, Gujarat map...");
  const { receiveMessage } = useSocket();
  const [detectData, setDetectData] = useState(null);
  const [imageUrls, setImageUrls] = useState({});
  const [dominantChangeImageUrl, setDominantChangeImageUrl] = useState(null);
  const [isDetectionDashboardOpen, setIsDetectionDashboardOpen] =
    useState(false);
  const [isDetectionFullscreen, setIsDetectionFullscreen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [overallLoading, setOverallLoading] = useState(false);

  const dominantRaw = normalizeDominantChange(detectData);
  const dominantResult = dominantRaw?.result || "unknown";
  const dominantTrend = dominantRaw?.trend || "unknown";
  const dominantAreaPercentage = Number(dominantRaw?.area_percentage);
  const hasDominantArea = Number.isFinite(dominantAreaPercentage);
  const imageKeys = detectData?.ai_results?.image_keys || null;
  const dominantChangeImageKey =
    detectData?.dominant_change?.image_metadata?.s3_key || null;
  const dominantChangeImageBucket =
    detectData?.dominant_change?.image_metadata?.bucket ||
    detectData?.ai_results?.bucket ||
    null;

  const features =
    detectData?.feature_collection?.features || detectData?.features || [];
  const violations = features.flatMap((feature, fIdx) =>
    (feature?.properties?.violations || []).map((violation, vIdx) => ({
      featureIndex: fIdx,
      changeId: feature?.properties?.change_id,
      detectedType: feature?.properties?.detected_type,
      isCompliant: feature?.properties?.is_compliant,
      key: `${feature?.properties?.change_id || "chg"}-${vIdx}`,
      targetEntity: violation?.rule_broken?.target_entity,
      threshold: violation?.rule_broken?.threshold_value,
      thresholdUnit: violation?.rule_broken?.threshold_unit,
      referenceEntity: violation?.rule_broken?.reference_entity,
      spatialRelation: violation?.rule_broken?.spatial_relation,
      metrics: violation?.metrics || [],
      severityScore: getSeverityLevel((violation?.metrics || []).length),
    })),
  );

  const detectionLegendItems = [
    {
      key: "compliant",
      color: "#16a34a",
      label: "Compliant",
      meaning: "No rule broken",
    },
    {
      key: "medium",
      color: "#f59e0b",
      label: "Violation (Medium)",
      meaning: "Rule broken with limited instances",
    },
    {
      key: "high",
      color: "#dc2626",
      label: "Violation (High)",
      meaning: "Rule broken with multiple instances",
    },
    {
      key: "low",
      color: "#3b82f6",
      label: "Low/Other",
      meaning: "Detected change with low severity fallback",
    },
  ];

  useEffect(() => {
    const unsubscribe = receiveMessage("NEW_DETECTION", (payload) => {
      setDetectData({
        ...payload,
        dominant_change: normalizeDominantChange(payload),
      });
      setIsDetectionDashboardOpen(true);
    });
    return unsubscribe;
  }, [receiveMessage]);

  const fetchDetectionHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/detections/history", {
        method: "GET",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load history.");
      }

      setHistoryItems(Array.isArray(result.history) ? result.history : []);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Unable to load history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "history") return;
    fetchDetectionHistory();
  }, [activeTab]);

  const handleSelectPastDetection = (entry) => {
    if (!entry?.payload) return;

    setDetectData({
      ...entry.payload,
      dominant_change: normalizeDominantChange(entry.payload),
    });
    setIsDetectionDashboardOpen(true);
    setIsDetectionFullscreen(false);
    setActiveTab("home");
    setStatus(`Loaded past detection run #${entry.id}`);
  };

  const handleLoadOverallCompliance = async () => {
    setOverallLoading(true);
    try {
      const response = await fetch("/api/detections/overall", {
        method: "GET",
      });
      const result = await response.json();

      if (!response.ok || !result?.success || !result?.payload) {
        throw new Error(result?.error || "Unable to build overall compliance result.");
      }

      setDetectData({
        ...result.payload,
        dominant_change: normalizeDominantChange(result.payload),
      });
      setIsDetectionDashboardOpen(true);
      setIsDetectionFullscreen(false);
      setActiveTab("home");

      const rate = Number(result?.summary?.compliance_rate);
      setStatus(
        `Loaded overall compliance: ${Number.isFinite(rate) ? `${rate.toFixed(2)}%` : "-"} compliant across ${result?.summary?.total_runs || 0} runs`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to build overall compliance result.");
    } finally {
      setOverallLoading(false);
    }
  };

  useEffect(() => {
    if (!mapRef.current || !detectData || features.length === 0) {
      return;
    }

    const mapInstance = mapRef.current;
    if (!mapInstance.isStyleLoaded()) {
      return;
    }

    const layerId = "violation-polygons";
    const sourceId = "violation-source";
    const labelLayerId = "violation-labels";

    const calculateCentroid = (coordinates) => {
      let sumLng = 0;
      let sumLat = 0;
      let count = 0;
      coordinates[0].forEach(([lng, lat]) => {
        sumLng += lng;
        sumLat += lat;
        count++;
      });
      return [sumLng / count, sumLat / count];
    };

    const getRuleLabel = (feature) => {
      const firstViolation = feature?.properties?.violations?.[0];
      if (!firstViolation) return "Compliant";

      const rule = firstViolation?.rule_broken || {};
      const threshold = Number(rule?.threshold_value);
      const thresholdLabel = Number.isFinite(threshold)
        ? `${threshold}${rule?.threshold_unit || ""}`
        : "Rule";

      return `${toTitleCase(rule?.reference_entity)} ${toTitleCase(
        rule?.spatial_relation,
      )} ${thresholdLabel}`;
    };

    const geojson = {
      type: "FeatureCollection",
      features: features.map((feature) => {
        const violationCount = (feature.properties?.violations || []).length;
        const severity = getFeatureSeverity(feature);
        return {
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            violationCount,
            severity,
            ruleLabel: getRuleLabel(feature),
          },
        };
      }),
    };

    const labelGeojson = {
      type: "FeatureCollection",
      features: features.map((feature) => {
        const centroid = calculateCentroid(feature.geometry.coordinates);
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: centroid,
          },
          properties: {
            label: `${toTitleCase(feature.properties?.detected_type || "Unknown")} CHG-${
              feature.properties?.change_id || "-"
            }`,
            reason: getRuleLabel(feature),
            changeId: feature.properties?.change_id,
          },
        };
      }),
    };

    let onMouseMove;
    let onMouseLeave;
    let onClickFeature;

    try {
      if (mapInstance.getLayer(labelLayerId)) {
        mapInstance.removeLayer(labelLayerId);
      }
      if (mapInstance.getLayer(layerId)) {
        mapInstance.removeLayer(layerId);
      }
      if (mapInstance.getLayer(`${layerId}-outline`)) {
        mapInstance.removeLayer(`${layerId}-outline`);
      }
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
      if (mapInstance.getSource(`${sourceId}-labels`)) {
        mapInstance.removeSource(`${sourceId}-labels`);
      }

      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: geojson,
        generateId: true,
      });

      mapInstance.addSource(`${sourceId}-labels`, {
        type: "geojson",
        data: labelGeojson,
      });

      mapInstance.addLayer({
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "#f97316",
            [
              "match",
              ["get", "severity"],
              "compliant",
              "#16a34a",
              "high",
              "#dc2626",
              "medium",
              "#f59e0b",
              "#3b82f6",
            ],
          ],
          "fill-opacity": 0.6,
        },
      });

      mapInstance.addLayer({
        id: `${layerId}-outline`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "match",
            ["get", "severity"],
            "compliant",
            "#15803d",
            "high",
            "#991b1b",
            "medium",
            "#b45309",
            "#1d4ed8",
          ],
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      mapInstance.addLayer({
        id: labelLayerId,
        type: "symbol",
        source: `${sourceId}-labels`,
        layout: {
          "text-field": ["concat", ["get", "label"], "\n", ["get", "reason"]],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-offset": [0, 0],
          "text-anchor": "center",
          "text-max-width": 10,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-opacity": 1,
        },
      });

      let hoveredFeatureId = null;
      onMouseMove = (e) => {
        if (e.features.length > 0) {
          if (hoveredFeatureId !== null) {
            mapInstance.setFeatureState(
              { source: sourceId, id: hoveredFeatureId },
              { hover: false },
            );
          }
          hoveredFeatureId = e.features[0].id;
          mapInstance.setFeatureState(
            { source: sourceId, id: hoveredFeatureId },
            { hover: true },
          );
        }
      };

      onMouseLeave = () => {
        if (hoveredFeatureId !== null) {
          mapInstance.setFeatureState(
            { source: sourceId, id: hoveredFeatureId },
            { hover: false },
          );
        }
        hoveredFeatureId = null;
      };

      onClickFeature = (e) => {
        const feature = e?.features?.[0];
        if (!feature) return;

        const props = feature.properties || {};
        const rawViolations = props.violations;
        let parsedViolations = rawViolations;
        if (typeof rawViolations === "string") {
          try {
            parsedViolations = JSON.parse(rawViolations);
          } catch {
            parsedViolations = [];
          }
        }
        const violationList = Array.isArray(parsedViolations)
          ? parsedViolations
          : [];

        const reasons = violationList
          .slice(0, 3)
          .map((violation) => {
            const reason = formatViolationReason(violation);
            const nearestDistance = Number.isFinite(reason.nearestDistance)
              ? `${reason.nearestDistance.toFixed(1)}m`
              : "N/A";
            return `<li><strong>${reason.referenceEntity}</strong>: ${reason.summary} Nearest observed distance: <strong>${nearestDistance}</strong>.</li>`;
          })
          .join("");

        const isCompliant =
          props.is_compliant === true || props.is_compliant === "true";
        const complianceBadge = isCompliant
          ? '<span style="color:#166534;font-weight:700;">Compliant</span>'
          : '<span style="color:#991b1b;font-weight:700;">Non-compliant</span>';

        const popupHtml = `
          <div style="max-width:320px;font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
            <div style="font-weight:700;font-size:13px;margin-bottom:6px;">CHG-${props.change_id || "-"} • ${toTitleCase(props.detected_type || "Unknown")}</div>
            <div style="font-size:12px;margin-bottom:6px;">Status: ${complianceBadge}</div>
            <div style="font-size:12px;line-height:1.45;">
              ${violationList.length ? `<ul style="padding-left:16px;margin:0;">${reasons}</ul>` : "No rule violations found for this detection."}
            </div>
          </div>
        `;

        new mapboxgl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml)
          .addTo(mapInstance);
      };

      mapInstance.on("mousemove", layerId, onMouseMove);
      mapInstance.on("mouseleave", layerId, onMouseLeave);
      mapInstance.on("click", layerId, onClickFeature);

      let minLng = 180;
      let maxLng = -180;
      let minLat = 90;
      let maxLat = -90;
      features.forEach((feature) => {
        if (feature.geometry?.coordinates) {
          const coords = feature.geometry.coordinates[0];
          coords.forEach(([lng, lat]) => {
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
          });
        }
      });

      if (minLng !== 180 && maxLng !== -180) {
        mapInstance.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 50, maxZoom: 15 },
        );
      }
    } catch (error) {
      console.error("Error adding polygon layer:", error);
    }

    return () => {
      if (mapInstance) {
        if (onMouseMove) {
          mapInstance.off("mousemove", layerId, onMouseMove);
        }
        if (onMouseLeave) {
          mapInstance.off("mouseleave", layerId, onMouseLeave);
        }
        if (onClickFeature) {
          mapInstance.off("click", layerId, onClickFeature);
        }
        if (mapInstance.getLayer(labelLayerId)) {
          mapInstance.removeLayer(labelLayerId);
        }
        if (mapInstance.getLayer(layerId)) {
          mapInstance.removeLayer(layerId);
        }
        if (mapInstance.getLayer(`${layerId}-outline`)) {
          mapInstance.removeLayer(`${layerId}-outline`);
        }
        if (mapInstance.getSource(sourceId)) {
          mapInstance.removeSource(sourceId);
        }
        if (mapInstance.getSource(`${sourceId}-labels`)) {
          mapInstance.removeSource(`${sourceId}-labels`);
        }
      }
    };
  }, [detectData, features, styleLoadTick]);

  useEffect(() => {
    if (!mapRef.current) return;

    const mapInstance = mapRef.current;

    detectionMarkersRef.current.forEach((marker) => marker.remove());
    detectionMarkersRef.current = [];

    const markerCandidates = features.length
      ? features
          .slice(0, 12)
          .map((feature) => {
            const coords = feature?.geometry?.coordinates?.[0];
            if (!Array.isArray(coords) || !coords.length) return null;

            const [lng, lat] = coords[0];
            const severity = getFeatureSeverity(feature);
            const colorBySeverity = {
              compliant: "#16a34a",
              high: "#dc2626",
              medium: "#f59e0b",
              low: "#3b82f6",
            };
            const color = colorBySeverity[severity] || "#3b82f6";
            const isCompliant = severity === "compliant";

            return {
              lng,
              lat,
              color,
              changeId: feature?.properties?.change_id,
              type: feature?.properties?.detected_type,
              isCompliant,
            };
          })
          .filter(Boolean)
      : [
          {
            lng: AHMEDABAD_CENTER[0] + 0.008,
            lat: AHMEDABAD_CENTER[1] + 0.006,
            color: "#f59e0b",
            changeId: "SAMPLE",
            type: "waterbody",
            isCompliant: false,
          },
        ];

    markerCandidates.forEach((item) => {
      const markerEl = document.createElement("div");
      markerEl.className =
        "h-4 w-4 rounded-full border-2 border-white shadow-lg";
      markerEl.style.backgroundColor = item.color;

      const marker = new mapboxgl.Marker({ element: markerEl })
        .setLngLat([item.lng, item.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 16 }).setHTML(
            `<div style="font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;">
              <strong>CHG-${item.changeId}</strong><br/>
              Type: ${toTitleCase(item.type)}<br/>
              Status: <strong style="color:${item.isCompliant ? "#166534" : "#991b1b"}">${item.isCompliant ? "Compliant" : "Violation"}</strong>
            </div>`,
          ),
        )
        .addTo(mapInstance);

      detectionMarkersRef.current.push(marker);
    });

    return () => {
      detectionMarkersRef.current.forEach((marker) => marker.remove());
      detectionMarkersRef.current = [];
    };
  }, [features, styleLoadTick]);

  useEffect(() => {
    if (!ENABLE_SAMPLE_DETECTION_ON_LOAD) {
      return;
    }

    const timer = setTimeout(() => {
      setDetectData({
        ...SAMPLE_DETECTION_PAYLOAD,
        dominant_change: normalizeDominantChange(SAMPLE_DETECTION_PAYLOAD),
      });
      setIsDetectionDashboardOpen(true);
      setStatus("Sample detection loaded (testing mode)");
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!imageKeys && !dominantChangeImageKey) {
      setImageUrls({});
      setDominantChangeImageUrl(null);
      return;
    }

    const keys = Object.values(imageKeys || {}).filter(Boolean);
    const allKeys = dominantChangeImageKey
      ? [...keys, dominantChangeImageKey]
      : keys;

    if (!allKeys.length) {
      setImageUrls({});
      setDominantChangeImageUrl(null);
      return;
    }

    const fetchSignedUrls = async () => {
      setImageLoading(true);
      try {
        const response = await fetch("/api/s3/signed-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket: dominantChangeImageBucket || detectData?.ai_results?.bucket,
            keys: allKeys,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch signed image URLs.");
        }

        const result = await response.json();
        const keyToUrl = (result?.images || []).reduce((acc, item) => {
          if (item?.key && item?.url) {
            acc[item.key] = item.url;
          }
          return acc;
        }, {});

        setImageUrls({
          before: keyToUrl[imageKeys?.before] || null,
          after: keyToUrl[imageKeys?.after] || null,
          heatmap: keyToUrl[imageKeys?.heatmap] || null,
          mask: keyToUrl[imageKeys?.mask] || null,
        });

        setDominantChangeImageUrl(
          dominantChangeImageKey
            ? keyToUrl[dominantChangeImageKey] || null
            : null,
        );
      } catch (error) {
        console.error("Image signing failed:", error);
        setImageUrls({});
        setDominantChangeImageUrl(null);
      } finally {
        setImageLoading(false);
      }
    };

    fetchSignedUrls();
  }, [
    detectData,
    imageKeys,
    dominantChangeImageKey,
    dominantChangeImageBucket,
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      document.querySelector(".mapboxgl-ctrl-logo")?.remove();
      document.querySelector(".mapboxgl-ctrl-bottom-right")?.remove();
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;

    const isSuppressible = (message) => {
      const suppressPatterns = [
        "Failed to fetch",
        "mapbox.com",
        "mapbox-gl",
        "Error compiling",
      ];
      return suppressPatterns.some((pattern) =>
        String(message).includes(pattern),
      );
    };

    console.error = function (...args) {
      if (!isSuppressible(args[0])) {
        originalError.apply(console, args);
      }
    };

    console.warn = function (...args) {
      if (!isSuppressible(args[0])) {
        originalWarn.apply(console, args);
      }
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setStatus("Error: MAPBOX_TOKEN missing.");
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const startMap = (center) => {
      if (!mapContainerRef.current || mapRef.current) return;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: STYLES.satellite,
        center,
        zoom: 13,
        minZoom: 11.5,
        maxBounds: AHMEDABAD_BOUNDS,
      });

      mapRef.current.on("style.load", () => {
        setStyleLoadTick((prev) => prev + 1);
        mapRef.current.setFog({
          color: "rgb(255, 255, 255)",
          "high-color": "rgb(200, 215, 240)",
          "horizon-blend": 0.1,
          "space-color": "rgb(220, 230, 245)",
          "star-intensity": 0.0,
        });
      });

      const el = document.createElement("div");
      el.className =
        "w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse";
      centerMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(center)
        .addTo(mapRef.current);

      setStatus("Ahmedabad, Gujarat map loaded.");
    };

    startMap(AHMEDABAD_CENTER);

    return () => {
      detectionMarkersRef.current.forEach((marker) => marker.remove());
      detectionMarkersRef.current = [];
      if (centerMarkerRef.current) {
        centerMarkerRef.current.remove();
        centerMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const mapInstance = mapRef.current;
    const targetStyle =
      viewMode === "globe"
        ? STYLES.satellite
        : viewMode === "satellite"
          ? STYLES.satellite
          : STYLES.streets;

    const forceOverlayRefresh = () => {
      setStyleLoadTick((prev) => prev + 1);
    };

    const onStyleLoad = () => {
      if (!mapRef.current) return;

      const instance = mapRef.current;
      if (viewMode === "globe") {
        instance.setProjection("globe");
        instance.flyTo({ zoom: 3, pitch: 0, duration: 2000 });
      } else {
        instance.setProjection("mercator");
        instance.flyTo({ zoom: 14, pitch: 45, duration: 2000 });
      }

      // First refresh right when style becomes available.
      forceOverlayRefresh();
    };

    // Second refresh on idle ensures overlays persist even if style internals finish late.
    mapInstance.once("idle", forceOverlayRefresh);
    mapInstance.once("style.load", onStyleLoad);
    mapInstance.setStyle(targetStyle);

    return () => {
      mapInstance.off("idle", forceOverlayRefresh);
      mapInstance.off("style.load", onStyleLoad);
    };
  }, [viewMode]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#dce6f0]">
      <div ref={mapContainerRef} className="h-full w-full absolute inset-0" />
      <MapSidebarNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLoadOverall={handleLoadOverallCompliance}
        overallLoading={overallLoading}
      />
      <UploadPanel activeTab={activeTab} />
      <StatusBadge status={status} />
      <div className="absolute top-4 right-6 z-50">
        <ConnectionStatus />
      </div>
      <ViewModeSwitch viewMode={viewMode} onChange={setViewMode} />
      <PastDetectionsPanel
        activeTab={activeTab}
        isLoading={historyLoading}
        error={historyError}
        items={historyItems}
        onRefresh={fetchDetectionHistory}
        onSelect={handleSelectPastDetection}
      />

      <div className="absolute bottom-6 right-6 z-30 w-[min(86vw,18rem)] max-h-[46vh] overflow-y-auto rounded-2xl border border-white/70 bg-white/92 backdrop-blur-md shadow-xl p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
          Detection Color Legend
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Colors show compliance status and rule-break severity.
        </p>

        <div className="mt-3 space-y-2">
          {detectionLegendItems.map((item) => (
            <div key={item.key} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 h-3.5 w-3.5 rounded-sm border border-slate-200"
                style={{ backgroundColor: item.color }}
              />
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  {item.label}
                </p>
                <p className="text-[11px] text-slate-500">{item.meaning}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[10px] text-slate-500">
          Rule meaning example: Waterbody min distance 400m from residential.
        </p>
      </div>

      <DetectionSidePanel
        isDetectionDashboardOpen={isDetectionDashboardOpen}
        features={features}
        violations={violations}
        onOpenDashboard={() => setIsDetectionDashboardOpen(true)}
      />
      <DetectionDashboard
        isDetectionDashboardOpen={isDetectionDashboardOpen}
        isDetectionFullscreen={isDetectionFullscreen}
        setIsDetectionFullscreen={setIsDetectionFullscreen}
        onClose={() => {
          setIsDetectionDashboardOpen(false);
          setIsDetectionFullscreen(false);
        }}
        imageLoading={imageLoading}
        imageUrls={imageUrls}
        dominantChangeImageUrl={dominantChangeImageUrl}
        dominantResult={dominantResult}
        dominantTrend={dominantTrend}
        hasDominantArea={hasDominantArea}
        dominantAreaPercentage={dominantAreaPercentage}
        detectData={detectData}
        features={features}
        violations={violations}
      />
    </main>
  );
}
