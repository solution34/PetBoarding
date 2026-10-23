/**
 * 验收场景 TC17/TC18/TC23/TC24/TC28/TC29/TC30/TC31：
 * 计费、连续可用、价格变更重新确认、结单取消任务、刷新持久化、收款结单、管理员维护。
 */
import { D1, D2, D3, D4, D5, D6, D9, DAY0 } from '../lib/dates.mjs';
import {
  approveReservation,
  assertAvailabilityItem,
  bookReservation,
  checkInReservation,
  checkoutReservation,
  completeCareTask,
  createCareTask,
  createPet,
  getAvailability,
  getBill,
  getCareTasks,
  getReservation,
  listReservations,
} from '../lib/flows.mjs';

export default [
  {
    id: 'TC17',
    title: '80 元/天 11-01 至 11-04、11-03 接回：基础费 240 元、无逾期费、不减费',
    requirement: 'FR11',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes } = t.refs;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
        price: 8000,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: reservation.id });

      // 11-03 接回：结单前按当日预览
      await t.phase(D3);
      let bill = await getBill(t, { owner: 'staff', reservationId: reservation.id });
      t.check.eq(bill.plannedDays, 3, '计划天数 3');
      t.check.eq(bill.dailyPriceFen, 8000, '锁定日价 80 元');
      t.check.fen(bill.baseFeeFen, '基础费');
      t.check.eq(bill.baseFeeFen, 24000, '基础费 240 元');
      t.check.eq(bill.overdueDays, 0, '11-03 提前接回无逾期天数');
      t.check.eq(bill.overdueFeeFen, 0, '无逾期费');
      t.check.fen(bill.totalFen, '应收合计');
      t.check.eq(bill.totalFen, 24000, '应收 240 元');
      t.check.eq(bill.settled, false, '结单前账单未结清');
      t.check.eq(bill.computedOn, D3, '预览账单按当日 11-03 计算');
      t.check.eq(bill.actualCheckInDate, D1, '实际入住日应为业务日期 11-01');
      t.check.isNull(bill.actualCheckOutDate, '结单前实际离店日为空');
      t.check.isNull(bill.invoice, '未结单时不应有正式账单');
      t.check.isNull(bill.receipt, '未结单时不应有收款记录');

      // 结单
      const checkoutResult = await checkoutReservation(t, {
        reservationId: reservation.id,
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      bill = checkoutResult.bill;
      t.check.eq(bill.settled, true, '结单后账单已结清');
      t.check.eq(bill.overdueDays, 0, '提前接回无逾期天数');
      t.check.eq(bill.overdueFeeFen, 0, '无逾期费');
      t.check.eq(bill.baseFeeFen, 24000, '提前接回不减免基础费');
      t.check.fen(bill.totalFen, '结单应收合计');
      t.check.eq(bill.totalFen, 24000, '结单应收 240 元');
      t.check.eq(bill.invoice?.status, 'paid', '账单状态应为已收款');
      t.check.eq(bill.invoice?.totalFen, 24000, '正式账单金额 240 元');
      t.check.eq(bill.receipt?.amountFen, 24000, '全额收款 240 元');
      t.check.eq(checkoutResult.reservation.status, 'completed', '结单后预约状态应为已完成');
      t.check.notNull(checkoutResult.reservation.stay?.checkOutAt, '入住记录应写入离店时间');
      t.check.eq(bill.actualCheckInDate, D1, '实际入住日应为业务日期 11-01');
      t.check.eq(bill.actualCheckOutDate, D3, '实际离店日应为办理当日业务日期 11-03');

      // 结单后账单可再次读取且金额不变
      const billAgain = await getBill(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(billAgain.settled, true, '主人可读取已结清账单');
      t.check.eq(billAgain.totalFen, 24000, '再次读取账单金额不变');
      t.check.eq(billAgain.invoice?.totalFen, 24000, '再次读取正式账单金额不变');
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(detail.status, 'completed', '主人详情应显示已完成');
    },
  },

  {
    id: 'TC18',
    title: '同预约 11-05 离店：基础费 240 元 + 逾期费 80 元 = 320 元',
    requirement: 'FR11',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes } = t.refs;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
        price: 8000,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: reservation.id });

      // 11-05 离店：跨过计划离店日 1 天
      await t.phase(D5);
      let bill = await getBill(t, { owner: 'staff', reservationId: reservation.id });
      t.check.eq(bill.plannedDays, 3, '计划天数 3');
      t.check.eq(bill.dailyPriceFen, 8000, '锁定日价 80 元');
      t.check.eq(bill.baseFeeFen, 24000, '基础费 240 元');
      t.check.eq(bill.overdueDays, 1, '逾期天数 1 天');
      t.check.fen(bill.overdueFeeFen, '逾期费');
      t.check.eq(bill.overdueFeeFen, 8000, '逾期费 80 元');
      t.check.fen(bill.totalFen, '应收合计');
      t.check.eq(bill.totalFen, 32000, '应收合计 320 元');
      t.check.eq(bill.settled, false, '结单前账单未结清');
      t.check.eq(bill.computedOn, D5, '预览账单按当日 11-05 计算');
      t.check.eq(bill.actualCheckInDate, D1, '实际入住日应为业务日期 11-01');
      t.check.isNull(bill.actualCheckOutDate, '结单前实际离店日为空');

      const checkoutResult = await checkoutReservation(t, {
        reservationId: reservation.id,
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      bill = checkoutResult.bill;
      t.check.eq(bill.settled, true, '结单后账单已结清');
      t.check.eq(bill.plannedDays, 3, '正式账单计划天数');
      t.check.eq(bill.dailyPriceFen, 8000, '正式账单锁定日价');
      t.check.eq(bill.baseFeeFen, 24000, '正式账单基础费 240 元');
      t.check.eq(bill.overdueDays, 1, '正式账单逾期天数 1');
      t.check.eq(bill.overdueFeeFen, 8000, '正式账单逾期费 80 元');
      t.check.eq(bill.totalFen, 32000, '正式账单应收 320 元');
      t.check.eq(bill.totalFen, bill.baseFeeFen + bill.overdueFeeFen, '账单仅含基础费与逾期费，无附加收费');
      t.check.eq(bill.invoice?.status, 'paid', '账单状态已收款');
      t.check.eq(bill.invoice?.totalFen, 32000, '正式账单金额 320 元');
      t.check.eq(bill.receipt?.amountFen, 32000, '全额收款 320 元');
      t.check.eq(checkoutResult.reservation.status, 'completed', '结单后预约状态应为已完成');
      t.check.eq(bill.actualCheckInDate, D1, '实际入住日应为业务日期 11-01');
      t.check.eq(bill.actualCheckOutDate, D5, '实际离店日应为办理当日业务日期 11-05');

      const billAgain = await getBill(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(billAgain.totalFen, 32000, '结单后主人再次读取账单金额不变');
    },
  },

  {
    id: 'TC23',
    title: '两房各空半段不拼接余量：整段连续可用数为 0',
    requirement: 'FR03',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes } = t.refs;

      // C101 只空前半段（占用 11-01 ~ 11-03）；C102 只空后半段（占用 11-03 ~ 11-06）
      const firstRoomReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D3,
      });
      await approveReservation(t, { reservationId: firstRoomReservation.id, roomName: 'C101' });
      const secondRoomReservation = await bookReservation(t, {
        owner: 'ownerB',
        pet: pets.bCat,
        roomType: roomTypes.catStd,
        startDate: D3,
        endDate: D6,
      });
      await approveReservation(t, { reservationId: secondRoomReservation.id, roomName: 'C102' });

      // 用一只无预约的猫查询整个区间：不得把两段剩余拼接为可用
      const queryPet = await createPet(t, {
        owner: 'ownerA',
        pet: { name: '布丁', species: 'cat', weight: 3, contact: '13900000012' },
      });
      let availability = await getAvailability(t, { petId: queryPet.id, startDate: D1, endDate: D6 });
      t.check.eq(availability.plannedDays, 5, '整段查询计划天数 5');
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 5, availableRooms: 0 },
        '两房各空半段：整段连续可用应为 0',
      );

      // 单段可覆盖时正常计数
      availability = await getAvailability(t, { petId: queryPet.id, startDate: D1, endDate: D3 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 2, availableRooms: 1 },
        '11-01~11-03 仅 C102 可用',
      );
      availability = await getAvailability(t, { petId: queryPet.id, startDate: D3, endDate: D6 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3, availableRooms: 1 },
        '11-03~11-06 仅 C101 可用',
      );

      // 查询不占房：再次整段查询仍为 0
      availability = await getAvailability(t, { petId: queryPet.id, startDate: D1, endDate: D6 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 5, availableRooms: 0 },
        '重复查询不改变余量',
      );
    },
  },

  {
    id: 'TC24',
    title: '页面价 80 元提交前调 90 元：409 PRICE_CHANGED，重新确认后按 90 元创建',
    requirement: 'FR04',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes } = t.refs;
      const ownerA = t.s.ownerA;

      let availability = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3 },
        '提交前页面显示 80 元',
      );

      // 提交前管理员调价为 90 元
      let response = await t.s.admin.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 9000 });
      t.check.status(response, 200, '管理员调价 80 → 90');

      // 主人仍按页面旧价提交 → PRICE_CHANGED，且不创建预约
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D1,
        endDate: D4,
        confirmedDailyPriceFen: 8000,
      });
      t.check.status(response, 409, '页面价与服务器不一致时提交');
      t.check.errorCode(response, 'PRICE_CHANGED', '价格变化错误码');
      const errorBody = response.body?.error;
      t.check.notNull(errorBody?.message, '错误响应应含中文提示');
      t.check.true(typeof errorBody?.message === 'string' && errorBody.message.length > 0, '错误提示不应为空');
      const details = errorBody?.details;
      t.check.notNull(details, 'PRICE_CHANGED 应返回 details');
      t.check.eq(details?.dailyPriceFen, 9000, 'details 应含新日价 90 元');
      t.check.eq(details?.plannedDays, 3, 'details 应含计划天数 3');
      t.check.eq(details?.totalFen, 27000, 'details 应含新总价 270 元');
      let reservations = await listReservations(t, { owner: 'ownerA' });
      t.check.eq(reservations.length, 0, '价格变化时不应创建预约');

      // 页面展示新价格与新总价
      availability = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 9000, plannedDays: 3 },
        '刷新后展示 90 元与新总价',
      );

      // 主人重新确认后按 90 元创建
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D1,
        endDate: D4,
        confirmedDailyPriceFen: 9000,
      });
      t.check.status(response, 201, '主人重新确认新价格后提交');
      const reservation = response.body?.reservation;
      t.check.eq(reservation?.dailyPriceSnapshotFen, 9000, '重新确认后快照按 90 元');
      t.check.eq(reservation?.plannedDays, 3, '重新确认后计划天数');
      t.check.eq(reservation?.baseFeeFen, 27000, '重新确认后基础费 270 元');
      t.check.eq(reservation?.status, 'pending', '重新确认后生成待审核单');
    },
  },

  {
    id: 'TC28',
    title: '结单取消待完成任务并保留完成记录，离店后不能再新增/完成任务',
    requirement: 'FR08/FR11',
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
      await checkInReservation(t, { reservationId: reservation.id });

      const completedTask = await createCareTask(t, {
        reservationId: reservation.id,
        kind: 'feeding',
        plannedAt: `${D2}T09:00`,
        instruction: '早餐喂食',
      });
      const pendingTask = await createCareTask(t, {
        reservationId: reservation.id,
        kind: 'water',
        plannedAt: `${D2}T18:00`,
        instruction: '换清水',
      });
      await completeCareTask(t, { taskId: completedTask.id, notes: '已完成，进食正常' });

      // 结单
      const checkoutResult = await checkoutReservation(t, {
        reservationId: reservation.id,
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      t.check.eq(checkoutResult.reservation.status, 'completed', '结单后预约状态应为已完成');
      t.check.eq(checkoutResult.bill.totalFen, 24000, '当日结单基础费 240 元');

      // 未完成任务转已取消，完成记录保留
      const tasks = await getCareTasks(t, { owner: 'staff', reservationId: reservation.id });
      const cancelledView = tasks.find((task) => task.id === pendingTask.id);
      const completedView = tasks.find((task) => task.id === completedTask.id);
      t.check.eq(cancelledView?.status, 'cancelled', '结单后未完成任务应转已取消');
      t.check.eq(completedView?.status, 'completed', '已完成任务状态保留');
      t.check.notNull(completedView?.record, '已完成任务的完成记录保留');
      t.check.eq(completedView?.record?.notes, '已完成，进食正常', '完成记录说明保留');
      t.check.notNull(completedView?.record?.completedAt, '完成时间保留');

      // 离店后不能新增或完成任务
      let response = await staff.post(`/api/reservations/${reservation.id}/care-tasks`, {
        kind: 'cleaning',
        plannedAt: `${D2}T10:00`,
        instruction: '离店后新增任务',
      });
      t.check.status(response, 409, '离店后不能新增照护任务');
      t.check.errorCode(response, 'INVALID_STATE', '离店后不能新增照护任务');
      response = await staff.post(`/api/care-tasks/${pendingTask.id}/complete`, { notes: '补记完成' });
      t.check.status(response, 409, '离店后不能完成照护任务');
      t.check.errorCode(response, 'INVALID_STATE', '离店后不能完成照护任务');

      // 在住列表清空
      response = await staff.get('/api/stays?status=active');
      t.check.eq(response.body?.stays?.length, 0, '结单后不应出现在住列表');

      // 主人可见已取消任务与保留的完成记录
      const ownerTasks = await getCareTasks(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(
        ownerTasks.find((task) => task.id === pendingTask.id)?.status,
        'cancelled',
        '主人可见未完成任务已取消',
      );
      t.check.notNull(
        ownerTasks.find((task) => task.id === completedTask.id)?.record,
        '主人可见保留的完成记录',
      );
    },
  },

  {
    id: 'TC29',
    title: '刷新/重新登录后预约、房型、价格、照护、账单仍可读取，空记录有空状态',
    requirement: 'FR09',
    async run(t) {
      await t.open(D1);
      const { pets, roomTypes, rooms } = t.refs;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: reservation.id });
      const completedTask = await createCareTask(t, {
        reservationId: reservation.id,
        kind: 'feeding',
        plannedAt: `${D2}T09:00`,
        instruction: '早餐喂食',
      });
      const pendingTask = await createCareTask(t, {
        reservationId: reservation.id,
        kind: 'water',
        plannedAt: `${D2}T18:00`,
        instruction: '换清水',
      });
      await completeCareTask(t, { taskId: completedTask.id, notes: '已完成，进食正常' });

      // 重新 createApp（同一数据库）+ 重新登录，模拟刷新页面/服务重启
      await t.phase(D1);
      const ownerA = t.s.ownerA;

      let response = await ownerA.get('/api/reservations');
      t.check.status(response, 200, '刷新后读取预约列表');
      const reservations = response.body?.reservations;
      t.check.eq(reservations?.length, 1, '刷新后应能读到本人预约');
      const listed = reservations?.[0];
      t.check.eq(listed?.id, reservation.id, '刷新后预约 id 一致');
      t.check.eq(listed?.status, 'checked_in', '刷新后预约状态保留');
      t.check.eq(listed?.dailyPriceSnapshotFen, 8000, '刷新后日价快照保留');
      t.check.eq(listed?.baseFeeFen, 24000, '刷新后基础费保留');
      t.check.eq(listed?.plannedDays, 3, '刷新后计划天数保留');
      t.check.eq(listed?.roomTypeId, roomTypes.catStd.id, '刷新后房型保留');
      t.check.eq(listed?.petId, pets.aCat.id, '刷新后宠物关联保留');

      const detail = await getReservation(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(detail.roomId, rooms.C101.id, '刷新后已分配房间保留');
      t.check.eq(detail.room?.name, 'C101', '刷新后房间名称可读');
      t.check.eq(detail.roomType?.name, '猫舍标间', '刷新后房型名称可读');
      t.check.eq(detail.pet?.name, '咪咪', '刷新后宠物名称可读');
      t.check.eq(detail.startDate, D1, '刷新后开始日保留');
      t.check.eq(detail.endDate, D4, '刷新后离店日保留');

      const tasks = await getCareTasks(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(tasks.length, 2, '刷新后照护任务可读');
      t.check.eq(
        tasks.find((task) => task.id === completedTask.id)?.status,
        'completed',
        '刷新后已完成任务状态保留',
      );
      t.check.notNull(tasks.find((task) => task.id === completedTask.id)?.record, '刷新后完成记录可读');
      t.check.eq(tasks.find((task) => task.id === pendingTask.id)?.status, 'pending', '刷心后待完成任务状态保留');

      const bill = await getBill(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(bill.plannedDays, 3, '刷新后账单计划天数');
      t.check.eq(bill.dailyPriceFen, 8000, '刷新后账单锁定日价');
      t.check.eq(bill.baseFeeFen, 24000, '刷新后账单基础费');
      t.check.eq(bill.totalFen, 24000, '刷新后账单合计');
      t.check.eq(bill.settled, false, '刷新后未结单状态保留');

      response = await t.s.staff.get('/api/stays?status=active');
      t.check.eq(response.body?.stays?.length, 1, '刷新后工作人员在住列表仍可见');
      t.check.eq(response.body?.stays?.[0]?.reservation?.id, reservation.id, '刷新后在住记录关联预约');

      // 空记录的空状态
      const ownerBReservations = await listReservations(t, { owner: 'ownerB' });
      t.check.eq(ownerBReservations.length, 0, '无预约的主人应得到空列表');
      const bPending = await bookReservation(t, {
        owner: 'ownerB',
        pet: pets.bCat,
        roomType: roomTypes.catLux,
        startDate: D1,
        endDate: D4,
        price: 12000,
      });
      const bTasks = await getCareTasks(t, { owner: 'ownerB', reservationId: bPending.id });
      t.check.eq(bTasks.length, 0, '无照护任务的订单应返回空数组');
      const bCompleted = await listReservations(t, { owner: 'ownerB', status: 'completed' });
      t.check.eq(bCompleted.length, 0, '无已完成订单应返回空列表');
    },
  },

  {
    id: 'TC30',
    title: '主人核对后全额线下收款结单（现金/转账）；未确认收款不结单',
    requirement: 'FR11',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes } = t.refs;
      const staff = t.s.staff;

      // 两张在住单（猫/犬）
      const catReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: catReservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: catReservation.id });

      const dogReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aDog,
        roomType: roomTypes.dogStd,
        startDate: D1,
        endDate: D4,
        price: 10000,
      });
      await approveReservation(t, { reservationId: dogReservation.id, roomName: 'D101' });
      await checkInReservation(t, { reservationId: dogReservation.id });

      // 待审核单（用于状态前置断言）
      const pendingReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D6,
        endDate: D9,
      });

      // 未确认收款 / 非法收款方式不结单
      let response = await staff.post(`/api/reservations/${catReservation.id}/checkout`, {
        paymentMethod: 'cash',
      });
      t.check.status(response, 400, '未确认主人核对即结单');
      t.check.errorCode(response, 'PAYMENT_INVALID', '未确认主人核对即结单');
      response = await staff.post(`/api/reservations/${catReservation.id}/checkout`, {
        paymentMethod: 'cash',
        ownerConfirmed: false,
      });
      t.check.status(response, 400, '主人未确认账单即结单');
      t.check.errorCode(response, 'PAYMENT_INVALID', '主人未确认账单即结单');
      response = await staff.post(`/api/reservations/${catReservation.id}/checkout`, {
        paymentMethod: 'card',
        ownerConfirmed: true,
      });
      t.check.status(response, 400, '非法收款方式');
      t.check.errorCode(response, 'PAYMENT_INVALID', '非法收款方式');

      let bill = await getBill(t, { owner: 'staff', reservationId: catReservation.id });
      t.check.eq(bill.settled, false, '未确认收款时不结单');
      t.check.eq(
        (await getReservation(t, { reservationId: catReservation.id })).status,
        'checked_in',
        '未确认收款时保持已入住',
      );

      // 现金全额收款结单
      const cashResult = await checkoutReservation(t, {
        reservationId: catReservation.id,
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      const cashBill = cashResult.bill;
      t.check.eq(cashBill.settled, true, '现金结单后已结清');
      t.check.eq(cashBill.totalFen, 24000, '现金结单金额 240 元');
      t.check.eq(cashBill.receipt?.method, 'cash', '收款方式现金');
      t.check.eq(cashBill.receipt?.amountFen, 24000, '全额收款 240 元');
      t.check.eq(cashBill.invoice?.status, 'paid', '账单状态已收款');
      t.check.notNull(cashBill.receipt?.staffId, '收款记录操作人 id');
      t.check.notNull(cashBill.receipt?.staffName, '收款记录操作人姓名');
      t.check.notNull(cashBill.receipt?.paidAt, '收款记录时间');
      t.check.eq(cashResult.reservation.status, 'completed', '现金结单后预约已完成');
      t.check.notNull(cashResult.reservation.stay?.checkOutAt, '现金结单后入住结束');

      // 线下转账全额收款结单（犬舍标间 100 元/天 × 3 天 = 300 元）
      const transferResult = await checkoutReservation(t, {
        reservationId: dogReservation.id,
        paymentMethod: 'transfer',
        ownerConfirmed: true,
      });
      t.check.eq(transferResult.bill.receipt?.method, 'transfer', '收款方式线下转账');
      t.check.eq(transferResult.bill.receipt?.amountFen, 30000, '转账全额收款 300 元');
      t.check.eq(transferResult.bill.totalFen, 30000, '转账结单金额 300 元');
      t.check.eq(transferResult.reservation.status, 'completed', '转账结单后预约已完成');

      // 已结单重复结单、待审核单结单都被拒绝
      response = await staff.post(`/api/reservations/${catReservation.id}/checkout`, {
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      t.check.status(response, 409, '已结单重复结单');
      t.check.errorCode(response, 'INVALID_STATE', '已结单重复结单');
      response = await staff.post(`/api/reservations/${pendingReservation.id}/checkout`, {
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      t.check.status(response, 409, '待审核单结单');
      t.check.errorCode(response, 'INVALID_STATE', '待审核单结单');

      // 释放实际占用：结单后房间恢复可用
      const availability = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3, availableRooms: 2 },
        '结单后释放实际占用',
      );

      // 账单与收款记录可再次读取
      bill = await getBill(t, { owner: 'ownerA', reservationId: catReservation.id });
      t.check.eq(bill.settled, true, '结单后主人可读取已结清账单');
      t.check.eq(bill.totalFen, 24000, '结单后账单金额不变');
      t.check.eq(bill.invoice?.status, 'paid', '结单后账单状态已收款');
      t.check.eq(bill.receipt?.amountFen, 24000, '结单后收款记录金额不变');
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: catReservation.id });
      t.check.eq(detail.status, 'completed', '主人详情显示已完成');
      t.check.notNull(detail.stay?.checkOutAt, '主人详情入住已结束');
    },
  },

  {
    id: 'TC31',
    title: '管理员修改房型日价与房间名称/体重限制，历史订单快照不变',
    requirement: 'FR12',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms } = t.refs;
      const admin = t.s.admin;
      const ownerA = t.s.ownerA;
      const staff = t.s.staff;

      // 初始维护数据
      let response = await admin.get('/api/admin/rooms');
      t.check.status(response, 200, '管理员读取房型与房间维护数据');
      const adminRoomTypes = response.body?.roomTypes;
      t.check.eq(adminRoomTypes?.length, 4, '管理员应看到四类房型');
      for (const roomTypeRef of t.refs.roomTypeList) {
        const found = adminRoomTypes?.find((candidate) => candidate.id === roomTypeRef.id);
        t.check.notNull(found, `管理员数据应含房型「${roomTypeRef.name}」`);
        t.check.eq(found?.rooms?.length, 2, `房型「${roomTypeRef.name}」应有 2 个房间`);
        for (const roomRef of roomTypeRef.rooms) {
          const roomView = found?.rooms?.find((candidate) => candidate.id === roomRef.id);
          t.check.notNull(roomView, `管理员数据应含房间「${roomRef.name}」`);
          t.check.eq(roomView?.name, roomRef.name, `房间「${roomRef.name}」名称`);
          t.check.eq(roomView?.maxWeight, roomRef.maxWeight, `房间「${roomRef.name}」最大体重`);
          t.check.true(
            Number.isInteger(roomView?.activeReservationCount),
            `房间「${roomRef.name}」应返回 activeReservationCount`,
            { actual: roomView?.activeReservationCount },
          );
        }
      }

      // 改价前的历史订单
      const oldReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
        price: 8000,
      });

      // 修改房型日价 80 → 90
      response = await admin.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 9000 });
      t.check.status(response, 200, '管理员修改房型日价');
      t.check.eq(response.body?.roomType?.dailyPriceFen, 9000, '修改后返回新日价');
      response = await ownerA.get('/api/room-types');
      t.check.eq(
        response.body?.roomTypes?.find((candidate) => candidate.id === roomTypes.catStd.id)?.dailyPriceFen,
        9000,
        '改价后房型查询返回新日价',
      );

      // 历史订单价格快照不变，审核也不改价
      const oldDetail = await getReservation(t, { owner: 'ownerA', reservationId: oldReservation.id });
      t.check.eq(oldDetail.dailyPriceSnapshotFen, 8000, '历史订单价格快照不变');
      t.check.eq(oldDetail.baseFeeFen, 24000, '历史订单基础费不变');
      const confirmedOld = await approveReservation(t, { reservationId: oldReservation.id, roomName: 'C101' });
      t.check.eq(confirmedOld.dailyPriceSnapshotFen, 8000, '审核不修改价格快照');

      // 新订单按新价
      const newReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D6,
        endDate: D9,
        price: 9000,
      });
      t.check.eq(newReservation.dailyPriceSnapshotFen, 9000, '改价后新订单按新价保存快照');
      t.check.eq(newReservation.baseFeeFen, 27000, '改价后新订单基础费 270 元');

      // 修改无未完成预约房间的名称（允许）与体重限制（允许）
      response = await admin.put(`/api/admin/rooms/${rooms.C201.id}`, {
        name: 'C201-演示房',
        maxWeight: 8,
      });
      t.check.status(response, 200, '管理员修改无未完成预约房间的名称');
      t.check.eq(response.body?.room?.name, 'C201-演示房', '修改后返回新房间名称');
      t.check.eq(response.body?.room?.maxWeight, 8, '未改最大体重时保持原值');
      response = await admin.get('/api/admin/rooms');
      const c201View = response.body.roomTypes
        .find((candidate) => candidate.id === roomTypes.catLux.id)
        ?.rooms?.find((candidate) => candidate.id === rooms.C201.id);
      t.check.eq(c201View?.name, 'C201-演示房', '新房间名称保存后可读取');

      // 房间名称全局唯一
      response = await admin.put(`/api/admin/rooms/${rooms.C102.id}`, {
        name: 'C201-演示房',
        maxWeight: 6,
      });
      t.check.status(response, 400, '房间名称重复');
      t.check.errorCode(response, 'VALIDATION_ERROR', '房间名称重复');
      t.check.errorField(response, 'name', '房间名称重复');

      // 无未完成预约时可修改最大体重
      response = await admin.put(`/api/admin/rooms/${rooms.C201.id}`, {
        name: 'C201-演示房',
        maxWeight: 9,
      });
      t.check.status(response, 200, '管理员修改无未完成预约房间的最大体重');
      t.check.eq(response.body?.room?.maxWeight, 9, '最大体重修改保存');

      // C101 存在已确认预约：修改体重限制被拒绝，只改名称不受限制
      response = await admin.put(`/api/admin/rooms/${rooms.C101.id}`, {
        name: 'C101',
        maxWeight: 5,
      });
      t.check.status(response, 409, '存在未完成预约时修改最大体重');
      t.check.errorCode(response, 'ROOM_IN_USE', '存在未完成预约时修改最大体重');
      response = await admin.put(`/api/admin/rooms/${rooms.C101.id}`, {
        name: 'C101-A',
        maxWeight: 6,
      });
      t.check.status(response, 200, '存在未完成预约时只改名称');
      t.check.eq(response.body?.room?.name, 'C101-A', '只改名称保存成功');
      t.check.eq(response.body?.room?.maxWeight, 6, '最大体重保持 6kg');

      // 非法值
      response = await admin.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: -1 });
      t.check.status(response, 400, '房型日价为负');
      t.check.errorCode(response, 'VALIDATION_ERROR', '房型日价为负');
      response = await admin.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 90.5 });
      t.check.status(response, 400, '房型日价非整数');
      t.check.errorCode(response, 'VALIDATION_ERROR', '房型日价非整数');
      response = await admin.put(`/api/admin/rooms/${rooms.C102.id}`, { name: '', maxWeight: 6 });
      t.check.status(response, 400, '房间名称为空');
      t.check.errorCode(response, 'VALIDATION_ERROR', '房间名称为空');
      t.check.errorField(response, 'name', '房间名称为空');
      response = await admin.put(`/api/admin/rooms/${rooms.C102.id}`, { name: 'C102', maxWeight: 0 });
      t.check.status(response, 400, '房间最大体重为 0');
      t.check.errorCode(response, 'VALIDATION_ERROR', '房间最大体重为 0');
      t.check.errorField(response, 'maxWeight', '房间最大体重为 0');

      // 权限：只有管理员可访问维护接口
      response = await ownerA.get('/api/admin/rooms');
      t.check.status(response, 403, '主人访问管理员维护接口');
      t.check.errorCode(response, 'FORBIDDEN', '主人访问管理员维护接口');
      response = await ownerA.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 8000 });
      t.check.status(response, 403, '主人修改房型日价');
      response = await staff.get('/api/admin/rooms');
      t.check.status(response, 403, '工作人员访问管理员维护接口');
    },
  },
];
