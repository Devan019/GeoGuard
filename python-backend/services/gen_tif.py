import pystac_client
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
import numpy as np

import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
import pystac_client
import numpy as np
from concurrent.futures import ThreadPoolExecutor

def fetch_cropped_bands_multithreaded(bbox, date_range):
    """
    Optimized: Uses Element84's AWS STAC API with ThreadPoolExecutor 
    and Cloud-Optimized GDAL environment variables.
    """
    catalog = pystac_client.Client.open("https://earth-search.aws.element84.com/v1")

    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": 10}},
        sortby=[{"field": "properties.datetime", "direction": "desc"}],
        limit=10
    )

    items = list(search.items())
    if not items:
        return None
        
    item = items[0]
    
    # These GDAL environment variables drastically speed up cloud reads
    # by skipping directory listings and caching the HTTP requests.
    cloud_env = rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS="tif",
        VSI_CACHE="TRUE"
    )

    with cloud_env:
        # 1. Open just one band briefly to calculate the window projection
        with rasterio.open(item.assets["red"].href) as src:
            proj_bbox = transform_bounds("EPSG:4326", src.crs, *bbox)
            window = from_bounds(*proj_bbox, transform=src.transform)

        # 2. Define the worker function for threads
        def safe_read(key):
            # Element84 STAC asset keys for Sentinel-2
            href = item.assets[key].href
            with rasterio.open(href) as b_src:
                return key, b_src.read(1, window=window, boundless=True).astype(np.float32)

        # 3. Fetch all 4 bands concurrently!
        bands_to_fetch = ["red", "green", "nir", "swir16"]
        bands = {}
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Map the function over the keys
            results = executor.map(safe_read, bands_to_fetch)
            
            for key, data in results:
                # Map 'swir16' back to 'swir' for your downstream logic
                if key == "swir16":
                    bands["swir"] = data
                else:
                    bands[key] = data
                    
    return bands

def fetch_cropped_bands(bbox, date_range):
    """
    Permanent fix: Uses Element84's AWS STAC API.
    More stable and faster than Microsoft Planetary Computer.
    """
    # 1. Use the AWS Earth Search Endpoint
    catalog = pystac_client.Client.open("https://earth-search.aws.element84.com/v1")

    # 2. Search logic (Element84 is very fast at sorting/filtering)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": 10}},
        sortby=[{"field": "properties.datetime", "direction": "desc"}],
        limit=10
    )

    items = list(search.items())
    if not items:
        return None
        
    item = items[0]

    bands = {}
    # Use B04 (Red) to define the window
    # AWS Sentinel-2 uses 'red', 'green', 'nir', 'swir16' as asset keys 
    # instead of B04, B03, etc. in some versions, but standard keys usually work.
    
    with rasterio.open(item.assets["red"].href) as src:
        proj_bbox = transform_bounds("EPSG:4326", src.crs, *bbox)
        window = from_bounds(*proj_bbox, transform=src.transform)
        
        def safe_read(key):
            # AWS paths are public but often require 'GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR'
            # for maximum speed.
            with rasterio.open(item.assets[key].href) as b_src:
                return b_src.read(1, window=window, boundless=True).astype(np.float32)

        bands['red'] = safe_read("red")      # B04
        bands['green'] = safe_read("green")  # B03
        bands['nir'] = safe_read("nir")      # B08
        bands['swir'] = safe_read("swir16")  # B11
        
    return bands