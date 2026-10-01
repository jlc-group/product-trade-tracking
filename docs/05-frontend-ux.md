# FlowTrade: UX/UI และ Frontend Design Specification

> **เวอร์ชัน:** 1.0 (Final, Phase 1 / MVP) · **วันที่:** 1 ต.ค. 2569 (2026-10-01)
> **ผู้ใช้เอกสาร:** Product Designer, ทีม Frontend (`apps/web`), QA และทีม Trade (ตรวจ flow และข้อความบนหน้าจอ)
> **อ้างอิง:** [01-requirements-flow.md](01-requirements-flow.md) (กติกา C1–C13, BR-xx) · glossary ใน [README.md](README.md) · [02-architecture.md](02-architecture.md) · [03-database.md](03-database.md) / [schema.prisma](schema.prisma) · **[04-api.md](04-api.md) (endpoint, permission key, object `can`, error code ยึดตามนี้)** · [06-roadmap.md](06-roadmap.md)
> **ฐานโค้ด:** ต่อยอด prototype ใน `apps/web` (React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui + TanStack Query + **react-router 7**) ไม่ย้ายไป TanStack Router ใน MVP
> จุดที่ต้องให้ลูกค้าตัดสินใจทำเครื่องหมาย **(ควรยืนยันกับทีม Trade)** · ป้าย **[P2]** = Phase 2 · **[Should]** = MVP ถ้าเวลาพอ · ไม่มีป้าย = MVP

---

## สรุปการตัดสินใจหลัก

| เรื่อง | ตัดสินใจ |
|---|---|
| ฟอนต์ | **Noto Sans Thai Variable** แบบ self-host ผ่าน Fontsource, line-height ของเนื้อหา 1.6 (prototype ใช้ IBM Plex Sans Thai + Geist อยู่ ให้เปลี่ยนตอนปรับ token) |
| สีหลัก | Indigo `#4F46E5` เป็นสีชั่วคราว ถ้าบริษัทมี brand color ให้เปลี่ยนแค่ token ชุดเดียว **(ควรยืนยันกับทีม Trade)** |
| Layout | Sidebar + Topbar ส่วน wizard ใช้ "โหมดโฟกัส" ที่ไม่มี sidebar |
| หน้าแรก | เปิดมาเจอ "งานของฉัน" ก่อน และติ๊กเสร็จจากหน้าแรกได้ทันที |
| Wizard | 6 ขั้น: ช่องทาง → สินค้า → ห้าง → รูปแบบชั้นวาง → วันวางขาย → ตรวจสอบ · บันทึกอัตโนมัติในเครื่อง · สร้าง `batchId` ครั้งเดียวต่อ wizard session (ไม่ใช้ header `Idempotency-Key`) · ขั้น 6 แสดง preview งาน ส่วนการติ๊กตัดงานรายข้อเป็น **[Should]** (ถ้าไม่ทันย้ายไป Phase 2 ตาม [06-roadmap.md](06-roadmap.md) §2.2) |
| Task tree | tree table 3 ระดับ (งาน / งานย่อย / รายการย่อย) · เพิ่มต่อเนื่องด้วย Enter, Tab/Shift+Tab ขณะพิมพ์ · คลิกชื่อเพื่อแก้ inline · คลิกส่วนอื่นของแถวเปิด drawer ที่ sync กับ `?task=` |
| ข้อมูลของ tree | API คืน flat list `TaskDto[]` แล้วเว็บประกอบต้นไม้ด้วย `buildTaskTree` จาก `packages/shared` · ทุก mutation merge `res.patch` เข้า cache |
| ย้ายงาน | MVP: เมนู "ย้ายขึ้น / ย้ายลง / ย้ายไปไว้ใต้…" และ Tab/Shift+Tab ขณะแก้ชื่อ · ลากวาง **[P2]** |
| Cascade | dialog ที่บอกจำนวนก่อนทำงานที่กระทบหลายรายการ (C5/C7) **ไม่มีเลิกทำ cascade ใน MVP** · toast "เลิกทำ" 10 วินาทีมีเฉพาะการติ๊ก leaf ที่ทำให้แถวหายไป (หน้างานของฉัน หรือเปิด "ซ่อนงานที่เสร็จแล้ว") และการลบงาน (C13) |
| วันวางขายจริง | ปุ่ม "ยืนยันวางขายแล้ว" บันทึก `actualLaunchDate` และ dialog ปิดข้อเสนอมีช่องวันที่ (ค่าเริ่มต้น `actualLaunchDate ?? วันนี้`) **(ควรยืนยันกับทีม Trade)** |
| วันที่ | API ใช้ ISO ค.ศ. เสมอ หน้าจอแสดง พ.ศ. เป็นค่าเริ่มต้น ผู้ใช้เปลี่ยนเป็น ค.ศ. ได้ (เก็บที่ `User.dateEra`) · ใช้ dayjs อย่างเดียว (ถอด date-fns) |
| สิทธิ์บน UI | route guard ใช้ permission key จาก [04-api.md](04-api.md) §4.1 ผ่าน `RequirePermission` แบบ typed · ปุ่มในข้อเสนอและงานใช้ `can` ที่ server ส่งมา · ปุ่มที่ role นั้นไม่มีทางทำได้ให้ซ่อน ปุ่มที่ทำไม่ได้แค่ตอนนี้ให้ disable พร้อม tooltip (R-AUTH-4) |
| คีย์ลัด | ผูกกับ `event.code` แทน `event.key` จึงใช้ได้แม้แป้นพิมพ์เป็นภาษาไทย · MVP มีชุดพื้นฐานของ treegrid · ชุดเต็มและ command palette **[P2]** |
| ฟีเจอร์ที่เลื่อนไป Phase 2 | มุมมอง board/ปฏิทิน (หน้าใน prototype เก็บโค้ดไว้แต่ซ่อนจากเมนู), ⌘K, ลากวาง, bulk action, ทำสำเนางาน, Timeline/Gantt, @mention, อีเมลแจ้งเตือน, Dashboard W3/W6/W7 และ export |

---

## 1. Design principles และ Visual direction

### 1.1 หลักการออกแบบ

1. **เห็นงานของวันนี้ใน 1 คลิก.** หน้าแรกเริ่มที่งานเกินกำหนด งานวันนี้ และงานสัปดาห์นี้ ติ๊กเสร็จได้จากตรงนั้นเลย
2. **ถามทีละเรื่อง.** wizard ถามหนึ่งเรื่องต่อหนึ่งขั้น และใส่ค่าเริ่มต้นที่สมเหตุสมผลไว้ให้ รายละเอียดที่ไม่ได้ใช้บ่อยอยู่ใน drawer
3. **ให้อภัยความผิดพลาด.** ถ้าย้อนกลับได้ ให้ทำทันทีแล้วแสดง toast "เลิกทำ" ถ้าย้อนไม่ได้หรือกระทบหลายรายการ ให้แสดง dialog ที่บอกผลกระทบเป็นตัวเลข
4. **ไม่ใช้สีอย่างเดียวในการสื่อความหมาย.** ทุกสถานะต้องมีไอคอนและข้อความกำกับ (5.7 ของ spec และ WCAG 1.4.1)
5. **Keyboard สำหรับคนใช้ทุกวัน, touch สำหรับคนหน้าห้าง.** desktop เพิ่มงานและติ๊กงานได้โดยไม่ต้องจับเมาส์ ส่วนมือถือเน้นการติ๊กงาน คอมเมนต์ และถ่ายรูป
6. **ใช้ภาษาคน และใช้คำศัพท์ชุดเดียว.** ใช้ label ตาม glossary ทุกจุด เช่น "รายการย่อย" คือ mini task ตามที่ลูกค้าเรียก

**บุคลิกภาพ (Visual direction):** โปร่ง สุภาพ ใช้งานจริงจัง มุมโค้ง 8–12px, เงาบาง, พื้นหลังเทาอ่อน และการ์ดสีขาว ภาพประกอบ empty state เป็นลายเส้น 2 สี (slate + primary) ส่วนตารางและ tree ใช้ความหนาแน่นแบบเครื่องมือทำงาน ไม่ใช่แบบ landing page

### 1.2 ฟอนต์และตัวอักษร

**เลือก Noto Sans Thai (Variable) ผ่าน `@fontsource-variable/noto-sans-thai`** ด้วยเหตุผลดังนี้

1. ตัวไม่มีหัว (loopless) ที่ทันสมัยแต่อ่านง่ายที่ขนาด 13–16px และมี Latin ในฟอนต์เดียวกัน ข้อความที่ปนกันอย่าง "Big C · Normal shelf · เซรั่มวิตามินซี 30 ml" จึงกลมกลืนโดยไม่ต้องจับคู่ 2 ฟอนต์
2. เป็น variable ไฟล์เดียว (wght 100–900) โหลดน้อย และ self-host ได้ตรงกับ CSP `font-src 'self'`
3. vertical metrics เผื่อพื้นที่ให้สระบน สระล่าง และวรรณยุกต์ซ้อนอย่าง "ปู่" หรือ "ญี่ปุ่น" จึงไม่ถูกตัดในปุ่มหรือ input ที่ความสูงคงที่
4. ใช้ license OFL

ตัวเลือกที่ไม่ใช้: Sarabun มีหัว ดูเป็นเอกสารราชการ และหนาแน่นเกินไปในตาราง · IBM Plex Sans Thai (ที่ prototype ใช้อยู่) ไม่มีรุ่น variable จึงต้องโหลดหลายไฟล์ และต้องจับคู่กับ Geist สำหรับ Latin · Anuphan เหมาะกับหัวข้อมากกว่าข้อความในตาราง

| Token | ขนาด / line-height | น้ำหนัก | ใช้กับ |
|---|---|---|---|
| `text-xs` | 12 / 18 | 500 | badge, meta (ห้ามใช้กับเนื้อหาหลัก) |
| `text-sm` | 14 / 22 | 400 | ตาราง, task tree, form, เมนู (**ขนาดหลักของแอป**) |
| `text-base` | 16 / 26 | 400 | รายละเอียดใน drawer, ความคิดเห็น |
| `text-lg` | 18 / 28 | 600 | หัวการ์ด, หัว section |
| `text-xl` | 20 / 30 | 600 | หัวหน้า (H2) |
| `text-2xl` | 24 / 34 | 600 | ชื่อหน้า, ชื่อข้อเสนอ (H1) |
| `text-3xl` | 30 / 40 | 700 | ตัวเลข KPI |

**กติกาตัวอักษรไทย**
- ใส่ `<html lang="th">` ให้เบราว์เซอร์ตัดคำไทยได้ถูกและ screen reader อ่านเป็นภาษาไทย
- ห้ามใช้ `leading-none` หรือ `leading-tight` กับข้อความไทย หัวข้อใช้ line-height ไม่ต่ำกว่า 1.3
- ไม่ใช้ตัวเอียง เพราะฟอนต์ไทยไม่มีตัวเอียงจริง ให้เน้นด้วยน้ำหนักหรือสี
- ลิงก์ใช้ `text-underline-offset: 0.25em` เส้นใต้จะได้ไม่ทับสระล่าง (ุ ู)
- ตัดบรรทัดด้วย `overflow-wrap: anywhere` เฉพาะ SKU หรือรหัสที่ยาว ห้ามใช้ `word-break: break-all` กับข้อความไทย
- ตัวเลขใช้เลขอารบิกเสมอ ตัวเลขใน KPI ตาราง และ date chip ใช้ `tabular-nums` ตอน scaffold ให้ตรวจว่าฟอนต์มี feature `tnum` ถ้าไม่มี ให้คลาส `.num` ใช้ `"Noto Sans Variable"` เป็นฟอนต์แรก

### 1.3 Color tokens

ค่า contrast ทุกคู่ด้านล่างคำนวณตามสูตร WCAG แล้ว

**Core**

| Token | Hex | ใช้กับ | Contrast |
|---|---|---|---|
| `primary` | `#4F46E5` | ปุ่มหลัก, ลิงก์, stepper ปัจจุบัน | ตัวอักษรขาวบนพื้นนี้ 6.29:1 |
| `primary-hover` / `primary-strong` | `#4338CA` | hover, ตัวอักษรบนพื้น `primary-subtle` | 7.07:1 บน `#EEF2FF` |
| `primary-subtle` | `#EEF2FF` | แถวที่เลือก, การ์ดที่เลือก | — |
| `bg` | `#F8FAFC` | พื้นหลังแอป | — |
| `surface` / `surface-muted` | `#FFFFFF` / `#F1F5F9` | การ์ด / แถวงานระดับ 1, หัวตาราง | — |
| `fg` | `#0F172A` | ตัวอักษรหลัก | 17.06:1 บน `bg` |
| `fg-secondary` | `#475569` | ตัวอักษรรอง | 7.58:1 |
| `fg-muted` | `#64748B` | meta, placeholder | 4.76:1 บนขาว และ 4.55:1 บน `bg` (ห้ามใช้บนพื้นสีอื่น) |
| `border` | `#E2E8F0` | เส้นแบ่งตกแต่ง | — |
| `border-input` | `#858F9F` | ขอบ input, checkbox | 3.27:1 ผ่านเกณฑ์ non-text 1.4.11 |
| `ring` | `#6366F1` | focus ring 2px + offset 2px | 4.47:1 |

**Semantic** (ตัวอักษรสีเข้มบนพื้นสีอ่อนเสมอ)

| Token | ตัวอักษร / ไอคอน | พื้น | Contrast | ใช้กับ |
|---|---|---|---|---|
| `success` | `#15803D` | `#F0FDF4` | 4.79:1 · ปุ่มทึบตัวอักษรขาว 5.02:1 | เสร็จ, ตามแผน, ผ่าน |
| `warning` | `#92400E` (ไอคอน `#D97706` 3.19:1) | `#FFFBEB` | 6.84:1 | เสี่ยง, ใกล้ครบกำหนด, ซ้ำระดับ 1 |
| `caution` | `#C2410C` | `#FFF7ED` | 4.88:1 | ครบกำหนดวันนี้, ซ้ำระดับ 2 |
| `danger` | `#B91C1C` (ปุ่มทึบ `#DC2626` ตัวอักษรขาว 4.83:1) | `#FEF2F2` | 5.91:1 | เกินกำหนด, ล่าช้า, ลบ |
| `info` | `#1D4ED8` | `#EFF6FF` | 6.16:1 | กำลังดำเนินการ, ข้อมูล |
| `hold` | `#6D28D9` | `#F5F3FF` | 6.48:1 | พักไว้ |
| `neutral` | `#334155` | `#F1F5F9` | 9.45:1 | ร่าง, ยกเลิก, ยังไม่เริ่ม |

**Status mapping** (ไอคอนตามชื่อใน lucide-react และทุก badge มีข้อความกำกับเสมอ)

| Enum | ค่า → label | Token | ไอคอน |
|---|---|---|---|
| `ProposalStatus` | `DRAFT` ร่าง · `IN_PROGRESS` กำลังดำเนินการ · `ON_HOLD` พักไว้ · `COMPLETED` สำเร็จ (วางขายแล้ว) · `CANCELLED` ยกเลิก | neutral · info · hold · success · neutral | `FilePen` · `CirclePlay` · `CirclePause` · `BadgeCheck` · `CircleX` |
| `ProposalHealth` (เฉพาะ `IN_PROGRESS`) | `ON_TRACK` ตามแผน · `AT_RISK` เสี่ยง · `LATE` ล่าช้า | success · warning · danger | `CircleCheck` · `TriangleAlert` · `OctagonAlert` |
| `TaskDueState` | `OVERDUE` "เกินกำหนด N วัน" · `DUE_TODAY` "ครบกำหนดวันนี้" · `DUE_SOON` "อีก N วัน" · `ON_TRACK` วันที่ · `NONE` ไม่แสดง | danger · caution · warning · neutral | `CircleAlert` · `CalendarClock` · `Clock` · `Calendar` |
| `TaskStatus` | `TODO` ยังไม่เริ่ม · `IN_PROGRESS` กำลังทำ · `DONE` เสร็จแล้ว | — · info chip · success + ขีดฆ่า | checkbox ว่าง · `CircleDot` · checkbox ติ๊ก |
| `TaskPriority` | `HIGH` สูง · `MEDIUM` ปกติ · `LOW` ต่ำ | danger · ไม่แสดงในแถว · neutral | `Flag` · — · `ArrowDown` |
| `ProposalProductStatus` | `PENDING` รอผล · `ACCEPTED` ผ่าน · `REJECTED` ไม่ผ่าน | neutral · success · danger | `Hourglass` · `Check` · `X` |
| `Role` | `ADMIN` ผู้ดูแลระบบ · `MANAGER` ผู้จัดการ · `USER` ผู้ใช้งาน | hold · info · neutral | `ShieldCheck` · `BriefcaseBusiness` · `User` |
| `Channel` | `OFFLINE` ออฟไลน์ (ห้างร้าน) · `ONLINE` ออนไลน์ (แพลตฟอร์ม) | neutral | `Store` · `MonitorSmartphone` |

ในแถวงาน priority แสดงเฉพาะ `HIGH` เพื่อลดสิ่งรบกวนสายตา ส่วน `LOW` เห็นใน drawer

**Retailer brand-color chips**
- `Store.colorHex` ใช้บอก **ตัวตนของห้างเท่านั้น** ห้ามใช้บอกสถานะ และห้ามใช้เป็นสีตัวอักษร
- **StoreLogo:** มี `logoUrl` แสดงรูปในกรอบมุมโค้ง 6px พื้นขาว ถ้าไม่มี แสดง monogram 2 ตัวอักษรจาก `name` บนพื้น `colorHex` ตัวอักษรเลือกขาวหรือดำตามคู่ที่ contrast สูงกว่า (ได้อย่างน้อย 4.58:1 เสมอ)
- **StoreChip** (ตาราง, header, filter): โลโก้ 20px + `name` สี `fg` บนพื้นขาว ขอบ `border`
- **StoreCard** (wizard): โลโก้ 56px, แถบบน 4px สี `colorHex`, `name` และ `nameTh`
- ช่องเลือกสีของ Admin มี 12 สีสำเร็จรูปและช่องกรอก hex ถ้าสี contrast กับพื้นขาวต่ำกว่า 3:1 เตือน "สีอ่อนเกินไป แถบสีจะมองเห็นยาก" แต่ไม่บล็อก
- ห้างที่ยังไม่มี `colorHex` ใช้สีจาก palette กลางโดย hash จาก `code` · สีและโลโก้จริงของแต่ละห้างให้ทีม Trade/Marketing กรอกจากไฟล์ที่ได้รับอนุญาต **(ควรยืนยันกับทีม Trade)**

### 1.4 Spacing, radius, elevation, motion

- **Spacing:** scale 4px ของ Tailwind · ระยะขอบหน้า 24px (≥1024) และ 16px (<768) · ระยะห่างระหว่าง section 32px · padding ในการ์ด 16–20px
- **ขนาดคงที่:** sidebar 248px (icon rail 64px), topbar 56px, เนื้อหากว้างไม่เกิน 1440px, drawer 480px (ปรับได้ 400–640px)
- **ความสูงแถว tree:** ระดับ 1 = 44px, ระดับ 2 = 40px, ระดับ 3 = 36px · บนจอสัมผัสอย่างน้อย 48px
- **Radius:** `sm` 6px (input, chip) · `md` 8px (ปุ่ม) · `lg` 12px (การ์ด, dialog) · `xl` 16px (การ์ดใหญ่ใน wizard) · `full` (avatar, pill)
- **Elevation:** `shadow-xs` การ์ดตอน hover · `shadow-md` popover/dropdown · `shadow-lg` drawer/dialog
- **ขนาด control:** ปุ่ม 36px (ปกติ), 32px (ในแถว tree), 44px เมื่อ `pointer: coarse` · ไอคอน lucide stroke 1.75 ขนาด 16px ในแถว และ 20px ในเมนู
- **Motion:** 150–200ms ease-out (เปิด/ปิดแถว, drawer, ติ๊ก) แถวที่ระบบหรือคนอื่นเปลี่ยนจะ highlight 600ms · ถ้าผู้ใช้ตั้ง `prefers-reduced-motion` ปิดการเคลื่อนไหวทั้งหมดเหลือแค่เปลี่ยนสี

### 1.5 Accessibility (WCAG 2.1 AA)

- [ ] Contrast ตัวอักษร ≥ 4.5:1 และ non-text (ขอบ input, ไอคอนที่สื่อความหมาย, focus ring) ≥ 3:1 ตามตารางด้านบน
- [ ] ใช้งานด้วย keyboard ได้ทั้งหมด focus มองเห็นชัด (ring 2px + offset 2px) และไม่มี keyboard trap (กติกา Tab ใน 4.8)
- [ ] Task tree ใช้ `role="treegrid"`: แถวมี `aria-level`, `aria-expanded`, `aria-posinset`, `aria-setsize` และใช้ roving tabindex ส่วน checkbox มี label "ทำเครื่องหมายเสร็จ: {title}"
- [ ] การย้ายงานมีทางที่ไม่ต้องลากเสมอ (เมนู "ย้ายขึ้น / ย้ายลง / ย้ายไปไว้ใต้…") ตามแนว WCAG 2.2 ข้อ 2.5.7 · MVP ยังไม่มีการลากเลย
- [ ] พื้นที่กดขั้นต่ำ 24×24px บน desktop และ 44×44px บนจอสัมผัส
- [ ] form ทุกช่องมี `<label>` ข้อความ error ผูกด้วย `aria-describedby` และ focus ย้ายไปช่องแรกที่ผิด
- [ ] toast, การเปลี่ยน progress และการเปลี่ยนขั้นของ wizard ประกาศผ่าน `aria-live="polite"`
- [ ] ปุ่มไอคอนทุกปุ่มมี `aria-label` ภาษาไทย · disabled tooltip ใช้ `aria-describedby` บนปุ่มที่ห่อด้วย span
- [ ] CI รัน Playwright + `@axe-core/playwright` ทุกหน้าหลัก

### 1.6 Token ใน code (Tailwind 4 + shadcn)

```css
/* apps/web/src/index.css */
@import "tailwindcss";
@import "@fontsource-variable/noto-sans-thai/wght.css";

:root {
  --background: #F8FAFC; --foreground: #0F172A;
  --card: #FFFFFF; --card-foreground: #0F172A;
  --muted: #F1F5F9; --muted-foreground: #64748B;
  --primary: #4F46E5; --primary-foreground: #FFFFFF;
  --accent: #EEF2FF; --accent-foreground: #4338CA;
  --destructive: #DC2626;
  --border: #E2E8F0; --input: #858F9F; --ring: #6366F1;
  --radius: 0.5rem;
  /* FlowTrade semantic */
  --success: #15803D; --success-subtle: #F0FDF4;
  --warning: #92400E; --warning-icon: #D97706; --warning-subtle: #FFFBEB;
  --caution: #C2410C; --caution-subtle: #FFF7ED;
  --danger: #B91C1C;  --danger-subtle: #FEF2F2;
  --info: #1D4ED8;    --info-subtle: #EFF6FF;
  --hold: #6D28D9;    --hold-subtle: #F5F3FF;
}

@theme inline {
  --font-sans: "Noto Sans Thai Variable", "Noto Sans Thai", system-ui, sans-serif;
  --text-sm: 14px;   --text-sm--line-height: 1.6;
  --text-base: 16px; --text-base--line-height: 1.625;
  --color-background: var(--background); --color-foreground: var(--foreground);
  --color-primary: var(--primary); --color-ring: var(--ring); --color-input: var(--input);
  --color-success: var(--success); --color-success-subtle: var(--success-subtle);
  --color-warning: var(--warning); --color-warning-subtle: var(--warning-subtle);
  --color-caution: var(--caution); --color-danger: var(--danger); --color-info: var(--info);
  --color-hold: var(--hold);
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
}
```

Phase 1 ทำเฉพาะ light theme แต่โครง token รองรับ dark mode ใน Phase 3 โดยไม่ต้องแก้ component

---

## 2. Sitemap และ Route table

### 2.1 Sitemap

