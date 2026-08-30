/* 织影 WeaveReel — 预置资产库
   主体库：预置 IP 形象（暂用场景占位图 + 形象设定提示词，接入真实形象图后替换 url）
   素材库：场景素材（占位场景图 + 场景描述提示词） */

export interface PresetAsset {
    id: string;
    name: string;
    seed: number;
    prompt: string;
}

export const SUBJECTS: PresetAsset[] = [
    { id: "s1", name: "少女小夏", seed: 12, prompt: "16 岁少女小夏，齐刘海长发，水手服，元气笑容，全身立绘设定" },
    { id: "s2", name: "青年阿杰", seed: 27, prompt: "20 岁青年阿杰，短发运动装，阳光帅气，全身立绘设定" },
    { id: "s3", name: "橘猫团团", seed: 41, prompt: "圆脸橘猫团团，琥珀色大眼睛，微胖呆萌，设定图" },
    { id: "s4", name: "机械师K1", seed: 55, prompt: "机器人机械师 K1，银蓝配色装甲，胸口能量核心，设定图" },
    { id: "s5", name: "古风少女绫", seed: 63, prompt: "古风少女绫，青丝高髻，红衣广袖，手持团扇，设定图" },
    { id: "s6", name: "侦探老周", seed: 78, prompt: "中年侦探老周，风衣礼帽，胡茬，叼着烟斗，设定图" },
];

export const SCENES: PresetAsset[] = [
    { id: "c1", name: "海边黄昏", seed: 3, prompt: "海边黄昏，金色阳光洒在波浪与沙滩上，电影感构图" },
    { id: "c2", name: "城市夜景", seed: 9, prompt: "赛博感城市夜景，霓虹灯牌与湿漉路面反光" },
    { id: "c3", name: "咖啡店内", seed: 16, prompt: "温暖咖啡店内景，窗边座位，午后阳光斜照" },
    { id: "c4", name: "森林清晨", seed: 24, prompt: "晨雾森林，丁达尔光束穿过树冠" },
    { id: "c5", name: "雪原小屋", seed: 33, prompt: "雪原中的木屋，暖窗灯光，星空低垂" },
    { id: "c6", name: "校园天台", seed: 47, prompt: "校园天台，围栏与晚霞，城市天际线远景" },
    { id: "c7", name: "太空舱内", seed: 58, prompt: "未来太空舱内景，舷窗外星云，冷色仪表光" },
    { id: "c8", name: "古镇雨巷", seed: 70, prompt: "江南古镇雨巷，青石板与油纸伞，湿润氛围" },
];
