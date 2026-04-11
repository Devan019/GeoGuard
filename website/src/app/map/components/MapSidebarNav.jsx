import { Home, UploadCloud } from "lucide-react";

export default function MapSidebarNav({ activeTab, onTabChange }) {
  return (
    <nav className="absolute left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/40 p-4 shadow-2xl">
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
    </nav>
  );
}
