/**
 * docs/API.md 第 2 节「预置账号与种子数据」的期望值。
 * 场景中用名字/物种/体重定位种子数据，不硬编码数据库自增 id。
 */

/** 预设账号（密码仅用于演示登录） */
export const ACCOUNTS = [
  { key: 'ownerA', loginName: 'ownerA', password: 'owner123', role: 'owner', displayName: '王小明（主人A）' },
  { key: 'ownerB', loginName: 'ownerB', password: 'owner123', role: 'owner', displayName: '李小红（主人B）' },
  { key: 'staff', loginName: 'staff', password: 'staff123', role: 'staff', displayName: '张店长（工作人员）' },
  { key: 'admin', loginName: 'admin', password: 'admin123', role: 'admin', displayName: '赵管理（管理员）' },
];

/** 四类房型（名称、物种、日价分、每类两个演示房间/最大体重） */
export const ROOM_TYPE_FIXTURES = [
  {
    key: 'catStd',
    name: '猫舍标间',
    species: 'cat',
    dailyPriceFen: 8000,
    rooms: [
      { name: 'C101', maxWeight: 6 },
      { name: 'C102', maxWeight: 6 },
    ],
  },
  {
    key: 'catLux',
    name: '猫舍豪华间',
    species: 'cat',
    dailyPriceFen: 12000,
    rooms: [
      { name: 'C201', maxWeight: 8 },
      { name: 'C202', maxWeight: 8 },
    ],
  },
  {
    key: 'dogStd',
    name: '犬舍标间',
    species: 'dog',
    dailyPriceFen: 10000,
    rooms: [
      { name: 'D101', maxWeight: 25 },
      { name: 'D102', maxWeight: 25 },
    ],
  },
  {
    key: 'dogLux',
    name: '犬舍豪华间',
    species: 'dog',
    dailyPriceFen: 15000,
    rooms: [
      { name: 'D201', maxWeight: 40 },
      { name: 'D202', maxWeight: 40 },
    ],
  },
];

/** 期望存在的种子宠物（缺失时验收脚本会用对应主人账号补建，保证场景可执行） */
export const PET_FIXTURES = [
  { key: 'aCat', owner: 'ownerA', name: '咪咪', species: 'cat', weight: 4.2, contact: '13800000001' },
  { key: 'aDog', owner: 'ownerA', name: '旺财', species: 'dog', weight: 18, contact: '13800000002' },
  { key: 'bDog', owner: 'ownerB', name: '球球', species: 'dog', weight: 30, contact: '13800000003' },
  { key: 'bCat', owner: 'ownerB', name: '糖糖', species: 'cat', weight: 3.8, contact: '13800000004' },
];
