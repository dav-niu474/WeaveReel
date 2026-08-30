/*
 * 织影 WeaveReel · AI 视频创作工作台 — 后端服务（零依赖 Node >= 18）
 *
 *   node server.js   →  http://localhost:3000
 *
 * API:
 *   GET  /api/project          读取画布项目（首次返回种子项目）
 *   PUT  /api/project          保存画布（节点/连线/视图）
 *   POST /api/upload           上传素材（raw body + X-Filename 头）
 *   POST /api/generate         创建生成任务 {type, prompt, seed, count}
 *   GET  /api/tasks/:id        查询任务进度/结果
 *   GET  /api/scene/:seed      服务端生成风景占位图（SVG）
 *   GET  /api/wave             服务端生成音频波形（SVG）
 * 静态：/ → public/，/uploads/ → uploads/
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PROJECT_FILE = path.join(DATA_DIR, 'project.json');
[DATA_DIR, UPLOAD_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

/* ---------------- 场景图生成（SVG） ---------------- */
const PALS = [
  ['#8fd3f4', '#cfefff', '#2ea8c9', '#7ec850', 0],
  ['#8fd3f4', '#cfefff', '#2ea8c9', '#7ec850', 1],
  ['#9be0c8', '#e2fff2', '#38b2a0', '#5fbf6e', 0],
  ['#ffd89b', '#fff3d6', '#e8a87c', '#c9d96b', 0],
  ['#a6c8ff', '#e4efff', '#4f8cff', '#6fce7e', 0],
  ['#ffb199', '#ffe0d1', '#e07a5f', '#94b860', 0],
  ['#c3aed6', '#efe6ff', '#8e7cc3', '#7ec850', 0],
  ['#8fd3f4', '#cfefff', '#2ea8c9', '#7ec850', 1],
  ['#ffe9a8', '#fffbe6', '#f4a259', '#8ecf70', 0],
];
function sceneSVG(seed, w = 340, h = 190) {
  const p = PALS[Math.abs(seed) % PALS.length];
  const horizon = h * 0.57;
  let stars = '';
  if (p[4]) for (let i = 0; i < 22; i++) stars += `<circle cx='${(i * 97) % w}' cy='${(i * 53) % (horizon * .75)}' r='1' fill='white' opacity='.7'/>`;
  const fig = p[4] ? `<g><circle cx='${w * .44 + 4}' cy='${h * .5}' r='7' fill='#3a3f52'/>
    <path d='M${w * .44 - 4} ${h * .5 + 26} L${w * .44 + 2} ${h * .5 + 8} L${w * .44 + 12} ${h * .5 + 22} L${w * .44 + 16} ${h * .5 + 40} L${w * .44 - 10} ${h * .5 + 40} Z' fill='#f2c94c'/></g>` : '';
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${p[0]}'/><stop offset='1' stop-color='${p[1]}'/></linearGradient></defs>
<rect width='${w}' height='${horizon}' fill='url(#s)'/>${stars}
<circle cx='${w * .78}' cy='${h * .18}' r='${h * .068}' fill='#fff8dc' opacity='.95'/>
<ellipse cx='${w * .28}' cy='${h * .16}' rx='${w * .13}' ry='${h * .05}' fill='white' opacity='.7'/>
<ellipse cx='${w * .36}' cy='${h * .19}' rx='${w * .1}' ry='${h * .04}' fill='white' opacity='.55'/>
<rect y='${horizon}' width='${w}' height='${h * .18}' fill='${p[2]}'/>
<path d='M0 ${horizon} Q ${w * .2} ${horizon - 4} ${w * .45} ${horizon} T ${w} ${horizon} L${w} ${horizon + 8} L0 ${horizon + 8}Z' fill='white' opacity='.25'/>
<path d='M0 ${h * .72} Q ${w * .3} ${h * .66} ${w * .6} ${h * .73} T ${w} ${h * .71} L${w} ${h} L0 ${h} Z' fill='${p[3]}'/>${fig}</svg>`;
}
function waveSVG() {
  let bars = '';
  for (let i = 0; i < 36; i++) {
    const hgt = 8 + Math.abs(Math.sin(i * 0.9)) * 34;
    bars += `<rect x='${16 + i * 9}' y='${50 - hgt / 2}' width='4.5' height='${hgt}' rx='2.2' fill='#f06292' opacity='${(0.45 + Math.abs(Math.sin(i * 0.5)) * 0.55).toFixed(2)}'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='100'><rect width='320' height='100' fill='#141726'/>${bars}<text x='18' y='30' fill='#8b91a7' font-size='13' font-family='sans-serif'>🎵 夏日の風 - BGM</text></svg>`;
}
/* 合成视频预览：把收集到的上游画面拼成胶片条（SVG 内嵌引用本服务图片） */
function composeSVG(frames) {
  const n = frames.length;
  if (!n) return sceneSVG(0, 340, 190);
  const fw = 150, fh = 84, gap = 10, perRow = 4;
  const rows = Math.ceil(n / perRow);
  const W = Math.max(n, 1) >= perRow ? perRow * (fw + gap) - gap + 24 : n * (fw + gap) - gap + 24;
  const H = rows * (fh + 34) + 46;
  let cells = '';
  frames.forEach((f, i) => {
    const col = i % perRow, row = Math.floor(i / perRow);
    const x = 12 + col * (fw + gap), y = 38 + row * (fh + 34);
    const href = f.startsWith('/uploads/') ? '/uploads/' + path.basename(f) : f;
    cells += `<image href='${href}' x='${x}' y='${y}' width='${fw}' height='${fh}' preserveAspectRatio='xMidYMid slice'/>
<rect x='${x}' y='${y}' width='${fw}' height='${fh}' fill='none' stroke='#2a3042' rx='6'/>
<text x='${x + 2}' y='${y + fh + 16}' fill='#8b91a7' font-size='11' font-family='sans-serif'>镜头${i + 1} · 2.0s</text>`;
  });
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>
<rect width='${W}' height='${H}' fill='#141726' rx='10'/>
<text x='14' y='24' fill='#e8eaf2' font-size='13' font-family='sans-serif'>🎬 时间线合成预览 · ${n} 个镜头</text>${cells}</svg>`;
}
/* 分镜拆分：把上游文案按句子切开，每格九宫格用对应句子作提示词 */
function splitShots(text, max) {
  return String(text || '')
    .split(/[。！？!?；;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4)
    .slice(0, Math.max(1, max));
}

/* ---------------- 模型配置（data/config.json，改后刷新页面即生效） ---------------- */
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG = {
  models: {
    text : ['织影 Writer 3.0', '织影 Writer 2.0', '通用大模型'],
    image: ['即梦 5.0 Pro', '即梦 4.0', 'Flux 1.5', 'SDXL'],
    video: ['织影视频 V3', '织影视频 V2 Turbo', '即梦视频 2.0'],
    audio: ['Mureka V9', 'Mureka V6', 'Suno V4'],
  },
};
function loadConfig() {
  try {
    const d = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (d && d.models) return d;
  } catch (_) { /* 首次运行：写出默认配置，方便直接修改 */
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2)); } catch (_) {}
  }
  return DEFAULT_CONFIG;
}

