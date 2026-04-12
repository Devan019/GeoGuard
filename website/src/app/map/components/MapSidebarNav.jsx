import { WandSparkles, Home, UploadCloud, Clock3, Layers, Loader2 } from "lucide-react";

export default function MapSidebarNav({
  activeTab,
  onTabChange,
  onLoadOverall,
  overallLoading,
  onRunRandomInference,
  randomInferenceLoading,
}) {
  return (
    <nav className="absolute left-6 top-6 z-20 flex flex-col gap-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/40 p-4 shadow-2xl">
      <button
        onClick={onRunRandomInference}
        disabled={randomInferenceLoading}
        title="Run Random Dataset Inference"
        className={`p-3 rounded-xl transition-all duration-300 ${randomInferenceLoading ? "bg-emerald-100 text-emerald-700" : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"} disabled:opacity-70`}
      >
        {randomInferenceLoading ? <Loader2 size={22} className="animate-spin" /> : <WandSparkles size={22} />}
      </button>
      <button
        onClick={() => onTabChange("home")}
        className={`p-3 rounded-xl transition-all duration-300 ${activeTab === "home" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-white/50 hover:text-slate-900"}`}
      >
        <Home size={22} />
      </button>
      <button
        onClick={() => onTabChange("upload")}
        className={`p-3 rounded-xl transition-all duration-300 ${activeTab === "upload" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-white/50 hover:text-slate-900"}`}
      >
        <UploadCloud size={22} />
      </button>
      <button
        onClick={() => onTabChange("history")}
        className={`p-3 rounded-xl transition-all duration-300 ${activeTab === "history" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-white/50 hover:text-slate-900"}`}
      >
        <Clock3 size={22} />
      </button>
      <button
        onClick={onLoadOverall}
        disabled={overallLoading}
        title="Load Overall Compliance"
        className={`p-3 rounded-xl transition-all duration-300 ${overallLoading ? "bg-indigo-100 text-indigo-700" : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100"} disabled:opacity-70`}
      >
        {overallLoading ? <Loader2 size={22} className="animate-spin" /> : <Layers size={22} />}
      </button>
    </nav>
  );
}
