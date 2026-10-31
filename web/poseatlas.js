import { app } from "../../scripts/app.js";

/*
 * ComfyUI-PoseAtlas — 图库选择器
 * 把 PoseAtlasLoader / PoseAtlasInfo 的 pose 下拉框替换成可视化图库面板：
 *   图集 tab（姿势/服饰/肖像）→ 侧栏分类 → 缩略图网格 → 点选写回下拉值。
 * 姿势集额外支持「线稿 / 深度」两种渲染。
 *
 * 面板支持 中文 / English / 日本語 三语切换，文案来自 index.json 里现成的
 * {zh,en,ja} 字段（上游 RuiC-PoseAtlas 本身就带三语，无需翻译）。
 * 节点上存的 label 始终是中文串，保证工作流跨语言可复用。
 *
 * 数据与图片都来自本节点自带的 web/atlas 目录（/extensions/ComfyUI-PoseAtlas/atlas/）。
 */

const NODE_TYPES = new Set(["PoseAtlasLoader", "PoseAtlasInfo"]);
const WIDGET_NAME = "pose";
const RENDER_WIDGET = "render";
const COLLECTION_WIDGET = "collection";
const EXT_BASE = "/extensions/ComfyUI-PoseAtlas/atlas/";
const API_DATA = EXT_BASE + "index.json";
const DEPTH_API = "/poseatlas/depth";
const LANG_KEY = "poseatlas-node-lang";

const RENDER_LINE = "线稿";
const RENDER_DEPTH = "深度";

const LANGS = ["zh", "en", "ja"];
const LANG_LABEL = { zh: "中文", en: "EN", ja: "日本語" };

/* 面板自身的界面文案（条目名来自数据，不在这里） */
const UI = {
  zh: {
    title: "PoseAtlas 图库",
    search: "搜索：名称 / 编号 / 分类",
    open: "打开图库",
    all: "全部",
    line: "线稿",
    depth: "深度",
    lineTip: "原图（姿势集为人台线稿）",
    depthTip: "深度图：白色靠近镜头，适合 ControlNet depth",
    depthOnlyPose: "深度版只有姿势集提供",
    noMatch: "没有匹配的条目",
    notDownloaded: "图片未下载",
    noSel: "未选择",
    dlOriginal: "↓ 原图",
    dlBusy: "下载中…",
    dlDone: "✓ 已下载",
    dlRetry: "↓ 重试",
    dlTip: "下载该角度的深度原图（900×1200），存到 web/atlas/depth/img/",
    warnTitle: "图片尚未下载。",
    warnBody:
      "图片版权归原作者所有，不随本仓库分发。<br>请在节点目录执行 " +
      "<code style='background:#2a1e0c;padding:1px 5px;border-radius:3px'>python scripts/download_images.py</code>，" +
      "下载完成后重启 ComfyUI。当前可以浏览分类与名称，但无法输出图片。",
  },
  en: {
    title: "PoseAtlas Gallery",
    search: "Search: name / number / category",
    open: "Open gallery",
    all: "All",
    line: "Line art",
    depth: "Depth",
    lineTip: "Original render (line art for the pose collection)",
    depthTip: "Depth map: white is near the camera, suits ControlNet depth",
    depthOnlyPose: "Depth is only available for the pose collection",
    noMatch: "No matching items",
    notDownloaded: "Image not downloaded",
    noSel: "Nothing selected",
    dlOriginal: "↓ Full",
    dlBusy: "Downloading…",
    dlDone: "✓ Saved",
    dlRetry: "↓ Retry",
    dlTip: "Download this depth original (900×1200) into web/atlas/depth/img/",
    warnTitle: "Images are not downloaded yet.",
    warnBody:
      "Image rights belong to the original author and are not redistributed here.<br>" +
      "Run <code style='background:#2a1e0c;padding:1px 5px;border-radius:3px'>python scripts/download_images.py</code> " +
      "in the node directory, then restart ComfyUI. You can browse names and categories now, but cannot output images.",
  },
  ja: {
    title: "PoseAtlas ギャラリー",
    search: "検索：名前 / 番号 / 分類",
    open: "ギャラリーを開く",
    all: "すべて",
    line: "線画",
    depth: "深度",
    lineTip: "元画像（ポーズ集はマネキン線画）",
    depthTip: "深度マップ：白いほど手前。ControlNet depth 向け",
    depthOnlyPose: "深度はポーズ集のみ",
    noMatch: "該当する項目がありません",
    notDownloaded: "画像未ダウンロード",
    noSel: "未選択",
    dlOriginal: "↓ 原寸",
    dlBusy: "ダウンロード中…",
    dlDone: "✓ 取得済み",
    dlRetry: "↓ 再試行",
    dlTip: "この深度画像の原寸（900×1200）を web/atlas/depth/img/ に保存します",
    warnTitle: "画像が未ダウンロードです。",
    warnBody:
      "画像の権利は原作者に帰属し、本リポジトリでは再配布していません。<br>" +
      "ノードのディレクトリで " +
      "<code style='background:#2a1e0c;padding:1px 5px;border-radius:3px'>python scripts/download_images.py</code> " +
      "を実行し、ComfyUI を再起動してください。現在は名前と分類の閲覧のみ可能です。",
  },
};

function resolveLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(v)) return v;
  } catch (e) {
    /* storage can be blocked */
  }
  const nav = (navigator.language || "zh").toLowerCase();
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("zh")) return "zh";
  return "en";
}

/* entry.thumb / entry.depth_thumb 都是相对 atlas 目录的路径，直接拼前缀。 */
function thumbUrl(entry, render) {
  if (render === RENDER_DEPTH && entry.depth_thumb) return EXT_BASE + entry.depth_thumb;
  return EXT_BASE + entry.thumb;
}

/* 条目显示名：优先用当前语言的 labels，缺了退回中文 label */
function entryLabel(entry, lang) {
  if (!entry) return "";
  return (entry.labels && entry.labels[lang]) || entry.label || "";
}

/* 条目**名称**（不含系列/编号/角度等前缀），用于卡片标题 */
function entryName(entry, lang) {
  if (!entry) return "";
  return entry[lang] || entry.zh || "";
}

/* 侧栏 / tab 的分组名：name_tri 优先 */
function triName(obj, lang) {
  if (!obj) return "";
  return (obj.name_tri && obj.name_tri[lang]) || obj.name || "";
}

function widgetOf(node, name) {
  return node && node.widgets && node.widgets.find((w) => w.name === name);
}

function renderOf(node) {
  const w = widgetOf(node, RENDER_WIDGET);
  return w && w.value === RENDER_DEPTH ? RENDER_DEPTH : RENDER_LINE;
}

function collectionOf(node) {
  const w = widgetOf(node, COLLECTION_WIDGET);
  return (w && w.value) || "姿势";
}

/* 深度原图是否已在本地：探测 depth/img/<stem>.png，结果缓存。
   ComfyUI 静态文件走浏览器缓存，所以探测 URL 带一个「本次页面加载」的指纹，
   避免沿用上次会话的缓存结果（那时图可能还没下载）。 */
const DEPTH_LOCAL = new Map();
const SESSION_TAG = Date.now().toString(36);
const DEPTH_BUST = new Map();

