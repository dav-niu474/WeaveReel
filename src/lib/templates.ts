/* 织影 WeaveReel — 场景模板库
   每套模板是一张预连线的画布：节点字段与引擎数据模型一致（type/prompt/story/title/vseed/cells/cols/dur），
   应用时引擎会重新分配 id 与随机 vseed，让同一模板每次套用都长出不同的画面。 */

export interface TplNode {
    id: string;
    type: "text" | "image" | "nine" | "video" | "audio" | "edit";
    x: number;
    y: number;
    prompt?: string;
    title?: string;
    story?: string;
    cells?: number;
    cols?: number;
    dur?: string;
}

export interface CanvasTemplate {
    id: string;
    name: string;
    icon: string;
    desc: string;
    nodes: TplNode[];
    edges: { from: string; to: string }[];
}

/* 列坐标：60 / 620 / 1180 / 1740，行距 300 —— 与自动布局节奏一致 */
export const TEMPLATES: CanvasTemplate[] = [
    {
        id: "travel-vlog",
        name: "旅行 Vlog · 海边假日",
        icon: "🌊",
        desc: "旁白文案 → 分镜九宫格 → 主视觉封面 → 合成成片，经典旅行短片流水线",
        nodes: [
            { id: "a", type: "text", x: 60, y: 300, title: "旁白文案", prompt: "写一段海边旅行的 30 秒旁白文案，节奏轻快", story: "清晨的渔港还带着薄雾，我们沿着海岸线一路向南。浪花把脚印收走，风把帽子吹上天空。黄昏时分，整片海面变成融化的金色，我们坐在堤坝上，什么也不说，就很好。" },
            { id: "b", type: "nine", x: 620, y: 260, prompt: "海边假日分镜：渔港晨雾、海岸公路、浪花与脚印、飞起的草帽、黄昏金海、堤坝剪影，统一暖金色调", cells: 9, cols: 3 },
            { id: "c", type: "image", x: 1180, y: 180, prompt: "电影感封面主视觉：黄昏海边，人物剪影站在堤坝上，天空大片金橙色云层，宽画幅电影质感" },
            { id: "d", type: "audio", x: 1180, y: 520, prompt: "轻快的原声吉他夏日旅行背景音乐，节奏明亮", dur: "30s" },
            { id: "e", type: "edit", x: 1740, y: 300, prompt: "把上游画面与分镜合成 30 秒旅行 Vlog，硬切节奏配卡点" },
        ],
        edges: [
            { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "e" }, { from: "d", to: "e" },
        ],
    },
    {
        id: "food-tour",
        name: "美食探店 · 深夜小馆",
        icon: "🍜",
        desc: "探店文案 → 环境氛围图 → 招牌菜特写 → 菜品九宫格 → 合成，探店视频标配结构",
        nodes: [
            { id: "a", type: "text", x: 60, y: 320, title: "探店文案", prompt: "写一段深夜小馆的探店文案，突出烟火气与招牌菜", story: "巷子深处这家开了十二年的小馆，晚上十点还坐满人。招牌红烧肉入口即化，镬气十足的干炒牛河，配上冰镇酸梅汤——人均四十，吃出深夜食堂的治愈感。" },
            { id: "b", type: "image", x: 620, y: 160, prompt: "深夜小馆门头与店内环境，暖黄灯光蒸汽缭绕，市井烟火气，手机纪实风格" },
            { id: "c", type: "image", x: 620, y: 500, prompt: "招牌红烧肉特写，酱汁油亮冒热气，浅景深美食摄影，暖色调" },
            { id: "d", type: "nine", x: 1180, y: 280, prompt: "菜品九宫格：红烧肉、干炒牛河、酸梅汤、凉拌菜、后厨锅气、堂食人群，统一暖黄市井色调", cells: 6, cols: 3 },
            { id: "e", type: "edit", x: 1740, y: 280, prompt: "合成 45 秒探店视频：门头→环境→菜品特写→九宫格快剪，卡点收尾" },
        ],
        edges: [
            { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }, { from: "d", to: "e" },
        ],
    },
    {
        id: "product-launch",
        name: "产品发布 · 科技新品",
        icon: "🚀",
        desc: "卖点脚本 → 产品主视觉 → 动态展示镜头 → 合成，发布会预告片结构",
        nodes: [
            { id: "a", type: "text", x: 60, y: 300, title: "卖点脚本", prompt: "为一款智能眼镜写 15 秒发布会预告脚本，三个卖点递进", story: "看不见的科技，看得见的视野。全天候续航，戴上即消失的轻。它不只记录世界，还读懂世界——下一代智能眼镜，即将发布。" },
            { id: "b", type: "image", x: 620, y: 160, prompt: "智能眼镜产品主视觉，悬浮在深色渐变背景中，冷色轮廓光，科技感布光，商业产品摄影" },
            { id: "c", type: "video", x: 620, y: 500, prompt: "智能眼镜 360 度旋转展示，镜头缓缓推近，光斑划过镜片，高级质感", dur: "5s" },
            { id: "d", type: "nine", x: 1180, y: 280, prompt: "使用场景分镜：通勤路上、咖啡厅办公、夜晚城市天台，主角佩戴智能眼镜，统一冷蓝科技色调", cells: 4, cols: 2 },
            { id: "e", type: "edit", x: 1740, y: 280, prompt: "合成 15 秒发布会预告：产品特写开场→卖点字卡→场景快剪→logo 收尾" },
        ],
        edges: [
            { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "e" },
        ],
    },
    {
        id: "knowledge-pop",
        name: "知识科普 · 60 秒讲透",
        icon: "📚",
        desc: "口播逐字稿 → 图解分镜 → AI 配音 → 合成，知识类口播视频结构",
        nodes: [
            { id: "a", type: "text", x: 60, y: 300, title: "口播逐字稿", prompt: "写一段 60 秒科普口播稿：为什么天空是蓝色的", story: "为什么天空是蓝色的？阳光其实由七种颜色组成。当它进入大气层，波长最短的蓝光最容易被空气分子弹散，铺满整个天穹。傍晚阳光斜穿大气，蓝光散尽，剩下的红橙便染红了天——所以晚霞，是阳光走过最长路途的颜色。" },
            { id: "b", type: "nine", x: 620, y: 260, prompt: "科普图解分镜：阳光七色光谱、大气层散射示意、蓝光铺满天穹、傍晚红霞示意，扁平插画风格，统一配色", cells: 4, cols: 2 },
            { id: "c", type: "audio", x: 1180, y: 160, prompt: "知性温暖的男声配音，语速适中，科普纪录片风格", dur: "60s" },
            { id: "d", type: "edit", x: 1740, y: 300, prompt: "合成 60 秒科普视频：图解分镜逐条推进，配音同步，关键句字幕强调" },
        ],
        edges: [
            { from: "a", to: "b" }, { from: "b", to: "d" }, { from: "c", to: "d" },
        ],
    },
    {
        id: "urban-drama",
        name: "情感短剧 · 城市晚风",
        icon: "💔",
        desc: "故事梗概 → 分镜脚本 → 场景定妆 → 剧情九宫格 → 合成，微短剧创作结构",
        nodes: [
            { id: "a", type: "text", x: 60, y: 160, title: "故事梗概", prompt: "写一个 100 字都市情感故事梗概：天台、晚风、未说出口的告别", story: "辞职那天，她终于登上那座天天路过却从未上去的天台。晚风把城市的霓虹吹得很远，她想起五年前在这里许下的愿望。原来长大不是得到更多，而是敢对昨天的自己说再见。" },
            { id: "b", type: "text", x: 60, y: 470, title: "分镜脚本", prompt: "把梗概拆成 6 个镜头的分镜脚本，注明景别与情绪", story: "1. 特写：推开天台铁门的手；2. 全景：她站上天台，城市铺开；3. 中景：晚风吹起头发，闭眼；4. 空镜：远处霓虹闪烁；5. 特写：嘴角释然的笑；6. 大远景：她走下天台，融入人海。" },
            { id: "c", type: "image", x: 620, y: 160, prompt: "都市天台场景定妆：年轻女生站在天台边缘远眺城市，晚霞霓虹背景，电影感构图，青橙色调" },
            { id: "d", type: "nine", x: 620, y: 500, prompt: "剧情九宫格：按分镜脚本六镜头依次生成，主角同一女生，青橙电影色调，情绪从压抑到释然", cells: 6, cols: 3 },
            { id: "e", type: "edit", x: 1180, y: 300, prompt: "合成 60 秒微短剧片段：按分镜顺序剪辑，舒缓钢琴配乐，结尾字幕「敢和昨天说再见吗」" },
        ],
        edges: [
            { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "e" }, { from: "d", to: "e" },
        ],
    },
    {
        id: "pet-daily",
        name: "宠物日常 · 橘猫的一天",
        icon: "🐱",
        desc: "主角设定 → 旁白文案 → 日常瞬间九宫格 → 合成，萌宠账号日更结构",
        nodes: [
            { id: "a", type: "image", x: 60, y: 260, prompt: "橘色小猫主角设定图：圆脸微胖，琥珀色眼睛，坐姿呆萌，柔和自然光，治愈系摄影" },
            { id: "b", type: "text", x: 620, y: 160, title: "旁白文案", prompt: "以橘猫视角写一段 30 秒治愈系旁白", story: "我的一天从叫醒铲屎官开始。窗台上的阳光是我的早餐，纸箱是我的城堡。人类总说我贪吃——拜托，这叫热爱生活。" },
            { id: "c", type: "nine", x: 620, y: 500, prompt: "橘猫日常九宫格：伸懒腰、晒太阳、玩纸箱、盯罐头、被打扰的不满脸、四脚朝天睡觉，统一暖色治愈风", cells: 6, cols: 3 },
            { id: "d", type: "edit", x: 1180, y: 300, prompt: "合成 30 秒萌宠日常：设定图开场→日常瞬间快剪，配上俏皮字幕" },
        ],
        edges: [
            { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" },
        ],
    },
];
