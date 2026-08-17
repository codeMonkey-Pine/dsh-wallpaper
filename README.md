# dsh-wallpaper — Wallpaper Engine 壁纸联动插件

把本机 Wallpaper Engine 下载的壁纸用到 DSH Web GUI 页面上：扫描本地壁纸库（Steam 创意工坊 `431960` + 本地 projects），按 WE 的渲染方式展示（图片 / 视频 / 网页壁纸原样渲染，场景壁纸降级为预览图），并在侧边栏提供「壁纸设计」入口，从右侧面板实时调节不透明度、作用范围、模糊、暗角等。

## 功能

- **壁纸库**：扫描 Steam 创意工坊 `steamapps/workshop/content/431960` 与 `wallpaper_engine/projects`，解析每个壁纸的 `project.json`（标题、类型、预览图、尺寸、fps；无 `project.json` 时按文件扩展名自动识别），标记 WE 当前正在使用的壁纸。
- **渲染**（尽可能贴近 Wallpaper Engine）：
  - 图片 → 原图 `object-fit` 填充；
  - 视频 → `<video>` 自动播放、静音、循环（WebM/MP4），支持 Range 以便拖动进度；
  - 网页壁纸 → `<iframe>` 加载其自身 `index.html`，并透传 `ws` / `fps` / `resolution` 参数；
  - 场景壁纸 → 粒子/特效无法移植到网页，降级为预览图并打标。
- **「壁纸设计」面板**（侧边栏入口 → 右侧抽屉）：
  - 启用开关、不透明度 0-100%；
  - 作用范围：**整页**（整个 html 页面）或 **主内容区**（仅中间对话列）；
  - 填充模式（覆盖 / 适应 / 拉伸）、高斯模糊 0-20px、暗角遮罩（颜色 + 强度）；
  - 帧率限制（自动 / 60 / 30 / 10）、失焦暂停视频；
  - 鼠标视差、点击穿透；
  - 多壁纸轮播（间隔 + 淡入/滑动动画）、主题联动（遮罩随明暗主题自动调整）。
- **持久化**：面板设置存浏览器 `localStorage`（键 `dsh.wallpaper.v1`），刷新自动恢复。
- **Agent 工具**：`wallpaper_scan` / `wallpaper_list` / `wallpaper_set` / `wallpaper_config` —— 模型可直接扫描、列表面、设置 GUI 壁纸（写入宿主期望状态，浏览器下次加载时应用）。

## 目录结构

```
dsh-wallpaper/
├── package.json           # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml       # 组合包 patch（插入插件行）
├── tsconfig.json          # 类型检查（依赖 harness 工具链）
├── tsdown.config.ts       # Host lib/index.js + Client lib/client.js 打包
├── src/
│   ├── index.ts           # Host 入口（name/inject/apply + 组装）
│   ├── protocol.ts        # 共享协议（类型 + API 常量，浏览器安全）
│   ├── engine/library.ts  # WE 库扫描（路径发现 / project.json / 嗅探）
│   ├── engine/state.ts    # ~/.dsh/dsh-wallpaper.json 持久化
│   ├── routes.ts          # /api/dsh-wallpaper/* 路由（含 Range、防穿越、loopback 围栏）
│   ├── tools.ts           # 四个 agent 工具
│   └── client/            # 浏览器半区（入口 / API / 状态 / 侧边栏入口 / 面板 / 渲染层）
```

## 构建

需要本机 harness checkout 的工具链（网络不可用时可离线构建）：

```powershell
# 1) 依赖 junction（指向 harness 的 apps/cli node_modules，提供 @deepseek-ai/* 与构建工具）
New-Item -ItemType Junction -Path .\node_modules -Target <harness>\apps\cli\node_modules

# 2) 类型检查 + 打包
<harness>\node_modules\.bin\tsc.cmd    -p .\tsconfig.json
<harness>\node_modules\.bin\tsdown.cmd --config .\tsdown.config.ts
# 产物：lib/index.js（Host）、lib/client.js（Client bundle）
```

## 挂载（web profile，无 dsh 源码改动）

```powershell
# 1) 把包 junction 进 profile 的 node_modules
New-Item -ItemType Junction `
  -Path  "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-wallpaper" `
  -Target (Resolve-Path .)

# 2) 在 profile 的 cordis.patch.yml 追加（或写入 ~/.dsh/cordis.patch.yml 全局生效）：
#    - insert:
#        - id: wallpaper
#          name: 'dsh-wallpaper'

# 3) 重启 dsh web（插件集合变更需重启生效；客户端 bundle 由 clientModules 经 /plugins/<id>/client.js 提供）
```

## 使用

- **GUI**：侧边栏「壁纸设计」按钮打开右侧面板；选择壁纸卡片即应用；面板内调节各项效果；「重新扫描」刷新库；「壁纸来源路径…」可手动指定 Steam 根目录 / WE 安装目录（持久化到 `~/.dsh/dsh-wallpaper.json`）。
- **Agent**：`wallpaper_scan` 重扫，`wallpaper_list` 列表面（返回 id / 标题 / 类型 / 来源 / 当前 / 分辨率），`wallpaper_set <id> [opacity] [scope]` 设置 GUI 期望壁纸（浏览器下次加载应用），`wallpaper_config` 指定非默认路径。

## 限制

- 壁纸只作用于本机 GUI 页面（所有 API 均为 loopback-only），不改变 Windows 桌面壁纸。
- 场景壁纸的粒子/特效渲染无法移植到网页，降级为预览图。
- 视频壁纸直接播放原始文件（WebM/MP4），由浏览器解码；帧率限制作用于视差/轮播等效果循环，视频本身保持原生帧率。
- 依赖 `--dsw-alias-bg-base` 主题变量实现背景透明；若未来 shell 改变背景实现方式，「整页」作用范围可能需要同步调整。
