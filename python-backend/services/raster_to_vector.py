import json
import time # Added for precise timing
import numpy as np
import traceback
from rasterio.features import shapes
from rasterio.transform import from_origin
from services.query_engine_service import generate_violation_query
from psycopg2.extras import execute_values
import logging

async def vectorize(request, db, detected_type):
    overall_start = time.perf_counter()
    try:
        mask_array = np.array(request["raster_mask"], dtype='uint8')
        transform = from_origin(
            west=request["transform"]["west"],
            north=request["transform"]["north"],
            xsize=request["transform"]["xsize"],
            ysize=request["transform"]["ysize"]
        )

        results = list(shapes(mask_array, mask=(mask_array == 1), transform=transform))
        feature_collection = {"type": "FeatureCollection", "features": []}

        if not results:
            return feature_collection

        cur = db.cursor()
        
        # --- Fetch Rules ---
        rule_fetch_start = time.perf_counter()
        cur.execute("SELECT rules FROM compliance_rules WHERE rules IS NOT NULL")
        rules_records = cur.fetchall()
        logging.info(f"⏱️ DB: Fetched rules in {(time.perf_counter() - rule_fetch_start) * 1000:.2f} ms")

        all_rules = []
        for record in rules_records:
            rules_data = record[0]
            if isinstance(rules_data, str):
                all_rules.extend(json.loads(rules_data).get('rules', []))
            else:
                all_rules.extend(rules_data.get('rules', []))

        applicable_rules = [r for r in all_rules if r.get('target_entity') == detected_type]
        logging.info(f"🔍 Found {len(results)} polygons and {len(applicable_rules)} applicable rules.")

        # --- STEP 1: BULK INSERT ---
        inserted_features = {} 
        new_ids = []

        insert_data = [(detected_type, json.dumps(geom)) for geom, value in results]

        insert_query = """
            INSERT INTO detected_changes (type, geom) 
            VALUES %s 
            RETURNING id;
        """

        template = "(%s, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), 3857))"
        returned_ids = execute_values(cur, insert_query, insert_data, template=template, fetch=True)
        
        for idx, (geom, value) in enumerate(results):
            change_id = returned_ids[idx][0]
            new_ids.append(change_id)
            
            inserted_features[change_id] = {
                "type": "Feature",
                "properties": {
                    "change_id": change_id,
                    "detected_type": detected_type,
                    "violations": [],
                    "is_compliant": True 
                },
                "geometry": geom
            }

        # --- STEP 2: BULK RULE CHECKING ---
        for rule in applicable_rules:
            rule_start = time.perf_counter()
            
            if rule.get("spatial_relation") in ["min_distance", "max_distance", "min_area", "max_area"]:
                if rule.get("threshold_value") is None:
                    logging.warning(f"Skipping broken rule: Missing threshold_value")
                    continue

            table_map = {
                "waterbody": "water_bodies",
                "vegetation": "vegetation",
                "industrial": "city_zones",
                "residential": "city_zones"
            }

            mapped_rule = rule.copy()
            mapped_rule["reference_entity"] = table_map.get(
                rule["reference_entity"], rule["reference_entity"])

            sql_query = generate_violation_query(mapped_rule)
            
            db_exec_start = time.perf_counter()
            cur.execute(sql_query, (new_ids,))
            violation_results = cur.fetchall()
            db_exec_end = time.perf_counter()

            # --- STEP 3: MAP VIOLATIONS BACK ---
            if violation_results:
                for v in violation_results:
                    violating_id = v[0] if isinstance(v, tuple) else v['change_id']
                    metrics = dict(v) if hasattr(v, 'items') else {"data": list(v)}
                    
                    inserted_features[violating_id]["properties"]["violations"].append({
                        "rule_broken": rule,
                        "metrics": [metrics]
                    })
                    inserted_features[violating_id]["properties"]["is_compliant"] = False

            rule_id = rule.get('id', 'UNKNOWN_RULE')
            logging.info(f"  -> 📐 Rule '{rule_id}' checked {len(new_ids)} polygons in {(db_exec_end - db_exec_start) * 1000:.2f} ms")

        # Compile final array
        feature_collection["features"] = list(inserted_features.values())

        db.commit()
        cur.close()
        
        logging.info(f"🚀 Vectorize job fully completed in {(time.perf_counter() - overall_start):.2f} seconds.")
        return feature_collection

    except Exception as e:
        if 'db' in locals() and db:
            db.rollback()
        logging.error(f"Vectorization Error: {str(e)}")
        traceback.print_exc()
        raise e