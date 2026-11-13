/**
 * 验收场景注册表。顺序与 Git f2be3e7 保存的 V1.2 验收场景编号一致，
 * 契约级场景（C-*）排在 TC 之后。
 */
import authPets from './010-auth-pets.mjs';
import reviewStay from './020-review-stay.mjs';
import billing from './030-billing.mjs';
import contract from './090-contract.mjs';

const scenarios = [...authPets, ...reviewStay, ...billing, ...contract];

export default scenarios;
