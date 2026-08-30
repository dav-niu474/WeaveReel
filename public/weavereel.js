/* ================================================================
   织影 WeaveReel · 画布引擎 + 后端 API 对接
   ================================================================ */
'use strict';

/* ============ API 层 ============ */
const api = {
  async getConfig() {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error('GET /api/config ' + r.status);
    return r.json();
  },
  async getProject() {
    const r = await fetch('/api/project');
    if (!r.ok) throw new Error('GET /api/project ' + r.status);
    return r.json();
  },
  async putProject(data) {
    const r = await fetch('/api/project', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('PUT /api/project ' + r.status);
    return r.json();
  },
  async upload(file) {
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    });
    if (!r.ok) throw new Error('POST /api/upload ' + r.status);
    return r.json();
  },
  async generate(payload) {
    const r = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('POST /api/generate ' + r.status);
    return r.json();
  },
  async task(id) {
    const r = await fetch('/api/tasks/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('GET /api/tasks ' + r.status);
    return r.json();
  },
  async getTemplates() {
    const r = await fetch('/api/templates');
    if (!r.ok) throw new Error('GET /api/templates ' + r.status);
    return r.json();
  },
};
const sceneURL = (seed) => '/api/scene/' + (Math.abs(seed) % 97);
const waveURL = () => '/api/wave';

