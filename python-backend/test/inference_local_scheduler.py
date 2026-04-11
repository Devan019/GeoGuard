import json
import time
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_API_URL = "http://127.0.0.1:8000/inference_local"
FIXED_DATASET_PATH = (Path(__file__).resolve().parent / "../satelite_images/dataset.json").resolve()
FIXED_INTERVAL_SECONDS = 300
FIXED_TIMEOUT_SECONDS = 180


def load_dataset(dataset_path: Path) -> list[dict]:
    with dataset_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    dataset = payload.get("dataset", [])
    if not isinstance(dataset, list):
        raise ValueError("Invalid dataset.json format: 'dataset' must be a list.")
    return dataset


def resolve_image_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def post_inference(record: dict, api_url: str, timeout_seconds: int) -> None:
    before = record.get("before", {})
    after = record.get("after", {})

    before_path = resolve_image_path(before.get("image_path", ""))
    after_path = resolve_image_path(after.get("image_path", ""))

    if not before_path.exists() or not after_path.exists():
        raise FileNotFoundError(
            f"Missing image(s): before={before_path.exists()} ({before_path}), "
            f"after={after_path.exists()} ({after_path})"
        )

    bbox = record.get("bbox")
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError(f"Invalid bbox in record id={record.get('id')}: {bbox}")

    form_data = {
        "bbox_str": json.dumps(bbox),
        "time1_range": before.get("date", "2020-01-01"),
        "time2_range": after.get("date", "2024-01-01"),
    }

    with before_path.open("rb") as t1, after_path.open("rb") as t2:
        files = {
            "time1_image": (before_path.name, t1, "image/png"),
            "time2_image": (after_path.name, t2, "image/png"),
        }

        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.post(api_url, data=form_data, files=files)

    if response.is_success:
        try:
            body = response.json()
        except Exception:
            body = response.text
        print(f"OK id={record.get('id')} status={response.status_code} body={body}")
        return

    print(
        f"FAIL id={record.get('id')} status={response.status_code} "
        f"response={response.text[:500]}"
    )


def run_scheduler(api_url: str, dataset_path: Path, interval_seconds: int, timeout_seconds: int) -> None:
    dataset = load_dataset(dataset_path)
    print(f"Loaded {len(dataset)} records from {dataset_path}")
    print(f"Posting to: {api_url}")
    print(f"Interval: {interval_seconds} seconds")

    for index, record in enumerate(dataset, start=1):
        location = record.get("location_name", "unknown")
        print(f"\n[{index}/{len(dataset)}] Processing: {location} (id={record.get('id')})")

        try:
            post_inference(record, api_url, timeout_seconds)
        except Exception as exc:
            print(f"ERROR id={record.get('id')}: {exc}")

        if index < len(dataset):
            print(f"Sleeping for {interval_seconds} seconds before next request...")
            time.sleep(interval_seconds)

    print("Completed one full dataset run.")


def main() -> None:
    run_scheduler(
        api_url=DEFAULT_API_URL,
        dataset_path=FIXED_DATASET_PATH,
        interval_seconds=FIXED_INTERVAL_SECONDS,
        timeout_seconds=FIXED_TIMEOUT_SECONDS,
    )


if __name__ == "__main__":
    main()