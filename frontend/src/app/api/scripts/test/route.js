import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    // Spatial Query: Find all buildings within 500m of a water body
    const violations = await prisma.$queryRaw`
      SELECT 
          c.id AS change_id, 
          w.name AS water_name,
          ST_Distance(c.geom, w.geom) AS distance
      FROM 
          detected_changes c
      JOIN 
          water_bodies w 
      ON ST_DWithin(c.geom, w.geom, 500)
    `;

    return NextResponse.json({
      success: true,
      violationsFound: violations.length,
      data: violations
    });

  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json({ error: "Failed to run spatial query" }, { status: 500 });
  }
}