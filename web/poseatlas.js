import { app } from "../../scripts/app.js";

/*
 * ComfyUI-PoseAtlas — 图库选择器
 * 把 PoseAtlasLoader / PoseAtlasInfo 的 pose 下拉框替换成可视化图库面板：
 *   系列 tab → 分类 → 缩略图网格 → 点选后写回下拉值并显示大图预览。
 *
 * 支持「线稿 / 深度」两种渲染。深度原图不随仓库分发（只带 300×400 缩略图），
 * 卡片右上角的「↓ 原图」按钮会调用节点自带的 /poseatlas/depth 接口，由服务端
 * 取回 900×1200 原图写入 depth/img/。
 *
 * 数据与图片都来自本节点自带的 web/atlas 目录（/extensions/ComfyUI-PoseAtlas/atlas/）。
 */

const NODE_TYPES = new Set(["PoseAtlasLoader", "PoseAtlasInfo"]);
const WIDGET_NAME = "pose";
const RENDER_WIDGET = "render";
const EXT_BASE = "/extensions/ComfyUI-PoseAtlas/atlas/";
const API_DATA = EXT_BASE + "index.json";
const DEPTH_API = "/poseatlas/depth";

const RENDER_LINE = "线稿";
const RENDER_DEPTH = "深度";

/* entry.thumb / entry.depth_thumb 都是相对 atlas 目录的路径 */
function thumbUrl(entry, render) {
  if (render === RENDER_DEPTH && entry.depth_thumb) return EXT_BASE + entry.depth_thumb;
  return EXT_BASE + entry.thumb;
}

function renderOf(node) {
  const w = node && node.widgets && node.widgets.find((x) => x.name === RENDER_WIDGET);
  return w && w.value === RENDER_DEPTH ? RENDER_DEPTH : RENDER_LINE;
}

/* 深度原图是否已在本地：探测 depth/img/<stem>.png，结果缓存 */
const DEPTH_LOCAL = new Map();
const DEPTH_BUST = new Map(); // 下载成功后加时间戳，绕过浏览器缓存

function depthFullUrl(entry) {
  const bust = DEPTH_BUST.get(entry.depth_file);
  return EXT_BASE + entry.depth_file + (bust ? `?t=${bust}` : "");
}

function probeDepthLocal(entry) {
  if (!entry || !entry.depth_file) return Promise.resolve(false);
  if (DEPTH_LOCAL.has(entry.depth_file)) {
    return Promise.resolve(DEPTH_LOCAL.get(entry.depth_file));
  }
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => {
      DEPTH_LOCAL.set(entry.depth_file, true);
      resolve(true);
    };
    probe.onerror = () => {
      DEPTH_LOCAL.set(entry.depth_file, false);
      resolve(false);
    };
    probe.src = depthFullUrl(entry);
  });
}

let ATLAS = null;
let ATLAS_LOADING = null;

async function getAtlas() {
  if (ATLAS) return ATLAS;
  if (ATLAS_LOADING) return ATLAS_LOADING;
  ATLAS_LOADING = (async () => {
    const res = await fetch(API_DATA, { cache: "no-cache" });
    if (!res.ok) throw new Error("数据加载失败 " + res.status + " " + API_DATA);
    const data = await res.json();
    // 探测线稿缩略图是否已下载（版权原因不随仓库分发）
    data._imagesReady = await new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = thumbUrl(data.entries[0], RENDER_LINE);
    });
    ATLAS = data;
    return data;
  })();
  return ATLAS_LOADING;
}

