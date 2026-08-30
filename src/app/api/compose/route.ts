import { composeSVG } from "@/lib/svg";

export const dynamic = "force-dynamic";

/** 合成片胶片条预览：?frames=/uploads/a.jpg,/uploads/b.jpg */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const frames = (url.searchParams.get("frames") || "")
        .split(",")
        .filter((u) => /^\/uploads\/[A-Za-z0-9._-]+$/.test(u) || /^\/api\/scene\/-?\d+$/.test(u))
        .slice(0, 6);
    return new Response(composeSVG(frames), {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
    });
}
