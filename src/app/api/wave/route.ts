import { waveSVG } from "@/lib/svg";

export const dynamic = "force-dynamic";

export async function GET() {
    return new Response(waveSVG(), {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
    });
}
