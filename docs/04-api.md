# FlowTrade: API Design และ RBAC

> **เวอร์ชัน:** 1.0 (Final, Phase 1 / MVP) · **วันที่:** 1 ต.ค. 2569 (2026-10-01)
> **ผู้ใช้เอกสาร:** ทีม Backend (NestJS), ทีม Frontend (`apps/web`) และ QA
> **อ้างอิง:** [01-requirements-flow.md](01-requirements-flow.md) (กติกา C1–C13, BR-01…BR-37) · glossary ใน [README.md](README.md) · [02-architecture.md](02-architecture.md) · [03-database.md](03-database.md) และ [schema.prisma](schema.prisma) (ชื่อ model/field) · [05-frontend-ux.md](05-frontend-ux.md) · [06-roadmap.md](06-roadmap.md)
> **สถานะของเอกสารนี้:** เป็น **แหล่งความจริงเดียว** ของ (1) REST contract (2) **permission key และ permission matrix** (หัวข้อ 4) (3) ชื่อ field ใน object `can` (4) error code. ถ้าเอกสารอื่นเขียนต่างจากนี้ ให้ยึดเอกสารนี้ ยกเว้นชื่อ model/field ซึ่งยึด `schema.prisma`
> จุดที่ต้องให้ลูกค้าตัดสินใจทำเครื่องหมาย **(ควรยืนยันกับทีม Trade)** ส่วนเรื่องโครงสร้างพื้นฐานทำเครื่องหมาย **(ควรยืนยันกับทีม IT)**

---

## สรุปการตัดสินใจหลัก

| เรื่อง | ตัดสินใจ |
|---|---|
| รูปแบบ API | REST + JSON ภายใต้ `/api/v1` อยู่ origin เดียวกับเว็บ ไม่เปิด CORS |
| Auth | server-side session ใน cookie `__Host-ft_sid` · idle 8 ชม. (sliding) · absolute 7 วัน · ไม่มี "จดจำฉัน" · login ด้วยอีเมลเท่านั้น |
| CSRF | `SameSite=Lax` + ตรวจ `Origin` + บังคับ header `X-FlowTrade-Request: 1` ทุก unsafe method |
| Error | RFC 9457 Problem Details (`application/problem+json`) มี `code` ที่เครื่องอ่านได้ และ `detail` ภาษาไทย |
| Response | ทุก 2xx ที่มี body ใช้ envelope `{ data, meta?, warnings? }` · ทุก mutation ของงานคืน `MutationResult<T>` ที่มี `patch` ให้ cache ฝั่งเว็บ merge |
| Task tree | `GET /proposals/:id/tasks` คืน **flat list** `TaskDto[]` เรียงตาม `(level, sortOrder, id)` เว็บประกอบเป็นต้นไม้เองด้วย `buildTaskTree` จาก `packages/shared` |
| Checklist | `PUT /tasks/:id/status { status, cascade }` ระบุสถานะปลายทางเสมอ (C12) ไม่ใช้ `version` |
| Concurrency | `version` บน Proposal และ Task (ยกเว้นการตั้งสถานะงานและผู้รับผิดชอบ) · ข้อมูลหลักใช้ `expectedUpdatedAt` |
| Idempotency | ใช้เฉพาะ `batchId` ของ wizard ผ่านตาราง `ProposalBatch` ไม่ใช้ header `Idempotency-Key` |
| สิทธิ์ | permission key ชุดเดียวใน `packages/shared/src/permissions.ts` (หัวข้อ 4.1) · สิทธิ์ระดับข้อเสนอ/งาน server คำนวณแล้วส่งเป็น `can` ใน DTO |
| ไฟล์แนบ (MVP) | อัปโหลดผ่าน API ตรวจ magic bytes · ดาวน์โหลดแบบ stream ผ่าน API หลังตรวจสิทธิ์ · S3 presigned URL เป็น Phase 2 |
| Background jobs (MVP) | pg-boss รันใน process เดียวกับ API (มี instance เดียว) · แยก worker container ใน Phase 2 |
| แจ้งเตือน (MVP) | ในแอปเท่านั้น · อีเมลและ digest เป็น Phase 2 |

**ป้ายระยะ (phase)** ในตาราง endpoint: ไม่มีป้าย = MVP · **[Should]** = MVP ถ้าเวลาพอ · **[P2]** = Phase 2 (จองชื่อ path ไว้แล้วเพื่อไม่ให้ contract เปลี่ยนภายหลัง)

### ชื่อที่เลิกใช้ (ห้ามใช้ในโค้ดใหม่)

ร่างเอกสารก่อนหน้าและ prototype ใน repo มีชื่อชุดอื่นปนอยู่ CI ควร grep กันชื่อเหล่านี้

| เลิกใช้ | ใช้แทน |
|---|---|
| `dashboard.viewAll`, `dashboard.monitor`, `store.manage`, `shelfType.manage`, `product.manage`, `taskTemplate.manage`, `template.manage`, `activityLog.readAll`, `activity.read.all`, `settings.manage`, `masterData.delete`, `proposal.assignOwner`, `proposal.update.any`, `task.manage.any` | key ในหัวข้อ 4.1 เช่น `dashboard.view.all`, `master.manage`, `master.delete`, `audit.read.all`, `setting.manage`, `proposal.create.assignOwner`, `proposal.update.all` |
| `TaskNodeDto` (ต้นไม้ซ้อนจาก server) | `TaskDto[]` แบบ flat + `buildTaskTree` ฝั่งเว็บ |
| `POST /tasks/:id/toggle`, `isDone`, `POST /tasks/:id/done` | `PUT /tasks/:id/status { status, cascade }` และ `Task.status` |
| header `Idempotency-Key` | `batchId` ใน body ของ `POST /proposals` |
| error code `CONFLICT` | `VERSION_CONFLICT` |
| `proposal.can.editTargetDate` / `editShelfType` | `can.changeTargetDate` / `can.changeShelfType` |
| `targetOnShelfDate`, `ProposalItem`, `assigneeId`, `depth`, `position`, `ARCHIVED`, รหัส `PRJ-` | `targetDate`, `ProposalProduct`, `TaskAssignee[]`, `level`, `sortOrder`, (ไม่มีสถานะนี้), `PRP-` |
| `/admin/monitor/overdue-tasks`, `/dashboard/overdue-tasks`, `/dashboard/unassigned-tasks`, `/dashboard/users/:userId/tasks` | `GET /dashboard/tasks` และหน้าเว็บ `/admin/tasks` |
| `/proposals/batch/:batchId`, `GET /proposals/batches/:batchId` | `GET /proposals?batchId=` (มี `meta.batch`) |

---

## 1. Conventions

### 1.1 Base URL และรูปแบบทั่วไป

| เรื่อง | กติกา |
|---|---|
| Base path | `https://flowtrade.<โดเมนบริษัท>/api/v1` · health อยู่นอก version ที่ `/api/healthz`, `/api/readyz` |
| Origin | เว็บและ API อยู่ origin เดียวกัน ฝั่ง dev ใช้ Vite proxy `/api` → `http://localhost:3000` |
| Content type | request ที่มี body ต้องเป็น `application/json; charset=utf-8` ยกเว้น endpoint อัปโหลดที่ใช้ `multipart/form-data` · ส่งชนิดอื่นตอบ `415 UNSUPPORTED_MEDIA_TYPE` |
| ชื่อ field | camelCase ตาม glossary ([README.md](README.md) อภิธานศัพท์) และ `schema.prisma` · ค่า enum เป็น UPPER_SNAKE_CASE ตรงกับ Prisma |
| id | uuid v7 (server สร้าง) ยกเว้น `batchId` ที่เว็บสร้าง |
| วันที่ (`date`) | string `YYYY-MM-DD` ปี ค.ศ. เช่น `"2026-11-15"` ไม่มีเวลาและไม่แปลง timezone (`targetDate`, `actualLaunchDate`, `startDate`, `dueDate`) |
| เวลา (`datetime`) | ISO 8601 UTC ลงท้าย `Z` เช่น `"2026-10-01T03:30:41.870Z"` เว็บแปลงเป็นเวลาไทยตอนแสดง |
| "วันนี้" | คำนวณตามเวลา Asia/Bangkok ที่ server เท่านั้น (BR-26) ทุก response ที่มีค่าซึ่งขึ้นกับวันนี้ (`dueState`, `health`, `daysUntilDue`) ส่ง `meta.today` มาด้วย |
| PATCH | field ที่ไม่ส่ง = ไม่เปลี่ยน · ส่ง `null` = ล้างค่า (เฉพาะ field ที่ nullable) |
| ข้อความ | ทุก string ที่ผู้ใช้กรอกถูก `trim()` ที่ zod schema · ข้อความ error และ warning เป็นภาษาไทยพร้อมแสดง |

### 1.2 Authentication และ session

- **ไม่มี self sign-up** บัญชีสร้างโดย ADMIN เท่านั้น (R-AUTH, US-A01)
- Login ด้วย `{ email, password }` · อีเมลถูก normalize เป็น `trim().toLowerCase()` ทั้งตอนเขียนและค้นหา
- Cookie: `__Host-ft_sid` · `HttpOnly; Secure; SameSite=Lax; Path=/` (dev ใช้ `ft_sid` ผ่าน env `COOKIE_NAME`) · token สุ่ม 32 bytes ส่วน DB เก็บเฉพาะ SHA-256 hex ใน `Session.tokenHash`
- อายุ: **idle 8 ชม.** แบบ sliding (ต่ออายุไม่เกิน 1 ครั้งต่อ 5 นาที และไม่เกิน `absoluteExpiresAt`) · **absolute 7 วัน** · ไม่มี "จดจำฉัน" · ค่าตั้งผ่าน env `SESSION_IDLE_HOURS=8`, `SESSION_ABSOLUTE_DAYS=7` และมี unit test ตรวจว่า default ตรงกับ NFR
- ออก session ใหม่ทุกครั้งที่ login หรือเปลี่ยนรหัสผ่าน · revoke ทุก session ทันทีเมื่อรีเซ็ตรหัส เปลี่ยนบทบาท หรือปิดบัญชี
- **SessionGuard** (global) อ่าน session พร้อมข้อมูลผู้ใช้สดทุก request ไม่มี permission cache ข้าม request:

```sql
SELECT s.id, s.user_id, s.expires_at, s.absolute_expires_at, s.last_seen_at,
       u.role, u.must_change_password
FROM sessions s
JOIN users u ON u.id = s.user_id AND u.is_active          -- บัญชีที่ถูกปิดใช้ session เดิมไม่ได้ แม้ revoke ตกหล่น
WHERE s.token_hash = $1 AND s.revoked_at IS NULL
  AND s.expires_at > now() AND s.absolute_expires_at > now();
```

- ไม่พบแถว → `401 SESSION_EXPIRED` (มี cookie) หรือ `401 UNAUTHENTICATED` (ไม่มี cookie)
- **MustChangePasswordGuard**: ถ้า `mustChangePassword = true` เรียกได้เฉพาะ `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout` นอกนั้นตอบ `403 PASSWORD_CHANGE_REQUIRED`
- **PermissionsGuard**: ตรวจ permission key ระดับ role จาก decorator `@RequirePermissions(...)` ส่วนสิทธิ์ระดับข้อเสนอ/งานตรวจใน service ผ่าน `resolveProposalAccess` (หัวข้อ 4.4)

### 1.3 CSRF

- ทุก unsafe method (POST, PUT, PATCH, DELETE) **รวม `/auth/login` และ multipart** ต้องมี header `X-FlowTrade-Request: 1` · เว็บอื่นส่ง custom header ข้าม origin ไม่ได้ถ้าไม่ผ่าน preflight และ API ไม่ตอบ preflight
- `Origin` ต้องตรงกับ `APP_URL` ถ้าไม่มี `Origin` ให้ดู `Referer` ถ้าไม่มีทั้งคู่ตอบ `403 CSRF_REJECTED`
- GET ไม่มีผลข้างเคียงเสมอ (รวม export และ download)

### 1.4 Response envelope

| กรณี | Status | Body |
|---|---|---|
| อ่าน resource เดี่ยว | 200 | `{ "data": T, "meta"?: {...} }` |
| รายการแบบแบ่งหน้า | 200 | `{ "data": T[], "meta": { "page", "pageSize", "total", "totalPages", ... } }` |
| รายการแบบ cursor | 200 | `{ "data": T[], "meta": { "nextCursor": string \| null } }` |
| รายการชุดเล็ก (lookup, task tree) | 200 | `{ "data": T[], "meta"?: {...} }` |
| สร้าง | 201 | `{ "data": T, "warnings"?: [...] }` + header `Location` |
| แก้ไข/คำสั่ง | 200 | `{ "data": T, "warnings"?: [...], "meta"?: {...} }` |
| mutation ของงาน (สร้าง, แก้, สถานะ, ย้าย, ลบ, กู้คืน, ผู้รับผิดชอบ) | 200/201 | `MutationResult<T>` (ด้านล่าง) |
| ลบที่ไม่มีข้อมูลต้องคืน | 204 | ไม่มี body |

```ts
// packages/shared/src/dto/common.ts
export interface ApiWarning { code: string; message: string; path?: string; details?: Record<string, unknown> }

/** ทุก mutation ของงานคืนรูปนี้ เว็บ merge patch.tasks และ patch.proposal เข้า cache โดยไม่ต้อง refetch */
export interface MutationResult<T> {
  data: T;
  patch: {
    tasks: TaskPatchDto[];                 // ทุกงานที่ค่าเปลี่ยน (รวมงานแม่ที่ roll-up และลูกหลานที่ level เปลี่ยน)
    proposal: ProposalProgressDto | null;  // progress/health ล่าสุดของข้อเสนอ
  };
  warnings: ApiWarning[];
  meta: { today: string } & Record<string, unknown>;
}
export type TaskPatchDto = { id: string } & Partial<TaskDto>;
```

**Warning codes** (ไม่ขวางการทำงาน เว็บแสดงเป็น banner, toast หรือไอคอน)

| `code` | เกิดเมื่อ |
|---|---|
| `TEMPLATE_DATES_ADJUSTED` | มีงานจากแม่แบบที่วันที่ตกก่อนวันนี้ จึงถูกเลื่อนเป็นวันนี้ (BR-12) |
| `PAST_TARGET_DATE` | วันวางขายอยู่ในอดีต ระบบไม่เลื่อนวันงาน (BR-11) |
| `DUPLICATE_OVERRIDDEN` | ผู้ใช้ยืนยันว่าไม่ใช่ข้อเสนอซ้ำระดับ 2 แล้ว (BR-04) |
| `OUTSIDE_PARENT_RANGE` | วันที่ของงานอยู่นอกช่วงของงานแม่ (5.3) มี `details.suggestedParentRange` |
| `PARENT_REOPENED` | งานแม่ที่ DONE กลับเป็น IN_PROGRESS (C8) |
| `TARGET_DATE_PASSED` | `RESUME` ข้อเสนอที่วันวางขายผ่านไปแล้ว (BR-03) |
| `SHIFTED_INTO_PAST` | เลื่อนวันวางขายแล้วมีงานค้างที่ครบกำหนดในอดีต |
| `ACTIVE_PROPOSALS_EXIST` | ปิดใช้งานข้อมูลหลักที่ยังมีข้อเสนอ Active อ้างอิง (BR-01) |
| `TEMPLATE_AVAILABLE` | เปลี่ยนรูปแบบชั้นวางแล้วมีแม่แบบของรูปแบบใหม่ให้เพิ่ม (BR-07) |
| `DEFAULT_CLEARED` | ลบหรือปิดใช้งานแม่แบบที่เป็นค่าเริ่มต้น ระบบปลดค่าเริ่มต้นให้แล้ว |
| `TASK_SOFT_LIMIT` | ข้อเสนอมีงานเกิน 500 รายการ (BR-25) |

### 1.5 Error format (RFC 9457 Problem Details)

```json
{
  "type": "urn:flowtrade:error:validation-failed",
  "title": "ข้อมูลไม่ถูกต้อง",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "กรุณาตรวจสอบข้อมูลที่กรอก",
  "errors": [{ "path": "rows[0].targetDate", "code": "invalid_format", "message": "รูปแบบวันที่ไม่ถูกต้อง" }],
  "requestId": "01a0f4c3-9e77-7abc-8def-0123456789ab"
}
```

- `type` = `urn:flowtrade:error:<code แบบ kebab-case>` · `title` ข้อความไทยสั้น · `detail` ข้อความไทยที่บอกวิธีแก้
- field เสริมตามกรณี: `errors[]` (รายฟิลด์ หรือรายแถวของ batch), `details` (ข้อมูลประกอบ เช่น `reason`, `openDescendantCount`), `conflict` (409 VERSION_CONFLICT), `lockedUntil` + `retryAfterSeconds` (423), `usage` (409 IN_USE)
- ไม่ส่ง stack trace ออกไป · `requestId` ตรงกับ header `X-Request-Id` และใน log
- เว็บแปล `code` เป็นข้อความผ่าน i18n namespace `errors` ถ้าไม่มีคำแปลให้ใช้ `detail`

| HTTP | `code` | ใช้เมื่อ |
|---|---|---|
| 400 | `VALIDATION_FAILED` | body/query/path ไม่ผ่าน zod หรือมี field/param ที่ไม่รู้จัก |
| 400 | `TOKEN_INVALID` | **[P2]** ลิงก์ตั้งรหัสผ่านใช้ไม่ได้หรือหมดอายุ |
| 401 | `UNAUTHENTICATED` · `SESSION_EXPIRED` | ไม่มี cookie · session หมดอายุ ถูก revoke หรือบัญชีถูกปิด |
| 401 | `INVALID_CREDENTIALS` | อีเมลหรือรหัสผ่านผิด (ข้อความกลางๆ เสมอ) |
| 401 | `TEMP_PASSWORD_EXPIRED` | รหัสผ่านชั่วคราวเกิน 72 ชม. (ตอบเฉพาะเมื่อรหัสถูก เพื่อไม่ให้ใช้เดาบัญชีได้) |
| 403 | `CSRF_REJECTED` · `PASSWORD_CHANGE_REQUIRED` · `FORBIDDEN` | ไม่มี header/Origin ผิด · ต้องเปลี่ยนรหัสก่อน · ไม่มีสิทธิ์ (`details.reason` เช่น `OWNER_ONLY`, `NOT_ASSIGNED`, `NOT_CREATOR`, `SUBTREE_HAS_OTHERS_ITEMS`) |
| 404 | `NOT_FOUND` · `PROPOSAL_NOT_FOUND` · `TASK_NOT_FOUND` | ไม่มีอยู่ ถูกลบ หรือ **ไม่มีสิทธิ์เห็น** (ไม่เปิดเผยว่ามีอยู่) |
| 409 | `VERSION_CONFLICT` | `version` หรือ `expectedUpdatedAt` ไม่ตรง |
| 409 | `CONFIRMATION_REQUIRED` | ต้องยืนยันก่อน เช่น cascade (C5/C7) หรือเริ่มข้อเสนอที่ไม่มีงาน |
| 409 | `EMAIL_TAKEN` · `SKU_TAKEN` · `BARCODE_TAKEN` · `CODE_TAKEN` · `NAME_TAKEN` · `ALREADY_MEMBER` | ค่าซ้ำ (map จาก Prisma `P2002` ตามชื่อ constraint) |
| 409 | `IN_USE` · `ID_CONFLICT` · `POSITION_STALE` | ลบข้อมูลหลักที่ยังถูกอ้างอิง (BR-01) · `batchId` ถูกใช้โดยผู้ใช้อื่น · `afterId`+`beforeId` ไม่ติดกันแล้ว |
| 413 | `FILE_TOO_LARGE` · `PAYLOAD_TOO_LARGE` | ไฟล์หรือ body ใหญ่เกิน |
| 415 | `FILE_TYPE_NOT_ALLOWED` · `UNSUPPORTED_MEDIA_TYPE` | ชนิดไฟล์ไม่อยู่ใน allowlist · body ไม่ใช่ JSON |
| 422 | business code (ตารางถัดไป) | ผ่าน schema แต่ผิดกติกาธุรกิจ |
| 423 | `ACCOUNT_LOCKED` | มี `lockedUntil` และ `retryAfterSeconds` |
| 429 | `RATE_LIMITED` | มี header `Retry-After` |
| 500 / 503 | `INTERNAL` / `SERVICE_UNAVAILABLE` | — |

| กลุ่ม | Business code (422) |
|---|---|
| ข้อเสนอ | `PROPOSAL_READ_ONLY`, `TRANSITION_NOT_ALLOWED`, `TASKS_INCOMPLETE`, `REASON_REQUIRED`, `LAUNCH_DATE_REQUIRED`, `LAUNCH_DATE_IN_FUTURE`, `STORE_LOCKED`, `CHANNEL_MISMATCH`, `INACTIVE_REFERENCE`, `TEMPLATE_NOT_APPLICABLE`, `BATCH_INVALID`, `DUPLICATE_PROPOSAL_UNCONFIRMED`, `LAST_PRODUCT`, `PRODUCT_LIMIT`, `OWNER_IS_MEMBER`, `OWNER_INACTIVE`, `MEMBER_HAS_OPEN_TASKS`, `ONLY_DRAFT_DELETABLE` |
| งาน | `TASK_DEPTH_EXCEEDED`, `TASK_TREE_INVALID`, `PARENT_STATUS_DERIVED`, `DATE_ORDER`, `ASSIGNEE_INACTIVE`, `PARENT_DELETED`, `UNDO_EXPIRED`, `TARGET_NOT_IN_PROPOSAL` |
| ผู้ใช้และข้อมูลหลัก | `SELF_ROLE_CHANGE`, `SELF_DEACTIVATE`, `LAST_ADMIN`, `OWNER_HAS_OPEN_PROPOSALS`, `PASSWORD_POLICY`, `PASSWORD_REUSED`, `BARCODE_INVALID`, `ORDER_SET_MISMATCH`, `DEFAULT_TEMPLATE_INACTIVE` |
| จองไว้สำหรับ Phase 2 | `SMTP_NOT_CONFIGURED`, `MENTION_NOT_VISIBLE`, `SHELF_TYPE_NOT_ALLOWED` |

**Error จาก DB** (deferred constraint trigger รายงานตอน COMMIT ตารางเต็มอยู่ที่ [03-database.md](03-database.md) §6.3) ให้ `ProblemDetailsFilter` map ด้วยชื่อ constraint:

| Constraint / trigger | ตอบ |
|---|---|
| `tasks_tree_consistency` | 422 `TASK_TREE_INVALID` |
| `proposal_owner_not_member` | 422 `OWNER_IS_MEMBER` |
| `proposal_owner_active` (trigger `proposals_owner_active` · ข้อเสนอที่ยังเปิดอยู่ รวมตอน REOPEN ต้องมี Owner ที่ Active) | 422 `OWNER_INACTIVE` |
| trigger ตรวจผู้ใช้ Active (`assert_user_active` บน `task_assignees` และ `proposal_members`) | 422 `ASSIGNEE_INACTIVE` (ครอบคลุมทั้งการมอบหมายงานและการเพิ่มสมาชิก) |
| `proposals_completed_has_launch` | 422 `LAUNCH_DATE_REQUIRED` |
| `products_barcode_live_key` · `stores_channel_name_key_live_key` · `shelf_types_channel_name_key_live_key` · `users_email_key` · `products_sku_key` | 409 `BARCODE_TAKEN` · `NAME_TAKEN` · `NAME_TAKEN` · `EMAIL_TAKEN` · `SKU_TAKEN` |
| `*_check` อื่น | 422 `BUSINESS_RULE` (ถือเป็นบั๊ก เพราะ service ควรตรวจก่อนถึง DB) |

### 1.6 Pagination, sort และ filter

| ชนิดรายการ | Query | `meta` | ใช้กับ |
|---|---|---|---|
| ตาราง (page) | `page` (≥ 1, default 1), `pageSize` (20/50/100, default 20) | `{ page, pageSize, total, totalPages }` | proposals, products, users, `/dashboard/tasks`, `/dashboard/at-risk` |
| Feed (cursor) | `cursor` (opaque base64url), `limit` (1–100, default 50) | `{ nextCursor }` | notifications, activity, comments, attachments |
| ชุดเล็ก | — | — | stores, shelf types, templates, lookups, task tree |

- **Sort:** `sort=targetDate,-updatedAt` คั่นด้วย comma โดย `-` แปลว่ามากไปน้อย · มี whitelist ต่อ endpoint · ระบบต่อ `id` ท้ายเสมอให้ลำดับคงที่ · ชื่อภาษาไทยเรียงด้วย collation `th-TH-x-icu`
- **Filter:** ค่าเดียว `status=IN_PROGRESS` · หลายค่าคั่นด้วย comma `status=IN_PROGRESS,ON_HOLD` (ไม่ใช้ `storeId[]=`) · boolean ใช้ `true`/`false` · ช่วงวันใช้คู่ `xxxFrom`/`xxxTo` นับรวมทั้งสองปลาย · `q` ยาว 1–100 ตัว ค้นแบบ substring ด้วย trigram ภาษาไทยจึงค้นได้โดยไม่ต้องตัดคำ
- query param ที่ไม่รู้จักหรือค่าที่ไม่อยู่ใน whitelist ตอบ `400`
- cursor เป็น keyset บน uuid v7 (`id < cursor` เมื่อเรียงจากใหม่ไปเก่า) ไม่ใช้ offset

### 1.7 Optimistic concurrency

| Entity | Token | ต้องส่งใน | ค่าเพิ่มเมื่อ | ค่าไม่เพิ่มเมื่อ |
|---|---|---|---|---|
| `Proposal` | `version` | `PATCH /proposals/:id`, `PUT …/target-date`, `POST …/transitions`, `PUT …/owner`, `DELETE …?version=` | แก้ header, สถานะ, Owner, `targetDate`, `actualLaunchDate` | อัปเดต progress cache, `touchProposal`, สินค้า, สมาชิก, งาน |
| `Task` | `version` | `PATCH /tasks/:id`, `PATCH /tasks/:id/move`, `DELETE /tasks/:id?version=` | แก้ title/description/priority/วันที่ · ย้าย (แถวที่ย้ายและลูกหลานที่ level เปลี่ยน) · เลื่อนวันจาก target-date · ลบ/กู้คืน | **เปลี่ยนสถานะ (C12)**, เปลี่ยนผู้รับผิดชอบ, roll-up สถานะงานแม่, renumber `sortOrder` |
| `User`, `Store`, `ShelfType`, `Product`, `TaskTemplate` | `expectedUpdatedAt` (ไม่บังคับ ยกเว้น `PUT /task-templates/:id/items`) | PATCH และ `PUT /task-templates/:id/items` | ทุกการแก้ไข | — |

- token ไม่ตรง → `409 VERSION_CONFLICT` พร้อม `conflict = { entityType, entityId, yourVersion, currentVersion, lastModifiedBy, lastModifiedAt, changedFields, current }` (`lastModifiedBy` อ่านจาก ActivityLog ล่าสุดของ entity) เว็บแสดง "งานนี้ถูกแก้ไขโดย [ชื่อ] เมื่อสักครู่ — โหลดข้อมูลล่าสุด" (BR-13)
- การตั้งสถานะงานและผู้รับผิดชอบเป็นการตั้ง "ค่าปลายทาง" ส่งซ้ำได้ผลเดิม จึงไม่ต้องใช้ version และไม่ทำให้คนที่กำลังแก้ชื่องานชน conflict

### 1.8 Idempotency

- **Wizard เท่านั้น:** เว็บสร้าง `batchId` (uuid v7) ครั้งเดียวต่อ wizard session และส่งค่าเดิมเมื่อ retry · คำสั่งแรกใน transaction คือ `INSERT INTO proposal_batches … ON CONFLICT (id) DO NOTHING RETURNING id` ถ้าไม่มีแถวคืนมา แปลว่า batch นี้ถูกสร้างแล้ว: ถ้า `createdById` ตรงกับผู้เรียก ตอบ `200` พร้อมข้อมูลเดิมและ header `Idempotent-Replay: true` ถ้าไม่ตรงตอบ `409 ID_CONFLICT` (รายละเอียดหัวข้อ 5.1) · คำขอที่มาพร้อมกันจะรอ lock ของ PK จึงไม่สร้างซ้ำ
- **Endpoint ที่ตั้งค่าปลายทาง** (`PUT /tasks/:id/status`, `PUT /tasks/:id/assignees`, `PUT /users/:id/role`, `POST /notifications/:id/read`) ส่งซ้ำได้ผลเหมือนเดิม
- **Endpoint ที่มี version:** retry คำขอที่สำเร็จไปแล้วจะได้ `409 VERSION_CONFLICT` เว็บ refetch แล้วจะเห็นว่าบันทึกแล้ว
- **DELETE** ซ้ำได้ `404` เว็บถือว่าสำเร็จ
- **สร้างงาน/คอมเมนต์/ไฟล์ไม่ idempotent** เว็บจึงไม่ retry mutation อัตโนมัติ (ตั้ง `retry: 0` ใน TanStack Query) · ใช้ temp id ฝั่งเว็บแล้วแทนด้วย id จริงจาก response

