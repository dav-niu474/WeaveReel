import { sceneSVG } from "@/lib/svg";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ seed: string }> }) {
    const { seed } = await params;
    const n = parseInt(seed, 10);
    return new Response(sceneSVG(Number.isFinite(n) ? n : 0), {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
}
