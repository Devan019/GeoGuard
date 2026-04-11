import json
import time # Added for precise timing
import numpy as np
import traceback
from rasterio.features import shapes
from rasterio.transform import from_origin
from services.query_engine_service import generate_violation_query
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
        
        # Log rule fetch time
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

        for poly_index, (geom, value) in enumerate(results):
            poly_start = time.perf_counter()
            geom_json_str = json.dumps(geom)

            # Insert detected change
            insert_query = """
                INSERT INTO detected_changes (type, geom) 
                VALUES (%s, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), 3857)) 
                RETURNING id;
            """
            cur.execute(insert_query, (detected_type, geom_json_str))
            change_id = cur.fetchone()[0]

            found_violations = []

            # Loop through rules for THIS specific polygon
            for rule in applicable_rules:
                rule_start = time.perf_counter()
                
                # 1. Validation
                if rule.get("spatial_relation") in ["min_distance", "max_distance", "min_area", "max_area"]:
                    if rule.get("threshold_value") is None:
                        logging.warning(f"Skipping broken rule: {rule.get('id')} - Missing threshold_value")
                        continue

                # 2. Table Mapping
                table_map = {
                    "waterbody": "water_bodies",
                    "vegetation": "vegetation",
                    "industrial": "city_zones",
                    "residential": "city_zones"
                }

                mapped_rule = rule.copy()
                mapped_rule["reference_entity"] = table_map.get(
                    rule["reference_entity"], rule["reference_entity"])

                # 3. Generate and Execute SQL
                sql_query = generate_violation_query(mapped_rule)
                
                # Time the actual database execution
                db_exec_start = time.perf_counter()
                cur.execute(sql_query, (change_id,))
                violation_results = cur.fetchall()
                db_exec_end = time.perf_counter()

                if violation_results:
                    processed_metrics = []
                    for v in violation_results:
                        if hasattr(v, 'items'): 
                            processed_metrics.append(dict(v))
                        else: 
                            processed_metrics.append({"data": list(v)})

                    found_violations.append({
                        "rule_broken": rule,
                        "metrics": processed_metrics
                    })
                
                rule_end = time.perf_counter()
                rule_id = rule.get('id', 'UNKNOWN_RULE')
                # Log the time taken for this specific rule
                logging.info(f"  -> 📐 Rule '{rule_id}' took {(rule_end - rule_start) * 1000:.2f} ms (DB: {(db_exec_end - db_exec_start) * 1000:.2f} ms)")

            feature_collection["features"].append({
                "type": "Feature",
                "properties": {
                    "change_id": change_id,
                    "detected_type": detected_type,
                    "violations": found_violations,
                    "is_compliant": len(found_violations) == 0
                },
                "geometry": geom
            })
            
            poly_end = time.perf_counter()
            logging.info(f"✅ Polygon {poly_index + 1}/{len(results)} fully processed in {(poly_end - poly_start):.2f} seconds.")

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