/* ============ 节点间数据流：上游引用 / 上下文收集 ============ */
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const directUpstreams = id => edges.filter(e => e.to === id).map(e => nodes.find(n => n.id === e.from)).filter(Boolean);
const downstreamNodes = id => edges.filter(e => e.from === id).map(e => nodes.find(n => n.id === e.to)).filter(Boolean);
const hasContent = n => n.status === 'done' || !!(n.url || (n.urls && n.urls.length) || (n.type === 'text' && (n.story || n.prompt)));
/* 节点代表内容：文本节点取正文，其余取提示词；占位图（/api/scene）不算真实参考图 */
const PLACEHOLDER_RE = /^(双击或点击下方输入框|上传素材：|素材库场景|根据上游文案|新节点…)/;
const nodeText = n => n.type === 'text' ? (n.story || n.prompt || '') : (n.prompt || '');
const nodeUrls = n => n.type === 'nine' ? (n.urls || []) : (n.url ? [n.url] : []);
const seedOfNode = n => n.vseed != null ? n.vseed : (n.url ? hashStr(n.url) % 97 : hashStr(n.prompt || n.id) % 97);
/* 递归收集上游（多级）：文本进 texts、真实图片进 images、首个媒体节点的 seed 供模拟链路延续画面 */
function collectContext(id) {
  const texts = [], images = [], seen = new Set([id]);
  let seed = null;
  let frontier = directUpstreams(id).map(u => u.id);
  while (frontier.length) {
    const nxt = [];
    for (const uid of frontier) {
      if (seen.has(uid)) continue; seen.add(uid);
      const u = nodes.find(x => x.id === uid); if (!u) continue;
      const t = nodeText(u).trim();
      if (t && !PLACEHOLDER_RE.test(t)) texts.push({ label: u.label || TYPES[u.type].label, text: t.slice(0, 500) });
      const realUrls = nodeUrls(u).filter(x => x && !x.startsWith('/api/')).slice(0, 4);
      if (realUrls.length) images.push({ label: u.label || TYPES[u.type].label, url: realUrls[0], urls: realUrls });
      if (seed === null && u.type !== 'text' && hasContent(u)) seed = seedOfNode(u);
      directUpstreams(uid).forEach(p => nxt.push(p.id));
    }
    frontier = nxt;
  }
  return { texts, images, seed, count: texts.length + images.length };
}
/* 上游内容快照：完成生成时记录在节点上；之后上游内容/连线变化即可判定「上游已更新」 */
function upstreamState(id) {
  const ids = new Set();
  (function walk(pid) { if (ids.has(pid)) return; ids.add(pid); directUpstreams(pid).forEach(u => walk(u.id)); })(id);
  const inner = edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => e.from + '>' + e.to).sort();
  const ctx = collectContext(id);
  return JSON.stringify([ctx.texts, ctx.images.map(i => i.urls), inner]);
}
const isStale = n => n.status === 'done' && !!n.srcState && n.srcState !== upstreamState(n.id);
/* 节点自身内容作为参考源：点能力按钮（全景/打光…）生成时，参考的就是这张图本身 */
function selfRefs(n) {
  const texts = [], images = [];
  if (n.type === 'text') {
    const t = (n.story || '').trim();
    if (t) texts.push({ label: '本节点文案', text: t.slice(0, 500) });
  }
  const urls = nodeUrls(n).filter(x => x && !x.startsWith('/api/')).slice(0, 4);
  if (urls.length) images.push({ label: '本节点画面', urls });
  return { texts, images, seed: urls.length ? seedOfNode(n) : null };
}
/* 从图片提取主色调（canvas 像素聚合），让生图提示词至少真实延续参考图的色调 */
function extractPalette(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        const buckets = {};
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const key = (d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5);
          const b = buckets[key] || (buckets[key] = [0, 0, 0, 0]);
          b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
        }
        const top = Object.values(buckets).sort((a, b) => b[3] - a[3]).slice(0, 3)
          .map(b => '#' + [b[0], b[1], b[2]].map(v => Math.round(v / b[3]).toString(16).padStart(2, '0')).join(''));
        resolve(top);
      } catch (_) { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

/* ============ 数据模型 ============
   四种内容类型节点：文案 / 图片 / 视频 / 音频 —— 每种类型有自己的处理能力（CAPS）。
   九宫格（nine）与合成视频（edit）不是素材库类型，而是能力产物：
   图片节点的「九宫格」能力生成 nine 子节点，「合成视频」能力生成 edit 节点。 */
const TYPES = {
  text : { label: '文案',     icon: '📝', color: '#4f8cff' },
  image: { label: '图片',     icon: '🖼', color: '#3ecf8e' },
  nine : { label: '九宫格',   icon: '▦',  color: '#f5a623' },
  video: { label: '视频',     icon: '🎬', color: '#8b5cf6' },
  audio: { label: '音频',     icon: '🎵', color: '#f06292' },
  edit : { label: '合成视频', icon: '✂️', color: '#f5576c' },
};
let nodes = [];
let edges = [];
/* 节点分组（绑定）：如「主体图 → 特效参考图 → 视频」绑成一个镜头组，整组框住、整组拖动 */
let groups = [];

/* ============ 连线语义：四种线各有含义，非法连线直接拒绝 ============
   viz 可视化(蓝)：文案→图片/视频，把文字画出来
   ref 参考(绿)  ：镜头→镜头 / 图→文案(看图写文案) 等，延续主体与风格
   split 拆解(橙)：任意素材→分镜，拆成多镜头候选
   promote 提升(橙)：九宫格→图片，把某一格晋升为图片节点
   into 入片(红) ：素材→成片，进入时间线 */
const EDGE_OK = {
  text : { text: 1, image: 1, nine: 1, video: 1, edit: 1 },
  image: { text: 1, image: 1, nine: 1, video: 1, edit: 1 },
  nine : { image: 1, video: 1, edit: 1 },
  video: { image: 1, nine: 1, audio: 1, edit: 1 },
  audio: { edit: 1 },
  edit : {},
};
function edgeType(from, to) {
  const f = nodes.find(n => n.id === from), t = nodes.find(n => n.id === to);
  if (!f || !t) return 'ref';
  if (t.type === 'edit') return 'into';
  if (f.type === 'nine' && t.type === 'image') return 'promote';
  if (t.type === 'nine') return 'split';
  if (f.type === 'text' && (t.type === 'image' || t.type === 'video')) return 'viz';
  return 'ref';
}
const EDGE_META = {
  viz:     { color: '#4f8cff', glyph: '✎→', name: '可视化' },
  ref:     { color: '#3ecf8e', glyph: '⇢',  name: '参考' },
  split:   { color: '#f5a623', glyph: '▦',  name: '拆解' },
  promote: { color: '#f5a623', glyph: '⬆',  name: '提升' },
  into:    { color: '#f5576c', glyph: '⬈',  name: '入片' },
};
/** 唯一建线入口：合法性校验 + 去重 + 提示 */
function addEdge(fromId, toId, opts = {}) {
  const f = nodes.find(n => n.id === fromId), t = nodes.find(n => n.id === toId);
  if (!f || !t || fromId === toId) return false;
  if (edges.some(e => e.from === fromId && e.to === toId)) return false;
  if (!EDGE_OK[f.type] || !EDGE_OK[f.type][t.type]) {
    if (!opts.silent) {
      const okTo = Object.keys(EDGE_OK[f.type] || {}).map(k => TYPES[k].label).join(' / ') || '无';
      toast(`✕ ${TYPES[f.type].label} → ${TYPES[t.type].label} 连线无效（${TYPES[f.type].label} 可连：${okTo}）`);
    }
    return false;
  }
  edges.push({ from: fromId, to: toId });
  return true;
}

let scale = 1, panX = 0, panY = 0, selected = null, selectedEdge = null;
const wrap = document.getElementById('canvas-wrap'), vp = document.getElementById('viewport'), svg = document.getElementById('wires');
const $ = id => document.getElementById(id);
const aiToolbar = $('aiToolbar'), genPanel = $('genPanel');

/* ============ 节点渲染 ============ */
/* 注意：节点内所有 <img> 必须 draggable="false"，否则浏览器原生图片拖拽
   会在松手时合成 File 触发上传逻辑，导致「拖动节点 = 复制节点」 */
function mediaHTML(n) {
  if (n.type === 'image') {
    return `<img draggable="false" src="${n.url || sceneURL(n.vseed || 0)}" style="width:340px">`;
  }
  if (n.type === 'nine') {
    const cnt = n.cells || 9, cols = n.cols || 3, base = n.vseed || 0;
    const cells = Array.from({ length: cnt }, (_, i) => {
      const src = (n.urls && n.urls[i]) || sceneURL(base + i * 3);
      return `<div class="nine-cell"><img draggable="false" src="${src}" style="width:100%;height:${cnt > 4 ? '78px' : '110px'};object-fit:cover">` +
        `<button class="cell-promote" data-nine="${n.id}" data-idx="${i}" title="提升为图片节点（可进合成视频）">⬆</button></div>`;
    }).join('');
    return `<div class="nine-grid" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div>`;
  }
  if (n.type === 'video') {
    return `<img draggable="false" src="${n.url || sceneURL((n.vseed || 0) + 1)}" style="width:340px">
      <div class="play-badge"></div><div class="dur-chip">⏱ ${n.dur || '5s'}</div>`;
  }
  if (n.type === 'audio') {
    return `<img draggable="false" src="${n.url || waveURL()}" style="width:320px"><div class="play-badge"></div><div class="dur-chip">⏱ 1:24</div>`;
  }
  if (n.type === 'edit') {
    return `<img draggable="false" src="${n.url || sceneURL((n.vseed || 0) + 2)}" style="width:340px">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;color:#8b91a7;font-size:13px">
      <span style="font-size:22px">🎬</span> 时间线合成预览</div><div class="dur-chip">⏱ ${n.dur || '15s'}</div>`;
  }
  return '';
}
function statusChip(n) {
  if (n.status === 'done') return `<span class="status-chip status-done">✓ 已完成</span>`;
  if (n.status === 'running') return `<span class="status-chip status-running">⏳ ${n.task || '生成中'} ${Math.round(n.progress || 0)}%</span>`;
  return `<span class="status-chip status-idle">待生成</span>`;
}
function renderNode(n) {
  const t = TYPES[n.type];
  const el = document.createElement('div');
  el.className = `node t-${n.type}` + (selected === n.id ? ' selected' : '') + (multiSel.includes(n.id) ? ' multi' : '');
  el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.dataset.id = n.id;
  const media = mediaHTML(n);
  const runMask = (n.status === 'running') ? `<div class="genmask"><div class="spin"></div><span>${n.task || '生成中'} ${Math.round(n.progress || 0)}%</span></div>` : '';
  const body = n.type === 'text'
    ? `<div class="node-text-body"><div class="tt">${n.title || '文案草稿'}</div>${n.story ? esc(n.story) : (n.prompt || '')}</div>`
    : (media ? `<div class="node-media">${media}${statusChip(n)}${runMask}</div>` : '');
  const cardW = (n.type === 'nine' && (n.cells || 9) <= 4) ? ' style="width:340px"' : '';
  const promptRow = (n.type !== 'text') ? `<div style="padding:9px 14px 12px;font-size:12px;color:var(--text-dim);line-height:1.6;max-width:${n.type === 'nine' ? '420px' : '340px'};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">💬 ${n.prompt || ''}</div>` : '';
  /* 上游引用不再用文字标记表达：参考素材以缩略图形式自动出现在生成面板「上传/选择」区。
     节点卡片只保留「⚠ 上游已更新 · 同步」这一个动作角标 */
  const ups = directUpstreams(n.id);   // 合成视频节点的汇集清单用
  const stale = isStale(n);
  const refRow = stale ? `<div class="in-ref"><span class="ref-chip stale" data-sync="${n.id}" title="上游内容已变化，点击重新生成本节点以同步最新内容">⚠ 上游已更新 · 同步</span></div>` : '';
  /* 成片节点：显示汇集清单 + 进编辑器按钮（它不生成，只组装） */
  const editFoot = n.type === 'edit' ? `<div class="ed-stats">${ups.filter(u => u.type === 'image' || u.type === 'nine' || u.type === 'video').length} 素材 · ${ups.filter(u => u.type === 'text').length} 文案 · ${ups.filter(u => u.type === 'audio').length} 音频</div>
    <button class="ed-open" data-ed="${n.id}">⬈ 进编辑器剪辑</button>` : '';
  el.innerHTML = `
    <div class="node-label"><span style="color:${t.color}">${t.icon}</span>${n.label || t.label}</div>
    <div class="node-card"${cardW}>
      ${body || promptRow}${(n.type === 'text') ? promptRow : ''}${refRow}${editFoot}
      <button class="ndel" data-del="${n.id}" title="删除节点 (Delete)">✕</button>
      <div class="port in"  data-node="${n.id}" data-dir="in"  title="输入">＋</div>
      <div class="port out" data-node="${n.id}" data-dir="out" title="输出">＋</div>
    </div>`;
  return el;
}
function render() {
  vp.querySelectorAll('.node').forEach(e => e.remove());
  nodes.forEach(n => vp.appendChild(renderNode(n)));
  renderGroups();
  drawWires();
  applyView();
  const eh = $('emptyHint'); if (eh) eh.style.display = nodes.length ? 'none' : 'flex';
}

/* ============ 节点分组（绑定）：包围盒容器 + 组名 + 整组拖动 ============ */
let multiSel = [];   // Shift+点击 多选，用于绑组
function groupBoxRect(g) {
  const members = g.ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
  if (members.length < 2) return null;   // 组内节点被删光后不再渲染
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  members.forEach(n => {
    const el = nodeEl(n.id);
    const w = el ? el.offsetWidth : 380, h = el ? el.offsetHeight : 240;
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
  });
  return { x: x0 - 26, y: y0 - 58, w: x1 - x0 + 52, h: y1 - y0 + 86 };
}
function renderGroups() {
  vp.querySelectorAll('.group-box').forEach(e => e.remove());
  groups.forEach(g => {
    const r = groupBoxRect(g); if (!r) return;
    const d = document.createElement('div');
    d.className = 'group-box'; d.dataset.gid = g.id;
    d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.w + 'px'; d.style.height = r.h + 'px';
    d.innerHTML = `<div class="group-title" data-gtitle="${g.id}"><span class="gt-name">📦 ${esc(g.name)}</span><span class="group-ops">` +
      `<button data-grename="${g.id}" title="重命名">✎</button><button data-gungroup="${g.id}" title="解散分组">✕</button></span></div>`;
    vp.insertBefore(d, vp.firstChild);
  });
}
/* 节点拖动 / 整组拖动时只刷新几何位置，不重建 DOM */
function updateGroupGeom() {
  groups.forEach(g => {
    const el = vp.querySelector(`.group-box[data-gid="${g.id}"]`);
    const r = groupBoxRect(g);
    if (el && r) { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; }
  });
}
/* 绑定：多选（≥2）直接成组；单选则连同全部上游闭包一起成组（如 主体图→参考图→视频） */
function bindGroup() {
  let ids;
  if (multiSel.length >= 2) ids = [...multiSel];
  else {
    if (!selected) { toast('请选择节点后绑定（Shift+点击可多选）'); return; }
    const set = new Set([selected]);
    let frontier = [selected];
    while (frontier.length) {
      const nxt = [];
      frontier.forEach(id => directUpstreams(id).forEach(u => { if (!set.has(u.id)) { set.add(u.id); nxt.push(u.id); } }));
      frontier = nxt;
    }
    ids = [...set];
  }
  if (ids.length < 2) { toast('至少两个节点才能绑定成组（试试先连出一条链）'); return; }
  const first = nodes.find(n => n.id === ids[0]);
  const defName = (first && (first.prompt || first.title) || '未命名镜头').slice(0, 18);
  const name = prompt('给这组镜头起个名字：', defName) || defName;
  pushUndo();
  groups.push({ id: 'g' + Date.now().toString(36), name, ids });
  multiSel = []; selected = null;
  render(); hideFloaters(); save();
  toast('📦 已绑定 ' + ids.length + ' 个节点为「' + name + '」，拖组名可整体移动');
}
function ungroup(gid) {
  pushUndo();
  groups = groups.filter(g => g.id !== gid);
  render(); save(); toast('🔓 已解散分组（节点与连线保留）');
}
function renameGroup(gid) {
  const g = groups.find(x => x.id === gid); if (!g) return;
  const name = prompt('重命名分组：', g.name);
  if (name == null) return;
  pushUndo();
  g.name = name.trim() || g.name;
  render(); save();
}
/* 整组拖动：按住组名拖动全部成员 */
let groupDrag = null;
function groupDragStart(e, gid) {
  if (e.target.closest('.group-ops')) return;
  e.stopPropagation(); e.preventDefault();
  const g = groups.find(x => x.id === gid); if (!g) return;
  const r = wrap.getBoundingClientRect();
  const wx = (e.clientX - r.left - panX) / scale, wy = (e.clientY - r.top - panY) / scale;
  groupDrag = { g, wx0: wx, wy0: wy, orig: g.ids.map(id => nodes.find(n => n.id === id)).filter(Boolean).map(n => ({ n, x: n.x, y: n.y })), pre: serialize(), moved: false };
}
function applyView() {
  vp.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  positionFloaters();
}
const nodeEl = id => vp.querySelector(`.node[data-id="${id}"]`);
function portPos(id, dir) {
  const n = nodes.find(x => x.id === id), el = nodeEl(id); if (!n || !el) return { x: 0, y: 0 };
  const card = el.querySelector('.node-card');
  return { x: n.x + (dir === 'out' ? card.offsetWidth : 0), y: n.y + card.offsetTop + card.offsetHeight / 2 };
}

/* ============ 连线绘制 ============ */
function wirePath(a, b) { return `M ${a.x} ${a.y} C ${a.x + 120} ${a.y}, ${b.x - 120} ${b.y}, ${b.x} ${b.y}`; }
function wireMid(a, b) {
  const c1x = a.x + 120, c1y = a.y, c2x = b.x - 120, c2y = b.y;
  return { x: (a.x + 3 * c1x + 3 * c2x + b.x) / 8, y: (a.y + 3 * c1y + 3 * c2y + b.y) / 8 };
}
function drawWires(temp) {
  let html = '';
  edges.forEach(e => {
    if (!nodeEl(e.from) || !nodeEl(e.to)) return;
    const a = portPos(e.from, 'out'), b = portPos(e.to, 'in');
    const sel = selectedEdge && selectedEdge.from === e.from && selectedEdge.to === e.to;
    const fn = nodes.find(x => x.id === e.from), tn = nodes.find(x => x.id === e.to);
    /* 连线语义着色：可视化蓝 / 参考绿 / 拆解·提升橙 / 入片红；有内容流动时加亮 */
    const et = EDGE_META[edgeType(e.from, e.to)];
    const fed = fn && hasContent(fn) ? ' fed' : '';
    const style = `stroke="${et.color}"${fed ? '' : ' opacity="0.45"'}`;
    html += `<path class="wire${sel ? ' selected' : ''}${fed}" d="${wirePath(a, b)}" data-edge="${e.from}-${e.to}" ${style}/>`;
    const m = wireMid(a, b);
    html += `<g class="wire-mid" data-edge="${e.from}-${e.to}">
      <circle cx="${m.x}" cy="${m.y}" r="9" fill="${et.color}"/>
      <text x="${m.x}" y="${m.y + 3.5}" text-anchor="middle" font-size="9" fill="#0e1220" font-weight="bold">${et.glyph[0]}</text>
      ${sel ? '' : `<circle cx="${m.x}" cy="${m.y}" r="9" fill="none" stroke="${et.color}" stroke-opacity=".5"/>`}</g>`;
    /* 线旁语义标签：放大到 80% 以上时显示 */
    if (scale >= 0.8 && !sel) {
      html += `<text class="wire-tag" x="${m.x}" y="${m.y - 13}" text-anchor="middle" font-size="10" fill="${et.color}">${et.name}</text>`;
    }
  });
  if (temp) html += `<path d="${wirePath(temp.a, temp.b)}" stroke="#8b7bff" stroke-width="2" fill="none" stroke-dasharray="6 4"/>`;
  svg.innerHTML = html;
  svg.querySelectorAll('.wire').forEach(w => w.addEventListener('mousedown', ev => {
    ev.stopPropagation();
    const [f, t] = w.dataset.edge.split('-');
    selectedEdge = { from: f, to: t }; selected = null; render(); hideFloaters(); toast('已选中连线 · Delete 删除 · 右键也可删除');
  }));
  svg.querySelectorAll('.wire-mid').forEach(g => g.addEventListener('mousedown', ev => {
    ev.stopPropagation(); insertOnWire(g.dataset.edge);
  }));
}
function insertOnWire(key) {
  pushUndo();
  const [f, t] = key.split('-');
  const fn = nodes.find(n => n.id === f), tn = nodes.find(n => n.id === t);
  if (!fn || !tn) return;
  /* 选一个两端都允许的中间类型；不存在则提示无法插入 */
  const cand = ['image', 'text', 'nine', 'video'].find(c => EDGE_OK[fn.type]?.[c] && EDGE_OK[c]?.[tn.type]);
  if (!cand) { toast('✕ 这条连线两端类型无法插入中间节点'); return; }
  const n = { id: uid(), type: cand, x: Math.round((fn.x + tn.x) / 2 - 40), y: Math.round((fn.y + tn.y) / 2 + 30), status: 'idle', prompt: '双击或点击下方输入框，描述这个节点…', dur: cand === 'video' ? '5s' : '—' };
  nodes.push(n);
  edges = edges.filter(e => !(e.from === f && e.to === t));
  addEdge(f, n.id, { silent: true }); addEdge(n.id, t, { silent: true });
  selected = n.id; render(); openPanel(); save(); toast('➕ 已在连线中插入' + TYPES[cand].label + '节点');
}

/* ============ 平移 / 缩放 ============ */
let panning = false, px0, py0;
wrap.addEventListener('mousedown', e => {
  if (e.target === wrap || e.target === vp || e.target === svg) {
    panning = true; px0 = e.clientX - panX; py0 = e.clientY - panY;
    selected = null; selectedEdge = null; render(); hideFloaters();
  }
});
window.addEventListener('mouseup', () => panning = false);
wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.1 : 0.9, ns = Math.min(2.5, Math.max(0.25, scale * f));
  const r = wrap.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  panX = mx - (mx - panX) * (ns / scale); panY = my - (my - panY) * (ns / scale); scale = ns;
  $('zoomVal').textContent = Math.round(scale * 100) + '%'; applyView(); save();
}, { passive: false });
function zoomBy(d) { scale = Math.min(2.5, Math.max(0.25, scale + d)); $('zoomVal').textContent = Math.round(scale * 100) + '%'; applyView(); save(); }
function resetView() {
  if (!nodes.length) return;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs) - 360, maxX = Math.max(...xs) + 500, minY = Math.min(...ys) - 120, maxY = Math.max(...ys) + 320;
  const r = wrap.getBoundingClientRect();
  scale = Math.min(1.2, Math.min(r.width / (maxX - minX), r.height / (maxY - minY)));
  panX = (r.width - (maxX - minX) * scale) / 2 - minX * scale;
  panY = (r.height - (maxY - minY) * scale) / 2 - minY * scale;
  $('zoomVal').textContent = Math.round(scale * 100) + '%'; applyView();
}

