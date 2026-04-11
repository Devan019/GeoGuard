# import os
# from fastapi import FastAPI, UploadFile, File, HTTPException
# from fastapi.responses import Response
# import onnxruntime as ort
# import numpy as np
# from PIL import Image
# import io
# import traceback
# import matplotlib.patches as mpatches

# # Cloud Fetching Libraries
# import pystac_client
# import planetary_computer
# import rasterio
# from rasterio.windows import from_bounds
# from rasterio.io import MemoryFile
# from rasterio.enums import Resampling

# # 🚨 CRITICAL FOR SERVERS: Tells matplotlib not to open GUI windows
# import matplotlib
# matplotlib.use('Agg') 
# import matplotlib.pyplot as plt

# app = FastAPI(title="Unified Satellite Change Detection API")

# # ==========================================
# # 1. GLOBALLY LOAD THE DEEP LEARNING MODEL
# # ==========================================
# # Build absolute path relative to this script file — works regardless of
# # which directory uvicorn is launched from.
# _HERE       = os.path.dirname(os.path.abspath(__file__))
# _MODEL_PATH = os.path.join(_HERE, "best_siamese_unet.onnx")

# print("🧠 Loading ONNX model into memory...")
# print(f"   Model path: {_MODEL_PATH}")
# try:
#     if not os.path.exists(_MODEL_PATH):
#         raise FileNotFoundError(f"Model file not found at: {_MODEL_PATH}")
#     session = ort.InferenceSession(_MODEL_PATH)
#     input_name_1 = session.get_inputs()[0].name
#     input_name_2 = session.get_inputs()[1].name
#     print("✅ ONNX model loaded successfully.")
# except Exception as e:
#     session = None
#     print(f"⚠️  Warning: Could not load ONNX model. Predict endpoint will fail.\n   Error: {e}")

# # ==========================================
# # 2. HELPER FUNCTIONS
# # ==========================================
# def read_band_from_memory(file_bytes, target_shape=None):
#     """Reads a single-band file and resamples it if a target_shape is provided."""
#     with MemoryFile(file_bytes) as memfile:
#         with memfile.open() as dataset:
#             if target_shape:
#                 # Resample to match target dimensions (e.g., scaling SWIR up to 10m)
#                 data = dataset.read(
#                     1,
#                     out_shape=target_shape,
#                     resampling=Resampling.bilinear
#                 )
#             else:
#                 data = dataset.read(1)
#             return data.astype(np.float32)
# def preprocess_image(image_bytes):
#     """Loads, resizes, and scales an image for the DL model."""
#     img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
#     img = img.resize((256, 256))
#     img_array = np.array(img, dtype=np.float32) / 255.0
#     return np.expand_dims(img_array, axis=0)

# def safe_sigmoid(x):
#     """Safely converts raw logits to probabilities preventing Math Overflow."""
#     x = np.clip(x, -10, 10)
#     return 1 / (1 + np.exp(-x))

# def fetch_cropped_bands(bbox, date_range):
#     """Fetches ONLY the requested bounding box from Microsoft's cloud to save memory."""
#     catalog = pystac_client.Client.open(
#         "https://planetarycomputer.microsoft.com/api/stac/v1",
#         modifier=planetary_computer.sign_inplace,
#     )

#     # Search Sentinel-2 L2A for images with < 10% cloud cover
#     search = catalog.search(
#         collections=["sentinel-2-l2a"],
#         bbox=bbox,
#         datetime=date_range,
#         query={"eo:cloud_cover": {"lt": 10}} 
#     )

#     items = list(search.items())
#     if not items:
#         return None

#     item = items[0] # Get the most recent clear image

#     # Use rasterio windows to download ONLY the bounding box
#     bands = {}
#     with rasterio.open(item.assets["B03"].href) as src: # Green
#         window = from_bounds(*bbox, transform=src.transform)
#         bands['green'] = src.read(1, window=window).astype(np.float32)

