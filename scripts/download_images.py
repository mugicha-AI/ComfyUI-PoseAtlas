#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ComfyUI-PoseAtlas 图片下载脚本（三图集）
========================================

本仓库**不包含任何图片**：姿势线稿 / 深度图 / 服饰 / 肖像，版权都归原作者，
只提供脚本从公开源站取回到你的本地。装完节点请先跑一次本脚本，图库才有缩略图。

用法（在 ComfyUI-PoseAtlas 节点目录下执行）：

    python scripts/download_images.py                 # 三套缩略图（约 59 MB，先跑这个）
    python scripts/download_images.py --full          # 再加全尺寸原图（约 5.4 GB）
    python scripts/download_images.py --only pose     # 只处理某一套 pose/costume/portrait
    python scripts/download_images.py --only depth-thumbs  # 用本地深度原图重缩缩略图
    python scripts/download_images.py --thumbs-only   # 明确只下缩略图（同默认）
    python scripts/download_images.py --dry-run       # 只统计缺多少，不下载
    python scripts/download_images.py --workers 12    # 并发数，默认 8

下载后目录：

    web/atlas/img/               1439 张 900×1200 姿势线稿 PNG
    web/atlas/thumbs/            1439 张 300×400 JPEG
    web/atlas/costume/img/       1407 张 1366×2048 WEBP
    web/atlas/costume/thumbs/    1407 张 360×540 WEBP
    web/atlas/portrait/img/      1499 张全尺寸 PNG（约 4.6 GB）
    web/atlas/portrait/thumbs/   1499 张 400×500 WEBP
    web/atlas/depth/img/         空，深度原图**不批量下载**，见下

来源优先级（每个文件都按顺序试，前面失败时自动换镜像）：

    姿势 thumbnail / full   raw.githubusercontent → jsdelivr → ghfast → gh-proxy
    服饰 thumbnail / full   raw.githubusercontent → jsdelivr → ghfast → gh-proxy
    肖像 thumbnail          raw.githubusercontent → jsdelivr → ai-portrait-gallery
    肖像 full               ai-portrait-gallery → jsdelivr（上游仓库不带全尺寸 PNG）

关于深度：源站明确禁止「ツール等による自動取得」（含程序化批量抓取）与再分发，
所以本脚本**不提供深度原图的批量下载**。请在节点面板里切到「深度」逐张点
「↓ 原图」，由 /poseatlas/depth 接口取回你点的那一张，并顺带生成它的缩略图。
深度缩略图没有公开来源（上游把 depth/ 整个 gitignore 了），只能这样得到；
要把本地已有的深度原图重新缩一遍，用 `--only depth-thumbs`。

