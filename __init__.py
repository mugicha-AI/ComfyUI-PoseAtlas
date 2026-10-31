"""
ComfyUI-PoseAtlas
=================
把 RuiC-PoseAtlas（288 组姿态 / 1439 张多角度人台线稿）打包成 ComfyUI 节点。

PoseAtlasLoader  从内置图库选一张图 → IMAGE / MASK / STRING
PoseAtlasInfo    只取所选姿态的文字信息 → STRING / STRING

每个姿态变体都有两套渲染，用 `render` 参数切换：

  线稿（img/）     —— 原站 POSE-DB-01 的人台线稿，900×1200 PNG
  深度（depth/）   —— POSE-DB-02 的灰度深度图，900×1200，白色靠近镜头

深度图只有缩略图（depth/thumbs/，300×400）随仓库分发，原图版权归原作者、
禁止再打包。在图库里点「↓ 原图」按钮会调用 /poseatlas/depth 接口，由服务端
从源站取回该张 900×1200 原图并写入 depth/img/，之后节点自动优先用原图。

数据与图片全部在 web/atlas/，不依赖外部目录。
"""

import os
import json
import re
import urllib.error
import urllib.request

import numpy as np
import torch
from PIL import Image

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
ATLAS_DIR = os.path.join(NODE_DIR, "web", "atlas")
INDEX_FILE = os.path.join(ATLAS_DIR, "poses.json")
DEPTH_IMG_DIR = os.path.join(ATLAS_DIR, "depth", "img")
WEB_DIRECTORY = "./web"

ANGLE_ORDER = ["front", "diagonal", "side", "high", "low"]

# 渲染方式：显示名 → 数据字段
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
    series_names = {s["key"]: s["names"]["zh"] for s in raw.get("series", [])}
    series_short = {s["key"]: s["short"]["zh"] for s in raw.get("series", [])}
    angle_names = {a["key"]: a["names"]["zh"] for a in raw.get("angles", [])}
    series_order = {s["key"]: i for i, s in enumerate(raw.get("series", []))}
    cat_order = {}
    for cats in raw.get("categoriesBySeries", {}).values():
        for i, c in enumerate(cats):
            cat_order.setdefault(c, i)

    entries = []
    for p in raw["poses"]:
        sk = p["series"]
        for v in p["variants"]:
            ang = v["angle"]
            stem = os.path.splitext(os.path.basename(v["full"]))[0]
            entries.append({
                "label": f"[{series_short.get(sk, sk)}] {p['category']} / {p['no']} "
                         f"{p['names']['zh']} / {angle_names.get(ang, ang)}",
                "file": v["full"],
                "thumb": v["thumb"],
                # 深度版与线稿版同名不同目录，直接由文件名推导
                "depth_file": f"depth/img/{stem}.png",
                "depth_thumb": f"depth/thumbs/{stem}.jpg",
                "id": p["id"],
                "no": p["no"],
                "series": sk,
                "series_name": series_names.get(sk, sk),
                "category": p["category"],
                "angle": ang,
                "angle_name": angle_names.get(ang, ang),
                "zh": p["names"]["zh"],
                "en": p["names"]["en"],
                "ja": p["names"]["ja"],
                "_sort": (
                    series_order.get(sk, 99),
                    cat_order.get(p["category"], 99),
                    p["no"],
                    ANGLE_ORDER.index(ang) if ang in ANGLE_ORDER else 9,
                ),
            })
    entries.sort(key=lambda e: e["_sort"])
    for e in entries:
        del e["_sort"]

    _data_cache = {
        "entries": entries,
        "labels": [e["label"] for e in entries],
        "by_label": {e["label"]: e for e in entries},
    }
    return _data_cache


def _entries():
    return _load_data()["entries"]


def _labels():
    return _load_data()["labels"]


def _resolve(pose):
    d = _load_data()
    meta = d["by_label"].get(pose)
    if meta is None:
        for e in d["entries"]:
            if pose in (e.get("file"), e.get("id"), e.get("thumb"), e.get("no")):
                return e
    return meta


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
    """从内置姿态图库选图，输出 IMAGE / MASK。"""

    @classmethod
    def INPUT_TYPES(cls):
        labels = _labels()
        return {
            "required": {
                "pose": (labels, {"default": labels[0] if labels else ""}),
                "render": ([RENDER_LINE, RENDER_DEPTH], {
                    "default": RENDER_LINE,
                    "tooltip": "线稿 = POSE-DB-01 人台线稿；深度 = POSE-DB-02 灰度深度图（白=近）",
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
    RETURN_NAMES = ("image", "mask", "pose_name")
    FUNCTION = "load"
    CATEGORY = "PoseAtlas"
    DESCRIPTION = ("RuiC-PoseAtlas 姿态参考图库：288 组姿态 × 5 角度，可选线稿或深度渲染。"
                   "点「打开图库」可视化选择并下载原图。")

    @classmethod
    def IS_CHANGED(cls, pose="", render=RENDER_LINE, **kwargs):
        return f"{pose}|{render}"

    def load(self, pose, render=RENDER_LINE, invert_mask=False):
        meta = _resolve(pose)
        if meta is None:
            raise ValueError(f"PoseAtlas: 找不到姿态 '{pose}'")

        degraded = False
        if render == RENDER_DEPTH:
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

        name = f"{meta['zh']}（{meta['category']}・{meta['angle_name']}）"
        if render == RENDER_DEPTH:
            name += " · 深度"
            if degraded:
                name += DEGRADED_NOTE
        return (image, mask, name)


class PoseAtlasInfo:
    """只输出所选姿态的文字信息，便于拼进提示词。"""

    @classmethod
    def INPUT_TYPES(cls):
        labels = _labels()
        return {
            "required": {
                "pose": (labels, {"default": labels[0] if labels else ""}),
                "language": (["zh", "en", "ja"], {"default": "zh"}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("pose_name", "category", "series")
    FUNCTION = "info"
    CATEGORY = "PoseAtlas"
    DESCRIPTION = "读取所选姿态的中/英/日名称与分类，用于拼接提示词。"

    def info(self, pose, language="zh"):
        meta = _resolve(pose)
        if meta is None:
            return ("", "", "")
        return (
            meta.get(language, meta["zh"]),
            meta["category"],
            meta["series_name"],
        )


NODE_CLASS_MAPPINGS = {
    "PoseAtlasLoader": PoseAtlasLoader,
    "PoseAtlasInfo": PoseAtlasInfo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PoseAtlasLoader": "PoseAtlas 姿态图库",
    "PoseAtlasInfo": "PoseAtlas 姿态信息",
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
