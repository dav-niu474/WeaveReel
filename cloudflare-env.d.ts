// OpenNext getCloudflareContext().env 类型（由 wrangler.jsonc 绑定 + .dev.vars 密钥构成）
declare global {
    interface CloudflareEnv {
        ASSETS: Fetcher;
        weavereel_db: D1Database;
        weavereel_uploads: R2Bucket;
        SENSENOVA_BASE_URL?: string;
        SENSENOVA_API_KEY?: string;
        SENSENOVA_TEXT_MODEL?: string;
        SENSENOVA_IMAGE_MODEL?: string;
        SENSENOVA_VISION_MODEL?: string;
    }
}
export {};
