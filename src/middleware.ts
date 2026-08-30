import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

/* API 访问门：未登录（无有效令牌 Cookie）时所有 /api/* 返回 401（/api/auth/* 除外）。
   页面与静态资源放行——前端初始化时查询 /api/auth/status 自行显示登录页 */
export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    if (!pathname.startsWith("/api/") || pathname.startsWith("/api/auth/")) {
        return NextResponse.next();
    }
    const token = req.cookies.get(AUTH_COOKIE)?.value;
    if (token && token === authToken(process.env as Record<string, string | undefined>)) {
        return NextResponse.next();
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
    matcher: ["/api/:path*"],
};
