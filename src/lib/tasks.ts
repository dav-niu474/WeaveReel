/* 织影 WeaveReel — 生成任务：D1 落库 + waitUntil 异步执行 + 按耗时推进度 */
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { tasks, settings } from "@/db/schema";
import { getDb } from "@/db";
import { callSNImage, callSNText, describeRefImage, getProvider, type TaskContext } from "./sensenova";
import { sizeFromRatio } from "./svg";
import { gridShots, GRID_CONSISTENCY, gridModeDef } from "./gridModes";

export interface GenerateInput {
    type?: string;
    prompt?: string;
    count?: number | string;
    model?: string;
    ratio?: string;
    linkSeed?: number;
    gridMode?: string;
    context?: TaskContext;
}

export interface TaskRow {
    id: string; type: string; prompt: string; status: string; createdAt: number;
    count: number; contextJson: string; seedBase: number | null;
    resultsJson: string | null; textResult: string | null; error: string | null;
    refMode: string | null; gridMode: string | null; simulated: number; promptUsed: string | null;
    cellPromptsJson: string | null; shotsJson: string | null;
}

const hex = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const normContext = (ctx?: TaskContext): TaskContext => ({
    texts: Array.isArray(ctx?.texts) ? ctx!.texts.filter((t) => t && t.text).slice(0, 6) : [],
    images: Array.isArray(ctx?.images)
        ? ctx!.images
              .filter((i) => i && Array.isArray(i.urls) && i.urls.length)
              .slice(0, 4)
              .map((i) => ({
                  label: String(i.label || "参考素材").slice(0, 20),
                  urls: i.urls,
                  palette: Array.isArray(i.palette) ? i.palette.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3) : [],
              }))
        : [],
});

function rowById(r: Record<string, unknown>): TaskRow {
    return r as unknown as TaskRow;
}

/** 进度：真实任务按预估时长推进到 90%（无状态可算），完成由 runTask 置 100 */
function estSeconds(type: string) {
    return type === "text" ? 45 : type === "nine" ? 60 : 20;
}

export function taskView(t: TaskRow) {
    const base = t.seedBase != null ? t.seedBase : Math.abs(t.id.length) % 97;
    const results: string[] = t.resultsJson ? JSON.parse(t.resultsJson) : Array.from({ length: t.count }, (_, i) => "/api/scene/" + ((base + i * 3) % 97));
    const ctx = normContext(JSON.parse(t.contextJson || "{}"));
    const progress = t.status === "running" ? Math.min(90, ((Date.now() - t.createdAt) / (estSeconds(t.type) * 1000)) * 90) : 100;
    return {
        id: t.id, type: t.type, status: t.status, progress: Math.round(progress),
        text: t.textResult || null, error: t.error || null,
        resultUrl: results[0], results,
        baseSeed: t.seedBase,
        usedContext: { texts: ctx.texts.length, images: ctx.images.length },
        refMode: t.refMode || null,
        gridMode: t.gridMode || null,
        gridModeLabel: t.type === "nine" ? gridModeDef(t.gridMode).label : null,
        simulated: !!t.simulated,
        promptUsed: t.promptUsed || null,
        cellPrompts: t.cellPromptsJson ? JSON.parse(t.cellPromptsJson) : null,
        shots: t.shotsJson ? JSON.parse(t.shotsJson) : null,
        waveUrl: t.type === "audio" ? "/api/wave" : null,
    };
}

export async function createTask(input: GenerateInput): Promise<TaskRow> {
    const db = await getDb();
    const id = "t" + hex();
    const ctx = normContext(input.context);
    const seedBase = Number.isFinite(input.linkSeed) ? (((input.linkSeed as number) % 97) + 97) % 97 : null;
    const row = {
        id, type: input.type || "image", prompt: input.prompt || "",
        status: "running", createdAt: Date.now(),
        count: Math.max(1, Math.min(9, parseInt(String(input.count), 10) || 1)),
        contextJson: JSON.stringify(ctx), seedBase,
        gridMode: input.gridMode ? String(input.gridMode).slice(0, 20) : null,
    };
    await db.insert(tasks).values(row);
    return rowById(row as unknown as Record<string, unknown>);
}

