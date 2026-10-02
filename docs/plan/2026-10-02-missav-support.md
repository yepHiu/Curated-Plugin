# MissAV 详情页兼容

## 目标与范围

用户提供 `https://missav.ws/dm26/hbad-643`，要求 Curated Plugin 兼容。实页确认影片标题为 `h1.text-base.lg:text-lg.text-nord6`，位于 `.mt-4` 容器中，网址和标题番号一致。适配 `missav.ws` 及其子域名的详情页；其他镜像域名与列表卡片不纳入本次实现。

## 实现

1. Manifest 注册 `https://*.missav.ws/*`，网址解析限制影片路径，支持语言/`dm` 前缀与常见字幕、无修正后缀。
2. 独立 MissAV 适配器核对当前 `h1` 标题，在标题下沿用深色状态条。通过既有 `CHECK_MOVIE_CODES` 消息查询后台；已入库可打开 Curated，并提供 JavDB 搜索。
3. 公共愿望单适配器提交番号与当前影片来源页；同一影片不重复挂载，失败可重试。
4. 弹窗识别 MissAV、显示状态、重新扫描跳过缓存。观察动态标题，校验查询序号与当前番号，防止旧请求覆盖新页。

不新增服务端 API 或设置项，沿用现有后台消息和服务端配置。

## 验证

- `npm run type-check`、`npm run build`。
- `npm run test:missav`：网址边界、动态标题、状态展示、消息路由、重新扫描、错误及过期响应。
- `npm run test:wishlist`：JavDB/Jable 回归与 MissAV 番号、来源地址、重复挂载、失败重试。
- `npm run test:dev-mode`、`npm run test:delete`：设置与想看列表删除回归。
- Playwright 检查用户提供的实页 DOM；在实页注入生产 content bundle，以模拟 Chrome 消息响应验收挂载与状态交互。模拟测试不写入真实愿望单。

## 验证结果

以上类型检查、生产构建及四组测试均通过。实页生产脚本正确挂到影片 `h1` 后，只查询 `HBAD-643`；愿望单请求带 `sourceUrl: https://missav.ws/dm26/hbad-643`，成功后按钮禁用。重新扫描发送 `skipCache: true`。生产弹窗在模拟 Chrome 消息下显示 MissAV 影片页和状态，点击重新扫描发出 `RESCAN` 并显示扫描完成。实页验收使用模拟后台响应；用户现有 Chrome 中仍需重新加载扩展、刷新网页以启用新 Manifest 匹配规则。
