import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getPlayerRepository } from "@/lib/data/player-repository";
import { playerSearchSchema } from "@/lib/data/player-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const searchParams = Object.fromEntries(new URL(request.url).searchParams);
    const filters = playerSearchSchema.parse(searchParams);
    return NextResponse.json(getPlayerRepository().search(filters), {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Filtres joueurs invalides.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    console.error(error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Erreur inconnue pendant la recherche joueurs.",
      },
      { status: 500 },
    );
  }
}