#     with rasterio.open(item.assets["B04"].href) as src: # Red
#         bands['red'] = src.read(1, window=window).astype(np.float32)
        
#     with rasterio.open(item.assets["B08"].href) as src: # NIR
#         bands['nir'] = src.read(1, window=window).astype(np.float32)

#     with rasterio.open(item.assets["B11"].href) as src: # SWIR
#         bands['swir'] = src.read(1, window=window).astype(np.float32)

#     return bands

# # ==========================================
# # ENDPOINT 1: DEEP LEARNING (BUILDING DETECTION)
# # ==========================================
# @app.post("/predict_change")
# async def predict_change(
#     time1_image: UploadFile = File(...),
#     time2_image: UploadFile = File(...)
# ):
#     try:
#         if session is None:
#             raise HTTPException(
#                 status_code=503,
#                 detail=f"ONNX model not loaded. Ensure '{_MODEL_PATH}' exists."
#             )
#         t1_bytes = await time1_image.read()
#         t2_bytes = await time2_image.read()

#         img1_tensor = preprocess_image(t1_bytes)
#         img2_tensor = preprocess_image(t2_bytes)

#         inputs = {input_name_1: img1_tensor, input_name_2: img2_tensor}
#         outputs = session.run(None, inputs)

#         change_logits = outputs[0][0] 
#         probabilities = safe_sigmoid(change_logits)
        
#         max_conf = np.max(probabilities)
#         min_conf = np.min(probabilities)
#         print(f"DEBUG -> Max Confidence: {max_conf:.4f} | Min Confidence: {min_conf:.4f}")

#         prob_map_2d = np.squeeze(probabilities)
#         binary_mask = (prob_map_2d > 0.25).astype(np.uint8) * 255

#         # Plotting
#         fig, axes = plt.subplots(1, 4, figsize=(20, 5))
#         axes[0].imshow(Image.open(io.BytesIO(t1_bytes)).resize((256, 256)))
#         axes[0].set_title("Time 1 (Before)")
#         axes[0].axis("off")
        
#         axes[1].imshow(Image.open(io.BytesIO(t2_bytes)).resize((256, 256)))
#         axes[1].set_title("Time 2 (After)")
#         axes[1].axis("off")
        
#         im = axes[2].imshow(prob_map_2d, cmap='jet', vmin=0, vmax=1)
#         axes[2].set_title(f"Confidence Heatmap\n(Max: {max_conf*100:.1f}%)")
#         axes[2].axis("off")
        
#         axes[3].imshow(binary_mask, cmap='gray', vmin=0, vmax=255)
#         axes[3].set_title("Binary Mask (>50% Threshold)")
#         axes[3].axis("off")
        
#         plt.tight_layout()

#         buf = io.BytesIO()
#         plt.savefig(buf, format='png', bbox_inches='tight')
#         plt.close(fig) 
#         buf.seek(0)

#         return Response(content=buf.getvalue(), media_type="image/png")

#     except Exception as e:
#         print("\n--- SERVER ERROR ---")
#         traceback.print_exc()
#         print("--------------------\n")
#         return {"error": str(e)}

# # ==========================================
# # ENDPOINT 2: SPECTRAL MATH (LAND COVER TYPE)
# # ==========================================
# @app.post("/analyze_separate_bands")
# async def analyze_separate_bands(
#     t1_green: UploadFile = File(...), t1_red: UploadFile = File(...),
#     t1_nir: UploadFile = File(...), t1_swir: UploadFile = File(...),
#     t2_green: UploadFile = File(...), t2_red: UploadFile = File(...),
#     t2_nir: UploadFile = File(...), t2_swir: UploadFile = File(...)
# ):
#     try:
#         # 1. Read Time 1 Bands
#         # We use the Red band as the 'Master' shape for alignment
#         t1_red_bytes = await t1_red.read()
#         red_t1 = read_band_from_memory(t1_red_bytes)
#         target_shape = red_t1.shape

