# 葡语精听精读工作台

一个浏览器里的葡语学习工具，重点是视频精听、文字精读和基础语料沉淀。项目可以本地运行，也可以通过 GitHub Pages 发布成公开网站。

## 在线发布

这个项目已经包含 GitHub Pages 自动发布配置：

```text
.github/workflows/deploy.yml
```

发布步骤：

1. 在 GitHub 创建一个新仓库。
2. 把本项目内容推送到仓库的 `main` 分支。
3. 打开仓库的 `Settings` -> `Pages`。
4. Source 选择 `GitHub Actions`。
5. 等待 `Deploy GitHub Pages` 工作流完成。

发布后，网站地址通常是：

```text
https://你的用户名.github.io/仓库名/
```

## 本地启动

双击：

```text
start.command
```

或在项目目录运行：

```bash
npm run dev
```

然后打开：

```text
http://127.0.0.1:4173/
```

## 当前功能

### 2026-09 学习流程升级

- 新增“间隔复习”页：按“再练 / 模糊 / 记住”安排下一次复习。
- 精听增加逐词听写对照，文章增加可续读文章架和回忆模式。
- 草稿、段落笔记、完成标记、难点和复述自动保存在本机。
- 导出备份会排除 API 密钥；恢复时合并文章和语料，同 ID 的本机内容优先。
- 统一移动端布局、键盘操作、焦点状态和减少动态效果支持。

复习安排是简单规则，不是语言能力评分。数据仍按浏览器和网站地址分别保存；换网址使用前，请先在旧网址导出备份，再在新网址恢复。

运行 `npm run build` 可验证脚本并生成 `dist/` 静态文件。

### 原有功能

- YouTube 链接播放
- 本地字幕导入和清洗
- 字幕预览
- 点击句子跳转
- 上一句 / 下一句
- 单句循环
- 当前字幕自动滚动
- 隐藏葡语 / 隐藏中文
- 点击单词查词
- 精读文章导入和点击查词
- 基础语料库
- OpenAI 设置和预算入口

## 文件结构

```text
portuguese-study-tool/
  public/
    index.html
    .nojekyll
  .github/
    workflows/
      deploy.yml
  server.js
  start.command
  package.json
  README.md
```

## 数据和安全

学习数据保存在浏览器本地存储里。公开网站不会自带数据库，不会同步不同设备的数据。

OpenAI API Key 不应该写进代码或提交到 GitHub。当前版本只允许用户在网页设置里手动填写，Key 会保存在当前浏览器的本地存储中。公开网站如果要给多人使用，建议后续增加后端代理和账户系统，不要把共享 API Key 放在前端。