```
FlowTrade
├─ /login · /change-password                 (AuthLayout ไม่มี nav)
├─ /                       หน้าแรก
├─ /my-tasks               งานของฉัน
├─ /proposals              ข้อเสนอสินค้า (ตาราง · board/ปฏิทิน [P2])
│  ├─ /proposals/new                   Wizard (WizardLayout โหมดโฟกัส)
│  └─ /proposals/:id                   รายละเอียด [งาน | สินค้า | สมาชิก | ไฟล์และความคิดเห็น | ประวัติ]
├─ /notifications          การแจ้งเตือน
├─ /settings               โปรไฟล์และตั้งค่าส่วนตัว
├─ /calendar               ปฏิทินส่วนตัว [P2]
└─ /admin                  Admin Monitor (ADMIN, MANAGER)
   ├─ /admin/tasks              งานทั้งฝ่าย (ปลายทาง drill-down จาก K4, K5, W5)
   ├─ /admin/stores             ห้าง / แพลตฟอร์ม
   ├─ /admin/shelf-types        รูปแบบชั้นวาง / ประเภท Listing
   ├─ /admin/products           สินค้า
   ├─ /admin/templates          แม่แบบงาน → /admin/templates/:templateId (tree editor)
   ├─ /admin/users              ผู้ใช้และสิทธิ์ (ADMIN)
   ├─ /admin/activity           ประวัติการใช้งาน (ADMIN)
   └─ /admin/settings           ตั้งค่าระบบ (ADMIN) [P2]
```

### 2.2 Route table

คอลัมน์ Guard ใช้ permission key จาก [04-api.md](04-api.md) §4.1 เท่านั้น

| Path | หน้า | Roles | Guard | Layout | Search params สำคัญ |
|---|---|---|---|---|---|
| `/login` | เข้าสู่ระบบ | public | มี session อยู่แล้ว → `/` | AuthLayout | `returnTo` (รับเฉพาะ path ที่ขึ้นต้นด้วย `/` และไม่ใช่ `//`) |
| `/change-password` | ตั้งรหัสผ่านใหม่ | ผู้ใช้ที่ `mustChangePassword = true` | `RequireAuth` · ถ้า `false` → `/` | AuthLayout | — |
| `/` | หน้าแรก | ทุก role | `RequireAuth` | AppLayout | — |
| `/my-tasks` | งานของฉัน | ทุก role | `RequireAuth` | AppLayout | `storeId`, `task` |
| `/proposals` | รายการข้อเสนอ | ทุก role (ขอบเขตตามสิทธิ์) | `RequireAuth` | AppLayout | `scope=mine\|all`, `status`, `channel`, `storeId` (csv), `shelfTypeId`, `ownerId`, `health`, `targetDateFrom`, `targetDateTo`, `batchId`, `q`, `page`, `pageSize`, `sort` · `view=board\|calendar` **[P2]** |
| `/proposals/new` | Wizard | ทุก role | `proposal.create` | WizardLayout | `step=1..6`, prefill `channel`, `productId`, `storeId` |
| `/proposals/:id` | รายละเอียดข้อเสนอ | ตามสิทธิ์ระดับข้อเสนอ | `RequireAuth` · API ตอบ 404 → หน้า "ไม่พบข้อเสนอ" | AppLayout | `tab=tasks\|products\|members\|discussion\|history`, `task`, `taskFilter=all\|mine\|open\|overdue`, `hideDone` |
| `/notifications` | การแจ้งเตือน | ทุก role | `RequireAuth` | AppLayout | `unread` |
| `/settings` | โปรไฟล์ | ทุก role | `RequireAuth` | AppLayout | — |
| `/calendar` **[P2]** | ปฏิทิน | ทุก role | `RequireAuth` | AppLayout | `view=month\|agenda`, `layers`, `scope` |
| `/admin` | ภาพรวม (Dashboard) | ADMIN, MANAGER | `dashboard.view.all` | AppLayout | `channel`, `storeId`, `shelfTypeId`, `ownerId` (+ `period`, `from`, `to` สำหรับ W2) |
| `/admin/tasks` | งานทั้งฝ่าย | ADMIN, MANAGER | `dashboard.view.all` | AppLayout | `due=OVERDUE\|THIS_WEEK`, `unassigned=true`, `assigneeId`, `storeId`, `leafOnly`, `page`, `task` |
| `/admin/stores` | ห้าง / แพลตฟอร์ม | ADMIN, MANAGER | `master.manage` | AppLayout | `channel`, `status`, `edit=<id>\|new`, `name` (prefill จาก STORE_REQUEST) |
| `/admin/shelf-types` | รูปแบบชั้นวาง / ประเภท Listing | ADMIN, MANAGER | `master.manage` | AppLayout | `channel`, `edit` |
| `/admin/products` | สินค้า | ADMIN, MANAGER | `master.manage` | AppLayout | `q`, `brand`, `category`, `status`, `page` |
| `/admin/templates` | แม่แบบงาน | ADMIN, MANAGER | `master.manage` | AppLayout | `channel` |
| `/admin/templates/:templateId` | Tree editor (`new` = สร้างใหม่) | ADMIN, MANAGER | `master.manage` | AppLayout | `sampleDate` |
| `/admin/users` | ผู้ใช้และสิทธิ์ | ADMIN | `user.manage` | AppLayout | `role`, `status`, `q`, `user` |
| `/admin/activity` | ประวัติการใช้งาน | ADMIN | `audit.read.all` | AppLayout | `actorId`, `entityType`, `action`, `from`, `to` |
| `/admin/settings` **[P2]** | ตั้งค่าระบบ | ADMIN | `setting.manage` | AppLayout | — |
| `/403`, `*` | ไม่มีสิทธิ์ / ไม่พบหน้า | — | — | AppLayout (ถ้า login อยู่) | — |

- ชื่อและค่าของ search param ตรงกับ query ของ API (เช่น `targetDateFrom`, `due=OVERDUE`, `unassigned=true`, หลายค่าคั่นด้วย comma) เพื่อให้ `drilldown` ที่ API ส่งมาเปิดได้ตรงๆ
- `?task=<id>` ใช้ได้บน `/proposals/:id`, `/my-tasks`, `/admin/tasks` เพื่อเปิด TaskDrawer ตรงกับ `Notification.linkUrl` รูปแบบ `/proposals/{id}?task={taskId}`

### 2.3 Navigation

- **Sidebar:**
  - ปุ่มเด่น "+ สร้างข้อเสนอ" อยู่บนสุด
  - กลุ่มทั่วไป: หน้าแรก · งานของฉัน (badge แดงแสดงจำนวนงานเกินกำหนด) · ข้อเสนอสินค้า · ปฏิทิน **[P2]**
  - กลุ่ม "Admin Monitor" (ADMIN/MANAGER): ภาพรวม · งานทั้งฝ่าย · ห้าง/แพลตฟอร์ม · รูปแบบชั้นวาง · สินค้า · แม่แบบงาน · และสำหรับ ADMIN: ผู้ใช้และสิทธิ์ · ประวัติการใช้งาน
  - ล่างสุดเป็นเมนูโปรไฟล์ (ชื่อเล่น + บทบาท)
- **Topbar:**
  - ชื่อหน้า / breadcrumb
  - กระดิ่ง: จำนวนที่ยังไม่อ่าน (poll `GET /notifications/unread-count` ทุก 60 วินาที) เปิด dropdown 10 รายการล่าสุด พร้อม "อ่านทั้งหมด" และ "ดูทั้งหมด"
  - Avatar menu: ตั้งค่าส่วนตัว · สลับปี พ.ศ./ค.ศ. (บันทึกที่ `User.dateEra` ผ่าน `PATCH /auth/me`) · ออกจากระบบ
  - ค้นหาทั่วระบบด้วย `Ctrl/⌘+K` (command palette) **[P2]** · MVP ค้นหาด้วยรหัสหรือชื่อได้ที่หน้า `/proposals`

### 2.4 สเปกหน้าที่ไม่มีหัวข้อเฉพาะ

**`/login`**
- ช่องอีเมลและรหัสผ่าน (ปุ่มแสดง/ซ่อนรหัส) และปุ่ม "เข้าสู่ระบบ" · ไม่มีลิงก์สมัคร และไม่มี "จดจำฉัน" (session idle 8 ชม. อายุสูงสุด 7 วัน)
- **Thai keyboard hint:** ถ้าช่องอีเมลหรือรหัสผ่านมีอักษรไทย (`[฀-๿]`) แสดงคำเตือนสีเหลือง "แป้นพิมพ์เป็นภาษาไทยอยู่ สลับเป็น EN ก่อนพิมพ์" ซึ่งเป็นสาเหตุที่พบบ่อยที่สุดของการพิมพ์รหัสผิด
- Caps Lock เปิดอยู่ → "Caps Lock เปิดอยู่"
- `423 ACCOUNT_LOCKED` → alert นับถอยหลังเป็นนาทีจาก `retryAfterSeconds` และ disable ปุ่มจนปลดล็อก
- `401 TEMP_PASSWORD_EXPIRED` → "รหัสผ่านชั่วคราวหมดอายุแล้ว ติดต่อผู้ดูแลระบบเพื่อขอรหัสใหม่"
- ข้อความลืมรหัสผ่าน: "ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ"

**`/change-password`**
- ใช้ทั้งการเข้าระบบครั้งแรกและหลัง admin รีเซ็ต ข้อความ: "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน"
- ช่องรหัสใหม่และยืนยันรหัส พร้อม checklist ที่ติ๊กตามเงื่อนไขขณะพิมพ์ (8–128 ตัว · มีตัวอักษร · มีตัวเลข) ดึงจาก `passwordSchema` ใน `packages/shared` จึงตรงกับ server เสมอ
- หน้านี้ไม่ถามรหัสเดิม (API ไม่บังคับเมื่อ `mustChangePassword = true`) ส่วนการเปลี่ยนรหัสโดยสมัครใจที่ `/settings` ต้องกรอกรหัสเดิม (US-C04)

**`/` หน้าแรก** (wireframe 7.2 · ข้อมูลจาก `GET /dashboard/me` และ `GET /me/tasks`)
- ทักทายด้วยชื่อเล่นและวันที่เต็ม เช่น "วันพฤหัสบดีที่ 1 ต.ค. 2569"
- **งานของฉัน:** แท็บ เกินกำหนด / วันนี้ / สัปดาห์นี้ แท็บละ 5 รายการ ติ๊กได้ทันที
- **ข้อเสนอของฉัน:** การ์ดแสดงโลโก้ห้าง, รหัส, รูปแบบ, วันวางขายพร้อมนับถอยหลัง, progress และ health
- **วางขายเร็วๆ นี้:** ข้อเสนอที่วางขายภายใน 30 วัน
- MANAGER/ADMIN เห็นแถบภาพรวมฝ่ายเพิ่ม (เสี่ยง · ล่าช้า · งานเกินกำหนด) พร้อมลิงก์ไป Monitor
- ผู้ใช้ใหม่เห็นการ์ด "เริ่มต้นใช้งาน" 3 ข้อ (ตั้งรหัสผ่าน ✓ · สร้างข้อเสนอแรก · มอบหมายงานให้เพื่อนร่วมทีม) หายไปเมื่อทำครบ

**`/my-tasks`** (`GET /me/tasks`)
- กลุ่มตามวัน: เกินกำหนด / วันนี้ / สัปดาห์นี้ (จันทร์–อาทิตย์) / ภายหลัง / ไม่มีกำหนด · หัวกลุ่ม sticky พร้อมจำนวน · "ภายหลัง" ยุบไว้ถ้าเกิน 10 รายการ
- **กลุ่ม "พักไว้" แยกไว้ท้ายสุดและยุบไว้เป็นค่าเริ่มต้น** สำหรับงานในข้อเสนอ `ON_HOLD` ไม่ระบายสีเกินกำหนดและไม่แสดงป้าย due state (BR-23) ตรงกับกลุ่ม `ON_HOLD` ของ API
- แต่ละแถว: checkbox, ชื่องาน, path `PRP-2026-0042 · Big C › เตรียมเอกสารนำเสนอ › กรอก Listing form`, ป้ายกำหนดส่ง, ธง HIGH
- ติ๊กแล้วแถวยุบหายภายใน 300ms และแสดง toast "เลิกทำ" (US-C02 AC3) · ด้านล่างมีกลุ่ม "เสร็จวันนี้ (n)" ที่ยุบไว้สำหรับทบทวนหรือเอาติ๊กออก
- งานแม่ที่ยังมีงานลูกค้างติ๊กจากหน้านี้ได้ผ่าน dialog C5 เดียวกับหน้า tree
- คลิกแถวเพื่อเปิด TaskDrawer ในหน้าเดิม

**`/admin/tasks`** (`GET /dashboard/tasks`)
- ใช้ component รายการเดียวกับ `/my-tasks` แต่ดูได้ทั้งฝ่าย ตัวกรอง: ผู้รับผิดชอบ, "ยังไม่มีผู้รับผิดชอบ", เกินกำหนด / สัปดาห์นี้, ห้าง และ "เฉพาะงานระดับล่างสุด" (`leafOnly`)
- เปิดจาก K4 → `?due=OVERDUE` · K5 → `?unassigned=true` · W5 → `?assigneeId=…` ตัวเลขบนการ์ดจึงตรงกับจำนวนแถว ([04-api.md](04-api.md) §2.13)
- **[Should]** เลือกหลายแถวแล้ว "โอนงานให้…" ผ่าน `POST /tasks/transfer`

**`/proposals`**
- แถบบน: แท็บสถานะพร้อมจำนวน (`meta.statusCounts`), ตัวสลับขอบเขต (USER ค่าเริ่มต้น "ของฉัน", MANAGER/ADMIN ค่าเริ่มต้น "ทั้งหมด"), ตัวกรอง (ช่องทาง, ห้าง, รูปแบบ, เจ้าของ, ช่วงวันวางขาย, สุขภาพ) และค้นหารหัส/ชื่อ · ค่าทั้งหมดอยู่ใน URL จึงแชร์ลิงก์ได้
- **ตาราง:** รหัส · ชื่อข้อเสนอ (มีโลโก้ห้าง) · รูปแบบ · วันวางขาย (+นับถอยหลัง หรือ "วางขายจริง {วันที่}") · ความคืบหน้า · สุขภาพ · สถานะ · เจ้าของ · อัปเดตล่าสุด · แบ่งหน้า 20/50 แถว · ข้อเสนอที่มี `batchId` มีไอคอน "สร้างพร้อมกัน" ซึ่งกรอง `?batchId=`
- **เมื่อกรอง `batchId`** (หลังสร้างหลายข้อเสนอจาก wizard) แสดง banner จาก `meta.batch`: "สร้างพร้อมกัน 3 ข้อเสนอ · 1 ต.ค. 2569 โดย ต้น" แทนหน้าสรุป batch แยก
- **[P2]** มุมมอง board ตามสถานะ (ดูอย่างเดียว เปลี่ยนสถานะผ่านเมนู "…" ที่เปิด dialog เดียวกับหน้ารายละเอียด) และมุมมองปฏิทิน · prototype มี `kanban-view.tsx` อยู่แล้ว ให้เก็บโค้ดไว้แต่ซ่อนตัวสลับมุมมองจนถึง Phase 2 **(ควรยืนยันกับทีม Trade ว่าต้องลากการ์ดเพื่อเปลี่ยนสถานะหรือไม่)**

**`/notifications`** จัดกลุ่ม วันนี้ / เมื่อวาน / ก่อนหน้า · จุดแสดงรายการที่ยังไม่อ่าน · ไอคอนตาม `NotificationType` · แท็บ ทั้งหมด / ยังไม่อ่าน · คลิกรายการเพื่อไปที่ `linkUrl` และเรียก `POST /notifications/:id/read`

**`/settings`**
- รูปโปรไฟล์ (crop วงกลม) **[Should]** และชื่อเล่น แก้ได้ · ชื่อ-นามสกุลและตำแหน่งอ่านอย่างเดียว (admin ดูแล)
- รูปแบบปี: radio "ตามค่าระบบ / พ.ศ. / ค.ศ." พร้อมตัวอย่าง "15 พ.ย. 2569" บันทึกที่ `User.dateEra` (แทน `lib/prefs.ts` ใน prototype ที่เก็บในเบราว์เซอร์)
- สวิตช์รับอีเมลสรุปประจำวัน (มีผลเมื่ออีเมลเปิดใช้ใน Phase 2) และส่วนเปลี่ยนรหัสผ่าน (ต้องกรอกรหัสเดิม)

---

## 3. Wizard สร้างข้อเสนอ (`/proposals/new`)

### 3.1 โครงหน้าจอและพฤติกรรมร่วม

- **WizardLayout (โหมดโฟกัส):** ไม่มี sidebar
  - แถบบน: ปุ่ม "ปิด", ชื่อ "สร้างข้อเสนอสินค้า" และสถานะ "บันทึกอัตโนมัติในเครื่องนี้แล้ว 10:42"
  - ถัดลงมาเป็น stepper เนื้อหากว้างไม่เกิน 880px
  - แผง "สรุปที่เลือก" กว้าง 320px ติดขวา (sticky) ที่ ≥1280px ถ้าจอเล็กกว่า ยุบเป็นแถบเหนือ footer "ออฟไลน์ · 3 สินค้า · 2 ห้าง [ดูสรุป]"
  - Footer sticky: [‹ ย้อนกลับ] … [บันทึกร่าง] (เฉพาะขั้น 6) [ถัดไป: {ชื่อขั้นถัดไป} ›]
- **Stepper:** ทุกขั้นแสดงชื่อ ขั้นที่ผ่านแล้วมีไอคอนติ๊กและคลิกย้อนได้ ขั้นปัจจุบันสี primary ขั้นถัดไปจางและคลิกไม่ได้ · มือถือแสดง "ขั้น 3/6 · ห้าง" พร้อม progress bar
- **Label ตามช่องทาง:** เลือกออนไลน์ → ขั้น 3–5 เป็น "แพลตฟอร์ม", "ประเภท Listing", "วัน Go-live" (US-U02)
- **ปุ่มถัดไป:** ข้อมูลบังคับยังไม่ครบ ปุ่มเป็น disabled และมีข้อความด้านซ้ายบอกสิ่งที่ขาด เช่น "เลือกห้างอย่างน้อย 1 ห้าง" ผูกด้วย `aria-describedby` (US-U01 AC2)
- **ย้อนกลับ:** ค่าที่เลือกไม่หาย ถ้ากลับไปเปลี่ยนช่องทาง ถามยืนยันก่อน แล้วล้างค่าขั้น 3–5 แต่เก็บสินค้าไว้
- **URL:** sync เป็น `?step=n` ปุ่ม Back ของเบราว์เซอร์จึงย้อนทีละขั้น · เปิดลิงก์ตรงไปขั้นที่ขั้นก่อนหน้ายังไม่ครบ ระบบพาไปขั้นแรกที่ยังขาด
- **ออกกลางคัน:** ไม่มี dialog กัน เพราะมี autosave · toast "เก็บข้อเสนอที่ทำค้างไว้ในเครื่องนี้แล้ว กลับมาทำต่อได้จากปุ่มสร้างข้อเสนอ"

### 3.2 ทีละขั้น

| ขั้น | UI | ข้อมูล / กติกา |
|---|---|---|
| **1 ช่องทาง** | การ์ดใหญ่ 2 ใบ (radio group): `Store` "ออฟไลน์ (ห้างร้าน)" — "เสนอสินค้าเข้าห้าง modern trade เช่น Big C, Watsons, 7-Eleven" · `MonitorSmartphone` "ออนไลน์ (แพลตฟอร์ม)" — "ลงขายบน marketplace เช่น Shopee, Lazada, TikTok Shop" | เลือกแล้ว **ไปขั้นถัดไปอัตโนมัติ** (ขั้นเดียวที่มีคำถามข้อเดียว) ไม่ preselect เพื่อให้เลือกอย่างตั้งใจ |
| **2 สินค้า** | ช่องค้นหา autofocus "ค้นหาด้วย SKU, ชื่อสินค้า หรือสแกนบาร์โค้ด" (`GET /lookups/products`) ผลเป็นรายการ (checkbox, รูป 40px, ชื่อ, `sku · packSize · brand`) · chip กรองแบรนด์/หมวดหมู่ · ถาด "เลือกแล้ว N/50" ในแผงสรุป | debounce 250ms ค้นแบบ substring · แสดงเฉพาะสินค้า Active · เลือก 1–50 รายการ ไม่ให้เลือกซ้ำ (BR-24) · **เครื่องสแกนบาร์โค้ด:** ข้อความตรงกับ `barcode` หรือ `sku` พอดีแล้วกด Enter → เพิ่มสินค้าทันทีและล้างช่อง · **Quick-add (ADMIN/MANAGER):** ค้นไม่พบแสดง "+ เพิ่ม '{คำค้น}' เป็นสินค้าใหม่" เปิด dialog กรอก sku*, name*, brand, packSize, barcode (`POST /products`) แล้วเลือกให้อัตโนมัติ · **USER:** "ไม่พบสินค้า? ติดต่อผู้จัดการหรือผู้ดูแลระบบเพื่อเพิ่มสินค้า" (ปุ่มแจ้งขอเพิ่มสินค้าเป็น **[P2]** และต้องนำเข้าสินค้าทั้งหมดก่อน go-live) **(ควรยืนยันกับทีม Trade ว่า USER ควรเพิ่มสินค้าเองได้หรือไม่)** |
| **3 ห้าง / แพลตฟอร์ม** | grid การ์ดโลโก้ (6 / 4 / 3 / 2 คอลัมน์ตามความกว้าง) แต่ละใบมีโลโก้ 56px, `name`, `nameTh`, checkbox มุมขวาบน · เกิน 12 ห้างมีช่องค้นหา | `GET /lookups/stores?channel=` (Active เรียงตาม `sortOrder`) · เลือกได้ไม่เกิน 20 ห้าง ครบแล้วการ์ดที่เหลือ disabled พร้อม tooltip · **ตรวจซ้ำระดับ 1** ทุกครั้งที่เลือก (`POST /proposals/duplicate-check`): ใต้การ์ดขึ้นป้ายเหลือง "มีข้อเสนออยู่แล้ว N" เปิด popover แสดงรหัส, ชื่อ, เจ้าของ, สถานะ, รูปแบบ และลิงก์เปิดแท็บใหม่ · ข้อเสนอที่ผู้ใช้มองไม่เห็นแสดงแค่รหัส ชื่อเจ้าของ สถานะ (BR-04) · ADMIN/MANAGER เห็นการ์ดเส้นประ "+ เพิ่มห้างใหม่" (กรอกชื่อ*, ชื่อไทย, สี แล้วระบบเสนอ `code` ให้) · USER เห็นลิงก์ "ไม่พบห้างที่ต้องการ? แจ้งผู้ดูแล" เปิด dialog กรอกชื่อห้าง* และหมายเหตุ แล้ว `POST /store-requests` (US-U16) |
| **4 รูปแบบชั้นวาง / ประเภท Listing** | radio card: `name` + `nameTh`, `description`, แถบสี `colorHex` และ meta แม่แบบ เช่น "แม่แบบ 21 งาน · เริ่ม T−60" หรือ "ยังไม่มีแม่แบบเริ่มต้น จะเริ่มจากรายการว่าง" · เลือกหลายห้างมีส่วนยุบได้ "กำหนดแยกรายห้าง" (ตาราง ห้าง / รูปแบบ / สถานะการซ้ำ) | `GET /lookups/shelf-types?channel=` (Active เรียงตาม `sortOrder` · `defaultTemplate.itemCount` และ `leadTimeDays` ใช้ทำ meta) · รูปแบบที่ Admin เพิ่มเองปรากฏอัตโนมัติ (US-A05) · ค่าด้านบนใช้กับทุกห้างและ override รายแถวได้ · **ตรวจซ้ำระดับ 2** (สินค้า + ห้าง + รูปแบบเหมือนกันหมด): แถวนั้นขึ้นป้ายสี caution ต้องติ๊ก "ยืนยันว่าไม่ใช่ข้อเสนอซ้ำ" และกรอกเหตุผล ≥ 5 ตัวอักษรจึงไปต่อได้ (US-U04 AC2) |
| **5 วันวางขาย / วัน Go-live** | ช่องวันที่ (พิมพ์หรือเปิดปฏิทิน 2 เดือน) · ปุ่มลัด "+30 / +60 / +90 วัน" (นับจากวันนี้) · "อีก N วัน" สด · ตัวสลับ "กำหนดแยกรายห้าง" เปิดตาราง ห้าง / วันที่ / อีกกี่วัน / คำเตือน · ด้านล่างเป็น **ไทม์ไลน์ย้อนหลัง** ที่วางงานระดับ 1 ของแม่แบบระหว่างวันนี้ถึงวันวางขาย · ออนไลน์มีช่อง `campaignName` (ไม่บังคับ ≤ 100 ตัว) พร้อม chip "11.11", "12.12", "Payday" | ช่องวันที่รับ "15/11/2569" หรือ "15/11/2026" ถ้าปี ≥ 2400 ถือเป็น พ.ศ. แล้วลบ 543 · **Lead time** = `leadTimeDays` ของแม่แบบ ถ้า (targetDate − วันนี้) น้อยกว่า แสดง alert เหลือง "แม่แบบต้องเริ่ม 60 วันก่อนวางขาย แต่เหลือ 45 วัน · ระบบจะเลื่อน 6 งานที่ตกก่อนวันนี้ให้เริ่มวันนี้" (BR-12) · วันในอดีต: alert แดง "เป็นวันที่ผ่านมาแล้ว ใช้สำหรับบันทึกย้อนหลัง ระบบจะไม่เลื่อนวันของงาน" แต่ไปต่อได้ (BR-11) |
| **6 ตรวจสอบ** | การ์ดต่อ 1 ข้อเสนอ (≤ 3 ใบเปิดทั้งหมด มากกว่านั้นเป็นตารางที่ขยายรายแถวได้) แต่ละใบมี: หัวการ์ด (โลโก้, รูปแบบ, วันวางขาย, จำนวนคำเตือน) · **ชื่อข้อเสนอ** อัตโนมัติและแก้ได้ (นับถึง 200 ตัว มี "คืนค่าชื่ออัตโนมัติ") · รายละเอียด · สินค้าพร้อมรูปย่อ · **แม่แบบงาน** (Select ที่ติดป้าย "(ค่าเริ่มต้น)" และมี "เริ่มจากรายการว่าง") · **Preview tree แบบอ่านอย่างเดียว** พร้อมวันที่คำนวณแล้ว (`POST /proposals/preview`) งานที่ถูกเลื่อนวันมีไอคอน "ปรับเป็นวันนี้" · **เจ้าของ** (USER: "คุณเป็นเจ้าของข้อเสนอ" · MANAGER/ADMIN: เลือกผู้ใช้ Active) · **สมาชิกเพิ่มเติม** พร้อมสิทธิ์ ผู้ร่วมแก้ไข/ผู้ติดตาม · หลายข้อเสนอใช้เจ้าของและสมาชิกชุดเดียวกัน | แม่แบบเริ่มต้นตาม 6.2.4 (`GET /lookups/task-templates` → `meta.defaultTemplateId`) · รายการแม่แบบกรองเฉพาะที่ `channel` ตรงและ `shelfTypeId` เป็น null หรือตรง · **การตัดงานบางข้อออกก่อนสร้าง (checkbox รายงาน) เป็น [Should]** (API รองรับ `excludedTemplateItemIds` แล้ว ตัดงานแม่แล้วงานลูกถูกตัดตาม และสรุป "จะสร้าง 19 จาก 21 งาน" ตาม US-U05 AC3) ถ้าไม่ทันใน MVP ผู้ใช้ลบงานหลังสร้างแทน ซึ่งมีเลิกทำ 10 วินาที **(ควรยืนยันกับทีม Trade)** · ปุ่มรอง "บันทึกร่าง" (tooltip "สร้างเป็นร่าง ยังไม่แจ้งเตือนผู้รับผิดชอบ") · ปุ่มหลัก "สร้างและเริ่มดำเนินการ" หรือ "สร้าง {n} ข้อเสนอและเริ่มดำเนินการ" · ตอนส่ง ปุ่มแสดง loading และกันการกดซ้ำ |