### 1.9 ค่าที่คำนวณ, `can` และ `touchProposal`

- server คำนวณ `durationDays`, `dueState`, `daysUntilDue`, `progress`, `overdueDescendantCount`, `outsideParentRange`, `health`, `suggestClose` แล้วส่งมากับ DTO · เว็บมีฟังก์ชันชุดเดียวกันใน `packages/shared/src/task-tree.ts` สำหรับ optimistic update
- DTO ของข้อเสนอมี `can: ProposalAbilitiesDto` และ DTO ของงานมี `can: TaskAbilitiesDto` (นิยามใน `packages/shared/src/dto/abilities.ts` หัวข้อ 6.4) · เว็บใช้ซ่อน/disable ปุ่มพร้อม tooltip (R-AUTH-4) ส่วน server ตรวจซ้ำทุกครั้ง
- **`touchProposal(tx, proposalId)`** = `UPDATE proposals SET updated_at = now() WHERE id = $1` (ไม่แตะ `version`) ต้องเรียกใน transaction ของ **ทุก** mutation ที่แตะ `tasks`, `task_assignees`, `comments`, `attachments`, `proposal_products`, `proposal_members` ของข้อเสนอนั้น และอยู่ใน `recomputeProposalProgress` ด้วย ผลคือ `Proposal.updatedAt` = "อัปเดตล่าสุด" ที่แท้จริงในหน้ารายการ และพร้อมใช้เป็น ETag ใน Phase 2

### 1.10 Rate limit และขีดจำกัด

| รายการ | ค่า |
|---|---|
| `POST /auth/login` | 10 ครั้ง/นาที/IP (`@nestjs/throttler`, `trust proxy 1`) และล็อกบัญชีตามหัวข้อ 5.10 |
| API ทั่วไป | 300 request/นาที/ผู้ใช้ |
| `POST /store-requests` | 5 ครั้ง/ชม./ผู้ใช้ |
| Export **[P2]** | 10 ครั้ง/ชม./ผู้ใช้ และไม่เกิน 10,000 แถว |
| JSON body | ≤ 1 MB |
| Multipart | ≤ `AppSetting.maxUploadMb` (default 20 ตั้งได้ 1–25 เพราะ Caddy จำกัดไว้ 25 MB) · รูปโปรไฟล์/โลโก้ ≤ 2 MB · รูปสินค้า ≤ 5 MB |
| Array | สินค้า ≤ 50 ต่อข้อเสนอ · ห้าง ≤ 20 ต่อ batch · ผู้รับผิดชอบ ≤ 20 ต่องาน · สมาชิก ≤ 30 ต่อ request · template item ≤ 300 · `excludedTemplateItemIds` ≤ 300 |
| Soft limit | ข้อเสนอที่มีงานเกิน 500 รายการได้ warning `TASK_SOFT_LIMIT` (BR-25) |

### 1.11 Caching

- ทุก response ของ `/api/*` ตั้ง `Cache-Control: no-store` ยกเว้น `/api/v1/media/*` ที่ใช้ `private, max-age=86400, immutable` (key มี content hash)
- **ETag/304 บน task tree เป็น Phase 2** · เมื่อทำ ให้ใช้ `ETag: W/"{proposalId}-{proposals.updated_at epoch ms}"` อย่างเดียว ซึ่งถูกต้องได้เพราะ `touchProposal` (1.9) ครอบคลุมทุก mutation · MVP ใช้ refetch ทุก 30 วินาทีเมื่อแท็บถูกเปิดดู ซึ่งพอสำหรับผู้ใช้พร้อมกันราว 50 คน

---

## 2. Endpoint catalog

### 2.0 วิธีอ่านตาราง

path ทุกตัวต่อจาก `/api/v1` คอลัมน์ **Permission** ใช้ permission key จากหัวข้อ 4.1 และ relation ต่อไปนี้

| สัญลักษณ์ | ความหมาย |
|---|---|
| `ownerLike` | Owner ของข้อเสนอ หรือผู้มี `proposal.update.all` (MANAGER, ADMIN) |
| `editorLike` | `ownerLike` หรือ EDITOR |
| `viewer+` | ทุกคนที่มองเห็นข้อเสนอ (Owner, Member, หรือมี `proposal.read.all`) |
| `can.x` | ability ใน DTO ซึ่งคำนวณตามหัวข้อ 4.2–4.4 (รวมกติกา subtree ของผู้รับผิดชอบ) |
| `auth` | login แล้ว |
| `public` | ไม่ต้อง login |

**DTO ที่ใช้ซ้ำ** (type อยู่ใน `packages/shared/src/dto/`)

| DTO | Fields |
|---|---|
| `UserRefDto` | `id, fullName, nickname, avatarUrl, isActive` |
| `StoreRefDto` | `id, code, name, nameTh, channel, logoUrl, colorHex, isActive` |
| `ShelfTypeRefDto` | `id, code, name, nameTh, channel, colorHex, isActive` |
| `StoreDto` | `StoreRefDto` + `groupName, note, sortOrder, createdAt, updatedAt, deletedAt` + `usage?` · **ไม่ส่ง `nameKey`** (คอลัมน์ภายในที่ trigger ตั้งให้) |
| `ProductDto` | `id, sku, name, brand, category, barcode, packSize, imageUrl, note, isActive, updatedAt` + `usage?` |
| `ProposalListItemDto` | `id, code, title, channel, status, store, shelfType, targetDate, daysUntilTarget, actualLaunchDate, campaignName, owner, productCount, firstProductName, progressPercent, leafTaskCount, doneLeafTaskCount, overdueLeafCount, health, batchId, myRelation (OWNER/EDITOR/VIEWER/null), updatedAt` |
| `ProposalDetailDto` | ทุก field ของ list item + `description, statusReason, cancelReason, startedAt, completedAt, cancelledAt, taskTemplate {id,name,isDeleted} \| null, products, memberCount, createdBy, createdAt, version, suggestClose, can: ProposalAbilitiesDto` |
| `ProposalProductDto` | `id, productId, sku, name, packSize, imageUrl, isActive, status, note, sortOrder` |
| `ProposalProgressDto` | `id, progressPercent, leafTaskCount, doneLeafTaskCount, overdueLeafCount, health, suggestClose, updatedAt` |
| `TaskDto` | `id, proposalId, parentId, level, title, status, priority, startDate, dueDate, durationDays, dueState, daysUntilDue, sortOrder, isMilestone, requiresAttachment, responsibleFunction, templateItemId, assignees: TaskAssigneeDto[], completedAt, completedBy: UserRefDto \| null, progress {done,total}, overdueDescendantCount, outsideParentRange, commentCount, attachmentCount, createdById, version, updatedAt, can: TaskAbilitiesDto` |
| `TaskAssigneeDto` | `userId, fullName, nickname, avatarUrl, isActive, isPrimary` (ผู้รับผิดชอบหลักอยู่แรกเสมอ) |
| `MyTaskDto` | `id, title, level, status, dueDate, dueState, daysUntilDue, isPrimary, path ("PRP-2026-0042 › งาน › งานย่อย"), proposal {id, code, title, status, store}, can {setStatus}` |
| `MeDto` | `user {id, email, fullName, nickname, position, phone, avatarUrl, role, dateEra, emailDigestEnabled, lastLoginAt}, permissions: Permission[], mustChangePassword, session {expiresAt, absoluteExpiresAt}, settings {dateEra (ค่าที่ใช้จริง = user.dateEra ?? defaultDateEra), dueSoonDays, maxUploadMb, allowedUploadTypes, timezone}, unreadNotificationCount` |
| `ActivityLogDto` | `id, actor: UserRefDto \| null, action, entityType, entityId, proposalId, summary, changes, createdAt` + `ipAddress, userAgent` เฉพาะผู้มี `audit.read.all` |
| `NotificationDto` | `id, type, title, body, linkUrl, proposalId, taskId, actor, isRead, readAt, createdAt` |

