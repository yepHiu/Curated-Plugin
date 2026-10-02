# Curated 后端 API 使用指南

本文档是 Curated 仓库的公开 HTTP API 指南，用于当前 Web 前端、后续 Android App、局域网客户端以及其他衍生项目对接同一个 Go 后端。

本文只描述当前 Go HTTP 后端已经实现的接口，不引入新 API 行为。

实现入口：

- 路由注册：`backend/internal/server/server.go`
- 分散 handler：`backend/internal/server/*.go`
- 后端 DTO / 错误码：`backend/internal/contracts/contracts.go`
- 当前前端调用封装：`src/api/endpoints.ts`
- 当前前端类型：`src/api/types.ts`

最后核对日期：2026-06-07。

## 1. 快速接入

### 1.1 Base URL

所有 HTTP API 都挂在 `/api` 前缀下。

常见地址：

| 场景 | API Base URL |
| --- | --- |
| Go 后端开发模式 | `http://127.0.0.1:8080/api` |
| Vite 前端代理 | 前端同源 `/api`，由 Vite 转发到 `127.0.0.1:8080` |
| 打包后的本机后端 | 通常为 `http://127.0.0.1:8081/api`，以发布配置为准 |
| Android / 局域网客户端 | `http://<运行后端的电脑IP>:<端口>/api`，例如 `http://192.168.1.23:8080/api` |

衍生客户端建议把 Base URL 做成可配置项，并在保存前统一去掉末尾 `/`。

### 1.2 最小连通性检查

```bash
curl http://127.0.0.1:8080/api/health
```

典型返回：

```json
{
  "name": "curated-dev",
  "version": "git.abcdef0",
  "channel": "dev",
  "installerVersion": "0.0.0",
  "transport": "http",
  "databasePath": "C:\\Users\\...\\curated.db"
}
```

### 1.3 Android / 非浏览器客户端建议

Android App 使用 OkHttp、Retrofit、Ktor Client 或其他 HTTP 客户端时，需要注意：

- Base URL 指向服务端电脑 IP：`http://<server-ip>:8080/api`。
- 开发期如果使用明文 HTTP，需要在 Android 网络安全配置中允许对应 IP 的 cleartext traffic。
- PIN 解锁依赖 `Set-Cookie: curated_auth=...; HttpOnly; SameSite=Lax`。非浏览器客户端不需要读取 cookie 内容，但必须用 CookieJar 保存并自动回传 `Cookie`。
- DTO 中的媒体 URL 可能是相对路径，例如 `/api/library/movies/{id}/stream`。客户端必须用后端 origin 解析成绝对 URL：`http://<server-ip>:8080/api/...`。
- 路径参数必须 URL encode，尤其是演员名、影片 ID、精选帧 ID、HLS 文件名。
- 大文件上传、视频播放、图片资源、导出下载不要按 JSON 解析。

## 2. 通用协议约定

### 2.1 成功响应不是统一 envelope

HTTP API 成功时直接返回 DTO 本体，不包 `{ "ok": true, "data": ... }`。

示例：

```json
{
  "items": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

空成功响应使用 `204 No Content`，例如删除、恢复、记录播放、更新播放进度等。

### 2.2 错误响应

失败响应统一返回 `AppError` JSON：

```json
{
  "code": "COMMON_BAD_REQUEST",
  "message": "invalid json body",
  "retryable": false,
  "details": {
    "field": "example"
  }
}
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `code` | 稳定机器可读错误码 |
| `message` | 面向调用方的简短说明 |
| `retryable` | 后端按状态码推导；`5xx` 通常为 `true` |
| `details` | 可选结构化调试信息 |

常见 HTTP 状态：

| 状态 | 场景 |
| --- | --- |
| `200 OK` | 普通查询 / 更新后返回 DTO |
| `201 Created` | 创建上传会话、添加库路径、创建播放会话 |
| `202 Accepted` | 扫描、导入、刮削等异步任务已接受 |
| `204 No Content` | 操作成功但无响应体 |
| `400 Bad Request` | 参数、JSON、文件、业务前置条件不合法 |
| `401 Unauthorized` | PIN 错误 |
| `404 Not Found` | 资源不存在 |
| `409 Conflict` | 状态冲突，例如扫描进行中、目标文件已存在、回收站状态冲突 |
| `423 Locked` | PIN App Lock 已启用且当前请求没有有效解锁会话 |
| `500 Internal Server Error` | 后端内部错误或运行时能力未配置 |

核心错误码：

| 错误码 | 常见含义 |
| --- | --- |
| `COMMON_BAD_REQUEST` | 请求参数、JSON、文件或字段值不合法 |
| `COMMON_NOT_FOUND` | 资源不存在 |
| `COMMON_INTERNAL` | 后端内部错误 |
| `COMMON_CONFLICT` | 当前状态不允许该操作 |
| `AUTH_LOCKED` | 应用已锁定，需要先解锁 |
| `AUTH_INVALID_PIN` | PIN 校验失败 |
| `IMPORT_TARGET_NOT_CONFIGURED` | 未配置默认导入库路径 |
| `IMPORT_TARGET_UNAVAILABLE` | 默认导入库路径不可用 |
| `IMPORT_CONFLICT` | 导入目标文件已存在 |
| `IMPORT_NOT_ENOUGH_SPACE` | 磁盘空间不足 |
| `IMPORT_COPY_FAILED` | 导入复制失败 |
| `IMPORT_SCAN_FAILED` | 文件已导入但后续扫描启动失败 |
| `APP_UPDATE_DOWNLOAD_FAILED` | 更新安装包下载失败 |
| `APP_UPDATE_INSTALL_FAILED` | 更新安装启动失败 |
| `CURATED_EXPORT_ACTOR_MISMATCH` | 精选帧导出时 `actorName` 不属于某一帧 |
| `PROVIDER_NOT_FOUND` | 元数据 provider 名称不存在 |
| `PROVIDER_PING_FAILED` | provider 连通性测试失败 |

### 2.3 认证与 Cookie

Curated 的 PIN App Lock 默认可关闭。开启后，除公开端点外，所有 `/api/*` 都需要有效 `curated_auth` cookie。

公开端点：

| Method | Path |
| --- | --- |
| `GET` | `/api/health` |
| `GET` | `/api/auth/status` |
| `POST` | `/api/auth/setup-pin` |
| `POST` | `/api/auth/unlock` |
| `POST` | `/api/auth/lock` |
| `OPTIONS` | 任意路径，用于 CORS preflight |

Cookie：

- 名称：`curated_auth`
- `HttpOnly`
- `Path=/`
- `SameSite=Lax`
- 普通会话使用浏览器 session cookie，服务端保存 idle deadline。
- `trustedForever=true` 会设置约 10 年 `Max-Age` 和 `Expires`，直到当前设备显式 lock 或未来会话管理能力撤销。

客户端处理建议：

- Web：`fetch` 必须带 `credentials: "include"`。
- Android：OkHttp 必须配置 CookieJar；Retrofit 只负责接口声明，cookie 仍由底层 client 管理。
- 收到 `423 AUTH_LOCKED` 时跳转到解锁页或弹出解锁流程，成功后重试原请求。

### 2.4 CORS 与客户端识别 Header

后端 CORS 行为：

- 有 `Origin` 时，`Access-Control-Allow-Origin` 回显该 Origin。
- `Access-Control-Allow-Credentials: true`
- 无 `Origin` 时允许 `*`，主要用于非浏览器客户端或工具。
- 允许方法：`GET, POST, PUT, PATCH, DELETE, OPTIONS`

允许的请求头：

```text
Content-Type
Authorization
X-Curated-Offset
X-Curated-Chunk-Size
X-Curated-Chunk-SHA256
X-Curated-Client
X-Curated-Client-Version
X-Curated-OS
X-Curated-OS-Version
Sec-CH-UA-Platform
Sec-CH-UA-Platform-Version
```

衍生客户端可发送：

```text
X-Curated-Client: android
X-Curated-Client-Version: 0.1.0
X-Curated-OS: Android
X-Curated-OS-Version: 15
```

这些字段主要用于 `/api/connected-clients` 识别客户端类型，不参与鉴权。

### 2.5 URL、时间、分页

路径参数：

- `movieId`、`sessionId`、`uploadId`、`fileId`、`id`、`name`、`file` 都必须 URL encode。
- 演员名如果包含空格、斜杠、日文、中文，必须 encode。

时间：

- 后端大多数时间字段为 RFC3339 或 RFC3339Nano 字符串。
- `dayKey` 使用本地日历日 `YYYY-MM-DD`。
- 首页推荐使用 UTC 日期 `dateUtc`。

分页：