**การส่งและผลลัพธ์**
- `batchId` (uuid v7) ถูกสร้างครั้งเดียวเมื่อเริ่ม wizard session เก็บใน store ของ wizard และส่งค่าเดิมทุกครั้งที่กดซ้ำหรือ retry · response `200` + `Idempotent-Replay: true` ถือว่าสำเร็จเหมือน `201` · `409 ID_CONFLICT` (แทบไม่เกิด) ให้สร้าง `batchId` ใหม่แล้วแจ้ง "ลองส่งอีกครั้ง"
- **สำเร็จ:** ล้างร่างในเครื่องและสร้าง `batchId` ใหม่สำหรับครั้งต่อไป · 1 ข้อเสนอ → `/proposals/:id?tab=tasks` พร้อม toast "สร้างข้อเสนอ PRP-2026-0043 แล้ว" (ถ้ามีการเลื่อนวัน หน้ารายละเอียดแสดง banner BR-12) · หลายข้อเสนอ → `/proposals?batchId={batchId}` พร้อม toast "สร้าง 3 ข้อเสนอเรียบร้อย"
- **ล้มเหลว (`422 BATCH_INVALID`, BR-21):** อยู่ที่ขั้น 6 แสดง alert บนสุด "ยังไม่ได้สร้างข้อเสนอใด เพราะ 1 รายการมีปัญหา แก้รายการที่ไฮไลต์แล้วลองใหม่" · การ์ดที่ผิดมีขอบแดงและข้อความจาก `errors[].path` · focus ย้ายไปการ์ดแรกที่ผิด · ส่ง `batchId` เดิมได้หลังแก้ เพราะ batch ที่ล้มเหลวถูก rollback

**ฝั่งออนไลน์:** ใช้ flow เดียวกันทั้งหมด ต่างที่ label, ข้อมูลหลักของช่องทาง ONLINE และช่อง `campaignName` · รายชื่อแพลตฟอร์มและประเภท Listing ที่ seed ใช้เฉพาะชุดที่ทีม Trade ยืนยันแล้ว **(ควรยืนยันกับทีม Trade, Q6–Q7)**

### 3.3 Validation matrix

| ขั้น | บังคับ | Block | Warning (ไปต่อได้) |
|---|---|---|---|
| 1 | `channel` | — | เปลี่ยนช่องทางหลังเลือกแล้วต้องยืนยัน |
| 2 | สินค้า 1–50 รายการ | เกิน 50 | สินค้าถูกปิดใช้งานระหว่างทำ ระบบนำออกและแจ้ง |
| 3 | ห้าง 1–20 ห้าง | เกิน 20 | ซ้ำระดับ 1 (ป้ายเหลือง) |
| 4 | `shelfTypeId` ทุกแถว | ซ้ำระดับ 2 ที่ยังไม่ยืนยันหรือไม่มีเหตุผล | — |
| 5 | `targetDate` ทุกแถว | รูปแบบวันที่ผิด | lead time ไม่พอ (เหลือง), วันในอดีต (แดง) |
| 6 | `title` ไม่ว่าง ≤ 200 ตัว, เจ้าของ | ผล validation จาก server | งานที่ถูกเลื่อนวัน |

### 3.4 Keyboard

| คีย์ | ผล |
|---|---|
| `Ctrl/⌘+Enter` | ถัดไป หรือสร้าง (ปุ่มหลักของขั้นนั้น) |
| `↑ ↓ ← →` / `Space` | เลื่อนและเลือกการ์ดใน radio group หรือ checkbox grid (roving focus) |
| `/` | focus ช่องค้นหาในขั้น 2–3 |
| `Enter` ในช่องค้นหา | เพิ่มสินค้าที่ตรงกับคำค้นพอดี |
| `Esc` | ปิด popover หรือ dialog |

เมื่อเปลี่ยนขั้น focus ย้ายไปที่หัวข้อของขั้นนั้น และประกาศผ่าน live region เช่น "ขั้นที่ 3 จาก 6 เลือกห้าง"

### 3.5 State และ autosave

- store ของ wizard (`features/wizard/wizard-state.ts` เดิม) persist ลง localStorage key `ft:wizard:v1:{userId}` ผ่าน `lib/safe-storage.ts` · เก็บ `{ batchId, channel, products: [{id, sku, name, imageUrl}], storeIds, perStore: { [storeId]: { shelfTypeId, targetDate, campaignName, duplicateAck, duplicateReason } }, review: {...}, updatedAt }`
- ร่างหมดอายุใน 7 วัน · การอ่าน/เขียน storage ห่อด้วย try/catch โหมด private ใช้งานได้ปกติแค่ไม่มี autosave
- เปิด `/proposals/new` แล้วพบร่างเก่า → dialog "มีข้อเสนอที่ทำค้างไว้ (Big C, Watsons · 3 สินค้า) ทำต่อหรือไม่?" [ทำต่อ] [เริ่มใหม่] · ทำต่อแล้วตรวจกับ server ว่าสินค้าและห้างยัง Active ถ้าไม่ นำออกพร้อมแจ้ง "นำออก 1 รายการที่ถูกปิดใช้งาน"
- Validation ใช้ zod schema รายขั้นที่สร้างจาก `createProposalsSchema` ใน `packages/shared` ชุดเดียวกับ API

---

## 4. รายละเอียดข้อเสนอและ Task tree (หน้าที่สำคัญที่สุด)

ดู wireframe 7.6 ประกอบ

### 4.1 Header

| ส่วน | รายละเอียด |
|---|---|
| Breadcrumb | ข้อเสนอสินค้า › PRP-2026-0042 (กดคัดลอกรหัสได้) |
| แถว 1 | โลโก้ห้าง 40px · `title` (H1 แก้ inline ได้ถ้า `can.edit`) · progress ring 64px มุมขวา แสดง % และ "4/16 งาน" (นับจาก leaf) ถ้ายังไม่มีงานแสดง "ยังไม่มีงาน" |
| แถว 2 | badge สถานะ · badge สุขภาพ (เฉพาะ `IN_PROGRESS`) · ช่องทาง · ShelfTypeBadge · `campaignName` (ออนไลน์) |
| แถว 3 | **วันวางขาย:** ถ้ายังไม่ยืนยัน "วางขาย 15 พ.ย. 2569 · อีก 45 วัน" (เลยวันแล้ว "เลยวันวางขาย 3 วัน" สีแดง) คลิกเพื่อเปลี่ยนวันเมื่อ `can.changeTargetDate` · ถ้ามี `actualLaunchDate` แสดง chip สีเขียว "วางขายจริง 14 พ.ย. 2569" แทนนับถอยหลัง · เจ้าของ (avatar + ชื่อเล่น) · สมาชิก (avatar stack สูงสุด 3 คน + "+N" ไปแท็บสมาชิก) · จำนวนสินค้า |
| ปุ่มสถานะ | แสดงเฉพาะ action ใน `can.transitions` (US-U14): DRAFT → [เริ่มดำเนินการ] · IN_PROGRESS → [พักไว้] [ปิดข้อเสนอ] (ปุ่มหลักเมื่อครบ 100% ถ้ายังไม่ครบและ `can.forceComplete = false` แสดง disabled พร้อม tooltip "ปิดข้อเสนอได้เมื่องานครบ 100% (เหลือ N งาน)") · [ยกเลิกข้อเสนอ] อยู่ในเมนู "…" · ON_HOLD → [ดำเนินการต่อ] · COMPLETED/CANCELLED → [เปิดใหม่] (`can.reopen`) |
| ปุ่ม "ยืนยันวางขายแล้ว" (US-U20) | แสดงเมื่อ `can.confirmLaunch` และ `actualLaunchDate` ว่าง · ตั้งแต่วันวางขายเป็นต้นไปเป็นปุ่มรองที่ header คู่กับ banner ข้อ 4 ก่อนหน้านั้นอยู่ในเมนู "…" (กรณีวางขายก่อนกำหนด) · เปิด dialog เลือกวัน (ค่าเริ่มต้นวันนี้ ห้ามเป็นวันในอนาคต) แล้ว `PATCH /proposals/:id { version, actualLaunchDate }` · แก้วันภายหลังได้ขณะข้อเสนอยังเปิดอยู่ |
| เมนู "…" | เปลี่ยนวันวางขาย (`can.changeTargetDate`) · เปลี่ยนรูปแบบชั้นวาง (`can.changeShelfType`) · ยืนยันวางขายแล้ว / แก้วันวางขายจริง (`can.confirmLaunch`) · ยกเลิกข้อเสนอ · ลบร่าง (`can.delete`) · คัดลอกลิงก์ |
| Sticky | เลื่อนลงแล้ว header ย่อเหลือ 56px แสดงโลโก้, ชื่อ, progress และปุ่มสถานะหลัก |

**Banner** (แสดงใต้ header ครั้งละ 1 อันตามลำดับความสำคัญ)
1. COMPLETED/CANCELLED: "ข้อเสนอนี้ปิดแล้ว (อ่านอย่างเดียว) ยังคอมเมนต์และแนบไฟล์ได้"
2. BR-09: "เริ่มดำเนินการไม่ได้: Watsons ถูกปิดใช้งาน" พร้อมปุ่มแก้ไข
3. ON_HOLD (สี hold): "พักไว้ตั้งแต่ 3 ต.ค. · เหตุผล: รอ buyer ยืนยันงบ" [ดำเนินการต่อ]
4. ถึงหรือเลยวันวางขายแล้วแต่ยังไม่มี `actualLaunchDate` (US-U20): วันวางขายพอดีใช้สี info "ถึงวันวางขายแล้ว ยืนยันวางขายจริงหรือยัง?" · เลยวันแล้วใช้สี danger (health `LATE`) "เลยวันวางขายมา 3 วัน ยืนยันวางขายจริงหรือยัง?" · ปุ่ม [ยืนยันวางขายแล้ว] [เปลี่ยนวันวางขาย]
5. Progress 100% (สีเขียว): "งานครบทุกข้อแล้ว ปิดข้อเสนอนี้เลยไหม?" [ปิดข้อเสนอ]
6. DRAFT: "ร่าง: ยังไม่แจ้งเตือนผู้รับผิดชอบ กด 'เริ่มดำเนินการ' เมื่อพร้อม"
7. BR-12 (ปิดได้): "มี 6 งานถูกปรับวันเพราะเวลาไม่พอตามแม่แบบ" [ดูงานที่ถูกปรับ]

**แท็บ:** **งาน** (ค่าเริ่มต้น) · สินค้า (n) · สมาชิก (n) · ไฟล์และความคิดเห็น (n) · ประวัติ

### 4.2 Task tree: โครงสร้าง

**Toolbar**
- ตัวกรองด่วนแบบ segmented พร้อมจำนวน: [ทั้งหมด] [ของฉัน] [ยังไม่เสร็จ] [เกินกำหนด]
- toggle "ซ่อนงานที่เสร็จแล้ว" (จำค่าต่อผู้ใช้)
- [ขยายทั้งหมด] [ยุบทั้งหมด] · [+ เพิ่มงาน]
- ปุ่มมุมมอง Timeline ซ่อนไว้จนถึง Phase 2

**คอลัมน์ (ปรับตามความกว้างของ container ไม่ใช่ viewport)**

| ความกว้างของ container | คอลัมน์ |
|---|---|
| ≥1100px | ☐ · ชื่องาน · ผู้รับผิดชอบ · ช่วงวันที่ · ระยะเวลา · กำหนดส่ง/สถานะ · ความคืบหน้า · ⋯ |
| 800–1099px (เช่นตอน drawer เปิดบนจอ 1440px) | ☐ · ชื่องาน (+ "3/4") · ผู้รับผิดชอบ · ช่วงวันที่และระยะเวลาใน chip เดียว "2–9 ต.ค. · 8 วัน" · กำหนดส่ง/สถานะ · ⋯ |
| 600–799px | ☐ · ชื่องาน (+ "3/4") · ผู้รับผิดชอบ · กำหนดส่ง/สถานะ (ตามแผนแสดงวันที่ ถ้าไม่ แสดงป้าย due state) |
| <600px | การ์ด 2 บรรทัด (ดู 7.9) |

**ส่วนประกอบของแถว (desktop)**

```
[☐] [indent 24px × (level−1)] [▸/▾] ชื่องาน  [กำลังทำ] [⚑สูง] [⚠ นอกช่วงงานแม่] [⚠ งานย่อยเกิน 1] [💬2] [📎1]  3/4
    ... ผู้รับผิดชอบ (ต)(บ) │ 21–28 ก.ย. │ 8 วัน │ ! เกินกำหนด 3 วัน │ ▬▬▬▭ 75% │ ⋯
```
(ไอคอนในแผนภาพเป็นสัญลักษณ์แทนไอคอน lucide ใน UI จริง)

- **ระดับ 1 "งาน":** ตัวหนา 600, พื้น `surface-muted`, สูง 44px, ช่องว่าง 8px ระหว่างกลุ่ม
- **ระดับ 2 "งานย่อย":** สูง 40px
- **ระดับ 3 "รายการย่อย":** สูง 36px และมีเส้นนำสายตาแนวตั้ง 1px สี `border`
- **ความคืบหน้าของงานแม่:** "x/y" ต่อท้ายชื่อเสมอ ส่วน progress bar เล็กแสดงเฉพาะโหมดกว้าง · งาน leaf ไม่มี progress bar
- **งานที่เสร็จ:** ขีดฆ่า, ตัวอักษร `fg-muted`, ช่องกำหนดส่งเป็น "เสร็จ 22 ก.ย. · ต้น" (US-U09 AC3)
- **ยังไม่มีผู้รับผิดชอบ:** วงกลมเส้นประ + "ยังไม่มีผู้รับผิดชอบ" (โหมดแคบเป็น tooltip)
- **Hover หรือ focus:** ปุ่ม "+" (เพิ่มงานลูก เฉพาะระดับ 1–2 และ `can.addChild`), ปุ่มดินสอ และ ⋯ · บนจอสัมผัสปุ่ม ⋯ แสดงตลอด · grip สำหรับลากมาใน Phase 2

### 4.3 Interactions

| การกระทำ | พฤติกรรม |
|---|---|
| **ยุบ/ขยาย** | คลิก ▸/▾ หรือ `→`/`←` · ค่าเริ่มต้นแสดงถึงระดับ 2 แต่ขยายอัตโนมัติถ้ามีรายการย่อยที่เกินกำหนดหรือเป็นของฉัน · จำสถานะการยุบต่อข้อเสนอ (`ft:tree:{proposalId}`) · งานแม่ที่เพิ่งได้งานลูกใหม่ขยายเอง |
| **เพิ่มเร็ว (inline add)** | ท้ายรายการมีแถว "+ เพิ่มงาน" ใต้งานแม่ที่ขยายอยู่มี "+ เพิ่มงานย่อย" / "+ เพิ่มรายการย่อย" · คลิกแล้วได้ input แถวใหม่: `Enter` บันทึกแล้วได้ input ระดับเดียวกันต่อทันที · `Tab` ทำให้แถวที่พิมพ์เป็นลูกของแถวก่อนหน้า (ถ้าลึกไม่เกิน 3) · `Shift+Tab` เลื่อนขึ้น 1 ระดับ · `Esc` ยกเลิก (ถ้าว่าง) · คลิกออกนอกช่องแล้วมีข้อความ = บันทึก · แถวใหม่ขึ้นทันทีด้วย temp id แล้วแทนด้วย id จริงจาก response ถ้าบันทึกไม่สำเร็จ แถวเป็นสีแดงพร้อม "ลองใหม่" |
| **ค่าเริ่มต้นของงานลูกใหม่** | `dueDate` เท่างานแม่, `startDate` ว่าง, ผู้รับผิดชอบหลักเท่างานแม่ (ถ้ายัง Active), `priority = MEDIUM` (5.3/5.4) แสดงในแถวทันที |
| **แก้ชื่อ inline** | คลิกที่ตัวข้อความชื่อหรือกด `F2` → `Enter` บันทึก, `Esc` ยกเลิก · ลบจนว่างระบบคืนค่าเดิมและแจ้ง "ชื่องานต้องไม่ว่าง" · ≤ 200 ตัว · ระหว่างแก้ชื่อ `Tab`/`Shift+Tab` = indent/outdent ผ่าน `PATCH /tasks/:id/move` |
| **เปิด drawer** | คลิกพื้นที่อื่นของแถวที่ไม่ใช่ control, คลิกปุ่ม ›, หรือ `Enter` · URL เปลี่ยนเป็น `?task=` · แถวที่เปิดอยู่ highlight ด้วย `primary-subtle` · ตำแหน่ง scroll ของ tree ไม่เปลี่ยน |
| **Checkbox** | ขนาดที่เห็น 20px พื้นที่กด 32px (44px บนจอสัมผัส) · ไม่มีสถานะ indeterminate บนงานแม่ (ใช้ "x/y" แทน) · `can.setStatus = false` → disabled พร้อม tooltip · กติกา cascade ในข้อ 4.6 |
| **สถานะ "กำลังทำ" (C2)** | ตั้งได้เฉพาะงาน leaf ผ่าน segmented ใน drawer หรือเมนู ⋯ · แถวแสดง chip "กำลังทำ" สี info · งานแม่แสดงสถานะที่คำนวณได้และแก้ไม่ได้ |
| **Date chip** | "2–9 ต.ค." (เดือนเดียวกัน), "28 ก.ย. – 5 ต.ค." (ข้ามเดือน), "– 9 ต.ค." (มีแค่วันครบกำหนด), "+ วันที่" (ยังไม่กำหนด) · แสดงปีเฉพาะเมื่อไม่ใช่ปีปัจจุบัน · คลิกเปิด popover 2 แท็บ: **ช่วงวันที่** (ปฏิทินช่วง 2 เดือน แรเงาช่วงของงานแม่) และ **วันเริ่ม + จำนวนวัน** (คำนวณ `dueDate` และแสดง "ครบกำหนด 9 ต.ค.") · ปุ่มลัด: วันนี้ · พรุ่งนี้ · ศุกร์นี้ · +7 วัน · เท่ากับงานแม่ · ล้าง · `startDate > dueDate` บันทึกไม่ได้ "วันเริ่มต้องไม่หลังวันครบกำหนด" · นอกช่วงงานแม่ (warning `OUTSIDE_PARENT_RANGE`) แถวมีไอคอน ⚠ เปิด popover "อยู่นอกช่วงของงานแม่ (21–28 ก.ย.)" [ขยายช่วงงานแม่ให้ครอบคลุม] ซึ่ง PATCH งานแม่ด้วย `suggestedParentRange` |
| **ผู้รับผิดชอบ** | Popover + Command (`GET /lookups/users?proposalId=`): ค้นจาก `fullName`/`nickname` แบบ substring · 2 กลุ่ม "สมาชิกข้อเสนอ" และ "ผู้ใช้อื่นในระบบ" (หมายเหตุ "จะถูกเพิ่มเป็นผู้ติดตามข้อเสนออัตโนมัติ") · แต่ละรายการ: avatar · ชื่อเล่น · ชื่อ-นามสกุล · ตำแหน่ง · เลือกได้หลายคน คนแรกได้ badge "หลัก" และมีเมนู "ตั้งเป็นหลัก" · บนสุดมี "มอบหมายให้ฉัน" · เฉพาะผู้ใช้ Active · ส่งทั้งชุดด้วย `PUT /tasks/:id/assignees` · ในแถวแสดง avatar สูงสุด 3 คน (คนหลักหน้าสุด มีวงแหวน primary 2px) ต่อด้วย "+N" |
| **Priority** | แก้ใน drawer หรือเมนู ⋯ · แถวแสดงเฉพาะธง "สูง" |
| **ย้ายงาน (MVP ไม่มีการลาก)** | เมนู ⋯ → "ย้ายขึ้น" / "ย้ายลง" (สลับกับพี่น้องด้วย `afterId`/`beforeId`) · "ย้ายไปไว้ใต้…" เปิด dialog เลือกงานแม่ (prototype มี `move-dialog.tsx`) งานที่ไปไม่ได้เพราะลึกเกิน 3 ระดับ (นับลูกหลานที่ลบไปแล้วด้วย) เป็น disabled · Tab/Shift+Tab ขณะแก้ชื่อ · `422 TASK_DEPTH_EXCEEDED` → toast "รายการย่อยเป็นระดับสุดท้าย" · `409 POSITION_STALE` → refetch แล้วลองใหม่ให้อัตโนมัติ 1 ครั้ง |
| **ลากวาง [P2]** | ลากด้วย grip เฉพาะระหว่างพี่น้องที่มีงานแม่เดียวกัน · ปิดเมื่อมีตัวกรอง (tooltip "ล้างตัวกรองก่อนจึงลากเรียงลำดับได้") และปิดบนจอสัมผัส · ใช้ `@dnd-kit` ที่มีใน prototype อยู่แล้ว |
| **เมนู ⋯ (และคลิกขวา)** | เปิดรายละเอียด · เพิ่มงานย่อย/รายการย่อย · ตั้งเป็นกำลังทำ / ยังไม่เริ่ม · มอบหมายให้ฉัน · ย้ายขึ้น / ย้ายลง · ย้ายไปไว้ใต้… · คัดลอกลิงก์งาน · **ลบ** (สีแดง) · ทุกข้อแสดงคีย์ลัดกำกับ (ถ้ามี) · รายการที่ทำไม่ได้ตาม `can` เป็น disabled พร้อมเหตุผล เช่น "ลบไม่ได้ เพราะมีรายการของคนอื่นอยู่ข้างใน" |
| **ลบ (BR-06)** | งาน leaf ที่ไม่มีความคิดเห็นและไฟล์ → ลบทันทีพร้อม toast "ลบแล้ว" [เลิกทำ] 10 วินาที · มีงานลูก ความคิดเห็น หรือไฟล์ → dialog "ลบ 'กรอก Listing form' และรายการย่อย 2 รายการ (เสร็จแล้ว 1)?" [ลบ 3 รายการ] แล้ว toast เลิกทำ · เลิกทำ = `POST /tasks/:id/restore { deletedAt }` |
| **Bulk [P2]** | `Ctrl/⌘+คลิก` หรือ `Shift+คลิก` เลือกหลายแถว (**ไม่ใช้ checkbox เสร็จเป็น checkbox เลือก**) แล้วแถบ action ลอยด้านล่าง: มอบหมาย · เลื่อนวัน ±N · ลบ |

