import os
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
import json
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def _to_builtin(value):
    """Convert numpy/pydantic-like values to JSON/DB-safe native Python objects."""
    if isinstance(value, dict):
        return {k: _to_builtin(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_builtin(v) for v in value]
    if isinstance(value, tuple):
        return [_to_builtin(v) for v in value]

    # Handles numpy scalar values (np.float64, np.int64, etc.)
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    # Handles numpy arrays and other objects exposing tolist()
    if hasattr(value, "tolist"):
        try:
            return value.tolist()
        except Exception:
            pass

    return value


def get_db():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS compliance_rules (
            id SERIAL PRIMARY KEY,
            source_file TEXT,
            rules JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS processed_files (
            id SERIAL PRIMARY KEY,
            file_key TEXT UNIQUE,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    conn.commit()
    cur.close()
    conn.close()


def is_file_processed(file_key: str) -> bool:
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM processed_files WHERE file_key=%s", (file_key,))
    exists = cur.fetchone() is not None

    cur.close()
    conn.close()

    return exists


def mark_file_processed(file_key: str):
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO processed_files (file_key) VALUES (%s) ON CONFLICT DO NOTHING",
        (file_key,)
    )

    conn.commit()
    cur.close()
    conn.close()


def insert_rules(file_key: str, rules: list):
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO compliance_rules (source_file, rules)
        VALUES (%s, %s)
        RETURNING id;
        """,
        (file_key, json.dumps({"rules": rules}))
    )

    inserted_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return inserted_id


def save_detection_details(dominant_change: dict, ai_results: dict, payload: dict) -> int:
    """
    Persist one detection run into detect_details and related rows into rule_violations.
    Returns the inserted detect_details.id.
    """
    conn = get_db()
    cur = conn.cursor()

    try:
        dominant_change = _to_builtin(dominant_change)
        ai_results = _to_builtin(ai_results)
        payload = _to_builtin(payload)

        dominant_result = dominant_change.get(
            "result") if isinstance(dominant_change, dict) else None
        dominant_trend = dominant_change.get(
            "trend") if isinstance(dominant_change, dict) else None
        dominant_area_percentage = dominant_change.get(
            "area_percentage") if isinstance(dominant_change, dict) else None
        dominant_image_metadata = dominant_change.get(
            "image_metadata") if isinstance(dominant_change, dict) else None

        ai_bucket = ai_results.get("bucket") if isinstance(
            ai_results, dict) else None
        ai_image_keys = ai_results.get(
            "image_keys") if isinstance(ai_results, dict) else None
        ai_max_confidence = ai_results.get(
            "max_confidence") if isinstance(ai_results, dict) else None

        cur.execute(
            """
            INSERT INTO detect_details (
                dominant_result,
                dominant_trend,
                dominant_area_percentage,
                dominant_image_metadata,
                ai_bucket,
                ai_image_keys,
                ai_max_confidence,
                dominant_change,
                ai_results,
                payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                dominant_result,
                dominant_trend,
                dominant_area_percentage,
                Json(
                    dominant_image_metadata) if dominant_image_metadata is not None else None,
                ai_bucket,
                Json(ai_image_keys) if ai_image_keys is not None else None,
                ai_max_confidence,
                Json(dominant_change) if dominant_change is not None else None,
                Json(ai_results) if ai_results is not None else None,
                Json(payload) if payload is not None else None,
            ),
        )

        detect_details_id = cur.fetchone()[0]

        feature_collection = payload.get(
            "feature_collection", {}) if isinstance(payload, dict) else {}
        features = feature_collection.get("features", []) if isinstance(
            feature_collection, dict) else []

        for feature in features:
            properties = feature.get("properties", {}) if isinstance(
                feature, dict) else {}
            feature_geometry = feature.get(
                "geometry") if isinstance(feature, dict) else None

            change_id = properties.get("change_id")
            if change_id is None:
                continue

            detected_type = properties.get(
                "detected_type") or dominant_result or "unknown"
            is_compliant = bool(properties.get("is_compliant", False))
            violations = properties.get("violations") or []

            if violations:
                for violation in violations:
                    cur.execute(
                        """
                        INSERT INTO rule_violations (
                            detect_details_id,
                            change_id,
                            detected_type,
                            is_compliant,
                            rule_broken,
                            metrics,
                            feature_geometry
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s);
                        """,
                        (
                            detect_details_id,
                            int(change_id),
                            detected_type,
                            is_compliant,
                            Json(violation.get("rule_broken", {})),
                            Json(violation.get("metrics", {})),
                            Json(
                                feature_geometry) if feature_geometry is not None else None,
                        ),
                    )
            else:
                cur.execute(
                    """
                    INSERT INTO rule_violations (
                        detect_details_id,
                        change_id,
                        detected_type,
                        is_compliant,
                        rule_broken,
                        metrics,
                        feature_geometry
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        detect_details_id,
                        int(change_id),
                        detected_type,
                        True,
                        Json({}),
                        Json({}),
                        Json(
                            feature_geometry) if feature_geometry is not None else None,
                    ),
                )

        conn.commit()
        return detect_details_id

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
