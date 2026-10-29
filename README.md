# pano-to-3d

> **本项目默认使用海外环境（`REALSEE_REGION=global`）**，API 网关和对象存储均指向如视海外服务。切换国内环境只需在 `.env` 中设置 `REALSEE_REGION=cn`，详见[国内版差异](#国内版差异)。

使用如视开放平台 API，将一组全景图自动处理成可访问的在线 VR 空间的 Node.js 演示项目。

整个流程由一条命令驱动，完成从本地全景图 → 打包 → 上传 → 提交任务 → 轮询结果 → 输出 VR 链接的全链路自动化。

---

## 目录

- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [数据格式说明](#数据格式说明)
- [Pipeline 步骤详解](#pipeline-步骤详解)
- [分步调试](#分步调试)
- [配置参数](#配置参数)
- [API 参考](#api-参考)
- [输出文件](#输出文件)
- [国内版差异](#国内版差异)
- [常见问题](#常见问题)

---

## 前置要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | ≥ 18.3（需原生 `fetch`、`--env-file`） |
| npm | ≥ 8 |
| 如视开放平台账号 | 需申请 `APP_KEY` / `APP_SECRET` |

---

## 快速开始

**1. 安装依赖**

```bash
npm install
```

**2. 配置凭据**

```bash
cp .env.example .env
```

编辑 `.env`，填入在如视开放平台申请的凭据：

```dotenv
REALSEE_APP_KEY=your_app_key_here
REALSEE_APP_SECRET=your_app_secret_here
```

**3. 准备全景图**

将全景图（`.jpg`）放入 `data/samples/images/`，并更新 `data/samples/manifest.json`（见[数据格式说明](#数据格式说明)）。

项目已内置 15 张示例全景图，可直接运行。

**4. 一键执行全流程**

```bash
npm start
```

执行完成后，终端会输出 VR 链接：

```
========================================
  VR 链接: https://realsee.ai/link_code
========================================
```

---

## 目录结构

```
pano-to-3d/
├── index.js                  # 全链路 Pipeline 编排入口
├── package.json
├── .env.example              # 环境变量模板
├── .env                      # 本地凭据（不要提交到 Git）
│
├── src/                      # 各 Pipeline 步骤模块
│   ├── config.js             # 全局常量（路径、URL、轮询参数）
│   ├── logger.js             # 日志工具（结构化输出、敏感字段脱敏）
│   ├── state.js              # 步骤间状态持久化（data/output/state.json）
│   ├── validate.js           # Step 1：校验 manifest.json 及图片文件
│   ├── pack.js               # Step 2：将全景图 + manifest 打包成 ZIP
│   ├── auth.js               # Step 3：获取 / 自动续期 access_token
│   ├── upload.js             # Step 4-5：获取上传凭证 & 上传 ZIP 到 S3
│   ├── submit.js             # Step 6：提交处理任务
│   └── poll.js               # Step 7：轮询任务状态直至完成
│
├── data/
│   ├── samples/
│   │   ├── manifest.json     # 全景图清单（见下方格式说明）
│   │   └── images/           # 全景图文件（*.jpg）
│   └── output/               # 运行时生成（Git 忽略）
│       ├── upload.zip        # 打包后的 ZIP 文件
│       ├── state.json        # 中间状态（支持断点续传）
│       └── result.json       # 最终结果（task_code、vr_url 等）
│
└── apis/
    └── pano-to-3d.openapi.json   # OpenAPI 3.1 接口文档（含真实响应示例）
```

---

## 数据格式说明

### manifest.json

`data/samples/manifest.json` 描述本次处理的全景图集合：

```json
{
  "version": "1.0",
  "project_name": "pano-to-3d-demo-{{timestamp}}",
  "floor_map": {
    "0": 1
  },
  "scan_list": [
    { "id": "IMG_20260121_160323_723", "floor": 0 },
    { "id": "IMG_20260121_160328_267", "floor": 0 }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | 固定为 `"1.0"` |
| `project_name` | string | 项目名称，支持 `{{timestamp}}` 占位符（运行时替换为毫秒时间戳，保证唯一性） |
| `floor_map` | object | 楼层编号映射，key 为楼层索引（从 `"0"` 开始），value 为实际楼层号 |
| `scan_list` | array | 全景图列表，每项含 `id`（图片文件名不含后缀）和 `floor`（楼层索引） |

### 图片要求

- 格式：`.jpg`
- 文件名：与 `scan_list[].id` 完全对应
- 存放位置：`data/samples/images/<id>.jpg`
- 建议分辨率：全景等距柱状投影图（Equirectangular），典型尺寸 4096×2048 或更高

---

## Pipeline 步骤详解

```
[Step 0] 读取环境变量（APP_KEY / APP_SECRET）
    │
    ▼
[Step 1] 校验 manifest.json 结构 + 图片文件存在性
    │
    ▼
[Step 2] 打包 ZIP（manifest.json 在根目录，图片在 images/ 子目录）
    │
    ▼
[Step 3] 调用 /auth/access_token 获取访问令牌
    │
    ▼
[Step 4] 调用 /open/v1/pano/file/token 获取 S3 临时上传凭证
    │
    ▼
[Step 5] 通过 @realsee/universal-uploader 将 ZIP 上传到 S3
    │
    ▼
[Step 6] 调用 /open/v1/pano/task/submit 提交处理任务
    │
    ▼
[Step 7] 每 30s 轮询 /open/v1/pano/task/status（最长等待 30 分钟）
    │     access_token 过期时自动续期
    ▼
[Step 8] 写入 data/output/result.json，输出 VR 链接
```

### 断点续传

如果任务已提交但轮询中断，可以直接从轮询步骤续接，无需重新上传：

```bash
npm start -- --task-code=<your_task_code>
```

---

## 分步调试

每个步骤都可以单独运行，便于排查问题：

```bash
# Step 1：校验 manifest.json
npm run validate

# Step 2：打包 ZIP（输出到 data/output/upload.zip）
npm run pack

# Step 3：获取 access_token（写入 data/output/state.json）
npm run auth

# Step 4-5：获取上传凭证并上传 ZIP
npm run upload

# Step 6：提交任务（需要先运行 auth、pack、upload）
npm run submit

# Step 7：轮询任务状态
npm run poll
# 或指定 task_code
npm run poll -- --task-code=<task_code>
```

> **注意**：分步运行时，后续步骤会从 `data/output/state.json` 读取前序步骤的输出（如 `access_token`、`upload_path` 等）。如果跨步骤运行，请确保前置步骤已完成。

---

## 配置参数

配置集中在 `src/config.js`：

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `REGION` | `global` | 由 `REALSEE_REGION` 环境变量决定，可选 `global` \| `cn` |
| `BASE_URL` | 根据 `REGION` 自动选择 | `global` → `realsee.ai`；`cn` → `realsee.cn` |
| `SAMPLES_DIR` | `data/samples` | 全景图输入目录 |
| `OUTPUT_DIR` | `data/output` | 运行时输出目录 |
| `ZIP_PATH` | `data/output/upload.zip` | 打包后的 ZIP 路径 |
| `POLL_INTERVAL_MS` | `30000`（30s） | 轮询间隔 |
| `POLL_MAX_ATTEMPTS` | `60` | 最大轮询次数（最长等待 30min） |

---

## API 参考

完整的 OpenAPI 3.1 规范见 [`apis/pano-to-3d.openapi.json`](./apis/pano-to-3d.openapi.json)，包含真实请求 / 响应示例。

### 接口概览

所有接口基于 `https://app-gateway.realsee.ai`。

#### 通用响应格式

```json
{
  "request_id": "...",
  "trace_id": "...",
  "code": 0,
  "status": "success",
  "data": { ... },
  "cost": 83
}
```

| `code` | 含义 |
|--------|------|
| `0` | 成功 |
| `-1` | 业务失败（见 `status` 字段） |
| `-3` | `access_token` 已过期，需重新获取 |

---

#### POST /auth/access_token

获取 API 访问令牌。

**请求**（`application/x-www-form-urlencoded`）：

| 参数 | 必填 | 说明 |
|------|------|------|
| `app_key` | ✅ | 开放平台 AppKey |
| `app_secret` | ✅ | 开放平台 AppSecret |

**响应 `data`**：

```json
{
  "access_token": "VE9LRU5...",
  "expire_at": 1710732700
}
```

> `expire_at` 为 Unix 时间戳（秒）。代码会在过期前 10 秒自动续期。

---

#### GET /open/v1/pano/file/token

获取 S3 临时上传凭证。需在 `Authorization` 请求头携带 `access_token`。

**响应 `data`** 为 S3 STS 临时凭证，关键字段：

| 字段 | 说明 |
|------|------|
| `bucket` / `region` | S3 存储桶信息 |
| `prefix` | 上传路径前缀，最终对象 key = `prefix + uploadKey` |
| `tmpSecretId` / `tmpSecretKey` / `sessionToken` | STS 临时凭证 |
| `download_host` | **为空**表示私有桶，提交任务时须用 `private_cos_key`；非空则用 `zip_cos_url` |

---

#### POST /open/v1/pano/task/submit

提交全景图处理任务。`zip_cos_url` 与 `private_cos_key` 二选一：

| 场景 | 使用字段 |
|------|----------|
| `download_host` 非空（公开桶） | `zip_cos_url`（上传结果的 `download_url`） |
| `download_host` 为空（私有桶） | `private_cos_key`（上传结果的 `path`，即 `token.prefix + uploadKey`） |

**响应 `data`**：

```json
{
  "project_id": "pano-xxxxxxxxxxxxxxxxxxxx",
  "task_code": "xxxxxxxxxxxxxxxxxxxx"
}
```

---

#### GET /open/v1/pano/task/status

轮询任务状态，传入 `task_code` query 参数。

**响应 `data`**：

```json
{
  "project_id": "pano-xxxxxxxxxxxxxxxxxxxx",
  "status": "processing",
  "vr_url": ""
}
```

| `status` | 说明 |
|----------|------|
| `pending` | 等待处理 |
| `processing` | 处理中 |
| `success` | 完成，`vr_url` 为完整链接 |
| `failed` | 失败 |

---

## 输出文件

运行完成后，`data/output/` 会生成以下文件：

### state.json

步骤间共享的中间状态，用于断点续传：

```json
{
  "access_token": "...",
  "task_code": "xxxxxxxxxxxxxxxxxxxx",
  "project_name": "my-pano-project-1700000000000",
  "upload_path": "vrfile/release/open_task_original/T-XXXXXXXXXX/pano/1700000000/my-pano-project-1700000000000.zip",
  "download_url": "",
  "vr_url": "https://realsee.ai/link_code"
}
```

### result.json

最终结果摘要：

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "project_name": "my-pano-project-1700000000000",
  "task_code": "xxxxxxxxxxxxxxxxxxxx",
  "vr_url": "https://realsee.ai/link_code",
  "upload_path": "vrfile/release/open_task_original/T-XXXXXXXXXX/pano/1700000000/my-pano-project-1700000000000.zip",
  "download_url": ""
}
```

---

## 国内版差异

通过 `.env` 中的 `REALSEE_REGION` 环境变量一键切换，无需修改代码：

```dotenv
# 海外（默认）
REALSEE_REGION=global

# 国内
REALSEE_REGION=cn
```

两个区域的差异由代码自动处理：

| 项目 | `global`（海外，默认） | `cn`（国内） |
|------|----------------------|-------------|
| API 网关 | `https://app-gateway.realsee.ai` | `https://app-gateway.realsee.cn` |
| 对象存储 | AWS S3 | 腾讯云 COS |
| 上传适配器 | `adaptors/aws` | `adaptors/cos-node` |
| 开放平台账号 | 海外平台账号 | 国内平台账号 |

---

## 常见问题

**Q: 运行报错 `缺少 REALSEE_APP_KEY 或 REALSEE_APP_SECRET`？**

确认 `.env` 文件存在且已填写正确的 `APP_KEY` / `APP_SECRET`。Node.js 18.3+ 会通过 `--env-file=.env` 自动加载。

---

**Q: Step 1 报错 `对应图片不存在`？**

检查 `data/samples/images/` 目录下是否有与 `manifest.json` 中 `scan_list[].id` 同名的 `.jpg` 文件。

---

**Q: 上传速度很慢？**

如果 `is_accelerate: "1"`，SDK 已启用 S3 Transfer Acceleration。速度取决于网络条件，一般 15 张全景图（约 100MB）需要 1-3 分钟。

---

**Q: 轮询超时（30 分钟到期）？**

如视后台通常在 5-15 分钟内完成。若超时，可使用已有的 `task_code` 恢复轮询：

```bash
# 从 state.json 读取 task_code
npm run poll

# 或手动指定
npm run poll -- --task-code=<task_code>
```

---

**Q: 提交任务返回 `用户标识不能为空`（business_code: 10001）？**

通常是 `access_token` 无效或权限不足，请确认 `APP_KEY` / `APP_SECRET` 来自有效的如视开放平台应用，且已开通全景图处理权限。

---

**Q: 如何替换为自己的全景图？**

1. 将全景图（`.jpg`）放入 `data/samples/images/`
2. 修改 `data/samples/manifest.json`，更新 `scan_list` 和 `floor_map`
3. 运行 `npm start`

## Current code license

The identified Realsee-authored code is available under [PolyForm Noncommercial License 1.0.0](LICENSE), SPDX `PolyForm-Noncommercial-1.0.0`. The unmodified license governs permitted purposes, modification and distribution. This is source-available licensing, not an OSI-approved open source license. SDKs, third-party components and assets retain their separate terms. Earlier licensed copies retain their applicable rights, irrespective of this license change or Git history consolidation.