ไม่มีเมนู "ทำสำเนางาน" ใน Phase 1

### 4.4 Task drawer

- **ตำแหน่ง:** ≥1280px วางติดขวาแบบ non-modal กว้าง 480px ปรับได้ 400–640px และจำค่าไว้ · เมื่อ drawer เปิด sidebar ยุบเป็น icon rail อัตโนมัติถ้าจอแคบกว่า 1536px · 1024–1279px ลอยทับจากขวาโดยไม่มี scrim คลิกนอก drawer เพื่อปิด · <1024px เป็น sheet เต็มจอพร้อมปุ่ม ‹ กลับ
- **หัว drawer:** ระดับของงาน ("งานย่อย") · ‹ › งานก่อนหน้า/ถัดไป · ⋯ · ปิด (`Esc`) · ใต้หัวมี path ของงานแม่ที่คลิกได้
- **เนื้อหา**
  1. **ชื่องาน:** textarea ที่ขยายความสูงตามข้อความ
  2. **สถานะ:** งาน leaf ใช้ segmented [ยังไม่เริ่ม | กำลังทำ | เสร็จแล้ว] · งานแม่อ่านอย่างเดียว "กำลังทำ (จากรายการย่อย 1/2)"
  3. **ฟิลด์:** ผู้รับผิดชอบ · ช่วงวันที่ + ระยะเวลา + ป้าย due state · ความสำคัญ · สร้างโดย/เมื่อ · เสร็จโดย/เมื่อ
  4. **รายละเอียด:** plain text ที่แปลง URL เป็นลิงก์ให้
  5. **งานลูก:** tree ย่อ ติ๊กได้ และมีช่อง "+ เพิ่มรายการย่อย"
  6. **แท็บ:** ความคิดเห็น (n) / ไฟล์ (n) / ประวัติ
- **บันทึกอัตโนมัติ:** ทุกฟิลด์บันทึกเมื่อออกจากช่องหรือเมื่อเลือกค่า (`PATCH /tasks/:id` พร้อม `version`) ไม่มีปุ่มบันทึก แสดง "บันทึกแล้ว" จางๆ ที่หัว drawer · `409 VERSION_CONFLICT` → banner ใน drawer "งานนี้ถูกแก้ไขโดย {conflict.lastModifiedBy.nickname} เมื่อสักครู่" [โหลดข้อมูลล่าสุด] และค่าที่ผู้ใช้พิมพ์ค้างไว้ยังอยู่ให้คัดลอก (BR-13)
- **ความคิดเห็น:** plain text ≤ 5,000 ตัว ส่งด้วย `Ctrl/⌘+Enter` · ลบของตัวเองได้ (แสดง "ข้อความถูกลบ") · @mention และแก้ไขคอมเมนต์ "(แก้ไขแล้ว)" เป็น **[P2]**
- **ไฟล์:** ลากไฟล์มาวาง, เลือกไฟล์, หรือ "แนบลิงก์" (ต้องเป็น https และมีชื่อแสดงผล) · มือถือมีปุ่ม **"ถ่ายรูปหน้าร้าน"** (`accept="image/*" capture="environment"`) · ตรวจขนาดและชนิดฝั่ง client ก่อนส่ง (≤ `settings.maxUploadMb` และชนิดตาม `settings.allowedUploadTypes` จาก `MeDto`)

### 4.5 ตัวกรองใน tree

- **ของฉัน** = งานที่ฉันอยู่ใน `assignees` · **ยังไม่เสร็จ** = `status ≠ DONE` · **เกินกำหนด** = `dueState = OVERDUE` (ทุกระดับ)
- งานที่ไม่ตรงตัวกรองแต่เป็นบรรพบุรุษของงานที่ตรง แสดงแบบจางเพื่อให้เห็นบริบท
- ขณะกรอง แสดงแถบ "กำลังกรอง: ของฉัน · แสดง 9 จาก 23 งาน" [ล้างตัวกรอง]
- ทำฝั่ง client บน flat list ที่โหลดแล้ว · ค่าอยู่ใน URL (`taskFilter`, `hideDone`)

### 4.6 การสื่อสารเมื่อสถานะ cascade

| สถานการณ์ | กติกา | สิ่งที่ผู้ใช้เห็น |
|---|---|---|
| ติ๊กงาน leaf | C1, C13 | ติ๊กทันที ขีดฆ่า "x/y" และ progress ring อัปเดต **ไม่แสดง toast** (เอาติ๊กออกเองได้) ยกเว้นเปิด "ซ่อนงานที่เสร็จแล้ว" อยู่ แถวจะหายไป จึงแสดง toast [เลิกทำ] 10 วินาที ซึ่งส่งสถานะเดิมของ leaf กลับไปแบบระบุชัด |
| ติ๊กงานลูกตัวสุดท้าย งานแม่เสร็จตาม (ไล่ขึ้นได้หลายระดับ) | C3/C4 | แถวงานแม่ highlight เขียว 600ms และ toast ข้อมูล "งาน 'เตรียมเอกสารนำเสนอ' เสร็จครบแล้ว" (ไม่มีปุ่มเลิกทำ ถ้าติ๊กผิดให้เอาติ๊กออกจาก leaf นั้น งานแม่จะกลับเป็นกำลังทำตาม C6) |
| ติ๊กงานแม่ที่ยังมีงานลูกค้าง | C5 | เว็บรู้จาก tree ว่ามีงานค้าง จึงเปิด AlertDialog ก่อนส่ง: "มีงานย่อยที่ยังไม่เสร็จ 3 รายการ ทำเครื่องหมายเสร็จทั้งหมด? ระบบจะแจ้ง บี และ วรรณ" [เสร็จทั้งหมด 4 รายการ] [ยกเลิก] · ยืนยันแล้วส่ง `cascade: true` และแสดง toast "ทำเครื่องหมายเสร็จ 4 รายการ" **ไม่มีปุ่มเลิกทำ** · ถ้า server ตอบ `409 CONFIRMATION_REQUIRED` (มีคนเพิ่มงานลูกระหว่างนั้น) เปิด dialog ใหม่ด้วยตัวเลขจาก server |
| เอาติ๊กออกจากงานลูกของงานแม่ที่เสร็จแล้ว | C6 | งานแม่กลับเป็น "กำลังทำ" และ toast ข้อมูล "งานแม่ 'X' กลับเป็นกำลังทำ" |
| เอาติ๊กออกจากงานแม่ที่เสร็จแล้ว | C7 | Dialog: "เปิดงานนี้และงานย่อยทั้งหมด 5 รายการใหม่? ประวัติการเสร็จเดิมยังเก็บไว้" · ยืนยันแล้วส่ง `{ status: 'TODO', cascade: true }` **ไม่มีปุ่มเลิกทำ** |
| เพิ่มงานลูกใต้งานแม่ที่เสร็จแล้ว | C8 | งานแม่เป็น "กำลังทำ" และ toast ข้อมูล "งานแม่ถูกเปิดใหม่อัตโนมัติ" (warning `PARENT_REOPENED`) |
| ลบงานลูกที่ค้างอยู่ตัวสุดท้าย | C9 | รวมไว้ใน toast การลบ: "ลบแล้ว · งานแม่ 'X' เสร็จครบแล้ว" [เลิกทำ] |
| Progress ถึง 100% | C11 | ring เปลี่ยนเป็นสีเขียว · banner ชวนปิดข้อเสนอ · ประกาศผ่าน live region |
| Server ปฏิเสธ (409/403/422/5xx) | C12 | คืนสถานะเดิม แถวสั่นเบาๆ (ถ้าไม่ได้ตั้ง reduced motion) และ toast error พร้อม [ลองใหม่] |

**ทำไม MVP ไม่มีเลิกทำของ cascade:** การย้อนต้องคืนสถานะเดิมของทุกงานรวม `completedAt` เดิม และระบบส่ง `TASK_COMPLETED` ให้ผู้รับผิดชอบไปแล้ว dialog ที่บอกจำนวนจึงทำหน้าที่ยืนยันแทน · Phase 2 อาจเพิ่ม endpoint คืนสถานะพร้อมหน่วงการแจ้งเตือน 15 วินาที ([04-api.md](04-api.md) §5.2)

### 4.7 Dialog เปลี่ยนสถานะข้อเสนอ

| การกระทำ | เนื้อหาใน dialog | ต้องกรอก |
|---|---|---|
| เริ่มดำเนินการ | "จะแจ้งผู้รับผิดชอบ N คน" · ถ้ายังไม่มีงานเลยขึ้นข้อความเตือนเพิ่ม (`confirmEmpty`) | — |
| พักไว้ | "ระหว่างพัก ระบบจะไม่นับงานเกินกำหนดและไม่ส่งการแจ้งเตือน" | `statusReason` |
| ดำเนินการต่อ | ถ้าวันวางขายผ่านไปแล้ว มีส่วน "เลื่อนวันวางขาย?" ฝังอยู่ (BR-03) | — |
| ยืนยันวางขายแล้ว | "สินค้าขึ้นชั้นหรือ Go-live แล้วเมื่อวันที่" [วันที่ ค่าเริ่มต้นวันนี้] · "ใช้คำนวณสถานะล่าช้าและอัตราวางขายตรงเวลา" | `actualLaunchDate` (≤ วันนี้) |
| ปิดข้อเสนอ | **วันวางขายจริง** (ค่าเริ่มต้น `actualLaunchDate ?? วันนี้`) · ตารางผลรายสินค้า: สินค้า `PENDING` ตั้งค่าเริ่มต้นเป็น "ผ่าน" แก้ได้รายแถวและใส่หมายเหตุได้ · ถ้ายังไม่ครบ 100% (เฉพาะ `can.forceComplete`) กล่องเตือน "งานยังไม่ครบ (75%)" | `actualLaunchDate` · เหตุผล (กรณี force complete) |
| ยกเลิกข้อเสนอ | radio `CancelReason` 4 ค่า · เลือก `BUYER_REJECTED` แสดง "สินค้าที่รอผล 3 รายการจะถูกตั้งเป็น ไม่ผ่าน" · ปุ่มปิด dialog ใช้คำว่า **"กลับ"** ไม่ใช่ "ยกเลิก" | `cancelReason` และ `statusReason` ถ้าเลือก OTHER |
| เปิดใหม่ | "งานและผลรายสินค้าคงเดิม" · ถ้าเจ้าของเดิมถูกปิดบัญชี (`422 OWNER_INACTIVE`) แสดงช่องเลือกเจ้าของใหม่ (ผู้ใช้ Active) แล้วส่ง `newOwnerId` | `statusReason` |
| เปลี่ยนวันวางขาย | เรียก `dryRun` ก่อนเพื่อได้ตัวเลข: "จาก 15 พ.ย. 2569 เป็น 29 พ.ย. 2569 (+14 วัน)" ☑ "เลื่อนงานที่ยังไม่เสร็จ 12 งานไป +14 วันด้วย" (ติ๊กไว้เป็นค่าเริ่มต้น ไม่รวมงาน DONE 4 งาน) | เหตุผล ถ้าข้อเสนอเป็น `IN_PROGRESS` |
| เปลี่ยนรูปแบบชั้นวาง | "งานเดิมไม่เปลี่ยน" · หลังบันทึก ถ้าได้ warning `TEMPLATE_AVAILABLE` แสดง ☐ "เพิ่มงานจากแม่แบบของรูปแบบใหม่ต่อท้าย" (`POST /proposals/:id/apply-template`, BR-07) | — |

### 4.8 คีย์ลัดของ task list

ผูกด้วย `event.code` จึงใช้ได้แม้แป้นพิมพ์เป็นภาษาไทย และทำงานเฉพาะเมื่อ focus อยู่ใน tree ไม่ได้อยู่ในช่องพิมพ์

| คีย์ | ผล | Phase |
|---|---|---|
| `↑` `↓` / `Home` `End` | แถวก่อนหน้า/ถัดไป / แถวแรก/แถวสุดท้าย | MVP |
| `→` `←` | ขยาย/ยุบ ถ้าขยายหรือยุบอยู่แล้ว ไปที่งานลูกตัวแรกหรืองานแม่ | MVP |
| `Space` | ติ๊กเสร็จ / เอาติ๊กออก | MVP |
| `Enter` | เปิด drawer | MVP |
| `F2` | แก้ชื่อ inline (ระหว่างแก้ `Tab`/`Shift+Tab` = indent/outdent) | MVP |
| `Delete` | ลบ (กติกา dialog/undo ใน 4.3) | MVP |
| `Esc` | ปิด drawer / ยกเลิกการแก้ไข | MVP |
| `N` / `Shift+N` | เพิ่มงานระดับเดียวกันถัดลงไป / เพิ่มงานลูก | P2 |
| `Alt+Shift+→` / `Alt+Shift+←` | Indent / Outdent ของแถวที่ focus อยู่ | P2 |
| `Ctrl/⌘+Shift+↑/↓` | ย้ายขึ้น/ลงในกลุ่มพี่น้อง | P2 |
| `A` / `D` | ตัวเลือกผู้รับผิดชอบ / ตัวเลือกวันที่ | P2 |
| `Ctrl/⌘+Z` | เลิกทำการกระทำล่าสุด (ระหว่างที่ toast ยังแสดง) | P2 |
| `J` / `K` | งานถัดไป/ก่อนหน้าใน drawer | P2 |
| `?` | หน้ารวมคีย์ลัด | P2 |

**กติกา Tab:** `Tab`/`Shift+Tab` indent/outdent **เฉพาะในโหมดพิมพ์หรือแก้ชื่อ** ซึ่งตรงกับ flow เพิ่มงานเร็วใน spec 5.8/5.9 · ในโหมดเลื่อนแถว `Tab` พา focus ออกจาก tree ตามปกติ ไม่เป็น keyboard trap (WCAG 2.1.2)

### 4.9 Concurrency, performance, a11y

- tree refetch เมื่อกลับมาที่หน้าต่าง และทุก 30 วินาทีเมื่อแท็บถูกเปิดดู (`refetchIntervalInBackground: false`) · แถวที่คนอื่นแก้ highlight สั้นๆ · ถ้าแถวนั้นกำลังถูกแก้อยู่ ไม่ทับค่าที่ผู้ใช้พิมพ์ แต่แสดง conflict banner
- ข้อเสนอที่มีงานเกิน 150 แถวใช้ virtualization (`@tanstack/react-virtual`) กับรายการที่ flatten แล้วเฉพาะแถวที่มองเห็น · เป้าหมาย 500 งานแสดงผลภายใน 1 วินาที
- แถวเป็น `React.memo` ตัดสินด้วย `id + version + status + updatedAt` และ subscribe ผ่าน `select` ของ Query
- โครงสร้าง treegrid และ live region ตามข้อ 1.5

### 4.10 แท็บอื่นในหน้ารายละเอียด

- **สินค้า**
  - ตาราง: รูป · SKU · ชื่อ · ขนาด · **ผลพิจารณา** (segmented รอผล/ผ่าน/ไม่ผ่าน แก้ได้เมื่อ `can.edit`) · หมายเหตุ · ⋯
  - "+ เพิ่มสินค้า" ใช้ตัวเลือกสินค้าแบบเดียวกับ wizard ขั้น 2
  - ถอดสินค้ารายการสุดท้ายไม่ได้ ปุ่มถอดเป็น disabled พร้อม tooltip (BR-05)
  - เมื่อกดถอดสินค้า แสดงคำแนะนำ "ถ้า buyer ไม่รับ แนะนำตั้งเป็น 'ไม่ผ่าน' แทนการถอด เพื่อให้สถิติถูกต้อง"
- **สมาชิก**
  - การ์ดเจ้าของพร้อมปุ่ม [โอนเจ้าของ] (`can.transferOwner`, BR-16)
  - รายชื่อสมาชิกพร้อม select สิทธิ์ ผู้ร่วมแก้ไข/ผู้ติดตาม · สมาชิกที่ `addedById = null` มีป้าย "เพิ่มอัตโนมัติจากการมอบหมายงาน"
  - ถอดสมาชิกที่ยังรับผิดชอบงานไม่ได้ ปุ่มเป็น disabled และแสดง "ยังรับผิดชอบ 3 งาน โปรดโอนงานก่อน"
- **ไฟล์และความคิดเห็น**
  - thread ความคิดเห็นระดับข้อเสนอ
  - ไฟล์จากทั้งข้อเสนอและจากงานรวมไว้ที่เดียว กรองได้ ทั้งหมด / เฉพาะข้อเสนอ / จากงาน
- **ประวัติ**
  - feed จาก `GET /proposals/:id/activity` คั่นด้วยวันที่ ใช้ข้อความ `summary` จาก server
  - กรองตามประเภทการกระทำและตามคน · ขยายรายการเพื่อดูตาราง from → to

### 4.11 Timeline / Gantt [P2]

- ซ้ายเป็น tree ชุดเดียวกัน ขวาเป็นแถบงานตามช่วงวัน มีเส้นแนวตั้ง "วันนี้" และ "วันวางขาย"
- ลากปลายแถบเพื่อเปลี่ยนวัน และลากทั้งแถบเพื่อเลื่อนช่วง · แถบใช้สีตาม due state และแรเงาช่วงของงานแม่
- ใช้ query และ mutation ชุดเดียวกับมุมมองรายการ จึงไม่ต้องรื้อโค้ด

---

## 5. Admin Monitor: Dashboard (`/admin`)

**ตัวกรองร่วม** (เก็บใน URL): ช่องทาง · ห้าง · รูปแบบชั้นวาง · เจ้าของ · และช่วงเวลา (เดือนนี้ / ไตรมาสนี้ / ปีนี้ / กำหนดเอง) ซึ่งมีผลกับ W2 · มุมขวามี "อัปเดต 10:35 (ทุก 5 นาที)" และปุ่มรีเฟรช · [ส่งออก Excel] **[P2]**

**Layout MVP** (grid 12 คอลัมน์ ดู wireframe 7.7)

| แถว | Widget | การแสดงผล | Drill-down |
|---|---|---|---|
| 1 | **W1 การ์ด KPI K1–K5** (`GET /dashboard/summary`) | ตัวเลขใหญ่ 30px + label + บรรทัดรอง (K1 แยกออฟ/ออน) · K3 เป็นการ์ดแบ่งครึ่ง เหลือง "เสี่ยง" กับแดง "ล่าช้า" | ใช้ `drilldown` ที่ API ส่งมา: K1 → `/proposals?status=IN_PROGRESS` · K2 → `/proposals?status=IN_PROGRESS&targetDateFrom=…&targetDateTo=…&sort=targetDate` · K3 → `/proposals?status=IN_PROGRESS&health=AT_RISK` หรือ `LATE` · K4 → `/admin/tasks?due=OVERDUE` · K5 → `/admin/tasks?unassigned=true` |
| 2 | **W4 ข้อเสนอเสี่ยง/ล่าช้า** (span 12, `GET /dashboard/at-risk`) | ตาราง: รหัส · ห้าง · รูปแบบ · วันวางขาย · เหลือกี่วัน · progress · เจ้าของ · จำนวนงานเกินกำหนด · เรียงล่าช้าก่อน แล้วตามวันที่เหลือน้อยไปมาก · 10 แถว | คลิกแถวไปที่ข้อเสนอ |
| 3 | **W5 ภาระงานรายบุคคล** (span 6, `GET /dashboard/workload`) | stacked bar แนวนอนต่อคน: เกินกำหนด (danger) / ครบกำหนดสัปดาห์นี้ (warning) / อื่นๆ (neutral) | คลิกชื่อ → `/admin/tasks?assigneeId=` · เมนู ⋯ "โอนงาน…" **[Should]** (US-M05) |
| 3 | **W2 สถานะตามห้าง** (span 6, `GET /dashboard/by-store`) | stacked bar แนวนอน 1 แท่งต่อห้าง แบ่งตาม `ProposalStatus` สีตาม status mapping | คลิก segment → `/proposals?storeId=&status=` |

**Phase 2** (วางตำแหน่งไว้ใต้แถว 3): **W3** ปฏิทินวันวางขาย 90 วัน (SVG แถวละห้าง จุดละข้อเสนอ ใช้ทั้งสีและ **รูปทรง** ตามสุขภาพ: วงกลม = ตามแผน, สามเหลี่ยม = เสี่ยง, สี่เหลี่ยม = ล่าช้า) · **W6** ผลลัพธ์ K6–K9 · **W7** กิจกรรมล่าสุด

**กติกากราฟ**
- Recharts ผ่าน shadcn `ChartContainer` · ข้อความในแกน tooltip และ legend เป็นภาษาไทย · ตัวเลขจัดรูปด้วย `Intl.NumberFormat('th-TH')`
- ทุกกราฟมีปุ่ม "ดูเป็นตาราง" สำหรับ screen reader และสำหรับคัดลอกตัวเลข
- ไม่ใช้ pie กับข้อมูลเกิน 5 หมวด และไม่ใช้กราฟ 3D
- **สีสถานะต้องตรงกับ badge ทุกจุดในแอป** "สีเหลือง = เสี่ยง" มีความหมายเดียวทั้งระบบ

**การโหลดข้อมูล:** แต่ละ widget มี query และ error boundary ของตัวเอง widget หนึ่งช้าหรือพัง widget อื่นยังแสดงได้ · skeleton ตามรูปทรง widget · `refetchInterval: 300_000` · เป้าหมายโหลดครบภายใน 2 วินาที

**Responsive:** <1024px การ์ด KPI เรียง 2 คอลัมน์ · <768px เรียง 1 คอลัมน์

---

## 6. หน้า Admin จัดการข้อมูลหลัก

### 6.1 Pattern ร่วม

