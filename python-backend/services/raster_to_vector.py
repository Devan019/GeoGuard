import numpy as np
import json
from rasterio.features import shapes
from rasterio.transform import from_origin
from services.query_engine_service import generate_violation_query

# Note: Ensure you pass your DB connection (e.g., Prisma client 'db') into this function
async def vectorize(request, manager, db):
    mask_array = np.array(request.raster_mask, dtype='uint8')

    transform = from_origin(
        west=request.transform.west,
        north=request.transform.north,
        xsize=request.transform.xsize,
        ysize=request.transform.ysize
    )

    # Extract polygons where the mask is 1
    results = shapes(mask_array, mask=(mask_array == 1), transform=transform)

    feature_collection = {
        "type": "FeatureCollection",
        "features": []
    }

    # Fetch all compliance rules once before the loop to save DB calls
    # Adjust this query based on how your Prisma client fetches raw JSON
    rules_records = await db.query_raw("SELECT rules FROM compliance_rules WHERE rules IS NOT NULL")
    
    all_rules = []
    for record in rules_records:
        if isinstance(record['rules'], str):
            all_rules.extend(json.loads(record['rules']).get('rules', []))
        else:
            all_rules.extend(record['rules'].get('rules', []))

    for index, (geom, value) in enumerate(results):
        # 1. Convert the shape dictionary to a GeoJSON string
        geom_json_str = json.dumps(geom)
        
        # 2. Determine the entity type (In production, this comes from the ML model)
        # It MUST be one of: 'waterbody', 'vegetation', 'industrial', 'residential'
        detected_type = "residential" 

        # 3. Insert into the database applying the 4326 -> 3857 transform
        insert_query = """
            INSERT INTO detected_changes (type, geom) 
            VALUES (
                $1, 
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 3857)
            ) RETURNING id;
        """
        
        # Execute via Prisma Python Client
        change_record = await db.query_raw(insert_query, detected_type, geom_json_str)
        change_id = change_record[0]['id']

        # 4. Run the Compliance Engine for this specific change
        applicable_rules = [r for r in all_rules if r.get('target_entity') == detected_type]
        found_violations = []

        for rule in applicable_rules:
            # Map rule entities to your actual table names / views
            table_map = {
                "waterbody": "water_bodies",
                "vegetation": "vegetation",
                # Assuming you created SQL Views for these based on zone_type:
                "industrial": "city_zones", 
                "residential": "city_zones"
            }
            
            mapped_rule = rule.copy()
            mapped_rule["reference_entity"] = table_map.get(rule["reference_entity"], rule["reference_entity"])
            
            # Generate the SQL
            sql_query = generate_violation_query(mapped_rule)
            
            # Execute the generated query against the specific change_id
            violation_results = await db.query_raw(sql_query, change_id)
            
            if violation_results:
                found_violations.append({
                    "rule_broken": rule,
                    "metrics": [dict(v) for v in violation_results] 
                })

        # 5. Build the enriched GeoJSON feature for the frontend
        feature = {
            "type": "Feature",
            "properties": {
                "change_id": change_id,
                "detected_type": detected_type,
                "violations": found_violations,
                "is_compliant": len(found_violations) == 0
            },
            # Return the original 4326 geom to the frontend so Leaflet/Mapbox can draw it
            "geometry": geom 
        }
        feature_collection["features"].append(feature)

    # 6. Push the complete, compliance-checked data to Next.js
    await manager.send_personal_message({
        "event": "NEW_DETECTION",
        "data": feature_collection
    }, request.client_id)

    return feature_collection