/* ============ 节点拖动 ============ */
let dragging = null, linking = null, dragPre = null, dragMoved = false;
/* 画布内禁止原生拖拽（图片/文字选中拖拽都会与自定义拖动冲突） */
vp.addEventListener('dragstart', e => e.preventDefault());
vp.addEventListener('mousedown', e => {
  // 节点 ✕ 删除角标
  const delBtn = e.target.closest('.ndel');
  if (delBtn) { e.stopPropagation(); e.preventDefault(); deleteNode(delBtn.dataset.del); return; }
  // 「上游已更新 · 同步」角标 → 用最新上游内容重新生成本节点
  const syncBtn = e.target.closest('[data-sync]');
  if (syncBtn) {
    e.stopPropagation(); e.preventDefault();
    const tn = nodes.find(x => x.id === syncBtn.dataset.sync);
    if (tn && tn.status !== 'running') { pushUndo(); startGen(tn, '同步上游'); }
    return;
  }
  // 分镜格子「⬆ 提升为镜头」
  const promoBtn = e.target.closest('.cell-promote');
  if (promoBtn) { e.stopPropagation(); e.preventDefault(); promoteCell(promoBtn.dataset.nine, +promoBtn.dataset.idx); return; }
  // 成片节点「⬈ 进编辑器」
  const edBtn = e.target.closest('.ed-open');
  if (edBtn) { e.stopPropagation(); e.preventDefault(); switchMode('editor'); return; }
  // 分组操作：重命名 / 解散 / 按住组名整组拖动
  const gUngroup = e.target.closest('[data-gungroup]');
  if (gUngroup) { e.stopPropagation(); e.preventDefault(); ungroup(gUngroup.dataset.gungroup); return; }
  const gRename = e.target.closest('[data-grename]');
  if (gRename) { e.stopPropagation(); e.preventDefault(); renameGroup(gRename.dataset.grename); return; }
  const gTitle = e.target.closest('[data-gtitle]');
  if (gTitle) { groupDragStart(e, gTitle.dataset.gtitle); return; }
  // Shift+点击 多选节点（用于绑组）
  const nel0 = e.target.closest('.node');
  if (nel0 && e.shiftKey) {
    const id = nel0.dataset.id;
    const i = multiSel.indexOf(id);
    if (i >= 0) multiSel.splice(i, 1); else multiSel.push(id);
    selected = null; hideFloaters(); render();
    if (multiSel.length >= 2) toast('已选 ' + multiSel.length + ' 个节点，点工具条 📦 绑定为组');
    e.stopPropagation(); e.preventDefault(); return;
  }
  const port = e.target.closest('.port');
  if (port) { linking = { from: port.dataset.node, dir: port.dataset.dir }; wrap.classList.add('connecting'); e.stopPropagation(); e.preventDefault(); return; }
  const nel = e.target.closest('.node');
  if (nel) {
    const n = nodes.find(x => x.id === nel.dataset.id);
    const r = wrap.getBoundingClientRect();
    dragPre = serialize(); dragMoved = false;
    dragging = { n, dx: (e.clientX - r.left - panX) / scale - n.x, dy: (e.clientY - r.top - panY) / scale - n.y };
    if (selected !== n.id || multiSel.length) { selected = n.id; multiSel = []; selectedEdge = null; render(); openPanel(); }
    e.stopPropagation();
  }
});
window.addEventListener('mousemove', e => {
  if (groupDrag) {
    const r = wrap.getBoundingClientRect();
    const wx = (e.clientX - r.left - panX) / scale, wy = (e.clientY - r.top - panY) / scale;
    const dx = wx - groupDrag.wx0, dy = wy - groupDrag.wy0;
    if (Math.abs(dx) + Math.abs(dy) > 2) groupDrag.moved = true;
    groupDrag.orig.forEach(o => {
      o.n.x = Math.round(o.x + dx); o.n.y = Math.round(o.y + dy);
      const el = nodeEl(o.n.id);
      if (el) { el.style.left = o.n.x + 'px'; el.style.top = o.n.y + 'px'; }
    });
    updateGroupGeom(); drawWires(); positionFloaters();
    return;
  }
  if (panning) { panX = e.clientX - px0; panY = e.clientY - py0; applyView(); return; }
  if (dragging) {
    dragMoved = true;
    const r = wrap.getBoundingClientRect();
    dragging.n.x = Math.round((e.clientX - r.left - panX) / scale - dragging.dx);
    dragging.n.y = Math.round((e.clientY - r.top - panY) / scale - dragging.dy);
    const self = nodeEl(dragging.n.id);
    const w = self ? self.offsetWidth : 340, h = self ? self.offsetHeight : 220;
    let gx = null, gy = null;
    for (const o of nodes) {
      if (o.id === dragging.n.id) continue;
      const oe = nodeEl(o.id); if (!oe) continue;
      const ocx = o.x + oe.offsetWidth / 2, ocy = o.y + oe.offsetHeight / 2;
      if (gx === null && Math.abs(dragging.n.x + w / 2 - ocx) < 8) { dragging.n.x = Math.round(ocx - w / 2); gx = ocx; }
      if (gy === null && Math.abs(dragging.n.y + h / 2 - ocy) < 8) { dragging.n.y = Math.round(ocy - h / 2); gy = ocy; }
    }
    showGuides(gx, gy);
    const el = nodeEl(dragging.n.id);
    el.style.left = dragging.n.x + 'px'; el.style.top = dragging.n.y + 'px';
    drawWires(); updateGroupGeom(); positionFloaters();
  }
  if (linking) {
    const r = wrap.getBoundingClientRect();
    const mx = (e.clientX - r.left - panX) / scale, my = (e.clientY - r.top - panY) / scale;
    const a = portPos(linking.from, linking.dir);
    drawWires(linking.dir === 'out' ? { a, b: { x: mx, y: my } } : { a: { x: mx, y: my }, b: a });
  }
});
window.addEventListener('mouseup', e => {
  hideGuides();
  if (groupDrag) {
    if (groupDrag.moved) { undoStack.push(groupDrag.pre); redoStack.length = 0; save(); }
    groupDrag = null;
  }
  if (dragging && dragMoved) { undoStack.push(dragPre); redoStack.length = 0; save(); }
  dragging = null;
  if (linking) {
    const port = e.target.closest?.('.port');
    const overNode = e.target.closest?.('.node');
    let linked = false;
    const tryConnect = other => {
      if (!other || other === linking.from) return;
      const from = linking.dir === 'out' ? linking.from : other;
      const to = linking.dir === 'out' ? other : linking.from;
      if (!edges.some(x => x.from === from && x.to === to)) {
        pushUndo();
        if (addEdge(from, to)) { save(); toast('🔗 已连接（' + EDGE_META[edgeType(from, to)].name + '）'); }
      }
      linked = true;
    };
    if (port && port.dataset.dir !== linking.dir) tryConnect(port.dataset.node);
    else if (overNode && overNode.dataset.id) tryConnect(overNode.dataset.id);
    const lc = linking; linking = null; wrap.classList.remove('connecting');
    if (!linked && !port && !overNode) { drawWires(); openQuickCreate(e.clientX, e.clientY, lc); }
    else drawWires();
  }
});

/* ============ 悬浮工具栏 & 生成面板定位 ============ */
function positionFloaters(autoPan) {
  if (!selected) { hideFloaters(); return; }
  const n = nodes.find(x => x.id === selected); if (!n) { hideFloaters(); return; }
  const el = nodeEl(n.id); if (!el) return;
  const r = wrap.getBoundingClientRect();
  const card = el.querySelector('.node-card');
  const sx = r.left + n.x * scale + panX, sy = r.top + (n.y + card.offsetTop) * scale + panY;
  const sw = card.offsetWidth * scale, sh = card.offsetHeight * scale;
  const cx = sx + sw / 2;
  aiToolbar.classList.add('show');
  let tx = cx - aiToolbar.offsetWidth / 2;
  tx = Math.max(232, Math.min(tx, window.innerWidth - aiToolbar.offsetWidth - 16));
  let ty = sy - aiToolbar.offsetHeight - 14;
  if (ty < r.top + 8) ty = r.top + 8;
  aiToolbar.style.left = tx + 'px'; aiToolbar.style.top = ty + 'px';
  const tb = ty + aiToolbar.offsetHeight;
  /* 成片节点只组装不生成：只显示能力工具条，不弹生成面板 */
  if (n.type === 'edit') { genPanel.classList.remove('show'); return; }
  genPanel.classList.add('show');
  let gx = cx - genPanel.offsetWidth / 2;
  gx = Math.max(232, Math.min(gx, window.innerWidth - genPanel.offsetWidth - 12));
  let gy = Math.max(sy + sh + 16, tb + 10);
  const overflow = gy + genPanel.offsetHeight - (r.top + r.height - 8);
  if (overflow > 0) {
    if (autoPan) { panY -= overflow + 8; applyView(); return; }
    gy = r.top + r.height - 8 - genPanel.offsetHeight;
  }
  if (gy < tb + 10) gy = tb + 10;
  genPanel.style.left = gx + 'px'; genPanel.style.top = gy + 'px';
}
function hideFloaters() { aiToolbar.classList.remove('show'); genPanel.classList.remove('show'); $('moreMenu').style.display = 'none'; }

/* ============ AI 能力：每种节点类型有自己的处理方法（对齐参考产品） ============ */
const CAPS = {
  image: [['人物调节', '🧑'], ['全景', '🕶'], ['画质', '🧬'], ['编辑元素', '🧩'], ['九宫格', '▦'], ['画面切分', '🖥'], ['宫格裁剪', '✂️'], ['多角度', '🔄'], ['打光', '💡'], ['标注', '🏷'], ['故事推演', '📖'], ['对口型', '👄'], ['消除笔', '🧽']],
  video: [['截取帧', '🎞'], ['视频增强', '📺'], ['去字幕', '🅰'], ['音频分离', '🎙']],
  nine : [['切换技能', '🎛'], ['提升全部', '⬆'], ['画面切分', '🖥'], ['图片超清', '✨'], ['风格迁移', '🎨']],
  text : [['润色', '✒️'], ['扩写', '📖'], ['分镜拆解', '🎬'], ['提取角色', '🧑‍🎤'], ['翻译', '🌐']],
  audio: [['变奏', '🎼'], ['人声分离', '🎙'], ['循环', '🔁'], ['对口型', '👄']],
  edit : [['进编辑器', '⬈'], ['导出成片', '⬇']],
};
const MORE_CAPS = ['局部重绘', '扩图', '背景替换', '风格化', '去水印'];
function buildToolbar() {
  const n = nodes.find(x => x.id === selected);
  const caps = (n && CAPS[n.type]) || CAPS.image;
  $('aitbCaps').innerHTML = caps.map(([name, ico]) =>
    `<button class="aitb-btn" onclick="capApply('${name}')"><span class="ico">${ico}</span>${name}</button>`).join('');
  $('moreMenu').innerHTML = MORE_CAPS.map(c => `<button onclick="moreApply('${c}')">${c}</button>`).join('');
}

/* 前端 canvas 合成胶片条（dataURL）：SVG 在 <img> 中无法加载外部图片，故不走 /api/compose */
function makeFilmstrip(frames) {
  return Promise.all(frames.map(u => new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = u;
  }))).then(ims => {
    const ok = ims.filter(Boolean);
    if (!ok.length) return '';
    const fw = 150, fh = 84, gap = 8, W = ok.length * (fw + gap) - gap + 16, H = fh + 40;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#141726'; g.fillRect(0, 0, W, H);
    ok.forEach((im, i) => {
      const x = 8 + i * (fw + gap), y = 8;
      const ir = im.width / im.height;
      let dw = fw, dh = fw / ir; if (dh < fh) { dh = fh; dw = fh * ir; }
      g.drawImage(im, x + (fw - dw) / 2, y + (fh - dh) / 2, dw, dh);
      g.fillStyle = '#8b91a7'; g.font = '11px sans-serif';
      g.fillText('镜头' + (i + 1) + ' · 2.0s', x + 2, y + fh + 18);
    });
    return cv.toDataURL('image/jpeg', 0.85);
  });
}

/* 真实生成任务：POST /api/generate → 轮询 /api/tasks/:id（SenseNova 真实生成，失败回退模拟）
   关键：生成前递归收集上游节点内容（文案 + 参考图 + 链路 seed）随请求发送，
   上游输出真正成为下游输入；完成后记录上游快照，供「上游已更新」检测 */
