#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建 web/atlas/index.json（三图集：姿势 / 服饰 / 肖像）

数据源（均已随仓库提供，不含图片）：

    web/atlas/poses.json      288 组姿态 × 5 角度
    web/atlas/costumes.json   1,407 套服饰
    web/atlas/faces.json      1,499 张肖像

三语：上游 RuiC-PoseAtlas 的数据本身就带 {zh,en,ja}，这里原样搬运，不做任何翻译。
唯一的例外是服饰标签与肖像造型名——上游给的是英文/日文 key，译文放在
scripts/_i18n/{tag_names,style_names}.json，由本脚本拼进三语字段。

每个条目同时给出：

    label                     规范中文串（节点下拉框/工作流存的就是它）
    labels                    {zh,en,ja} 面板显示用
    file / thumb              原图 / 缩略图（相对 web/atlas 的路径）
    depth_file / depth_thumb  深度原图 / 缩略图（仅姿势集）
    depth_remote              深度原图源站地址（面板「↓ 原图」用）

用法：

    python scripts/build_index.py

只在你更新了 poses.json / costumes.json / faces.json 时才需要重跑。
"""

import json
import os
import sys

# Windows 控制台默认 GBK，打日文/· 会炸；统一按 UTF-8 输出，失败就换字符
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001 - 老 Python / 重定向场景直接跳过
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_DIR = os.path.join(os.path.dirname(HERE), "web", "atlas")
I18N_DIR = os.path.join(HERE, "_i18n")

ANGLE_ORDER = ["front", "diagonal", "side", "high", "low"]
LANGS = ("zh", "en", "ja")

# 深度集（POSE-DB-02）的原图地址前缀，供面板里的「↓ 原图」逐张取回
DEPTH_SITE = "https://ai-pose-depth-gallery.pages.dev/"

PREFIX = {"zh": "[服饰]", "en": "[Costume]", "ja": "[衣装]"}
PREFIX_PORTRAIT = {"zh": "[肖像]", "en": "[Portrait]", "ja": "[ポートレート]"}


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def tri(d, fallback=""):
    """把 {zh,en,ja} 规整成三键齐全的字典；缺的键退回 zh。"""
    if not isinstance(d, dict):
        return {k: (d or fallback) for k in LANGS}
    base = d.get("zh") or fallback
    return {k: (d.get(k) or base) for k in LANGS}


def join_tri(parts, sep="・"):
    """把若干 {zh,en,ja} / 字符串按语言拼成一个 {zh,en,ja}。"""
    out = {}
    for lang in LANGS:
        vals = []
        for p in parts:
            v = p.get(lang) if isinstance(p, dict) else p
            if v:
                vals.append(str(v))
        out[lang] = sep.join(vals)
    return out


def pose_entries():
    raw = load(os.path.join(ATLAS_DIR, "poses.json"))
    series_names = {s["key"]: tri(s["names"]) for s in raw.get("series", [])}
    series_short = {s["key"]: tri(s["short"]) for s in raw.get("series", [])}
    angle_names = {a["key"]: tri(a["names"]) for a in raw.get("angles", [])}
    cat_names = {c["key"]: tri(c["names"]) for c in raw.get("categories", [])}
    series_order = {s["key"]: i for i, s in enumerate(raw.get("series", []))}
    cat_order = {}
    for cats in raw.get("categoriesBySeries", {}).values():
        for i, c in enumerate(cats):
            cat_order.setdefault(c, i)

    entries = []
    for p in raw["poses"]:
        sk = p["series"]
        short = series_short.get(sk) or tri(sk)
        cat = cat_names.get(p["category"]) or tri(p["category"])
        for v in p["variants"]:
            ang = v["angle"]
            ang_t = angle_names.get(ang) or tri(ang)
            stem = os.path.splitext(os.path.basename(v["full"]))[0]

            labels = {
                lang: (
                    f"[{short[lang]}] {cat[lang]} / {p['no']} "
                    f"{p['names'][lang]} / {ang_t[lang]}"
                )
                for lang in LANGS
            }

            entries.append({
                "collection": "pose",
                "label": labels["zh"],
                "labels": labels,
                "file": v["full"],
                "thumb": v["thumb"],
                "depth_file": "depth/img/%s.png" % stem,
                "depth_thumb": "depth/thumbs/%s.jpg" % stem,
                "depth_remote": DEPTH_SITE + "img/%s.png" % stem,
                "id": p["id"],
                "no": p["no"],
                "series": sk,
                "series_name": series_names.get(sk, {}).get("zh", sk),
                "series_tri": series_names.get(sk, tri(sk)),
                "category": p["category"],
                "category_tri": cat,
                "angle": ang,
                "angle_name": ang_t["zh"],
                "angle_tri": ang_t,
                "zh": p["names"]["zh"],
                "en": p["names"]["en"],
                "ja": p["names"]["ja"],
                "_sort": (
                    0,
                    series_order.get(sk, 99),
                    cat_order.get(p["category"], 99),
                    p["no"],
                    ANGLE_ORDER.index(ang) if ang in ANGLE_ORDER else 9,
                ),
            })
    return entries, raw


def costume_entries(tag_names):
    raw = load(os.path.join(ATLAS_DIR, "costumes.json"))
    cat_tri = {c["key"]: tri(c["names"]) for c in raw["categories"]}
    group_tri = {g["key"]: tri(g["names"]) for g in raw["groups"]}
    cat_order = {c["key"]: i for i, c in enumerate(raw["categories"])}

    def id_num(ident):
        """SPR-0004 -> 4；服饰组内按编号数字升序，不是字符串序。"""
        tail = str(ident).rsplit("-", 1)[-1]
        return int(tail) if tail.isdigit() else 0

    def tag_tri(tag):
        return tri(tag_names.get(tag, {}), fallback=tag)

    entries = []
    for c in raw["costumes"]:
        cat = cat_tri.get(c["cat"]) or tri(c["cat"])
        group = group_tri.get(c["group"]) or tri(c["group"])
        color = tag_tri(c["color"]) if c["color"] else {k: "" for k in LANGS}
        head = join_tri([group, color])
        tags_tri = [tag_tri(t) for t in c["tags"]]

        labels = {lang: f"{PREFIX[lang]} {cat[lang]} / {c['id']} {head[lang]}" for lang in LANGS}

        entries.append({
            "collection": "costume",
            "label": labels["zh"],
            "labels": labels,
            "file": c["image"],
            "thumb": c["thumb"],
            "id": c["id"],
            "category": cat["zh"],
            "category_key": c["cat"],
            "category_tri": cat,
            "group": group["zh"],
            "group_key": c["group"],
            "group_tri": group,
            "color": color["zh"],
            "color_tri": color,
            "zh": head["zh"],
            "en": head["en"],
            "ja": head["ja"],
            "tags": c["tags"],
            "tags_zh": [t["zh"] for t in tags_tri],
            "tags_tri": tags_tri,
            # 分类顺序照 costumes.json，组内按编号数字升序（不按 group 再分一层，
            # 否则同一季节里上装/下装会被拆成两段，看着像乱序）
            "_sort": (1, cat_order.get(c["cat"], 99), id_num(c["id"]), c["id"]),
        })
    return entries, raw


def portrait_entries(style_names):
    raw = load(os.path.join(ATLAS_DIR, "faces.json"))
    sec_tri = {s["key"]: tri(s["names"]) for s in raw["sections"]}
    hair_tri = {h["key"]: tri(h["names"]) for h in raw["hairs"]}
    sec_order = {s["key"]: i for i, s in enumerate(raw["sections"])}
    hair_order = {h["key"]: i for i, h in enumerate(raw["hairs"])}
    style_tri = {k: tri(v) for k, v in style_names.items()}

    entries = []
    for n, it in enumerate(raw["images"]):
        sec = sec_tri.get(it["sec"]) or tri(it["sec"])
        hair = hair_tri.get(it["hair"]) or tri(it["hair"])
        style = style_tri.get(it["style"]) if it["style"] else None
        head = join_tri([hair, style] if style else [hair])

        labels = {
            lang: f"{PREFIX_PORTRAIT[lang]} {sec[lang]} / {it['id']} {head[lang]}"
            for lang in LANGS
        }

        entries.append({
            "collection": "portrait",
            "label": labels["zh"],
            "labels": labels,
            "file": it["full"],
            "thumb": it["thumb"],
            "id": it["id"],
            "section": sec["zh"],
            "section_key": it["sec"],
            "section_tri": sec,
            "hair": hair["zh"],
            "hair_key": it["hair"],
            "hair_tri": hair,
            "style": (style or {}).get("zh", ""),
            "style_tri": style or {k: "" for k in LANGS},
            "w": it["w"],
            "h": it["h"],
            "zh": head["zh"],
            "en": head["en"],
            "ja": head["ja"],
            "_sort": (2, sec_order.get(it["sec"], 99), hair_order.get(it["hair"], 99), n),
        })
    return entries, raw


def main():
    tag_names = load(os.path.join(I18N_DIR, "tag_names.json"))
    style_names = load(os.path.join(I18N_DIR, "style_names.json"))

    poses, poses_raw = pose_entries()
    costumes, costumes_raw = costume_entries(tag_names)
    portraits, faces_raw = portrait_entries(style_names)

    entries = poses + costumes + portraits
    entries.sort(key=lambda e: e["_sort"])

    labels = [e["label"] for e in entries]
    if len(labels) != len(set(labels)):
        dupes = {x for x in labels if labels.count(x) > 1}
        raise SystemExit("duplicate labels: %s" % list(dupes)[:5])

    for e in entries:
        del e["_sort"]

    cat_tri = {c["key"]: tri(c["names"]) for c in poses_raw["categories"]}

    out = {
        "schema": 3,
        "languages": list(LANGS),
        "collections": [
            {"key": "pose", "name": "姿势",
             "name_tri": {"zh": "姿势", "en": "Poses", "ja": "ポーズ"},
             "count": len(poses), "poses": poses_raw["totals"]["poses"],
             "angles": len(poses_raw["angles"])},
            {"key": "costume", "name": "服饰",
             "name_tri": {"zh": "服饰", "en": "Costumes", "ja": "衣装"},
             "count": len(costumes), "categories": len(costumes_raw["categories"]),
             "groups": len(costumes_raw["groups"])},
            {"key": "portrait", "name": "肖像",
             "name_tri": {"zh": "肖像", "en": "Portraits", "ja": "ポートレート"},
             "count": len(portraits), "sections": len(faces_raw["sections"]),
             "hairs": len(faces_raw["hairs"])},
        ],
        "total": len(entries),
        "poses": poses_raw["totals"]["poses"],
        "series": [
            {
                "key": s["key"],
                "name": s["names"]["zh"],
                "short": s["short"]["zh"],
                "name_tri": tri(s["names"]),
                "short_tri": tri(s["short"]),
                "poseCount": s["poseCount"],
                "imageCount": s["imageCount"],
            }
            for s in poses_raw["series"]
        ],
        "categoriesBySeries": {
            k: [
                {
                    "name": n,
                    "name_tri": cat_tri.get(n, tri(n)),
                    "count": sum(1 for p in poses_raw["poses"]
                                 if p["series"] == k and p["category"] == n),
                }
                for n in v
            ]
            for k, v in poses_raw["categoriesBySeries"].items()
        },
        "angles": [
            {"key": a["key"], "name": a["names"]["zh"], "name_tri": tri(a["names"])}
            for a in poses_raw["angles"]
        ],
        "costumeCategories": [
            {"key": c["key"], "name": c["names"]["zh"], "name_tri": tri(c["names"]),
             "count": c["count"]}
            for c in costumes_raw["categories"]
        ],
        "costumeGroups": [
            {"key": g["key"], "name": g["names"]["zh"], "name_tri": tri(g["names"]),
             "count": g["count"]}
            for g in costumes_raw["groups"]
        ],
        "portraitSections": [
            {"key": s["key"], "name": s["names"]["zh"], "name_tri": tri(s["names"]),
             "count": s["count"]}
            for s in faces_raw["sections"]
        ],
        "portraitHairs": [
            {"key": h["key"], "name": h["names"]["zh"], "name_tri": tri(h["names"]),
             "count": h["count"]}
            for h in faces_raw["hairs"]
        ],
        "entries": entries,
    }

    os.makedirs(ATLAS_DIR, exist_ok=True)
    target = os.path.join(ATLAS_DIR, "index.json")
    # 紧凑写：这个文件要进 git，缩进能让它从 3.5MB 涨到 4.9MB，没有必要
    with open(target, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    print("wrote %s" % target)
    print("  total entries : %d" % len(entries))
    for c in out["collections"]:
        print("  %-6s %5d" % (c["name"], c["count"]))
    print("  size          : %.0f KB" % (os.path.getsize(target) / 1024))

    for key in ("pose", "costume", "portrait"):
        e = next(x for x in entries if x["collection"] == key)
        for lang in LANGS:
            print("  [%s] %s=%s" % (key, lang, e["labels"][lang]))


if __name__ == "__main__":
    main()
