import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Maximize2,
  Minimize2,
  ShieldAlert,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState } from "react";

export default function DetectionDashboard({
  isDetectionDashboardOpen,
  isDetectionFullscreen,
  setIsDetectionFullscreen,
  onClose,
  imageLoading,
  imageUrls,
  dominantChangeImageUrl,
  dominantResult,
  dominantTrend,
  hasDominantArea,
  dominantAreaPercentage,
  detectData,
  features,
  violations,
}) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const compliantCount = features.filter((f) => f.properties?.is_compliant).length;
  const nonCompliantCount = Math.max(features.length - compliantCount, 0);
  const maxConfidence = Number(detectData?.ai_results?.max_confidence);
  const maxConfidencePct = Number.isFinite(maxConfidence)
    ? (maxConfidence * 100).toFixed(2)
    : "-";
  const severityCounts = violations.reduce(
    (acc, item) => {
      acc[item.severityScore] = (acc[item.severityScore] || 0) + 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  return (
    <div
      className={`absolute z-30 rounded-3xl border border-slate-200 bg-white/95 shadow-2xl transition-all duration-500 ${isDetectionFullscreen
        ? "inset-4"
        : "right-4 top-4 bottom-4 w-[min(96vw,68rem)]"
        } ${isDetectionDashboardOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "translate-x-[120%] opacity-0 pointer-events-none"
        }`}
    >
      <div className="h-full flex flex-col p-5 gap-4 min-h-0">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">AI Detection Dashboard</h3>
            <p className="text-sm text-slate-500 mt-1">
              {features.length} changes analyzed across detected zones
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDetectionFullscreen((prev) => !prev)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            >
              {isDetectionFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
          <aside className="lg:w-72 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3 overflow-y-auto">
            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <BarChart3 size={14} /> Overview
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <p className="text-[11px] text-slate-500">Changes</p>
                  <p className="text-lg font-bold text-slate-900">{features.length}</p>
                </div>
                <div className="rounded-lg bg-rose-50 border border-rose-100 p-2">
                  <p className="text-[11px] text-rose-600">Violations</p>
                  <p className="text-lg font-bold text-rose-700">{violations.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Severity Split
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-600">High</span>
                  <span className="font-semibold text-slate-900">{severityCounts.high}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-600">Medium</span>
                  <span className="font-semibold text-slate-900">{severityCounts.medium}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-600">Low</span>
                  <span className="font-semibold text-slate-900">{severityCounts.low}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Dominant Change
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-center justify-between">
                  <span className="text-slate-500">Entity</span>
                  <span className="font-semibold text-slate-900 capitalize">{String(dominantResult)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-slate-500">Trend</span>
                  <span className="font-semibold text-slate-900 capitalize">{String(dominantTrend)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-slate-500">Area Change</span>
                  <span className="font-semibold text-slate-900">
                    {hasDominantArea ? `${dominantAreaPercentage.toFixed(2)}%` : "-"}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Compliance
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-center justify-between text-emerald-700">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> Compliant</span>
                  <span className="font-semibold">{compliantCount}</span>
                </p>
                <p className="flex items-center justify-between text-rose-700">
                  <span className="inline-flex items-center gap-1"><ShieldAlert size={14} /> Non-compliant</span>
                  <span className="font-semibold">{nonCompliantCount}</span>
                </p>
                <p className="flex items-center justify-between text-slate-700">
                  <span className="inline-flex items-center gap-1"><CircleAlert size={14} /> Max confidence</span>
                  <span className="font-semibold">{maxConfidencePct}%</span>
                </p>
              </div>
            </div>

            <button
              className="w-full rounded-xl bg-slate-900 text-white text-sm font-semibold py-2.5"
              type="button"
              onClick={() => {
                const el = document.getElementById("violation-details-list");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              View Violation Details
            </button>
          </aside>

          <section className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                Source Imagery
              </p>
              <div className={`grid gap-3 ${isDetectionFullscreen ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2"}`}>
                {[
                  { label: "Before", key: "before" },
                  { label: "After", key: "after" },
                  { label: "Heatmap", key: "heatmap" },
                  { label: "Mask", key: "mask" },
                ].map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[11px] font-semibold text-slate-600 mb-2">{item.label}</p>
                    <div className="w-full rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center aspect-video cursor-pointer hover:opacity-80 transition-opacity" onClick={() => imageUrls[item.key] && setSelectedImage(imageUrls[item.key])}>
                      {imageLoading ? (
                        <p className="text-[11px] text-slate-500">Loading...</p>
                      ) : imageUrls[item.key] ? (
                        <img
                          src={imageUrls[item.key]}
                          alt={`${item.label} detection`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <p className="text-[11px] text-slate-400">No image</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {dominantChangeImageUrl && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                  Change Map (Dominant Changes)
                </p>
                <div className="h-80 rounded-lg overflow-hidden bg-white border border-blue-100 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setSelectedImage(dominantChangeImageUrl)}>
                  {imageLoading ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                  ) : dominantChangeImageUrl ? (
                    <img
                      src={dominantChangeImageUrl}
                      alt="Change detection map"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="text-sm text-slate-400">No change map available</p>
                  )}
                </div>
              </div>
            )}

            <div id="violation-details-list" className="rounded-2xl border border-rose-100 bg-rose-50 p-3">
              <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-2">
                Violation Details ({violations.length})
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {violations.length ? (
                  violations.map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-xl border p-3 ${item.severityScore === "high"
                        ? "bg-red-50 border-red-200"
                        : item.severityScore === "medium"
                          ? "bg-yellow-50 border-yellow-200"
                          : "bg-white border-rose-100"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 flex-1">
                          CHG-{item.changeId} | {item.detectedType}
                        </p>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${item.severityScore === "high"
                            ? "bg-red-200 text-red-800"
                            : item.severityScore === "medium"
                              ? "bg-yellow-200 text-yellow-800"
                              : "bg-blue-200 text-blue-800"
                            }`}
                        >
                          {item.severityScore.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 mt-1 font-medium">
                        Rule: <span className="text-slate-600">{item.spatialRelation}</span>
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        From: <span className="font-semibold">{item.referenceEntity}</span> |
                        Threshold: <span className="font-semibold"> {item.threshold}m</span>
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Violations: <span className="font-semibold">{item.metrics.length}</span>{" "}
                        {item.metrics.length === 1 ? "instance" : "instances"}
                      </p>
                      {item.metrics.slice(0, 2).map((metric, idx) => (
                        <p key={idx} className="text-[10px] text-slate-500 mt-0.5">
                          ID {metric.data?.[1]}: {Number(metric.data?.[2]).toFixed(1)}m
                        </p>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-500">No violations data</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-white font-semibold">Image Viewer</h3>
              <button
                onClick={() => {
                  setSelectedImage(null);
                  setZoomLevel(1);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Image Container */}
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-black/50 p-4">
              <img
                src={selectedImage}
                alt="Zoomed view"
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-w-full max-h-full object-contain transition-transform"
              />
            </div>

            {/* Controls Footer */}
            <div className="flex items-center justify-center gap-3 p-4 border-t border-slate-700 bg-slate-800">
              <button
                onClick={() => setZoomLevel((prev) => Math.max(prev - 0.2, 1))}
                disabled={zoomLevel <= 1}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center gap-2"
              >
                <ZoomOut size={18} /> Zoom Out
              </button>

              <div className="px-4 py-2 bg-slate-700 rounded-lg text-white text-sm font-semibold">
                {Math.round(zoomLevel * 100)}%
              </div>

              <button
                onClick={() => setZoomLevel((prev) => Math.min(prev + 0.2, 4))}
                disabled={zoomLevel >= 4}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center gap-2"
              >
                <ZoomIn size={18} /> Zoom In
              </button>

              <button
                onClick={() => setZoomLevel(1)}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
