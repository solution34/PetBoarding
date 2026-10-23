# 宠物寄养系统 V1.2 Demo API 契约

版本：V1.2-demo-1；日期：2026-10-23。本文件是前端、后端与验收脚本的共同契约，改动须同步三者。
需求依据：[MVP需求基线](requirements/01_项目与需求/00_MVP需求基线.md)、[软件需求规格说明书](requirements/01_项目与需求/02_软件需求规格说明书.md)、[验收场景](requirements/05_核对与答辩/01_验收场景.md)。

## 1. 通用约定

- 基础路径：`/api`；请求与响应均为 `application/json; charset=utf-8`。
- 认证：登录成功后服务端下发 HttpOnly Cookie `pb_session`（SameSite=Lax，默认 8 小时有效）。除 `/api/auth/login` 与 `/api/health` 外，所有接口都需要有效会话。
- 金额：整数，单位人民币分（`...Fen` 后缀）。
- 日期：业务日期为 `YYYY-MM-DD`，按门店时区 `Asia/Shanghai` 解释；时间戳为 ISO 8601 字符串。
- 错误响应统一结构：

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "中文提示", "details": {} } }
```

| HTTP | code | 含义 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 必填、格式、数值或日期校验失败；`details.field` 指出字段 |
| 401 | `UNAUTHENTICATED` | 未登录或会话过期 |
| 401 | `LOGIN_FAILED` | 账号或密码错误 |
| 403 | `FORBIDDEN` | 角色不符或资源不属于当前账号 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `INVALID_STATE` | 当前状态不允许该操作 |
| 409 | `PRICE_CHANGED` | 提交时服务端价格与页面确认价格不一致 |
| 409 | `PET_OVERLAP` | 该宠物已有区间重叠的已确认/已入住预约 |
| 409 | `ROOM_UNAVAILABLE` | 房间不可用（房型不符、体重不符、区间冲突、当前被占） |
| 409 | `ROOM_IN_USE` | 房间存在未完成预约，不能修改体重限制 |
| 400 | `LATE_REASON_REQUIRED` | 延迟入住未填写原因 |
| 400 | `CHECKIN_DATE_INVALID` | 当前日期不在允许入住区间 |
| 400 | `PAYMENT_INVALID` | 未确认主人核对或收款方式非法 |

- 角色：`owner`（宠物主人）、`staff`（工作人员）、`admin`（管理员）。权限见第 4 节。
- 预约状态：`pending` 待审核、`confirmed` 已确认、`rejected` 已驳回、`cancelled` 已取消、`checked_in` 已入住、`missed` 已失约、`completed` 已完成。
- 照护任务状态：`pending` 待完成、`completed` 已完成、`cancelled` 已取消。
- 照护任务类型：`feeding` 喂食、`water` 饮水、`cleaning` 清洁、`other` 其他。

## 2. 预置账号与种子数据

初始化脚本写入以下数据，密码使用 scrypt 加盐散列存储，登录页面会展示演示账号。

| 登录名 | 密码 | 角色 | 显示名 |
|---|---|---|---|
| ownerA | owner123 | owner | 王小明（主人A） |
| ownerB | owner123 | owner | 李小红（主人B） |
| staff | staff123 | staff | 张店长（工作人员） |
| admin | admin123 | admin | 赵管理（管理员） |

宠物：主人A有「咪咪」（猫，4.2kg，联系人 13800000001，备注：怕生，需轻声安抚；每日喂食两次；疫苗：猫三联已接种）与「旺财」（犬，18kg，联系人 13800000002）；主人B有「球球」（犬，30kg，联系人 13800000003）。

房型与房间：

| 房型 | 物种 | 日价（分） | 房间（编号/最大体重kg） |
|---|---|---|---|
| 猫舍标间 | cat | 8000 | C101 / 6、C102 / 6 |
| 猫舍豪华间 | cat | 12000 | C201 / 8、C202 / 8 |
| 犬舍标间 | dog | 10000 | D101 / 25、D102 / 25 |
| 犬舍豪华间 | dog | 15000 | D201 / 40、D202 / 40 |

## 3. 数据结构

```ts
type Account = { id: number; displayName: string; loginName: string; roles: Role[] }

type Pet = {
  id: number; ownerId: number; name: string
  species: 'cat' | 'dog'; weight: number; contact: string
  careNotes: string; vaccineNotes: string
}

type RoomType = { id: number; name: string; species: 'cat' | 'dog'; dailyPriceFen: number }
type Room = { id: number; roomTypeId: number; name: string; maxWeight: number }
type RoomChoice = { id: number; name: string; maxWeight: number }

