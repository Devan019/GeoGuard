def generate_violation_query(rule):
    target = rule.get("target_entity")
    ref = rule.get("reference_entity")
    relation = rule.get("spatial_relation")
    val = rule.get("threshold_value")

    # Batched Queries using ANY(%s) instead of looping
    if relation == "min_distance":
        return f"""
            SELECT 
                c.id AS change_id, 
                r.id AS reference_id,
                ST_Distance(c.geom, r.geom) AS calculated_value
            FROM detected_changes c
            JOIN {ref} r ON ST_DWithin(c.geom, r.geom, {val})
            WHERE c.id = ANY(%s) AND c.type = '{target}'
        """
    elif relation == "max_distance":
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                NULL AS calculated_value
            FROM detected_changes c
            WHERE c.id = ANY(%s) AND c.type = '{target}'
            AND NOT EXISTS (
                SELECT 1 FROM {ref} r WHERE ST_DWithin(c.geom, r.geom, {val})
            )
        """
    elif relation in ["intersects", "disjoint"]:
        return f"""
            SELECT 
                c.id AS change_id, 
                r.id AS reference_id,
                NULL AS calculated_value
            FROM detected_changes c
            JOIN {ref} r ON ST_Intersects(c.geom, r.geom)
            WHERE c.id = ANY(%s) AND c.type = '{target}'
        """
    elif relation == "within":
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                NULL AS calculated_value
            FROM detected_changes c
            WHERE c.id = ANY(%s) AND c.type = '{target}'
            AND NOT EXISTS (
                SELECT 1 FROM {ref} r WHERE ST_Within(c.geom, r.geom)
            )
        """
    elif relation == "min_area":
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                ST_Area(c.geom) AS calculated_value
            FROM detected_changes c
            WHERE c.id = ANY(%s) AND c.type = '{target}'
            AND ST_Area(c.geom) < {val}
        """
    elif relation == "max_area":
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                ST_Area(c.geom) AS calculated_value
            FROM detected_changes c
            WHERE c.id = ANY(%s) AND c.type = '{target}'
            AND ST_Area(c.geom) > {val}
        """
    else:
        raise ValueError(f"Unknown spatial relation: {relation}")