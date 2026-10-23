# V1.2 验收自动化执行结果（脚本自动生成）

- 生成时间：2026-10-23T02:15:07.988Z
- 需求版本：V1.2
- 后端产物：C:\Users\chenyue\Documents\ChatGPT\petboarding\apps\server\dist\app.js
- Node：v24.16.0；平台：win32 x64
- 场景总数：30；通过：30；失败：0

| 编号 | 场景 | 需求 | 结果 | 耗时 | 失败原因 |
|---|---|---|---|---|---|
| TC01 | 预设账号登录与退出 | FR01 | PASS | 451 ms |  |
| TC02 | 跨账号归属拒绝（宠物/预约/照护/账单） | FR01/FR09 | PASS | 236 ms |  |
| TC03 | 宠物建档必填校验与正体重 | FR02 | PASS | 332 ms |  |
| TC04 | 猫犬分别查询匹配房型、日价、计划总价与连续可用数量 | FR03 | PASS | 229 ms |  |
| TC05 | 提交预约生成待审核单并保存日价快照、不分房 | FR04 | PASS | 226 ms |  |
| TC07 | 重叠预约顺序审核：普通可用性检查、其他空房仍可选 | FR05 | PASS | 223 ms |  |
| TC09 | 提交后调价不追溯：旧单 80 元、新单 90 元 | FR04/FR12 | PASS | 210 ms |  |
| TC10 | 取消本人待审核/已确认预约，释放计划占用 | FR06 | PASS | 218 ms |  |
| TC11 | 到计划离店日手动标记失约并释放计划占用 | FR06 | PASS | 311 ms |  |
| TC12 | 开始日资料通过且实际空房办理入住 | FR07 | PASS | 210 ms |  |
| TC15 | 照护任务创建/完成/主人可见（类型、计划时间、执行人、完成时间、说明） | FR08/FR09 | PASS | 217 ms |  |
| TC25 | 驳回待审核单需填写原因且不占房 | FR05 | PASS | 210 ms |  |
| TC26 | 延迟入住需原因，离店日与基础费不变 | FR07/FR11 | PASS | 308 ms |  |
| TC27 | 早于开始日、到达计划离店日办理入住均被拒绝 | FR07 | PASS | 316 ms |  |
| TC17 | 80 元/天 11-01 至 11-04、11-03 接回：基础费 240 元、无逾期费、不减费 | FR11 | PASS | 314 ms |  |
| TC18 | 同预约 11-05 离店：基础费 240 元 + 逾期费 80 元 = 320 元 | FR11 | PASS | 311 ms |  |
| TC23 | 两房各空半段不拼接余量：整段连续可用数为 0 | FR03 | PASS | 216 ms |  |
| TC24 | 页面价 80 元提交前调 90 元：409 PRICE_CHANGED，重新确认后按 90 元创建 | FR04 | PASS | 203 ms |  |
| TC28 | 结单取消待完成任务并保留完成记录，离店后不能再新增/完成任务 | FR08/FR11 | PASS | 216 ms |  |
| TC29 | 刷新/重新登录后预约、房型、价格、照护、账单仍可读取，空记录有空状态 | FR09 | PASS | 315 ms |  |
| TC30 | 主人核对后全额线下收款结单（现金/转账）；未确认收款不结单 | FR11 | PASS | 221 ms |  |
| TC31 | 管理员修改房型日价与房间名称/体重限制，历史订单快照不变 | FR12 | PASS | 219 ms |  |
| C-AUTH-401 | 契约：未登录访问受保护接口一律 401 UNAUTHENTICATED | docs/API.md §1/§4 | PASS | 241 ms |  |
| C-AUTHZ-403 | 契约：角色越权一律 403 FORBIDDEN | docs/API.md §4 | PASS | 210 ms |  |
| C-VALIDATION-400 | 契约：无效日期/必填项一律 400 VALIDATION_ERROR | docs/API.md §5.2/5.3/5.4 | PASS | 208 ms |  |
| C-PRICE-CHANGED | 契约：PRICE_CHANGED 的 details 含新日价/天数/总额且不创建预约 | docs/API.md §5.4 | PASS | 205 ms |  |
| C-PET-OVERLAP | 契约：同宠物与已确认/已入住预约区间重叠返回 409 PET_OVERLAP | docs/API.md §5.4 / BR01 | PASS | 207 ms |  |
| C-ROOM-UNAVAILABLE | 契约：房型不符/区间冲突/当前被占返回 409 ROOM_UNAVAILABLE | docs/API.md §5.6 / BR06 | PASS | 313 ms |  |
| C-BILL-EXACT | 契约：结单后状态 completed、账单金额精确到分且重启后持久化 | docs/API.md §5.10 / BR09/BR11 | PASS | 411 ms |  |
| C-HEALTH | 契约：健康检查返回正确的 today 与 clockOverridden（PB_TODAY 覆盖） | docs/API.md §6 | PASS | 403 ms |  |