/** 生成执行体：由路由经 ctx.waitUntil 调起，结果回写 D1 */
export async function runTask(taskId: string, opts: { model?: string; ratio?: string }, fetchRef?: (url: string) => Promise<{ buf: ArrayBuffer; ext: string }>) {
    const db = await getDb();
    const { env } = await getCloudflareContext();
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    const t = rows[0] as unknown as TaskRow;
    if (!t) return;
    const settingsRows = await db.select().from(settings).where(eq(settings.id, "model-config"));
    const provider = await getProvider(env, settingsRows[0]?.data ?? null);
    const ctx = normContext(JSON.parse(t.contextJson || "{}"));
    try {
        if (!provider || !["text", "image", "nine"].includes(t.type)) {
            // 模拟兜底：带参考图时演示引用效果（合成片拼胶片条 / 直接沿用素材）
            const refs = ctx.images.flatMap((i) => i.urls).filter(Boolean);
            let results: string[] | null = null;
            let refMode: string | null = null;
            if (refs.length && !["text", "audio"].includes(t.type)) {
                if (t.type === "edit") {
                    results = ["/api/compose?frames=" + encodeURIComponent(refs.slice(0, 6).join(","))];
                } else {
                    results = Array.from({ length: Math.max(1, t.count) }, (_, i) => refs[i % refs.length]);
                }
                refMode = "reused";
            }
            await db.update(tasks).set({
                status: "done", simulated: 1,
                resultsJson: results ? JSON.stringify(results) : null,
                refMode,
            }).where(eq(tasks.id, taskId));
            return;
        }
        const ctxTexts = ctx.texts.map((x) => x.text).join("\n");
        let refDescs: string[] = [];
        if (ctx.images.length && fetchRef) {
            try {
                refDescs = [await describeRefImage(ctx.images[0].urls[0], provider, fetchRef)];
            } catch {
                refDescs = [];
            }
        }
        const refMode = refDescs.length ? "described" : ctx.images.length ? "note" : "none";
        const refParts = ctx.images.map((i) => {
            const pal = i.palette && i.palette.length ? "，主色调 " + i.palette.join("、") : "";
            return i.label + pal;
        });
        const refBlock = refDescs.length
            ? "参考画面（需延续其主体、构图、色调与风格）：" + refDescs.join("；") + (refParts.length ? "（" + refParts.join("；") + "）" : "")
            : ctx.images.length
                ? "画面需延续参考素材（" + refParts.join("；") + "）的基调与主体"
                : "";
        const ctxBlock = (ctxTexts ? "上游内容参考：" + ctxTexts : "") + (refBlock ? (ctxTexts ? "；" : "") + refBlock : "");

        if (t.type === "text") {
            const userContent = (ctxBlock ? ctxBlock + "\n\n本次任务：" : "") + (t.prompt || "一个海边黄昏的短片创意");
            const text = await callSNText(userContent, opts.model || provider.textModel, provider);
            await db.update(tasks).set({ status: "done", textResult: text, refMode, promptUsed: userContent }).where(eq(tasks.id, taskId));
        } else {
            const n = Math.max(1, Math.min(9, t.count || 1));
            const size = sizeFromRatio(opts.ratio);
            const basePrompt = (t.prompt || "海边黄昏电影感画面") + (ctxBlock ? "，" + ctxBlock : "");
            /* 九宫格按技能出分镜：每种技能有自己的九拍节拍（灵感风暴/故事叙述/武打分镜/全景机位/舞蹈动作），
               上游文案句子融合进节拍；其余图片类型维持原变体逻辑 */
            const shots = t.type === "nine" ? gridShots(t.gridMode, ctxTexts, n) : [];
            const urls: string[] = [], cellPrompts: string[] = [];
            for (let i = 0; i < n; i++) {
                let q: string;
                if (shots.length) {
                    q = shots[i % shots.length] + "，" + (t.prompt || "电影感画面，统一场景与角色");
                    if (t.type === "nine") q += "，" + GRID_CONSISTENCY;
                    if (refBlock) q += "，" + refBlock;
                } else {
                    q = n > 1 ? basePrompt + "，画面变体 " + (i + 1) : basePrompt;
                }
                cellPrompts.push(q);
                const u = await callSNImage(q, opts.model || provider.imageModel, provider, size);
                if (!u) throw new Error("empty image url");
                urls.push(await downloadToR2(u));
            }
            await db.update(tasks).set({
                status: "done", resultsJson: JSON.stringify(urls), refMode,
                promptUsed: shots.length ? cellPrompts.join(" ── ") : cellPrompts[0],
                cellPromptsJson: shots.length ? JSON.stringify(cellPrompts) : null,
                shotsJson: shots.length ? JSON.stringify(shots) : null,
            }).where(eq(tasks.id, taskId));
        }
    } catch (err) {
        await db.update(tasks).set({ status: "error", error: String((err as Error).message || err) }).where(eq(tasks.id, taskId));
    }
}

/** 生成图下载转存 R2，避免外链过期 */
async function downloadToR2(url: string): Promise<string> {
    const { env } = await getCloudflareContext();
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error("image download HTTP " + r.status);
    const buf = await r.arrayBuffer();
    const key = "gen-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12) + ".jpg";
    await env.weavereel_uploads.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
    return "/uploads/" + key;
}

export async function getTaskById(id: string): Promise<TaskRow | null> {
    const db = await getDb();
    const rows = await db.select().from(tasks).where(eq(tasks.id, id));
    return rows.length ? (rows[0] as unknown as TaskRow) : null;
}
