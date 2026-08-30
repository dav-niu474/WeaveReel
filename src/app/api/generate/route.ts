import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createTask, runTask, taskView, type GenerateInput } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
    const body = (await req.json().catch(() => ({}))) as GenerateInput & { model?: string; ratio?: string };
    const task = await createTask(body);
    // 异步执行生成，不阻塞响应；结果回写 D1，由 GET /api/tasks/:id 轮询
    const { ctx } = await getCloudflareContext();
    ctx.waitUntil(runTask(task.id, { model: body.model, ratio: body.ratio }, fetchRefFromR2));
    return NextResponse.json(taskView(task));
}

/** R2 参考图读取（视觉模型描述用） */
async function fetchRefFromR2(url: string): Promise<{ buf: ArrayBuffer; ext: string }> {
    const { env } = await getCloudflareContext();
    const key = url.replace(/^.*\/uploads\//, "");
    const obj = await env.weavereel_uploads.get(key);
    if (!obj) throw new Error("ref not found: " + url);
    const ext = (key.split(".").pop() || "jpeg").toLowerCase();
    return { buf: await obj.arrayBuffer(), ext };
}