const CSS = `
.pa-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,.72);
  display: flex; align-items: center; justify-content: center;
  font-family: ui-sans-serif, system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.pa-panel {
  width: min(1180px, 94vw); height: min(880px, 92vh);
  background: #16181d; color: #e6e8ee;
  border: 1px solid #2c303a; border-radius: 12px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,.6);
}
.pa-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-bottom: 1px solid #2c303a; flex: none;
}
.pa-title { font-size: 15px; font-weight: 600; letter-spacing: .02em; }
.pa-sub { font-size: 12px; color: #8b93a5; margin-left: 4px; }
.pa-render {
  display: flex; gap: 3px; padding: 3px;
  background: #1e2129; border: 1px solid #333846; border-radius: 8px;
}
.pa-rbtn {
  padding: 4px 12px; border-radius: 6px; font-size: 12.5px; cursor: pointer;
  color: #a9b1c1; user-select: none; white-space: nowrap;
}
.pa-rbtn:hover { color: #dfe4ee; }
.pa-rbtn.on { background: #2b4a86; color: #fff; }
.pa-search {
  margin-left: auto; width: 240px; padding: 7px 10px;
  background: #1e2129; border: 1px solid #333846; border-radius: 7px;
  color: #e6e8ee; font-size: 13px; outline: none;
}
.pa-search:focus { border-color: #4a7dd6; }
.pa-close {
  width: 30px; height: 30px; border-radius: 7px; border: 1px solid #333846;
  background: #1e2129; color: #b9c0cf; font-size: 17px; cursor: pointer;
  line-height: 1;
}
.pa-close:hover { background: #2a2f3a; color: #fff; }
.pa-tabs {
  display: flex; gap: 6px; padding: 10px 16px; flex-wrap: wrap;
  border-bottom: 1px solid #23262e; flex: none;
}
.pa-tab {
  padding: 5px 12px; border-radius: 999px; font-size: 12.5px; cursor: pointer;
  background: #1e2129; border: 1px solid #333846; color: #a9b1c1;
  user-select: none;
}
.pa-tab:hover { border-color: #4a7dd6; color: #dfe4ee; }
.pa-tab.on { background: #2b4a86; border-color: #4a7dd6; color: #fff; }
.pa-body { flex: 1; display: flex; min-height: 0; }
.pa-side {
  width: 180px; flex: none; overflow: auto; padding: 10px 8px;
  border-right: 1px solid #23262e; background: #14161b;
}
.pa-side-hd { font-size: 11px; color: #6b7285; padding: 2px 8px 8px; letter-spacing: .06em; }
.pa-cat {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; border-radius: 6px; font-size: 12.5px; cursor: pointer;
  color: #a9b1c1; user-select: none; margin-bottom: 2px;
}
.pa-cat:hover { background: #1e2129; color: #dfe4ee; }
.pa-cat.on { background: #2b4a86; color: #fff; }
.pa-cat .n { font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; }
.pa-main { flex: 1; overflow: auto; padding: 14px; min-width: 0; }
.pa-grid {
  display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
}
.pa-card {
  position: relative;
  border: 1px solid #2c303a; border-radius: 9px; overflow: hidden;
  background: #1a1d23; cursor: pointer; transition: border-color .12s;
}
.pa-card:hover { border-color: #4a7dd6; }
.pa-card.on { border-color: #4a7dd6; box-shadow: 0 0 0 2px rgba(74,125,214,.35); }
.pa-card img { display: block; width: 100%; aspect-ratio: 3/4; object-fit: cover; background: #232833; }
.pa-card .cap { padding: 6px 7px; font-size: 11.5px; line-height: 1.45; color: #9aa3b4; }
.pa-card .cap b { display: block; color: #e6e8ee; font-weight: 600; margin-bottom: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-dl {
  position: absolute; top: 6px; right: 6px; z-index: 2;
  padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
  background: rgba(18,20,25,.88); border: 1px solid #3a4150; color: #cfd6e4;
  cursor: pointer; user-select: none; white-space: nowrap;
}
.pa-dl:hover { background: #2b4a86; border-color: #4a7dd6; color: #fff; }
.pa-dl.done { background: rgba(24,52,34,.92); border-color: #3f7a52; color: #8fe0a8; }
.pa-dl.done:hover { background: rgba(24,52,34,.92); }
.pa-dl.busy { opacity: .65; }
.pa-empty { padding: 40px; text-align: center; color: #6b7285; font-size: 13px; }
.pa-foot {
  display: flex; align-items: center; gap: 12px; padding: 9px 16px;
  border-top: 1px solid #2c303a; font-size: 12px; color: #8b93a5; flex: none;
}
.pa-foot .picked { color: #e6e8ee; font-weight: 600; }
.pa-foot .path { margin-left: auto; font-family: ui-monospace, monospace; font-size: 11px; opacity: .6; }
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

/* 请求服务端下载某张深度原图，返回 {ok, bytes} */
async function requestDepthDownload(entry) {
  const stem = entry.depth_file.split("/").pop().replace(/\.png$/, "");
  const res = await fetch(DEPTH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: stem }),
  });
  let payload = {};
  try {
    payload = await res.json();
  } catch (e) {
    payload = {};
  }
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  DEPTH_LOCAL.set(entry.depth_file, true);
  DEPTH_BUST.set(entry.depth_file, Date.now());
  return payload;
}

function openGallery(node, widget, atlas) {
  injectCSS();

  const picked0 = widget.value || "";
  const state = {
    series: null,
    category: null,
    q: "",
    current: picked0,
    render: renderOf(node),
  };

  const cur = atlas.entries.find((e) => e.label === picked0);
  if (cur) {
    state.series = cur.series;
    state.category = cur.category;
  } else if (atlas.series.length) {
    state.series = atlas.series[0].key;
  }

  const overlay = document.createElement("div");
  overlay.className = "pa-overlay";
  overlay.innerHTML = `
    <div class="pa-panel">
      <div class="pa-head">
        <span class="pa-title">PoseAtlas 姿态图库</span>
        <span class="pa-sub">${atlas.total} 张 · ${atlas.poses} 组姿态</span>
        <div class="pa-render"></div>
        <input class="pa-search" type="text" placeholder="搜索：姿态名 / 编号 / 分类" />
        <button class="pa-close" title="关闭">×</button>
      </div>
      <div class="pa-tabs"></div>
      <div class="pa-body">
        <div class="pa-side"></div>
        <div class="pa-main"></div>
      </div>
      <div class="pa-foot">
        <span class="picked">未选择</span>
        <span class="path"></span>
      </div>
    </div>`;

  // 线稿图片未下载时的提示条
  if (atlas._imagesReady === false) {
    const warn = document.createElement("div");
    warn.style.cssText =
      "padding:10px 16px;background:#3a2a12;border-bottom:1px solid #5a3f18;" +
      "color:#e8c07a;font-size:12.5px;line-height:1.6;flex:none;";
    warn.innerHTML =
      "<b>线稿图片尚未下载。</b>图片版权归原作者所有，不随本仓库分发。<br>" +
      "请在节点目录执行 <code style='background:#2a1e0c;padding:1px 5px;border-radius:3px'>python scripts/download_images.py</code>，" +
      "下载完成后重启 ComfyUI。深度缩略图已随仓库提供，可直接浏览。";
    overlay.querySelector(".pa-panel").insertBefore(
      warn,
      overlay.querySelector(".pa-body")
    );
  }

  const $tabs = overlay.querySelector(".pa-tabs");
  const $side = overlay.querySelector(".pa-side");
  const $main = overlay.querySelector(".pa-main");
  const $render = overlay.querySelector(".pa-render");
  const $search = overlay.querySelector(".pa-search");
  const $picked = overlay.querySelector(".picked");
  const $path = overlay.querySelector(".path");

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector(".pa-close").addEventListener("click", close);

  function renderRenderSwitch() {
    $render.innerHTML = "";
    for (const mode of [RENDER_LINE, RENDER_DEPTH]) {
      const b = document.createElement("div");
      b.className = "pa-rbtn" + (mode === state.render ? " on" : "");
      b.textContent = mode;
      b.title = mode === RENDER_DEPTH
        ? "深度图：白色靠近镜头，适合 ControlNet depth"
        : "线稿：人台线稿原图";
      b.onclick = () => {
        state.render = mode;
        const w = node.widgets && node.widgets.find((x) => x.name === RENDER_WIDGET);
        if (w) {
          w.value = mode;
          if (w.callback) {
            try { w.callback(mode); } catch (e) {}
          }
        }
        node.setDirtyCanvas && node.setDirtyCanvas(true, true);
        node._paImg = null;
        node._paImgSrc = null;
        renderRenderSwitch();
        renderMain();
        updateFoot(atlas.entries.find((e) => e.label === state.current));
      };
      $render.appendChild(b);
    }
  }

  function renderTabs() {
    $tabs.innerHTML = "";
    for (const s of atlas.series) {
      const b = document.createElement("div");
      b.className = "pa-tab" + (s.key === state.series ? " on" : "");
      b.textContent = `${s.short} (${s.poseCount})`;
      b.title = s.name;
      b.onclick = () => {
        state.series = s.key;
        state.category = null;
        render();
      };
      $tabs.appendChild(b);
    }
  }

  function renderSide() {
    $side.innerHTML = "";
    const cats = atlas.categoriesBySeries[state.series] || [];
    const total = cats.reduce((a, c) => a + c.count, 0);

    const hd = document.createElement("div");
    hd.className = "pa-side-hd";
    hd.textContent = "分类";
    $side.appendChild(hd);

    const all = document.createElement("div");
    all.className = "pa-cat" + (state.category === null ? " on" : "");
    all.innerHTML = `<span>全部</span><span class="n">${total}</span>`;
    all.onclick = () => {
      state.category = null;
      render();
    };
    $side.appendChild(all);

    for (const c of cats) {
      const el = document.createElement("div");
      el.className = "pa-cat" + (state.category === c.name ? " on" : "");
      el.innerHTML = `<span>${c.name}</span><span class="n">${c.count}</span>`;
      el.onclick = () => {
        state.category = c.name;
        render();
      };
      $side.appendChild(el);
    }
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return atlas.entries.filter((e) => {
      if (state.series && e.series !== state.series) return false;
      if (state.category && e.category !== state.category) return false;
      if (!q) return true;
      const hay = [e.label, e.zh, e.en, e.ja, e.no, e.id]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function applyPick(entry) {
    state.current = entry.label;
    widget.value = entry.label;
    if (widget.callback) {
      try {
        widget.callback(entry.label, app.canvas, node, app.canvas && app.canvas.graph_mouse);
      } catch (e) {}
    }
    node.setDirtyCanvas && node.setDirtyCanvas(true, true);
    app.graph && app.graph.setDirtyCanvas && app.graph.setDirtyCanvas(true, true);
    updateFoot(entry);
    renderMain();
  }

  /* 卡片右上角的下载按钮：把该角度的深度原图取回 depth/img/ */
  function makeDownloadButton(entry) {
    const btn = document.createElement("span");
    btn.className = "pa-dl";
    btn.textContent = "↓ 原图";
    btn.title = "下载该角度的深度原图（900×1200），存到 web/atlas/depth/img/";

    probeDepthLocal(entry).then((has) => {
      if (has) {
        btn.classList.add("done");
        btn.textContent = "✓ 已下载";
      }
    });

    btn.onclick = async (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (btn.classList.contains("busy") || btn.classList.contains("done")) return;
      btn.classList.add("busy");
      btn.textContent = "下载中…";
      try {
        await requestDepthDownload(entry);
        btn.classList.remove("busy");
        btn.classList.add("done");
        btn.textContent = "✓ 已下载";
        // 该角度正在被选中时，让节点预览切到刚下好的原图
        if (state.current === entry.label) {
          node._paImg = null;
          node._paImgSrc = null;
          node.setDirtyCanvas && node.setDirtyCanvas(true, true);
        }
      } catch (e) {
        btn.classList.remove("busy");
        btn.textContent = "↓ 重试";
        btn.title = "下载失败：" + e.message;
      }
    };
    return btn;
  }

  function renderMain() {
    const list = filtered();
    $main.innerHTML = "";
    if (!list.length) {
      $main.innerHTML = '<div class="pa-empty">没有匹配的姿态</div>';
      return;
    }
    const grid = document.createElement("div");
    grid.className = "pa-grid";
    const byPose = new Map();
    for (const e of list) {
      if (!byPose.has(e.id)) byPose.set(e.id, []);
      byPose.get(e.id).push(e);
    }

    for (const variants of byPose.values()) {
      const first = variants[0];
      const sel = variants.find((v) => v.label === state.current) || first;
      const card = document.createElement("div");
      card.className = "pa-card" + (sel.label === state.current ? " on" : "");

      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = thumbUrl(sel, state.render);
      img.alt = sel.zh;
      img.onerror = () => {
        const ph = document.createElement("div");
        ph.style.cssText =
          "aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;" +
          "background:#232833;color:#6b7285;font-size:11px;text-align:center;padding:8px;line-height:1.5;";
        ph.textContent = "图片未下载";
        img.replaceWith(ph);
      };
      card.appendChild(img);

      // 深度模式给下载按钮（线稿走 download_images.py 批量下）
      if (state.render === RENDER_DEPTH) {
        card.appendChild(makeDownloadButton(sel));
      }

      const cap = document.createElement("div");
      cap.className = "cap";
      cap.innerHTML = `<b>${sel.no} ${sel.zh}</b>${sel.category}`;
      card.appendChild(cap);

      if (variants.length > 1) {
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:3px;padding:0 5px 5px;flex-wrap:wrap;";
        for (const v of variants) {
          const t = document.createElement("span");
          t.textContent = v.angle_name;
          t.title = v.angle_name;
          const on = v.label === state.current;
          t.style.cssText =
            "font-size:10px;padding:1px 5px;border-radius:4px;cursor:pointer;user-select:none;" +
            (on
              ? "background:#2b4a86;color:#fff;border:1px solid #4a7dd6;"
              : "background:#232833;color:#8b93a5;border:1px solid #2c303a;");
          t.onclick = (ev) => {
            ev.stopPropagation();
            applyPick(v);
          };
          bar.appendChild(t);
        }
        card.appendChild(bar);
      }

      card.onclick = () => applyPick(sel);
      grid.appendChild(card);
    }
    $main.appendChild(grid);
  }

  function updateFoot(entry) {
    if (!entry) {
      $picked.textContent = "未选择";
      $path.textContent = "";
      return;
    }
    let desc = `${entry.no} ${entry.zh} · ${entry.angle_name}`;
    if (state.render === RENDER_DEPTH) desc += " · 深度";
    $picked.textContent = desc;
    $path.textContent =
      state.render === RENDER_DEPTH ? (entry.depth_file || entry.file) : entry.file;
  }

  function render() {
    renderRenderSwitch();
    renderTabs();
    renderSide();
    renderMain();
    updateFoot(atlas.entries.find((e) => e.label === state.current));
  }

  $search.addEventListener("input", () => {
    state.q = $search.value;
    if (state.q.trim()) {
      state.series = null;
      state.category = null;
    } else if (cur) {
      state.series = cur.series;
      state.category = cur.category;
    }
    render();
  });

  render();
  document.body.appendChild(overlay);
  $search.focus();
}

function addGalleryButton(node, widget) {
  const btn = node.addWidget("button", "打开图库", null, async () => {
    try {
      const atlas = await getAtlas();
      openGallery(node, widget, atlas);
    } catch (e) {
      console.error("[PoseAtlas]", e);
      alert("PoseAtlas 图库加载失败：" + e.message);
    }
  });
  btn.serialize = false;
  return btn;
}

function drawPreview(node, ctx) {
  const widget = node.widgets && node.widgets.find((w) => w.name === WIDGET_NAME);
  if (!widget) return;
  const entry = ATLAS && ATLAS.entries && ATLAS.entries.find((e) => e.label === widget.value);
  if (!entry) return;

  const render = renderOf(node);
  const url = thumbUrl(entry, render);
  let img = node._paImg;
  if (!img || node._paImgSrc !== url) {
    img = new Image();
    img.onload = () => node.setDirtyCanvas && node.setDirtyCanvas(true, true);
    img.src = url;
    node._paImg = img;
    node._paImgSrc = url;
  }
  if (!img.complete || !img.naturalWidth) return;

  // 从所有控件下方开始画，避免盖住下拉框和按钮
  let top = 34;
  for (const w of node.widgets || []) {
    const ly = typeof w.last_y === "number" ? w.last_y : null;
    if (ly === null) continue;
    const h = w.size && w.size[1] ? w.size[1] : 20;
    top = Math.max(top, ly + h + 6);
  }

  const pad = 8;
  const availW = node.size[0] - pad * 2;
  const availH = node.size[1] - top - pad;
  if (availW <= 8 || availH <= 8) return;

  const ratio = img.naturalWidth / img.naturalHeight;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.drawImage(img, pad + (availW - w) / 2, top + (availH - h) / 2, w, h);
  ctx.restore();
}

app.registerExtension({
  name: "PoseAtlas.Gallery",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODE_TYPES.has(nodeData.name)) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated && onNodeCreated.apply(this, arguments);
      const widget = this.widgets && this.widgets.find((w) => w.name === WIDGET_NAME);
      if (widget) {
        widget.hidden = true;
        widget.computeSize = () => [0, -4];
        addGalleryButton(this, widget);
        this.size = [
          Math.max((this.size && this.size[0]) || 0, 260),
          Math.max((this.size && this.size[1]) || 0, 340),
        ];
      }
      return r;
    };

    const onDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      onDrawForeground && onDrawForeground.apply(this, arguments);
      try {
        drawPreview(this, ctx);
      } catch (e) {}
    };
  },
  async setup() {
    try {
      await getAtlas();
    } catch (e) {
      console.warn("PoseAtlas: 数据预加载失败", e);
    }
  },
});
