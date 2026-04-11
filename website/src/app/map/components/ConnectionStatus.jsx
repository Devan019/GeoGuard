"use client";

import { useSocket } from "../../../context/SocketContext";

export default function ConnectionStatus() {
  const { isConnected } = useSocket(); // ✅ correct

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full w-fit">
      {/* Status Dot */}
      <div className="relative flex h-3 w-3">
        {isConnected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-3 w-3 ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        ></span>
      </div>

      {/* Label */}
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {isConnected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}