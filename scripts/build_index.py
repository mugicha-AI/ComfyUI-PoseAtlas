#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建 web/atlas/index.json
=========================

从上游 RuiC-PoseAtlas 的 data/poses.json 生成前端用的扁平索引。
本仓库已内置生成好的 index.json，只有当你更新了 poses.json 时才需要重跑：

    python scripts/build_index.py

每个变体会同时记录两套渲染路径：

    file / thumb              线稿（900x1200 PNG + 300x400 JPG）
    depth_file / depth_thumb  深度（900x1200 灰度 PNG + 300x400 JPG）
    depth_remote              深度原图的源站地址

深度原图不随仓库分发，只带缩略图；前端「下载原图」按钮按 depth_remote
逐张取回。depth_file 与线稿同名，仅目录不同，因此直接由文件名推导。
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_DIR = os.path.join(os.path.dirname(HERE), "web", "atlas")
ANGLE_ORDER = ["front", "diagonal", "side", "high", "low"]

# 深度集（POSE-DB-02）的原图地址前缀
DEPTH_SITE = "https://ai-pose-depth-gallery.pages.dev/"


def main():
    src = os.path.join(ATLAS_DIR, "poses.json")
    with open(src, "r", encoding="utf-8") as f:
        raw = json.load(f)

    series_names = {s["key"]: s["names"]["zh"] for s in raw["series"]}
    series_short = {s["key"]: s["short"]["zh"] for s in raw["series"]}
    angle_names = {a["key"]: a["names"]["zh"] for a in raw["angles"]}
    series_order = {s["key"]: i for i, s in enumerate(raw["series"])}

    cat_order = {}
    for cats in raw.get("categoriesBySeries", {}).values():
        for i, c in enumerate(cats):
            cat_order.setdefault(c, i)

    entries = []
    for p in raw["poses"]:
        for v in p["variants"]:
            stem = os.path.splitext(os.path.basename(v["full"]))[0]
            entries.append({
                "label": "[%s] %s / %s %s / %s" % (
                    series_short[p["series"]], p["category"], p["no"],
                    p["names"]["zh"], angle_names.get(v["angle"], v["angle"]),
                ),
                "file": v["full"],
                "thumb": v["thumb"],
                "depth_file": "depth/img/%s.png" % stem,
                "depth_thumb": "depth/thumbs/%s.jpg" % stem,
                "depth_remote": DEPTH_SITE + "img/%s.png" % stem,
                "id": p["id"],
                "no": p["no"],
                "series": p["series"],
                "series_name": series_names.get(p["series"], p["series"]),
                "category": p["category"],
                "angle": v["angle"],
                "angle_name": angle_names.get(v["angle"], v["angle"]),
                "zh": p["names"]["zh"],
                "en": p["names"]["en"],
                "ja": p["names"]["ja"],
            })

    entries.sort(key=lambda e: (
        series_order.get(e["series"], 99),
        cat_order.get(e["category"], 99),
        e["no"],
        ANGLE_ORDER.index(e["angle"]) if e["angle"] in ANGLE_ORDER else 9,
    ))

    categories_by_series = {}
    for s in raw["series"]:
        names = raw.get("categoriesBySeries", {}).get(s["key"], [])
        categories_by_series[s["key"]] = [
            {"name": n, "count": sum(
                1 for p in raw["poses"] if p["series"] == s["key"] and p["category"] == n)}
            for n in names
        ]

    out = {
        "poses": len(raw["poses"]),
        "total": len(entries),
        "series": [{
            "key": s["key"],
            "name": s["names"]["zh"],
            "short": s["short"]["zh"],
            "poseCount": s["poseCount"],
            "imageCount": s["imageCount"],
        } for s in raw["series"]],
        "categoriesBySeries": categories_by_series,
        "angles": [{"key": a["key"], "name": a["names"]["zh"]} for a in raw["angles"]],
        "entries": entries,
    }

    dst = os.path.join(ATLAS_DIR, "index.json")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("index.json: %d poses / %d entries / %d series / 深度路径已写入" % (
        out["poses"], out["total"], len(out["series"])))


if __name__ == "__main__":
    main()
