import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
    mp3: "audio/mpeg", wav: "audio/wav", json: "application/json",
};

/** 上传素材（raw body + X-Filename 头）→ R2 */
export async function POST(req: Request) {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return NextResponse.json({ error: "empty body" }, { status: 400 });
    const rawName = decodeURIComponent(req.headers.get("x-filename") || "");
    const m = /\.([A-Za-z0-9]+)$/.exec(rawName);
    let ext = m ? "." + m[1].toLowerCase() : "";
    const ctype = (req.headers.get("content-type") || "").split(";")[0];
    if (!ext) {
        const hit = Object.entries(MIME).find(([, v]) => v === ctype);
        ext = hit ? "." + hit[0] : ".bin";
    }
    const key = "u" + crypto.randomUUID().replace(/-/g, "").slice(0, 12) + ext;
    const { env } = await getCloudflareContext();
    await env.weavereel_uploads.put(key, buf, {
        httpMetadata: { contentType: MIME[ext.slice(1)] || "application/octet-stream", cacheControl: "public, max-age=31536000" },
    });
    return NextResponse.json({ url: "/uploads/" + key, size: buf.byteLength });
}
