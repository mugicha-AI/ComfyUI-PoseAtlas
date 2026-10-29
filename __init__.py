"""
ComfyUI-PoseAtlas
=================
把 RuiC-PoseAtlas（288 组姿态 / 1439 张多角度人台线稿）打包成 ComfyUI 节点。

PoseAtlasLoader  从内置图库选一张图 → IMAGE / MASK / STRING
PoseAtlasInfo    只取所选姿态的文字信息 → STRING / STRING

数据与图片全部随节点内置（web/atlas/），不依赖外部目录或网络。
"""

import os
import json
import numpy as np
import torch
from PIL import Image

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
ATLAS_DIR = os.path.join(NODE_DIR, "web", "atlas")
INDEX_FILE = os.path.join(ATLAS_DIR, "poses.json")
WEB_DIRECTORY = "./web"

ANGLE_ORDER = ["front", "diagonal", "side", "high", "low"]

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
            entries.append({
                "label": f"[{series_short.get(sk, sk)}] {p['category']} / {p['no']} "
                         f"{p['names']['zh']} / {angle_names.get(ang, ang)}",
                "file": v["full"],
                "thumb": v["thumb"],
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
            if pose in (e["file"], e["id"], e["thumb"], e["no"]):
                return e
    return meta


class PoseAtlasLoader:
    """从内置姿态图库选图，输出 IMAGE / MASK。"""

    @classmethod
    def INPUT_TYPES(cls):
        labels = _labels()
        return {
            "required": {
                "pose": (labels, {"default": labels[0] if labels else ""}),
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
    DESCRIPTION = ("RuiC-PoseAtlas 姿态参考图库：288 组姿态 × 多角度人台线稿，"
                   "点「打开图库」可视化选择，直接作为图片输入。")

    @classmethod
    def IS_CHANGED(cls, pose="", **kwargs):
        return pose

    def load(self, pose, invert_mask=False):
        meta = _resolve(pose)
        if meta is None:
            raise ValueError(f"PoseAtlas: 找不到姿态 '{pose}'")

        path = os.path.join(ATLAS_DIR, meta["file"].replace("/", os.sep))
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
