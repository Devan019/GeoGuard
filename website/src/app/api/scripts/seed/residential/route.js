import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import * as fs from 'fs';
import * as path from 'path';

export async function POST(req, res) {
  try {


    console.log('🌍 Starting Real-World Data Seeding...');

    // 1. Clear existing data
    await prisma.$executeRaw`TRUNCATE TABLE city_zones RESTART IDENTITY CASCADE;`;
    console.log('🗑️  Cleared old data.');

    // 2. Load the GeoJSON file from your file system
    const filePath = path.join(
      process.cwd(),
      "src",
      "data",
      "residential-ahm.geojson"
    )
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const geojson = JSON.parse(fileData);

    console.log(`📂 Found ${geojson.features.length} features in the GeoJSON.`);

    // 3. Loop through and insert
    let successCount = 0;
    let cnt = 0;

    for (const feature of geojson.features) {
      cnt++;
      // We only want polygons/multipolygons, not points (like a water fountain)
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {

        const geomString = JSON.stringify(feature.geometry);
        // Optional: Grab the name if OSM provides it, otherwise call it 'Unnamed Residential Zone'
        const name = feature.properties?.name || 'Unnamed Residential Zone';

        try {
          await prisma.$executeRaw`
          INSERT INTO city_zones (name,zone_type, geom) 
          VALUES (
            ${name}, 
            'residential',
            -- ST_Transform converts the Lat/Lon (4326) into Meters (3857)!
            ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomString}), 4326), 3857)
          );
        `;
        console.log(`✅ Inserted polygon: ${name}`, cnt);
          successCount++;
        } catch (error) {
          console.log(`❌ Failed to insert polygon: ${name}`, cnt);
        }
      }
    }

    console.log(`✅ Successfully seeded ${successCount} real residential zones into PostGIS!`);




    return NextResponse.json({ message: "Database seeded successfully." })
  } catch (error) {
    console.error('Error seeding database:', error)
    return NextResponse.json({ error: "Error seeding database: " + error.message }, { status: 500 })
  }
}