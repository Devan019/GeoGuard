
import numpy as np
from rasterio.features import shapes
from rasterio.transform import from_origin


async def vectorize(request, manager):
    mask_array = np.array(request.raster_mask, dtype='uint8')

    transform = from_origin(
        west=request.transform.west,
        north=request.transform.north,
        xsize=request.transform.xsize,
        ysize=request.transform.ysize
    )

    # We only want to draw shapes where the mask equals 1 (change detected)
    results = shapes(mask_array, mask=(mask_array == 1), transform=transform)

    # Build the GeoJSON FeatureCollection
    feature_collection = {
        "type": "FeatureCollection",
        "features": []
    }

    for index, (geom, value) in enumerate(results):
        feature = {
            "type": "Feature",
            "properties": {
                "change_id": index + 1,
                "detected_type": "new_construction"  # You can make this dynamic later
            },
            "geometry": geom
        }
        feature_collection["features"].append(feature)

    # Return the pure GeoJSON dictionary (FastAPI automatically turns this into JSON)

    # 3. PUSH TO NEXT.JS VIA WEBSOCKET!
    await manager.send_personal_message({
        "event": "NEW_DETECTION",
        "data": feature_collection
    }, request.client_id)

    return feature_collection