| 字段 | 含义 |
| --- | --- |
| `limit` | 页大小；不同资源默认值不同 |
| `offset` | 从 0 开始的偏移 |
| `total` | 当前过滤条件下总数 |

列表接口默认：

| 接口 | 默认 `limit` | 上限 |
| --- | --- | --- |
| `GET /library/movies` | 50 | 当前 HTTP handler 不强制上限 |
| `GET /library/actors` | 50 | 当前 handler 不强制上限 |
| `GET /curated-frames` | 50 | 200 |
| `GET /tasks/recent` | 30 | 当前 handler 不强制上限 |
| `GET /playback/sessions/recent` | 20 | 当前 handler 不强制上限 |
| `GET /playback/watch-time/daily` | 91 天 | 91 天 |

### 2.6 媒体、Blob 与 Range

这些端点不是 JSON：

| 端点 | 内容类型 |
| --- | --- |
| `GET /api/library/movies/{movieId}/stream` | 视频文件，`http.ServeContent`，支持 Range / 206 |
| `GET /api/library/movies/{movieId}/asset/{kind}` | 本地封面 / 缩略图 |
| `GET /api/library/movies/{movieId}/asset/preview/{index}` | 预览图，可能从本地缓存或远端代理返回 |
| `GET /api/library/actors/{name}/asset/avatar` | 演员头像 |
| `GET /api/playback/sessions/{sessionId}/hls/{file}` | HLS playlist / segment |
| `GET /api/curated-frames/{id}/image` | 精选帧原图 |
| `GET /api/curated-frames/{id}/thumbnail` | 精选帧缩略图 |
| `POST /api/curated-frames/export` | 单图 `image/jpeg` / `image/png` / `image/webp`，多图 `application/zip` |

播放客户端建议：

- 优先调用 `/library/movies/{movieId}/playback` 获取播放描述，不直接拼 stream URL。
- `mode=direct` 时使用 `url` 播放；若为相对路径，按后端 origin 解析。
- `mode=hls` 时使用 `url` 指向的 `.m3u8`，并让播放器继续请求同一 session 下的 segment。
- Android 推荐使用 Media3 / ExoPlayer；直放 URL 支持 Range，HLS URL 需要按标准 HLS 播放。

### 2.7 异步任务

扫描、导入、元数据刮削、部分更新下载流程使用 `TaskDTO`。

通用流程：

1. 调用触发接口，收到 `202 Accepted` 和 `TaskDTO`。
2. 用 `taskId` 轮询 `GET /api/tasks/{taskId}`。
3. 如果只关心最近完成任务，调用 `GET /api/tasks/recent?limit=30`。

任务状态：

| 状态 | 含义 |
| --- | --- |
| `pending` | 已创建但未开始 |
| `running` | 运行中 |
| `completed` | 成功完成 |
| `partial_failed` | 部分失败，例如导入成功但扫描失败 |
| `failed` | 失败 |
| `cancelled` | 已取消 |

`TaskDTO.metadata` 是面向场景的扩展字段，导入任务会包含拷贝进度、目标路径、失败文件等。

## 3. 推荐客户端工作流

### 3.1 启动连接与认证

1. `GET /health` 判断服务端是否可达，并读取版本。
2. `GET /auth/status` 判断是否需要 PIN。
3. 如果 `pinEnabled=true` 且 `unlocked=false`，调用 `POST /auth/unlock`。
4. 后续所有请求都自动带 cookie。
5. 任意 protected 请求返回 `423 AUTH_LOCKED` 时，重新执行解锁流程。

示例：

```bash
curl -i http://127.0.0.1:8080/api/auth/status

curl -i \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"1234\",\"trustedForever\":true}" \
  http://127.0.0.1:8080/api/auth/unlock
```

### 3.2 浏览影片

1. `GET /library/movies?limit=50&offset=0` 获取影片页。
2. 需要搜索时加 `q`，需要筛选演员或片商时加 `actor` / `studio`。
3. 详情页调用 `GET /library/movies/{movieId}`。
4. 封面、缩略图、预览图直接使用 DTO 中的 URL；相对 URL 解析为后端绝对 URL。
5. 收藏、评分、标签、展示字段覆盖使用 `PATCH /library/movies/{movieId}`。

示例：

```bash
curl "http://127.0.0.1:8080/api/library/movies?q=ABC&limit=24&offset=0"
```

### 3.3 播放影片

1. 调用 `GET /library/movies/{movieId}/playback`。
2. 如果返回 `mode=direct`，将 `url` 传给播放器。
3. 如果返回 `mode=hls`，将 `url` 传给 HLS 播放器。
4. 播放中周期性调用 `PUT /playback/progress/{movieId}`，建议 5 到 15 秒一次或在 pause / background 时保存。
5. 为统计热力图调用 `POST /playback/watch-time/daily`，单次 `watchedSec` 必须 `0 < watchedSec <= 300`。
6. 播放到达业务意义上的“已看”阈值时调用 `POST /library/played-movies/{movieId}`。

示例：

```bash
curl http://127.0.0.1:8080/api/library/movies/MOVIE_ID/playback
```

### 3.4 导入影片

普通导入适合较小文件：

1. `GET /settings` 获取 `defaultImportLibraryPathId`。
2. 如果未配置，通过 `PATCH /settings` 设置默认导入库路径。
3. `POST /import/movies` 上传 `multipart/form-data`。
4. 收到 `TaskDTO` 后轮询任务。

大文件导入推荐分片：

1. `POST /import/movies/uploads` 创建上传会话。
2. 按返回 `chunkSize` 切分文件。
3. 每片调用 `PUT /import/movies/uploads/{uploadId}/files/{fileId}/chunks/{chunkIndex}`。
4. 全部完成后 `POST /import/movies/uploads/{uploadId}/commit`。
5. 用户取消时 `DELETE /import/movies/uploads/{uploadId}`。

### 3.5 扫描与元数据刷新

库扫描：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"D:\\\\Library\"]}" \
  http://127.0.0.1:8080/api/scans
```

单片元数据刷新：

```bash
curl -X POST http://127.0.0.1:8080/api/library/movies/MOVIE_ID/scrape
```

按库路径批量刷新：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"D:\\\\Library\"]}" \
  http://127.0.0.1:8080/api/library/metadata-scrape
```

### 3.6 精选帧

当前精选帧流程：

1. 播放器截帧后调用 `POST /curated-frames` 保存图片和元数据。
2. 列表页调用 `GET /curated-frames`。
3. 缩略图调用 `GET /curated-frames/{id}/thumbnail`。
4. 原图调用 `GET /curated-frames/{id}/image`。
5. 标签编辑调用 `PATCH /curated-frames/{id}/tags`。
6. 导出调用 `POST /curated-frames/export`，按响应 `Content-Type` 保存文件。

## 4. Endpoint Reference

除 2.3 中列出的公开端点外，本章所有端点都受 PIN App Lock 保护。

### 4.1 Health / Runtime

#### `GET /api/health`

用途：检查后端进程、版本、通道、数据库路径。

认证：公开。

成功：`200 HealthDTO`

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | `curated-dev` 或 `curated` |
| `version` | string | 构建戳、git 标识或 `unknown` |
| `channel` | string | `dev` 或 `release` |
| `installerVersion` | string | 安装包版本；开发态常为 `0.0.0` |
| `transport` | string | 当前为 `http` |
| `databasePath` | string | SQLite 数据库路径 |

#### `GET /api/dev/performance`

用途：开发态性能监控摘要。

成功：`200 DevPerformanceSummaryDTO`

```json
{
  "supported": true,
  "sampledAt": "2026-06-07T12:00:00Z",
  "systemCpuPercent": 12.5,
  "backendCpuPercent": 1.2
}
```

如果运行时没有配置 provider，会返回 `{ "supported": false }`。

### 4.2 Auth / PIN App Lock

#### `GET /api/auth/status`

用途：读取 PIN App Lock 状态和当前请求是否已解锁。

认证：公开。

成功：`200 AuthStatusDTO`

```json
{
  "pinEnabled": true,
  "unlocked": false,
  "setupRequired": false,
  "pinLength": 4,
  "trustedForever": false,
  "sessionTtlMinutes": 60,
  "lanRequiresPin": true,
  "lockOnRestart": true
}
```

#### `POST /api/auth/setup-pin`

用途：设置初始 PIN，或在已解锁状态下重设 PIN，并创建当前客户端会话。

认证：公开；如果已经启用 PIN，则请求本身必须已解锁。

Body：

```json
{
  "pin": "1234",
  "confirmPin": "1234",
  "sessionTtlMinutes": 60,
  "lanRequiresPin": true,
  "lockOnRestart": true,
  "trustedForever": false
}
```

