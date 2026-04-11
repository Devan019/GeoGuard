import base64

from fastapi import APIRouter, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
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

# Matplotlib configuration (CRITICAL for servers)
import matplotlib
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# Your internal services
from models.schema import UploadNotification
from services.pdf_service import process_pdf_pipeline
from services.raster_to_vector import vectorize
from services.connection_manager import ConnectionManager

from skimage import exposure

router = APIRouter()
manager = ConnectionManager()

# ==========================================
# ML MODEL INITIALIZATION
# ==========================================
print("🧠 Loading ONNX model into memory...")
session = None
try:
    session = ort.InferenceSession("best_siamese_unet.onnx")
    input_name_1 = session.get_inputs()[0].name
    input_name_2 = session.get_inputs()[1].name
except Exception as e:
    print(f"⚠️ Warning: Could not load ONNX model. ML endpoints will fail. Error: {e}")

# ==========================================
# ML HELPER FUNCTIONS
# ==========================================
def read_band_from_memory(file_bytes, target_shape=None):
    with MemoryFile(file_bytes) as memfile:
        with memfile.open() as dataset:
            if target_shape:
                data = dataset.read(1, out_shape=target_shape, resampling=Resampling.bilinear)
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

        # 1. Load images into PIL and Numpy
        img1_pil = Image.open(io.BytesIO(t1_bytes)).convert("RGB").resize((256, 256))
        img2_pil = Image.open(io.BytesIO(t2_bytes)).convert("RGB").resize((256, 256))
        
        arr1 = np.array(img1_pil)
        arr2 = np.array(img2_pil)

        # 2. Radiometric Calibration (Match Time 2 to Time 1's lighting/colors)
        arr2_matched = exposure.match_histograms(arr2, arr1, channel_axis=-1).astype(np.uint8)
        img2_matched_pil = Image.fromarray(arr2_matched)

        # 3. Preprocess directly from PIL images
        img1_tensor = preprocess_image(img1_pil) 
        img2_tensor = preprocess_image(img2_matched_pil)

        # 4. Run Inference
        inputs = {input_name_1: img1_tensor, input_name_2: img2_tensor}
        outputs = session.run(None, inputs)

        # 5. Safely extract probabilities (Dynamic Sigmoid Fix)
        prob_map_2d = np.squeeze(outputs[0])
        if np.min(prob_map_2d) < 0.0 or np.max(prob_map_2d) > 1.0:
            # Model outputted raw logits, apply sigmoid safely
            prob_map_2d = 1 / (1 + np.exp(-np.clip(prob_map_2d, -10, 10)))
        
        max_conf = np.max(prob_map_2d)
        binary_mask = (prob_map_2d > 0.5).astype(np.uint8) * 255

        # Plotting
        fig, axes = plt.subplots(1, 4, figsize=(20, 5))
        axes[0].imshow(img1_pil)
        axes[0].set_title("Time 1 (Before)")
        axes[0].axis("off")
        
        axes[1].imshow(img2_matched_pil) # Show the color-corrected image
        axes[1].set_title("Time 2 (Color Matched)")
        axes[1].axis("off")
        
        im = axes[2].imshow(prob_map_2d, cmap='jet', vmin=0, vmax=1)
        axes[2].set_title(f"Confidence Heatmap\n(Max: {max_conf*100:.1f}%)")
        axes[2].axis("off")
        
        axes[3].imshow(binary_mask, cmap='gray', vmin=0, vmax=255)
        axes[3].set_title("Binary Mask (>50% Threshold)")
        axes[3].axis("off")
        
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close(fig) 
        buf.seek(0)

        return Response(content=buf.getvalue(), media_type="image/png")

    except Exception as e:
        print("\n--- SERVER ERROR ---")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict_change_raster")
