# FlowTrade

ระบบงานเสนอสินค้าเข้าห้าง (Offline) และแพลตฟอร์มออนไลน์ สำหรับฝ่าย Trade
— เลือกสินค้า → ห้าง/แพลตฟอร์ม → ประเภท Shelf → จองวันวางขาย → วางไทม์ไลน์ แล้วได้รายการงาน 3 ระดับ
(Task → Sub task → Mini task) พร้อมกำหนดระยะเวลา ผู้รับผิดชอบ และ checklist ติดตามความคืบหน้า

## โครงสร้าง (npm workspaces)

```
flowTrade/
├── apps/
│   ├── web/          # Frontend: React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui
│   └── api/          # Backend: NestJS 12 + Prisma 7 + PostgreSQL (schema "flowtrade")
├── packages/
│   └── shared/       # Types, ป้ายภาษาไทย, สิทธิ์ (RBAC), logic ของ task tree — ใช้ร่วมกัน web/api
└── docs/             # เอกสารออกแบบระบบ
```

## รันในเครื่อง

```bash
npm install
npm run dev        # shared (watch) + API :3000 + web :5173 — เปิด http://localhost:5173
```

- ค่าเชื่อมต่อฐานข้อมูลอยู่ที่ `apps/api/.env` (ไม่ถูก commit) — ดูตัวอย่างที่ `apps/api/.env.example`
- ตารางทั้งหมดอยู่ใน schema `flowtrade` เท่านั้น ไม่แตะ schema อื่นในฐานข้อมูล
- เข้าสู่ระบบได้ทั้งด้วย **ชื่อผู้ใช้** หรือ **อีเมล**

## ฐานข้อมูล

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run db:migrate` | สร้าง/อัปเดตตารางใน schema `flowtrade` (`prisma migrate deploy`) |
| `npm run db:bootstrap` | ติดตั้งครั้งแรก: สร้างประเภท Shelf มาตรฐาน (Exclusive / Normal) และ Admin คนแรกจาก `ADMIN_EMAIL` ถ้ายังไม่มี (ไม่มีข้อมูลตัวอย่าง) |
| `npm run db:reset-empty -- --yes` | ⚠️ ล้างข้อมูลทั้งหมดใน `flowtrade` เหลือแค่ Admin และประเภท Shelf มาตรฐาน (Admin ได้รหัสผ่านชั่วคราวใหม่ใน `apps/api/.admin-initial-password`) |

ระบบไม่มีข้อมูลตัวอย่าง (mock) แล้ว — ห้าง สินค้า แม่แบบ Task และผู้ใช้ เพิ่มได้จากเมนู "ผู้ดูแลระบบ"
API ทั้งหมดอธิบายไว้ใน [apps/api/ENDPOINTS.md](apps/api/ENDPOINTS.md)