function depthFullUrl(entry) {
  const tag = DEPTH_BUST.get(entry.depth_file) || SESSION_TAG;
  return EXT_BASE + entry.depth_file + `?v=${tag}`;
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
  DEPTH_BUST.set(entry.depth_file, Date.now().toString(36));
  return payload;
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
    // 兼容老 index.json（没有 collection 字段）
    for (const e of data.entries) {
      if (!e.collection) e.collection = "pose";
    }
    // 探测图片是否已下载（版权原因不随仓库分发）
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

/* 侧栏筛选模型：每个图集用自己的维度 */
function sideModel(atlas, coll, lang = "zh") {
  if (coll === "pose") {
    return {
      tabs: atlas.series.map((s) => ({
        key: s.key,
        name: `${(s.short_tri && s.short_tri[lang]) || s.short} (${s.poseCount})`,
        title: (s.name_tri && s.name_tri[lang]) || s.name,
      })),
      items: (key) =>
        (atlas.categoriesBySeries[key] || []).map((c) => ({
          key: c.name, name: triName(c, lang), count: c.count,
        })),
      match: (e, key, item) => e.series === key && (!item || e.category === item),
      label: { zh: "系列", en: "Series", ja: "シリーズ" }[lang],
    };
  }
  if (coll === "costume") {
    return {
      tabs: atlas.costumeCategories.map((c) => ({
        key: c.key,
        name: `${triName(c, lang)} (${c.count})`,
        title: triName(c, lang),
      })),
      items: () => atlas.costumeGroups.map((g) => ({
        key: g.key, name: triName(g, lang), count: g.count,
      })),
      match: (e, key, item) => e.category_key === key && (!item || e.group === item),
      label: { zh: "季节", en: "Season", ja: "シーズン" }[lang],
    };
  }
  return {
    tabs: atlas.portraitSections.map((s) => ({
      key: s.key,
      name: `${triName(s, lang)} (${s.count})`,
      title: triName(s, lang),
    })),
    items: () => atlas.portraitHairs.map((h) => ({
      key: h.key, name: triName(h, lang), count: h.count,
    })),
    match: (e, key, item) => e.section_key === key && (!item || e.hair_key === item),
    label: { zh: "分区", en: "Section", ja: "セクション" }[lang],
  };
}

const CSS = `
.pa-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,.72);
  display: flex; align-items: center; justify-content: center;
  font-family: ui-sans-serif, system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.pa-panel {
  width: min(1240px, 95vw); height: min(900px, 93vh);
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
.pa-lang {
  display: flex; gap: 2px; padding: 3px;
  background: #1e2129; border: 1px solid #333846; border-radius: 8px;
}
.pa-lbtn {
  padding: 3px 9px; border-radius: 5px; font-size: 12px; cursor: pointer;
  color: #a9b1c1; user-select: none; white-space: nowrap;
}
.pa-lbtn:hover { color: #dfe4ee; }
.pa-lbtn.on { background: #3a4150; color: #fff; }
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
.pa-rbtn.off { opacity: .35; cursor: default; }
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
.pa-coll {
  display: flex; gap: 6px; padding: 10px 16px; flex: none;
  border-bottom: 1px solid #23262e; background: #14161b;
}
.pa-ctab {
  padding: 7px 18px; border-radius: 8px; font-size: 13.5px; font-weight: 600;
  cursor: pointer; background: #1e2129; border: 1px solid #333846; color: #a9b1c1;
  user-select: none;
}
.pa-ctab:hover { border-color: #4a7dd6; color: #dfe4ee; }
.pa-ctab.on { background: #2b4a86; border-color: #4a7dd6; color: #fff; }
.pa-ctab b { font-weight: 600; opacity: .7; margin-left: 6px; font-size: 12px; }
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

function openGallery(node, widget, atlas) {
  injectCSS();

  const picked0 = widget.value || "";
  const coll0 = collectionOf(node);
  const state = {
    collection: coll0,
    tab: null,
    item: null,
    q: "",
    current: picked0,
    render: renderOf(node),
    lang: resolveLang(),
  };

  const collKey = (name) => {
    if (name === "服饰") return "costume";
    if (name === "肖像") return "portrait";
    return "pose";
  };

  // 初始定位到当前条目所在的分组
  const cur = atlas.entries.find((e) => e.label === picked0);
  if (cur) {
    state.collection = cur.collection;
    if (cur.collection === "pose") {
      state.tab = cur.series;
      state.item = cur.category;
    } else if (cur.collection === "costume") {
      state.tab = cur.category_key;
      state.item = cur.group;
    } else {
      state.tab = cur.section_key;
      state.item = cur.hair_key;
    }
  }

  const t = (key) => (UI[state.lang] || UI.zh)[key];

  const overlay = document.createElement("div");
  // 阻止 Chrome 自动翻译：条目名是专有名词（Short / Medium 会被翻成「矮小」「中等」）
  overlay.className = "pa-overlay notranslate";
  overlay.setAttribute("translate", "no");
  overlay.innerHTML = `
    <div class="pa-panel">
      <div class="pa-head">
        <span class="pa-title"></span>
        <span class="pa-sub"></span>
        <div class="pa-lang"></div>
        <div class="pa-render"></div>
        <input class="pa-search" type="text" />
        <button class="pa-close" title="关闭">×</button>
      </div>
      <div class="pa-coll"></div>
      <div class="pa-tabs"></div>
      <div class="pa-body">
        <div class="pa-side"></div>
        <div class="pa-main"></div>
      </div>
      <div class="pa-foot">
        <span class="picked"></span>
        <span class="path"></span>
      </div>
    </div>`;

  if (atlas._imagesReady === false) {
    const warn = document.createElement("div");
    warn.style.cssText =
      "padding:10px 16px;background:#3a2a12;border-bottom:1px solid #5a3f18;" +
      "color:#e8c07a;font-size:12.5px;line-height:1.6;flex:none;";
    warn.innerHTML = `<b>${t("warnTitle")}</b>${t("warnBody")}`;
    warn.dataset.role = "image-warning";
    overlay.querySelector(".pa-panel").insertBefore(
      warn,
      overlay.querySelector(".pa-coll")
    );
  }

  const $title = overlay.querySelector(".pa-title");
  const $sub = overlay.querySelector(".pa-sub");
  const $lang = overlay.querySelector(".pa-lang");
  const $coll = overlay.querySelector(".pa-coll");
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

  function entriesOfCollection() {
    return atlas.entries.filter((e) => e.collection === collKey(state.collection));
  }

  function renderCollectionTabs() {
    $coll.innerHTML = "";
    // 老索引（只有姿势集）没有 collections 字段，整条 tab 栏就不必显示
    const meta = atlas.collections || [];
    if (!meta.length) {
      $coll.style.display = "none";
      const total0 = atlas.total || atlas.entries.length;
      $sub.textContent = {
        zh: `共 ${total0.toLocaleString()} 条`,
        en: `${total0.toLocaleString()} items`,
        ja: `全 ${total0.toLocaleString()} 件`,
      }[state.lang];
      return;
    }
    $coll.style.display = "";
    for (const c of meta) {
      const b = document.createElement("div");
      b.className = "pa-ctab" + (c.name === state.collection ? " on" : "");
      const collName = (c.name_tri && c.name_tri[state.lang]) || c.name;
      b.innerHTML = `${collName}<b>${c.count.toLocaleString()}</b>`;
      b.onclick = () => {
        if (state.collection === c.name) return;
        state.collection = c.name;
        const m = sideModel(atlas, c.key, state.lang);
        state.tab = m.tabs.length ? m.tabs[0].key : null;
        state.item = null;
        state.q = "";
        $search.value = "";
        // 同步节点上的 collection 下拉，并切到该图集第一条
        const cw = widgetOf(node, COLLECTION_WIDGET);
        if (cw) {
          cw.value = c.name;
          if (cw.callback) {
            try { cw.callback(c.name); } catch (e) {}
          }
        }
        const first = entriesOfCollection()[0];
        if (first) applyPick(first, true);
        render();
      };
      $coll.appendChild(b);
    }
    const total = atlas.total || atlas.entries.length;
    $sub.textContent = {
      zh: `共 ${total.toLocaleString()} 条 · ${meta.length} 个图集`,
      en: `${total.toLocaleString()} items · ${meta.length} collections`,
      ja: `全 ${total.toLocaleString()} 件 · ${meta.length} コレクション`,
    }[state.lang];
  }

  function renderLangSwitch() {
    $lang.innerHTML = "";
    for (const code of LANGS) {
      const b = document.createElement("div");
      b.className = "pa-lbtn" + (code === state.lang ? " on" : "");
      b.textContent = LANG_LABEL[code];
      b.onclick = () => {
        if (state.lang === code) return;
        state.lang = code;
        try {
          localStorage.setItem(LANG_KEY, code);
        } catch (e) {
          /* storage can be blocked */
        }
        render();
      };
      $lang.appendChild(b);
    }
  }

  function renderRenderSwitch() {
    $render.innerHTML = "";
    const isPose = collKey(state.collection) === "pose";
    for (const mode of [RENDER_LINE, RENDER_DEPTH]) {
      const b = document.createElement("div");
      const disabled = mode === RENDER_DEPTH && !isPose;
      b.className = "pa-rbtn" + (mode === state.render && !disabled ? " on" : "") +
        (disabled ? " off" : "");
      b.textContent = mode === RENDER_DEPTH ? t("depth") : t("line");
      b.title = disabled
        ? t("depthOnlyPose")
        : (mode === RENDER_DEPTH ? t("depthTip") : t("lineTip"));
      if (!disabled) {
        b.onclick = () => {
          state.render = mode;
          const w = widgetOf(node, RENDER_WIDGET);
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
      }
      $render.appendChild(b);
    }
  }

  function renderTabs() {
    $tabs.innerHTML = "";
    const m = sideModel(atlas, collKey(state.collection), state.lang);
    for (const tb of m.tabs) {
      const b = document.createElement("div");
      b.className = "pa-tab" + (tb.key === state.tab ? " on" : "");
      b.textContent = tb.name;
      b.title = tb.title || tb.name;
      b.onclick = () => {
        state.tab = tb.key;
        state.item = null;
        render();
      };
      $tabs.appendChild(b);
    }
  }

  function renderSide() {
    $side.innerHTML = "";
    const m = sideModel(atlas, collKey(state.collection), state.lang);
    const items = state.tab ? m.items(state.tab) : [];
    const total = items.reduce((a, c) => a + c.count, 0);

    const hd = document.createElement("div");
    hd.className = "pa-side-hd";
    hd.textContent = m.label;
    $side.appendChild(hd);

    const all = document.createElement("div");
    all.className = "pa-cat" + (state.item === null ? " on" : "");
    all.innerHTML = `<span>${t("all")}</span><span class="n">${total}</span>`;
    all.onclick = () => {
      state.item = null;
      render();
    };
    $side.appendChild(all);

    for (const it of items) {
      const el = document.createElement("div");
      el.className = "pa-cat" + (state.item === it.key ? " on" : "");
      el.innerHTML = `<span>${it.name}</span><span class="n">${it.count}</span>`;
      el.onclick = () => {
        state.item = it.key;
        render();
      };
      $side.appendChild(el);
    }
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const coll = collKey(state.collection);
    const m = sideModel(atlas, coll, state.lang);
    return atlas.entries.filter((e) => {
      if (e.collection !== coll) return false;
      if (q) {
        const L = e.labels || {};
        const hay = [
          e.label, L.zh, L.en, L.ja, e.zh, e.en, e.ja, e.no, e.id,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      }
      if (state.tab && !m.match(e, state.tab, state.item)) return false;
      return true;
    });
  }

  function applyPick(entry, silent) {
    state.current = entry.label;
    widget.value = entry.label;
    if (widget.callback) {
      try {
        widget.callback(entry.label, app.canvas, node, app.canvas && app.canvas.graph_mouse);
      } catch (e) {}
    }
    node.setDirtyCanvas && node.setDirtyCanvas(true, true);
    app.graph && app.graph.setDirtyCanvas && app.graph.setDirtyCanvas(true, true);
    if (!silent) {
      updateFoot(entry);
      renderMain();
    }
  }

  /* 卡片右上角的下载按钮：把该角度的深度原图取回 depth/img/ */
  function makeDownloadButton(entry) {
    const btn = document.createElement("span");
    btn.className = "pa-dl";
    btn.textContent = t("dlOriginal");
    btn.title = t("dlTip");

    probeDepthLocal(entry).then((has) => {
      if (has) {
        btn.classList.add("done");
        btn.textContent = t("dlDone");
      }
    });

    btn.onclick = async (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (btn.classList.contains("busy") || btn.classList.contains("done")) return;
      btn.classList.add("busy");
      btn.textContent = t("dlBusy");
      try {
        await requestDepthDownload(entry);
        btn.classList.remove("busy");
        btn.classList.add("done");
        btn.textContent = t("dlDone");
        // 该角度正在被选中时，让节点预览切到刚下好的原图
        if (state.current === entry.label) {
          node._paImg = null;
          node._paImgSrc = null;
          node.setDirtyCanvas && node.setDirtyCanvas(true, true);
        }
      } catch (e) {
        btn.classList.remove("busy");
        btn.textContent = t("dlRetry");
        btn.title = e.message;
      }
    };
    return btn;
  }

  function renderMain() {
    const list = filtered();
    $main.innerHTML = "";
    if (!list.length) {
      $main.innerHTML = `<div class="pa-empty">${t("noMatch")}</div>`;
      return;
    }
    const grid = document.createElement("div");
    grid.className = "pa-grid";

    const coll = collKey(state.collection);

    if (coll === "pose") {
      // 姿势按 pose id 聚合成卡片，一张卡带 5 个角度
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
        img.alt = entryName(sel, state.lang);
        img.onerror = () => {
          const ph = document.createElement("div");
          ph.style.cssText =
            "aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;" +
            "background:#232833;color:#6b7285;font-size:11px;text-align:center;padding:8px;line-height:1.5;";
          ph.textContent = t("notDownloaded");
          img.replaceWith(ph);
        };
        card.appendChild(img);

        // 深度模式给下载按钮（线稿走 download_images.py 批量下）
        if (state.render === RENDER_DEPTH && sel.depth_file) {
          card.appendChild(makeDownloadButton(sel));
        }

        const cap = document.createElement("div");
        cap.className = "cap";
        const catName = (sel.category_tri && sel.category_tri[state.lang]) || sel.category;
        cap.innerHTML = `<b>${sel.no} ${entryName(sel, state.lang)}</b>${catName}`;
        card.appendChild(cap);

        if (variants.length > 1) {
          const bar = document.createElement("div");
          bar.style.cssText = "display:flex;gap:3px;padding:0 5px 5px;flex-wrap:wrap;";
          for (const v of variants) {
            const tag = document.createElement("span");
            const angName = (v.angle_tri && v.angle_tri[state.lang]) || v.angle_name;
            tag.textContent = angName;
            tag.title = angName;
            const on = v.label === state.current;
            tag.style.cssText =
              "font-size:10px;padding:1px 5px;border-radius:4px;cursor:pointer;user-select:none;" +
              (on
                ? "background:#2b4a86;color:#fff;border:1px solid #4a7dd6;"
                : "background:#232833;color:#8b93a5;border:1px solid #2c303a;");
            tag.onclick = (ev) => {
              ev.stopPropagation();
              applyPick(v);
            };
            bar.appendChild(tag);
          }
          card.appendChild(bar);
        }

        card.onclick = () => applyPick(sel);
        grid.appendChild(card);
      }
    } else {
      // 服饰 / 肖像：一条一卡
      for (const e of list) {
        const card = document.createElement("div");
        card.className = "pa-card" + (e.label === state.current ? " on" : "");

        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = thumbUrl(e, state.render);
        img.alt = entryName(e, state.lang);
        img.onerror = () => {
          const ph = document.createElement("div");
          ph.style.cssText =
            "aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;" +
            "background:#232833;color:#6b7285;font-size:11px;text-align:center;padding:8px;line-height:1.5;";
          ph.textContent = t("notDownloaded");
          img.replaceWith(ph);
        };
        card.appendChild(img);

        const cap = document.createElement("div");
        cap.className = "cap";
        cap.innerHTML = `<b>${entryName(e, state.lang)}</b>${e.id}`;
        card.appendChild(cap);

        card.onclick = () => applyPick(e);
        grid.appendChild(card);
      }
    }

    $main.appendChild(grid);
  }

  function updateFoot(entry) {
    if (!entry) {
      $picked.textContent = t("noSel");
      $path.textContent = "";
      return;
    }
    const name = entryName(entry, state.lang);
    let desc;
    if (entry.collection === "pose") {
      const angName = (entry.angle_tri && entry.angle_tri[state.lang]) || entry.angle_name;
      desc = `${entry.no} ${name} · ${angName}`;
      if (state.render === RENDER_DEPTH) desc += ` · ${t("depth")}`;
    } else if (entry.collection === "costume") {
      const catName = (entry.category_tri && entry.category_tri[state.lang]) || entry.category;
      desc = `${entry.id} ${name} · ${catName}`;
    } else {
      const secName = (entry.section_tri && entry.section_tri[state.lang]) || entry.section;
      desc = `${entry.id} ${name} · ${secName}`;
    }
    $picked.textContent = desc;
    $path.textContent =
      state.render === RENDER_DEPTH && entry.depth_file ? entry.depth_file : entry.file;
  }

  function render() {
    $title.textContent = t("title");
    $search.placeholder = t("search");
    renderLangSwitch();
    renderCollectionTabs();
    renderRenderSwitch();
    renderTabs();
    renderSide();
    renderMain();
    updateFoot(atlas.entries.find((e) => e.label === state.current));
  }

  $search.addEventListener("input", () => {
    state.q = $search.value;
    renderMain();
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
  const widget = widgetOf(node, WIDGET_NAME);
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
      const widget = widgetOf(this, WIDGET_NAME);
      if (widget) {
        // pose / render / collection 三个都只做 UI 状态，全部收进图库面板，
        // 实际读取哪个文件由选中条目的字段决定，所以节点上不需要露出它们。
        widget.hidden = true;
        widget.computeSize = () => [0, -4];
        for (const name of [RENDER_WIDGET, COLLECTION_WIDGET]) {
          const w = widgetOf(this, name);
          if (w) {
            w.hidden = true;
            w.computeSize = () => [0, -4];
          }
        }
        addGalleryButton(this, widget);
        this.size = [
          Math.max((this.size && this.size[0]) || 0, 280),
          Math.max((this.size && this.size[1]) || 0, 420),
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
