import os
import numpy as np
from PIL import Image
import pystac_client
import planetary_computer
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from datetime import datetime
from dateutil.relativedelta import relativedelta

def fetch_rgb_composite(bbox: list, time_range: str):
    """
    Queries Microsoft Planetary Computer for the least cloudy Sentinel-2 
    image in the given time range and extracts the RGB bands.
    """
    print(f"Searching catalog for time range: {time_range}...")
    
    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )

    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=time_range,
        query={"eo:cloud_cover": {"lt": 5}}, 
        sortby=[{"field": "eo:cloud_cover", "direction": "asc"}] 
    )
    
    items = list(search.items())
    if not items:
        raise ValueError(f"No clear images found for {time_range}")
        
    item = items[0]
    date_captured = item.datetime.strftime('%Y-%m-%d')
    print(f"Found clear image captured on: {date_captured}")
    
    print("Downloading and cropping B04, B03, B02...")
    
    # Read RGB bands. We open the first band to get the CRS, transform the bbox, then read.
    with rasterio.open(item.assets["B04"].href) as src: # Red
        # CRITICAL FIX: Transform EPSG:4326 (Lat/Lon) to the Image's Native CRS (UTM)
        proj_bbox = transform_bounds("EPSG:4326", src.crs, *bbox)
        win = from_bounds(*proj_bbox, transform=src.transform)
        r = src.read(1, window=win)
        
    with rasterio.open(item.assets["B03"].href) as src: # Green
        g = src.read(1, window=win)
        
    with rasterio.open(item.assets["B02"].href) as src: # Blue
        b = src.read(1, window=win)

    # Check if the cropped array is valid
    if r.size == 0 or g.size == 0 or b.size == 0:
        raise ValueError("The transformed bounding box resulted in an empty image array. The bbox might be outside the image footprint.")

    # Stack into a single array (Height, Width, Channels)
    rgb = np.dstack((r, g, b))
    
    # Normalize to 8-bit (0-255)
    rgb = np.clip(rgb / 3000.0 * 255.0, 0, 255).astype(np.uint8)
    
    return rgb, date_captured

def main():
    # Gandhinagar region
    bbox = [72.800, 18.965, 72.825, 18.990]
    
    now = datetime.now()
    six_years_ago = now - relativedelta(years=6)
    
    current_range = f"{(now - relativedelta(months=3)).strftime('%Y-%m-%d')}/{now.strftime('%Y-%m-%d')}"
    past_range = f"{(six_years_ago - relativedelta(months=3)).strftime('%Y-%m-%d')}/{six_years_ago.strftime('%Y-%m-%d')}"

    output_dir = "satellite_tests"
    os.makedirs(output_dir, exist_ok=True)

    try:
        print("\n--- Fetching Historical Image ---")
        past_array, past_date = fetch_rgb_composite(bbox, past_range)
        past_img = Image.fromarray(past_array)
        past_path = os.path.join(output_dir, f"before_{past_date}.png")
        past_img.save(past_path)
        print(f"Saved: {past_path}")

        print("\n--- Fetching Current Image ---")
        current_array, current_date = fetch_rgb_composite(bbox, current_range)
        current_img = Image.fromarray(current_array)
        current_path = os.path.join(output_dir, f"after_{current_date}.png")
        current_img.save(current_path)
        print(f"Saved: {current_path}")

        print("\nSuccess! Check the 'satellite_tests' folder.")

    except Exception as e:
        print(f"\nScript failed: {e}")

if __name__ == "__main__":
    main()