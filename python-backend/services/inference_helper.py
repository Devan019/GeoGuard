import io
import base64
import numpy as np
from PIL import Image
from skimage import exposure
import matplotlib.pyplot as plt
from services.s3_service import upload_pil_to_s3, BUCKET_NAME

#processing image
def preprocess_image(img):
    """
    Expects a PIL Image. Resizes, normalizes, and keeps NHWC layout.
    """
    img = img.convert("RGB").resize((256, 256))

    # 1. Scale to 0-1
    img_array = np.array(img, dtype=np.float32) / 255.0

    # 2. ImageNet Normalization
    # Note: If the heatmap is STILL flat blue after this shape fix,
    # it means the model wasn't trained with ImageNet stats.
    # If so, comment these next three lines out.
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_array = (img_array - mean) / std

    # 3. Add batch dimension -> Shape becomes (1, 256, 256, 3)
    return np.expand_dims(img_array, axis=0)


def pil_to_base64(img: Image.Image) -> str:
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def process_ai_change_detection(t1_bytes: bytes, t2_bytes: bytes, session):
    # 1. Load images into PIL and Numpy
    img1_pil = Image.open(io.BytesIO(t1_bytes)).convert("RGB").resize((256, 256))
    img2_pil = Image.open(io.BytesIO(t2_bytes)).convert("RGB").resize((256, 256))

    arr1 = np.array(img1_pil)
    arr2 = np.array(img2_pil)

    # 2. Radiometric Calibration
    arr2_matched = exposure.match_histograms(arr2, arr1, channel_axis=-1).astype(np.uint8)
    img2_matched_pil = Image.fromarray(arr2_matched)

    # 3. Preprocess
    img1_tensor = preprocess_image(img1_pil)
    img2_tensor = preprocess_image(img2_matched_pil)

    # 4. Dynamically grab input names
    input_name_1 = session.get_inputs()[0].name
    input_name_2 = session.get_inputs()[1].name

    # 5. Run Inference
    inputs = {input_name_1: img1_tensor, input_name_2: img2_tensor}
    outputs = session.run(None, inputs)

    # 6. Extract Probabilities
    prob_map_2d = np.squeeze(outputs[0])
    if np.min(prob_map_2d) < 0.0 or np.max(prob_map_2d) > 1.0:
        prob_map_2d = 1 / (1 + np.exp(-np.clip(prob_map_2d, -10, 10)))

    max_conf = float(np.max(prob_map_2d))
    
    # 7. Generate Matrices
    raster_matrix = (prob_map_2d > 0.5).astype(int)
    binary_mask_visual = (raster_matrix * 255).astype(np.uint8)

    # 8. UPLOAD TO AWS S3
    key_before = upload_pil_to_s3(img1_pil, "before")
    key_after = upload_pil_to_s3(img2_matched_pil, "after")
    key_mask = upload_pil_to_s3(Image.fromarray(binary_mask_visual), "mask")
    
    heatmap_rgba = plt.cm.jet(prob_map_2d) 
    heatmap_uint8 = (heatmap_rgba * 255).astype(np.uint8)
    key_heatmap = upload_pil_to_s3(Image.fromarray(heatmap_uint8, 'RGBA'), "heatmap")
    
    # 9. Return the lightweight dictionary with Bucket and Keys
    return {
        "bucket": BUCKET_NAME,
        "image_keys": {
            "before": key_before,
            "after": key_after,
            "heatmap": key_heatmap,
            "mask": key_mask
        },
        "raster_matrix": raster_matrix.tolist(),
        "max_confidence": max_conf
    }