/**
 * 验收场景 TC01–TC05：认证/权限、宠物档案、房型查询、提交预约。
 * 需求依据见 docs/requirements/05_核对与答辩/01_验收场景.md。
 */
import { ACCOUNTS } from '../lib/fixtures.mjs';
import { D1, D2, D4, D5, DAY0 } from '../lib/dates.mjs';
import { Session } from '../lib/harness.mjs';
import {
  approveReservation,
  assertAvailabilityItem,
  bookReservation,
  checkInReservation,
  createCareTask,
  createPet,
  getAvailability,
  getCandidateRooms,
  getReservation,
  listReservations,
} from '../lib/flows.mjs';

export default [
  {
    id: 'TC01',
    title: '预设账号登录与退出',
    requirement: 'FR01',
    async run(t) {
      await t.open(DAY0);

      // 未登录访问受保护接口 → 401 UNAUTHENTICATED
      let response = await t.s.anon.get('/api/auth/me');
      t.check.status(response, 401, '未登录读取当前账号');
      t.check.errorCode(response, 'UNAUTHENTICATED', '未登录读取当前账号');
      response = await t.s.anon.get('/api/pets');
      t.check.status(response, 401, '未登录读取宠物列表');

      // 四个预设账号均可登录并进入对应角色；退出后受保护接口要求重新登录
      for (const account of ACCOUNTS) {
        const session = new Session(t.h, `${account.loginName}-login`);
        const loginResponse = await session.login(account.loginName, account.password);
        t.check.status(loginResponse, 200, `登录 ${account.loginName}`);
        const accountBody = loginResponse.body?.account;
        t.check.notNull(accountBody, `登录 ${account.loginName} 响应缺少 account`);
        t.check.eq(accountBody.loginName, account.loginName, `登录 ${account.loginName}：loginName`);
        t.check.eq(accountBody.displayName, account.displayName, `登录 ${account.loginName}：displayName`);
        t.check.true(Array.isArray(accountBody.roles), `登录 ${account.loginName}：roles 应为数组`, {
          actual: accountBody.roles,
        });
        t.check.includes(accountBody.roles, account.role, `登录 ${account.loginName}：roles 应包含 ${account.role}`);

        const setCookieText = loginResponse.setCookies.join('; ');
        t.check.match(setCookieText, /pb_session=/i, `登录 ${account.loginName}：应下发 pb_session Cookie`);
        t.check.match(setCookieText, /HttpOnly/i, `登录 ${account.loginName}：Cookie 应为 HttpOnly`);
        t.check.match(setCookieText, /SameSite=Lax/i, `登录 ${account.loginName}：Cookie 应为 SameSite=Lax`);
        t.check.true(session.jar.has('pb_session'), `登录 ${account.loginName}：Cookie Jar 应保存 pb_session`);

        const meResponse = await session.get('/api/auth/me');
        t.check.status(meResponse, 200, `登录后读取当前账号 ${account.loginName}`);
        t.check.eq(meResponse.body?.account?.loginName, account.loginName, `当前账号 ${account.loginName}`);

        const logoutResponse = await session.post('/api/auth/logout');
        t.check.status(logoutResponse, 204, `退出 ${account.loginName}`);
        const meAfterLogout = await session.get('/api/auth/me');
        t.check.status(meAfterLogout, 401, `退出后读取当前账号 ${account.loginName}`);
        t.check.errorCode(meAfterLogout, 'UNAUTHENTICATED', `退出后会话应失效 ${account.loginName}`);
        const protectedAfterLogout = await session.get('/api/reservations');
        t.check.status(protectedAfterLogout, 401, `退出后访问受保护页面接口 ${account.loginName}`);
      }

      // 错误凭据 / 缺字段
      const badSession = new Session(t.h, 'bad-login');
      response = await badSession.post('/api/auth/login', { loginName: 'ownerA', password: 'wrong-password' });
      t.check.status(response, 401, '错误密码登录');
      t.check.errorCode(response, 'LOGIN_FAILED', '错误密码登录');
      t.check.true(badSession.jar.serialize() === '', '登录失败不应留下有效会话 Cookie');
      response = await badSession.post('/api/auth/login', { password: 'owner123' });
      t.check.status(response, 400, '缺少登录名');
      t.check.errorCode(response, 'VALIDATION_ERROR', '缺少登录名');
      response = await badSession.post('/api/auth/login', { loginName: 'ownerA' });
      t.check.status(response, 400, '缺少密码');
      t.check.errorCode(response, 'VALIDATION_ERROR', '缺少密码');
    },
  },

  {
    id: 'TC02',
    title: '跨账号归属拒绝（宠物/预约/照护/账单）',
    requirement: 'FR01/FR09',
    async run(t) {
      await t.open(DAY0);
      const { pets, accounts } = t.refs;
      const ownerA = t.s.ownerA;
      const ownerB = t.s.ownerB;

      // 宠物列表仅本人可见
      let response = await ownerA.get('/api/pets');
      t.check.status(response, 200, '主人A读取宠物列表');
      const aPets = response.body?.pets ?? [];
      t.check.true(aPets.length >= 2, '主人A应至少看到种子宠物咪咪与旺财', { actual: aPets.map((pet) => pet.name) });
      for (const pet of aPets) {
        t.check.eq(pet.ownerId, accounts.ownerA.id, `主人A宠物「${pet.name}」：ownerId 应为本人`);
      }
      response = await ownerB.get('/api/pets');
      t.check.status(response, 200, '主人B读取宠物列表');
      const bPets = response.body?.pets ?? [];
      for (const pet of bPets) {
        t.check.eq(pet.ownerId, accounts.ownerB.id, `主人B宠物「${pet.name}」：ownerId 应为本人`);
      }
      t.check.notIncludes(aPets.map((pet) => pet.id), pets.bDog.id, '主人A宠物列表不应出现主人B的宠物');

      // A 访问 B 的宠物档案
      response = await ownerA.put(`/api/pets/${pets.bDog.id}`, {
        name: pets.bDog.name,
        species: pets.bDog.species,
        weight: pets.bDog.weight,
        contact: pets.bDog.contact,
        careNotes: '',
        vaccineNotes: '',
      });
      t.check.status(response, 403, '主人A编辑主人B的宠物档案');
      t.check.errorCode(response, 'FORBIDDEN', '主人A编辑主人B的宠物档案');
      response = await ownerA.get(`/api/availability?petId=${pets.bCat.id}&startDate=${D1}&endDate=${D4}`);
      t.check.status(response, 403, '主人A查询主人B宠物的可用性');
      t.check.errorCode(response, 'FORBIDDEN', '主人A查询主人B宠物的可用性');

      // B 提交预约后，A 不能读取/取消；B 本人可以
      const bReservation = await bookReservation(t, {
        owner: 'ownerB',
        pet: pets.bCat,
        roomType: t.refs.roomTypes.catStd,
        startDate: D1,
        endDate: D4,
      });
      response = await ownerA.get(`/api/reservations/${bReservation.id}`);
      t.check.status(response, 403, '主人A读取主人B的预约详情');
      t.check.errorCode(response, 'FORBIDDEN', '主人A读取主人B的预约详情');
      response = await ownerA.post(`/api/reservations/${bReservation.id}/cancel`, { reason: '越权取消' });
      t.check.status(response, 403, '主人A取消主人B的预约');
      t.check.errorCode(response, 'FORBIDDEN', '主人A取消主人B的预约');
      response = await ownerB.get(`/api/reservations/${bReservation.id}`);
      t.check.status(response, 200, '主人B读取本人预约详情');

      // 审核通过 + 入住 + 建照护任务后，A 仍不能读取 B 的照护与账单
      await approveReservation(t, { reservationId: bReservation.id, roomName: 'C102' });
      await checkInReservation(t, { reservationId: bReservation.id });
      await createCareTask(t, {
        reservationId: bReservation.id,
        kind: 'feeding',
        plannedAt: `${D2}T09:00`,
        instruction: '主人B订单的照护任务',
      });
      response = await ownerA.get(`/api/reservations/${bReservation.id}/care-tasks`);
      t.check.status(response, 403, '主人A读取主人B的照护任务');
      t.check.errorCode(response, 'FORBIDDEN', '主人A读取主人B的照护任务');
      response = await ownerA.get(`/api/reservations/${bReservation.id}/bill`);
      t.check.status(response, 403, '主人A读取主人B的账单');
      t.check.errorCode(response, 'FORBIDDEN', '主人A读取主人B的账单');

      // 列表隔离：A 仅看到本人预约，B / staff 可见范围符合契约
      const aList = await listReservations(t, { owner: 'ownerA' });
      t.check.true(!aList.some((item) => item.id === bReservation.id), '主人A预约列表不应包含主人B的预约', {
        actual: aList.map((item) => item.id),
      });
      const bList = await listReservations(t, { owner: 'ownerB' });
      t.check.includes(bList.map((item) => item.id), bReservation.id, '主人B预约列表应包含本人预约');
      const staffList = await listReservations(t, { owner: 'staff' });
      t.check.includes(staffList.map((item) => item.id), bReservation.id, '工作人员预约列表应包含全部预约');
    },
  },

  {
    id: 'TC03',
    title: '宠物建档必填校验与正体重',
    requirement: 'FR02',
    async run(t) {
      await t.open(DAY0);
      const ownerA = t.s.ownerA;

      let response = await ownerA.get('/api/pets');
      t.check.status(response, 200, '读取宠物列表');
      const petCountBefore = response.body?.pets?.length ?? 0;

      const base = {
        name: '小白',
        species: 'cat',
        weight: 3.5,
        contact: '13900000001',
        careNotes: '',
        vaccineNotes: '',
      };
      const invalidCases = [
        { label: '缺少名称', body: { ...base, name: undefined }, field: 'name' },
        { label: '名称为空字符串', body: { ...base, name: '' }, field: 'name' },
        { label: '缺少物种', body: { ...base, species: undefined }, field: 'species' },
        { label: '物种非法', body: { ...base, species: 'bird' }, field: 'species' },
        { label: '缺少体重', body: { ...base, weight: undefined }, field: 'weight' },
        { label: '体重为 0', body: { ...base, weight: 0 }, field: 'weight' },
        { label: '体重为负', body: { ...base, weight: -1.5 }, field: 'weight' },
        { label: '体重非数字', body: { ...base, weight: 'heavy' }, field: 'weight' },
        { label: '缺少联系人', body: { ...base, contact: undefined }, field: 'contact' },
        { label: '联系人为空', body: { ...base, contact: '' }, field: 'contact' },
      ];
      for (const testCase of invalidCases) {
        response = await ownerA.post('/api/pets', testCase.body);
        t.check.status(response, 400, `新建宠物非法输入：${testCase.label}`);
        t.check.errorCode(response, 'VALIDATION_ERROR', `新建宠物非法输入：${testCase.label}`);
        t.check.errorField(response, testCase.field, `新建宠物非法输入：${testCase.label}`);
      }
      response = await ownerA.get('/api/pets');
      t.check.eq(response.body?.pets?.length, petCountBefore, '非法提交后宠物数量不应变化');

      // 合法档案保存并刷新可见
      response = await ownerA.post('/api/pets', base);
      t.check.status(response, 201, '新建合法宠物档案');
      const pet = t.check.notNull(response.body?.pet, '新建宠物响应缺少 pet');
      t.check.eq(pet.name, base.name, '新宠物名称');
      t.check.eq(pet.species, base.species, '新宠物物种');
      t.check.eq(pet.weight, base.weight, '新宠物体重');
      t.check.eq(pet.contact, base.contact, '新宠物联系人');
      t.check.eq(pet.ownerId, t.refs.accounts.ownerA.id, '新宠物归属当前主人');

      // 刷新页面（重新 createApp 同一数据库）后仍可读取
      await t.phase(DAY0);
      response = await t.s.ownerA.get('/api/pets');
      t.check.status(response, 200, '刷新后读取宠物列表');
      const refreshed = response.body?.pets?.find((candidate) => candidate.id === pet.id);
      t.check.notNull(refreshed, '刷新后应仍能读到新宠物档案');
      t.check.eq(refreshed?.name, base.name, '刷新后宠物名称');

      // 编辑本人宠物后刷新可见
      response = await t.s.ownerA.put(`/api/pets/${pet.id}`, { ...base, name: '小白-已编辑', weight: 4 });
      t.check.status(response, 200, '编辑本人宠物档案');
      t.check.eq(response.body?.pet?.name, '小白-已编辑', '编辑后的宠物名称');
      t.check.eq(response.body?.pet?.weight, 4, '编辑后的宠物体重');
      response = await t.s.ownerA.get('/api/pets');
      const edited = response.body?.pets?.find((candidate) => candidate.id === pet.id);
      t.check.eq(edited?.name, '小白-已编辑', '刷新后编辑结果可见');
    },
  },

  {
    id: 'TC04',
    title: '猫犬分别查询匹配房型、日价、计划总价与连续可用数量',
    requirement: 'FR03',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes } = t.refs;

      // 四类房型及日价
      let response = await t.s.ownerA.get('/api/room-types');
      t.check.status(response, 200, '读取房型列表');
      const roomTypesBody = response.body?.roomTypes;
      t.check.true(Array.isArray(roomTypesBody), '房型列表响应缺少 roomTypes 数组', { response });
      t.check.eq(roomTypesBody.length, 4, '本版固定四类房型');
      for (const roomTypeRef of t.refs.roomTypeList) {
        const found = roomTypesBody.find((candidate) => candidate.id === roomTypeRef.id);
        t.check.notNull(found, `房型列表应包含「${roomTypeRef.name}」`);
        t.check.eq(found?.dailyPriceFen, roomTypeRef.dailyPriceFen, `房型「${roomTypeRef.name}」日价`);
        t.check.eq(found?.species, roomTypeRef.species, `房型「${roomTypeRef.name}」物种`);
      }

      // 猫：只匹配两个猫房型，价格与连续可用数量正确
      response = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      t.check.eq(response.startDate, D1, '猫查询 startDate');
      t.check.eq(response.endDate, D4, '猫查询 endDate');
      t.check.eq(response.plannedDays, 3, '猫查询 plannedDays');
      t.check.eq(response.items.length, 2, '猫查询应只返回两个猫房型');
      for (const item of response.items) t.check.eq(item.species, 'cat', '猫查询房型物种均为猫');
      assertAvailabilityItem(
        t,
        response,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3, availableRooms: 2 },
        '猫查询-猫舍标间',
      );
      assertAvailabilityItem(
        t,
        response,
        roomTypes.catLux,
        { dailyPriceFen: 12000, plannedDays: 3, availableRooms: 2 },
        '猫查询-猫舍豪华间',
      );

      // 犬：只匹配两个犬房型
      response = await getAvailability(t, { petId: pets.aDog.id, startDate: D1, endDate: D4 });
      t.check.eq(response.items.length, 2, '犬查询应只返回两个犬房型');
      for (const item of response.items) t.check.eq(item.species, 'dog', '犬查询房型物种均为犬');
      assertAvailabilityItem(
        t,
        response,
        roomTypes.dogStd,
        { dailyPriceFen: 10000, plannedDays: 3, availableRooms: 2 },
        '犬查询-犬舍标间',
      );
      assertAvailabilityItem(
        t,
        response,
        roomTypes.dogLux,
        { dailyPriceFen: 15000, plannedDays: 3, availableRooms: 2 },
        '犬查询-犬舍豪华间',
      );

      // 体重匹配：30kg 犬只超出犬舍标间最大体重 25kg，items 仅含犬舍豪华间（UC03/API §5.3）
      response = await getAvailability(t, {
        owner: 'ownerB',
        petId: pets.bDog.id,
        startDate: D1,
        endDate: D4,
      });
      t.check.eq(response.items.length, 1, '30kg 犬只应只匹配犬舍豪华间');
      t.check.eq(response.items[0]?.roomTypeId, roomTypes.dogLux.id, '30kg 犬只匹配房型应为犬舍豪华间');
      t.check.eq(response.items[0]?.availableRooms, 2, '30kg 犬只的犬舍豪华间连续可用应为 2 间');

      // 查询不占房：多次查询不产生预约
      const before = await listReservations(t, { owner: 'ownerA' });
      await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      await getAvailability(t, { petId: pets.aDog.id, startDate: D1, endDate: D4 });
      const after = await listReservations(t, { owner: 'ownerA' });
      t.check.eq(after.length, before.length, '查询可用性不应创建或占用预约');

      // 非法日期
      response = await t.s.ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=${D4}&endDate=${D1}`,
      );
      t.check.status(response, 400, '离店日早于开始日');
      t.check.errorCode(response, 'VALIDATION_ERROR', '离店日早于开始日');
      t.check.errorField(response, 'endDate', '离店日早于开始日');
      response = await t.s.ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=${D1}&endDate=${D1}`,
      );
      t.check.status(response, 400, '开始日等于离店日');
      t.check.errorField(response, 'endDate', '开始日等于离店日');
      response = await t.s.ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=2026-10-30&endDate=${D4}`,
      );
      t.check.status(response, 400, '开始日早于今天');
      t.check.errorField(response, 'startDate', '开始日早于今天');
      response = await t.s.ownerA.get(
        `/api/availability?petId=${pets.aCat.id}&startDate=2026-13-01&endDate=${D4}`,
      );
      t.check.status(response, 400, '日期格式非法');
      t.check.errorCode(response, 'VALIDATION_ERROR', '日期格式非法');

      // 他人宠物不可查询
      response = await t.s.ownerA.get(
        `/api/availability?petId=${pets.bCat.id}&startDate=${D1}&endDate=${D4}`,
      );
      t.check.status(response, 403, '主人A查询主人B宠物的可用性');
      t.check.errorCode(response, 'FORBIDDEN', '主人A查询主人B宠物的可用性');
    },
  },

  {
    id: 'TC05',
    title: '提交预约生成待审核单并保存日价快照、不分房',
    requirement: 'FR04',
    async run(t) {
      await t.open(DAY0);
      const { pets, roomTypes, rooms, accounts } = t.refs;

      const reservation = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D1,
        endDate: D4,
        price: 8000,
      });
      t.check.eq(reservation.status, 'pending', '新提交预约状态应为待审核');
      t.check.isNull(reservation.roomId, '待审核预约不应分房（roomId）');
      t.check.isNull(reservation.room, '待审核预约不应分房（room）');
      t.check.eq(reservation.dailyPriceSnapshotFen, 8000, '应保存日价快照 80 元');
      t.check.eq(reservation.plannedDays, 3, '应保存计划天数 3');
      t.check.fen(reservation.baseFeeFen, '基础费');
      t.check.eq(reservation.baseFeeFen, 24000, '基础费 = 快照日价 × 计划天数 = 240 元');
      t.check.eq(reservation.roomTypeId, roomTypes.catStd.id, '应保存房型');
      t.check.eq(reservation.petId, pets.aCat.id, '应关联宠物');
      t.check.eq(reservation.ownerId, accounts.ownerA.id, '应关联主人');
      t.check.eq(reservation.startDate, D1, '开始日');
      t.check.eq(reservation.endDate, D4, '离店日');

      // 主人 / 工作人员列表可见
      let list = await listReservations(t, { owner: 'ownerA', status: 'pending' });
      t.check.includes(list.map((item) => item.id), reservation.id, '主人待审核列表应包含该单');
      list = await listReservations(t, { owner: 'staff', status: 'pending' });
      t.check.includes(list.map((item) => item.id), reservation.id, '工作人员待审核列表应包含该单');

      // 待审核不占房
      const availability = await getAvailability(t, { petId: pets.aCat.id, startDate: D1, endDate: D4 });
      assertAvailabilityItem(
        t,
        availability,
        roomTypes.catStd,
        { dailyPriceFen: 8000, plannedDays: 3, availableRooms: 2 },
        '待审核不占房',
      );

      // 候选房间可供审核，但预约本身仍未分房
      const candidates = await getCandidateRooms(t, { reservationId: reservation.id });
      t.check.eq(candidates.length, 2, '猫舍标间应有 2 个候选房间');
      t.check.includes(candidates.map((room) => room.id), rooms.C101.id, '候选房间应包含 C101');
      t.check.includes(candidates.map((room) => room.id), rooms.C102.id, '候选房间应包含 C102');
      const detail = await getReservation(t, { reservationId: reservation.id });
      t.check.isNull(detail.roomId, '读取详情：待审核仍不分房');

      // 契约 5.4：待审核单不参与宠物区间重叠占用，同宠物重叠再提交仍允许
      const second = await bookReservation(t, {
        owner: 'ownerA',
        pet: pets.aCat,
        roomType: roomTypes.catStd,
        startDate: D2,
        endDate: D5,
        price: 8000,
      });
      t.check.eq(second.status, 'pending', '待审核单不参与宠物区间重叠：重叠再提交应成功');
      t.check.neq(second.id, reservation.id, '第二次提交应生成新预约');
    },
  },
];
