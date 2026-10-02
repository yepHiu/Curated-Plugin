# 愿望单成员状态同步

## 需求

用户要求服务器中已加入愿望单的影片在插件中显示绿色「已加入」，未加入的保持灰色。覆盖 JavDB 列表/详情、Jable 与 MissAV 详情。成员状态与入库状态分别显示；已完成或已入库条目仍在愿望单中时为已加入，删除后为未加入。

## 实现

- Server 新增 `POST /api/integrations/wishlist/status`，严格 `{codes: string[]}`（1–100），返回 `{statusMap: {[原请求番号]: {added: boolean}}}`。沿用 WishlistIdentity 和 SQLite identity_key，只读批量查询，返回 no-store，开关即时生效。仅插件接入路径豁免 PIN/扩展 Origin，普通愿望单 API 保护不变。
- 插件后台通过 `CHECK_WISHLIST_CODES` 调用，校验本扩展网页/弹窗来源，当前服务地址隔离，无持久化成员缓存；每批 100，15 秒超时，禁止重定向。
- 公共按钮模块保存当前页短期状态，首次挂载、重新扫描、页面 focus/visibility 恢复和可见页面每 15 秒查询。DOM 更新不重复查询；已加入绿色按钮不半透明。添加成功立即变绿，同番号共享状态，revision 阻止迟到查询覆盖添加或新页面。
- 失败展示未知状态和悬停错误，允许重试加入；不把查询失败误判为服务器返回的未加入。

## 验证与启用

插件类型检查、生产构建、愿望单 API/按钮同步和竞争测试、MissAV、设置和删除回归。Server storage/server/moviecode 测试与 vet，以及开发后端构建。浏览器用生产脚本和模拟消息核对绿色/灰色状态、后台删除同步、错误状态。

使用更新后的 Server，加载其新代码并开启联动；在 Chrome 重新加载插件 dist，刷新来源网页。远程发布插件源码不能替换已安装 Server 二进制。

验证已通过：插件类型检查、生产构建、四组测试；Server server/storage/moviecode 完整包测试与 vet；`pnpm backend:build:dev` 编译新版 curated-dev.exe。Playwright 在用户提供的 MissAV 实页注入生产 bundle，模拟后台成员响应，确认已有条目绿色「已加入」（opacity 1）、服务端移除后灰色可添加、添加成功及重新扫描后维持绿色。浏览器测试没有写真实愿望单，真实已安装 Chrome 与已安装 Server 的配套升级仍需按上述步骤启用。