/* ---------------- 项目持久化 ---------------- */
const SEED_PROJECT = {
  nodes: [
    { id: 'n1', type: 'image', x: 140, y: 150, status: 'done', vseed: 0, prompt: '海边草地野餐，女孩穿黄色连衣裙奔跑，蓝天白云，清新夏日风格，电影感构图' },
    { id: 'n2', type: 'nine', x: 700, y: 120, status: 'done', vseed: 0, prompt: '同一场景九个分镜：奔跑、铺野餐垫、野餐、微笑特写、海边合影…' },
    { id: 'n3', type: 'video', x: 1280, y: 150, status: 'done', vseed: 1, prompt: '镜头跟随女孩奔跑，裙摆飘动，阳光洒落，浅景深', dur: '5s' },
  ],
  edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }],
  view: null,
};
function loadProject() {
  try {
    const d = JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf8'));
    if (d && Array.isArray(d.nodes)) return d;
  } catch (_) { /* 首次运行 */ }
  return SEED_PROJECT;
}
function saveProject(p) {
  fs.writeFileSync(PROJECT_FILE, JSON.stringify(p, null, 2));
}

/* ---------------- 生成任务（SenseNova 真实生成，视频/音频仍为模拟） ---------------- */
const tasks = new Map(); // id → task
/* SenseNova 文生图支持的尺寸（来自 /v1/images/generations 报错提示） */
const SIZE_MAP = {
  '16:9': '2752x1536', '9:16': '1536x2752', '1:1': '2048x2048',
  '4:3': '2368x1760', '21:9': '3072x1376',
};
const sizeFromRatio = r => SIZE_MAP[String(r || '').split(' ')[0]] || '2752x1536';