| องค์ประกอบ | กติกา |
|---|---|
| Page header | ชื่อหน้า + คำอธิบาย 1 บรรทัด + ปุ่มหลัก "+ เพิ่ม…" |
| แท็บช่องทาง | Store และ ShelfType มีแท็บ "ออฟไลน์ (ห้างร้าน)" / "ออนไลน์ (แพลตฟอร์ม)" พร้อมจำนวน |
| ค้นหาและกรอง | ค้นแบบ substring · กรองสถานะ ใช้งาน / ปิดใช้งาน / ทั้งหมด (ค่าเริ่มต้น ใช้งาน) |
| สร้างและแก้ไข | **Sheet ด้านขวา** ไม่แยกหน้า · URL `?edit=<id>` หรือ `?edit=new` · ฟอร์มใช้ zod schema จาก shared · ส่ง `expectedUpdatedAt` ตอนแก้ · ปิด Sheet ขณะมีข้อมูลที่ยังไม่บันทึก ระบบจะถาม |
| ค่าซ้ำ | `409 NAME_TAKEN` → "มีห้างชื่อนี้ในช่องทางนี้แล้ว (ไม่สนตัวพิมพ์และช่องว่าง)" · `409 CODE_TAKEN` / `SKU_TAKEN` ที่มี `details.restorableId` → "รหัสนี้เคยใช้กับรายการที่ถูกลบไว้" [กู้คืนรายการเดิม] (ADMIN, `trash.restore`) |
| สวิตช์ "ใช้งาน" | เปิดใช้งานได้ทันทีแบบ optimistic · **ปิด** รายการที่ถูกใช้อยู่ต้องผ่าน dialog ที่บอกตัวเลข "ถูกใช้ใน 14 ข้อเสนอ (ยังดำเนินการ 3)" (BR-01) |
| ลบ | MANAGER ไม่เห็นปุ่มลบ · ADMIN เห็นเฉพาะรายการที่ `usage.proposalCount = 0` ถ้าถูกใช้แล้ว เมนูแสดง "ลบ" disabled พร้อม tooltip "ถูกใช้ใน N ข้อเสนอ จึงลบไม่ได้ ใช้การปิดใช้งานแทน" |
| เรียงลำดับ | Store และ ShelfType ใช้ปุ่ม "ย้ายขึ้น/ลง" ในเมนู แล้วส่งลำดับทั้งชุดด้วย `PUT /stores/order` · ลำดับนี้ = ลำดับใน wizard · ลากเพื่อเรียง **[P2]** |
| รายการที่ปิดใช้งาน | แยกเป็นกลุ่มท้ายรายการ ชื่อมีป้าย "(ปิดใช้งาน)" |

### 6.2 ห้าง / แพลตฟอร์ม (`/admin/stores`, wireframe 7.8)

- **แต่ละแถว:** โลโก้ · `name` · `nameTh` · `code` · `groupName` · จำนวนข้อเสนอที่ใช้ · สวิตช์ใช้งาน · ⋯
- **ฟอร์มใน Sheet**
  - `name`* และ `nameTh`
  - `code`: เสนอจาก name เป็น UPPER_SNAKE แก้ได้เฉพาะตอนสร้าง
  - `channel`: ล็อกเมื่อมีข้อเสนออ้างอิงแล้ว พร้อมเหตุผล
  - `groupName`: combobox เลือกจากค่าที่มีหรือพิมพ์ใหม่
  - โลโก้: ลากไฟล์มาวาง รับเฉพาะ jpg/png/webp (ไม่รับ SVG เพื่อกัน XSS) แนะนำรูปจัตุรัส ≥256px มี dialog crop
  - `colorHex`: palette + hex + คำเตือน contrast
  - `note` (เช่น ข้อมูล buyer) และ `isActive`
  - **ตัวอย่างการ์ด** ที่แสดงหน้าตาใน wizard แบบสด
- **คำขอเพิ่มห้างจาก USER:** การแจ้งเตือน `STORE_REQUEST` ลิงก์มาที่ `/admin/stores?edit=new&name=Tops` ซึ่งกรอกชื่อไว้ให้แล้ว

### 6.3 รูปแบบชั้นวาง / ประเภท Listing (`/admin/shelf-types`)

- ฟิลด์: `name`*, `nameTh`, `code`, `description` (แสดงตัวอย่าง radio card ตามที่จะเห็นใน wizard), `colorHex`, `isActive`
- แต่ละแถวบอกสถานะแม่แบบจาก `defaultTemplate`: "แม่แบบเริ่มต้น: Offline · Exclusive shelf" หรือ "ใช้แม่แบบทั่วไปของช่องทาง: Offline · มาตรฐาน (Normal shelf และรูปแบบอื่น)" หรือคำเตือน "ยังไม่มีแม่แบบ wizard จะเริ่มจากรายการว่าง" [สร้างแม่แบบ]

### 6.4 สินค้า (`/admin/products`)

- **DataTable** แบ่งหน้าฝั่ง server ทีละ 20/50 แถว: รูป · SKU · ชื่อ · แบรนด์ · หมวดหมู่ · ขนาดบรรจุ · บาร์โค้ด · สถานะ · ใช้ใน N ข้อเสนอ · แก้ไขล่าสุด
- **การตรวจ:** SKU ซ้ำตรวจตอนออกจากช่อง · บาร์โค้ดตรวจความยาว (8, 12, 13 หรือ 14 หลัก) และ check digit ของ GTIN แบบ inline (ชุดเดียวกับ server ใน shared)
- **นำเข้า [Should]:** dialog 2 ขั้นจากไฟล์แม่แบบตายตัว (ไม่มีการจับคู่คอลัมน์)
  1. [ดาวน์โหลดไฟล์แม่แบบ] (`GET /products/import-template`) แล้วอัปโหลด xlsx หรือ csv
  2. preview จาก `dryRun=true`: สรุป "สร้างใหม่ 120 · อัปเดต 14 · ผิด 3" และตารางแถวที่ผิดพร้อมเหตุผล (SKU ซ้ำในไฟล์, บาร์โค้ดผิด, SKU ที่ถูกลบไว้ต้องกู้คืนก่อน) → [นำเข้า 134 รายการ (ข้าม 3 แถวที่ผิด)] ส่ง `dryRun=false` · ดาวน์โหลดรายงานแถวที่ผิดได้
- เลือกหลายแถวแล้วปิดใช้งานพร้อมกันได้ **[P2]**

### 6.5 แม่แบบงาน (`/admin/templates`, `/admin/templates/:templateId`)

- **หน้ารายการ:** จัดกลุ่มตามช่องทาง แต่ละแม่แบบ: ชื่อ · ใช้กับรูปแบบ (หรือ "ทุกรูปแบบ") · ป้าย "ค่าเริ่มต้น" · จำนวนงาน · lead time "เริ่ม T−60" · สถานะ · แก้ไขล่าสุด
  - แม่แบบตั้งต้นจาก seed: `OFFLINE_NORMAL_BASIC` (21 รายการ ใช้กับทุกรูปแบบออฟไลน์) · `OFFLINE_EXCLUSIVE_BASIC` (27 รายการ) · `ONLINE_BASIC` (4 งาน) · แม่แบบละเอียดจาก domain doc เป็น Phase 2 **(ควรยืนยันกับทีม Trade)**
  - เมนู ⋯: แก้ไข · ทำสำเนา · ตั้งเป็นค่าเริ่มต้น · ปิดใช้งาน · ลบ (ADMIN)
  - ตั้งเป็นค่าเริ่มต้นต้องยืนยัน: "แทนที่ 'Offline · มาตรฐาน (Normal shelf และรูปแบบอื่น)' สำหรับ ออฟไลน์ · ทุกรูปแบบ" (BR-20)
  - ลบหรือปิดใช้งานแม่แบบที่เป็นค่าเริ่มต้น → toast จาก warning `DEFAULT_CLEARED`: "ปลดค่าเริ่มต้นแล้ว wizard จะใช้แม่แบบทั่วไปของช่องทางหรือรายการว่าง"
- **Editor** (prototype มี `template-editor.tsx`, `template-tree.tsx`, `template-gantt.tsx`): แบ่ง 2 ฝั่ง
  - **ซ้าย (tree editor):** ใช้ TaskTree ใน `mode="template"` ซึ่งมี inline add, Tab/Shift+Tab ขณะพิมพ์, เมนูย้าย และ 3 ระดับเหมือนกัน คอลัมน์: ชื่องาน · เริ่ม (T±) · ครบกำหนด (T±) · ระยะเวลา · ความสำคัญ · มอบหมายให้เจ้าของ (`assignToOwner`) · ⋯
  - **ช่องกรอก offset:** พิมพ์ได้ทั้ง "-60", "T-60" และ "D-60" แสดงเป็น "T−60" มี tooltip วันที่จริงตามวันวางขายตัวอย่าง · `dueOffsetDays < startOffsetDays` บันทึกไม่ได้ · งานลูกนอกช่วงงานแม่แสดงคำเตือน
  - เมนูของงานแม่มี "เลื่อนทั้งกลุ่ม ±N วัน"
  - **ขวา (preview):** เลือกวันวางขายตัวอย่าง (ค่าเริ่มต้นวันนี้ +90) แสดงวันที่จริงจาก `GET /task-templates/:id/preview` และ Gantt ย่อของงานระดับ 1 พร้อมสรุป "ต้องเริ่มก่อนวันวางขาย 60 วัน · 21 งาน · leaf 15"
  - **ส่วนหัว:** `name`, `description`, `channel`, `shelfTypeId` (หรือ "ทุกรูปแบบในช่องทาง"), `isDefault`, `isActive`
  - **การบันทึก:** ต่างจากหน้าอื่นตรงที่ใช้ปุ่ม **บันทึก** ชัดเจน (`PUT /task-templates/:id/items` พร้อม **`expectedUpdatedAt`**) · `409 VERSION_CONFLICT` → "แม่แบบนี้ถูกแก้ไขโดย {ชื่อ} ระหว่างที่คุณแก้" [โหลดฉบับล่าสุด] [คัดลอกการแก้ของฉัน] · ออกจากหน้าขณะยังไม่บันทึกถูกกันด้วย `useBlocker` ของ react-router · กล่องข้อมูล "การแก้ไขไม่กระทบข้อเสนอที่สร้างไปแล้ว" (BR-19)

### 6.6 ผู้ใช้และสิทธิ์ (`/admin/users`, ADMIN)

- **ตาราง:** avatar · ชื่อ-นามสกุล (ชื่อเล่น) · อีเมล · ตำแหน่ง · บทบาท · สถานะ (ใช้งาน / ปิดใช้งาน / **ล็อกอยู่ถึง 10:45**) · เข้าระบบล่าสุด (แบบสัมพัทธ์) · ⋯ · กรองตามบทบาทและสถานะ
- **เพิ่มผู้ใช้ (Sheet):** อีเมล*, ชื่อ-นามสกุล*, ชื่อเล่น, ตำแหน่ง, เบอร์โทร และบทบาท* (radio card ที่อธิบายสิ่งที่แต่ละบทบาททำได้โดยย่อ)
  - บันทึกแล้วเปิด dialog **"รหัสผ่านชั่วคราว"** แสดงครั้งเดียว ฟอนต์ mono พร้อม [คัดลอก] และข้อความ "ใช้ได้ภายใน 72 ชั่วโมง" (prototype มี `temp-password.tsx`)
  - ปิด dialog โดยยังไม่คัดลอก จะถามยืนยันอีกครั้ง
  - ส่งอีเมลเชิญ **[P2]**
- **เมนู ⋯**
  - **เปลี่ยนบทบาท:** ต้องยืนยัน · disabled กับตัวเองหรือกับ ADMIN คนสุดท้ายพร้อม tooltip (BR-18)
  - **รีเซ็ตรหัสผ่าน:** ยืนยันแล้วได้รหัสชั่วคราวใหม่ (72 ชม.) และ session เดิมทั้งหมดถูกยกเลิก
  - **ปลดล็อกบัญชี** (แสดงเมื่อถูกล็อก)
  - **ปิดบัญชี / เปิดบัญชีอีกครั้ง** (เปิดคืนมีตัวเลือก "ออกรหัสผ่านชั่วคราวใหม่")
  - ดู session ที่ใช้อยู่และ "บังคับออกจากระบบ" **[P2]**
- **ปิดบัญชี (BR-02):** dialog 3 ขั้นจาก `GET /users/:id/deactivation-plan`
  1. ข้อเสนอที่ผู้ใช้นี้เป็นเจ้าของและยังไม่ปิด: เลือกเจ้าของใหม่รายข้อเสนอ หรือ "โอนทั้งหมดให้…" (ตัวเลือกเฉพาะผู้ใช้ Active และไม่ใช่คนที่ถูกปิด)
  2. งานที่ยังไม่เสร็จ: โอนทั้งหมดให้คนเดียว หรือถอดออก (งานจะขึ้นป้าย "ยังไม่มีผู้รับผิดชอบ")
  3. สรุปพร้อมตัวเลข แล้วกด [ปิดบัญชี]
- **แผง "สิทธิ์ของแต่ละบทบาท":** แสดง matrix จาก `ROLE_PERMISSIONS` แบบอ่านอย่างเดียว พร้อม label ไทยของแต่ละ key (prototype มี `role-matrix.tsx` ให้เปลี่ยนไปใช้ key ชุดใหม่) · แก้ matrix เป็น Phase 3
- **คำแนะนำบนหน้า:** ถ้ามี ADMIN ที่ Active น้อยกว่า 2 คน แสดง banner "แนะนำให้มีผู้ดูแลระบบอย่างน้อย 2 คน เพื่อไม่ให้ระบบไม่มีผู้ดูแลเมื่อบัญชีใดถูกล็อก"

### 6.7 ประวัติการใช้งาน (`/admin/activity`, ADMIN) และตั้งค่าระบบ (`/admin/settings`, ADMIN [P2])

- **Activity** (`GET /activity-logs`)
  - ตัวกรอง: ผู้กระทำ, `AuditEntityType`, `ActivityAction`, ช่วงวัน
  - แต่ละรายการ: เวลา · ผู้กระทำ (null แสดงเป็น "ระบบ") · badge การกระทำ · `summary` · ลิงก์ไปยัง entity
  - ขยายแถวเพื่อดูตาราง field / from / to พร้อม IP และ user agent
  - โหลดเพิ่มแบบ cursor ผ่าน "โหลดเพิ่ม" · export **[P2]** · ไม่มีปุ่มแก้หรือลบใดๆ
- **Settings [P2]:** ฟอร์มค่า `dueSoonDays`, `atRiskDaysBeforeTarget`, `atRiskProgressThreshold`, `defaultDateEra`, `digestTime`, `maxUploadMb` ทุกช่องมีคำอธิบายผลกระทบ เช่น "ใช้ตัดสินว่างานไหน 'ใกล้ครบกำหนด'" · MVP ใช้ค่าจาก seed

---

## 7. ASCII wireframes (desktop)

**สัญลักษณ์:** `[ ]` checkbox · `(o)` radio ที่เลือก · `v` / `>` แถวที่ขยาย/ยุบ · `(ต)` avatar · `( ? )` ยังไม่มีผู้รับผิดชอบ · `!` คำเตือน · `(ปิด)` ปุ่ม disabled · `(ขีดฆ่า)` งานที่เสร็จ · `<` แถวที่เปิดใน drawer

### 7.1 Login

```
+--------------------------------------------+-----------------------------------------------------+
|  FlowTrade                                 |                                                     |
|                                            |   เข้าสู่ระบบ                                          |
|  วางแผนเสนอสินค้าเข้าห้าง                      |   ใช้บัญชีที่ผู้ดูแลระบบสร้างให้เท่านั้น                         |
|  ให้วางขายได้ตรงวันที่รับปาก                     |                                                     |
|                                            |   อีเมล                                              |
|  [ภาพประกอบ: ชั้นวางสินค้า + ปฏิทิน]             |   [ ton@company.co.th                         ]     |
|                                            |                                                     |
|  - เห็นงานทุกขั้นตอนในที่เดียว                    |   รหัสผ่าน                                            |
|  - รู้ทันทีว่างานไหนเกินกำหนด                    |   [ ************                    (แสดง)    ]     |
|  - หัวหน้าเห็นความเสี่ยงก่อนวันวางขาย             |   (!) แป้นพิมพ์เป็นภาษาไทยอยู่ สลับเป็น EN ก่อนพิมพ์           |
|                                            |                                                     |
|                                            |   [              เข้าสู่ระบบ               ]           |
|                                            |                                                     |
|                                            |   ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ                            |
|                                            |   ไม่มีการสมัครเอง บัญชีสร้างโดยผู้ดูแลระบบ                  |
+--------------------------------------------+-----------------------------------------------------+
```

### 7.2 หน้าแรก

```
+--------------------+-----------------------------------------------------------------------------+
| FlowTrade       [<]| หน้าแรก                                              [กระดิ่ง 3]   (ต)           |
+--------------------+-----------------------------------------------------------------------------+
| [+ สร้างข้อเสนอ]     | สวัสดี ต้น                                                                     |
|                    | วันพฤหัสบดีที่ 1 ต.ค. 2569 · วันนี้มีงานต้องทำ 3 งาน            [+ สร้างข้อเสนอ]        |
| > หน้าแรก           |                                                                             |
|   งานของฉัน     [2] | [!] ภาพรวมฝ่าย: เสี่ยง 4 · ล่าช้า 1 · งานเกินกำหนด 23   [ไปที่ Monitor >]           |
|   ข้อเสนอสินค้า       |     (แถบนี้แสดงเฉพาะ MANAGER / ADMIN)                                         |
|                    +--------------------------------------------+--------------------------------+
| ADMIN MONITOR      | งานของฉัน                    [ดูทั้งหมด >]     | วางขายเร็วๆ นี้ (30 วัน)           |
|   ภาพรวม           | [เกินกำหนด 2] [วันนี้ 3] [สัปดาห์นี้ 7]            |                                |
|   งานทั้งฝ่าย         |                                            | 08 ต.ค.  (BigC) Normal shelf   |
|   ห้าง/แพลตฟอร์ม     | [ ] กรอก New item / Listing form ของห้าง      |          อีก 7 วัน · [เสี่ยง]      |
|   รูปแบบชั้นวาง       |     Big C › เตรียมเอกสาร   ! เกิน 3 วัน       |                                |
|   สินค้า             | [ ] เตรียมเอกสารนำเสนอ (Listing kit)        | 15 ต.ค.  (WTS) Exclusive shelf |
|   แม่แบบงาน         |     Big C                  ! เกิน 1 วัน      |          อีก 14 วัน · [ตามแผน]   |
|   ผู้ใช้และสิทธิ์        |                                            |                                |
|   ประวัติการใช้งาน    |     ติ๊กงานแม่ที่ยังมีงานค้าง → dialog ยืนยัน     | 02 พ.ย.  (SHP) Campaign slot   |
|                    |     ติ๊ก leaf → แถวหาย + toast เลิกทำ           |          อีก 32 วัน · [ตามแผน]   |
|                    +-------------------------+-------------------------+-------------------------+
|                    | ข้อเสนอของฉัน (6)         |                         | [ดูทั้งหมด >]              |
|                    | (BigC) PRP-2026-0042    | (WTS) PRP-2026-0045     | (7-11) PRP-2026-0047    |
|                    | Big C · Normal shelf    | Watsons · Exclusive     | 7-Eleven · Normal       |
|                    | วางขาย 15 พ.ย. 2569     | วางขาย 15 ต.ค. 2569     | วางขาย 10 ม.ค. 2570     |
|                    | [#####-----------] 25%  | [##########------] 64%  | [##--------------] 8%   |
|                    | [เสี่ยง] อีก 45 วัน         | [ตามแผน] อีก 14 วัน       | [ร่าง]                   |
|                    +-----------------------------------------------------------------------------+
| (ต) ต้น · USER  [v] |                                                                             |
+--------------------+-----------------------------------------------------------------------------+
```

### 7.3 Wizard ขั้น 3: เลือกห้าง

```
+--------------------------------------------------------------------------------------------------+
| [x] ปิด     สร้างข้อเสนอสินค้า                                    บันทึกอัตโนมัติในเครื่องนี้แล้ว 10:42         |
+--------------------------------------------------------------------------------------------------+
|  (1) ช่องทาง -- (2) สินค้า -- [3] ห้าง -- (4) รูปแบบชั้นวาง -- (5) วันวางขาย -- (6) ตรวจสอบ              |
+-------------------------------------------------------------------+------------------------------+
| ขั้นที่ 3 จาก 6 · เลือกห้างที่จะเสนอ                                      | สรุปที่เลือก                     |
| เลือกได้หลายห้าง ระบบจะสร้าง 1 ข้อเสนอต่อ 1 ห้าง (สูงสุด 20)               |                              |
| [ค้นหาห้าง...                     ]               เลือกแล้ว 2 ห้าง     | ช่องทาง                       |
+----------------+----------------+----------------+----------------+                              |
| [x]    (logo)  | [x]    (logo)  | [ ]    (logo)  | [ ]    (logo)  |   ออฟไลน์ (ห้างร้าน)  [แก้]      |
|  Big C         |  Watsons       |  7-Eleven      |  Lotus's       |                              |
|  บิ๊กซี           |  วัตสัน          |  เซเว่น อีเลฟเว่น |  โลตัส          | สินค้า (3)                     |
| (!) มีข้อเสนอ    |                |                |                | เซรั่มวิตามินซี 30 ml             |
|     อยู่แล้ว 1    |                |                |                | โทนเนอร์ 150 ml               |
+----------------+----------------+----------------+----------------+                              |
| [ ]    (logo)  | [ ]    (logo)  |    +           |                | โฟมล้างหน้า 100 ml  [แก้]       |
|  CJ            |  Eve and Boy   | เพิ่มห้างใหม่      |                |                              |
|  ซีเจ           |  อีฟแอนด์บอย     | (ADMIN/MANAGER)|                | ห้าง (2)                      |
+-------------------------------------------------------------------+                              |
| ไม่พบห้างที่ต้องการ? แจ้งผู้ดูแล   <- USER เห็นลิงก์นี้แทนการ์ดเพิ่มห้าง            | Big C, Watsons               |
|                                                                   |                              |
| (!) Big C: มี PRP-2026-0031 · Normal shelf · แอน · กำลังดำเนินการ     |                              |
|     (ป้ายสีเหลือง ไปต่อได้ ตรวจซ้ำระดับ 2 ที่ขั้นถัดไป)                       |                              |
+--------------------------------------------------------------------------------------------------+
| [< ย้อนกลับ]                                                           [ถัดไป: รูปแบบชั้นวาง >]        |
+--------------------------------------------------------------------------------------------------+
```

### 7.4 Wizard ขั้น 4: รูปแบบชั้นวาง

```
+--------------------------------------------------------------------------------------------------+
|  (1) ช่องทาง -- (2) สินค้า -- (3) ห้าง -- [4] รูปแบบชั้นวาง -- (5) วันวางขาย -- (6) ตรวจสอบ              |
+-------------------------------------------------------------------+------------------------------+
| ขั้นที่ 4 จาก 6 · เลือกรูปแบบชั้นวาง                                      | สรุปที่เลือก                     |
| ค่าที่เลือกใช้กับทุกห้าง และกำหนดแยกรายห้างได้ด้านล่าง                        | ...                          |
+---------------------------------+---------------------------------+                              |
| (o) Normal shelf                | ( ) Exclusive shelf             | รูปแบบชั้นวาง                   |
|     ชั้นวางปกติ                    |     ชั้นวางเฉพาะแบรนด์             |   Big C: Normal shelf        |
|     ได้ช่องในชั้นปกติของหมวด         |     พื้นที่เฉพาะแบรนด์ เช่น           |   Watsons: Exclusive         |
|     สินค้าตาม planogram ห้าง       |     brand bay ต้องทำ fixture     |                              |
|     แม่แบบ 21 งาน · T-60         |     แม่แบบ 27 งาน · T-60         |                              |
+---------------------------------+---------------------------------+                              |
| ( ) End cap / หัวกอนโดลา         |                                 |                              |
|     หัวชั้นปลายทางเดิน              |                                 |                              |
|     (รูปแบบที่ Admin เพิ่มเอง)       |                                 |                              |
|     แม่แบบ 21 งาน · T-60 (ทั่วไป) |                                 |                              |
+-------------------------------------------------------------------+                              |
| [v] กำหนดแยกรายห้าง (2 ห้าง)                                        |                              |
|     Big C      [Normal shelf      v]                              |                              |
|     Watsons    [Exclusive shelf   v]   (!!) ซ้ำกับ PRP-2026-0038    |                              |
|                ห้าง + สินค้า + รูปแบบเดียวกัน (ฝน · กำลังดำเนินการ)       |                              |
|                [ ] ยืนยันว่าไม่ใช่ข้อเสนอซ้ำ   เหตุผล [              ]    |                              |
+--------------------------------------------------------------------------------------------------+
| [< ย้อนกลับ]                ถัดไปไม่ได้: ยืนยันข้อเสนอซ้ำของ Watsons ก่อน     [ถัดไป: วันวางขาย >] (ปิด)      |
+--------------------------------------------------------------------------------------------------+
```