def predict_change_raster(
    time1_image: UploadFile = File(...),
    time2_image: UploadFile = File(...)
):
    if session is None:
        raise HTTPException(status_code=503, detail="ML Model not loaded.")
        
    try:
        t1_bytes = time1_image.file.read()
        t2_bytes = time2_image.file.read()

        # 1. Load images into PIL and Numpy
        img1_pil = Image.open(io.BytesIO(t1_bytes)).convert("RGB").resize((256, 256))
        img2_pil = Image.open(io.BytesIO(t2_bytes)).convert("RGB").resize((256, 256))
        
        arr1 = np.array(img1_pil)
        arr2 = np.array(img2_pil)

        # 2. Radiometric Calibration
        arr2_matched = exposure.match_histograms(arr2, arr1, channel_axis=-1).astype(np.uint8)
        img2_matched_pil = Image.fromarray(arr2_matched)

        # 3. Preprocess directly from PIL images
        img1_tensor = preprocess_image(img1_pil) 
        img2_tensor = preprocess_image(img2_matched_pil)

        # 4. Run Inference
        inputs = {input_name_1: img1_tensor, input_name_2: img2_tensor}
        outputs = session.run(None, inputs)

        # 5. Safely extract probabilities
        prob_map_2d = np.squeeze(outputs[0])
        if np.min(prob_map_2d) < 0.0 or np.max(prob_map_2d) > 1.0:
            prob_map_2d = 1 / (1 + np.exp(-np.clip(prob_map_2d, -10, 10)))
        
        max_conf = np.max(prob_map_2d)
        
        # Create Raster Masks
        ai_raster_mask = (prob_map_2d > 0.5).astype(int)
        visual_mask = (ai_raster_mask * 255).astype(np.uint8)

        # Plotting
        fig, axes = plt.subplots(1, 4, figsize=(20, 5))
        axes[0].imshow(img1_pil)
        axes[0].set_title("Time 1 (Before)")
        axes[0].axis("off")
        
        axes[1].imshow(img2_matched_pil)
        axes[1].set_title("Time 2 (Color Matched)")
        axes[1].axis("off")
        
        im = axes[2].imshow(prob_map_2d, cmap='jet', vmin=0, vmax=1)
        axes[2].set_title(f"Confidence Heatmap\n(Max: {max_conf*100:.1f}%)")
        axes[2].axis("off")
        
        axes[3].imshow(visual_mask, cmap='gray', vmin=0, vmax=255)
        axes[3].set_title("Binary Mask (>50% Threshold)")
        axes[3].axis("off")
        
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close(fig) 
        
        plot_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        return JSONResponse(content={
            "status": "success",
            "max_confidence": float(max_conf),
            "raster_mask": ai_raster_mask.tolist(), 
            "visualization_image": plot_base64
        })

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
        ndbi_t2 = (swir_t2 - swir_t1) / (swir_t2 + swir_t1 + eps) # Fixed potential typo from original script

        # 4. Deltas
        d_ndvi = ndvi_t2 - ndvi_t1
        d_ndwi = ndwi_t2 - ndwi_t1
        d_ndbi = ndbi_t2 - ndbi_t1

        # 5. Logic Strategy
        change_map = np.zeros(target_shape, dtype=np.uint8)
        change_map[(d_ndvi < -0.2) & (d_ndbi < 0.2)] = 1  # Deforestation
        change_map[(d_ndvi < -0.2) & (d_ndbi >= 0.2)] = 2 # Urbanization
        change_map[(d_ndwi > 0.2)] = 3                    # Flooding
        change_map[(d_ndvi > 0.2)] = 4                    # Growth

        # 6. Statistics Calculation
        total = change_map.size
        changed = np.count_nonzero(change_map)
        stats = "No Change"
        if changed > 0:
            stats = (f"Area Change: {(changed/total)*100:.1f}%\n"
                     f"Urb: {(np.count_nonzero(change_map==2)/changed)*100:.1f}%\n"
                     f"Def: {(np.count_nonzero(change_map==1)/changed)*100:.1f}%\n"
                     f"Flood: {(np.count_nonzero(change_map==3)/changed)*100:.1f}%")

        # 7. Visualization
        fig, ax = plt.subplots(figsize=(10, 10))
        cmap = matplotlib.colors.ListedColormap(['black', 'yellow', 'red', 'blue', 'green'])
        ax.imshow(change_map, cmap=cmap)
        ax.set_title("Stitched Band Change Analysis")
        ax.axis('off')

        ax.text(1.02, 0.5, stats, transform=ax.transAxes, bbox=dict(facecolor='white', alpha=0.8))
        
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