import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loginResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/login { password } → 校验口令，颁发 HttpOnly 会话 Cookie */
export async function POST(req: NextRequest) {
    const { env } = await getCloudflareContext();
    const body: any = await req.json().catch(() => ({}));
    return loginResponse(env as unknown as Record<string, string | undefined>, String(body.password || ""));
}
