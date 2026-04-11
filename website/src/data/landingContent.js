export const projectContent = {
  badge: "AI-Powered Geospatial Analysis & Compliance System",
  status: "Active Development",
  title: "GeoGuard",
  subtitle:
    "Automated geospatial intelligence that detects urban and environmental change, classifies it, and checks compliance in real time.",
  ctaPrimary: {
    label: "Explore Live Map",
    href: "/map",
  },
  ctaSecondary: {
    label: "View Pipeline",
    href: "#pipeline",
  },
};

export const problemAndSolution = {
  problem:
    "Urban sprawl, illegal construction, deforestation, and water-body encroachment are often detected too late because monitoring workflows are manual, slow, and GIS-heavy.",
  solution:
    "GeoGuard runs an end-to-end cloud pipeline that fetches satellite imagery, detects physical changes with AI, classifies them using spectral indices, vectorizes polygons, and instantly evaluates zoning compliance.",
};

export const features = [
  {
    title: "Automated Satellite Fetching",
    description:
      "Fetches cloud-free Sentinel-2 imagery from the Microsoft Planetary Computer STAC API using bounding boxes and date ranges.",
  },
  {
    title: "AI Change Detection",
    description:
      "Uses a custom ONNX model to compare before/after scenes and generate high-fidelity probability masks of change.",
  },
  {
    title: "Spectral Classification",
    description:
      "Calculates NDVI, NDBI, and NDWI to classify detected changes into industrial, residential, vegetation, or waterbody.",
  },
  {
    title: "Raster-to-Vector Pipeline",
    description:
      "Transforms raster change masks into map-ready GeoJSON polygons with CRS conversion for web mapping.",
  },
  {
    title: "Compliance Engine",
    description:
      "Runs spatial compliance checks with PostGIS and Prisma to flag violations against zoning rules automatically.",
  },
  {
    title: "Realtime WebSocket Streaming",
    description:
      "Streams masks, vectors, and violation-ready GeoJSON directly to the frontend with low-latency updates.",
  },
];

export const pipelineFlow = [
  "Frontend sends bounding box and date range.",
  "FastAPI fetches Sentinel-2 imagery from STAC.",
  "Raster windows are cropped and transformed.",
  "ONNX model generates change probability masks.",
  "NDVI/NDBI/NDWI classify dominant change type.",
  "S3 stores visual assets and returns lightweight keys.",
  "Mask is vectorized into GeoJSON polygons.",
  "PostGIS evaluates zoning compliance.",
  "Results stream back to the frontend over WebSocket.",
];