### 2.1 auth

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| POST | `/auth/login` | เข้าสู่ระบบ | public | `{ email, password }` | 200 `{ data: MeDto }` + `Set-Cookie` | `401 INVALID_CREDENTIALS` · `401 TEMP_PASSWORD_EXPIRED` · `423 ACCOUNT_LOCKED` · `429` · ต้องมี header CSRF (กัน login CSRF) · ลำดับการตรวจในหัวข้อ 5.10 |
| POST | `/auth/logout` | ออกจากระบบ | auth | — | 204 + ล้าง cookie | revoke ด้วย `LOGOUT` · เรียกซ้ำก็ได้ 204 · บันทึก `LOGOUT` |
| GET | `/auth/me` | ผู้ใช้ปัจจุบันและสิทธิ์ | auth | — | 200 `{ data: MeDto }` | เรียกได้แม้ `mustChangePassword = true` |
| PATCH | `/auth/me` | แก้โปรไฟล์ตัวเอง **[Should]** | `profile.update.self` | `{ nickname?, phone?, dateEra?: 'BE'\|'CE'\|null, emailDigestEnabled? }` | 200 `{ data: MeDto }` | `fullName`, `email`, `position`, `role` แก้ได้เฉพาะ ADMIN ผ่าน `/users/:id` |
| PUT · DELETE | `/auth/me/avatar` | อัปโหลด/ลบรูปโปรไฟล์ **[Should]** | `profile.update.self` | multipart `file` (jpg/png/webp ≤ 2 MB) | 200 `{ data: { avatarUrl } }` | re-encode ด้วย sharp ใน request (ย่อ 256 px ลบ EXIF/GPS) |
| POST | `/auth/change-password` | เปลี่ยนรหัสผ่าน | auth | `{ currentPassword?, newPassword }` | 200 `{ data: MeDto }` + cookie ใหม่ | `currentPassword` บังคับ **ยกเว้น** ตอน `mustChangePassword = true` (หน้าเปลี่ยนรหัสครั้งแรก) · ตั้ง `mustChangePassword = false`, `passwordExpiresAt = null` · revoke session อื่นด้วย `PASSWORD_CHANGE` แล้วออก session ใหม่ · `422 PASSWORD_POLICY`/`PASSWORD_REUSED` · รหัสเดิมผิดนับรวมกับตัวนับ lockout |
| POST | `/auth/setup-password` | ตั้งรหัสจากลิงก์อีเมล **[P2]** | public | `{ token, newPassword }` | 200 `{ data: MeDto }` + cookie | ต้องเพิ่ม model `AuthToken` ใน Phase 2 · ใช้ token แบบ atomic ที่ join `users.is_active` (หัวข้อ 7 #2) |
| GET · DELETE | `/auth/sessions`, `/auth/sessions/:id` | session ของฉัน / ออกจากอุปกรณ์อื่น **[P2]** | auth | — | 200 รายการ / 204 | — |

### 2.2 users (ADMIN)

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/users` | ตารางผู้ใช้ | `user.manage` | `q, role (csv), isActive, sort (fullName, lastLoginAt, createdAt), page, pageSize` | 200 Paginated `UserAdminDto` | DTO มี `isLocked`, `lockedUntil`, `lastLoginAt` · ไม่ส่ง `passwordHash` (mapper ใช้ `satisfies`) |
| POST | `/users` | สร้างผู้ใช้ | `user.manage` | `{ email, fullName, nickname?, position?, phone?, role }` | 201 `{ data: { user, temporaryPassword } }` | email ซ้ำตอบ `409 EMAIL_TAKEN` · รหัสชั่วคราว 16 ตัวจาก CSPRNG แสดงครั้งเดียว (`no-store` และ redact ใน log) · ตั้ง `mustChangePassword = true`, `passwordExpiresAt = now + 72 ชม.` · ตัวเลือก "ส่งอีเมลเชิญ" เป็น **[P2]** |
| GET | `/users/:id` | รายละเอียด | `user.manage` | — | 200 `UserAdminDto` + `stats { ownedOpenProposalCount, openTaskCount, activeSessionCount }` | — |
| PATCH | `/users/:id` | แก้ข้อมูล | `user.manage` | `{ fullName?, nickname?, position?, phone?, email?, expectedUpdatedAt? }` | 200 | role และสถานะแก้ผ่าน endpoint เฉพาะ ถ้าส่งมาตอบ 400 |
| PUT | `/users/:id/role` | เปลี่ยนบทบาท | `user.manage` | `{ role }` | 200 | `422 SELF_ROLE_CHANGE`, `LAST_ADMIN` (lock แถว ADMIN ด้วย `FOR UPDATE`) · revoke ทุก session ด้วย `ROLE_CHANGE` · บันทึก `ROLE_CHANGE` (หัวข้อ 5.8) |
| POST | `/users/:id/reset-password` | รีเซ็ตรหัสผ่าน | `user.manage` | — | 200 `{ data: { temporaryPassword } }` | revoke ทุก session ด้วย `PASSWORD_RESET` · ตั้ง `mustChangePassword`, `passwordExpiresAt = now + 72 ชม.` · ปลดล็อก · บันทึก `PASSWORD_RESET` · ใช้กับตัวเองไม่ได้ (ให้ใช้ change-password) |
| GET | `/users/:id/deactivation-plan` | ข้อมูลก่อนปิดบัญชี (BR-02) | `user.manage` | — | 200 `{ ownedOpenProposals[], openAssignedTasks { count, byProposal[] }, membershipCount }` | "ยังไม่ปิด" = DRAFT, IN_PROGRESS, ON_HOLD |
| POST | `/users/:id/deactivate` | ปิดบัญชี | `user.manage` | `{ proposalOwners: [{ proposalId, newOwnerId }], openTasks: { mode: 'TRANSFER'\|'UNASSIGN', toUserId? } }` | 200 | `422 OWNER_HAS_OPEN_PROPOSALS`, `SELF_DEACTIVATE`, `LAST_ADMIN`, `ASSIGNEE_INACTIVE` (newOwnerId/toUserId ต้อง Active และไม่ใช่คนที่ถูกปิด) · ทำทุกอย่างใน tx เดียว (หัวข้อ 5.8) |
| POST | `/users/:id/activate` | เปิดบัญชีคืน | `user.manage` | `{ resetPassword?: boolean }` | 200 + `temporaryPassword?` | ตั้ง `isActive = true`, **`deactivatedAt = null`** (CHECK `users_active_vs_deactivated`), `failedLoginCount = 0`, `lockedUntil = null` · บันทึก `USER_ACTIVATE` |
| POST | `/users/:id/unlock` | ปลดล็อก | `user.manage` | — | 200 | ล้าง `lockedUntil`, ตั้ง `failedLoginCount = 0` · บันทึก `UPDATE` |
| GET · DELETE | `/users/:id/sessions` | ดู session / บังคับออกทุกอุปกรณ์ **[P2]** | `user.manage` | — | 200 / 204 | `ADMIN_REVOKE` |

### 2.3 stores (ห้าง / แพลตฟอร์ม)

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/stores` | รายการสำหรับหน้า Admin | `master.read` | `channel, isActive, q, includeDeleted, include=usage` | 200 `{ data: StoreDto[] }` | เรียงตาม `sortOrder` · USER เห็นเฉพาะรายการ Active · `includeDeleted` ใช้ได้เฉพาะ `master.delete` · `usage = { proposalCount, activeProposalCount, templateCount }` |
| GET | `/stores/:id` | รายละเอียด | `master.read` | — | 200 `{ data: StoreDto }` | — |
| POST | `/stores` | สร้าง | `master.manage` | `{ code, name, nameTh?, channel, groupName?, colorHex?, note?, sortOrder? }` | 201 | `409 CODE_TAKEN` (นับรวมรายการที่ลบแล้ว มี `details.restorableId` ให้กู้คืนแทน) · `409 NAME_TAKEN` (ชื่อซ้ำในช่องทางเดียวกัน ไม่สนตัวพิมพ์/ช่องว่าง ผ่าน `nameKey` ที่ trigger ตั้งให้) · ไม่ส่ง `sortOrder` = ค่ามากสุด + 1024 · เรียกจาก wizard ได้ (US-M06 AC2) |
| PATCH | `/stores/:id` | แก้ไข/ปิดใช้งาน | `master.manage` | ฟิลด์บางส่วน + `isActive?`, `expectedUpdatedAt?` | 200 + warnings | เปลี่ยน `channel` ขณะถูกอ้างอิงตอบ `409 IN_USE` · ปิดใช้งานขณะมีข้อเสนอ Active ได้ warning `ACTIVE_PROPOSALS_EXIST` |
| PUT | `/stores/:id/logo` | อัปโหลดโลโก้ | `master.manage` | multipart png/jpg/webp ≤ 2 MB | 200 `{ data: { logoUrl } }` | ไม่รับ SVG · re-encode ด้วย sharp |
| PUT | `/stores/order` | เรียงลำดับ | `master.manage` | `{ channel, ids: uuid[] }` | 200 `{ data: [{ id, sortOrder }] }` | ต้องส่งครบทุกรายการ (ที่ยังไม่ลบ) ของช่องทาง ไม่ครบตอบ `422 ORDER_SET_MISMATCH` · ตั้งค่าใหม่เป็น (i+1)×1024 |
| DELETE | `/stores/:id` | ลบ | `master.delete` | — | 204 | ยังถูกอ้างอิงตอบ `409 IN_USE` พร้อม `usage` (BR-01) · soft delete |
| POST | `/stores/:id/restore` | กู้คืนรายการที่ลบ | `trash.restore` | — | 200 | ใช้จาก dialog ตอนชน `CODE_TAKEN` · ชื่อชนกับรายการที่มีอยู่ตอบ `409 NAME_TAKEN` |
| POST | `/store-requests` | แจ้งขอเพิ่มห้าง (US-U16) | `store.request` | `{ channel, name, note? }` | 202 `{ data: { notifiedCount } }` | ส่ง `STORE_REQUEST` ถึง ADMIN และ MANAGER ที่ Active ทุกคน · `linkUrl = /admin/stores?edit=new&name=…` · ไม่สร้างแถวข้อมูล |

### 2.4 shelf-types (รูปแบบชั้นวาง / ประเภท Listing)

ทำงานเหมือน 2.3 ทุกข้อ ยกเว้นไม่มีโลโก้

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/shelf-types` | รายการ | `master.read` | `channel, isActive, q, includeDeleted, include=usage` | 200 `{ data }` | แต่ละรายการมี `defaultTemplate {id, name} \| null` เพื่อให้หน้า Admin เตือนเมื่อไม่มีแม่แบบ |
| GET | `/shelf-types/:id` | รายละเอียด | `master.read` | — | 200 | — |
| POST | `/shelf-types` | สร้างรูปแบบใหม่ (US-A05) | `master.manage` | `{ code, name, nameTh?, description?, channel, colorHex?, sortOrder? }` | 201 | ปรากฏใน wizard ของช่องทางนั้นทันที และใช้แม่แบบ `{channel}:*` อัตโนมัติ |
| PATCH | `/shelf-types/:id` | แก้ไข/ปิดใช้งาน | `master.manage` | ฟิลด์บางส่วน + `isActive?`, `expectedUpdatedAt?` | 200 | กติกาเดียวกับ Store |
| PUT | `/shelf-types/order` | เรียงลำดับ | `master.manage` | `{ channel, ids }` | 200 | — |
| DELETE | `/shelf-types/:id` | ลบ | `master.delete` | — | 204 / `409 IN_USE` | — |
| POST | `/shelf-types/:id/restore` | กู้คืน | `trash.restore` | — | 200 | — |

การจำกัดว่าห้างไหนใช้รูปแบบชั้นวางไหนได้ (Q8) ไม่มีใน Phase 1 ทั้งตารางและ API **(ควรยืนยันกับทีม Trade)**

### 2.5 products

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/products` | ตารางและค้นหา | `master.read` | `q (SKU/ชื่อ/บาร์โค้ด), brand, category, isActive, sort (name, sku, updatedAt), page, pageSize` | 200 Paginated `ProductDto` | USER เห็นเฉพาะรายการ Active |
| GET | `/products/:id` | รายละเอียด | `master.read` | — | 200 | ส่ง `usage` เมื่อผู้เรียกมี `master.manage` |
| POST | `/products` | สร้าง (รวม quick-add ใน wizard ของ ADMIN/MANAGER) | `master.manage` | `{ sku, name, brand?, category?, barcode?, packSize?, note? }` | 201 | `409 SKU_TAKEN` (SKU unique ถาวร ถ้าเป็นรายการที่ลบแล้วมี `details.restorableId`) · `409 BARCODE_TAKEN` (เทียบเฉพาะรายการที่ยังไม่ลบ ตาม `products_barcode_live_key`) · GTIN check digit ผิดตอบ `422 BARCODE_INVALID` · **USER สร้างสินค้าไม่ได้** (Requirements 2.2) |
| PATCH | `/products/:id` | แก้ไข/ปิดใช้งาน | `master.manage` | ฟิลด์บางส่วน + `isActive?`, `expectedUpdatedAt?` | 200 | สินค้าที่ถูกปิดยังอยู่ในข้อเสนอเดิมได้ (BR-10) |
| PUT | `/products/:id/image` | รูปสินค้า | `master.manage` | multipart ≤ 5 MB | 200 `{ data: { imageUrl } }` | re-encode ด้วย sharp ใน request · thumbnail แยกเป็น **[P2]** |
| DELETE | `/products/:id` | ลบ | `master.delete` | — | 204 / `409 IN_USE` | soft delete |
| POST | `/products/:id/restore` | กู้คืน | `trash.restore` | — | 200 | ถ้า barcode ชนกับสินค้าที่ยังใช้อยู่ตอบ `409 BARCODE_TAKEN` |
| GET | `/products/import-template` | ดาวน์โหลดไฟล์แม่แบบ xlsx | `master.manage` | — | 200 xlsx | คอลัมน์ตายตัว: `sku, name, brand, category, barcode, packSize, note` |
| POST | `/products/import` | นำเข้าจากไฟล์แม่แบบ **[Should]** | `master.manage` | multipart `file` (xlsx หรือ csv UTF-8) · query `dryRun=true\|false` (default `true`) | 200 `{ data: { summary { total, create, update, invalid }, rows: [{ rowNumber, sku, action: CREATE\|UPDATE\|INVALID, errors[] }] } }` | ไม่เกิน 5,000 แถว · อ่านแบบ streaming · upsert ด้วย SKU · `dryRun=false` นำเข้าเฉพาะแถวที่ถูกต้องใน tx เดียวและข้ามแถวที่ผิด · SKU ที่ถูกลบไว้รายงานเป็น `INVALID` พร้อมข้อความ "กู้คืนสินค้านี้ก่อน" · บันทึก log ต่อแถว · ไม่มีการจับคู่คอลัมน์ใน MVP |

### 2.6 task-templates

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/task-templates` | รายการแม่แบบ | `master.read` | `channel, shelfTypeId, isActive, q, includeDeleted` | 200 `{ data: TaskTemplateSummaryDto[] }` | summary: `id, code, name, channel, shelfType, isDefault, isActive, itemCount, leafCount, leadTimeDays (= −min(startOffsetDays) ถ้าติดลบ), usageCount, updatedAt` |
| GET | `/task-templates/:id` | แม่แบบพร้อมต้นไม้ item | `master.read` | — | 200 `TaskTemplateDto` (items แบบ nested `children`) | — |
| POST | `/task-templates` | สร้าง | `master.manage` | `{ name, description?, channel, shelfTypeId?, isDefault?, items? }` | 201 | ไม่มี `storeId` ใน Phase 1 · ส่ง `isDefault: true` ระบบปลด default เดิมของ scope เดียวกันให้ (BR-20) |
| PATCH | `/task-templates/:id` | แก้ข้อมูลหัว | `master.manage` | `{ name?, description?, shelfTypeId?, isActive?, expectedUpdatedAt? }` | 200 + warnings | ปิดใช้งานแม่แบบที่เป็น default → ปลด default ใน tx เดียว (`isDefault = false`, `defaultScopeKey = null`) และคืน warning `DEFAULT_CLEARED` |
| PUT | `/task-templates/:id/items` | บันทึกต้นไม้ทั้งชุด | `master.manage` | `{ expectedUpdatedAt, items: TemplateItemInput[] }` (nested `children`) | 200 `TaskTemplateDto` + warnings | **ต้องส่ง `expectedUpdatedAt`** · replace ใน tx เดียว: item ที่มี `id` เก็บไว้, ไม่มี `id` สร้างใหม่, item ที่หายไปถูกลบ (`Task.templateItemId` เป็น SET NULL) · `sortOrder` = ลำดับใน array × 1024 · level ตามความลึก ≤ 3 · `dueOffsetDays ≥ startOffsetDays` ในช่วง ±730 · ช่วงวันของลูกอยู่นอกช่วงแม่ได้ warning |
| POST | `/task-templates/:id/default` | ตั้งเป็นค่าเริ่มต้น | `master.manage` | — | 200 + `meta.replacedTemplateId` | BR-20 · แม่แบบต้อง Active ไม่งั้นตอบ `422 DEFAULT_TEMPLATE_INACTIVE` |
| DELETE | `/task-templates/:id/default` | ยกเลิกค่าเริ่มต้น | `master.manage` | — | 200 | — |
| POST | `/task-templates/:id/duplicate` | ทำสำเนา | `master.manage` | `{ name, shelfTypeId? }` | 201 | สำเนาได้ `isDefault = false`, `code = null` |
| GET | `/task-templates/:id/preview` | ดูวันที่จริงจากวันวางขายตัวอย่าง | `master.read` | `targetDate` (บังคับ) | 200 `{ targetDate, today, leadTimeDays, availableDays, adjustedTaskCount, items (มี startDate, dueDate, durationDays, adjusted) }` | ใช้ `planFromTemplate` ตัวเดียวกับ wizard |
| DELETE | `/task-templates/:id` | ลบ | `master.delete` | — | 200 `{ data: null, warnings }` | soft delete ได้แม้ถูกใช้แล้ว เพราะงานเป็นสำเนา (BR-19) · ถ้าเป็น default ให้ตั้ง `isDefault = false`, `defaultScopeKey = null`, `deletedAt = now()` ใน tx เดียว (CHECK `task_templates_default_scope`) และคืน warning `DEFAULT_CLEARED` เพื่อให้ wizard fallback ตาม 6.2.4 · ข้อเสนอเดิมแสดง "(แม่แบบถูกลบ)" **(ควรยืนยันกับทีม Trade: ยกเว้นแม่แบบจาก BR-01)** |

### 2.7 proposals

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| POST | `/proposals/duplicate-check` | ตรวจข้อเสนอซ้ำทันทีในขั้น 3–4 (BR-04) | `proposal.create` | `{ channel, productIds, rows: [{ storeId, shelfTypeId? }] }` | 200 `{ data: [{ storeId, shelfTypeId, level: 1\|2, matches: [{ proposalId?, code, title?, status, owner, shelfTypeId, productIds, visible }] }] }` | ใช้ POST เพราะ body ยาว แต่ไม่มีผลข้างเคียง · ข้อเสนอที่ผู้เรียกมองไม่เห็นส่งแค่ `code`, ชื่อ Owner และ `status` |
| POST | `/proposals/preview` | preview ของขั้น 6 | `proposal.create` | body เดียวกับ `POST /proposals` | 200 `{ data: [{ rowIndex, title, taskTemplate, defaultTemplateId, availableTemplates[], tasks (tree ที่มีวันที่), adjustedTaskCount, warnings }] }` | ไม่เขียน DB · validation เหมือนตอนสร้างจริง |
| POST | `/proposals` | **Wizard:** สร้าง 1–20 ข้อเสนอ | `proposal.create` และ `proposal.create.assignOwner` เมื่อ `ownerId` ไม่ใช่ตัวเอง | `CreateProposalsInput` (หัวข้อ 6.2) | 201 `{ data: { batchId, proposals[] }, warnings, meta }` · replay ได้ 200 | all-or-nothing ผิดตอบ `422 BATCH_INVALID` พร้อม error รายแถว · `409 ID_CONFLICT` · หัวข้อ 3.1 และ 5.1 |
| GET | `/proposals` | รายการข้อเสนอ | `proposal.read.all` หรือ `proposal.read.own` | ตารางพารามิเตอร์ถัดไป | 200 Paginated `ProposalListItemDto` + `meta.statusCounts` + `meta.batch?` | ไม่รวมรายการที่ถูกลบ · เมื่อกรอง `batchId` มี `meta.batch = { id, createdAt, createdBy, proposalCount }` ใช้แทนหน้าสรุป batch |
| GET | `/proposals/:id` | รายละเอียด header | viewer+ | — | 200 `{ data: ProposalDetailDto }` | — |
| PATCH | `/proposals/:id` | แก้ header | `title`, `description`, `campaignName` → `can.edit` · `storeId` → `can.changeStore` · `shelfTypeId` → `can.changeShelfType` · `actualLaunchDate` → `can.confirmLaunch` | `{ version, title?, description?, campaignName?, storeId?, shelfTypeId?, actualLaunchDate? }` | 200 + warnings | `409 VERSION_CONFLICT` · `422 PROPOSAL_READ_ONLY`, `STORE_LOCKED` (ไม่ใช่ DRAFT, BR-08), `CHANNEL_MISMATCH`, `INACTIVE_REFERENCE`, `LAUNCH_DATE_IN_FUTURE` (`actualLaunchDate` ต้อง ≤ วันนี้) · ปุ่ม "ยืนยันวางขายแล้ว" ใช้ endpoint นี้ · เปลี่ยนรูปแบบชั้นวางได้ warning `TEMPLATE_AVAILABLE { taskTemplateId }` (BR-07) |
| PUT | `/proposals/:id/target-date` | เปลี่ยนวันวางขายและเลื่อนงาน | `can.changeTargetDate` | `{ version, targetDate, shiftTasks = true, reason?, dryRun? }` | 200 `{ data, meta { deltaDays, shiftedTaskCount, notifiedUserCount } }` | สถานะ IN_PROGRESS ต้องมี `reason` ไม่งั้น `422 REASON_REQUIRED` · หัวข้อ 5.4 |
| POST | `/proposals/:id/transitions` | เปลี่ยนสถานะ | ตาราง transition ด้านล่าง | `ProposalTransitionInput` (หัวข้อ 6.2) | 200 `{ data: ProposalDetailDto, warnings }` | — |
| POST | `/proposals/:id/apply-template` | เพิ่มงานจากแม่แบบต่อท้าย (BR-07) | `can.manageTasks` | `{ taskTemplateId, excludedTemplateItemIds? }` | 200 `MutationResult<{ addedTaskCount, adjustedTaskCount }>` | ไม่ลบงานเดิม · งาน `assignToOwner` มอบให้ Owner (ถ้า Owner inactive ตอบ `422 OWNER_INACTIVE`) · บันทึก `TEMPLATE_APPLY` |
| POST | `/proposals/:id/duplicate` | ทำสำเนาไปห้างอื่น **[P2]** (US-U19 Could) | `proposal.create` และ viewer+ ของต้นทาง | `{ batchId, submitAs, rows: [{ storeId, shelfTypeId, targetDate, title? }] }` | 201 รูปแบบเดียวกับ wizard | คัดลอกสินค้า (รีเป็น PENDING) และโครงงาน (รีเป็น TODO) ไม่คัดลอกคอมเมนต์หรือไฟล์ |
| DELETE | `/proposals/:id?version=` | ลบร่าง | `can.delete` | — | 204 | เฉพาะ DRAFT ไม่งั้น `422 ONLY_DRAFT_DELETABLE` · soft delete และไม่นำ `code` กลับมาใช้ (BR-27) |
| GET | `/proposals/:id/products` | สินค้าในข้อเสนอ | viewer+ | — | 200 `{ data: ProposalProductDto[] }` | — |
| POST | `/proposals/:id/products` | เพิ่มสินค้า | `can.edit` | `{ productIds }` | 201 | `422 PRODUCT_LIMIT`, `INACTIVE_REFERENCE` · สินค้าที่มีอยู่แล้วข้าม · `touchProposal` |
| PATCH | `/proposals/:id/products/:productId` | ผลพิจารณาและหมายเหตุ | `can.edit` | `{ status?, note? }` | 200 | ข้อเสนอที่ปิดแล้วแก้ไม่ได้ |
| DELETE | `/proposals/:id/products/:productId` | ถอดสินค้า | `can.edit` | — | 204 | `422 LAST_PRODUCT` (BR-05) |
| GET | `/proposals/:id/members` | สมาชิก | viewer+ | — | 200 `[{ user, isOwner, memberRole \| null, addedBy, createdAt, openTaskCount }]` | Owner เป็นแถวแรก |
| POST | `/proposals/:id/members` | เพิ่มสมาชิก | `can.manageMembers` | `{ userId, memberRole }` | 201 | ผู้ใช้ต้อง Active (`422 ASSIGNEE_INACTIVE`) · `409 ALREADY_MEMBER`, `422 OWNER_IS_MEMBER` · ส่ง `PROPOSAL_MEMBER_ADDED` |
| PATCH | `/proposals/:id/members/:userId` | เปลี่ยนสิทธิ์ | `can.manageMembers` | `{ memberRole }` | 200 | — |
| DELETE | `/proposals/:id/members/:userId` | ถอดสมาชิก | `can.manageMembers` | — | 204 | ยังมีงานค้างตอบ `422 MEMBER_HAS_OPEN_TASKS { openTaskCount }` (BR-15) |
| PUT | `/proposals/:id/owner` | โอน Owner | `can.transferOwner` | `{ version, newOwnerId }` | 200 | BR-16: Owner ใหม่ต้อง Active ถูกถอดจากสมาชิก และ Owner เดิมกลายเป็น EDITOR · ส่ง `PROPOSAL_OWNER_CHANGED` |
| GET | `/proposals/:id/activity` | แท็บประวัติ | `audit.read.proposal` + viewer+ | `cursor, limit, entityType?, action?` | 200 cursor `ActivityLogDto` | ไม่มี ip/ua |

**พารามิเตอร์ของ `GET /proposals`**

| Param | ค่า | หมายเหตุ |
|---|---|---|
| `scope` | `mine` / `all` | default ของ USER คือ `mine` ของ MANAGER/ADMIN คือ `all` · USER ส่ง `all` ก็ยังถูกกรองตามสิทธิ์ |
| `relation` | `OWNER` / `MEMBER` | ใช้คู่กับ `scope=mine` |
| `status`, `health` | csv ของ enum | `health` มีผลเฉพาะข้อเสนอ IN_PROGRESS |
| `channel`, `storeId`, `shelfTypeId`, `ownerId`, `batchId`, `productId` | ค่าเดียวหรือ csv | — |
| `targetDateFrom`/`targetDateTo`, `completedFrom`/`completedTo`, `cancelledFrom`/`cancelledTo` | date | สองคู่หลังนับเป็นวันตามเวลาไทย |
| `hasOverdue` | boolean | — |
| `q` | ค้นในรหัสหรือชื่อ | — |
| `sort` | `targetDate`, `code`, `updatedAt`, `createdAt`, `progressPercent`, `title` | default `targetDate` |

**Transition actions** (`POST /proposals/:id/transitions`) ทุก action เพิ่ม `version` ตั้ง `statusReason` บันทึก `STATUS_CHANGE` และส่ง `PROPOSAL_STATUS_CHANGED` · action ที่ไม่ตรงกับสถานะปัจจุบันตอบ `422 TRANSITION_NOT_ALLOWED` · `can.transitions` ใน DTO บอกว่าผู้ใช้กดอะไรได้บ้าง

| `action` | จาก → ไป | ผู้ทำได้ | Body | ตรวจก่อน (error) | ผลข้างเคียง |
|---|---|---|---|---|---|
| `START` | DRAFT → IN_PROGRESS | ownerLike | `confirmEmpty?` | BR-09 → `422 INACTIVE_REFERENCE` พร้อมรายการที่ต้องแก้ · Owner inactive → `422 OWNER_INACTIVE` · ไม่มีงานและไม่ได้ส่ง `confirmEmpty` → `409 CONFIRMATION_REQUIRED` | ตั้ง `startedAt` · ส่ง `TASK_ASSIGNED` รวบเป็นรายการเดียวต่อคน |
| `HOLD` | IN_PROGRESS → ON_HOLD | ownerLike | `statusReason` | — | หยุดคำนวณ overdue และหยุดส่ง reminder |
| `RESUME` | ON_HOLD → IN_PROGRESS | ownerLike | — | — | `targetDate < today` ได้ warning `TARGET_DATE_PASSED` (BR-03) |
| `COMPLETE` | IN_PROGRESS → COMPLETED | ownerLike · ถ้ายังมี leaf ค้าง ต้องมี `can.forceComplete`, `force: true` และ `statusReason` | `actualLaunchDate?` (บังคับถ้ายังว่าง), `productResults?`, `force?`, `statusReason?` | `422 TASKS_INCOMPLETE { openLeafCount }`, `REASON_REQUIRED`, `LAUNCH_DATE_REQUIRED`, `LAUNCH_DATE_IN_FUTURE` | ตั้ง `actualLaunchDate` (ถ้าส่งมา) · สินค้า PENDING ที่ไม่ได้ส่งผลมาเปลี่ยนเป็น ACCEPTED · ตั้ง `completedAt` · ข้อเสนออ่านอย่างเดียว |
| `CANCEL` | IN_PROGRESS/ON_HOLD → CANCELLED | ownerLike | `cancelReason`, `statusReason` (บังคับเมื่อ OTHER) | `REASON_REQUIRED` | `BUYER_REJECTED`: สินค้า PENDING เปลี่ยนเป็น REJECTED · ตั้ง `cancelledAt` |
| `REOPEN` | COMPLETED/CANCELLED → IN_PROGRESS | `can.reopen` (`proposal.reopen`) | `statusReason`, `newOwnerId?` | Owner เดิม inactive และไม่ได้ส่ง `newOwnerId` → `422 OWNER_INACTIVE` · `newOwnerId` ต้อง Active | ถ้าส่ง `newOwnerId` โอน Owner ใน tx เดียว (BR-16) · ล้าง `completedAt`, `cancelledAt`, `cancelReason` · คงสถานะงาน ผลรายสินค้า และ `actualLaunchDate` (BR-29) |

`actualLaunchDate` (วันวางขายจริง / วัน Go-live จริง) ใช้คำนวณ health `LATE`, K6 และ K8 ตาม [03-database.md](03-database.md) §12.4 **(ควรยืนยันกับทีม Trade)**

### 2.8 tasks

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/proposals/:id/tasks` | งานทั้งข้อเสนอ (flat) | viewer+ | — | 200 `{ data: TaskDto[], meta }` | เรียงตาม `(level, sortOrder, id)` · ไม่รวมงานที่ถูกลบ · เว็บประกอบต้นไม้ด้วย `buildTaskTree` และทำตัวกรองด่วนฝั่ง client · `meta` = `{ today, timezone, dueSoonDays, taskCount, softLimit, proposal: ProposalProgressDto & { code, status, targetDate, version } }` |
| POST | `/proposals/:id/tasks` | สร้างงานระดับใดก็ได้ | `can.manageTasks` หรือ `can.addChild` ของงานแม่ | `CreateTaskInput` (หัวข้อ 6.3) | 201 `MutationResult<TaskDto>` + `meta.addedMembers` | level คำนวณจากงานแม่ ถ้างานแม่เป็นระดับ 3 ตอบ `422 TASK_DEPTH_EXCEEDED` · ไม่ส่ง `dueDate` = ใช้ `dueDate` ของงานแม่ · ไม่ส่ง `assignees` = ใช้ผู้รับผิดชอบหลักของงานแม่ถ้ายัง Active (ข้ามคน inactive) · `[]` = ไม่มีผู้รับผิดชอบ · ใช้ C8 · เพิ่ม VIEWER อัตโนมัติ (BR-14) · หัวข้อ 3.3 |
| GET | `/tasks/:id` | รายละเอียดสำหรับ drawer | viewer+ | — | 200 `{ data: TaskDto & { description, path[], proposal {id, code, title, status}, children: TaskDto[], descendantCount, doneDescendantCount, createdBy } }` | — |
| PATCH | `/tasks/:id` | แก้ field | `can.edit` | `UpdateTaskInput` | 200 `MutationResult<TaskDto>` | `409 VERSION_CONFLICT`, `422 DATE_ORDER` · warning `OUTSIDE_PARENT_RANGE` ซึ่ง "ขยายช่วงงานแม่" = เว็บ PATCH งานแม่ด้วย `suggestedParentRange` · หัวข้อ 3.4 |
| PUT | `/tasks/:id/status` | ติ๊ก checkbox หรือเปลี่ยน chip สถานะ | `can.setStatus` | `{ status, cascade = false }` (**ไม่มี `version`**) | 200 `MutationResult<TaskDto>` + `meta { cascadedCount, rolledUpTaskIds, notifiedUserCount }` | C1–C13 · `409 CONFIRMATION_REQUIRED`, `422 PARENT_STATUS_DERIVED`, `PROPOSAL_READ_ONLY` · หัวข้อ 3.6 และ 5.2 |
| PATCH | `/tasks/:id/move` | เรียงใหม่, เปลี่ยน parent, indent/outdent | `can.move` ของงาน และ `can.addChild` ของ parent ปลายทาง (ถ้าไม่ใช่ editorLike) | `{ version, parentId, afterId?, beforeId? }` | 200 `MutationResult<TaskDto>` | ย้ายได้ภายในข้อเสนอเดียวกัน · ส่งแค่ `afterId` หรือแค่ `beforeId` ได้ · `422 TASK_DEPTH_EXCEEDED` (นับลูกหลานที่ soft delete ด้วย), `TASK_TREE_INVALID`, `409 POSITION_STALE` · หัวข้อ 3.5 และ 5.3 |
| PUT | `/tasks/:id/assignees` | ตั้งผู้รับผิดชอบทั้งชุด | `can.assign` | `{ assignees: [{ userId, isPrimary }] }` (0–20 คน) | 200 `MutationResult<TaskAssigneeDto[]>` + `meta.addedMembers` | ไม่ระบุคนหลักเลย = คนแรกเป็นหลัก · ระบุมากกว่า 1 คนตอบ 400 · ผู้ใช้ไม่ Active ตอบ `422 ASSIGNEE_INACTIVE` · เพิ่ม VIEWER อัตโนมัติ · บันทึก `ASSIGN`/`UNASSIGN` · ไม่ cascade ลงงานลูก |
| DELETE | `/tasks/:id?version=` | ลบทั้ง subtree | `can.delete` | — | 200 `MutationResult<{ deletedIds, deletedAt, undoUntil }>` | soft delete ทุกแถวที่ยังไม่ลบด้วย `deletedAt` ค่าเดียว · คำนวณงานแม่ใหม่ (C9, BR-06) · หัวข้อ 5.9 |
| POST | `/tasks/:id/restore` | เลิกทำการลบ | ผู้ลบเองภายใน 10 วินาที · กู้คืนภายใน 30 วันด้วย `trash.restore` เป็น **[P2]** | `{ deletedAt }` | 200 `MutationResult<{ restoredIds }>` | `422 UNDO_EXPIRED`, `PARENT_DELETED`, `TASK_TREE_INVALID` · บันทึก `RESTORE` |
| GET | `/tasks/:id/activity` | ประวัติของงาน | viewer+ | `cursor, limit` | 200 cursor | — |
| POST | `/proposals/:id/tasks/bulk` | bulk action **[P2]** | ต้องมีสิทธิ์ทุกงานที่เลือก (all-or-nothing) | `{ taskIds (1–200), op: ASSIGN \| SHIFT_DATES \| SET_PRIORITY \| DELETE, ... }` | 200 `MutationResult<{ affectedCount }>` | ไม่มี `SET_STATUS` แบบค่าเดียวทั้งชุด เพราะทำให้สถานะเดิมหาย (ดูหัวข้อ 5.2) |
| GET | `/me/tasks` | งานของฉัน (US-C02) | `dashboard.view.own` | `bucket? (csv), proposalId?, q?` | 200 `{ data: { groups: { OVERDUE, TODAY, THIS_WEEK, LATER, NO_DUE, ON_HOLD } }, meta { today, counts } }` | ทุกระดับที่ตนรับผิดชอบในข้อเสนอ IN_PROGRESS และ ON_HOLD · งานของข้อเสนอ ON_HOLD อยู่กลุ่ม `ON_HOLD` เสมอและไม่มี dueState (BR-23) · ไม่เกิน 500 แถวต่อกลุ่ม |
| POST | `/tasks/transfer` | โอนงานข้ามข้อเสนอ **[Should]** (US-M05) | `task.transfer.bulk` | `{ fromUserId, toUserId, taskIds? }` | 200 `{ data: { transferredCount, proposalCount } }` | ไม่ส่ง `taskIds` = โอนงานค้างทั้งหมด · `toUserId` ต้อง Active และ ≠ `fromUserId` · สถานะ primary ย้ายตาม · เพิ่ม VIEWER อัตโนมัติ · `TASK_ASSIGNED` รวบเป็นรายการเดียว |

### 2.9 comments

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/proposals/:id/comments` | คอมเมนต์ทั้งข้อเสนอ หรือเฉพาะงาน | viewer+ | `targetType?, targetId?, cursor, limit, order=asc\|desc` | 200 cursor `CommentDto[]` | คอมเมนต์ที่ถูกลบส่งเป็น `{ isDeleted: true, body: null }` · ซ่อนคอมเมนต์ของงานที่ถูกลบ |
| POST | `/proposals/:id/comments` | เพิ่มคอมเมนต์ (plain text) | `comment.create` + viewer+ | `{ targetType, targetId, body (1–5000) }` | 201 `{ data: CommentDto }` | target ต้องอยู่ในข้อเสนอนี้ ไม่งั้น `422 TARGET_NOT_IN_PROPOSAL` · ส่ง `COMMENT_ADDED` · ทำได้ทุกสถานะ (BR-22) · `touchProposal` · `mentionedUserIds` และ `COMMENT_MENTION` เป็น **[P2]** |
| PATCH | `/comments/:id` | แก้คอมเมนต์ **[P2]** | `comment.update.own` (ผู้เขียน) | `{ body, mentionedUserIds }` | 200 | ตั้ง `editedAt` แสดง "(แก้ไขแล้ว)" |
| DELETE | `/comments/:id` | ลบคอมเมนต์ | ผู้เขียน (`comment.update.own`) หรือ `comment.moderate` | — | 204 | soft delete · `touchProposal` |

### 2.10 attachments และ media

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/proposals/:id/attachments` | รายการไฟล์และลิงก์ | viewer+ | `targetType?, targetId?, kind?, cursor, limit` | 200 cursor `AttachmentDto[]` | — |
| POST | `/proposals/:id/attachments` | อัปโหลดไฟล์ (FILE) | `can.attach` ของข้อเสนอ หรือของงานเป้าหมาย | multipart: `file, targetType, targetId, fileName?` | 201 `AttachmentDto` | `413 FILE_TOO_LARGE`, `415 FILE_TYPE_NOT_ALLOWED` (allowlist หัวข้อ 7) · บันทึก `ATTACHMENT_ADD` · ทำได้แม้ข้อเสนอปิดแล้ว (BR-22) · `touchProposal` |
| POST | `/proposals/:id/links` | แนบลิงก์ (LINK) | เหมือนแถวบน | `{ targetType, targetId, fileName, url }` | 201 | รับเฉพาะ `https://` ยาวไม่เกิน 1000 ตัว · server ไม่ fetch URL |
| GET | `/attachments/:id/download` | ดาวน์โหลด (MVP: stream) | viewer+ | `disposition=inline\|attachment` | 200 stream | ตรวจสิทธิ์ก่อนทุกครั้ง · headers `Content-Disposition` แบบ `filename*=UTF-8''…`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` · `inline` ได้เฉพาะรูปและ PDF · LINK ตอบ `400` · S3 driver + presigned URL อายุ 5 นาทีเป็น **[P2]** |
| DELETE | `/attachments/:id` | ลบ | ผู้แนบ (`attachment.delete.own`) หรือ ownerLike · ข้อเสนอที่ปิดแล้ว: เฉพาะ `proposal.update.all` | — | 204 | soft delete · ไฟล์ใน storage ยังเก็บไว้ · บันทึก `ATTACHMENT_REMOVE` |
| GET | `/media/:key` | โลโก้ รูปสินค้า avatar | auth | — | 200 image | `private, max-age=86400, immutable` |

### 2.11 activity log

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/activity-logs` | audit ทั้งระบบ | `audit.read.all` | `actorId, entityType (csv), entityId, action (csv), proposalId, from, to, q, cursor, limit` | 200 cursor `ActivityLogDto` (มี ip/ua) | อ่านอย่างเดียว ไม่มี endpoint แก้หรือลบ |
| GET | `/activity-logs/export` | export xlsx **[P2]** | `audit.read.all` | filter ชุดเดียวกัน (ช่วงไม่เกิน 1 ปี) | 200 xlsx stream | บันทึก `EXPORT` + `REPORT` พร้อม filter และ rowCount |

ประวัติระดับข้อเสนอและระดับงานอยู่ที่ `GET /proposals/:id/activity` และ `GET /tasks/:id/activity`

### 2.12 notifications (ในแอป)

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/notifications` | รายการแจ้งเตือน | auth (เฉพาะของตัวเอง) | `unreadOnly, cursor, limit (≤ 50)` | 200 `{ data, meta { nextCursor, unreadCount } }` | — |
| GET | `/notifications/unread-count` | ตัวเลขที่กระดิ่ง | auth | — | 200 `{ data: { count } }` | เว็บ poll ทุก 60 วินาที |
| POST | `/notifications/:id/read` | ทำเครื่องหมายว่าอ่านแล้ว | auth (ผู้รับ) | — | 204 | เรียกซ้ำได้ · ไม่ใช่ผู้รับตอบ 404 |
| POST | `/notifications/read-all` | อ่านทั้งหมด | auth | `{ before? }` (datetime) | 200 `{ data: { updatedCount } }` | `before` กันไม่ให้รายการที่เพิ่งเข้ามาถูกทำเครื่องหมายไปด้วย |

### 2.13 dashboard (Admin Monitor) และ reports

ตัวกรองร่วม (`DashboardQuery`): `channel`, `storeId` (csv), `shelfTypeId` (csv), `ownerId` · และสำหรับ endpoint ที่อิงช่วงเวลา: `period` (`THIS_MONTH`, `THIS_QUARTER`, `THIS_YEAR`, `CUSTOM`), `from`, `to` (บังคับเมื่อ `CUSTOM` ช่วงไม่เกิน 2 ปี)

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/dashboard/summary` | W1: K1–K5 + จำนวนร่าง/พักไว้ | `dashboard.view.all` | `DashboardQuery` | 200 (หัวข้อ 3.7) | ภาพ ณ วันนี้ ไม่ขึ้นกับ `period` · `drilldown` เป็น route ของเว็บพร้อมตัวกรองปัจจุบัน |
| GET | `/dashboard/at-risk` | W4 ข้อเสนอเสี่ยง/ล่าช้า | `dashboard.view.all` | `health` (default `AT_RISK,LATE`), `page`, ตัวกรอง | 200 Paginated `ProposalListItemDto` | เรียง LATE ก่อน แล้วตามวันที่เหลือน้อยไปมาก |
| GET | `/dashboard/workload` | W5 ภาระงานรายบุคคล | `dashboard.view.all` | ตัวกรอง | 200 `[{ user, openTasks, overdue, dueThisWeek }]` | นับงานทุกระดับ เป็นชุดเดียวกับหน้างานของฉัน ([03-database.md](03-database.md) §12.5) |
| GET | `/dashboard/by-store` | W2 สถานะตามห้าง | `dashboard.view.all` | `DashboardQuery` (ช่วงเวลาใช้กับ `targetDate`) | 200 `[{ store, counts { DRAFT, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED } }]` | — |
| GET | `/dashboard/tasks` | รายการงานทั้งฝ่ายสำหรับ `/admin/tasks` (drill-down ของ K4, K5, W5) | `dashboard.view.all` | `due=OVERDUE\|THIS_WEEK`, `unassigned=true`, `assigneeId`, `leafOnly`, `proposalStatus` (csv), `storeId` (csv), `shelfTypeId`, `ownerId`, `channel`, `sort`, `page`, `pageSize` | 200 Paginated `DashboardTaskDto` (= `MyTaskDto` + `assignees`, `proposal.owner`) | ค่าเริ่มต้นดูตารางถัดไป |
| GET | `/dashboard/me` | สรุปหน้าแรกของทุกคน | `dashboard.view.own` | — | 200 `{ myTaskCounts, myProposals (6 รายการ), upcomingLaunches (30 วัน), team? { atRisk, late, overdueLeafTasks } }` | `team` ส่งเฉพาะเมื่อมี `dashboard.view.all` |
| GET | `/dashboard/launch-calendar` | W3 ปฏิทินวันวางขาย **[P2]** | `dashboard.view.all` | `days` (default 90 สูงสุด 180) + ตัวกรอง | 200 `{ from, to, stores: [{ store, proposals: [{ id, code, targetDate, health, progressPercent }] }] }` | — |
| GET | `/dashboard/outcomes` | W6: K6–K9 **[P2]** | `dashboard.view.all` | `DashboardQuery`, `groupBy=store\|shelfType\|channel` | 200 | กรองด้วย `completedAt`/`cancelledAt` · K6/K8 ใช้ `coalesce(actualLaunchDate, วันของ completedAt ตามเวลาไทย)` |
| GET | `/dashboard/recent-activity` | W7 กิจกรรมล่าสุด **[P2]** | `dashboard.view.all` | `limit` (default 20) | 200 `ActivityLogDto[]` | MANAGER เห็นเฉพาะ log ที่มี `proposalId` |
| GET | `/reports/proposals.xlsx`, `/reports/tasks.xlsx` | Export Excel **[P2]** (US-M07 Should) | `report.export` | query เดียวกับ `GET /proposals` | 200 xlsx | รูปแบบปีตาม `dateEra` ของผู้ใช้ · ≤ 10,000 แถว · บันทึก `EXPORT`/`REPORT` · กัน formula injection |

**ค่าเริ่มต้นของ `GET /dashboard/tasks`** (ทำให้ตัวเลขที่คลิกตรงกับรายการที่เปิด)

| เปิดจาก | Query | ขอบเขตที่ได้ |
|---|---|---|
| K4 งานเกินกำหนด | `due=OVERDUE` | `leafOnly=true` · ข้อเสนอ IN_PROGRESS · `dueDate < วันนี้` · ไม่ DONE |
| K5 ยังไม่มีผู้รับผิดชอบ | `unassigned=true` | `leafOnly=true` · ข้อเสนอ IN_PROGRESS · ไม่ DONE · ไม่มี TaskAssignee |
| W5 คลิกชื่อคน | `assigneeId=…` | `leafOnly=false` · ข้อเสนอ IN_PROGRESS + ON_HOLD · ไม่ DONE (เหมือนงานของฉัน) |
| W5 คลิกตัวเลขเกินกำหนด / สัปดาห์นี้ | `assigneeId=…&due=OVERDUE` หรือ `due=THIS_WEEK` | `leafOnly=false` · ข้อเสนอ IN_PROGRESS |

`leafOnly` ตั้งเองได้เพื่อ override ค่าเริ่มต้น

### 2.14 lookups (dropdown และ wizard)

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/lookups/stores` | การ์ดห้างใน wizard | `master.read` | `channel` (บังคับ) | 200 `[{ id, code, name, nameTh, logoUrl, colorHex }]` | เฉพาะ Active เรียงตาม `sortOrder` |
| GET | `/lookups/shelf-types` | radio card ใน wizard | `master.read` | `channel` | 200 `[{ ...ShelfTypeRefDto, description, defaultTemplate: { id, name, itemCount, leadTimeDays } \| null }]` | เฉพาะ Active · `defaultTemplate` ตามกติกา 6.2.4 ใช้แสดง "แม่แบบ 21 งาน · เริ่ม T−60" |
| GET | `/lookups/products` | typeahead สินค้า | `master.read` | `q, limit (≤ 20), excludeIds?` | 200 `[{ id, sku, name, packSize, imageUrl, barcode, brand }]` | เฉพาะ Active · ค่า `q` ที่ตรงกับ `sku` หรือ `barcode` พอดีขึ้นแรก (รองรับเครื่องสแกน) |
| GET | `/lookups/task-templates` | ตัวเลือกแม่แบบในขั้น 6 | `master.read` | `channel, shelfTypeId` | 200 `{ data: TaskTemplateSummaryDto[], meta: { defaultTemplateId } }` | Active · `channel` ตรง · `shelfTypeId` เป็น null หรือตรง (6.2.4) |
| GET | `/lookups/users` | picker ผู้รับผิดชอบ, Owner | `user.read.directory` | `q, limit (≤ 20), proposalId?` | 200 `[{ id, fullName, nickname, avatarUrl, position, isMember? }]` | เฉพาะผู้ใช้ Active · ไม่ส่ง email, phone, role · **ถ้าส่ง `proposalId` ต้องผ่าน `resolveProposalAccess` ก่อน มองไม่เห็นตอบ `404 PROPOSAL_NOT_FOUND`** แล้วจึงเรียงสมาชิกขึ้นก่อน |

label ภาษาไทยของ enum อยู่ใน `packages/shared/src/labels.ts` จึงไม่มี API

### 2.15 settings และ health

| Method | Path | Description | Permission | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET · PATCH | `/settings` | อ่าน/แก้ค่าระบบ **[P2]** (US-A08 Could) | `setting.manage` | PATCH: `{ dueSoonDays? (1–14), atRiskDaysBeforeTarget? (1–60), atRiskProgressThreshold? (1–100), defaultDateEra?, digestTime? (HH:mm), maxUploadMb? (1–25) }` | 200 | zod ตรวจรายคีย์ · บันทึก `UPDATE` + `APP_SETTING` · cache 60 วินาที · MVP ใช้ค่าจาก seed และเว็บอ่านค่าที่ต้องใช้จาก `MeDto.settings` |
| GET | `/api/healthz` | liveness | public | — | 200 | — |
| GET | `/api/readyz` | readiness (DB และ pg-boss) | public (network ภายใน) | — | 200 / 503 | — |

---

## 3. ตัวอย่าง JSON

ตัวอย่างทั้งหมดใช้ `today = 2026-10-01` และ id ชุดนี้ ตัวอย่าง 3.2–3.6 ต่อเนื่องกันบนข้อเสนอเดียว (ตรงกับ wireframe ใน [05-frontend-ux.md](05-frontend-ux.md) §7.6)

| ตัวย่อ | id |
|---|---|
| ต้น (สมชาย ใจดี, USER, Owner) | `019f1af9-2a00-7a01-8a01-0000000000a1` |
| แนน (นภัส วงศ์ใหญ่, MANAGER) | `019f1af9-2a00-7a01-8a01-0000000000a2` |
| ฝน (ฝนทิพย์ ศรีสุข, Trade Marketing) | `019f1af9-2a00-7a01-8a01-0000000000a3` |
| บี (บดินทร์ มั่นคง, QA) | `019f1af9-2a00-7a01-8a01-0000000000a4` |
| วรรณ (วรรณา ทองดี, Finance) | `019f1af9-2a00-7a01-8a01-0000000000a5` |
| BIGC / WATSONS / SEVEN_ELEVEN | `019f1af9-2a00-7b01-8b01-0000000000b1` / `…b2` / `…b3` |
| EXCLUSIVE_SHELF / NORMAL_SHELF | `019f1af9-2a00-7c01-8c01-0000000000c1` / `…c2` |
| แม่แบบ OFFLINE_NORMAL_BASIC (21 รายการ, 15 leaf, T−60→T+7) / OFFLINE_EXCLUSIVE_BASIC (27 รายการ, 20 leaf) | `019f1af9-2a00-7e01-8e01-0000000000e1` / `…e2` |
| ข้อเสนอ PRP-2026-0042 (Big C · Normal shelf · วางขาย 15 พ.ย. 2569) | `019fba9e-41c0-7f00-9000-000000000042` |

### 3.1 `POST /proposals` (Wizard)

ต้นเลือกสินค้า 3 SKU และห้าง 3 ห้าง 7-Eleven มีข้อเสนอระดับ 2 ซ้ำอยู่ก่อนแล้ว ต้นจึงยืนยันพร้อมเหตุผล

```http
POST /api/v1/proposals
Content-Type: application/json
X-FlowTrade-Request: 1
```

```json
{
  "batchId": "01a0f4c3-1a2b-7c3d-8e4f-5a6b7c8d9e01",
  "channel": "OFFLINE",
  "submitAs": "IN_PROGRESS",
  "productIds": [
    "019f1af9-2a00-7d01-8d01-0000000000d1",
    "019f1af9-2a00-7d01-8d01-0000000000d2",
    "019f1af9-2a00-7d01-8d01-0000000000d3"
  ],
  "description": "เปิดตัวไลน์ Vit C ใหม่ ไตรมาส 1/2570",
  "members": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a3", "memberRole": "EDITOR" }],
  "rows": [
    {
      "storeId": "019f1af9-2a00-7b01-8b01-0000000000b1",
      "shelfTypeId": "019f1af9-2a00-7c01-8c01-0000000000c2",
      "targetDate": "2027-02-15"
    },
    {
      "storeId": "019f1af9-2a00-7b01-8b01-0000000000b2",
      "shelfTypeId": "019f1af9-2a00-7c01-8c01-0000000000c1",
      "targetDate": "2027-02-15"
    },
    {
      "storeId": "019f1af9-2a00-7b01-8b01-0000000000b3",
      "shelfTypeId": "019f1af9-2a00-7c01-8c01-0000000000c2",
      "targetDate": "2026-11-15",
      "title": "7-Eleven · Normal shelf · เซรั่มวิตามินซี 30 ml (+2) · ล็อตทดลอง",
      "duplicateOverride": { "reason": "PRP-2026-0031 เป็นของทีม KAM ภาคเหนือ ตกลงกับ buyer ให้เสนอแยกชุด" }
    }
  ]
}
```

ไม่ส่ง `taskTemplateId` = ใช้แม่แบบเริ่มต้นตาม 6.2.4 (Normal → `OFFLINE_NORMAL_BASIC`, Exclusive → `OFFLINE_EXCLUSIVE_BASIC`)

**201 Created** (ส่ง `batchId` เดิมซ้ำได้ `200` + header `Idempotent-Replay: true`)

```json
{
  "data": {
    "batchId": "01a0f4c3-1a2b-7c3d-8e4f-5a6b7c8d9e01",
    "proposals": [
      {
        "id": "01a0f4c3-1b00-7000-8000-000000000142", "code": "PRP-2026-0142",
        "title": "Big C · Normal shelf · เซรั่มวิตามินซี 30 ml (+2)", "channel": "OFFLINE", "status": "IN_PROGRESS",
        "store": { "id": "019f1af9-2a00-7b01-8b01-0000000000b1", "code": "BIGC", "name": "Big C", "nameTh": "บิ๊กซี", "channel": "OFFLINE", "logoUrl": "/api/v1/media/stores/bigc-3f9a.png", "colorHex": "#E30613", "isActive": true },
        "shelfType": { "id": "019f1af9-2a00-7c01-8c01-0000000000c2", "code": "NORMAL_SHELF", "name": "Normal shelf", "nameTh": "ชั้นวางปกติ", "channel": "OFFLINE", "colorHex": null, "isActive": true },
        "targetDate": "2027-02-15", "daysUntilTarget": 137,
        "owner": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
        "taskTemplate": { "id": "019f1af9-2a00-7e01-8e01-0000000000e1", "name": "Offline · มาตรฐาน (Normal shelf และรูปแบบอื่น)", "isDeleted": false },
        "taskCount": 21, "leafTaskCount": 15, "adjustedTaskCount": 0, "progressPercent": 0, "health": "ON_TRACK",
        "linkUrl": "/proposals/01a0f4c3-1b00-7000-8000-000000000142"
      },
      {
        "id": "01a0f4c3-1b00-7000-8000-000000000143", "code": "PRP-2026-0143",
        "title": "Watsons · Exclusive shelf · เซรั่มวิตามินซี 30 ml (+2)", "channel": "OFFLINE", "status": "IN_PROGRESS",
        "store": { "id": "019f1af9-2a00-7b01-8b01-0000000000b2", "code": "WATSONS", "name": "Watsons", "nameTh": "วัตสัน", "channel": "OFFLINE", "logoUrl": null, "colorHex": null, "isActive": true },
        "shelfType": { "id": "019f1af9-2a00-7c01-8c01-0000000000c1", "code": "EXCLUSIVE_SHELF", "name": "Exclusive shelf", "nameTh": "ชั้นวางเฉพาะแบรนด์", "channel": "OFFLINE", "colorHex": null, "isActive": true },
        "targetDate": "2027-02-15", "daysUntilTarget": 137,
        "owner": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
        "taskTemplate": { "id": "019f1af9-2a00-7e01-8e01-0000000000e2", "name": "Offline · Exclusive shelf", "isDeleted": false },
        "taskCount": 27, "leafTaskCount": 20, "adjustedTaskCount": 0, "progressPercent": 0, "health": "ON_TRACK",
        "linkUrl": "/proposals/01a0f4c3-1b00-7000-8000-000000000143"
      },
      {
        "id": "01a0f4c3-1b00-7000-8000-000000000144", "code": "PRP-2026-0144",
        "title": "7-Eleven · Normal shelf · เซรั่มวิตามินซี 30 ml (+2) · ล็อตทดลอง", "channel": "OFFLINE", "status": "IN_PROGRESS",
        "store": { "id": "019f1af9-2a00-7b01-8b01-0000000000b3", "code": "SEVEN_ELEVEN", "name": "7-Eleven", "nameTh": "เซเว่น อีเลฟเว่น", "channel": "OFFLINE", "logoUrl": null, "colorHex": null, "isActive": true },
        "shelfType": { "id": "019f1af9-2a00-7c01-8c01-0000000000c2", "code": "NORMAL_SHELF", "name": "Normal shelf", "nameTh": "ชั้นวางปกติ", "channel": "OFFLINE", "colorHex": null, "isActive": true },
        "targetDate": "2026-11-15", "daysUntilTarget": 45,
        "owner": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
        "taskTemplate": { "id": "019f1af9-2a00-7e01-8e01-0000000000e1", "name": "Offline · มาตรฐาน (Normal shelf และรูปแบบอื่น)", "isDeleted": false },
        "taskCount": 21, "leafTaskCount": 15, "adjustedTaskCount": 6, "progressPercent": 0, "health": "ON_TRACK",
        "linkUrl": "/proposals/01a0f4c3-1b00-7000-8000-000000000144"
      }
    ]
  },
  "warnings": [
    {
      "code": "TEMPLATE_DATES_ADJUSTED", "path": "rows[2]",
      "message": "มี 6 งานถูกปรับวันเป็นวันนี้ เพราะแม่แบบต้องเริ่ม 60 วันก่อนวางขาย แต่เหลือ 45 วัน",
      "details": { "proposalCode": "PRP-2026-0144", "requiredLeadDays": 60, "availableDays": 45, "adjustedTaskCount": 6 }
    },
    {
      "code": "DUPLICATE_OVERRIDDEN", "path": "rows[2]",
      "message": "บันทึกการยืนยันว่าไม่ใช่ข้อเสนอซ้ำกับ PRP-2026-0031 แล้ว",
      "details": { "level": 2, "matchedCodes": ["PRP-2026-0031"] }
    }
  ],
  "meta": { "today": "2026-10-01", "createdCount": 3, "notifiedUserCount": 1 }
}
```

- 6 งานที่ถูกปรับคืองานทั้งกลุ่ม "เตรียมเอกสารนำเสนอ (Listing kit)" (T−60 → T−46) ส่วน "นำเสนอและเจรจากับ Buyer" เริ่ม T−45 = วันนี้พอดีจึงไม่ถูกปรับ
- `notifiedUserCount: 1` คือฝนได้ `PROPOSAL_MEMBER_ADDED` รวบเป็นรายการเดียวสำหรับ 3 ข้อเสนอ · งานทุกรายการมอบให้ต้น (`assignToOwner = true`) ซึ่งเป็นผู้สร้างเอง จึงไม่แจ้งเตือนตัวเอง

**422 กรณีมีแถวผิด** (BR-21): ไม่มีข้อเสนอใดถูกสร้าง ไม่ใช้เลขรหัส และแถว `proposal_batches` rollback ตาม จึงส่ง `batchId` เดิมซ้ำหลังแก้ได้

```json
{
  "type": "urn:flowtrade:error:batch-invalid",
  "title": "สร้างข้อเสนอไม่สำเร็จ",
  "status": 422,
  "code": "BATCH_INVALID",
  "detail": "มี 2 แถวที่ต้องแก้ไข ยังไม่มีข้อเสนอใดถูกสร้าง",
  "errors": [
    {
      "path": "rows[1].shelfTypeId", "code": "INACTIVE_REFERENCE",
      "message": "รูปแบบชั้นวาง Exclusive shelf ถูกปิดใช้งานแล้ว",
      "details": { "entityType": "SHELF_TYPE", "id": "019f1af9-2a00-7c01-8c01-0000000000c1" }
    },
    {
      "path": "rows[2].duplicateOverride", "code": "DUPLICATE_PROPOSAL_UNCONFIRMED",
      "message": "มีข้อเสนอสินค้า ห้าง และรูปแบบเดียวกันอยู่แล้ว กรุณายืนยันพร้อมเหตุผล",
      "details": { "matches": [{ "code": "PRP-2026-0031", "status": "IN_PROGRESS", "owner": { "fullName": "อรุณี แสงทอง", "nickname": "แอน" }, "visible": false }] }
    }
  ],
  "requestId": "01a0f4c3-9e77-7abc-8def-0123456789ab"
}
```

### 3.2 `GET /proposals/:id/tasks` (flat list)

PRP-2026-0042 สร้างเมื่อ 14 ก.ย. 2569 จากแม่แบบ `OFFLINE_NORMAL_BASIC` แล้วต้นเพิ่มรายการย่อย 2 ข้อใต้ "กรอก New item / Listing form ของห้าง" ข้อเสนอนี้มี 23 งาน ตัวอย่างแสดง 9 แถว (กลุ่มงานแรกครบ และงานระดับ 1 ถัดไปอีก 1 งาน) ผู้ดูคือต้น (Owner) ทุกแถวจึงได้ `can` เต็ม ยกเว้นระดับ 3 ที่ `addChild: false` ลำดับเป็น `(level, sortOrder, id)` เว็บประกอบต้นไม้เอง

```http
GET /api/v1/proposals/019fba9e-41c0-7f00-9000-000000000042/tasks
```

```json
{
  "data": [
    {
      "id": "019fba9e-41c1-7000-8000-000000000101", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": null, "level": 1,
      "title": "เตรียมเอกสารนำเสนอ (Listing kit)", "status": "IN_PROGRESS", "priority": "MEDIUM",
      "startDate": "2026-09-16", "dueDate": "2026-09-30", "durationDays": 15, "dueState": "OVERDUE", "daysUntilDue": -1,
      "sortOrder": 1024, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "TRD", "templateItemId": "019f1af9-2a10-7000-8000-000000000a01",
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": null, "completedBy": null,
      "progress": { "done": 4, "total": 5 }, "overdueDescendantCount": 1, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-29T08:30:00.000Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000109", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": null, "level": 1,
      "title": "นำเสนอและเจรจากับ Buyer", "status": "TODO", "priority": "MEDIUM",
      "startDate": "2026-10-01", "dueDate": "2026-10-15", "durationDays": 15, "dueState": "ON_TRACK", "daysUntilDue": 14,
      "sortOrder": 2048, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "TRD", "templateItemId": "019f1af9-2a10-7000-8000-000000000a07",
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": null, "completedBy": null,
      "progress": { "done": 0, "total": 3 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-14T03:00:00.000Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000102", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000101", "level": 2,
      "title": "จัดทำ Product presentation", "status": "DONE", "priority": "MEDIUM",
      "startDate": "2026-09-16", "dueDate": "2026-09-23", "durationDays": 8, "dueState": "NONE", "daysUntilDue": null,
      "sortOrder": 1024, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "MKT", "templateItemId": "019f1af9-2a10-7000-8000-000000000a02",
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": "2026-09-22T04:05:10.002Z",
      "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
      "progress": { "done": 2, "total": 2 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-22T04:05:10.002Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000105", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000101", "level": 2,
      "title": "กรอก New item / Listing form ของห้าง", "status": "IN_PROGRESS", "priority": "MEDIUM",
      "startDate": "2026-09-21", "dueDate": "2026-09-28", "durationDays": 8, "dueState": "OVERDUE", "daysUntilDue": -3,
      "sortOrder": 2048, "isMilestone": false, "requiresAttachment": true, "responsibleFunction": "TRD", "templateItemId": "019f1af9-2a10-7000-8000-000000000a05",
      "assignees": [
        { "userId": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true, "isPrimary": true },
        { "userId": "019f1af9-2a00-7a01-8a01-0000000000a4", "fullName": "บดินทร์ มั่นคง", "nickname": "บี", "avatarUrl": null, "isActive": true, "isPrimary": false }
      ],
      "completedAt": null, "completedBy": null,
      "progress": { "done": 1, "total": 2 }, "overdueDescendantCount": 1, "outsideParentRange": false,
      "commentCount": 2, "attachmentCount": 1, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-25T03:30:00.000Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000108", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000101", "level": 2,
      "title": "เตรียมตัวอย่างสินค้า (Sample)", "status": "DONE", "priority": "MEDIUM",
      "startDate": "2026-09-24", "dueDate": "2026-09-30", "durationDays": 7, "dueState": "NONE", "daysUntilDue": null,
      "sortOrder": 3072, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "SCM", "templateItemId": "019f1af9-2a10-7000-8000-000000000a06",
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a3", "fullName": "ฝนทิพย์ ศรีสุข", "nickname": "ฝน", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": "2026-09-29T08:30:00.000Z",
      "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a3", "fullName": "ฝนทิพย์ ศรีสุข", "nickname": "ฝน", "avatarUrl": null, "isActive": true },
      "progress": { "done": 1, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 2, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-29T08:30:00.000Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000103", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000102", "level": 3,
      "title": "รวบรวมรูปสินค้าและจุดขาย", "status": "DONE", "priority": "MEDIUM",
      "startDate": "2026-09-16", "dueDate": "2026-09-20", "durationDays": 5, "dueState": "NONE", "daysUntilDue": null,
      "sortOrder": 1024, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "ART", "templateItemId": "019f1af9-2a10-7000-8000-000000000a03",
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a3", "fullName": "ฝนทิพย์ ศรีสุข", "nickname": "ฝน", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": "2026-09-20T09:12:44.120Z",
      "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a3", "fullName": "ฝนทิพย์ ศรีสุข", "nickname": "ฝน", "avatarUrl": null, "isActive": true },
      "progress": { "done": 1, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 3, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-20T09:12:44.120Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": false, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000106", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000105", "level": 3,
      "title": "ขอ barcode จากฝ่าย QA", "status": "DONE", "priority": "MEDIUM",
      "startDate": null, "dueDate": "2026-09-28", "durationDays": null, "dueState": "NONE", "daysUntilDue": null,
      "sortOrder": 1024, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": null, "templateItemId": null,
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a4", "fullName": "บดินทร์ มั่นคง", "nickname": "บี", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": "2026-09-25T03:30:00.000Z",
      "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a4", "fullName": "บดินทร์ มั่นคง", "nickname": "บี", "avatarUrl": null, "isActive": true },
      "progress": { "done": 1, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-25T03:30:00.000Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": false, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000104", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000102", "level": 3,
      "title": "สรุปราคาทุน, RSP และ margin", "status": "DONE", "priority": "MEDIUM",
      "startDate": "2026-09-18", "dueDate": "2026-09-23", "durationDays": 6, "dueState": "NONE", "daysUntilDue": null,
      "sortOrder": 2048, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "FIN", "templateItemId": "019f1af9-2a10-7000-8000-000000000a04",
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": "2026-09-22T04:05:10.002Z",
      "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
      "progress": { "done": 1, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 0, "attachmentCount": 1, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-22T04:05:10.002Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": false, "assign": true, "setStatus": true, "attach": true, "comment": true }
    },
    {
      "id": "019fba9e-41c1-7000-8000-000000000107", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": "019fba9e-41c1-7000-8000-000000000105", "level": 3,
      "title": "แนบรูปสินค้าตามสเปกห้าง", "status": "TODO", "priority": "MEDIUM",
      "startDate": null, "dueDate": "2026-09-28", "durationDays": null, "dueState": "OVERDUE", "daysUntilDue": -3,
      "sortOrder": 2048, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": null, "templateItemId": null,
      "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a4", "fullName": "บดินทร์ มั่นคง", "nickname": "บี", "avatarUrl": null, "isActive": true, "isPrimary": true }],
      "completedAt": null, "completedBy": null,
      "progress": { "done": 0, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": false,
      "commentCount": 1, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-09-25T03:31:12.000Z",
      "can": { "edit": true, "delete": true, "move": true, "addChild": false, "assign": true, "setStatus": true, "attach": true, "comment": true }
    }
  ],
  "meta": {
    "today": "2026-10-01", "timezone": "Asia/Bangkok", "dueSoonDays": 3, "taskCount": 23, "softLimit": 500,
    "proposal": {
      "id": "019fba9e-41c0-7f00-9000-000000000042", "code": "PRP-2026-0042", "status": "IN_PROGRESS", "targetDate": "2026-11-15", "version": 5,
      "progressPercent": 25, "leafTaskCount": 16, "doneLeafTaskCount": 4, "overdueLeafCount": 1,
      "health": "AT_RISK", "suggestClose": false, "updatedAt": "2026-09-29T08:30:00.000Z"
    }
  }
}
```

- leaf ทั้งข้อเสนอ 16 ข้อ (แม่แบบมี 15 leaf, "กรอก Listing form" เปลี่ยนจาก leaf เป็นงานแม่ แล้วได้รายการย่อย 2 ข้อ) เสร็จ 4 ข้อ จึงได้ 25% และมี leaf เกินกำหนด 1 ข้อ สุขภาพจึงเป็น `AT_RISK`
- ถ้าผู้ดูเป็นบี (VIEWER ที่รับผิดชอบ "กรอก Listing form") `setStatus`, `attach`, `addChild` (ยกเว้นระดับ 3) เป็น `true` เฉพาะงานนั้นและงานลูก · `edit`, `assign` เป็น `true` เฉพาะรายการที่บีสร้างเอง · `delete`, `move` เป็น `true` เมื่อบีสร้างรายการนั้น **และ** ลูกหลานทุกรายการก็สร้างโดยบี · งานอื่นได้ `false` ทั้งหมด ยกเว้น `comment`

### 3.3 `POST /proposals/:id/tasks`

ต้นเพิ่มรายการย่อยต่อท้าย "แนบรูปสินค้าตามสเปกห้าง" และมอบหมายให้วรรณ ซึ่งยังไม่เป็นสมาชิก

```http
POST /api/v1/proposals/019fba9e-41c0-7f00-9000-000000000042/tasks
```

```json
{
  "parentId": "019fba9e-41c1-7000-8000-000000000105",
  "title": "ฝ่ายการเงินยืนยันราคาขายเข้าในฟอร์ม",
  "priority": "HIGH",
  "startDate": "2026-10-01",
  "durationDays": 3,
  "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a5", "isPrimary": true }],
  "position": { "afterId": "019fba9e-41c1-7000-8000-000000000107" }
}
```

**201 Created** · `Location: /api/v1/tasks/01a0f4c3-5f10-7000-8000-000000000110`

```json
{
  "data": {
    "id": "01a0f4c3-5f10-7000-8000-000000000110", "proposalId": "019fba9e-41c0-7f00-9000-000000000042",
    "parentId": "019fba9e-41c1-7000-8000-000000000105", "level": 3,
    "title": "ฝ่ายการเงินยืนยันราคาขายเข้าในฟอร์ม", "status": "TODO", "priority": "HIGH",
    "startDate": "2026-10-01", "dueDate": "2026-10-03", "durationDays": 3, "dueState": "DUE_SOON", "daysUntilDue": 2,
    "sortOrder": 3072, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": null, "templateItemId": null,
    "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a5", "fullName": "วรรณา ทองดี", "nickname": "วรรณ", "avatarUrl": null, "isActive": true, "isPrimary": true }],
    "completedAt": null, "completedBy": null,
    "progress": { "done": 0, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": true,
    "commentCount": 0, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-10-01T03:20:11.402Z",
    "can": { "edit": true, "delete": true, "move": true, "addChild": false, "assign": true, "setStatus": true, "attach": true, "comment": true }
  },
  "patch": {
    "tasks": [
      { "id": "019fba9e-41c1-7000-8000-000000000105", "progress": { "done": 1, "total": 3 } },
      { "id": "019fba9e-41c1-7000-8000-000000000101", "progress": { "done": 4, "total": 6 } }
    ],
    "proposal": {
      "id": "019fba9e-41c0-7f00-9000-000000000042", "progressPercent": 23, "leafTaskCount": 17, "doneLeafTaskCount": 4,
      "overdueLeafCount": 1, "health": "AT_RISK", "suggestClose": false, "updatedAt": "2026-10-01T03:20:11.402Z"
    }
  },
  "warnings": [
    {
      "code": "OUTSIDE_PARENT_RANGE", "path": "dueDate", "message": "อยู่นอกช่วงของงานแม่",
      "details": {
        "parentId": "019fba9e-41c1-7000-8000-000000000105", "parentStartDate": "2026-09-21", "parentDueDate": "2026-09-28",
        "suggestedParentRange": { "startDate": "2026-09-21", "dueDate": "2026-10-03" }
      }
    }
  ],
  "meta": {
    "today": "2026-10-01",
    "addedMembers": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a5", "memberRole": "VIEWER", "addedById": null }]
  }
}
```

ระบบเพิ่มวรรณเป็น `VIEWER` (BR-14) บันทึก `MEMBER_ADD` (`addedById = null`), `CREATE`, `ASSIGN` และส่ง `TASK_ASSIGNED` ถึงวรรณ · 4/17 ปัดลงได้ 23%

### 3.4 `PATCH /tasks/:id`

ต้นเลื่อนวันของ "แนบรูปสินค้าตามสเปกห้าง" ที่เกินกำหนดอยู่

```http
PATCH /api/v1/tasks/019fba9e-41c1-7000-8000-000000000107
```

```json
{ "version": 1, "startDate": "2026-10-02", "dueDate": "2026-10-06" }
```

**200 OK**

```json
{
  "data": {
    "id": "019fba9e-41c1-7000-8000-000000000107", "proposalId": "019fba9e-41c0-7f00-9000-000000000042",
    "parentId": "019fba9e-41c1-7000-8000-000000000105", "level": 3,
    "title": "แนบรูปสินค้าตามสเปกห้าง", "status": "TODO", "priority": "MEDIUM",
    "startDate": "2026-10-02", "dueDate": "2026-10-06", "durationDays": 5, "dueState": "ON_TRACK", "daysUntilDue": 5,
    "sortOrder": 2048, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": null, "templateItemId": null,
    "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a4", "fullName": "บดินทร์ มั่นคง", "nickname": "บี", "avatarUrl": null, "isActive": true, "isPrimary": true }],
    "completedAt": null, "completedBy": null,
    "progress": { "done": 0, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": true,
    "commentCount": 1, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 2, "updatedAt": "2026-10-01T03:22:10.004Z",
    "can": { "edit": true, "delete": true, "move": true, "addChild": false, "assign": true, "setStatus": true, "attach": true, "comment": true }
  },
  "patch": {
    "tasks": [
      { "id": "019fba9e-41c1-7000-8000-000000000105", "overdueDescendantCount": 0 },
      { "id": "019fba9e-41c1-7000-8000-000000000101", "overdueDescendantCount": 0 }
    ],
    "proposal": {
      "id": "019fba9e-41c0-7f00-9000-000000000042", "progressPercent": 23, "leafTaskCount": 17, "doneLeafTaskCount": 4,
      "overdueLeafCount": 0, "health": "ON_TRACK", "suggestClose": false, "updatedAt": "2026-10-01T03:22:10.004Z"
    }
  },
  "warnings": [
    {
      "code": "OUTSIDE_PARENT_RANGE", "path": "dueDate", "message": "อยู่นอกช่วงของงานแม่",
      "details": {
        "parentId": "019fba9e-41c1-7000-8000-000000000105", "parentStartDate": "2026-09-21", "parentDueDate": "2026-09-28",
        "suggestedParentRange": { "startDate": "2026-09-21", "dueDate": "2026-10-06" }
      }
    }
  ],
  "meta": { "today": "2026-10-01" }
}
```

งานแม่ "กรอก Listing form" และ "เตรียมเอกสารนำเสนอ" ยังเกินกำหนดตามวันของตัวเอง แต่ health ของข้อเสนอนับเฉพาะ leaf (5.7) ข้อเสนอจึงกลับเป็น `ON_TRACK`

**409 VERSION_CONFLICT**: บีเปิด drawer ค้างไว้ตั้งแต่ version 1 แล้วกดบันทึกชื่อใหม่

```json
{
  "type": "urn:flowtrade:error:version-conflict",
  "title": "ข้อมูลถูกแก้ไขโดยผู้อื่น",
  "status": 409,
  "code": "VERSION_CONFLICT",
  "detail": "งานนี้ถูกแก้ไขโดย สมชาย ใจดี (ต้น) เมื่อสักครู่ — โหลดข้อมูลล่าสุด",
  "conflict": {
    "entityType": "TASK", "entityId": "019fba9e-41c1-7000-8000-000000000107",
    "yourVersion": 1, "currentVersion": 2,
    "lastModifiedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
    "lastModifiedAt": "2026-10-01T03:22:10.004Z",
    "changedFields": ["startDate", "dueDate"],
    "current": { "id": "019fba9e-41c1-7000-8000-000000000107", "title": "แนบรูปสินค้าตามสเปกห้าง", "startDate": "2026-10-02", "dueDate": "2026-10-06", "version": 2 }
  },
  "requestId": "01a0f4c3-a1b2-7c3d-8e4f-001122334455"
}
```

`conflict.current` ในการใช้งานจริงเป็น `TaskDto` เต็ม ตัวอย่างนี้ย่อให้สั้น

### 3.5 `PATCH /tasks/:id/move`

ต้นเลือก "ย้ายไปไว้ใต้…" (หรือกด Shift+Tab ขณะแก้ชื่อ) ที่ "แนบรูปสินค้าตามสเปกห้าง" เพื่อเลื่อนขึ้นเป็นงานย่อยของ "เตรียมเอกสารนำเสนอ" วางต่อจาก "กรอก Listing form" โดยส่ง **เฉพาะ `afterId`**

```http
PATCH /api/v1/tasks/019fba9e-41c1-7000-8000-000000000107/move
```

```json
{ "version": 2, "parentId": "019fba9e-41c1-7000-8000-000000000101", "afterId": "019fba9e-41c1-7000-8000-000000000105" }
```

**200 OK**

```json
{
  "data": {
    "id": "019fba9e-41c1-7000-8000-000000000107", "proposalId": "019fba9e-41c0-7f00-9000-000000000042",
    "parentId": "019fba9e-41c1-7000-8000-000000000101", "level": 2,
    "title": "แนบรูปสินค้าตามสเปกห้าง", "status": "TODO", "priority": "MEDIUM",
    "startDate": "2026-10-02", "dueDate": "2026-10-06", "durationDays": 5, "dueState": "ON_TRACK", "daysUntilDue": 5,
    "sortOrder": 2560, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": null, "templateItemId": null,
    "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a4", "fullName": "บดินทร์ มั่นคง", "nickname": "บี", "avatarUrl": null, "isActive": true, "isPrimary": true }],
    "completedAt": null, "completedBy": null,
    "progress": { "done": 0, "total": 1 }, "overdueDescendantCount": 0, "outsideParentRange": true,
    "commentCount": 1, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 3, "updatedAt": "2026-10-01T03:25:02.330Z",
    "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
  },
  "patch": {
    "tasks": [
      { "id": "019fba9e-41c1-7000-8000-000000000105", "progress": { "done": 1, "total": 2 } }
    ],
    "proposal": {
      "id": "019fba9e-41c0-7f00-9000-000000000042", "progressPercent": 23, "leafTaskCount": 17, "doneLeafTaskCount": 4,
      "overdueLeafCount": 0, "health": "ON_TRACK", "suggestClose": false, "updatedAt": "2026-10-01T03:25:02.330Z"
    }
  },
  "warnings": [
    {
      "code": "OUTSIDE_PARENT_RANGE", "path": "dueDate", "message": "อยู่นอกช่วงของงานแม่",
      "details": {
        "parentId": "019fba9e-41c1-7000-8000-000000000101", "parentStartDate": "2026-09-16", "parentDueDate": "2026-09-30",
        "suggestedParentRange": { "startDate": "2026-09-16", "dueDate": "2026-10-06" }
      }
    }
  ],
  "meta": { "today": "2026-10-01" }
}
```

- `sortOrder` = กึ่งกลางระหว่าง "กรอก Listing form" (2048) กับ "เตรียมตัวอย่างสินค้า" (3072) = 2560 · วันที่ของงานที่ย้ายไม่เปลี่ยน (5.8)
- สถานะงานแม่เดิมและใหม่คำนวณใหม่แล้วไม่เปลี่ยน จึงไม่อยู่ใน `patch` (ถ้างานแม่ปลายทาง DONE อยู่ จะได้ warning `PARENT_REOPENED` ตาม C8)

**422 TASK_DEPTH_EXCEEDED**: กด Tab ที่ "กรอก Listing form" (มีรายการย่อยอยู่) เพื่อให้เป็นลูกของ "จัดทำ Product presentation"

```json
{
  "type": "urn:flowtrade:error:task-depth-exceeded",
  "title": "ย้ายงานไม่ได้",
  "status": 422,
  "code": "TASK_DEPTH_EXCEEDED",
  "detail": "งานย่อยนี้มีรายการย่อยอยู่ ย้ายไปเป็นรายการย่อยไม่ได้ เพราะงานลึกได้สูงสุด 3 ระดับ",
  "details": { "maxLevel": 3, "targetLevel": 3, "subtreeHeight": 1, "resultingDeepestLevel": 4, "deletedDescendantCount": 0 },
  "requestId": "01a0f4c3-c2d3-7e4f-8051-6273849506a7"
}
```

### 3.6 `PUT /tasks/:id/status` (ตั้งสถานะปลายทาง พร้อม cascade)

ต้นติ๊กเสร็จที่ "เตรียมเอกสารนำเสนอ" ซึ่งยังมีงานลูกหลานค้าง 3 รายการ

**ครั้งแรก** (ยังไม่ได้ส่ง `cascade`)

```http
PUT /api/v1/tasks/019fba9e-41c1-7000-8000-000000000101/status
```

```json
{ "status": "DONE" }
```

**409 CONFIRMATION_REQUIRED** เว็บนำไปแสดง dialog C5

```json
{
  "type": "urn:flowtrade:error:confirmation-required",
  "title": "ต้องยืนยันก่อนดำเนินการ",
  "status": 409,
  "code": "CONFIRMATION_REQUIRED",
  "detail": "มีงานย่อยที่ยังไม่เสร็จ 3 รายการ ต้องการทำเครื่องหมายเสร็จทั้งหมดหรือไม่?",
  "details": {
    "reason": "CASCADE_DONE",
    "openDescendantCount": 3,
    "openDescendants": [
      { "id": "019fba9e-41c1-7000-8000-000000000105", "title": "กรอก New item / Listing form ของห้าง", "level": 2, "assigneeNicknames": ["ต้น", "บี"] },
      { "id": "019fba9e-41c1-7000-8000-000000000107", "title": "แนบรูปสินค้าตามสเปกห้าง", "level": 2, "assigneeNicknames": ["บี"] },
      { "id": "01a0f4c3-5f10-7000-8000-000000000110", "title": "ฝ่ายการเงินยืนยันราคาขายเข้าในฟอร์ม", "level": 3, "assigneeNicknames": ["วรรณ"] }
    ],
    "willNotifyNicknames": ["บี", "วรรณ"]
  },
  "requestId": "01a0f4c3-b0c1-7d2e-8f30-415263748596"
}
```

**ครั้งที่สอง** หลังผู้ใช้กดยืนยัน: `{ "status": "DONE", "cascade": true }`

**200 OK**

```json
{
  "data": {
    "id": "019fba9e-41c1-7000-8000-000000000101", "proposalId": "019fba9e-41c0-7f00-9000-000000000042", "parentId": null, "level": 1,
    "title": "เตรียมเอกสารนำเสนอ (Listing kit)", "status": "DONE", "priority": "MEDIUM",
    "startDate": "2026-09-16", "dueDate": "2026-09-30", "durationDays": 15, "dueState": "NONE", "daysUntilDue": null,
    "sortOrder": 1024, "isMilestone": false, "requiresAttachment": false, "responsibleFunction": "TRD", "templateItemId": "019f1af9-2a10-7000-8000-000000000a01",
    "assignees": [{ "userId": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true, "isPrimary": true }],
    "completedAt": "2026-10-01T03:30:41.870Z",
    "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true },
    "progress": { "done": 6, "total": 6 }, "overdueDescendantCount": 0, "outsideParentRange": false,
    "commentCount": 0, "attachmentCount": 0, "createdById": "019f1af9-2a00-7a01-8a01-0000000000a1", "version": 1, "updatedAt": "2026-10-01T03:30:41.870Z",
    "can": { "edit": true, "delete": true, "move": true, "addChild": true, "assign": true, "setStatus": true, "attach": true, "comment": true }
  },
  "patch": {
    "tasks": [
      { "id": "019fba9e-41c1-7000-8000-000000000105", "status": "DONE", "completedAt": "2026-10-01T03:30:41.870Z", "dueState": "NONE", "daysUntilDue": null, "progress": { "done": 2, "total": 2 },
        "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true } },
      { "id": "019fba9e-41c1-7000-8000-000000000107", "status": "DONE", "completedAt": "2026-10-01T03:30:41.870Z", "dueState": "NONE", "daysUntilDue": null, "progress": { "done": 1, "total": 1 },
        "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true } },
      { "id": "01a0f4c3-5f10-7000-8000-000000000110", "status": "DONE", "completedAt": "2026-10-01T03:30:41.870Z", "dueState": "NONE", "daysUntilDue": null, "progress": { "done": 1, "total": 1 },
        "completedBy": { "id": "019f1af9-2a00-7a01-8a01-0000000000a1", "fullName": "สมชาย ใจดี", "nickname": "ต้น", "avatarUrl": null, "isActive": true } }
    ],
    "proposal": {
      "id": "019fba9e-41c0-7f00-9000-000000000042", "progressPercent": 35, "leafTaskCount": 17, "doneLeafTaskCount": 6,
      "overdueLeafCount": 0, "health": "ON_TRACK", "suggestClose": false, "updatedAt": "2026-10-01T03:30:41.870Z"
    }
  },
  "warnings": [],
  "meta": { "today": "2026-10-01", "cascadedCount": 3, "rolledUpTaskIds": [], "notifiedUserCount": 2 }
}
```

- บีและวรรณได้ `TASK_COMPLETED` "งานของคุณถูกทำเครื่องหมายเสร็จโดย ต้น" รวบเป็นรายการเดียวต่อคน (BR-30) · ต้นเป็นคนกดเองจึงไม่ได้รับแจ้ง
- `version` ของทุกแถวไม่เปลี่ยน (1.7) · งานระดับ 1 ไม่มีงานแม่ `rolledUpTaskIds` จึงว่าง
- **Phase 1 ไม่มี "เลิกทำ" ของ cascade** (dialog ที่บอกจำนวนคือการยืนยันแล้ว) ดูเหตุผลที่หัวข้อ 5.2
- ถ้าเป็นงาน leaf ทั่วไป ส่ง `{ "status": "DONE" }` ครั้งเดียวได้ 200 ทันที

### 3.7 `GET /dashboard/summary`

```http
GET /api/v1/dashboard/summary
```

**200 OK**

```json
{
  "data": {
    "inProgress": { "total": 38, "byChannel": { "OFFLINE": 29, "ONLINE": 9 } },
    "launchingIn30Days": { "total": 9, "byChannel": { "OFFLINE": 7, "ONLINE": 2 } },
    "atRisk": 4,
    "late": 1,
    "overdueLeafTasks": 23,
    "unassignedLeafTasks": 7,
    "draft": 5,
    "onHold": 2,
    "drilldown": {
      "inProgress": "/proposals?status=IN_PROGRESS",
      "launchingIn30Days": "/proposals?status=IN_PROGRESS&targetDateFrom=2026-10-01&targetDateTo=2026-10-31&sort=targetDate",
      "atRisk": "/proposals?status=IN_PROGRESS&health=AT_RISK",
      "late": "/proposals?status=IN_PROGRESS&health=LATE",
      "overdueLeafTasks": "/admin/tasks?due=OVERDUE",
      "unassignedLeafTasks": "/admin/tasks?unassigned=true",
      "draft": "/proposals?status=DRAFT",
      "onHold": "/proposals?status=ON_HOLD"
    }
  },
  "meta": {
    "today": "2026-10-01", "timezone": "Asia/Bangkok",
    "filters": { "channel": null, "storeIds": [], "shelfTypeIds": [], "ownerId": null },
    "settings": { "atRiskDaysBeforeTarget": 7, "atRiskProgressThreshold": 80 },
    "generatedAt": "2026-10-01T02:00:05.311Z", "refreshAfterSeconds": 300
  }
}
```

ตัวเลขทั้งหมดเป็นภาพ ณ วันนี้ · `drilldown` เป็น route ของเว็บ และ server ต่อตัวกรองปัจจุบัน (`channel`, `storeId`, …) ให้ด้วยเพื่อให้รายการที่เปิดตรงกับตัวเลข (US-M02 AC2) · K6–K9 อยู่ที่ `/dashboard/outcomes` **[P2]**

---

## 4. Canonical permission matrix

### 4.1 Permission keys × roles

key ที่ลงท้าย `.all` ตัดสินจาก role อย่างเดียว · key ที่ลงท้าย `.own`, `.assigned`, `.self` ทุก role ได้ แต่ service ต้องตรวจ relation กับ resource ทุกครั้ง (4.2–4.4)

| Permission key | ความหมาย | ADMIN | MANAGER | USER |
|---|---|:-:|:-:|:-:|
| `profile.update.self` | แก้โปรไฟล์และเปลี่ยนรหัสผ่านของตัวเอง | ✓ | ✓ | ✓ |
| `user.read.directory` | รายชื่อผู้ใช้ Active สำหรับมอบหมายงาน | ✓ | ✓ | ✓ |
| `user.manage` | จัดการผู้ใช้ บทบาท รีเซ็ตรหัส เปิด/ปิดบัญชี ปลดล็อก | ✓ | ✗ | ✗ |
| `master.read` | ดูห้าง รูปแบบชั้นวาง สินค้า แม่แบบ (USER เห็นเฉพาะ Active) | ✓ | ✓ | ✓ |
| `master.manage` | สร้าง แก้ ปิดใช้ เรียงลำดับ นำเข้า ข้อมูลหลักและแม่แบบ | ✓ | ✓ | ✗ |
| `master.delete` | ลบข้อมูลหลักที่ไม่ถูกอ้างอิง (soft delete) | ✓ | ✗ | ✗ |
| `trash.restore` | กู้คืนข้อมูลหลักที่ลบ (และงานภายใน 30 วันใน Phase 2) | ✓ | ✗ | ✗ |
| `store.request` | แจ้งขอเพิ่มห้าง | ✓ | ✓ | ✓ |
| `proposal.create` | สร้างข้อเสนอ ใช้ wizard ตรวจข้อเสนอซ้ำ | ✓ | ✓ | ✓ |
| `proposal.create.assignOwner` | กำหนด Owner เป็นคนอื่นตอนสร้าง | ✓ | ✓ | ✗ |
| `proposal.read.all` | เห็นทุกข้อเสนอ | ✓ | ✓ | ✗ |
| `proposal.read.own` | เห็นข้อเสนอที่ตนเป็น Owner หรือ Member (R-AUTH-1) | ✓ | ✓ | ✓ |
| `proposal.update.all` | สิทธิ์เท่า Owner ในทุกข้อเสนอและทุกงาน | ✓ | ✓ | ✗ |
| `proposal.update.own` | ทำได้ตามคอลัมน์ Owner/Editor ในตาราง 4.2 | ✓ | ✓ | ✓ |
| `proposal.forceComplete` | ปิดข้อเสนอขณะงาน leaf ยังไม่ครบ | ✓ | ✓ | ✗ |
| `proposal.reopen` | เปิดข้อเสนอที่ COMPLETED/CANCELLED ใหม่ | ✓ | ✓ | ✗ |
| `task.manage.own` | จัดการงานทุกระดับในข้อเสนอที่ตนเป็น Owner/Editor | ✓ | ✓ | ✓ |
| `task.update.assigned` | ทำงานที่ตนรับผิดชอบตามกติกา subtree (4.3) | ✓ | ✓ | ✓ |
| `task.transfer.bulk` | โอนงานข้ามข้อเสนอ (US-M05) | ✓ | ✓ | ✗ |
| `comment.create` | คอมเมนต์ในข้อเสนอที่ตนเห็น | ✓ | ✓ | ✓ |
| `comment.update.own` | แก้หรือลบคอมเมนต์ของตัวเอง | ✓ | ✓ | ✓ |
| `comment.moderate` | ลบคอมเมนต์ของคนอื่น | ✓ | ✗ | ✗ |
| `attachment.create` | แนบไฟล์หรือลิงก์ตามสิทธิ์ในข้อเสนอ | ✓ | ✓ | ✓ |
| `attachment.delete.own` | ลบไฟล์ที่ตนแนบ | ✓ | ✓ | ✓ |
| `dashboard.view.own` | หน้าแรกและงานของฉัน | ✓ | ✓ | ✓ |
| `dashboard.view.all` | Admin Monitor dashboard และ `/admin/tasks` | ✓ | ✓ | ✗ |
| `report.export` | Export Excel **[P2]** | ✓ | ✓ | ✗ |
| `audit.read.proposal` | แท็บประวัติของข้อเสนอและงานที่ตนเห็น | ✓ | ✓ | ✓ |
| `audit.read.all` | Audit log ทั้งระบบ รวม ip และ user agent | ✓ | ✗ | ✗ |
| `setting.manage` | ตั้งค่าระบบ (AppSetting) **[P2 สำหรับหน้าแก้]** | ✓ | ✗ | ✗ |

```ts
// packages/shared/src/permissions.ts — แทนไฟล์เดิมของ prototype ทั้งไฟล์
import type { Role } from './enums.js';

export const PERMISSIONS = [
  'profile.update.self', 'user.read.directory', 'user.manage',
  'master.read', 'master.manage', 'master.delete', 'trash.restore', 'store.request',
  'proposal.create', 'proposal.create.assignOwner', 'proposal.read.all', 'proposal.read.own',
  'proposal.update.all', 'proposal.update.own', 'proposal.forceComplete', 'proposal.reopen',
  'task.manage.own', 'task.update.assigned', 'task.transfer.bulk',
  'comment.create', 'comment.update.own', 'comment.moderate',
  'attachment.create', 'attachment.delete.own',
  'dashboard.view.own', 'dashboard.view.all', 'report.export',
  'audit.read.proposal', 'audit.read.all', 'setting.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BASE: readonly Permission[] = [
  'profile.update.self', 'user.read.directory', 'master.read', 'store.request',
  'proposal.create', 'proposal.read.own', 'proposal.update.own',
  'task.manage.own', 'task.update.assigned', 'comment.create', 'comment.update.own',
  'attachment.create', 'attachment.delete.own', 'dashboard.view.own', 'audit.read.proposal',
];
const MANAGER_EXTRA: readonly Permission[] = [
  'master.manage', 'proposal.create.assignOwner', 'proposal.read.all', 'proposal.update.all',
  'proposal.forceComplete', 'proposal.reopen', 'task.transfer.bulk', 'dashboard.view.all', 'report.export',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  USER: new Set(BASE),
  MANAGER: new Set([...BASE, ...MANAGER_EXTRA]),
  ADMIN: new Set(PERMISSIONS),
};
```

**การใช้ key ฝั่งเว็บ (route guard)** ต้องใช้ชุดเดียวกันนี้ และ `requirePermission(p: Permission)` เป็น typed ชื่อผิดจึงเป็น compile error

| หน้าเว็บ | Permission |
|---|---|
| `/admin` (Dashboard), `/admin/tasks` | `dashboard.view.all` |
| `/admin/stores`, `/admin/shelf-types`, `/admin/products`, `/admin/templates` | `master.manage` |
| `/admin/users` | `user.manage` |
| `/admin/activity` | `audit.read.all` |
| `/admin/settings` **[P2]** | `setting.manage` |
| `/proposals/new` | `proposal.create` |

CI มี **RBAC matrix test** แบบ table-driven ที่ import `ROLE_PERMISSIONS` ตัวเดียวกับ guard ทั้ง API และเว็บ (endpoint × role × relation × status → HTTP status ที่คาด)

### 4.2 สิทธิ์ระดับข้อเสนอ (relation × status)

ระบบหา relation ตามลำดับ **PRIVILEGED** (มี `proposal.update.all`) → **OWNER** (`Proposal.ownerId`) → **EDITOR**/**VIEWER** (`ProposalMember.memberRole`) ผู้ที่ถูกมอบหมายงานถูกเพิ่มเป็น VIEWER อัตโนมัติ และได้สิทธิ์ ASSIGNEE ในงานของตน (4.3) · "เปิดอยู่" = DRAFT, IN_PROGRESS หรือ ON_HOLD

| การกระทำ | PRIVILEGED | OWNER | EDITOR | VIEWER | สถานะที่อนุญาต | ถ้าสถานะไม่ตรง |
|---|:-:|:-:|:-:|:-:|---|---|
| ดูข้อเสนอ งาน ไฟล์ และประวัติ | ✓ | ✓ | ✓ | ✓ | ทุกสถานะ | — |
| แก้ `title`, `description`, `campaignName` และสินค้า (`can.edit`) | ✓ | ✓ | ✓ | ✗ | เปิดอยู่ | 422 `PROPOSAL_READ_ONLY` |
| แก้ `targetDate`, `shelfTypeId` | ✓ | ✓ | ✗ | ✗ | เปิดอยู่ | 422 |
| ยืนยันวันวางขายจริง `actualLaunchDate` (`can.confirmLaunch`) | ✓ | ✓ | ✗ | ✗ | IN_PROGRESS, ON_HOLD และใน dialog COMPLETE | 422 |
| แก้ `storeId` | ✓ | ✓ | ✗ | ✗ | DRAFT | 422 `STORE_LOCKED` |
| START, HOLD, RESUME, CANCEL, COMPLETE (งานครบ 100%) | ✓ | ✓ | ✗ | ✗ | ตามตาราง transition | 422 `TRANSITION_NOT_ALLOWED` |
| COMPLETE แบบ force (`can.forceComplete`) | ✓ | ✗ | ✗ | ✗ | IN_PROGRESS | — |
| REOPEN (`can.reopen`) | ✓ | ✗ | ✗ | ✗ | COMPLETED, CANCELLED | — |
| เพิ่ม/ถอดสมาชิก เปลี่ยนสิทธิ์ โอน Owner | ✓ | ✓ | ✗ | ✗ | เปิดอยู่ | 422 |
| ลบข้อเสนอ | ✓ | ✓ | ✗ | ✗ | DRAFT | 422 `ONLY_DRAFT_DELETABLE` |
| เพิ่ม แก้ ลบ ย้าย มอบหมายงานทุกระดับ, apply template | ✓ | ✓ | ✓ | ✗ (ดู 4.3) | เปิดอยู่ (ON_HOLD ทำได้) | 422 `PROPOSAL_READ_ONLY` |
| ติ๊ก/เปลี่ยนสถานะงาน | ✓ | ✓ | ✓ | ✗ (ดู 4.3) | เปิดอยู่ | 422 |
| คอมเมนต์ | ✓ | ✓ | ✓ | ✓ | ทุกสถานะ (BR-22) | — |
| แนบไฟล์หรือลิงก์ | ✓ | ✓ | ✓ | ✗ (ดู 4.3) | ทุกสถานะ (BR-22) | — |
| ลบไฟล์แนบ | ✓ | ✓ | ผู้แนบเท่านั้น | ผู้แนบเท่านั้น | เปิดอยู่ (ข้อเสนอที่ปิดแล้ว: เฉพาะ PRIVILEGED) | 422 |

**ข้อเสนอที่มองไม่เห็น** ตอบ `404` ทุก endpoint (รวม `GET /lookups/users?proposalId=`) ยกเว้นข้อเดียวคือ `POST /proposals/duplicate-check` ที่แสดงเฉพาะ `code`, ชื่อ Owner และ `status` (BR-04)

### 4.3 สิทธิ์ระดับงานของ ASSIGNEE (USER ที่ไม่ใช่ Owner/Editor)

"subtree ของฉัน" คืองาน X ที่ผู้ใช้เป็น `TaskAssignee` ของ X เอง หรือของงานบรรพบุรุษของ X

| Ability (`task.can`) | เงื่อนไข |
|---|---|
| `setStatus` | X อยู่ใน subtree ของฉัน (2.3 "งานของตนและงานลูกหลานทั้งหมด", C10) |
| `addChild` | X อยู่ใน subtree ของฉัน และ `X.level < 3` |
| `edit`, `assign` | X อยู่ใน subtree ของฉัน และ `X.createdById = ฉัน` |
| `delete`, `move` | X อยู่ใน subtree ของฉัน, `X.createdById = ฉัน` **และลูกหลานที่ยังไม่ลบทุกรายการก็สร้างโดยฉัน** (ไม่งั้น `403 FORBIDDEN` + `details.reason = SUBTREE_HAS_OTHERS_ITEMS`) · การย้ายต้องมี `addChild` ที่ parent ปลายทางด้วย (ย้ายขึ้นเป็นระดับ 1 ไม่ได้) |
| `attach` | X อยู่ใน subtree ของฉัน |
| `comment` | เห็นข้อเสนอ |

สำหรับ PRIVILEGED, OWNER และ EDITOR ทุก ability เป็น `true` ยกเว้น `addChild` ที่ `level = 3` และทุกตัว (ยกเว้น `attach`, `comment`) ถูกตัดตามสถานะใน 4.2 **(ควรยืนยันกับทีม Trade: การตีความว่า assignee แก้ไข/มอบหมายได้เฉพาะรายการที่ตนสร้าง)**

### 4.4 Abilities DTO และ pseudo-code การตรวจสิทธิ์

```ts
// packages/shared/src/dto/abilities.ts — API mapper ใช้ `satisfies` และเว็บ import ชุดเดียวกัน
export type ProposalTransitionAction = 'START' | 'HOLD' | 'RESUME' | 'COMPLETE' | 'CANCEL' | 'REOPEN';

export interface ProposalAbilitiesDto {
  edit: boolean;              // title, description, campaignName, สินค้า
  changeTargetDate: boolean;
  changeShelfType: boolean;
  changeStore: boolean;       // DRAFT เท่านั้น
  confirmLaunch: boolean;     // ตั้ง actualLaunchDate
  manageMembers: boolean;
  transferOwner: boolean;
  delete: boolean;            // DRAFT เท่านั้น
  manageTasks: boolean;       // เพิ่ม/แก้/ลบ/ย้ายงานในฐานะ editorLike
  comment: boolean;
  attach: boolean;            // ในฐานะ editorLike (assignee ดู task.can.attach)
  forceComplete: boolean;
  reopen: boolean;
  transitions: ProposalTransitionAction[];  // ปุ่มสถานะที่แสดงได้ (US-U14 AC1)
}

export interface TaskAbilitiesDto {
  edit: boolean; delete: boolean; move: boolean; addChild: boolean;
  assign: boolean; setStatus: boolean; attach: boolean; comment: boolean;
}
```

```ts
// apps/api/src/modules/proposals/proposal-access.service.ts
type Relation = 'PRIVILEGED' | 'OWNER' | 'EDITOR' | 'VIEWER';
const OPEN: ProposalStatus[] = ['DRAFT', 'IN_PROGRESS', 'ON_HOLD'];

async function resolveProposalAccess(tx: Tx, user: AuthUser, proposalId: string): Promise<ProposalAccess> {
  const p = await tx.proposal.findFirst({
    where: { id: proposalId, deletedAt: null },
    select: { id: true, ownerId: true, status: true,
              members: { where: { userId: user.id }, select: { memberRole: true } } },
  });
  if (!p) throw notFound('PROPOSAL_NOT_FOUND');
  const isOwner = p.ownerId === user.id;
  const memberRole = p.members[0]?.memberRole ?? null;
  if (!user.has('proposal.read.all') && !isOwner && memberRole === null)
    throw notFound('PROPOSAL_NOT_FOUND');                           // ไม่เปิดเผยว่ามีอยู่

  const relation: Relation = user.has('proposal.update.all') ? 'PRIVILEGED'
    : isOwner ? 'OWNER' : (memberRole ?? 'VIEWER');               // MANAGER ที่ไม่ใช่สมาชิกก็เป็น PRIVILEGED แล้ว
  const ownerLike = relation === 'PRIVILEGED' || relation === 'OWNER';
  const editorLike = ownerLike || relation === 'EDITOR';
  const open = OPEN.includes(p.status);

  const can: ProposalAbilitiesDto = {
    edit: editorLike && open,
    changeTargetDate: ownerLike && open,
    changeShelfType: ownerLike && open,
    changeStore: ownerLike && p.status === 'DRAFT',
    confirmLaunch: ownerLike && (p.status === 'IN_PROGRESS' || p.status === 'ON_HOLD'),
    manageMembers: ownerLike && open,
    transferOwner: ownerLike && open,
    delete: ownerLike && p.status === 'DRAFT',
    manageTasks: editorLike && open,
    comment: true,
    attach: editorLike,
    forceComplete: user.has('proposal.forceComplete') && p.status === 'IN_PROGRESS',
    reopen: user.has('proposal.reopen') && (p.status === 'COMPLETED' || p.status === 'CANCELLED'),
    transitions: allowedTransitions(p.status, ownerLike, user),   // ตาราง transition ใน 2.7
  };
  return { proposal: p, relation, ownerLike, editorLike, open, can };
}

function taskAbilities(access: ProposalAccess, user: AuthUser, node: SkeletonTask, tree: Skeleton): TaskAbilitiesDto {
  const { open } = access;
  if (access.editorLike) {
    return { edit: open, delete: open, move: open, assign: open, setStatus: open,
             addChild: open && node.level < 3, attach: true, comment: true };
  }
  const mine = tree.pathToRoot(node).some((t) => t.assigneeIds.includes(user.id));      // กติกา subtree
  const created = mine && node.createdById === user.id;
  const ownsWholeSubtree = created && tree.descendantsOf(node).every((d) => d.createdById === user.id);
  return {
    setStatus: open && mine,
    addChild: open && mine && node.level < 3,
    edit: open && created,
    assign: open && created,
    delete: open && ownsWholeSubtree,          // ลบทั้ง subtree ต้องไม่มีรายการของคนอื่นข้างใน
    move: open && ownsWholeSubtree,
    attach: mine,                               // แนบได้ทุกสถานะ (BR-22)
    comment: true,
  };
}
```

endpoint ที่รับ id ของ resource ลูก (`/tasks/:id`, `/comments/:id`, `/attachments/:id`) โหลดแถวนั้นก่อน (ต้อง `deletedAt = null`) แล้วนำ `proposalId` ของแถวไปเรียก `resolveProposalAccess` ถ้ามองไม่เห็นตอบ `404` เหมือนกัน

---

## 5. Business logic (pseudo-code)

### 5.0 โครงร่วมของ mutation ข้อเสนอและงาน

ทุก mutation ทำใน transaction เดียวตามลำดับนี้

1. `lockProposal(tx, id)` = `SELECT status FROM proposals WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE` (mutex ต่อข้อเสนอ และตรวจ BR-22)
2. โหลด skeleton ของงานทั้งข้อเสนอ (`id, parentId, level, status, sortOrder, createdById, assigneeIds, version`) เฉพาะที่ยังไม่ลบ
3. คำนวณการเปลี่ยนแปลงด้วย pure function ใน `packages/shared/src/task-tree.ts` ชุดเดียวกับ optimistic UI (`deriveParentStatus`, `resolveInsertIndex`, `sortBetween`, `planFromTemplate`, `computeDueState`, `computeHealth`)
4. เขียนข้อมูล · ผู้ใช้ทุกคนที่จะถูกมอบหมายหรือตั้งเป็น Owner ต้องผ่าน `assertAssignable` (5.8)
5. `recomputeProposalProgress` (5.5) ซึ่งเรียก `touchProposal` ในตัว
6. บันทึก ActivityLog
7. สร้าง Notification ในแอป (เฉพาะข้อเสนอ IN_PROGRESS ยกเว้นชนิดที่ระบุ)
8. COMMIT (deferred tree guard ทำงานตรงนี้) แล้วจึง enqueue งานที่อยู่นอก DB (อีเมลใน Phase 2)

### 5.1 Wizard create (`POST /proposals`)

```ts
async function createProposals(actor: AuthUser, input: CreateProposalsInput, ctx: RequestCtx) {
  const today = todayBangkok();                                        // 'YYYY-MM-DD' (BR-26)
  const ownerId = input.ownerId ?? actor.id;
  if (ownerId !== actor.id) requirePermission(actor, 'proposal.create.assignOwner');

  const result = await prisma.$transaction(async (tx) => {
    // 1) จอง batchId เป็นคำสั่งแรก: request ที่ใช้ batchId เดียวกันพร้อมกันจะรอ lock ของ PK
    const [claimed] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO proposal_batches (id, created_by_id, created_at) VALUES (${input.batchId}::uuid, ${actor.id}::uuid, now())
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (!claimed) return { replay: await loadBatchForReplay(tx, input.batchId, actor) };   // 200 หรือ 409 ID_CONFLICT

    // 2) โหลดข้อมูลอ้างอิงทั้งหมดในครั้งเดียว
    const refs = await loadWizardRefs(tx, input, ownerId);   // products, stores, shelfTypes, templates(+items), users

    // 3) ตรวจทุกแถวก่อนเขียน แล้วสะสม error (BR-21)
    const errors: FieldError[] = [];
    checkProductsActive(refs.products, input.productIds, errors);                       // INACTIVE_REFERENCE
    await assignments.assertAssignable(tx, [ownerId, ...input.members.map((m) => m.userId)], { collectInto: errors });
    const plans: RowPlan[] = [];
    for (const [i, row] of input.rows.entries()) {
      const store = refs.stores.get(row.storeId), shelf = refs.shelfTypes.get(row.shelfTypeId);
      if (!store?.isActive) errors.push(err(`rows[${i}].storeId`, 'INACTIVE_REFERENCE'));
      else if (store.channel !== input.channel) errors.push(err(`rows[${i}].storeId`, 'CHANNEL_MISMATCH'));
      if (!shelf?.isActive) errors.push(err(`rows[${i}].shelfTypeId`, 'INACTIVE_REFERENCE'));
      else if (shelf.channel !== input.channel) errors.push(err(`rows[${i}].shelfTypeId`, 'CHANNEL_MISMATCH'));

      // undefined = แม่แบบเริ่มต้น (6.2.4: channel+shelf → channel ทั้งหมด → รายการว่าง) · null = เริ่มจากรายการว่าง
      const template = row.taskTemplateId === undefined ? pickDefaultTemplate(refs.templates, input.channel, row.shelfTypeId)
        : row.taskTemplateId === null ? null : refs.templates.get(row.taskTemplateId);
      if (row.taskTemplateId && !isApplicable(template, input.channel, row.shelfTypeId))   // Active, ไม่ลบ, channel ตรง, shelf null หรือตรง
        errors.push(err(`rows[${i}].taskTemplateId`, 'TEMPLATE_NOT_APPLICABLE'));
      if (row.excludedTemplateItemIds.some((id) => !template?.itemIds.has(id)))
        errors.push(err(`rows[${i}].excludedTemplateItemIds`, 'VALIDATION_FAILED'));

      const dup = await findActiveDuplicates(tx, input.productIds, row.storeId);        // BR-04 (03-database.md §7)
      const level2 = dup.filter((d) => d.shelfTypeId === row.shelfTypeId);
      if (level2.length && !row.duplicateOverride)
        errors.push(err(`rows[${i}].duplicateOverride`, 'DUPLICATE_PROPOSAL_UNCONFIRMED', limitByVisibility(level2, actor)));
      plans.push({ row, store, shelf, template, level2 });
    }
    if (errors.length) throw unprocessable('BATCH_INVALID', errors);   // rollback ทั้งหมด รวมแถว proposal_batches

    // 4) ออกรหัสทั้ง batch ในครั้งเดียว (03-database.md §11) · rollback แล้วตัวนับก็ rollback ตาม
    const codes = await allocateProposalCodes(tx, Number(today.slice(0, 4)), plans.length);
    const now = new Date();
    const created: CreatedProposal[] = [];
    for (const [i, plan] of plans.entries()) {
      const proposal = await tx.proposal.create({ data: {
        code: codes[i],
        title: plan.row.title ?? autoTitle(plan.store, plan.shelf, refs.productsInOrder),   // "{store} · {shelf} · {สินค้าแรก} (+n)"
        description: input.description ?? null, channel: input.channel,
        storeId: plan.store.id, shelfTypeId: plan.shelf.id,
        targetDate: dbDate(plan.row.targetDate), campaignName: plan.row.campaignName ?? null,
        status: input.submitAs, startedAt: input.submitAs === 'IN_PROGRESS' ? now : null,
        ownerId, batchId: input.batchId, taskTemplateId: plan.template?.id ?? null, createdById: actor.id,
      } });
      await tx.proposalProduct.createMany({ data: input.productIds.map((productId, k) =>
        ({ proposalId: proposal.id, productId, sortOrder: (k + 1) * 1024 })) });
      await tx.proposalMember.createMany({ data: input.members.filter((m) => m.userId !== ownerId)
        .map((m) => ({ proposalId: proposal.id, userId: m.userId, memberRole: m.memberRole, addedById: actor.id })) });

      const taskPlan = plan.template
        ? planFromTemplate(plan.template.items, plan.row.targetDate, today, plan.row.excludedTemplateItemIds)
        : emptyPlan();
      await insertTaskPlan(tx, proposal.id, taskPlan, { ownerId, actorId: actor.id });   // createMany ทีละ level 1→2→3 แล้ว TaskAssignee
      const progress = await recomputeProposalProgress(tx, proposal.id, today);

      await audit.record(tx, ctx, { action: 'CREATE', entityType: 'PROPOSAL', entityId: proposal.id, proposalId: proposal.id,
        summary: `${actor.nickname ?? actor.fullName} สร้างข้อเสนอ ${proposal.code}` });
      if (plan.template) await audit.record(tx, ctx, { action: 'TEMPLATE_APPLY', entityType: 'PROPOSAL', entityId: proposal.id,
        proposalId: proposal.id, summary: `ใช้แม่แบบ "${plan.template.name}" (${taskPlan.nodes.length} งาน)`,
        changes: { taskCount: taskPlan.nodes.length, adjustedTaskCount: taskPlan.adjustedCount } });
      for (const m of input.members) await audit.record(tx, ctx, { action: 'MEMBER_ADD', entityType: 'PROPOSAL_MEMBER', /* … */ });
      if (plan.level2.length) await audit.record(tx, ctx, { action: 'DUPLICATE_OVERRIDE', entityType: 'PROPOSAL',
        entityId: proposal.id, proposalId: proposal.id, summary: `ยืนยันว่าไม่ซ้ำกับ ${plan.level2.map((d) => d.code).join(', ')}`,
        changes: { matchedProposalIds: plan.level2.map((d) => d.id), reason: plan.row.duplicateOverride!.reason } });
      created.push({ proposal, progress, taskPlan, warnings: rowWarnings(i, plan, taskPlan, today) });
    }

    // 5) แจ้งเตือนเฉพาะเมื่อเริ่มดำเนินการทันที (4.1) · รวบเป็นรายการเดียวต่อคน · ไม่แจ้งตัวเอง
    if (input.submitAs === 'IN_PROGRESS') {
      await notify.batch(tx, actor, [
        ...(ownerId !== actor.id ? [{ type: 'PROPOSAL_OWNER_CHANGED', recipientId: ownerId, proposals: created }] : []),  // รวมจำนวนงานในข้อความ
        ...membersAdded(created, actor.id).map((g) => ({ type: 'PROPOSAL_MEMBER_ADDED', ...g })),
      ]);
    }
    return { created };
  }, { timeout: 15_000 });

  return 'replay' in result ? result.replay : toWizardResponse(result.created);   // 200 + Idempotent-Replay / 201
}

/** packages/shared/src/task-tree.ts — ใช้ทั้ง preview, wizard, apply-template, template preview */
export function planFromTemplate(items: TemplateItem[], targetDate: IsoDate, today: IsoDate, excludedIds: string[] = []): TaskPlan {
  const excluded = expandSubtrees(items, excludedIds);                 // ตัด item ที่เลือกพร้อมลูกหลานทั้งหมด
  const kept = sortBy(items.filter((i) => !excluded.has(i.id)), ['level', 'sortOrder']);
  const pastTarget = targetDate < today;                               // BR-11: บันทึกย้อนหลัง ไม่ปรับวัน
  const idMap = new Map<string, string>();
  let adjustedCount = 0;
  const nodes = kept.map((item) => {
    let start = addDays(targetDate, item.startOffsetDays);
    let due = addDays(targetDate, item.dueOffsetDays);
    let adjusted = false;
    if (!pastTarget) {                                                 // BR-12
      if (start < today) { start = today; adjusted = true; }
      if (due < today) { due = today; adjusted = true; }
    }
    if (adjusted) adjustedCount++;
    const id = uuidv7(); idMap.set(item.id, id);
    return { id, parentId: item.parentItemId ? idMap.get(item.parentItemId)! : null, level: item.level,
             title: item.title, description: item.description, priority: item.priority,
             startDate: start, dueDate: due, sortOrder: item.sortOrder, templateItemId: item.id,
             responsibleFunction: item.responsibleFunction, isMilestone: item.isMilestone,
             requiresAttachment: item.requiresAttachment, assignToOwner: item.assignToOwner, adjusted };
  });
  return { nodes, adjustedCount,
           requiredLeadDays: -Math.min(0, ...kept.map((i) => i.startOffsetDays)),
           availableDays: diffDays(targetDate, today) };
}
```

`rowWarnings` ส่ง `TEMPLATE_DATES_ADJUSTED` (BR-12), `PAST_TARGET_DATE` (BR-11) และ `DUPLICATE_OVERRIDDEN` · `loadBatchForReplay` อ่าน `ProposalBatch` ถ้า `createdById ≠ actor.id` ตอบ `409 ID_CONFLICT` ถ้าตรงคืนข้อเสนอของ batch ในรูปเดียวกับ 201

### 5.2 ตั้งสถานะงานพร้อมกติกา cascade (`PUT /tasks/:id/status`)

```ts
async function setTaskStatus(actor, taskId, input: { status: TaskStatus; cascade: boolean }, ctx) {
  return prisma.$transaction(async (tx) => {
    const task = await findLiveTaskOr404(tx, taskId);
    const access = await resolveProposalAccess(tx, actor, task.proposalId);
    const p = await lockProposal(tx, task.proposalId);
    if (p.status === 'COMPLETED' || p.status === 'CANCELLED') throw unprocessable('PROPOSAL_READ_ONLY');  // BR-22
    const tree = await loadSkeleton(tx, p.id);
    const node = tree.get(taskId);
    if (!taskAbilities(access, actor, node, tree).setStatus) throw forbidden('NOT_ASSIGNED');           // C10

    const changes = new StatusChangeSet(tree);            // เก็บเฉพาะแถวที่ค่าเปลี่ยนจริง
    const children = tree.childrenOf(node);

    if (input.status === 'IN_PROGRESS') {                                            // C2
      if (children.length) throw unprocessable('PARENT_STATUS_DERIVED');             // C3
      changes.set(node, 'IN_PROGRESS', 'EXPLICIT');
    } else if (input.status === 'DONE') {
      const open = tree.descendantsOf(node).filter((t) => t.status !== 'DONE');
      if (open.length && !input.cascade)
        throw conflict('CONFIRMATION_REQUIRED', { reason: 'CASCADE_DONE', openDescendantCount: open.length,
          openDescendants: open.slice(0, 20).map(brief), willNotifyNicknames: assigneesExcept(open, actor.id) });  // C5
      open.forEach((t) => changes.set(t, 'DONE', 'CASCADE'));
      changes.set(node, 'DONE', 'EXPLICIT');                                         // C1
    } else {                                                                         // TODO
      if (children.length) {
        if (node.status !== 'DONE') throw unprocessable('PARENT_STATUS_DERIVED');
        const affected = tree.descendantsOf(node).filter((t) => t.status !== 'TODO');
        if (!input.cascade)
          throw conflict('CONFIRMATION_REQUIRED', { reason: 'CASCADE_REOPEN', affectedCount: affected.length + 1 });  // C7
        affected.forEach((t) => changes.set(t, 'TODO', 'CASCADE'));
      }
      changes.set(node, 'TODO', 'EXPLICIT');                                         // C1, C6
    }

    // C3/C4/C6: ไล่คำนวณงานแม่ขึ้นทีละระดับ (สูงสุด 2 ระดับ)
    for (let a = tree.parentOf(node); a; a = tree.parentOf(a)) {
      const derived = deriveParentStatus(tree.childrenOf(a).map((c) => changes.statusOf(c)), changes.statusOf(a));
      if (derived === changes.statusOf(a)) break;
      changes.set(a, derived, 'ROLLUP');
    }
    if (changes.isEmpty()) return noOpResult(node, p);                               // ส่งซ้ำได้ผลเดิม

    await applyStatusChanges(tx, changes, actor.id);  // DONE: completedAt = now, completedById = actor · อื่นๆ: ล้างทั้งคู่ · ไม่แตะ version
    const progress = await recomputeProposalProgress(tx, p.id, todayBangkok());
    await audit.recordStatusChanges(tx, ctx, actor, p, changes);   // ทีละแถว: COMPLETE / REOPEN / STATUS_CHANGE
    if (p.status === 'IN_PROGRESS') await notifyStatusChanges(tx, actor, p, changes);
    return buildMutationResult(node, changes, progress, {
      cascadedCount: changes.count('CASCADE'), rolledUpTaskIds: changes.ids('ROLLUP'),
      notifiedUserCount: /* … */,
    });                                                // suggestClose อยู่ใน patch.proposal (C11: banner เท่านั้น ไม่ปิดเอง)
  });
}

/** packages/shared/src/task-tree.ts — C3, C4, C6, C8, C9 */
export function deriveParentStatus(children: TaskStatus[], previous: TaskStatus): TaskStatus {
  if (children.length === 0) return previous;                       // กลายเป็น leaf (ลบ/ย้ายลูกตัวสุดท้ายออก): คงสถานะเดิม ไม่ตั้ง DONE ใหม่
  if (children.every((s) => s === 'DONE')) return 'DONE';
  if (previous === 'DONE' || children.some((s) => s !== 'TODO')) return 'IN_PROGRESS';   // C8: แม่ที่ DONE ได้ลูกใหม่ → กำลังทำ
  return 'TODO';
}

async function notifyStatusChanges(tx, actor, p, changes) {
  const done = changes.rows('DONE');
  const reopened = changes.rowsFromDoneTo(['TODO', 'IN_PROGRESS']);
  await notify.aggregate(tx, actor, 'TASK_COMPLETED', [                           // 1 รายการต่อคนต่อ request · ไม่แจ้งตัวเอง
    ...(done.some((t) => t.reason !== 'ROLLUP') ? [{ userId: p.ownerId, tasks: done.filter((t) => t.reason !== 'ROLLUP') }] : []),
    ...done.filter((t) => t.reason === 'CASCADE').flatMap((t) => t.assigneeIds.map((u) => ({ userId: u, tasks: [t] }))),  // BR-30
  ]);
  await notify.aggregate(tx, actor, 'TASK_REOPENED',
    reopened.flatMap((t) => t.assigneeIds.map((u) => ({ userId: u, tasks: [t] }))));
}
```

**ทำไม Phase 1 ไม่มี "เลิกทำ" ของ cascade (C5/C7):** การย้อนต้องคืนสถานะเดิมรายงาน ซึ่ง bulk แบบค่าเดียวทำไม่ได้ (ลูกที่เคยเป็น IN_PROGRESS จะกลายเป็น TODO และ `completedAt`/`completedById` เดิมของ C7 หายไป) และ `TASK_COMPLETED` ถูกส่งไปแล้ว Phase 1 จึงใช้ dialog ที่บอกจำนวนเป็นการยืนยัน · การเลิกทำที่มีใน Phase 1 (C13) คือการติ๊ก leaf ที่ทำให้แถวหายไป (ส่งสถานะเดิมของ leaf กลับไปแบบระบุชัด) และการลบงาน (`POST /tasks/:id/restore`) · ถ้าต้องการใน Phase 2 ให้เพิ่ม `POST /proposals/:id/tasks/status-restore { changes: [{ id, status, completedAt?, completedById? }] }` (leaf ≤ 200 แถว แล้ว roll-up ใหม่) และหน่วงแจ้งเตือนด้วย pg-boss `startAfter: 15` พร้อม `singletonKey` ที่ยกเลิกได้

### 5.3 ย้าย, เรียง และเปลี่ยน parent (`PATCH /tasks/:id/move`)

```ts
const MAX_TASK_LEVEL = 3;

/** packages/shared/src/task-tree.ts — ใช้ทั้ง move, create (position) และ optimistic UI */
export function resolveInsertIndex(siblings: { id: string }[], afterId?: string | null, beforeId?: string | null): number | 'STALE' {
  // siblings = กลุ่มพี่น้องปลายทาง (ไม่รวมงานที่กำลังย้าย) เรียงตาม sortOrder, id · คืน index ที่จะแทรก
  const ia = afterId ? siblings.findIndex((s) => s.id === afterId) : -1;
  const ib = beforeId ? siblings.findIndex((s) => s.id === beforeId) : -1;
  if ((afterId && ia < 0) || (beforeId && ib < 0)) return 'STALE';   // ไม่อยู่ในกลุ่มปลายทางแล้ว
  if (afterId && beforeId) return ib === ia + 1 ? ib : 'STALE';      // ส่งมาทั้งคู่ต้องติดกัน
  if (afterId) return ia + 1;                                        // วางต่อจาก afterId
  if (beforeId) return ib;                                           // วางก่อน beforeId
  return siblings.length;                                            // ไม่ส่งทั้งคู่ = ต่อท้าย
}

/** gap 1024 (03-database.md §9) — null = ช่องว่างไม่พอ ต้อง renumber */
export function sortBetween(prev?: number, next?: number): number | null {
  if (prev === undefined && next === undefined) return 1024;
  if (prev === undefined) return next! >= 2 ? Math.floor(next! / 2) : null;
  if (next === undefined) return prev + 1024;
  return next - prev >= 2 ? Math.floor((prev + next) / 2) : null;
}

async function moveTask(actor, taskId, input: MoveTaskInput, ctx) {
  return prisma.$transaction(async (tx) => {
    const task = await findLiveTaskOr404(tx, taskId);
    const access = await resolveProposalAccess(tx, actor, task.proposalId);
    const p = await lockProposal(tx, task.proposalId);
    if (!access.open) throw unprocessable('PROPOSAL_READ_ONLY');
    const tree = await loadSkeleton(tx, p.id);                         // เฉพาะงานที่ยังไม่ลบ
    const node = tree.get(taskId);
    if (node.version !== input.version) throw versionConflict(node);

    const newParent = input.parentId ? tree.get(input.parentId) : null;
    if (input.parentId && !newParent) throw unprocessable('TASK_TREE_INVALID');     // ข้ามข้อเสนอ หรือ parent ถูกลบ
    if (newParent && (newParent.id === node.id || tree.isDescendantOf(newParent, node)))
      throw unprocessable('TASK_TREE_INVALID');                                     // ห้ามเกิดวงวน

    // ลูกหลาน "รวมแถวที่ soft delete ทุกอายุ" เพราะ tasks_tree_guard ตรวจลูกทุกแถวโดยไม่กรอง deleted_at
    // (ไม่งั้น outdent งานที่มีลูกถูกลบจะ fail ตอน COMMIT) · ลึก ≤ 2 ใต้ node จึงใช้ self-join 2 ชั้นได้
    const fullSubtree = await loadDescendantsIncludingDeleted(tx, node.id);
    const newLevel = newParent ? newParent.level + 1 : 1;
    const height = heightOf(node, fullSubtree);       // 0 = leaf, 1 = มีลูก, 2 = มีหลาน (นับแถวที่ลบด้วย)
    if (newLevel + height > MAX_TASK_LEVEL)
      throw unprocessable('TASK_DEPTH_EXCEEDED', { maxLevel: 3, targetLevel: newLevel, subtreeHeight: height,
        resultingDeepestLevel: newLevel + height, deletedDescendantCount: fullSubtree.filter((d) => d.deletedAt).length });

    const can = taskAbilities(access, actor, node, tree);
    const canAddUnder = access.editorLike || (newParent !== null && taskAbilities(access, actor, newParent, tree).addChild);
    if (!can.move || !canAddUnder)
      throw forbidden(can.move ? 'NOT_ASSIGNED' : (node.createdById === actor.id ? 'SUBTREE_HAS_OTHERS_ITEMS' : 'NOT_CREATOR'));

    const siblings = tree.childrenOf(newParent).filter((s) => s.id !== node.id);  // เรียงตาม sortOrder, id
    const idx = resolveInsertIndex(siblings, input.afterId, input.beforeId);
    if (idx === 'STALE') throw conflict('POSITION_STALE');
    let sort = sortBetween(siblings[idx - 1]?.sortOrder, siblings[idx]?.sortOrder);
    if (sort === null) {                                               // ช่องไม่พอ → renumber กลุ่มพี่น้อง (ไม่เพิ่ม version)
      const renumbered = await renumberSiblings(tx, p.id, newParent?.id ?? null, { exclude: node.id });
      sort = sortBetween(renumbered[idx - 1]?.sortOrder, renumbered[idx]?.sortOrder)!;
    }

    const oldParent = tree.parentOf(node);
    const delta = newLevel - node.level;
    const moved = await updateTask(tx, node.id, { parentId: newParent?.id ?? null, level: newLevel,
                                                  sortOrder: sort, version: { increment: 1 } });
    if (delta !== 0) await shiftLevels(tx, fullSubtree.map((d) => d.id), delta);   // ทุกแถว (live + deleted), +version เฉพาะแถว live

    // วันที่ไม่เปลี่ยน (5.8) · คำนวณงานแม่ทั้งเดิมและใหม่ด้วย deriveParentStatus(children, previous) (C3, C8, C9)
    const statusChanges = rollUp(tree.withMove(node, newParent), [oldParent, newParent]);
    await applyStatusChanges(tx, statusChanges, actor.id);
    const progress = await recomputeProposalProgress(tx, p.id, todayBangkok());   // จำนวน leaf อาจเปลี่ยน
    await audit.record(tx, ctx, { action: 'MOVE', entityType: 'TASK', entityId: node.id, proposalId: p.id,
      summary: `${actor.nickname ?? actor.fullName} ย้าย "${node.title}"`,
      changes: { parentId: { from: oldParent?.id ?? null, to: newParent?.id ?? null },
                 level: { from: node.level, to: newLevel }, sortOrder: { from: node.sortOrder, to: sort } } });
    return buildMutationResult(moved, statusChanges, progress, {},
      [...parentReopenedWarnings(statusChanges), ...outsideRangeWarnings(moved, newParent)]);
  });   // deferred tree guard ตรวจซ้ำตอน COMMIT
}
```

### 5.4 เปลี่ยนวันวางขายและเลื่อนงาน (`PUT /proposals/:id/target-date`)

```ts
async function changeTargetDate(actor, proposalId, input: { version; targetDate; shiftTasks = true; reason?; dryRun? }, ctx) {
  return prisma.$transaction(async (tx) => {
    const access = await resolveProposalAccess(tx, actor, proposalId);
    if (!access.can.changeTargetDate) throw forbidden('OWNER_ONLY');                   // BR-03
    const p = await lockProposal(tx, proposalId);
    if (p.version !== input.version) throw versionConflict(p);
    if (p.status === 'IN_PROGRESS' && !input.reason?.trim()) throw unprocessable('REASON_REQUIRED');   // US-U13 AC2

    const delta = diffDays(input.targetDate, toIso(p.targetDate));                      // + เลื่อนออก, − เลื่อนเข้า
    const affected = await tx.task.findMany({ where: { proposalId, deletedAt: null, status: { not: 'DONE' },
      OR: [{ startDate: { not: null } }, { dueDate: { not: null } }] }, select: taskShiftFields });
    const today = todayBangkok();
    const intoPast = input.shiftTasks ? affected.filter((t) => t.dueDate && addDays(t.dueDate, delta) < today) : [];
    if (input.dryRun) return { deltaDays: delta, affectedTaskCount: input.shiftTasks ? affected.length : 0,
      affectedAssigneeCount: uniqueAssignees(affected).length, shiftedIntoPastCount: intoPast.length };
    if (delta === 0) return noOp(p);

    await tx.proposal.update({ where: { id: p.id }, data: { targetDate: dbDate(input.targetDate), version: { increment: 1 } } });
    if (input.shiftTasks && affected.length) {
      // ไม่ clamp เป็นวันนี้ เพื่อคงระยะห่างระหว่างงานตามแผน (ต่างจาก BR-12 ที่ใช้ตอนสร้าง)
      await tx.$executeRaw`
        UPDATE tasks SET start_date = start_date + ${delta}::int, due_date = due_date + ${delta}::int,
                         version = version + 1, updated_at = now()
        WHERE id = ANY(${affected.map((t) => t.id)}::uuid[])`;
    }
    await recomputeProposalProgress(tx, p.id, today);                                    // health/overdue เปลี่ยนตาม
    await audit.record(tx, ctx, { action: 'DATE_SHIFT', entityType: 'PROPOSAL', entityId: p.id, proposalId: p.id,
      summary: `${actor.nickname ?? actor.fullName} เปลี่ยนวันวางขาย ${thaiDate(p.targetDate)} → ${thaiDate(input.targetDate)}`,
      changes: { targetDate: { from: toIso(p.targetDate), to: input.targetDate }, deltaDays: delta,
                 shiftedTaskCount: input.shiftTasks ? affected.length : 0, reason: input.reason ?? null } });
    if (p.status === 'IN_PROGRESS' && input.shiftTasks)
      await notify.aggregate(tx, actor, 'TASK_DATES_SHIFTED',                             // 1 รายการต่อผู้รับผิดชอบ
        groupByAssignee(affected).map((g) => ({ userId: g.userId, tasks: g.tasks, deltaDays: delta })));
    return { deltaDays: delta, shiftedTaskCount: input.shiftTasks ? affected.length : 0,
             warnings: intoPast.length ? [{ code: 'SHIFTED_INTO_PAST', details: { count: intoPast.length } }] : [] };
  });
}
```

### 5.5 Progress, health และค่าที่คำนวณ

```ts
// ท้ายทุก tx ที่แก้งาน: นับ leaf ใหม่ทั้งหมด (ไม่ใช้ +1/−1) ตาม 03-database.md §10
async function recomputeProposalProgress(tx, proposalId: string, today: IsoDate): Promise<ProposalProgressDto> {
  const [agg] = await tx.$queryRaw<{ total: number; done: number; overdue: number }[]>`
    WITH leaves AS (
      SELECT t.status, t.due_date FROM tasks t
      WHERE t.proposal_id = ${proposalId}::uuid AND t.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL))
    SELECT count(*)::int AS total,
           (count(*) FILTER (WHERE status = 'DONE'))::int AS done,
           (count(*) FILTER (WHERE status <> 'DONE' AND due_date < ${today}::date))::int AS overdue
    FROM leaves`;
  const percent = agg.total === 0 ? 0 : Math.floor((agg.done * 100) / agg.total);   // ปัดลง (5.6)
  const p = await tx.proposal.update({ where: { id: proposalId },                     // touchProposal: ไม่เพิ่ม version
    data: { leafTaskCount: agg.total, doneLeafTaskCount: agg.done, progressPercent: percent, updatedAt: new Date() } });
  const overdueLeafCount = p.status === 'IN_PROGRESS' ? agg.overdue : 0;
  return { id: p.id, progressPercent: percent, leafTaskCount: agg.total, doneLeafTaskCount: agg.done, overdueLeafCount,
           health: computeHealth(p, overdueLeafCount, today, await settings.get()),
           suggestClose: p.status === 'IN_PROGRESS' && agg.total > 0 && percent === 100, updatedAt: p.updatedAt };
}

// packages/shared/src/task-tree.ts
export function computeHealth(p, overdueLeafCount: number, today: IsoDate, s: Settings): ProposalHealth | null {
  if (p.status !== 'IN_PROGRESS') return null;
  const launched = p.actualLaunchDate !== null;                       // 03-database.md §12.4 (ควรยืนยันกับทีม Trade)
  if (today > p.targetDate && !launched) return 'LATE';
  if (overdueLeafCount > 0 ||
      (!launched && diffDays(p.targetDate, today) <= s.atRiskDaysBeforeTarget && p.progressPercent < s.atRiskProgressThreshold))
    return 'AT_RISK';
  return 'ON_TRACK';
}

export function computeDueState(t, proposalStatus, today: IsoDate, dueSoonDays: number): TaskDueState {   // 5.7
  if (!t.dueDate || t.status === 'DONE' || proposalStatus !== 'IN_PROGRESS') return 'NONE';
  if (t.dueDate < today) return 'OVERDUE';
  if (t.dueDate === today) return 'DUE_TODAY';
  if (t.dueDate <= addDays(today, dueSoonDays)) return 'DUE_SOON';
  return 'ON_TRACK';
}
// annotate ตอนอ่านแบบ post-order O(n): leaf → {done: status==DONE ? 1 : 0, total: 1}, แม่ = ผลรวมของลูก
// overdueDescendantCount = จำนวน leaf ลูกหลานที่ OVERDUE
// outsideParentRange = แม่มีวันที่ และ (start < parent.start หรือ due > parent.due)
// durationDays = start และ due ครบ ? diffDays(due, start) + 1 : null
```

### 5.6 Activity logging

```ts
// apps/api/src/modules/activity-logs/audit.service.ts
interface AuditEntry {
  action: ActivityAction; entityType: AuditEntityType; entityId: string | null;
  proposalId?: string | null; summary: string;             // ข้อความไทยพร้อมแสดง ≤ 500 ตัวอักษร
  changes?: Record<string, unknown> | null;                // diff = { field: { from, to } } · ห้ามมี passwordHash, token, อีเมลดิบที่ไม่ใช่ของ entity
}
async function record(tx: Tx, ctx: RequestCtx, e: AuditEntry) {
  await tx.activityLog.create({ data: { ...e, actorId: ctx.user?.id ?? null,      // null = "ระบบ" (cron, seed, CLI)
    ipAddress: ctx.ip, userAgent: truncate(ctx.userAgent, 500) } });
}
```

| เหตุการณ์ | `action` | `entityType` | หมายเหตุ |
|---|---|---|---|
| login สำเร็จ / ไม่สำเร็จ / logout | `LOGIN_SUCCESS` / `LOGIN_FAILED` / `LOGOUT` | `USER` | `LOGIN_FAILED` ที่ไม่พบผู้ใช้: `entityId = null` และเก็บ **`changes.identifierHash = sha256(lower(btrim(email)))`** ไม่เก็บอีเมลดิบ (ตาราง append-only จึง anonymize ตาม PDPA ไม่ได้) · เขียนนอก tx ธุรกิจ |
| สร้าง แก้ ลบ กู้คืน ข้อมูลหลัก ผู้ใช้ แม่แบบ | `CREATE` / `UPDATE` / `DELETE` / `RESTORE` | ตาม entity | summary เก็บชื่อเดิมไว้ (BR-28) |
| แก้ค่าระบบ **[P2]** | `UPDATE` | `APP_SETTING` | `entityId = null`, คีย์อยู่ใน `changes.key` |
| เปลี่ยน role, รีเซ็ตรหัส, เปลี่ยนรหัส, เปิด/ปิดบัญชี | `ROLE_CHANGE` / `PASSWORD_RESET` / `PASSWORD_CHANGE` / `USER_ACTIVATE` / `USER_DEACTIVATE` | `USER` | — |
| สร้างข้อเสนอ, ใช้แม่แบบ, ยืนยันข้อเสนอซ้ำ | `CREATE`, `TEMPLATE_APPLY`, `DUPLICATE_OVERRIDE` | `PROPOSAL` | — |
| transition / เปลี่ยนวันวางขาย / ยืนยันวางขาย / โอน Owner | `STATUS_CHANGE` / `DATE_SHIFT` / `UPDATE` / `OWNER_TRANSFER` | `PROPOSAL` | — |
| สินค้าในข้อเสนอ, สมาชิก | `CREATE` / `UPDATE` / `DELETE` · `MEMBER_ADD` / `MEMBER_REMOVE` | `PROPOSAL_PRODUCT` · `PROPOSAL_MEMBER` | — |
| งาน: สร้าง แก้ ลบ กู้คืน ย้าย | `CREATE` / `UPDATE` / `DELETE` / `RESTORE` / `MOVE` | `TASK` | ลบ subtree บันทึกแถวเดียวที่ root พร้อม `changes.deletedIds` |
| งาน: เสร็จ / เปิดใหม่ / กำลังทำ | `COMPLETE` / `REOPEN` / `STATUS_CHANGE` | `TASK` | ทีละแถว summary บอกว่าเป็น "พร้อมงานแม่" (cascade) หรือ "อัตโนมัติจากงานย่อย" (roll-up) |
| ผู้รับผิดชอบ | `ASSIGN` / `UNASSIGN` | `TASK` | — |
| คอมเมนต์, ไฟล์ | `COMMENT_ADD` (ลบ = `DELETE`) · `ATTACHMENT_ADD` / `ATTACHMENT_REMOVE` | `COMMENT` · `ATTACHMENT` | — |
| Export Excel **[P2]** | `EXPORT` | `REPORT` | `entityId = null` · `changes = { report, filters, rowCount }` |

ทุกรายการเขียนใน tx เดียวกับการเปลี่ยนข้อมูล (NFR) และ trigger `activity_logs_append_only` กันการแก้และลบ

### 5.7 การแจ้งเตือนและงานตามเวลา

**กติกาการส่ง** (ไม่แจ้งการกระทำของตัวเอง · `linkUrl` เป็น path ภายใน เช่น `/proposals/{id}?task={taskId}`)

| `NotificationType` | Trigger | ผู้รับ | สถานะข้อเสนอที่ส่ง | การรวบ | MVP |
|---|---|---|---|---|---|
| `TASK_ASSIGNED` | มอบหมาย, สร้างงานพร้อมผู้รับผิดชอบ, START, โอนงาน | ผู้ถูกมอบหมายใหม่ | IN_PROGRESS | 1 รายการต่อคนต่อ request | ✓ |
| `TASK_COMPLETED` | DONE แบบตรงหรือแบบ cascade | Owner และผู้รับผิดชอบงานที่ถูก cascade (BR-30) | IN_PROGRESS | 1 ต่อคนต่อ request | ✓ |
| `TASK_REOPENED` | งานที่ DONE ถูกเปิดใหม่ (C6/C7) | ผู้รับผิดชอบงานนั้น | IN_PROGRESS | 1 ต่อคนต่อ request | ✓ |
| `TASK_DATES_SHIFTED` | เปลี่ยนวันวางขาย | ผู้รับผิดชอบงานที่ถูกเลื่อน | IN_PROGRESS | 1 ต่อคนต่อ request | ✓ |
| `TASK_DUE_SOON` | cron 08:00 | ผู้รับผิดชอบงานค้างที่ `dueDate = วันนี้ + 1` | IN_PROGRESS | 1 ต่อคนต่อวัน (`dedupeKey`) | ✓ |
| `TASK_OVERDUE` | cron 08:00 | ผู้รับผิดชอบงานที่เกินกำหนด และ Owner (นับ leaf) | IN_PROGRESS | 1 ต่อคนต่อวัน | ✓ |
| `COMMENT_ADDED` | สร้างคอมเมนต์ | ผู้รับผิดชอบงานนั้นและ Owner | ทุกสถานะ | ต่อคอมเมนต์ | ✓ |
| `COMMENT_MENTION` | สร้างหรือแก้คอมเมนต์ที่มี mention | คนที่ถูก mention | ทุกสถานะ | ต่อคอมเมนต์ | **[P2]** |
| `PROPOSAL_STATUS_CHANGED` | transition ทุกแบบ | Owner, สมาชิก และผู้รับผิดชอบงานที่ยังไม่เสร็จ | ทุกสถานะ | 1 ต่อคน | ✓ |
| `PROPOSAL_MEMBER_ADDED` | เพิ่มสมาชิกเอง (ไม่รวม VIEWER ที่ระบบเพิ่มให้) | คนที่ถูกเพิ่ม | ทุกสถานะ ยกเว้นตอนบันทึกร่างจาก wizard | 1 ต่อคนต่อ request | ✓ |
| `PROPOSAL_OWNER_CHANGED` | โอน Owner, wizard ที่กำหนด Owner เป็นคนอื่น, ปิดบัญชี, REOPEN พร้อม `newOwnerId` | Owner ใหม่ | ทุกสถานะ | 1 ต่อคน | ✓ |
| `STORE_REQUEST` | `POST /store-requests` | ADMIN และ MANAGER ที่ Active | — | ต่อคำขอ | ✓ |

อีเมลทันที (`TASK_ASSIGNED`, `COMMENT_MENTION`, `STORE_REQUEST`) และอีเมลสรุป 08:00 เป็น **[P2]** · mail template ต้องใช้ engine ที่ auto-escape และส่ง plain-text part คู่กันเสมอ เพราะชื่องานและคอมเมนต์เป็นข้อความที่ผู้ใช้พิมพ์

**Background jobs** (pg-boss 12 ทุกตัวตั้ง `tz: 'Asia/Bangkok'` · MVP รันใน process ของ API ซึ่งมี instance เดียว)

| Queue / schedule | เวลา | งาน | Phase |
|---|---|---|---|
| `reminders.daily` | `0 8 * * *` (อ่านจาก `AppSetting.digestTime`) | สร้าง `TASK_DUE_SOON` และ `TASK_OVERDUE` | MVP |
| `notifications.cleanup` | `30 2 * * *` | ลบแจ้งเตือนที่อ่านแล้วเกิน 180 วัน | MVP |
| `sessions.cleanup` | `45 2 * * *` | ลบ `Session` ที่หมดอายุหรือถูก revoke เกิน 30 วัน | MVP |
| `notify.email`, `digest.daily` | หลัง COMMIT / ต่อจาก reminders | อีเมลทันทีและอีเมลสรุป (retry 5 ครั้งแบบ exponential backoff แล้วตั้ง `emailSentAt`) | P2 |
| `storage.orphans` | `0 3 * * 0` | ลบไฟล์ใน storage ที่ไม่มี `Attachment` อ้างถึงเกิน 24 ชม. | MVP |
| `media.process` | ทันที | thumbnail ของรูปแนบขนาดใหญ่ | P2 (แยก worker container) |

```ts
// apps/api/src/modules/notifications/jobs/reminders.job.ts
async function runDailyReminders() {
  const today = todayBangkok();                    // คำนวณตอนรัน · retry ปลอดภัยเพราะมี dedupeKey
  const tomorrow = addDays(today, 1);
  const dueSoon = await sql`
    SELECT a.user_id, t.id, t.title, p.id AS proposal_id, p.code
    FROM task_assignees a
    JOIN users u ON u.id = a.user_id AND u.is_active
    JOIN tasks t ON t.id = a.task_id AND t.deleted_at IS NULL AND t.status <> 'DONE' AND t.due_date = ${tomorrow}::date
    JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL AND p.status = 'IN_PROGRESS'`;   // BR-23
  const asAssignee = await overdueTasksByAssignee(today);         // ทุกระดับ เหมือนหน้างานของฉัน
  const asOwner = await overdueLeafCountByOwner(today);           // นับ leaf ตามนิยาม K4 (เฉพาะ Owner ที่ Active)

  // ห้าม raw INSERT ลงตารางที่ PK เป็น uuid สร้างฝั่ง client (ไม่มี DB default) → ใช้ createMany ซึ่ง Prisma ใส่ uuid v7
  // และ skipDuplicates แปลงเป็น ON CONFLICT DO NOTHING บน dedupeKey
  await prisma.notification.createMany({ skipDuplicates: true, data: [
    ...[...groupBy(dueSoon, 'user_id')].map(([userId, rows]) => ({
      recipientId: userId, type: 'TASK_DUE_SOON', title: `งานครบกำหนดพรุ่งนี้ ${rows.length} รายการ`,
      taskId: rows.length === 1 ? rows[0].id : null, linkUrl: '/my-tasks', dedupeKey: `TASK_DUE_SOON:${userId}:${today}` })),
    ...[...union(asAssignee.keys(), asOwner.keys())].map((userId) => ({
      recipientId: userId, type: 'TASK_OVERDUE', title: overdueTitle(asAssignee.get(userId)?.length ?? 0, asOwner.get(userId) ?? 0),
      linkUrl: '/my-tasks', dedupeKey: `TASK_OVERDUE:${userId}:${today}` })),
  ] });
}
```

### 5.8 ผู้ใช้: assertAssignable, เปลี่ยนบทบาท, ปิดและเปิดบัญชี

```ts
// apps/api/src/modules/users/assignment.service.ts — จุดเดียวที่ตรวจ "มอบหมาย/ตั้ง Owner ได้"
// เรียกจากทุกเส้นทาง: wizard (owner, members), POST tasks, PUT assignees, transfer, deactivate, apply-template, REOPEN(newOwnerId), owner transfer
async function assertAssignable(tx: Tx, userIds: string[], opts?: { collectInto?: FieldError[]; exclude?: string }) {
  const ids = [...new Set(userIds)];
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE id = ANY(${ids}::uuid[]) AND is_active FOR SHARE`;   // กันการปิดบัญชีระหว่าง tx
  const bad = ids.filter((id) => !rows.some((r) => r.id === id) || id === opts?.exclude);
  if (bad.length === 0) return;
  if (opts?.collectInto) opts.collectInto.push(err('assignees', 'ASSIGNEE_INACTIVE', { userIds: bad }));
  else throw unprocessable('ASSIGNEE_INACTIVE', { userIds: bad });
}
// DB เป็นอีกชั้น: trigger assert_user_active บน task_assignees · ตอนสืบทอดผู้รับผิดชอบจากงานแม่ให้ข้ามคนที่ inactive

async function changeRole(actor, userId, role: Role, ctx) {
  if (userId === actor.id) throw unprocessable('SELF_ROLE_CHANGE');                  // R-AUTH-3, BR-18
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (target.role === role) return target;
    if (target.role === 'ADMIN' && target.isActive) await assertAnotherActiveAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await revokeAllSessions(tx, userId, 'ROLE_CHANGE');                              // NFR: มีผลทันที
    await audit.record(tx, ctx, { action: 'ROLE_CHANGE', entityType: 'USER', entityId: userId,
      summary: `${actor.nickname ?? actor.fullName} เปลี่ยนบทบาท ${target.fullName}`, changes: { role: { from: target.role, to: role } } });
  });
}

async function assertAnotherActiveAdmin(tx, excludingUserId: string) {
  // lock ทุกแถว ADMIN: ถ้า ADMIN สองคนลด role กันเองพร้อมกัน คนที่สองจะเห็นว่าเหลือ ADMIN คนเดียว
  const admins = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE role = 'ADMIN' AND is_active FOR UPDATE`;
  if (admins.filter((a) => a.id !== excludingUserId).length < 1) throw unprocessable('LAST_ADMIN');
}

async function deactivateUser(actor, userId, input: DeactivateUserInput, ctx) {
  if (userId === actor.id) throw unprocessable('SELF_DEACTIVATE');
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (target.role === 'ADMIN') await assertAnotherActiveAdmin(tx, userId);
    const owned = await tx.proposal.findMany({ where: { ownerId: userId, deletedAt: null, status: { in: ['DRAFT', 'IN_PROGRESS', 'ON_HOLD'] } } });
    const mapping = new Map(input.proposalOwners.map((m) => [m.proposalId, m.newOwnerId]));
    const missing = owned.filter((p) => !mapping.has(p.id));
    if (missing.length) throw unprocessable('OWNER_HAS_OPEN_PROPOSALS', { proposalIds: missing.map((p) => p.id) });
    await assertAssignable(tx, [...mapping.values(), ...(input.openTasks.toUserId ? [input.openTasks.toUserId] : [])], { exclude: userId });

    for (const p of owned) await transferOwner(tx, actor, p, mapping.get(p.id)!, { keepOldOwnerAsEditor: false });   // BR-16
    if (input.openTasks.mode === 'TRANSFER') await transferOpenTasks(tx, actor, userId, input.openTasks.toUserId!);
    else await unassignOpenTasks(tx, actor, userId);          // งานขึ้นป้าย "ยังไม่มีผู้รับผิดชอบ" (K5)
    await tx.proposalMember.deleteMany({ where: { userId } }); // BR-02 (3)
    await tx.user.update({ where: { id: userId }, data: { isActive: false, deactivatedAt: new Date() } });
    await revokeAllSessions(tx, userId, 'USER_DEACTIVATE');
    // Phase 2 (เมื่อมี AuthToken): UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL
    await audit.record(tx, ctx, { action: 'USER_DEACTIVATE', entityType: 'USER', entityId: userId, summary: /* … */ });
  });
}

