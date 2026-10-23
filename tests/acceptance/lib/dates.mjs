/**
 * 业务日期工具。所有业务日期按门店时区 Asia/Shanghai 解释（见 docs/API.md 第 1 节）。
 * 验收场景通过 createApp({ todayOverride }) 注入可控的“今天”，
 * 演示日期统一取 2026-11-01 起的连续日期，与需求基线计费示例一致。
 */

/** 验收场景的统一起始“今天” */
export const DAY0 = '2026-11-01';
export const D1 = '2026-11-01';
export const D2 = '2026-11-02';
export const D3 = '2026-11-03';
export const D4 = '2026-11-04';
export const D5 = '2026-11-05';
export const D6 = '2026-11-06';
export const D7 = '2026-11-07';
export const D8 = '2026-11-08';
export const D9 = '2026-11-09';
export const D10 = '2026-11-10';

/** 方案中的标准日价（分） */
export const STANDARD_CAT_PRICE = 8000;
export const STANDARD_DOG_PRICE = 10000;
export const STANDARD_CAT_PLAN_DAYS = 3;

/** 'YYYY-MM-DD' -> 自然日差（end - start） */
export function diffDays(startDate, endDate) {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
}

/** 'YYYY-MM-DD' 加减天数，返回 'YYYY-MM-DD' */
export function addDays(dateString, days) {
  const date = new Date(Date.parse(`${dateString}T00:00:00Z`) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** 当前真实门店日期（Asia/Shanghai，'YYYY-MM-DD'） */
export function shanghaiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 当前时间 ISO 字符串（用于执行记录） */
export function nowIso() {
  return new Date().toISOString();
}
