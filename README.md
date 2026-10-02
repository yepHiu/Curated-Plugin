# Curated Plugin

基于 **TypeScript + Webpack** 的 Chrome 插件（Manifest V3）工程模板。

## 功能概览

| 模块 | 说明 |
|------|------|
| `background` | Service Worker，处理后台逻辑与消息路由 |
| `content` | Content Script，注入到网页中执行 |
| `popup` | 点击插件图标弹出的操作界面 |
| `options` | 插件设置页面 |
| `utils/messaging` | Background / Popup / Content Script 消息通信封装 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 生成图标

```bash
node scripts/generate-icons.js
```

### 3. 开发构建

```bash
npm run dev
```

监听文件变化，自动重新构建到 `dist/` 目录。插件始终为 **Curated Plugin**，不区分开发版和生产版。

在插件设置中开启 **开发者模式**，填写 **默认服务端地址**（本项目开发后端为 `http://127.0.0.1:8080`），点击「保存设置」后生效。关闭开关则使用本机 `8081`，自定义地址仍保留，下次开启时恢复。构建命令不会决定开关状态。旧版已保存的自定义地址继续有效。

### 4. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目的 **`dist/`** 目录。
5. 修改源码后等待构建完成，在扩展管理页点击插件的「重新加载」，并刷新目标网站页面。Webpack watch 不会自动刷新 Chrome 中已运行的扩展。

### 5. 生产构建

```bash
npm run build
```

单次压缩构建也输出到 `dist/`，插件名称和设置完全相同。`npm run test:dev-mode` 验证开发者开关、自定义地址保存、旧配置兼容。

### 想看列表删除结果

批量删除从 JavDB 想看列表移除本页已入库影片。任务按标签页和任务编号记录状态，由扩展后台读写存储；网页脚本提交任务状态，弹窗向后台查询结果，两者均不直接访问任务存储。部分失败会同时显示成功与失败数量。删除期间请保持网页打开，刷新或关闭网页可能中断尚未完成的请求。

若出现 `A listener indicated an asynchronous response ... message channel closed`，表示扩展与网页的消息连接断开，不能据此确定删除是否成功。更新构建后，在 `chrome://extensions/` 重新加载 Curated Plugin，再刷新 JavDB 网页并检查想看列表。新版会显示连接中断或结果未确认的提示，不自动重试删除。

若旧版提示 `Access to storage is not allowed from this context.`，更新并重新加载插件、刷新网页即可使用后台存储流程，无需放宽存储访问权限或清空扩展数据。

`npm run test:delete` 在网页脚本和弹窗直接访问存储均被拒绝的模拟环境中，经过真实消息封装和后台路由，覆盖结果读取、任务隔离、重复启动、后台存储失败、任务异常、中断超时及消息来源校验；测试不连接真实站点或删除真实影片。

在 Curated 的「设置 → 网络」开启「浏览器插件联动」即可连接，无需生成或填写凭证。关闭联动后，后端会拒绝插件请求，已有愿望单保留。

## 项目结构

```
curated-plugin/
├── src/
│   ├── background/index.ts      # Service Worker
│   ├── content/index.ts         # Content Script
│   ├── popup/                   # 弹出窗口
│   ├── options/                 # 设置页
│   ├── utils/messaging.ts       # 消息通信工具
│   └── manifest.json            # 插件清单
├── public/icons/                # 插件图标
├── scripts/generate-icons.js    # 图标生成脚本
├── dist/                        # 构建产物（加载此目录）
├── webpack.config.js
├── tsconfig.json
└── package.json
```

## 开发指南

### 消息通信

各模块通过 `chrome.runtime.sendMessage` 通信，已封装为类型安全的工具函数：

```typescript
import { sendMessage } from '@/utils/messaging';

// Popup / Content Script 发送消息
const tabInfo = await sendMessage({ type: 'GET_TAB_INFO' });
const pong = await sendMessage({ type: 'PING' });

// Background 接收消息（在 background/index.ts 中）
import { onMessage } from '@/utils/messaging';
onMessage(async (message) => { /* ... */ });
```

### 添加新消息类型

1. 在 `src/utils/messaging.ts` 的 `MessageType` 中添加类型
2. 在 `src/background/index.ts` 的 `switch` 中处理
3. 在调用方使用 `sendMessage` 发送

### 修改权限

编辑 `src/manifest.json` 中的 `permissions` 和 `host_permissions` 字段。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式，监听构建 |
| `npm run build` | 生产构建 |
| `npm run type-check` | TypeScript 类型检查 |

## 自定义

- 替换 `public/icons/` 中的图标文件（16、48、128 像素 PNG）
- 修改 `src/manifest.json` 中的名称、描述和权限
- 在 `src/` 各模块中添加你的业务逻辑

## 愿望单接入（2026-09-22）

1. 在更新后的 Curated 打开「设置 → 网络 → 浏览器插件联动」，开启「允许浏览器插件联动」。默认关闭，保存后立即生效并在重启后保留。
2. 在本插件设置中填写 Curated 服务地址，无需凭证。开发服务常用 `http://127.0.0.1:8080`，桌面版常用 `http://127.0.0.1:8081`，以实际监听为准。
3. `npm run build` 后在 Chrome 扩展管理页重新加载 `dist/`。
4. JAVDB 列表卡片/详情或 jable 详情页点击「加入愿望单」。自动保存对应影片来源页（JAVDB 列表保存卡片详情地址）。Curated 详情在元数据来源后显示 JAVDB/Jable 等站点名链接。页面没有提取出番号时，可在插件弹窗中手动输入，此入口不猜来源页。需配合支持 sourceUrl 的新版 Curated 后端；更新后重新加载扩展和网页。

请求始终只有 `{ "code": "SSIS-001" }`，发送到 `POST /api/integrations/wishlist/items`。Curated 后台查询资料、保存图片；插件不上传标题、图片、cookies 或影片。重复添加显示已有状态，成功接收不代表资料已经补全。

插件不再保存或发送愿望单凭证。关闭 Curated 的插件联动后，后端拒绝插件请求并返回 `403 BROWSER_PLUGIN_DISABLED`；插件会提示到网络设置开启，已有愿望单不受影响。

扩展站点时，在 `src/content/wishlist.ts` 的 adapters 中增加 `matches` 与 `targets`，targets 只返回 `code` 和按钮宿主 `host`；同时更新 manifest 站点匹配权限。公共按钮、后台提交和 API 协议无需复制。当前自动适配 JAVDB 与 jable，并不自动支持任意网站。

验证：`npm run type-check`、`npm run build`、`npm run test:wishlist`。后者包含真实发送函数的协议测试，以及公共按钮在合成 DOM 上的番号绑定、防重和重试测试；真实站点加载扩展的完整链路仍需验收。
