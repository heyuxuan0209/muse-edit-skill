# 课程配置 1.0

用 `init` 生成结构；编辑 `course.json`，不要重写原稿。现有完整 1.0 课程包可以直接构建。

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 固定 `1.0` |
| `courseMeta.id` | 稳定课程标识，字母数字、点、横线、下划线 |
| `courseMeta.series / lessonNumber` | 系列名与非负课次，0 可用于总览 |
| `articleTitle / fullTitle / subtitle` | 平台标题、课程名、副标题；原稿第一处一级标题不进入正文 |
| `courseMeta.assets` | `audio / articleCover / podcastCover` 及相应 `*Filename`；包内相对路径，图片也可为 raster Data URL |
| `courseMeta.anchors` | `concept / threeR / reflection / practice / nextLesson`，在原稿同一正文行逐字且唯一命中 |
| `courseMeta.conceptItems` | `{title, body}` 数组，概念卡的横向项目 |
| `courseMeta.podcast` | `{intro, notes:[]}`；仅来自原稿的轻量简介，不放富排版正文 |
| `transcriptMarkdown` | 基准原稿，按字符串精确保护；`--source` 可校验一致性 |
| `components` | 下表七类；均含 `name / title / body / enabled / position` |
| `editorialRules / customEditorialRules` | 重点建议与用户补充，见下文 |
| `articleLink` | 空字符串或 `https://mp.weixin.qq.com/` 文章链接 |

组件的 `position` 是 `before / after`，指相对锚点所在正文行。关闭的组件可以没有锚点，但非空锚点仍须有效。

| key | 位置与用途 |
|---|---|
| `listen` | 正文前，听音引导；无音频建议关闭 |
| `path` | 正文前，听读路径，body 一行一项 |
| `quote` | 控制预置 `editorialRules` 是否启用，不单独生成卡片；自定义重点独立启用 |
| `three-r` | `anchors.threeR`，步骤卡；名字可改，不限定某一种教学法；body 一行一步 |
| `concept` | `anchors.concept`，概念项＋解释 |
| `reflection` | `anchors.reflection`，提醒卡 |
| `practice` | `anchors.practice`，body 第一行是练习；其余行在可选 `anchors.nextLesson` 处显示 |

重点例子：

```json
{"id":"key-point","label":"核心判断","text":"记录事实，再作判断。","reason":"概括本课行动顺序。","recommended":"quote","format":"quote"}
```

`format/recommended` 可选 `none / highlight / bold / quote`。原句在去掉 Markdown 粗体标记的原稿中必须唯一出现，且在同一正文行。若短语反复出现，选择包含上下文的更长原句；不能随意命中第一处。启用规则不允许范围重叠。

## 发布目录与素材基准

JSON 原本放在 `course-packages/`，但素材路径以项目根目录为准时，显式传 `--assets "项目根目录"`。构建会把素材复制到新目录并改为稳定文件名，音频内容不转码，原稿不截断。

`init/build` 拒绝覆盖非空输出目录。创建新版本目录比覆盖旧成品安全。网页替换封面会作为 Data URL 进入导出的配置，下一次 build 会还原成图片文件。

## 阅读建议的质量检查

每张卡片应帮助家长／读者理解或行动，不机械铺满所有组件。摘要用原稿已有观点；练习来自原课，新增练习须明确标成建议并让用户确认。重点理由解释读者为何应在此停顿。原稿可以包含与建议不同的表述，修改建议不能修改原稿。

## 输出检查范围

内置校验覆盖结构、唯一锚点、重点重叠、素材路径与文件存在；`--source` 增加原稿精确比较。构建报告含原稿 SHA-256 和素材 SHA-256。它不证明模型建议正确，也不保证公众号二次清洗后的视觉结果。已有 gzh-design 时可额外运行其校验器；保持代码独立，不直接复制主题库。

公众号输出会将中文文本里的直引号与中文后紧跟的半角逗号、分号、问号、叹号转成中文排印形式；英文缩写和代码保留。此处理只作用于渲染结果，左栏原稿、导出的原稿与 JSON 中的原稿不变。
