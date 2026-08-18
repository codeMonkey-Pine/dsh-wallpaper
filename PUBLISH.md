# 发布到 DSH 插件市场（awesome-dsh-plugin）

dsh 的「插件市场」（dshmarket 的 设置 → 插件市场）不直接收录插件，它的目录来自社区策展仓库
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
（站点 https://awesome-dsh-plugin.com ，市场启动时拉取它的 `plugins.json`）。

**两步走：先发布 npm 包，再向 awesome-dsh-plugin 提交一条目录条目。** 市场安装优先走 npm
（`dsh plugin --profile web add <包名>`），npm 包名与 GitHub 仓库会被交叉校验防止抢注。

> 本机沙箱无网络且 npm 未登录，以下命令需要在能联网、已登录 npm 的机器上执行。

---

## 步骤 0：前置条件

- [ ] npm 账号：https://www.npmjs.com/signup ，本机执行 `npm login`
- [ ] GitHub 账号，并准备一个**公开仓库**（市场条目需要 `url`；未发布 npm 时安装走
      `github:owner/repo` 兜底）
- [ ] 能访问 https://registry.npmjs.org 与 https://github.com

## 步骤 1：确认包名（已改为无作用域名）

包名已是 **`dsh-wallpaper`**（无作用域，符合市场惯例，如 `dsh-movein`、`dsh-devtools`）。
发布前确认该名字未被占用：

```bash
npm view dsh-wallpaper    # 返回 404 / E404 即未被占用，可以发布
```

发布后若想改用你自己的作用域名（如 `@codeMonkey-Pine/dsh-wallpaper`），改名只需动 3 处并重建：

1. `package.json` → `"name"`（并把 `repository.url` 里的 `codeMonkey-Pine` 换成你的）
2. `tsdown.config.ts` → `PACKAGE_ID` 常量
3. `cordis.patch.yml` → `insert[].name`（用户安装时的插件行名 = 包名）

```powershell
# 用本机 harness 工具链（见 README「构建」）：
<harness>\node_modules\.bin\tsdown.cmd --config .\tsdown.config.ts
# 复查客户端 bundle 里的模块 id 已变成新包名：
Select-String -Path .\lib\client.js -Pattern '__ModuleLoader__.load'
```

## 步骤 2：推送到 GitHub

```bash
cd dsh-wallpaper
git init && git add . && git commit -m "feat: Wallpaper Engine integration for dsh web GUI"
git remote add origin https://github.com/codeMonkey-Pine/dsh-wallpaper.git
git push -u origin main
```

> 建议把 `node_modules`（本机构建用的 junction）加入 `.gitignore`，避免误提交。

## 步骤 3：发布到 npm

```bash
npm login                 # 输入 npm 账号
npm publish               # scoped 包（@xxx/yyy）默认私有，需：npm publish --access public
```

发布后自测安装：

```bash
dsh plugin --profile web add dsh-wallpaper        # 或你的包名
# 重启 dsh web，侧边栏出现「壁纸设计」入口即成功
```

> 包已就绪：`files` 只含 `lib/ src/ cordis.patch.yml README.md LICENSE`，`dsh.bundle.patch`
> 与 `dsh.client` 声明齐全，`npm pack --dry-run` 已验证 22 个文件 / 90.5 kB，无多余内容。

## 步骤 4：向 awesome-dsh-plugin 提交条目

1. Fork https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
2. 在其插件清单（`plugins.json` 或 data 目录，与
   `dshmarket/data/registry-snapshot.json` 同构）的 `plugins` 数组末尾追加一条
   （`page`、`stars` 等由站点自动生成，可不写）：

```json
{
  "name": "dsh-wallpaper",
  "owner": "<你的 GitHub 用户名>",
  "url": "https://github.com/<你的 GitHub 用户名>/dsh-wallpaper",
  "category": "ui",
  "description": {
    "en": "Wallpaper Engine integration for the dsh web GUI: scan the local WE library (Steam workshop 431960 + local projects) and use its wallpapers as the page background — image/video/web rendered natively, scene wallpapers as softened static previews — with a 壁纸设计 panel (opacity, scope, blur, vignette, fps, parallax, carousel, theme linkage) and agent tools wallpaper_scan/list/set/config.",
    "zh": "Wallpaper Engine 壁纸联动：把本机下载的 WE 壁纸（创意工坊 431960 + 本地 projects）设为 DSH Web GUI 页面背景（图片/视频/网页原样渲染，场景壁纸柔化为静态预览），侧边栏「壁纸设计」面板可调不透明度、作用范围、填充、模糊、暗角、帧率、视差、轮播与主题联动，附 wallpaper_scan/list/set/config 四个 agent 工具。"
  },
  "npm": "dsh-wallpaper",
  "install": "dsh plugin --profile web add dsh-wallpaper"
}
```

3. 提 PR（描述模板）：

   > **Plugin**: dsh-wallpaper — Wallpaper Engine integration for the dsh web GUI.
   > **Category**: ui. **npm**: dsh-wallpaper. **Repo**: https://github.com/<you>/dsh-wallpaper
   > Local testing: scan 17 wallpapers from a real WE install; image/video/web render natively,
   > scene wallpapers degrade to a softened static preview; verified in headless Edge.

4. 合并后站点与市场通常一天内自动更新（市场快照由
   `dshmarket` 的 `npm run snapshot` 重新拉取；已安装市场会在「更新」里提示）。

## 步骤 5：验证

- 等待快照更新后，在 `dsh web` → 设置 → **插件市场** 搜索 `wallpaper`，应出现你的插件；
- 点击安装（一键），刷新页面后侧边栏出现「壁纸设计」入口；
- 本机若之前用 junction 挂载过旧名，可先移除旧的 profile patch 行再通过市场安装新名，
  避免两个实例同时存在。

## 常见问题

- **`npm publish` 报 404/无权**：作用域包没有 org 权限（`ENEEDAUTH` 或 404）→ 换无作用域名。
- **市场安装报 `declares no dsh.bundle`**：确认 `package.json` 里 `dsh.bundle.patch` 指向
  `./cordis.patch.yml` 且文件存在。
- **安装后没有 UI**：确认 `dsh.client.platform: "web"` 存在；客户端 bundle 由市场按包名
  `/plugins/<id>/client.js` 提供，包名必须与 bundle 内 `__ModuleLoader__.load({id})` 一致。
