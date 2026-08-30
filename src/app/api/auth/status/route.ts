import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/status → { authed: boolean } */
export async function GET(req: NextRequest) {
    const { env } = await getCloudflareContext();
    return NextResponse.json({ authed: isAuthed(req, env as Record<string, string | undefined>) });
}