type Reservation = {
  id: number
  ownerId: number; ownerDisplayName: string
  petId: number; pet: Pet
  roomTypeId: number; roomType: RoomType
  roomId: number | null; room: Room | null
  startDate: string; endDate: string; plannedDays: number
  dailyPriceSnapshotFen: number; baseFeeFen: number   // baseFeeFen = 快照日价 × plannedDays
  status: ReservationStatus
  reason: string | null                                // 驳回/取消/失约原因
  createdAt: string; reviewedBy: number | null; reviewedAt: string | null
  stay: null | {
    id: number; checkInAt: string; checkOutAt: string | null
    inspectionNotes: string; lateReason: string | null; checkInStaffId: number
  }
}

type CareTask = {
  id: number; reservationId: number
  kind: 'feeding' | 'water' | 'cleaning' | 'other'
  plannedAt: string; instruction: string
  status: 'pending' | 'completed' | 'cancelled'
  createdAt: string; createdBy: number; createdByName: string
  record: null | {
    id: number; staffId: number; staffName: string; completedAt: string; notes: string
  }
}

type Bill = {
  reservationId: number
  plannedDays: number; dailyPriceFen: number; baseFeeFen: number
  overdueDays: number; overdueFeeFen: number; totalFen: number
  computedOn: string                    // 计算所依据的“今天”
  actualCheckInDate: string | null; actualCheckOutDate: string | null
  settled: boolean
  invoice: null | {
    id: number; plannedDays: number; dailyPriceFen: number; baseFeeFen: number
    overdueDays: number; overdueFeeFen: number; totalFen: number
    status: 'paid'; computedOn: string; createdAt: string
  }
  receipt: null | {
    id: number; amountFen: number; method: 'cash' | 'transfer'
    staffId: number; staffName: string; paidAt: string
  }
}

type StaySummary = {
  id: number; reservationId: number
  checkInAt: string; checkOutAt: string | null
  inspectionNotes: string; lateReason: string | null
  reservation: Reservation
  pendingTaskCount: number; completedTaskCount: number
}

