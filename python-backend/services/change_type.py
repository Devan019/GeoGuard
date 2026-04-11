from PIL import Image
import numpy as np
import traceback
import io
import uuid

# CRITICAL for FastAPI: Set matplotlib to non-interactive backend before importing pyplot
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.patches as mpatches

from services.s3_service import upload_pil_to_s3, BUCKET_NAME


def get_change_type(
    t1_green, t1_red, t1_nir, t1_swir,
    t2_green, t2_red, t2_nir, t2_swir
):
    """Processes NumPy arrays directly to identify land-use change types and uploads a map to S3."""
    try:
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

        # 4. Count the pixels for stats
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
        area_pct = round((dominant_count / total_pixels) * 100, 2)

        # --- NEW VISUALIZATION & S3 UPLOAD LOGIC ---

        # 6. Build the Change Map array for the image
        target_shape = t1_red.shape
        change_map = np.zeros(target_shape, dtype=np.uint8)
        
        # Apply masks to map (0=Black, 1=Yellow, 2=Red, 3=Blue, 4=Green)
        change_map[mask_veg_loss] = 1 
        change_map[mask_industrial | mask_residential] = 2  # Combine built-up areas for urban
        change_map[mask_waterbody] = 3 
        change_map[mask_veg_growth] = 4 

        # Format stats text for the image
        changed_pixels = np.count_nonzero(change_map)
        stats_text = "No Change"
        if changed_pixels > 0:
            stats_text = (
                f"Total Area Changed: {(changed_pixels/total_pixels)*100:.1f}%\n"
                f"Urban: {(np.count_nonzero(change_map==2)/changed_pixels)*100:.1f}%\n"
                f"Veg Loss: {(np.count_nonzero(change_map==1)/changed_pixels)*100:.1f}%\n"
                f"Water: {(np.count_nonzero(change_map==3)/changed_pixels)*100:.1f}%\n"
                f"Veg Growth: {(np.count_nonzero(change_map==4)/changed_pixels)*100:.1f}%"
            )

        # 7. Generate Plot
        fig, ax = plt.subplots(figsize=(10, 10))
        cmap = mcolors.ListedColormap(['black', 'yellow', 'red', 'blue', 'green'])
        
        ax.imshow(change_map, cmap=cmap)
        ax.set_title(f"Change Analysis: {final_result.title()} {sentiment.title()}")
        ax.axis('off')

        # Add Stats Box
        ax.text(1.02, 0.5, stats_text, transform=ax.transAxes, 
                bbox=dict(facecolor='white', alpha=0.8), verticalalignment='center')
        
        # Legend
        patches = [mpatches.Patch(color=c, label=l) for c, l in 
                   zip(['yellow', 'red', 'blue', 'green'], 
                       ['Veg Loss', 'Urbanization', 'Water/Flood', 'Veg Growth'])]
        ax.legend(handles=patches, loc='lower right')

        # 8. Save Plot to Memory Buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        plt.close(fig) # Free up memory
        buf.seek(0)

        # 9. Upload to S3
        file_name = f"change_maps/{uuid.uuid4().hex}.png"
        
        file_key = upload_pil_to_s3(
            img=Image.open(buf), 
            prefix=f"change_maps/{uuid.uuid4().hex}"
        )

        # --- END VISUALIZATION ---

        # 10. Return Final Payload
        if area_pct < 0.1:
            return {
                "result": "no significant change",
                "trend": "neutral",
                "area_percentage": 0,
                "image_metadata": {
                    "s3_key": file_key,
                    "bucket": BUCKET_NAME,
                    "url": f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_key}"
                }
            }

        return {
            "result": final_result,
            "trend": sentiment,
            "area_percentage": area_pct,
            "image_metadata": {
                "s3_key": file_key,
                "bucket": BUCKET_NAME,
                "url": f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_key}"
            }
        }

    except Exception as e:
        traceback.print_exc()
        raise Exception(f"Error in spectral analysis or S3 upload: {str(e)}")