import { NextResponse } from "next/server";

/* 织影 WeaveReel — 简单口令登录（单人工具级访问门）
   密码：环境变量 AUTH_PASSWORD（缺省 weavereel）；校验通过后颁发 HttpOnly Cookie */

export const AUTH_COOKIE = "wr_auth";
const SECRET = "weavereel-auth-v1";

export function authPassword(env: Record<string, string | undefined>): string {
    return env.AUTH_PASSWORD || "weavereel";
}

/** 由口令派生访问令牌（个人工具级，非高强度凭据） */
export function authToken(env: Record<string, string | undefined>): string {
    const raw = authPassword(env) + ":" + SECRET;
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
    return "wr" + (h >>> 0).toString(36);
}

export function isAuthed(req: Request, env: Record<string, string | undefined>): boolean {
    const cookie = req.headers.get("cookie") || "";
    const m = new RegExp("(?:^|;\\s*)" + AUTH_COOKIE + "=([^;]+)").exec(cookie);
    return !!m && m[1] === authToken(env);
}

export function loginResponse(env: Record<string, string | undefined>, password: string): NextResponse {
    if (password !== authPassword(env)) {
        return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.headers.append(
        "Set-Cookie",
        `${AUTH_COOKIE}=${authToken(env)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    );
    return res;
}
