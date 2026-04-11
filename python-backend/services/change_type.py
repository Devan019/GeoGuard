from fastapi import UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import numpy as np
import traceback
from rasterio.io import MemoryFile
from rasterio.enums import Resampling

def read_band_from_memory(file_bytes, target_shape=None):
    with MemoryFile(file_bytes) as memfile:
        with memfile.open() as dataset:
            if target_shape:
                data = dataset.read(1, out_shape=target_shape,
                                    resampling=Resampling.bilinear)
            else:
                data = dataset.read(1)
            return data.astype(np.float32)

#it take all 4-4 images and get final detection type and percentage of area changed.
def get_change_type(
    t1_green: UploadFile = File(...), t1_red: UploadFile = File(...),
    t1_nir: UploadFile = File(...), t1_swir: UploadFile = File(...),
    t2_green: UploadFile = File(...), t2_red: UploadFile = File(...),
    t2_nir: UploadFile = File(...), t2_swir: UploadFile = File(...)
):
    try:
        # 1. Read Time 1 Bands
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
        ndbi_t2 = (swir_t2 - nir_t2) / (swir_t2 + nir_t2 + eps)

        # 4. Deltas
        d_ndvi = ndvi_t2 - ndvi_t1
        d_ndwi = ndwi_t2 - ndwi_t1
        d_ndbi = ndbi_t2 - ndbi_t1

        # 5. Create logical masks (We separate Vegetation Loss and Growth here!)
        mask_industrial = (d_ndvi < -0.2) & (d_ndbi >= 0.25)
        mask_residential = (d_ndvi < -0.2) & (d_ndbi >= 0.1) & (d_ndbi < 0.25)
        mask_veg_loss = (d_ndvi < -0.2) & (d_ndbi < 0.1)
        mask_veg_growth = (d_ndvi > 0.2)
        mask_waterbody = (d_ndwi > 0.2)

        # 6. Count the pixels
        counts = {
            "industrial": np.count_nonzero(mask_industrial),
            "residential": np.count_nonzero(mask_residential),
            "vegetation loss": np.count_nonzero(mask_veg_loss),
            "vegetation growth": np.count_nonzero(mask_veg_growth),
            "waterbody": np.count_nonzero(mask_waterbody)
        }

        # Find the raw winner
        dominant_raw = max(counts, key=counts.get)
        dominant_count = counts[dominant_raw]
        total_pixels = red_t1.size

        # 7. Map the raw winner to your exact UI strings and assign a Sentiment/Trend
        if dominant_raw == "industrial":
            final_result = "industrial"
            sentiment = "growth"
        elif dominant_raw == "residential":
            final_result = "residential"
            sentiment = "growth"
        elif dominant_raw == "waterbody":
            final_result = "waterbody"
            sentiment = "expansion"
        elif dominant_raw == "vegetation loss":
            final_result = "vegetation"
            sentiment = "loss"
        elif dominant_raw == "vegetation growth":
            final_result = "vegetation"
            sentiment = "growth"

        # Safety check: If less than 0.1% of the image changed
        if (dominant_count / total_pixels) < 0.001:
            return JSONResponse(content={
                "result": "no significant change",
                "trend": "neutral",
                "area_percentage": 0
            })

        # 8. Return the upgraded JSON!
        return JSONResponse(content={
            "result": final_result,      # "vegetation", "residential", etc.
            "trend": sentiment,          # "growth", "loss", or "expansion"
            "area_percentage": round((dominant_count / total_pixels) * 100, 2)
        })

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))