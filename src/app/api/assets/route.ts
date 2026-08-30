import { NextResponse } from "next/server";
import { SUBJECTS, SCENES } from "@/lib/assets";

/** 预置资产：主体库（IP 形象）与素材库（场景素材） */
export async function GET() {
    return NextResponse.json({ subjects: SUBJECTS, scenes: SCENES });
}