#         green_t1 = read_band_from_memory(await t1_green.read(), target_shape)
#         nir_t1 = read_band_from_memory(await t1_nir.read(), target_shape)
#         swir_t1 = read_band_from_memory(await t1_swir.read(), target_shape)

#         # 2. Read Time 2 Bands
#         red_t2 = read_band_from_memory(await t2_red.read(), target_shape)
#         green_t2 = read_band_from_memory(await t2_green.read(), target_shape)
#         nir_t2 = read_band_from_memory(await t2_nir.read(), target_shape)
#         swir_t2 = read_band_from_memory(await t2_swir.read(), target_shape)

#         # 3. Spectral Math
#         eps = 1e-8
        
#         # NDVI (Veg)
#         ndvi_t1 = (nir_t1 - red_t1) / (nir_t1 + red_t1 + eps)
#         ndvi_t2 = (nir_t2 - red_t2) / (nir_t2 + red_t2 + eps)
        
#         # NDWI (Water)
#         ndwi_t1 = (green_t1 - nir_t1) / (green_t1 + nir_t1 + eps)
#         ndwi_t2 = (green_t2 - nir_t2) / (green_t2 + nir_t2 + eps)
        
#         # NDBI (Urban)
#         ndbi_t1 = (swir_t1 - nir_t1) / (swir_t1 + nir_t1 + eps)
#         ndbi_t2 = (swir_t2 - nir_t2) / (swir_t2 + nir_t2 + eps)

#         # 4. Deltas
#         d_ndvi = ndvi_t2 - ndvi_t1
#         d_ndwi = ndwi_t2 - ndwi_t1
#         d_ndbi = ndbi_t2 - ndbi_t1

#         # 5. Logic Strategy
#         change_map = np.zeros(target_shape, dtype=np.uint8)
#         change_map[(d_ndvi < -0.2) & (d_ndbi < 0.2)] = 1  # Deforestation
#         change_map[(d_ndvi < -0.2) & (d_ndbi >= 0.2)] = 2 # Urbanization
#         change_map[(d_ndwi > 0.2)] = 3                    # Flooding
#         change_map[(d_ndvi > 0.2)] = 4                    # Growth

#         # 6. Statistics Calculation
#         total = change_map.size
#         changed = np.count_nonzero(change_map)
#         stats = "No Change"
#         if changed > 0:
#             stats = (f"Area Change: {(changed/total)*100:.1f}%\n"
#                      f"Urb: {(np.count_nonzero(change_map==2)/changed)*100:.1f}%\n"
#                      f"Def: {(np.count_nonzero(change_map==1)/changed)*100:.1f}%\n"
#                      f"Flood: {(np.count_nonzero(change_map==3)/changed)*100:.1f}%")

#         # 7. Visualization
#         fig, ax = plt.subplots(figsize=(10, 10))
#         cmap = matplotlib.colors.ListedColormap(['black', 'yellow', 'red', 'blue', 'green'])
#         ax.imshow(change_map, cmap=cmap)
#         ax.set_title("Stitched Band Change Analysis")
#         ax.axis('off')

#         # Add Stats Box
#         ax.text(1.02, 0.5, stats, transform=ax.transAxes, bbox=dict(facecolor='white', alpha=0.8))
        
#         # Legend
#         patches = [mpatches.Patch(color=c, label=l) for c, l in 
#                    zip(['yellow', 'red', 'blue', 'green'], ['Deforest', 'Urban', 'Flood', 'Growth'])]
#         ax.legend(handles=patches, loc='lower right')

#         buf = io.BytesIO()
#         plt.savefig(buf, format='png', bbox_inches='tight')
#         plt.close(fig)
#         buf.seek(0)

#         return Response(content=buf.getvalue(), media_type="image/png")

#     except Exception as e:
#         return {"error": str(e)}