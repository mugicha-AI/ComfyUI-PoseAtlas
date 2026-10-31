#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ComfyUI-PoseAtlas 图片下载脚本
==============================

本仓库**不包含**姿态图片（版权归原作者 ギア @giaaibusi 所有，禁止再分发）。
运行本脚本，从原作者公开的 RuiC-PoseAtlas 仓库把 1439 张线稿图片下载到你本地。

用法（在 ComfyUI-PoseAtlas 节点目录下执行）：

    python scripts/download_images.py               # 线稿缩略图 + 原图
    python scripts/download_images.py --thumbs-only # 只下缩略图（约 22 MB）
    python scripts/download_images.py --workers 8   # 并发数，默认 8
    python scripts/download_images.py --dry-run     # 只检查缺哪些

下载完成后目录应为：

    web/atlas/img/     1439 张 900x1200 PNG
    web/atlas/thumbs/  1439 张 300x400 JPEG

深度图（depth/）不在此脚本范围内：深度缩略图已随仓库提供，原图请在节点的
图库面板里点「↓ 原图」按钮逐张下载（走节点内置的 /poseatlas/depth 接口）。
"""

import argparse
import json
import os
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
NODE_DIR = os.path.dirname(HERE)
ATLAS_DIR = os.path.join(NODE_DIR, "web", "atlas")
INDEX_FILE = os.path.join(ATLAS_DIR, "index.json")

# 多个镜像，按可用性自动切换（国内直连 raw.githubusercontent 常失败）
MIRRORS = [
    "https://raw.githubusercontent.com/HRuiCcc/RuiC-PoseAtlas/main/",
    "https://ghfast.top/https://raw.githubusercontent.com/HRuiCcc/RuiC-PoseAtlas/main/",
    "https://gh-proxy.com/https://raw.githubusercontent.com/HRuiCcc/RuiC-PoseAtlas/main/",
    "https://gcore.jsdelivr.net/gh/HRuiCcc/RuiC-PoseAtlas@main/",
    "https://fastly.jsdelivr.net/gh/HRuiCcc/RuiC-PoseAtlas@main/",
    "https://cdn.jsdelivr.net/gh/HRuiCcc/RuiC-PoseAtlas@main/",
]

UA = {"User-Agent": "Mozilla/5.0 (compatible; ComfyUI-PoseAtlas-downloader)"}

# PNG / JPEG 文件头校验，防止把错误页存成图片
MAGIC = {
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
}

_lock = threading.Lock()
_done = [0]
_failed = []


def fetch(rel_path, timeout=60, retries=3):
    """按镜像顺序尝试下载，返回 bytes；全失败抛异常。"""
    last = None
    for attempt in range(retries):
        for base in MIRRORS:
            url = base + rel_path
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    data = r.read()
                ext = os.path.splitext(rel_path)[1].lower()
                magic = MAGIC.get(ext)
                if magic and not data.startswith(magic):
                    last = ValueError("文件头不匹配: " + url)
                    continue
                if len(data) < 512:
                    last = ValueError("文件过小(%d B): %s" % (len(data), url))
                    continue
                return data
            except Exception as e:  # noqa: BLE001
                last = e
        time.sleep(1.0 * (attempt + 1))
    raise last if last else RuntimeError("unknown error")


def one(item, total, dry_run):
    rel, dst = item
    if os.path.isfile(dst) and os.path.getsize(dst) > 512:
        with _lock:
            _done[0] += 1
            n = _done[0]
        if n % 100 == 0 or n == total:
            print("  [%d/%d] 已存在，跳过" % (n, total), flush=True)
        return True
    if dry_run:
        with _lock:
            _failed.append(rel)
        return False

    try:
        data = fetch(rel)
    except Exception as e:  # noqa: BLE001
        with _lock:
            _failed.append(rel)
            print("  [失败] %s -> %s" % (rel, str(e)[:90]), flush=True)
        return False

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, dst)

    with _lock:
        _done[0] += 1
        n = _done[0]
        if n % 50 == 0 or n == total:
            print("  [%d/%d] %s" % (n, total, rel), flush=True)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--thumbs-only", action="store_true", help="只下载缩略图")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true", help="只检查缺失，不下载")
    args = ap.parse_args()

    if not os.path.isfile(INDEX_FILE):
        print("[错误] 找不到 %s" % INDEX_FILE)
        print("       请在 ComfyUI-PoseAtlas 节点目录下运行本脚本。")
        return 2

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        index = json.load(f)

    jobs = []
    seen = set()
    for e in index["entries"]:
        for rel in ([e["thumb"]] if args.thumbs_only else [e["thumb"], e["file"]]):
            if rel in seen:
                continue
            seen.add(rel)
            jobs.append((rel, os.path.join(ATLAS_DIR, rel.replace("/", os.sep))))

    total = len(jobs)
    print("=" * 60)
    print("ComfyUI-PoseAtlas 线稿图片下载")
    print("=" * 60)
    print("目标目录: %s" % ATLAS_DIR)
    print("待处理:   %d 个文件%s" % (total, "（仅缩略图）" if args.thumbs_only else ""))
    print("镜像:     %d 个，失败自动切换" % len(MIRRORS))
    print("")
    print("说明：图片版权归原作者 ギア (@giaaibusi) 所有，")
    print("      本脚本仅从原作者公开地址下载供本地创作参考，禁止再分发。")
    print("      深度图不在本脚本范围：缩略图已随仓库提供，")
    print("      原图请在节点图库面板里点「↓ 原图」逐张下载。")
    print("")

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = [ex.submit(one, j, total, args.dry_run) for j in jobs]
        for _ in as_completed(futures):
            pass

    dt = time.time() - t0
    print("")
    print("=" * 60)
    if args.dry_run:
        print("检查完成：缺失 %d / %d 个文件" % (len(_failed), total))
        for r in _failed[:20]:
            print("  - " + r)
        if len(_failed) > 20:
            print("  ... 还有 %d 个" % (len(_failed) - 20))
        return 0

    ok = total - len(_failed)
    print("完成：%d / %d 成功，用时 %.1f 秒" % (ok, total, dt))
    if _failed:
        print("失败 %d 个（重跑本脚本会自动续传）：" % len(_failed))
        for r in _failed[:20]:
            print("  - " + r)
        if len(_failed) > 20:
            print("  ... 还有 %d 个" % (len(_failed) - 20))
        return 1

    print("")
    print("全部就绪。重启 ComfyUI，新建 PoseAtlas 节点，")
    print("点「打开图库」即可浏览 288 组姿态，切换「深度」看深度图。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
