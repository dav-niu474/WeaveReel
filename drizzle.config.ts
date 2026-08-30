import { defineConfig } from "drizzle-kit";

// 仅用于 drizzle-kit generate（从 schema 生成迁移 SQL），不连接真实数据库
export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./src/drizzle",
    dialect: "sqlite",
});
