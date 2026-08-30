import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, works } from "@/db";

export const dynamic = "force-dynamic";

/** GET /api/works?published=1 → 作品库列表（最新在前） */
export async function GET(req: NextRequest) {
    const db = await getDb();
    const publishedOnly = new URL(req.url).searchParams.get("published") === "1";
    const rows = publishedOnly
        ? await db.select().from(works).where(eq(works.published, 1)).orderBy(desc(works.createdAt)).limit(100)
        : await db.select().from(works).orderBy(desc(works.createdAt)).limit(200);
    return NextResponse.json({ works: rows });
}

/** POST /api/works { action: "publish" | "unpublish", ids: [...] } → 发布/取消发布到素材库 */
export async function POST(req: NextRequest) {
    const body: any = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) return NextResponse.json({ error: "ids 为空" }, { status: 400 });
    const db = await getDb();
    await db.update(works)
        .set({ published: body.action === "unpublish" ? 0 : 1 })
        .where(inArray(works.id, ids));
    return NextResponse.json({ ok: true, count: ids.length });
}
