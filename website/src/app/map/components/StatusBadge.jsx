export default function StatusBadge({ status }) {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 rounded-full bg-white/70 backdrop-blur-md border border-white/40 px-5 py-3 shadow-lg">
      <div className="flex h-3 w-3 items-center justify-center">
        <div className="absolute h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-75"></div>
        <div className="relative h-2 w-2 rounded-full bg-emerald-500"></div>
      </div>

      <p className="text-sm font-semibold text-slate-700 text-center">{status}</p>
    </div>
  );
}
