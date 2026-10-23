/**
 * 断言工具：所有场景断言统一抛出 CheckFailure，
 * 由 runner 捕获并把「请求 / 实际响应 / 预期 / 差异」打印出来。
 */
import { isDeepStrictEqual } from 'node:util';

export class CheckFailure extends Error {
  /**
   * @param {string} message 中文断言说明
   * @param {{ label?: string, expected?: unknown, actual?: unknown, response?: any }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'CheckFailure';
    this.label = options.label;
    this.expected = options.expected;
    this.actual = options.actual;
    this.response = options.response;
  }
}

export function serializeValue(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 只保留响应中对排错有用的部分。 */
export function summarizeResponse(response) {
  if (!response) return null;
  return {
    request: response.request ?? null,
    status: response.status ?? null,
    setCookies: response.setCookies ?? [],
    body: response.body ?? (response.text ? { text: response.text } : null),
  };
}

export class Checks {
  constructor(traceProvider = () => []) {
    this.getTrace = traceProvider;
  }

  get trace() {
    return this.getTrace();
  }

  fail(message, options = {}) {
    throw new CheckFailure(message, options);
  }

  /** HTTP 状态码断言；expected 可为数字或数字数组。 */
  status(response, expected, label) {
    const expectedList = Array.isArray(expected) ? expected : [expected];
    if (!expectedList.includes(response?.status)) {
      this.fail(`${label}：HTTP 状态码不符合预期`, {
        label,
        expected: `HTTP ${expectedList.join(' / ')}`,
        actual: `HTTP ${response?.status}`,
        response,
      });
    }
    return response;
  }

  /** 统一错误响应 error.code 断言；expected 可为字符串或数组。 */
  errorCode(response, expected, label) {
    const codes = Array.isArray(expected) ? expected : [expected];
    const actual = response?.body?.error?.code;
    if (!codes.includes(actual)) {
      this.fail(`${label}：错误码不符合预期`, {
        label,
        expected: codes.join(' / '),
        actual: actual ?? '(响应中没有 error.code)',
        response,
      });
    }
    return response;
  }

  /** 统一错误响应 error.details.field 断言。 */
  errorField(response, expectedField, label) {
    const actualField = response?.body?.error?.details?.field;
    if (actualField !== expectedField) {
      this.fail(`${label}：错误 details.field 不符合预期`, {
        label,
        expected: expectedField,
        actual: actualField ?? '(缺失)',
        response,
      });
    }
    return response;
  }

  /** 深度相等断言。 */
  eq(actual, expected, label, response) {
    if (!isDeepStrictEqual(actual, expected)) {
      this.fail(`${label}：值不符合预期`, { label, expected, actual, response });
    }
    return actual;
  }

  neq(actual, unexpected, label, response) {
    if (isDeepStrictEqual(actual, unexpected)) {
      this.fail(`${label}：值不应等于 ${serializeValue(unexpected)}`, {
        label,
        expected: `不等于 ${serializeValue(unexpected)}`,
        actual,
        response,
      });
    }
    return actual;
  }

  true(condition, message, options = {}) {
    if (!condition) this.fail(message, options);
    return condition;
  }

  false(condition, message, options = {}) {
    if (condition) this.fail(message, options);
    return condition;
  }

  notNull(value, label, response) {
    if (value === null || value === undefined) {
      this.fail(`${label}：不应为空`, { label, expected: '非空值', actual: value, response });
    }
    return value;
  }

  isNull(value, label, response) {
    if (value !== null) {
      this.fail(`${label}：应为 null`, { label, expected: null, actual: value, response });
    }
    return value;
  }

  /** 数组包含某元素（深度相等）。 */
  includes(array, item, label, response) {
    if (!Array.isArray(array)) {
      this.fail(`${label}：期望数组，实际不是数组`, { label, expected: '数组', actual: array, response });
    }
    if (!array.some((candidate) => isDeepStrictEqual(candidate, item))) {
      this.fail(`${label}：数组未包含预期元素`, { label, expected: item, actual: array, response });
    }
    return array;
  }

  notIncludes(array, item, label, response) {
    if (!Array.isArray(array)) {
      this.fail(`${label}：期望数组，实际不是数组`, { label, expected: '数组', actual: array, response });
    }
    if (array.some((candidate) => isDeepStrictEqual(candidate, item))) {
      this.fail(`${label}：数组不应包含该元素`, { label, expected: `不包含 ${serializeValue(item)}`, actual: array, response });
    }
    return array;
  }

  match(value, pattern, label, response) {
    if (typeof value !== 'string' || !pattern.test(value)) {
      this.fail(`${label}：字符串不符合预期格式`, {
        label,
        expected: pattern.toString(),
        actual: value,
        response,
      });
    }
    return value;
  }

  oneOf(value, allowed, label, response) {
    if (!allowed.includes(value)) {
      this.fail(`${label}：取值不在允许范围`, { label, expected: allowed, actual: value, response });
    }
    return value;
  }

  /** 金额断言：人民币整数分且非负。 */
  fen(value, label, response) {
    this.true(Number.isInteger(value), `${label}：金额必须为整数分`, {
      label,
      expected: '整数（分）',
      actual: value,
      response,
    });
    this.true(value >= 0, `${label}：金额不能为负数`, {
      label,
      expected: '>= 0',
      actual: value,
      response,
    });
    return value;
  }
}
