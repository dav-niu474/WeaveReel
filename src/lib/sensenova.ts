/* 织影 WeaveReel — SenseNova（商汤日日新）网关对接
   文本 / 图片 / 视觉描述（参考图理解）三级能力 + 限流降级 */

export interface SenseNovaProvider {
    baseUrl: string;
    apiKey: string;
    textModel: string;
    imageModel: string;
    visionModel: string;
}

export interface RefImage {
    label: string;
    urls: string[];
    palette?: string[];
}

export interface TaskContext {
    texts: { label: string; text: string }[];
    images: RefImage[];
}

/** 从 D1 设置 + 环境变量合成 provider 配置（settings 缺失时用 .dev.vars / secret 兜底） */
export async function getProvider(env: unknown, settingsJson?: string | null): Promise<SenseNovaProvider | null> {
    const e = (env || {}) as Record<string, string | undefined>;
    let cfg: any = null;
    try {
        cfg = settingsJson ? JSON.parse(settingsJson) : null;
    } catch {
        cfg = null;
    }
    const p = cfg && cfg.provider && cfg.provider.sensenova;
    const apiKey = (p && p.apiKey) || e.SENSENOVA_API_KEY || "";
    if (!apiKey) return null;
    return {
        baseUrl: (p && p.baseUrl) || e.SENSENOVA_BASE_URL || "https://token.sensenova.cn/v1",
        apiKey,
        textModel: (p && p.textModel) || e.SENSENOVA_TEXT_MODEL || "sensenova-6.8-flash-lite",
        imageModel: (p && p.imageModel) || e.SENSENOVA_IMAGE_MODEL || "sensenova-u1-fast",
        visionModel: (p && p.visionModel) || e.SENSENOVA_VISION_MODEL || "sensenova-6.8-flash-lite",
    };
}

async function snFetch(provider: SenseNovaProvider, path: string, body: unknown, timeoutMs: number): Promise<any> {
    const r = await fetch(provider.baseUrl + path, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + provider.apiKey },
        body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as any).error?.message || "HTTP " + r.status);
    return d;
}

export async function callSNText(prompt: string, model: string, provider: SenseNovaProvider): Promise<string> {
    const d = await snFetch(provider, "/chat/completions", {
        model,
        max_tokens: 1000,
        thinking: { type: "disabled" }, // 关闭思维链直接输出正文
        messages: [
            { role: "system", content: "你是短视频文案写手。根据用户主题直接输出旁白/分镜文案正文，150字以内。只输出正文本身：不要标题、不要选项、不要解释、不要 Markdown 格式。" },
            { role: "user", content: prompt },
        ],
    }, 150000);
    const m = d.choices?.[0]?.message || {};
    return String(m.content || "").trim() || String(m.reasoning || "").trim().slice(0, 200);
}

export async function callSNImage(prompt: string, model: string, provider: SenseNovaProvider, size: string): Promise<string> {
    const d = await snFetch(provider, "/images/generations", { model, prompt, n: 1, size }, 180000);
    return d.data?.[0]?.url || "";
}

/* ---------- 参考图 → 视觉模型描述（限流自动降级 + 缓存 + 冷静期） ---------- */
const refDescCache = new Map<string, { desc: string; at: number }>();
let visionCooldownUntil = 0;
const VISION_COOLDOWN_MS = 3 * 60 * 1000;

export async function describeRefImage(refUrl: string, provider: SenseNovaProvider, fetchRef: (url: string) => Promise<{ buf: ArrayBuffer; ext: string }>): Promise<string> {
    const hit = refDescCache.get(refUrl);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.desc;
    if (Date.now() < visionCooldownUntil) throw new Error("vision cooldown");
    const { buf, ext } = await fetchRef(refUrl);
    const dataUrl = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${Buffer.from(buf).toString("base64")}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const d = await snFetch(provider, "/chat/completions", {
                model: provider.visionModel,
                max_tokens: 200,
                thinking: { type: "disabled" },
                messages: [{ role: "user", content: [
                    { type: "text", text: "用不超过80字客观描述这张图片的主体、构图、色调与风格，供文生图复用。只输出描述正文。" },
                    { type: "image_url", image_url: { url: dataUrl } },
                ] }],
            }, 90000);
            const m = d.choices?.[0]?.message || {};
            const desc = String(m.content || "").trim() || String(m.reasoning || "").trim().slice(0, 200);
            if (!desc) throw new Error("empty vision description");
            refDescCache.set(refUrl, { desc, at: Date.now() });
            if (refDescCache.size > 60) refDescCache.delete(refDescCache.keys().next().value as string);
            return desc;
        } catch (err) {
            lastErr = err;
            if (/429|busy/i.test(String((err as Error).message))) {
                if (attempt === 0) { await new Promise((r) => setTimeout(r, 8000)); continue; }
                visionCooldownUntil = Date.now() + VISION_COOLDOWN_MS;
                throw err;
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
    }
    throw lastErr;
}

/* ---------- 视觉通道可用性探测（模块级缓存 5 分钟） ---------- */
export interface VisionStatus {
    configured: boolean; ok: boolean; lastOkAt: number | null; lastFailAt: number | null; lastError: string | null;
}
const g = globalThis as unknown as { __wrVision?: { status: VisionStatus; probedAt: number; probing: Promise<void> | null } };
g.__wrVision ??= { status: { configured: false, ok: false, lastOkAt: null, lastFailAt: null, lastError: null }, probedAt: 0, probing: null };
const PROBE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export async function getVisionStatus(provider: SenseNovaProvider | null, force = false): Promise<VisionStatus> {
    const v = g.__wrVision!;
    v.status.configured = !!provider;
    if (!provider) return v.status;
    if (!force && Date.now() - v.probedAt < 5 * 60 * 1000) return v.status;
    if (v.probing) return v.status;
    v.probing = (async () => {
        try {
            await snFetch(provider, "/chat/completions", {
                model: provider.visionModel, max_tokens: 10,
                messages: [{ role: "user", content: [
                    { type: "text", text: "回复ok" },
                    { type: "image_url", image_url: { url: PROBE_IMAGE } },
                ] }],
            }, 30000);
            v.status = { ...v.status, ok: true, lastOkAt: Date.now(), lastError: null };
        } catch (err) {
            v.status = { ...v.status, ok: false, lastFailAt: Date.now(), lastError: String((err as Error).message || err) };
        }
        v.probedAt = Date.now();
        v.probing = null;
    })();
    await v.probing;
    return v.status;
}
