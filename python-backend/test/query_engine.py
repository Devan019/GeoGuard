def generate_violation_query(rule):
    target = rule.get("target_entity")
    ref = rule.get("reference_entity")
    relation = rule.get("spatial_relation")
    val = rule.get("threshold_value")

    # 1. Proximity Rules (JOIN ON ST_DWithin)
    if relation == "min_distance":
        # Rule: Must be > val. Violation: It is within val.
        return f"""
            SELECT 
                c.id AS change_id, 
                r.id AS reference_id,
                ST_Distance(c.geom, r.geom) AS calculated_value
            FROM 
                detected_changes c
            JOIN 
                {ref} r 
            ON ST_DWithin(c.geom, r.geom, {val})
            WHERE 
                c.id = $1 AND c.entity_type = '{target}'
        """

    elif relation == "max_distance":
        # Rule: Must be < val. Violation: It is NOT within val.
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                NULL AS calculated_value
            FROM 
                detected_changes c
            WHERE 
                c.id = $1 AND c.entity_type = '{target}'
            AND NOT EXISTS (
                SELECT 1 FROM {ref} r WHERE ST_DWithin(c.geom, r.geom, {val})
            )
        """

    # 2. Topological Rules (JOIN ON ST_Intersects)
    elif relation in ["intersects", "disjoint"]:
        # Rule disjoint: Must not touch. Violation: It touches.
        # Rule intersects (as a restriction): No building in waterbody. Violation: It touches.
        return f"""
            SELECT 
                c.id AS change_id, 
                r.id AS reference_id,
                NULL AS calculated_value
            FROM 
                detected_changes c
            JOIN 
                {ref} r 
            ON ST_Intersects(c.geom, r.geom)
            WHERE 
                c.id = $1 AND c.entity_type = '{target}'
        """

    elif relation == "within":
        # Rule: Target must be entirely inside Ref. Violation: It is NOT inside.
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                NULL AS calculated_value
            FROM 
                detected_changes c
            WHERE 
                c.id = $1 AND c.entity_type = '{target}'
            AND NOT EXISTS (
                SELECT 1 FROM {ref} r WHERE ST_Within(c.geom, r.geom)
            )
        """

    # 3. Area Rules
    elif relation == "min_area":
        # Rule: Area must be > val. Violation: Area is < val.
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                ST_Area(c.geom) AS calculated_value
            FROM 
                detected_changes c
            WHERE 
                c.id = $1 AND c.entity_type = '{target}'
            AND ST_Area(c.geom) < {val}
        """

    elif relation == "max_area":
        # Rule: Area must be < val. Violation: Area is > val.
        return f"""
            SELECT 
                c.id AS change_id, 
                NULL AS reference_id,
                ST_Area(c.geom) AS calculated_value
            FROM 
                detected_changes c
            WHERE 
                c.id = $1 AND c.entity_type = '{target}'
            AND ST_Area(c.geom) > {val}
        """

    else:
        raise ValueError(f"Unknown spatial relation: {relation}")