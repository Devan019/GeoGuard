"use client";

import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";

import { useSocket } from "@/context/SocketContext";

import ComplaintUpload from "./ComplaintUpload";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const AHMEDABAD_CENTER = [72.5714, 23.0225];
const AHMEDABAD_BOUNDS = [
  [72.42, 22.95],
  [72.72, 23.16],
];
const STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/streets-v12",
};

export default function MapPage() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("Loading Ahmedabad, Gujarat map...");
  const [isSatellite, setIsSatellite] = useState(true);
  const { receiveMessage } = useSocket();

  useEffect(() => {
    const unsubscribe = receiveMessage("NEW_DETECTION", (payload) => {
      console.log("Received NEW_DETECTION message:", payload);
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
    if (!MAPBOX_TOKEN) {
      setStatus(
        "Mapbox token missing. Add NEXT_PUBLIC_MAPBOX_TOKEN in .env.local.",
      );
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const startMap = (center) => {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: STYLES.satellite,
        center,
        zoom: 13,
        minZoom: 11.5,
        maxBounds: AHMEDABAD_BOUNDS,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

      new mapboxgl.Marker({ color: "#0f172a" })
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
    if (!mapRef.current) {
      return;
    }

    mapRef.current.setStyle(isSatellite ? STYLES.satellite : STYLES.streets);
  }, [isSatellite]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-100">
      <div ref={mapContainerRef} className="h-full w-full" />
      <section className="absolute left-4 top-4 z-10 rounded-md bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <h1 className="text-sm font-semibold text-slate-900">GeoGuard Map</h1>
        <p className="text-xs text-slate-700">{status}</p>
        <button
          type="button"
          onClick={() => setIsSatellite((prev) => !prev)}
          className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          {isSatellite ? "Switch to Street" : "Switch to Satellite"}
        </button>
        <ComplaintUpload />
      </section>
    </main>
  );
}