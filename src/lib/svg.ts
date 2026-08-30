/* 织影 WeaveReel — 服务端 SVG 生成（场景占位图 / 音频波形 / 合成胶片条 / 分镜拆分） */

const PALS = [
    ["#8fd3f4", "#cfefff", "#2ea8c9", "#7ec850", 0],
    ["#8fd3f4", "#cfefff", "#2ea8c9", "#7ec850", 1],
    ["#9be0c8", "#e2fff2", "#38b2a0", "#5fbf6e", 0],
    ["#ffd89b", "#fff3d6", "#e8a87c", "#c9d96b", 0],
    ["#a6c8ff", "#e4efff", "#4f8cff", "#6fce7e", 0],
    ["#ffb199", "#ffe0d1", "#e07a5f", "#94b860", 0],
    ["#c3aed6", "#efe6ff", "#8e7cc3", "#7ec850", 0],
    ["#8fd3f4", "#cfefff", "#2ea8c9", "#7ec850", 1],
    ["#ffe9a8", "#fffbe6", "#f4a259", "#8ecf70", 0],
];

export function sceneSVG(seed: number, w = 340, h = 190): string {
    const p = PALS[Math.abs(seed) % PALS.length];
    const horizon = h * 0.57;
    let stars = "";
    if (p[4])
        for (let i = 0; i < 22; i++)
            stars += `<circle cx='${(i * 97) % w}' cy='${(i * 53) % (horizon * 0.75)}' r='1' fill='white' opacity='.7'/>`;
    const fig = p[4]
        ? `<g><circle cx='${w * 0.44 + 4}' cy='${h * 0.5}' r='7' fill='#3a3f52'/>
    <path d='M${w * 0.44 - 4} ${h * 0.5 + 26} L${w * 0.44 + 2} ${h * 0.5 + 8} L${w * 0.44 + 12} ${h * 0.5 + 22} L${w * 0.44 + 16} ${h * 0.5 + 40} L${w * 0.44 - 10} ${h * 0.5 + 40} Z' fill='#f2c94c'/></g>`
        : "";
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${p[0]}'/><stop offset='1' stop-color='${p[1]}'/></linearGradient></defs>
<rect width='${w}' height='${horizon}' fill='url(#s)'/>${stars}
<circle cx='${w * 0.78}' cy='${h * 0.18}' r='${h * 0.068}' fill='#fff8dc' opacity='.95'/>
<ellipse cx='${w * 0.28}' cy='${h * 0.16}' rx='${w * 0.13}' ry='${h * 0.05}' fill='white' opacity='.7'/>
<ellipse cx='${w * 0.36}' cy='${h * 0.19}' rx='${w * 0.1}' ry='${h * 0.04}' fill='white' opacity='.55'/>
<rect y='${horizon}' width='${w}' height='${h * 0.18}' fill='${p[2]}'/>
<path d='M0 ${horizon} Q ${w * 0.2} ${horizon - 4} ${w * 0.45} ${horizon} T ${w} ${horizon} L${w} ${horizon + 8} L0 ${horizon + 8}Z' fill='white' opacity='.25'/>
<path d='M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.66} ${w * 0.6} ${h * 0.73} T ${w} ${h * 0.71} L${w} ${h} L0 ${h} Z' fill='${p[3]}'/>${fig}</svg>`;
}

export function waveSVG(): string {
    let bars = "";
    for (let i = 0; i < 36; i++) {
        const hgt = 8 + Math.abs(Math.sin(i * 0.9)) * 34;
        bars += `<rect x='${16 + i * 9}' y='${50 - hgt / 2}' width='4.5' height='${hgt}' rx='2.2' fill='#f06292' opacity='${(0.45 + Math.abs(Math.sin(i * 0.5)) * 0.55).toFixed(2)}'/>`;
    }
    return `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='100'><rect width='320' height='100' fill='#141726'/>${bars}<text x='18' y='30' fill='#8b91a7' font-size='13' font-family='sans-serif'>🎵 夏日の風 - BGM</text></svg>`;
}

/** 合成片胶片条：frames 为本服务可引用的素材路径（/uploads/.. 或 /api/scene/n） */
export function composeSVG(frames: string[]): string {
    const n = frames.length;
    if (!n) return sceneSVG(0, 340, 190);
    const fw = 150, fh = 84, gap = 10, perRow = 4;
    const rows = Math.ceil(n / perRow);
    const W = n >= perRow ? perRow * (fw + gap) - gap + 24 : n * (fw + gap) - gap + 24;
    const H = rows * (fh + 34) + 46;
    let cells = "";
    frames.forEach((f, i) => {
        const col = i % perRow, row = Math.floor(i / perRow);
        const x = 12 + col * (fw + gap), y = 38 + row * (fh + 34);
        cells += `<image href='${f}' x='${x}' y='${y}' width='${fw}' height='${fh}' preserveAspectRatio='xMidYMid slice'/>
<rect x='${x}' y='${y}' width='${fw}' height='${fh}' fill='none' stroke='#2a3042' rx='6'/>
<text x='${x + 2}' y='${y + fh + 16}' fill='#8b91a7' font-size='11' font-family='sans-serif'>镜头${i + 1} · 2.0s</text>`;
    });
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>
<rect width='${W}' height='${H}' fill='#141726' rx='10'/>
<text x='14' y='24' fill='#e8eaf2' font-size='13' font-family='sans-serif'>🎬 时间线合成预览 · ${n} 个镜头</text>${cells}</svg>`;
}

/** 分镜拆分：上游文案按句切开，每格九宫格用对应句子作提示词 */
export function splitShots(text: string, max: number): string[] {
    return String(text || "")
        .split(/[。！？!?；;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4)
        .slice(0, Math.max(1, max));
}

/** SenseNova 文生图支持的尺寸 */
export const SIZE_MAP: Record<string, string> = {
    "16:9": "2752x1536", "9:16": "1536x2752", "1:1": "2048x2048",
    "4:3": "2368x1760", "21:9": "3072x1376",
};
export const sizeFromRatio = (r?: string) => SIZE_MAP[String(r || "").split(" ")[0]] || "2752x1536";
