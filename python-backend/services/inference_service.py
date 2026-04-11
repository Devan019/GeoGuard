import pystac_client
import planetary_computer
import rasterio
from rasterio.windows import from_bounds

def fetch_cropped_bands(bbox, date_range):
    """Fetches ONLY the requested bounding box from Microsoft's cloud to save memory."""
    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )

    # Search Sentinel-2 L2A for images with < 10% cloud cover
    search = catalog.search(
        collections=["sentinel-2-l2a"], 
        bbox=bbox, 
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": 10}} 
    )
    
    items = list(search.items())
    if not items:
        return None
        
    item = items[0] # Get the most recent clear image

    # Use rasterio windows to download ONLY the bounding box
    bands = {}
    with rasterio.open(item.assets["B03"].href) as src: # Green
        window = from_bounds(*bbox, transform=src.transform)
        bands['green'] = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(item.assets["B04"].href) as src: # Red
        bands['red'] = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(item.assets["B08"].href) as src: # NIR
        bands['nir'] = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(item.assets["B11"].href) as src: # SWIR
        bands['swir'] = src.read(1, window=window).astype(np.float32)

    return bands