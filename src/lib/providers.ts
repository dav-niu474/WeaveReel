/* 织影 WeaveReel — 常用模型供应商预置
   均为 OpenAI 兼容网关（/chat/completions + /images/generations）；
   模型名以各官方在售为准，实际可用以账号权限与网关 /v1/models 为准 */

export interface ProviderPreset {
    id: string;
    name: string;
    baseUrl: string;
    textModel: string;
    imageModel?: string;
    visionModel?: string;
    note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
    {
        id: "sensenova",
        name: "商汤日日新",
        baseUrl: "https://token.sensenova.cn/v1",
        textModel: "sensenova-6.8-flash-lite",
        imageModel: "sensenova-u1-fast",
        visionModel: "sensenova-6.8-flash-lite",
        note: "默认预置；图片/视觉为国内直连",
    },
    {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        textModel: "gpt-4o-mini",
        imageModel: "gpt-image-1",
        visionModel: "gpt-4o-mini",
        note: "国际网络环境",
    },
    {
        id: "zhipu",
        name: "智谱 GLM",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        textModel: "glm-4-flash",
        imageModel: "cogview-3-flash",
        visionModel: "glm-4v-flash",
        note: "国内直连，有免费额度",
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        textModel: "deepseek-chat",
        visionModel: "deepseek-chat",
        note: "仅文本（暂无图片生成模型）",
    },
    {
        id: "moonshot",
        name: "月之暗面 Kimi",
        baseUrl: "https://api.moonshot.cn/v1",
        textModel: "moonshot-v1-8k",
        visionModel: "moonshot-v1-8k-vision-preview",
        note: "仅文本/视觉（暂无图片生成模型）",
    },
    {
        id: "siliconflow",
        name: "硅基流动",
        baseUrl: "https://api.siliconflow.cn/v1",
        textModel: "deepseek-ai/DeepSeek-V3",
        imageModel: "Kwai-Kolors/Kolors",
        visionModel: "deepseek-ai/deepseek-vl-2",
        note: "模型聚合平台，一家 Key 多家模型",
    },
    {
        id: "dashscope",
        name: "阿里云百炼",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        textModel: "qwen-plus",
        imageModel: "wanx2.1-t2i-turbo",
        visionModel: "qwen-vl-plus",
        note: "通义千问系列",
    },
    {
        id: "volces",
        name: "火山方舟（豆包）",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        textModel: "doubao-1-5-pro-32k-250115",
        imageModel: "doubao-seedream-2-0-t2i",
        visionModel: "doubao-1-5-vision-pro-32k-250115",
        note: "模型名需替换为接入点 ID",
    },
];
