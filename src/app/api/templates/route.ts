import { NextResponse } from "next/server";
import { TEMPLATES } from "@/lib/templates";

/** 场景模板库：预连线的画布模板，前端一键套用 */
export async function GET() {
    return NextResponse.json({ templates: TEMPLATES });
}
