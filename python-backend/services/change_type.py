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

def get_change_type(
    t1_green, t1_red, t1_nir, t1_swir,
    t2_green, t2_red, t2_nir, t2_swir
):
    """Processes NumPy arrays directly to identify land-use change types."""
    try:
        # Arrays are already NumPy floats from fetch_cropped_bands
        # 1. Spectral Math
        eps = 1e-8
        
        # Calculate Indices
        ndvi_t1 = (t1_nir - t1_red) / (t1_nir + t1_red + eps)
        ndvi_t2 = (t2_nir - t2_red) / (t2_nir + t2_red + eps)
        
        ndwi_t1 = (t1_green - t1_nir) / (t1_green + t1_nir + eps)
        ndwi_t2 = (t2_green - t2_nir) / (t2_green + t2_nir + eps)
        
        ndbi_t1 = (t1_swir - t1_nir) / (t1_swir + t1_nir + eps)
        ndbi_t2 = (t2_swir - t2_nir) / (t2_swir + t2_nir + eps)

        # 2. Deltas (Differences)
        d_ndvi = ndvi_t2 - ndvi_t1
        d_ndwi = ndwi_t2 - ndwi_t1
        d_ndbi = ndbi_t2 - ndbi_t1

        # 3. Create logical masks
        mask_industrial = (d_ndvi < -0.15) & (d_ndbi >= 0.2)
        mask_residential = (d_ndvi < -0.15) & (d_ndbi >= 0.05) & (d_ndbi < 0.2)
        mask_veg_loss = (d_ndvi < -0.2) & (d_ndbi < 0.05)
        mask_veg_growth = (d_ndvi > 0.2)
        mask_waterbody = (d_ndwi > 0.15)

        # 4. Count the pixels
        counts = {
            "industrial": np.count_nonzero(mask_industrial),
            "residential": np.count_nonzero(mask_residential),
            "vegetation loss": np.count_nonzero(mask_veg_loss),
            "vegetation growth": np.count_nonzero(mask_veg_growth),
            "waterbody": np.count_nonzero(mask_waterbody)
        }

        dominant_raw = max(counts, key=counts.get)
        dominant_count = counts[dominant_raw]
        total_pixels = t1_red.size

        # 5. Result Mapping
        mapping = {
            "industrial": ("industrial", "growth"),
            "residential": ("residential", "growth"),
            "waterbody": ("waterbody", "expansion"),
            "vegetation loss": ("vegetation", "loss"),
            "vegetation growth": ("vegetation", "growth")
        }
        
        final_result, sentiment = mapping.get(dominant_raw, ("unknown", "neutral"))

        # 6. Area check
        area_pct = round((dominant_count / total_pixels) * 100, 2)
        
        if area_pct < 0.1:
            return {
                "result": "no significant change",
                "trend": "neutral",
                "area_percentage": 0
            }

        return {
            "result": final_result,
            "trend": sentiment,
            "area_percentage": area_pct
        }

    except Exception as e:
        traceback.print_exc()
        # Still raise the exception to be caught by the router logger
        raise Exception(f"Error in spectral analysis: {str(e)}")