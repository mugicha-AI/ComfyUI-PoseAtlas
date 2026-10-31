"""
ComfyUI-PoseAtlas
=================
把 RuiC-PoseAtlas 三个图集打包成 ComfyUI 节点：姿势 / 服饰 / 肖像。

PoseAtlasLoader  从内置图库选一张图 → IMAGE / MASK / STRING
PoseAtlasInfo    只取所选条目的文字信息 → STRING / STRING / STRING

三套图集共 4,345 条，全部由 web/atlas/index.json 描述：

  姿势 1,439 条 —— 288 组 × 5 角度，可选两种渲染
      线稿（img/）   原站 POSE-DB-01 的人台线稿
      深度（depth/） POSE-DB-02 的 900×1200 灰度深度图，白色靠近镜头
  服饰 1,407 条 —— 1366×2048 WEBP，按季节 / 品类 / 颜色组织
  肖像 1,499 条 —— 全尺寸 PNG，脸部 893 + 造型 606，按发型筛选

深度图只有缩略图（depth/thumbs/）随仓库分发，原图版权归原作者、禁止再打包。
在图库里点「↓ 原图」会调用 /poseatlas/depth 接口，由服务端从源站取回该张
900×1200 原图并写入 depth/img/，此后节点自动优先用原图；原图缺失时自动退回
缩略图，流程不会断。

数据与图片全部随节点内置（web/atlas/），不依赖外部目录。
"""

import os
import json
import re
import urllib.request

import numpy as np
import torch
from PIL import Image

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
ATLAS_DIR = os.path.join(NODE_DIR, "web", "atlas")
INDEX_FILE = os.path.join(ATLAS_DIR, "index.json")
DEPTH_IMG_DIR = os.path.join(ATLAS_DIR, "depth", "img")
WEB_DIRECTORY = "./web"

# 图集：显示名 → key
COLLECTION_POSE = "姿势"
COLLECTION_COSTUME = "服饰"
COLLECTION_PORTRAIT = "肖像"
COLLECTION_NAMES = {
    COLLECTION_POSE: "pose",
    COLLECTION_COSTUME: "costume",
    COLLECTION_PORTRAIT: "portrait",
}
COLLECTION_ORDER = [COLLECTION_POSE, COLLECTION_COSTUME, COLLECTION_PORTRAIT]

# 渲染方式：显示名 → 数据字段（只有姿势集有两种渲染）
RENDER_LINE = "线稿"
RENDER_DEPTH = "深度"
RENDER_KEYS = {
    RENDER_LINE: ("file", "thumb"),
    RENDER_DEPTH: ("depth_file", "depth_thumb"),
}

DEGRADED_NOTE = "（深度缩略图，原图未下载）"

# 只允许写这些文件名，防止路径穿越
SAFE_NAME = re.compile(r"^[A-Za-z0-9_]+\.png$")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

_data_cache = None


def _load_data():
    global _data_cache
    if _data_cache is not None:
        return _data_cache

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    entries = raw["entries"]

    # 老版本 index.json 没有 collection 字段，按姿势集处理
    for e in entries:
        e.setdefault("collection", "pose")
        if e["collection"] == "pose":
            stem = os.path.splitext(os.path.basename(e["file"]))[0]
            e.setdefault("depth_file", f"depth/img/{stem}.png")
            e.setdefault("depth_thumb", f"depth/thumbs/{stem}.jpg")

    labels = [e["label"] for e in entries]

    by_collection = {}
    for e in entries:
        by_collection.setdefault(e["collection"], []).append(e)

    _data_cache = {
        "entries": entries,
        "labels": labels,
        "by_label": {e["label"]: e for e in entries},
        "by_collection": by_collection,
        "collections": [
            c for c in raw.get("collections", [])
            if c["key"] in by_collection
        ],
        "totals": raw.get("total", len(entries)),
    }
    return _data_cache


def _labels(collection=None):
    d = _load_data()
    if collection is None:
        return d["labels"]
    key = COLLECTION_NAMES.get(collection)
    if key is None:
        return d["labels"]
    return [e["label"] for e in d["by_collection"].get(key, [])]


def _entries():
    return _load_data()["entries"]


