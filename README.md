# Muse Edit Skill

把课程逐字稿与音频变成可编辑的阅读层、公众号图文和播客发布材料。AI 准备建议，网页负责确认与精修，脚本负责保留原稿和打包。

这是从自用 Muse 工作台提取的便携技能版。它兼容现有完整课程 JSON `1.0`，不包含真实课程、音频、品牌人物或私人路径；也没有改动 KW 或 gzh-design。

## 安装到 Codex

需 Node.js 22+，正常使用不需要 npm install。克隆本仓后，把 `skills/muse-edit` 整个目录复制到 `~/.codex/skills/muse-edit`（已有同名技能时先比较，不直接覆盖）。重启会话后使用：

> 用 $muse-edit，把这份逐字稿和音频做成课程图文与播客发布包，保留原稿，打开让我检查。

其他支持 SKILL.md 的 Agent 可按其技能目录安装。

## 本地演示

```bash
node skills/muse-edit/scripts/muse.mjs build --course examples/demo.course.json --source examples/transcript.md --out output/demo
```

打开 `output/demo/index.html`。示例是虚构的学习方法短课，没有真实音频或品牌图，工作台会如实提示待补素材。

三栏分别是原稿、阅读层和预览。支持卡片开关／编辑／锚点、重点高亮／加粗／引用、自定义重点、封面替换与下载、音频预览、公众号链接回填、复制与导出。

## 处理自己的课程

```bash
node skills/muse-edit/scripts/muse.mjs init --source /path/to/transcript.md --title "课程标题" --id lesson-01 --out output/lesson-source --audio /path/to/audio.mp3 --article-cover /path/to/article.png --podcast-cover /path/to/podcast.png
# 由 Agent 按原稿填写 output/lesson-source/course.json 的阅读层与播客文案。
node skills/muse-edit/scripts/muse.mjs build --course output/lesson-source/course.json --source /path/to/transcript.md --out output/lesson-release --require-assets
```

现有课程的素材位于另一个目录时，加 `--assets /path/to/project-root`。可选 `--validator /path/to/gzh-design/scripts/validate_gzh_html.py` 调用本机已安装的公众号校验器。

输出包含 `index.html`、课程 JSON、原稿、干净正文 HTML、标题、节目笔记、转写校对稿、音频／封面和校验报告。复制整个输出文件夹即可迁移。

## 保存与发布边界

- 网页自动保存到当前浏览器，不能自动写回磁盘。**导出当前配置**是文件备份；**下载当前正文**是修改后的 HTML，原来的 `article.html` 不会自动变化。
- 用导出的 JSON 重新 build 到新目录，可生成更新后的完整交付包。
- 剪贴板受限时，在发布目录启动 `python3 -m http.server 8765 --bind 127.0.0.1`，再打开本地地址；端口占用时换一个。
- 图文和播客分别发布。工具不自动上传、不伪造时间轴、不保证平台二次清洗后的排版。
- 主要支持课程逐字稿 Markdown 子集，复杂表格／图片／HTML 或多主题自动排版仍适合 gzh-design。两者没有无损 HTML 编辑互通。
- 浏览器草稿不是跨设备同步。素材未提供时可以预览，完整交付用 `--require-assets` 检查。

## 开发验证

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

浏览器测试使用独立测试环境与合成内容，不会连接 KW、公众号或调用付费模型。也可用 `MUSE_BROWSER_EXECUTABLE` 指定本机 Chromium/Chrome 可执行文件。

本仓没有复制 gzh-design 的主题库或校验器；外部校验仅在用户提供脚本路径时调用。真实内容的使用和发布权限由内容所有者决定。
