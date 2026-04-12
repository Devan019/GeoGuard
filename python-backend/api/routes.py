import logging
import time
import random
from pathlib import Path
from skimage import exposure
from services.change_type import get_change_type
from services.connection_manager import ConnectionManager
from services.gen_tif import fetch_cropped_bands, fetch_cropped_bands_multithreaded
from services.raster_to_vector import vectorize
from services.pdf_service import process_pdf_pipeline
from models.schema import FinalInferenceRequest, UploadNotification
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import base64

import json
import asyncio

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Body
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from typing import List
import traceback
import io

# ML & Raster Libraries
import onnxruntime as ort
import numpy as np
from PIL import Image
import rasterio
from rasterio.windows import from_bounds
from rasterio.io import MemoryFile
from rasterio.enums import Resampling
import pystac_client
import planetary_computer

from services.db_service import get_db, save_detection_details
from services.inference_helper import process_ai_change_detection

# Matplotlib configuration (CRITICAL for servers)
import matplotlib
matplotlib.use('Agg')

# Your internal services


router = APIRouter()
manager = ConnectionManager()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_JSON_PATH = PROJECT_ROOT / "satellite_images" / "dataset.json"

# ==========================================
# ML MODEL INITIALIZATION
# ==========================================
print("🧠 Loading ONNX model into memory...")
session = None
try:
    session = ort.InferenceSession("best_siamese_unet.onnx")
except Exception as e:
    print(
        f"⚠️ Warning: Could not load ONNX model. ML endpoints will fail. Error: {e}")

# ==========================================
# ML HELPER FUNCTIONS
# ==========================================


def read_band_from_memory(file_bytes, target_shape=None):
    with MemoryFile(file_bytes) as memfile:
        with memfile.open() as dataset:
            if target_shape:
                data = dataset.read(1, out_shape=target_shape,
                                    resampling=Resampling.bilinear)
            else:
                data = dataset.read(1)
            return data.astype(np.float32)


def preprocess_image(img):
    """
    Expects a PIL Image. Resizes, normalizes, and keeps NHWC layout.
    """
    img = img.convert("RGB").resize((256, 256))

    # 1. Scale to 0-1
    img_array = np.array(img, dtype=np.float32) / 255.0

    # 2. ImageNet Normalization
    # Note: If the heatmap is STILL flat blue after this shape fix,
    # it means the model wasn't trained with ImageNet stats.
    # If so, comment these next three lines out.
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_array = (img_array - mean) / std

    # 3. Add batch dimension -> Shape becomes (1, 256, 256, 3)
    return np.expand_dims(img_array, axis=0)


def safe_sigmoid(x):
    x = np.clip(x, -10, 10)
    return 1 / (1 + np.exp(-x))

# ==========================================
# MODELS
# ==========================================


class MapTransform(BaseModel):
    west: float
    north: float
    xsize: float
    ysize: float


class ConversionRequest(BaseModel):
    raster_mask: List[List[int]]
    transform: MapTransform
    client_id: str

# ==========================================
# WEBSOCKET & CORE ROUTES
# ==========================================


@router.websocket("/ws/ai-detections/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Message from Next.js: {data}")
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        print(f"Client {client_id} disconnected")


@router.post("/api/raster-to-vector")
async def convert_raster_to_vector(request: ConversionRequest):
    try:
        return await vectorize(request, manager)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pdf-uploaded")
async def pdf_uploaded(payload: UploadNotification, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_pdf_pipeline, payload.fileKey)
    return {"status": "processing_queued"}

# ==========================================
# ML INFERENCE ROUTES (Defined synchronously for Threadpool offloading)
# ==========================================


@router.post("/predict_change")
def predict_change(
    time1_image: UploadFile = File(...),
    time2_image: UploadFile = File(...)
):
    if session is None:
        raise HTTPException(status_code=503, detail="ML Model not loaded.")

    try:
        t1_bytes = time1_image.file.read()
        t2_bytes = time2_image.file.read()

        # Call your new helper function
        result_data = process_ai_change_detection(t1_bytes, t2_bytes, session)

        # Return it directly as JSON!
        return JSONResponse(content=result_data)

    except Exception as e:
        print("\n--- SERVER ERROR ---")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/gen_analyze_bands")
def gen_analyze_bands(
    time1_image: UploadFile = File(...),
    time2_image: UploadFile = File(...)
):
    try:
        t1_bytes = time1_image.file.read()
        t2_bytes = time2_image.file.read()

        # Call your new helper function
        return fetch_cropped_bands(t1_bytes, t2_bytes)

    except Exception as e:
        print("\n--- SERVER ERROR ---")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze_separate_bands")
