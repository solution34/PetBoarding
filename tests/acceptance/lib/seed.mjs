/**
 * 种子数据定位：登录预置账号，读取房型/房间/宠物，建立场景可复用的引用表。
 * 不硬编码自增 id，全部按 docs/API.md 第 2 节的名称定位。
 * 若后端种子与契约略有出入（例如 ownerB 的猫缺失），用对应账号补齐并在 trace 记录提醒，
 * 使验收场景仍然可执行；缺失本身会在 TC03/TC04 等场景的断言里、以及执行记录「环境说明」中体现。
 */
import { CheckFailure } from './assert.mjs';
import { ROOM_TYPE_FIXTURES, PET_FIXTURES, ACCOUNTS } from './fixtures.mjs';
import { Session } from './harness.mjs';

/** 登录四个预置账号，返回 { ownerA, ownerB, staff, admin, anon }。 */
export async function loginAllSessions(harness) {
  const sessions = { anon: new Session(harness, 'anon') };
  for (const account of ACCOUNTS) {
    const session = new Session(harness, account.key);
    const response = await session.login(account.loginName, account.password);
    if (response.status !== 200) {
      throw new CheckFailure(`预置账号 ${account.loginName} 登录失败（种子数据或认证接口异常）`, {
        expected: 'HTTP 200 + { account }',
        actual: `HTTP ${response.status} ${response.body?.error?.code ?? ''}`,
        response,
      });
    }
    if (!response.body?.account?.id) {
      throw new CheckFailure(`预置账号 ${account.loginName} 登录响应缺少 account.id`, { response });
    }
    session.account = response.body.account;
    sessions[account.key] = session;
  }
  return sessions;
}

function normalizeName(name) {
  return String(name ?? '').trim();
}

async function readAdminRooms(sessions) {
  const response = await sessions.admin.get('/api/admin/rooms');
  if (response.status !== 200) {
    throw new CheckFailure('GET /api/admin/rooms 失败，无法定位种子房型与房间', { expected: 200, actual: response.status, response });
  }
  const roomTypes = response.body?.roomTypes;
  if (!Array.isArray(roomTypes) || roomTypes.length === 0) {
    throw new CheckFailure('GET /api/admin/rooms 未返回 roomTypes 数组', { response });
  }
  return roomTypes;
}

/**
 * @returns {{
 *   roomTypes: Record<string, any>,
 *   roomTypeList: any[],
 *   rooms: Record<string, any>,
 *   roomList: any[],
 *   pets: Record<string, any>,
 *   accounts: Record<string, any>,
 *   notes: string[],
 * }}
 */
export async function loadSeedRefs(sessions, trace = []) {
  const notes = [];
  const rawRoomTypes = await readAdminRooms(sessions);
  const remaining = [...rawRoomTypes];
  const roomTypes = {};
  const roomTypeList = [];
  const rooms = {};
  const roomList = [];

  for (const fixture of ROOM_TYPE_FIXTURES) {
    let matched = remaining.find((candidate) => normalizeName(candidate.name) === fixture.name);
    if (!matched) {
      matched = remaining.find(
        (candidate) => candidate.species === fixture.species && candidate.dailyPriceFen === fixture.dailyPriceFen,
      );
      if (matched) notes.push(`房型「${fixture.name}」按名称未匹配到，按物种+日价回退匹配到「${matched.name}」`);
    }
    if (!matched) {
      throw new CheckFailure(`种子房型缺失：期望「${fixture.name}」（${fixture.species} / ${fixture.dailyPriceFen} 分）`, {
        actual: rawRoomTypes.map((candidate) => ({ name: candidate.name, species: candidate.species, dailyPriceFen: candidate.dailyPriceFen })),
      });
    }
    remaining.splice(remaining.indexOf(matched), 1);

    const roomListRaw = Array.isArray(matched.rooms) ? matched.rooms : [];
    const typeRef = {
      id: matched.id,
      name: matched.name,
      species: matched.species,
      dailyPriceFen: matched.dailyPriceFen,
      rooms: [],
    };
    for (const roomFixture of fixture.rooms) {
      let room = roomListRaw.find((candidate) => normalizeName(candidate.name) === roomFixture.name);
      if (!room) {
        room = roomListRaw.find((candidate) => candidate.maxWeight === roomFixture.maxWeight);
        if (room) notes.push(`房间「${roomFixture.name}」按名称未匹配到，按最大体重回退匹配到「${room.name}」`);
      }
      if (!room) {
        throw new CheckFailure(`种子房间缺失：期望「${roomFixture.name}」（最大体重 ${roomFixture.maxWeight}kg，房型 ${fixture.name}）`, {
          actual: roomListRaw.map((candidate) => ({ name: candidate.name, maxWeight: candidate.maxWeight })),
        });
      }
      const roomRef = { id: room.id, name: room.name, maxWeight: room.maxWeight, roomTypeId: matched.id, roomType: typeRef };
      typeRef.rooms.push(roomRef);
      rooms[roomFixture.name] = roomRef;
      roomList.push(roomRef);
    }
    roomTypes[fixture.key] = typeRef;
    roomTypeList.push(typeRef);
  }

  const pets = {};
  for (const fixture of PET_FIXTURES) {
    const session = sessions[fixture.owner];
    const listResponse = await session.get('/api/pets');
    if (listResponse.status !== 200) {
      throw new CheckFailure(`GET /api/pets 失败（${fixture.owner}）`, { expected: 200, actual: listResponse.status, response: listResponse });
    }
    const petsRaw = Array.isArray(listResponse.body?.pets) ? listResponse.body.pets : [];
    let pet = petsRaw.find((candidate) => normalizeName(candidate.name) === fixture.name);
    if (!pet) {
      pet = petsRaw.find((candidate) => candidate.species === fixture.species && candidate.weight === fixture.weight);
      if (pet) notes.push(`宠物「${fixture.name}」按名称未匹配到，按物种+体重回退匹配到「${pet.name}」`);
    }
    if (!pet) {
      const createResponse = await session.post('/api/pets', {
        name: fixture.name,
        species: fixture.species,
        weight: fixture.weight,
        contact: fixture.contact,
        careNotes: '',
        vaccineNotes: '',
      });
      if (createResponse.status !== 201) {
        throw new CheckFailure(`种子宠物「${fixture.name}」缺失且无法补建`, {
          expected: 201,
          actual: createResponse.status,
          response: createResponse,
        });
      }
      pet = createResponse.body?.pet;
      notes.push(`种子宠物「${fixture.name}」（${fixture.owner}）缺失，已由验收脚本补建 id=${pet?.id}`);
    }
    pets[fixture.key] = pet;
  }

  for (const note of notes) {
    trace.push({ kind: 'note', message: note });
  }

  return {
    roomTypes,
    roomTypeList,
    rooms,
    roomList,
    pets,
    accounts: {
      ownerA: sessions.ownerA.account,
      ownerB: sessions.ownerB.account,
      staff: sessions.staff.account,
      admin: sessions.admin.account,
    },
    notes,
  };
}