async function startGen(n, taskLabel, opts = {}) {
  if (n.status === 'running') { toast('⏳ 当前节点正在生成中…'); return null; }
  /* 上下文 = 自身已有内容（图→参考图、文案→正文）+ 多级上游内容 */
  const up = collectContext(n.id);
  const self = selfRefs(n);
  const texts = [...self.texts, ...up.texts];
  const images = [...self.images, ...up.images];
  const seed = up.seed != null ? up.seed : self.seed;
  for (const img of images.slice(0, 2)) img.palette = await extractPalette(img.urls[0]);
  const refCount = texts.length + images.length;
  n.status = 'running'; n.progress = 0;
  n.task = taskLabel + (refCount ? ` ·引用${refCount}` : '');
  if (opts.newSeed) n.vseed = Math.floor(Math.random() * 97);
  else if (seed != null && n.type !== 'text' && n.type !== 'audio') n.vseed = seed;  // 延续参考画面基调
  render(); positionFloaters();
  try {
    const t0 = await api.generate({
      type: n.type, prompt: (n.prompt || '') + (opts.instr ? '，' + opts.instr : ''), seed: n.vseed || 0,
      count: opts.count ? opts.count : (n.cells || (n.type === 'nine' ? 9 : 1)),
      model: opts.model, ratio: opts.ratio,
      gridMode: n.type === 'nine' ? (n.gridMode || gridMode) : undefined,
      linkSeed: n.vseed || 0,
      context: { texts, images: images.map(i => ({ label: i.label, urls: i.urls || [i.url], palette: i.palette || [] })) },
    });
    n.taskId = t0.id;
    return await new Promise(resolve => {
      const timer = setInterval(async () => {
        try {
          const t = await api.task(t0.id);
          n.progress = t.progress;
          const mask = nodeEl(n.id) && nodeEl(n.id).querySelector('.genmask span');
          const chip = nodeEl(n.id) && nodeEl(n.id).querySelector('.status-chip');
          if (mask) mask.textContent = `${n.task} ${t.progress}%`;
          if (chip) chip.textContent = `⏳ ${n.task} ${t.progress}%`;
          if (t.status === 'error') {
            clearInterval(timer);
            n.status = 'idle'; n.progress = 0; n.task = null;
            render(); positionFloaters(); save();
            toast('❌ 生成失败：' + (t.error || '未知错误'));
            resolve(false); return;
          }
          if (t.status === 'done') {
            clearInterval(timer);
            n.status = 'done'; n.progress = 100; n.task = null;
            n.srcState = upstreamState(n.id);        // 记录本次生成引用的上游内容
            n.refMode = t.refMode || null;           // 图片参考方式：described/reused/note
            n.promptUsed = t.promptUsed || null;     // 最近一次生成的完整提示词（右键可查看）
            n.cellPrompts = t.cellPrompts || null;   // 九宫格分镜每格提示词
            if (n.type === 'text') {
              if (t.text) n.story = t.text;           // 真实文案回填
            } else if (n.type === 'nine') {
              if (t.results && t.results[0] && !t.results[0].startsWith('/api/scene/')) n.urls = t.results;
              else { n.urls = null; n.vseed = t.baseSeed ?? n.vseed; }   // 模拟结果走场景图
            } else {
              if (t.resultUrl && t.resultUrl.startsWith('/api/scene/') && t.baseSeed != null) n.vseed = t.baseSeed;
              if (n.type === 'edit' && t.refMode === 'reused') {
                const frames = images.flatMap(i => i.urls || [i.url]).slice(0, 4);
                n.url = frames.length ? await makeFilmstrip(frames) : t.resultUrl;
              } else {
                n.url = (n.type === 'audio') ? (t.waveUrl || waveURL()) : t.resultUrl;
              }
            }
            render(); positionFloaters(); save();
            const refTip = t.refMode === 'described' ? '，已参考上游图片画面'
              : t.refMode === 'note' ? '（视觉接口繁忙，已降级为色调+文字参考）'
              : t.refMode === 'reused' ? '，已沿用上游参考素材' : '';
            toast(`✨ 「${taskLabel || '生成'}」已完成` + (refCount ? `（引用 ${refCount} 个来源${refTip}）` : ''));
            resolve(true);
          }
        } catch (err) { clearInterval(timer); n.status = 'done'; render(); resolve(false); }
      }, 600);
    });
  } catch (err) {
    toast('生成请求失败：' + err.message);
    n.status = 'idle'; render();
    return null;
  }
}
/* 能力按钮对应的镜头/处理指令：真实拼进本次生成的提示词，而不是只换个任务名 */
const CAP_PROMPTS = {
  '全景': '超广角全景视角，场景完整宏大',
  '多角度': '同一主体的不同机位角度，视角明显变化',
  '画面切分': '将画面切分为多格分镜构图，节奏分段呈现',
  '视频增强': '视频增强：超高清画质、降噪、细节锐利、稳定流畅',
  '去字幕': '去除画面中的字幕与文字水印，画面干净完整',
  '打光': '电影感打光，暖调主光加轮廓光',
  '消除笔': '画面干净无杂物',
  '画质': '超高清画质，细节锐利，8K 质感',
  '人物调节': '调整画面中人物的姿态与表情：保持身份、服装与画风一致，动作自然',
  '编辑元素': '画面元素分层编辑：主体突出，背景与前景独立调整，层次分明',
  '视频超清': '超高清画质，细节锐利',
  '风格迁移': '统一艺术风格化处理',
  '局部重绘': '局部细节重绘，其余部分保持一致',
  '扩图': '画面向外延展，构图完整',
  '背景替换': '更换背景环境，主体保持不变',
  '风格化': '强烈风格化视觉处理',
  '去水印': '画面纯净无水印',
  '故事推演': '推演故事的下一幕画面',
  '对口型': '人物口型与语音同步的自然神态',
  '延长': '镜头延续，动作连贯顺滑',
  '慢放': '慢镜头，动作放慢而细腻',
  '循环': '首尾呼应可无缝循环的画面',
  '变奏': '变奏旋律，情绪层层递进',
  '人声分离': '纯净人声',
  '加字幕': '同步字幕',
  '智能配音': '贴合画面的配音',
  '统一调色': '统一电影感调色',
  '润色': '请润色优化参考文案，保持原意，语言更流畅有感染力',
  '扩写': '请扩写参考文案，丰富细节与画面感',
  '分镜拆解': '请把参考内容拆解为分镜脚本',
  '提取角色': '请提取参考内容中的角色设定',
  '翻译': '请将参考内容翻译成英文',
};
function capApply(name) {
  const n = nodes.find(x => x.id === selected); if (!n) return;
  if ((name === '九宫格' || name === '拆解分镜') && n.type === 'image') { openNineModal(n.id); return; }
  if (name === '宫格裁剪') { gridCrop(n); return; }
  if (name === '标注') { annotate(n); return; }
  if (name === '合成视频' || name === '整组入片') { capCompose(); return; }
  if (name === '进编辑器') { switchMode('editor'); return; }
  if (name === '导出成片') { exportFilm(); return; }
  if (name === '切换技能') { setTab('image'); openPanel(); toast('🎛 在下方技能条选择技能：切换即按新技能重新生成九宫格'); return; }
  if (name === '提升全部') { promoteAll(n.id); return; }
  if (name === '截取帧') { extractFrame(n); return; }
  if (name === '音频分离') { splitAudio(n); return; }
  if (n.status === 'running') { toast('⏳ 当前节点正在生成中…'); return; }
  const variety = ['全景', '打光', '消除笔', '画质', '风格迁移', '局部重绘', '扩图', '背景替换', '风格化', '去水印', '视频增强', '去字幕', '多角度', '人物调节', '编辑元素'].includes(name);
  startGen(n, name, { newSeed: variety, instr: CAP_PROMPTS[name] });
}
/* 视频截取帧：从视频节点取当前画面生成图片子节点 */
function extractFrame(v) {
  if (!v || v.type !== 'video') return;
  pushUndo();
  const f = { id: uid(), type: 'image', x: v.x + 460, y: v.y - 20, status: 'done', progress: 100, prompt: '截取帧：' + (v.prompt || ''), url: v.url || sceneURL(v.vseed || 0), vseed: v.vseed };
  nodes.push(f); addEdge(v.id, f.id, { silent: true });
  selected = f.id; render(); openPanel(); save();
  toast('🎞 已截取帧为图片节点，可继续用图片能力处理');
}
/* 视频音频分离：生成音频子节点（当前为波形占位，视频能力接入后自动生效） */
function splitAudio(v) {
  if (!v || v.type !== 'video') return;
  pushUndo();
  const a = { id: uid(), type: 'audio', x: v.x + 460, y: v.y + 220, status: 'done', progress: 100, prompt: '音频分离：' + (v.prompt || '视频原声'), url: waveURL(), dur: v.dur || '—' };
  nodes.push(a); addEdge(v.id, a.id, { silent: true });
  selected = a.id; render(); openPanel(); save();
  toast('🎙 已分离音频节点（当前为占位波形）');
}
function moreApply(name) { $('moreMenu').style.display = 'none'; capApply(name); }
function addNineChild(src, opts = {}) {
  if (nodes.some(x => x.type === 'nine' && edges.some(e => e.from === src.id && e.to === x.id))) { toast('▦ 该图片已有九宫格节点'); return; }
  pushUndo();
  const mode = opts.mode || gridMode;
  const cells = opts.cells || 9;
  const cols = cells >= 6 ? 3 : 2;
  /* 用弹窗里选定的技能与宫格数创建子节点：不同场景输出不同规格的九宫格 */
  const n = { id: uid(), type: 'nine', x: src.x + 460, y: src.y - 20, status: 'idle',
    prompt: opts.prompt || '基于当前图片生成九宫格分镜…', vseed: Math.floor(Math.random() * 97),
    gridMode: mode, cells, cols, label: (cells === 9 ? '九宫格' : cells + '宫格') + ' · ' + gridModeLabel(mode) };
  nodes.push(n); addEdge(src.id, n.id, { silent: true });
  selected = n.id; render(); save(); toast('▦ 已创建' + n.label + '节点，开始生成');
  startGen(n, gridModeLabel(mode), { count: cells, ratio: opts.ratio });
}

/* ============ 九宫格能力弹窗：选技能 → 来源图 → 宫格数/比例 → 发送 ============ */
let nineModalState = { mode: 'inspire', cells: 9 };
function openNineModal(srcId) {
  const src = nodes.find(x => x.id === srcId); if (!src) return;
  const m = $('nineModal');
  m.dataset.src = srcId;
  nineModalState = { mode: src.gridMode || 'inspire', cells: src.cells || 9 };
  $('nmSrcImg').src = src.url || sceneURL(src.vseed || 0);
  $('nmSrcLabel').textContent = '来源：' + ((src.prompt || '').slice(0, 18) || '图片');
  $('nmPrompt').value = '';
  $('nmRatio').innerHTML = ['16:9 · 1K', '9:16 · 1K', '1:1 · 1K', '4:3 · 1K'].map(r => `<option>${r}</option>`).join('');
  if (!$('nmClose')._wired) {
    $('nmClose').onclick = closeNineModal;
    $('nmSend').onclick = sendNineModal;
    $('nmClose')._wired = true;
  }
  renderNineModal();
  m.classList.add('show');
}
function renderNineModal() {
  const m = $('nineModal');
  $('nmTypes').innerHTML = GRID_MODES.map(([id, label, ico]) =>
    `<button class="gm-chip${id === nineModalState.mode ? ' active' : ''}" data-nm="${id}">${ico} ${label}</button>`).join('');
  m.querySelectorAll('[data-nm]').forEach(b => b.onclick = () => { nineModalState.mode = b.dataset.nm; renderNineModal(); });
  $('nmModeTag').textContent = gridModeLabel(nineModalState.mode) + ' /';
  $('nmPrompt').placeholder = '请输入九宫格生成提示词…';
  $('nmCells').innerHTML = [[9, '九宫格'], [6, '六宫格'], [4, '四宫格'], [2, '双图对比']]
    .map(([c, label]) => `<option value="${c}"${c === nineModalState.cells ? ' selected' : ''}>${label} · 满足${c === 9 ? '完整叙事' : c === 6 ? '紧凑叙事' : c === 4 ? '关键节拍' : '前后对比'}场景</option>`).join('');
  $('nmCells').onchange = e => { nineModalState.cells = +e.target.value; $('nmCost').textContent = nineModalState.cells * 2; };
  $('nmCost').textContent = nineModalState.cells * 2;
}
function closeNineModal() { $('nineModal').classList.remove('show'); }
function sendNineModal() {
  const src = nodes.find(x => x.id === $('nineModal').dataset.src); if (!src) return;
  const prompt = $('nmPrompt').value.trim();
  if (!prompt) { toast('请输入九宫格生成提示词'); return; }
  addNineChild(src, { mode: nineModalState.mode, cells: nineModalState.cells, ratio: $('nmRatio').value, prompt });
  closeNineModal();
}
/* 点击弹窗外关闭 */
window.addEventListener('click', e => {
  const m = $('nineModal');
  if (m && m.classList.contains('show') && !e.target.closest('#nineModal') && !e.target.closest('.aitb-btn')) closeNineModal();
});

