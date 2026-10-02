# Curated Plugin 需求文档

> 整理自用户原始输入（对话记录 + PRD.md + API.md），最后更新：2026-10-02

## 1. 项目背景

Curated Plugin 是一个 Chrome 浏览器插件，用于在 JavDB 网页上自动比对本地 Curated 媒体库的入库状态，并在影片卡片上直观标注「已入库」或「未入库」。

## 2. 原始输入来源

### 2.1 对话记录

| 顺序 | 原始输入 | 意图 |
|------|---------|------|
| 1 | 「创建一个 chrome 插件工程模板」 | 搭建可开发的 Chrome 插件脚手架 |
| 2 | 选择 TypeScript + Webpack | 技术栈：类型安全 + Webpack 打包 |
| 3 | 「开始」 | 确认方案，开始搭建模板 |
| 4 | 「理解 PRD 文档并整理我的原始需求和原始输入」 | 梳理业务需求 |
| 5 | 「整理好的需求保存为文档，然后继续」 | 固化需求文档并进入业务实现 |

### 2.2 PRD.md 核心业务需求

**服务范围**
- 对接 Curated 后端服务端
- 默认服务地址：`服务器IP:8081`（即 `http://<IP>:8081/api`）

**核心业务流程**

```
JavDB 页面影片卡片
    ↓ 解析番号 (code)
Curated API 查询
    ↓
已入库 → 卡片 tag 标记「已入库」
未入库 → 卡片 tag 标记「未入库」
```

**5 条功能需求**

1. 能访问 Curated 服务端
2. 能查询影片、判断是否入库
3. 根据入库状态在卡片 tag 区域打标签
4. 有 UI 可配置服务端地址
5. 请求需能被服务端识别为 `Curated-Plugin`

### 2.3 PRD 附带的技术素材

| 素材 | 内容 |
|------|------|
| 目标网址 | `https://javdb.com/users/want_watch_videos` |
| 卡片数据结构 | `id`, `link`, `cover`, `code`, `title`, `score`, `rating_count`, `date`, `tags`, `playable`, `cn_sub` |
| DOM 结构 | `<div class="item" id="video-{id}">` 内含 `.video-title strong`（番号）、`.tags .tag`（标签区） |
| 解析代码草稿 | `extractCard()` / `extractAllCards()` / `getMovies` 消息处理 |

### 2.4 API.md 对接规范

| 能力 | 接口 / 约定 |
|------|------------|
| 连通性检查 | `GET /api/health` |
| 按番号查询 | `GET /api/library/movies?q={番号}&limit=N` |
| Base URL | `http://<IP>:8081/api`，去掉末尾 `/` |
| 客户端识别 | `X-Curated-Client: Curated-Plugin`，可选 `X-Curated-Client-Version` |
| 认证 | 若开启 PIN，需处理 `423 AUTH_LOCKED` |

## 3. 需求分层

```
L1 工程层（已完成）
  Chrome 插件模板 · TypeScript + Webpack · Manifest V3

L2 产品层（本次实现）
  JavDB 想看列表 · 番号比对 · 入库状态标签

L3 实现层
  DOM 解析 · API 客户端 · 标签注入 · 配置 UI
```

## 4. 功能规格

### 4.1 页面解析（Content Script）

- **作用页面**：`https://javdb.com/*`（首期目标为想看列表页）
- **卡片选择器**：`#videos .item`
- **提取字段**：按 PRD 定义的 `MovieCard` 结构解析
- **触发时机**：页面加载完成后自动执行；支持手动重新扫描
- **动态内容**：通过 MutationObserver 监听新增卡片

### 4.2 入库查询（Background + API）

- 从配置读取服务端 Base URL（默认 `http://127.0.0.1:8081`）
- 对每个番号调用 `GET /api/library/movies?q={code}`
- 结果中 `code` 精确匹配（忽略大小写）则判定为已入库
- 请求携带 `X-Curated-Client: Curated-Plugin` 请求头
- 支持批量查询，控制并发避免压垮服务端

### 4.3 标签注入

- 注入位置：卡片内 `.tags` 区域
- 已入库：添加 `已入库` 标签，绿色样式
- 未入库：添加 `未入库` 标签，灰色样式
- 防重复：同一卡片不重复注入；状态变化时更新标签
- 样式类名：`curated-tag`、`curated-tag-in`、`curated-tag-out`

### 4.4 配置 UI（Options Page）

- 服务端地址输入框（IP:端口 或完整 URL）
- 保存到 `chrome.storage.sync`
- 测试连接按钮（调用 `/api/health`）
- 保存前规范化 URL（去末尾 `/`，补全 `/api` 前缀）

### 4.5 弹出窗口（Popup）

- 显示当前服务端连接状态
- 显示当前页面已扫描卡片数量
- 提供「重新扫描」按钮
- 快捷跳转设置页

## 5. 隐含需求

| 需求 | 依据 |
|------|------|
| 番号为唯一匹配键 | PRD 用 `code` 查询服务端 |
| 仅处理含番号的卡片 | 无番号则跳过 |
| 服务端地址持久化 | PRD 要求 UI 配置 |
| 避免重复打标 | 业务合理性 |
| 查询失败时显示错误状态 | 可用性 |

## 6. 非目标（本期不做）

- PIN 解锁流程（服务端未开启 PIN 时不需要）
- MissAV 列表卡片及尚未适配的镜像域名（Jable 与 missav.ws 详情页已支持）
- 影片导入 / 播放等写操作
- 分页自动翻页批量处理

## 8. 二期已实现功能（2026-06-18）

### 8.1 详情页支持 (`/v/{id}`)

- 在页面顶部注入 Curated 状态横幅
- 显示番号、入库状态
- **已入库**：「在 Curated 中查看」「播放」按钮
- **未入库**：「导入引导」「在 Curated 搜索」按钮

### 8.2 标签点击联动

| 标签 | 点击行为 |
|------|---------|
| 已入库 | 新标签页打开 Curated 影片页 |
| 未入库 | 弹出导入引导（复制番号 / 在 Curated 搜索） |

### 8.3 想看列表删除提示

- 仅作用于 `/users/want_watch_videos`
- 已入库卡片在 `.meta-buttons` 区域显示绿色提示
- 文案：「已在库中，可点击「刪除」从想看列表移除」
- 不自动触发删除（尊重 JavDB 原生确认弹窗）

## 9. MissAV 详情页支持（2026-10-02）

用户提供 `https://missav.ws/dm26/hbad-643` 并要求兼容插件。支持范围为 `missav.ws` 及其子域名的可识别番号详情页：标题下展示入库状态、打开已入库影片、JavDB 搜索和加入愿望单；愿望单保留当前来源页。弹窗识别站点并支持跳过缓存重新扫描。动态标题更新与异步查询隔离，搜索、分类、演员页不当作影片查询。沿用现有后台查询与愿望单 API，不新增服务端接口。

## 9. 验收标准（二期）

- [x] 详情页顶部显示入库状态横幅
- [x] 已入库可跳转 Curated / 播放
- [x] 点击列表标签可联动 Curated
- [x] 未入库显示导入引导
- [x] 想看列表已入库影片显示删除提示
- [x] `npm run build` 与 `npm run type-check` 通过