async function callSNText(prompt, model, apiKey, baseUrl) {
  const r = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(150000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      thinking: { type: 'disabled' },   // 关闭思维链，直接输出正文（该网关支持）
      messages: [
        { role: 'system', content: '你是短视频文案写手。根据用户主题直接输出旁白/分镜文案正文，150字以内。只输出正文本身：不要标题、不要选项、不要解释、不要 Markdown 格式。' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error && d.error.message || 'HTTP ' + r.status);
  const m = d.choices && d.choices[0] && d.choices[0].message || {};
  // 推理模型可能把 token 花在 reasoning 上导致 content 为空，此时用思考内容兜底
  return (m.content || '').trim() || (m.reasoning || '').trim().slice(0, 200);
}
async function callSNImage(prompt, model, apiKey, baseUrl, size) {
  const r = await fetch(baseUrl + '/images/generations', {
    method: 'POST',
    signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, prompt, n: 1, size }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error && d.error.message || 'HTTP ' + r.status);
  return d.data && d.data[0] && d.data[0].url || '';
}
/* 生成图下载到本地 uploads/，避免外链过期 */
async function downloadToUploads(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('image download HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const name = 'gen-' + crypto.randomBytes(6).toString('hex') + '.jpg';
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

/* ---------- 上游参考图真实引用：视觉模型描述 → 合并进提示词 ----------
   生图模型（u1 系列）只接受文本输入，无法直接吃参考图；
   因此用带视觉能力的对话模型（input 含 image）先"看"图输出画面描述，
   再把描述拼进下游生成提示词 —— 下游由此真正引用上游图片内容。 */
const refDescCache = new Map();   // 参考图 url → { desc, at }
let visionCooldownUntil = 0;      // 视觉接口限流冷静期，避免每次生成都空等
const VISION_COOLDOWN_MS = 3 * 60 * 1000;

function readUploadFile(url) {
  const f = path.normalize(path.join(UPLOAD_DIR, path.basename(url)));
  if (!f.startsWith(UPLOAD_DIR)) throw new Error('bad ref path');
  return fs.readFileSync(f);
}
async function describeRefImage(refUrl, p) {
  const hit = refDescCache.get(refUrl);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.desc;
  if (Date.now() < visionCooldownUntil) throw new Error('vision cooldown');
  let buf;
  if (refUrl.startsWith('/uploads/')) buf = readUploadFile(refUrl);
  else if (/^https?:/.test(refUrl)) {
    const r = await fetch(refUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('ref fetch HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  } else throw new Error('unsupported ref url');
  const ext = (path.extname(refUrl).slice(1) || 'jpeg').toLowerCase();
  const dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
  const visionModel = p.visionModel || p.textModel;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(p.baseUrl + '/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(90000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.apiKey },
        body: JSON.stringify({
          model: visionModel, max_tokens: 200, thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: [
            { type: 'text', text: '用不超过80字客观描述这张图片的主体、构图、色调与风格，供文生图复用。只输出描述正文。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] }],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error && d.error.message || 'HTTP ' + r.status);
      const m = d.choices && d.choices[0] && d.choices[0].message || {};
      const desc = (m.content || '').trim() || (m.reasoning || '').trim().slice(0, 200);
      if (!desc) throw new Error('empty vision description');
      refDescCache.set(refUrl, { desc, at: Date.now() });
      if (refDescCache.size > 60) refDescCache.delete(refDescCache.keys().next().value);
      return desc;
    } catch (err) {
      lastErr = err;
      if (/429|busy/i.test(String(err.message))) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 8000)); continue; }  // 限流先等 8s 再试一次
        visionCooldownUntil = Date.now() + VISION_COOLDOWN_MS;
        throw err;
      }
      await new Promise(r => setTimeout(r, 1500));   // 其他错误短重试一次
    }
  }
  throw lastErr;
}
/* 描述最多 1 张最近上游参考图，控制时延；失败由调用方降级 */
async function buildRefDescriptions(task, p) {
  if (!task.context.images.length) return [];
  try {
    const desc = await describeRefImage(task.context.images[0].urls[0], p);
    return [desc];
  } catch (_) { return []; }
}

/* ---------- 视觉通道可用性探测：恢复即自动清除冷静期，生成自动升级为视觉参考 ---------- */
const visionStatus = { configured: false, ok: false, lastOkAt: null, lastFailAt: null, lastError: null, probing: false };
const PROBE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
async function probeVision() {
  if (visionStatus.probing) return;
  const cfg = loadConfig();
  const p = cfg.provider && cfg.provider.sensenova;
  visionStatus.configured = !!(p && p.apiKey);
  if (!visionStatus.configured) return;
  visionStatus.probing = true;
  try {
    const r = await fetch(p.baseUrl + '/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.apiKey },
      body: JSON.stringify({
        model: p.visionModel || p.textModel, max_tokens: 10,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '回复ok' },
          { type: 'image_url', image_url: { url: PROBE_IMAGE } },
        ] }],
      }),
    });
    if (r.ok) {
      visionStatus.ok = true; visionStatus.lastOkAt = Date.now(); visionStatus.lastError = null;
      visionCooldownUntil = 0;   // 恢复：立即可用
    } else {
      visionStatus.ok = false; visionStatus.lastFailAt = Date.now();
      const d = await r.json().catch(() => ({}));
      visionStatus.lastError = 'HTTP ' + r.status + (d.error && d.error.message ? ' ' + d.error.message : '');
    }
  } catch (err) {
    visionStatus.ok = false; visionStatus.lastFailAt = Date.now();
    visionStatus.lastError = String(err.message || err);
  }
  visionStatus.probing = false;
}
setInterval(probeVision, 5 * 60 * 1000);
setTimeout(probeVision, 3000);
/* 模拟兜底（视频/音频/未配置 key 时）：
   带上游参考图时演示引用效果 —— 合成片拼胶片条、视频用参考图作封面、图片直接沿用素材 */
function simulateTask(task) {
  task.simulated = true;
  const refs = task.context.images.flatMap(i => i.urls).filter(Boolean);
  if (refs.length && task.type !== 'text' && task.type !== 'audio') {
    if (task.type === 'edit') {
      task.results = ['/api/compose?frames=' + encodeURIComponent(refs.slice(0, 6).join(','))];
    } else {
      task.results = Array.from({ length: Math.max(1, task.count) }, (_, i) => refs[i % refs.length]);
    }
    task.refMode = 'reused';
  }
  const done = () => { task.status = 'done'; task.progress = 100; };
  setTimeout(done, 2500 + Math.random() * 2000);
}
async function runTask(task, opts) {
  const cfg = loadConfig();
  const p = cfg.provider && cfg.provider.sensenova;
  const real = p && p.apiKey && (task.type === 'text' || task.type === 'image' || task.type === 'nine');
  if (!real) return simulateTask(task);
  try {
    /* 上游文字上下文 + 参考图（视觉模型描述 / 主色调）→ 合并进提示词：连线两端真正传递内容 */
    const ctxTexts = task.context.texts.map(t => t.text).join('\n');
    const refDescs = await buildRefDescriptions(task, p);
    task.refMode = refDescs.length ? 'described' : (task.context.images.length ? 'note' : 'none');
    const refParts = task.context.images.map(i => {
      const pal = Array.isArray(i.palette) && i.palette.length ? '，主色调 ' + i.palette.join('、') : '';
      return i.label + pal;
    });
    const refBlock = refDescs.length
      ? '参考画面（需延续其主体、构图、色调与风格）：' + refDescs.join('；') + (refParts.length ? '（' + refParts.join('；') + '）' : '')
      : (task.context.images.length ? '画面需延续参考素材（' + refParts.join('；') + '）的基调与主体' : '');
    const ctxBlock = (ctxTexts ? '上游内容参考：' + ctxTexts : '') + (refBlock ? (ctxTexts ? '；' : '') + refBlock : '');
    if (task.type === 'text') {
      const userContent = (ctxBlock ? ctxBlock + '\n\n本次任务：' : '') + (task.prompt || '一个海边黄昏的短片创意');
      task.promptUsed = userContent;
      task.text = await callSNText(userContent, opts.model || p.textModel, p.apiKey, p.baseUrl);
    } else {
      const n = Math.max(1, Math.min(9, task.count || 1));
      const size = sizeFromRatio(opts.ratio);
      const basePrompt = (task.prompt || '海边黄昏电影感画面') + (ctxBlock ? '，' + ctxBlock : '');
      /* 九宫格分镜：上游文案按句拆分，每格一个分镜提示词（真正的"文本→分镜"） */
      const shots = task.type === 'nine' && ctxTexts ? splitShots(ctxTexts, n) : [];
      task.shots = shots;
      const urls = [], cellPrompts = [];
      for (let i = 0; i < n; i++) {
        let q;
        if (shots.length) {
          q = shots[i % shots.length] + '，' + (task.prompt || '电影感画面，统一场景与角色');
          if (refBlock) q += '，' + refBlock;
        } else {
          q = n > 1 ? basePrompt + '，画面变体 ' + (i + 1) : basePrompt;
        }
        cellPrompts.push(q);
        const u = await callSNImage(q, opts.model || p.imageModel, p.apiKey, p.baseUrl, size);
        if (!u) throw new Error('empty image url');
        urls.push(await downloadToUploads(u));
      }
      task.results = urls;
      task.cellPrompts = cellPrompts;
      task.promptUsed = shots.length ? cellPrompts.join(' ── ') : cellPrompts[0];
    }
    task.status = 'done'; task.progress = 100;
  } catch (err) {
    task.status = 'error';
    task.error = String(err.message || err);
  }
}
function createTask(input) {
  const id = 't' + crypto.randomBytes(6).toString('hex');
  /* context = 前端递归收集的上游节点内容；linkSeed = 上游画面 seed，模拟链路用 */
  const ctx = input.context && typeof input.context === 'object' ? input.context : {};
  const task = {
    id, type: input.type || 'image', prompt: input.prompt || '',
    status: 'running', progress: 0, createdAt: Date.now(),
    count: Math.max(1, Math.min(9, parseInt(input.count, 10) || 1)),
    context: {
      texts: Array.isArray(ctx.texts) ? ctx.texts.filter(t => t && t.text).slice(0, 6) : [],
      images: Array.isArray(ctx.images)
        ? ctx.images.filter(i => i && Array.isArray(i.urls) && i.urls.length).slice(0, 4)
            .map(i => ({
              label: String(i.label || '参考素材').slice(0, 20),
              urls: i.urls,
              palette: Array.isArray(i.palette) ? i.palette.filter(c => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3) : [],
            }))
        : [],
    },
    seedBase: Number.isFinite(input.linkSeed) ? ((input.linkSeed % 97) + 97) % 97 : null,
  };
  tasks.set(id, task);
  runTask(task, { model: input.model, ratio: input.ratio }).catch(() => {});
  return task;
}
/* 进度：真实任务按预估时长推进到 90%，完成由 runTask 置 100 */
setInterval(() => {
  for (const t of tasks.values()) {
    if (t.status !== 'running') continue;
    const est = t.type === 'text' ? 45000 : t.type === 'nine' ? 60000 : 20000;
    t.progress = Math.min(90, ((Date.now() - t.createdAt) / est) * 90);
  }
  if (tasks.size > 300) {
    const done = [...tasks.values()].filter(t => t.status !== 'running').sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < done.length - 150; i++) tasks.delete(done[i].id);
  }
}, 400);
function taskView(t) {
  /* 模拟结果：seedBase 来自上游节点 → 下游占位图延续上游画面基调 */
  const base = t.seedBase != null ? t.seedBase : Math.abs(t.id.length) % 97;
  const results = t.results || Array.from({ length: t.count }, (_, i) => '/api/scene/' + ((base + i * 3) % 97));
  return {
    id: t.id, type: t.type, status: t.status, progress: Math.round(t.progress),
    text: t.text || null, error: t.error || null,
    resultUrl: results[0], results,
    baseSeed: t.seedBase != null ? t.seedBase : null,
    usedContext: { texts: t.context.texts.length, images: t.context.images.length },
    refMode: t.refMode || null,   // described=视觉模型已参考图片 · note=仅提示词说明 · reused=模拟沿用素材
    simulated: !!t.simulated,
    promptUsed: t.promptUsed || null,
    cellPrompts: t.cellPrompts || null,   // 九宫格分镜时每格实际使用的提示词
    shots: t.shots || null,
    waveUrl: t.type === 'audio' ? '/api/wave' : null,
  };
}

