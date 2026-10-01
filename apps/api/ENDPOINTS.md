# FlowTrade REST API — endpoint contract

Base path: `/api/v1`. JSON in/out. Types are in `packages/shared/src/types.ts` and `packages/shared/src/api-types.ts`.
Validation and error messages are Thai and are shown to users as-is. The web client is
`apps/web/src/api/http/http-api.ts`.

## Conventions

- **Auth**: server-side session in an `httpOnly` cookie (`ft_sid` in dev). Login sets it; every other route needs it unless marked public.
- **CSRF**: every `POST/PUT/PATCH/DELETE` must send `X-FlowTrade-Request: 1` (and `Origin`, when present, must equal `WEB_ORIGIN`).
- **Forced password change**: while `user.mustChangePassword` is true only `/auth/me`, `/auth/change-password`, `/auth/logout` work (others → 403).
- **Errors**: `{ "status": 422, "code": "VALIDATION", "message": "Thai text", "fields": { "path": "Thai text" } }`.
  Codes: `UNAUTHENTICATED` 401, `INVALID_CREDENTIALS` 401, `FORBIDDEN` 403, `INACTIVE` 403, `NOT_FOUND` 404, `CONFLICT` 409, `IN_USE` 409, `VALIDATION` 422, `LOCKED` 423, `INTERNAL` 500.
  A resource the user may not see answers **404**, never 403 (no id leaks).
- **Dates**: date-only fields are `YYYY-MM-DD` (Asia/Bangkok business dates, stored as `DATE`); timestamps are ISO-8601 UTC.
- **Launch dates**: a proposal's `targetDate` (on-shelf date) is always the **15th** of a month (`LAUNCH_DAY_OF_MONTH`);
  preparation starts `PREP_DAYS` (90) days earlier (`prepStartOf`). Any other day → 422, field `targetDate`:
  `วันวางขายต้องเป็นวันที่ 15 ของเดือน`. Helpers: `packages/shared/src/launch.ts`.
- **User department**: `User.department` must be the name of one of the admin-managed departments (`/departments`;
  seeded: Jlcall, System AI, Purchase, HR and Account, Branding & Marketing, General — only `department.manage`
  (ADMIN) can add more). On `POST /users` / `PATCH /users/:id` the `department` field is a department **name**:
  trimmed (inner spaces collapsed), `''` / `null` → `null`, matched case-insensitively and stored with the canonical
  spelling. Unknown → 422, field `department`: `ไม่พบแผนกนี้ — เลือกจากรายชื่อแผนกที่ผู้ดูแลระบบกำหนด`.
  An inactive department can't be newly assigned (422 `แผนกนี้ถูกปิดการใช้งานแล้ว`), but a user who already has it
  keeps it. DB: FK `users.department → departments(name)` ON UPDATE CASCADE (a rename follows on every user)
  ON DELETE RESTRICT. Department changes are written to the activity log (entity type `DEPARTMENT`).
- **Responsible department**: `Task.responsible` / `TaskTemplateItem.responsible` / plan `responsible` is free text
  (e.g. `NPD`, `Graphics`; suggestions in `DEFAULT_DEPARTMENTS`) — trimmed, `''` → `null`, max 100 characters.
- **Task details**: `Task.descriptionFormat` is `TEXT` (details = `description`) or `FIELDS` (details = `detailFields`,
  rows of `{ id, label, value }`; `value: ''` = not filled yet; max 100 rows, label 1–200, value ≤ 2000 characters, trimmed).
  `PATCH /tasks/:id` changes rows with `detailFields` (replace all), `detailRemove` (ids; gone ids ignored),
  `detailLabels` / `detailValues` (`{ [rowId]: text }`, unknown id → 409) and `detailAppend` (rows added after the
  latest rows), applied in that order by `applyDetailPatch` (`packages/shared/src/detail-fields.ts`). The task row is
  locked for the update, so people editing different rows at the same time never overwrite each other.
  Switching format does not convert content — the client sends the converted `description` / `detailFields`
  (`parseDetailText` / `formatDetailFields`). Only managers change the format or the rows; assignees fill `detailValues`.
  DB: `tasks.description_format` (enum), `tasks.detail_fields` (JSONB array, CHECK).