约束：

- `pin` 必须是 4 到 8 位数字。
- `confirmPin` 必须一致。
- 成功时设置 `curated_auth` cookie。

成功：`200 AuthStatusDTO`

常见错误：

- `400 COMMON_BAD_REQUEST`：PIN 格式不合法或确认不一致。
- `423 AUTH_LOCKED`：已经设置 PIN 且当前请求未解锁。

#### `POST /api/auth/unlock`

用途：校验 PIN 并创建解锁会话。

认证：公开。

Body：

```json
{
  "pin": "1234",
  "trustedForever": true
}
```

成功：`200 AuthStatusDTO`，并设置 `curated_auth` cookie。

错误：

- `401 AUTH_INVALID_PIN`

#### `POST /api/auth/change-pin`

用途：已解锁状态下修改 PIN。

Body：

```json
{
  "currentPin": "1234",
  "newPin": "5678",
  "confirmPin": "5678"
}
```

成功：`200 AuthStatusDTO`

错误：

- `401 AUTH_INVALID_PIN`：当前 PIN 错误。
- `400 COMMON_BAD_REQUEST`：新 PIN 格式不合法或确认不一致。

#### `POST /api/auth/lock`

用途：撤销当前会话并清除 cookie。

认证：公开。

成功：`200 AuthStatusDTO`

说明：会把当前请求携带的 `curated_auth` 会话从服务端撤销，包括 trusted-forever 会话。

#### `PATCH /api/auth/settings`

用途：更新非秘密安全设置。

Body：

```json
{
  "pinEnabled": true,
  "sessionTtlMinutes": 60,
  "lanRequiresPin": true,
  "lockOnRestart": true
}
```

所有字段可选；只发送要修改的字段。

成功：`200 AuthStatusDTO`

### 4.3 Connected Clients

#### `GET /api/connected-clients`

用途：列出当前后端进程生命周期内访问过 API 的客户端。

成功：`200 ConnectedClientsDTO`

```json
{
  "clients": [
    {
      "key": "client-key",
      "ip": "192.168.1.50",
      "port": 53122,
      "hostname": "phone.local",
      "userAgent": "CuratedAndroid/0.1",
      "browser": "Curated Android",
      "os": "Android",
      "osVersion": "15",
      "deviceType": "mobile",
      "accessKind": "remote",
      "isLocalMachine": false,
      "firstSeen": "2026-06-07T12:00:00.000000000Z",
      "lastSeen": "2026-06-07T12:01:00.000000000Z",
      "requestCount": 12
    }
  ],
  "total": 1,
  "localCount": 0,
  "remoteCount": 1,
  "sampledAt": "2026-06-07T12:01:00Z"
}
```

说明：

- 数据只保存在内存中，重启后端会清空。
- 当前最多保留 50 个最近客户端。
- 不采集 MAC 地址。

### 4.4 App Update

这些接口用于桌面打包应用的更新检查。Android 或其他衍生客户端通常只需要忽略或用于展示服务端桌面版本状态。

#### `GET /api/app-update/status`

用途：读取缓存的更新状态。

成功：`200 AppUpdateStatusDTO`

#### `POST /api/app-update/check`

用途：强制向 GitHub Releases 检查最新版本。

成功：`200 AppUpdateStatusDTO`

#### `POST /api/app-update/download`

用途：下载并校验最新 Windows 安装包。

成功：`200 AppUpdateStatusDTO`

错误：

- `409 APP_UPDATE_DOWNLOAD_FAILED`

#### `POST /api/app-update/install`

用途：启动已下载并验证的安装包。

Body：

```json
{
  "mode": "interactive"
}
```

`mode` 可选：`interactive`、`silent`、`verysilent`。

成功：`200 AppUpdateStatusDTO`

错误：

- `400 COMMON_BAD_REQUEST`：body 不合法。
- `409 APP_UPDATE_INSTALL_FAILED`

#### `DELETE /api/app-update/downloaded-installer`

用途：删除已下载安装包并清理状态。

成功：`200 AppUpdateStatusDTO`

`AppUpdateStatusDTO` 关键字段：

| 字段 | 说明 |
| --- | --- |
| `supported` | 当前运行时是否支持更新 |
| `status` | `unsupported`、`up-to-date`、`update-available`、`error` |
| `installedVersion` / `latestVersion` | 本地和远端版本 |
| `hasUpdate` | 是否存在更新 |
| `installerDownloadUrl` / `installerSha256` | 安装包下载和校验信息 |
| `artifactStatus` | `downloading`、`downloaded`、`verified`、`failed`、`installing`、`install-launched` |
| `downloadProgress` | 下载进度百分比 |
| `installReady` | 是否可安装 |
| `releaseNotesSnippet` | GitHub Release 文本摘要 |

### 4.5 Homepage Recommendations

#### `GET /api/homepage/recommendations`

用途：获取 UTC 当日首页推荐快照。

成功：`200 HomepageDailyRecommendationsDTO`

```json
{
  "dateUtc": "2026-06-07",
  "generatedAt": "2026-06-07T00:00:00Z",
  "generationVersion": "v1",
  "heroMovieIds": ["movie-a", "movie-b"],
  "recommendationMovieIds": ["movie-c", "movie-d"]
}
```

说明：

- 后端按 UTC 日期生成并持久化。
- 同一天重复请求会复用快照，除非算法版本变化或手动刷新。
- 返回的是 ID 列表，客户端需再调用电影详情或利用已有列表缓存渲染。

#### `POST /api/homepage/recommendations/refresh`

用途：强制刷新 UTC 当日推荐。

Body 可选：

```json
{
  "preserveHeroMovieIds": ["movie-a", "movie-b"],
  "excludeRecommendationMovieIds": ["movie-c", "movie-d"]
}
```

成功：`200 HomepageDailyRecommendationsDTO`

### 4.6 Movies

#### `GET /api/library/movies`

用途：分页列出影片。

Query：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | string | 可用值：空 / `favorites` / `trash`。空表示普通库；`favorites` 只返回收藏；`trash` 返回回收站 |
| `q` | string | 子串搜索标题、番号、片商、简介，不区分大小写 |
| `actor` | string | 精确匹配演员名 |
| `studio` | string | 精确匹配有效片商名 |
| `limit` | number | 默认 50 |
| `offset` | number | 默认 0 |

成功：`200 MoviesPageDTO`

