import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** 画布项目持久化（当前仅一行：id = "default"） */
export const projects = sqliteTable("projects", {
    id: text("id").primaryKey(),
    data: text("data").notNull(), // JSON: { nodes, edges }
    view: text("view"), // JSON: { scale, panX, panY }
    updatedAt: integer("updated_at").notNull(),
});

/** 模型配置（id = "model-config"），data 为原配置 JSON */
export const settings = sqliteTable("settings", {
    id: text("id").primaryKey(),
    data: text("data").notNull(),
    updatedAt: integer("updated_at").notNull(),
});

/** 生成任务：POST 时落库，waitUntil 异步回填结果，GET 时按耗时推进度 */
export const tasks = sqliteTable("tasks", {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    prompt: text("prompt").notNull().default(""),
    status: text("status").notNull().default("running"), // running | done | error
    createdAt: integer("created_at").notNull(),
    count: integer("count").notNull().default(1),
    contextJson: text("context_json").notNull().default("{}"),
    seedBase: integer("seed_base"),
    resultsJson: text("results_json"),
    textResult: text("text_result"),
    error: text("error"),
    refMode: text("ref_mode"), // described | note | reused | none
    gridMode: text("grid_mode"), // 九宫格技能：inspire | story | action | panorama | dance
    simulated: integer("simulated").notNull().default(0),
    promptUsed: text("prompt_used"),
    cellPromptsJson: text("cell_prompts_json"),
    shotsJson: text("shots_json"),
});

/** 作品库：每次生成的图片成果持久登记（不随画布节点删除而消失），
    published=1 的作品出现在素材库供模板式复用 */
export const works = sqliteTable("works", {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    prompt: text("prompt").notNull().default(""),
    kind: text("kind").notNull().default("image"), // image | video
    published: integer("published").notNull().default(0),
    createdAt: integer("created_at").notNull(),
});
