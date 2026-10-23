/**
 * 业务流程快捷操作。成功路径统一断言状态码并返回业务对象；
 * 负向用例由场景直接用 t.s[...] 发请求后自行断言。
 */

function requireValue(t, value, label) {
  t.check.notNull(value, label);
  return value;
}

/** 提交预约：默认使用房型当前种子日价；调价场景需显式传 price。 */
export async function bookReservation(t, options) {
  const { owner = 'ownerA', pet, roomType, startDate, endDate, price } = options;
  requireValue(t, pet, '提交预约缺少宠物');
  requireValue(t, roomType, '提交预约缺少房型');
  const requestBody = {
    petId: pet.id,
    roomTypeId: roomType.id,
    startDate,
    endDate,
    confirmedDailyPriceFen: price ?? roomType.dailyPriceFen,
  };
  const response = await t.s[owner].post('/api/reservations', requestBody);
  t.check.status(response, 201, `提交预约（${owner} / ${pet.name} / ${roomType.name} / ${startDate}~${endDate}）`);
  return requireValue(t, response.body?.reservation, '提交预约响应缺少 reservation');
}

/** 审核通过并分房（按房间名从种子引用表定位房间 id）。 */
export async function approveReservation(t, options) {
  const { reservationId, roomName, room } = options;
  const roomRef = room ?? requireValue(t, t.refs.rooms[roomName], `未知房间名：${roomName}`);
  const response = await t.s.staff.post(`/api/reservations/${reservationId}/approve`, { roomId: roomRef.id });
  t.check.status(response, 200, `审核分房 #${reservationId} → ${roomRef.name}`);
  return requireValue(t, response.body?.reservation, '审核响应缺少 reservation');
}

/** 办理入住。 */
export async function checkInReservation(t, options) {
  const {
    reservationId,
    inspectionPassed = true,
    inspectionNotes = '资料核验通过：精神状态良好，无皮肤异常',
    lateReason,
  } = options;
  const requestBody = { inspectionPassed, inspectionNotes };
  if (lateReason !== undefined) requestBody.lateReason = lateReason;
  const response = await t.s.staff.post(`/api/reservations/${reservationId}/check-in`, requestBody);
  t.check.status(response, 200, `办理入住 #${reservationId}`);
  requireValue(t, response.body?.reservation, '入住响应缺少 reservation');
  requireValue(t, response.body?.stay, '入住响应缺少 stay');
  return response.body;
}

/** 取消预约（主人本人或 staff）。 */
export async function cancelReservation(t, options) {
  const { reservationId, reason, by = 'ownerA' } = options;
  const response = await t.s[by].post(`/api/reservations/${reservationId}/cancel`, { reason });
  t.check.status(response, 200, `取消预约 #${reservationId}（${by}）`);
  return requireValue(t, response.body?.reservation, '取消响应缺少 reservation');
}

/** 创建照护任务。 */
export async function createCareTask(t, options) {
  const { reservationId, kind = 'feeding', plannedAt, instruction = '按主人备注完成照护' } = options;
  const response = await t.s.staff.post(`/api/reservations/${reservationId}/care-tasks`, {
    kind,
    plannedAt,
    instruction,
  });
  t.check.status(response, 201, `创建照护任务 #${reservationId}（${kind} @ ${plannedAt}）`);
  return requireValue(t, response.body?.task, '创建照护任务响应缺少 task');
}

/** 完成照护任务。 */
export async function completeCareTask(t, options) {
  const { taskId, notes = '已完成，进食正常' } = options;
  const response = await t.s.staff.post(`/api/care-tasks/${taskId}/complete`, { notes });
  t.check.status(response, 200, `完成照护任务 #${taskId}`);
  return requireValue(t, response.body?.task, '完成照护任务响应缺少 task');
}

/** 离店结单（全额线下收款）。 */
export async function checkoutReservation(t, options = {}) {
  const { reservationId, paymentMethod = 'cash', ownerConfirmed = true } = options;
  const response = await t.s.staff.post(`/api/reservations/${reservationId}/checkout`, {
    paymentMethod,
    ownerConfirmed,
  });
  t.check.status(response, 200, `离店结单 #${reservationId}（${paymentMethod}）`);
  requireValue(t, response.body?.bill, '结单响应缺少 bill');
  requireValue(t, response.body?.reservation, '结单响应缺少 reservation');
  return response.body;
}

