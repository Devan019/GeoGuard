import { UploadCloud } from "lucide-react";
import ComplaintUpload from "../ComplaintUpload";

export default function UploadPanel({ activeTab }) {
  return (
    <div
      className={`absolute left-28 top-6 bottom-6 z-10 w-96 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeTab === "upload" ? "translate-x-0 opacity-100" : "-translate-x-[120%] opacity-0 pointer-events-none"}`}
    >
      <div className="h-full w-full p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <UploadCloud size={20} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Compliance Engine</h2>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Upload municipal zoning laws or environmental regulations (PDF).
          GeoGuard will automatically extract spatial constraints.
        </p>

        <div className="flex-1 overflow-y-auto">
          <ComplaintUpload />
        </div>
      </div>
    </div>
  );
}
