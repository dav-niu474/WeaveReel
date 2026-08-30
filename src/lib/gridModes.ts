/* 织影 WeaveReel — 九宫格技能模式
   不同技能（灵感风暴 / 故事叙述 / 武打分镜 / 全景机位 / 舞蹈动作）对应不同的逐格分镜策略：
   每格提示词 = 技能节拍（镜头语言）+ 上游剧情句（如有），并附带成组一致性约束。 */

export interface GridModeDef {
    id: string;
    label: string;
    icon: string;
    desc: string;
}

export const GRID_MODES: GridModeDef[] = [
    { id: "inspire", label: "灵感风暴", icon: "💡", desc: "同主题 9 种创意发散" },
    { id: "story", label: "故事叙述", icon: "📖", desc: "九格讲完一个故事弧" },
    { id: "action", label: "武打分镜", icon: "🥋", desc: "动作戏九拍逐格拆解" },
    { id: "panorama", label: "全景机位", icon: "🎥", desc: "同一场景九种机位语言" },
    { id: "dance", label: "舞蹈动作", icon: "💃", desc: "舞蹈镜头动作分解" },
];

const MODE_MAP = new Map(GRID_MODES.map((m) => [m.id, m]));
export const gridModeDef = (id?: string | null) => (id && MODE_MAP.get(id)) || GRID_MODES[0];

/* 每种技能的九拍节拍（镜头语言），不足九格时均匀抽样 */
const BEATS: Record<string, string[]> = {
    inspire: [
        "超近景：主体细节纹理特写",
        "全景：主体与环境的关系交代",
        "戏剧性光影角度重新演绎",
        "动态瞬间抓拍，张力拉满",
        "情绪神态特写",
        "更换色彩氛围的另一种演绎",
        "低角度英雄视角",
        "高空俯瞰构图",
        "抽象意象化表达收尾",
    ],
    story: [
        "开场空镜铺垫环境氛围",
        "主角入场亮相",
        "日常细节中埋下伏笔",
        "意外事件打破平静",
        "情绪升温，矛盾显现",
        "命运转折的关键时刻",
        "高潮：正面对撞或抉择瞬间",
        "尘埃落定",
        "尾声留白，余韵收束",
    ],
    action: [
        "对峙起手，蓄势待发",
        "试探性第一回合交锋",
        "短兵相接，攻防格挡",
        "腾空翻转踢击",
        "重击命中，冲击波扩散",
        "被击退翻滚卸力",
        "聚气释放绝招",
        "最后一击的定格瞬间",
        "收势而立，尘埃落定",
    ],
    panorama: [
        "大远景：环境全貌交代",
        "全景：主体完整入画",
        "中景：主体膝上半身",
        "近景：胸部以上",
        "特写：面部表情",
        "大特写：手部或道具细节",
        "高空俯拍上帝视角",
        "低角度仰拍压迫感",
        "过肩视角：窥视感构图",
    ],
    dance: [
        "起势定格亮相",
        "手位与手臂线条展开",
        "重心移动，步伐滑动",
        "原地旋转，裙摆飞扬",
        "跳跃腾空的滞空瞬间",
        "队形变换与走位",
        "身体波浪律动特写",
        "高潮定格造型",
        "收势谢幕，回眸定格",
    ],
};

const sentences = (text: string) =>
    String(text || "")
        .split(/[。！？!?；;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4);

/** 生成 n 格的逐格提示词（节拍 + 剧情句融合），供 runTask 的九宫格分支使用 */
export function gridShots(modeId: string | null | undefined, upstreamText: string, n: number): string[] {
    const beats = BEATS[gridModeDef(modeId).id] || BEATS.inspire;
    const sents = sentences(upstreamText);
    const pick = (i: number) => beats[Math.round((i * (beats.length - 1)) / Math.max(1, n - 1))];
    return Array.from({ length: n }, (_, i) => {
        const beat = n === 1 ? beats[0] : pick(i);
        const sent = sents.length ? sents[i % sents.length] : "";
        return sent ? `${beat}（剧情依据：${sent}）` : beat;
    });
}

/** 成组一致性尾缀：九格必须像同一部片子的连续分镜 */
export const GRID_CONSISTENCY = "统一角色形象、服装、色调与画风，九格成组风格一致";