注意：肖像全尺寸走的是源站单点，速度明显慢于其它三套（每张约 2 MB，
单张常要几十秒）。只想要缩略图就别加 --full。
"""

import argparse
import concurrent.futures
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request

try:  # 只在需要缩深度缩略图时用得上
    from PIL import Image
except ImportError:  # pragma: no cover - 环境缺 PIL 时给提示而不是崩
    Image = None

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001 - 老 Python / 重定向场景跳过
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
NODE_DIR = os.path.dirname(HERE)
ATLAS_DIR = os.path.join(NODE_DIR, "web", "atlas")
INDEX_FILE = os.path.join(ATLAS_DIR, "index.json")

UPSTREAM_RAW = "https://raw.githubusercontent.com/HRuiCcc/RuiC-PoseAtlas/main/"
UPSTREAM_JSD = "https://cdn.jsdelivr.net/gh/HRuiCcc/RuiC-PoseAtlas@main/"

# 国内直连 raw.githubusercontent 常失败，多镜像兜底
MIRRORS_RAW = [
    UPSTREAM_RAW,
    UPSTREAM_JSD,
    "https://ghfast.top/" + UPSTREAM_RAW,
    "https://gh-proxy.com/" + UPSTREAM_RAW,
]

PORTRAIT_SITE = "https://ai-portrait-gallery.pages.dev/"
DEPTH_SITE = "https://ai-pose-depth-gallery.pages.dev/"

UA = {"User-Agent": "Mozilla/5.0 (compatible; ComfyUI-PoseAtlas-downloader)"}

# 文件头校验：源站对缺失文件会返回 HTML/JSON 页面（HTTP 200），不能只看状态码
MAGIC = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".webp": (b"RIFF",),
}

THUMB_MAX = (300, 400)  # 深度缩略图输出上限，与上游姿势缩略图 300×400 对齐

_lock = threading.RLock()  # 可重入：log() 可能在别的锁块里被调用
_done = [0]
_failed = []
_skipped = []


def log(msg):
    with _lock:
        print(msg, flush=True)


def magic_ok(rel, data):
    """按扩展名校验文件头，返回 True/False。"""
    ext = os.path.splitext(rel)[1].lower()
    magics = MAGIC.get(ext)
    if not magics:
        return True
    if not any(data.startswith(m) for m in magics):
        return False
    if ext == ".webp":
        return data[8:12] == b"WEBP"
    return True


def fetch(urls, rel, timeout=60, retries=2):
    """按 urls 顺序尝试，返回 bytes；全部失败抛最后一个异常。"""
    last = None
    for attempt in range(retries):
        for url in urls:
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    data = r.read()
                if not magic_ok(rel, data):
                    last = ValueError("文件头不匹配（源站返回了错误页）: %s" % url)
                    continue
                if len(data) < 256:
                    last = ValueError("文件过小(%d B): %s" % (len(data), url))
                    continue
                return data
            except Exception as exc:  # noqa: BLE001 - 换下一个镜像
                last = exc
        if attempt + 1 < retries:
            time.sleep(1.0 * (attempt + 1))
    raise last if last else RuntimeError("unknown error")


# ---------------------------------------------------------------------------
# 任务表：每个任务 = (集合名, 相对路径, 目标绝对路径, 候选 URL 列表, 缩略图任务标记)
# ---------------------------------------------------------------------------

def build_jobs(index, only, want_full):
    """把 index.json 摊平成下载任务，按 --only / --full 过滤。"""
    jobs = []
    seen = set()

    def add(coll, rel, urls, is_thumb):
        if rel in seen:
            return
        seen.add(rel)
        jobs.append({
            "coll": coll,
            "rel": rel,
            "dst": os.path.join(ATLAS_DIR, rel.replace("/", os.sep)),
            "urls": urls,
            "thumb": is_thumb,
        })

    for e in index["entries"]:
        coll = e.get("collection", "pose")

        if coll == "pose":
            if only in (None, "pose"):
                add("pose", e["thumb"], [m + e["thumb"] for m in MIRRORS_RAW], True)
                if want_full:
                    add("pose", e["file"], [m + e["file"] for m in MIRRORS_RAW], False)
            continue

        if coll == "costume":
            if only in (None, "costume"):
                add("costume", e["thumb"], [m + e["thumb"] for m in MIRRORS_RAW], True)
                if want_full:
                    add("costume", e["file"], [m + e["file"] for m in MIRRORS_RAW], False)
            continue

        if coll == "portrait":
            if only in (None, "portrait"):
                name = os.path.basename(e["thumb"])
                add("portrait", e["thumb"],
                    [m + e["thumb"] for m in MIRRORS_RAW[:2]]
                    + [PORTRAIT_SITE + "img/thumb/" + name], True)
                if want_full:
                    # 上游仓库 gitignore 了 portrait/img，全尺寸只在源站
                    full_name = os.path.basename(e["file"])
                    add("portrait", e["file"],
                        [PORTRAIT_SITE + "img/full/" + full_name]
                        + [m + e["file"] for m in MIRRORS_RAW[:2]], False)

    # 深度：本脚本**不批量下载**原图（源站明令禁止自动批量抓取）。
    # 原图请在节点面板里逐张点「↓ 原图」，由 /poseatlas/depth 接口取回并顺带
    # 生成缩略图。这里只提供 `--only depth-thumbs`：把本地已有的深度原图重新
    # 缩成缩略图，供换机器 / 补缩略图时用。
    if only == "depth-thumbs":
        for e in index["entries"]:
            if e.get("collection", "pose") != "pose":
                continue
            stem = os.path.splitext(os.path.basename(e["file"]))[0]
            src = e.get("depth_file") or ("depth/img/%s.png" % stem)
            thumb_rel = e.get("depth_thumb") or ("depth/thumbs/%s.jpg" % stem)
            jobs.append({
                "coll": "depth-thumb",
                "rel": thumb_rel,
                "dst": os.path.join(ATLAS_DIR, thumb_rel.replace("/", os.sep)),
                "urls": [],
                "thumb": True,
                "from": src,
            })

    return jobs


# ---------------------------------------------------------------------------
# 执行
# ---------------------------------------------------------------------------

def already_ok(dst):
    return os.path.isfile(dst) and os.path.getsize(dst) > 256


def make_depth_thumb(src_png, dst_jpg):
    """把深度原图缩成 300×400 级别的 JPEG。没有 PIL 时直接跳过（不致命）。"""
    if Image is None:
        return False
    img = Image.open(src_png)
    img.load()
    img = img.convert("L")
    img.thumbnail(THUMB_MAX, Image.LANCZOS)
    os.makedirs(os.path.dirname(dst_jpg), exist_ok=True)
    tmp = dst_jpg + ".part"
    img.save(tmp, "JPEG", quality=82, optimize=True)
    os.replace(tmp, dst_jpg)
    return True


def run_one(job, total, dry_run):
    dst = job["dst"]
    rel = job["rel"]

    if already_ok(dst):
        with _lock:
            _done[0] += 1
            _skipped.append(rel)
            n = _done[0]
        if n % 200 == 0 or n == total:
            log("  [%d/%d] 已存在，跳过" % (n, total))
        return True

    if dry_run:
        with _lock:
            _done[0] += 1
            _failed.append(rel)
        return False

    # 深度缩略图：从本地原图缩出来，不联网
    if job["coll"] == "depth-thumb":
        src = os.path.join(ATLAS_DIR, job["from"].replace("/", os.sep))
        if not already_ok(src):
            with _lock:
                _done[0] += 1
                _skipped.append(rel)
            return True  # 原图没下，缩略图自然没有，不算失败
        try:
            ok = make_depth_thumb(src, dst)
        except Exception as exc:  # noqa: BLE001
            with _lock:
                _done[0] += 1
                _failed.append((rel, str(exc)[:80]))
            return False
        with _lock:
            _done[0] += 1
            n = _done[0]
        if ok:
            log("  [%d/%d] 深度缩略图 %s" % (n, total, rel))
        else:
            log("  [%d/%d] 跳过缩略图（未装 Pillow）" % (n, total))
        return ok

    try:
        data = fetch(job["urls"], rel)
    except Exception as exc:  # noqa: BLE001
        with _lock:
            _done[0] += 1
            _failed.append((rel, str(exc)[:90]))
        return False

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".part"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, dst)

    with _lock:
        _done[0] += 1
        n = _done[0]
    if n % 50 == 0 or n == total:
        log("  [%d/%d] %s" % (n, total, rel))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--thumbs-only", action="store_true", help="只下载缩略图（默认行为）")
    ap.add_argument("--full", action="store_true", help="连全尺寸原图一起下（约 5.4 GB，深度除外）")
    ap.add_argument("--only", choices=["pose", "costume", "portrait", "depth-thumbs"],
                    help="只处理某一套图集；depth-thumbs = 用本地深度原图重缩缩略图")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true", help="只统计，不下载")
    args = ap.parse_args()

    if not os.path.isfile(INDEX_FILE):
        print("[错误] 找不到 %s" % INDEX_FILE)
        print("       请在 ComfyUI-PoseAtlas 节点目录下运行本脚本。")
        return 2

    with open(INDEX_FILE, encoding="utf-8") as fh:
        index = json.load(fh)

    want_full = args.full and not args.thumbs_only

    jobs = build_jobs(index, args.only, want_full)
    total = len(jobs)
    if not total:
        print("没有需要处理的条目（检查 --only / --full 的组合）。")
        return 0

    by_coll = {}
    for j in jobs:
        by_coll[j["coll"]] = by_coll.get(j["coll"], 0) + 1

    print("=" * 64)
    print("ComfyUI-PoseAtlas 图片下载")
    print("=" * 64)
    print("目标目录 : %s" % ATLAS_DIR)
    print("待处理   : %d 个文件" % total)
    for k in ("pose", "costume", "portrait", "depth-thumb"):
        if k in by_coll:
            print("           %-12s %5d" % (k, by_coll[k]))
    print("模式     : %s" % ("缩略图 + 全尺寸原图" if want_full else "仅缩略图"))
    print("并发     : %d" % args.workers)
    print("")
    print("图片版权归原作者所有，本脚本只从公开源站取回供本地创作参考；")
    print("请勿再分发取回的文件本身。")
    print("深度原图的源站禁止程序化批量抓取，本脚本不下载深度原图 ——")
    print("请在节点面板里切到「深度」逐张点「↓ 原图」，需要的那几张才取。")
    print("")

    started = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_one, j, total, args.dry_run) for j in jobs]
        for _ in concurrent.futures.as_completed(futures):
            pass

    elapsed = time.time() - started
    print("")
    print("=" * 64)
    if args.dry_run:
        print("检查完成：缺失 %d / %d 个文件" % (len(_failed), total))
        for row in _failed[:20]:
            print("  - " + row)
        if len(_failed) > 20:
            print("  ... 还有 %d 个" % (len(_failed) - 20))
        return 0

    ok = total - len(_failed) - len([])
    print("完成：%d / %d 处理完毕，用时 %.1f 秒" % (total - len(_failed), total, elapsed))
    print("       其中已存在跳过 %d 个" % len(_skipped))
    if _failed:
        print("失败 %d 个（重跑本脚本会自动续传）：" % len(_failed))
        for rel, why in _failed[:20]:
            print("  - %s  <- %s" % (rel, why))
        if len(_failed) > 20:
            print("  ... 还有 %d 个" % (len(_failed) - 20))
        return 1

    print("")
    print("全部就绪。重启 ComfyUI（改过 web/ 后按 Ctrl+F5 强刷），")
    print("新建 PoseAtlas 节点 → 点「打开图库」即可浏览三套图集。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