async function activateUser(actor, userId, input: { resetPassword?: boolean }, ctx) {
  return prisma.$transaction(async (tx) => {
    const temp = input.resetPassword ? generateTempPassword() : null;
    await tx.user.update({ where: { id: userId }, data: {
      isActive: true, deactivatedAt: null,                     // CHECK users_active_vs_deactivated
      failedLoginCount: 0, lockedUntil: null,
      ...(temp ? { passwordHash: await argon2id(temp), mustChangePassword: true, passwordExpiresAt: addHours(new Date(), 72) } : {}),
    } });
    await audit.record(tx, ctx, { action: 'USER_ACTIVATE', entityType: 'USER', entityId: userId, summary: /* … */ });
    return { temporaryPassword: temp };
  });
}
```

**Break-glass CLI** (กรณี ADMIN ทุกคนถูกล็อกหรือลืมรหัส): `node dist/cli.js admin:unlock --email <email>` รันใน container เท่านั้น ไม่มีทาง HTTP · ล้าง `lockedUntil`, `failedLoginCount` และ (ถ้าใส่ `--reset-password`) ออกรหัสชั่วคราวใหม่ · บันทึก ActivityLog ด้วย `actorId = null` ("ระบบ") · ขั้นตอนอยู่ใน runbook ของทีม IT

### 5.9 ลบและกู้คืนงาน (BR-06)

```ts
async function deleteTask(actor, taskId, version: number, ctx) {
  return prisma.$transaction(async (tx) => {
    const task = await findLiveTaskOr404(tx, taskId);
    const access = await resolveProposalAccess(tx, actor, task.proposalId);
    const p = await lockProposal(tx, task.proposalId);
    const tree = await loadSkeleton(tx, p.id);
    const node = tree.get(taskId);
    if (!taskAbilities(access, actor, node, tree).delete) throw forbidden(/* NOT_CREATOR | SUBTREE_HAS_OTHERS_ITEMS | NOT_ASSIGNED */);
    if (node.version !== version) throw versionConflict(node);
    const ids = [node.id, ...tree.descendantsOf(node).map((d) => d.id)];           // เฉพาะที่ยังไม่ลบ
    const deletedAt = new Date();
    await tx.task.updateMany({ where: { id: { in: ids } }, data: { deletedAt, version: { increment: 1 } } });
    const statusChanges = rollUp(tree.without(ids), [tree.parentOf(node)]);         // C9 · ไม่มีลูกเหลือ = คงสถานะเดิม
    await applyStatusChanges(tx, statusChanges, actor.id);
    const progress = await recomputeProposalProgress(tx, p.id, todayBangkok());
    await audit.record(tx, ctx, { action: 'DELETE', entityType: 'TASK', entityId: node.id, proposalId: p.id,
      summary: `${actor.nickname ?? actor.fullName} ลบ "${node.title}" และงานย่อย ${ids.length - 1} รายการ`, changes: { deletedIds: ids } });
    return buildMutationResult({ deletedIds: ids, deletedAt, undoUntil: addSeconds(deletedAt, 10) }, statusChanges, progress);
  });
}

