import json
import time # Added for precise timing
import numpy as np
import traceback
from rasterio.features import shapes
from rasterio.transform import from_origin
from services.query_engine_service import generate_violation_query
from psycopg2.extras import execute_values
import logging

async def vectorize(request, db, t2_bands):
    overall_start = time.perf_counter()
    try:
        mask_array = np.array(request["raster_mask"], dtype='uint8')
        transform = from_origin(
            west=request["transform"]["west"],
            north=request["transform"]["north"],
            xsize=request["transform"]["xsize"],
            ysize=request["transform"]["ysize"]
        )

        # Allow any class > 0 to be processed
        results = list(shapes(mask_array, mask=(mask_array > 0), transform=transform))
        feature_collection = {"type": "FeatureCollection", "features": []}

        if not results:
            return feature_collection

        cur = db.cursor()
        
        # --- Fetch All Rules Once ---
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

        # --- STEP 1: PREPARE DATA FOR BULK INSERT ---
        insert_data = []
        geometries = []
        poly_types = []

        # Calculate types in pure Python first (Very Fast)
        for geom, value in results:
            exterior_ring = geom["coordinates"][0]
            center_x = sum(pt[0] for pt in exterior_ring) / len(exterior_ring)
            center_y = sum(pt[1] for pt in exterior_ring) / len(exterior_ring)

            col, row = ~transform * (center_x, center_y)
            col, row = int(col), int(row)
            
            max_row, max_col = t2_bands['nir'].shape
            row = max(0, min(row, max_row - 1))
            col = max(0, min(col, max_col - 1))

            nir = float(t2_bands['nir'][row, col])
            red = float(t2_bands['red'][row, col])
            green = float(t2_bands['green'][row, col])
            swir = float(t2_bands['swir'][row, col])

            ndvi = (nir - red) / (nir + red + 1e-8)
            ndwi = (green - nir) / (green + nir + 1e-8)
            
            if ndwi > 0.1:
                poly_type = "waterbody"
            elif ndvi > 0.25:
                poly_type = "vegetation"
            elif swir > nir:
                poly_type = "industrial"
            else:
                poly_type = "residential"

            # Store data to batch insert it
            insert_data.append((poly_type, json.dumps(geom)))
            geometries.append(geom)
            poly_types.append(poly_type)

        # --- STEP 2: ACTUAL BULK INSERT ---
        insert_query = """
            INSERT INTO detected_changes (type, geom) 
            VALUES %s 
            RETURNING id;
        """
        template = "(%s, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), 3857))"
        
        # Inserts all polygons in ONE database trip
        returned_ids = execute_values(cur, insert_query, insert_data, template=template, fetch=True)

        inserted_features = {}
        polygons_by_type = {"waterbody": [], "vegetation": [], "industrial": [], "residential": []}

        # Map the new DB IDs back to their respective types
        for idx, row in enumerate(returned_ids):
            change_id = row[0]
            geom = geometries[idx]
            p_type = poly_types[idx]

            polygons_by_type[p_type].append(change_id)
            
            inserted_features[change_id] = {
                "type": "Feature",
                "properties": {
                    "change_id": change_id,
                    "detected_type": p_type,
                    "violations": [],
                    "is_compliant": True 
                },
                "geometry": geom
            }

        # --- STEP 3: BULK RULE CHECKING (Grouped By Type) ---
        for current_type, group_ids in polygons_by_type.items():
            if not group_ids:
                continue

            # Get rules ONLY for the current polygon type
            applicable_rules = [r for r in all_rules if r.get('target_entity') == current_type]
            
            if not applicable_rules:
                continue

            for rule in applicable_rules:
                db_exec_start = time.perf_counter()
                
                if rule.get("spatial_relation") in ["min_distance", "max_distance", "min_area", "max_area"]:
                    if rule.get("threshold_value") is None:
                        continue

                table_map = {
                    "waterbody": "water_bodies",
                    "vegetation": "vegetation",
                    "industrial": "city_zones",
                    "residential": "city_zones"
                }
                
                ref_entity = rule["reference_entity"]
                if ref_entity not in table_map:
                    logging.warning(f"Skipping rule: Unknown reference table '{ref_entity}'")
                    continue

                mapped_rule = rule.copy()
                mapped_rule["reference_entity"] = table_map.get(
                    rule["reference_entity"], rule["reference_entity"])

                sql_query = generate_violation_query(mapped_rule)
                
                cur.execute(sql_query, (group_ids,))
                violation_results = cur.fetchall()
                db_exec_end = time.perf_counter()

                if violation_results:
                    for v in violation_results:
                        violating_id = v[0] if isinstance(v, tuple) else v['change_id']
                        metrics = dict(v) if hasattr(v, 'items') else {"data": list(v)}
                        
                        props = inserted_features[violating_id]["properties"]
                        
                        existing_violation = next((vi for vi in props["violations"] if vi["rule_broken"].get('id') == rule.get('id')), None)
                        
                        if existing_violation:
                            existing_violation["metrics"].append(metrics)
                        else:
                            props["violations"].append({
                                "rule_broken": rule,
                                "metrics": [metrics]
                            })
                            props["is_compliant"] = False

                rule_id = rule.get('id', 'UNKNOWN_RULE')
                logging.info(f"  -> 📐 Rule '{rule_id}' checked {len(group_ids)} '{current_type}' polygons in {(db_exec_end - db_exec_start) * 1000:.2f} ms")

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