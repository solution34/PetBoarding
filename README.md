# PetBoarding 宠物寄养预约与照护管理系统

面向单家宠物寄养门店的 Web 项目，用于《软件需求工程》课程的需求分析、UML 建模及 MVP 演示。主人通过浏览器预约寄养、查看照护进度，门店工作人员处理分房、入住、照护与离店结算。

当前需求版本为 **V1.2**。仓库包含需求与建模资料，以及**可运行的 Web Demo**（Vue 3 + TypeScript + Vite、Express + TypeScript、SQLite、Session 登录）；API 级自动化验收 30/30 通过。UML 图、预览及实验报告仍待同步至 V1.2，冲突时以 V1.2 需求与 Demo 行为为准。

## 快速开始

环境要求：Node.js ≥ 22.5（后端使用内置 `node:sqlite`）、npm。

```bash
npm install     # 首次安装依赖
npm run build   # 编译后端并构建前端（apps/web/dist）
npm start       # 启动演示服务：http://localhost:3000
```

首次启动自动创建 `data/petboarding.db` 并写入演示种子数据。需要恢复初始数据时执行 `npm run db:reset`（删除本地数据库后重新初始化）。演示操作步骤见 [演示操作指南](docs/演示操作指南.md)。

演示账号（登录页可一键填入）：

| 登录名 | 密码 | 角色 | 显示名 |
|---|---|---|---|
| ownerA | owner123 | 宠物主人 | 王小明（有猫「咪咪」4.2kg、犬「旺财」18kg） |
| ownerB | owner123 | 宠物主人 | 李小红（有犬「球球」30kg、猫「糖糖」3.8kg） |
| staff | staff123 | 工作人员 | 张店长 |
| admin | admin123 | 管理员 | 赵管理 |

管理员不因身份自动获得工作人员业务权限；门店日期按 `Asia/Shanghai` 自然日计算。

## MVP 功能

| 角色 | 本版功能 |
|---|---|
| 宠物主人 | 预设账号登录、维护宠物档案、查询房型与余量、提交及取消预约、查看订单、照护记录和账单 |
| 工作人员 | 审核与分房、驳回预约、登记入住、手动标记失约、创建与完成照护任务、登记线下收款并结单 |
| 管理员 | 维护房型日价及房间基础资料 |

核心流程：**宠物建档 → 查询房型 → 提交预约 → 审核分房 → 入住 → 日常照护 → 离店结算**。

## 业务规则

- 固定四种房型：猫舍标间、猫舍豪华间、犬舍标间、犬舍豪华间；一张预约一只宠物，一宠一间。
- 房型统一日价，提交预约时锁价，审核不改价；页面价格变化时需要主人重新确认。
- 待审核不占房，审核通过后分配具体房间。余量按同一房间在整个预约区间内连续可用计算，不拼接不同房间的空闲半段；查询与普通审核排除当前实际占用房间。
- 预约区间为 `[开始日, 离店日)`，按自然日差计费，最少一天，门店时区为 `Asia/Shanghai`。
- 允许预约区间内延迟入住并记录原因；延迟入住和提前接回均不减少原计划基础费。
- 逾期按自然日差增加费用，同一自然日内不按小时加收。
- 照护任务由工作人员手动创建和完成；离店时取消剩余待完成任务并保留历史。
- 账单仅含基础费与逾期费，线下全额收款后结束入住并释放实际占用。

示例：日价 80 元，预约 11 月 1 日至 4 日，基础费为 240 元。延迟入住或提前接回仍收 240 元；11 月 5 日离店，应收 320 元。

本版聚焦正常业务闭环，保留权限、归属、必填、日期、状态和普通房态检查。复杂异常协调、并发处理、幂等重试及故障恢复暂缓。

自主注册、图片上传、自动照护提醒、站内通知、附加服务、在线支付、在线改期、多门店和视频等不进入本版。

## 技术架构

以下技术方案已落地在 `apps/server` 与 `apps/web`。

| 部分 | 技术 | 职责 |
|---|---|---|
| 前端 | Vue 3 + TypeScript + Vite | 页面、表单、角色导航与浏览器交互 |
| 后端 | Node.js + TypeScript + Express | 权限校验、业务规则与 HTTP API |
| 数据库 | SQLite（Node 内置 `node:sqlite`） | 持久保存账号、宠物、预约、照护与结算数据 |
| 登录 | 服务端 Session + Cookie | 预设账号会话与角色识别，密码 scrypt 加盐散列 |