// POST /tasks/:id/restore { deletedAt }: กู้เฉพาะแถวที่ deleted_at = ค่าเดียวกับ root (subtree ที่ลบพร้อมกัน)
// - ผู้ลบเองภายใน 10 วินาที (อ่านจาก ActivityLog DELETE ล่าสุดของ root) ไม่งั้น 422 UNDO_EXPIRED · 30 วันด้วย trash.restore = P2
// - parent ต้องยังไม่ลบ ไม่งั้น 422 PARENT_DELETED · root.level ต้องเท่ากับ parent.level + 1 (หรือ 1 ถ้าไม่มี parent) ไม่งั้น 422 TASK_TREE_INVALID
// - คำนวณงานแม่ใหม่ (C8 ถ้างานแม่ DONE อยู่) แล้ว recompute progress และบันทึก RESTORE
```

### 5.10 Login และ lockout

```ts
async function login(input: { email: string; password: string }, ctx) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await argon2.verify(DUMMY_HASH, input.password);                        // เวลาตอบเท่ากับบัญชีจริง (กัน enumeration)
    unknownEmailLimiter.hit(sha256(email));                                 // ตัวนับ in-memory เกณฑ์เดียวกับบัญชีจริง
    await audit.recordStandalone(ctx, { action: 'LOGIN_FAILED', entityType: 'USER', entityId: user?.id ?? null,
      summary: 'เข้าสู่ระบบไม่สำเร็จ', changes: { identifierHash: sha256(email), reason: user ? 'INACTIVE' : 'UNKNOWN' } });
    throw unauthorized('INVALID_CREDENTIALS');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw locked('ACCOUNT_LOCKED', user.lockedUntil);
  if (!(await argon2.verify(user.passwordHash, input.password))) {
    // ผิดครบ 5 ครั้งติดกัน → ล็อก 15 นาที แล้วเริ่มนับใหม่ · ไม่มีการล็อกถาวร (กันคนอื่นล็อก ADMIN คนสุดท้ายไว้ได้ตลอด)
    const count = user.failedLoginCount + 1;
    const lock = count >= 5;
    await prisma.user.update({ where: { id: user.id },
      data: lock ? { failedLoginCount: 0, lockedUntil: addMinutes(new Date(), 15) } : { failedLoginCount: count } });
    await audit.recordStandalone(ctx, { action: 'LOGIN_FAILED', entityType: 'USER', entityId: user.id,
      summary: lock ? 'รหัสผ่านผิดครบ 5 ครั้ง บัญชีถูกล็อก 15 นาที' : 'รหัสผ่านไม่ถูกต้อง', changes: { attempt: count } });
    if (lock) throw locked('ACCOUNT_LOCKED', addMinutes(new Date(), 15));
    throw unauthorized('INVALID_CREDENTIALS');
  }
  if (user.passwordExpiresAt && user.passwordExpiresAt < new Date()) throw unauthorized('TEMP_PASSWORD_EXPIRED');  // ADMIN ต้องรีเซ็ตใหม่
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const session = await sessions.create(tx, user.id, ctx);                // token ใหม่ทุกครั้ง
    await audit.record(tx, ctx, { action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: user.id, summary: 'เข้าสู่ระบบ' });
    return { me: await buildMe(tx, user), cookie: session.cookie };
  });
}
```

---

## 6. Shared zod schemas และ DTO

### 6.1 ตำแหน่งไฟล์และการตั้งชื่อ

| ไฟล์ใน `packages/shared/src/` | เนื้อหา |
|---|---|
| `schemas/common.ts` | `isoDateSchema` (`z.iso.date()`), `versionSchema`, `reasonSchema`, `passwordSchema`, `pageQuerySchema`, `cursorQuerySchema`, `csvOf(schema)`, `sortParam(fields)` |
| `schemas/auth.ts`, `users.ts`, `stores.ts`, `shelf-types.ts`, `products.ts`, `task-templates.ts`, `proposals.ts`, `tasks.ts`, `comments.ts`, `attachments.ts`, `notifications.ts`, `dashboard.ts`, `settings.ts` | schema ของ request แยกตามโมดูล |
| `dto/*.ts` | type ของ response: `common.ts` (`ApiWarning`, `MutationResult<T>`, `Paginated<T>`), `abilities.ts`, `tasks.ts`, `proposals.ts`, … · เป็น type อย่างเดียว · contract test ฝั่ง API parse response จริงด้วย zod mirror ของ DTO |
| `enums.ts`, `labels.ts` | ค่า enum (`as const`) ตรงกับ Prisma และ label ภาษาไทยตาม glossary 8.3 |
| `error-codes.ts`, `permissions.ts`, `limits.ts` | `ERROR_CODES`, `PERMISSIONS`/`ROLE_PERMISSIONS`, `LIMITS` |
| `dates.ts`, `task-tree.ts` | `todayIn()`, `addDays`, `diffDays` · `buildTaskTree`, `planFromTemplate`, `deriveParentStatus`, `resolveInsertIndex`, `sortBetween`, `computeDueState`, `computeHealth`, `checkMove` |
| `zod-setup.ts` | `z.config(z.locales.th())` ให้ข้อความ error เป็นภาษาไทย (เรียกครั้งเดียวทั้งใน web และ api) |

| ชนิด | รูปแบบ | ตัวอย่าง |
|---|---|---|
| request body | `<verb><Entity>Schema` → type `<Verb><Entity>Input` | `createTaskSchema` → `CreateTaskInput` |
| query | `<entity>ListQuerySchema` → type `<Entity>ListQuery` | `proposalListQuerySchema` |
| response | `XxxDto` ใน `dto/` | `TaskDto` |

- request object ทุกตัวใช้ `z.strictObject` (กัน mass assignment) · enum ใช้ `z.enum(TASK_STATUS)` จาก `enums.ts` และมี contract test เทียบกับ enum ของ Prisma
- ฝั่ง API ใช้ `@Body({ schema })` / `@Query({ schema })` ของ NestJS 12 (Standard Schema) · ฝั่งเว็บใช้ `zodResolver`

### 6.2 `schemas/common.ts` และ `schemas/proposals.ts`

```ts
// packages/shared/src/schemas/common.ts (บางส่วน)
export const isoDateSchema = z.iso.date();                                // 'YYYY-MM-DD' ปี ค.ศ.
export const versionSchema = z.int().positive();
export const reasonSchema = z.string().trim().min(3, 'กรุณาระบุเหตุผล').max(1000);
export const passwordSchema = z.string()
  .min(8, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว')
  .max(128, 'รหัสผ่านยาวได้ไม่เกิน 128 ตัว')                              // จำกัดงานของ argon2
  .regex(/\p{L}/u, 'ต้องมีตัวอักษรอย่างน้อย 1 ตัว')
  .regex(/[0-9]/, 'ต้องมีตัวเลขอย่างน้อย 1 ตัว')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'รหัสผ่านนี้คาดเดาง่ายเกินไป');   // (ควรยืนยันกับทีม IT)
```

```ts
// packages/shared/src/schemas/proposals.ts
import { z } from 'zod';
import { CANCEL_REASON, CHANNEL, PROPOSAL_MEMBER_ROLE } from '../enums.js';
import { LIMITS } from '../limits.js';
import { isoDateSchema, reasonSchema, versionSchema } from './common.js';

const titleSchema = z.string().trim().min(1, 'กรุณากรอกชื่อข้อเสนอ').max(200, 'ชื่อข้อเสนอยาวได้ไม่เกิน 200 ตัวอักษร');

export const wizardRowSchema = z.strictObject({
  storeId: z.uuid(),
  shelfTypeId: z.uuid(),
  targetDate: isoDateSchema,
  campaignName: z.string().trim().min(1).max(100).optional(),      // เฉพาะ ONLINE (ตรวจด้านล่าง)
  title: titleSchema.optional(),                                   // ไม่ส่ง = ระบบตั้งชื่อให้
  /** ไม่ส่ง = แม่แบบเริ่มต้น (6.2.4) · null = เริ่มจากรายการว่าง */
  taskTemplateId: z.uuid().nullable().optional(),
  /** ตัด item ของแม่แบบ (และลูกหลาน) ออกก่อนสร้าง · API รองรับใน MVP ส่วน UI เป็น [Should] (ถ้าไม่ทันย้ายไป Phase 2) */
  excludedTemplateItemIds: z.array(z.uuid()).max(LIMITS.templateItems).default([]),
  duplicateOverride: z.strictObject({
    reason: z.string().trim().min(5, 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(500),
  }).optional(),
});