type AvailabilityItem = {
  roomTypeId: number; name: string; species: 'cat' | 'dog'
  dailyPriceFen: number; plannedDays: number
  totalFen: number                      // 日价 × plannedDays（计划基础费）
  availableRooms: number
}
```

## 4. 接口清单与权限

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 公开 | 健康检查，返回服务器当前“今天” |
| POST | `/api/auth/login` | 公开 | 登录，下发会话 Cookie |
| POST | `/api/auth/logout` | 登录 | 退出并删除会话 |
| GET | `/api/auth/me` | 登录 | 当前账号 |
| GET | `/api/pets` | owner | 本人宠物列表 |
| POST | `/api/pets` | owner | 新建宠物 |
| PUT | `/api/pets/:id` | owner（本人） | 编辑宠物 |
| GET | `/api/room-types` | 登录 | 四类房型及日价 |
| GET | `/api/availability` | owner | 房型匹配与连续可用房间数 |
| POST | `/api/reservations` | owner | 提交预约（锁价） |
| GET | `/api/reservations` | owner（本人）/staff（全部） | 预约列表，可按 `status` 过滤 |
| GET | `/api/reservations/:id` | owner（本人）/staff | 预约详情 |
| GET | `/api/reservations/:id/candidate-rooms` | staff | 审核候选房间 |
| GET | `/api/reservations/:id/care-tasks` | owner（本人）/staff | 照护任务与记录 |
| GET | `/api/reservations/:id/bill` | owner（本人）/staff | 账单（在住时为按当日预览） |
| POST | `/api/reservations/:id/approve` | staff | 审核通过并分房 |
| POST | `/api/reservations/:id/reject` | staff | 驳回 |
| POST | `/api/reservations/:id/cancel` | owner（本人）/staff | 取消未入住预约 |
| POST | `/api/reservations/:id/no-show` | staff | 手动标记失约 |
| POST | `/api/reservations/:id/check-in` | staff | 办理入住 |
| POST | `/api/reservations/:id/care-tasks` | staff | 创建照护任务 |
| POST | `/api/care-tasks/:id/complete` | staff | 完成照护任务 |
| POST | `/api/reservations/:id/checkout` | staff | 登记全额线下收款并结单 |
| GET | `/api/stays` | staff | 在住列表（`?status=active`） |
| GET | `/api/admin/rooms` | admin | 房型与房间维护数据 |
| PUT | `/api/admin/room-types/:id` | admin | 修改房型日价 |
| PUT | `/api/admin/rooms/:id` | admin | 修改房间名称/最大体重 |

## 5. 接口细节

### 5.1 认证

`POST /api/auth/login`

```json
{ "loginName": "ownerA", "password": "owner123" }
```

- 200：`{ "account": Account }`，同时 `Set-Cookie: pb_session=...; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`。
- 401 `LOGIN_FAILED`：账号或密码错误（不区分具体原因）。
- 400 `VALIDATION_ERROR`：缺登录名或密码。

`POST /api/auth/logout`：204，删除会话并清除 Cookie；需有效会话，未登录返回 401 `UNAUTHENTICATED`。

`GET /api/auth/me`：200 `{ "account": Account }`；未登录 401。

### 5.2 宠物档案

`GET /api/pets` → 200 `{ "pets": Pet[] }`（仅本人）。

`POST /api/pets`

```json
{ "name": "咪咪", "species": "cat", "weight": 4.2, "contact": "13800000001", "careNotes": "", "vaccineNotes": "" }
```

- 校验：`name` 非空；`species` ∈ cat/dog；`weight` 为大于 0 的数字；`contact` 非空；备注可为空字符串。
- 201 → `{ "pet": Pet }`。
- 400 `VALIDATION_ERROR`，`details.field` 为 `name`/`species`/`weight`/`contact`。

`PUT /api/pets/:id`：请求与响应同新建；非本人宠物返回 403 `FORBIDDEN`；不存在 404。

### 5.3 房型查询与余量

`GET /api/room-types` → 200 `{ "roomTypes": RoomType[] }`。

`GET /api/availability?petId=1&startDate=2026-11-01&endDate=2026-11-04`

- 仅 owner；宠物须属于本人（否则 403）；`startDate` 不早于今天（400，`details.field=startDate`）；`startDate < endDate`（400，`details.field=endDate`）。
- 200：

```json
{
  "startDate": "2026-11-01",
  "endDate": "2026-11-04",
  "plannedDays": 3,
  "items": [AvailabilityItem]
}
```

- 匹配规则：`items` 仅包含「物种与宠物一致，且房型内存在 `maxWeight >= 宠物体重` 的房间」的房型；若某匹配房型下所有房间均不可用，仍返回该房型且 `availableRooms = 0`。无任何匹配房型时 `items` 为空数组。
- 连续可用计算：对每间候选房间，若存在与其计划区间 `[startDate, endDate)` 重叠（`a.start < b.end && b.start < a.end`）的 `confirmed` / `checked_in` 预约（`room_id` 为该房），或该房间当前存在未离店入住记录，则不算可用。查询不占房。
- `totalFen` 仅用于页面展示计划基础费，不作为提交依据。

### 5.4 提交预约（锁价）

`POST /api/reservations`

```json
{
  "petId": 1,
  "roomTypeId": 1,
  "startDate": "2026-11-01",
  "endDate": "2026-11-04",
  "confirmedDailyPriceFen": 8000
}
```

- 校验顺序：
  1. 宠物属于本人、房型存在、房型物种与宠物匹配、房型内存在满足体重的房间（否则 400/403）。
  2. 日期合法（同 5.3）；`plannedDays = endDate - startDate` 自然日差。
  3. 同宠物与 `confirmed`/`checked_in` 预约区间重叠 → 409 `PET_OVERLAP`。
  4. 服务端读取房型当前 `dailyPriceFen`；与 `confirmedDailyPriceFen` 不一致 → 409 `PRICE_CHANGED`，`details` 为 `{ "dailyPriceFen": 9000, "plannedDays": 3, "totalFen": 27000 }`，不创建预约；前端展示新价格与总价，由主人再次确认后重新提交。
- 201：`{ "reservation": Reservation }`，`status = pending`，保存 `dailyPriceSnapshotFen` 与 `plannedDays`，不分配房间、不占房。
- 待审核单不参与宠物区间重叠占用，也不参与房间可用性占用。

### 5.5 预约列表与详情

`GET /api/reservations?status=pending`

- owner：仅本人预约；staff：全部（可按 `status` 过滤）。
- 200 `{ "reservations": Reservation[] }`，按创建时间倒序。

`GET /api/reservations/:id` → 200 `{ "reservation": Reservation }`；owner 访问他人预约 403；不存在 404。

### 5.6 审核分房 / 驳回

`GET /api/reservations/:id/candidate-rooms`（staff，仅待审核单）

- 200 `{ "rooms": RoomChoice[] }`：同房型、`maxWeight >= 宠物体重`、区间内无 `confirmed`/`checked_in` 计划占用、当前未被实际占用的房间。

`POST /api/reservations/:id/approve`

```json
{ "roomId": 1 }
```

- 前置：`status = pending`，否则 409 `INVALID_STATE`。
- 校验房间存在、属于该房型、体重满足、区间可用；房间当前被实际占用同样 409 `ROOM_UNAVAILABLE`。
- 200：`{ "reservation": Reservation }`，`status = confirmed`，写入 `roomId`、`reviewedBy`、`reviewedAt`，价格快照不变。

`POST /api/reservations/:id/reject`

```json
{ "reason": "房间与宠物过敏史不匹配" }
```

- 前置 `pending`；`reason` 必填。200 返回预约，`status = rejected`，不占房，原因可在详情查看。

### 5.7 取消与失约

`POST /api/reservations/:id/cancel`（owner 本人或 staff）

```json
{ "reason": "行程有变" }
```

- 前置：`pending` 或 `confirmed`；`reason` 必填；已入住/终态返回 409 `INVALID_STATE`。
- 200：`status = cancelled`，保留已分配房间号用于历史展示，释放计划占用（可用性不再计入）。

`POST /api/reservations/:id/no-show`（staff）

```json
{ "reason": "到店日未到店，电话确认后标记失约" }
```

- 前置：`confirmed` 且门店今天 ≥ `endDate`；`reason` 必填。
- 200：`status = missed`，释放计划占用；本版无自动扫描。

### 5.8 办理入住

`POST /api/reservations/:id/check-in`（staff）

```json
{ "inspectionPassed": true, "inspectionNotes": "精神状态良好，无皮肤异常", "lateReason": "主人航班延误" }
```

- 前置：`status = confirmed`。
- 日期：`startDate <= 今天 < endDate`，否则 400 `CHECKIN_DATE_INVALID`。
- `inspectionPassed` 必须为 `true`，否则 400 `VALIDATION_ERROR`（资料核验未通过只提示，不建入住）。
- 若 `今天 > startDate` 必须提供非空 `lateReason`，否则 400 `LATE_REASON_REQUIRED`；`今天 == startDate` 时可省略。
- 实际房间检查：该房间无未离店入住记录，否则 409 `ROOM_UNAVAILABLE`。
- 200：`{ "reservation": Reservation, "stay": Stay }`；预约转 `checked_in`，创建一条入住记录，`lateReason` 保存到入住记录；原定离店日与基础费用不变。

### 5.9 照护任务

`GET /api/reservations/:id/care-tasks`（owner 本人 / staff）→ 200 `{ "tasks": CareTask[] }`，按计划时间升序。

`POST /api/reservations/:id/care-tasks`（staff）

```json
{ "kind": "feeding", "plannedAt": "2026-11-01T18:00", "instruction": "按备注喂半袋猫粮" }
```

- 前置：存在未离店的入住记录（`checked_in` 且 `stay.checkOutAt` 为空）。
- 校验：`kind` 合法；`instruction` 非空；`plannedAt` 为本地时间（`YYYY-MM-DDTHH:mm` 或完整 ISO，未带时区按 `Asia/Shanghai` 解释），须晚于实际入住时间且不晚于计划离店日 23:59。
- 201 → `{ "task": CareTask }`，`status = pending`。

`POST /api/care-tasks/:id/complete`（staff）

```json
{ "notes": "已完成，进食正常" }
```

- 前置：任务为 `pending`，且所属入住未离店；`notes` 必填。
- 200 → `{ "task": CareTask }`，`status = completed`，保存执行人、完成时间与文字记录；一任务至多一条完成记录。

离店结单时，剩余 `pending` 任务自动转 `cancelled` 并保留历史；离店后不能新增或完成任务（409 `INVALID_STATE`）。

### 5.10 账单与离店结算

`GET /api/reservations/:id/bill`（owner 本人 / staff）

- 仅对 `checked_in` 或 `completed` 预约有意义；其他状态 400 `VALIDATION_ERROR`。
- 未结单时按“今天”实时预览：`baseFeeFen = 快照日价 × plannedDays`；`overdueDays = max(0, 今天 - endDate)`；`overdueFeeFen = overdueDays × 快照日价`；`totalFen = baseFeeFen + overdueFeeFen`；`settled=false`。
- 已结单时返回数据库中的账单与收款记录，`settled=true`，`computedOn` 为结单计算日。

`POST /api/reservations/:id/checkout`（staff）

```json
{ "paymentMethod": "cash", "ownerConfirmed": true }
```

- 前置：`status = checked_in` 且入住未结束；否则 409 `INVALID_STATE`。
- `ownerConfirmed` 必须为 `true`（主人已核对账单）；`paymentMethod` ∈ `cash`（现金）/ `transfer`（线下转账）；否则 400 `PAYMENT_INVALID`。
- 以门店今天为实际离店日：`今天 >= 入住日`；保存账单（Invoice）与全额收款（Receipt），账单状态 `paid`；入住写入 `checkOutAt`；预约转 `completed`；剩余待完成照护任务转 `cancelled`；释放实际占用。以上在一个数据库事务内完成。
- 200：`{ "bill": Bill, "reservation": Reservation }`。

### 5.11 在住列表

`GET /api/stays?status=active`（staff）→ 200 `{ "stays": StaySummary[] }`。

- 仅返回未离店入住记录（`checkOutAt` 为空），包含完整预约信息、迟到原因、任务数量统计，供在住照护与离店结算页面使用。

### 5.12 管理员维护

`GET /api/admin/rooms`（admin）→ 200

```json
{
  "roomTypes": [
    {
      "id": 1, "name": "猫舍标间", "species": "cat", "dailyPriceFen": 8000,
      "rooms": [{ "id": 1, "name": "C101", "maxWeight": 6, "activeReservationCount": 0 }]
    }
  ]
}
```

`PUT /api/admin/room-types/:id`（admin）

```json
{ "dailyPriceFen": 9000 }
```

- 校验非负整数。200 `{ "roomType": RoomType }`。改价只影响之后提交的预约，已保存快照不变。

`PUT /api/admin/rooms/:id`（admin）

```json
{ "name": "C101", "maxWeight": 6 }
```

- `name` 非空且全局唯一（重复 400 `VALIDATION_ERROR`，`details.field=name`）；`maxWeight` 为大于 0 的数字。
- 若修改了 `maxWeight` 且该房间存在未完成预约（`confirmed` 或 `checked_in`），返回 409 `ROOM_IN_USE`；只改名称不受此限制。
- 200 `{ "room": Room }`。

## 6. 演示日期覆盖（仅演示/自动化）

服务端读取可选环境变量 `PB_TODAY=YYYY-MM-DD`：设置后所有“今天”相关校验与账单计算使用该日期，业务操作记录（审核、入住、离店、照护完成等时间戳）的日期部分同样使用该日期（时分秒取真实时刻），`GET /api/health` 返回 `{ "today": "YYYY-MM-DD", "clockOverridden": true }`。正常演示不设置该变量，使用真实门店日期。仅用于可控日期下的验收场景，不允许作为生产配置。

## 7. 前端页面与接口对应

| 页面 | 路由 | 主要接口 |
|---|---|---|
| 登录 | `/login` | POST /auth/login |
| 主人·宠物档案 | `/owner/pets` | GET/POST/PUT /pets |
| 主人·查询与预约 | `/owner/book` | GET /room-types、GET /availability、POST /reservations |
| 主人·我的订单 | `/owner/orders` | GET /reservations |
| 主人·订单详情 | `/owner/orders/:id` | GET /reservations/:id、GET /care-tasks、GET /bill、POST /cancel |
| 工作人员·预约审核 | `/staff/review` | GET /reservations?status=pending、GET /candidate-rooms、POST /approve、POST /reject |
| 工作人员·入住办理 | `/staff/checkin` | GET /reservations?status=confirmed、POST /check-in、POST /no-show |
| 工作人员·在住照护 | `/staff/inhouse` | GET /stays、GET /reservations/:id/care-tasks、POST /care-tasks、POST /complete |
| 工作人员·离店结算 | `/staff/inhouse/:id` | GET /bill、POST /checkout、GET /care-tasks |
| 管理员·房型与房间 | `/admin/rooms` | GET /admin/rooms、PUT /admin/room-types/:id、PUT /admin/rooms/:id |

## 8. 验收编号与接口覆盖

| 验收 | 覆盖接口 |
|---|---|
| TC01/TC02 | auth、归属校验（pets/reservations/care-tasks/bill） |
| TC03 | pets |
| TC04/TC23 | availability |
| TC05/TC09/TC24 | reservations 提交锁价、admin 调价 |
| TC07/TC25 | candidate-rooms、approve、reject |
| TC10/TC11 | cancel、no-show |
| TC12/TC26/TC27 | check-in |
| TC15 | care-tasks、complete |
| TC17/TC18/TC30 | bill、checkout |
| TC28 | checkout 自动取消任务 |
| TC29 | 读取持久化数据 |
| TC31 | admin/rooms、admin/room-types |
