# ComfyUI-PoseAtlas

[中文](README.md) ｜ **English** ｜ [日本語](README.ja.md)

A ComfyUI node wrapping the **288 poses / 1439 multi-angle reference images** of
[RuiC-PoseAtlas](https://github.com/HRuiCcc/RuiC-PoseAtlas).
Every pose comes in two renders: **mannequin line art** (POSE-DB-01) and a
**grayscale depth map** (POSE-DB-02). Pick an image in the gallery and the node
outputs `IMAGE` directly — ready for ControlNet, img2img or an edit model.

> ⚠️ **This repository ships no full-size originals.** Image rights belong to the
> original author; see step 3 under "Install". Depth thumbnails are bundled
> (10.7 MB) so the gallery works out of the box; depth originals are fetched one
> at a time with the `↓ 原图` button in the panel.

![Gallery panel](docs/gallery-en.jpg)

<details><summary>中文 / 日本語 interface</summary>

![中文 UI](docs/gallery-zh.jpg)

![日本語 UI](docs/gallery-ja.jpg)

</details>

<details><summary>Depth mode</summary>

![Depth gallery](docs/gallery-depth.jpg)

In depth mode each card carries a **`↓ 原图`** button in its top-right corner; one
click fetches that angle's 900×1200 original. Downloaded cards show **`✓ 已下载`**.

</details>

---

## What this is

RuiC-PoseAtlas is a static pose reference gallery: each pose ships **front /
three-quarter / side / high-angle / low-angle** views of a faceless grey
mannequin, made for reading volumes, proportions, joints and lens relationships.

This project moves that browsing experience into ComfyUI: no switching to a
browser, no hunting for files, no remembering 1439 filenames.

**v1.1 adds depth maps**: the same 1439 variants (ids match one-to-one) rendered
as grayscale depth, where white is closer to the camera. Line art is good for
skeleton extraction, depth maps are good for ControlNet depth — and for couple
poses the front/back layering is visible in depth, which line art cannot show.

| Render | Source | Spec | Good for |
|---|---|---|---|
| Line art | [POSE-DB-01](https://ai-pose-gallery.pages.dev/) | 900×1200 PNG | Skeleton extraction, img2img, edit models |
| Depth | [POSE-DB-02](https://ai-pose-depth-gallery.pages.dev/) | 900×1200 grayscale PNG | ControlNet depth, compositing that needs layering |

## Trilingual interface (中文 / EN / 日本語)

The panel header has a language switch; one click flips the whole interface:

| Where | What switches |
|---|---|
| UI strings | Title, search box, sidebar heading, buttons, notices — three sets |
| Item names | Pose name, category, angle; series name and short name |
| Search | All three languages match the same entry |

**These translations are not ours.** Upstream RuiC-PoseAtlas already ships all
three names (`poses.json` carries `names.zh / .en / .ja` for every pose). This
project only reshapes them into the `labels` field of `index.json`; not a single
string was translated here.

The choice is remembered in `localStorage` (key `poseatlas-node-lang`).

> **The value stored in the dropdown is always the Chinese string**
> (e.g. `[性感全身] 站姿 / P001 ... / 正面`). That keeps a workflow openable under
> any interface language — switching language only changes what you see, never
> the saved parameters.

## The two nodes

### PoseAtlas Gallery (`PoseAtlasLoader`)

| | |
|---|---|
| Inputs | `pose` (gallery selection), `render` (line art / depth), `invert_mask` |
| Outputs | `image` `IMAGE` · `mask` `MASK` · `item_name` `STRING` |

The node only shows `invert_mask` and the "Open gallery" button — `pose` and
`render` are internal UI state handled by the panel. `render` still exists
because the Python side reads its value to decide between `img/` and `depth/img/`;
removing it would leave the node unable to pick a render.

<img src="docs/node-loader.jpg" width="300" alt="PoseAtlas gallery node">

In depth mode the node draws the depth thumbnail directly — the layering of a
couple pose is immediately readable:

<img src="docs/node-depth.jpg" width="300" alt="PoseAtlas gallery node in depth mode">

"Open gallery" brings up a full-screen panel:

- **Language**: `中文 / EN / 日本語`
- **Render**: `线稿 / 深度` — switches every thumbnail at once
- **Four series tabs**: Sexy (80) / Standard (73) / Upper body (80) / Couples (55)
- **Sidebar categories**: follows the selected series, 26 sub-categories in total
- **Thumbnail grid**: the 5 angles of one pose share a card; small chips switch between them
- **Download button**: in depth mode, `↓ 原图` fetches that angle's 900×1200 original
- **Search**: matches Chinese / English / Japanese names, numbers and categories
- **Footer**: number, name, angle and file path of the current selection

### PoseAtlas Info (`PoseAtlasInfo`)

For text only. Inputs `pose` + `language` (zh / en / ja); outputs `item_name` /
`category` / `series` so you can splice them into a prompt.

<img src="docs/node-info.jpg" width="300" alt="PoseAtlas info node">

---

## Install

### 1. Get the node

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/mugicha-AI/ComfyUI-PoseAtlas.git
```

No git? Use `Code → Download ZIP` on GitHub and unpack it into
`ComfyUI/custom_nodes/ComfyUI-PoseAtlas`.

### 2. Check the layout

After cloning you should see this — `img/`, `thumbs/` and `depth/img/` are empty,
`depth/thumbs/` already has 1439 files:

```
ComfyUI/custom_nodes/ComfyUI-PoseAtlas/
├── __init__.py
├── scripts/
│   ├── download_images.py
│   └── build_index.py
└── web/
    ├── poseatlas.js
    └── atlas/
        ├── poses.json            ← pose metadata (trilingual names / categories / angles)
        ├── index.json            ← front-end index (trilingual labels + depth paths)
        ├── img/                  ← empty, download it
        ├── thumbs/               ← empty, download it
        └── depth/
            ├── img/              ← empty, depth originals fetched on demand
            └── thumbs/           ← 1439 × 300×400, bundled
```

### 3. Download the line-art images (required, otherwise line art is empty)

Line-art images belong to **ギア (@giaaibusi)**. This project does **not** bundle
or redistribute full-size images; it only ships a script that pulls them from the
author's public repository.

```bash
cd ComfyUI/custom_nodes/ComfyUI-PoseAtlas
python scripts/download_images.py
```

- **2878 files** (1439 PNG originals + 1439 thumbnails), about **660 MB**
- Rotates through 6 mirrors automatically, moving on when one times out
- Interrupted? Just re-run — existing files are skipped and it resumes
- Only want to look at the UI first: `python scripts/download_images.py --thumbs-only` (≈22 MB)

### 4. Depth originals (on demand, never in bulk)

The depth **thumbnails are already in the repo**, so after cloning the panel shows
all 1439 of them, selectable and usable at 300×400. For the 900×1200 original,
switch the panel to depth mode and click **`↓ 原图`** on the card; the server pulls
that one image from the source site into `web/atlas/depth/img/` and keeps using
the local copy from then on.

> There is **deliberately no bulk download script**: the source site states
> 「このデータベースの画像を一括でダウンロードすること（ツール等による自動取得を含む）と、
> 取得した画像の再配布・転載・販売は禁止です」 — bulk downloading, including
> automated retrieval, and redistribution are forbidden. Fetching one image at a
> time as reference is the intended use; scraping the whole set is not. Please
> only click the few you actually need.
>
> If an original is missing, the node falls back to the thumbnail and appends
> 「深度缩略图，原图未下载」 to `item_name`, so the pipeline still runs — just at
> lower resolution.

### 5. Restart ComfyUI

The node appears under the **`PoseAtlas`** category in the right-click menu, or
search `PoseAtlas` by double-clicking the canvas.

> **After editing anything under `web/`, hard-refresh with Ctrl+F5**, otherwise
> the browser keeps running the old front-end.

---

## Usage

### Simplest: just output an image

Drop a **PoseAtlas Gallery** node, click "Open gallery", pick one, and wire
`image` into anything that accepts `IMAGE`.

### With ControlNet (recommended)

Line art → skeleton → ControlNet → image. These settings are verified locally:

```
PoseAtlas Gallery (render=line art)
   └─ image → PoseAndFaceDetection → DrawViTPose → ControlNetApplyAdvanced
                                                     ├─ control_net: xinsir_cn_union_sdxl_1.0_promax
                                                     ├─ strength: 0.65
                                                     └─ end_percent: 0.85
                                                        └─ KSampler → VAEDecode → SaveImage
```

**Key parameters**：

| Parameter | Value | Why |
|---|---|---|
| `PoseAndFaceDetection` width/height | **must match the output aspect** | feeding a 3:4 image while declaring 832×480 crops the legs |
| ControlNet strength | `0.65` | 0.9 yields a line-art look; too low loses the pose |
| end_percent | `0.85` | lets the model free up texture in later steps |
| Negative prompt | add `stick figure, sketch, lineart` | stops it from drawing the skeleton itself |

The skeleton node comes from
[ComfyUI-WanAnimatePreprocess](https://github.com/kijai/ComfyUI-WanAnimatePreprocess)
(it ships ViTPose ONNX, so no extra controlnet_aux needed). Without it, feed
`image` straight into img2img or an edit model.

### Depth maps for ControlNet depth

Switch the panel render to depth and wire `image` straight into a depth
ControlNet's image input — no depth preprocessor needed, the image *is* the depth
map. White is near, dark grey is far, matching the usual depth-ControlNet
convention.

Couple poses are better in depth: ViTPose only detects one person from line art,
while the depth map keeps both figures and their layering, so depth ControlNet or
a depth-of-field composite won't drop anyone.

### With Qwen-Image 2.1 editing

The mannequin line art already reads as "edit this": using it as a reference lets
the model keep the pose while repainting the texture.

```
PoseAtlas Gallery → image → TextEncodeQwenImage21's images.image_1
```

State explicitly in the prompt that the stance, body proportions and camera angle
must stay, then describe the look you want.
**Note**: the mannequin's waist-to-chest ratio is exaggerated and the resulting
person tends to look bulky — add "use normal human proportions" to the prompt.

### Example workflows

`examples/` has three workflows; drag them in, or use `Workflow → Open`:

| File | Chain | Base model |
|---|---|---|
| `basic_loader.json` | Gallery → SaveImage (minimal) | none |
| `Flux3Klein-PoseAtlas.json` | Gallery + reference → prompt rewrite → generate → side-by-side output | Flux3 Klein |
| `QW2.1-PoseAtlas.json` | Gallery + reference → prompt rewrite → edit → side-by-side output | Qwen-Image 2.1 |

Both full examples work the same way: `PoseAtlasLoader` supplies the pose line
art, one or two character/style references are added, a prompt-rewriting LLM
folds the pose description into the prompt, the image is generated, and finally
"reference | result" are stitched together and saved.

Caveats:

- They rely on common custom nodes (`rgthree-comfy`, `comfyui-easy-use`, …); ComfyUI flags anything missing in red
- Model filenames in the workflows are my local quantised names (e.g. `qwen_image_2.1_int8_convrot`) — swap in your own downloads
- Both examples load a `multiple_angles` LoRA (helps multi-angle following); drop that node if you don't have it

---

## No local GPU?

The node itself is light (it only reads images), but the accompanying ControlNet
and edit models need VRAM. If you have no machine that can run ComfyUI, try a
cloud one:

| Platform | Notes |
|---|---|
| [RunningHub](https://www.runninghub.ai/?inviteCode=rh-v1603) | Cloud ComfyUI, run workflows online, no local setup |
| [ZZAI 真真AI](https://www.zzai.app/?aff=bFpY) | All-in-one AI creation platform, canvas agent builds flows from one sentence, OpenAI-compatible API |

> Those links carry invite codes; signing up through them earns me a small
> referral fee and does not change your cost. Visiting the sites directly works
> the same.

---

## Known limitations

| Limitation | Cause | Workaround |
|---|---|---|
| **Skeleton extraction finds only one person in couple poses (55 groups)** | ViTPose is single-person | Use the depth map with depth ControlNet, or feed `image` to an edit model |
| Depth originals must be clicked one by one | The source site forbids bulk fetching | Download only what you need; thumbnails keep the pipeline running |
| Depth thumbnails are 300×400 | Only thumbnails ship in the repo | Click `↓ 原图` for 900×1200 before a real generation |
| Mannequin images have no alpha | Originals are RGB PNG | `mask` outputs all ones; only `invert_mask` applies |
| The gallery loads client-side | The front-end reads from `/extensions/` | ~1 s on first open, cached afterwards |
| Third-party translation extensions rewrite panel text | They substitute from a hard-coded dictionary | The panel is marked `.notranslate`; if a plugin ignores it, update `ComfyUI-DD-Translation` to honour that convention |

## Content notice

The original gallery's 26 categories include adult-oriented material
("sexy / bold", "missionary" …) and targets adult creators. Obey your local laws
and platform rules.

---

## Copyright and licensing

| Item | License |
|---|---|
| Project code (`__init__.py`, `web/poseatlas.js`, `scripts/*`) | **MIT** |
| Pose line art, depth maps, raw data, names (including the trilingual names) | **Copyright ギア (@giaaibusi)**, not covered by MIT |
| Depth thumbnails (the 1439 files in this repo) | Same as above; browse index only, redistribution discouraged |

The original author allows creative use (commercial, editing, reference) but
**forbids redistributing, reposting or reselling the image data itself**. That is
why this repo carries only thumbnails and download scripts, never full-size
originals. If you fork this project, please keep it that way.

- Original / line-art site: [POSE-DB-01](https://ai-pose-gallery.pages.dev/)
- Depth site: POSE-DB-02 <https://ai-pose-depth-gallery.pages.dev/>
- Original author: [ギア (@giaaibusi)](https://x.com/giaaibusi)
- Data preparation and front-end: [RuiC-PoseAtlas](https://github.com/HRuiCcc/RuiC-PoseAtlas) by [HRuiCcc](https://github.com/HRuiCcc)

This is an unofficial project with no affiliation to the original author or to
RuiC-PoseAtlas. If the original author believes this repository infringes their
rights, please open an [Issue](https://github.com/mugicha-AI/ComfyUI-PoseAtlas/issues)
and the content will be removed promptly.

---

## Credits

- Pose line art, depth maps and raw data: ギア (@giaaibusi)
- Data preparation, trilingual names, gallery front-end: HRuiCcc / RuiC-PoseAtlas
- Skeleton node: kijai / ComfyUI-WanAnimatePreprocess

## Video walkthrough

Two videos cover this node — pick whichever platform you prefer:

| Platform | Link |
|---|---|
| Bilibili (Chinese) | [PoseAtlas 实测：1439 张多角度人台线稿，我把它做成了 ComfyUI 节点](https://www.bilibili.com/video/BV1CFxi6uEhk/) |
| YouTube | [PoseAtlas 实测：1439 张多角度人台线稿，我把它做成了 ComfyUI 节点](https://www.youtube.com/watch?v=3_gDBeM9o6U) |

```
PoseAtlas 实测：1439 张多角度人台线稿，我把它做成了 ComfyUI 节点
```
*(Title as published: "PoseAtlas hands-on — 1439 multi-angle mannequin references, turned into a ComfyUI node". Both videos are in Chinese.)*

They walk through the gallery panel, the difference between line art and depth
maps, the exact ControlNet skeleton-extraction settings, and why couple poses are
better handled through depth. For the written version see "Usage" above.

## About the author

- GitHub: [@mugicha-AI](https://github.com/mugicha-AI)
- More ComfyUI workflows and write-ups will land here

If this node saved you time hunting reference images, a ⭐ Star is welcome.

## License

Code is MIT, see [LICENSE](LICENSE). Images are not covered.
