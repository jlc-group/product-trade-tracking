# ตรวจสอบการบันทึกข้อมูลจากหน้าเว็บลงฐานข้อมูล

วันที่: 1 ต.ค. 2569 · วิธีตรวจ: ไล่ทุกช่องกรอกจากหน้าจอ → request → validation (zod) → service → คอลัมน์ใน DB แล้วทดสอบจริงด้วยค่าขอบ (ไทย+วรรณยุกต์, emoji, อักขระพิเศษ, ความยาวสูงสุด, วันที่ข้ามปี) บน **ฐานข้อมูลทดสอบแยก (Docker, timezone Asia/Bangkok เหมือนเครื่องจริง)** — ไม่ได้แตะข้อมูลจริง ทุกปัญหาผ่านการตรวจซ้ำโดย agent อีกตัวที่พยายามหักล้าง

## ปัญหาที่พบและแก้แล้วระหว่างตรวจ

- 🔴 **เวลา (timestamp) ทุกค่าถูกเก็บเร็วไป 7 ชั่วโมง** — เซิร์ฟเวอร์ PostgreSQL ตั้ง timezone เป็น Asia/Bangkok แต่ driver ส่งเวลาแบบไม่มี timezone → แก้โดยตั้ง session timezone = UTC (`apps/api/src/prisma/prisma.service.ts`) และแก้ข้อมูลเดิม +7 ชม. แล้ว (สำรองข้อมูลก่อนแก้)

## สรุปตามส่วนของระบบ

| ส่วน | ช่องที่ตรวจ | บันทึกครบ | มีปัญหา | ไม่ต้องบันทึก (ตั้งใจ) |
|---|---|---|---|---|
| แม่แบบ Task | 21 | 16 | 1 | 3 |
| ห้าง / ประเภท Shelf / สินค้า | 31 | 29 | 0 | 2 |
| ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า | 25 | 15 | 0 | 8 |
| Task + ความคิดเห็น | 21 | 15 | 1 | 3 |
| การเสนอสินค้า + Wizard | 30 | 21 | 5 | 4 |
| หน้าแสดงผล + ภาพรวมทั้งระบบ | 33 | 11 | 14 | 6 |

## รายการปัญหาที่ยืนยันแล้ว (76 รายการ)

- 🟠 สำคัญ **TC-1** (Task + ความคิดเห็น) — แก้งานพร้อมกันแล้วข้อมูลหายเงียบ ๆ (lost update): PATCH /tasks/:id เขียน title/startDate/dueDate จากค่าเก่าทับทุกครั้ง
  - วิธีแก้: apps/api/src/modules/tasks/tasks.service.ts update(): (1) ล็อกก่อนอ่านตามแบบ openForTreeEdit คือ const proposalId = await this.proposalIdOf(tx, id); await lockProposal(tx, proposalId); แล้วค่อยเรียก findTask ซึ่งจะเรียงลำดับการทำงานกับ toggle/move/remove/duplicate และ changeTargetDate (proposals.service.ts ที่ล็อก proposal ก่อน) ให้ทำทีละตัว (2) ใส่ title/startDate/dueDate ลงใน data เฉพาะเมื่อฟิลด
- 🟠 สำคัญ **TC-2** (Task + ความคิดเห็น) — ผู้รับผิดชอบที่ถูกปิดการใช้งานยังอยู่ใน DB แต่หน้าเว็บไม่แสดง และทำให้แก้รายชื่อผู้รับผิดชอบไม่ได้
  - วิธีแก้: API: ใน tasks.service.ts update() ให้ตรวจ active เฉพาะ id ที่เพิ่มใหม่ (เช่น this.access.activeUserIds(tx, added)) ส่วน id ที่มอบหมายอยู่แล้วให้คงไว้หรือเอาออกได้ (ตรวจแค่ว่ามีผู้ใช้นี้อยู่จริง). เว็บ: ให้มีแหล่งข้อมูลผู้ใช้ที่ปิดใช้งานแล้ว (เช่น GET /users/lookup?includeInactive=true หรือแนบข้อมูลผู้ใช้ของ assignee/createdBy/completedBy มากับ Task/ProposalDetail) แล้วใส่ลง usersById ใน task-tree.