def analyze_separate_bands(
    t1_green: UploadFile = File(...), t1_red: UploadFile = File(...),
    t1_nir: UploadFile = File(...), t1_swir: UploadFile = File(...),
    t2_green: UploadFile = File(...), t2_red: UploadFile = File(...),
    t2_nir: UploadFile = File(...), t2_swir: UploadFile = File(...)
):
    try:
        t1_red_bytes = t1_red.file.read()
        red_t1 = read_band_from_memory(t1_red_bytes)
        target_shape = red_t1.shape

        green_t1 = read_band_from_memory(t1_green.file.read(), target_shape)
        nir_t1 = read_band_from_memory(t1_nir.file.read(), target_shape)
        swir_t1 = read_band_from_memory(t1_swir.file.read(), target_shape)

        # 2. Read Time 2 Bands
        red_t2 = read_band_from_memory(t2_red.file.read(), target_shape)
        green_t2 = read_band_from_memory(t2_green.file.read(), target_shape)
        nir_t2 = read_band_from_memory(t2_nir.file.read(), target_shape)
        swir_t2 = read_band_from_memory(t2_swir.file.read(), target_shape)

        eps = 1e-8
        ndvi_t1 = (nir_t1 - red_t1) / (nir_t1 + red_t1 + eps)
        ndvi_t2 = (nir_t2 - red_t2) / (nir_t2 + red_t2 + eps)

        ndwi_t1 = (green_t1 - nir_t1) / (green_t1 + nir_t1 + eps)
        ndwi_t2 = (green_t2 - nir_t2) / (green_t2 + nir_t2 + eps)

        ndbi_t1 = (swir_t1 - nir_t1) / (swir_t1 + nir_t1 + eps)
        ndbi_t2 = (swir_t2 - swir_t1) / (swir_t2 + swir_t1 + eps)

        d_ndvi = ndvi_t2 - ndvi_t1
        d_ndwi = ndwi_t2 - ndwi_t1
        d_ndbi = ndbi_t2 - ndbi_t1

        change_map = np.zeros(target_shape, dtype=np.uint8)
        change_map[(d_ndvi < -0.2) & (d_ndbi < 0.2)] = 1
        change_map[(d_ndvi < -0.2) & (d_ndbi >= 0.2)] = 2
        change_map[(d_ndwi > 0.2)] = 3
        change_map[(d_ndvi > 0.2)] = 4

        # 6. Statistics Calculation
        total = change_map.size
        changed = np.count_nonzero(change_map)
        stats = "No Change"
        if changed > 0:
            stats = (f"Area Change: {(changed/total)*100:.1f}%\n"
                     f"Urb: {(np.count_nonzero(change_map == 2)/changed)*100:.1f}%\n"
                     f"Def: {(np.count_nonzero(change_map == 1)/changed)*100:.1f}%\n"
                     f"Flood: {(np.count_nonzero(change_map == 3)/changed)*100:.1f}%")

        # 7. Visualization
        fig, ax = plt.subplots(figsize=(10, 10))
        cmap = matplotlib.colors.ListedColormap(
            ['black', 'yellow', 'red', 'blue', 'green'])
        ax.imshow(change_map, cmap=cmap)
        ax.set_title("Stitched Band Change Analysis")
        ax.axis('off')

        ax.text(1.02, 0.5, stats, transform=ax.transAxes,
                bbox=dict(facecolor='white', alpha=0.8))

        patches = [mpatches.Patch(color=c, label=l) for c, l in
                   zip(['yellow', 'red', 'blue', 'green'], ['Deforest', 'Urban', 'Flood', 'Growth'])]
        ax.legend(handles=patches, loc='lower right')

        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)

        return Response(content=buf.getvalue(), media_type="image/png")

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze_separate_bands_final")
def analyze_separate_bands_final(
    t1_green: UploadFile = File(...), t1_red: UploadFile = File(...),
    t1_nir: UploadFile = File(...), t1_swir: UploadFile = File(...),
    t2_green: UploadFile = File(...), t2_red: UploadFile = File(...),
    t2_nir: UploadFile = File(...), t2_swir: UploadFile = File(...),

):
    return get_change_type(
        t1_green, t1_red, t1_nir, t1_swir,
        t2_green, t2_red, t2_nir, t2_swir
    )


# Helper to turn Sentinel-2 scientific arrays into a standard RGB image byte string
def create_rgb_bytes_from_bands(bands):
    # Stack Red, Green, Blue
    rgb = np.dstack((bands['red'], bands['green'], bands['blue']))

    # Sentinel-2 data values usually range from 0 to 10000.
    # We divide by 3000 to brighten it up, and scale to 255 for a standard image.
    rgb_8bit = np.clip((rgb / 3000.0) * 255, 0, 255).astype(np.uint8)

    img = Image.fromarray(rgb_8bit)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# # final BOSS for testing