/* ============ 图片工具：宫格裁剪（canvas 真实切片）与标注（canvas 底部字幕条） ============ */
async function uploadCanvasBlob(cv, name) {
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
  return api.upload(new File([blob], name, { type: 'image/jpeg' }));
}
function gridCrop(n) {
  if (!n || n.type !== 'image' || !n.url) { toast('请先选择有画面的图片节点'); return; }
  toast('✂️ 正在裁剪宫格…');
  const im = new Image();
  im.onload = async () => {
    pushUndo();
    const N = 3, cw = Math.floor(im.width / N), ch = Math.floor(im.height / N);
    let made = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(im, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
      const up = await uploadCanvasBlob(cv, 'crop.jpg');
      const child = { id: uid(), type: 'image', x: n.x + 460 + c * 100, y: n.y - 120 + r * 110,
        status: 'done', progress: 100, prompt: '宫格裁剪 ' + (r * N + c + 1) + '/9：' + (n.prompt || ''), url: up.url, vseed: ((n.vseed || 0) + r * 3 + c) % 97 };
      nodes.push(child); addEdge(n.id, child.id, { silent: true }); made++;
    }
    render(); save(); toast('✂️ 已裁剪为 ' + made + ' 张子图（已转存素材库）');
  };
  im.onerror = () => toast('图片加载失败，无法裁剪');
  im.src = n.url;
}
function annotate(n) {
  if (!n || n.type !== 'image' || !n.url) { toast('请先选择有画面的图片节点'); return; }
  const text = prompt('输入要标注在图片下方的内容：');
  if (!text) return;
  const im = new Image();
  im.onload = async () => {
    const barH = Math.max(40, Math.round(im.width / 14));
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height + barH;
    const g = cv.getContext('2d');
    g.drawImage(im, 0, 0);
    g.fillStyle = 'rgba(10,14,24,.92)'; g.fillRect(0, im.height, cv.width, barH);
    g.fillStyle = '#fff'; g.font = Math.round(barH * 0.48) + 'px sans-serif';
    g.fillText(text.slice(0, 60), 14, im.height + barH * 0.68);
    const up = await uploadCanvasBlob(cv, 'annotated.jpg');
    pushUndo();
    const child = { id: uid(), type: 'image', x: n.x + 460, y: n.y + 60, status: 'done', progress: 100,
      prompt: '标注：' + text, url: up.url, vseed: n.vseed };
    nodes.push(child); addEdge(n.id, child.id, { silent: true });
    selected = child.id; render(); openPanel(); save(); toast('🏷 已生成标注版图片');
  };
  im.onerror = () => toast('图片加载失败，无法标注');
  im.src = n.url;
}
function capCompose() {
  const n = nodes.find(x => x.id === selected);
  if (n && n.type === 'edit') { switchMode('editor'); return; }   // 成片节点再点 = 进编辑器
  pushUndo();
  const m = { id: uid(), type: 'edit', x: (n ? n.x + 460 : 400), y: (n ? n.y : 200), status: 'idle', prompt: '汇集上游素材，双击进入编辑器剪辑成片', vseed: Math.floor(Math.random() * 97) };
  nodes.push(m);
  if (n) addEdge(n.id, m.id, { silent: true });
  selected = m.id; render(); hideFloaters(); save(); toast('⬈ 已创建成片节点，点击「进编辑器」开始剪辑');
}
/* ============ 九宫格 → 图片：把一格晋升为独立图片节点（能力产物的再加工通道） ============ */
function promoteCell(nineId, idx) {
  const nine = nodes.find(x => x.id === nineId);
  if (!nine || nine.type !== 'nine') return;
  const cnt = nine.cells || 9;
  if (nodes.some(x => x.type === 'image' && x.fromNine === nine.id && x.fromIdx === idx)) { toast('⬆ 该格已提升过'); return; }
  pushUndo();
  const cols = nine.cols || 3;
  const shot = {
    id: uid(), type: 'image', x: nine.x + 480, y: nine.y + (Math.floor(idx / cols)) * 40 + (idx % cols) * 36 - 60,
    status: 'idle', prompt: (nine.cellPrompts && nine.cellPrompts[idx]) || nine.prompt || '',
    fromNine: nine.id, fromIdx: idx,
  };
  if (nine.urls && nine.urls[idx] && !nine.urls[idx].startsWith('/api/scene/')) shot.url = nine.urls[idx];
  else shot.vseed = ((nine.vseed || 0) + idx * 3) % 97;
  nodes.push(shot); addEdge(nine.id, shot.id, { silent: true });
  selected = shot.id; render(); openPanel(); save();
  toast('⬆ 第 ' + (idx + 1) + ' 格已提升为图片节点' + (shot.url ? '（沿用分镜画面）' : '，可生成出图'));
}
function promoteAll(nineId) {
  const nine = nodes.find(x => x.id === nineId);
  if (!nine || nine.type !== 'nine') return;
  const cnt = nine.cells || 9;
  pushUndo();
  let made = 0;
  for (let i = 0; i < cnt; i++) {
    if (nodes.some(x => x.type === 'image' && x.fromNine === nine.id && x.fromIdx === i)) continue;
    const shot = {
      id: uid(), type: 'image', x: nine.x + 480 + Math.floor(i / 3) * 60, y: nine.y + i * 46 - 100,
      status: 'idle', prompt: (nine.cellPrompts && nine.cellPrompts[i]) || nine.prompt || '',
      fromNine: nine.id, fromIdx: i,
    };
    if (nine.urls && nine.urls[i] && !nine.urls[i].startsWith('/api/scene/')) shot.url = nine.urls[i];
    else shot.vseed = ((nine.vseed || 0) + i * 3) % 97;
    nodes.push(shot); addEdge(nine.id, shot.id, { silent: true }); made++;
  }
  render(); save();
  toast('⬆ 已提升 ' + made + ' 格为图片节点，可逐格生成或 ⚡ 合成视频');
}
function composeAll() {
  capCompose();
  const m = nodes[nodes.length - 1]; startGen(m, '一键成片');
}

/* ============ 链式生成：从所选节点沿连线向下游逐级生成，上游输出即下游输入 ============ */
let chainBusy = false;
async function runChain() {
  const start = nodes.find(x => x.id === selected);
  if (!start) { toast('请先选择链式生成的起始节点'); return; }
  if (chainBusy) { toast('⏳ 链式生成进行中…'); return; }
  const order = [], seen = new Set([start.id]);
  let frontier = [start.id];
  while (frontier.length) {
    const nxt = [];
    for (const id of frontier) for (const d of downstreamNodes(id)) if (!seen.has(d.id)) { seen.add(d.id); nxt.push(d.id); order.push(d.id); }
    frontier = nxt;
  }
  if (!order.length) { toast('当前节点没有下游节点：拖动输出端口连线后再试'); return; }
  /* 链路预告：沿线统计各语义段，让用户在执行前知道这条链会做什么 */
  const flow = {};
  order.forEach(id => directUpstreams(id).forEach(u => {
    if (seen.has(u.id) || u.id === start.id) { const et = EDGE_META[edgeType(u.id, id)]; flow[et.name] = (flow[et.name] || 0) + 1; }
  }));
  const flowTxt = Object.entries(flow).map(([k, v]) => v + '×' + k).join(' → ');
  chainBusy = true;
  toast(`⚡ 链式生成开始 · 共 ${order.length} 个下游节点${flowTxt ? '（' + flowTxt + '）' : ''}`);
  for (const id of order) {
    const n = nodes.find(x => x.id === id); if (!n) continue;
    selected = id; render(); openPanel();
    const ok = await startGen(n, '链式 · ' + TYPES[n.type].label);
    if (ok === false && n.status !== 'done') {
      toast('⚠ 链式生成在「' + TYPES[n.type].label + '」节点失败，已中断');
      chainBusy = false; return;
    }
  }
  chainBusy = false;
  save();
  toast('✅ 链式生成全部完成');
}