def _resolve(label):
    d = _load_data()
    meta = d["by_label"].get(label)
    if meta is not None:
        return meta
    # 兼容按 id / 文件名 / 编号查找
    for e in d["entries"]:
        if label in (e.get("file"), e.get("id"), e.get("thumb"), e.get("no")):
            return e
    return None


def _atlas_path(rel):
    return os.path.join(ATLAS_DIR, rel.replace("/", os.sep))


def _resolve_depth(meta):
    """返回 (真实路径, 是否降级)。

    深度原图不随仓库分发，只有缩略图。原图存在就用原图，否则退回缩略图，
    这样别人 clone 下来直接就能用，只是分辨率低。
    """
    full = _atlas_path(meta["depth_file"])
    if os.path.isfile(full):
        return full, False
    thumb = _atlas_path(meta["depth_thumb"])
    if os.path.isfile(thumb):
        return thumb, True
    return full, False


class PoseAtlasLoader:
    """从内置图库选图，输出 IMAGE / MASK。"""

    @classmethod
    def INPUT_TYPES(cls):
        # 下拉框必须容纳三个图集的全部 label：图集切换在前端完成，
        # 服务端只按 label 做一次存在性校验，所以这里给全集。
        labels = _labels()
        return {
            "required": {
                "collection": (COLLECTION_ORDER, {
                    "default": COLLECTION_POSE,
                    "tooltip": "姿势 1,439 · 服饰 1,407 · 肖像 1,499。切换后需重新选择条目",
                }),
                "pose": (labels, {"default": labels[0] if labels else ""}),
                "render": ([RENDER_LINE, RENDER_DEPTH], {
                    "default": RENDER_LINE,
                    "tooltip": "线稿 = 人台线稿；深度 = 灰度深度图（白=近）。服饰/肖像只有原图，此项无效",
                }),
            },
            "optional": {
                "invert_mask": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "反转 MASK（人台图无 alpha，默认全 1）",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("image", "mask", "item_name")
    FUNCTION = "load"
    CATEGORY = "PoseAtlas"
    DESCRIPTION = ("RuiC-PoseAtlas 图库：姿势（线稿/深度）+ 服饰 + 肖像，"
                   f"共 {_load_data()['totals']} 条。点「打开图库」可视化选择并下载深度原图。")

    @classmethod
    def IS_CHANGED(cls, pose="", render=RENDER_LINE, collection=COLLECTION_POSE, **kwargs):
        return f"{collection}|{pose}|{render}"

    def load(self, pose, render=RENDER_LINE, collection=COLLECTION_POSE, invert_mask=False):
        meta = _resolve(pose)
        if meta is None:
            raise ValueError(f"PoseAtlas: 找不到条目 '{pose}'")

        coll = meta.get("collection", "pose")
        degraded = False

        # 只有姿势集有深度版；其余图集始终读原图
        if coll == "pose" and render == RENDER_DEPTH:
            path, degraded = _resolve_depth(meta)
        else:
            path = _atlas_path(meta["file"])

        if not os.path.isfile(path):
            raise FileNotFoundError(
                f"PoseAtlas: 图片未下载 —— {path}\n"
                f"图片版权归原作者所有，不随本仓库分发。请先在节点目录执行：\n"
                f"    python scripts/download_images.py\n"
                f"下载完成后重启 ComfyUI。"
            )

        img = Image.open(path)
        img.load()
        has_alpha = img.mode in ("RGBA", "LA") or (
            img.mode == "P" and "transparency" in img.info
        )
        if has_alpha:
            alpha = np.array(img.convert("RGBA").split()[-1], dtype=np.float32) / 255.0
        else:
            alpha = np.ones((img.height, img.width), dtype=np.float32)

        arr = np.array(img.convert("RGB"), dtype=np.float32) / 255.0
        image = torch.from_numpy(arr)[None,]
        mask = torch.from_numpy(alpha)[None,]
        if invert_mask:
            mask = 1.0 - mask

        if coll == "pose":
            name = f"{meta['zh']}（{meta['category']}・{meta['angle_name']}）"
            if render == RENDER_DEPTH:
                name += " · 深度"
                if degraded:
                    name += DEGRADED_NOTE
        elif coll == "costume":
            name = f"{meta['zh']}（{meta['category']}・{meta['id']}）"
        else:
            name = f"{meta['zh']}（{meta['section']}・{meta['id']}）"
        return (image, mask, name)


class PoseAtlasInfo:
    """只输出所选条目的文字信息，便于拼进提示词。"""

    @classmethod
    def INPUT_TYPES(cls):
        labels = _labels()
        return {
            "required": {
                "collection": (COLLECTION_ORDER, {
                    "default": COLLECTION_POSE,
                    "tooltip": "切换后需重新选择条目",
                }),
                "pose": (labels, {"default": labels[0] if labels else ""}),
                "language": (["zh", "en", "ja"], {"default": "zh"}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("item_name", "category", "series")
    FUNCTION = "info"
    CATEGORY = "PoseAtlas"
    DESCRIPTION = "读取所选条目的名称与分类，用于拼接提示词。"

    def info(self, pose, language="zh", collection=COLLECTION_POSE):
        meta = _resolve(pose)
        if meta is None:
            return ("", "", "")
        coll = meta.get("collection", "pose")
        name = meta.get(language) or meta.get("zh", "")
        if coll == "pose":
            category = meta["category"]
            series = meta["series_name"]
        elif coll == "costume":
            category = meta["category"]
            series = meta["group"]
        else:
            category = meta["section"]
            series = meta["hair"]
        return (name, category, series)


NODE_CLASS_MAPPINGS = {
    "PoseAtlasLoader": PoseAtlasLoader,
    "PoseAtlasInfo": PoseAtlasInfo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PoseAtlasLoader": "PoseAtlas 图库",
    "PoseAtlasInfo": "PoseAtlas 条目信息",
}


# ---------------------------------------------------------------------------
# 深度原图按需下载接口
#
# 前端点「↓ 原图」→ POST /poseatlas/depth {id} → 服务端从源站取回该张 PNG
# 校验文件头后写入 depth/img/，前端随后重绘即可用上原图。
# 只接受 index.json 里存在的压缩名，写入目录固定，不接受任意路径。
# ---------------------------------------------------------------------------

DEPTH_SOURCE = "https://ai-pose-depth-gallery.pages.dev/img/{name}"


def _fetch_depth_png(name, timeout=90):
    url = DEPTH_SOURCE.format(name=name)
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; ComfyUI-PoseAtlas)",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    if not data.startswith(PNG_MAGIC):
        raise ValueError("返回的不是 PNG（源站对缺失文件会返回首页 HTML）")
    return data


def _known_depth_stems():
    return {
        os.path.splitext(os.path.basename(e["depth_file"]))[0]
        for e in _entries()
        if e.get("collection", "pose") == "pose" and e.get("depth_file")
    }


try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.post("/poseatlas/depth")
    async def _poseatlas_depth(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "bad json"}, status=400)

        name = str(body.get("id", "")).strip()
        if not name.endswith(".png"):
            name += ".png"
        if not SAFE_NAME.match(name):
            return web.json_response({"ok": False, "error": "非法文件名"}, status=400)

        stem = name[:-4]
        if stem not in _known_depth_stems():
            return web.json_response({"ok": False, "error": "索引里没有该条目"}, status=404)

        dest = os.path.join(DEPTH_IMG_DIR, name)
        if os.path.isfile(dest) and os.path.getsize(dest) > 20000:
            return web.json_response({"ok": True, "cached": True, "bytes": os.path.getsize(dest)})

        os.makedirs(DEPTH_IMG_DIR, exist_ok=True)
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, _fetch_depth_png, name)
        except Exception as exc:  # noqa: BLE001
            return web.json_response({"ok": False, "error": str(exc)[:200]}, status=502)

        tmp = dest + ".part"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, dest)
        return web.json_response({"ok": True, "cached": False, "bytes": len(data)})

except Exception as _exc:  # noqa: BLE001
    # 没有 aiohttp/路由（例如在纯脚本环境下导入）时静默跳过，不影响节点本身
    print(f"[PoseAtlas] 深度下载接口未注册: {_exc}")