### 7.5 Wizard ขั้น 5: วันวางขาย

```
+--------------------------------------------------------------------------------------------------+
|  (1) ช่องทาง -- (2) สินค้า -- (3) ห้าง -- (4) รูปแบบชั้นวาง -- [5] วันวางขาย -- (6) ตรวจสอบ              |
+-------------------------------------------------------------------+------------------------------+
| ขั้นที่ 5 จาก 6 · เลือกวันวางขาย                                        | สรุปที่เลือก                     |
|                                                                   |                              |
| วันวางขาย  [ 15 พ.ย. 2569           (ปฏิทิน) ]   อีก 45 วัน            | ...                          |
| ลัด  [+30 วัน]  [+60 วัน]  [+90 วัน]   [ ] กำหนดแยกรายห้าง             | วันวางขาย                     |
|                                                                   |   15 พ.ย. 2569 (ทุกห้าง)       |
| ไทม์ไลน์ย้อนหลังจากวันวางขาย · แม่แบบ Offline · มาตรฐาน                  |                              |
|  วันนี้                                                วันวางขาย      |                              |
|   v                                                      v        |                              |
|   o--[เตรียมเอกสาร]--[นำเสนอ Buyer]--[ตั้งรหัส]--[ส่ง DC]--[วางขาย]--> |                              |
|   1 ต.ค.*       1 ต.ค.          16 ต.ค.     25 ต.ค.    11 พ.ย.    |                              |
|   * ตามแม่แบบคือ 16 ก.ย. ซึ่งเลยมาแล้ว จึงปรับเป็นวันนี้                     |                              |
|                                                                   |                              |
| (!) แม่แบบต้องเริ่ม 60 วันก่อนวางขาย แต่เหลือ 45 วัน                       |                              |
|     ระบบจะเลื่อน 6 งานที่ตกก่อนวันนี้ให้เริ่มวันนี้ (ปรับเองได้ภายหลัง)            |                              |
+--------------------------------------------------------------------------------------------------+
| [< ย้อนกลับ]                                                              [ถัดไป: ตรวจสอบ >]        |
+--------------------------------------------------------------------------------------------------+
```

### 7.6 รายละเอียดข้อเสนอ + Task tree + Drawer (≥1280px, sidebar ยุบเป็น rail)

ข้อมูลชุดเดียวกับตัวอย่าง JSON ใน [04-api.md](04-api.md) §3.2: วันวางขาย 15 พ.ย. 2569 วันนี้ 1 ต.ค. 2569 มี 23 งาน leaf 16 ข้อ เสร็จ 4 ข้อ (25%) และมี leaf เกินกำหนด สุขภาพจึงเป็น AT_RISK

```
+----+-------------------------------------------------------------------------------------------------------------------+
| FT | ข้อเสนอสินค้า › PRP-2026-0042                                                     [กระดิ่ง 3]  (ต)                     |
+----+-----------------------------------------------------------------------------+-------------------------------------+
| [o]| (BigC) Big C · Normal shelf · เซรั่มวิตามินซี 30 ml (+2)            ( 25% )      | งานย่อย          [<] [>] [...] [x]   |
| [o]| [กำลังดำเนินการ] [! เสี่ยง]  ออฟไลน์  [Normal shelf]                4/16 งาน     | เตรียมเอกสารนำเสนอ ›                 |
| [o]| วางขาย 15 พ.ย. 2569 · อีก 45 วัน   เจ้าของ (ต)  สมาชิก (ฝ)(บ)(+1)               | กรอก New item / Listing form ของห้าง  |
| [o]|                                     [พักไว้]  [ปิดข้อเสนอ] (ปิด)  [...]          |                                     |
| [o]| [งาน]  สินค้า (3)  สมาชิก (4)  ไฟล์และความคิดเห็น (4)  ประวัติ                      | สถานะ  กำลังทำ (จากรายการย่อย 1/2)    |
|    | --------------------------------------------------------------------------- | ผู้รับผิดชอบ                            |
|    | [ทั้งหมด 23] [ของฉัน 18] [ยังไม่เสร็จ 18] [เกินกำหนด 3]  [ ] ซ่อนที่เสร็จ [+ เพิ่มงาน] |   (ต) ต้น [หลัก]  (บ) บี   [+]         |
|    | [ขยายทั้งหมด] [ยุบทั้งหมด]                                                      | ช่วงวันที่                              |
|    | --------------------------------------------------------------------------- |   21–28 ก.ย. 2569 · 8 วัน            |
|    | [ ] v เตรียมเอกสารนำเสนอ (Listing kit)    4/5   (ต)       ! เกินกำหนด 1 วัน    |   ! เกินกำหนด 3 วัน                   |
|    | [x]   v จัดทำ Product presentation        2/2   (ต)       เสร็จ 22 ก.ย. · ต้น  | ความสำคัญ  [ปกติ v]                   |
|    | [x]       รวบรวมรูปสินค้าและจุดขาย (ขีดฆ่า)        (ฝ)       เสร็จ 20 ก.ย. · ฝน    | รายละเอียด                           |
|    | [x]       สรุปราคาทุน RSP และ margin (ขีดฆ่า)      (ต)       เสร็จ 22 ก.ย. · ต้น  |   [ใช้ฟอร์ม Excel ล่าสุดของ Big C ]     |
|    | [ ]   v กรอก New item / Listing form      1/2   (ต)(บ)    ! เกินกำหนด 3 วัน  <|                                     |
|    | [x]       ขอ barcode จากฝ่าย QA (ขีดฆ่า)          (บ)       เสร็จ 25 ก.ย. · บี   | รายการย่อย 1/2                       |
|    | [ ]       แนบรูปสินค้าตามสเปกห้าง               (บ)       ! เกินกำหนด 3 วัน       |   [x] ขอ barcode จากฝ่าย QA          |
|    |           + เพิ่มรายการย่อย                                                    |   [ ] แนบรูปสินค้าตามสเปกห้าง           |
|    | [x]     เตรียมตัวอย่างสินค้า (ขีดฆ่า)              (ฝ)       เสร็จ 29 ก.ย. · ฝน     |   + เพิ่มรายการย่อย                    |
|    |         + เพิ่มงานย่อย                                                         |                                     |
|    | [ ] v นำเสนอและเจรจากับ Buyer             0/3   (ต)       15 ต.ค.            | [ความคิดเห็น 2] [ไฟล์ 1] [ประวัติ]       |
|    | [ ]     นัดประชุม Buyer                           (ต)       6 ต.ค.            | (ฝ) ฝน · 2 ชม.ที่แล้ว                  |
|    | [ ]     เจรจาเงื่อนไข ค่าแรกเข้า GP               ( ? )     13 ต.ค.             |   ส่งไฟล์ให้ต้นแล้ว                      |
|    | [ ]     ได้รับผลอนุมัติ                              (ต)       15 ต.ค.           | (บ) บี · 1 ชม.ที่แล้ว                   |
|    | [ ] > ตั้งรหัสสินค้าในระบบห้าง               0/2   (ต)       24 ต.ค.              |   รอรูปจาก Marketing ครับ             |
|    | [ ] > ผลิตและส่งสินค้าเข้า DC                0/3   (ต)       10 พ.ย.             |                                     |
|    | [ ] > วางขายและติดตามหน้าร้าน               0/3   (ต)       22 พ.ย.            | [พิมพ์ความคิดเห็น]                     |
|    |       + เพิ่มงาน  (พิมพ์แล้วกด Enter · Tab = เป็นงานย่อย)                          | [แนบไฟล์]               [ส่ง]         |
+----+-----------------------------------------------------------------------------+-------------------------------------+
```

- ปุ่ม [ปิดข้อเสนอ] เป็น disabled สำหรับ Owner ที่เป็น USER เพราะงานยังไม่ครบ (tooltip "ปิดข้อเสนอได้เมื่องานครบ 100% (เหลือ 12 งาน)") · ปุ่ม "ยืนยันวางขายแล้ว" อยู่ในเมนู [...] เพราะยังไม่ถึงวันวางขาย
- "เกินกำหนด 3" นับทุกระดับที่ `dueState = OVERDUE` (เตรียมเอกสารนำเสนอ, กรอก Listing form, แนบรูปสินค้า) ส่วน health นับเฉพาะ leaf (1 ข้อ)

### 7.7 Admin Monitor (MVP)

```
+--------------------+-----------------------------------------------------------------------------+
| FlowTrade          | Admin Monitor › ภาพรวม                         อัปเดต 10:35 (ทุก 5 นาที)  [รีเฟรช] |
|                    +-----------------------------------------------------------------------------+
| ...                | ช่องทาง [ทั้งหมด v]  ห้าง [ทั้งหมด v]  รูปแบบ [ทั้งหมด v]  เจ้าของ [ทั้งหมด v]       |
|                    +---------------+---------------+---------------+---------------+-------------+
|                    | กำลังดำเนินการ  | วางขายใน 30 วัน| เสี่ยง / ล่าช้า   | งานเกินกำหนด   | ไม่มีผู้รับผิดชอบ |
|                    | 38            | 9             | 4  /  1       | 23            | 7           |
|                    | ออฟ 29 · ออน 9| ดูรายการ >     | ดูรายการ >     | ดูรายการ >     | ดูรายการ >   |
|                    +-----------------------------------------------------------------------------+
|                    | ข้อเสนอเสี่ยง/ล่าช้า (W4)                                          [ดูทั้งหมด >]    |
|                    | รหัส            ห้าง      รูปแบบ    วันวางขาย  เหลือ   คืบหน้า  เจ้าของ  งานเกิน     |
|                    | PRP-2026-0039   7-Eleven  Normal    28 ก.ย.   เลย 3 วัน 61%   ฝน      3     |
|                    | PRP-2026-0042   Big C     Normal    15 พ.ย.    45 วัน  25%     ต้น      1     |
|                    +--------------------------------------+--------------------------------------+
|                    | ภาระงานรายบุคคล (W5)                  | สถานะตามห้าง (W2)                     |
|                    | ต้น   [xxxx####......] 14 · เกิน 4     | Big C     [====####::......] 12      |
|                    | ฝน    [x###.........]  10 · เกิน 1    | Watsons   [==######::.....]  11      |
|                    | บี    [##.....]         6 · เกิน 0     | 7-Eleven  [=###:......]       7      |
|                    | x เกินกำหนด # สัปดาห์นี้ . อื่นๆ            | = ร่าง # ดำเนินการ : พัก . สำเร็จ        |
|                    +-----------------------------------------------------------------------------+
|                    | (Phase 2: ปฏิทินวันวางขาย 90 วัน · ผลลัพธ์ K6–K9 · กิจกรรมล่าสุด · Export Excel)  |
+--------------------+-----------------------------------------------------------------------------+
```

### 7.8 Admin: ห้าง / แพลตฟอร์ม

```
+--------------------+-----------------------------------------------------------------------------+
| FlowTrade          | Admin Monitor › ห้าง / แพลตฟอร์ม                              [+ เพิ่มห้าง]      |
|                    +-----------------------------------------------------------------------------+
|                    | [ออฟไลน์ (ห้างร้าน) 6]  [ออนไลน์ (แพลตฟอร์ม) 3]                                  |
|                    | [ค้นหาชื่อหรือรหัส...       ]  สถานะ [ใช้งาน v]   ลำดับนี้ = ลำดับที่แสดงใน wizard     |
|                    +--------------------------------------------------+--------------------------+
|                    | (BigC) Big C · บิ๊กซี             ใช้ 24  [on] ...   | แก้ไขห้าง             [x]  |
|                    | (WTS)  Watsons · วัตสัน          ใช้ 19  [on] ...   | ชื่อ*    [Big C        ]   |
|                    | (7-11) 7-Eleven · เซเว่นฯ       ใช้ 11  [on] ...   | ชื่อไทย  [บิ๊กซี        ]     |
|                    | (LTS)  Lotus's · โลตัส          ใช้ 9   [on] ...   | รหัส     BIGC (ล็อก)       |
|                    | (CJ)   CJ · ซีเจ                ใช้ 4   [on] ...   | ช่องทาง  ออฟไลน์ (ล็อก)     |
|                    | (EB)   Eve and Boy · อีฟแอนด์บอย ใช้ 0   [on] ...   | กลุ่มห้าง [Big C        v]  |
|                    | ---- ปิดใช้งาน (1) ----                            | โลโก้    [ลากไฟล์มาวาง]    |
|                    | (TOPS) Tops · ท็อปส์             ใช้ 2   [off] ..   | สี     (o)(o) #E30613     |
|                    |                                                  | ตัวอย่างการ์ดใน wizard      |
|                    | เมนู ... : แก้ไข · ย้ายขึ้น · ย้ายลง · ปิดใช้งาน · ลบ    | [x] (logo) Big C · บิ๊กซี   |
|                    |   (ลบได้เฉพาะ ADMIN และยังไม่ถูกใช้)                  | หมายเหตุ [ข้อมูล buyer...]  |
|                    |                                                  | ใช้งาน   [on]             |
|                    |                                                  | [ปิดใช้งาน]       [บันทึก]   |
+--------------------+--------------------------------------------------+--------------------------+
```

### 7.9 มือถือ: Task tree (<768px)

```
+----------------------------------------+
| <  PRP-2026-0042                 [...] |
| (BigC) Big C · Normal shelf            |
| [! เสี่ยง] วางขาย 15 พ.ย. · อีก 45 วัน     |
| [#####---------------] 25% · 4/16      |
| [งาน] สินค้า  สมาชิก  ไฟล์  ประวัติ   ->     |
+----------------------------------------+
| [ทั้งหมด] [ของฉัน] [ยังไม่เสร็จ] [เกิน.. ->   |
+----------------------------------------+
| [ ]  เตรียมเอกสารนำเสนอ             v   |
|      ! เกิน 1 วัน · (ต) · 4/5            |
|    : [x] จัดทำ Product presentation  >  |
|    :      เสร็จ · 2 รายการย่อย           |
|    : [ ] กรอก Listing form ของห้าง    v |
|    :      ! เกิน 3 วัน · (ต)(บ) · 1/2    |
|    :  : [ ] แนบรูปสินค้าตามสเปกห้าง        |
|    :  :      ! เกิน 3 วัน · (บ)          |
|    : [x] เตรียมตัวอย่างสินค้า               |
+----------------------------------------+
| [ ]  นำเสนอและเจรจากับ Buyer        >   |
|      15 ต.ค. · (ต) · 0/3               |
+----------------------------------------+
|                                (+) งาน |
+----------------------------------------+
|  หน้าแรก   งานของฉัน   ข้อเสนอ   แจ้งเตือน  |
+----------------------------------------+
```

**การปรับ task tree สำหรับมือถือ**
- **แถว:** การ์ด 2 บรรทัด บรรทัดแรก checkbox (พื้นที่กด 44px) + ชื่อ (≤ 2 บรรทัด) + ▸/▾ · บรรทัดสอง due chip + avatar + "x/y"
- **ระดับ:** เยื้อง 12px ต่อระดับพร้อมเส้นนำแนวตั้ง · ระดับ 3 ยุบไว้เป็นค่าเริ่มต้นใต้ "แสดง N รายการย่อย"
- **ท่าทางที่ไม่ใช้:** ไม่มีลากวางและไม่มี swipe เพื่อติ๊ก เพราะหาเจอยากและกดพลาดง่าย
- **รายละเอียดและเมนู:** แตะแถวเปิดรายละเอียดเต็มจอ · กดค้างหรือกด ⋯ เปิด action sheet (เพิ่มงานลูก, ย้ายขึ้น/ลง, ย้ายไปไว้ใต้…, มอบหมาย, วันที่, ลบ)
- **เพิ่มงาน:** FAB "(+) งาน" เปิด bottom sheet เพิ่มงานเร็ว มีตัวเลือก "เพิ่มใต้: [ข้อเสนอนี้ / งาน X / งานย่อย Y]"
- **ตัวกรองและ header:** chip เลื่อนแนวนอน · header ย่อเหลือ progress bar และนับถอยหลัง
- **รายละเอียดงาน:** ปุ่ม "ถ่ายรูปหน้าร้าน" อยู่ส่วนบน

---

## 8. Responsive strategy

| Breakpoint (Tailwind) | กว้าง | App shell | Task detail | ตาราง / รายการ | Wizard | Dashboard |
|---|---|---|---|---|---|---|
| `2xl` | ≥1536 | sidebar 248px | drawer ติดขวา 480px ข้าง tree | ครบทุกคอลัมน์ | 2 คอลัมน์ + แผงสรุป | grid 12 คอลัมน์ |
| `xl` | 1280–1535 | sidebar 248px ยุบเป็น rail อัตโนมัติเมื่อ drawer เปิด | ติดขวา 440px | ครบ (คอลัมน์ tree ปรับตาม container) | แผงสรุป sticky | 12 คอลัมน์ |
| `lg` | 1024–1279 | **icon rail 64px** พร้อม tooltip | ลอยทับจากขวา 480px ไม่มี scrim | ซ่อนคอลัมน์รอง | แผงสรุปเป็นแถบล่าง | KPI 3+2 |
| `md` | 768–1023 | sidebar ซ่อน hamburger เปิด **drawer ซ้าย** | **sheet เต็มจอ** | ตาราง 4–5 คอลัมน์หลัก | 1 คอลัมน์, grid ห้าง 3 คอลัมน์ | 2 คอลัมน์ |
| base | <768 | app bar บน + **tab bar ล่าง 4 เมนู** (หน้าแรก, งานของฉัน, ข้อเสนอ, แจ้งเตือน) | sheet เต็มจอพร้อม ‹ กลับ | **ตารางเป็นการ์ด** | ใช้ได้แต่ออกแบบเพื่อ desktop, stepper ย่อ, grid ห้าง 2 คอลัมน์ | 1 คอลัมน์ |

**กติกา**
1. **ใช้ container query (`@container`)** กับ component ที่ความกว้างเปลี่ยนตาม layout เช่น แถวของ task tree, ProposalCard และ KpiCard เพราะการเปิด drawer ทำให้พื้นที่ tree เปลี่ยนทั้งที่ viewport เท่าเดิม
2. **`@media (pointer: coarse)`:** พื้นที่กดขั้นต่ำ 44px · control ที่แสดงตอน hover (ปุ่ม "+", ⋯) แสดงตลอดหรือย้ายเข้า action sheet
3. **Dialog บนมือถือ** เป็น bottom sheet · popover วันที่และผู้รับผิดชอบเป็น sheet เต็มความกว้าง
4. **ลำดับความสำคัญบนมือถือ** ตาม NFR: งานของฉัน, ติ๊กเสร็จ, ดูข้อเสนอ, คอมเมนต์, แนบรูป · wizard และหน้า Admin ใช้ได้แต่ไม่ได้ปรับแต่งเฉพาะ **(ควรยืนยันกับทีม Trade ว่าใช้มือถือหน้าห้างบ่อยแค่ไหน)**
5. **Toast:** ≥768px มุมขวาล่าง · <768px กลางล่างเหนือ tab bar · แสดงพร้อมกันไม่เกิน 3 อัน

---

## 9. Frontend architecture (`apps/web`)

### 9.1 โครงสร้างโฟลเดอร์ (ต่อยอดจาก prototype)

```
apps/web/src/
├─ main.tsx                     # QueryClientProvider, AuthProvider, i18n, TooltipProvider, Toaster (sonner)
├─ App.tsx                      # BrowserRouter + Routes (react-router 7), lazy pages, RequireAuth/RequirePermission
├─ index.css                    # Tailwind 4 tokens (1.6) + Noto Sans Thai
├─ api/
│  ├─ index.ts                  # export const api = httpApi
│  ├─ http/http-api.ts          # fetch: credentials 'include', X-FlowTrade-Request: 1, Problem Details → ApiError
│  ├─ query-keys.ts             # qk (9.3)
│  ├─ hooks.ts                  # query hooks ทั่วไป (useMe, useLookups...) — hook เฉพาะ feature ย้ายไปอยู่ใน features/*
│  └─ types.ts                  # re-export DTO จาก @flowtrade/shared/dto (ห้ามประกาศ type ซ้ำ)
├─ auth/auth.tsx                # AuthProvider, useAuth, RequireAuth, RequirePermission (typed), useCan
├─ pages/                       # หนึ่งไฟล์ต่อ route (โครงเดิม)
│  ├─ login.tsx  change-password.tsx  home.tsx  my-tasks.tsx  notifications.tsx (ใหม่)  settings.tsx  not-found.tsx  forbidden.tsx (ใหม่)
│  ├─ proposals/ list.tsx  new.tsx  detail.tsx
│  ├─ calendar.tsx              # [P2] เก็บไว้ ไม่ผูกเมนู
│  └─ admin/ monitor.tsx  tasks.tsx (ใหม่)  stores.tsx  shelf-types.tsx  products.tsx  templates.tsx  template-editor.tsx (ใหม่)  users.tsx  activity.tsx
├─ features/
│  ├─ wizard/                   # (เดิม) step-*.tsx, wizard-state.ts (+ batchId), template-tree-preview.tsx, quick-add-product-dialog.tsx
│  ├─ task-tree/                # (เดิม) task-tree.tsx, task-row.tsx, task-drawer.tsx, inline-add.tsx, move-dialog.tsx,
│  │                            #        date-range-popover.tsx, task-comments.tsx + use-task-mutations.ts, apply-mutation.ts (ใหม่)
│  ├─ proposal-detail/          # (เดิม) proposal-header.tsx, proposal-actions.tsx, reschedule-dialog.tsx, history-tab.tsx
│  │                            #        + confirm-launch-dialog.tsx, close-proposal-dialog.tsx, banners.tsx (ใหม่)
│  ├─ proposals-list/           # (เดิม) table-view.tsx, filter-bar.tsx, params.ts · kanban-view.tsx / grid-view.tsx ซ่อนจน P2
│  ├─ monitor/                  # (เดิม) kpi-tiles.tsx, at-risk-list.tsx, workload-chart.tsx, store-chart.tsx, overdue-tasks.tsx
│  ├─ my-tasks/  notifications/  attachments/          # ใหม่ (task-list-grouped.tsx ใช้ทั้ง /my-tasks และ /admin/tasks)
│  └─ admin-users/  admin-templates/  admin-activity/  # (เดิม) + admin-master-data/ (sheet ฟอร์ม store/shelf/product ใช้ร่วมกัน)
├─ components/
│  ├─ ui/                       # shadcn (generated) แก้ได้เฉพาะ style ให้ตรง token
│  ├─ common/                   # badges, date-field, user-picker, user-avatar, full-page-spinner + empty-state, error-state,
│  │                            # confirm-dialog, disabled-reason, due-chip, store-logo, store-chip, progress-ring, data-table
│  └─ layout/app-shell.tsx      # sidebar + topbar + mobile tab bar
├─ lib/                         # dates.ts (dayjs เท่านั้น), format.ts, safe-storage.ts, hotkeys.ts, color.ts, utils.ts
├─ hooks/                       # use-mobile.ts, use-date-era.ts, use-undo-toast.ts
└─ locales/th/                  # common, enums, errors, proposals, tasks, admin (.json)
```

กติกา tree และ checklist อยู่ที่ `packages/shared/src/task-tree.ts` (`buildTaskTree`, `deriveParentStatus`, `resolveInsertIndex`, `sortBetween`, `computeDueState`, `computeHealth`, `checkMove`) ซึ่งเป็นโค้ดชุดเดียวกับที่ server ใช้ optimistic UI จึงได้ผลตรงกับ server

**สิ่งที่ต้องแก้ใน prototype ให้ตรง contract**

