# Data Model And API

本文档定义 V1 的核心数据结构、字段约束、状态枚举和接口边界。

## 1. General Rules

- 不采集姓名、工号、邮箱、OpenID、UnionID。
- 不提供修改原始问题内容的能力。
- `直达领导` 通道仅存密文，不存明文。
- 热度来自 `同类独立提交数`，不做点赞和支持。
- 日志、监控、网关不得记录提问明文请求体。

## 2. Route Definitions

| Route Code | Display Name | Description |
| --- | --- | --- |
| `public_discuss` | 公开讨论 | 审核后进入公开问题池，可在会前被看到 |
| `meeting_only` | 会上公开 | 会前不公开，进入大会筹备和现场展示 |
| `direct_leader` | 直达领导 | 不上会、不公开，仅指定收件人可查看 |

## 3. Display Status Definitions

适用于 `public_discuss` 和 `meeting_only`。

| Status Code | Display Name | Description |
| --- | --- | --- |
| `pending` | 待处理 | 刚提交，尚未归类和处理 |
| `show_raw` | 原文可展示 | 原文允许在公开池或大会中展示 |
| `count_only` | 仅计数不展示 | 原文不对外展示，但计入议题频次 |
| `redirect_official` | 转正式渠道 | 不进入大会流程，转到正式渠道处理 |
| `archived` | 已归档 | 问题已关闭或不再参与当前流程 |

## 4. Answer Status Definitions

| Status Code | Display Name | Description |
| --- | --- | --- |
| `unanswered` | 待回答 | 尚未现场或会后回应 |
| `answered_live` | 已现场回答 | 已在大会中回答 |
| `answered_post` | 会后补答 | 未在现场回答，会后补充 |

## 5. Topic Status Definitions

| Status Code | Display Name | Description |
| --- | --- | --- |
| `active` | 使用中 | 当前参与大会排序和展示 |
| `archived` | 已归档 | 不再展示或已完成沉淀 |

## 6. Direct Message Status Definitions

| Status Code | Display Name | Description |
| --- | --- | --- |
| `new` | 新消息 | 尚未阅读 |
| `read` | 已读 | 已由指定收件人查看 |
| `archived` | 已归档 | 已归档，不在默认列表显示 |

## 7. Tables

### 7.1 `raw_questions`

存放 `公开讨论` 和 `会上公开` 两类原始问题。

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | 主键 |
| `route` | `text` | yes | 仅允许 `public_discuss` 或 `meeting_only` |
| `raw_content` | `text` | yes | 原始问题，不可改写 |
| `topic_id` | `uuid` | no | 所属议题 |
| `display_status` | `text` | yes | 默认 `pending` |
| `answer_status` | `text` | yes | 默认 `unanswered` |
| `created_at` | `timestamptz` | yes | 创建时间 |
| `updated_at` | `timestamptz` | yes | 更新时间 |

Constraints:

- `raw_content` 建议限制在 `10-500` 字。
- 不允许提供更新 `raw_content` 的接口。
- `topic_id` 可为空，表示未归类。

### 7.2 `topics`

存放大会议题。

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | 主键 |
| `title` | `varchar(120)` | yes | 议题标题 |
| `status` | `text` | yes | 默认 `active` |
| `meeting_order` | `int` | no | 大会展示顺序 |
| `created_at` | `timestamptz` | yes | 创建时间 |
| `updated_at` | `timestamptz` | yes | 更新时间 |

Notes:

- `question_count` 建议通过查询实时统计，不单独冗余。
- 议题标题是归类字段，不覆盖原始问题内容。

### 7.3 `direct_messages`

存放 `直达领导` 密文数据。

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | 主键 |
| `recipient_id` | `varchar(64)` | yes | 指定收件人标识 |
| `ciphertext` | `text` | yes | 加密后的正文 |
| `encrypted_key` | `text` | yes | 使用公钥加密的会话密钥 |
| `nonce` | `varchar(128)` | yes | 加密随机参数 |
| `public_key_version` | `varchar(32)` | yes | 公钥版本 |
| `created_at_bucket` | `timestamptz` | yes | 分桶后的提交时间 |
| `read_at` | `timestamptz` | no | 阅读时间 |
| `status` | `text` | yes | 默认 `new` |

Notes:

- 只存密文，不存明文。
- `created_at_bucket` 建议按 `30 分钟` 或 `1 小时` 分桶，减少时间关联。
- 私钥不得进入服务器、数据库或代码仓库。

### 7.4 `admin_audit_logs`

