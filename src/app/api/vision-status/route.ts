import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, settings } from "@/db";
import { getProvider, getVisionStatus } from "@/lib/sensenova";

export const dynamic = "force-dynamic";

/** 视觉参考通道可用性（模块级缓存 5 分钟） */
export async function GET() {
    const db = await getDb();
    const rows = await db.select().from(settings).where(eq(settings.id, "model-config"));
    const provider = await getProvider(process.env as Record<string, string | undefined>, rows[0]?.data ?? null);
    const status = await getVisionStatus(provider);
    return NextResponse.json(status);
}
