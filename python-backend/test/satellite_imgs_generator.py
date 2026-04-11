import os
import json
import time
import numpy as np
from PIL import Image
import pystac_client
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from datetime import datetime
from dateutil.relativedelta import relativedelta

def fetch_rgb_composite(bbox: list, time_range: str):
    """Queries AWS Element84 for the least cloudy Sentinel-2 image."""
    catalog = pystac_client.Client.open("https://earth-search.aws.element84.com/v1")

    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=time_range,
        query={"eo:cloud_cover": {"lt": 5}}, 
        sortby=[{"field": "properties.datetime", "direction": "desc"}],
        limit=10
    )
    
    items = list(search.items())
    if not items:
        # Fallback to slightly more clouds if < 5% isn't found
        search = catalog.search(
            collections=["sentinel-2-l2a"], bbox=bbox, datetime=time_range,
            query={"eo:cloud_cover": {"lt": 15}}, sortby=[{"field": "properties.datetime", "direction": "desc"}], limit=10
        )
        items = list(search.items())
        if not items:
            return None, None
        
    item = items[0]
    date_captured = item.datetime.strftime('%Y-%m-%d')
    
    with rasterio.open(item.assets["red"].href) as src:
        proj_bbox = transform_bounds("EPSG:4326", src.crs, *bbox)
        win = from_bounds(*proj_bbox, transform=src.transform)
        
        def safe_read(key):
            with rasterio.open(item.assets[key].href) as b_src:
                return b_src.read(1, window=win, boundless=True).astype(np.float32)
        
        r = safe_read("red")
        g = safe_read("green")
        b = safe_read("blue")

    if r.size == 0:
        return None, None

    rgb = np.dstack((r, g, b))
    rgb = np.clip(rgb / 3000.0 * 255.0, 0, 255).astype(np.uint8)
    
    return rgb, date_captured

def main():
    locations = [
        {"id": 1, "name": "GIFT_City_Expansion", "bbox": [72.675, 23.155, 72.695, 23.175]},
        {"id": 2, "name": "Motera_Stadium_Area", "bbox": [72.585, 23.085, 72.605, 23.105]},
        {"id": 3, "name": "Sindhu_Bhavan_Road_Commercial", "bbox": [72.500, 23.035, 72.525, 23.055]},
        {"id": 4, "name": "South_Bopal_Residential", "bbox": [72.460, 23.010, 72.485, 23.030]},
        {"id": 5, "name": "Vaishnodevi_Circle", "bbox": [72.535, 23.135, 72.560, 23.155]},
        {"id": 6, "name": "Sanand_Industrial_Estate", "bbox": [72.360, 22.980, 72.400, 23.020]},
        {"id": 7, "name": "Sabarmati_Riverfront_North", "bbox": [72.575, 23.055, 72.595, 23.075]},
        {"id": 8, "name": "Science_City_Development", "bbox": [72.495, 23.075, 72.520, 23.095]},
        {"id": 9, "name": "Ognaj_Ring_Road", "bbox": [72.495, 23.100, 72.520, 23.120]},
        {"id": 10, "name": "Chandkheda_Zundal", "bbox": [72.575, 23.115, 72.600, 23.135]},
        {"id": 11, "name": "Hansol_Airport_Edge", "bbox": [72.620, 23.065, 72.645, 23.085]},
        {"id": 12, "name": "Prahlad_Nagar_Makarba", "bbox": [72.490, 23.000, 72.515, 23.020]}
    ]

    now = datetime.now()
    six_years_ago = now - relativedelta(years=6)
    
    current_range = f"{(now - relativedelta(months=4)).strftime('%Y-%m-%d')}/{now.strftime('%Y-%m-%d')}"
    past_range = f"{(six_years_ago - relativedelta(months=4)).strftime('%Y-%m-%d')}/{six_years_ago.strftime('%Y-%m-%d')}"

    output_dir = "satellite_images"
    os.makedirs(output_dir, exist_ok=True)
    json_path = os.path.join(output_dir, "dataset.json")

    # Start with a completely fresh list
    metadata_records = []

    print("Starting dataset generation from ID 10...")

    # Slice the list [9:] to skip the first 9 items
    for loc in locations[9:]:
        loc_id = loc["id"]
        name = loc["name"]
        bbox = loc["bbox"]
        
        print(f"\nProcessing [{loc_id}/12]: {name}")
        
        try:
            # Fetch Past
            past_array, past_date = fetch_rgb_composite(bbox, past_range)
            if past_array is None:
                print("  -> Skipping: Could not find clear historical image.")
                continue
                
            past_img_name = f"{loc_id}_{name}_before.png"
            past_img_path = os.path.join(output_dir, past_img_name)
            Image.fromarray(past_array).save(past_img_path)

            # Be polite to the API
            time.sleep(2) 

            # Fetch Current
            current_array, current_date = fetch_rgb_composite(bbox, current_range)
            if current_array is None:
                print("  -> Skipping: Could not find clear current image.")
                continue

            current_img_name = f"{loc_id}_{name}_after.png"
            current_img_path = os.path.join(output_dir, current_img_name)
            Image.fromarray(current_array).save(current_img_path)

            # Build the record
            metadata_records.append({
                "id": loc_id,
                "location_name": name,
                "bbox": bbox,
                "before": {
                    "date": past_date,
                    "image_path": f"satellite_images/{past_img_name}"
                },
                "after": {
                    "date": current_date,
                    "image_path": f"satellite_images/{current_img_name}"
                }
            })
            
            print(f"  -> ✅ Successfully saved: {name}")

        except Exception as e:
            print(f"  -> ❌ Error processing {name}: {e}")
            
        time.sleep(3)

    # CREATE THE NEW JSON ONCE AT THE VERY END
    print(f"\nWriting {len(metadata_records)} records to {json_path}...")
    with open(json_path, "w") as f:
        json.dump({"dataset": metadata_records}, f, indent=4)
        
    print("🎉 Done!")

if __name__ == "__main__":
    main()