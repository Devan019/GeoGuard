import { Clock3, Loader2, RefreshCcw, AlertCircle } from "lucide-react";

export default function PastDetectionsPanel({
  activeTab,
  isLoading,
  error,
  items,
  onRefresh,
  onSelect,
}) {
  return (
    <div
      className={`absolute left-28 top-6 bottom-6 z-10 w-md rounded-3xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeTab === "history" ? "translate-x-0 opacity-100" : "-translate-x-[120%] opacity-0 pointer-events-none"}`}
    >
      <div className="h-full w-full p-6 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Clock3 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Past Detections</h2>
              <p className="text-xs text-slate-500">Load old runs onto live map and dashboard</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading history...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5" />
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            No past detections found in database.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {items.map((item) => {
              const createdAt = item?.created_at ? new Date(item.created_at) : null;
              const createdLabel = createdAt
                ? createdAt.toLocaleString()
                : "Unknown time";
              const result = String(item?.dominant_result || "unknown");
              const trend = String(item?.dominant_trend || "unknown");
              const area = Number(item?.dominant_area_percentage);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white/90 p-3 hover:border-indigo-300 hover:bg-white transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900">Run #{item.id}</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {item.feature_count} changes
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{createdLabel}</p>
                  <p className="text-[11px] text-slate-700 mt-2">
                    Dominant: <span className="font-semibold capitalize">{result}</span> |
                    Trend: <span className="font-semibold capitalize"> {trend}</span>
                  </p>
                  <p className="text-[11px] text-slate-700 mt-1">
                    Area: <span className="font-semibold">{Number.isFinite(area) ? `${area.toFixed(2)}%` : "-"}</span>
                    <span className="mx-1">|</span>
                    Violations: <span className="font-semibold">{item.violation_count}</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