| จุด | ปัจจุบันใน prototype | ต้องเป็น |
|---|---|---|
| `packages/shared/src/permissions.ts` | `dashboard.monitor`, `store.manage`, `template.manage`, `activity.read.all` ฯลฯ และ MANAGER ไม่มีสิทธิ์จัดการห้าง | แทนทั้งไฟล์ด้วย [04-api.md](04-api.md) §4.1 · ลบ `can(user, permission)` เดิม ใช้ `me.permissions` |
| `App.tsx` guard | `RequirePermission permission="dashboard.monitor"` ฯลฯ | key ในตาราง 2.2 (typed เป็น `Permission` ชื่อผิด = compile error) |
| Task | `isDone`, `POST /tasks/:id/toggle` | `status: TaskStatus`, `PUT /tasks/:id/status { status, cascade }` |
| Task tree cache | ต้นไม้ซ้อน | flat `TaskDto[]` + `buildTaskTree` |
| object `can` | `editTargetDate`, `editShelfType` | `ProposalAbilitiesDto` / `TaskAbilitiesDto` จาก shared |
| วันที่ | date-fns + dayjs, `lib/prefs.ts.buddhistEra` ในเบราว์เซอร์ | dayjs อย่างเดียว · `User.dateEra` ผ่าน `useDateEra()` |
| ฟอนต์ | IBM Plex Sans Thai + Geist | Noto Sans Thai Variable |
| รหัสข้อเสนอ, priority | `PRJ-`, `URGENT` | `PRP-`, ไม่มี `URGENT` |
| error | `{ status, code, message, fields }` | Problem Details (`code`, `detail`, `errors[]`) |

### 9.2 Routing และ guard (react-router 7)

```tsx
// App.tsx (บางส่วน) — โครงเดิมของ prototype เปลี่ยนเฉพาะ permission key และเพิ่ม route ใหม่
<Route path="/login" element={<LoginPage />} />
<Route element={<RequireAuth />}>
  <Route path="/change-password" element={<ChangePasswordPage />} />
  <Route element={<AppShell />}>
    <Route index element={<HomePage />} />
    <Route path="my-tasks" element={<MyTasksPage />} />
    <Route path="notifications" element={<NotificationsPage />} />
    <Route path="proposals" element={<ProposalsPage />} />
    <Route path="proposals/new" element={<RequirePermission permission="proposal.create"><NewProposalPage /></RequirePermission>} />
    <Route path="proposals/:id" element={<ProposalDetailPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="admin">
      <Route index element={<RequirePermission permission="dashboard.view.all"><AdminMonitorPage /></RequirePermission>} />
      <Route path="tasks" element={<RequirePermission permission="dashboard.view.all"><AdminTasksPage /></RequirePermission>} />
      <Route path="stores" element={<RequirePermission permission="master.manage"><AdminStoresPage /></RequirePermission>} />
      <Route path="shelf-types" element={<RequirePermission permission="master.manage"><AdminShelfTypesPage /></RequirePermission>} />
      <Route path="products" element={<RequirePermission permission="master.manage"><AdminProductsPage /></RequirePermission>} />
      <Route path="templates" element={<RequirePermission permission="master.manage"><AdminTemplatesPage /></RequirePermission>} />
      <Route path="templates/:templateId" element={<RequirePermission permission="master.manage"><TemplateEditorPage /></RequirePermission>} />
      <Route path="users" element={<RequirePermission permission="user.manage"><AdminUsersPage /></RequirePermission>} />
      <Route path="activity" element={<RequirePermission permission="audit.read.all"><AdminActivityPage /></RequirePermission>} />
    </Route>
    <Route path="403" element={<ForbiddenPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>
</Route>
```

```tsx
// auth/auth.tsx (บางส่วน)
import type { MeDto, Permission } from '@flowtrade/shared';

export function RequireAuth() {
  const { me, isLoading } = useAuth();                    // useQuery(['me'], GET /auth/me)
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!me) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (me.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  return can(permission) ? <>{children}</> : <Navigate to="/403" replace />;
}

export function useCan() {
  const { me } = useAuth();
  return useCallback((p: Permission) => !!me?.permissions.includes(p), [me]);
}
```

- **สิทธิ์ 2 ชั้น:** ระดับระบบใช้ `useCan()` / `<RequirePermission>` จาก `me.permissions` (server คำนวณจาก `ROLE_PERMISSIONS` ชุดเดียวกับ guard ของ API และ RBAC matrix test) · ระดับข้อเสนอและงานใช้ `can` ที่ server แนบใน DTO UI ไม่คำนวณสิทธิ์เอง
- **Search params:** อ่าน/เขียนด้วย `useSearchParams` แล้ว parse ด้วย zod (`features/proposals-list/params.ts` เดิม) ใช้ชื่อเดียวกับ API
- **โหลดข้อมูลหน้ารายละเอียด:** เรียก `useProposal(id)` และ `useProposalTasks(id)` พร้อมกันที่ระดับ page (ไม่ซ้อน component) เพื่อไม่ให้เกิด waterfall · 404 → หน้า "ไม่พบข้อเสนอนี้ หรือคุณไม่มีสิทธิ์เข้าถึง"

```tsx
// components/common/disabled-reason.tsx — ใช้แทนการซ่อนปุ่มเมื่อทำไม่ได้แค่ชั่วคราว (R-AUTH-4)
export function DisabledReason({ allowed, reason, children }: { allowed: boolean; reason: string; children: ReactElement }) {
  const id = useId();
  if (allowed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} aria-describedby={id}>{cloneElement(children, { disabled: true })}</span></TooltipTrigger>
      <TooltipContent id={id}>{reason}</TooltipContent>
    </Tooltip>
  );
}
// <DisabledReason allowed={proposal.can.changeTargetDate} reason={t('tooltips.ownerOnlyTargetDate')}><Button>เปลี่ยนวันวางขาย</Button></DisabledReason>
```

### 9.3 TanStack Query: key และ defaults

```ts
// api/query-keys.ts
export const qk = {
  me: ['me'] as const,
  proposals: {
    all: ['proposals'] as const,
    list: (s: ProposalListSearch) => ['proposals', 'list', s] as const,
    detail: (id: string) => ['proposals', 'detail', id] as const,
    tasks: (id: string) => ['proposals', 'detail', id, 'tasks'] as const,      // TasksResponse = { data: TaskDto[], meta }
    products: (id: string) => ['proposals', 'detail', id, 'products'] as const,
    members: (id: string) => ['proposals', 'detail', id, 'members'] as const,
    activity: (id: string) => ['proposals', 'detail', id, 'activity'] as const,
    duplicates: (body: DuplicateCheckInput) => ['proposals', 'duplicates', body] as const,
  },
  tasks: {
    mine: ['tasks', 'mine'] as const,
    team: (s: TeamTasksSearch) => ['tasks', 'team', s] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    comments: (proposalId: string, taskId?: string) => ['comments', proposalId, taskId ?? 'proposal'] as const,
    attachments: (proposalId: string, taskId?: string) => ['attachments', proposalId, taskId ?? 'proposal'] as const,
  },
  lookups: {
    stores: (channel: Channel) => ['lookups', 'stores', channel] as const,
    shelfTypes: (channel: Channel) => ['lookups', 'shelfTypes', channel] as const,
    products: (q: string) => ['lookups', 'products', q] as const,
    templates: (channel: Channel, shelfTypeId: string) => ['lookups', 'templates', channel, shelfTypeId] as const,
    users: (q: string, proposalId?: string) => ['lookups', 'users', q, proposalId ?? null] as const,
  },
  master: {
    stores: (f: object) => ['master', 'stores', f] as const,
    shelfTypes: (f: object) => ['master', 'shelfTypes', f] as const,
    products: (s: object) => ['master', 'products', s] as const,
    templates: (f: object) => ['master', 'templates', f] as const,
    template: (id: string) => ['master', 'templates', id] as const,
  },
  users: { list: (s: object) => ['users', 'list', s] as const },
  notifications: { unread: ['notifications', 'unread'] as const, list: (s: object) => ['notifications', 'list', s] as const },
  dashboard: { all: ['dashboard'] as const, widget: (w: string, f: object) => ['dashboard', w, f] as const },
  activity: (s: object) => ['activity', s] as const,
};
```

| ค่า | ตั้งไว้ |
|---|---|
| `staleTime` | 30 วินาที (lookups/ข้อมูลหลัก 5 นาที, `me` 60 วินาที) |
| `retry` | query retry 1 ครั้งเฉพาะ network/5xx ไม่ retry 4xx · **mutation ไม่ retry (`retry: 0`)** เพราะสร้างงาน/คอมเมนต์ไม่ idempotent |
| Polling | tree ข้อเสนอ 30 วินาที (เฉพาะแท็บที่เปิดดู) · กระดิ่ง 60 วินาที · dashboard 5 นาที |
| Global `QueryCache.onError` / `MutationCache.onError` | 401 → ล้าง cache แล้วไป `/login?returnTo=` (ร่าง wizard ยังอยู่ใน localStorage) · 403 `PASSWORD_CHANGE_REQUIRED` → `/change-password` · 403 อื่น → toast ข้อความ FORBIDDEN |
| ลำดับ mutation | `scope: { id: 'proposal-tasks:{id}' }` ให้ mutation ของ tree เดียวกันทำงานทีละคำสั่ง กันการติ๊กเร็วๆ แล้วผลสลับกัน |

### 9.4 Optimistic update และการ merge `MutationResult`

```ts
// features/task-tree/apply-mutation.ts — merge ผลจาก server เข้า cache แบบ flat
export function applyMutation<T>(old: TasksResponse, res: MutationResult<T>, opts: { insert?: TaskDto; removeIds?: string[]; replaceTempId?: string } = {}): TasksResponse {
  let data = old.data;
  if (opts.removeIds?.length) data = data.filter((t) => !opts.removeIds!.includes(t.id));
  if (opts.insert) data = [...data.filter((t) => t.id !== opts.replaceTempId && t.id !== opts.insert!.id), opts.insert];
  const patch = new Map(res.patch.tasks.map((p) => [p.id, p]));
  data = data.map((t) => (patch.has(t.id) ? { ...t, ...patch.get(t.id) } : t));
  return {
    data: sortFlat(data),                                              // (level, sortOrder, id) เหมือน server
    meta: res.patch.proposal ? { ...old.meta, today: res.meta.today, proposal: { ...old.meta.proposal, ...res.patch.proposal } } : old.meta,
  };
}
```

```ts
// features/task-tree/use-task-mutations.ts — ติ๊ก/เปลี่ยนสถานะ (C12: ส่งสถานะปลายทาง ไม่มี version)
export function useSetTaskStatus(proposalId: string) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const tasksKey = qk.proposals.tasks(proposalId);
  const detailKey = qk.proposals.detail(proposalId);

  return useMutation({
    mutationFn: (v: { taskId: string; status: TaskStatus; cascade: boolean }) =>
      api.tasks.setStatus(v.taskId, { status: v.status, cascade: v.cascade }),
    scope: { id: `proposal-tasks:${proposalId}` },
    retry: 0,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: tasksKey });
      const prev = qc.getQueryData<TasksResponse>(tasksKey);
      const prevDetail = qc.getQueryData<ProposalDetailDto>(detailKey);
      if (prev && me) {
        // กติกา C1–C9 ชุดเดียวกับ server (deriveParentStatus(children, previous) ใน packages/shared)
        const next = applyTaskStatusLocally(prev, v.taskId, v.status, { cascade: v.cascade, actorId: me.user.id });
        qc.setQueryData(tasksKey, next);
        qc.setQueryData<ProposalDetailDto>(detailKey, (p) => p && { ...p, ...pickProgress(next.meta.proposal) });
      }
      return { prev, prevDetail };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tasksKey, ctx.prev);
      if (ctx?.prevDetail) qc.setQueryData(detailKey, ctx.prevDetail);
      if (isProblem(err, 'CONFIRMATION_REQUIRED')) return openCascadeDialog(err.details);   // server เห็นงานค้างเพิ่ม
      notifyError(err);                                                                  // ข้อความไทยจาก i18n errors + [ลองใหม่]
    },
    onSuccess: (res: MutationResult<TaskDto>) => {
      qc.setQueryData<TasksResponse>(tasksKey, (old) => old && applyMutation(old, res));
      qc.setQueryData<ProposalDetailDto>(detailKey, (p) => (p && res.patch.proposal ? { ...p, ...res.patch.proposal } : p));
      void qc.invalidateQueries({ queryKey: qk.tasks.mine, refetchType: 'none' });
      void qc.invalidateQueries({ queryKey: qk.dashboard.all, refetchType: 'none' });
      showStatusFeedback(res);    // toast ตามตาราง 4.6 · เลิกทำ (C13) เฉพาะ leaf ที่แถวหายไป: ส่ง { status: previousLeafStatus } กลับไป
    },
  });
}

// ย้าย/เรียงลำดับ: เว็บไม่ส่ง sortOrder ส่งแค่ตำแหน่งเทียบกับพี่น้อง แล้วรับค่าจริงกลับ
export function useMoveTask(proposalId: string) {
  const qc = useQueryClient();
  const tasksKey = qk.proposals.tasks(proposalId);
  return useMutation({
    mutationFn: (v: { taskId: string; version: number; parentId: string | null; afterId?: string | null; beforeId?: string | null }) =>
      api.tasks.move(v.taskId, { version: v.version, parentId: v.parentId, afterId: v.afterId ?? null, beforeId: v.beforeId ?? null }),
    scope: { id: `proposal-tasks:${proposalId}` },
    retry: 0,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: tasksKey });
      const prev = qc.getQueryData<TasksResponse>(tasksKey);
      if (prev) qc.setQueryData(tasksKey, moveLocally(prev, v));   // resolveInsertIndex + sortBetween จาก shared
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tasksKey, ctx.prev);
      if (isProblem(err, 'POSITION_STALE')) return void qc.invalidateQueries({ queryKey: tasksKey });
      notifyError(err);                                            // VERSION_CONFLICT → banner + โหลดข้อมูลล่าสุด
    },
    onSuccess: (res: MutationResult<TaskDto>) =>
      qc.setQueryData<TasksResponse>(tasksKey, (old) => old && applyMutation(old, res, { insert: res.data })),
  });
}
```

- **สร้างงาน:** แถวใหม่ใช้ temp id (`tmp-…`) ทันที แล้ว `applyMutation(old, res, { insert: res.data, replaceTempId })`
- **ลบงาน:** `applyMutation(old, res, { removeIds: res.data.deletedIds })` แล้วแสดง toast เลิกทำที่เรียก `POST /tasks/:id/restore { deletedAt: res.data.deletedAt }`
- **แก้จาก drawer นอกหน้าข้อเสนอ** (เช่นจาก `/my-tasks`): อัปเดต `qk.tasks.detail(id)` และ `qk.proposals.tasks(proposalId)` ถ้ามี cache อยู่ แล้ว invalidate `qk.tasks.mine`
- error code ที่ต้องจัดการเฉพาะ: `VERSION_CONFLICT` (banner + `conflict.lastModifiedBy`), `CONFIRMATION_REQUIRED` (dialog), `POSITION_STALE` (refetch), `TASK_DEPTH_EXCEEDED`, `PARENT_STATUS_DERIVED`, `PROPOSAL_READ_ONLY` (toast + refetch header)

### 9.5 Forms

- react-hook-form + `zodResolver` กับ schema จาก `packages/shared` · ข้อความ error ภาษาไทยจาก `z.config(z.locales.th())` และข้อความเฉพาะใน field สำคัญ
- ใช้ shadcn `<Form>` ทั้งหมด ข้อความ error อยู่ใต้ช่องและผูกด้วย `aria-describedby` · submit ที่ผิด focus ไปช่องแรกที่ผิด
- server ตอบ 400/422 พร้อม `errors[].path` → map เข้า `setError` ของช่องนั้น (รวม path แบบ `rows[1].shelfTypeId` ของ wizard)
- Async validation (SKU, อีเมล, ชื่อห้างซ้ำ) ตรวจตอนออกจากช่อง ส่วนการตัดสินสุดท้ายอยู่ที่ server
- หน้าที่ต้องกดบันทึกเอง (template editor) ใช้ `useBlocker` ของ react-router กันการออกจากหน้าขณะยังไม่บันทึก

### 9.6 shadcn/ui ที่ใช้

| Component | ใช้ที่ |
|---|---|
| Sidebar (collapsible icon), Sheet, Drawer (bottom sheet บนมือถือ) | app shell, task drawer, ฟอร์ม admin |
| Command (cmdk), Popover | UserPicker, combobox, ค้นหาสินค้าใน wizard |
| Calendar (react-day-picker รุ่นตาม lockfile ของ prototype), Popover | ThaiDatePicker, DateRangePicker |
| Table + TanStack Table (DataTable), Pagination | รายการข้อเสนอ, สินค้า, ผู้ใช้, audit |
| Tabs, ToggleGroup, Toggle | แท็บข้อเสนอ, ตัวกรองด่วน |
| Checkbox, RadioGroup, Switch, Select, Input, Textarea, Label, Form | ทุกฟอร์ม, การ์ดใน wizard |
| Dialog, AlertDialog | dialog สถานะ, cascade, ลบ |
| DropdownMenu, ContextMenu | เมนู ⋯ และคลิกขวาในแถวงาน |
| Tooltip, HoverCard | disabled reason, การ์ดข้อมูลผู้ใช้ |
| Badge, Avatar, Progress, Skeleton, Separator, ScrollArea, Breadcrumb, Collapsible, Alert | ทั่วไป |
| Sonner | toast พร้อมปุ่ม "เลิกทำ" |
| Chart (Recharts) | dashboard |
| Resizable (เพิ่มใหม่) | ความกว้าง drawer ที่วางติดขวา |
| **เขียนเอง** | Stepper, TaskTree/TaskRow, ProgressRing, OffsetInput, StoreLogo |

### 9.7 Date utils (พ.ศ. / ค.ศ.)

```ts
// lib/dates.ts — dayjs เท่านั้น (ถอด date-fns ออกจาก package.json)
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/th';
dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(buddhistEra); dayjs.extend(customParseFormat);
dayjs.locale('th');

export const TZ = 'Asia/Bangkok';
export type IsoDate = string; // 'YYYY-MM-DD' ค.ศ. เสมอ (ตรงกับ API)

export const todayBkk = (): IsoDate => dayjs().tz(TZ).format('YYYY-MM-DD');           // BR-26
const d = (iso: IsoDate) => dayjs(iso, 'YYYY-MM-DD', true);
export const diffDays = (a: IsoDate, b: IsoDate) => d(a).diff(d(b), 'day');
export const durationDays = (start?: IsoDate | null, due?: IsoDate | null) =>
  start && due ? diffDays(due, start) + 1 : null;                                     // 5.3

const Y = (era: DateEra) => (era === 'BE' ? 'BBBB' : 'YYYY');
export const formatDate = (iso: IsoDate, era: DateEra) => d(iso).format(`D MMM ${Y(era)}`);                   // 15 พ.ย. 2569
export const formatDateLong = (iso: IsoDate, era: DateEra) => d(iso).format(`[วัน]dddd[ที่] D MMM ${Y(era)}`);  // วันพฤหัสบดีที่ 1 ต.ค. 2569
export function formatRange(start: IsoDate | null, due: IsoDate | null, era: DateEra): string { /* "2–9 ต.ค.", "28 ก.ย. – 5 ต.ค.", "– 9 ต.ค." ไม่แสดงปีถ้าเป็นปีปัจจุบัน */ }

/** ใช้เฉพาะจุดที่ไม่มี dueState จาก server (เช่นตัวอย่างใน wizard) · ต้องส่ง era ทุกครั้ง */
export function relativeDue(due: IsoDate, dueSoonDays: number, era: DateEra): { state: TaskDueState; label: string } {
  const n = diffDays(due, todayBkk());
  if (n < 0) return { state: 'OVERDUE', label: `เกินกำหนด ${-n} วัน` };
  if (n === 0) return { state: 'DUE_TODAY', label: 'ครบกำหนดวันนี้' };
  if (n <= dueSoonDays) return { state: 'DUE_SOON', label: `อีก ${n} วัน` };
  return { state: 'ON_TRACK', label: formatDate(due, era) };
}
// รับข้อความ "15/11/2569" หรือ "15/11/2026": ปี ≥ 2400 ถือเป็น พ.ศ. แล้วลบ 543
export function parseThaiDateInput(text: string): IsoDate | null { /* ... */ }
```

- `useDateEra()` คืน `me.settings.dateEra` (= `User.dateEra ?? AppSetting.defaultDateEra`) · ทุกจุดที่เรียก `formatDate`/`relativeDue` ต้องส่งค่านี้ ห้าม hard-code `'BE'` (unit test ทั้งโหมด BE และ CE)
- งานในข้อเสนอที่ไม่อยู่ในสถานะ `IN_PROGRESS` ใช้ `dueState` จาก server (`NONE`) ไม่คำนวณเอง (5.7)
- **ห้ามใช้ `new Date('YYYY-MM-DD')` ฝั่งเว็บ** เพราะจะถูก parse เป็น UTC แล้ววันอาจเลื่อน · แปลงระหว่าง `Date` กับ `IsoDate` เฉพาะที่ขอบของ date picker
- **ThaiDatePicker:** react-day-picker ใช้ locale ไทยและ `weekStartsOn={1}` (สัปดาห์เริ่มวันจันทร์) แล้วกำหนด formatter ของ caption และ dropdown ปีให้แสดง +543 เมื่อโหมดเป็น พ.ศ. (ชื่อ prop ตามรุ่นที่ติดตั้ง)
- ไฟล์ export (P2) ใช้รูปแบบปีตามผู้ใช้ (US-M07)

### 9.8 Empty states, skeleton, error boundary, toast

- **Empty state:** `<EmptyState illustration title description action />` ทุกหน้ามีปุ่มสำหรับขั้นต่อไปเสมอ (ข้อความใน 10.2)
- **Skeleton:** แสดงหลังรอ 150ms และค้างอย่างน้อย 300ms เพื่อไม่ให้กระพริบ รูปทรงตรงกับของจริง (แถว tree ที่เยื้อง, การ์ด KPI, แถวตาราง)
- **Error boundary 3 ชั้น**
  1. **Root:** "เกิดข้อผิดพลาด" พร้อมปุ่มโหลดหน้าใหม่และรหัสอ้างอิง (`requestId`) ที่คัดลอกได้
  2. **Route:** `errorElement` ของ react-router · shell ยังอยู่ แสดง ErrorState พร้อม [ลองใหม่]
  3. **Widget:** `QueryErrorResetBoundary` + `ErrorBoundary` (react-error-boundary) · ทั้งหมดส่งต่อไป Sentry/GlitchTip พร้อม `requestId`
- **Offline:** `navigator.onLine = false` แสดงแถบบนสุด "ไม่มีการเชื่อมต่ออินเทอร์เน็ต การเปลี่ยนแปลงจะยังไม่ถูกบันทึก"
- **Toast**

  | ชนิด | แสดงนาน | ใช้เมื่อ |
  |---|---|---|
  | success | 4 วินาที | งานสำเร็จที่ผู้ใช้มองไม่เห็นผลบนหน้าจอโดยตรง |
  | undo | 10 วินาที มี [เลิกทำ] | ติ๊ก leaf ที่ทำให้แถวหายไป (หน้างานของฉัน หรือเปิด "ซ่อนงานที่เสร็จแล้ว") · ลบงาน (C13) |
  | error | ค้างจนกว่าจะปิด มี [ลองใหม่] | บันทึกไม่สำเร็จ |
  | info | 4 วินาที | ระบบเปลี่ยนค่าให้อัตโนมัติ (C4, C6, C8, `DEFAULT_CLEARED`) |

  สถานะ "บันทึกแล้ว" ของการแก้ inline ไม่ใช้ toast ให้แสดงเป็นข้อความจางในตำแหน่งนั้น

### 9.9 i18n และอื่นๆ

- i18next ภาษาไทยเป็นค่าเริ่มต้น namespace: `common`, `enums` (label ตาม glossary 8.3 เช่น `enums.ProposalStatus.IN_PROGRESS`), `errors` (แปล `code` ของ Problem Details), `proposals`, `tasks`, `admin` · ห้ามเขียนข้อความไทยลงใน component ตรงๆ
- เรียงข้อความด้วย `new Intl.Collator('th')` · จัดรูปตัวเลขด้วย `Intl.NumberFormat('th-TH')`
- คีย์ลัดทั้งหมดผ่าน `lib/hotkeys.ts` ซึ่งผูกกับ `event.code` (`KeyN`, `Space`, `Slash`)
- Test:
  - Vitest + Testing Library + MSW สำหรับ wizard (ทุกขั้น ทุกการตรวจซ้ำ replay ด้วย batchId เดิม) และ tree (เพิ่มงาน, indent/outdent ด้วย `afterId` อย่างเดียว, ติ๊ก, cascade dialog, rollback เมื่อได้ error, merge `patch`)
  - Playwright + axe ที่ความกว้าง 1440/1280/1024/768/375px
  - contract test ที่ import `ROLE_PERMISSIONS` และตรวจว่าทุก route guard ใช้ key ที่มีอยู่จริง

