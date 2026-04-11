from pydantic import BaseModel
from typing import List

class UploadNotification(BaseModel):
    fileKey: str


# # Defines the Map/Vector transformation parameters
# class MapTransform(BaseModel):
#     west: float
#     north: float
#     xsize: float
#     ysize: float

class ConversionRequest(BaseModel):
    # transform: MapTransform
    client_id: str

# The FINAL BOSS payload from Next.js
class FinalInferenceRequest(BaseModel):
    bbox: List[float]           # [min_lon, min_lat, max_lon, max_lat]
    date_range_1: str           # "2024-04-01/2024-04-30"
    date_range_2: str           # "2025-04-01/2025-04-30"
    conversion_request: ConversionRequest