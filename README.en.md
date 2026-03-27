# pano-to-3d

> **This project defaults to the global environment (`REALSEE_REGION=global`).** API gateway and object storage both point to Realsee's global services. To switch to the China mainland environment, set `REALSEE_REGION=cn` in `.env` — see [China vs Global](#china-vs-global).

A Node.js demo that converts a set of panoramic images into an online VR space using the [Realsee Open Platform](https://open.realsee.com) API.

The entire flow runs with a single command: local panoramas → zip → upload → submit task → poll → VR link.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Data Format](#data-format)
- [Pipeline Steps](#pipeline-steps)
- [Step-by-Step Debugging](#step-by-step-debugging)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Output Files](#output-files)
- [China vs Global](#china-vs-global)
- [FAQ](#faq)

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.3 (native `fetch` + `--env-file` required) |
| npm | ≥ 8 |
| Realsee Open Platform account | `APP_KEY` / `APP_SECRET` required |

---

## Quick Start

**1. Install dependencies**

```bash
npm install
```

**2. Configure credentials**

```bash
cp .env.example .env
```

Edit `.env` with credentials from your Realsee Open Platform app:

```dotenv
REALSEE_APP_KEY=your_app_key_here
REALSEE_APP_SECRET=your_app_secret_here
```

**3. Prepare panoramas**

Place panoramic images (`.jpg`) in `data/samples/images/` and update `data/samples/manifest.json` (see [Data Format](#data-format)).

15 sample panoramas are included — you can run the demo right away.

**4. Run the full pipeline**

```bash
npm start
```

When finished, the terminal prints the VR link:

```
========================================
  VR URL: https://realsee.ai/link_code
========================================
```

---

## Project Structure

```
pano-to-3d/
├── index.js                  # Full pipeline orchestrator
├── package.json
├── .env.example              # Environment variable template
├── .env                      # Local credentials (do not commit)
│
├── src/                      # Pipeline step modules
│   ├── config.js             # Global constants (paths, URLs, polling config)
│   ├── logger.js             # Structured logging + sensitive field masking
│   ├── state.js              # Inter-step state persistence (data/output/state.json)
│   ├── validate.js           # Step 1: Validate manifest.json and image files
│   ├── pack.js               # Step 2: Pack panoramas + manifest into ZIP
│   ├── auth.js               # Step 3: Obtain / auto-refresh access_token
│   ├── upload.js             # Step 4-5: Get upload credentials & upload ZIP
│   ├── submit.js             # Step 6: Submit processing task
│   └── poll.js               # Step 7: Poll task status until completion
│
├── data/
│   ├── samples/
│   │   ├── manifest.json     # Panorama manifest (see format below)
│   │   └── images/           # Panorama files (*.jpg)
│   └── output/               # Runtime-generated (git-ignored)
│       ├── upload.zip        # Packed ZIP file
│       ├── state.json        # Intermediate state (enables resume)
│       └── result.json       # Final result (task_code, vr_url, etc.)
│
└── apis/
    └── pano-to-3d.openapi.json   # OpenAPI 3.1 spec with real response examples
```

---

## Data Format

### manifest.json

`data/samples/manifest.json` describes the panorama set to process:

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

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Always `"1.0"` |
| `project_name` | string | Project name. Supports `{{timestamp}}` placeholder — replaced with a millisecond timestamp at runtime to ensure uniqueness |
| `floor_map` | object | Floor index mapping: key = floor index (starting at `"0"`), value = actual floor number |
| `scan_list` | array | List of panoramas. Each entry has `id` (filename without extension) and `floor` (floor index) |

### Image Requirements

- Format: `.jpg`
- Filename: must match `scan_list[].id` exactly
- Location: `data/samples/images/<id>.jpg`
- Recommended: Equirectangular projection, 4096×2048 or higher

---

## Pipeline Steps

```
[Step 0] Load environment variables (APP_KEY / APP_SECRET)
    │
    ▼
[Step 1] Validate manifest.json structure + image file existence
    │
    ▼
[Step 2] Pack ZIP (manifest.json at root, images under images/)
    │
    ▼
[Step 3] Call /auth/access_token → obtain access token
    │
    ▼
[Step 4] Call /open/v1/pano/file/token → get temporary upload credentials
    │
    ▼
[Step 5] Upload ZIP to object storage via @realsee/universal-uploader
    │
    ▼
[Step 6] Call /open/v1/pano/task/submit → submit processing task
    │
    ▼
[Step 7] Poll /open/v1/pano/task/status every 30s (up to 30 min)
    │     access_token is auto-refreshed when near expiry
    ▼
[Step 8] Write data/output/result.json and print VR link
```

### Resuming a Task

If a task was already submitted but polling was interrupted, resume from the poll step — no re-upload needed:

```bash
npm start -- --task-code=<your_task_code>
```

---

## Step-by-Step Debugging

Each step can be run independently:

```bash
# Step 1: Validate manifest.json
npm run validate

# Step 2: Pack ZIP (output: data/output/upload.zip)
npm run pack

# Step 3: Obtain access_token (written to data/output/state.json)
npm run auth

# Step 4-5: Get upload credentials and upload ZIP
npm run upload

# Step 6: Submit task (requires auth, pack, upload to have run first)
npm run submit

# Step 7: Poll task status
npm run poll
# or specify task_code directly
npm run poll -- --task-code=<task_code>
```

> **Note:** When running steps individually, each step reads its prerequisites from `data/output/state.json`. Make sure all prior steps have completed before running a later one.

---

## Configuration

All constants are in `src/config.js`:

| Constant | Default | Description |
|----------|---------|-------------|
| `REGION` | `global` | Controlled by `REALSEE_REGION` env var. Options: `global` \| `cn` |
| `BASE_URL` | Auto-selected by `REGION` | `global` → `realsee.ai`; `cn` → `realsee.cn` |
| `SAMPLES_DIR` | `data/samples` | Input directory for panoramas |
| `OUTPUT_DIR` | `data/output` | Runtime output directory |
| `ZIP_PATH` | `data/output/upload.zip` | Packed ZIP path |
| `POLL_INTERVAL_MS` | `30000` (30s) | Polling interval |
| `POLL_MAX_ATTEMPTS` | `60` | Max polling attempts (30 min total) |

---

## API Reference

The full OpenAPI 3.1 spec is at [`apis/pano-to-3d.openapi.json`](./apis/pano-to-3d.openapi.json), including real request/response examples.

### Base URL

`https://app-gateway.realsee.ai` (global) · `https://app-gateway.realsee.cn` (cn)

### Common Response Envelope

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

| `code` | Meaning |
|--------|---------|
| `0` | Success |
| `-1` | Business error (see `status` field) |
| `-3` | `access_token` expired — re-fetch required |

---

#### POST /auth/access_token

Obtain an API access token.

**Request** (`application/x-www-form-urlencoded`):

| Parameter | Required | Description |
|-----------|----------|-------------|
| `app_key` | ✅ | Open Platform AppKey |
| `app_secret` | ✅ | Open Platform AppSecret |

**Response `data`**:

```json
{
  "access_token": "VE9LRU5...",
  "expire_at": 1710732700
}
```

> `expire_at` is a Unix timestamp (seconds). The code auto-refreshes 10 seconds before expiry.

---

#### GET /open/v1/pano/file/token

Get temporary object storage upload credentials. Pass `access_token` in the `Authorization` header.

**Response `data`** — STS temporary credentials, key fields:

| Field | Description |
|-------|-------------|
| `bucket` / `region` | Object storage bucket info |
| `prefix` | Upload path prefix; final object key = `prefix + uploadKey` |
| `tmpSecretId` / `tmpSecretKey` / `sessionToken` | STS temporary credentials |
| `download_host` | **Empty** = private bucket → use `private_cos_key` when submitting; non-empty = use `zip_cos_url` |

---

#### POST /open/v1/pano/task/submit

Submit a panorama processing task. Provide either `zip_cos_url` or `private_cos_key`:

| Scenario | Field to use |
|----------|-------------|
| `download_host` is non-empty (public bucket) | `zip_cos_url` (the `download_url` from upload result) |
| `download_host` is empty (private bucket) | `private_cos_key` (the `path` from upload result, i.e. `token.prefix + uploadKey`) |

**Response `data`**:

```json
{
  "project_id": "pano-xxxxxxxxxxxxxxxxxxxx",
  "task_code": "xxxxxxxxxxxxxxxxxxxx"
}
```

---

#### GET /open/v1/pano/task/status

Poll task status using the `task_code` query parameter.

**Response `data`**:

```json
{
  "project_id": "pano-xxxxxxxxxxxxxxxxxxxx",
  "status": "processing",
  "vr_url": ""
}
```

| `status` | Meaning |
|----------|---------|
| `pending` | Queued |
| `processing` | In progress |
| `success` | Done — `vr_url` contains the full URL |
| `failed` | Failed |

---

## Output Files

After a successful run, `data/output/` contains:

### state.json

Shared intermediate state used for resume:

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

Final result summary:

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

## China vs Global

Switch regions with a single env var — no code changes needed:

```dotenv
# Global / overseas (default)
REALSEE_REGION=global

# China mainland
REALSEE_REGION=cn
```

| | `global` (default) | `cn` |
|---|---|---|
| API gateway | `https://app-gateway.realsee.ai` | `https://app-gateway.realsee.cn` |
| Object storage | AWS S3 | Tencent Cloud COS |
| Upload adaptor | `adaptors/aws` | `adaptors/cos-node` |
| Platform account | Global Open Platform account | China Open Platform account |

---

## FAQ

**Q: Error `Missing REALSEE_APP_KEY or REALSEE_APP_SECRET`?**

Make sure `.env` exists and contains valid credentials. Node.js 18.3+ loads it automatically via `--env-file=.env`.

---

**Q: Step 1 error `image file not found`?**

Check that `data/samples/images/` contains `.jpg` files whose names match the `id` values in `manifest.json`'s `scan_list`.

---

**Q: Upload is very slow?**

When `is_accelerate: "1"`, the SDK uses S3 Transfer Acceleration. Upload time for ~15 panoramas (~100 MB) is typically 1–3 minutes depending on your network.

---

**Q: Polling timed out (30 minutes)?**

Realsee typically finishes processing in 5–15 minutes. If polling was interrupted, resume with an existing `task_code`:

```bash
# Read task_code from state.json
npm run poll

# Or specify explicitly
npm run poll -- --task-code=<task_code>
```

---

**Q: Task submission returns `user ID cannot be empty` (business_code: 10001)?**

This usually means the `access_token` is invalid or the app lacks the required permissions. Verify that your `APP_KEY` / `APP_SECRET` belong to an active Realsee Open Platform app with panorama processing enabled.

---

**Q: How do I use my own panoramas?**

1. Place `.jpg` files in `data/samples/images/`
2. Update `data/samples/manifest.json` — set `scan_list` and `floor_map`
3. Run `npm start`
