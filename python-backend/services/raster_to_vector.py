import json
import numpy as np
import traceback
from rasterio.features import shapes
from rasterio.transform import from_origin
from services.query_engine_service import generate_violation_query
import logging

async def vectorize(request, db, detected_type):
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
        cur.execute("SELECT rules FROM compliance_rules WHERE rules IS NOT NULL")
        rules_records = cur.fetchall()

        all_rules = []
        for record in rules_records:
            rules_data = record[0]
            if isinstance(rules_data, str):
                all_rules.extend(json.loads(rules_data).get('rules', []))
            else:
                all_rules.extend(rules_data.get('rules', []))

        # Filter rules once outside the polygon loop to save CPU
        applicable_rules = [r for r in all_rules if r.get('target_entity') == detected_type]

        for geom, value in results:
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
                cur.execute(sql_query, (change_id,))
                
                # Fetch results
                violation_results = cur.fetchall()

                if violation_results:
                    # If using standard cursor, row is a tuple. 
                    # If using RealDictCursor, row is a dict.
                    processed_metrics = []
                    for v in violation_results:
                        if hasattr(v, 'items'): # It's a dict
                            processed_metrics.append(dict(v))
                        else: # It's a tuple, we just store it as is or map it
                            processed_metrics.append({"data": list(v)})

                    found_violations.append({
                        "rule_broken": rule,
                        "metrics": processed_metrics
                    })

            # 4. Add to Collection
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

        db.commit()
        cur.close()
        return feature_collection

    except Exception as e:
        if 'db' in locals() and db:
            db.rollback()
        logging.error(f"Vectorization Error: {str(e)}")
        traceback.print_exc()
        raise e