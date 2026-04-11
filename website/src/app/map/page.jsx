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
import { getSeverityLevel } from "./components/detectionHelpers";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const AHMEDABAD_CENTER = [72.5714, 23.0225];
const AHMEDABAD_BOUNDS = [
  [72.42, 22.95],
  [72.72, 23.16],
];
const STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/light-v11",
};

const ENABLE_SAMPLE_DETECTION_ON_LOAD = false;

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
  const [status, setStatus] = useState("Loading Ahmedabad, Gujarat map...");
  const { receiveMessage } = useSocket();
  const [detectData, setDetectData] = useState(null);
  const [imageUrls, setImageUrls] = useState({});
  const [dominantChangeImageUrl, setDominantChangeImageUrl] = useState(null);
  const [isDetectionDashboardOpen, setIsDetectionDashboardOpen] = useState(false);
  const [isDetectionFullscreen, setIsDetectionFullscreen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const dominantRaw = detectData?.dominant_change || null;
  const dominantResult = dominantRaw?.result || "unknown";
  const dominantTrend = dominantRaw?.trend || "unknown";
  const dominantAreaPercentage = Number(dominantRaw?.area_percentage);
  const hasDominantArea = Number.isFinite(dominantAreaPercentage);
  const imageKeys = detectData?.ai_results?.image_keys || null;
  const dominantChangeImageKey = detectData?.dominant_change?.image_metadata?.s3_key || null;
  const dominantChangeImageBucket =
    detectData?.dominant_change?.image_metadata?.bucket || detectData?.ai_results?.bucket || null;

  const features = detectData?.feature_collection?.features || detectData?.features || [];
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

  useEffect(() => {
    const unsubscribe = receiveMessage("NEW_DETECTION", (payload) => {
      setDetectData(payload);
      setIsDetectionDashboardOpen(true);
    });
    return unsubscribe;
  }, [receiveMessage]);

  useEffect(() => {
    if (!mapRef.current || !detectData || features.length === 0) return;

    const mapInstance = mapRef.current;
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

    const geojson = {
      type: "FeatureCollection",
      features: features.map((feature) => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          violationCount: (feature.properties?.violations || []).length,
        },
      })),
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
            label: feature.properties?.detected_type || "Unknown",
            changeId: feature.properties?.change_id,
          },
        };
      }),
    };

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
            "#ff6b6b",
            "#ef4444",
          ],
          "fill-opacity": 0.6,
        },
      });

      mapInstance.addLayer({
        id: `${layerId}-outline`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#dc2626",
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      mapInstance.addLayer({
        id: labelLayerId,
        type: "symbol",
        source: `${sourceId}-labels`,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-offset": [0, 0],
          "text-anchor": "center",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-opacity": 1,
        },
      });

      let hoveredFeatureId = null;
      mapInstance.on("mousemove", layerId, (e) => {
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
      });

      mapInstance.on("mouseleave", layerId, () => {
        if (hoveredFeatureId !== null) {
          mapInstance.setFeatureState(
            { source: sourceId, id: hoveredFeatureId },
            { hover: false },
          );
        }
        hoveredFeatureId = null;
      });

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
  }, [detectData, features]);

  useEffect(() => {
    if (!ENABLE_SAMPLE_DETECTION_ON_LOAD) {
      return;
    }

    const timer = setTimeout(() => {
      setDetectData(SAMPLE_DETECTION_PAYLOAD);
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
    const allKeys = dominantChangeImageKey ? [...keys, dominantChangeImageKey] : keys;

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
          dominantChangeImageKey ? keyToUrl[dominantChangeImageKey] || null : null,
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
  }, [detectData, imageKeys, dominantChangeImageKey, dominantChangeImageBucket]);

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
      const suppressPatterns = ["Failed to fetch", "mapbox.com", "mapbox-gl", "Error compiling"];
      return suppressPatterns.some((pattern) => String(message).includes(pattern));
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
        mapRef.current.setFog({
          color: "rgb(255, 255, 255)",
          "high-color": "rgb(200, 215, 240)",
          "horizon-blend": 0.1,
          "space-color": "rgb(220, 230, 245)",
          "star-intensity": 0.0,
        });
      });

      const el = document.createElement("div");
      el.className = "w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse";
      new mapboxgl.Marker({ element: el }).setLngLat(center).addTo(mapRef.current);

      setStatus("Ahmedabad, Gujarat map loaded.");
    };

    startMap(AHMEDABAD_CENTER);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (viewMode === "globe") {
      mapRef.current.setStyle(STYLES.satellite);
      mapRef.current.setProjection("globe");
      mapRef.current.flyTo({ zoom: 3, pitch: 0, duration: 2000 });
    } else {
      mapRef.current.setStyle(viewMode === "satellite" ? STYLES.satellite : STYLES.streets);
      mapRef.current.setProjection("mercator");
      mapRef.current.flyTo({ zoom: 14, pitch: 45, duration: 2000 });
    }
  }, [viewMode]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#dce6f0]">
      <div ref={mapContainerRef} className="h-full w-full absolute inset-0" />
      <MapSidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
      <UploadPanel activeTab={activeTab} />
      <StatusBadge status={status} />
      <ViewModeSwitch viewMode={viewMode} onChange={setViewMode} />
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
