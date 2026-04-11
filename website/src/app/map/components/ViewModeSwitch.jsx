import { Globe, Layers, Map as MapIcon } from "lucide-react";

export default function ViewModeSwitch({ viewMode, onChange }) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center rounded-full bg-white/80 backdrop-blur-xl border border-white/50 p-1.5 shadow-2xl">
      <button
        onClick={() => onChange("globe")}
        className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${viewMode === "globe" ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:text-slate-900"}`}
      >
        <Globe size={16} /> Globe
      </button>
      <button
        onClick={() => onChange("satellite")}
        className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${viewMode === "satellite" ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:text-slate-900"}`}
      >
        <Layers size={16} /> Satellite
      </button>
      <button
        onClick={() => onChange("streets")}
        className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${viewMode === "streets" ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:text-slate-900"}`}
      >
        <MapIcon size={16} /> Streets
      </button>
    </div>
  );
}
