/**
 * 验收场景 TC07/TC09/TC10/TC11/TC12/TC15/TC25/TC26/TC27：
 * 审核分房、调价不追溯、取消、失约、入住、照护任务、驳回、延迟入住、日期条件。
 */
import { D1, D2, D3, D4, D5, D6, D7, D8, D9, DAY0 } from '../lib/dates.mjs';
import {
  approveReservation,
  assertAvailabilityItem,
  bookReservation,
  checkInReservation,
  createCareTask,
  createPet,
  getAvailability,
  getBill,
  getCandidateRooms,
  getCareTasks,
  getReservation,
  listReservations,
} from '../lib/flows.mjs';

export default [
  {
    id: 'TC07',
    title: '重叠预约顺序审核：普通可用性检查、其他空房仍可选',
    requirement: 'FR05',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms, accounts } = t.refs;
      const staff = t.s.staff;

      const aReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      const bReservation = await bookReservation(t, {
        owner: 'ownerB',
        pet: pets.bCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });

      let candidates = await getCandidateRooms(t, { reservationId: aReservation.id });
      t.check.eq(
        candidates.map((room) => room.id).sort((left, right) => left - right),
        [rooms.C101.id, rooms.C102.id].sort((left, right) => left - right),
        'A 单候选房间应为 C101/C102',
      );

      const confirmedA = await approveReservation(t, { reservationId: aReservation.id, roomName: 'C101' });
      t.check.eq(confirmedA.status, 'confirmed', '审核通过后状态应为已确认');
      t.check.eq(confirmedA.roomId, rooms.C101.id, '审核通过后应分配 C101');
      t.check.eq(confirmedA.reviewedBy, accounts.staff.id, '应记录审核人');
      t.check.notNull(confirmedA.reviewedAt, '应记录审核时间');

      // 重叠预约普通可用性检查：候选房间排除 C101，仍可选 C102
      candidates = await getCandidateRooms(t, { reservationId: bReservation.id });
      t.check.eq(candidates.length, 1, 'B 单候选房间应只剩 1 间');
      t.check.includes(candidates.map((room) => room.id), rooms.C102.id, 'B 单候选房间应包含 C102');
      t.check.notIncludes(candidates.map((room) => room.id), rooms.C101.id, 'B 单候选房间不应包含已占用的 C101');

      // 强行审核到已占房间被拒绝
      let response = await staff.post(`/api/reservations/${bReservation.id}/approve`, { roomId: rooms.C101.id });
      t.check.status(response, 409, '重叠审核到已占用房间');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '重叠审核到已占用房间');
      response = await staff.get(`/api/reservations/${bReservation.id}`);
      t.check.eq(response.body?.reservation?.status, 'pending', '审核失败不应改变预约状态');

      // 其他空房仍可选
      const confirmedB = await approveReservation(t, { reservationId: bReservation.id, roomName: 'C102' });
      t.check.eq(confirmedB.status, 'confirmed', 'B 单审核 C102 应成功');
      t.check.eq(confirmedB.roomId, rooms.C102.id, 'B 单应分配 C102');

      // 两间房占满后第三单候选为空且审核失败
      const secondCat = await createPet(t, {
        owner: 'ownerA',
        pet: { name: '咪咪2', species: 'cat', weight: 4, contact: '13900000011' },
      });
      const thirdReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: secondCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      candidates = await getCandidateRooms(t, { reservationId: thirdReservation.id });
      t.check.eq(candidates.length, 0, '两间房均被占满时候选房间应为空');
      response = await staff.post(`/api/reservations/${thirdReservation.id}/approve`, { roomId: rooms.C101.id });
      t.check.status(response, 409, '无空房时审核 C101');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '无空房时审核 C101');
      response = await staff.post(`/api/reservations/${thirdReservation.id}/approve`, { roomId: rooms.C102.id });
      t.check.status(response, 409, '无空房时审核 C102');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '无空房时审核 C102');

      // 房间不属于该房型：猫舍豪华间预约用犬舍房间审核
      const luxReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: secondCat,
        roomType: roomTypes.catLux,
        startDate: D1,
        endDate: D4,
      });
      response = await staff.post(`/api/reservations/${luxReservation.id}/approve`, { roomId: rooms.D101.id });
      t.check.status(response, 409, '审核房间不属于该房型');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '审核房间不属于该房型');
    },
  },

  {
    id: 'TC09',
    title: '提交后调价不追溯：旧单 80 元、新单 90 元',
    requirement: 'FR04/FR12',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms } = t.refs;
      const admin = t.s.admin;

      const oldReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
        price: 8000,
      });
      t.check.eq(oldReservation.dailyPriceSnapshotFen, 8000, '旧单提交时快照应为 80 元');

      // 管理员改价 80 → 90
      let response = await admin.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 9000 });
      t.check.status(response, 200, '管理员修改房型日价');
      t.check.eq(response.body?.roomType?.dailyPriceFen, 9000, '修改后房型日价应为 90 元');
      response = await admin.get('/api/admin/rooms');
      const catStdAdminView = response.body?.roomTypes?.find((roomType) => roomType.id === roomTypes.catStd.id);
      t.check.eq(catStdAdminView?.dailyPriceFen, 9000, '管理员读取房型日价应为 90 元');

      // 调价后审核旧单，价格快照不变
      const confirmed = await approveReservation(t, { reservationId: oldReservation.id, roomName: 'C101' });
      t.check.eq(confirmed.status, 'confirmed', '旧单审核通过');
      t.check.eq(confirmed.dailyPriceSnapshotFen, 8000, '旧单快照仍为 80 元（调价不追溯）');
      t.check.eq(confirmed.baseFeeFen, 24000, '旧单基础费仍为 240 元');
      const detail = await getReservation(t, { reservationId: oldReservation.id });
      t.check.eq(detail.dailyPriceSnapshotFen, 8000, '调价后读取旧单：快照仍为 80 元');

      // 新提交按新价
      const newReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D6,
        endDate: D9,
        price: 9000,
      });
      t.check.eq(newReservation.dailyPriceSnapshotFen, 9000, '新单快照应为 90 元');
      t.check.eq(newReservation.plannedDays, 3, '新单计划天数');
      t.check.eq(newReservation.baseFeeFen, 27000, '新单基础费 = 90 × 3 = 270 元');

      // 页面查询也展示新价
      const availability = await getAvailability(t, {
        petId: pets.aCat.id,
        startDate: D6,
        endDate: D9,
      });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 9000, plannedDays: 3 },
        '调价后页面查询',
      );
    },
  },

  {
    id: 'TC10',
    title: '取消本人待审核/已确认预约，释放计划占用',
    requirement: 'FR06',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms } = t.refs;
      const ownerA = t.s.ownerA;
      const staff = t.s.staff;

      // 1) 取消本人待审核预约
      const pendingReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      let response = await ownerA.post(`/api/reservations/${pendingReservation.id}/cancel`, { reason: '行程有变' });
      t.check.status(response, 200, '主人取消本人待审核预约');
      t.check.eq(response.body?.reservation?.status, 'cancelled', '取消后状态应为已取消');
      t.check.eq(response.body?.reservation?.reason, '行程有变', '取消原因应保存');
      response = await ownerA.post(`/api/reservations/${pendingReservation.id}/cancel`, { reason: '再次取消' });
      t.check.status(response, 409, '重复取消');
      t.check.errorCode(response, 'INVALID_STATE', '重复取消');

      // 取消必须填写原因
      const needsReason = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      response = await ownerA.post(`/api/reservations/${needsReason.id}/cancel`, {});
      t.check.status(response, 400, '取消未填原因');
      t.check.errorCode(response, 'VALIDATION_ERROR', '取消未填原因');
      const afterFailedCancel = await getReservation(t, { reservationId: needsReason.id });
      t.check.eq(afterFailedCancel.status, 'pending', '取消失败不应改变状态');

      // 2) 取消本人已确认预约：保留房间号用于历史展示，释放计划占用
      const confirmedReservation = await approveReservation(t, {
        reservationId: needsReason.id,
        roomName: 'C101',
      });
      t.check.eq(confirmedReservation.status, 'confirmed');
      response = await ownerA.post(`/api/reservations/${confirmedReservation.id}/cancel`, { reason: '临时有事' });
      t.check.status(response, 200, '主人取消本人已确认预约');
      const cancelledConfirmed = response.body?.reservation;
      t.check.eq(cancelledConfirmed?.status, 'cancelled', '取消已确认预约后状态应为已取消');
      t.check.eq(cancelledConfirmed?.roomId, rooms.C101.id, '取消已确认预约保留已分配房间号用于历史展示');
      const availability = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3, availableRooms: 2 },
        '取消后释放计划占用',
      );

      // 3) 已入住不可取消
      const inHouseReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: inHouseReservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: inHouseReservation.id });
      response = await ownerA.post(`/api/reservations/${inHouseReservation.id}/cancel`, { reason: '入住后取消' });
      t.check.status(response, 409, '已入住预约不可取消');
      t.check.errorCode(response, 'INVALID_STATE', '已入住预约不可取消');

      // 4) staff 可取消未入住预约
      const staffCancelReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aDog,
        roomType: roomTypes.dogStd,
        startDate: D1,
        endDate: D4,
        price: 10000,
      });
      response = await staff.post(`/api/reservations/${staffCancelReservation.id}/cancel`, {
        reason: '工作人员取消未入住预约',
      });
      t.check.status(response, 200, '工作人员取消未入住预约');
      t.check.eq(response.body?.reservation?.status, 'cancelled', '工作人员取消后状态应为已取消');
    },
  },

  {
    id: 'TC11',
    title: '到计划离店日手动标记失约并释放计划占用',
    requirement: 'FR06',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes } = t.refs;
      const staff = t.s.staff;

      const aReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: aReservation.id, roomName: 'C101' });
      const bReservation = await bookReservation(t, {
        owner: 'ownerB',
        pet: pets.bCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });

      // 未到计划离店日不能标记失约
      let response = await staff.post(`/api/reservations/${aReservation.id}/no-show`, { reason: '未到店' });
      t.check.status(response, 409, '未到计划离店日标记失约');
      t.check.errorCode(response, 'INVALID_STATE', '未到计划离店日标记失约');
      t.check.eq(
        (await getReservation(t, { reservationId: aReservation.id })).status,
        'confirmed',
        '失败操作不应改变预约状态',
      );

      // 到计划离店日：原因必填
      await t.phase(D4);
      response = await staff.post(`/api/reservations/${aReservation.id}/no-show`, {});
      t.check.status(response, 400, '标记失约未填原因');
      t.check.errorCode(response, 'VALIDATION_ERROR', '标记失约未填原因');

      // 正式标记失约
      response = await staff.post(`/api/reservations/${aReservation.id}/no-show`, {
        reason: '到店日未到店，电话确认后标记失约',
      });
      t.check.status(response, 200, '到计划离店日手动标记失约');
      const missed = response.body?.reservation;
      t.check.eq(missed?.status, 'missed', '标记后状态应为已失约');
      t.check.eq(missed?.reason, '到店日未到店，电话确认后标记失约', '失约原因应保存');

      // 释放计划占用：B 单候选房间恢复两间
      const candidates = await getCandidateRooms(t, { reservationId: bReservation.id });
      t.check.eq(candidates.length, 2, '失约后释放计划占用，候选房间恢复 2 间');

      // 终态不可重复
      response = await staff.post(`/api/reservations/${aReservation.id}/no-show`, { reason: '重复标记' });
      t.check.status(response, 409, '重复标记失约');
      t.check.errorCode(response, 'INVALID_STATE', '重复标记失约');

      // 主人可见失约状态与原因
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: aReservation.id });
      t.check.eq(detail.status, 'missed', '主人详情应显示已失约');
      t.check.eq(detail.reason, '到店日未到店，电话确认后标记失约', '主人详情应显示失约原因');
    },
  },

  {
    id: 'TC12',
    title: '开始日资料通过且实际空房办理入住',
    requirement: 'FR07',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms, accounts } = t.refs;
      const staff = t.s.staff;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });

      // 待审核单不能直接办理入住
      let response = await staff.post(`/api/reservations/${reservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '资料核验通过',
      });
      t.check.status(response, 409, '待审核预约直接办理入住');
      t.check.errorCode(response, 'INVALID_STATE', '待审核预约直接办理入住');

      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });

      // 资料核验未通过：只提示，不建入住
      response = await staff.post(`/api/reservations/${reservation.id}/check-in`, {
        inspectionPassed: false,
        inspectionNotes: '皮肤异常，需进一步确认',
      });
      t.check.status(response, 400, '资料核验未通过办理入住');
      t.check.errorCode(response, 'VALIDATION_ERROR', '资料核验未通过办理入住');

      // 开始日正常入住
      const checkInBody = await checkInReservation(t, {
        reservationId: reservation.id,
        inspectionNotes: '精神状态良好，无皮肤异常',
      });
      const checkedIn = checkInBody.reservation;
      t.check.eq(checkedIn.status, 'checked_in', '入住后预约状态应为已入住');
      t.check.eq(checkedIn.roomId, rooms.C101.id, '入住后保留分配房间 C101');
      t.check.eq(checkedIn.startDate, D1, '原定开始日不变');
      t.check.eq(checkedIn.endDate, D4, '原定离店日不变');
      const stay = checkInBody.stay;
      t.check.notNull(stay?.id, '入住记录 id');
      t.check.notNull(stay?.checkInAt, '入住记录应有入住时间');
      t.check.isNull(stay?.checkOutAt, '入住记录离店时间应为空');
      t.check.isNull(stay?.lateReason, '开始日入住不需要迟到原因');
      t.check.eq(stay?.inspectionNotes, '精神状态良好，无皮肤异常', '入住记录应保存检查说明');
      t.check.eq(stay?.checkInStaffId, accounts.staff.id, '入住记录应保存经办工作人员');

      // 重复入住被拒绝
      response = await staff.post(`/api/reservations/${reservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '再次入住',
      });
      t.check.status(response, 409, '重复办理入住');
      t.check.errorCode(response, 'INVALID_STATE', '重复办理入住');

      // 在住列表
      response = await staff.get('/api/stays?status=active');
      t.check.status(response, 200, '工作人员读取在住列表');
      const stays = response.body?.stays;
      t.check.true(Array.isArray(stays), '在住列表响应缺少 stays 数组', { response });
      t.check.eq(stays.length, 1, '在住列表应有 1 条记录');
      t.check.eq(stays[0]?.reservation?.id, reservation.id, '在住列表应包含该预约');
      t.check.eq(stays[0]?.reservation?.status, 'checked_in', '在住列表中的预约状态');
      t.check.eq(stays[0]?.pendingTaskCount, 0, '在住列表待完成任务数');
      t.check.eq(stays[0]?.completedTaskCount, 0, '在住列表已完成任务数');

      // 主人可见已入住状态
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(detail.status, 'checked_in', '主人详情应显示已入住');
    },
  },

  {
    id: 'TC15',
    title: '照护任务创建/完成/主人可见（类型、计划时间、执行人、完成时间、说明）',
    requirement: 'FR08/FR09',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, accounts } = t.refs;
      const staff = t.s.staff;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: reservation.id });

      // 创建两条任务（计划时间晚于实际入住时间、不晚于计划离店日 23:59）
      const feedingTask = await createCareTask(t, {
        reservationId: reservation.id,
        kind: 'feeding',
        plannedAt: `${D2}T09:00`,
        instruction: '按备注喂半袋猫粮',
      });
      t.check.eq(feedingTask.status, 'pending', '新建任务状态应为待完成');
      t.check.eq(feedingTask.kind, 'feeding', '任务类型');
      t.check.eq(feedingTask.instruction, '按备注喂半袋猫粮', '任务说明');
      t.check.eq(feedingTask.reservationId, reservation.id, '任务关联预约');
      t.check.notNull(feedingTask.plannedAt, '任务计划时间');
      t.check.eq(feedingTask.createdBy, accounts.staff.id, '任务创建人');
      t.check.true(
        typeof feedingTask.createdByName === 'string' && feedingTask.createdByName.length > 0,
        '任务创建人姓名应返回',
        { actual: feedingTask.createdByName },
      );
      t.check.isNull(feedingTask.record, '新任务不应有完成记录');

      const waterTask = await createCareTask(t, {
        reservationId: reservation.id,
        kind: 'water',
        plannedAt: `${D2}T18:00`,
        instruction: '换清水',
      });

      // 非法任务
      const invalidTasks = [
        { label: '任务类型非法', body: { kind: 'walk', plannedAt: `${D2}T10:00`, instruction: '遛狗' } },
        { label: '任务说明为空', body: { kind: 'cleaning', plannedAt: `${D2}T10:00`, instruction: '' } },
        { label: '计划时间早于入住时间', body: { kind: 'feeding', plannedAt: '2026-10-01T10:00', instruction: '喂食' } },
        { label: '计划时间晚于计划离店日', body: { kind: 'other', plannedAt: `${D5}T10:00`, instruction: '散步' } },
      ];
      for (const testCase of invalidTasks) {
        const response = await staff.post(`/api/reservations/${reservation.id}/care-tasks`, testCase.body);
        t.check.status(response, 400, `创建照护任务非法输入：${testCase.label}`);
        t.check.errorCode(response, 'VALIDATION_ERROR', `创建照护任务非法输入：${testCase.label}`);
      }

      // 未入住订单不能创建任务
      const pendingReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aDog,
        roomType: roomTypes.dogStd,
        startDate: D1,
        endDate: D4,
        price: 10000,
      });
      let response = await staff.post(`/api/reservations/${pendingReservation.id}/care-tasks`, {
        kind: 'feeding',
        plannedAt: `${D2}T09:00`,
        instruction: '未入住也建任务',
      });
      t.check.status(response, 409, '未入住订单不能创建照护任务');
      t.check.errorCode(response, 'INVALID_STATE', '未入住订单不能创建照护任务');

      // 完成任务并保存执行人、完成时间与说明
      response = await staff.post(`/api/care-tasks/${feedingTask.id}/complete`, { notes: '已完成，进食正常' });
      t.check.status(response, 200, '完成照护任务');
      const completedTask = response.body?.task;
      t.check.eq(completedTask?.status, 'completed', '完成后任务状态应为已完成');
      t.check.notNull(completedTask?.record, '完成后应有完成记录');
      t.check.eq(completedTask?.record?.notes, '已完成，进食正常', '完成记录说明');
      t.check.eq(completedTask?.record?.staffId, accounts.staff.id, '完成记录执行人');
      t.check.notNull(completedTask?.record?.staffName, '完成记录执行人姓名');
      t.check.notNull(completedTask?.record?.completedAt, '完成记录时间');

      // 一任务至多一条完成记录
      response = await staff.post(`/api/care-tasks/${feedingTask.id}/complete`, { notes: '再次完成' });
      t.check.status(response, 409, '重复完成同一任务');
      t.check.errorCode(response, 'INVALID_STATE', '重复完成同一任务');

      // 完成记录说明必填
      response = await staff.post(`/api/care-tasks/${waterTask.id}/complete`, {});
      t.check.status(response, 400, '完成任务未填说明');
      t.check.errorCode(response, 'VALIDATION_ERROR', '完成任务未填说明');

      // 主人可见任务与完成记录
      const tasks = await getCareTasks(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(tasks.length, 2, '主人应看到两条照护任务');
      t.check.true(
        Date.parse(tasks[0]?.plannedAt) <= Date.parse(tasks[1]?.plannedAt),
        '照护任务应按计划时间升序返回',
        { actual: tasks.map((task) => task.plannedAt) },
      );
      const feedingView = tasks.find((task) => task.id === feedingTask.id);
      t.check.eq(feedingView?.status, 'completed', '主人可见任务已完成状态');
      t.check.eq(feedingView?.kind, 'feeding', '主人可见任务类型');
      t.check.notNull(feedingView?.plannedAt, '主人可见任务计划时间');
      t.check.notNull(feedingView?.record, '主人可见完成记录');
      t.check.notNull(feedingView?.record?.staffName, '主人可见执行人员');
      t.check.notNull(feedingView?.record?.completedAt, '主人可见完成时间');
      t.check.eq(feedingView?.record?.notes, '已完成，进食正常', '主人可见完成说明');
      const waterView = tasks.find((task) => task.id === waterTask.id);
      t.check.eq(waterView?.status, 'pending', '未完成任务应保持待完成');
      t.check.isNull(waterView?.record, '待完成任务不应有完成记录');

      const staffTasks = await getCareTasks(t, { owner: 'staff', reservationId: reservation.id });
      t.check.eq(staffTasks.length, 2, '工作人员同样可读取照护任务与记录');
    },
  },

  {
    id: 'TC25',
    title: '驳回待审核单需填写原因且不占房',
    requirement: 'FR05',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms } = t.refs;
      const staff = t.s.staff;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });

      // 驳回原因必填
      let response = await staff.post(`/api/reservations/${reservation.id}/reject`, {});
      t.check.status(response, 400, '驳回未填原因');
      t.check.errorCode(response, 'VALIDATION_ERROR', '驳回未填原因');
      t.check.eq(
        (await getReservation(t, { reservationId: reservation.id })).status,
        'pending',
        '驳回失败不应改变状态',
      );
      let candidates = await getCandidateRooms(t, { reservationId: reservation.id });
      t.check.eq(candidates.length, 2, '驳回前候选房间 2 间');

      // 填写原因驳回
      response = await staff.post(`/api/reservations/${reservation.id}/reject`, {
        reason: '房间与宠物过敏史不匹配',
      });
      t.check.status(response, 200, '填写原因驳回待审核单');
      const rejected = response.body?.reservation;
      t.check.eq(rejected?.status, 'rejected', '驳回后状态应为已驳回');
      t.check.eq(rejected?.reason, '房间与宠物过敏史不匹配', '驳回原因应保存');
      t.check.isNull(rejected?.roomId, '驳回不应分房、不占房');

      // 不占房
      const availability = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3, availableRooms: 2 },
        '驳回后不占房',
      );

      // 主人详情可查看原因
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(detail.status, 'rejected', '主人详情应显示已驳回');
      t.check.eq(detail.reason, '房间与宠物过敏史不匹配', '主人详情应能查看驳回原因');

      // 终态不可再审核
      response = await staff.post(`/api/reservations/${reservation.id}/approve`, { roomId: rooms.C101.id });
      t.check.status(response, 409, '已驳回预约再次审核');
      t.check.errorCode(response, 'INVALID_STATE', '已驳回预约再次审核');
      response = await staff.post(`/api/reservations/${reservation.id}/reject`, { reason: '再次驳回' });
      t.check.status(response, 409, '重复驳回');
      t.check.errorCode(response, 'INVALID_STATE', '重复驳回');
      response = await staff.get(`/api/reservations/${reservation.id}/candidate-rooms`);
      t.check.status(response, [400, 409], '非待审核单查询候选房间应被拒绝');
      if (response.status === 409) {
        t.check.errorCode(response, 'INVALID_STATE', '非待审核单查询候选房间应被拒绝');
      }
    },
  },

  {
    id: 'TC26',
    title: '延迟入住需原因，离店日与基础费不变',
    requirement: 'FR07/FR11',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes } = t.refs;
      const staff = t.s.staff;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });

      // 11-02 到店：延迟入住未填原因
      await t.phase(D2);
      let response = await staff.post(`/api/reservations/${reservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '资料核验通过',
      });
      t.check.status(response, 400, '延迟入住未填原因');
      t.check.errorCode(response, 'LATE_REASON_REQUIRED', '延迟入住未填原因');
      response = await staff.post(`/api/reservations/${reservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '资料核验通过',
        lateReason: '',
      });
      t.check.status(response, 400, '延迟入住原因为空字符串');
      t.check.errorCode(response, 'LATE_REASON_REQUIRED', '延迟入住原因为空字符串');

      // 填写原因后可入住
      const checkInBody = await checkInReservation(t, {
        reservationId: reservation.id,
        inspectionNotes: '资料核验通过',
        lateReason: '主人航班延误',
      });
      t.check.eq(checkInBody.reservation.status, 'checked_in', '延迟入住后状态应为已入住');
      t.check.eq(checkInBody.reservation.startDate, D1, '原定开始日不变');
      t.check.eq(checkInBody.reservation.endDate, D4, '延迟入住不改变原定离店日');
      t.check.eq(checkInBody.reservation.plannedDays, 3, '计划天数不变');
      t.check.eq(checkInBody.stay.lateReason, '主人航班延误', '入住记录应保存迟到原因');

      // 基础费仍按 3 天
      const bill = await getBill(t, { owner: 'staff', reservationId: reservation.id });
      t.check.eq(bill.plannedDays, 3, '延迟入住基础费仍按原计划 3 天');
      t.check.eq(bill.dailyPriceFen, 8000, '账单锁定日价');
      t.check.eq(bill.baseFeeFen, 24000, '延迟入住不减免基础费');
      t.check.eq(bill.overdueDays, 0, '11-02 尚未到计划离店日，无逾期');
      t.check.eq(bill.totalFen, 24000, '按当日预览应收 240 元');

      // 主人可见
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(detail.status, 'checked_in', '主人详情应显示已入住');
      t.check.eq(detail.endDate, D4, '主人详情离店日不变');
    },
  },

  {
    id: 'TC27',
    title: '早于开始日、到达计划离店日办理入住均被拒绝',
    requirement: 'FR07',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes } = t.refs;
      const staff = t.s.staff;

      // 预约 11-02 ~ 11-05：今天 11-01 早于开始日
      const futureReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D2,
        endDate: D5,
      });
      await approveReservation(t, { reservationId: futureReservation.id, roomName: 'C101' });

      // 预约 11-01 ~ 11-03：11-03 到达计划离店日
      const endingReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aDog,
        roomType: roomTypes.dogStd,
        startDate: D1,
        endDate: D3,
        price: 10000,
      });
      await approveReservation(t, { reservationId: endingReservation.id, roomName: 'D101' });

      let response = await staff.post(`/api/reservations/${futureReservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '资料核验通过',
      });
      t.check.status(response, 400, '早于计划开始日办理入住');
      t.check.errorCode(response, 'CHECKIN_DATE_INVALID', '早于计划开始日办理入住');

      await t.phase(D3);
      response = await staff.post(`/api/reservations/${endingReservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '资料核验通过',
      });
      t.check.status(response, 400, '到达计划离店日办理入住');
      t.check.errorCode(response, 'CHECKIN_DATE_INVALID', '到达计划离店日办理入住');

      // 均不创建入住记录，预约保持已确认
      response = await staff.get('/api/stays?status=active');
      t.check.eq(response.body?.stays?.length, 0, '日期条件不符合时不应创建入住记录');
      t.check.eq(
        (await getReservation(t, { reservationId: futureReservation.id })).status,
        'confirmed',
        '早于开始日失败后预约仍为已确认',
      );
      t.check.eq(
        (await getReservation(t, { reservationId: endingReservation.id })).status,
        'confirmed',
        '到达离店日失败后预约仍为已确认',
      );
    },
  },
];
