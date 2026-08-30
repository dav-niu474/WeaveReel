"use client";

import Script from "next/script";

/* 画布引擎（public/weavereel.js）以全局函数暴露操作，按钮经 window.* 调用 */
type Engine = Record<string, (...a: unknown[]) => void>;
const call = (fn: string, ...args: unknown[]) => () =>
    (window as unknown as Engine)[fn]?.(...args);

export default function Home() {
    return (
        <>
            {/* 顶栏 */}
            <div className="topbar">
                <div className="topbar-left">
                    <div className="logo"><div className="dot">✦</div>织影 WeaveReel</div>
                    <div className="project-name">/ <b>夏日海边 · 野餐短片</b></div>
                </div>
                <div className="mode-switch">
                    <button id="msCanvas" className="active" onClick={call("switchMode", "canvas")}>🖥 画布</button>
                    <button id="msEditor" onClick={call("switchMode", "editor")}>▦ 编辑器</button>
                </div>
                <div className="topbar-right">
                    <button className="icon-btn" title="撤销 (Ctrl+Z)" onClick={call("undo")}>↩</button>
                    <button className="icon-btn" title="重做 (Ctrl+Y)" onClick={call("redo")}>↪</button>
                    <button className="icon-btn" title="新建画布" onClick={call("newCanvas")}>✚</button>
                    <button className="icon-btn" title="自动布局" onClick={call("autoLayout")}>⌗</button>
                    <button className="btn-save" id="saveBtn" title="保存画布 (Ctrl+S)" onClick={call("saveCanvas")}>💾 保存</button>
                    <button className="btn-primary" onClick={call("composeAll")}>⚡ 一键成片</button>
                    <div className="avatar">A</div>
                </div>
            </div>

            {/* 画布 */}
            <div id="canvas-wrap">
                <div id="viewport">
                    <svg id="wires"></svg>
                    <div className="guide" id="guideV"></div>
                    <div className="guide" id="guideH"></div>
                </div>
                <div className="empty-hint" id="emptyHint">
                    <div className="big">🎞</div>
                    <b>画布空空如也</b>
                    <span>① 右侧 Dock 新增节点或套用模板 ② 改文案 ③ ⏩ 链式生成 ④ ⚡ 合成视频进编辑器<br />每种节点有专属能力工具条 · 连线颜色见左下图例</span>
                </div>
            </div>

            {/* 悬浮 AI 能力工具栏（跟随选中节点） */}
            <div className="aitb" id="aiToolbar">
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "center", width: "100%", rowGap: "2px" }} id="aitbCaps"></div>
                <div className="aitb-sep"></div>
                <button className="aitb-btn" id="aitbMore" title="更多能力"><span className="ico">⋯</span></button>
                <div className="aitb-sep"></div>
                <button className="aitb-btn hl" onClick={call("capCompose")}><span className="ico">⚡</span>合成视频</button>
                <button className="aitb-btn hl" title="从所选节点沿连线向下游逐级生成（上游输出作为下游输入）" onClick={call("runChain")}><span className="ico">⏩</span>链式生成</button>
                <button className="aitb-btn" title="绑定为一组：多选（Shift+点击）直接成组；单选则连同上游整链成组，可整体拖动" onClick={call("bindGroup")}><span className="ico">📦</span>绑组</button>
                <button className="aitb-btn" title="复制所选节点" onClick={call("dupSelected")}><span className="ico">⧉</span></button>
                <button className="aitb-btn" title="上传替换所选节点素材" onClick={call("replaceSelected")}><span className="ico">🔄</span>替换</button>
                <button className="aitb-btn" title="删除所选节点 (Delete)" onClick={call("deleteSelected")}><span className="ico">🗑</span></button>
                <button className="aitb-btn" title="下载所选素材" onClick={call("downloadSelected")}><span className="ico">⬇</span></button>
                <button className="aitb-btn" title="全屏预览" onClick={call("previewSelected")}><span className="ico">⤢</span></button>
            </div>

            {/* 更多能力菜单 / 快速创建菜单 */}
            <div className="ctx-menu" id="moreMenu"></div>
            <div className="ctx-menu" id="quickMenu"></div>

            {/* 底部生成面板（跟随选中节点） */}
            <div className="gpanel" id="genPanel">
                <div className="g-tabs" id="gTabs">
                    <button data-tab="text" onClick={call("setTab", "text")}>文本生成</button><span className="tsep"></span>
                    <button data-tab="image" onClick={call("setTab", "image")}>图片生成</button><span className="tsep"></span>
                    <button data-tab="video" onClick={call("setTab", "video")}>视频生成</button><span className="tsep"></span>
                    <button data-tab="audio" onClick={call("setTab", "audio")}>音频生成</button>
                    <span className="flex"></span>
                    <button className="mini" id="gExpand" title="放大">⤢</button>
                </div>
                <div className="g-gridmodes" id="gGridModes" style={{ display: "none" }}></div>
                <div className="g-body" id="gUploads" style={{ display: "none" }}>
                    <button className="g-up" onClick={() => document.getElementById("fileInput")?.click()} title="上传本地素材"><span className="ico">⬆</span>上传</button>
                    <button className="g-up" id="gPick" title="从素材库选择"><span className="ico">✦</span>选择</button>
                </div>
                <div className="g-inputwrap">
                    <div className="g-nine-tag" id="gNineTag" style={{ display: "none" }}></div>
                    <textarea className="g-input" id="gInput" rows={3} placeholder=""></textarea>
                </div>
                <div className="g-foot">
                    <div className="g-left">
                        <select id="gModel" className="g-sel2" style={{ fontSize: "13px", padding: "6px 10px" }}></select>
                        <select id="gRatio" className="g-sel2"></select>
                        <button className="g-sel" title="引用角色/素材" onClick={call("insertAt")}><b style={{ fontSize: "15px" }}>@</b></button>
                    </div>
                    <div className="g-right">
                        <select id="gCount" className="g-sel2"></select>
                        <span className="g-cost">◆ <b id="gCost">4</b></span>
                        <button className="g-send" id="gSend" title="生成">↑</button>
                    </div>
                </div>
            </div>
            <input type="file" id="fileInput" accept="image/*" style={{ display: "none" }} onChange={(e) => (window as unknown as Engine).onFilePicked?.(e)} />

            {/* 右侧悬浮 Dock：新增 / 资产库 / 主体库 / 素材库 */}
            <div className="dock" id="dock">
                <button className="dock-btn accent" id="dockAdd" title="新增：节点类型与场景模板">＋</button>
                <button className="dock-btn" id="dockAssets" title="资产库：项目中产生的图片/视频资产">🧊</button>
                <button className="dock-btn" id="dockSubjects" title="主体库：预置 IP 形象">🧑‍🎤</button>
                <button className="dock-btn" id="dockStock" title="素材库：场景素材">🗂</button>
                <button className="dock-dot" id="dockVision" title="视觉参考通道状态">●</button>
            </div>
            <div className="dock-panel" id="dockPanel">
                <div className="dp-head"><b id="dpTitle"></b><button id="dpClose" title="收起">✕</button></div>
                <div className="dp-vision" id="dpVision">⚪ 视觉参考检测中…</div>
                <div className="dp-body" id="dpBody"></div>
            </div>

            {/* 缩放栏 */}
            <div className="zoombar">
                <button onClick={call("zoomBy", -0.1)}>−</button>
                <span className="zoom-val" id="zoomVal">100%</span>
                <button onClick={call("zoomBy", 0.1)}>＋</button>
                <button className="txt" onClick={call("resetView")}>适应画布</button>
            </div>

            <div className="toast" id="toast"></div>

            {/* 九宫格类型选择条：点「▦ 九宫格」后顶部出现，选类型后底部对话区带技能前缀直接输入 */}
            <div className="nine-bar" id="nineBar">
                <span className="nb-title">▦ 九宫格</span>
                <span className="nb-sep">|</span>
                <span className="nb-lead">选择类型：</span>
                <span id="nbTypes" style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}></span>
                <button className="nb-close" id="nbClose" title="退出九宫格">✕</button>
            </div>
            <div className="legend" id="legend" title="点击折叠/展开">
                <b>连线图例</b>
                <div className="lg-row"><span className="lg-dot" style={{ background: "#4f8cff" }}></span>可视化：文案 → 图片/视频</div>
                <div className="lg-row"><span className="lg-dot" style={{ background: "#3ecf8e" }}></span>参考：图片 → 图片（延续风格）</div>
                <div className="lg-row"><span className="lg-dot" style={{ background: "#f5a623" }}></span>拆解：素材 → 九宫格 · ⬆ 提升</div>
                <div className="lg-row"><span className="lg-dot" style={{ background: "#f5576c" }}></span>入片：素材 → 合成视频 → 编辑器</div>
            </div>
            <div className="ctx-menu" id="ctxMenu">
                <button onClick={call("ctxAction", "add")}>➕ 添加下游节点</button>
                <button onClick={call("ctxAction", "chain")}>⏩ 从此节点链式生成</button>
                <button onClick={call("ctxAction", "prompt")}>📋 查看生成提示词</button>
                <button onClick={call("ctxAction", "dup")}>⧉ 复制节点</button>
                <button onClick={call("ctxAction", "bind")}>📦 与上游绑定为组</button>
                <button onClick={call("ctxAction", "replace")}>🔄 替换素材</button>
                <button className="danger" onClick={call("ctxAction", "del")}>🗑 删除节点</button>
            </div>

            {/* 编辑器模式（时间线：由画布真实节点数据驱动） */}
            <div id="editorView">
                <div className="ed-top">
                    <div className="ed-preview"><img id="edImg" alt="预览" /></div>
                    <div className="ed-inspector">
                        <h4>片段属性</h4>
                        <div className="row"><span>总时长</span><span id="edDurVal">—</span></div>
                        <div className="row"><span>转场</span><span>硬切 · 即时</span></div>
                        <div className="row"><span>调色风格</span><span>原片直出</span></div>
                        <div className="row"><span>背景音乐</span><span id="edBGMVal">未添加</span></div>
                        <div className="row"><span>字幕</span><span id="edSubVal">—</span></div>
                        <div className="row" style={{ border: "none" }}><span>导出分辨率</span><span>720P · 30fps · webm</span></div>
                    </div>
                </div>
                <div className="timeline" id="timeline">
                    <div className="tl-tools">
                        <button className="play" id="playBtn">▶ 播放</button>
                        <button id="tlExport">⬇ 导出成片</button>
                        <span className="tl-total" id="tlTotal"></span>
                    </div>
                    <div className="track"><div className="tname">视频</div><div className="lane" id="tlVideo"></div></div>
                    <div className="track"><div className="tname">音频</div><div className="lane" id="tlAudio"></div></div>
                    <div className="track"><div className="tname">字幕</div><div className="lane" id="tlSub"></div></div>
                    <div className="playhead" id="playhead"></div>
                </div>
            </div>

            {/* 灯箱预览 */}
            <div id="lightbox" onClick={(e) => { if (e.target === e.currentTarget) (window as unknown as Engine).closeLB?.(); }}>
                <div className="lb-frame"><img id="lbImg" alt="" /></div>
                <div className="lb-cap" id="lbCap"></div>
                <div className="lb-actions">
                    <button className="lb-btn" onClick={call("closeLB")}>关闭</button>
                    <button className="lb-btn lb-acc" id="lbDl">下载素材</button>
                </div>
            </div>

            <Script src="/weavereel.js" strategy="afterInteractive" />
        </>
    );
}