/** ใช้ทั้ง POST /proposals และ POST /proposals/preview (preview ไม่สนใจ submitAs) */
export const createProposalsSchema = z
  .strictObject({
    batchId: z.uuid(),                                             // idempotency key ที่เว็บสร้างครั้งเดียวต่อ wizard session
    channel: z.enum(CHANNEL),
    submitAs: z.enum(['DRAFT', 'IN_PROGRESS']),
    productIds: z.array(z.uuid())
      .min(1, 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')
      .max(LIMITS.productsPerProposal, `เลือกสินค้าได้ไม่เกิน ${LIMITS.productsPerProposal} รายการ`),
    description: z.string().trim().max(5000).optional(),
    ownerId: z.uuid().optional(),                                  // ต้องมี proposal.create.assignOwner (ตรวจที่ service)
    members: z.array(z.strictObject({ userId: z.uuid(), memberRole: z.enum(PROPOSAL_MEMBER_ROLE) }))
      .max(LIMITS.membersPerRequest).default([]),
    rows: z.array(wizardRowSchema)
      .min(1, 'กรุณาเลือกห้างอย่างน้อย 1 ห้าง')
      .max(LIMITS.storesPerBatch, `เลือกได้ไม่เกิน ${LIMITS.storesPerBatch} ห้างต่อครั้ง`),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.productIds).size !== v.productIds.length)        // BR-24
      ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'เลือกสินค้าซ้ำ' });
    const pairs = new Set<string>();
    v.rows.forEach((r, i) => {
      const key = `${r.storeId}:${r.shelfTypeId}`;
      if (pairs.has(key))
        ctx.addIssue({ code: 'custom', path: ['rows', i, 'shelfTypeId'], message: 'ห้างและรูปแบบชั้นวางนี้ถูกเลือกซ้ำ' });
      pairs.add(key);
      if (r.campaignName && v.channel !== 'ONLINE')
        ctx.addIssue({ code: 'custom', path: ['rows', i, 'campaignName'], message: 'ชื่อแคมเปญใช้ได้กับช่องทางออนไลน์เท่านั้น' });
    });
    const memberIds = v.members.map((m) => m.userId);
    if (new Set(memberIds).size !== memberIds.length)
      ctx.addIssue({ code: 'custom', path: ['members'], message: 'เลือกสมาชิกซ้ำ' });
    if (v.ownerId && memberIds.includes(v.ownerId))
      ctx.addIssue({ code: 'custom', path: ['members'], message: 'เจ้าของข้อเสนอไม่ต้องเพิ่มเป็นสมาชิก' });
  });
