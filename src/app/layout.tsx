import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "织影 WeaveReel · AI 视频创作工作台",
    description: "节点式 AI 视频创作工作台：内容沿连线流动，链式生成，一键成片",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN">
            <body>{children}</body>
        </html>
    );
}
