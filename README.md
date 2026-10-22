# Scroll Capture

自动识别网页里「需要单独滚动」的内容区，把它的全部纵向内容截成一张长图；左侧固定栏自动裁掉。

> A Chrome (MV3) extension that auto-detects the scrollable content panel and captures its full length as a single image.

普通的整页长截图只认 document 级滚动。遇到「左侧固定导航 + 右侧独立滚动正文区」这类后台/文档站布局，它要么只截到右侧当前一屏，要么把左栏一起截进去。Scroll Capture 用「视口中心探针 → 找真正的滚动容器 → 逐屏截取拼接」解决这个死角。

## 特性

- 自动识别目标滚动容器，无需手动框选
- 同时支持「内滚动容器」和「整页滚动 + 固定侧栏」两种布局
- 横向自动裁掉左侧固定栏
- 截图前处理 `position: sticky` / `fixed` 覆盖层，避免逐屏重复
- 逐屏拼接，超长页面自动降采样（上限约 16000px）
- 完成后打开预览页，可保存 PNG，并尝试自动下载
- 失败不静默：预览页红条 + 分步运行日志，明确指出失败阶段

## 安装（Chrome / Edge，未打包加载）

1. 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录
4. 到目标页面，按 `Option + Shift + S`（Windows/Linux 为 `Alt + Shift + S`），或点工具栏扩展图标

> 若目标是 `file://` 页面，需要在扩展详情里打开「允许访问文件网址」。

## 使用

1. 打开要截取的页面，确认右侧内容区可以独立上下滚动
2. 按 `Option + Shift + S`，或点扩展图标
3. 扩展会自动识别、逐屏截取、拼接
4. 完成后在预览页点「保存 PNG」

手动测试页：浏览器打开 `test/fixture.html`，可在「内滚动容器 / 整页滚动」之间切换，用来检查截图是否连续、左栏是否被裁掉。

## 开发与测试

无第三方运行时依赖，纯原生 JS。

```bash
npm test          # 检测与拼接的单元测试
npm run icons     # 重新生成扩展图标（需要 Pillow）
```

- `test/fixture.html`：双布局人工测试页
- `test/harness.html`：用 headless Chrome 自动验证检测逻辑

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --allow-file-access-from-files \
  --window-size=1400,800 --virtual-time-budget=3000 \
  --dump-dom "file://$PWD/test/harness.html"
```

## 排查（点了没反应）

1. **看后台日志**：`chrome://extensions` → Scroll Capture → 点「Service Worker / 服务工作进程」打开 DevTools → 再点一次图标。正常应看到 `[SC] sw-loaded → action-clicked → start → …`
2. **看页面日志**：目标页按 F12，Content Script 的 `console` 也在这里。
3. **扩展卡片上的「错误 / Errors」**：有红字点开就是后台报错。
4. **失败会弹预览页**：红条写原因，下方「运行日志」列出每一步；工具栏图标显示 `!`。
5. **区分触发问题**：`Option+Shift+S` 和点图标走同一条路径，可判断是「点击没触发」还是「截图流程失败」。

## 目录结构

```
manifest.json      MV3 声明、权限、快捷键、图标
background.js      截图编排：注入脚本、逐屏滚动、captureVisibleTab、导出
content.js         页面内：识别目标、隐藏覆盖层、执行/还原滚动
lib/detect.js      滚动目标识别（中心探针 + 祖先链 + 面积阈值 + 固定侧栏检测）
lib/stitch.js      拼接坐标与输出尺寸计算（纯函数，可单测）
offscreen.html/js  offscreen 文档内用 canvas 逐帧拼接
viewer.html/js     截图预览、保存、运行日志
icons/             扩展图标
tools/             图标生成脚本
test/              人工测试页 + headless harness + 单元测试
```

## 实现要点

- **主路径**：容器内滚动逐屏拼接，而不是 CDP `captureBeyondViewport`。内滚动容器的屏外内容不会被渲染，CDP 单次成型对它不可靠。
- **识别**：视口中心偏右探针 → `elementFromPoint` → 沿祖先链找可滚动容器 → 面积阈值排除导航/代码块等小滚动区。
- **document 滚动**单独判定：`documentElement` 的 `overflowY` 默认是 `visible`，但整页仍可滚动。
- **覆盖层去重**：`sticky` 临时改为普通流（只出现一次），`fixed` 临时隐藏，截完恢复。
- **稳定性**：图像加载逐段超时并降级；offscreen 有 watchdog；单帧失败自动重建离屏文档并重放已截帧，杜绝静默卡死。

## 验证状态

已通过：

- 全部 JS 语法检查与检测/拼接单元测试
- headless Chrome 对双布局识别结果验证
- 在真实后台/聊天类页面上端到端截图成功（Chrome）

已知限制：

- **虚拟列表**：只渲染可视行，滚动拼接会缺内容，后续加探测提示
- **跨域 iframe**：目标在跨域 iframe 内时内容脚本拿不到
- **`captureVisibleTab` 频率**：约 2 次/秒限制，长页面截取会慢（已按约 560ms 节流）
- **超长页面**：输出高度超过 16000px 会降采样
- **多滚动区并列**：极端布局可能识别错容器，后续加低置信度兜底交互
- **纯固定定位（`fixed`）的工具栏**：为保证不重复，截图期间会被隐藏，不会出现在图里

## License

MIT
