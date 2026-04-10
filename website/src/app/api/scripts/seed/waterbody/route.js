import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import * as fs from 'fs';
import * as path from 'path';

export async function POST(req, res) {
  try {


    console.log('🌍 Starting Real-World Data Seeding...');

    // 1. Clear existing data
    await prisma.$executeRaw`TRUNCATE TABLE water_bodies  RESTART IDENTITY CASCADE;`;
    console.log('🗑️  Cleared old data.');

    // 2. Load the GeoJSON file from your file system
    const filePath = path.join(
      process.cwd(),
      "src",
      "data",
      "waterbody-ahm.geojson"
    );
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const geojson = JSON.parse(fileData);

    console.log(`📂 Found ${geojson.features.length} features in the GeoJSON.`);

    // 3. Loop through and insert
    let successCount = 0;

    for (const feature of geojson.features) {
      // We only want polygons/multipolygons, not points (like a water fountain)
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {

        const geomString = JSON.stringify(feature.geometry);
        // Optional: Grab the name if OSM provides it, otherwise call it 'Unnamed Water Body'
        const name = feature.properties?.name || 'Unnamed Water Body';

        try {
          await prisma.$executeRaw`
          INSERT INTO water_bodies  (name, geom) 
          VALUES (
            ${name}, 
            -- ST_Transform converts the Lat/Lon (4326) into Meters (3857)!
            ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomString}), 4326), 3857)
          );
        `;
          successCount++;
        } catch (error) {
          console.error(`❌ Failed to insert polygon: ${name}`, error);
        }
      }
    }

    console.log(`✅ Successfully seeded ${successCount} real water bodies into PostGIS!`);




    return NextResponse.json({ message: "Database seeded successfully." })
  } catch (error) {
    console.error('Error seeding database:', error)
    return NextResponse.json({ error: "Error seeding database: " + error.message }, { status: 500 })
  }
}