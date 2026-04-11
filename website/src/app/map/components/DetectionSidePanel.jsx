import { PanelRightOpen, ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { getSeverityColors, getSeverityLevel } from "./detectionHelpers";

export default function DetectionSidePanel({
  isDetectionDashboardOpen,
  features,
  violations,
  onOpenDashboard,
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  return (
    <>
      {!isDetectionDashboardOpen && (
        <div className="absolute right-6 top-6 z-30 rounded-lg bg-white/90 border border-white/60 backdrop-blur-xl px-3 py-2 shadow-xl text-slate-700">
          <span className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            💡 Detection sidebar collapsed
          </span>
        </div>
      )}

      <div
        className={`absolute right-6 top-6 bottom-6 z-40 ${isMinimized ? "w-16" : "w-80"} flex flex-col gap-3 transition-all ${isDetectionDashboardOpen
          ? "opacity-0 translate-x-10 pointer-events-none"
          : "opacity-100 translate-x-0"
          }`}
      >
        {/* Minimize/Expand Button */}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="absolute top-4 right-4 z-[100] p-2 rounded-lg bg-white/90 hover:bg-white border border-white/60 backdrop-blur-xl shadow-lg transition-all hover:shadow-xl pointer-events-auto"
          title={isMinimized ? "Expand" : "Minimize"}
        >
          {isMinimized ? (
            <ChevronLeft size={18} className="text-slate-700" />
          ) : (
            <ChevronRight size={18} className="text-slate-700" />
          )}
        </button>

        {!isMinimized && (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl border border-white/60 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  📊 Active Violations
                </h3>
                <span className="text-xs font-medium text-slate-500">Total</span>
              </div>
              <p className="text-3xl font-bold text-rose-600 mb-3">{violations.length}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-rose-50 p-2 border border-rose-100">
                  <p className="text-[10px] text-slate-600 font-medium">HIGH</p>
                  <p className="text-lg font-bold text-rose-600 mt-1">
                    {violations.filter((v) => v.severityScore === "high").length}
                  </p>
                </div>
                <div className="rounded-lg bg-yellow-50 p-2 border border-yellow-100">
                  <p className="text-[10px] text-slate-600 font-medium">MED</p>
                  <p className="text-lg font-bold text-yellow-600 mt-1">
                    {violations.filter((v) => v.severityScore === "medium").length}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 border border-blue-100">
                  <p className="text-[10px] text-slate-600 font-medium">LOW</p>
                  <p className="text-lg font-bold text-blue-600 mt-1">
                    {violations.filter((v) => v.severityScore === "low").length}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 rounded-2xl bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl border border-white/60 p-5 shadow-xl overflow-hidden flex flex-col pointer-events-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  🔍 Detected Changes
                </h3>
                <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
                  {features.length}
                </span>
              </div>

              {features.length > 0 ? (
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  {features.map((feature, idx) => {
                    const featureViolations = feature.properties?.violations || [];
                    const severityLevel = getSeverityLevel(featureViolations.length);
                    const severityColors = getSeverityColors(severityLevel);

                    return (
                      <div
                        key={idx}
                        className={`group cursor-pointer rounded-xl border p-3 transition-all hover:shadow-md ${severityColors.card}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-900">
                            CHG-{feature.properties?.change_id}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${severityColors.badge}`}
                          >
                            {severityLevel.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 font-medium capitalize">
                          Type: <span className="font-semibold">{feature.properties?.detected_type}</span>
                        </p>
                        <p className="text-[10px] text-slate-600 mt-1">
                          Violations: <span className="font-bold">{featureViolations.length}</span>
                        </p>
                        <div className="mt-2 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${severityColors.progress}`}
                            style={{ width: `${Math.min((featureViolations.length / 10) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-400">No detections yet</p>
                </div>
              )}
            </div>

            <button
              onClick={onOpenDashboard}
              className="rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white font-semibold text-sm py-3 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center gap-2"
            >
              <PanelRightOpen size={16} /> Open Dashboard
            </button>
          </>
        )}
      </div>
    </>
  );
}
