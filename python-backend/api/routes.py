from skimage import exposure
from services.change_type import get_change_type
from services.connection_manager import ConnectionManager
from services.gen_tif import fetch_cropped_bands
from services.raster_to_vector import vectorize
from services.pdf_service import process_pdf_pipeline
from models.schema import FinalInferenceRequest, UploadNotification
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import base64

import json

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

from services.db_service import get_db
from services.inference_helper import process_ai_change_detection

# Matplotlib configuration (CRITICAL for servers)
import matplotlib
matplotlib.use('Agg')

# Your internal services


router = APIRouter()
manager = ConnectionManager()

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
        # 1. Read Time 1 Bands (Synchronously)
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

        # 3. Spectral Math
        eps = 1e-8
        ndvi_t1 = (nir_t1 - red_t1) / (nir_t1 + red_t1 + eps)
        ndvi_t2 = (nir_t2 - red_t2) / (nir_t2 + red_t2 + eps)

        ndwi_t1 = (green_t1 - nir_t1) / (green_t1 + nir_t1 + eps)
        ndwi_t2 = (green_t2 - nir_t2) / (green_t2 + nir_t2 + eps)

        ndbi_t1 = (swir_t1 - nir_t1) / (swir_t1 + nir_t1 + eps)
        # Fixed potential typo from original script
        ndbi_t2 = (swir_t2 - swir_t1) / (swir_t2 + swir_t1 + eps)

        # 4. Deltas
        d_ndvi = ndvi_t2 - ndvi_t1
        d_ndwi = ndwi_t2 - ndwi_t1
        d_ndbi = ndbi_t2 - ndbi_t1

        # 5. Logic Strategy
        change_map = np.zeros(target_shape, dtype=np.uint8)
        change_map[(d_ndvi < -0.2) & (d_ndbi < 0.2)] = 1  # Deforestation
        change_map[(d_ndvi < -0.2) & (d_ndbi >= 0.2)] = 2  # Urbanization
        change_map[(d_ndwi > 0.2)] = 3                    # Flooding
        change_map[(d_ndvi > 0.2)] = 4                    # Growth

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
@router.post("/inference_local")
async def inference_local(
    time1_image: UploadFile = File(...),
    time2_image: UploadFile = File(...),
    # When sending files, JSON must be sent as stringified Form data
    bbox_str: str = Form(..., description='e.g., "[72.48, 23.03, 72.54, 23.08]"'),
    client_id: str = Form(...),

    time1_range: str = Form("2020-01-01"),
    time2_range: str = Form("2024-01-01")
):
    if session is None:
        raise HTTPException(status_code=503, detail="ML Model not loaded.")

    try:
        # 1. Parse the stringified bounding box back into a Python list
        bbox = json.loads(bbox_str)

        # 2. Read the uploaded JPEGs
        t1_bytes = await time1_image.read()
        t2_bytes = await time2_image.read()

        # 3. RUN ONNX INFERENCE (AI processing & S3 Upload)
        ai_data = process_ai_change_detection(t1_bytes, t2_bytes, session)

        # 4. RUN VECTORIZATION
        # Since the AI resizes images to 256x256, our raster_matrix is 256x256.
        # We divide the GPS bounds by 256 to find the size of a single pixel.
        vectorize_request = {
            "raster_mask": ai_data["raster_matrix"], 
            "transform": {
                "west": bbox[0],
                "north": bbox[3],
                "xsize": (bbox[2] - bbox[0]) / 256.0,
                "ysize": (bbox[3] - bbox[1]) / 256.0
            },
        }

        #get all 4-4 types of bands
        t1_bands = fetch_cropped_bands(bbox, time1_range)
        t2_bands = fetch_cropped_bands(bbox, time2_range)

        # 2. THE FIX: Catch the empty results before Python crashes!
        if t1_bands is None:
            raise HTTPException(
                status_code=404, 
                detail=f"STAC API found NO clear images for Time 1 ({time1_range}). Try a wider date range (e.g., 3 months) or change the season."
            )
        if t2_bands is None:
            raise HTTPException(
                status_code=404, 
                detail=f"STAC API found NO clear images for Time 2 ({time2_range}). Try a wider date range (e.g., 3 months) or change the season."
            )


        print("Bands fetched for both time periods. Proceeding to change type detection...")
        print(f"Time 1 - Green mean: {np.mean(t1_bands['green']):.2f}, Red mean: {np.mean(t1_bands['red']):.2f}, NIR mean: {np.mean(t1_bands['nir']):.2f}, SWIR mean: {np.mean(t1_bands['swir']):.2f}")
        print(f"Time 2 - Green mean: {np.mean(t2_bands['green']):.2f}, Red mean: {np.mean(t2_bands['red']):.2f}, NIR mean: {np.mean(t2_bands['nir']):.2f}, SWIR mean: {np.mean(t2_bands['swir']):.2f}")

        #detect change type
        detected_type = get_change_type(
            t1_green= t1_bands['green'], t1_red= t1_bands['red'], t1_nir= t1_bands['nir'], t1_swir= t1_bands['swir'],
            t2_green= t2_bands['green'], t2_red= t2_bands['red'], t2_nir= t2_bands['nir'], t2_swir= t2_bands['swir']
        )

        # Vectorize and save to DB
        feature_collection = await vectorize(
            request=vectorize_request, 
            manager=manager, 
            db=get_db(), 
            
        )

        # 5. Push the complete data to Next.js via WebSocket
        data = {
            "feature_collection": feature_collection,
            "dominant_change": {"dominant_change": detected_type},
            "ai_results": {
                "bucket": ai_data.get("bucket", "your-bucket"),
                "image_keys": ai_data["image_keys"],
                "max_confidence": ai_data.get("max_confidence", None)
            }
        }

        print(f"Sending data to client {client_id} via WebSocket...")

        await manager.send_personal_message({
            "event": "NEW_DETECTION",
            "data": data
        }, client_id)

        return {"status": "success", "message": "Local images processed and vectorized!"}

    except Exception as e:
        print("\n--- SERVER ERROR ---")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))