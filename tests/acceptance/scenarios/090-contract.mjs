/**
 * 契约级断言场景（非 TC 编号，但 docs/API.md 明示的硬性契约）：
 * 未登录 401、角色/越权 403、无效日期/必填 400、PRICE_CHANGED details、
 * PET_OVERLAP、ROOM_UNAVAILABLE、结单后 completed 且金额精确到分、健康检查 today。
 */
import { D1, D2, D4, D5, D8, DAY0, shanghaiToday } from '../lib/dates.mjs';
import {
  approveReservation,
  assertAvailabilityItem,
  bookReservation,
  checkInReservation,
  checkoutReservation,
  getAvailability,
  getBill,
  getReservation,
  listReservations,
} from '../lib/flows.mjs';

export default [
  {
    id: 'C-AUTH-401',
    title: '契约：未登录访问受保护接口一律 401 UNAUTHENTICATED',
    requirement: 'docs/API.md §1/§4',
    async run(t) {
      await t.open(DAY0);
      const protectedEndpoints = [
        ['GET', '/api/pets'],
        ['POST', '/api/pets'],
        ['PUT', '/api/pets/1'],
        ['GET', '/api/room-types'],
        ['GET', `/api/availability?petId=1&startDate=${D1}&endDate=${D4}`],
        ['POST', '/api/reservations'],
        ['GET', '/api/reservations'],
        ['GET', '/api/reservations/1'],
        ['GET', '/api/reservations/1/candidate-rooms'],
        ['GET', '/api/reservations/1/care-tasks'],
        ['GET', '/api/reservations/1/bill'],
        ['POST', '/api/reservations/1/approve'],
        ['POST', '/api/reservations/1/reject'],
        ['POST', '/api/reservations/1/cancel'],
        ['POST', '/api/reservations/1/no-show'],
        ['POST', '/api/reservations/1/check-in'],
        ['POST', '/api/reservations/1/care-tasks'],
        ['POST', '/api/care-tasks/1/complete'],
        ['POST', '/api/reservations/1/checkout'],
        ['GET', '/api/stays'],
        ['GET', '/api/admin/rooms'],
        ['PUT', '/api/admin/room-types/1'],
        ['PUT', '/api/admin/rooms/1'],
        ['GET', '/api/auth/me'],
        ['POST', '/api/auth/logout'],
      ];
      for (const [method, pathname] of protectedEndpoints) {
        const response = await t.h.request(t.s.anon, method, pathname, method === 'GET' ? undefined : {});
        t.check.status(response, 401, `未登录 ${method} ${pathname}`);
        t.check.errorCode(response, 'UNAUTHENTICATED', `未登录 ${method} ${pathname}`);
      }

      // 公开接口：健康检查 200、登录不需要会话
      let response = await t.s.anon.get('/api/health');
      t.check.status(response, 200, '健康检查公开可访问');
      response = await t.h.request(t.s.anon, 'POST', '/api/auth/login', {
        loginName: 'ownerA',
        password: 'owner123',
      });
      t.check.status(response, 200, '登录接口公开可访问');
    },
  },

  {
    id: 'C-AUTHZ-403',
    title: '契约：角色越权一律 403 FORBIDDEN',
    requirement: 'docs/API.md §4',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms } = t.refs;
      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });

      // owner 调用 staff 接口
      const staffOnlyRequests = [
        ['GET', '/api/stays?status=active'],
        ['GET', `/api/reservations/${reservation.id}/candidate-rooms`],
        ['POST', `/api/reservations/${reservation.id}/approve`, { roomId: rooms.C101.id }],
        ['POST', `/api/reservations/${reservation.id}/reject`, { reason: '越权' }],
        ['POST', `/api/reservations/${reservation.id}/check-in`, { inspectionPassed: true, inspectionNotes: '越权' }],
        ['POST', `/api/reservations/${reservation.id}/no-show`, { reason: '越权' }],
        [
          'POST',
          `/api/reservations/${reservation.id}/care-tasks`,
          { kind: 'feeding', plannedAt: `${D2}T09:00`, instruction: '越权' },
        ],
        ['POST', `/api/reservations/${reservation.id}/checkout`, { paymentMethod: 'cash', ownerConfirmed: true }],
      ];
      for (const [method, pathname, body] of staffOnlyRequests) {
        const response = await t.h.request(t.s.ownerA, method, pathname, body);
        t.check.status(response, 403, `主人调用工作人员接口 ${method} ${pathname}`);
        t.check.errorCode(response, 'FORBIDDEN', `主人调用工作人员接口 ${method} ${pathname}`);
      }

      // staff 调用 owner 接口
      let response = await t.s.staff.get('/api/pets');
      t.check.status(response, 403, '工作人员读取宠物列表（仅主人）');
      t.check.errorCode(response, 'FORBIDDEN', '工作人员读取宠物列表');
      response = await t.s.staff.post('/api/pets', {
        name: '工作人员建宠物',
        species: 'cat',
        weight: 1,
        contact: '1',
      });
      t.check.status(response, 403, '工作人员新建宠物档案');
      response = await t.s.staff.get(`/api/availability?petId=${pets.aCat.id}&startDate=${D1}&endDate=${D4}`);
      t.check.status(response, 403, '工作人员查询主人可用性');

      // owner / staff 调用 admin 接口
      response = await t.s.ownerA.get('/api/admin/rooms');
      t.check.status(response, 403, '主人访问管理员维护接口');
      t.check.errorCode(response, 'FORBIDDEN', '主人访问管理员维护接口');
      response = await t.s.staff.get('/api/admin/rooms');
      t.check.status(response, 403, '工作人员访问管理员维护接口');
      response = await t.s.staff.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 8000 });
      t.check.status(response, 403, '工作人员修改房型日价');
      response = await t.s.ownerA.put(`/api/admin/rooms/${rooms.C101.id}`, {
        name: 'C101-HACK',
        maxWeight: 6,
      });
      t.check.status(response, 403, '主人修改房间资料');
    },
  },

  {
    id: 'C-VALIDATION-400',
    title: '契约：无效日期/必填项一律 400 VALIDATION_ERROR',
    requirement: 'docs/API.md §5.2/5.3/5.4',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes } = t.refs;
      const ownerA = t.s.ownerA;

      // 可用性查询参数
      let response = await ownerA.get('/api/availability');
      t.check.status(response, 400, '可用性查询缺少参数');
      t.check.errorCode(response, 'VALIDATION_ERROR', '可用性查询缺少参数');
      response = await ownerA.get(`/api/availability?petId=${pets.aCat.id}`);
      t.check.status(response, 400, '可用性查询缺少日期');
      t.check.errorCode(response, 'VALIDATION_ERROR', '可用性查询缺少日期');
      response = await ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=${D1}&endDate=${D1}`,
      );
      t.check.status(response, 400, '可用性查询开始日等于离店日');
      t.check.errorField(response, 'endDate', '可用性查询开始日等于离店日');
      response = await ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=${D4}&endDate=${D1}`,
      );
      t.check.status(response, 400, '可用性查询离店日早于开始日');
      t.check.errorField(response, 'endDate', '可用性查询离店日早于开始日');
      response = await ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=2026-10-30&endDate=${D4}`,
      );
      t.check.status(response, 400, '可用性查询开始日早于今天');
      t.check.errorField(response, 'startDate', '可用性查询开始日早于今天');
      response = await ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=2026-13-01&endDate=${D4}`,
      );
      t.check.status(response, 400, '可用性查询日期格式非法');
      t.check.errorCode(response, 'VALIDATION_ERROR', '可用性查询日期格式非法');

      // 提交预约缺字段 / 日期非法
      response = await ownerA.post('/api/reservations', {});
      t.check.status(response, 400, '提交预约空请求');
      t.check.errorCode(response, 'VALIDATION_ERROR', '提交预约空请求');
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D1,
        endDate: D4,
      });
      t.check.status(response, 400, '提交预约缺少已确认日价');
      t.check.errorCode(response, 'VALIDATION_ERROR', '提交预约缺少已确认日价');
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D1,
        endDate: D1,
        confirmedDailyPriceFen: 8000,
      });
      t.check.status(response, 400, '提交预约开始日等于离店日');
      t.check.errorCode(response, 'VALIDATION_ERROR', '提交预约开始日等于离店日');
      t.check.errorField(response, 'endDate', '提交预约开始日等于离店日');
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: '2026-10-30',
        endDate: D4,
        confirmedDailyPriceFen: 8000,
      });
      t.check.status(response, 400, '提交预约开始日早于今天');
      t.check.errorCode(response, 'VALIDATION_ERROR', '提交预约开始日早于今天');
      t.check.errorField(response, 'startDate', '提交预约开始日早于今天');
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: '2026-02-30',
        endDate: D4,
        confirmedDailyPriceFen: 8000,
      });
      t.check.status(response, 400, '提交预约日期不存在');
      t.check.errorCode(response, 'VALIDATION_ERROR', '提交预约日期不存在');

      // 宠物必填
      response = await ownerA.post('/api/pets', { species: 'cat', weight: 1, contact: '139' });
      t.check.status(response, 400, '宠物档案缺少名称');
      t.check.errorCode(response, 'VALIDATION_ERROR', '宠物档案缺少名称');
      t.check.errorField(response, 'name', '宠物档案缺少名称');

      // 以上非法请求均不应创建预约
      const reservations = await listReservations(t, { owner: 'ownerA' });
      t.check.eq(reservations.length, 0, '非法提交不应创建预约');
    },
  },

  {
    id: 'C-PRICE-CHANGED',
    title: '契约：PRICE_CHANGED 的 details 含新日价/天数/总额且不创建预约',
    requirement: 'docs/API.md §5.4',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes } = t.refs;
      const ownerA = t.s.ownerA;

      await t.s.admin.put(`/api/admin/room-types/${roomTypes.catStd.id}`, { dailyPriceFen: 9000 });
      const response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D1,
        endDate: D4,
        confirmedDailyPriceFen: 8000,
      });
      t.check.status(response, 409, '旧价提交');
      t.check.errorCode(response, 'PRICE_CHANGED', '旧价提交');
      const error = response.body?.error;
      t.check.true(typeof error?.code === 'string' && error.code === 'PRICE_CHANGED', '错误结构含 code');
      t.check.true(typeof error?.message === 'string' && error.message.length > 0, '错误结构含中文提示');
      t.check.eq(error?.details?.dailyPriceFen, 9000, 'details.dailyPriceFen');
      t.check.eq(error?.details?.plannedDays, 3, 'details.plannedDays');
      t.check.eq(error?.details?.totalFen, 27000, 'details.totalFen');
      const reservations = await listReservations(t, { owner: 'ownerA' });
      t.check.eq(reservations.length, 0, 'PRICE_CHANGED 不创建预约');

      // 重新确认后按新价创建
      const retry = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D1,
        endDate: D4,
        confirmedDailyPriceFen: 9000,
      });
      t.check.status(retry, 201, '重新确认新价后提交');
      t.check.eq(retry.body?.reservation?.dailyPriceSnapshotFen, 9000, '重新确认后快照 90 元');
      t.check.eq(retry.body?.reservation?.baseFeeFen, 27000, '重新确认后基础费 270 元');
    },
  },

  {
    id: 'C-PET-OVERLAP',
    title: '契约：同宠物与已确认/已入住预约区间重叠返回 409 PET_OVERLAP',
    requirement: 'docs/API.md §5.4 / BR01',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes } = t.refs;
      const ownerA = t.s.ownerA;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: reservation.id, roomName: 'C101' });

      // 已确认后同宠物重叠提交 → PET_OVERLAP
      let response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catLux.id,
        startDate: D2,
        endDate: D5,
        confirmedDailyPriceFen: 12000,
      });
      t.check.status(response, 409, '已确认预约后同宠物重叠提交');
      t.check.errorCode(response, 'PET_OVERLAP', '已确认预约后同宠物重叠提交');
      let reservations = await listReservations(t, { owner: 'ownerA' });
      t.check.eq(reservations.length, 1, '重叠提交失败不应创建预约');

      // 相邻区间不算重叠
      const adjacent = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D4,
        endDate: D8,
      });
      t.check.eq(adjacent.status, 'pending', '[start,end) 相邻区间不算重叠');

      // 已入住同样占用宠物区间
      await checkInReservation(t, { reservationId: reservation.id });
      response = await ownerA.post('/api/reservations', {
        petId: pets.aCat.id,
        roomTypeId: roomTypes.catStd.id,
        startDate: D2,
        endDate: D5,
        confirmedDailyPriceFen: 8000,
      });
      t.check.status(response, 409, '已入住预约后同宠物重叠提交');
      t.check.errorCode(response, 'PET_OVERLAP', '已入住预约后同宠物重叠提交');
      reservations = await listReservations(t, { owner: 'ownerA' });
      t.check.eq(reservations.length, 2, '失败的重叠提交不应创建预约');
    },
  },

  {
    id: 'C-ROOM-UNAVAILABLE',
    title: '契约：房型不符/区间冲突/当前被占返回 409 ROOM_UNAVAILABLE',
    requirement: 'docs/API.md §5.6 / BR06',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms } = t.refs;
      const staff = t.s.staff;

      // 准备：第一单已确认（C101，11-01~11-04），第二单计划区间不重叠（C101，11-05~11-08）且此时房间尚无在住记录
      const firstReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      await approveReservation(t, { reservationId: firstReservation.id, roomName: 'C101' });
      const nextReservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D5,
        endDate: D8,
      });
      await approveReservation(t, { reservationId: nextReservation.id, roomName: 'C101' });
      await checkInReservation(t, { reservationId: firstReservation.id });

      // 计划区间冲突：C101 已被第一单的计划区间占用
      const secondReservation = await bookReservation(t, {
        owner: 'ownerB',
        pet: pets.bCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      let response = await staff.post(`/api/reservations/${secondReservation.id}/approve`, {
        roomId: rooms.C101.id,
      });
      t.check.status(response, 409, '审核到计划区间已占用房间');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '审核到计划区间已占用房间');

      // 房间不属于该房型
      response = await staff.post(`/api/reservations/${secondReservation.id}/approve`, {
        roomId: rooms.D101.id,
      });
      t.check.status(response, 409, '审核到不属于该房型的房间');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '审核到不属于该房型的房间');

      // 当前实际被占：第一单尚未离店，第二单按计划可排但入住时必须拒绝
      await t.phase(D5);
      response = await staff.post(`/api/reservations/${nextReservation.id}/check-in`, {
        inspectionPassed: true,
        inspectionNotes: '资料核验通过',
      });
      t.check.status(response, 409, '入住时房间仍被未离店入住占用');
      t.check.errorCode(response, 'ROOM_UNAVAILABLE', '入住时房间仍被未离店入住占用');
      t.check.eq(
        (await getReservation(t, { reservationId: nextReservation.id })).status,
        'confirmed',
        '入住被拒后预约保持已确认',
      );
    },
  },

  {
    id: 'C-BILL-EXACT',
    title: '契约：结单后状态 completed、账单金额精确到分且重启后持久化',
    requirement: 'docs/API.md §5.10 / BR09/BR11',
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

      // 11-05 离店：240 + 80 = 320 元
      await t.phase(D5);
      const preview = await getBill(t, { owner: 'staff', reservationId: reservation.id });
      for (const field of ['baseFeeFen', 'overdueFeeFen', 'totalFen']) {
        t.check.fen(preview[field], `结单前账单 ${field}`);
      }
      t.check.eq(preview.totalFen, preview.baseFeeFen + preview.overdueFeeFen, '应收 = 基础费 + 逾期费');

      const checkoutResult = await checkoutReservation(t, {
        reservationId: reservation.id,
        paymentMethod: 'cash',
        ownerConfirmed: true,
      });
      t.check.eq(checkoutResult.reservation.status, 'completed', '结单后预约状态 completed');
      t.check.notNull(checkoutResult.reservation.stay?.checkOutAt, '结单后入住记录有离店时间');
      const bill = checkoutResult.bill;
      for (const field of ['baseFeeFen', 'overdueFeeFen', 'totalFen']) {
        t.check.fen(bill[field], `结单账单 ${field}`);
      }
      for (const field of ['baseFeeFen', 'overdueFeeFen', 'totalFen']) {
        t.check.fen(bill.invoice?.[field], `正式账单 ${field}`);
      }
      t.check.eq(bill.settled, true, 'settled=true');
      t.check.eq(bill.invoice?.status, 'paid', 'invoice.status=paid');
      t.check.eq(bill.totalFen, 32000, 'totalFen=32000 分');
      t.check.eq(bill.invoice?.totalFen, 32000, 'invoice.totalFen=32000 分');
      t.check.eq(bill.receipt?.amountFen, 32000, 'receipt.amountFen=32000 分（全额收款）');
      t.check.eq(bill.computedOn, D5, 'bill.computedOn 为业务“今天” 11-05');
      t.check.eq(bill.actualCheckInDate, D1, 'actualCheckInDate 跟随业务日期 11-01');
      t.check.eq(bill.actualCheckOutDate, D5, 'actualCheckOutDate 跟随业务日期 11-05');

      // 重启后账单保持一致（持久化）
      await t.phase(D5);
      const persisted = await getBill(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(persisted.settled, true, '重启后账单仍已结清');
      t.check.eq(persisted.plannedDays, 3, '重启后计划天数');
      t.check.eq(persisted.dailyPriceFen, 8000, '重启后锁定日价');
      t.check.eq(persisted.baseFeeFen, 24000, '重启后基础费 240 元');
      t.check.eq(persisted.overdueDays, 1, '重启后逾期天数 1');
      t.check.eq(persisted.overdueFeeFen, 8000, '重启后逾期费 80 元');
      t.check.eq(persisted.totalFen, 32000, '重启后合计 320 元');
      t.check.eq(persisted.invoice?.totalFen, 32000, '重启后正式账单金额');
      t.check.eq(persisted.receipt?.amountFen, 32000, '重启后收款金额');
      t.check.eq(persisted.invoice?.status, 'paid', '重启后账单状态');
      t.check.eq(persisted.computedOn, D5, '重启后账单计算日');
      t.check.eq(persisted.actualCheckInDate, D1, '重启后实际入住日');
      t.check.eq(persisted.actualCheckOutDate, D5, '重启后实际离店日');
      const detail = await getReservation(t, { owner: 'ownerA', reservationId: reservation.id });
      t.check.eq(detail.status, 'completed', '重启后预约状态仍为 completed');
    },
  },

  {
    id: 'C-HEALTH',
    title: '契约：健康检查返回正确的 today 与 clockOverridden（PB_TODAY 覆盖）',
    requirement: 'docs/API.md §6',
    async run(t) {
      // 注入演示日期
      await t.open(DAY0);
      let response = await t.s.anon.get('/api/health');
      t.check.status(response, 200, '健康检查公开可访问');
      t.check.eq(response.body?.today, DAY0, '注入 todayOverride 后 health.today 应为注入日期');
      t.check.eq(response.body?.clockOverridden, true, '注入 todayOverride 后 clockOverridden 应为 true');

      // 其它日期注入同样生效
      await t.phase(D5);
      response = await t.s.anon.get('/api/health');
      t.check.eq(response.body?.today, D5, '切换 todayOverride 后 health.today 跟随变化');

      // 不注入时使用真实门店日期（Asia/Shanghai）
      await t.open(undefined);
      response = await t.s.anon.get('/api/health');
      t.check.status(response, 200, '真实日期模式健康检查');
      t.check.eq(response.body?.today, shanghaiToday(), '未注入时 health.today 应为 Asia/Shanghai 真实日期');
      t.check.neq(response.body?.clockOverridden, true, '未注入时不应标记 clockOverridden=true');
    },
  },
];
