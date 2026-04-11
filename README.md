# GeoGuard

GeoGuard is a geospatial analytics platform designed to automate land use monitoring and urban expansion tracking. By combining deep learning-based satellite change detection with a dynamic spatial compliance engine, the system identifies unauthorized construction, environmental encroachments, and zoning violations to assist municipal authorities.

## Project Overview

Rapid urbanization outpaces manual monitoring capabilities. GeoGuard addresses this by processing multi-temporal satellite imagery (spanning a 6-year period) to detect physical changes and automatically validating those changes against government zoning regulations extracted directly from legal documents.

## Key Features

* **Deep Learning Change Detection:** Utilizes transfer learning models to compare historical and current satellite imagery, identifying new constructions, vegetation loss, and infrastructural changes.
* **Automated Rule Extraction:** An LLM-powered pipeline that ingests government PDFs (building codes, zoning laws) and translates legal text into strict, machine-readable JSON spatial rules.
* **Dynamic Spatial Query Engine:** A backend interpreter that converts structured JSON compliance rules into optimized PostGIS spatial queries on the fly.
* **Interactive Dashboard:** A web-based mapping interface to visualize detected changes, overlay vector data (zones, water bodies), and highlight specific rule violations.
* **Compliance Reporting:** Automated generation of downloadable PDF reports detailing specific violations, including before/after imagery and calculated violation metrics (e.g., exact distance of encroachment).

## Technology Stack

### Frontend
* **Framework:** Next.js
* **Styling:** Tailwind CSS
* **Mapping:** Leaflet / Mapbox GL

### Backend & AI
* **API Framework:** FastAPI (Python)
* **Database:** PostgreSQL with PostGIS extension
* **Geospatial Processing:** Rasterio, GDAL
* **Machine Learning:** PyTorch / TensorFlow (Transfer Learning for Change Detection)
* **LLM Integration:** Groq API (Llama-3 models) for PDF rule extraction

## The Compliance Rule Engine

At the core of GeoGuard is a dynamic spatial rule interpreter. Government regulations are parsed into a strict JSON schema stored in a `jsonb` column, allowing the system to instantly evaluate new land-use changes against topological constraints.

### Supported Entities
The system normalizes all spatial features into four core categories to ensure reliable ML detection and database querying:
1. `waterbody` (rivers, lakes, wetlands)
2. `vegetation` (forests, parks, green belts)
3. `residential` (housing, townships, schools)
4. `industrial` (factories, infrastructure, roads)

### Supported Spatial Relations
The engine dynamically generates PostGIS logic for the following relations:
* **Topological:** `intersects`, `within`, `disjoint`
* **Proximity:** `min_distance`, `max_distance` (measured in meters)
* **Attribute:** `min_area`, `max_area` (measured in square meters)

### Example Rule Schema
```json
{
  "target_entity": "industrial",
  "reference_entity": "waterbody",
  "spatial_relation": "min_distance",
  "threshold_value": 50,
  "threshold_unit": "meters"
}
```

## Getting Started

### Prerequisites
* Node.js (v18+)
* Python (3.9+)
* PostgreSQL with PostGIS extension enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Devan019/GeoGuard.git
   cd GeoGuard
   ```

2. **Backend Setup**
   Navigate to the backend directory, create a virtual environment, and install dependencies:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
   Set up your `.env` file with database credentials and API keys (e.g., Groq API), then start the server:
   ```bash
   uvicorn main:app --reload
   ```

3. **Frontend Setup**
   Navigate to the frontend directory, install packages, and run the development server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Project Structure

```text
├── backend/
│   ├── api/            # FastAPI routes
│   ├── core/           # PostGIS query generator and compliance logic
│   ├── models/         # ML change detection architecture
│   └── scripts/        # LLM PDF extraction scripts
├── frontend/
│   ├── components/     # UI and map components
│   └── pages/          # Next.js application routes
├── data/               # Vector shapefiles and sample PDFs
└── README.md
```

## License

This project is developed for the Satellite Imagery Change Detection challenge. Licensed under the MIT License.