/* ============ 生成面板 ============ */
/* 九宫格技能：不同技能 → 服务端不同逐格分镜策略（灵感风暴/故事叙述/武打分镜/全景机位/舞蹈动作） */
const GRID_MODES = [
  ['inspire',  '灵感风暴', '💡'],
  ['story',    '故事叙述', '📖'],
  ['action',   '武打分镜', '🥋'],
  ['panorama', '全景机位', '🎥'],
  ['dance',    '舞蹈动作', '💃'],
];
const gridModeLabel = id => (GRID_MODES.find(m => m[0] === id) || GRID_MODES[0])[1];
let gridMode = 'inspire';
function renderGridModes(activeId) {
  const box = $('gGridModes'); if (!box) return;
  box.innerHTML = '<span class="gm-lead">▦ 技能：</span>' + GRID_MODES.map(([id, label, ico]) =>
    `<button class="gm-chip${id === (activeId || gridMode) ? ' active' : ''}" data-gm="${id}" title="${label}">${ico} ${label}</button>`).join('');
  box.querySelectorAll('.gm-chip').forEach(b => b.addEventListener('click', () => {
    gridMode = b.dataset.gm;
    const n = nodes.find(x => x.id === selected);
    if (n && n.type === 'nine') {           // 已有九宫格节点：切换技能并重生成
      n.gridMode = gridMode; n.label = '九宫格 · ' + gridModeLabel(gridMode);
      render();
      if (n.status !== 'running') startGen(n, gridModeLabel(gridMode));
    } else renderGridModes(gridMode);
  }));
}
const GEN_TABS = {
  text : { ph: '输入你想要创作的文本内容，如：一段 30 秒海边短片的旁白文案', models: ['织影 Writer 3.0', '织影 Writer 2.0', '通用大模型'], ratio: [], count: ['1篇'], cost: 1, upload: false, tabDefault: ['text'] },
  image: { ph: '描述你想要生成的图片，或输入 @ 引用角色', models: ['即梦 5.0 Pro', '即梦 4.0', 'Flux 1.5', 'SDXL'], ratio: ['16:9 · 1K', '9:16 · 1K', '1:1 · 1K', '4:3 · 1K', '16:9 · 2K'], count: ['1张', '2张', '4张', '9张'], cost: 4, upload: true, tabDefault: ['image', 'nine'] },
  video: { ph: '描述你想要生成的视频画面与镜头运动，或输入 @ 引用角色', models: ['织影视频 V3', '织影视频 V2 Turbo', '即梦视频 2.0'], ratio: ['16:9 · 1080P', '9:16 · 1080P', '1:1 · 720P', '4K'], count: ['5s', '10s'], cost: 20, upload: true, tabDefault: ['video', 'edit'] },
  audio: { ph: '输入你想要创作的音乐内容', models: ['Mureka V9', 'Mureka V6', 'Suno V4'], ratio: [], count: ['1首'], cost: 3, upload: false, tabDefault: ['audio'] },
};
let curTab = 'image';
/* 节点类型 → 允许的生成 Tab：选中节点时面板只出现属于该类型的功能 */
const TYPE_TAB = { text: 'text', image: 'image', nine: 'image', video: 'video', audio: 'audio', edit: null };
/* 收集当前节点将自动携带的参考图（自身 + 多级上游），渲染为面板缩略图 */
function renderRefChips(n) {
  const row = $('gUploads');
  if (!row) return;
  row.querySelectorAll('.ref-thumb').forEach(e => e.remove());
  if (!n) return;
  const self = selfRefs(n);
  const up = collectContext(n.id);
  const refs = [...self.images, ...up.images].slice(0, 4);
  refs.forEach(im => {
    const d = document.createElement('div');
    d.className = 'ref-thumb';
    d.title = '已自动引用的参考素材：' + im.label + '（生成时随提示词一起送给模型）';
    d.innerHTML = `<img src="${im.urls[0]}" alt=""><span>${esc((im.label || '参考').slice(0, 6))}</span>`;
    row.appendChild(d);
  });
  return refs.length;
}
function setTab(tab) {
  curTab = tab;
  const cfg = GEN_TABS[tab];
  const n = nodes.find(x => x.id === selected);
  const allowed = n ? TYPE_TAB[n.type] : null;   // 选中节点 → 只显示该类型自己的生成 Tab
  document.querySelectorAll('#gTabs button[data-tab]').forEach(b => {
    b.style.display = (!allowed || b.dataset.tab === allowed) ? '' : 'none';
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('#gTabs .tsep').forEach(s => s.style.display = allowed ? 'none' : '');
  const refCount = renderRefChips(n) || 0;
  $('gUploads').style.display = (cfg.upload || refCount) ? 'flex' : 'none';
  $('gInput').placeholder = cfg.ph;
  $('gModel').innerHTML = cfg.models.map(m => `<option>${m}</option>`).join('');
  const ratioSel = $('gRatio');
  ratioSel.style.display = cfg.ratio.length ? '' : 'none';
  ratioSel.innerHTML = cfg.ratio.map(r => `<option>${r}</option>`).join('');
  $('gCount').innerHTML = cfg.count.map(c => `<option>${c}</option>`).join('');
  $('gCost').textContent = cfg.cost;
  /* 九宫格技能选择条：仅图片生成 Tab 展示；选中九宫格节点时高亮其技能 */
  const gm = $('gGridModes');
  if (gm) {
    /* 技能属于九宫格功能：面板技能条只在九宫格节点上显示（图片节点经「▦ 九宫格」弹窗选技能） */
    gm.style.display = (tab === 'image' && n && n.type === 'nine') ? 'flex' : 'none';
    if (gm.style.display === 'flex' && n.gridMode) gridMode = n.gridMode;
    if (gm.style.display === 'flex') renderGridModes(gridMode);
  }
}
function tabForNodeType(t) {
  for (const [tab, cfg] of Object.entries(GEN_TABS)) if (cfg.tabDefault.includes(t)) return tab;
  return 'text';
}
function openPanel() {
  const n = nodes.find(x => x.id === selected); if (!n) { hideFloaters(); return; }
  buildToolbar();
  setTab(tabForNodeType(n.type));
  if (curTab === tabForNodeType(n.type)) $('gInput').value = n.prompt || '';
  positionFloaters(true);
}
document.querySelectorAll('#gTabs button[data-tab]').forEach(b => b.addEventListener('click', () => {
  const n = nodes.find(x => x.id === selected);
  setTab(b.dataset.tab);
  if (n && tabForNodeType(n.type) !== curTab) $('gInput').value = '';
  positionFloaters();
}));
$('gExpand').addEventListener('click', () => { genPanel.classList.toggle('big'); positionFloaters(); });
$('gInput').addEventListener('input', () => {
  const n = nodes.find(x => x.id === selected);
  if (n) {
    n.prompt = $('gInput').value;
    const el = nodeEl(n.id);
    const row = el && el.querySelector('[style*="-webkit-line-clamp"]');
    if (row) row.innerHTML = '💬 ' + (n.prompt || '').replace(/</g, '&lt;');
    save();
  }
});
function insertAt() {
  const inp = $('gInput');
  const s = inp.selectionStart || inp.value.length;
  inp.value = inp.value.slice(0, s) + '@角色 ' + inp.value.slice(s);
  inp.focus(); inp.selectionStart = inp.selectionEnd = s + 4;
  inp.dispatchEvent(new Event('input'));
}
/* 为新节点找一个不与现有节点重叠的位置：优先放在 src 右侧，被占用则向右下顺延 */
function findSpot(srcX, srcY, w, h) {
  let x = srcX, y = srcY, tries = 0;
  const hit = () => nodes.some(n => Math.abs(n.x - x) < w * 0.8 && Math.abs(n.y - y) < h * 0.6);
  while (hit() && tries < 12) { x += 90; y += (tries % 2 ? 150 : 0); tries++; }
  return { x: Math.round(x), y: Math.round(y) };
}
$('gSend').addEventListener('click', () => {
  const txt = $('gInput').value.trim();
  if (!txt) { toast('请输入生成内容'); return; }
  const cfg = GEN_TABS[curTab];
  const src = nodes.find(x => x.id === selected);
  /* 选中节点 → ↑ 就是运行当前节点（用面板里的提示词/模型/比例重新生成），不再新建下游节点 */
  if (src) {
    if (src.type === 'edit') { toast('合成视频节点请在编辑器中剪辑导出'); return; }
    if (src.status === 'running') { toast('⏳ 当前节点正在生成中…'); return; }
    pushUndo();
    src.prompt = txt;
    startGen(src, '运行 · ' + TYPES[src.type].label, {
      count: (src.type === 'nine' && src.cells) ? src.cells : 1,
      model: $('gModel').value,
      ratio: curTab === 'image' ? $('gRatio').value : undefined,
    });
    save();
    return;
  }
  /* 未选中节点 → 在画布中央新建节点并运行 */
  pushUndo();
  const r = wrap.getBoundingClientRect();
  const cx = (r.width / 2 - panX) / scale, cy = (r.height / 2 - panY) / scale;
  let type = curTab === 'text' ? 'text' : curTab === 'image' ? 'image' : curTab === 'video' ? 'video' : 'audio';
  /* 图片多张 → 九宫格节点，并带上当前选中的九宫格技能（服务端按技能出分镜） */
  const extra = {};
  if (curTab === 'image' && $('gCount').value === '9张') Object.assign(extra, { type: 'nine', cells: 9, cols: 3, label: '九宫格 · ' + gridModeLabel(gridMode), gridMode });
  if (curTab === 'image' && $('gCount').value === '4张') Object.assign(extra, { type: 'nine', cells: 4, cols: 2, label: '四宫格 · ' + gridModeLabel(gridMode), gridMode });
  if (curTab === 'image' && $('gCount').value === '2张') Object.assign(extra, { type: 'nine', cells: 2, cols: 2, label: '双图对比', gridMode });
  if (extra.type) type = extra.type;
  const n = { id: uid(), type, x: Math.round(cx - 170), y: Math.round(cy - 120), status: 'idle', prompt: txt, vseed: Math.floor(Math.random() * 97), dur: type === 'video' ? $('gCount').value : '—', ...extra };
  nodes.push(n);
  selected = n.id; render(); openPanel();
  startGen(n, cfg.models[0], {
    count: (type === 'nine' && n.cells) ? n.cells : 1,
    model: $('gModel').value,
    ratio: curTab === 'image' ? $('gRatio').value : undefined,
  });
  save();
});

/* ============ 素材库：四种内容类型（九宫格 / 合成视频由能力生成，不在库中） ============ */
const lib = $('lib');
Object.entries(TYPES).filter(([k]) => !['nine', 'edit'].includes(k)).forEach(([k, t]) => {
  const d = document.createElement('div');
  d.className = 'lib-item'; d.draggable = true;
  d.innerHTML = `<div class="lib-ico" style="background:${t.color}22;color:${t.color}">${t.icon}</div>${t.label}${k === 'video' ? '<span style="font-size:10px;color:var(--text-dim);margin-left:4px">模拟</span>' : ''}`;
  d.addEventListener('dragstart', ev => ev.dataTransfer.setData('type', k));
  lib.appendChild(d);
});
wrap.addEventListener('dragover', e => e.preventDefault());
/* 图例折叠 */
const legendEl = $('legend');
if (legendEl) legendEl.addEventListener('click', () => legendEl.classList.toggle('folded'));
/* 文件/节点拖放的 drop 处理统一在「上传」一节 */

/* ============ 场景模板库（一键套用，Ctrl+Z 可撤销） ============ */
let tplCache = null;
const TYPE_LABEL = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.label]));
function tplMeta(tpl) {
  const cnt = {};
  tpl.nodes.forEach(n => { cnt[n.type] = (cnt[n.type] || 0) + 1; });
  return Object.entries(cnt).map(([k, v]) => TYPE_LABEL[k] + '×' + v).join(' · ');
}
function renderTemplates(list) {
  const box = $('tplLib');
  if (!box) return;
  box.innerHTML = '';
  list.forEach(tpl => {
    const d = document.createElement('div');
    d.className = 'tpl';
    d.innerHTML = `<div class="tpl-top"><span class="tpl-ico">${tpl.icon}</span>${esc(tpl.name)}</div>
      <div class="tpl-desc">${esc(tpl.desc)}</div>
      <div class="tpl-meta">${tpl.nodes.length} 节点 · ${tplMeta(tpl)} → 点击套用</div>`;
    d.addEventListener('click', () => applyTemplate(tpl));
    box.appendChild(d);
  });
}
/* 套用模板：重新分配节点 id 与随机 vseed（同一模板每次长出不同画面），整体一步可撤销 */
function applyTemplate(tpl) {
  pushUndo();
  const idMap = {};
  tpl.nodes.forEach(n => { idMap[n.id] = uid(); });
  nodes = tpl.nodes.map(n => {
    const fresh = { ...n, id: idMap[n.id], status: 'idle', progress: 0 };
    delete fresh.srcState; delete fresh.urls; delete fresh.url;
    // 媒体节点每次套用都换随机 seed：同一模板长出不同画面
    if (['image', 'nine', 'video'].includes(fresh.type)) fresh.vseed = Math.floor(Math.random() * 97);
    return fresh;
  });
  groups = [{ id: 'g' + Date.now().toString(36), name: tpl.name, ids: nodes.map(n => n.id) }];   // 模板整张绑为一组
  edges = tpl.edges.map(e => ({ from: idMap[e.from], to: idMap[e.to] })).filter(e => { const ok = !!EDGE_OK[nodes.find(n => n.id === e.from)?.type]?.[nodes.find(n => n.id === e.to)?.type]; if (!ok) console.warn('模板连线不合法已忽略', e); return ok; });
  selected = null; selectedEdge = null;
  render(); hideFloaters(); save();
  setTimeout(resetView, 30);
  toast('📦 已套用模板「' + tpl.name + '」，Ctrl+Z 可撤销');
}
api.getTemplates()
  .then(d => { tplCache = d.templates || []; renderTemplates(tplCache); })
  .catch(() => { const b = $('tplLib'); if (b) b.innerHTML = '<div class="tpl-loading">模板加载失败，刷新重试</div>'; });

/* ============ 复制所选（工具条 ⧉ / Ctrl+D 共用） ============ */
function dupSelected() {
  if (!selected) { toast('请先选择一个节点'); return; }
  pushUndo();
  const n = nodes.find(x => x.id === selected);
  const c = { ...n, id: uid(), x: n.x + 50, y: n.y + 60, status: 'idle', progress: 0, srcState: undefined };
  nodes.push(c); selected = c.id; render(); openPanel(); save(); toast('⧉ 已复制节点');
}

/* ============ 右键 / 删除 / 快捷键 ============ */
/* ============ 删除 ============ */
function deleteNode(id) {
  if (!id) return;
  pushUndo();
  nodes = nodes.filter(n => n.id !== id);
  edges = edges.filter(e => e.from !== id && e.to !== id);
  if (selected === id) selected = null;
  if (ctxNode === id) ctxNode = null;
  render(); hideFloaters(); save(); toast('🗑 节点已删除');
}
function deleteSelected() {
  if (selectedEdge) {
    pushUndo();
    edges = edges.filter(e => !(e.from === selectedEdge.from && e.to === selectedEdge.to));
    selectedEdge = null; render(); hideFloaters(); save(); toast('🗑 连线已删除'); return;
  }
  if (!selected) { toast('请先选择要删除的节点'); return; }
  deleteNode(selected);
}
let ctxNode = null;
vp.addEventListener('contextmenu', e => {
  const el = e.target.closest('.node');
  if (el) {
    e.preventDefault(); ctxNode = el.dataset.id; selected = ctxNode; render(); openPanel();
    const m = $('ctxMenu'); m.style.display = 'block'; m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px';
  } else { e.preventDefault(); openQuickCreate(e.clientX, e.clientY, null); }
});
window.addEventListener('click', e => {
  $('ctxMenu').style.display = 'none';
  if (!e.target.closest('#aitbMore')) $('moreMenu').style.display = 'none';
  if (!e.target.closest('#quickMenu') && !e.target.closest('#gPick')) $('quickMenu').style.display = 'none';
});
$('aitbMore').addEventListener('click', e => {
  e.stopPropagation();
  const m = $('moreMenu');
  m.style.display = m.style.display === 'block' ? 'none' : 'block';
  const r = $('aitbMore').getBoundingClientRect();
  m.style.left = r.left + 'px'; m.style.top = (r.bottom + 6) + 'px';
});
function ctxAction(a) {
  $('ctxMenu').style.display = 'none';
  if (!ctxNode) return;
  if (a === 'del') { selected = ctxNode; selectedEdge = null; deleteSelected(); }
  if (a === 'replace') pickFileForReplace(ctxNode);
  if (a === 'chain') { selected = ctxNode; selectedEdge = null; render(); openPanel(); runChain(); }
  if (a === 'bind') { selected = ctxNode; selectedEdge = null; render(); bindGroup(); return; }
  if (a === 'prompt') { const n = nodes.find(x => x.id === ctxNode); if (n) showPromptModal(n); }
  if (a === 'dup') {
    pushUndo(); const n = nodes.find(x => x.id === ctxNode);
    const c = { ...n, id: uid(), x: n.x + 60, y: n.y + 70, status: 'idle', progress: 0, srcState: undefined };
    nodes.push(c); selected = c.id; render(); openPanel(); save(); toast('⧉ 已复制节点');
  }
  if (a === 'add') {
    pushUndo(); const n = nodes.find(x => x.id === ctxNode);
    const type = n.type === 'text' ? 'image' : n.type === 'image' ? 'video' : 'edit';
    const c = { id: uid(), type, x: n.x + 480, y: n.y, status: 'idle', prompt: '新节点…', dur: type === 'video' ? '5s' : '—', vseed: Math.floor(Math.random() * 97) };
    nodes.push(c); addEdge(ctxNode, c.id); selected = c.id; render(); openPanel(); save();
  }
}
vp.addEventListener('dblclick', e => {
  const el = e.target.closest('.node');
  if (!el) return;
  selected = el.dataset.id; render(); openPanel();
  if (e.target.closest('.node-media')) openLB(el.dataset.id);
  else $('gInput').focus();
});
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    if (selected) {
      pushUndo(); const n = nodes.find(x => x.id === selected);
      const c = { ...n, id: uid(), x: n.x + 50, y: n.y + 60, status: 'idle', progress: 0, srcState: undefined };
      nodes.push(c); selected = c.id; render(); openPanel(); save(); toast('⧉ 已复制节点');
    } return;
  }
  if (mod && e.key === '0') { e.preventDefault(); resetView(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  if (e.key === 'Escape') { selected = null; selectedEdge = null; render(); hideFloaters(); closeLB(); }
  if (e.key === '+' || e.key === '=') zoomBy(0.1);
  if (e.key === '-') zoomBy(-0.1);
});
window.addEventListener('resize', positionFloaters);

