import { NextResponse } from "next/server";
import { getTaskById, taskView } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const t = await getTaskById(id);
    if (!t) return NextResponse.json({ error: "task not found" }, { status: 404 });
    return NextResponse.json(taskView(t));
}
