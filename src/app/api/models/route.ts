import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST /api/models { baseUrl, apiKey } → 拉取网关可用模型列表（OpenAI 兼容 GET /models）
    服务端代理：避免浏览器直连第三方网关的跨域限制 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const baseUrl = String(body.baseUrl || "").replace(/\/+$/, "");
    const apiKey = String(body.apiKey || "");
    if (!baseUrl || !apiKey) {
        return NextResponse.json({ error: "需要 baseUrl 与 apiKey" }, { status: 400 });
    }
    try {
        const r = await fetch(baseUrl + "/models", {
            headers: { Authorization: "Bearer " + apiKey },
            signal: AbortSignal.timeout(15000),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
            return NextResponse.json({ error: (d as any).error?.message || "HTTP " + r.status }, { status: 502 });
        }
        const ids = (Array.isArray(d.data) ? d.data : [])
            .map((m: any) => String(m?.id || m?.name || ""))
            .filter(Boolean);
        return NextResponse.json({ models: ids });
    } catch (e) {
        return NextResponse.json({ error: String((e as Error).message || e) }, { status: 502 });
    }
}
