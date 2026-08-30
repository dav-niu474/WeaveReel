import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, projects } from "@/db";

export const dynamic = "force-dynamic";

/** 种子项目（首次访问自动写入） */
const SEED = {
    nodes: [
        { id: "n1", type: "text", x: 60, y: 260, status: "done", prompt: "海边黄昏短片文案", story: "黄昏的海边，少女赤脚奔跑在浪花里。夕阳把云层染成暖金色，海风掠过草坡。她回头微笑，裙摆飞扬。" },
        { id: "n2", type: "image", x: 520, y: 220, status: "idle", label: "主画面", prompt: "双击或点击下方输入框，描述这个节点…", vseed: 0 },
    ],
    edges: [{ from: "n1", to: "n2" }],
};

export async function GET() {
    const db = await getDb();
    const rows = await db.select().from(projects).where(eq(projects.id, "default"));
    if (!rows.length) {
        const seed = { ...SEED, view: null as null | { scale: number; panX: number; panY: number } };
        await db.insert(projects).values({ id: "default", data: JSON.stringify({ nodes: seed.nodes, edges: seed.edges }), view: null, updatedAt: Date.now() });
        return NextResponse.json(seed);
    }
    const r = rows[0];
    const d: any = JSON.parse(r.data);
    return NextResponse.json({ nodes: d.nodes ?? [], edges: d.edges ?? [], groups: d.groups ?? [], view: r.view ? JSON.parse(r.view) : null });
}

export async function PUT(req: Request) {
    const body: any = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.nodes)) return NextResponse.json({ error: "invalid project" }, { status: 400 });
    const db = await getDb();
    const values = { data: JSON.stringify({ nodes: body.nodes, edges: body.edges ?? [], groups: body.groups ?? [] }), view: body.view ? JSON.stringify(body.view) : null, updatedAt: Date.now() };
    const rows = await db.select().from(projects).where(eq(projects.id, "default"));
    if (rows.length) await db.update(projects).set(values).where(eq(projects.id, "default"));
    else await db.insert(projects).values({ id: "default", ...values });
    return NextResponse.json({ ok: true });
}
