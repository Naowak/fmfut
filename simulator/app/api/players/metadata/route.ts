import { NextResponse } from "next/server";
import { getPlayerRepository } from "@/lib/data/player-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repository = getPlayerRepository();
    return NextResponse.json({
      ...repository.metadata(),
      runtime_driver: repository.driverName,
    }, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur metadata." },
      { status: 500 },
    );
  }
}