/* ============ 查看生成提示词（右键菜单） ============ */
function showPromptModal(n) {
  const old = $('promptModal'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'promptModal';
  d.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(5,7,12,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:640px;max-height:72vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px 22px;font-size:13px;line-height:1.8;color:#c9cede;box-shadow:0 20px 60px rgba(0,0,0,.6)';
  let body;
  if (n.cellPrompts && n.cellPrompts.length > 1) {
    body = `<div style="font-weight:600;color:#fff;margin-bottom:10px">🎬 分镜提示词（${n.cellPrompts.length} 格）</div>` +
      n.cellPrompts.map((c, i) => `<div style="margin:6px 0;padding:8px 12px;background:#1a1d28;border-radius:8px"><b style="color:#8b91a7">镜头${i + 1}</b>　${esc(c)}</div>`).join('');
  } else if (n.promptUsed) {
    body = `<div style="font-weight:600;color:#fff;margin-bottom:10px">📋 最近一次生成的完整提示词</div>${esc(n.promptUsed)}` +
      (n.refMode ? `<div style="margin-top:12px;color:#8b91a7;font-size:12px">图片参考方式：${{ described: '视觉模型已参考上游图片', note: '限流降级 · 仅文字说明', reused: '模拟模式 · 沿用参考素材' }[n.refMode] || n.refMode}</div>` : '');
  } else {
    body = '<div style="color:#8b91a7">该节点还没有生成记录</div>';
  }
  box.innerHTML = body;
  box.onclick = e => e.stopPropagation();
  d.appendChild(box);
  d.onclick = () => d.remove();
  document.body.appendChild(d);
}

/* ============ Toast ============ */
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ 自动布局（按创作流分列：文案 → 九宫格 → 图片/视频 → 音频 → 合成视频） ============ */
function autoLayout() {
  pushUndo();
  const colOrder = { text: 0, nine: 1, image: 2, video: 2, audio: 3, edit: 4 };
  const cols = {};
  nodes.forEach(n => { const c = colOrder[n.type] ?? 9; (cols[c] = cols[c] || []).push(n); });
  Object.values(cols).forEach(col => col.forEach((n, i) => { n.x = 140 + colOrder[n.type] * 560; n.y = 120 + i * 300; }));
  render(); resetView(); save(); toast('⌗ 已按创作流布局：文案 → 图片/视频 → 合成视频');
}

/* ============ 快照 / 撤销重做 / 持久化（服务端 + localStorage 兜底） ============ */
const LS_KEY = 'seko_canvas_v2';
let undoStack = [], redoStack = [], saveTimer = null, _uid = 1;
const uid = () => 'n' + Date.now().toString(36) + (_uid++);
const serialize = () => JSON.stringify({ nodes, edges, groups });
function pushUndo() { undoStack.push(serialize()); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
function restoreSnapshot(s) {
  const d = JSON.parse(s); nodes = d.nodes; edges = d.edges; groups = d.groups || [];
  selected = null; selectedEdge = null; render(); hideFloaters(); save();
}
function undo() { if (!undoStack.length) { toast('没有可撤销的操作'); return; } redoStack.push(serialize()); restoreSnapshot(undoStack.pop()); toast('↩ 已撤销'); }
function redo() { if (!redoStack.length) { toast('没有可重做的操作'); return; } undoStack.push(serialize()); restoreSnapshot(redoStack.pop()); toast('↪ 已重做'); }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = { nodes, edges, groups, view: { scale, panX, panY } };
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (_) {}
    api.putProject(payload).catch(() => { /* 服务端不可达时静默，本地已有兜底 */ });
  }, 300);
}
async function loadProject() {
  try {
    const d = await api.getProject();
    if (d && Array.isArray(d.nodes) && d.nodes.length) {
      nodes = d.nodes; edges = d.edges || []; groups = d.groups || [];
      // 恢复时把进行中的任务视为已完成（结果已在节点上）
      nodes.forEach(n => { if (n.status === 'running') { n.status = 'done'; n.progress = 100; } });
      if (d.view && d.view.scale) { scale = d.view.scale; panX = d.view.panX || 0; panY = d.view.panY || 0; }
      else setTimeout(resetView, 60);   // 无保存视图时自动适应画布
      return true;
    }
  } catch (_) {}
  return false;
}
function newCanvas() {
  pushUndo();
  groups = [];
  nodes = [{ id: uid(), type: 'image', x: 240, y: 220, status: 'idle', prompt: '双击或点击下方输入框，描述这个节点…', vseed: Math.floor(Math.random() * 97) }];
  edges = []; selected = null; render(); hideFloaters(); save(); setTimeout(resetView, 30); toast('✚ 已新建画布');
}

/* ============ 对齐参考线 ============ */
function showGuides(x, y) {
  const v = $('guideV'), h = $('guideH');
  if (v) { v.style.display = x === null ? 'none' : 'block'; if (x !== null) v.style.left = x + 'px'; }
  if (h) { h.style.display = y === null ? 'none' : 'block'; if (y !== null) h.style.top = y + 'px'; }
}
function hideGuides() { const v = $('guideV'), h = $('guideH'); if (v) v.style.display = 'none'; if (h) h.style.display = 'none'; }

/* ============ 上传 / 替换 / 素材库 / 下载 / 大图预览 ============ */
/* 支持替换素材的节点类型 */
const REPLACEABLE = ['image', 'video', 'edit'];
let replaceTargetId = null;   // 非空时，文件选择完成后替换该节点素材
function pickFileForReplace(id) {
  const n = nodes.find(x => x.id === id);
  if (!n) return;
  if (!REPLACEABLE.includes(n.type)) { toast('该节点类型不支持替换素材（仅图片/视频/合成片）'); return; }
  replaceTargetId = id;
  $('fileInput').click();
}
function replaceSelected() {
  if (!selected) { toast('请先选择一个节点'); return; }
  pickFileForReplace(selected);
}
/* 上传新素材替换已有节点内容 */
async function replaceNodeMaterial(id, file) {
  const n = nodes.find(x => x.id === id);
  if (!n || !file) return;
  if (!REPLACEABLE.includes(n.type)) { toast('该节点类型不支持替换素材'); return; }
  toast('⬆ 正在上传 ' + file.name + ' …');
  try {
    const r = await api.upload(file);
    pushUndo();
    n.url = r.url;
    n.status = 'done'; n.progress = 100;
    if (!n.prompt || String(n.prompt).startsWith('上传素材')) n.prompt = '上传素材：' + file.name;
    render(); positionFloaters(); save();
    toast('🔄 已替换节点素材');
  } catch (err) {
    toast('替换失败：' + err.message);
  }
}
/* 统一上传入口：文件 → POST /api/upload → 画布中心新建图片节点 */
async function uploadFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) { toast('仅支持图片素材（PNG / JPG / WebP…）'); return; }
  for (const f of imgs) {
    toast('⬆ 正在上传 ' + f.name + ' …');
    try {
      const r = await api.upload(f);
      pushUndo();
      const spot = findSpot(Math.round((innerWidth / 2 - panX) / scale - 170), Math.round((innerHeight / 2 - panY) / scale - 150), 360, 260);
      nodes.push({ id: uid(), type: 'image', url: r.url, x: spot.x, y: spot.y, status: 'done', prompt: '上传素材：' + f.name });
      selected = nodes[nodes.length - 1].id;
    } catch (err) {
      toast('上传失败：' + err.message);
    }
  }
  render(); openPanel(); save();
  toast('🖼 已上传 ' + imgs.length + ' 张素材到画布');
}
function onFilePicked(ev) {
  const files = ev.target.files;
  if (files && files.length) {
    if (replaceTargetId) replaceNodeMaterial(replaceTargetId, files[0]);
    else uploadFiles(files);
  }
  replaceTargetId = null;
  ev.target.value = '';
}
/* 拖拽：文件落到节点上 = 替换该节点素材；落到空白处 = 新建图片节点 */
wrap.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    const el = e.target.closest && e.target.closest('.node');
    if (el && REPLACEABLE.includes((nodes.find(x => x.id === el.dataset.id) || {}).type)) {
      replaceNodeMaterial(el.dataset.id, e.dataTransfer.files[0]);
    } else if (el) {
      toast('该节点类型不支持替换素材，已放到画布空白处');
      uploadFiles(e.dataTransfer.files);
    } else {
      uploadFiles(e.dataTransfer.files);
    }
    return;
  }
  const type = e.dataTransfer.getData('type'); if (!type) return;
  pushUndo();
  const r = wrap.getBoundingClientRect();
  const n = { id: uid(), type, x: Math.round((e.clientX - r.left - panX) / scale - 140), y: Math.round((e.clientY - r.top - panY) / scale - 90),
    status: 'idle', prompt: '双击或点击下方输入框，描述这个节点…', dur: type === 'video' ? '5s' : '—', vseed: Math.floor(Math.random() * 97) };
  nodes.push(n); selected = n.id; render(); openPanel(); save();
});
/* Ctrl+V 粘贴截图 / 图片直接上传 */
window.addEventListener('paste', e => {
  const files = e.clipboardData && e.clipboardData.files;
  if (files && files.length && [...files].some(f => f.type.startsWith('image/'))) {
    e.preventDefault();
    if (replaceTargetId) replaceNodeMaterial(replaceTargetId, [...files].find(f => f.type.startsWith('image/')));
    else uploadFiles(files);
  }
});
function openAssetPicker(ev) {
  const m = $('quickMenu');
  m.innerHTML = '<div style="padding:8px 10px 2px;font-size:11px;color:var(--text-dim)">素材库 · 点击添加到画布</div>' +
    '<div class="asset-grid">' + Array.from({ length: 9 }, (_, i) => `<img src="${sceneURL(i * 3)}" data-i="${i}" title="场景 ${i + 1}">`).join('') + '</div>';
  m.style.display = 'block';
  const r = ev.currentTarget.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - 270) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  m.querySelectorAll('.asset-grid img').forEach(img => img.onclick = () => {
    m.style.display = 'none'; pushUndo();
    const i = +img.dataset.i;
    const n = { id: uid(), type: 'image', vseed: i * 3, x: Math.round((innerWidth / 2 - panX) / scale - 170), y: Math.round((innerHeight / 2 - panY) / scale - 150), status: 'done', prompt: '素材库场景 ' + (i + 1) };
    nodes.push(n); selected = n.id; render(); openPanel(); save(); toast('🖼 已添加到画布');
  });
}
$('gPick').addEventListener('click', e => { e.stopPropagation(); openAssetPicker(e); });
function downloadSelected() {
  if (!selected) { toast('请先选择一个节点'); return; }
  const el = nodeEl(selected); const img = el && el.querySelector('.node-media img');
  if (!img) { toast('该节点没有可下载的素材'); return; }
  const a = document.createElement('a'); a.href = img.src; a.download = 'weavereel-' + selected; a.click(); toast('⬇ 素材已开始下载');
}
function openLB(id) {
  const el = nodeEl(id); const img = el && el.querySelector('.node-media img'); if (!img) return;
  const n = nodes.find(x => x.id === id);
  $('lbImg').src = img.src; $('lbCap').textContent = (n && n.prompt) || '素材预览';
  $('lbDl').onclick = () => { const a = document.createElement('a'); a.href = img.src; a.download = 'weavereel-' + id; a.click(); toast('⬇ 已开始下载'); };
  $('lightbox').classList.add('show');
}
function closeLB() { $('lightbox').classList.remove('show'); }

