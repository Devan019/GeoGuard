import PrismaClient from '@/lib/prisma'
import { NextResponse } from 'next/server';


export async function GET() {
  try {
    const ruleRecord = await PrismaClient.compliance_rules.findFirst({
      orderBy: {
        created_at: 'asc',
      },
      select: {
        rules: true,
      },
    });

    if (!ruleRecord) {
      return NextResponse.json(
        { message: "No compliance rules found." },
        { status: 404 }
      );
    }

    return NextResponse.json(ruleRecord.rules, { status: 200 });

  } catch (error) {
    console.error("Error fetching compliance rules:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}