/* ---------------- HTTP 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
};
function send(res, code, body, type, cache) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headers = { 'Content-Type': type || 'application/json; charset=utf-8', 'Content-Length': buf.length };
  if (cache) headers['Cache-Control'] = cache;
  res.writeHead(code, headers);
  res.end(buf);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));
function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function safeExt(name, contentType) {
  let ext = '';
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  if (m && MIME['.' + m[1].toLowerCase()]) ext = '.' + m[1].toLowerCase();
  if (!ext && contentType) {
    const e = Object.entries(MIME).find(([, v]) => v.split(';')[0] === contentType.split(';')[0]);
    if (e) ext = e[0];
  }
  return ext || '.bin';
}
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // 开发服务器：页面资源禁用缓存，保证改动即时生效；上传素材与生成图可缓存
    const noCache = ['.html', '.js', '.css'].includes(ext) && filePath.startsWith(PUB);
    send(res, 200, buf, type, noCache ? 'no-cache' : 'public, max-age=86400');
  });
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    /* ---- API ---- */
    if (p === '/api/project' && req.method === 'GET') return json(res, 200, loadProject());

    if (p === '/api/config' && req.method === 'GET') return json(res, 200, loadConfig());

    if (p === '/api/vision-status' && req.method === 'GET') return json(res, 200, visionStatus);

    if (p === '/api/config' && req.method === 'PUT') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      if (!body || !body.models) return json(res, 400, { error: 'invalid config' });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(body, null, 2));
      return json(res, 200, { ok: true });
    }

    if (p === '/api/project' && req.method === 'PUT') {
      const body = JSON.parse((await readBody(req, 8 * 1024 * 1024)).toString('utf8'));
      if (!body || !Array.isArray(body.nodes)) return json(res, 400, { error: 'invalid project' });
      saveProject({ nodes: body.nodes, edges: body.edges || [], view: body.view || null, savedAt: Date.now() });
      return json(res, 200, { ok: true });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const buf = await readBody(req);
      if (!buf.length) return json(res, 400, { error: 'empty body' });
      const name = 'u' + crypto.randomBytes(6).toString('hex') + safeExt(req.headers['x-filename'], req.headers['content-type']);
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return json(res, 200, { url: '/uploads/' + name, size: buf.length });
    }

    if (p === '/api/generate' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const t = createTask(body);
      return json(res, 200, taskView(t));
    }

    let m;
    if ((m = /^\/api\/tasks\/([A-Za-z0-9]+)$/.exec(p)) && req.method === 'GET') {
      const t = tasks.get(m[1]);
      if (!t) return json(res, 404, { error: 'task not found' });
      return json(res, 200, taskView(t));
    }

    if ((m = /^\/api\/scene\/(-?\d+)$/.exec(p)) && req.method === 'GET') {
      return send(res, 200, sceneSVG(parseInt(m[1], 10)), 'image/svg+xml');
    }
    if (p === '/api/wave' && req.method === 'GET') return send(res, 200, waveSVG(), 'image/svg+xml');
    if (p === '/api/compose' && req.method === 'GET') {
      const frames = (url.searchParams.get('frames') || '')
        .split(',')
        .filter(u => /^\/uploads\/[A-Za-z0-9._-]+$/.test(u) || /^\/api\/scene\/-?\d+$/.test(u))
        .slice(0, 6);
      return send(res, 200, composeSVG(frames), 'image/svg+xml');
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown api' });

    /* ---- 静态：uploads ---- */
    if (p.startsWith('/uploads/')) {
      const f = path.normalize(path.join(UPLOAD_DIR, path.basename(p)));
      if (!f.startsWith(UPLOAD_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
      return serveFile(res, f);
    }

    /* ---- 静态：public ---- */
    const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
    const f = path.normalize(path.join(PUB, rel));
    if (!f.startsWith(PUB)) return send(res, 403, 'Forbidden', 'text/plain');
    return serveFile(res, f);
  } catch (err) {
    return json(res, 500, { error: String(err && err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`织影 WeaveReel server → http://localhost:${PORT}`);
  console.log(`API: /api/project /api/upload /api/generate /api/tasks/:id /api/scene/:seed`);
});
