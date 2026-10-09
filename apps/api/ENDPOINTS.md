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
- **Manufacturer** ("บริษัทรับผลิต", `/manufacturers`): the admin-managed list every production order picks from
  (`manufacturer.manage` = ADMIN only; nothing is seeded). Names are trimmed with inner spaces collapsed, 1–120
  characters, unique ignoring case among active and inactive ones (422, field `name`); `note` (address / phone /
  remark) is optional, ≤ 500, `''` → `null`. Any signed-in user may list them, inactive ones included (names aren't
  sensitive: the confirm dialog's picker shows an inactive current value and tells a typed inactive name apart from a
  new one). Anyone with `proposal.create` may add one (the confirm dialog's inline add) but only `manufacturer.manage`
  renames, (de)activates, reorders or deletes. An inactive manufacturer can't be newly picked (422 `{name}
  ถูกปิดการใช้งานแล้ว — เลือกบริษัทอื่น`) but the orders that name it keep it, and the production view embeds its
  current name. DB: unique index on `lower(name)`, `CHECK (btrim(name) <> '')`, FK
  `production_orders.manufacturer_id` ON DELETE RESTRICT (in use → 409 `IN_USE`). Changes are written to the activity
  log (entity type `MANUFACTURER`, actions `manufacturer.create|update|delete|reorder`).
- **Responsible department**: `Task.responsible` / `TaskTemplateItem.responsible` / plan `responsible` is free text
  (e.g. `NPD`, `Graphics`; suggestions in `DEFAULT_DEPARTMENTS`) — trimmed, `''` → `null`, max 100 characters.
- **Department lock on tasks** (`packages/shared/src/permissions.ts`): a task with a `responsible` department can be
  changed only by ADMIN (`task.department.any`) or by people of that department (`sameDepartment(user.department,
  task.responsible)`: trimmed, spaces collapsed, case-insensitive, blank never matches) who also have the usual right —
  the project team / `task.manage.any` for full edits (`canManageTask`), the task's assignee for assignee-level edits
  (`canToggleTask`). Everyone else who can see the task (incl. the project owner and MANAGER of another department) only
  views it and can still comment; their writes get 403 with `taskLockReason` (`เฉพาะแผนก X แก้ไขงานนี้ได้ — …`). Tasks
  without a department keep the team rules. Tree changes (`taskStructureRights` / `moveTaskLockReason`, shared with the
  web): a reorder among the same siblings needs the right on the task only; delete also on every sub task; copy also on
  every sub task and the parent (the copy becomes its child); a move to another parent also on every sub task, the
  current parent and the target parent (403 names the first locked task).
- **Task dates are ADMIN-only once a task exists** (`canEditTaskDates`): setting or changing `startDate` / `dueDate` of an
  existing task needs `task.dates.edit` (ADMIN) — User and Manager never, not even for a task without dates → else 403
  `TASK_DATES_ADMIN_ONLY`; re-sending the stored value is fine. `POST /tasks` may still set dates, and
  `POST /proposals/:id/target-date` (with `shiftTasks` it shifts every open task) is for the project's owner or ADMIN only (`canRescheduleProposal`).
- **Task details**: `Task.descriptionFormat` is `TEXT` (details = `description`) or `FIELDS` (details = `detailFields`,
  rows of `{ id, label, value }`; `value: ''` = not filled yet; max 100 rows, label 1–200, value ≤ 2000 characters, trimmed).
  `PATCH /tasks/:id` changes rows with `detailFields` (replace all), `detailRemove` (ids; gone ids ignored),
  `detailLabels` / `detailValues` (`{ [rowId]: text }`, unknown id → 409) and `detailAppend` (rows added after the
  latest rows), applied in that order by `applyDetailPatch` (`packages/shared/src/detail-fields.ts`). The task row is
  locked for the update, so people editing different rows at the same time never overwrite each other.
  Switching format does not convert content — the client sends the converted `description` / `detailFields`
  (`parseDetailText` / `formatDetailFields`). Only managers change the format or the rows; assignees fill `detailValues`.
  DB: `tasks.description_format` (enum), `tasks.detail_fields` (JSONB array, CHECK).
- **Presentation** ("นำเสนอ Buyer", `packages/shared/src/presentation.ts`): a proposal's presentation is packages
  (bundled done level-1 tasks, frozen) and one track per store, ever (`unique(proposal, store)`), each with an append-only
  event history. Every route answers the proposal's whole `PresentationData` (`{ version: 1, proposalId, packages,
  tracks }`; events oldest first, `createdAt` / `recordedAt` ISO, business dates `YYYY-MM-DD`), which the web puts
  straight into its cache. The rules are the shared ones the dialogs run (`NEXT`, `checkAppend`, `validateEvent`,
  `validateEdit`, `validatePackage`, `bulkStepAllowed`, `reduceTrack`), so a refusal carries the dialog's own Thai copy
  (`ERR`, dates as "6 ต.ค. 69"). Writes need `canRecordPresentation` (owner, members, `task.manage.any`; else 403
  `เฉพาะเจ้าของและทีมงานบันทึกขั้นตอนได้`); withdrawing, and reverting / editing PASSED · REJECTED · WITHDRAWN need
  `canFinalizePresentation` (owner, `proposal.update.any`; else 403 `เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`). A CANCELLED
  proposal is read-only (422 `โปรเจกต์นี้ถูกยกเลิกแล้ว`). Creating a package and re-pitching need every task done
  (422 `งานเตรียมยังไม่ครบ (d/t) …`); the server snapshots tasks (done level-1 tasks of this proposal only, else 409)
  and stores (the proposal's stores only, else 409) itself. A step whose track is no longer in `expectStage`, or that
  `NEXT` does not allow, answers 409 `STALE` `ขั้นตอนของ {store} เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง`;
  a track / package of another proposal or one already removed answers 404 `ข้อมูลนี้เปลี่ยนไปแล้ว — …`. Each write
  locks the proposal row (like task edits, so the prep gate can't race a task toggle) and then the touched track rows
  (`SELECT … FOR UPDATE`), appends events with the next `seq`, and caches the reduced `stage` / `round` on the track.
  Logged as entity `PROPOSAL`, actions `presentation.create|schedule|present|needsInfo|infoSent|pass|reject|withdraw|
  repitch|revert|edit|remove|deletePackage`; pass, reject and needs-info notify the owner and members (type
  `PROPOSAL_STATUS`, link `/proposals/:id?store=<storeId>`, or `?tab=present` for several stores).
  DB: `presentation_packages`, `presentation_package_tasks`, `presentation_tracks`, `presentation_events`.
  A `PASSED` sent with `acceptedProductIds: null` ("every SKU") is stored as the explicit list of the proposal's SKUs
  at that moment (record, and edits of an explicit pass), so a SKU added to the proposal later is not passed by that
  store; an empty list → 422 `ถ้า Buyer ไม่รับทุกรายการ ให้เลือก “ไม่ผ่าน”`. Older passes stored as `null` keep
  meaning every current SKU.
  Presenters (`presenterIds` of packages, schedule, re-pitch) and the NEEDS_INFO `preparerId`, including edits of
  them, must be able to open the proposal: the owner, members, assignees of its tasks, or active users with
  `proposal.read.all` (ADMIN, MANAGER). People already on the track's plan may stay. Anyone else → 422
  `เลือกได้เฉพาะคนที่เปิดดูโปรเจกต์นี้ได้ (เจ้าของ สมาชิก หรือผู้รับผิดชอบงาน)`; stored events are never changed.
- **Production** ("รอผลิต", `packages/shared/src/production.ts`): which SKUs are listed is derived on every read, never
  stored — a SKU accepted by ≥ 1 in-proposal store whose track is PASSED (`acceptedProductIdsOf`; a partial pass adds
  only its SKUs), with those `passedStores` (proposal store order, each with its pass date). `production_items` holds
  only what people recorded, one row per (proposal, SKU): a quantity kept from a confirm that was stepped back
  (`PENDING`; new quantities are only entered at confirm), the confirmation (`IN_PRODUCTION`: `confirmedAt` /
  `confirmedById` = the real press, `neededOn` = "วันที่ต้องการสินค้า", this SKU's delivery due date picked at confirm —
  today … the launch date (only today once the launch has passed), default the plan deadline clamped into that range;
  `startedOn` = the production start = its order's `startedOn` ("วันที่ดำเนินการ", may be after today; rows confirmed
  before order schedules existed: the earliest pass of the confirmed set); rows confirmed before `neededOn` existed
  have it null and are due on the plan deadline), `PRODUCED` (`producedOn`), `DELIVERED`
  (`deliveredOn`, plus `dueOn` = the row's due date frozen at delivery, so a later lead-day / launch change never re-grades
  it), `CANCELLED` (a confirmed SKU: "ยกเลิกผลิต"; a never-confirmed one: "ไม่ผลิต", a skip), and `ackStoreIds` = the
  passing stores the confirmed quantity was decided for, and `orderId` = the production order of the press that
  confirmed it. Every route answers the whole `ProductionView` (`{ version: 1, proposalId, today, targetDate, plan,
  rows, summary, pendingIds, events, orders }`; rows in proposal SKU order, then SKUs no longer in the proposal by SKU;
  `events` newest first, ≤ 200; `orders` by `seq`). Shown rows: every passed SKU
  (status from its row, `PENDING` without one), every confirmed SKU even when it no longer passes (flagged, never
  dropped) and confirmed-then-cancelled SKUs; a kept quantity or a skip of a SKU that no longer passes is hidden (kept in the
  DB; it comes back with the pass). Flags of confirmed rows: `NOT_IN_PROPOSAL`, `NOT_PASSED` (no store passes it any
  more), `STORES_CHANGED` (passing stores ≠ `ackStoreIds`); `needsReview` = flag and not yet acknowledged for exactly
  the current stores (`keep`, or an owner / manager quantity save on a SKU that still passes). **Deadline** =
  `targetDate − leadDays` (`production_plans.lead_days`, 0–90, default 14 without a row), so rescheduling the launch
  moves it. Each row's due date (`row.dueOn`) = its frozen `dueOn` once delivered, else its `neededOn`, else that plan
  deadline; `summary.deadline` = the earliest due of the rows not delivered yet (`planDeadline` when none). Late:
  undelivered after its due date → `OVERDUE`; delivered after its `dueOn` → `DELIVERED_LATE`.
  **Production orders** ("ใบสั่งผลิต"): each confirm press creates one order covering every SKU it confirmed (their
  `orderId`; rows confirmed before orders existed keep `null`), numbered per proposal ("ใบสั่งผลิตที่ n"; `seq` = 1 +
  the highest of the proposal's orders' `seq` and its production events' `detail.orderSeq`, under the proposal lock —
  a number is never reused, so a deleted order's number, still in its SKUs' history, is skipped), with `referenceNo`
  ("รหัสเอกสารอ้างอิง", optional: trimmed, runs of spaces collapsed, blank → `null`; > 100 → 422
  `รหัสเอกสารอ้างอิงยาวเกิน 100 ตัวอักษร`), a manufacturer (required: missing / `null` / `''` → 422
  `เลือกบริษัทรับผลิต`; unknown → 422 `ไม่พบบริษัทรับผลิตที่เลือก`; inactive → 422 `{name} ถูกปิดการใช้งานแล้ว —
  เลือกบริษัทอื่น`), one main contact (required: missing / `null` / `''` → 422 `เลือกผู้ติดต่อหลัก`) and 0–20
  co-contacts (`เลือกผู้ติดต่อร่วมได้ไม่เกิน 20 คน`; the main contact among them → `ผู้ติดต่อหลักอยู่ในรายชื่อผู้ติดต่อร่วมด้วย
  — เลือกคนละคน`), and a schedule: `startedOn` ("วันที่ดำเนินการ" = the production start, also the `startedOn` of every
  SKU on the order; required: missing / `null` / `''` → 422 `เลือกวันที่เริ่มผลิต`; within `orderStartBounds` — from the
  earliest buyer pass of the order's SKUs (on confirm today when none passes; on an order edit the earliest start already
  recorded on its SKUs when none passes any more; 422 `วันที่เริ่มผลิตต้องไม่ก่อนวันที่ผ่าน Buyer (…)`) to
  the launch date, or today once the launch has passed (422 `วันที่เริ่มผลิตต้องไม่เกิน …`); it may be after today) and
  `productionDays` ("ระยะเวลาผลิตทั้งหมด (ประมาณ)"; required: missing / `null` / `''` → 422 `กรอกระยะเวลาผลิต`; an
  integer 1–365, else 422 `ระยะเวลาผลิตต้องเป็นจำนวนเต็ม 1–365 วัน`). The view adds `expectedOn` ("ของถึงประมาณ" =
  `startedOn + productionDays`, `orderExpectedOn`, never stored); all three are `null` only on orders confirmed before
  schedules existed (DB CHECKs: both or neither, days 1–365). A SKU whose start is after today can't be marked produced
  yet (a produced date ≤ today would be before it: 422 `วันที่ผลิตเสร็จต้องไม่ก่อน …`). Contacts are
  internal users, checked main contact first, then co-contacts: each one newly in that role must exist (422
  `ไม่พบผู้ใช้ที่เลือก`), be active (422 `{name} ถูกปิดการใช้งานแล้ว — เลือกคนอื่น`) and be able to open the proposal —
  the owner, members, assignees of its tasks, active ADMIN / MANAGER (else 422 `เลือกผู้ติดต่อได้เฉพาะทีมโปรเจกต์
  ผู้รับผิดชอบงาน หรือผู้จัดการ — เพิ่มสมาชิกได้ที่หัวโปรเจกต์`). These 422s carry `fields` keyed `manufacturerId` /
  `referenceNo` / `startedOn` / `productionDays` / `mainContactId` / `coContactIds` (every rule broken by the shared
  `orderFieldErrors`, in that order, the message being the first; the contact checks name the field of the person
  refused; a body of the wrong shape answers zod's keys, `order.…` on confirm). An edit
  keeps the order's current manufacturer, and each current contact in the role they hold (the main contact staying
  main, a co-contact staying co), even when deactivated or off the team since; moving someone between main and co, or
  naming someone new, is checked like a new pick. Each order in the view embeds `manufacturer` `{ id, name, isActive }`,
  `mainContact` / `coContacts` (`ProductionPerson`, co-contacts by Thai name) and `confirmedBy` (`ProductionPerson`;
  `confirmedById` stays), so renamed and deactivated ones still show, and `productIds` (its SKUs, any status, row
  order). Stepping a SKU back to PENDING takes it off its order, and an order left without SKUs is deleted (the `back`
  activity summary then adds `· ลบใบสั่งผลิตที่ n (บริษัท · เอกสาร …) ที่ไม่เหลือ SKU`); CONFIRM
  events keep the order as confirmed (`date` = its start; `detail` `{ neededOn, orderId, orderSeq, manufacturerName,
  referenceNo, startedOn, productionDays, expectedOn, mainContactId, mainContactName, coContactIds, coContactNames }`, the schedule absent on events written before it existed). An
  order edit writes one `ORDER` event per SKU of the order (status unchanged; `detail` `{ orderId, orderSeq,
  referenceNo?: [before, after], manufacturer?: [beforeName, afterName], startedOn?: [before | null, after],
  productionDays?: [before | null, after], mainContactId?: [before, after],
  mainContactName?: [before, after], coContacts?: { added, removed }, coContactNames?: { added, removed } }` — the
  names are nickname or else name as of the edit, in the same order as the ids; events written before the names were
  stored have only the ids).
  **Who**: view = can view the proposal (else 404); team = `canWorkProduction` (owner, members, MANAGER, ADMIN; else
  403 `เฉพาะเจ้าของและทีมงานบันทึกการผลิตได้`): the note, advance, produced / delivered dates; decide =
  `canDecideProduction` (owner, MANAGER, ADMIN): confirm with the quantities (403 `ยืนยันเริ่มผลิตได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`),
  lead days (403 `ตั้ง deadline ได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`), `neededOn` edits (403 `แก้วันที่ต้องการสินค้าได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`), quantities of confirmed SKUs (403
  `จำนวนผลิตที่ยืนยันแล้วแก้ได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`), back, cancel / skip, restore, keep (403
  `เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`), order edits (403 `แก้ข้อมูลใบสั่งผลิตได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`). A
  CANCELLED proposal is read-only (422 `โปรเจกต์นี้ถูกยกเลิกแล้ว`, checked
  before 403). Every write locks the proposal row first (the lock presentation writes, task toggles and proposal edits
  take, so the passed set can't move under a confirm), sends what it expects (`from`, `before` / `saved`, the pending
  set, the store ids) and answers 409 `STALE` when that moved: `สถานะของ {SKU} เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว
  ลองอีกครั้ง`, `{SKU} ไม่ได้อยู่ในรายการรอผลิตแล้ว — …`, `รายการ SKU ที่รอยืนยันเปลี่ยนไปแล้ว — …`, `ไม่มี SKU ที่รอยืนยันแล้ว
  — …`, `จำนวนผลิตของ {SKU} ถูกแก้ไขโดยผู้อื่นแล้ว — …`, `ข้อมูลใบสั่งผลิตถูกแก้ไขโดยผู้อื่นแล้ว — …` (the order's
  `updatedAt` moved); `/items/:productId` of a SKU the tab does not list → 404 `ข้อมูลนี้เปลี่ยนไปแล้ว — …`, an order
  not (or no longer) in the proposal → 404 `ไม่พบใบสั่งผลิตนี้แล้ว — โหลดข้อมูลล่าสุดให้แล้ว`. Rule copy (422) is the
  shared `PERR` (quantity `จำนวนผลิตต้องเป็นจำนวนเต็ม 1–1,000,000
  ชิ้น`, lead days `จำนวนวันต้องเป็นจำนวนเต็ม 0–90 วัน`, dates `เลือกวันที่` / `วันที่ต้องไม่เกินวันนี้` /
  `วันที่ผลิตเสร็จต้องไม่ก่อน …` / `วันที่ส่งต้องไม่ก่อนวันที่ผลิตเสร็จ (…)` / …). Logged as entity `PROPOSAL`,
  actions `production.quantity|plan|confirm|produced|delivered|back|dates|cancel|skip|restore|keep|order` (Thai
  summaries with SKUs, pieces and dates; confirm ends `· ผลิตที่ {manufacturer}`, with a reference `· เอกสาร {ref}`,
  then `· เริ่มผลิต {start} · ประมาณ {n} วัน · ของถึง {expected}`; `order` = `แก้ข้อมูลใบสั่งผลิตที่ n ({SKUs}): บริษัท A →
  B, เอกสาร a → b, เริ่มผลิต a → b, ระยะเวลาผลิต a → b วัน, ผู้ติดต่อหลัก X → Y, ผู้ติดต่อร่วม +N / −M`, only the parts
  that changed; `—` for a value the order did not have). Notices (type `PROPOSAL_STATUS`, link `/proposals/:id?tab=production`, never to the
  actor): confirm → owner + members who are not the order's contacts `ยืนยันเริ่มผลิต n SKU แล้ว · ต้องการสินค้า
  {neededOn}`, and the contacts `ยืนยันเริ่มผลิต n SKU · คุณเป็นผู้ติดต่อหลัก` / `… · คุณเป็นผู้ติดต่อร่วม` (body
  `{code} {title} · {manufacturer}`); an order edit → people it newly makes the main contact / a co-contact
  `แก้ข้อมูลใบสั่งผลิตที่ n · คุณเป็นผู้ติดต่อหลัก` / `… · คุณเป็นผู้ติดต่อร่วม`; the last delivery → owner +
  members `ส่งสินค้าเข้าคลัง/{ห้าง}ครบ n SKU แล้ว`; a presentation record / revert / edit of a pass or a proposal
  SKU / store edit that adds pending SKUs → owner `มี n SKU ผ่าน Buyer แล้ว — รอยืนยันเริ่มผลิต`, that newly flags
  confirmed SKUs → owner `n SKU ที่ยืนยันผลิตแล้วต้องตรวจสอบ`. Deadline alarms are not pushed (no scheduler): they
  are home agenda rows and health chips. Removing SKUs from a proposal deletes their kept quantities and skips (confirmed rows
  stay, flagged); a product with production rows can't be deleted (409 `IN_USE` `ลบไม่ได้ เพราะสินค้านี้มีข้อมูลการผลิตใน
  n โปรเจกต์ — ปิดการใช้งานแทนได้`); a proposal with a confirmed SKU can't be deleted (409 `IN_USE`
  `มีสินค้าที่ยืนยันผลิตแล้ว ลบไม่ได้ — เปลี่ยนสถานะเป็น “ยกเลิก” แทน`; on a CANCELLED one the hint is
  `งานที่ยกเลิกแล้วจะเก็บประวัติการผลิตไว้`). DB: `production_plans`, `production_items`,
  `production_events` (CHECKs keep every status's fields consistent), `production_orders` (unique `(proposal_id,
  seq)`, cascade with the proposal; `started_on` / `production_days` both or neither, days 1–365 — CHECKs),
  `production_order_contacts` (co-contacts; the main contact is never one) and
  `manufacturers`; `production_items.order_id` is set only on confirmed rows (CHECK).
- **Overdue** (one rule for the badge, home, `/tasks/mine` due filters and the Monitor): a leaf task (no children),
  not done, `dueDate` before today (Asia/Bangkok), in an **IN_PROGRESS** proposal. DRAFT / ON_HOLD / COMPLETED
  proposals never count; CANCELLED ones are never listed.
- **Home dashboard** (`GET /dashboard/home`, rules in `packages/shared/src/home.ts`): one query wave (≈19 statements).
  `agenda.items` = my open leaf tasks of IN_PROGRESS proposals due up to today + 7 (`taskBucket`), my buyer steps
  (open in-proposal tracks of IN_PROGRESS / COMPLETED proposals: mine when I am a named presenter / the preparer, or
  nobody is named and I own it; owner / members also get someone else's step as a `team` row once it is overdue —
  `buyerAgendaFor`), merged per proposal + action + bucket + date + team (`mergeBuyerItems`), `createPackage` /
  `closeOut` steps of my IN_PROGRESS projects, and "รอผลิต" rows of my IN_PROGRESS / COMPLETED projects (kind
  `production`, `productionAgendaFor`: `confirmProduction` for the owner / an involved MANAGER or ADMIN while SKUs wait
  for confirmation (the quantities are entered in its dialog), bucketed by the production deadline, else `next`;
  `deliverProduction` for the owner and members once the deadline is within 7 days or past; `reviewProduction` in
  `next` while confirmed SKUs need review; `count`, `deadline`,
  `overdueDays`, the passing `stores`; never `waiting`); sorted with `compareAgenda`, buckets `overdue · today · week · next ·
  waiting`. `canRecord` = `canRecordPresentation`. Later / undated tasks are only counted (`laterTasks`), tasks of
  other statuses too (`parkedTasks`); `doneLast7Days` counts my leaves completed since Bangkok midnight 6 days ago.
  `projects` = proposals I own, am a member of or have a task in: DRAFT, IN_PROGRESS, and COMPLETED ones still
  launching, with an open tracked store, or with production left to confirm / produce / deliver (SKUs in production
  at any time; passed but unconfirmed SKUs up to 60 days after launch) (ON_HOLD only counted in `onHold`), each with
  in-proposal `stores` (store order, cached stage), leaf `prep`, `phase` (`projectPhase`), `health`
  (`proposalHealth`: IN_PROGRESS, and COMPLETED for production alarms only) and `production` (`ProductionBrief`
  counts of the derived production; null when nothing passed or everything was cancelled / skipped). `results` = final in-proposal tracks of my non-cancelled proposals whose effective outcome date is in
  [today − 13, today], newest first, at most 50 items (the counts cover all). `team` (`dashboard.monitor` only) =
  org-wide `late` / `atRisk` projects (IN_PROGRESS, plus COMPLETED ones with a production alarm), merged overdue
  buyer steps and overdue tasks; ADMIN / MANAGER
  also get buyer steps naming them on proposals they are not involved in. Every list is personal for every role.
- **Notifications (the bell)** (`ActivityService`, same transaction as the change): every logged movement also becomes
  an `ACTIVITY` notification for every active ADMIN / MANAGER and, when it concerns a task (`entityType TASK`, or the
  `taskId` option), for that task's active assignees, plus the log's `extraRecipientIds` (active users: the assignees of
  a deleted task and its sub tasks, and people taken off a task) — never the actor. `title` = the actor's nickname (else name)
  `· <proposal code>`, `body` = the log summary, `link` = `/proposals/:id` (`?task=` while the task exists, `?tab=present`
  / `?tab=production` for those actions) or the master-data page (`/admin/stores|shelf-types|products|manufacturers|
  templates|users|departments`; `/admin/activity` for a reader without that page's permission; null for a deleted
  proposal). Only repeated edits of one task merge: a `task.update` (link with `?task=`) goes into the recipient's
  unread `ACTIVITY` row of an earlier `task.update` with the same title and link from the last 10 minutes (new summary,
  moves to the top); every other movement adds a row. Direct notices (`TASK_ASSIGNED`, `COMMENT`, `PROPOSAL_STATUS`) are kept;
  within one transaction a person who gets a direct notice for the same page (path, query ignored) gets no `ACTIVITY`
  row for it. Comments are not logged: their notice (assignees + owner) also goes to every active ADMIN / MANAGER,
  once each, never the author.
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
| PATCH | /departments/:id | `department.manage` | `{ name?, isActive? }` — a rename renames it on every user (FK cascade) and, in the same transaction, on every task and template step whose `responsible` matches the old name (`sameDepartment`; counts in the activity note); inactive = kept by current users, not assignable | `Department` |
| DELETE | /departments/:id | `department.manage` (409 `IN_USE` `ลบไม่ได้ เพราะมีผู้ใช้ N คนอยู่ในแผนกนี้ — ปิดการใช้งานแทนได้` while any user has it) | — | `true` |
| PUT | /departments/order | `department.manage` | `{ ids: string[] }` (sortOrder = index + 1, one transaction) | `true` |
| GET | /manufacturers | signed in | `?includeInactive=true` (any signed-in user: the confirm dialog's picker loads it to show an inactive current value and the "ถูกปิดใช้งาน" hint for a typed inactive name) | `Manufacturer[]` (sortOrder) — active only by default |
| GET | /manufacturers/usage | `manufacturer.manage` | — | `Record<manufacturerId, proposalCount>` (every manufacturer, 0 when unused; a proposal counts once however many of its production orders name it) |
| POST | /manufacturers | `manufacturer.manage` or `proposal.create` (the confirm dialog's inline add) | `ManufacturerInput` — `name` trimmed, inner spaces collapsed, 1–120 chars; `note` ≤ 500, `''` → null; duplicate ignoring case → 422 field `name` `มีบริษัทชื่อนี้อยู่แล้ว`, or for an inactive one `มีบริษัทชื่อนี้อยู่แล้วแต่ถูกปิดใช้งาน — ให้ผู้ดูแลเปิดใช้งานในหน้าบริษัทรับผลิต` | `Manufacturer` (added last) |
| PATCH | /manufacturers/:id | `manufacturer.manage` | `{ name?, note?, isActive? }` — same name rules (itself excluded); inactive = kept by the orders that name it, not pickable; nothing changed → no write | `Manufacturer` |
| DELETE | /manufacturers/:id | `manufacturer.manage` (409 `IN_USE` `ลบไม่ได้ เพราะมีใบสั่งผลิตใช้บริษัทนี้อยู่ — ปิดการใช้งานแทนได้` while any production order names it) | — | `true` |
| PUT | /manufacturers/order | `manufacturer.manage` | `{ ids: string[] }` (sortOrder = index + 1, one transaction) | `true` |
| GET | /stores | signed in | `?includeInactive=true` | `Store[]` (channel, sortOrder) |
| GET | /stores/usage | signed in | — | `Record<storeId, proposalCount>` (a proposal counts once at each store it lists or keeps a presentation track of — what `DELETE /stores/:id` refuses on) |
| POST | /stores | `store.manage` | `StoreInput` | `Store` |
| PATCH | /stores/:id | `store.manage` | `Partial<StoreInput> & { isActive? }` | `Store` |
| DELETE | /stores/:id | `store.manage` (409 `IN_USE` when a proposal lists it or keeps a presentation track of it) | — | `true` |
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
| DELETE | /products/:id | `product.manage` (409 `IN_USE` while a proposal lists it, or keeps production data of it: `ลบไม่ได้ เพราะสินค้านี้มีข้อมูลการผลิตใน n โปรเจกต์ — ปิดการใช้งานแทนได้`) | — | `true` |
| GET | /task-templates | signed in | `?includeInactive=true` | `TaskTemplate[]` — every-channel (`channel: null`) templates first, then oldest first |
| GET | /task-templates/suggest | signed in | `?channel=&shelfTypeId=&storeId=` | `TaskTemplate` or empty (null). Candidates: active, `channel` = given or `null`, shelf/store `null` or matching; most specific wins (store +4, shelf +2, channel-specific +1), ties → oldest |
| GET | /task-templates/:id | signed in | — | `TaskTemplate` |
| GET | /task-templates/:id/preview | signed in | `?targetDate=YYYY-MM-DD&excluded=a,b` | `TemplatePreviewItem[]` |
| POST | /task-templates | `template.manage` | `TemplateInput` (item ids may be client temp ids; server re-keys; each item's optional `fieldLabels` = table row labels, trimmed, blanks dropped, max 100). `channel: null` = every channel; then `shelfTypeId` and `storeId` must be null (422) | `TaskTemplate` |
| PATCH | /task-templates/:id | `template.manage` | `Partial<TemplateInput>` (items replace all; same `channel: null` rule on the resulting template) | `TaskTemplate` |
| DELETE | /task-templates/:id | `template.manage` | — | `true` |
| GET | /proposals | signed in (scope rules) | `?q&status&channel&storeId&shelfTypeId&ownerId&scope=mine\|all` — `storeId` matches any of a proposal's stores; `q` searches every store name | `ProposalListItem[]` (`stores: Store[]`, admin store order) |
| GET | /proposals/:id | can view | — | `ProposalDetail` |
| POST | /proposals | `proposal.create` | `CreateProposalInput` — ONE proposal listed at every store in `storeIds` (same channel, one shared task list); no title → "<first product> +N → <stores>". `targetDate` must be the 15th and not before today (422). Plan / template `responsible` → each task's `responsible`; plan / template `fieldLabels` → the task starts as a table (`descriptionFormat: FIELDS`, one empty row per label), otherwise description stays null | `Proposal` |
| PATCH | /proposals/:id | owner or `proposal.details.any` (ADMIN) — a MANAGER who is not the owner gets 403 `แก้ไขข้อมูลโปรเจกต์ได้เฉพาะเจ้าของโปรเจกต์หรือ Admin`; the owner may hand the project to someone else (`ownerId`) | `UpdateProposalInput` — a changed `storeIds` (min 1, same channel; new stores must be active) needs `proposal.stores.edit` = ADMIN only (403 `ห้างของโปรเจกต์ที่สร้างแล้ว แก้ไขได้เฉพาะ Admin เท่านั้น`); the same set in any order is ignored. Changing `productIds` / `storeIds` locks the proposal row, deletes production drafts / skips of SKUs taken out and sends the production owner notices (see *Production*) | `Proposal` |
| POST | /proposals/:id/status | owner or `proposal.update.any` | `{ status }` | `Proposal` |
| POST | /proposals/:id/target-date | owner or `proposal.reschedule` (ADMIN) — a MANAGER or team member who is not the owner gets 403 `เลื่อนวันวางขายได้เฉพาะเจ้าของโปรเจกต์หรือ Admin` | `{ targetDate, shiftTasks }` — `targetDate` must be the 15th (422) | `Proposal` |
| POST | /proposals/:id/duplicate | `proposal.create` + can view | `{ storeIds, targetDate }` — a new proposal for those stores (any of the channel, the source's included); `targetDate` must be the 15th (422); tasks keep `responsible` and the details table (values too) | `Proposal` |
| DELETE | /proposals/:id | `proposal.delete.any`, or owner of a DRAFT; 409 `IN_USE` while a SKU is still confirmed for production — IN_PRODUCTION / PRODUCED / DELIVERED (`productionDeleteBlock`: `มีสินค้าที่ยืนยันผลิตอยู่ n SKU ลบไม่ได้ — ยกเลิกการผลิตทุก SKU …`); SKUs whose production was cancelled don't block an Admin (their production rows, events and orders cascade with the proposal), but anyone without `proposal.delete.any` gets 409 `IN_USE` `PRODUCTION_HISTORY_DELETE` (`โปรเจกต์นี้มีประวัติการผลิต — ลบได้เฉพาะ Admin …`) while any SKU was ever confirmed | — | `true` |
| GET | /proposals/:id/tasks | can view | — | `Task[]` (flat) |
| GET | /proposals/:id/comment-counts | can view | — | `Record<taskId, count>` |
| GET | /proposals/:id/report | can view | — | `ProposalReport` — extras for the PDF export page: `users` the tasks refer to (assignees, completed by, created by; deactivated included), every task `comments` (oldest first), `lastActivity` = latest TASK activity per task id (absent when a task was never changed after creation) |
| GET | /tasks/mine | signed in | `?status=open\|done\|all&due=overdue\|today\|week\|all&proposalId=` | `TaskWithContext[]` — every item has `countable` = a leaf task of an IN_PROGRESS proposal (see *Overdue*). `due=overdue\|today\|week` list countable tasks only (`week` = due today … today + 7); `due=all` lists everything (assigned parent tasks, DRAFT / ON_HOLD / COMPLETED proposals) |
| POST | /tasks | member/owner or `task.manage.any`; with a `responsible` department only people of that department or ADMIN (403 `เพิ่มงานของแผนก X ได้เฉพาะคนในแผนก X หรือ Admin`; a sub task is judged by its own department) | `CreateTaskInput` (optional `responsible` department; dates allowed) | `Task` |
| PATCH | /tasks/:id | `canManageTask` (department lock, see *Department lock on tasks*); the task's same-department assignees may change the description and fill `detailValues` only (not title, assignees, `responsible`, priority, `descriptionFormat` or the table rows); changed `startDate` / `dueDate` need ADMIN (`canEditTaskDates`; 403 `TASK_DATES_ADMIN_ONLY`). Assignees taken off the task get an `ACTIVITY` notice | `UpdateTaskInput` (`responsible: null` or `''` clears it; table rows, see *Task details*; changes are noted in the activity log). A table edit re-applies the completion rules (see the toggle row): the task and its ancestors are ticked / re-opened to match, the editor becomes the completer, logged as `task.complete` / `task.reopen` `กรอกข้อมูลครบ — ทำเครื่องหมายเสร็จอัตโนมัติ: …` / `ข้อมูลไม่ครบ — เปิดงานอีกครั้งอัตโนมัติ: …` | `Task` |
| POST | /tasks/:id/toggle | `canToggleTask`: managers or the task's assignees, same department only (else 403 `taskLockReason`) | `{ isDone }` — only a task ticked by hand: one with neither a table (FIELDS with ≥ 1 row) nor sub tasks. Any other task is done exactly when its table is fully filled (if it has one) AND all its sub tasks are done (if any) — `deriveCompletion`, re-applied after every create / move / delete / duplicate / table edit; toggling it → 422 `autoCompletionHint` (`ติ๊กเสร็จอัตโนมัติเมื่อ…`) | `{ changed: Task[], progress, allDone }` |
| POST | /tasks/:id/move | `moveTaskLockReason`: same parent (reorder) → `canManageTask` on the task; another parent → also every sub task, the current and the target parent | `MoveTaskInput` | `Task[]` (whole proposal) |
| POST | /tasks/:id/duplicate | `canManageTask` on the task, every sub task copied and its parent | — | `Task` (copy of subtree root, `responsible`, `descriptionFormat` and `detailFields` copied) |
| DELETE | /tasks/:id | `canManageTask` on the task and every sub task | — | `{ removed: string[] }` — the active assignees of every deleted task get an `ACTIVITY` notice |
| GET | /tasks/:id/comments | can view | — | `CommentWithAuthor[]` |
| POST | /tasks/:id/comments | can view | `{ body }` | `CommentWithAuthor` |
| GET | /proposals/:id/presentation | can view | — | `PresentationData` (see *Presentation*) |
| POST | /proposals/:id/presentation/packages | record (all tasks done) | `{ taskIds, storeIds, meetingDate, presenterIds, note }` — `taskIds` done level-1 tasks of the proposal (snapshotted in task order), `storeIds` stores of the proposal without a track yet (409 `{names} อยู่ในชุดนำเสนออยู่แล้ว`), tracks in the proposal's store order; `seq` = max + 1 | `PresentationData` (201) |
| DELETE | /proposals/:id/presentation/packages/:packageId | record; every track of the package untouched (409 `มี{ห้าง}ที่บันทึกขั้นตอนแล้ว ลบไม่ได้ …`) | — | `PresentationData` |
| POST | /proposals/:id/presentation/record | record; WITHDRAWN needs finalize; REPITCH needs all tasks done | `{ trackIds, expectStage, events }` — `events` = one step, or `[PRESENTED, NEEDS_INFO \| PASSED \| REJECTED]` (anything else 422 `ขั้นตอนไม่ถูกต้อง`), appended to every track in order, each allowed by `NEXT` from the stage reached so far (e.g. `[PRESENTED]`, `[PRESENTED, PASSED]`, `[NEEDS_INFO]`, `[INFO_SENT]`, `[WITHDRAWN]`, `[REPITCH]`). Free text is stored trimmed (blank optional text → `null`), the limits (≤ 500, buyer name ≤ 80) counted on the trimmed text. Several tracks only for `PRESENTED` alone or `PASSED` with `acceptedProductIds: null` (422). `REPITCH` sends `{ taskIds, changes, meetingDate, presenterIds }`; the server snapshots the tasks. The buyer name of `PRESENTED` stays on the first track only | `PresentationData` |
| POST | /proposals/:id/presentation/tracks/:trackId/schedule | record; track AWAITING (409) | `{ meetingDate, presenterIds, contactName }` (contact trimmed, ≤ 80) | `PresentationData` |
| POST | /proposals/:id/presentation/tracks/:trackId/revert | record; finalize for PASSED · REJECTED · WITHDRAWN | `{ targetEventId }` — must be the track's latest effective stage event (`lastRevertable`), else 409 | `PresentationData` (appends REVERTED) |
| POST | /proposals/:id/presentation/tracks/:trackId/edit | record; finalize for PASSED · REJECTED · WITHDRAWN | `{ targetEventId, patch }` — fields of the target kind's `EDITABLE_FIELDS` (others dropped; a re-pitch's tasks as `taskIds`; text trimmed as in `record`). Reverted / unknown target → 409 `ข้อมูลนี้เปลี่ยนไปแล้ว …`; dates rechecked against the neighbouring steps (422); a problem the event already had (e.g. a pass that became partial because SKUs were added later) only blocks a patch that touches its fields. A patch that changes nothing writes nothing | `PresentationData` (appends EDITED) |
| DELETE | /proposals/:id/presentation/tracks/:trackId | record; track untouched (only CREATED / SCHEDULED; 409 `บันทึกขั้นตอนแล้ว นำออกไม่ได้ …`) | — | `PresentationData` (the package goes with its last track) |
| GET | /proposals/:id/production | can view | — | `ProductionView` (see *Production*; one consistent snapshot) |
| PUT | /proposals/:id/production/quantities | decide | `{ items: { productId, quantity: 1–1,000,000, before: number \| null }[] }` (1–200, unique) — confirmed SKUs only ("แก้จำนวนผลิต"; a PENDING SKU → 409 `สถานะของ {SKU} เปลี่ยนไปแล้ว …`, its quantity is sent with confirm); `before` = the saved quantity the client showed (409 when it moved); unlisted SKU → 409, CANCELLED → 409; unchanged values are skipped, nothing changed → no write. On a SKU that still passes it also acknowledges the passing stores | `ProductionView` |
| PATCH | /proposals/:id/production/plan | team; `leadDays` changes need decide | `{ leadDays?: 0–90, note?: string \| null }` (≥ 1 key; note trimmed, ≤ 500, blank → null) — upserts `production_plans`; no change → no write | `ProductionView` |
| POST | /proposals/:id/production/confirm | decide | `{ items: { productId, quantity, saved }[], neededOn?, order: { referenceNo, manufacturerId, mainContactId, coContactIds, startedOn, productionDays } }` — exactly `pendingIds` (else 409), each with its quantity (1–1,000,000) and `saved` (409 when the saved quantity moved); `neededOn` ("วันที่ต้องการสินค้า") today … the launch date (422 `วันที่ต้องการสินค้าต้องไม่ก่อนวันนี้` / `วันที่ต้องการสินค้าต้องไม่เกินวันวางขาย (…)` / once the launch has passed `เลยวันวางขายแล้ว — วันที่ต้องการสินค้าเลือกได้แค่วันนี้`), default `defaultNeededOn` (the plan deadline clamped into that range). `order` (required; missing → 422 `ข้อมูลไม่ถูกต้อง`; a missing / `null` / `''` `manufacturerId`, `mainContactId`, `startedOn` or `productionDays` → 422 `เลือกบริษัทรับผลิต` / `เลือกผู้ติดต่อหลัก` / `เลือกวันที่เริ่มผลิต` / `กรอกระยะเวลาผลิต` with `fields`; `startedOn` within `orderStartBounds(earliestPassedOn(pending rows), today, targetDate)`, `productionDays` 1–365) is checked before anything is written and creates the press's production order (see *Production*; `seq` never reuses a number). Rows → `IN_PRODUCTION`, `ackStoreIds` = their passing stores, `orderId` = the new order, `startedOn` = the order's `startedOn` (CONFIRM event `date` = it) | `ProductionView` |
| POST | /proposals/:id/production/advance | team | `{ productIds (1–200), from: 'IN_PRODUCTION' \| 'PRODUCED', to?: 'DELIVERED', date, deliveredOn? }` — one step for every listed SKU (each must be in `from`, else 409): IN_PRODUCTION → PRODUCED (`date` ≥ `startedOn`, so not before a start that is still ahead) or PRODUCED → DELIVERED (`date` ≥ `producedOn`); `from: 'IN_PRODUCTION', to: 'DELIVERED'` records both (`date` = produced, `deliveredOn` = delivered). Dates ≤ today; a per-SKU error is prefixed `{SKU}: ` when several SKUs are sent. Delivery freezes `dueOn` | `ProductionView` |
| POST | /proposals/:id/production/items/:productId/back | decide | `{ from: 'IN_PRODUCTION' \| 'PRODUCED' \| 'DELIVERED' }` — one step back, clearing that step's fields; IN_PRODUCTION → PENDING clears the confirmation and the order link (the quantity is kept and prefilled at the next confirm; a SKU no longer in the proposal loses its row; an order left without SKUs is deleted) | `ProductionView` |
| PATCH | /proposals/:id/production/items/:productId/dates | team | `{ neededOn?, producedOn?, deliveredOn? }` (≥ 1 key) — `neededOn` on IN_PRODUCTION / PRODUCED needs decide (403 otherwise; same bounds as confirm; DELIVERED → 422 `ส่งแล้ว — แก้วันที่ต้องการสินค้าไม่ได้`), `producedOn` on PRODUCED / DELIVERED, `deliveredOn` on DELIVERED (else 422 `ยังไม่ได้บันทึกขั้นนี้ จึงแก้วันที่ไม่ได้`); `startedOn ≤ producedOn ≤ deliveredOn ≤ today`; `dueOn` unchanged | `ProductionView` |
| POST | /proposals/:id/production/items/:productId/cancel | decide | `{ reason, from: 'PENDING' \| 'IN_PRODUCTION' \| 'PRODUCED' }` — reason required (trimmed, ≤ 500); from PENDING = "ไม่ผลิต" (skip; never in the confirm set); DELIVERED → 422 `ส่งแล้ว ยกเลิกไม่ได้ — ย้อนสถานะก่อน` | `ProductionView` |
| POST | /proposals/:id/production/items/:productId/restore | decide | `{}` — CANCELLED only (else 409): a skip → PENDING, else PRODUCED when it was produced, else IN_PRODUCTION | `ProductionView` |
| POST | /proposals/:id/production/items/:productId/keep | decide | `{ storeIds }` — the passing store ids the client showed; the row must need review and the ids must equal the current passing stores (else 409). Acknowledges them ("ผลิตต่อ" / "จำนวนเดิมใช้ได้") | `ProductionView` |
| PATCH | /proposals/:id/production/orders/:orderId | decide (403 `แก้ข้อมูลใบสั่งผลิตได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ`) | `{ updatedAt, referenceNo?, manufacturerId?, mainContactId?, coContactIds?, startedOn?, productionDays? }` (≥ 1 field besides `updatedAt`, else 422 `ไม่มีข้อมูลที่จะแก้ไข`) — any SKU status, cancelled ones too. `updatedAt` = the order the client showed (409 `STALE` when it moved); an order of another proposal or already deleted → 404. The fields sent replace the current ones (an absent key keeps its value; `manufacturerId` / `mainContactId` sent as `null` or `''` → 422 `เลือกบริษัทรับผลิต` / `เลือกผู้ติดต่อหลัก`; a co-contact made the main contact leaves the co-contacts when `coContactIds` is not sent); `startedOn` / `productionDays` alone or together (`null` / `''` → 422 `เลือกวันที่เริ่มผลิต` / `กรอกระยะเวลาผลิต`), except on an order without a schedule yet (confirmed before schedules existed): sending one needs the other (the missing one → 422 as required). Only a changed value is checked: a new start within the bounds of the order's SKUs' passes and the launch, and not after the earliest produced / delivered date among them (422 `วันที่เริ่มผลิตต้องไม่หลังวันที่ผลิตเสร็จ (…)`); it becomes the `startedOn` of every SKU on the order. Same rules as confirm, except the current manufacturer may stay and each current contact may stay in the role they hold (a role change is checked like a new pick; refusals carry `fields` `mainContactId` / `coContactIds`). Nothing changed → no write; else one `ORDER` event per SKU of the order (ids and names, see *Production*), activity `production.order`, notices to people newly in a role | `ProductionView` |
| GET | /activity | `activity.read.all`, or can view `proposalId` | `?proposalId=&limit=` | `ActivityWithActor[]` |
| GET | /notifications | signed in | — | `AppNotification[]` (own, newest first: the newest 50 plus every unread non-`ACTIVITY` notice (newest 50), deduped; see *Notifications*). Deletes the caller's read notifications older than 60 days first |
| POST | /notifications/read | signed in | `{ id: string \| "all" }` | `true` |
| GET | /dashboard/home | signed in | — | `HomeDashboard` (see *Home dashboard*) |
| GET | /dashboard/badge | signed in | — | `NavBadges` — `{ overdueTasks }`: my overdue tasks (*Overdue*), one statement; equals the agenda's overdue task rows and `/tasks/mine?due=overdue` |
| GET | /dashboard/summary | `dashboard.monitor` | — | `DashboardSummary` — `kpis.overdueTasks`, `overdueTasks`, `workload[].overdue` and `byStore[].overdueTasks` follow *Overdue*; `atRisk` = IN_PROGRESS proposals with a `proposalHealth()` chip (and COMPLETED ones with a production alarm), each with `health: { level: LATE\|AT_RISK, reason }`, LATE first then `targetDate`; `buyerOverdue: BuyerAgendaItem[]` = every overdue buyer step of IN_PROGRESS / COMPLETED proposals, merged, `team: false` (same counts as the home `team` strip) |
| GET | /health | public | — | `{ ok, schema, dbTime }` |