- 🟠 สำคัญ **templates-01** (แม่แบบ Task) — ไม่มีการป้องกันการแก้ไขพร้อมกัน: บันทึกทีหลังทับงานที่คนอื่นบันทึกไปก่อนแบบเงียบๆ และหน้า editor ไม่โหลดข้อมูลใหม่จากเซิร์ฟเวอร์
  - วิธีแก้: API: ใน templates.schemas.ts เพิ่ม expectedUpdatedAt: z.iso.datetime().optional() ใน updateTemplateSchema แล้วใน templates.service.ts update() หลังอ่าน existing ให้เช็คว่าถ้า body.expectedUpdatedAt ไม่ตรงกับ existing.updatedAt.toISOString() ให้ throw 409 code 'STALE' พร้อมข้อความ 'มีผู้อื่นบันทึกแม่แบบนี้แล้ว กรุณาโหลดใหม่' (ถ้าต้องการกันเรื่อง race ให้ใช้ updateMany where {id, updatedAt} แล้วเช็ค
- 🟡 เล็กน้อย **MD-01** (ห้าง / ประเภท Shelf / สินค้า) — ชื่อย่อที่ระบบเติมให้อัตโนมัติตัดอีโมจิครึ่งตัว ทำให้เก็บเป็นอักขระเสีย (U+FFFD)
  - วิธีแก้: store-form-dialog.tsx:34 เปลี่ยนเป็น Array.from(name.replace(/\s+/g,'')).slice(0, SHORT_MAX).join('') (หรือใช้ Intl.Segmenter แบบ grapheme) แล้วตัดซ้ำให้ .length ไม่เกิน 6 ทำแบบเดียวกันกับ stores.service.ts:52 และ :82 (name.slice(0,5)) และเพิ่ม .refine(s => s.isWellFormed(), 'มีอักขระไม่ถูกต้อง') ใน zShortName และ zName ของ stores.schemas.ts
- 🟡 เล็กน้อย **MD-02** (ห้าง / ประเภท Shelf / สินค้า) — ชื่อย่อภาษาไทยนับสระและวรรณยุกต์เป็นตัวอักษรด้วย จึงกรอกชื่อห้างจริงบางชื่อไม่ได้ และช่อง input ตัดเงียบ ๆ
  - วิธีแก้: นับความยาวชื่อย่อเป็น grapheme cluster (new Intl.Segmenter('th',{granularity:'grapheme'})) ใน store-form-dialog.tsx (schema :26, CharCount, suggestShortName และเอา maxLength={6} ออกหรือเพิ่มเป็นเพดานที่หลวมกว่า เช่น 12) และใน stores.schemas.ts zShortName (.refine ตามจำนวน grapheme ≤ 6) ถ้าไม่เปลี่ยน ให้แก้ข้อความ hint เป็น 'ไม่เกิน 6 ตัว (นับสระและวรรณยุกต์ด้วย)'
- 🟡 เล็กน้อย **MD-03** (ห้าง / ประเภท Shelf / สินค้า) — เปลี่ยนช่องทางของห้างหรือประเภท Shelf แล้วลำดับ (sort_order) ยังเป็นของช่องทางเดิม ทำให้ไปแทรกกลางรายการหรือได้ลำดับซ้ำกัน
  - วิธีแก้: ใน StoresService.update และ ShelfTypesService.update ถ้า patch.channel !== undefined และต่างจาก channel เดิม ให้ทำ const max = await tx.store.aggregate({ where: { channel }, _max: { sortOrder: true } }) แล้วใส่ sortOrder: (max._max.sortOrder ?? 0) + 1 ใน data ของ update (ทำใน transaction เดียวกัน และใช้ tx.shelfType ใน shelf-types.service.ts)
- 🟡 เล็กน้อย **MD-04** (ห้าง / ประเภท Shelf / สินค้า) — เกณฑ์ตรวจของ dialog เพิ่มสินค้าด่วนหลวมกว่าฟอร์ม Admin สินค้าที่เพิ่มจาก wizard จึงเปิดแก้ในหน้า Admin แล้วบันทึกไม่ได้ ถ้ายังไม่แก้ SKU, บาร์โค้ด หรือแบรนด์/หมวดหมู่ก่อน
  - วิธีแก้: เลือกทางใดทางหนึ่ง (1) ให้ API บังคับเกณฑ์เดียวกับ Admin: ใน products.schemas.ts เพิ่ม .regex(/^[A-Z0-9][A-Z0-9._-]*$/) หลัง transform ของ zSku และ refine บาร์โค้ด /^\d{8,14}$/ (เมื่อไม่ว่าง) แล้วทำให้ quick-add-product-dialog.tsx แปลง SKU เป็นตัวพิมพ์ใหญ่และแทนช่องว่างด้วย '-' แบบเดียวกับ Admin พร้อมแสดง error ใต้ช่อง หรือ (2) ผ่อน zod ใน product-form-dialog.tsx:21-29 ให้ตรงกับ API (brand/categor
- 🟡 เล็กน้อย **MD-06** (ห้าง / ประเภท Shelf / สินค้า) — บาร์โค้ดซ้ำกันได้ เพราะตรวจแค่ฝั่ง UI ของฟอร์ม Admin ส่วน API และ quick-add ไม่ได้ตรวจ
  - วิธีแก้: products.service.ts: ใน create และใน update (เมื่อ patch.barcode เปลี่ยน) ให้ findFirst({ where: { barcode, id: { not: id } } }) แล้ว throw invalid('บาร์โค้ดนี้ใช้กับ <sku> อยู่แล้ว', { barcode: ... }) และเพิ่ม migration CREATE UNIQUE INDEX products_barcode_key ON flowtrade.products(barcode) WHERE barcode IS NOT NULL (ต้องตรวจข้อมูลจริงก่อนว่ามีบาร์โค้ดซ้ำหรือไม่) ส่วน quick-add-product-dialog.tsx
- 🟡 เล็กน้อย **MD-07** (ห้าง / ประเภท Shelf / สินค้า) — ลบห้างแล้วแม่แบบ Task ที่ผูกกับห้างนั้นกลายเป็น 'ใช้ได้ทุกห้าง' โดยไม่มีคำเตือน (หน้าประเภท Shelf มีคำเตือน)
  - วิธีแก้: apps/web/src/pages/admin/stores.tsx: เพิ่ม const { data: templates } = useTemplates(true) แล้วนับ templates.filter(t => t.storeId === s.id).length และส่ง deleteNote={linked > 0 ? `แม่แบบ Task ${linked} รายการที่ผูกกับ${noun}นี้จะเปลี่ยนเป็นใช้ได้กับทุก${noun}` : undefined} แบบเดียวกับ shelf-types.tsx:167 ใน apps/web/src/api/hooks.ts masterMutations.useRemove ให้ invalidate ['templates'] เพิ่มสำหรั
- 🟡 เล็กน้อย **MD-08** (ห้าง / ประเภท Shelf / สินค้า) — ขึ้นบรรทัดใหม่ในคำอธิบายห้าง/ประเภท Shelf บันทึกได้ แต่หน้ารายการและ wizard แสดงเป็นบรรทัดเดียว
  - วิธีแก้: เพิ่ม class whitespace-pre-line (และ break-words) ใน <p>/<span> ที่แสดง description ใน apps/web/src/features/admin-master/master-row.tsx:42, shelf-type-card.tsx:43, apps/web/src/features/wizard/step-stores.tsx:81, step-shelf.tsx:55 หรือถ้าตั้งใจให้เป็นบรรทัดเดียว ให้ใช้ Input แทน Textarea และให้ zod ฝั่ง API แปลง \s+ เป็นช่องว่าง
- 🟡 เล็กน้อย **MD-09** (ห้าง / ประเภท Shelf / สินค้า) — dialog เพิ่มสินค้าด่วนไม่มี maxLength หรือข้อความ error ใต้ช่อง และตรวจ SKU ซ้ำเทียบแค่สินค้าที่เปิดใช้งาน
  - วิธีแก้: quick-add-product-dialog.tsx: ใส่ maxLength ตาม API (sku 30, name 120, brand/category 60, size 30, barcode 30) ใน catch ให้ตรวจ error instanceof ApiError && error.fields แล้วเก็บไว้ใน state เพื่อแสดงใต้ช่อง และเปลี่ยน :46 เป็น useProducts('', true) แล้วแสดงข้อความ 'รหัสนี้เป็นของสินค้าที่ปิดใช้งาน ติดต่อ Admin เพื่อเปิดใช้งาน' เมื่อ SKU ตรงกับสินค้าที่ isActive=false
- 🟡 เล็กน้อย **PW-01** (การเสนอสินค้า + Wizard) — ชื่อโปรเจกต์ที่ server ต่อท้าย ' — ชื่อห้าง' ยาวเกิน 200 ตัวอักษร ทำให้หน้า 'แก้ไขข้อมูล' บันทึกอะไรไม่ได้เลย (หมายเหตุ/สินค้า/ทีม/เจ้าของ/Shelf)
  - วิธีแก้: proposals.service.ts create(): หลังประกอบ title ของแต่ละห้าง ให้ตรวจ title.length <= 200 แล้ว throw invalid('ชื่อโปรเจกต์รวมชื่อห้างยาวเกิน 200 ตัวอักษร') หรือตัด customTitle ให้เหลือ 200 - (3 + store.name.length) ฝั่ง step-review.tsx:192 ให้คำนวณ maxLength จาก 200 - 3 - ความยาวชื่อห้างที่ยาวที่สุดเมื่อเลือกหลายห้าง และ edit-proposal-dialog.tsx:78-82 ส่ง title เฉพาะเมื่อ title.trim() !== proposal.
- 🟡 เล็กน้อย **PW-02** (การเสนอสินค้า + Wizard) — แม่แบบที่มี 'ผู้รับผิดชอบ' ยาวเกิน 200 (หรือชื่องานยาวเกิน 500) ทำให้สร้างโปรเจกต์จาก wizard ไม่ได้ และแก้ค่าผู้รับผิดชอบใน wizard ไม่ได้
  - วิธีแก้: templates.schemas.ts: เพิ่ม .max(500, 'ชื่องานยาวเกินไป (ไม่เกิน 500 ตัวอักษร)') ให้ templateItemSchema.title และ .max(200, 'ชื่อผู้รับผิดชอบยาวเกินไป') ให้ responsible (ก่อน transform) และใส่ maxLength={500}/{200} ในช่องกรอกของ template-tree.tsx ส่วนฝั่ง web ให้ toast แปลง key 'plan.N.xxx' เป็นชื่องานของแถวนั้น หรือทำ highlight แถวใน timeline
- 🟡 เล็กน้อย **PW-03** (การเสนอสินค้า + Wizard) — คัดลอกไปห้างอื่นแล้ว ชื่อโปรเจกต์ยังเป็นชื่อห้างต้นทาง (กรณีตั้งชื่อเอง)
  - วิธีแก้: proposals.service.ts duplicate(): ใช้ชื่อห้างต้นทาง (source.store.name) เป็นตัวระบุ ถ้า title ลงท้ายด้วย ` → ${sourceStore}` หรือ ` — ${sourceStore}` ให้แทนเฉพาะส่วนท้ายนั้นด้วยชื่อห้างใหม่ ห้ามใช้ regex /→ .+$/ กับชื่อที่ผู้ใช้ตั้งเอง หรือเพิ่มช่อง title (ค่าเริ่มต้นเป็นชื่อที่แนะนำ) ใน DuplicateDialog และใน duplicateSchema
- 🟡 เล็กน้อย **PW-05** (การเสนอสินค้า + Wizard) — API ให้เจ้าของที่เป็น role USER โอนความเป็นเจ้าของได้ (UI ระบุว่าทำได้เฉพาะผู้จัดการ/Admin) และเจ้าของเดิมเสียสิทธิ์เข้าถึง
  - วิธีแก้: proposals.service.ts update(): ก่อนบรรทัด 211 เพิ่ม if (patch.ownerId && patch.ownerId !== proposal.ownerId && !can(user, 'proposal.update.any')) throw forbidden('เฉพาะผู้จัดการหรือ Admin ที่เปลี่ยนเจ้าของได้') และเมื่อเปลี่ยนเจ้าของ ให้ server เพิ่มเจ้าของเดิม (ถ้ายังใช้งานอยู่) ลง proposal_members เอง ไม่ต้องพึ่ง client
- 🟡 เล็กน้อย **PW-06** (การเสนอสินค้า + Wizard) — ข้อมูลใน wizard เก็บอยู่ใน React state เท่านั้น ถ้ารีเฟรช ปิดแท็บ หรือคลิกเมนูอื่น ข้อมูลทั้ง 6 ขั้นรวมไทม์ไลน์ที่แก้ไว้จะหายโดยไม่มีคำเตือน
  - วิธีแก้: new-proposal-wizard.tsx: เพิ่ม useEffect ที่ผูก window 'beforeunload' เมื่อ isDirty(state) และใช้ useBlocker ของ react-router (when: isDirty(state) && !create.isSuccess) เพื่อแสดง confirm แบบเดียวกับปุ่มยกเลิก ถ้าต้องการกู้คืนได้ ให้เก็บ state (ยกเว้น step) ลง sessionStorage ภายใต้ try/catch แล้วโหลดคืนตอน mount
- 🟡 เล็กน้อย **PW-07** (การเสนอสินค้า + Wizard) — แก้ไทม์ไลน์แล้วเปลี่ยนแม่แบบ ประเภท Shelf หรือห้างแรก การแก้งานที่มาจากแม่แบบจะหายโดยไม่เตือน และกดสร้างได้ระหว่างโหลดแม่แบบใหม่ (บันทึกงานชุดเก่าคู่กับ templateId ใหม่)
  - วิธีแก้: new-proposal-wizard.tsx: canSubmit = firstIncomplete === LAST && !create.isPending && !plan.isLoading และก่อน dispatch setTemplate (step-review.tsx:112) ให้ถามยืนยันเมื่อ state.plan.edited เป็น true ส่วนกรณีแม่แบบที่แนะนำเปลี่ยนเอง ให้เก็บ templateId เดิมไว้ (เปลี่ยน state.template เป็น {kind:'id'}) เมื่อ plan.edited แล้วแสดง Callout ว่ามีแม่แบบที่แนะนำใหม่ พร้อมปุ่มให้ผู้ใช้เลือกเปลี่ยนเอง
- 🟡 เล็กน้อย **PW-08** (การเสนอสินค้า + Wizard) — ขีดจำกัดความยาวและจำนวนใน UI ไม่ตรงกับ API (ผู้ใช้เจอ error toast ตอนกดสร้าง/บันทึก หรือพิมพ์ต่อไม่ได้)
  - วิธีแก้: สร้างค่าคงที่ใน packages/shared/src (เช่น LIMITS = {proposalTitle:200, note:5000, taskTitle:500, planItems:500, product:{sku:30,name:120,brand:60,category:60,barcode:30,size:30}}) แล้วใช้ทั้งใน zod (proposals.schemas.ts, products.schemas.ts) และใน maxLength ของ step-review.tsx (title/note), edit-proposal-dialog.tsx (note 5000), timeline-editor.tsx (ชื่องานและแถวเพิ่มงาน), quick-add-product-dialog.
- 🟡 เล็กน้อย **PW-09** (การเสนอสินค้า + Wizard) — ข้อความถูกตัดช่องว่างหัวท้าย และหมายเหตุที่แสดงในหน้า detail ยุบช่องว่างหลายช่อง/tab เหลือช่องเดียว
  - วิธีแก้: proposal-header.tsx:141 เปลี่ยน whitespace-pre-line เป็น whitespace-pre-wrap ส่วนการ trim หัวท้ายใน proposals.service.ts:137-138,242-245 และ new-proposal-wizard.tsx:155-156 ถ้าต้องการคงย่อหน้าบรรทัดแรก ให้ใช้ note.replace(/^\s*\n|\s+$/g,'') (ตัดเฉพาะบรรทัดว่างด้านบนและช่องว่างท้าย) หรือแจ้งลูกค้าว่าเป็นพฤติกรรมที่ตั้งใจ
- 🟡 เล็กน้อย **RS-01** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — ไม่มีการสร้างแจ้งเตือน 'ใกล้ครบกำหนด' และ 'เลยกำหนด' เลย ทั้งที่ UI สัญญาไว้
  - วิธีแก้: ทางเลือก 1: เพิ่ม job รายวัน (เช่น @nestjs/schedule รันตามเวลาไทย) ใน apps/api/src ที่ query งาน is_done=false ที่ due_date = วันนี้/พรุ่งนี้ (TASK_DUE_SOON) และ due_date < วันนี้ (TASK_OVERDUE) แล้วเรียก ActivityService.notify ให้ assignee โดยกันซ้ำด้วย unique key (user_id,type,link,วันที่). ทางเลือก 2: ถ้าไม่ทำ ให้ลบคำว่า 'พร้อมแจ้งเตือนเมื่อใกล้ครบกำหนด' ใน apps/web/src/pages/my-tasks.tsx:254 แ
- 🟡 เล็กน้อย **RS-02** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — หน้าประวัติการใช้งานคำนวณสถิติจาก 300 แถวล่าสุด และแถวที่เก่ากว่าเปิดดูจาก UI ไม่ได้อีกเลย
  - วิธีแก้: apps/api/src/modules/activity/activity.controller.ts: เพิ่ม cursor pagination (before=createdAt+id) และตัวกรอง entityType/actorId/q ฝั่ง server, และ endpoint GET /activity/stats ที่ count วันนี้/7 วัน (ตามเวลา Asia/Bangkok), distinct actor และ count ต่อ entity_type. apps/web/src/pages/admin/activity.tsx: ใช้ stats จาก endpoint นั้นแทนการนับจาก items และใช้ useInfiniteQuery โหลดหน้าถัดไป; history-t
- 🟡 เล็กน้อย **RS-03** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — ตัวเลขงานใน Home/badge sidebar ไม่ตรงกับหน้า งานของฉัน/ปฏิทิน (นับ leaf vs นับทุกงาน)
  - วิธีแก้: เลือกนิยามเดียว: เพิ่ม children:{none:{}} ใน where ของ tasks.service.ts mine() (หรือเอาออกจาก dashboard.service.ts home()) ให้ตรงกัน; เพิ่ม query param เช่น completedSince=7d ใน MyTasksQuery/mine() แล้วเปลี่ยนลิงก์ใน apps/web/src/features/my-work/home-panels.tsx:60 เป็น /my-tasks?status=done&since=7d
- 🟡 เล็กน้อย **RS-04** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — หลายการกระทำไม่ส่งแจ้งเตือนให้คนที่ได้รับผลกระทบ (คัดลอกโปรเจกต์, เปลี่ยนเจ้าของ, เลื่อนวันวางขาย)
  - วิธีแก้: apps/api/src/modules/proposals/proposals.service.ts: ใน duplicate() เรียก this.activity.notify(tx, memberIds, memberNotice(row), user.id) และ notify TASK_ASSIGNED ต่อ assignee ของงานที่คัดลอก (รวมต่อคน); ใน update() เมื่อ ownerId เปลี่ยน ให้ notify เจ้าของใหม่ (PROPOSAL_STATUS หรือ type ใหม่) ; ใน changeTargetDate() เมื่อ shiftTasks ให้ notify assignee ของงานที่ถูกเลื่อน
- 🟡 เล็กน้อย **RS-05** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — KPI 'เสร็จเดือนนี้' ใน Monitor ตัดเดือนตามเวลา UTC ไม่ใช่เวลาไทย
  - วิธีแก้: apps/api/src/modules/dashboard/dashboard.service.ts:169 เปลี่ยนเป็น p.completedAt && todayBangkok(p.completedAt).slice(0, 7) === month
- 🟡 เล็กน้อย **RS-06** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — Monitor ตัดห้าง/ผู้ใช้ที่ปิดใช้งานออก ตัวเลขรวมไม่ตรง KPI และงานของผู้ใช้ที่ถูกปิดแสดงว่า 'ยังไม่มีผู้รับผิดชอบ'
  - วิธีแก้: dashboard.service.ts: ดึง stores/users ทั้งหมด (ไม่กรอง isActive) แล้วกรองเฉพาะแถวที่ active หรือมีงาน live > 0; ส่ง assignee User objects (รวม inactive) มาพร้อม overdueTasks หรือให้ overdue-tasks.tsx ใช้ GET /users (รวม inactive, สำหรับ admin/manager) แล้วแสดงป้าย 'ปิดใช้งาน' แทน 'ยังไม่มีผู้รับผิดชอบ'
- 🟡 เล็กน้อย **RS-07** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — การเปลี่ยนสถานะอัตโนมัติ DRAFT→IN_PROGRESS และการแสดงความคิดเห็น ไม่ถูกบันทึกในประวัติการใช้งาน
  - วิธีแก้: apps/api/src/modules/tasks/tasks.service.ts:253: หลัง update ให้เรียก this.activity.log(tx, user, 'proposal.status', 'PROPOSAL', proposal.id, proposal.id, `เปลี่ยนสถานะ ${proposal.code} เป็น "กำลังดำเนินการ" อัตโนมัติ`) และ notify owner+members แบบเดียวกับ proposals.service changeStatus; apps/api/src/modules/comments/comments.service.ts: เพิ่ม activity.log(tx, user, 'comment.create', 'TASK', task.
- 🟡 เล็กน้อย **RS-08** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — ขีดจำกัดความยาวข้อความไม่ตรงกันระหว่าง UI / API / แม่แบบ ทำให้แม่แบบที่บันทึกได้ใช้สร้างโปรเจกต์ไม่ได้
  - วิธีแก้: สร้างค่าคงที่ร่วมใน packages/shared/src (เช่น TITLE_MAX, NOTE_MAX, RESPONSIBLE_MAX, DESCRIPTION_MAX, COMMENT_MAX) แล้ว: ใส่ .max(TITLE_MAX)/.max(RESPONSIBLE_MAX)/.max(200) ให้ title, responsible, name, description ใน apps/api/src/modules/templates/templates.schemas.ts ให้เท่ากับ proposals.schemas.ts planItemSchema; ใส่ maxLength เดียวกันใน template-tree.tsx, timeline-editor.tsx, step-review.tsx (n
- 🟡 เล็กน้อย **RS-11** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — กระดิ่งแจ้งเตือนเห็นได้แค่ 50 รายการล่าสุด และข้อความแจ้งเตือนความคิดเห็นตัดอีโมจิครึ่งตัว
  - วิธีแก้: apps/api/src/modules/comments/comments.service.ts:50 เปลี่ยนเป็น Array.from(text).slice(0, 80).join('') (หรือใช้ Intl.Segmenter('th', {granularity:'grapheme'}) เพื่อไม่ตัดวรรณยุกต์ไทยแยกจากพยัญชนะ) และเติม '…' เมื่อถูกตัด; apps/api/src/modules/notifications/notifications.controller.ts: เพิ่ม cursor (before) + endpoint GET /notifications/unread-count ให้ bell ใช้ค่านับจริง
- 🟡 เล็กน้อย **TC-3** (Task + ความคิดเห็น) — ความยาวสูงสุดใน UI ไม่ตรงกับ API และ maxlength ตัดข้อความที่วาง (paste) ทิ้งเงียบ ๆ
  - วิธีแก้: กำหนดค่าคงที่ร่วมใน packages/shared/src (เช่น TASK_TITLE_MAX=500, TASK_DESCRIPTION_MAX=10000, COMMENT_MAX=5000) แล้วใช้ทั้งใน tasks.schemas.ts:10-11, comments.controller.ts:10 และ autosave-text.tsx:71, inline-add.tsx:124, task-row.tsx:285, task-comments.tsx:94; แสดงตัวนับหรือข้อความเตือนเมื่อเกิน (หรือ validate ตอน onChange/onPaste) แทนการพึ่ง maxlength ที่ตัดทิ้งเงียบ ๆ และนับความยาวแบบเดียวกับ A
- 🟡 เล็กน้อย **TC-4** (Task + ความคิดเห็น) — ข้อความถูก trim: ย่อหน้าบรรทัดแรกและบรรทัดว่างหน้า/หลังของรายละเอียดและความคิดเห็นหาย
  - วิธีแก้: สำหรับฟิลด์หลายบรรทัด (description ใน tasks.service.ts:167,215, comment ใน comments.service.ts:44, autosave-text.tsx:38 เมื่อไม่ใช่ singleLine) ให้ใช้ trim() แค่ตรวจว่าข้อความว่างหรือไม่ แล้วเก็บค่าเดิม หรือใช้ trimEnd()/ตัดเฉพาะบรรทัดว่างหัวท้าย เพื่อรักษาย่อหน้าบรรทัดแรก; ชื่องานยัง trim ได้ตามเดิม
- 🟡 เล็กน้อย **TC-5** (Task + ความคิดเห็น) — บันทึกอัตโนมัติ (ชื่อ/รายละเอียด) ล้มเหลวแล้วข้อความที่พิมพ์ถูกย้อนเป็นค่าเดิม ผู้ใช้เสียข้อความ
  - วิธีแก้: autosave-text.tsx: ให้ onSave รับ callback หรือคืน Promise (เช่น ส่ง onError ผ่าน actions.update ใน task-tree.tsx:206-207 ไปยัง updateTask.mutate) เมื่อบันทึกล้มเหลวให้คง draft ไว้ ไม่ resync กับ serverValue ที่ถูก rollback และแสดงสถานะ 'ยังไม่ได้บันทึก' พร้อมปุ่มลองใหม่ หรือสำรอง draft ไว้ใน sessionStorage ตาม taskId
- 🟡 เล็กน้อย **TC-7** (Task + ความคิดเห็น) — ข้อความแจ้งเตือนความคิดเห็นตัดที่ 80 หน่วย UTF-16 ทำให้ emoji แตกเป็นอักขระเสีย (U+FFFD) ใน notifications.body
  - วิธีแก้: comments.service.ts:50 เปลี่ยนเป็นตัดตาม code point/grapheme เช่น const chars = Array.from(text); const preview = chars.length > 80 ? chars.slice(0, 80).join('') + '…' : text (หรือใช้ Intl.Segmenter สำหรับ grapheme)
- 🟡 เล็กน้อย **TC-8** (Task + ความคิดเห็น) — คัดลอกงานต่อ ' (สำเนา)' โดยไม่ตรวจความยาว ทำให้ชื่อเกิน 500 ตัวอักษร
  - วิธีแก้: tasks.service.ts:341 ตัดชื่อเดิมให้สั้นพอ เช่น const suffix=' (สำเนา)'; const base = Array.from(r.title).slice(0, 500 - Array.from(suffix).length).join(''); title = base + suffix
- 🟡 เล็กน้อย **TC-9** (Task + ความคิดเห็น) — วันที่ปี 0000 ผ่าน zod แต่ Postgres ไม่รับ → 500 INTERNAL
  - วิธีแก้: tasks.schemas.ts:5-8 เพิ่ม refine จำกัดช่วงปี (เช่น 1900-2100 หรืออย่างน้อย >= 0001) แล้วตอบ 422 'วันที่ไม่ถูกต้อง'; ควรใช้ตัวเดียวกันกับ zBusinessDate/zPlanDate ใน proposals.schemas.ts ด้วย
- 🟡 เล็กน้อย **templates-02** (แม่แบบ Task) — ลบห้าง/แพลตฟอร์มแล้ว ห้างที่แม่แบบผูกไว้หายไปเงียบๆ: แม่แบบกลายเป็นใช้กับทุกห้าง ไม่มีคำเตือนและไม่มี log
  - วิธีแก้: web apps/web/src/pages/admin/stores.tsx: ทำแบบเดียวกับ shelf-types.tsx:72-90 คือใช้ useTemplates(true) นับแม่แบบตาม storeId แล้วส่ง deleteNote={linked > 0 ? `แม่แบบ Task ${linked} รายการที่ผูกกับห้างนี้จะเปลี่ยนเป็นใช้ได้กับทุกห้าง` : undefined} ให้ MasterRow api apps/api/src/modules/stores/stores.service.ts remove(): ก่อน tx.store.delete ให้หาแม่แบบที่ผูกกับห้างนี้ แล้วทำ taskTemplate.updateMany(
- 🟡 เล็กน้อย **templates-03** (แม่แบบ Task) — ช่องวันเริ่ม/วันสิ้นสุดไม่รับค่าทศนิยมโดยไม่แจ้ง: กล่องแสดงค่าที่พิมพ์ แต่ที่บันทึกคือค่าเดิม
  - วิธีแก้: template-tree.tsx OffsetField: เพิ่ม state ว่าข้อความในกล่องไม่ใช่จำนวนเต็ม (text !== '' && !Number.isInteger(Number(text))) แล้วตั้ง aria-invalid และแสดงข้อความ 'ใส่เป็นจำนวนวันเต็ม' ใต้กล่อง หรือจะปัดเป็นจำนวนเต็มด้วย Math.round ตอน onChange แล้ว setText ตามค่าที่ปัดก็ได้ ถ้าต้องการบล็อกการบันทึก ให้ยกสถานะ invalid ขึ้นไปที่ template-editor.tsx เพื่อให้ save() ปฏิเสธ
- 🟡 เล็กน้อย **templates-04** (แม่แบบ Task) — UI ไม่ตรวจข้อจำกัดเดียวกับ API (offset ±3650 วัน และไม่เกิน 500 งาน) และไม่แสดง error ของเซิร์ฟเวอร์ที่แถวที่ผิด
  - วิธีแก้: ย้าย MAX_OFFSET_DAYS และ MAX_TEMPLATE_ITEMS จาก apps/api/src/modules/templates/templates.schemas.ts:6-7 ไปไว้ที่ packages/shared/src แล้ว import ทั้งสองฝั่ง ใน tree-ops.ts validateItems ให้เพิ่ม issue field 'start'/'due' เมื่อ |offset| > MAX_OFFSET_DAYS และ issue 'items' เมื่อ items.length > MAX_TEMPLATE_ITEMS ใส่ min/max ให้ <Input type=number> ใน OffsetField ด้วย และใน template-editor.tsx save()
- 🟡 เล็กน้อย **templates-06** (แม่แบบ Task) — คำอธิบายแม่แบบที่มีหลายบรรทัดถูกเก็บครบ แต่แสดงเป็นบรรทัดเดียวใน wizard เสนอสินค้า
  - วิธีแก้: apps/web/src/features/wizard/step-review.tsx:135 เปลี่ยน className เป็น "text-xs text-muted-foreground whitespace-pre-line break-words"
- 🟡 เล็กน้อย **templates-07** (แม่แบบ Task) — อักขระ NUL ในข้อความ และ sortOrder ที่เกินขนาด INT ทำให้ API ตอบ 500 แทนที่จะเป็น 422
  - วิธีแก้: templates.schemas.ts:38 ให้ใช้ sortOrder: z.number().int().min(0).max(2_147_483_647).optional() ส่วน NUL ให้แก้ทั้งระบบ: ใน apps/api/src/common/zod.ts เพิ่ม helper zText ที่ .refine((s) => !s.includes('\u0000'), 'ข้อความมีอักขระที่ไม่รองรับ') (หรือ .transform ลบ \u0000 ออก) แล้วใช้กับ zName, zDescription, title และ responsible หรือจะเพิ่มใน exception.filter.ts ให้ map error ของ Postgres 22021/22P0
- 🟡 เล็กน้อย **UA-01** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — ฟอร์มผู้ใช้ไม่จำกัดความยาวตัวอักษร แต่ API จำกัดไว้ ผู้ใช้จึงเห็นแค่ toast แจ้ง error
  - วิธีแก้: apps/web/src/features/admin-users/user-form-dialog.tsx: ใส่ maxLength={254} ที่ #user-email, 200 ที่ #user-name, 100 ที่ #user-nickname, 200 ที่ #user-department และ #user-position, 128 ที่ #user-password และเพิ่ม 'nickname' | 'department' | 'position' ใน FieldKey/FIELD_ORDER พร้อมส่ง error={errors.x} ให้ Field ของ 3 ช่องนี้ แนะนำให้ย้ายค่าจำกัดไปเป็นค่าคงที่ใน packages/shared (เช่น USER_LIMITS) แ
- 🟡 เล็กน้อย **UA-03** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — กฎ 'รหัสผ่านห้ามมีชื่อผู้ใช้หรือชื่ออีเมลอยู่ข้างใน' ไม่ได้บอกไว้ที่ UI และไม่ตรวจความยาวสูงสุด 128 ฝั่ง client
  - วิธีแก้: password-form.tsx: (1) ใน validate() เพิ่ม `else if (v.next.length > 128) errors.next = 'รหัสผ่านยาวเกินไป (ไม่เกิน 128 ตัวอักษร)'` และใส่ maxLength={128} (2) ใน onError อ่าน `err instanceof ApiError && err.fields` แล้ว map currentPassword→current และ newPassword→next แทนการเช็กคำว่า 'ปัจจุบัน' (3) เพิ่มข้อความ hint ว่า 'ห้ามมีชื่อผู้ใช้หรือชื่อหน้า @ ของอีเมล' และอาจส่ง username/email เข้า compon
- 🟡 เล็กน้อย **UA-05** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — ประวัติ (activity log) ของผู้ใช้ไม่ได้บันทึกว่าเปลี่ยนอะไร: การเลื่อนสิทธิ์เป็น ADMIN หรือเปลี่ยนอีเมลขึ้นแค่ 'แก้ไขข้อมูลผู้ใช้'
  - วิธีแก้: apps/api/src/modules/users/users.service.ts ใน update(): หลังสร้าง `data` ให้เทียบกับ `user` เดิมแล้วสร้างรายการเฉพาะ field ที่เปลี่ยนจริง เช่น `บทบาท: ${ROLE_LABEL[user.role]} → ${ROLE_LABEL[patch.role]}`, `อีเมล: ${user.email ?? '—'} → ${patch.email ?? '—'}`, ชื่อ/แผนก/ตำแหน่ง/ชื่อผู้ใช้ และ 'ตั้งรหัสผ่านใหม่' แล้วต่อเข้าไปใน summary ถ้าไม่มีอะไรเปลี่ยนให้ข้าม tx.user.update และ activity.log
- 🟡 เล็กน้อย **UA-06** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — อีเมลที่มีอักขระมองไม่เห็น (zero-width space) ผ่านการตรวจและถูกบันทึก ทำให้ผู้ใช้ล็อกอินด้วยอีเมลที่พิมพ์ตามที่เห็นไม่ได้
  - วิธีแก้: apps/api/src/modules/users/users.schemas.ts: ใน email และ username ให้ใส่ `.transform(v => v.normalize('NFC').replace(/[​-‍⁠﻿]/g, ''))` ก่อน trim หรือจะปฏิเสธเลยด้วย regex แบบ ASCII เช่น /^[\x21-\x7E&&[^@]]+@…/ ก็ได้ ให้ลบอักขระชุดเดียวกันใน loginSchema ของ auth.controller.ts:18-24 ด้วย ส่วน name/nickname ให้ลบเฉพาะ U+200B/U+FEFF ที่ต้นหรือท้าย (ห้ามลบ U+200D เพราะใช้ใน emoji) และใน user-form-dial
- ℹ️ ข้อสังเกต **MD-05** (ห้าง / ประเภท Shelf / สินค้า) — SKU ตรวจความยาว 30 ก่อนแปลงเป็นตัวพิมพ์ใหญ่ จึงเก็บได้ยาวเกิน 30 และอักษรพิเศษบางตัวถูกแปลงแบบย้อนกลับไม่ได้
  - วิธีแก้: products.schemas.ts:9-14 ต่อท้าย zSku ด้วย .pipe(z.string().max(30, 'รหัสสินค้ายาวเกินไป (ไม่เกิน 30 ตัวอักษร)')) เพื่อตรวจหลัง uppercase หรือจำกัด charset ของ SKU ตาม MD-04
- ℹ️ ข้อสังเกต **MD-10** (ห้าง / ประเภท Shelf / สินค้า) — Activity log ไม่เก็บค่าเก่า/ค่าใหม่ของข้อมูลหลัก การเปิด/ปิดบันทึกเป็นแค่ 'แก้ไข' และการจัดลำดับไม่ถูกบันทึก
  - วิธีแก้: ถ้าลูกค้าต้องการประวัติ: เพิ่มคอลัมน์ changes JSONB ใน activity_logs แล้วส่ง diff ของ before/after จาก service ทั้งสาม และแยก action เป็น *.activate / *.deactivate / *.reorder
- ℹ️ ข้อสังเกต **MD-11** (ห้าง / ประเภท Shelf / สินค้า) — แก้ไขข้อมูลหลัก (ชื่อห้าง/สี/ชื่อสินค้า) แล้วมีผลย้อนหลังกับโปรเจกต์เดิมทุกอัน เพราะไม่มี snapshot
  - วิธีแก้: ไม่ต้องแก้ ถ้าลูกค้าต้องการให้โปรเจกต์เก่าคงค่าเดิม ให้เพิ่มคอลัมน์ snapshot (store_name, product_sku, product_name ฯลฯ) ใน proposals/proposal_products ตอนสร้าง
- ℹ️ ข้อสังเกต **MD-12** (ห้าง / ประเภท Shelf / สินค้า) — API ตัด key ที่ไม่รู้จักทิ้งเงียบ ๆ เช่น isActive/sortOrder ตอนสร้าง (UI ไม่ได้ส่ง key เหล่านี้)
  - วิธีแก้: ไม่ต้องแก้ตอนนี้ ถ้าจะให้เห็นปัญหาเร็วขึ้นเวลาเพิ่มช่องใหม่ ให้ใช้ z.strictObject ใน stores.schemas.ts, shelf-types.schemas.ts และ products.schemas.ts
- ℹ️ ข้อสังเกต **MD-13** (ห้าง / ประเภท Shelf / สินค้า) — ลบข้อมูลหลักเป็นการลบถาวร และ DB ไม่จำกัดความยาว (text) ให้ API zod เป็นตัวจำกัดอย่างเดียว
  - วิธีแก้: ไม่ต้องแก้ ถ้าต้องการกู้คืนได้ ให้เปลี่ยนเป็น soft delete (deleted_at) และถ้าต้องการกันข้อมูลยาวเกินที่ระดับ DB ให้เพิ่ม CHECK (char_length(...) <= n) ให้ตรงกับ zod
- ℹ️ ข้อสังเกต **MD-14** (ห้าง / ประเภท Shelf / สินค้า) — ค้นหาสินค้าฝั่ง server ไม่ค้นในช่อง 'ขนาด' แต่การค้นในหน้า Admin (ฝั่ง client) ค้น
  - วิธีแก้: apps/api/src/modules/products/products.service.ts:41 เพิ่ม { size: contains } ใน OR และ :46 เพิ่ม p.size ใน matchesQuery
- ℹ️ ข้อสังเกต **PW-10** (การเสนอสินค้า + Wizard) — 'ผู้รับผิดชอบ' จากแม่แบบไม่ได้ถูกมอบหมายงานจริง: เก็บเป็นข้อความใน description และทุกงานถูกมอบหมายให้ผู้สร้าง; priority ตั้งให้อัตโนมัติ
  - วิธีแก้: แจ้งลูกค้าว่าเป็นพฤติกรรมที่ตั้งใจไว้ และเปลี่ยนป้ายใน template-tree-preview.tsx:118-121 เป็น 'แนะนำ: {responsible}' (หรือใส่ tooltip ว่า 'จะบันทึกในรายละเอียดงาน — งานทั้งหมดมอบหมายให้คุณ')
- ℹ️ ข้อสังเกต **PW-11** (การเสนอสินค้า + Wizard) — ไม่มีการเก็บรายการงานที่ตัดออกจากแม่แบบ หรือป้าย 'เพิ่มเอง'; ชื่อที่ตั้งเองเมื่อเลือกหลายห้างจะถูกต่อท้ายด้วยชื่อห้าง
  - วิธีแก้: แจ้งลูกค้า ถ้าต้องการประวัติ ให้ create() บันทึก activity สรุป 'ตัดงานจากแม่แบบ N งาน: ...; เพิ่มเอง M งาน' (ต้องให้ toPlanInput ส่ง custom/excluded มาด้วยและเพิ่มใน planItemSchema)
- ℹ️ ข้อสังเกต **PW-12** (การเสนอสินค้า + Wizard) — ประวัติการแก้ไขไม่เก็บค่าเดิม/ค่าใหม่; การลบเป็นการลบถาวร; completed_at ถูกล้างเมื่อเปิดงานใหม่
  - วิธีแก้: ถ้าลูกค้าต้องการ audit trail ให้ update() สร้าง summary ที่มี diff ของฟิลด์ที่เปลี่ยน (เช่น 'ชื่อ: "เดิม" → "ใหม่"') หรือเพิ่มคอลัมน์ details JSONB ใน activity_logs และอาจเปลี่ยนการลบเป็น soft delete (deleted_at)
- ℹ️ ข้อสังเกต **RS-09** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — 'ผู้รับผิดชอบที่แนะนำ' ของงานไม่มีคอลัมน์ ถูกเขียนลงเป็นข้อความในรายละเอียดงาน
  - วิธีแก้: ถ้าลูกค้าต้องการค้นหา/กรองตามผู้รับผิดชอบที่แนะนำ: เพิ่มคอลัมน์ tasks.responsible (TEXT NULL) ใน apps/api/prisma/schema.prisma + migration, เขียนค่า p.responsible ลงคอลัมน์นั้นใน proposals.service.ts:182 แทน description, เพิ่มใน mapper/shared Task type และแสดงใน task drawer
- ℹ️ ข้อสังเกต **RS-10** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — สถานะยุบ/ขยาย sidebar ไม่ถูกจำ (cookie เขียนแต่ไม่อ่าน) และ prefs.sidebarCollapsed ไม่ถูกใช้
  - วิธีแก้: apps/web/src/components/layout/app-shell.tsx:207: อ่านค่า (เช่น usePrefs().sidebarCollapsed หรือ cookie sidebar_state) แล้วส่ง defaultOpen={!sidebarCollapsed} และ onOpenChange ที่บันทึกกลับ usePrefsStore.set({ sidebarCollapsed: !open }); หรือลบ sidebarCollapsed ออกจาก lib/prefs.ts ถ้าไม่ใช้
- ℹ️ ข้อสังเกต **RS-12** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — การตั้งค่าส่วนตัวและสถานะ UI เก็บใน localStorage ต่อเบราว์เซอร์ ไม่ตามผู้ใช้ข้ามเครื่อง
  - วิธีแก้: ถ้าลูกค้าต้องการ: เพิ่มตาราง user_preferences (user_id, key, value jsonb) + GET/PUT /me/preferences; ใน apps/web/src/features/wizard/new-proposal-wizard.tsx เพิ่ม beforeunload guard เมื่อมีการกรอกข้อมูล และ/หรือเก็บร่าง state ใน localStorage แบบ try/catch
- ℹ️ ข้อสังเกต **RS-13** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — Activity log เก็บแค่ประโยคสรุป ไม่มีค่าก่อน/หลัง และหลังลบโปรเจกต์จะเสียลิงก์โปรเจกต์
  - วิธีแก้: apps/api/prisma/schema.prisma ActivityLog: เพิ่ม changes Json? (before/after ของฟิลด์ที่เปลี่ยน) และ proposalCode String? ที่เก็บถาวร; ให้ proposals.service.ts update() ส่ง diff ลง changes; activity-feed.tsx ใช้ proposalCode แสดง 'โปรเจกต์ PRJ-xxxx ถูกลบแล้ว'; พิจารณา log auth.login/auth.logout/auth.locked
- ℹ️ ข้อสังเกต **RS-14** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — ข้อมูลที่ DB เก็บแต่ UI ไม่เคยแสดง / แนวคิด UI ที่ไม่มีตาราง
  - วิธีแก้: ตัดสินใจกับลูกค้าว่าต้องการแสดงสถานะล็อกบัญชี/เซสชันในหน้า admin users หรือไม่ (ถ้าต้องการ ส่ง lockedUntil ใน toUser สำหรับ admin); ใน apps/api/src/modules/tasks/tasks.service.ts remove() เพิ่ม tx.notification.deleteMany({ where: { link: { in: [...ids].map(t => `/proposals/${proposal.id}?task=${t}`) } } })
- ℹ️ ข้อสังเกต **RS-15** (หน้าแสดงผล + ภาพรวมทั้งระบบ) — Timezone: ฐานข้อมูลเก็บเวลาจริงถูกต้อง แต่บางจุดใน UI แสดง/จัดกลุ่มตามเวลาเครื่องผู้ใช้
  - วิธีแก้: apps/web/src/lib/format.ts: เพิ่ม dayjs plugin utc+timezone และใช้ dayjs(value).tz('Asia/Bangkok') ใน formatDateTime/fromNow; history-tab.tsx:58 ใช้ todayBangkok(new Date(item.createdAt)) แบบเดียวกับ activity-feed; home.tsx:42 ใช้ชั่วโมงเวลาไทย; ตรวจ DB จริง (โดยเจ้าของระบบ ไม่ใช่ใน audit นี้) ว่ามีแถวที่เขียนก่อนตั้ง timezone=UTC หรือไม่
- ℹ️ ข้อสังเกต **TC-6** (Task + ความคิดเห็น) — ข้อความที่พิมพ์ค้าง (ความคิดเห็น, ชื่องานใน InlineAdd) อยู่ใน React state เท่านั้น ปิดแล้วหายโดยไม่เตือน
  - วิธีแก้: task-drawer.tsx: ก่อนปิด Sheet หรือเปลี่ยนงาน ถ้า composer ใน task-comments.tsx มีข้อความ ให้ถามยืนยันก่อน หรือเก็บ draft แยกตาม taskId ใน sessionStorage แล้วโหลดกลับตอนเปิดงานเดิม; InlineAdd อาจเตือนเมื่อกด Esc/X ขณะมีข้อความ
- ℹ️ ข้อสังเกต **TC-10** (Task + ความคิดเห็น) — ความคิดเห็นแก้ไข/ลบไม่ได้ ไม่มีไฟล์แนบ ลิงก์เป็นข้อความธรรมดา; คัดลอกงานไม่คัดลอกความคิดเห็น; ลบงานลบความคิดเห็นถาวร
  - วิธีแก้: แจ้งลูกค้าว่าเป็นการออกแบบ; ถ้าต้องการ ให้เพิ่มแก้ไข/ลบความคิดเห็นแบบ soft delete, ทำ URL ในความคิดเห็นให้คลิกได้ (linkify) และพิจารณา soft delete งาน หรือเตือนจำนวนความคิดเห็นที่จะหายใน dialog ยืนยันการลบ
- ℹ️ ข้อสังเกต **TC-11** (Task + ความคิดเห็น) — สิทธิ์แก้ความสำคัญ (priority) ของผู้รับผิดชอบไม่ตรงกันระหว่าง UI กับ API
  - วิธีแก้: เลือกกติกาเดียว: ถ้าให้ผู้รับผิดชอบแก้ priority ได้ ให้ส่ง editable={canEditDetails} ใน task-drawer.tsx:150 และ task-row.tsx:156 แล้วแก้ข้อความใน task-drawer.tsx:183 และ tasks.service.ts:191; ถ้าไม่ให้แก้ ให้เพิ่ม patch.priority !== undefined ในเงื่อนไขของ tasks.service.ts:191 และแก้ ENDPOINTS.md:69
- ℹ️ ข้อสังเกต **TC-12** (Task + ความคิดเห็น) — สถานะขยาย/ย่อของ tree เก็บใน localStorage ของเบราว์เซอร์เท่านั้น ตัวกรองไม่จำ
  - วิธีแก้: แจ้งลูกค้าว่าเป็นการออกแบบ ถ้าต้องการให้ตามผู้ใช้ข้ามเครื่อง ให้เพิ่มตาราง user preferences ใน API
- ℹ️ ข้อสังเกต **templates-05** (แม่แบบ Task) — ช่องว่างหัวท้ายของชื่อแม่แบบ คำอธิบาย ชื่องาน และผู้รับผิดชอบถูกตัดทิ้ง (ทั้งฝั่ง UI และ API)
  - วิธีแก้: ไม่ต้องแก้ แค่แจ้งลูกค้าว่าช่องว่างหัวท้ายจะถูกตัด และช่องผู้รับผิดชอบที่มีแต่ช่องว่างจะถูกเก็บเป็นค่าว่าง (null)
- ℹ️ ข้อสังเกต **templates-08** (แม่แบบ Task) — รหัสงานในแม่แบบเปลี่ยนใหม่ทุกครั้งที่บันทึก งานแต่ละขั้นจึงไม่มีตัวตนที่คงที่
  - วิธีแก้: ถ้าต้องการติดตามว่า task มาจากขั้นตอนไหนของแม่แบบ ให้แก้ prepareItems ใน templates.service.ts ให้คง id เดิมเมื่อเป็น UUID ที่มีอยู่ในแม่แบบนั้นแล้ว (isUuid และอยู่ในชุดเดิม) และสุ่มใหม่เฉพาะ temp id 'ti-*' จากนั้นใน update() ให้ทำ upsert หรือ diff แทน deleteMany + createMany
- ℹ️ ข้อสังเกต **templates-09** (แม่แบบ Task) — ไม่จำกัดความยาวข้อความเลย (ทั้ง UI, API และ DB เป็น TEXT)
  - วิธีแก้: ถ้าลูกค้าต้องการ ให้กำหนด max ที่ตรงกันทั้ง UI และ API เช่น name .max(200), description .max(2000), item title .max(300), responsible .max(100) ใน templates.schemas.ts และใส่ maxLength เดียวกันที่ Input/Textarea ใน template-settings.tsx และ template-tree.tsx (เก็บค่าคงที่ไว้ใน @flowtrade/shared)
- ℹ️ ข้อสังเกต **templates-10** (แม่แบบ Task) — กฎของ UI กับ API ไม่ตรงกัน: API รับแม่แบบที่ไม่มีงานเลย และไม่ตรวจว่าช่วงวันของงานย่อยอยู่ในช่วงของงานแม่
  - วิธีแก้: templates.schemas.ts:42 เพิ่ม .min(1, 'แม่แบบต้องมีอย่างน้อย 1 งาน') ใน zItems (ถ้าลูกค้าต้องการให้ตรงกับ UI) และถ้าต้องการบังคับให้ช่วงวันของงานย่อยอยู่ในช่วงของงานแม่ ให้เพิ่มการตรวจทั้งใน prepareItems และ validateItems (หรือแค่ให้คำเตือนใน UI)
- ℹ️ ข้อสังเกต **templates-11** (แม่แบบ Task) — ไม่มีประวัติเวอร์ชันของแม่แบบ: บันทึกแต่ละครั้งแทนที่งานทั้งชุด และ activity log ไม่เก็บรายละเอียดว่าเปลี่ยนอะไร
  - วิธีแก้: ถ้าต้องการ audit ให้ใน templates.service.ts update() เก็บ snapshot ของแม่แบบเดิม (existing + items) เป็น JSON ไว้ใน activity_logs (ถ้ามีคอลัมน์ meta) หรือสร้างตาราง template_versions ใหม่ และใน templates.tsx createNew() ให้เปิด editor ด้วย draft ที่ยังไม่บันทึก แล้วค่อย POST เมื่อกดบันทึกครั้งแรก
- ℹ️ ข้อสังเกต **UA-07** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — การตั้งค่าแสดงปี พ.ศ. (และการยุบ sidebar) เก็บแค่ใน localStorage ของเบราว์เซอร์ ไม่อยู่ใน DB
  - วิธีแก้: แจ้งลูกค้าว่าการตั้งค่า พ.ศ. ผูกกับเบราว์เซอร์โดยตั้งใจ ถ้าต้องการให้ตามบัญชี ให้เพิ่มคอลัมน์ users.prefs jsonb และ PATCH /auth/me/prefs สำหรับ sidebar ให้ส่ง `defaultOpen={!usePrefsStore.get().sidebarCollapsed}` และ `onOpenChange={(o) => usePrefsStore.set({ sidebarCollapsed: !o })}` ให้ SidebarProvider ใน app-shell.tsx หรือลบ field ที่ไม่ได้ใช้ออก
- ℹ️ ข้อสังเกต **UA-08** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — ตารางสิทธิ์ของแต่ละบทบาทกำหนดตายตัวในโค้ด ไม่อยู่ใน DB และแก้จากหน้าเว็บไม่ได้
  - วิธีแก้: ไม่ต้องแก้ แจ้งลูกค้าว่าการเปลี่ยนสิทธิ์ของบทบาทต้องแก้โค้ดและ deploy ใหม่
- ℹ️ ข้อสังเกต **UA-09** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — ระบบปรับรูปแบบข้อความโดยตั้งใจ: ตัดช่องว่างหัวท้ายทุกช่อง และแปลง email/username เป็นตัวเล็ก ส่วนเนื้อหาข้างในตรงกับที่กรอกทุกไบต์
  - วิธีแก้: ไม่ต้องแก้ แจ้งลูกค้าให้ทราบ
- ℹ️ ข้อสังเกต **UA-10** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — สถานะบัญชีถูกล็อก (ใส่รหัสผิดหลายครั้ง) บันทึกใน DB แต่ admin มองไม่เห็นในหน้าเว็บ และการปิดแล้วเปิดบัญชีใหม่ไม่ปลดล็อก
  - วิธีแก้: เพิ่ม `lockedUntil: isoOrNull(u.lockedUntil)` ใน toUser (apps/api/src/common/mappers.ts) และใน shared User type แล้วใน users-list.tsx แสดงป้าย 'ถูกล็อกถึง …' เมื่อ lockedUntil > now พร้อมบอกว่าปลดล็อกได้ด้วยการรีเซ็ตรหัสผ่าน และถ้าต้องการให้ setActive(true) ล้าง failedLoginCount/lockedUntil ด้วย
- ℹ️ ข้อสังเกต **UA-11** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — API ไม่ทำอะไรเลย (โดยไม่แจ้ง) เมื่อส่ง mustChangePassword มาโดยไม่มี password
  - วิธีแก้: users.service.ts update(): ถ้า patch.mustChangePassword !== undefined แต่ไม่มี password ให้ throw invalid('ต้องตั้งรหัสผ่านใหม่พร้อมกัน', { mustChangePassword: … }) หรือรองรับให้ตั้ง data.mustChangePassword อย่างเดียวได้
- ℹ️ ข้อสังเกต **UA-12** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — 'เข้าสู่ระบบล่าสุด' ในหน้า Settings แสดงเวลาที่เพิ่งล็อกอินรอบนี้ ไม่ใช่รอบก่อน และใช้เขตเวลาของเครื่องที่เปิดดู
  - วิธีแก้: ถ้าลูกค้าต้องการเห็นการเข้าใช้ครั้งก่อน ให้เพิ่มคอลัมน์ previous_login_at (copy lastLoginAt ก่อนเขียนทับใน login) และแสดงค่านั้น แล้วบังคับ format เป็น Asia/Bangkok ด้วย dayjs timezone plugin
- ℹ️ ข้อสังเกต **UA-13** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — ตารางผู้ใช้ซ่อนคอลัมน์ตำแหน่ง/แผนก บนจอกว้าง 1024–1279px ข้อมูลบันทึกแล้วแต่ไม่แสดงในรายการ
  - วิธีแก้: users-list.tsx: ใน UserIdentity หรือคอลัมน์ 'ผู้ใช้' เพิ่มบรรทัดรอง `<span className="xl:hidden"><DeptPosition user={u} /></span>` เพื่อให้เห็นตำแหน่ง/แผนกเมื่อคอลัมน์ถูกซ่อน
- ℹ️ ข้อสังเกต **UA-14** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — กติการหัสผ่านไม่เหมือนกัน: รหัสที่ admin ตั้งให้ไม่ถูกตรวจกฎ 'ห้ามมีชื่อผู้ใช้/อีเมล'
  - วิธีแก้: สร้างฟังก์ชันกลาง เช่น validateNewPassword(pw, {email, username}) ใน apps/api/src/auth/password.ts แล้วเรียกใช้ทั้งใน users.service.ts create()/update() (ใช้ email/username ใหม่หรือเดิม) และใน auth.controller.ts changePassword
- ℹ️ ข้อสังเกต **UA-15** (ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า) — มีการแก้โค้ดระหว่าง audit (ทำให้อีเมลไม่บังคับ) ผลทดสอบจริงจึงมาจากโค้ดก่อนแก้ ส่วนโค้ดใหม่ตรวจได้แค่จากการอ่านโค้ด
  - วิธีแก้: restart API ทดสอบบน :3101 ด้วย build ล่าสุด (ต้องให้ผู้ใช้หรือผู้ดูแล harness เป็นคนทำ เพราะ auditor ห้าม restart) แล้วรันชุดทดสอบนี้ซ้ำ: สร้างผู้ใช้ที่มีแค่ username, ล้าง email ของผู้ใช้ที่มี username, ล้างทั้งสองช่อง (ต้องได้ 422 IDENTIFIER_REQUIRED), เปลี่ยนรหัสผ่านของผู้ใช้ที่ไม่มี email และ UA-02/UA-04 ในเบราว์เซอร์

## รายละเอียดทุกช่อง

### แม่แบบ Task

โดยรวม หน้าแก้ไขแม่แบบ Task บันทึกข้อมูลที่ผู้ใช้กรอกได้ครบทุกฟิลด์ ได้แก่ ชื่อ คำอธิบาย ช่องทาง ประเภท Shelf ห้าง สถานะเปิด/ปิด และต้นไม้งาน 3 ระดับ (ชื่องาน วันเริ่ม/สิ้นสุดแบบ D-offset ผู้รับผิดชอบ ลำดับ การเพิ่ม/ลบ/ย้าย) รวมถึงการทำสำเนาและการลบ ทดสอบจริงแล้วเก็บตรงทุกไบต์ ทั้งไทยที่มีวรรณยุกต์ อีโมจิ และอักขระพิเศษ timestamp เก็บเป็นเวลาจริงถูกต้อง zod ตัด key แปลกปลอมทิ้ง แต่ UI ไม่เคยส่ง key เกิน จึงไม่มีข้อมูลหาย ส่วนที่ต้องแก้มี 2 จุดระดับ major ที่ทำให้ข้อมูลหายหรือเปลี่ยนเองโดยไม่มีใครรู้: (1) ไม่มีการป้องกันการแก้ไขพร้อมกัน หน้า editor ถือ snapshot เดิมไว้และ PATCH แทนที่งานทั้งชุด ถ้า admin/manager สองคนแก้แม่แบบเดียวกัน การบันทึกของคนแรกจะถูกทับหายแบบเงียบๆ (พิสูจน์ด้วย API แล้ว) (2) เมื่อลบห้างที่แม่แบบผูกไว้ store_id จะกลายเป็น NULL เอง ทำให้แม่แบบที่ยังเปิดอยู่ถูกนำไปใช้กับทุกห้าง โดยไม่มีคำเตือนและไม่มี log ต่างจากการลบประเภท Shelf ที่มีคำเตือน ระดับ minor มี: ช่องวันไม่รับค่าทศนิยมแต่ไม่แจ้ง, UI ไม่ตรวจขอบเขต ±3650 วัน และ 500 งาน, การตัดช่องว่างหัวท้าย, คำอธิบายหลายบรรทัดแสดงเป็นบรรทัดเดียวใน wizard และ NUL/sortOrder ที่ล้นทำให้ API ตอบ 500 นอกจากนี้มีข้อสังเกตระดับ info: id ของงานในแม่แบบเปลี่ยนทุกครั้งที่บันทึก, ไม่จำกัดความยาวข้อความ, API รับแม่แบบที่ไม่มีงาน และไม่มีประวัติเวอร์ชัน การทดสอบทั้งหมดทำบน test API :3101 และ container flowtrade-audit-db เท่านั้น ไม่ได้แก้ไฟล์ source ใดๆ

| หน้า | ช่อง | คอลัมน์ใน DB | ผล | หมายเหตุ |
|---|---|---|---|---|
| Admin › แม่แบบ Task › ข้อมูลแม่แบบ | ชื่อแม่แบบ (tpl-name) | task_templates.name (TEXT) | ✅ บันทึกครบ | UI และ API (templates.schemas.ts:44) ตัดช่องว่างหัวท้าย ส่วนที่เหลือเก็บตรงทุกไบต์ ทั้งไทยที่มีวรรณยุกต์ อีโมจิ และ ' " < > & % (เทียบ hex แล้วตรงกัน) ไม่มีการจำกัดความยาว ลองชื่อยาว 15,013 ตัวอักษรก็เก็บได้ครบ |
| Admin › แม่แบบ Task › ข้อมูลแม่แบบ | คำอธิบาย (tpl-description) | task_templates.description (TEXT NULL) | ✅ บันทึกครบ | ตัดช่องว่างหัวท้าย ถ้าเหลือเป็นค่าว่างหรือมีแต่ช่องว่างจะเก็บเป็น NULL การขึ้นบรรทัดใหม่ (\n) ถูกเก็บไว้ ถ้า PATCH โดยไม่ส่ง key นี้ค่าเดิมจะไม่เปลี่ยน ถ้าส่ง null ค่าจะถูกล้าง ข้อความยาว 79,999 ตัวอักษรเก็บได้ครบ |
| Admin › แม่แบบ Task › ข้อมูลแม่แบบ | ช่องทาง (ToggleGroup OFFLINE/ONLINE) | task_templates.channel (enum Channel) | ✅ บันทึกครบ | เมื่อเปลี่ยนช่องทาง UI จะล้างประเภท Shelf และห้างที่ไม่ตรงช่องทางให้เอง ฝั่ง API ก็ปฏิเสธด้วย 422 ถ้า store/shelf ไม่ตรงช่องทาง |
| Admin › แม่แบบ Task › ข้อมูลแม่แบบ | ประเภท Shelf (tpl-shelf) | task_templates.shelf_type_id (UUID FK ON DELETE SET NULL) | ✅ บันทึกครบ | API ตรวจว่ามีอยู่จริงและอยู่ในช่องทางเดียวกัน เลือก 'ทุกประเภท' จะเก็บเป็น NULL เมื่อลบประเภท Shelf แม่แบบจะกลายเป็นใช้กับทุกประเภท แต่หน้า shelf-types มีคำเตือนเรื่องนี้แล้ว |
| Admin › แม่แบบ Task › ข้อมูลแม่แบบ | ห้าง / แพลตฟอร์ม (tpl-store) | task_templates.store_id (UUID FK ON DELETE SET NULL) | ⚠️ มีปัญหา | บันทึกได้ถูกต้อง แต่ถ้าลบห้างนั้นภายหลัง ค่านี้จะกลายเป็น NULL เองโดยไม่มีคำเตือน (ดู GAP templates-02) |
| Admin › แม่แบบ Task (ส่วนหัว editor และ Switch ในรายการ) | เปิด/ปิดใช้งาน | task_templates.is_active | ✅ บันทึกครบ | ส่ง PATCH {isActive} แยกต่างหากและไม่ไปกระทบร่างที่ยังไม่บันทึก ปุ่มบันทึกแม่แบบไม่ได้ส่ง isActive จึงไม่ทับสถานะที่เพิ่งเปลี่ยน updatedAt ถูกอัปเดต |
| Admin › แม่แบบ Task › ขั้นตอนงาน | ชื่องาน (tpl-<id>-title) | task_template_items.title (TEXT) | ✅ บันทึกครบ | ตัดช่องว่างหัวท้าย ค่าว่างจะถูกปฏิเสธ (422) ไทยที่มีวรรณยุกต์ อีโมจิ และ HTML เก็บตรงทั้งหมด ไม่จำกัดความยาว ลอง 40,000 ตัวอักษรก็เก็บได้ |
| Admin › แม่แบบ Task › ขั้นตอนงาน | เริ่ม (D-offset) | task_template_items.start_offset_days (INT) | ✅ บันทึกครบ | รับเฉพาะจำนวนเต็มในช่วง ±3650 ค่าขอบ -3650 และ 3650 เก็บได้ ถ้าพิมพ์ทศนิยม UI จะไม่รับค่าโดยไม่แจ้ง (GAP templates-03) ถ้าเกินช่วง จะรู้ก็ต่อเมื่อเซิร์ฟเวอร์ตอบกลับ (GAP templates-04) |
| Admin › แม่แบบ Task › ขั้นตอนงาน | ถึง (D-offset) | task_template_items.due_offset_days (INT, CHECK due>=start) | ✅ บันทึกครบ | ถ้าวันสิ้นสุดอยู่ก่อนวันเริ่ม ทั้ง UI และ API จะปฏิเสธ และ DB มี CHECK กันไว้อีกชั้น ลองแปลงเป็นวันจริงข้ามเดือน ข้ามปี และวันที่ 29 ก.พ. 2028 ผ่าน preview ได้ผลถูกต้อง |
| Admin › แม่แบบ Task › ขั้นตอนงาน | ผู้รับผิดชอบ (datalist ข้อความอิสระ) | task_template_items.responsible (TEXT NULL) | ✅ บันทึกครบ | ตัดช่องว่างหัวท้าย ค่าว่างหรือช่องว่างล้วนเก็บเป็น NULL อีโมจิที่มี ZWJ (🧑‍💼) เก็บได้ครบ ตัวเลือกที่แนะนำดึงมาจากค่าที่บันทึกไว้ในทุกแม่แบบ |
| Admin › แม่แบบ Task › ขั้นตอนงาน | โครงสร้างต้นไม้ (เพิ่มงานย่อย / เพิ่มงานถัดไป / เพิ่ม Task หลัก) | task_template_items.parent_id, level (SMALLINT, CHECK 1..3, root⇔level1) | ✅ บันทึกครบ | UI คำนวณ level ใหม่จากความลึก (normalizeItems) ส่วน API ตรวจเรื่องลูกที่ไม่มีแม่ (orphan), ระดับที่กระโดดข้าม และ id ซ้ำ ทดสอบต้นไม้ 3 ระดับแล้วเก็บและอ่านกลับได้ถูกต้อง |
| Admin › แม่แบบ Task › ขั้นตอนงาน | เลื่อนขึ้น/ลง (ลำดับในระดับเดียวกัน) | task_template_items.sort_order (INT) | ✅ บันทึกครบ | ย้าย root2 ขึ้นไปไว้เหนือ root1 แล้วบันทึก ผลคือ sort_order 1000/2000 และอ่านกลับมาได้ลำดับเดิมที่จัดไว้ ไม่มีการลากวาง (drag) หรือย้ายไปอยู่ใต้งานแม่ตัวอื่น |
| Admin › แม่แบบ Task › ขั้นตอนงาน | ลบงาน (พร้อมงานย่อย) และเพิ่มงานใหม่ | task_template_items (deleteMany + createMany) | ✅ บันทึกครบ | ลบ mini2 และเพิ่มงานใหม่ด้วย temp id 'ti-newmini' แล้วผลใน DB ถูกต้อง ปุ่มเลิกทำ (undo) ทำงานอยู่ใน state ของ UI เท่านั้นจนกว่าจะกดบันทึก |
| Admin › แม่แบบ Task › ขั้นตอนงาน | รหัสงานในแม่แบบ (item id) | task_template_items.id | — ไม่ต้องบันทึก (ตั้งใจ) | เซิร์ฟเวอร์สร้าง UUID ใหม่ให้ทุกงานทุกครั้งที่บันทึก จากการทดสอบไม่มี id เดิมเหลืออยู่เลย (0 จาก 5) ดู GAP templates-08 |
| Admin › แม่แบบ Task (เมนู ⋯) | ทำสำเนาแม่แบบ | task_templates + task_template_items แถวใหม่ | ✅ บันทึกครบ | คัดลอกได้ครบทุกฟิลด์ ทั้งคำอธิบาย ช่องทาง shelf store ชื่องาน offset ผู้รับผิดชอบ sortOrder และรูปต้นไม้ ตรงกัน 100% ส่วน isActive ถูกตั้งเป็น false ตามที่ออกแบบไว้ สำเนาจะใช้ฉบับที่บันทึกล่าสุด ไม่รวมสิ่งที่แก้แต่ยังไม่ |
| Admin › แม่แบบ Task (เมนู ⋯) | ลบแม่แบบ | task_templates (items CASCADE, proposals.template_id SET NULL) | ✅ บันทึกครบ | ลบแล้วไม่มีงานค้างใน task_template_items (0 แถว) และ GET ตอบ 404 |
| Admin › แม่แบบ Task | สร้างแม่แบบใหม่ | task_templates | ✅ บันทึกครบ | สร้างแถวใน DB ทันทีที่กดปุ่ม ถ้าผู้ใช้ทิ้งไปเฉยๆ จะเหลือแม่แบบชื่อ 'แม่แบบใหม่' ที่ปิดใช้งานค้างอยู่ใน DB |
| Admin › แม่แบบ Task | บันทึกล่าสุด (updatedAt) และ createdAt | task_templates.created_at/updated_at (timestamptz(3)) | ✅ บันทึกครบ | ส่ง request เวลา 06:37:33.671Z ได้ created_at at time zone 'UTC' = 06:37:33.691 จึงเก็บเป็นเวลาจริงถูกต้อง แม้ DB session จะเป็น Asia/Bangkok (+07) |
| Admin › แม่แบบ Task | ค้นหาและกรองช่องทางในรายการ | - | — ไม่ต้องบันทึก (ตั้งใจ) | เป็นตัวกรองของ UI เท่านั้น ไม่ได้คาดหวังให้บันทึก |
| Admin › แม่แบบ Task › ขั้นตอนงาน | ย่อ/ขยายงานย่อย (collapsed) | - | — ไม่ต้องบันทึก (ตั้งใจ) | เป็นสถานะการแสดงผลเท่านั้น |
| Admin › แม่แบบ Task | key ที่ API ไม่รู้จัก (เช่น note, durationDays, tags) | - | — | zod ตัดทิ้งโดยไม่แจ้ง แต่ UI ไม่เคยส่ง key เกินจากที่กำหนด (TemplateInput/TaskTemplateItem ตรงกับ schema ทุก key) จึงไม่มีข้อมูลหายจริง |

### ห้าง / ประเภท Shelf / สินค้า

สรุป: ทุกช่องที่ผู้ใช้กรอกหรือเปลี่ยนในหน้า ห้าง/แพลตฟอร์ม, ประเภท Shelf, สินค้า และ dialog เพิ่มสินค้าด่วนใน wizard ถูกบันทึกลง database ครบ ไม่มีช่องไหนที่ zod ตัดทิ้งหรือ service ไม่เขียนลง Prisma ช่องที่ตรวจมีดังนี้: ชื่อ, ชื่อย่อ, ช่องทาง, สี, คำอธิบาย, สวิตช์เปิด/ปิด, ลำดับจากการลาก, การลบ, sku, แบรนด์, หมวดหมู่, ขนาด และบาร์โค้ด ทุกช่องอ่านกลับมาแสดงในหน้าจอได้ ได้ทดสอบจริงกับ API ทดสอบ (:3101) และตรวจใน SQL แล้ว ข้อความไทยที่มีวรรณยุกต์ อีโมจิ และอักขระพิเศษ ' " < > & % เก็บได้ตรงทุกไบต์ ความยาวสูงสุดฝั่ง UI, API และ DB ตรงกันทุกช่อง (DB เป็น text ไม่จำกัดความยาว) created_at/updated_at เก็บเวลาจริงแบบ UTC ถูกต้อง เทียบกับเวลาที่ส่ง request แล้วต่างกันไม่ถึง 10ms ไม่พบปัญหาข้อมูลหายระดับ critical หรือ major ที่พบเป็นระดับ minor ได้แก่ (1) ชื่อย่อที่ระบบเติมให้อัตโนมัติอาจตัดอีโมจิครึ่งตัว ทำให้เก็บเป็น U+FFFD (2) ชื่อย่อภาษาไทยนับสระและวรรณยุกต์เป็นตัวอักษรด้วย เช่น "แม็คโคร" มี 7 ตัว จึงกรอกไม่ได้ (3) เปลี่ยนช่องทางแล้วลำดับยังเป็นของช่องทางเดิม (4) เกณฑ์ตรวจของ dialog เพิ่มสินค้าด่วนหลวมกว่าฟอร์ม Admin ทำให้แก้ไขสินค้าที่เพิ่มจาก wizard ไม่ได้ ถ้ายังไม่แก้ SKU, แบรนด์ หรือบาร์โค้ดก่อน (5) บาร์โค้ดซ้ำกันได้ เพราะตรวจแค่ฝั่ง UI (6) SKU ที่แปลงเป็นตัวพิมพ์ใหญ่แล้วอาจยาวเกิน 30 ตัว (7) ลบห้างแล้วแม่แบบ Task ที่ผูกไว้เปลี่ยนเป็น "ทุกห้าง" โดยไม่เตือน (8) ขึ้นบรรทัดใหม่ในคำอธิบายบันทึกได้ แต่หน้ารายการแสดงเป็นบรรทัดเดียว ส่วนเรื่องระดับ info ที่ควรแจ้งลูกค้า: ไม่มีประวัติค่าเก่า/ค่าใหม่ของข้อมูลหลัก, การแก้ไขข้อมูลหลักมีผลย้อนหลังกับโปรเจกต์เดิมทุกอัน, การลบเป็นการลบถาวร และคำค้น/ตัวกรองในหน้าสินค้าเก็บแค่ใน state ของหน้าจอ ไม่ได้บันทึก

| หน้า | ช่อง | คอลัมน์ใน DB | ผล | หมายเหตุ |
|---|---|---|---|---|
| Admin › ห้าง/แพลตฟอร์ม (store-form-dialog) | ชื่อ (name) | stores.name | ✅ บันทึกครบ | ตัดช่องว่างหน้า/หลัง; สูงสุด 60 ทั้ง UI/API; ไทย+อีโมจิ+'"<>&% ตรงทุกไบต์; ชื่อซ้ำแบบไม่สนตัวพิมพ์ใหญ่/เล็ก → 422 |
| Admin › ห้าง/แพลตฟอร์ม | ชื่อย่อบนโลโก้ (shortName) | stores.short_name | ✅ บันทึกครบ | สูงสุด 6 code units ทั้ง UI/API; ชื่อที่เติมอัตโนมัติอาจตัดอีโมจิครึ่งตัว → U+FFFD (ดู MD-01); สระ/วรรณยุกต์ไทยนับเป็นตัวอักษร (ดู MD-02) |
| Admin › ห้าง/แพลตฟอร์ม | ช่องทาง (channel radio) | stores.channel | ✅ บันทึกครบ | ส่งไปเฉพาะเมื่อมีการเปลี่ยน; ถ้ามีโปรเจกต์ใช้อยู่ → 422; sortOrder ไม่ถูกจัดใหม่ (MD-03) |
| Admin › ห้าง/แพลตฟอร์ม | สีประจำ (preset/hex/picker) | stores.color | ✅ บันทึกครบ | UI แปลงเป็นตัวพิมพ์เล็ก; API ยอมรับ #RRGGBB ทั้งสองแบบแล้วเก็บตามที่ส่งมา |
| Admin › ห้าง/แพลตฟอร์ม | คำอธิบาย | stores.description | ✅ บันทึกครบ | สูงสุด 200; ''/ช่องว่างล้วน → null; บันทึกการขึ้นบรรทัดใหม่ได้แต่หน้ารายการแสดงเป็นบรรทัดเดียว (MD-08) |
| Admin › ห้าง/แพลตฟอร์ม | สวิตช์ใช้งาน | stores.is_active | ✅ บันทึกครบ | PATCH {isActive}; รายการ active ซ่อนห้างที่ปิด ส่วน includeInactive แสดง |
| Admin › ห้าง/แพลตฟอร์ม | ลากจัดลำดับ | stores.sort_order | ✅ บันทึกครบ | sort_order = index+1 ตามลำดับที่ส่ง; อ่านกลับได้ตรงลำดับ |
| Admin › ห้าง/แพลตฟอร์ม | ลบ | stores (row) | ✅ บันทึกครบ | ลบถาวร; ถ้ามีโปรเจกต์ใช้อยู่ → 409 IN_USE; task_templates.store_id ถูกตั้งเป็น NULL โดยไม่มีคำเตือน (MD-07) |
| Admin › ห้าง/แพลตฟอร์ม | แท็บช่องทาง (?channel=online) |  | — ไม่ต้องบันทึก (ตั้งใจ) | เก็บใน URL เท่านั้น |
| Admin › ประเภท Shelf (shelf-type-form-dialog) | ชื่อประเภท | shelf_types.name | ✅ บันทึกครบ | ตัดช่องว่าง; สูงสุด 50 ทั้ง UI/API; ไทย/อีโมจิ/อักขระพิเศษตรงทุกไบต์ |
| Admin › ประเภท Shelf | ช่องทาง | shelf_types.channel | ✅ บันทึกครบ | ถ้ามีโปรเจกต์ใช้อยู่ → 422; sortOrder เดิมยังติดไป (MD-03) |
| Admin › ประเภท Shelf | สีประจำประเภท | shelf_types.color | ✅ บันทึกครบ |  |
| Admin › ประเภท Shelf | คำอธิบาย | shelf_types.description | ✅ บันทึกครบ | สูงสุด 160; '' → null; HTML เช่น <b>&amp;</b> เก็บเป็นข้อความดิบ |
| Admin › ประเภท Shelf | สวิตช์ใช้งาน | shelf_types.is_active | ✅ บันทึกครบ |  |
| Admin › ประเภท Shelf | ลากจัดลำดับ | shelf_types.sort_order | ✅ บันทึกครบ |  |
| Admin › ประเภท Shelf | ลบ | shelf_types (row) | ✅ บันทึกครบ | ถ้ามีโปรเจกต์ใช้อยู่ → 409; แม่แบบที่ผูกไว้กลายเป็น NULL (มีคำเตือนใน UI) |
| Admin › สินค้า (product-form-dialog) | SKU | products.sku | ✅ บันทึกครบ | UI: ตัวพิมพ์ใหญ่ + เปลี่ยนช่องว่างเป็น '-' + regex A-Z0-9._-; API: ตัดช่องว่าง+toUpperCase; มี CHECK sku=upper(sku); SKU ซ้ำ → 422 (MD-05) |
| Admin › สินค้า | ชื่อสินค้า | products.name | ✅ บันทึกครบ | สูงสุด 120 ทั้ง UI/API |
| Admin › สินค้า | แบรนด์ (datalist) | products.brand | ✅ บันทึกครบ | UI บังคับกรอก; API ยอมรับ '' |
| Admin › สินค้า | หมวดหมู่ (datalist) | products.category | ✅ บันทึกครบ |  |
| Admin › สินค้า | ขนาด/ปริมาณ | products.size | ✅ บันทึกครบ | '' → null; สูงสุด 30 |
| Admin › สินค้า | บาร์โค้ด | products.barcode | ✅ บันทึกครบ | UI: ตัวเลข 8–14 หลัก; API: ข้อความใดก็ได้ ≤30; ไม่บังคับไม่ซ้ำ (MD-06) |
| Admin › สินค้า | สวิตช์ใช้งาน | products.is_active | ✅ บันทึกครบ |  |
| Admin › สินค้า | ลบ | products (row) | ✅ บันทึกครบ | ลบถาวร; ถ้าอยู่ในการเสนอ → 409 |
| Admin › สินค้า | ค้นหา/กรองแบรนด์/หมวด/สถานะ |  | — ไม่ต้องบันทึก (ตั้งใจ) | เก็บใน React state เท่านั้น (products.tsx:74-77) |
| Wizard › เพิ่มสินค้าด่วน (quick-add-product-dialog) | SKU | products.sku | ✅ บันทึกครบ | รับข้อความอิสระ (ไทย/ช่องว่าง) → เก็บเป็นตัวพิมพ์ใหญ่ เช่น 'MD QA ทดสอบ 01' (MD-04) |
| Wizard › เพิ่มสินค้าด่วน | ชื่อสินค้า | products.name | ✅ บันทึกครบ | ไม่มี maxLength ใน UI → ถ้าเกินจะแสดงแค่ toast (MD-09) |
| Wizard › เพิ่มสินค้าด่วน | แบรนด์ | products.brand | ✅ บันทึกครบ | ว่างได้ → '' |
| Wizard › เพิ่มสินค้าด่วน | หมวดหมู่ | products.category | ✅ บันทึกครบ | ว่างได้ → '' |
| Wizard › เพิ่มสินค้าด่วน | ขนาด/บรรจุ | products.size | ✅ บันทึกครบ | '6 ขวด' เก็บได้ตรง; '' → null |
| Wizard › เพิ่มสินค้าด่วน | บาร์โค้ด | products.barcode | ✅ บันทึกครบ | ไม่ตรวจรูปแบบ: '885-12 ab' ถูกบันทึก |

### ผู้ใช้ / เข้าสู่ระบบ / ตั้งค่า

ส่วนผู้ใช้และการเข้าสู่ระบบ (users-auth): ทุกค่าที่กรอกในหน้าเว็บและควรอยู่ในฐานข้อมูลถูกบันทึกครบและถูกต้อง ได้แก่ อีเมล ชื่อผู้ใช้ ชื่อ-นามสกุล ชื่อเล่น แผนก ตำแหน่ง บทบาท รหัสผ่าน (เก็บเป็น hash argon2id) ช่องให้เปลี่ยนรหัสครั้งถัดไป สถานะเปิด/ปิดบัญชี การรีเซ็ตรหัสผ่าน และการเปลี่ยนรหัสผ่านเอง ทดสอบจริงด้วยภาษาไทยที่มีวรรณยุกต์ emoji อักขระพิเศษ และความยาวสูงสุด ข้อมูลออกมาตรงทุกไบต์ ยกเว้นที่ระบบตั้งใจปรับ คือตัดช่องว่างหัวท้ายและแปลงอีเมล/ชื่อผู้ใช้เป็นตัวเล็ก เวลาในฐานข้อมูลเป็นเวลาจริง (UTC) ถูกต้อง ไม่พบกรณีข้อมูลหายหรือเสียหาย (ไม่มี critical/major)

ข้อที่ควรปรับ (minor):
- ช่องในฟอร์มไม่จำกัดจำนวนตัวอักษร แต่ API จำกัดไว้ ผู้ใช้เห็นแค่ toast
- error รายช่องจาก server (อีเมลหรือชื่อผู้ใช้ซ้ำ) ไม่ขึ้นที่ช่อง
- กฎ 'รหัสผ่านห้ามมีชื่อผู้ใช้/อีเมล' ไม่ได้บอกไว้บนหน้าจอ และปฏิเสธรหัสทั่วไปเมื่อชื่อสั้น
- Admin แก้ข้อมูลตัวเองแล้ว หน้า Settings ยังแสดงค่าเก่าจนกว่าจะ reload
- ประวัติการแก้ไขไม่บอกว่าเปลี่ยนอะไร แม้แต่การเลื่อนสิทธิ์เป็น ADMIN
- อีเมลที่มีอักขระมองไม่เห็นถูกบันทึกได้ แล้วผู้ใช้ล็อกอินไม่ได้

ข้อที่ควรแจ้งลูกค้า (info):
- การตั้งค่าแสดงปี พ.ศ. เก็บแค่ในเบราว์เซอร์ ไม่ได้อยู่ในฐานข้อมูล
- ตารางสิทธิ์กำหนดตายตัวในโค้ด
- สถานะบัญชีถูกล็อกบันทึกใน DB แต่ admin มองไม่เห็นบนหน้าเว็บ

ระหว่าง audit มีการแก้โค้ดให้อีเมลไม่บังคับ (migration และไฟล์ API/เว็บถูกแก้ตอน 13:40–13:43) แต่ API ทดสอบที่ :3101 ยังรันโค้ดก่อนแก้ ผลทดสอบจริงจึงเป็นของโค้ดเดิม ส่วนโค้ดใหม่ตรวจจากการอ่านเท่านั้น ควรรันชุดทดสอบนี้ซ้ำหลัง restart API ทดสอบ

| หน้า | ช่อง | คอลัมน์ใน DB | ผล | หมายเหตุ |
|---|---|---|---|---|
| Login | ชื่อผู้ใช้หรืออีเมล | (ใช้ค้นหา users.email / users.username) | — ไม่ต้องบันทึก (ตั้งใจ) | zod ตัดช่องว่างหัวท้ายและแปลงเป็นตัวเล็ก (auth.controller.ts:16) ทดสอบจริงแล้ว: ' USERS-AUTH_1 ' และ ' IT@USERS-AUTH.TEST ' หาผู้ใช้เจอ |
| Login | รหัสผ่าน | ตรวจกับ users.password_hash | — ไม่ต้องบันทึก (ตั้งใจ) | ไม่ตัดช่องว่าง: รหัส '  pass with spaces 123  ' เข้าได้ แต่แบบตัดช่องว่างแล้วได้ 401 |
| Login | เวลาเข้าสู่ระบบล่าสุด และตัวนับการใส่รหัสผิด (ระบบบันทึกเอง) | users.last_login_at, failed_login_count, locked_until; sessions.* | ✅ บันทึกครบ | last_login_at at time zone 'UTC' = 06:38:07.47 ตรงกับเวลาที่ยิงคำขอ ใส่ผิดครบ 5 ครั้งได้ locked_until = now+15 นาที (06:55:28 UTC) และ sessions เก็บ ip กับ user_agent (ตัดที่ 300 ตัวอักษร) |
| Change password (บังคับ) / Settings | รหัสผ่านปัจจุบัน / รหัสชั่วคราว |  | — ไม่ต้องบันทึก (ตั้งใจ) | ใช้ตรวจสอบอย่างเดียว ถ้าผิดได้ 422 และฟอร์มแสดง error ที่ช่องนั้น |
| Change password (บังคับ) / Settings | รหัสผ่านใหม่ | users.password_hash (argon2id), must_change_password=false | ✅ บันทึกครบ | ลองรหัสไทย+emoji+ช่องว่างท้าย 'ทดสอบรหัสผ่าน๑๒๓ 😀 ' บันทึกแล้วล็อกอินได้ เซสชันเก่าถูก revoke และสร้างเซสชันใหม่ ส่วนรหัสยาว 129 ตัวได้ 422 |
| Change password (บังคับ) / Settings | ยืนยันรหัสผ่านใหม่ |  | — ไม่ต้องบันทึก (ตั้งใจ) | ตรวจเฉพาะฝั่ง client |
| Settings | สวิตช์แสดงปี พ.ศ. | (ไม่มี) เก็บที่ localStorage 'flowtrade.prefs' | — ไม่ต้องบันทึก (ตั้งใจ) | prefs.ts:9-29 หน้าจอเขียนบอกว่า 'มีผลเฉพาะเบราว์เซอร์ที่คุณใช้อยู่' |
| Settings | การ์ดข้อมูลส่วนตัว (อ่านอย่างเดียว) |  | — | ผู้ใช้แก้ข้อมูลตัวเองไม่ได้ ตามที่ออกแบบไว้ โค้ดล่าสุดแสดง username, email, nickname, department, position และ lastLoginAt |
| Admin › Users dialog | อีเมล | users.email (text, unique, CHECK = lower) | ✅ บันทึกครบ | '  Users-Auth.Test1@Example.COM  ' ถูกเก็บเป็น 'users-auth.test1@example.com' ยาว 254 ตัวบันทึกได้ 255 ได้ 422 อีเมลซ้ำแบบไม่สนตัวพิมพ์ได้ 422 ระหว่าง audit อีเมลถูกเปลี่ยนเป็นช่องไม่บังคับ |
| Admin › Users dialog | ชื่อผู้ใช้ | users.username (unique, CHECK = lower) | ✅ บันทึกครบ | '  Users-Auth_1  ' ถูกเก็บเป็น 'users-auth_1' ค่า '' ล้างเป็น NULL ส่วน 'ab' และภาษาไทยได้ 422 ชื่อซ้ำได้ 422 |
| Admin › Users dialog | ชื่อ-นามสกุล | users.name | ✅ บันทึกครบ | ภาษาไทยมีวรรณยุกต์ + emoji + ' " < > & % ตรงทุกไบต์ (ตัดแค่ช่องว่างหัวท้าย) ยาว 200 ตัวบันทึกได้ 201 ได้ 422 ช่องว่างล้วนได้ 422 |
| Admin › Users dialog | ชื่อเล่น | users.nickname | ✅ บันทึกครบ | '  ต๋อง 🎉  ' ถูกเก็บเป็น 'ต๋อง 🎉' ยาว 100 ได้ 101 ได้ 422 ค่าช่องว่างล้วนเป็น NULL |
| Admin › Users dialog | แผนก | users.department | ✅ บันทึกครบ | 'ฝ่าย R&D <test>' บันทึกได้ ยาว 200 ได้ 201 ได้ 422 ค่า null เป็น NULL |
| Admin › Users dialog | ตำแหน่ง | users.position | ✅ บันทึกครบ | 'Key Account's "Exec" %' บันทึกได้ ยาว 200 ได้ 201 ได้ 422 ค่า '' เป็น NULL |
| Admin › Users dialog | บทบาท (radio) | users.role | ✅ บันทึกครบ | ค่าที่ไม่ถูกต้องได้ 422 แก้ role ของตัวเองไม่ได้ทั้งฝั่ง UI และ API |
| Admin › Users dialog | รหัสผ่าน (รวมปุ่มสุ่มรหัส) | users.password_hash | ✅ บันทึกครบ | ไม่ตัดช่องว่าง ถ้าเว้นว่างตอนสร้าง ระบบออกรหัสชั่วคราวให้ (แสดงครั้งเดียว เก็บเฉพาะ hash) ตอนแก้ไข เซสชันทั้งหมดของผู้ใช้ถูก revoke (ตรวจแล้ว: /auth/me ได้ค่าว่าง) |
| Admin › Users dialog | เช็กบ็อกซ์ให้เปลี่ยนรหัสผ่านครั้งถัดไป | users.must_change_password | ✅ บันทึกครบ | ส่งไปพร้อม password เท่านั้น ถ้าส่งค่านี้อย่างเดียว API จะเงียบไม่ทำอะไร (ดู UA-11) |
| Admin › Users list | เลือกบทบาทในแถว | users.role | ✅ บันทึกครบ | MANAGER→ADMIN→MANAGER ตรวจแล้ว แต่ activity log ไม่บอกว่าเปลี่ยนบทบาท (UA-05) |
| Admin › Users list | สวิตช์เปิด/ปิดใช้งาน | users.is_active | ✅ บันทึกครบ | เมื่อปิด เซสชันถูก revoke และล็อกอินได้ 403 INACTIVE ค่า 'false' แบบ string ได้ 422 |
| Admin › Users list | รีเซ็ตรหัสผ่าน | users.password_hash, must_change_password=true, failed_login_count=0, locked_until=NULL | ✅ บันทึกครบ | ตรวจแล้วว่าปลดล็อกบัญชีด้วย รหัสชั่วคราวแสดงครั้งเดียว |
| Admin › Users list | ช่องค้นหา / ชิปกรองบทบาท |  | — ไม่ต้องบันทึก (ตั้งใจ) | เป็นแค่ state ของ UI |
| Admin › Users | ตารางสิทธิ์ (role matrix) |  | — | อ่านอย่างเดียว ค่ากำหนดตายตัวใน packages/shared/src/permissions.ts:24 ไม่อยู่ใน DB |
| Home / My tasks (my-work) | เช็กบ็อกซ์ทำงานเสร็จ | tasks.is_done, completed_at, completed_by_id | ✅ บันทึกครบ | ตรวจจากโค้ดอย่างเดียว (tasks.service.ts:228-259) การทดสอบจริงเป็นงานของ auditor ฝั่ง tasks |
| My tasks | ตัวกรองสถานะ/กำหนดส่ง/จัดกลุ่ม/ค้นหา |  | — ไม่ต้องบันทึก (ตั้งใจ) | เก็บใน URL search params |
| App shell | ยุบ/ขยาย sidebar |  | — ไม่ต้องบันทึก (ตั้งใจ) | เก็บที่ localStorage prefs.sidebarCollapsed |

### Task + ความคิดเห็น

สรุปส่วน tasks-comments (tree งาน, drawer, ความคิดเห็น): ทุกค่าที่ผู้ใช้กรอกได้ถูกบันทึกลง DB และอ่านกลับได้ถูกต้อง ได้แก่ ชื่องาน 3 ระดับ, รายละเอียด, วันเริ่ม/วันครบกำหนด, ผู้รับผิดชอบหลายคน, ความสำคัญ, ติ๊กแบบ cascade, ลากจัดลำดับ, ย้ายไปใต้งานอื่น, คัดลอก, ลบ และความคิดเห็น ข้อความไทย วรรณยุกต์ emoji และอักขระพิเศษเก็บตรง byte-for-byte (ยกเว้นช่องว่างหน้า/หลังที่ถูก trim) วันที่ไม่เลื่อนจาก timezone และ created_at/completed_at เป็นเวลาจริง ไม่พบฟิลด์ใดที่ UI ให้กรอกแล้วไม่ถูกส่งหรือถูก zod ตัดทิ้ง ส่วนไฟล์แนบไม่มีใน UI จึงไม่ใช่ช่องโหว่ จุดที่ต้องแก้มีดังนี้ (1) critical: PATCH /tasks/:id เขียนชื่อและวันที่จากค่าเก่าทับทุกครั้งโดยไม่ล็อก ถ้ามีคนแก้งานเดียวกันพร้อมกัน ข้อมูลของอีกคนหายเงียบ ๆ ทดสอบแล้วหาย 21 จาก 40 รอบ ทั้งที่ API ตอบ 200 (2) major: ผู้รับผิดชอบที่ถูกปิดการใช้งานยังอยู่ใน DB แต่หน้าเว็บไม่แสดง และทำให้แก้รายชื่อผู้รับผิดชอบไม่ได้ (ได้ 422) (3) minor: ความยาวสูงสุดใน UI (200/4000/2000) ไม่ตรงกับ API (500/10000/5000) และข้อความที่วางเกินถูกตัดเงียบ, ย่อหน้าบรรทัดแรกหายเพราะ trim, บันทึกอัตโนมัติล้มเหลวแล้วข้อความที่พิมพ์ถูกย้อนกลับ, draft ความคิดเห็นหายเมื่อปิด drawer, แจ้งเตือนตัด emoji เป็นอักขระเสีย, ชื่อสำเนาเกิน 500 ตัวอักษร, ปี 0000 ทำให้ได้ 500 (4) info: ความคิดเห็นแก้ไข/ลบ/แนบไฟล์ไม่ได้ ลบงานแล้วความคิดเห็นหายถาวร สิทธิ์แก้ priority ของผู้รับผิดชอบใน UI กับ API ไม่ตรงกัน และสถานะขยาย/ย่อเก็บแค่ใน localStorage ทุกการทดสอบใช้เฉพาะ API ทดสอบที่ :3101 กับ DB ใน container flowtrade-audit-db และไม่ได้แก้ไฟล์ source ใด ๆ

| หน้า | ช่อง | คอลัมน์ใน DB | ผล | หมายเหตุ |
|---|---|---|---|---|
| Task tree – InlineAdd (เพิ่มงานหลัก) | ชื่องาน (title) ระดับ 1 | tasks.title (text), tasks.level=1 | ✅ บันทึกครบ | ไทย+วรรณยุกต์+emoji+ZWJ+' " < > & % เก็บตรง byte-for-byte หลัง trim; ช่องว่างหน้า/หลังถูกตัด; UI maxLength 200 แต่ API รับ 500 |
| Task tree – InlineAdd ใต้ Task / Sub task | สร้าง Sub task (L2) และ Mini task (L3) | tasks.parent_id, tasks.level | ✅ บันทึกครบ | L2/L3 สร้างได้ level ถูกต้อง; L4 ถูกปฏิเสธ 422 'เพิ่มได้สูงสุด 3 ระดับ' |
| Task tree – RenameInput (ดับเบิลคลิก/F2) | เปลี่ยนชื่อ inline | tasks.title | ✅ บันทึกครบ | trim; maxLength 200 (API 500) |
| Task drawer – หัวเรื่อง (AutosaveText singleLine) | ชื่องาน | tasks.title | ✅ บันทึกครบ | บันทึกตอน blur/ปิด drawer; ขึ้นบรรทัดใหม่ถูกแทนด้วยช่องว่าง; ถ้าบันทึกล้มเหลวข้อความที่พิมพ์ถูกย้อนกลับ (ดู gap) |
| Task drawer – รายละเอียด (AutosaveText) | description | tasks.description (text) | ✅ บันทึกครบ | เก็บได้ถึง 10,000 ตัวอักษร (10,001 → 422) แต่ UI จำกัด 4,000; trim ทำให้ย่อหน้า/ช่องว่างต้นบรรทัดแรกหาย; ข้อความว่างหรือเว้นวรรคล้วน → NULL |
| Task drawer / row DateRangePopover | วันเริ่ม (startDate) | tasks.start_date (date) | ✅ บันทึกครบ | 2025-12-31, 2026-12-31, 2028-02-29 เก็บและอ่านกลับตรง ไม่มีวันเลื่อนจาก timezone; 2026-02-29 → 422; ปุ่ม X / 'ล้างวันที่ทั้งหมด' → NULL |
| Task drawer / row DateRangePopover | วันครบกำหนด (dueDate) | tasks.due_date (date) | ✅ บันทึกครบ | ข้ามปี 2026-12-31→2027-01-01 ถูกต้อง; due<start → 422 (+ CHECK tasks_dates_check); '0000-01-01' → 500 (ดู gap) |
| Task drawer / row UserPicker | ผู้รับผิดชอบหลายคน (assigneeIds) | task_assignees(task_id,user_id,assigned_at) | ⚠️ มีปัญหา | บันทึก/ลบ/ล้างได้ถูกต้อง ตัด id ซ้ำ ลำดับตามการเลือก; แต่ผู้รับผิดชอบที่ถูกปิดการใช้งานยังอยู่ใน DB แต่ UI ไม่แสดง และทำให้แก้ผู้รับผิดชอบไม่ได้ (422) |
| Task drawer Select / row dropdown | ความสำคัญ (priority) | tasks.priority (enum TaskPriority) | ✅ บันทึกครบ | ค่าเริ่มต้น MEDIUM; API อนุญาตให้ผู้รับผิดชอบแก้ได้ แต่ UI ล็อกไว้ (info) |
| Task row / drawer checkbox | ติ๊ก/ยกเลิกติ๊ก + cascade | tasks.is_done, tasks.completed_at (timestamptz), tasks.completed_by_id | ✅ บันทึกครบ | cascade ลง/ขึ้นตามกติกาถูกต้อง; completed_at เป็นเวลาจริง (UTC 06:39:33.531 ตรงกับเวลาที่ส่ง); ยกเลิกติ๊กจะล้าง completed_at/by ของลูกทั้งหมด |
| Task tree drag handle / เมนูเลื่อนขึ้น-ลง | ลำดับงาน (drag reorder) | tasks.sort_order | ✅ บันทึกครบ | renumber 1000,2000,…; ทดสอบ 60 งานย่อย ย้ายตัวท้ายไปหน้าสุดถูกต้อง; index ติดลบ/เกิน → clamp; index ทศนิยม → 422 |
| MoveDialog 'ย้ายไปไว้ใต้…' | เปลี่ยนงานแม่ | tasks.parent_id, tasks.level (+ลูกหลาน), tasks.sort_order | ✅ บันทึกครบ | ระดับลูกหลานปรับตาม; ย้ายเกิน 3 ระดับ/ใต้ตัวเอง/ใต้ลูกตัวเอง → 422 |
| เมนู/drawer 'คัดลอก' | duplicate งานพร้อมงานย่อย | tasks.* , task_assignees | ✅ บันทึกครบ | คัดลอก title(+ ' (สำเนา)'), description, วันที่, priority, ผู้รับผิดชอบ(ลำดับเดิม); is_done=false; ไม่คัดลอกความคิดเห็น; ชื่อยาว 500 → สำเนา 508 ตัวอักษร (ดู gap) |
| เมนู/drawer 'ลบ' | ลบงาน | tasks, task_assignees, comments (FK cascade) | — ไม่ต้องบันทึก (ตั้งใจ) | ลบถาวรทั้ง subtree และความคิดเห็น (UI เตือนก่อนลบ) เหลือแค่ activity_logs.summary |
| Task drawer – ความคิดเห็น | ข้อความความคิดเห็น | comments.body (text), comments.created_at (timestamptz), comments.author_id, comments.proposal_id | ✅ บันทึกครบ | ไทย/emoji(👍🏽)/HTML/URL เก็บตรงหลัง trim; ย่อหน้าบรรทัดถัดไปคงอยู่; 5,000 ok/5,001 → 422 แต่ UI จำกัด 2,000; created_at เป็นเวลาจริง (06:40:42.617Z) |
| Task drawer – ความคิดเห็น | ไฟล์แนบ / mention / แก้ไข / ลบความคิดเห็น | - | — | UI ไม่มีส่วนแนบไฟล์ จึงไม่ใช่ช่องโหว่การเก็บข้อมูล |
| Task drawer – ความคิดเห็น | ข้อความที่พิมพ์ค้างใน composer | - | — ไม่ต้องบันทึก (ตั้งใจ) | อยู่ใน React state เท่านั้น ปิด drawer/เปลี่ยนงานแล้วหายโดยไม่เตือน |
| Task tree toolbar | ขยาย/ย่อ, ตัวกรอง | localStorage flowtrade.taskTree.collapsed.<proposalId> | — ไม่ต้องบันทึก (ตั้งใจ) | จำเฉพาะเบราว์เซอร์นั้น ตัวกรองไม่จำ |
| Task drawer footer | สร้างโดย / แก้ไขล่าสุด / เสร็จโดย | tasks.created_by_id, created_at, updated_at, completed_by_id | ✅ บันทึกครบ | timestamp เก็บเป็น instant จริง; ถ้าผู้สร้าง/ผู้ทำเสร็จถูกปิดการใช้งานและไม่ใช่สมาชิก UI แสดง 'ผู้ใช้ที่ไม่อยู่ในระบบแล้ว'/ไม่แสดงชื่อ |
| Proposal detail – RescheduleDialog (shiftTasks) | เลื่อนวันงานที่ยังไม่เสร็จ | tasks.start_date, tasks.due_date | ✅ บันทึกครบ | +1 วัน: 2028-02-29→2028-03-01, 2026-11-30→2026-12-01; งานที่เสร็จแล้วไม่เลื่อน (by design) |
| API POST/PATCH /tasks (ไม่ใช่จาก UI) | key ที่ไม่รู้จัก isDone/level/sortOrder/attachments/tags | - | — | zod ตัดทิ้งเงียบ ๆ; UI ไม่ได้ส่ง key เหล่านี้ |

### การเสนอสินค้า + Wizard

ส่วน proposals-wizard: เมื่อกดสร้างหรือบันทึกสำเร็จ ฐานข้อมูลเก็บค่าที่ผู้ใช้กรอกได้ครบและถูกต้องเกือบทุกช่อง ได้แก่ ช่องทาง สินค้าพร้อมลำดับ ห้างหลายแห่ง (สร้างโปรเจกต์แยกห้างละ 1) Shelf วันวางขาย แม่แบบ และไทม์ไลน์ที่แก้ไว้ทั้งหมด (แก้ชื่อ/วัน/ระยะเวลา งานที่พิมพ์เองทั้ง 3 ระดับ และลำดับที่ย้าย) รวมถึงชื่อ หมายเหตุ ทีมงาน และสถานะเริ่มต้น ส่วนหน้า detail ทุก action (แก้ไขข้อมูล เปลี่ยนสถานะ เลื่อนวันแบบเลื่อนและไม่เลื่อนงาน คัดลอก ลบ) ก็บันทึกลงคอลัมน์ที่ถูกต้อง ทดสอบจริงแล้วข้อความภาษาไทยที่มีวรรณยุกต์ emoji และอักขระ '\"<>&% ถูกเก็บครบทุกไบต์ วันที่ไม่คลาดเพราะ timezone (ข้ามปีและ 29 ก.พ.) และ timestamp ทุกตัวเป็นเวลาจริงใน UTC

ช่องโหว่สำคัญ (major) มี 2 ข้อ (1) เมื่อเลือกหลายห้าง ระบบจะต่อชื่อห้างท้ายชื่อโปรเจกต์ จนยาวเกิน 200 ตัวอักษรได้ (ทดสอบได้ 223 ตัว) หลังจากนั้นหน้า "แก้ไขข้อมูล" จะบันทึกอะไรไม่ได้เลย เพราะ PATCH จำกัดชื่อไว้ที่ 200 (2) ถ้าแม่แบบมีชื่อผู้รับผิดชอบยาวเกิน 200 ตัวอักษร (หรือชื่องานยาวเกิน 500) จะสร้างโปรเจกต์จาก wizard ไม่ได้ และแก้ค่าผู้รับผิดชอบใน wizard ไม่ได้

ข้อรอง (minor) ได้แก่
- คัดลอกไปห้างอื่นแล้วชื่อยังเป็นห้างเดิม และเจ้าของเดิมไม่ได้อยู่ในทีมของสำเนา
- API ยอมให้เจ้าของที่เป็น USER โอนความเป็นเจ้าของได้
- wizard ไม่มีตัวเตือนเมื่อออกจากหน้า (ข้อมูลอยู่ใน React state อย่างเดียว)
- เปลี่ยนแม่แบบหรือ Shelf หลังแก้ไทม์ไลน์แล้ว การแก้ไขจะหายโดยไม่เตือน
- ขีดจำกัดความยาวใน UI ไม่ตรงกับ API (160/1000/ไม่จำกัด เทียบกับ 200/5000/500)
- ช่องว่างหัวท้ายถูกตัดทิ้ง

สิ่งที่ตั้งใจไว้แต่ควรแจ้งลูกค้า (info): ผู้รับผิดชอบจากแม่แบบถูกเก็บเป็นข้อความใน description ไม่ได้มอบหมายงานจริง งานที่ตัดออกและป้าย "เพิ่มเอง" ไม่ถูกเก็บ ประวัติการแก้ไขไม่เก็บค่าเดิม และการลบเป็นการลบถาวร

ข้อมูลทดสอบทั้งหมดอยู่ใน DB ทดสอบ flowtrade-audit-db และขึ้นต้นด้วย proposals-wizard (เช่น PRJ-2026-0003/0004/0008-0017) ไม่ได้แก้ไฟล์ source ใด ๆ

| หน้า | ช่อง | คอลัมน์ใน DB | ผล | หมายเหตุ |
|---|---|---|---|---|
| wizard ขั้น 1 ช่องทาง | channel | proposals.channel | ✅ บันทึกครบ | live: OFFLINE ถูกบันทึกและอ่านกลับตรง |
| wizard ขั้น 2 สินค้า | สินค้าหลายรายการ + ลำดับที่เลือก | proposal_products.product_id, sort_order | ✅ บันทึกครบ | live: ลำดับ PW-002, PW-001, PW-003 → sort_order 0,1,2 ตรงทั้ง 2 โปรเจกต์; รายการซ้ำถูกตัดซ้ำทิ้ง |
| wizard ขั้น 2 dialog เพิ่มสินค้าด่วน | sku/name/brand/category/size/barcode | products.* | ⚠️ มีปัญหา | บันทึกได้ (SKU ถูกแปลงเป็นตัวพิมพ์ใหญ่และ trim ตามที่ออกแบบไว้, '' → null) แต่ช่องกรอกไม่มี maxLength ขณะที่ API จำกัด sku 30/name 120/brand 60/category 60/size 30/barcode 30 — live: name 121 ตัว → 422 (ดู PW-08) |
| wizard ขั้น 3 ห้าง/แพลตฟอร์ม | ห้างหลายแห่ง | proposals.store_id (1 แถวต่อห้าง) | ✅ บันทึกครบ | live: 2 ห้าง → PRJ-2026-0003/0004; 500 งาน × 2 ห้าง → 500 tasks ต่อโปรเจกต์ |
| wizard ขั้น 4 Shelf | ประเภท Shelf | proposals.shelf_type_id | ✅ บันทึกครบ |  |
| wizard ขั้น 5 จองวันวางขาย | วันวางขาย (ปฏิทิน/ปุ่มลัด) | proposals.target_date (date) | ✅ บันทึกครบ | live: 2026-12-31 และ 2028-02-29 เก็บตรง ไม่เลื่อนวันเพราะ timezone; 2027-02-29 → 422 |
| wizard ขั้น 5 ไทม์ไลน์ | ชื่องานที่แก้ไข | tasks.title | ✅ บันทึกครบ | ไทย/วรรณยุกต์/emoji/<b>&% เก็บครบทุกไบต์; ตัดช่องว่างหัวท้าย (trim); ไม่มี maxLength ใน UI แต่ API จำกัด 500 ตัวอักษร |
| wizard ขั้น 5 ไทม์ไลน์ | วันเริ่ม / วันครบกำหนด / ระยะเวลา (วัน) | tasks.start_date, tasks.due_date | ✅ บันทึกครบ | live: ช่วงข้ามปี 2026-12-31→2027-01-14 และ 2027-01-01→2027-02-28 เก็บตรง; ช่องระยะเวลาของแถวที่มีอยู่จำกัดเงียบ ๆ ที่ 730 วัน |
| wizard ขั้น 5 ไทม์ไลน์ | งานที่พิมพ์เพิ่มเอง (Task/Sub/Mini) | tasks (parent_id, level) | ✅ บันทึกครบ | live: mini task (level 3) ใต้งานย่อยของแม่แบบ และ sub task ใต้งานหลัก สร้างครบ parent/level ถูกต้อง |
| wizard ขั้น 5 ไทม์ไลน์ | เลื่อนขึ้น/ลง (ลำดับงาน) | tasks.sort_order | ✅ บันทึกครบ | live: งานพิมพ์เองที่ย้ายไปไว้ก่อน 'จัดส่งสินค้า' ได้ sort_order 2000 อยู่ก่อน 3000 |
| wizard ขั้น 5/6 | งานที่ตัดออก (ไม่ใช้งานนี้ / เอาเครื่องหมายออก) | - | — ไม่ต้องบันทึก (ตั้งใจ) | งานที่ตัดออกจะไม่ถูกสร้าง และไม่มีบันทึกว่าตัดอะไรออกจากแม่แบบ |
| wizard ขั้น 5/6 | ป้าย 'เพิ่มเอง' (custom) | - | — ไม่ต้องบันทึก (ตั้งใจ) | หลังสร้างแล้วจะแยกไม่ได้ว่างานไหนพิมพ์เอง งานไหนมาจากแม่แบบ |
| wizard ขั้น 6 (ดูอย่างเดียว) | ผู้รับผิดชอบที่มาจากแม่แบบ | tasks.description = 'ผู้รับผิดชอบที่แนะนำ: X' | ⚠️ มีปัญหา | เก็บเป็นข้อความใน description ไม่ได้มอบหมายจริง (ผู้รับผิดชอบงานทุกงานคือผู้สร้าง); ถ้ายาวเกิน 200 ตัวอักษรจะสร้างโปรเจกต์ไม่ได้และแก้ใน wizard ไม่ได้ (PW-02) |
| wizard ขั้น 6 | แม่แบบ Task (select) | proposals.template_id | ✅ บันทึกครบ | แสดงกลับในแท็บภาพรวม 'แม่แบบงาน' |
| wizard ขั้น 6 | ชื่อโปรเจกต์ | proposals.title | ⚠️ มีปัญหา | เก็บครบ (char_length 199/223) แต่ถ้าเลือกหลายห้าง server ต่อท้าย ' — ชื่อห้าง' จนยาวเกิน 200 ซึ่งเกินขีดจำกัดของ PATCH → แก้ไขข้อมูลภายหลังไม่ได้ (PW-01) |
| wizard ขั้น 6 | หมายเหตุถึงทีม | proposals.note | ✅ บันทึกครบ | live: เทียบ hex ตรงทุกไบต์ (ขึ้นบรรทัด, tab, ช่องว่างหลายช่อง, <script>, emoji); ตัดช่องว่าง/บรรทัดว่างหัวท้าย |
| wizard ขั้น 6 | ทีมงานร่วม | proposal_members.user_id, added_at | ✅ บันทึกครบ | added_at เป็นเวลาจริง (06:39:15.52 UTC) |
| wizard ขั้น 6 | สถานะเริ่มต้น (ร่าง/เริ่มทันที) | proposals.status | ✅ บันทึกครบ |  |
| รายละเอียด › แก้ไขข้อมูล | ชื่อการเสนอ | proposals.title | ⚠️ มีปัญหา | บันทึกได้และ trim; ช่องกรอกจำกัด 160 แต่ API 200; dialog ส่ง title ทุกครั้ง → โปรเจกต์ที่ชื่อยาวกว่า 200 บันทึกอะไรไม่ได้เลย |
| รายละเอียด › แก้ไขข้อมูล | หมายเหตุ | proposals.note | ✅ บันทึกครบ | '' → null; textarea จำกัด 1000 ขณะที่ wizard/API ให้ 5000 (PW-08) |
| รายละเอียด › แก้ไขข้อมูล | ประเภท Shelf | proposals.shelf_type_id | ✅ บันทึกครบ |  |
| รายละเอียด › แก้ไขข้อมูล | สินค้า (เพิ่ม/ลบ/ลำดับ) | proposal_products (ลบทั้งหมดแล้วสร้างใหม่ตามลำดับ) | ✅ บันทึกครบ | live: [PW-003, PW-001] → sort_order 0,1; [] → 422 |
| รายละเอียด › แก้ไขข้อมูล | ทีมงาน | proposal_members | ✅ บันทึกครบ | ระบบตัดผู้ใช้ที่ถูกปิดใช้งานออกจากทีมโดยไม่แจ้ง เมื่อมีการแก้ไขรายชื่อทีม |
| รายละเอียด › แก้ไขข้อมูล | เจ้าของ | proposals.owner_id | ✅ บันทึกครบ | UI ส่งเจ้าของเดิมเข้าไปเป็นทีมงานถูกต้อง แต่ฝั่ง API ไม่ตรวจสิทธิ์ (PW-05) |
| รายละเอียด › เปลี่ยนสถานะ | สถานะ | proposals.status, completed_at | ✅ บันทึกครบ | live: COMPLETED บันทึก completed_at 06:44:04.598 UTC และล้างเป็น NULL เมื่อเปิดงานใหม่; COMPLETED ขณะยังมีงานค้าง → 422 |
| รายละเอียด › เลื่อนวัน | วันวางขายใหม่ | proposals.target_date | ✅ บันทึกครบ |  |
| รายละเอียด › เลื่อนวัน | สวิตช์เลื่อนวันงานที่ยังไม่เสร็จ | tasks.start_date/due_date (+ ข้อความ activity_logs) | ✅ บันทึกครบ | live: +31 วัน เลื่อนเฉพาะงานที่ยังไม่เสร็จ (2027-01-01..02-28 → 2027-02-01..03-31) งานที่เสร็จแล้วคงวันเดิม; shiftTasks=false วันของงานไม่เปลี่ยน |
| รายละเอียด › คัดลอกไปห้างอื่น | ห้างปลายทาง + วันวางขาย | proposals (แถวใหม่) + tasks/assignees ที่คัดลอก | ⚠️ มีปัญหา | วันที่ของงานถูกเลื่อนตามจำนวนวันที่ต่างกันอย่างถูกต้อง แต่ชื่อโปรเจกต์ยังเป็นชื่อห้างเดิม และเจ้าของเดิมไม่ได้อยู่ในทีม (PW-03, PW-04) |
| รายละเอียด › ลบ | ลบการเสนอ | proposals + cascade | — ไม่ต้องบันทึก (ตั้งใจ) | ลบถาวร (cascade ไปยัง tasks/members/products) เหลือไว้เพียงข้อความใน activity_logs |
| รายการการเสนอ | ค้นหา/ตัวกรอง/มุมมอง/การเรียง | - | — ไม่ต้องบันทึก (ตั้งใจ) | เก็บใน URL เท่านั้น (params.ts) มุมมองเหล่านี้อ่านอย่างเดียว |

### หน้าแสดงผล + ภาพรวมทั้งระบบ

สรุปส่วน read-side-crosscut (หน้า Home, งานของฉัน, ปฏิทิน, Monitor, กระดิ่งแจ้งเตือน, ประวัติการใช้งาน และเรื่องที่ใช้ร่วมกันทั้งแอป): ไม่พบข้อมูลผู้ใช้สูญหายหรือเสียหาย (ไม่มี critical) ทุกการกระทำในพื้นที่นี้ที่เขียนข้อมูล (ติ๊กงาน, เลิกทำ, อ่านแจ้งเตือน, อ่านทั้งหมด) บันทึกลง DB ถูกต้อง ตัวเลขบน Home และ Monitor คำนวณฝั่งเซิร์ฟเวอร์จากข้อมูลจริง และตรงกับ SQL timestamptz ทุกคอลัมน์เก็บเป็นเวลาจริง เพราะ PrismaService ตั้ง session เป็น UTC ส่วนคอลัมน์วันที่ (@db.Date) ที่ขอบปี 2026-12-31/2027-01-01 ไม่เลื่อนวัน ทั้งตอนสร้าง ตอนเลื่อนวันวางขาย และตอนคัดลอก ข้อความไทยที่มีวรรณยุกต์ อีโมจิ และอักขระพิเศษถูกเก็บตรงทุกไบต์ ยกเว้นช่องว่างหน้า-หลังที่ถูก trim ตามที่ออกแบบไว้ ทุกคอลัมน์ข้อความใน DB เป็น TEXT ไม่จำกัดความยาว จุดที่ต้องแก้มีดังนี้ (major) ระบบไม่เคยสร้างแจ้งเตือน 'ใกล้ครบกำหนด' และ 'เลยกำหนด' ทั้งที่มี enum และ UI สัญญาไว้ (major) หน้าประวัติการใช้งานคำนวณสถิติและตัวกรองจาก 300 แถวล่าสุดเท่านั้น ส่วน API ไม่มีการแบ่งหน้า แถวที่เก่ากว่าจึงยังอยู่ใน DB แต่เปิดดูไม่ได้ ทดสอบจริงแล้วหน้าจอจะแสดง 300/5 คน ขณะที่ DB มี 357/6 คน (minor) Home/badge นับเฉพาะงานใบ แต่หน้างานของฉันนับงานแม่ด้วย ตัวเลขจึงไม่ตรงกัน, KPI 'เสร็จเดือนนี้' ตัดเดือนตาม UTC, Monitor ตัดห้าง/ผู้ใช้ที่ปิดใช้งานออก จนงานของผู้ใช้ที่ถูกปิดแสดงว่า 'ยังไม่มีผู้รับผิดชอบ', การคัดลอกโปรเจกต์ การเปลี่ยนเจ้าของ และการเลื่อนวันไม่ส่งแจ้งเตือน, การเปลี่ยนสถานะอัตโนมัติและความคิดเห็นไม่ลง activity log, ขีดจำกัดความยาวข้อความไม่ตรงกันระหว่าง UI/API/แม่แบบ (แม่แบบที่บันทึกได้แล้วทำให้ wizard สร้างโปรเจกต์ไม่ได้ ได้ 422), 'ผู้รับผิดชอบที่แนะนำ' ไม่มีคอลัมน์ของตัวเอง แต่ถูกเขียนลงคำอธิบายงาน, สถานะ sidebar ไม่ถูกจำ, กระดิ่งเห็นแค่ 50 รายการ และข้อความแจ้งเตือนตัดอีโมจิครึ่งตัวจนกลายเป็น U+FFFD (info) การตั้งค่า พ.ศ./ค.ศ. และสถานะยุบ/ขยายต้นไม้งานเก็บใน localStorage ต่อเบราว์เซอร์ ไม่ตามผู้ใช้ข้ามเครื่อง, activity log ไม่เก็บค่าก่อน/หลัง และ DB มีบาง field ที่ไม่มีหน้าจอแสดง (ip/user_agent ของ session, สถานะล็อกบัญชี, template_id) ข้อมูลทดสอบทั้งหมดใช้ prefix rsx- และทำบน API ทดสอบ :3101 กับ container flowtrade-audit-db เท่านั้น ไม่ได้แก้ไฟล์ source ใดๆ

| หน้า | ช่อง | คอลัมน์ใน DB | ผล | หมายเหตุ |
|---|---|---|---|---|
| home | ติ๊กงานเสร็จ / เลิกทำ (TodoPanel checkbox + toast undo) | tasks.is_done, tasks.completed_at, tasks.completed_by_id (+ cascade ไปงานแม่) | ✅ บันทึกครบ | ทดสอบจริง: ส่งคำขอ 06:40:04.892Z, DB completed_at at time zone 'UTC' = 06:40:04.91 ทั้งงานย่อยและงานแม่ (cascade) และ completed_by_id = ผู้ติ๊ก; มี activity task.complete |
| home | ตัวนับ งานค้าง / เลยกำหนด / เสร็จสัปดาห์นี้ + badge เมนู 'งานของฉัน' | tasks (เฉพาะ leaf: children none) | ⚠️ มีปัญหา | คำนวณจาก DB จริง แต่นับเฉพาะงานใบ (leaf) ขณะที่หน้า งานของฉัน/ปฏิทิน นับทุกงานที่ assign รวมงานแม่ ตัวเลขจึงไม่ตรงกัน (ดู gap RS-03) |
| home | แผง โปรเจกต์ของฉัน / วางขายเร็วๆ นี้ / To-do (overdue, dueToday, dueThisWeek) | proposals, tasks, task_assignees | ✅ บันทึกครบ | คำนวณฝั่งเซิร์ฟเวอร์จากข้อมูลที่บันทึกแล้วทั้งหมด ใช้ todayBangkok(); ไม่มีค่าใดมาจาก state ฝั่ง client |
| my-tasks | ค้นหา (q), ตัวกรองสถานะ, ช่วงวันครบกำหนด, จัดกลุ่มตาม | - | — ไม่ต้องบันทึก (ตั้งใจ) | เป็นสถานะมุมมอง เก็บใน URL ไม่ต้องลง DB; q ถูก trim ก่อนใส่ URL |
| my-tasks | ติ๊กงานเสร็จในรายการ | tasks.is_done/completed_at/completed_by_id | ✅ บันทึกครบ | เส้นทางเดียวกับหน้า Home |
| my-tasks | ข้อความ 'แสดง N งาน · เลยกำหนด N' | tasks + task_assignees | ⚠️ มีปัญหา | นับงานแม่ (non-leaf) ด้วย ทำให้ไม่ตรงกับ badge ใน sidebar/หน้า Home (ทดสอบ: Home overdue=1, My tasks overdue=2) |
| calendar | เดือน / ช่องทาง / เลเยอร์ (launches|tasks) | - | — ไม่ต้องบันทึก (ตั้งใจ) | สถานะมุมมองใน URL |
| calendar | จำนวนวางขาย/งานครบกำหนด/เลยกำหนดต่อเดือน และ agenda 14 วัน | proposals.target_date, tasks.due_date | ✅ บันทึกครบ | คำนวณฝั่ง client แต่จากข้อมูลที่โหลดจาก DB ทั้งหมด (ไม่มี limit) — วันที่ date-only ไม่เลื่อน |
| calendar | ติ๊กงานใน DayPanel | tasks.is_done | ✅ บันทึกครบ |  |
| admin/monitor | KPI activeProposals / openTasks / overdueTasks / byStatus / byChannel | proposals.status, tasks (leaf) | ✅ บันทึกครบ | เทียบกับ SQL ตรงกัน: active 6, open leaves 33, overdue leaves 2 (ณ เวลาทดสอบ) |
| admin/monitor | KPI เสร็จเดือนนี้ (completedThisMonth) | proposals.completed_at (timestamptz) | ⚠️ มีปัญหา | ตัดเดือนด้วย ISO UTC ไม่ใช่เวลาไทย (dashboard.service.ts:171) — ดู RS-05 |
| admin/monitor | กราฟตามห้าง (byStore) และภาระงาน (workload) | stores.is_active, users.is_active | ⚠️ มีปัญหา | ตัดห้าง/ผู้ใช้ที่ปิดใช้งานออก ผลรวมไม่เท่า KPI (ทดสอบ: activeProposals 15 แต่ sum byStore.active 14 เมื่อปิดห้าง rsx) |
| admin/monitor | ผู้รับผิดชอบในตารางงานเลยกำหนด | task_assignees.user_id | ⚠️ มีปัญหา | /users/lookup คืนเฉพาะผู้ใช้ active ⇒ งานที่ assign ให้ผู้ใช้ที่ถูกปิดใช้งาน แสดง 'ยังไม่มีผู้รับผิดชอบ' ทั้งที่ DB มี assignee |
| app-shell (กระดิ่งแจ้งเตือน) | คลิกแจ้งเตือน (อ่านแล้ว) | notifications.is_read | ✅ บันทึกครบ | ทดสอบจริง: แถว COMMENT เปลี่ยนเป็น t เฉพาะแถวนั้น; ไม่มีคอลัมน์ read_at (ไม่รู้ว่าอ่านเมื่อไร) |
| app-shell (กระดิ่งแจ้งเตือน) | ปุ่ม อ่านทั้งหมดแล้ว | notifications.is_read | ✅ บันทึกครบ | ทดสอบ: 6/6 แถวของผู้ใช้เป็น true |
| app-shell (กระดิ่งแจ้งเตือน) | รายการ/จำนวนยังไม่อ่าน | notifications | ⚠️ มีปัญหา | แสดงได้แค่ 50 รายการล่าสุด ไม่มีแบ่งหน้า แจ้งเตือนที่เก่ากว่าดูไม่ได้อีก (minor) |
| app-shell (กระดิ่งแจ้งเตือน) | ข้อความแจ้งเตือนความคิดเห็น | notifications.body | ⚠️ มีปัญหา | ตัดตามหน่วย UTF-16 ⇒ อีโมจิถูกตัดครึ่งและบันทึกเป็น U+FFFD (hex efbfbd) — ตัวความคิดเห็นจริงใน comments.body ครบ |
| admin/activity | สถิติ วันนี้ / 7 วันล่าสุด / คนที่ใช้งาน และตัวเลขบนชิปประเภท | activity_logs | ⚠️ มีปัญหา | คำนวณจาก 300 แถวล่าสุดเท่านั้น ทดสอบ: DB มี 357 แถววันนี้/6 คน แต่หน้าจอจะแสดง 300/5; ชิป STORE 5 vs DB 29 |
| admin/activity | ตัวกรองประเภท, ผู้ใช้, ค้นหา, แสดงเพิ่ม | - | — ไม่ต้องบันทึก (ตั้งใจ) | กรองเฉพาะใน 300 แถวที่โหลดมา ค้นหาแถวที่เก่ากว่าไม่ได้ |
| proposal-detail (ประวัติ) | แท็บประวัติของโปรเจกต์ | activity_logs | ⚠️ มีปัญหา | แสดง 100 แถวล่าสุด (มีข้อความบอก) แต่ไม่มีทางดูแถวที่เก่ากว่า; API ไม่มี offset/cursor |
| settings | สวิตช์ แสดงปีเป็น พ.ศ. | (ไม่มี) | — ไม่ต้องบันทึก (ตั้งใจ) | หน้าจอบอกเองว่า 'มีผลเฉพาะเบราว์เซอร์' — ไม่ตามผู้ใช้ข้ามเครื่อง |
| app-shell (sidebar) | ยุบ/ขยาย sidebar | (ไม่มี) | ⚠️ มีปัญหา | cookie ถูกเขียนแต่ไม่เคยถูกอ่าน (SidebarProvider ไม่รับ defaultOpen) ⇒ รีโหลดแล้วกลับเป็นขยายเสมอ |
| proposal-detail (task tree) | ยุบ/ขยายงานแม่ | (ไม่มี) | — ไม่ต้องบันทึก (ตั้งใจ) | ต่อเบราว์เซอร์ ไม่ถูกลบเมื่อลบโปรเจกต์ |
| cross-cutting timestamps | created_at / updated_at / completed_at / last_login_at / added_at / assigned_at / notifications.created_at / activity_logs.created_at | TIMESTAMPTZ(3) | ✅ บันทึกครบ | ทุกค่าตรงกับเวลาจริงของคำขอ (เช่น proposal สร้าง 06:38:47.855Z ⇒ DB UTC 06:38:47.879; login 06:37:47Z ⇒ last_login_at UTC 06:37:47.191) แม้ container จะตั้ง TimeZone=Asia/Bangkok |
| cross-cutting date-only | proposals.target_date, tasks.start_date/due_date ที่ขอบปี | DATE | ✅ บันทึกครบ | 2026-12-31/2027-01-01 บันทึกและอ่านกลับตรง; เลื่อนวันวางขาย +1 (2026-12-31→2027-01-01) และ duplicate -1 วัน ทำงานข้ามปีถูกต้อง ไม่มีเลื่อน 1 วันจาก timezone; DateField แปลง local↔ISO ทั้งสองทางจึงไม่เลื่อน |
| cross-cutting text | ข้อความไทยมีวรรณยุกต์/อีโมจิ/อักขระพิเศษ ' " < > & % ในชื่อโปรเจกต์ หมายเหตุ ชื่องาน คำอธิบาย ความคิดเห็น | TEXT | ✅ บันทึกครบ | บันทึกตรงทุกไบต์ใน DB และใน summary ของ activity/notification; ช่องว่างหน้า-หลังถูก trim (เป็นพฤติกรรมตั้งใจ) |
| cross-cutting text limits | ชื่องาน (task title) | tasks.title TEXT | ⚠️ มีปัญหา | UI 200 (inline-add/task-row/autosave) \| wizard timeline ไม่จำกัด \| API 500 \| DB ไม่จำกัด |
| cross-cutting text limits | รายละเอียดงาน | tasks.description TEXT | — | UI 4000 \| API 10,000 \| DB ไม่จำกัด — UI เข้มกว่า ไม่ทำข้อมูลหาย |
| cross-cutting text limits | ความคิดเห็น | comments.body TEXT | — | UI 2000 \| API 5000 \| DB ไม่จำกัด |
| cross-cutting text limits | ชื่อโปรเจกต์ / หมายเหตุ | proposals.title/note TEXT | ⚠️ มีปัญหา | ชื่อ: UI 160 \| API 200. หมายเหตุ: wizard ไม่จำกัด \| dialog แก้ไข 1000 \| API 5000 ⇒ พิมพ์ >5000 ใน wizard ถูกปฏิเสธตอนกดสร้าง (ขั้นสุดท้าย) |
| cross-cutting text limits | ชื่อ/คำอธิบายแม่แบบ, ชื่องานในแม่แบบ, ผู้รับผิดชอบในแม่แบบ | task_templates.*, task_template_items.* TEXT | ⚠️ มีปัญหา | API ไม่มี max เลย (DB ทดสอบมีชื่อ 15,013 ตัว, item title 40,000 ตัว) แต่ plan ของ wizard จำกัด title 500 / responsible 200 ⇒ แม่แบบที่บันทึกผ่านแล้วทำให้ wizard สร้างโปรเจกต์ไม่ได้ (422) |
| cross-cutting entities | ผู้รับผิดชอบที่แนะนำ (responsible) ของงานจากแม่แบบ/wizard | (ไม่มีคอลัมน์) ⇒ เขียนเป็นข้อความใน tasks.description | ⚠️ มีปัญหา | DB: description = 'ผู้รับผิดชอบที่แนะนำ: Trade' (proposals.service.ts:182) |
| cross-cutting entities | ข้อมูลที่ DB เก็บแต่ UI ไม่เคยแสดง | sessions.ip/user_agent, users.failed_login_count/locked_until, proposals.template_id, task_assignees.assigned_at, proposal_members.added_at | — ไม่ต้องบันทึก (ตั้งใจ) | บันทึกจริง (sessions 65/65 แถวมี ip และ user_agent) แต่ไม่มีหน้าจอแสดง |