# Set up logging configuration at the top of your file
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("satellite-app")


def _load_random_dataset_sample():
    if not DATASET_JSON_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Dataset file not found at {DATASET_JSON_PATH}"
        )

    with open(DATASET_JSON_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)

    dataset = payload.get("dataset", [])
    if not dataset:
        raise HTTPException(status_code=500, detail="Dataset is empty.")

    sample = random.choice(dataset)
    before = sample.get("before", {})
    after = sample.get("after", {})
    bbox = sample.get("bbox")

    if not isinstance(bbox, list) or len(bbox) != 4:
        raise HTTPException(
            status_code=500, detail="Selected dataset sample has invalid bbox.")

    before_path = PROJECT_ROOT / str(before.get("image_path", ""))
    after_path = PROJECT_ROOT / str(after.get("image_path", ""))

    if not before_path.exists() or not after_path.exists():
        raise HTTPException(
            status_code=500,
            detail=(
                "Dataset image path missing. "
                f"before={before_path}, after={after_path}"
            )
        )

    with open(before_path, "rb") as f:
        t1_bytes = f.read()
    with open(after_path, "rb") as f:
        t2_bytes = f.read()

    return {
        "sample": sample,
        "t1_bytes": t1_bytes,
        "t2_bytes": t2_bytes,
        "bbox": bbox,
        "time1_range": before.get("date", "2020-01-01"),
        "time2_range": after.get("date", "2024-01-01"),
    }


async def _run_inference_pipeline(
    t1_bytes: bytes,
    t2_bytes: bytes,
    bbox,
    time1_range: str,
    time2_range: str,
    source: str = "upload",
    selected_sample: dict | None = None,
):
    start_total = time.perf_counter()
    logger.info("--- Starting New Detection for Client ---")

    await manager.broadcast_json({
        "event": "PROCESSING_STARTED",
        "message": "Image and map processing is underway. Please wait...",
        "data": {
            "bbox": bbox,
            "time1": time1_range,
            "time2": time2_range,
            "source": source,
        }
    })

    t_ai_start = time.perf_counter()
    logger.info("Running ONNX Inference...")
    ai_data = process_ai_change_detection(t1_bytes, t2_bytes, session)
    logger.info(
        f"Inference complete. Max Confidence: {ai_data.get('max_confidence'):.4f}. "
        f"Time: {time.perf_counter()-t_ai_start:.2f}s"
    )

    t_stac_start = time.perf_counter()
    logger.info("Fetching spectral bands concurrently from AWS STAC...")

    loop = asyncio.get_running_loop()
    future1 = loop.run_in_executor(
        None, fetch_cropped_bands_multithreaded, bbox, time1_range)
    future2 = loop.run_in_executor(
        None, fetch_cropped_bands_multithreaded, bbox, time2_range)

    t1_bands, t2_bands = await asyncio.gather(future1, future2)
    logger.info(
        f"STAC Data received. Time: {time.perf_counter()-t_stac_start:.2f}s")

    t_type_start = time.perf_counter()
    dominant_type_data = get_change_type(
        t1_green=t1_bands['green'], t1_red=t1_bands['red'], t1_nir=t1_bands['nir'], t1_swir=t1_bands['swir'],
        t2_green=t2_bands['green'], t2_red=t2_bands['red'], t2_nir=t2_bands['nir'], t2_swir=t2_bands['swir']
    )

    dominant_type = dominant_type_data["result"] if isinstance(
        dominant_type_data, dict) else dominant_type_data
    logger.info(
        f" Dominant Spectral Class: {dominant_type}. Time: {time.perf_counter()-t_type_start:.2f}s")

    t_vec_start = time.perf_counter()
    logger.info(" Running Vectorization & Dynamic PostGIS Compliance...")

    vectorize_request = {
        "raster_mask": ai_data["raster_matrix"],
        "transform": {
            "west": bbox[0], "north": bbox[3],
            "xsize": (bbox[2] - bbox[0]) / 256.0,
            "ysize": (bbox[3] - bbox[1]) / 256.0
        },
    }

    feature_collection = await vectorize(
        request=vectorize_request,
        db=get_db(),
        t2_bands=t2_bands
    )
    logger.info(
        f" Vectorization complete. Found {len(feature_collection['features'])} polygons. "
        f"Time: {time.perf_counter()-t_vec_start:.2f}s"
    )

    data = {
        "feature_collection": feature_collection,
        "dominant_change": dominant_type_data,
        "ai_results": {
            "bucket": ai_data.get("bucket"),
            "image_keys": ai_data["image_keys"],
            "max_confidence": ai_data.get("max_confidence")
        }
    }

    non_compliant_count = sum(
        1 for f in feature_collection['features'] if not f['properties']['is_compliant'])

    logger.info(" --- FINAL PAYLOAD SUMMARY ---")
    logger.info(f" Dominant Region Type: {dominant_type}")
    logger.info(
        f" Total Polygons Detected: {len(feature_collection['features'])}")
    logger.info(f" Non-Compliant Polygons: {non_compliant_count}")

    for i, feature in enumerate(feature_collection['features'][:3]):
        props = feature['properties']
        status = "❌ VIOLATION" if not props['is_compliant'] else "✅ COMPLIANT"
        logger.info(
            f"  -> Poly {i+1} (ID: {props['change_id']}) Type: [{props['detected_type']}]: {status}")
        if props['violations']:
            for v in props['violations']:
                logger.info(
                    f"     ! Rule Broken: {v['rule_broken'].get('spatial_relation')} "
                    f"with {v['rule_broken'].get('reference_entity')}"
                )

    logger.info(" Sending data via WebSocket...")
    await manager.broadcast_json({"event": "NEW_DETECTION", "data": data})

    logger.info(" Persisting detection details to DB...")
    detect_details_id = save_detection_details(
        dominant_change=data["dominant_change"],
        ai_results=data["ai_results"],
        payload=data,
    )
    logger.info(
        f" Detection persisted with detect_details.id={detect_details_id}")

    total_time = time.perf_counter() - start_total
    logger.info(f" SUCCESS. Total Processing Time: {total_time:.2f}s")

    response_payload = {
        "status": "success",
        "processing_time": f"{total_time:.2f}s",
        "detect_details_id": detect_details_id,
        "source": source,
    }

    if selected_sample is not None:
        response_payload["selected_sample"] = {
            "id": selected_sample.get("id"),
            "location_name": selected_sample.get("location_name"),
            "bbox": selected_sample.get("bbox"),
            "before": selected_sample.get("before"),
            "after": selected_sample.get("after"),
        }

    return response_payload