---

## 10. Thai microcopy

### 10.1 แนวทางภาษา

1. สุภาพแบบกลางๆ **ไม่ใช้ "ครับ/ค่ะ"** ในข้อความของระบบ ใช้ "กรุณา" เฉพาะเมื่อผู้ใช้ต้องลงมือแก้
2. ปุ่มขึ้นต้นด้วยคำกริยาและบอกผลชัด เช่น "ลบ 3 รายการ" ไม่ใช้ "ตกลง"
3. ใช้ label ตาม glossary ทุกจุด: งาน / งานย่อย / รายการย่อย · ห้าง / แพลตฟอร์ม · รูปแบบชั้นวาง / ประเภท Listing · วันวางขาย / วัน Go-live · วันวางขายจริง
4. คำวิชาชีพที่ทีม Trade ใช้อยู่แล้วคงเป็นภาษาอังกฤษ เช่น SKU, Buyer, planogram, Listing form
5. ข้อความ error บอกสิ่งที่เกิดขึ้นและวิธีแก้ ไม่โทษผู้ใช้ ไม่แสดงรหัสภายใน ยกเว้นรหัสอ้างอิงสำหรับแจ้งผู้ดูแล
6. ใช้ "ไม่สำเร็จ" แทน "ล้มเหลว" และ "ปิดใช้งาน" แทน "ลบ" เมื่อเป็นการซ่อน
7. ใน dialog ยกเลิกข้อเสนอ ปุ่มปิด dialog ใช้คำว่า "กลับ" ห้ามใช้ "ยกเลิก"

### 10.2 ปุ่มและ Empty states

**ปุ่มหลัก:** เข้าสู่ระบบ · ออกจากระบบ · ตั้งรหัสผ่านใหม่ · + สร้างข้อเสนอ · ถัดไป: {ชื่อขั้น} · ย้อนกลับ · บันทึกร่าง · สร้างและเริ่มดำเนินการ · สร้าง {n} ข้อเสนอและเริ่มดำเนินการ · เริ่มดำเนินการ · พักไว้ · ดำเนินการต่อ · ยืนยันวางขายแล้ว · ปิดข้อเสนอ · ยกเลิกข้อเสนอ · เปิดใหม่ · เปลี่ยนวันวางขาย · + เพิ่มงาน · + เพิ่มงานย่อย · + เพิ่มรายการย่อย · มอบหมายให้ฉัน · ย้ายขึ้น · ย้ายลง · ย้ายไปไว้ใต้… · ขยายทั้งหมด · ยุบทั้งหมด · ซ่อนงานที่เสร็จแล้ว · เลิกทำ · ลองใหม่ · โหลดข้อมูลล่าสุด · + เพิ่มห้าง · + เพิ่มรูปแบบชั้นวาง · + เพิ่มสินค้า · นำเข้าจาก Excel · + สร้างแม่แบบ · ทำสำเนา · ตั้งเป็นค่าเริ่มต้น · ปิดใช้งาน · เปิดใช้งาน · กู้คืนรายการเดิม · + เพิ่มผู้ใช้ · รีเซ็ตรหัสผ่าน · ปลดล็อกบัญชี · ปิดบัญชี · เปิดบัญชีอีกครั้ง · คัดลอก · ถ่ายรูปหน้าร้าน · แจ้งผู้ดูแล

| ที่ | หัวข้อ | คำอธิบาย | ปุ่ม |
|---|---|---|---|
| หน้าแรก: ยังไม่มีข้อเสนอ | เริ่มเสนอสินค้าเข้าห้างแรกของคุณ | เลือกสินค้า ห้าง และวันวางขาย ระบบจะสร้างรายการงานพร้อมวันที่ให้อัตโนมัติ | + สร้างข้อเสนอ |
| งานของฉัน: ไม่มีงานค้าง | ไม่มีงานค้างแล้ว | งานที่ได้รับมอบหมายจะแสดงที่นี่ | ดูข้อเสนอของฉัน |
| กลุ่ม "เกินกำหนด" ว่าง | ไม่มีงานเกินกำหนด | — | — |
| ข้อเสนอที่ยังไม่มีงาน | ยังไม่มีงานในข้อเสนอนี้ | เพิ่มงานเอง หรือดึงงานจากแม่แบบ | + เพิ่มงาน · เพิ่มงานจากแม่แบบ |
| ตัวกรองไม่พบผล | ไม่พบงานที่ตรงกับตัวกรอง | — | ล้างตัวกรอง |
| รายการข้อเสนอ (USER) | ยังไม่มีข้อเสนอที่คุณเกี่ยวข้อง | ข้อเสนอที่คุณสร้าง หรือได้รับมอบหมายงาน จะแสดงที่นี่ | + สร้างข้อเสนอ |
| ค้นหาไม่พบ | ไม่พบ "{คำค้น}" | ลองค้นด้วยรหัส SKU หรือบาร์โค้ด | — |
| Wizard ขั้น 2 (USER) | ไม่พบสินค้า "{คำค้น}" | ติดต่อผู้จัดการหรือผู้ดูแลระบบเพื่อเพิ่มสินค้า | — |
| งานทั้งฝ่าย: ไม่มีงานไม่มีผู้รับผิดชอบ | ทุกงานมีผู้รับผิดชอบแล้ว | — | — |
| การแจ้งเตือน | ยังไม่มีการแจ้งเตือน | เมื่อมีคนมอบหมายงานหรือแสดงความคิดเห็นในงานของคุณ จะแจ้งที่นี่ | — |
| ความคิดเห็น | ยังไม่มีความคิดเห็น | เริ่มคุยกับทีมเกี่ยวกับงานนี้ได้เลย | — |
| ไฟล์ | ยังไม่มีไฟล์ | ลากไฟล์มาวาง หรือแนบลิงก์ Google Drive / SharePoint | แนบไฟล์ · แนบลิงก์ |
| Admin: แพลตฟอร์มออนไลน์ | ยังไม่มีแพลตฟอร์มออนไลน์ | เพิ่ม Shopee, Lazada หรือแพลตฟอร์มที่ทีมใช้ | + เพิ่มแพลตฟอร์ม |
| Admin: แม่แบบงาน | ยังไม่มีแม่แบบงาน | แม่แบบช่วยสร้างรายการงานพร้อมวันที่ให้ทุกข้อเสนอโดยอัตโนมัติ | + สร้างแม่แบบ |
| Dashboard | ไม่มีข้อมูลตามตัวกรองนี้ | — | ล้างตัวกรอง |

### 10.3 Dialog ยืนยัน

| เมื่อ | หัวข้อ / เนื้อหา | ปุ่มหลัก |
|---|---|---|
| C5 ติ๊กงานแม่ | **ทำเครื่องหมายเสร็จทั้งหมด?** มีงานย่อยที่ยังไม่เสร็จ {n} รายการ ระบบจะทำเครื่องหมายเสร็จทั้งหมดและแจ้ง {ชื่อ} การทำรายการนี้เลิกทำไม่ได้ | เสร็จทั้งหมด {n+1} รายการ |
| C7 เปิดงานแม่ใหม่ | **เปิดงานนี้ใหม่?** งานนี้และงานย่อยทั้งหมด {n} รายการจะกลับเป็น "ยังไม่เริ่ม" ประวัติการเสร็จเดิมยังเก็บไว้ | เปิดใหม่ทั้งหมด |
| ลบงานที่มีงานลูก | **ลบ "{title}"?** งานย่อยและรายการย่อย {n} รายการจะถูกลบด้วย (เสร็จแล้ว {d}) ความคิดเห็นและไฟล์ในงานเหล่านี้จะถูกซ่อน กดเลิกทำได้ภายใน 10 วินาที | ลบ {n+1} รายการ |
| เปลี่ยนช่องทางใน wizard | **เปลี่ยนช่องทาง?** ห้าง รูปแบบชั้นวาง และวันวางขายที่เลือกไว้จะถูกล้าง แต่สินค้าที่เลือกยังอยู่ | เปลี่ยนช่องทาง |
| ทำร่างต่อ | **มีข้อเสนอที่ทำค้างไว้** ({ห้าง} · {n} สินค้า · แก้ไขล่าสุด {เวลา}) ทำต่อหรือไม่? | ทำต่อ / เริ่มใหม่ |
| พักไว้ | **พักข้อเสนอนี้ไว้?** ระหว่างพัก ระบบจะไม่นับงานเกินกำหนดและไม่ส่งการแจ้งเตือน · เหตุผล* | พักไว้ |
| ยืนยันวางขายแล้ว | **ยืนยันว่าสินค้าวางขายแล้ว** สินค้าขึ้นชั้น (หรือ Go-live) แล้วเมื่อวันที่ [{วันนี้}] · ใช้คำนวณสถานะล่าช้าและอัตราวางขายตรงเวลา | บันทึกวันวางขายจริง |
| ยกเลิกข้อเสนอ | **ยกเลิกข้อเสนอ {code}?** เลือกเหตุผล ข้อเสนอจะเป็นแบบอ่านอย่างเดียว · ถ้าเลือก "ห้าง/Buyer ไม่รับ": สินค้าที่รอผล {n} รายการจะถูกตั้งเป็น "ไม่ผ่าน" | ยกเลิกข้อเสนอ / **กลับ** |
| ปิดข้อเสนอ | **ปิดข้อเสนอ: ยืนยันผลรายสินค้า** วันวางขายจริง [{วันที่}] · ถ้ายังไม่ครบ: งานยังไม่ครบ ({p}%) ต้องระบุเหตุผลในการปิด | ปิดข้อเสนอ |
| เปิดใหม่ | **เปิดข้อเสนอนี้ใหม่?** งานและผลรายสินค้าคงเดิม · เหตุผล* · ถ้าเจ้าของเดิมถูกปิดบัญชี: เลือกเจ้าของใหม่* | เปิดใหม่ |
| เปลี่ยนวันวางขาย | **เปลี่ยนวันวางขาย** จาก {เดิม} เป็น {ใหม่} ({±N} วัน) ☑ เลื่อนงานที่ยังไม่เสร็จ {n} งานไป {±N} วันด้วย · เหตุผล* | บันทึก |
| ปิดใช้งานห้าง | **ปิดใช้งาน {name}?** ห้างนี้ถูกใช้ใน {n} ข้อเสนอ (ยังดำเนินการ {a}) และจะไม่แสดงใน wizard อีก แต่ข้อเสนอเดิมยังเห็นชื่อพร้อมป้าย "(ปิดใช้งาน)" | ปิดใช้งาน |
| ตั้งแม่แบบเริ่มต้น | **ตั้งเป็นค่าเริ่มต้น?** จะแทนที่ "{เดิม}" สำหรับ {ช่องทาง} · {รูปแบบ} | ตั้งเป็นค่าเริ่มต้น |
| เปลี่ยนบทบาท | **เปลี่ยนบทบาทของ {ชื่อ} เป็น {role}?** ผู้ใช้จะถูกออกจากระบบและต้องเข้าใหม่ | เปลี่ยนบทบาท |
| รีเซ็ตรหัสผ่าน | **รีเซ็ตรหัสผ่านของ {ชื่อ}?** ระบบจะออกรหัสชั่วคราวใหม่ (ใช้ได้ 72 ชั่วโมง) และออกจากระบบทุกอุปกรณ์ของผู้ใช้นี้ | รีเซ็ตรหัสผ่าน |
| แสดงรหัสชั่วคราว | **รหัสผ่านชั่วคราวของ {ชื่อ}** แสดงครั้งเดียวเท่านั้น ใช้ได้ภายใน 72 ชั่วโมง คัดลอกแล้วส่งให้ผู้ใช้ทางช่องทางที่ปลอดภัย ผู้ใช้ต้องตั้งรหัสใหม่เมื่อเข้าระบบครั้งแรก · ปิดโดยยังไม่คัดลอก: "ยังไม่ได้คัดลอกรหัสผ่าน ปิดแล้วจะดูอีกไม่ได้" | คัดลอก / เสร็จสิ้น |
| ปิดบัญชี | **ปิดบัญชี {ชื่อ}** (3 ขั้น) โอนข้อเสนอ {n} รายการ · โอนงาน {m} งาน · ยืนยัน ผู้ใช้จะถูกออกจากระบบทันที | ปิดบัญชี |

### 10.4 Error

| Code / กรณี | ข้อความ |
|---|---|
| `INVALID_CREDENTIALS` | อีเมลหรือรหัสผ่านไม่ถูกต้อง |
| `ACCOUNT_LOCKED` | บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผิดหลายครั้ง ลองใหม่ได้ในอีก {m} นาที |
| `TEMP_PASSWORD_EXPIRED` | รหัสผ่านชั่วคราวหมดอายุแล้ว ติดต่อผู้ดูแลระบบเพื่อขอรหัสใหม่ |
| `SESSION_EXPIRED` | หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง |
| `FORBIDDEN` | คุณไม่มีสิทธิ์ทำรายการนี้ ถ้าคิดว่าควรมีสิทธิ์ ติดต่อผู้ดูแลระบบ |
| `FORBIDDEN` + `SUBTREE_HAS_OTHERS_ITEMS` | ลบหรือย้ายไม่ได้ เพราะมีรายการที่คนอื่นสร้างอยู่ข้างใน ติดต่อเจ้าของข้อเสนอ |
| `PROPOSAL_NOT_FOUND` | ไม่พบข้อเสนอนี้ หรือคุณไม่มีสิทธิ์เข้าถึง |
| `VERSION_CONFLICT` | งานนี้ถูกแก้ไขโดย {ชื่อ} เมื่อสักครู่ [โหลดข้อมูลล่าสุด] |
| `TASK_DEPTH_EXCEEDED` | รายการย่อยเป็นระดับสุดท้าย เพิ่มหรือย้ายงานให้ลึกกว่านี้ไม่ได้ |
| `POSITION_STALE` | ลำดับงานเพิ่งเปลี่ยน ระบบโหลดใหม่แล้ว ลองย้ายอีกครั้ง |
| `DATE_ORDER` | วันเริ่มต้องไม่หลังวันครบกำหนด |
| `ASSIGNEE_INACTIVE` | {ชื่อ} ถูกปิดบัญชีแล้ว เลือกผู้รับผิดชอบคนอื่น |
| `OWNER_INACTIVE` | เจ้าของข้อเสนอถูกปิดบัญชีแล้ว เลือกเจ้าของใหม่ก่อน |
| `LAUNCH_DATE_IN_FUTURE` | วันวางขายจริงต้องไม่เป็นวันในอนาคต |
| `LAUNCH_DATE_REQUIRED` | กรุณาระบุวันวางขายจริงก่อนปิดข้อเสนอ |
| `FILE_TOO_LARGE` | ไฟล์ใหญ่เกิน {maxUploadMb} MB ลองบีบอัด หรือแนบเป็นลิงก์แทน |
| `FILE_TYPE_NOT_ALLOWED` | ไม่รองรับไฟล์ชนิดนี้ ใช้ได้: PDF, Excel (.xlsx), Word (.docx), PowerPoint (.pptx), CSV, JPG, PNG, WebP · ไฟล์ .xls ให้บันทึกเป็น .xlsx ก่อน |
| ลิงก์ไม่ใช่ https | ลิงก์ต้องขึ้นต้นด้วย https:// |
| `SKU_TAKEN` | รหัสสินค้า {sku} มีอยู่แล้ว |
| `NAME_TAKEN` | มีห้างชื่อ {name} ในช่องทางนี้แล้ว |
| `IN_USE` | ลบไม่ได้ เพราะถูกใช้ใน {n} ข้อเสนอ ใช้การปิดใช้งานแทน |
| `LAST_ADMIN` | ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน |
| `SELF_ROLE_CHANGE` / `SELF_DEACTIVATE` | เปลี่ยนบทบาทหรือปิดบัญชีของตัวเองไม่ได้ |
| `MEMBER_HAS_OPEN_TASKS` | {ชื่อ} ยังรับผิดชอบ {n} งาน โปรดโอนงานก่อน |
| `INACTIVE_REFERENCE` (BR-09) | เริ่มดำเนินการไม่ได้: {รายการ} ถูกปิดใช้งาน เปลี่ยนเป็นรายการที่ใช้งานอยู่ก่อน |
| `LAST_PRODUCT` | ข้อเสนอต้องมีสินค้าอย่างน้อย 1 รายการ ถ้า buyer ไม่รับทั้งหมด ให้ยกเลิกข้อเสนอแทน |
| เกินจำนวน | เลือกได้สูงสุด 20 ห้างต่อครั้ง · เลือกได้สูงสุด 50 สินค้าต่อข้อเสนอ |
| `PASSWORD_POLICY` / `PASSWORD_REUSED` | รหัสผ่านต้องยาว 8–128 ตัว และมีทั้งตัวอักษรและตัวเลข · ใช้รหัสผ่านเดิมซ้ำไม่ได้ · รหัสผ่านทั้งสองช่องไม่ตรงกัน |
| `BATCH_INVALID` (BR-21) | ยังไม่ได้สร้างข้อเสนอใด เพราะ {n} รายการมีปัญหา แก้รายการที่ไฮไลต์แล้วลองใหม่ |
| Network | เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ |
| `INTERNAL` | ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง ถ้ายังไม่ได้ แจ้งผู้ดูแลพร้อมรหัสอ้างอิง {requestId} |

### 10.5 Toast และ tooltip เมื่อปุ่ม disabled

**Toast:** สร้างข้อเสนอ {code} แล้ว · สร้าง {n} ข้อเสนอเรียบร้อย · บันทึกร่างแล้ว ยังไม่แจ้งเตือนผู้รับผิดชอบ · เริ่มดำเนินการแล้ว แจ้งผู้รับผิดชอบ {n} คน · ทำเครื่องหมายเสร็จ {n} รายการ · งาน "{title}" เสร็จครบแล้ว · เสร็จแล้ว 1 งาน [เลิกทำ] · ลบ {n} รายการแล้ว [เลิกทำ] · มอบหมายให้ {ชื่อ} แล้ว และเพิ่มเป็นผู้ติดตามข้อเสนออัตโนมัติ · เลื่อน {n} งาน {±d} วันแล้ว · บันทึกวันวางขายจริงแล้ว · ส่งคำขอเพิ่มห้างแล้ว ผู้ดูแลจะได้รับแจ้งเตือน · ปลดค่าเริ่มต้นของแม่แบบแล้ว · คัดลอกแล้ว · เก็บข้อเสนอที่ทำค้างไว้ในเครื่องนี้แล้ว

**Tooltip:**
- เฉพาะเจ้าของข้อเสนอเปลี่ยนวันวางขายได้
- ปิดข้อเสนอได้เมื่องานครบ 100% (เหลือ {n} งาน)
- ข้อเสนอนี้ปิดแล้ว ต้องให้ผู้จัดการเปิดใหม่ก่อนจึงแก้ไขได้
- คุณติ๊กได้เฉพาะงานที่คุณรับผิดชอบ
- สถานะของงานนี้คำนวณจากงานย่อย
- รายการย่อยเป็นระดับสุดท้าย
- ลบไม่ได้ เพราะมีรายการของคนอื่นอยู่ข้างใน
- ถูกใช้ใน {n} ข้อเสนอ จึงลบไม่ได้ ใช้การปิดใช้งานแทน
- เปลี่ยนบทบาทของตัวเองไม่ได้
- เลือกได้สูงสุด 20 ห้างต่อครั้ง

---

## 11. รายการที่ต้องยืนยันและข้อตกลงกับ backend

### 11.1 ควรยืนยันกับทีม Trade

1. บริษัทมี brand color และโลโก้ที่ต้องใช้หรือไม่ (ตอนนี้ใช้ indigo ชั่วคราว) และไฟล์โลโก้กับสีของแต่ละห้างที่ได้รับอนุญาตให้ใช้ในระบบภายใน
2. ใช้มือถือหน้าห้างบ่อยแค่ไหน ซึ่งกำหนดลำดับงานฝั่ง mobile และความเด่นของปุ่ม "ถ่ายรูปหน้าร้าน"
3. ปุ่ม "ยืนยันวางขายแล้ว" และการกรอกวันวางขายจริงตอนปิดข้อเสนอ ตรงกับวิธีทำงานจริงหรือไม่ (ใครเป็นคนยืนยัน และยืนยันจากรูปหน้าร้านหรือไม่)
4. ต้องตัดงานบางข้อออกจากแม่แบบตั้งแต่ใน wizard หรือไม่ (วางเป็น Should ใน MVP ถ้าไม่ทัน ให้ลบหลังสร้างพร้อมเลิกทำ 10 วินาที)
5. USER ต้องขอเพิ่มสินค้าใหม่จากใน wizard ได้หรือไม่ (MVP ให้นำเข้าสินค้าก่อน go-live และ MANAGER เพิ่มเร็วใน wizard ได้)
6. มุมมอง board ของข้อเสนอต้องลากเพื่อเปลี่ยนสถานะได้หรือไม่ (Phase 2)
7. การไม่มี "เลิกทำ" หลังติ๊กงานแม่แบบ cascade ใน MVP (มี dialog ยืนยันแทน)
8. ค่าเริ่มต้นการแสดงปีเป็น พ.ศ. (Q11)

### 11.2 ข้อตกลงกับ backend (สรุป ยึดตาม [04-api.md](04-api.md))

| เรื่อง | ข้อตกลง |
|---|---|
| ชื่อ field | ตาม glossary และ `schema.prisma`: `targetDate`, `actualLaunchDate`, `status` (ไม่มี `isDone`), `TaskAssignee[]` + `isPrimary`, `level`, `sortOrder` (int gap 1024) |
| Permission key | ชุดเดียวใน `packages/shared/src/permissions.ts` (04-api §4.1) |
| object `can` | `ProposalAbilitiesDto` = `{ edit, changeTargetDate, changeShelfType, changeStore, confirmLaunch, manageMembers, transferOwner, delete, manageTasks, comment, attach, forceComplete, reopen, transitions }` · `TaskAbilitiesDto` = `{ edit, delete, move, addChild, assign, setStatus, attach, comment }` |
| Task tree | `GET /proposals/:id/tasks` คืน flat `TaskDto[]` · ทุก mutation ของงานคืน `MutationResult<T>` ที่มี `patch.tasks` และ `patch.proposal` |
| ติ๊กงาน | `PUT /tasks/:id/status { status, cascade }` ไม่มี `version` · ไม่มี endpoint เลิกทำ cascade ใน MVP |
| ย้ายงาน | `PATCH /tasks/:id/move { version, parentId, afterId?, beforeId? }` ส่งแค่ `afterId` หรือแค่ `beforeId` ได้ |
| Wizard | `batchId` ใน body เป็น idempotency key (ไม่มี header `Idempotency-Key`) · `excludedTemplateItemIds` รองรับแล้ว UI เป็น [Should] · หลายข้อเสนอไปที่ `/proposals?batchId=` |
| งานทั้งฝ่าย | `GET /dashboard/tasks?due=OVERDUE\|THIS_WEEK&unassigned=true&assigneeId=…` |
| Concurrency | `version` สำหรับ Proposal/Task · `expectedUpdatedAt` สำหรับข้อมูลหลักและ template editor · error `VERSION_CONFLICT` พร้อม `conflict.lastModifiedBy` |
| Session และรหัสผ่าน | idle 8 ชม. / absolute 7 วัน ไม่มี "จดจำฉัน" · รหัส 8–128 ตัว มีตัวอักษรและตัวเลข · login ด้วยอีเมลเท่านั้น · เปลี่ยนรหัสครั้งแรกไม่ถามรหัสเดิม |
| ระยะเวลาเลิกทำการลบ | 10 วินาที (`POST /tasks/:id/restore { deletedAt }`) |
| ไฟล์ | อัปโหลด ≤ 20 MB · ชนิดไฟล์ไม่รวม `.xls` · ดาวน์โหลดแบบ stream ผ่าน API |