/** 读取预约详情。 */
export async function getReservation(t, options) {
  const { reservationId, owner = 'ownerA' } = options;
  const response = await t.s[owner].get(`/api/reservations/${reservationId}`);
  t.check.status(response, 200, `读取预约 #${reservationId}（${owner}）`);
  return requireValue(t, response.body?.reservation, '预约详情响应缺少 reservation');
}

/** 读取预约列表；status 可选。 */
export async function listReservations(t, options = {}) {
  const { owner = 'ownerA', status } = options;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await t.s[owner].get(`/api/reservations${query}`);
  t.check.status(response, 200, `读取预约列表（${owner}${status ? ` / ${status}` : ''}）`);
  const reservations = response.body?.reservations;
  t.check.true(Array.isArray(reservations), '预约列表响应缺少 reservations 数组', { response });
  return reservations;
}

/** 读取账单。 */
export async function getBill(t, options) {
  const { reservationId, owner = 'ownerA' } = options;
  const response = await t.s[owner].get(`/api/reservations/${reservationId}/bill`);
  t.check.status(response, 200, `读取账单 #${reservationId}（${owner}）`);
  return requireValue(t, response.body?.bill, '账单响应缺少 bill');
}

/** 读取可用性（房型匹配 + 连续可用房间数）。 */
export async function getAvailability(t, options) {
  const { owner = 'ownerA', petId, startDate, endDate } = options;
  const path =
    `/api/availability?petId=${encodeURIComponent(petId)}` +
    `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const response = await t.s[owner].get(path);
  t.check.status(response, 200, `查询可用性（${owner} / pet=${petId} / ${startDate}~${endDate}）`);
  t.check.true(Array.isArray(response.body?.items), '可用性响应缺少 items 数组', { response });
  return response.body;
}

/** 读取审核候选房间。 */
export async function getCandidateRooms(t, options) {
  const { reservationId } = options;
  const response = await t.s.staff.get(`/api/reservations/${reservationId}/candidate-rooms`);
  t.check.status(response, 200, `读取候选房间 #${reservationId}`);
  t.check.true(Array.isArray(response.body?.rooms), '候选房间响应缺少 rooms 数组', { response });
  return response.body.rooms;
}

/** 读取照护任务。 */
export async function getCareTasks(t, options) {
  const { reservationId, owner = 'ownerA' } = options;
  const response = await t.s[owner].get(`/api/reservations/${reservationId}/care-tasks`);
  t.check.status(response, 200, `读取照护任务 #${reservationId}（${owner}）`);
  t.check.true(Array.isArray(response.body?.tasks), '照护任务响应缺少 tasks 数组', { response });
  return response.body.tasks;
}

/** 新建宠物档案。 */
export async function createPet(t, options) {
  const { owner = 'ownerA', pet } = options;
  const requestBody = {
    name: pet.name,
    species: pet.species,
    weight: pet.weight,
    contact: pet.contact ?? '13900000000',
    careNotes: pet.careNotes ?? '',
    vaccineNotes: pet.vaccineNotes ?? '',
  };
  const response = await t.s[owner].post('/api/pets', requestBody);
  t.check.status(response, 201, `新建宠物档案（${owner} / ${pet.name}）`);
  return requireValue(t, response.body?.pet, '新建宠物响应缺少 pet');
}

/** 在可用性 items 中按房型 id 找到条目，找不到则失败。 */
export function findAvailabilityItem(t, availabilityBody, roomTypeId, label) {
  const item = availabilityBody?.items?.find((candidate) => candidate.roomTypeId === roomTypeId);
  return requireValue(t, item, `${label}：可用性结果缺少房型 ${roomTypeId}`);
}

/** 断言可用性某房型条目的日价/计划天数/总价/可用房间数。 */
export function assertAvailabilityItem(t, availabilityBody, roomType, expected, label) {
  const item = findAvailabilityItem(t, availabilityBody, roomType.id, label);
  t.check.eq(item.plannedDays, expected.plannedDays, `${label}：plannedDays`);
  t.check.eq(item.dailyPriceFen, expected.dailyPriceFen, `${label}：dailyPriceFen`);
  t.check.eq(item.totalFen, expected.dailyPriceFen * expected.plannedDays, `${label}：totalFen = 日价 × 计划天数`);
  if (expected.availableRooms !== undefined) {
    t.check.eq(item.availableRooms, expected.availableRooms, `${label}：availableRooms（同一间房覆盖整个区间）`);
  }
  return item;
}
