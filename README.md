# ComfyUI-PoseAtlas

把 [RuiC-PoseAtlas](https://github.com/HRuiCcc/RuiC-PoseAtlas) 的 **288 组人体姿态 / 1439 张多角度人台线稿** 做成了 ComfyUI 节点。
在图库里点一张图，直接输出 `IMAGE`，接 ControlNet、接图生图、接编辑模型都行。

> ⚠️ **本仓库不含图片**。图片版权归原作者所有，请运行脚本从原地址下载（见下方「安装」第 3 步）。

![图库面板](docs/gallery.jpg)

---

## 这是什么

RuiC-PoseAtlas 本身是一个静态姿态参考图库：每组姿态提供 **正面 / 斜侧 / 侧面 / 俯视 / 仰视** 五个视角，
画面是无面部特征的灰色人台线稿，专门用来观察体块、比例、关节和镜头关系。

本项目把它的浏览体验搬进 ComfyUI：不用切浏览器、不用手动找文件、不用记住 1439 个文件名。

## 两个节点

### PoseAtlas 姿态图库（`PoseAtlasLoader`）

| | |
|---|---|
| 输入 | `pose`（图库选择）、`invert_mask` |
| 输出 | `image` `IMAGE` · `mask` `MASK` · `pose_name` `STRING` |

<img src="docs/node-loader.jpg" width="300" alt="PoseAtlas 姿态图库节点">

节点上的 `pose` 原生是一个 1439 项的下拉框，前端已把它替换成 **「打开图库」** 按钮。点开是全屏面板：

- **顶部 4 个系列**：性感全身(80) / 标准全身(73) / 上半身(80) / 双人(55)
- **左侧分类**：随系列动态切换，共 26 个子分类（站姿、坐姿、趴卧、跪立・四肢着地、蹲姿、前倾、扭身……）
- **缩略图网格**：同一姿态的 5 个角度合成一张卡片，卡内小标签切换 正面 / 斜侧 / 侧面 / 俯视 / 仰视
- **搜索框**：中 / 英 / 日名称、编号、分类都能搜，自动跨系列检索
- **底部**：当前选中项的编号、中文名、角度、文件路径

选完关闭面板，节点上会直接画出该姿态的缩略图，一眼能看到当前选了什么。

### PoseAtlas 姿态信息（`PoseAtlasInfo`）

只要文字、不要图时用这个。输入 `pose` + `language`（zh / en / ja），输出 `pose_name` / `category` / `series`，方便拼进提示词。

<img src="docs/node-info.jpg" width="300" alt="PoseAtlas 姿态信息节点">

---

## 安装

### 1. 装节点

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/mugicha-AI/ComfyUI-PoseAtlas.git
```

没有 git 的话，在 GitHub 页面点 `Code → Download ZIP`，解压到 `ComfyUI/custom_nodes/ComfyUI-PoseAtlas`。

### 2. 检查目录

装完应该是这样（此时 `img/` 和 `thumbs/` 是空的）：

```
ComfyUI/custom_nodes/ComfyUI-PoseAtlas/
├── __init__.py
├── scripts/
│   ├── download_images.py
│   └── build_index.py
└── web/
    ├── poseatlas.js
    └── atlas/
        ├── poses.json        ← 姿态元数据（三语名称/分类/角度）
        ├── index.json        ← 前端索引
        ├── img/              ← 空，等你下载
        └── thumbs/           ← 空，等你下载
```

### 3. 下载图片（必须做，否则图库是空的）

图片版权归原作者 **ギア (@giaaibusi)** 所有，本项目**不打包、不再分发**图片，
只提供脚本从原作者的公开仓库下载。

```bash
cd ComfyUI/custom_nodes/ComfyUI-PoseAtlas
python scripts/download_images.py
```

- 共 **2878 个文件**（1439 张 PNG 原图 + 1439 张缩略图），约 **660 MB**
- 会自动在 6 个镜像间切换，某个超时就换下一个
- 中断了直接重跑，已下载的会跳过，自动续传
- 只想先看看界面：`python scripts/download_images.py --thumbs-only`（约 22 MB，能浏览但原图输出会报缺图）

下载完成后确认：

```
web/atlas/img/     1439 个 .png
web/atlas/thumbs/  1439 个 .jpg
```

### 4. 重启 ComfyUI

节点出现在右键菜单的 **`PoseAtlas`** 分类下，或双击画布搜索 `PoseAtlas`。

---

## 怎么用

### 最基本的用法：直接出图

拖一个 **PoseAtlas 姿态图库**，点「打开图库」选一张，`image` 输出接到任何吃 `IMAGE` 的节点。

### 配合 ControlNet 出图（推荐）

人台线稿 → 抽骨架 → ControlNet → 出图。本机实测这套参数可用：

```
PoseAtlas 姿态图库
   └─ image → PoseAndFaceDetection → DrawViTPose → ControlNetApplyAdvanced
                                                    ├─ control_net: xinsir_cn_union_sdxl_1.0_promax
                                                    ├─ strength: 0.65
                                                    └─ end_percent: 0.85
                                                       └─ KSampler → VAEDecode → 保存图像
```

**关键参数**：

| 参数 | 值 | 说明 |
|---|---|---|
| `PoseAndFaceDetection` 的 width/height | **必须与出图分辨率同比例** | 喂 3:4 的图却填 832×480，腿会被截断 |
| ControlNet strength | `0.65` | 0.9 会得到线稿风，太低会丢姿势 |
| end_percent | `0.85` | 让模型后段自由发挥质感 |
| 负面词 | 加 `stick figure, sketch, lineart` | 防止它照着骨架画线 |

抽骨架节点来自 [ComfyUI-WanAnimatePreprocess](https://github.com/kijai/ComfyUI-WanAnimatePreprocess)（自带 ViTPose ONNX，不用额外装 controlnet_aux）。
没有这个节点的话，直接把 `image` 当参考图喂给图生图 / 编辑模型也可以。

### 配合 Qwen-Image 2.1 编辑

人台线稿本身就是"编辑"语义，把它当参考图能让模型保留姿态重绘质感：

```
PoseAtlas 姿态图库 → image → TextEncodeQwenImage21 的 images.image_1
```

提示词里明确写「保持相同的站姿、身体比例和镜头角度」，再描述想要的外观。
**注意**：人台本身胸腰比夸张，出的真人会偏壮，提示词里补一句「改成正常人体比例」。

### 示例工作流

`examples/` 下有三个工作流，拖进 ComfyUI 或从菜单 `工作流 → 打开` 载入：

| 文件 | 链路 | 底模 |
|---|---|---|
| `basic_loader.json` | 图库 → 保存图像（最小示例） | 无 |
| `Flux3Klein-PoseAtlas.json` | 图库 + 参考图 → 提示词自动改写 → 出图 → 原图/结果对比输出 | Flux3 Klein |
| `QW2.1-PoseAtlas.json` | 图库 + 参考图 → 提示词自动改写 → 编辑出图 → 原图/结果对比输出 | Qwen-Image 2.1 |

两个完整示例的工作方式相同：`PoseAtlasLoader` 提供姿态线稿，再喂 1–2 张角色/风格参考图，
先走一遍提示词改写 LLM 把姿态描述写进提示词，然后出图，最后把「参考图 | 生成结果」拼在一起保存。

注意事项：

- 依赖 `rgthree-comfy`、`comfyui-easy-use` 等常见自定义节点，缺什么 ComfyUI 会红框提示
- 工作流里的模型文件名是我本机的量化版命名（如 `qwen_image_2.1_int8_convrot`），导入后请换成你自己下载的对应模型
- 两个示例都加载了 `multiple_angles` LoRA（增强多角度姿态跟随），没有的话可以去掉该节点

---

## 没有本地 GPU？

这个节点本身很轻（只读图，不跑模型），但配套的 ControlNet / 编辑模型需要显存。
手头没有能跑 ComfyUI 的机器时，可以用云端 ComfyUI：

| 平台 | 特点 |
|---|---|
| [RunningHub](https://www.runninghub.ai/?inviteCode=rh-v1603) | 云端 ComfyUI，跑在线工作流，不用自己装环境 |
| [ZZAI 真真AI](https://www.zzai.app/?aff=bFpY) | 一站式 AI 创作平台，画布 Agent 一句话搭流程，兼容 OpenAI 的 API 接入 |

> 以上链接含邀请码，通过它注册我会获得一点返利，不影响你的使用成本。
> 不通过链接直接访问官网同样可用。

---

## 已知限制

| 限制 | 原因 | 建议 |
|---|---|---|
| **双人系列（55 组）抽骨架只检出一个人** | ViTPose 单人检测 | 双人姿势直接用 `image` 当参考图喂编辑模型，不要走 ControlNet |
| 人台图没有 alpha 通道 | 原图是 RGB PNG | `mask` 输出全 1，只有 `invert_mask` 可用 |
| 图库面板需要浏览器端加载 | 前端从 `/extensions/` 读数据 | 首次打开有约 1 秒加载，之后有缓存 |

## 内容提示

原图库 26 个分类里包含成人向内容（「性感・大胆系」「正常位」等），面向成年创作者。
请遵守所在地法律法规与平台规范。

---

## 版权与许可

| 对象 | 许可 |
|---|---|
| 本项目代码（`__init__.py`、`web/poseatlas.js`、`scripts/*`） | **MIT** |
| 姿态图片、原始数据、名称 | **版权归原作者 ギア (@giaaibusi)**，不在 MIT 范围内 |

原作者允许将作品用于创作（含商用、编辑、参考），但**禁止再分发、转载、转售图片数据本身**。
所以本仓库只提供下载脚本，不打包图片。如果你 fork 本项目，请保持同样的做法。

- 原作 / 原始站点：[POSE-DB-01](https://ai-pose-gallery.pages.dev/)
- 原作者：[ギア (@giaaibusi)](https://x.com/giaaibusi)
- 数据整理与前端：[RuiC-PoseAtlas](https://github.com/HRuiCcc/RuiC-PoseAtlas) by [HRuiCcc](https://github.com/HRuiCcc)

本项目为非官方整理，与原作者及 RuiC-PoseAtlas 作者均无隶属关系。

---

## 致谢

- 姿态图片与原始数据：ギア (@giaaibusi)
- 数据整理、三语名称、图库前端：HRuiCcc / RuiC-PoseAtlas
- 抽骨架节点：kijai / ComfyUI-WanAnimatePreprocess

## 关于作者

- GitHub：[@mugicha-AI](https://github.com/mugicha-AI)
- 更多 ComfyUI 相关工作流与教程会陆续发在这里

如果这个节点帮你省了找参考图的时间，欢迎点个 ⭐ Star。

## License

代码部分 MIT，见 [LICENSE](LICENSE)。图片不在许可范围内。