```json
{
  "items": [
    {
      "id": "movie-1",
      "title": "Example Title",
      "code": "ABC-001",
      "studio": "Studio",
      "actors": ["Actor A"],
      "tags": ["metadata"],
      "userTags": ["favorite"],
      "runtimeMinutes": 120,
      "rating": 4.5,
      "isFavorite": true,
      "addedAt": "2026-06-07T12:00:00Z",
      "location": "D:\\Library\\ABC-001.mp4",
      "resolution": "1080p",
      "year": 2026,
      "releaseDate": "2026-01-01",
      "coverUrl": "/api/library/movies/movie-1/asset/cover?v=...",
      "thumbUrl": "/api/library/movies/movie-1/asset/thumb?v=..."
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

说明：

- 普通列表默认排除回收站；`mode=trash` 只返回回收站。
- 普通列表按 `addedAt DESC, id ASC`；回收站按 `trashedAt DESC, id ASC`。
- `rating` 是有效评分：用户评分优先，否则使用元数据评分。
- `tags` 是元数据 / NFO 标签；`userTags` 是本地用户标签。
- `coverUrl`、`thumbUrl`、`previewImages` 可能为相对 API URL。

#### `GET /api/library/movies/{movieId}`

用途：获取影片详情。

成功：`200 MovieDetailDTO`

`MovieDetailDTO` 在列表字段基础上增加：

| 字段 | 说明 |
| --- | --- |
| `summary` | 简介 |
| `previewImages` | 预览图 URL 数组 |
| `previewVideoUrl` | 预览视频 URL |
| `metadataRating` | 元数据评分 |
| `userRating` | 用户评分；无覆盖时省略或为 null |
| `actorAvatarUrls` | 演员名到头像 URL 的映射 |

错误：

- `404 COMMON_NOT_FOUND`

#### `PATCH /api/library/movies/{movieId}`

用途：更新影片本地用户态和展示字段覆盖。

Body，所有字段可选，但至少要有一个字段：

```json
{
  "isFavorite": true,
  "rating": 4.25,
  "userTags": ["tag-a", "tag-b"],
  "metadataTags": ["nfo-a"],
  "userTitle": "自定义标题",
  "userStudio": "自定义片商",
  "userSummary": "自定义简介",
  "userReleaseDate": "2026-01-01",
  "userRuntimeMinutes": 118
}
```

清除覆盖：

```json
{
  "rating": null,
  "userTitle": null,
  "userStudio": "",
  "userSummary": null,
  "userReleaseDate": null,
  "userRuntimeMinutes": null
}
```

约束：

- `rating` 范围 `0..5`；`null` 表示清除用户评分。
- `userTags` 和 `metadataTags` 出现时是整表替换；空数组表示清空。
- 用户标签最多 64 个，每个最多 64 个 Unicode 字符，后端会 trim 和去重。
- `userReleaseDate` 必须是 `YYYY-MM-DD`。
- `userRuntimeMinutes` 必须是 `0..99999` 的整数。
- `userSummary` 最多约 120000 字符。
- 回收站影片不能 patch，返回 `409 COMMON_CONFLICT`。

成功：`200 MovieDetailDTO`

#### `DELETE /api/library/movies/{movieId}`

用途：把影片移入回收站。

成功：`204 No Content`

错误：

- `404 COMMON_NOT_FOUND`

#### `DELETE /api/library/movies/{movieId}?permanent=true`

用途：永久删除影片数据库记录和相关磁盘文件。

前置条件：影片必须已经在回收站。

成功：`204 No Content`

错误：

- `400 COMMON_BAD_REQUEST`：影片不在回收站。
- `404 COMMON_NOT_FOUND`

#### `POST /api/library/movies/{movieId}/restore`

用途：从回收站恢复影片。

成功：`204 No Content`

错误：

- `400 COMMON_BAD_REQUEST`：影片不在回收站。
- `404 COMMON_NOT_FOUND`

#### `POST /api/library/movies/{movieId}/reveal`

用途：在服务端机器文件管理器中定位影片文件。

成功：`204 No Content`

说明：这是桌面 / 本机能力。Android 或远程客户端调用只会让服务端电脑打开文件管理器。

#### `GET /api/library/movies/{movieId}/comment`

用途：读取影片备注。

成功：`200 MovieCommentDTO`

```json
{
  "body": "备注正文",
  "updatedAt": "2026-06-07T12:00:00Z"
}
```

无备注时返回：

```json
{
  "body": "",
  "updatedAt": ""
}
```

#### `PUT /api/library/movies/{movieId}/comment`

用途：新增或替换影片备注。

Body：

```json
{
  "body": "备注正文"
}
```

约束：

- 后端会 trim。
- 最多 10000 个 Unicode 字符。
- 回收站影片不能写备注，返回 `409 COMMON_CONFLICT`。

成功：`200 MovieCommentDTO`

#### `GET /api/library/movies/{movieId}/stream`

用途：直放主视频文件。

成功：`200 OK` 或 `206 Partial Content`

说明：

- 支持 `GET` 和 `HEAD`。
- 支持 Range，由 `http.ServeContent` 处理。
- 客户端通常不应直接拼接该 URL，而是先调用 `/playback` 获取 descriptor。

#### `GET /api/library/movies/{movieId}/asset/{kind}`

用途：获取影片封面或缩略图。

Path：

| 参数 | 可用值 |
| --- | --- |
| `kind` | `cover`、`thumb` |

成功：图片 bytes。

说明：

- 支持 `GET` 和 `HEAD`。
- `Cache-Control: private, max-age=604800, immutable`

#### `GET /api/library/movies/{movieId}/asset/preview/{index}`

用途：获取第 `index` 张预览图。

Path：

| 参数 | 说明 |
| --- | --- |
| `index` | 从 1 开始 |

成功：图片 bytes。

说明：

- 本地缓存存在时使用本地缓存。
- 本地不存在时，后端可能代理远端预览图源。
- 代理远端时 `Cache-Control: private, no-cache`。

#### `POST /api/library/movies/{movieId}/scrape`

用途：触发单片元数据刷新。

成功：`202 TaskDTO`

错误：

- `400 COMMON_BAD_REQUEST`：影片没有番号或没有视频路径。
- `404 COMMON_NOT_FOUND`
- `409 COMMON_CONFLICT`：影片在回收站。

#### `POST /api/library/metadata-scrape`

用途：按配置库路径批量刷新元数据。

Body：

```json
{
  "paths": ["D:\\Library"]
}
```

成功：`202 MetadataRefreshQueuedDTO`

```json
{
  "queued": 10,
  "skipped": 2,
  "invalidPaths": []
}
```

约束：

- `paths` 至少包含一个路径。
- 路径应匹配已配置的库根。

### 4.7 Played Movies

#### `GET /api/library/played-movies`

用途：获取已播放影片 ID 列表。

成功：`200 PlayedMoviesListDTO`

```json
{
  "movieIds": ["movie-1", "movie-2"]
}
```

#### `POST /api/library/played-movies/{movieId}`

用途：记录影片已播放。

成功：`204 No Content`

错误：

- `404 COMMON_NOT_FOUND`

### 4.8 Actors

#### `GET /api/library/actors`

用途：分页列出演员。

Query：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `q` | string | 演员名或演员用户标签子串，不区分大小写 |
| `actorTag` | string | 精确匹配演员用户标签 |
| `sort` | string | `name` 默认；`movieCount` 按参演数量降序 |
| `limit` | number | 默认 50 |
| `offset` | number | 默认 0 |

成功：`200 ActorsListDTO`

```json
{
  "total": 1,
  "actors": [
    {
      "name": "Actor A",
      "avatarUrl": "/api/library/actors/Actor%20A/asset/avatar?v=...",
      "avatarRemoteUrl": "https://...",
      "avatarLocalUrl": "/api/library/actors/Actor%20A/asset/avatar?v=...",
      "hasLocalAvatar": true,
      "movieCount": 12,
      "userTags": ["favorite"]
    }
  ]
}
```

说明：只列出至少有一部 active 影片的演员。

#### `GET /api/library/actors/profile?name={name}`

用途：获取演员资料。

Query：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 演员展示名 |

成功：`200 ActorProfileDTO`

```json
{
  "name": "Actor A",
  "avatarUrl": "/api/library/actors/Actor%20A/asset/avatar?v=...",
  "avatarRemoteUrl": "https://...",
  "avatarLocalUrl": "/api/library/actors/Actor%20A/asset/avatar?v=...",
  "hasLocalAvatar": true,
  "summary": "Profile summary",
  "homepage": "https://...",
  "provider": "metatube",
  "providerActorId": "123",
  "height": 160,
  "birthday": "2000-01-01",
  "profileUpdatedAt": "2026-06-07T12:00:00Z",
  "userTags": ["favorite"],
  "externalLinks": ["https://example.com"]
}
```

#### `GET /api/library/actors/{name}/asset/avatar`

用途：获取本地缓存头像。

成功：图片 bytes。

说明：

- 支持 `GET` 和 `HEAD`。
- `Cache-Control: private, max-age=604800, immutable`

#### `POST /api/library/actors/scrape?name={name}`

用途：触发演员资料刮削。

成功：`202 TaskDTO`

错误：

- `400 COMMON_BAD_REQUEST`：缺少 `name`。
- `404 COMMON_NOT_FOUND`

#### `PATCH /api/library/actors/tags?name={name}`

用途：替换演员用户标签。

Body：

```json
{
  "userTags": ["tag-a", "tag-b"]
}
```

成功：`200 ActorListItemDTO`

约束：同用户标签规则，最多 64 个，每个最多 64 字符；后端 trim、去重。

#### `PATCH /api/library/actors/external-links?name={name}`

用途：替换演员外部链接列表。

Body：

```json
{
  "externalLinks": ["https://example.com/profile"]
}
```

成功：`200 ActorProfileDTO`

约束：

- 最多 16 个链接。
- 每个链接最多 2048 字符。
- 必须是合法 `http` 或 `https` URL。
- 后端 trim、去重。

### 4.9 Playback

#### `GET /api/library/movies/{movieId}/playback`

用途：获取播放描述，客户端应以此作为播放入口。

成功：`200 PlaybackDescriptorDTO`

```json
{
  "movieId": "movie-1",
  "mode": "direct",
  "url": "/api/library/movies/movie-1/stream",
  "mimeType": "video/mp4",
  "fileName": "ABC-001.mp4",
  "durationSec": 7200,
  "resumePositionSec": 120.5,
  "canDirectPlay": true,
  "audioTracks": [],
  "subtitleTracks": []
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `mode` | `direct`、`hls`、`native` |
| `sessionId` | HLS / 推流会话 ID |
| `sessionKind` | 会话类型诊断字段 |
| `url` | 播放 URL，可能是相对路径 |
| `mimeType` | 媒体类型 |
| `transcodeProfile` | 转码档位 |
| `startPositionSec` | 请求创建会话时的起播点 |
| `resumePositionSec` | 已保存续播点 |
| `canDirectPlay` | 是否支持直放 |
| `reasonCode` / `reasonMessage` | 模式选择诊断 |
| `audioTracks` / `subtitleTracks` | 音轨 / 字幕轨信息 |

#### `POST /api/library/movies/{movieId}/playback-session`

用途：显式创建播放会话，例如 HLS 推流。

Body：

```json
{
  "mode": "hls",
  "startPositionSec": 120.5
}
```

`mode` 省略时默认为 `direct`。

成功：`201 PlaybackDescriptorDTO`

错误：

- `400 COMMON_BAD_REQUEST`：请求模式或运行时前置条件不满足。
- `404 COMMON_NOT_FOUND`

#### `POST /api/library/movies/{movieId}/native-play`

用途：让服务端机器启动外部本地播放器。

Body 可选：

```json
{
  "startPositionSec": 120.5
}
```

成功：`200 NativePlaybackLaunchDTO`

说明：远程 / Android 客户端调用时，播放器会在服务端电脑上启动，不会在手机上播放。

#### `GET /api/playback/sessions/recent`

用途：列出活跃和最近归档的播放会话。

Query：

| 参数 | 说明 |
| --- | --- |
| `limit` | 默认 20 |

成功：`200 PlaybackSessionListDTO`

#### `GET /api/playback/sessions/{sessionId}`

用途：读取播放会话状态。

成功：`200 PlaybackSessionStatusDTO`

```json
{
  "sessionId": "session-1",
  "movieId": "movie-1",
  "sessionKind": "hls",
  "transcodeProfile": "default",
  "startPositionSec": 120.5,
  "startedAt": "2026-06-07T12:00:00Z",
  "lastAccessedAt": "2026-06-07T12:01:00Z",
  "expiresAt": "2026-06-07T13:00:00Z",
  "state": "running"
}
```

#### `GET /api/playback/sessions/{sessionId}/hls/{file}`

用途：读取 HLS playlist 或 segment。

成功：

- `.m3u8`：`application/vnd.apple.mpegurl`
- `.ts`：`video/mp2t`
- 其他：`http.ServeFile` 自动推断

说明：

- 支持 `GET` 和 `HEAD`。
- 设置 `Cache-Control: no-store, no-cache, must-revalidate`。

#### `DELETE /api/playback/sessions/{sessionId}`

用途：结束 / 删除播放会话。

成功：`204 No Content`

#### `GET /api/playback/progress`

用途：列出已保存播放进度。

成功：`200 PlaybackProgressListDTO`

```json
{
  "items": [
    {
      "movieId": "movie-1",
      "positionSec": 120.5,
      "durationSec": 7200,
      "updatedAt": "2026-06-07T12:00:00Z"
    }
  ]
}
```

#### `PUT /api/playback/progress/{movieId}`

用途：保存单片续播进度。

Body：

```json
{
  "positionSec": 120.5,
  "durationSec": 7200
}
```

成功：`204 No Content`

错误：

- `404 COMMON_NOT_FOUND`

#### `DELETE /api/playback/progress/{movieId}`

用途：清除单片续播进度。

成功：`204 No Content`

#### `GET /api/playback/watch-time/daily`

用途：读取每日观看时长统计。

Query：

| 参数 | 说明 |
| --- | --- |
| `days` | 默认 91，最大 91 |

成功：`200 PlaybackWatchTimeDailyListDTO`

```json
{
  "items": [
    {
      "dayKey": "2026-06-07",
      "watchedSec": 1800
    }
  ],
  "totalWatchedSec": 1800,
  "activeDays": 1,
  "maxDayWatchedSec": 1800,
  "longestStreakDays": 1
}
```

#### `POST /api/playback/watch-time/daily`

用途：追加一段观看时长。

Body：

```json
{
  "movieId": "movie-1",
  "dayKey": "2026-06-07",
  "watchedSec": 30
}
```

约束：

- `dayKey` 必须是合法 `YYYY-MM-DD`。
- `watchedSec` 必须 `> 0` 且 `<= 300`。
- 同一天同影片会累加。

成功：`204 No Content`

### 4.10 Settings

#### `GET /api/settings`

用途：读取当前设置。

成功：`200 SettingsDTO`

关键字段：

| 字段 | 说明 |
| --- | --- |
| `libraryPaths` | 已配置库根 |
| `defaultImportLibraryPathId` | 默认导入目标库根 ID |
| `player` | 播放器设置 |
| `organizeLibrary` | 扫描后是否整理目录 |
| `autoLibraryWatch` | 是否启用目录监听扫描 |
| `autoActorProfileScrape` | 影片刮削后是否自动补演员资料 |
| `autoDownloadUpdates` | 启动更新检查后是否自动下载 |
| `launchAtLogin` | 桌面端是否登录自启 |
| `launchAtLoginSupported` | 当前运行时是否支持登录自启 |
| `curatedFrameExportFormat` | `jpg`、`webp`、`png` |
| `metadataMovieProvider` | 单一影片元数据 provider |
| `metadataMovieProviders` | 当前可用 provider 列表 |
| `metadataMovieProviderChain` | 链式 provider 顺序 |
| `metadataMovieScrapeMode` | `auto`、`specified`、`chain` |
| `metadataMovieStrategy` | `auto-global`、`auto-cn-friendly`、`custom-chain`、`specified` |
| `proxy` | 出站代理设置 |
| `backendLog` | 后端日志设置 |

#### `PATCH /api/settings`

用途：部分更新设置。

Body 示例：

```json
{
  "defaultImportLibraryPathId": "library-path-id",
  "curatedFrameExportFormat": "jpg",
  "autoLibraryWatch": true,
  "player": {
    "hardwareDecode": true,
    "hardwareEncoder": "auto",
    "nativePlayerEnabled": false,
    "streamPushEnabled": true,
    "forceStreamPush": false,
    "ffmpegCommand": "ffmpeg",
    "preferNativePlayer": false,
    "seekForwardStepSec": 10,
    "seekBackwardStepSec": 10
  },
  "metadataMovieScrapeMode": "chain",
  "metadataMovieProviderChain": ["provider-a", "provider-b"],
  "proxy": {
    "enabled": true,
    "url": "http://127.0.0.1:7890",
    "username": "",
    "password": ""
  },
  "backendLog": {
    "logDir": "D:\\CuratedLogs",
    "logFilePrefix": "curated",
    "logMaxAgeDays": 14,
    "logLevel": "info"
  }
}
```

成功：`200 SettingsDTO`

约束：

- 至少发送一个支持字段，否则 `400 COMMON_BAD_REQUEST`。
- `curatedFrameExportFormat` 必须是 `jpg`、`webp`、`png`。
- `defaultImportLibraryPathId` 非空时必须存在。
- `metadataMovieProvider` 和 `metadataMovieProviderChain` 中的 provider 必须在 `metadataMovieProviders` 中。
- `metadataMovieScrapeMode` 必须是 `auto`、`specified`、`chain`。
- `metadataMovieStrategy` 必须是 `auto-global`、`auto-cn-friendly`、`custom-chain`、`specified`。
- `proxy.enabled=true` 时 `proxy.url` 不能为空。
- 后端日志 sink 的部分变更需要重启后端才完全生效。

### 4.11 Library Paths / Storage

#### `POST /api/library/paths`

用途：添加库根路径，并尽量启动首次扫描。

Body：

```json
{
  "path": "D:\\Library",
  "title": "主库"
}
```

成功：`201 AddLibraryPathResponse`

```json
{
  "id": "library-path-id",
  "path": "D:\\Library",
  "title": "主库",
  "firstLibraryScanPending": true,
  "scanTask": {
    "taskId": "task-1",
    "type": "scan",
    "status": "running",
    "createdAt": "2026-06-07T12:00:00Z",
    "progress": 0
  }
}
```

错误：

- `400 COMMON_BAD_REQUEST`：路径为空或不是绝对路径。
- `409 COMMON_CONFLICT`：库路径重复。

#### `PATCH /api/library/paths/{id}`

用途：更新库路径展示标题。

Body：

```json
{
  "title": "新标题"
}
```

成功：`200 LibraryPathDTO`

#### `DELETE /api/library/paths/{id}`

用途：删除库根配置，并清理不再属于任何库根的影片记录。

成功：`204 No Content`

说明：不会删除磁盘上的库目录本身。

#### `POST /api/library/paths/{id}/reveal`

用途：在服务端机器文件管理器中打开库目录。

成功：`204 No Content`

#### `GET /api/library/paths/storage-status`

用途：读取库根存储状态快照。

成功：`200 LibraryPathStorageStatusListDTO`

```json
{
  "items": [
    {
      "libraryPathId": "library-path-id",
      "path": "D:\\Library",
      "title": "主库",
      "status": "online",
      "message": "storage is online",
      "checkedAt": "2026-06-07T12:00:00Z",
      "rootPath": "D:\\",
      "driveType": "fixed",
      "volumeLabel": "Data",
      "fileSystem": "NTFS",
      "identityConfidence": "high",
      "expectedVolumeId": "vol-a",
      "currentVolumeId": "vol-a",
      "canRescan": true,
      "canImport": true
    }
  ]
}
```

状态值：

| 值 | 含义 |
| --- | --- |
| `online` | 目录可达且卷身份匹配 |
| `offline` | 存储根不可用 |
| `volume_mismatch` | 路径解析到不同卷 |
| `path_missing` | 存储存在但库目录缺失 |
| `permission_denied` | 权限不足 |
| `unknown` | 无法分类 |

#### `POST /api/library/paths/storage-status/check`

用途：执行一次新的存储状态检测。

Body 可选：

```json
{
  "libraryPathIds": ["library-path-id"]
}
```

省略或空数组表示检测全部。

成功：`200 LibraryPathStorageStatusListDTO`

#### `POST /api/library/paths/{id}/storage-binding/rebind`

用途：把库根绑定到当前检测到的卷身份，用于恢复 `volume_mismatch`。

成功：`200 LibraryPathStorageStatusDTO`

说明：只有当前路径被识别为 `online` 时才会持久化新绑定。

### 4.12 Movie Imports

#### `POST /api/import/movies`

用途：普通 multipart 导入影片文件。

Content-Type：`multipart/form-data`

Form fields：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `files` | file，重复 | 影片文件 |
| `relativePath` | string，重复 | 可在每个文件前传入，用于保留目录相对路径 |
| `totalBytes` | string / number | 可选，总字节数，用于进度 |

成功：`202 TaskDTO`

约束与行为：

- 必须先配置 `defaultImportLibraryPathId`。
- 只接受视频扩展名：`.mp4`, `.m4v`, `.mkv`, `.avi`, `.mov`, `.wmv`, `.webm`, `.ts`, `.m2ts`, `.flv`, `.mpeg`, `.mpg`, `.ogv`, `.rmvb`, `.iso`。
- 后端复制文件到默认库根，不移动或删除客户端源文件。
- 目标文件已存在则该文件失败，不覆盖。
- 至少成功复制一个文件时会尝试启动受限扫描。
- 成功或部分失败都可能返回 `202 TaskDTO`，客户端要看 `status` 和 `metadata.errorItems`。

导入任务 `metadata` 常见字段：

| 字段 | 说明 |
| --- | --- |
| `targetLibraryPathId` | 目标库根 ID |
| `targetPath` | 目标库根路径 |
| `stage` | `copying`、`completed`、`partial_failed`、`failed` |
| `totalFiles` / `completedFiles` / `failedFiles` | 文件计数 |
| `copiedBytes` / `totalBytes` | 字节进度 |
| `currentFileName` | 当前文件名 |
| `errorItems` | 失败文件数组，含 `fileName`、`code`、`message` |
| `scanTaskId` | 后续扫描任务 ID |
| `scanError` | 扫描启动错误 |

#### `POST /api/import/movies/uploads`

用途：创建可续传 / 分片导入会话。

Body：

```json
{
  "files": [
    {
      "relativePath": "Folder/ABC-001.mp4",
      "size": 1234567890,
      "lastModified": 1710000000000
    }
  ]
}
```

成功：`201 MovieImportUploadDTO`

```json
{
  "uploadId": "upload_abcdef",
  "targetPath": "D:\\Library",
  "chunkSize": 33554432,
  "bytesReceived": 0,
  "totalBytes": 1234567890,
  "state": "uploading",
  "files": [
    {
      "fileId": "file_abcdef",
      "relativePath": "Folder\\ABC-001.mp4",
      "size": 1234567890,
      "bytesReceived": 0,
      "complete": false
    }
  ],
  "task": {
    "taskId": "task-1",
    "type": "import.movies",
    "status": "running",
    "createdAt": "2026-06-07T12:00:00Z",
    "progress": 0
  }
}
```

说明：

- 默认 chunk size：32 MiB。
- 上传会话存在后端内存中，后端进程重启后不可恢复。
- staging 目录：`<target-library-root>/.curated-import/<uploadId>/`。

#### `GET /api/import/movies/uploads/{uploadId}`

用途：读取上传会话状态。

成功：`200 MovieImportUploadDTO`

#### `PUT /api/import/movies/uploads/{uploadId}/files/{fileId}/chunks/{chunkIndex}`

用途：上传一个文件分片。

Content-Type：`application/octet-stream`

Headers：

| Header | 必填 | 说明 |
| --- | --- | --- |
| `X-Curated-Offset` | 是 | 本分片写入文件的起始字节 offset |
| `X-Curated-Chunk-Size` | 否 | 本分片字节数；如果提供，body 实际大小必须一致 |

成功：`200 MovieImportUploadDTO`

行为：

- `chunkIndex` 必须是非负整数。
- 重复上传同一 `chunkIndex` 且 offset/size 一致时幂等返回当前状态。
- 重复上传同一 `chunkIndex` 但范围不同，返回 `409 COMMON_CONFLICT`。
- offset 越界或分片超过文件大小，返回 `400 COMMON_BAD_REQUEST`。

#### `POST /api/import/movies/uploads/{uploadId}/commit`

用途：验证所有文件完整，提交 staging 文件到库根，并启动扫描。

成功：`202 TaskDTO`

错误：

- `400 COMMON_BAD_REQUEST`：上传不完整。
- `409 COMMON_CONFLICT`：会话状态不允许提交或目标文件已存在。

#### `DELETE /api/import/movies/uploads/{uploadId}`

用途：取消分片上传并删除 staging 目录。

成功：`204 No Content`

### 4.13 Scans / Tasks

#### `POST /api/scans`

用途：启动库扫描。

Body 可选：

```json
{
  "paths": ["D:\\Library"]
}
```

说明：

- `paths` 省略或空数组通常表示扫描全部配置库根。
- 如果已有扫描在运行，返回 `409 COMMON_CONFLICT`。

成功：`202 TaskDTO`

#### `GET /api/tasks/recent`

用途：列出最近结束的任务。

Query：

| 参数 | 说明 |
| --- | --- |
| `limit` | 默认 30 |

成功：`200 RecentTasksDTO`

```json
{
  "tasks": [
    {
      "taskId": "task-1",
      "type": "import.movies",
      "status": "completed",
      "createdAt": "2026-06-07T12:00:00Z",
      "startedAt": "2026-06-07T12:00:01Z",
      "finishedAt": "2026-06-07T12:01:00Z",
      "progress": 100,
      "message": "Movie import completed"
    }
  ]
}
```

#### `GET /api/tasks/{taskId}`

用途：读取单个任务状态。

成功：`200 TaskDTO`

错误：

- `404 COMMON_NOT_FOUND`

### 4.14 Curated Frames

#### `GET /api/curated-frames`

用途：分页查询精选帧元数据。

Query：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `q` | string | 搜索标题、番号、movieId、演员 JSON、标签 JSON、捕获时间、秒数 |
| `actor` | string | 精确匹配演员名 |
| `movieId` | string | 精确匹配影片 ID |
| `tag` | string | 精确匹配标签 |
| `limit` | number | 默认 50，最大 200 |
| `offset` | number | 默认 0 |

成功：`200 CuratedFramesListDTO`

```json
{
  "items": [
    {
      "id": "frame-1",
      "movieId": "movie-1",
      "title": "Example",
      "code": "ABC-001",
      "actors": ["Actor A"],
      "positionSec": 42.5,
      "capturedAt": "2026-06-07T12:00:00Z",
      "tags": ["favorite"]
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

#### `GET /api/curated-frames/stats`

用途：精选帧总数。

成功：

```json
{
  "total": 123
}
```

#### `GET /api/curated-frames/tags`

用途：精选帧标签 facet。

成功：`200 CuratedFrameFacetListDTO`

#### `GET /api/curated-frames/actors`

用途：精选帧演员 facet。

成功：`200 CuratedFrameFacetListDTO`

facet 返回：

```json
{
  "items": [
    {
      "name": "Actor A",
      "count": 12
    }
  ]
}
```

#### `POST /api/curated-frames`

用途：保存精选帧。

支持两种请求格式。

JSON Body：

```json
{
  "id": "frame-1",
  "movieId": "movie-1",
  "title": "Example",
  "code": "ABC-001",
  "actors": ["Actor A"],
  "positionSec": 42.5,
  "capturedAt": "2026-06-07T12:00:00Z",
  "tags": ["favorite"],
  "imageBase64": "iVBORw0KGgo..."
}
```

Multipart：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `metadata` | string | 上述 JSON 去掉 `imageBase64` 后序列化 |
| `image` | file | 图片 bytes |

约束：

- `id` 和 `movieId` 必填。
- `image` 不能为空，最大 12 MiB。
- `imageBase64` 是标准 base64，不带 `data:image/...;base64,` 前缀。
- `movieId` 必须存在。
- `id` 重复返回 `409 COMMON_CONFLICT`。

成功：`204 No Content`

#### `GET /api/curated-frames/{id}/image`

用途：获取精选帧原图。

成功：图片 bytes，`Cache-Control: private, max-age=3600`

#### `GET /api/curated-frames/{id}/thumbnail`

用途：获取精选帧缩略图。

成功：图片 bytes，`Cache-Control: private, max-age=3600`

#### `PATCH /api/curated-frames/{id}/tags`

用途：替换精选帧标签。

Body：

```json
{
  "tags": ["tag-a", "tag-b"]
}
```

`tags: null` 等价于空数组。

成功：`204 No Content`

#### `DELETE /api/curated-frames/{id}`

用途：删除精选帧。

成功：`204 No Content`

#### `POST /api/curated-frames/export`

用途：导出 1 到 20 张精选帧。

Body：

```json
{
  "ids": ["frame-1", "frame-2"],
  "actorName": "Actor A",
  "format": "jpg"
}
```

字段：

| 字段 | 说明 |
| --- | --- |
| `ids` | 必填；会 trim、去重；最多 20 |
| `actorName` | 可选；用于导出文件名中的演员上下文，必须属于每一帧演员列表 |
| `format` | `jpg` 默认；也支持 `jpeg` alias、`webp`、`png` |

成功响应：

| 数量 | Content-Type | 说明 |
| --- | --- | --- |
| 1 张 | `image/jpeg` / `image/png` / `image/webp` | 单图下载 |
| 多张 | `application/zip` | ZIP 包 |

响应会设置 `Content-Disposition`，客户端应从 header 解析文件名。

错误：

- `400 COMMON_BAD_REQUEST`：缺少 ids、超过 20、format 不支持。
- `400 CURATED_EXPORT_ACTOR_MISMATCH`：`actorName` 不属于某一帧。
- `404 COMMON_NOT_FOUND`：帧不存在或无图。

导出图片会写入 Curated 元数据，包括：

- `title`
- `code`
- `actors`
- `positionSec`
- `capturedAt`
- `frameId`
- `movieId`
- `tags`
- `schemaVersion`
- `exportedAt`
- `appName`
- `appVersion`

### 4.15 Providers / Proxy

#### `POST /api/providers/ping`

用途：检测单个元数据 provider 健康状态。

Body：

```json
{
  "name": "provider-name"
}
```

成功：`200 ProviderHealthDTO`

```json
{
  "name": "provider-name",
  "status": "ok",
  "latencyMs": 123,
  "message": "",
  "errorCategory": "",
  "cooldownUntil": "",
  "consecutiveFailures": 0,
  "avgLatencyMs": 100
}
```

错误：

- `400 COMMON_BAD_REQUEST`：body 不合法或 name 为空。
- `404 PROVIDER_NOT_FOUND`

`status` 可用值：`ok`、`degraded`、`fail`。

`errorCategory` 常见值：

| 值 | 含义 |
| --- | --- |
| `dns_failure` | DNS 失败 |
| `connect_timeout` | 连接超时 |
| `tls_failure` | TLS 问题 |
| `region_restricted` | 地区限制 |
| `hotlink_denied` | 防盗链 / Referer 问题 |
| `provider_empty_result` | provider 无结果 |
| `provider_invalid_content` | 内容不符合预期 |

#### `POST /api/providers/ping-all`

用途：检测所有 provider。

成功：`200 PingAllProvidersResponse`

```json
{
  "providers": [],
  "total": 0,
  "ok": 0,
  "fail": 0
}
```

#### `POST /api/proxy/ping-javbus`

用途：用草稿代理配置或已保存代理配置请求 `https://www.javbus.com/`。

Body 可选：

```json
{
  "proxy": {
    "enabled": true,
    "url": "http://127.0.0.1:7890",
    "username": "",
    "password": ""
  }
}
```

成功：`200 ProxyJavBusPingResponse`

```json
{
  "ok": true,
  "latencyMs": 300,
  "httpStatus": 200,
  "message": ""
}
```

说明：

- 如果省略 `proxy`，使用当前持久化代理设置。
- 出站请求超时约 5 秒。
- 远端连接失败通常仍返回 `200`，但 body 中 `ok=false`。
- `proxy.enabled=true` 且 URL 为空时返回 `400 COMMON_BAD_REQUEST`。

#### `POST /api/proxy/ping-google`

用途：同上，但目标为 `https://www.google.com/`。

成功：`200 ProxyJavBusPingResponse`

## 5. DTO 速查

本节列出衍生客户端最常用 DTO。完整字段以 `backend/internal/contracts/contracts.go` 和 `src/api/types.ts` 为准。

### 5.1 `AppError`

```ts
interface AppError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}
```

### 5.2 `MovieListItemDTO`

```ts
interface MovieListItemDTO {
  id: string
  title: string
  code: string
  studio: string
  actors: string[]
  tags: string[]
  userTags?: string[]
  runtimeMinutes: number
  rating: number
  isFavorite: boolean
  addedAt: string
  location: string
  resolution: string
  year: number
  releaseDate?: string
  coverUrl?: string
  thumbUrl?: string
  trashedAt?: string
}
```

### 5.3 `MovieDetailDTO`

```ts
interface MovieDetailDTO extends MovieListItemDTO {
  summary: string
  previewImages?: string[]
  previewVideoUrl?: string
  metadataRating: number
  userRating?: number | null
  actorAvatarUrls?: Record<string, string>
}
```

### 5.4 `SettingsDTO`

```ts
interface SettingsDTO {
  libraryPaths: LibraryPathDTO[]
  defaultImportLibraryPathId?: string
  player: PlayerSettingsDTO
  organizeLibrary: boolean
  autoLibraryWatch: boolean
  autoActorProfileScrape: boolean
  autoDownloadUpdates: boolean
  launchAtLogin: boolean
  launchAtLoginSupported: boolean
  curatedFrameExportFormat: "jpg" | "webp" | "png"
  metadataMovieProvider: string
  metadataMovieProviders: string[]
  metadataMovieProviderChain: string[]
  metadataMovieScrapeMode?: "auto" | "specified" | "chain"
  metadataMovieStrategy?: "auto-global" | "auto-cn-friendly" | "custom-chain" | "specified"
  proxy: ProxySettingsDTO
  backendLog: BackendLogSettingsDTO
}
```

### 5.5 `PlaybackDescriptorDTO`

```ts
type PlaybackMode = "direct" | "hls" | "native"

interface PlaybackDescriptorDTO {
  movieId: string
  mode: PlaybackMode
  sessionId?: string
  sessionKind?: string
  url: string
  mimeType?: string
  fileName?: string
  transcodeProfile?: string
  durationSec?: number
  startPositionSec?: number
  resumePositionSec?: number
  canDirectPlay: boolean
  reason?: string
  reasonCode?: string
  reasonMessage?: string
  sourceContainer?: string
  sourceVideoCodec?: string
  sourceAudioCodec?: string
  audioTracks?: { id: string; label: string; default: boolean }[]
  subtitleTracks?: { id: string; label: string; kind?: string; default: boolean }[]
}
```

### 5.6 `TaskDTO`

```ts
interface TaskDTO {
  taskId: string
  type: string
  status: "pending" | "running" | "completed" | "partial_failed" | "failed" | "cancelled"
  createdAt: string
  startedAt?: string
  finishedAt?: string
  progress: number
  message?: string
  errorCode?: string
  errorCategory?: string
  errorMessage?: string
  provider?: string
  metadata?: Record<string, unknown>
}
```

### 5.7 `MovieImportUploadDTO`

```ts
interface MovieImportUploadDTO {
  uploadId: string
  targetPath: string
  chunkSize: number
  bytesReceived: number
  totalBytes: number
  state: "uploading" | "committed" | "aborted" | string
  files: Array<{
    fileId: string
    relativePath: string
    size: number
    bytesReceived: number
    complete: boolean
  }>
  task: TaskDTO
}
```

### 5.8 `CuratedFrameItemDTO`

```ts
interface CuratedFrameItemDTO {
  id: string
  movieId: string
  title: string
  code: string
  actors: string[]
  positionSec: number
  capturedAt: string
  tags: string[]
}
```

### 5.9 `ActorProfileDTO`

```ts
interface ActorProfileDTO {
  name: string
  avatarUrl?: string
  avatarRemoteUrl?: string
  avatarLocalUrl?: string
  hasLocalAvatar?: boolean
  summary?: string
  homepage?: string
  provider?: string
  providerActorId?: string
  height?: number
  birthday?: string
  profileUpdatedAt?: string
  userTags?: string[]
  externalLinks?: string[]
}
```

## 6. 全路由清单

本清单与 `backend/internal/server/server.go` 的 `Routes()` 对齐。

| Method | Path | 响应 |
| --- | --- | --- |
| `GET` | `/api/health` | `HealthDTO` |
| `GET` | `/api/auth/status` | `AuthStatusDTO` |
| `POST` | `/api/auth/setup-pin` | `AuthStatusDTO` |
| `POST` | `/api/auth/unlock` | `AuthStatusDTO` |
| `POST` | `/api/auth/change-pin` | `AuthStatusDTO` |
| `POST` | `/api/auth/lock` | `AuthStatusDTO` |
| `PATCH` | `/api/auth/settings` | `AuthStatusDTO` |
| `GET` | `/api/connected-clients` | `ConnectedClientsDTO` |
| `GET` | `/api/dev/performance` | `DevPerformanceSummaryDTO` |
| `GET` | `/api/app-update/status` | `AppUpdateStatusDTO` |
| `POST` | `/api/app-update/check` | `AppUpdateStatusDTO` |
| `POST` | `/api/app-update/download` | `AppUpdateStatusDTO` |
| `POST` | `/api/app-update/install` | `AppUpdateStatusDTO` |
| `DELETE` | `/api/app-update/downloaded-installer` | `AppUpdateStatusDTO` |
| `GET` | `/api/homepage/recommendations` | `HomepageDailyRecommendationsDTO` |
| `POST` | `/api/homepage/recommendations/refresh` | `HomepageDailyRecommendationsDTO` |
| `GET` | `/api/library/played-movies` | `PlayedMoviesListDTO` |
| `POST` | `/api/library/played-movies/{movieId}` | `204` |
| `GET` | `/api/library/movies` | `MoviesPageDTO` |
| `GET` | `/api/library/actors` | `ActorsListDTO` |
| `GET` | `/api/library/actors/profile` | `ActorProfileDTO` |
| `GET` | `/api/library/actors/{name}/asset/avatar` | image |
| `POST` | `/api/library/actors/scrape` | `TaskDTO` |
| `PATCH` | `/api/library/actors/tags` | `ActorListItemDTO` |
| `PATCH` | `/api/library/actors/external-links` | `ActorProfileDTO` |
| `GET` | `/api/library/movies/{movieId}/asset/preview/{index}` | image |
| `GET` | `/api/library/movies/{movieId}/asset/{kind}` | image |
| `GET` | `/api/library/movies/{movieId}/playback` | `PlaybackDescriptorDTO` |
| `POST` | `/api/library/movies/{movieId}/playback-session` | `PlaybackDescriptorDTO` |
| `POST` | `/api/library/movies/{movieId}/native-play` | `NativePlaybackLaunchDTO` |
| `GET` | `/api/library/movies/{movieId}/stream` | video |
| `GET` | `/api/playback/sessions/recent` | `PlaybackSessionListDTO` |
| `GET` | `/api/playback/sessions/{sessionId}` | `PlaybackSessionStatusDTO` |
| `GET` | `/api/playback/sessions/{sessionId}/hls/{file}` | HLS file |
| `DELETE` | `/api/playback/sessions/{sessionId}` | `204` |
| `POST` | `/api/library/movies/{movieId}/reveal` | `204` |
| `GET` | `/api/library/movies/{movieId}/comment` | `MovieCommentDTO` |
| `PUT` | `/api/library/movies/{movieId}/comment` | `MovieCommentDTO` |
| `GET` | `/api/library/movies/{movieId}` | `MovieDetailDTO` |
| `PATCH` | `/api/library/movies/{movieId}` | `MovieDetailDTO` |
| `POST` | `/api/library/movies/{movieId}/restore` | `204` |
| `POST` | `/api/library/movies/{movieId}/scrape` | `TaskDTO` |
| `POST` | `/api/library/metadata-scrape` | `MetadataRefreshQueuedDTO` |
| `DELETE` | `/api/library/movies/{movieId}` | `204` |
| `GET` | `/api/settings` | `SettingsDTO` |
| `PATCH` | `/api/settings` | `SettingsDTO` |
| `POST` | `/api/import/movies` | `TaskDTO` |
| `POST` | `/api/import/movies/uploads` | `MovieImportUploadDTO` |
| `GET` | `/api/import/movies/uploads/{uploadId}` | `MovieImportUploadDTO` |
| `DELETE` | `/api/import/movies/uploads/{uploadId}` | `204` |
| `PUT` | `/api/import/movies/uploads/{uploadId}/files/{fileId}/chunks/{chunkIndex}` | `MovieImportUploadDTO` |
| `POST` | `/api/import/movies/uploads/{uploadId}/commit` | `TaskDTO` |
| `POST` | `/api/library/paths` | `AddLibraryPathResponse` |
| `GET` | `/api/library/paths/storage-status` | `LibraryPathStorageStatusListDTO` |
| `POST` | `/api/library/paths/storage-status/check` | `LibraryPathStorageStatusListDTO` |
| `POST` | `/api/library/paths/{id}/reveal` | `204` |
| `POST` | `/api/library/paths/{id}/storage-binding/rebind` | `LibraryPathStorageStatusDTO` |
| `PATCH` | `/api/library/paths/{id}` | `LibraryPathDTO` |
| `DELETE` | `/api/library/paths/{id}` | `204` |
| `POST` | `/api/scans` | `TaskDTO` |
| `GET` | `/api/tasks/recent` | `RecentTasksDTO` |
| `GET` | `/api/tasks/{taskId}` | `TaskDTO` |
| `GET` | `/api/playback/progress` | `PlaybackProgressListDTO` |
| `PUT` | `/api/playback/progress/{movieId}` | `204` |
| `DELETE` | `/api/playback/progress/{movieId}` | `204` |
| `GET` | `/api/playback/watch-time/daily` | `PlaybackWatchTimeDailyListDTO` |
| `POST` | `/api/playback/watch-time/daily` | `204` |
| `GET` | `/api/curated-frames` | `CuratedFramesListDTO` |
| `GET` | `/api/curated-frames/stats` | `CuratedFrameStatsDTO` |
| `GET` | `/api/curated-frames/tags` | `CuratedFrameFacetListDTO` |
| `GET` | `/api/curated-frames/actors` | `CuratedFrameFacetListDTO` |
| `POST` | `/api/curated-frames` | `204` |
| `GET` | `/api/curated-frames/{id}/thumbnail` | image |
| `GET` | `/api/curated-frames/{id}/image` | image |
| `PATCH` | `/api/curated-frames/{id}/tags` | `204` |
| `DELETE` | `/api/curated-frames/{id}` | `204` |
| `POST` | `/api/curated-frames/export` | image / zip |
| `POST` | `/api/providers/ping` | `ProviderHealthDTO` |
| `POST` | `/api/providers/ping-all` | `PingAllProvidersResponse` |
| `POST` | `/api/proxy/ping-javbus` | `ProxyJavBusPingResponse` |
| `POST` | `/api/proxy/ping-google` | `ProxyJavBusPingResponse` |

## 7. 维护规则

后续维护或新增 API 时请同步更新：

1. `backend/internal/server/server.go` 或对应 handler 文件。
2. `backend/internal/contracts/contracts.go` 中的 DTO、错误码和注释。
3. `src/api/types.ts` 和 `src/api/endpoints.ts`。
4. 本文件 `API.md`，包括 Endpoint Reference、DTO 速查、全路由清单。
5. 如果新增端点或改变公开行为，还要按仓库规则同步 `.cursor/rules/project-facts.mdc`、`README.md`、`CLAUDE.md` 及相关 reference 文档。

兼容性建议：

- 新字段优先做可选字段，旧客户端可忽略。
- 变更枚举值前先确认前端、Android、桌面壳和脚本是否都已支持。
- 媒体端点不要改成 JSON envelope。
- `204 No Content` 接口不要新增 JSON body，除非同步所有客户端。
- 需要长耗时的操作优先返回 `202 TaskDTO`，避免客户端持有长连接。
- 新增错误场景时优先复用现有错误码；需要稳定区分时再新增错误码。
- 新增 query/body 字段时在 handler、Go DTO、TS types、本文档中同时落地。
