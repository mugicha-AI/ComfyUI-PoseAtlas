# ComfyUI-PoseAtlas

[中文](README.md) ｜ [English](README.en.md) ｜ **日本語**

[RuiC-PoseAtlas](https://github.com/HRuiCcc/RuiC-PoseAtlas) の
**288 ポーズ / 1,439 枚のマルチアングル参考画像** を ComfyUI ノードにしたものです。
各ポーズには 2 種類のレンダリングがあります：**マネキン線画**（POSE-DB-01）と
**グレースケール深度マップ**（POSE-DB-02）。
ギャラリーで画像を選ぶとそのまま `IMAGE` を出力でき、ControlNet・img2img・編集モデルに渡せます。

> ⚠️ **本リポジトリに原寸画像は含まれません。** 画像の権利は原作者に帰属します。
> 下記「インストール」の手順 3 を参照してください。
> 深度のサムネイル（10.7 MB）は同梱済みなので、クローン直後から閲覧できます。
> 深度の原寸はパネルの `↓ 原图` ボタンで 1 枚ずつ取得します。

![ギャラリーパネル](docs/gallery-ja.jpg)

<details><summary>中文 / English の画面</summary>

![中文 UI](docs/gallery-zh.jpg)

![English UI](docs/gallery-en.jpg)

</details>

<details><summary>深度モード</summary>

![深度ギャラリー](docs/gallery-depth.jpg)

深度モードでは各カードの右上に **`↓ 原图`** ボタンが出ます。クリックするとそのアングルの
900×1200 原寸を取得します。取得済みのカードは **`✓ 已下载`** と表示されます。

</details>

---

## これは何か

RuiC-PoseAtlas は静的なポーズ参考ギャラリーです。各ポーズに **正面 / 斜め / 横 /
上から / 下から** の 5 アングルがあり、顔のないグレーのマネキンでボリューム・比率・
関節・レンズ関係を読み取るための資料です。

本プロジェクトはその閲覧体験を ComfyUI に移します。ブラウザに切り替える必要も、
ファイルを探す必要も、1,439 個のファイル名を覚える必要もありません。

**v1.1 で深度マップを追加**：同じ 1,439 バリアント（id は 1 対 1 対応）にグレースケールの
深度レンダリングを用意しました。白いほど手前です。線画は骨格抽出に、深度は ControlNet
depth に向いています。2 人のポーズでは前後の重なりが深度で層として見えるので、
これは線画では得られない情報です。

| レンダリング | 出典 | 仕様 | 用途 |
|---|---|---|---|
| 線画 | [POSE-DB-01](https://ai-pose-gallery.pages.dev/) | 900×1200 PNG | 骨格抽出、img2img、編集モデル |
| 深度 | [POSE-DB-02](https://ai-pose-depth-gallery.pages.dev/) | 900×1200 グレースケール PNG | ControlNet depth、前後関係が要る合成 |

## 3 言語インターフェース（中文 / EN / 日本語）

パネル上部に言語切り替えがあり、ワンクリックで全体が切り替わります：

| 場所 | 切り替わる内容 |
|---|---|
| UI 文言 | タイトル、検索欄、サイドバー見出し、ボタン、注意書き（3 セット） |
| 項目名 | ポーズ名、分類、アングル、シリーズ名と短縮名 |
| 検索 | 3 言語のどれでも同じ項目にヒット |

**この翻訳は本プロジェクトのものではありません。** 上流の RuiC-PoseAtlas が
もともと 3 言語を提供しています（`poses.json` の各ポーズに `names.zh / .en / .ja`）。
本プロジェクトはそれを `index.json` の `labels` に移しただけで、翻訳は 1 文字も足していません。

選択は `localStorage`（キー `poseatlas-node-lang`）に保存され、次回も維持されます。

> **ドロップダウンに保存される値は常に中国語の文字列**です
> （例：`[性感全身] 站姿 / P001 ... / 正面`）。
> これにより、どの UI 言語で開いても同じワークフローがそのまま動きます。
> 言語切り替えは表示だけを変え、保存済みパラメータには触れません。

## 2 つのノード

### PoseAtlas ギャラリー（`PoseAtlasLoader`）

| | |
|---|---|
| 入力 | `pose`（ギャラリー選択）、`render`（線画 / 深度）、`invert_mask` |
| 出力 | `image` `IMAGE` · `mask` `MASK` · `item_name` `STRING` |

ノード上に出るのは `invert_mask` と「ギャラリーを開く」ボタンだけです。`pose` と
`render` はパネルが扱う内部 UI 状態です。`render` が残っているのは、Python 側が
その値で `img/` と `depth/img/` のどちらを読むか決めるためで、削除すると
どちらのレンダリングか分からなくなります。

<img src="docs/node-loader.jpg" width="300" alt="PoseAtlas ギャラリーノード">

深度モードではノード上に深度サムネイルが描かれ、2 人のポーズの前後関係が一目で分かります：

<img src="docs/node-depth.jpg" width="300" alt="PoseAtlas ギャラリーノード（深度モード）">

「ギャラリーを開く」で全画面パネルが開きます：

- **言語**：`中文 / EN / 日本語`
- **レンダリング**：`线稿 / 深度`、切り替えると全サムネイルが一斉に変わります
- **上部 4 シリーズ**：セクシー系(80) / 標準系(73) / 上半身(80) / ペア(55)
- **左サイドバー**：シリーズに応じて動的に変化、全 26 サブ分類
- **サムネイルグリッド**：同じポーズの 5 アングルを 1 枚のカードにまとめ、カード内の小さなタグで切り替え
- **ダウンロードボタン**：深度モードでは各カード右上の `↓ 原图` でそのアングルの 900×1200 原寸を取得
- **検索欄**：中国語 / 英語 / 日本語の名前、番号、分類で検索、シリーズをまたいでヒット
- **下部**：現在の選択の番号、名前、アングル、ファイルパス

### PoseAtlas 項目情報（`PoseAtlasInfo`）

文字だけ欲しいとき用。`pose` + `language`（zh / en / ja）を入力し、`item_name` /
`category` / `series` を出力します。プロンプトへの合成に便利です。

<img src="docs/node-info.jpg" width="300" alt="PoseAtlas 項目情報ノード">

---

## インストール

### 1. ノードを取得

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/mugicha-AI/ComfyUI-PoseAtlas.git
```

git がない場合は GitHub の `Code → Download ZIP` で
`ComfyUI/custom_nodes/ComfyUI-PoseAtlas` に展開してください。

### 2. ディレクトリを確認

クローン直後はこうなります（`img/`、`thumbs/`、`depth/img/` は空、
`depth/thumbs/` には 1,439 枚が入っています）：

```
ComfyUI/custom_nodes/ComfyUI-PoseAtlas/
├── __init__.py
├── scripts/
│   ├── download_images.py
│   └── build_index.py
└── web/
    ├── poseatlas.js
    └── atlas/
        ├── poses.json            ← ポーズメタデータ（3 言語名 / 分類 / アングル）
        ├── index.json            ← フロント用インデックス（3 言語ラベル + 深度パス）
        ├── img/                  ← 空、自分でダウンロード
        ├── thumbs/               ← 空、自分でダウンロード
        └── depth/
            ├── img/              ← 空、深度原寸はオンデマンド取得
            └── thumbs/           ← 1,439 枚の 300×400、同梱済み
```

### 3. 線画画像をダウンロード（必須、やらないと線画が空です）

線画画像の権利は **ギア (@giaaibusi)** に帰属します。本プロジェクトは原寸画像を
**同梱も再配布もせず**、作者の公開リポジトリから取得するスクリプトだけを提供します。

```bash
cd ComfyUI/custom_nodes/ComfyUI-PoseAtlas
python scripts/download_images.py
```

- 合計 **2,878 ファイル**（PNG 原寸 1,439 枚 + サムネイル 1,439 枚）、約 **660 MB**
- 6 つのミラーを自動で切り替え、タイムアウトしたら次へ進みます
- 中断しても再実行すれば既存ファイルはスキップされ、続きから再開します
- まず UI だけ見たい場合：`python scripts/download_images.py --thumbs-only`（約 22 MB）

### 4. 深度原寸（オンデマンド、一括取得はしません）

深度の**サムネイルはすでにリポジトリに入っている**ので、クローン直後から 1,439 枚すべてを
パネルで閲覧・選択・出力できます（300×400）。900×1200 の原寸が必要なときは、
パネルを「深度」に切り替えてカード右上の **`↓ 原图`** を押します。サーバ側がその 1 枚を
出典サイトから取得して `web/atlas/depth/img/` に書き込み、以後はローカルを使います。

> **一括ダウンロードスクリプトを置いていないのは意図的です。** 出典サイトには
> 「このデータベースの画像を一括でダウンロードすること（ツール等による自動取得を含む）と、
> 取得した画像の再配布・転載・販売は禁止です」と明記されています。生成時の参考に 1 枚ずつ
> 取得するのは想定された使い方ですが、一括取得はそうではありません。
> 本当に使う数枚だけをクリックしてください。
>
> 原寸がない場合、ノードは自動的にサムネイルで出力し、`item_name` の後ろに
> 「深度缩略图，原图未下载」と付記します。取得しなくても流れは通りますが解像度は下がります。

### 5. ComfyUI を再起動

右クリックメニューの **`PoseAtlas`** カテゴリに出ます。キャンバスをダブルクリックして
`PoseAtlas` で検索しても出ます。

> **`web/` 配下を編集したら Ctrl+F5 で強制リロード**してください。
> そうしないとブラウザは古いフロントエンドを使い続けます。

---

## 使い方

### 最小構成：そのまま出力

**PoseAtlas ギャラリー** ノードを置き、「ギャラリーを開く」で 1 枚選び、`image` を
`IMAGE` を受け取るノードに繋ぐだけです。

### ControlNet と組み合わせる（推奨）

マネキン線画 → 骨格抽出 → ControlNet → 出力。手元で実測した設定です：

```
PoseAtlas ギャラリー（render=線画）
   └─ image → PoseAndFaceDetection → DrawViTPose → ControlNetApplyAdvanced
                                                     ├─ control_net: xinsir_cn_union_sdxl_1.0_promax
                                                     ├─ strength: 0.65
                                                     └─ end_percent: 0.85
                                                        └─ KSampler → VAEDecode → SaveImage
```

**重要なパラメータ**：

| パラメータ | 値 | 理由 |
|---|---|---|
| `PoseAndFaceDetection` の width/height | **出力解像度と同じ比率にする** | 3:4 の画像に 832×480 を指定すると脚が切れます |
| ControlNet strength | `0.65` | 0.9 だと線画風になり、低すぎるとポーズが抜けます |
| end_percent | `0.85` | 後半はモデルに質感を任せます |
| ネガティブ | `stick figure, sketch, lineart` を追加 | 骨格をそのまま描いてしまうのを防ぎます |

骨格抽出ノードは
[ComfyUI-WanAnimatePreprocess](https://github.com/kijai/ComfyUI-WanAnimatePreprocess)
のものです（ViTPose ONNX 同梱、controlnet_aux は不要）。
ない場合は `image` をそのまま img2img や編集モデルの参照画像に渡しても構いません。

### 深度マップで ControlNet depth

パネルのレンダリングを「深度」に切り替え、`image` を深度 ControlNet の image 入力に
直接入れます（深度プリプロセッサは不要、画像自体が深度マップです）。
白が手前、濃いグレーが奥で、一般的な深度 ControlNet の約束と同じです。

2 人のポーズは深度版がおすすめです。線画からの骨格抽出は ViTPose が 1 人しか検出しませんが、
深度マップは 2 人の前後関係を保つので、depth ControlNet でも被写界深度合成でも人物が欠けません。

### Qwen-Image 2.1 での編集

マネキン線画はそれ自体が「編集」の意味を持ちます。参照画像として渡すと、
ポーズを保ったまま質感を描き直せます：

```
PoseAtlas ギャラリー → image → TextEncodeQwenImage21 の images.image_1
```

プロンプトに「同じ立ち姿・体の比率・カメラアングルを保つ」と明記したうえで、
欲しい外観を書きます。
**注意**：マネキンは胸腰比が誇張されているため、出てくる人物は体格が良くなりがちです。
プロンプトに「普通の人体比率にする」と一言添えてください。

### サンプルワークフロー

`examples/` に 3 つあります。ComfyUI にドラッグするか、`ワークフロー → 開く` で読み込みます：

| ファイル | 構成 | ベースモデル |
|---|---|---|
| `basic_loader.json` | ギャラリー → 画像保存（最小構成） | なし |
| `Flux3Klein-PoseAtlas.json` | ギャラリー + 参照 → プロンプト自動改写 → 生成 → 元画像/結果の比較出力 | Flux3 Klein |
| `QW2.1-PoseAtlas.json` | ギャラリー + 参照 → プロンプト自動改写 → 編集生成 → 元画像/結果の比較出力 | Qwen-Image 2.1 |

2 つの完全版は同じ流れです：`PoseAtlasLoader` がポーズ線画を出し、キャラクターや
スタイルの参照画像を 1〜2 枚加え、プロンプト改写 LLM でポーズ記述をプロンプトに織り込み、
生成し、最後に「参照 | 結果」を横に並べて保存します。

注意点：

- `rgthree-comfy`、`comfyui-easy-use` などの一般的なカスタムノードに依存します。不足は ComfyUI が赤枠で知らせます
- ワークフロー内のモデルファイル名は手元の量子化版の名前です（例 `qwen_image_2.1_int8_convrot`）。各自ダウンロードしたものに差し替えてください
- 両サンプルとも `multiple_angles` LoRA（マルチアングル追従の強化）を読み込んでいます。ない場合はそのノードを外してください

---

## ローカル GPU がない場合

ノード自体は軽い（画像を読むだけ）ですが、組み合わせる ControlNet / 編集モデルには VRAM が
必要です。ComfyUI を動かせるマシンがない場合はクラウド版が使えます：

| プラットフォーム | 特徴 |
|---|---|
| [RunningHub](https://www.runninghub.ai/?inviteCode=rh-v1603) | クラウド ComfyUI、オンラインでワークフロー実行、環境構築不要 |
| [ZZAI 真真AI](https://www.zzai.app/?aff=bFpY) | オールインワンの AI 制作プラットフォーム、キャンバス Agent が一言でフローを構築、OpenAI 互換 API 対応 |

> 上記リンクには招待コードが含まれます。そこから登録すると私に若干の紹介料が入りますが、
> あなたの利用コストは変わりません。リンクを使わず公式サイトへ直接アクセスしても同じです。

---

## 既知の制限

| 制限 | 原因 | 対処 |
|---|---|---|
| **2 人シリーズ（55 組）で骨格が 1 人しか検出されない** | ViTPose は単人検出 | 深度マップで depth ControlNet を使う、または `image` を編集モデルに渡す |
| 深度原寸は 1 枚ずつクリックが必要 | 出典サイトが一括取得を禁止 | 必要な分だけ取得。取得しなくてもサムネイルで流れは通る |
| 深度サムネイルは 300×400 | リポジトリにはサムネイルのみ | 本番生成の前に `↓ 原图` で 900×1200 を取得 |
| マネキン画像に alpha がない | 原寸が RGB PNG | `mask` は全 1 を出力、`invert_mask` のみ有効 |
| ギャラリーはブラウザ側で読み込む | フロントが `/extensions/` から読む | 初回は約 1 秒、以後はキャッシュ |
| サードパーティの翻訳拡張がパネル文字を書き換える | ハードコードされた辞書で置換するため | パネルは `.notranslate` を付与済み。無視する場合は `ComfyUI-DD-Translation` をその規約に従うよう更新してください |

## コンテンツについて

元ギャラリーの 26 分類には成人向けの内容（「セクシー・大胆系」「正常位」など）が含まれ、
成人の制作者向けです。所在地の法令とプラットフォームの規約を守ってください。

---

## 著作権とライセンス

| 対象 | ライセンス |
|---|---|
| 本プロジェクトのコード（`__init__.py`、`web/poseatlas.js`、`scripts/*`） | **MIT** |
| ポーズ線画、深度マップ、元データ、名称（3 言語名を含む） | **著作権は原作者 ギア (@giaaibusi)**、MIT の対象外 |
| 深度サムネイル（本リポジトリの 1,439 枚） | 同上。閲覧用インデックスであり、再配布は推奨しません |

原作者は創作での利用（商用・編集・参考を含む）を認めていますが、**画像データ自体の
再配布・転載・転売は禁止**しています。そのため本リポジトリはサムネイルとダウンロード
スクリプトのみを同梱し、原寸画像は入れていません。fork する場合も同じ方針を保ってください。

- 原作 / 線画サイト：[POSE-DB-01](https://ai-pose-gallery.pages.dev/)
- 深度サイト：POSE-DB-02 <https://ai-pose-depth-gallery.pages.dev/>
- 原作者：[ギア (@giaaibusi)](https://x.com/giaaibusi)
- データ整理とフロントエンド：[RuiC-PoseAtlas](https://github.com/HRuiCcc/RuiC-PoseAtlas) by [HRuiCcc](https://github.com/HRuiCcc)

本プロジェクトは非公式のもので、原作者および RuiC-PoseAtlas の作者とは一切関係ありません。
原作者が本リポジトリを権利侵害と判断した場合は
[Issue](https://github.com/mugicha-AI/ComfyUI-PoseAtlas/issues) でご連絡ください。速やかに削除します。

---

## 謝辞

- ポーズ線画、深度マップ、元データ：ギア (@giaaibusi)
- データ整理、3 言語名、ギャラリーのフロントエンド：HRuiCcc / RuiC-PoseAtlas
- 骨格抽出ノード：kijai / ComfyUI-WanAnimatePreprocess

## 作者について

- GitHub：[@mugicha-AI](https://github.com/mugicha-AI)
- ComfyUI のワークフローや解説を今後もここで公開していきます

参考画像を探す手間が省けたなら、⭐ Star をいただけると嬉しいです。

## License

コードは MIT、[LICENSE](LICENSE) を参照。画像は対象外です。