- **Query strings**: booleans `true|false`; id lists comma-separated (`excluded=a,b`).
- **Empty results**: an endpoint that returns `null` answers `200` with an empty body (the client maps it to `null`).
- IDs are UUIDs; a malformed id answers 404.

## Endpoints

| Method | Path | Permission / rule | Body / query | Returns |
|---|---|---|---|---|
| POST | /auth/login | public | `{ email, password }` — `email` may be an email or a username | `User` + session cookie |
| POST | /auth/logout | public | — | `true` |
| GET | /auth/me | public | — | `User` or empty (null) |
| POST | /auth/change-password | signed in (allowed while password change pending) | `{ currentPassword, newPassword }` | `User` (new session) |
| GET | /users/lookup | signed in | — | `User[]` active, sorted by Thai name |
| GET | /users | `user.manage` | — | `User[]` |
| POST | /users | `user.manage` | `UserInput` (optional `username`, `password`, `mustChangePassword`; `department` = a department name, see *User department*) | `{ user, tempPassword }` — `tempPassword` is null when the admin set `password` |
| PATCH | /users/:id | `user.manage` (no self role change, keep ≥1 active admin; own password only via /auth/change-password) | `Partial<UserInput>` — a `password` revokes that user's sessions; `department` rule as above | `User` |
| POST | /users/:id/active | `user.manage` (not self; keep ≥1 active admin) | `{ isActive }` | `{ user, openTasks }` (deactivate revokes sessions) |
| POST | /users/:id/reset-password | `user.manage` | — | `{ user, tempPassword }` (revokes sessions) |
| GET | /departments | signed in; `includeInactive=true` needs `department.manage` (else 403) | `?includeInactive=true` | `Department[]` (sortOrder) — active only by default |
| GET | /departments/usage | `department.manage` | — | `Record<departmentId, userCount>` (every department, 0 when unused; active and inactive users) |
| POST | /departments | `department.manage` | `DepartmentInput` — `name` trimmed, 1–100 chars; duplicate ignoring case → 422 `มีแผนกชื่อนี้อยู่แล้ว` | `Department` (added last) |
| PATCH | /departments/:id | `department.manage` | `{ name?, isActive? }` — a rename renames it on every user (FK cascade); inactive = kept by current users, not assignable | `Department` |
| DELETE | /departments/:id | `department.manage` (409 `IN_USE` `ลบไม่ได้ เพราะมีผู้ใช้ N คนอยู่ในแผนกนี้ — ปิดการใช้งานแทนได้` while any user has it) | — | `true` |
| PUT | /departments/order | `department.manage` | `{ ids: string[] }` (sortOrder = index + 1, one transaction) | `true` |
| GET | /stores | signed in | `?includeInactive=true` | `Store[]` (channel, sortOrder) |
| GET | /stores/usage | signed in | — | `Record<storeId, proposalCount>` |
| POST | /stores | `store.manage` | `StoreInput` | `Store` |
| PATCH | /stores/:id | `store.manage` | `Partial<StoreInput> & { isActive? }` | `Store` |
| DELETE | /stores/:id | `store.manage` (409 `IN_USE` when referenced) | — | `true` |
| PUT | /stores/order | `store.manage` | `{ ids: string[] }` | `true` |
| GET | /shelf-types | signed in | `?includeInactive=true` | `ShelfType[]` |
| GET | /shelf-types/usage | signed in | — | `Record<shelfTypeId, proposalCount>` |
| POST | /shelf-types | `shelfType.manage` | `ShelfTypeInput` | `ShelfType` |
| PATCH | /shelf-types/:id | `shelfType.manage` | `Partial<ShelfTypeInput> & { isActive? }` | `ShelfType` |
| DELETE | /shelf-types/:id | `shelfType.manage` (409 `IN_USE`) | — | `true` |
| PUT | /shelf-types/order | `shelfType.manage` | `{ ids: string[] }` | `true` |
| GET | /products | signed in | `?q=&includeInactive=true` | `Product[]` |
| POST | /products | `product.manage` or `proposal.create` (wizard quick-add) | `ProductInput` | `Product` |
| PATCH | /products/:id | `product.manage` | `Partial<ProductInput> & { isActive? }` | `Product` |
| DELETE | /products/:id | `product.manage` (409 `IN_USE`) | — | `true` |
| GET | /task-templates | signed in | `?includeInactive=true` | `TaskTemplate[]` — every-channel (`channel: null`) templates first, then oldest first |
| GET | /task-templates/suggest | signed in | `?channel=&shelfTypeId=&storeId=` | `TaskTemplate` or empty (null). Candidates: active, `channel` = given or `null`, shelf/store `null` or matching; most specific wins (store +4, shelf +2, channel-specific +1), ties → oldest |
| GET | /task-templates/:id | signed in | — | `TaskTemplate` |
| GET | /task-templates/:id/preview | signed in | `?targetDate=YYYY-MM-DD&excluded=a,b` | `TemplatePreviewItem[]` |
| POST | /task-templates | `template.manage` | `TemplateInput` (item ids may be client temp ids; server re-keys). `channel: null` = every channel; then `shelfTypeId` and `storeId` must be null (422) | `TaskTemplate` |
| PATCH | /task-templates/:id | `template.manage` | `Partial<TemplateInput>` (items replace all; same `channel: null` rule on the resulting template) | `TaskTemplate` |
| DELETE | /task-templates/:id | `template.manage` | — | `true` |
| GET | /proposals | signed in (scope rules) | `?q&status&channel&storeId&shelfTypeId&ownerId&scope=mine\|all` | `ProposalListItem[]` |
| GET | /proposals/:id | can view | — | `ProposalDetail` |
| POST | /proposals | `proposal.create` | `CreateProposalInput` (one proposal per store). `targetDate` must be the 15th and not before today (422). Plan / template `responsible` → each task's `responsible` (description stays null) | `Proposal[]` |
| PATCH | /proposals/:id | owner or `proposal.update.any` | `UpdateProposalInput` | `Proposal` |
| POST | /proposals/:id/status | owner or `proposal.update.any` | `{ status }` | `Proposal` |
| POST | /proposals/:id/target-date | owner or `proposal.update.any` | `{ targetDate, shiftTasks }` — `targetDate` must be the 15th (422) | `Proposal` |
| POST | /proposals/:id/duplicate | `proposal.create` + can view | `{ storeId, targetDate }` — `targetDate` must be the 15th (422); tasks keep `responsible` and the details table (values too) | `Proposal` |
| DELETE | /proposals/:id | `proposal.delete.any`, or owner of a DRAFT | — | `true` |
| GET | /proposals/:id/tasks | can view | — | `Task[]` (flat) |
| GET | /proposals/:id/comment-counts | can view | — | `Record<taskId, count>` |
| GET | /tasks/mine | signed in | `?status=open\|done\|all&due=overdue\|today\|week\|all&proposalId=` | `TaskWithContext[]` |
| POST | /tasks | member/owner or `task.manage.any` | `CreateTaskInput` (optional `responsible` department) | `Task` |
| PATCH | /tasks/:id | managers; assignees may change description/dates/priority and fill `detailValues` only (not title, assignees, `responsible`, `descriptionFormat` or the table rows) | `UpdateTaskInput` (`responsible: null` or `''` clears it; table rows, see *Task details*; changes are noted in the activity log) | `Task` |
| POST | /tasks/:id/toggle | managers or the task's assignees | `{ isDone }` | `{ changed: Task[], progress, allDone }` |
| POST | /tasks/:id/move | managers | `MoveTaskInput` | `Task[]` (whole proposal) |
| POST | /tasks/:id/duplicate | managers | — | `Task` (copy of subtree root, `responsible`, `descriptionFormat` and `detailFields` copied) |
| DELETE | /tasks/:id | managers | — | `{ removed: string[] }` |
| GET | /tasks/:id/comments | can view | — | `CommentWithAuthor[]` |
| POST | /tasks/:id/comments | can view | `{ body }` | `CommentWithAuthor` |
| GET | /activity | `activity.read.all`, or can view `proposalId` | `?proposalId=&limit=` | `ActivityWithActor[]` |
| GET | /notifications | signed in | — | `AppNotification[]` (own, newest 50) |
| POST | /notifications/read | signed in | `{ id: string \| "all" }` | `true` |
| GET | /dashboard/home | signed in | — | `HomeSummary` |
| GET | /dashboard/summary | `dashboard.monitor` | — | `DashboardSummary` |
| GET | /health | public | — | `{ ok, schema, dbTime }` |