```text
电脑 / 手机浏览器
        │
    Vue 3 网页（apps/web）
        │ HTTP API /api
    Express 后端（apps/server）
        │
    SQLite 数据库（data/petboarding.db）
```

前后端代码分开组织：后端按路由层、业务规则与数据访问组织（`src/features`、`src/db`、`src/lib`、`src/middleware`）。演示部署由后端同时提供打包后的网页与 API；开发时可用 `npm run dev:server` 与 `npm run dev:web`（Vite 代理 `/api` 到 `http://localhost:3000`）。最终金额与访问权限均由后端校验。

数据库运行文件保存在本地 `data/`（不提交），由后端首次启动自动建表并写入种子数据，也可执行 `npm run db:reset` 重新初始化；源表结构与种子数据在 `apps/server/src/db/`。

## 目录

```text
PetBoarding/
├── README.md
├── package.json                 # npm workspaces 与统一脚本
├── apps/
│   ├── server/                  # Express + TypeScript + SQLite 后端
│   │   └── src/                 # 路由/业务规则/数据层、schema、种子数据、脚本
│   └── web/                     # Vue 3 + TypeScript + Vite 前端
│       └── src/                 # 路由、API 客户端、页面与组件
├── tests/
│   └── acceptance/              # V1.2 验收自动化脚本与执行结果
├── docs/                        # API 契约、演示指南、验收执行记录
├── data/                        # 本地 SQLite 运行文件（首次启动生成，不提交）
└── PetBoarding_Requirements_Project/
    ├── README.md
    ├── 工程阅读入口.html
    ├── 01_项目与需求/
    ├── 02_UML图源文件/
    ├── 03_UML图预览/
    ├── 04_实验报告/
    └── 05_核对与答辩/
```

## 验收与测试

```bash
npm run build:server                 # 验收脚本导入 apps/server/dist/app.js
node tests/acceptance/run.mjs        # 或 npm run test:acceptance
```

- 脚本为 API 级自动化：进程内启动后端、独立临时数据库、注入可控门店日期，覆盖 TC01–TC05、TC07、TC09–TC12、TC15、TC17、TC18、TC23–TC31 及契约级断言，当前 **30/30 通过（连续两轮一致）**。
- 结果记录：[验收执行记录](docs/验收执行记录.md)；接口契约：[docs/API.md](docs/API.md)；操作步骤：[演示操作指南](docs/演示操作指南.md)。
- 该脚本不覆盖浏览器 UI 渲染与移动端可读性，界面需人工走查；并发、故障恢复、备份压测等延期项未作已验证声明。

## 文档入口

- [MVP 需求基线](PetBoarding_Requirements_Project/01_项目与需求/00_MVP需求基线.md)
- [软件需求规格说明书](PetBoarding_Requirements_Project/01_项目与需求/02_软件需求规格说明书.md)
- [详细用例说明](PetBoarding_Requirements_Project/01_项目与需求/03_详细用例说明.md)
- [需求追踪矩阵](PetBoarding_Requirements_Project/01_项目与需求/04_需求追踪矩阵.md)
- [课程要求对照与建设计划](PetBoarding_Requirements_Project/01_项目与需求/05_课程要求对照与建设计划.md)
- [MVP 验收场景](PetBoarding_Requirements_Project/05_核对与答辩/01_验收场景.md)
- [API 契约](docs/API.md) / [演示操作指南](docs/演示操作指南.md) / [验收执行记录](docs/验收执行记录.md)

需求基线、需求规格、用例、追踪矩阵与验收场景已更新至 V1.2。HTML 阅读入口、UML 和实验报告仍包含旧版规则，使用时以 V1.2 文档为准。

## 课程成果与后续工作

课程成果包括用例图、类图、顺序图、活动图及充分文字说明；网页 Demo 用于验证业务流程。实验一的教务系统体验分析需单独完成。

已完成的后续工作：初始化前后端与数据库，实现最小业务闭环，并按验收场景完成 API 级自动化验证（30/30）与执行记录。仍待完成：同步 UML 图、SVG、HTML 阅读入口和实验报告至 V1.2；在真实浏览器与移动端做界面走查并保存截图证据；按教师要求补齐成员信息、AI 辅助与人工核验记录。当前自动化验收结论只代表 API 行为，不代表浏览器 UI 已通过测试。
