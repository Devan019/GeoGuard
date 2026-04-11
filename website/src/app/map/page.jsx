"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/context/SocketContext";
import ComplaintUpload from "./ComplaintUpload";
import {
  Globe,
  Map as MapIcon,
  Layers,
  UploadCloud,
  Home,
  Settings,
  Activity,
  AlertTriangle,
} from "lucide-react";

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

export default function MapPage() {
  const [viewMode, setViewMode] = useState("satellite");
  const [activeTab, setActiveTab] = useState("home");
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("Loading Ahmedabad, Gujarat map...");
  const [isSatellite, setIsSatellite] = useState(true);
  const { receiveMessage } = useSocket();

  // Handle WebSocket Messages
  useEffect(() => {
    const unsubscribe = receiveMessage("NEW_DETECTION", (payload) => {
      if (typeof payload === "string") {
        setStatus(payload);
        return;
      }
      if (payload?.message) {
        setStatus(payload.message);
      }
    });
    return unsubscribe;
  }, [receiveMessage]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      document.querySelector(".mapboxgl-ctrl-logo")?.remove();
      document.querySelector(".mapboxgl-ctrl-bottom-right")?.remove();
    }, 100);
    return () => clearTimeout(timeout);
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
      el.className =
        "w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse";
      new mapboxgl.Marker({ element: el })
        .setLngLat(center)
        .addTo(mapRef.current);

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
      mapRef.current.setStyle(
        viewMode === "satellite" ? STYLES.satellite : STYLES.streets,
      );
      mapRef.current.setProjection("mercator");
      mapRef.current.flyTo({ zoom: 14, pitch: 45, duration: 2000 });
    }
  }, [viewMode]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#dce6f0]">
      <div ref={mapContainerRef} className="h-full w-full absolute inset-0" />
      <nav className="absolute left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/40 p-4 shadow-2xl">
        <button
          onClick={() => setActiveTab("home")}
          className={`p-3 rounded-xl transition-all duration-300 ${activeTab === "home" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-white/50 hover:text-slate-900"}`}
        >
          <Home size={22} />
        </button>
        <button
          onClick={() => setActiveTab("upload")}
          className={`p-3 rounded-xl transition-all duration-300 ${activeTab === "upload" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-white/50 hover:text-slate-900"}`}
        >
          <UploadCloud size={22} />
        </button>
      </nav>

      {/* DYNAMIC LEFT PANEL (Expands based on Sidebar Selection) */}
      <div
        className={`absolute left-28 top-6 bottom-6 z-10 w-96 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeTab === "upload" ? "translate-x-0 opacity-100" : "-translate-x-[120%] opacity-0 pointer-events-none"}`}
      >
        <div className="h-full w-full p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <UploadCloud size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              Compliance Engine
            </h2>
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

      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 rounded-full bg-white/70 backdrop-blur-md border border-white/40 px-5 py-3 shadow-lg">
        <div className="flex h-3 w-3 items-center justify-center">
          <div className="absolute h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-75"></div>
          <div className="relative h-2 w-2 rounded-full bg-emerald-500"></div>
        </div>

        <p className="text-sm font-semibold text-slate-700 text-center">
          {status}
        </p>
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center rounded-full bg-white/80 backdrop-blur-xl border border-white/50 p-1.5 shadow-2xl">
        <button
          onClick={() => setViewMode("globe")}
          className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${viewMode === "globe" ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:text-slate-900"}`}
        >
          <Globe size={16} /> Globe
        </button>
        <button
          onClick={() => setViewMode("satellite")}
          className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${viewMode === "satellite" ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:text-slate-900"}`}
        >
          <Layers size={16} /> Satellite
        </button>
        <button
          onClick={() => setViewMode("streets")}
          className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${viewMode === "streets" ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:text-slate-900"}`}
        >
          <MapIcon size={16} /> Streets
        </button>
      </div>

      <div className="absolute right-6 top-6 bottom-6 z-10 w-80 flex flex-col gap-4 pointer-events-none">
        <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/50 p-6 shadow-2xl pointer-events-auto">
          <h3 className="text-sm font-medium text-slate-500">
            Active Violations
          </h3>
          <p className="text-4xl font-bold text-slate-800 mt-2">124</p>
          <div className="mt-4 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 w-[32%] rounded-full"></div>
          </div>
        </div>

        <div className="flex-1 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/50 p-6 shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
          <h3 className="text-sm font-bold text-slate-800 mb-4">
            Recent Detections
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="group cursor-pointer rounded-2xl border border-white/60 bg-white/40 p-4 transition-all hover:bg-white hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    #CHG-583{i}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-100 px-2 py-1 rounded-full">
                    <AlertTriangle size={10} /> Encroachment
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 line-clamp-1">
                  Industrial zone overlapping protected waterbody buffer.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