记录会务操作。

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | 主键 |
| `actor_id` | `varchar(64)` | yes | 操作人 |
| `action` | `varchar(64)` | yes | 操作类型 |
| `target_type` | `varchar(32)` | yes | 目标类型 |
| `target_id` | `uuid` | yes | 目标 ID |
| `before_data` | `jsonb` | no | 变更前快照 |
| `after_data` | `jsonb` | no | 变更后快照 |
| `created_at` | `timestamptz` | yes | 创建时间 |

Notes:

- 审计 `归类、改状态、排序` 等动作。
- 不存在“修改原文”的审计，因为不允许修改原文。
- 不记录 `直达领导` 的明文内容。

## 8. API List

## 8.1 Public APIs

### `GET /api/meta/config`

用途：

- 获取前端配置。

返回建议：

- 处理方式列表
- 字数限制
- 风险提示文案
- 领导公钥版本

### `POST /api/questions`

用途：

- 提交 `公开讨论` 或 `会上公开` 的原始问题。

Request:

```json
{
  "route": "meeting_only",
  "content": "希望了解今年晋升标准是否会有调整。"
}
```

Validation:

- `route` 仅允许 `public_discuss` 或 `meeting_only`
- `content` 长度要求 `10-500` 字

Response:

```json
{
  "id": "uuid",
  "route": "meeting_only",
  "status": "pending"
}
```

### `GET /api/public/questions`

用途：

- 获取公开问题池。

返回范围：

- 仅返回 `route = public_discuss`
- 且 `display_status = show_raw`

支持参数：

- `page`
- `pageSize`
- `keyword`
- `topicId`

## 8.2 Direct-to-Leader APIs

### `POST /api/direct-messages`

用途：

- 提交 `直达领导` 的密文消息。

Request:

```json
{
  "recipientId": "leader_1",
  "ciphertext": "base64...",
  "encryptedKey": "base64...",
  "nonce": "base64...",
  "publicKeyVersion": "v1"
}
```

Response:

```json
{
  "id": "uuid",
  "status": "new"
}
```

### `GET /api/leader/messages`

用途：

- 领导拉取密文消息列表。

Response Rules:

- 只返回密文字段和状态字段
- 不返回明文内容

### `PATCH /api/leader/messages/:id/read`

用途：

- 标记消息为已读。

### `PATCH /api/leader/messages/:id/archive`

用途：

- 标记消息为已归档。

## 8.3 Organizer APIs

### `GET /api/admin/questions`

用途：

- 获取问题列表。

支持筛选：

- `route`
- `displayStatus`
- `topicId`
- `answerStatus`
- `dateFrom`
- `dateTo`
- `keyword`

### `POST /api/admin/topics`

用途：

- 创建议题。

Request:

```json
{
  "title": "晋升标准透明度"
}
```

### `PATCH /api/admin/questions/:id/topic`

用途：

- 将问题归入议题。

Request:

```json
{
  "topicId": "uuid"
}
```

### `PATCH /api/admin/questions/:id/display-status`

用途：

- 设置展示状态。

Request:

```json
{
  "displayStatus": "count_only"
}
```

Allowed Values:

- `show_raw`
- `count_only`
- `redirect_official`
- `archived`

### `PATCH /api/admin/questions/:id/answer-status`

用途：

- 设置答复状态。

Request:

```json
{
  "answerStatus": "answered_live"
}
```

Allowed Values:

- `unanswered`
- `answered_live`
- `answered_post`

### `GET /api/admin/topics`

用途：

- 获取议题及同类问题数。

默认排序：

- 按 `同类问题数` 降序

### `PATCH /api/admin/topics/reorder`

用途：

- 调整大会展示顺序。

Request:

```json
{
  "topicIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

### `GET /api/admin/meeting-board`

用途：

- 获取大会展示页所需数据。

返回建议：

- 议题标题
- 同类问题数
- 可展示原文列表
- 答复状态

### `GET /api/admin/export/faq`

用途：

- 导出会后 FAQ 数据。

## 9. APIs Explicitly Not Provided

- 不提供修改原始问题内容的接口。
- 不提供点赞、支持、评论接口。
- 不提供普通员工查看 `会上公开` 原文的接口。
- 不提供返回 `直达领导` 明文的接口。

## 10. Security Requirements

- 公共提问接口不要求登录。
- 会务接口走内部登录或白名单。
- 领导接口即使做登录，返回的也仍应是密文。
- 接口日志、反向代理日志、监控系统不得记录明文请求体。