/* ============ 快速创建菜单（右键 / 拖线到空白） ============ */
function openQuickCreate(x, y, linkCtx) {
  const m = $('quickMenu');
  m.innerHTML = ['image', 'video', 'text', 'audio'].map(t => `<button data-t="${t}">${TYPES[t].icon} ${TYPES[t].label}节点</button>`).join('');
  m.style.display = 'block';
  m.style.left = Math.min(x, innerWidth - 200) + 'px'; m.style.top = Math.min(y, innerHeight - 200) + 'px';
  m.querySelectorAll('button').forEach(b => b.onclick = () => {
    m.style.display = 'none';
    const type = b.dataset.t;
    /* 经连线创建 → 文本上游的文案直接作为新节点的创作基础 */
    let basePrompt = '双击或点击下方输入框，描述这个节点…';
    if (linkCtx) {
      const up = nodes.find(x => x.id === linkCtx.from);
      const ut = up ? (up.story || up.prompt || '').trim() : '';
      if (up && up.type === 'text' && ut) basePrompt = '根据上游文案「' + ut.slice(0, 36) + (ut.length > 36 ? '…' : '') + '」创作';
    }
    const r = wrap.getBoundingClientRect();
    const n = { id: uid(), type, x: Math.round((x - r.left - panX) / scale - 140), y: Math.round((y - r.top - panY) / scale - 40),
      status: 'idle', prompt: basePrompt, dur: type === 'video' ? '5s' : '—', vseed: Math.floor(Math.random() * 97) };
    nodes.push(n);
    if (linkCtx) addEdge(linkCtx.dir === 'out' ? linkCtx.from : n.id, linkCtx.dir === 'out' ? n.id : linkCtx.from);
    selected = n.id; render(); openPanel(); save();
    toast('➕ 已创建' + TYPES[type].label + '节点' + (linkCtx ? ' 并连接，生成时将引用上游内容' : ''));
  });
}
svg.addEventListener('contextmenu', e => {
  const p = e.target.closest('.wire'); if (!p) return;
  e.preventDefault(); e.stopPropagation();
  const [f, t] = p.dataset.edge.split('-');
  pushUndo(); edges = edges.filter(x => !(x.from === f && x.to === t)); render(); save(); toast('🗑 连线已删除');
});
wrap.addEventListener('contextmenu', e => {
  if (e.target.closest('.node') || e.target.closest('svg')) return;
  e.preventDefault(); openQuickCreate(e.clientX, e.clientY, null);
});

/* ============ 模式切换（画布 / 编辑器） ============ */
let TL = { clips: [], subs: [], total: 0 };
let edPlaying = false, edT0 = 0, edRaf = 0;
function switchMode(m) {
  const ed = m === 'editor';
  $('msCanvas').classList.toggle('active', !ed);
  $('msEditor').classList.toggle('active', ed);
  wrap.style.display = ed ? 'none' : 'block';
  document.querySelector('.sidebar').style.display = ed ? 'none' : 'flex';
  document.querySelector('.zoombar').style.display = ed ? 'none' : 'flex';
  hideFloaters();
  $('editorView').classList.toggle('show', ed);
  if (ed) buildTimeline();
  else if (edPlaying) { edPlaying = false; cancelAnimationFrame(edRaf); $('playBtn').textContent = '▶ 播放'; }
}

/* ============ 编辑器：由画布真实节点数据驱动 ============ */
function splitSentences(text) {
  return String(text || '').split(/[。！？!?；;\n]+/).map(s => s.trim()).filter(s => s.length >= 2);
}
/* 时间线取材范围：有成片节点且接了素材 → 只取成片节点的多级上游（入片关系）；
   否则回退为画布全部媒体节点（无成片节点时也能预览）。成片节点本身是组装出口，不作为镜头 */
function filmScope() {
  const edits = nodes.filter(n => n.type === 'edit');
  if (!edits.length) return null;
  const ids = new Set();
  edits.forEach(en => {
    let frontier = directUpstreams(en.id).map(u => u.id);
    while (frontier.length) {
      const nxt = [];
      frontier.forEach(id => {
        if (ids.has(id)) return;
        ids.add(id);
        directUpstreams(id).forEach(u => nxt.push(u.id));
      });
      frontier = nxt;
    }
  });
  return ids.size ? ids : null;
}
function timelineClips() {
  const scope = filmScope();
  const inScope = n => !scope || scope.has(n.id);
  /* 镜头顺序 = 画布空间顺序（左 → 右流水线），与用户排布意图一致 */
  const clips = nodes.filter(n => ['image', 'nine', 'video'].includes(n.type) && inScope(n))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y))
    .map(n => {
      let thumb = n.type === 'nine' ? ((n.urls && n.urls[0]) || null) : (n.url || null);
      if (!thumb) thumb = sceneURL(n.vseed || 0);
      const dur = n.type === 'video' ? (parseInt(n.dur) || 5) : 3;
      return { id: n.id, label: (n.label || TYPES[n.type].label), thumb, dur, prompt: n.prompt || '' };
    });
  const audios = nodes.filter(n => n.type === 'audio' && inScope(n)).map(n => ({ id: n.id, label: (n.prompt || '背景音乐').slice(0, 14) }));
  const subs = [];
  nodes.filter(n => n.type === 'text' && inScope(n)).forEach(n => {
    const body = (n.story || n.prompt || '').trim();
    const parts = splitSentences(body);
    (parts.length ? parts : (body ? [body.slice(0, 30)] : [])).forEach(s => subs.push(s));
  });
  return { clips, audios, subs };
}
function buildTimeline() {
  const { clips, audios, subs } = timelineClips();
  const sum = clips.reduce((s, c) => s + c.dur, 0);
  const total = sum || 8;   // 无镜头时给个最小可看长度；有镜头时显示真实时长（与导出一致）
  TL = { clips, subs, total };
  const v = $('tlVideo'), a = $('tlAudio'), s = $('tlSub');
  v.innerHTML = a.innerHTML = s.innerHTML = '';
  let x = 0;
  clips.forEach(c => {
    const d = document.createElement('div');
    d.className = 'clip c-v'; d.dataset.cid = c.id;
    d.style.left = (x / total * 100) + '%';
    d.style.width = 'calc(' + (c.dur / total * 100) + '% - 4px)';
    d.style.backgroundImage = 'linear-gradient(rgba(10,14,24,.35),rgba(10,14,24,.6)),url("' + c.thumb + '")';
    d.textContent = c.label.slice(0, 10) + ' · ' + c.dur + 's';
    d.title = c.prompt || c.label;
    d.onclick = () => edSelectClip(c.id);
    v.appendChild(d);
    c.start = x; x += c.dur;
  });
  if (!clips.length) v.innerHTML = '<div class="tl-empty">画布里还没有媒体节点 — 回画布创建并生成</div>';
  if (audios.length) {
    const d = document.createElement('div');
    d.className = 'clip c-a'; d.style.left = '0'; d.style.width = 'calc(100% - 4px)';
    d.textContent = '🎵 ' + audios[0].label;
    a.appendChild(d);
  } else a.innerHTML = '<div class="tl-empty">无音频节点</div>';
  const show = subs.slice(0, 8);
  show.forEach((txt, i) => {
    const d = document.createElement('div');
    d.className = 'clip c-s';
    d.style.left = (i / show.length * 100) + '%';
    d.style.width = 'calc(' + (100 / show.length) + '% - 4px)';
    d.textContent = txt.slice(0, 16);
    d.title = txt;
    s.appendChild(d);
  });
  if (!show.length) s.innerHTML = '<div class="tl-empty">无文本节点字幕</div>';
  $('tlTotal').textContent = '总时长 ' + total + 's · ' + clips.length + ' 镜头 · ' + show.length + ' 条字幕';
  $('edDurVal').textContent = total + '.0s';
  $('edBGMVal').textContent = audios.length ? audios[0].label : '未添加';
  $('edSubVal').textContent = show.length ? '自动生成 · ' + show.length + ' 条' : '无文本节点';
  if (clips.length) edSelectClip(clips[0].id);
  else $('edImg').removeAttribute('src');
}
function edSelectClip(id) {
  document.querySelectorAll('#tlVideo .clip').forEach(e => e.classList.toggle('sel', e.dataset.cid === id));
  const c = TL.clips.find(x => x.id === id);
  if (c) { $('edImg').src = c.thumb; $('edImg').dataset.cid = c.id; }
}
function edTick() {
  if (!edPlaying) return;
  const t = ((performance.now() - edT0) / 1000) % Math.max(1, TL.total);
  $('playhead').style.left = (t / TL.total * 100) + '%';
  const active = TL.clips.find(c => t >= c.start && t < c.start + c.dur);
  if (active && $('edImg').dataset.cid !== active.id) edSelectClip(active.id);
  edRaf = requestAnimationFrame(edTick);
}
$('playBtn').addEventListener('click', () => {
  if (!TL.clips.length) { toast('画布里还没有媒体节点，先回画布生成素材'); return; }
  edPlaying = !edPlaying;
  $('playBtn').textContent = edPlaying ? '⏸ 暂停' : '▶ 播放';
  if (edPlaying) { edT0 = performance.now(); edRaf = requestAnimationFrame(edTick); }
  else cancelAnimationFrame(edRaf);
});

/* ============ 导出成片：canvas Ken-Burns 渲染 + MediaRecorder 录制 webm ============ */
let exporting = false;
async function exportFilm() {
  if (exporting) { toast('⏳ 正在导出中…'); return; }
  const { clips, subs } = timelineClips();
  if (!clips.length) { toast('画布里没有可合成的媒体节点'); return; }
  if (typeof MediaRecorder === 'undefined') { toast('当前浏览器不支持视频导出'); return; }
  exporting = true;
  const total = clips.reduce((s, c) => s + c.dur, 0);
  toast('🎬 合成成片中 · ' + clips.length + ' 镜头 / ' + total + 's（请保持页面在前台）');
  const imgs = await Promise.all(clips.map(c => new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = c.thumb;
  })));
  const W = 1280, H = 720;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const stream = cv.captureStream(30);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });
  const show = subs.slice(0, 10);
  rec.start(250);
  let t0 = null, raf = 0;
  await new Promise(resolve => {
    const draw = now => {
      if (t0 === null) t0 = now;
      const t = (now - t0) / 1000;
      let acc = 0, cur = -1, p = 0;
      for (let i = 0; i < clips.length; i++) {
        if (t < acc + clips[i].dur) { cur = i; p = (t - acc) / clips[i].dur; break; }
        acc += clips[i].dur;
      }
      if (cur === -1 || t >= total) { resolve(); return; }
      const im = imgs[cur];
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (im) {
        const scale = 1.06 + 0.10 * p;   // Ken-Burns 缓慢推近
        const ir = im.width / im.height, cr = W / H;
        let dw, dh;
        if (ir > cr) { dh = H * scale; dw = dh * ir; } else { dw = W * scale; dh = dw / ir; }
        g.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '20px sans-serif';
      g.fillText((cur + 1) + ' / ' + clips.length, 24, 40);
      if (show.length) {
        const txt = show[Math.min(show.length - 1, Math.floor(t / total * show.length))];
        g.font = '30px sans-serif';
        const tw = g.measureText(txt).width;
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(W / 2 - tw / 2 - 14, H - 74, tw + 28, 44);
        g.fillStyle = '#fff'; g.textAlign = 'center';
        g.fillText(txt, W / 2, H - 42);
        g.textAlign = 'left';
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  cancelAnimationFrame(raf);
  rec.stop();
  await stopped;
  const blob = new Blob(chunks, { type: 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'weavereel-film-' + Date.now() + '.webm';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  exporting = false;
  toast('✅ 成片已导出 · ' + clips.length + ' 镜头 / ' + total + 's（webm）');
}
$('tlExport').addEventListener('click', exportFilm);

/* ============ 视觉参考通道状态灯 ============ */
async function refreshVisionStatus() {
  try {
    const s = await (await fetch('/api/vision-status')).json();
    const el = $('visionStatus'); if (!el) return;
    if (!s.configured) { el.textContent = '⚪ 视觉参考未配置'; el.style.color = 'var(--text-dim)'; return; }
    el.textContent = s.ok ? '🟢 视觉参考通道：可用' : '🔴 视觉参考通道：繁忙 · 自动重试中';
    el.title = s.lastError ? '最近错误：' + s.lastError : '';
    el.style.color = s.ok ? 'var(--green)' : '#f5c26b';
  } catch (_) {}
}
refreshVisionStatus();
setInterval(refreshVisionStatus, 60 * 1000);

/* ============ 初始化：拉取模型配置 + 从服务端加载项目 ============ */
(async function init() {
  // 模型清单以服务端 data/config.json 为准（本地 GEN_TABS 仅作兜底默认值）
  try {
    const cfg = await api.getConfig();
    if (cfg && cfg.models) {
      for (const k of Object.keys(GEN_TABS)) {
        if (Array.isArray(cfg.models[k]) && cfg.models[k].length) GEN_TABS[k].models = cfg.models[k];
      }
    }
  } catch (_) { /* 配置拉取失败时使用内置默认 */ }
  const loaded = await loadProject();
  render();
  setTab('image');
  if (loaded && nodes.length) {
    $('zoomVal').textContent = Math.round(scale * 100) + '%';
    applyView();
    selected = nodes[0].id; render(); openPanel();
  } else {
    setTimeout(() => { resetView(); if (nodes.length) { selected = nodes[0].id; render(); openPanel(); } }, 60);
  }
})();

/* ============ Next.js 页面壳接入：暴露"预览所选节点" ============ */
function previewSelected() {
  if (typeof selected === 'string' && selected) openLB(selected);
  else toast('请先选择节点');
}
