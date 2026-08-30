import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, settings } from "@/db";

export const dynamic = "force-dynamic";

const DEFAULT_CONFIG = {
    provider: {
        sensenova: {
            baseUrl: "https://token.sensenova.cn/v1",
            apiKey: "",
            textModel: "sensenova-6.8-flash-lite",
            imageModel: "sensenova-u1-fast",
            visionModel: "sensenova-6.8-flash-lite",
        },
    },
    models: {
        text: ["sensenova-6.8-flash-lite", "sensenova-6.7-flash-lite", "glm-5.2", "deepseek-v4-flash"],
        image: ["sensenova-u1-fast", "sensenova-u1.5-lite"],
        video: ["织影视频 V3（模拟）", "织影视频 V2 Turbo（模拟）"],
        audio: ["Mureka V9（模拟）", "Suno V4（模拟）"],
    },
};

/** settings 缺失时用环境变量合成默认 provider（.dev.vars / wrangler secret） */
async function ensureConfig(): Promise<{ data: unknown; env: Record<string, string | undefined> }> {
    const { env } = await getCloudflareContext();
    const e = env as unknown as Record<string, string | undefined>;
    const db = await getDb();
    const rows = await db.select().from(settings).where(eq(settings.id, "model-config"));
    if (rows.length) return { data: JSON.parse(rows[0].data), env: e };
    const seeded = structuredClone(DEFAULT_CONFIG);
    const p = (seeded.provider.sensenova as Record<string, string | undefined>) ?? {};
    p.apiKey = e.SENSENOVA_API_KEY || "";
    p.baseUrl = e.SENSENOVA_BASE_URL || p.baseUrl || "";
    p.textModel = e.SENSENOVA_TEXT_MODEL || p.textModel || "";
    p.imageModel = e.SENSENOVA_IMAGE_MODEL || p.imageModel || "";
    p.visionModel = e.SENSENOVA_VISION_MODEL || p.visionModel || "";
    const data = seeded;
    await db.insert(settings).values({ id: "model-config", data: JSON.stringify(data), updatedAt: Date.now() });
    return { data, env: e };
}

export async function GET() {
    const { data } = await ensureConfig();
    return NextResponse.json(data);
}

export async function PUT(req: Request) {
    const body: any = await req.json().catch(() => null);
    if (!body || !body.models) return NextResponse.json({ error: "invalid config" }, { status: 400 });
    const db = await getDb();
    const values = { data: JSON.stringify(body), updatedAt: Date.now() };
    const rows = await db.select().from(settings).where(eq(settings.id, "model-config"));
    if (rows.length) await db.update(settings).set(values).where(eq(settings.id, "model-config"));
    else await db.insert(settings).values({ id: "model-config", ...values });
    return NextResponse.json({ ok: true });
}