export type CreateProposalsInput = z.infer<typeof createProposalsSchema>;

export const updateProposalSchema = z.strictObject({
  version: versionSchema,
  title: titleSchema.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  campaignName: z.string().trim().min(1).max(100).nullable().optional(),
  storeId: z.uuid().optional(),
  shelfTypeId: z.uuid().optional(),
  actualLaunchDate: isoDateSchema.nullable().optional(),           // "ยืนยันวางขายแล้ว" · ต้อง ≤ วันนี้ (ตรวจที่ service)
});

const productResultSchema = z.strictObject({
  productId: z.uuid(),
  status: z.enum(['ACCEPTED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
});

export const proposalTransitionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('START'), version: versionSchema, confirmEmpty: z.boolean().default(false) }),
  z.strictObject({ action: z.literal('HOLD'), version: versionSchema, statusReason: reasonSchema }),
  z.strictObject({ action: z.literal('RESUME'), version: versionSchema }),
  z.strictObject({
    action: z.literal('COMPLETE'), version: versionSchema,
    force: z.boolean().default(false),
    statusReason: reasonSchema.optional(),                          // บังคับเมื่อ force (ตรวจที่ service)
    actualLaunchDate: isoDateSchema.optional(),                     // บังคับถ้าข้อเสนอยังไม่มีค่า
    productResults: z.array(productResultSchema).max(LIMITS.productsPerProposal).default([]),
  }),
  z.strictObject({
    action: z.literal('CANCEL'), version: versionSchema,
    cancelReason: z.enum(CANCEL_REASON), statusReason: reasonSchema.optional(),
  }).refine((v) => v.cancelReason !== 'OTHER' || !!v.statusReason,
            { path: ['statusReason'], message: 'กรุณาระบุเหตุผลเมื่อเลือก "อื่นๆ"' }),
  z.strictObject({ action: z.literal('REOPEN'), version: versionSchema, statusReason: reasonSchema, newOwnerId: z.uuid().optional() }),
]);
export type ProposalTransitionInput = z.infer<typeof proposalTransitionSchema>;
```

### 6.3 `schemas/tasks.ts`

```ts
// packages/shared/src/schemas/tasks.ts
import { z } from 'zod';
import { TASK_PRIORITY, TASK_STATUS } from '../enums.js';
import { LIMITS } from '../limits.js';
import { isoDateSchema, versionSchema } from './common.js';

