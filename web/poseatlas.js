import { app } from "../../scripts/app.js";

/*
 * ComfyUI-PoseAtlas — 图库选择器
 * 把 PoseAtlasLoader / PoseAtlasInfo 的 pose 下拉框替换成可视化图库面板：
 *   系列 tab → 分类 → 缩略图网格 → 点选后写回下拉值并显示大图预览。
 * 数据与图片都来自本节点自带的 web/atlas 目录（/extensions/ComfyUI-PoseAtlas/atlas/）。
 */

const NODE_TYPES = new Set(["PoseAtlasLoader", "PoseAtlasInfo"]);
const WIDGET_NAME = "pose";
const EXT_BASE = "/extensions/ComfyUI-PoseAtlas/atlas/";
const API_DATA = EXT_BASE + "index.json";
const THUMB_BASE = EXT_BASE + "thumbs/";

let ATLAS = null;
let ATLAS_LOADING = null;

async function getAtlas() {
  if (ATLAS) return ATLAS;
  if (ATLAS_LOADING) return ATLAS_LOADING;
  ATLAS_LOADING = (async () => {
    const res = await fetch(API_DATA, { cache: "no-cache" });
    if (!res.ok) throw new Error("数据加载失败 " + res.status + " " + API_DATA);
    const data = await res.json();
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
.pa-body { display: flex; flex: 1; min-height: 0; }
.pa-side {
  width: 210px; flex: none; overflow-y: auto; padding: 10px 8px 16px;
  border-right: 1px solid #23262e; background: #14161b;
}
.pa-cat {
  padding: 7px 10px; border-radius: 6px; font-size: 13px; cursor: pointer;
  color: #a9b1c1; display: flex; justify-content: space-between; gap: 6px;
  user-select: none;
}
.pa-cat:hover { background: #1e2129; color: #e6e8ee; }
.pa-cat.on { background: #26334d; color: #fff; }
.pa-cat .n { font-size: 11px; color: #6b7285; }
.pa-cat.on .n { color: #9fb4dd; }
.pa-main { flex: 1; overflow-y: auto; padding: 14px; min-width: 0; }
.pa-grid {
  display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
}
.pa-card {
  background: #1b1e25; border: 1px solid #2c303a; border-radius: 8px;
  overflow: hidden; cursor: pointer; transition: border-color .12s, transform .12s;
}
.pa-card:hover { border-color: #4a7dd6; transform: translateY(-2px); }
.pa-card.on { border-color: #6ea8ff; box-shadow: 0 0 0 1px #6ea8ff inset; }
.pa-card img { width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block; background: #fff; }
.pa-card .cap { padding: 5px 7px; font-size: 11px; line-height: 1.35; color: #b9c0cf; }
.pa-card .cap b { display: block; color: #e6e8ee; font-weight: 600; font-size: 11.5px; }
.pa-empty { padding: 40px; text-align: center; color: #6b7285; font-size: 13px; }
.pa-foot {
  padding: 9px 16px; border-top: 1px solid #23262e; font-size: 12px;
  color: #8b93a5; flex: none; display: flex; gap: 12px; align-items: center;
}
.pa-foot .path { color: #6b7285; font-family: ui-monospace, monospace; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

function openGallery(node, widget, atlas) {
  injectCSS();

  const picked0 = widget.value || "";
  const state = { series: null, category: null, q: "", current: picked0 };

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

  const $tabs = overlay.querySelector(".pa-tabs");
  const $side = overlay.querySelector(".pa-side");
  const $main = overlay.querySelector(".pa-main");
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
      return (
        e.label.toLowerCase().includes(q) ||
        e.zh.toLowerCase().includes(q) ||
        e.en.toLowerCase().includes(q) ||
        e.ja.toLowerCase().includes(q) ||
        e.no.toLowerCase().includes(q)
      );
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
      img.src = THUMB_BASE + sel.thumb.split("/").pop();
      img.alt = sel.zh;
      card.appendChild(img);

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
    $picked.textContent = `${entry.no} ${entry.zh} · ${entry.angle_name}`;
    $path.textContent = entry.file;
  }

  function render() {
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

  const url = THUMB_BASE + entry.thumb.split("/").pop();
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