@router.post("/inference_local")
async def inference_local(
    time1_image: UploadFile = File(...),
    time2_image: UploadFile = File(...),
    bbox_str: str = Form(...,
                         description='e.g., "[72.48, 23.03, 72.54, 23.08]"'),
    time1_range: str = Form("2020-01-01"),
    time2_range: str = Form("2024-01-01")
):
    if session is None:
        logger.error(f" Attempted inference but ML Model is not loaded.")
        raise HTTPException(status_code=503, detail="ML Model not loaded.")

    try:
        bbox = json.loads(bbox_str)
        logger.info(f"[] Parsed BBox: {bbox}")

        t_read_start = time.perf_counter()
        t1_bytes = await time1_image.read()
        t2_bytes = await time2_image.read()
        logger.info(
            f" File read complete ({len(t1_bytes)} bytes). Time: {time.perf_counter()-t_read_start:.2f}s")
        return await _run_inference_pipeline(
            t1_bytes=t1_bytes,
            t2_bytes=t2_bytes,
            bbox=bbox,
            time1_range=time1_range,
            time2_range=time2_range,
            source="upload",
        )

    except Exception as e:
        logger.error(f" CRITICAL SERVER ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inference_local_random_dataset")
async def inference_local_random_dataset():
    if session is None:
        logger.error(
            " Attempted random dataset inference but ML Model is not loaded.")
        raise HTTPException(status_code=503, detail="ML Model not loaded.")

    try:
        dataset_payload = _load_random_dataset_sample()
        sample = dataset_payload["sample"]
        logger.info(
            f" Using random dataset sample id={sample.get('id')} "
            f"location={sample.get('location_name')}"
        )

        return await _run_inference_pipeline(
            t1_bytes=dataset_payload["t1_bytes"],
            t2_bytes=dataset_payload["t2_bytes"],
            bbox=dataset_payload["bbox"],
            time1_range=dataset_payload["time1_range"],
            time2_range=dataset_payload["time2_range"],
            source="random_dataset",
            selected_sample=sample,
        )

    except Exception as e:
        logger.error(f" RANDOM DATASET INFERENCE ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test")
async def test_endpoint():
    await manager.broadcast_json({"event": "NEW_DETECTION", "data": {"message": "This is a test broadcast from the server!"}})
    return {"status": "test message sent"}