export const MAX_TASK_LEVEL = 3;

const taskTitleSchema = z.string().trim().min(1, 'กรุณากรอกชื่องาน').max(200, 'ชื่องานยาวได้ไม่เกิน 200 ตัวอักษร');
const descriptionSchema = z.string().trim().max(10_000);
const durationDaysSchema = z.int().min(1, 'ระยะเวลาต้องอย่างน้อย 1 วัน').max(730);

export const assigneesSchema = z
  .array(z.strictObject({ userId: z.uuid(), isPrimary: z.boolean().default(false) }))
  .max(LIMITS.assigneesPerTask)
  .superRefine((list, ctx) => {
    if (new Set(list.map((a) => a.userId)).size !== list.length)
      ctx.addIssue({ code: 'custom', message: 'เลือกผู้รับผิดชอบซ้ำ' });
    if (list.filter((a) => a.isPrimary).length > 1)
      ctx.addIssue({ code: 'custom', message: 'มีผู้รับผิดชอบหลักได้ 1 คน' });
  }); // ไม่มีใครเป็นหลัก → server ตั้งคนแรกเป็นหลัก (5.4)

/** ใช้ซ้ำทั้งใน create/update และในฟอร์ม drawer */
export function dateRangeIssues(v: { startDate?: string | null; dueDate?: string | null; durationDays?: number }) {
  const issues: { path: string[]; message: string }[] = [];
  if (v.durationDays !== undefined && v.dueDate !== undefined)
    issues.push({ path: ['durationDays'], message: 'ระบุวันครบกำหนดหรือจำนวนวันอย่างใดอย่างหนึ่ง' });
  if (v.durationDays !== undefined && !v.startDate)
    issues.push({ path: ['startDate'], message: 'กรุณาระบุวันเริ่มเมื่อกรอกจำนวนวัน' });
  if (v.startDate && v.dueDate && v.startDate > v.dueDate)            // เทียบ ISO string ได้ตรงๆ
    issues.push({ path: ['startDate'], message: 'วันเริ่มต้องไม่หลังวันครบกำหนด' });
  return issues;
}

const positionSchema = z.strictObject({                               // ส่งอย่างใดอย่างหนึ่ง ทั้งคู่ หรือไม่ส่ง (= ต่อท้าย)
  afterId: z.uuid().nullable().optional(),
  beforeId: z.uuid().nullable().optional(),
});

export const createTaskSchema = z
  .strictObject({
    parentId: z.uuid().nullable().default(null),                    // null = งานระดับ 1
    title: taskTitleSchema,
    description: descriptionSchema.optional(),
    priority: z.enum(TASK_PRIORITY).optional(),                     // default MEDIUM
    startDate: isoDateSchema.nullable().optional(),
    dueDate: isoDateSchema.nullable().optional(),                   // ไม่ส่ง = dueDate ของงานแม่ (5.3)
    durationDays: durationDaysSchema.optional(),                    // dueDate = startDate + durationDays − 1
    assignees: assigneesSchema.optional(),                          // ไม่ส่ง = ผู้รับผิดชอบหลักของงานแม่ (ถ้า Active) · [] = ไม่มี
    position: positionSchema.optional(),
  })
  .superRefine((v, ctx) => dateRangeIssues(v).forEach((i) => ctx.addIssue({ code: 'custom', ...i })));
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .strictObject({
    version: versionSchema,
    title: taskTitleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    priority: z.enum(TASK_PRIORITY).optional(),
    startDate: isoDateSchema.nullable().optional(),
    dueDate: isoDateSchema.nullable().optional(),
    durationDays: durationDaysSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (Object.keys(v).length === 1) ctx.addIssue({ code: 'custom', path: [], message: 'ไม่มีข้อมูลที่ต้องแก้ไข' });
    dateRangeIssues(v).forEach((i) => ctx.addIssue({ code: 'custom', ...i }));
  }); // ส่งวันมาฝั่งเดียว → server เทียบกับค่าที่เก็บไว้ ถ้าไม่ผ่านตอบ 422 DATE_ORDER
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** C12: ระบุสถานะปลายทางเสมอ ไม่มี toggle และไม่มี version (1.7) */
export const setTaskStatusSchema = z.strictObject({
  status: z.enum(TASK_STATUS),
  cascade: z.boolean().default(false),                            // ต้องเป็น true เมื่อกระทบงานลูกหลาน (C5, C7)
});
export type SetTaskStatusInput = z.infer<typeof setTaskStatusSchema>;

export const moveTaskSchema = z
  .strictObject({
    version: versionSchema,
    parentId: z.uuid().nullable(),                                  // null = ย้ายเป็นงานระดับ 1
    afterId: z.uuid().nullable().default(null),
    beforeId: z.uuid().nullable().default(null),
  })
  .refine((v) => !v.afterId || v.afterId !== v.beforeId, { path: ['beforeId'], message: 'ตำแหน่งไม่ถูกต้อง' });
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const setAssigneesSchema = z.strictObject({ assignees: assigneesSchema });
export type SetAssigneesInput = z.infer<typeof setAssigneesSchema>;
```

### 6.4 DTO ที่เว็บและ API ต้องใช้ร่วมกัน

| ไฟล์ | Type |
|---|---|
| `dto/common.ts` | `ApiWarning`, `MutationResult<T>`, `TaskPatchDto`, `Paginated<T>`, `CursorPage<T>`, `ProblemDetails` |
| `dto/abilities.ts` | `ProposalAbilitiesDto`, `TaskAbilitiesDto`, `ProposalTransitionAction` (หัวข้อ 4.4) |
| `dto/tasks.ts` | `TaskDto`, `TaskAssigneeDto`, `MyTaskDto`, `DashboardTaskDto` |
| `dto/proposals.ts` | `ProposalListItemDto`, `ProposalDetailDto`, `ProposalProgressDto`, `ProposalProductDto` |
| `dto/auth.ts` | `MeDto` |

---

## 7. Security checklist

| # | หัวข้อ | มาตรการ |
|---|---|---|
| 1 | **Login rate limit และ lockout** | <ul><li>`@nestjs/throttler` 10 ครั้ง/นาที/IP ที่ `/auth/login` · `trust proxy 1`</li><li>ผิดติดกัน 5 ครั้ง → `lockedUntil = now + 15 นาที` ตอบ 423 พร้อมเวลาที่เหลือ (US-C01 AC3) · **ไม่มีการล็อกถาวร** เพราะจะเปิดช่องให้คนนอกล็อก ADMIN คนสุดท้ายได้</li><li>มี ADMIN ที่ Active อย่างน้อย **2 คนตั้งแต่ go-live** และ break-glass CLI (5.8) **(ควรยืนยันกับทีม Trade)**</li><li>อีเมลที่ไม่มีในระบบใช้ตัวนับ in-memory (LRU key = sha256(email)) และ verify กับ dummy hash ให้ status/เวลาตอบเหมือนบัญชีจริง</li><li>บันทึก `LOGIN_FAILED` ทุกครั้งด้วย `identifierHash` ไม่เก็บอีเมลดิบ</li></ul> |
| 2 | **รหัสผ่านและ session** | <ul><li>argon2id (`m=19456, t=2, p=1`) · รหัส 8–128 ตัว มีตัวอักษรและตัวเลข ไม่ซ้ำรหัสเดิม ไม่อยู่ใน common-password list</li><li>รหัสชั่วคราว 16 ตัวจาก CSPRNG แสดงครั้งเดียว · หมดอายุ 72 ชม. ผ่าน `User.passwordExpiresAt` (`401 TEMP_PASSWORD_EXPIRED`)</li><li>token session 32 bytes เก็บเฉพาะ SHA-256 · ออกใหม่เมื่อ login/เปลี่ยนรหัส · revoke เมื่อรีเซ็ตรหัส เปลี่ยน role ปิดบัญชี</li><li>SessionGuard join `users.is_active` และอ่าน role/mustChangePassword สดทุก request (1.2)</li><li>cookie `__Host-`, HttpOnly, Secure, SameSite=Lax · idle 8 ชม. / absolute 7 วัน</li><li>**[P2] AuthToken:** ใช้ token แบบ atomic ที่ join ผู้ใช้ Active: `UPDATE auth_tokens t SET used_at = now() FROM users u WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.id = t.user_id AND u.is_active RETURNING t.user_id` และ invalidate token ที่ยังไม่ใช้ทั้งหมดของผู้ใช้เมื่อปิดบัญชี รีเซ็ตรหัส เปลี่ยน role หรือออกคำเชิญใหม่</li></ul> |
| 3 | **CSRF** | SameSite=Lax · header `X-FlowTrade-Request: 1` ทุก unsafe method รวม login และ multipart · `Origin`/`Referer` ต้องตรง `APP_URL` · unsafe request รับเฉพาะ JSON และ multipart · GET ไม่มีผลข้างเคียง |
| 4 | **CORS** | same-origin จึงไม่ส่ง `Access-Control-Allow-*` และไม่ตอบ preflight · ถ้ามี mobile app ภายหลังให้ทำ token endpoint แยก ห้ามเปิด CORS บน endpoint ที่ใช้ cookie |
| 5 | **Security headers** | Caddy: HSTS 1 ปี, CSP `default-src 'self'; script-src 'self'; frame-ancestors 'none'; object-src 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` · helmet ใน API: `Cache-Control: no-store`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, ปิด `X-Powered-By` · endpoint ดาวน์โหลด: `Content-Security-Policy: sandbox; default-src 'none'` |
| 6 | **Input validation** | `z.strictObject` ทุก request · path param เป็น uuid · `sort` และ filter ใช้ whitelist · จำกัดขนาด body, array และความยาว string ตาม 1.10 · raw SQL ใช้ tagged template ของ Prisma (`$queryRaw`) หรือ `Prisma.sql` เท่านั้น |
| 7 | **Upload** | <ul><li>ไฟล์ ≤ `maxUploadMb` (default 20 สูงสุด 25) · Caddy จำกัด body 25 MB</li><li>ตรวจ magic bytes ด้วย `file-type` ตาม allowlist ถัดไป และนามสกุลต้องตรงกับชนิดที่ตรวจได้</li><li>ปฏิเสธ SVG, HTML, ไฟล์ Office ที่มี macro (ZIP ที่มี `vbaProject.bin`), ไฟล์ Office แบบ OLE2/CFB ทุกชนิด (`.xls`, `.doc`, `.ppt`, `.msg` ตรวจ macro ได้ยาก), archive และ executable</li><li>ตัด path และ control char จากชื่อไฟล์ (≤ 255) · เก็บด้วย `storageKey = yyyy/mm/{uuid}`</li><li>avatar/โลโก้/รูปสินค้า re-encode ด้วย sharp ลบ EXIF/GPS</li><li>นำเข้าสินค้าอ่านแบบ streaming ≤ 5,000 แถว</li><li>สแกนไวรัส (ClamAV) **(ควรยืนยันกับทีม IT)**</li></ul> |
| 8 | **Download** | MVP: ตรวจสิทธิ์ราย attachment แล้ว stream จาก local volume ผ่าน API (ไม่มี URL ที่ใช้ซ้ำได้) · `Content-Disposition: attachment` เสมอ ยกเว้นรูปและ PDF ที่ขอ inline · Phase 2 S3: presigned URL อายุ 5 นาที |
| 9 | **IDOR** | ทุก endpoint ที่รับ id โหลดแถวก่อนแล้ว `resolveProposalAccess` (มองไม่เห็นตอบ 404) · id ใน body (`parentId`, `afterId`, `beforeId`, `targetId`, `taskIds`, `productId`) ต้องอยู่ในข้อเสนอเดียวกัน · `GET /lookups/users?proposalId=` ตรวจสิทธิ์ข้อเสนอก่อน · list endpoint ใส่ scope ใน `WHERE` · notification/session ตรวจ `recipientId`/`userId` · DB เป็นอีกชั้น (trigger target ของ comment/attachment, tree guard, composite FK channel, trigger ผู้รับผิดชอบ Active) · `ownerId`/`createdById` ไม่รับจาก client ยกเว้นที่ระบุสิทธิ์ไว้ |
| 10 | **XSS และ injection** | คอมเมนต์และ summary เป็น plain text ที่ React escape ให้ ห้าม `dangerouslySetInnerHTML` · ลิงก์แนบรับเฉพาะ `https://` render ด้วย `rel="noopener noreferrer"` · server ไม่ fetch URL ของลิงก์ (ไม่มี SSRF) · `Notification.linkUrl` ต้องเป็น path ภายใน (CHECK) · Excel export (P2): cell ที่ขึ้นต้นด้วย `= + - @` ใส่ `'` นำหน้า · อีเมล (P2): template engine ที่ auto-escape + plain-text part |
| 11 | **Audit trail** | ActivityLog ใน tx เดียวกับการเปลี่ยนข้อมูล · append-only ด้วย trigger · ครอบคลุม login/logout, role, รหัสผ่าน, ข้อมูลหลัก, ข้อเสนอ, งาน, ไฟล์ และ export (`EXPORT`/`REPORT`) · เก็บ ip และ user agent · ไม่มี API แก้หรือลบ · เก็บอย่างน้อย 3 ปี |
| 12 | **Logging และ error** | pino redact `cookie`, `password`, `currentPassword`, `newPassword`, `temporaryPassword`, `token` · ทุก log มี requestId · Problem Details ไม่ส่ง stack trace · Sentry/GlitchTip scrub PII ก่อนส่ง |
| 13 | **Enumeration และ PDPA** | login ตอบข้อความกลางๆ · `TEMP_PASSWORD_EXPIRED` ตอบเฉพาะเมื่อรหัสถูก · `/lookups/users` ไม่ส่ง email/phone · duplicate-check แสดงข้อเสนอที่มองไม่เห็นได้แค่รหัส ชื่อ Owner สถานะ · ไม่ใส่ข้อมูลส่วนบุคคลใน URL · ไม่เก็บอีเมลดิบใน audit · ใช้ anonymize แทนการลบผู้ใช้ |
| 14 | **Abuse limit** | rate limit ตาม 1.10 · ข้อเสนอมี soft limit 500 งาน · bulk (P2) ≤ 200 · export (P2) ≤ 10,000 แถว |
| 15 | **Security tests ใน CI** | RBAC matrix test (import `ROLE_PERMISSIONS`) · IDOR test (user A เรียกทุก endpoint ด้วย id ของข้อเสนอ B รวม `/lookups/users?proposalId=` ต้องได้ 404) · CSRF test (ไม่มี header ได้ 403) · upload test (นามสกุลไม่ตรงเนื้อหา และไฟล์ CFB ได้ 415) · test ว่า session ของผู้ใช้ที่ถูกปิดได้ 401 แม้ revoke ตกหล่น |

**Upload allowlist (MVP)**

| นามสกุล | `mimeType` ที่บันทึก | ตรวจด้วย |
|---|---|---|
| `.pdf` | `application/pdf` | `%PDF-` |
| `.jpg`, `.jpeg` | `image/jpeg` | `FF D8 FF` |
| `.png` | `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| `.webp` | `image/webp` | `RIFF????WEBP` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | ZIP ที่ `file-type` ระบุว่าเป็น xlsx และไม่มี `vbaProject.bin` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | ZIP ที่ระบุว่าเป็น docx และไม่มี macro |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | ZIP ที่ระบุว่าเป็น pptx และไม่มี macro |
| `.csv` | `text/csv` | ไม่มี magic bytes: ต้องเป็น UTF-8 ที่ถูกต้อง (มี BOM ได้) ไม่มี byte `00` และใช้นามสกุล `.csv` |

`.xls` (Excel รุ่นเก่า) ตัดออกจาก Phase 1 ให้ผู้ใช้บันทึกเป็น `.xlsx` ก่อนแนบ **(ควรยืนยันกับทีม Trade ว่าห้างยังส่งฟอร์ม .xls มาบ่อยหรือไม่, Q30)**

---

## 8. รายการที่ต้องยืนยัน (จากการออกแบบ API)

**ควรยืนยันกับทีม Trade**
1. USER ที่เป็น assignee แต่ไม่ใช่ Editor แก้ไข/มอบหมายได้เฉพาะรายการที่ตนสร้าง และลบ/ย้ายได้เมื่อทุกรายการข้างในเป็นของตน (ตีความจาก Requirements 2.3)
2. ถอดสมาชิกได้เมื่อคนนั้นไม่มี "งานที่ยังไม่เสร็จ" ในข้อเสนอ (BR-15)
3. ปิดข้อเสนอต้องมีวันวางขายจริง (`actualLaunchDate`) และใช้ค่านี้คำนวณ LATE, K6, K8 · มีปุ่ม "ยืนยันวางขายแล้ว" ให้กดได้ก่อนปิด
4. แม่แบบที่ถูกใช้ไปแล้ว ADMIN ลบ (soft delete) ได้ตาม BR-19 เป็นข้อยกเว้นจาก BR-01
5. `TASK_DUE_SOON`/`TASK_OVERDUE` รวบเป็นรายการเดียวต่อคนต่อวัน และนับงานทุกระดับที่ตนรับผิดชอบ
6. Phase 1 แจ้งเตือนในแอปอย่างเดียว อีเมลเป็น Phase 2
7. ADMIN ลบคอมเมนต์ของคนอื่นได้ (`comment.moderate`)
8. เลื่อนวันวางขายแล้วงานที่ถูกเลื่อนไปอยู่ในอดีต ระบบไม่ปรับเป็นวันนี้ แค่แสดงคำเตือน
9. Phase 1 ไม่มี "เลิกทำ" หลังติ๊กงานแม่แบบ cascade (มี dialog ยืนยันที่บอกจำนวนแทน)
10. ตัด `.xls` ออกจากชนิดไฟล์ที่แนบได้
11. มี ADMIN ที่ Active อย่างน้อย 2 คนตั้งแต่วันแรก
12. การจำกัดรูปแบบชั้นวางรายห้าง (Q8) และแม่แบบรายห้างเลื่อนไป Phase 2

**ควรยืนยันกับทีม IT**
1. นโยบายรหัสผ่าน (8–128 ตัว มีตัวอักษรและตัวเลข) และอายุ session (idle 8 ชม. / absolute 7 วัน ไม่มี "จดจำฉัน")
2. ขนาดไฟล์สูงสุด 25 MB ที่ Caddy และการสแกนไวรัสไฟล์แนบ (ClamAV)
3. MVP เก็บไฟล์ใน local volume และดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์ (ตรงกับ NFR ใน [01-requirements-flow.md](01-requirements-flow.md) §11) · Phase 2 ย้ายไป S3-compatible พร้อม presigned URL อายุ ≤ 5 นาที
4. ขั้นตอน break-glass CLI สำหรับปลดล็อก ADMIN อยู่ใน runbook ของทีม IT
