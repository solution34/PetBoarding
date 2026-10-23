/**
 * 场景执行器：每个场景独立 SQLite 文件 + 独立后端实例；
 * 多阶段日期场景可用 t.phase('YYYY-MM-DD') 关闭后端并以同一数据库重新 createApp。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CheckFailure, Checks, summarizeResponse } from './assert.mjs';
import { BackendHarness } from './harness.mjs';
import { loadSeedRefs, loginAllSessions } from './seed.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** 测试数据库目录（仓库内 .tmp/acceptance，已被 .gitignore 忽略） */
export const ACCEPTANCE_TMP_DIR = path.resolve(REPO_ROOT, '.tmp', 'acceptance');
/** 结果产物目录（tests/acceptance/results） */
export const RESULTS_DIR = path.resolve(REPO_ROOT, 'tests', 'acceptance', 'results');
/** 后端编译产物路径 */
export const BACKEND_APP_PATH = path.resolve(REPO_ROOT, 'apps', 'server', 'dist', 'app.js');

export function ensureAcceptanceTmpDir() {
  fs.mkdirSync(ACCEPTANCE_TMP_DIR, { recursive: true });
}

export function removeDbFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.rmSync(`${dbPath}${suffix}`, { force: true, maxRetries: 3, retryDelay: 40 });
    } catch {
      // 清理失败不阻断验收；数据库文件位于 .tmp/ 下。
    }
  }
}

/**
 * 场景运行上下文：t.s（四个账号会话 + anon）、t.refs（种子引用）、
 * t.check（断言工具）、t.phase()/t.open() 控制日期阶段。
 */
export class ScenarioRunner {
  constructor({ dbPath, trace = [] }) {
    this.dbPath = dbPath;
    this.trace = trace;
    this.check = new Checks(() => this.trace);
    this.h = null;
    this.s = {};
    this.refs = null;
    this.today = null;
    this.bootCount = 0;
  }

  /** 启动（或重启）后端并登录四个预置账号。todayOverride 为 'YYYY-MM-DD'。 */
  async open(todayOverride) {
    await this.#closeHarness();
    const harness = new BackendHarness({ dbPath: this.dbPath, trace: this.trace });
    await harness.start(todayOverride);
    this.h = harness;
    this.today = todayOverride ?? null;
    this.bootCount += 1;
    this.trace.push({
      kind: 'phase',
      message: `后端启动（today=${todayOverride ?? '(真实门店日期)'}，db=${path.basename(this.dbPath)}）`,
    });
    this.s = await loginAllSessions(harness, this.s);
    if (!this.refs) this.refs = await loadSeedRefs(this.s, this.trace);
    return this;
  }

  /** 多阶段：切换可控日期（同一数据库重新 createApp）。 */
  async phase(todayOverride) {
    return this.open(todayOverride);
  }

  async #closeHarness() {
    if (!this.h) return;
    const harness = this.h;
    this.h = null;
    await harness.stop();
  }

  async dispose() {
    await this.#closeHarness();
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new CheckFailure(`${label}：场景执行超时（> ${timeoutMs} ms）`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function describeFailure(error) {
  if (error instanceof CheckFailure) {
    return {
      type: 'assertion',
      name: error.name,
      message: error.message,
      expected: error.expected ?? null,
      actual: error.actual ?? null,
      response: summarizeResponse(error.response),
    };
  }
  return {
    type: 'unexpected',
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function summarizeTraceEntry(entry) {
  if (entry.kind === 'phase' || entry.kind === 'note') {
    return { type: entry.kind, message: entry.message };
  }
  return {
    type: 'http',
    method: entry.method,
    path: entry.path,
    session: entry.session,
    requestBody: entry.requestBody,
    status: entry.status,
    responseBody: entry.responseBody,
  };
}

function trap(value, maxLength = 900) {
  const text = JSON.stringify(value);
  if (text === undefined) return '(undefined)';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function printFailure(scenario, failure, traceTail) {
  const lines = [];
  lines.push(`[FAIL] ${scenario.id} ${scenario.title}${scenario.requirement ? `（${scenario.requirement}）` : ''}`);
  lines.push(`  断言失败: ${failure.message}`);
  const response = failure.response;
  if (response?.request) {
    const body = response.request.body === null || response.request.body === undefined ? '' : ` body=${trap(response.request.body)}`;
    lines.push(`  请求: ${response.request.method} ${response.request.path}${body}`);
  }
  if (response) lines.push(`  实际响应: HTTP ${response.status} ${trap(response.body)}`);
  if (failure.expected !== undefined) lines.push(`  期望: ${trap(failure.expected)}`);
  if (failure.actual !== undefined) lines.push(`  实际: ${trap(failure.actual)}`);
  if (failure.stack) lines.push(`  异常栈: ${failure.stack.split('\n').slice(0, 5).join(' | ')}`);
  lines.push('  最近交互:');
  for (const entry of traceTail.slice(-25)) {
    if (entry.type === 'http') {
      lines.push(
        `    ${entry.session ?? 'anon'} ${entry.method} ${entry.path} -> ${entry.status} ${trap(entry.responseBody)}`,
      );
    } else {
      lines.push(`    --- ${entry.message}`);
    }
  }
  // 单独输出，避免与并行的 stdout 汇总混在一起。
  console.error(`\n${lines.join('\n')}\n`);
  return lines.join('\n');
}

/**
 * 执行一个场景。
 * @param {{ id: string, title: string, requirement?: string, run: (t: ScenarioRunner) => Promise<void> }} scenario
 */
export async function executeScenario(scenario, options = {}) {
  const { index = 0, timeoutMs = 180_000 } = options;
  ensureAcceptanceTmpDir();
  const dbPath = path.join(ACCEPTANCE_TMP_DIR, `${scenario.id}-${process.pid}-${index}.db`);
  removeDbFiles(dbPath);

  const trace = [];
  const startedAt = Date.now();
  const runner = new ScenarioRunner({ dbPath, trace });
  let result;

  try {
    await withTimeout(Promise.resolve().then(() => scenario.run(runner)), timeoutMs, scenario.id);
    const durationMs = Date.now() - startedAt;
    result = { id: scenario.id, title: scenario.title, requirement: scenario.requirement ?? null, status: 'PASS', durationMs };
    console.log(`[PASS] ${scenario.id} ${scenario.title} (${durationMs} ms)`);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const failure = describeFailure(error);
    const traceTail = [...trace.map(summarizeTraceEntry), summarizeTraceEntry({ kind: 'note', message: '--- 场景结束 ---' })];
    const printed = printFailure(scenario, failure, traceTail);
    result = {
      id: scenario.id,
      title: scenario.title,
      requirement: scenario.requirement ?? null,
      status: 'FAIL',
      durationMs,
      failure,
      traceTail: traceTail.slice(-40),
      printed,
    };
  } finally {
    try {
      await runner.dispose();
    } catch (error) {
      console.error(`[WARN] ${scenario.id} 清理后端失败：${error?.message ?? error}`);
    }
    removeDbFiles(dbPath);
  }

  return result;
}

function formatDuration(durationMs) {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

/** 写 JSON / Markdown 结果产物，供执行记录引用。 */
export function writeResultArtifacts({ results, meta }) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const passed = results.filter((item) => item.status === 'PASS').length;
  const failed = results.length - passed;
  const payload = {
    requirementVersion: 'V1.2',
    generatedAt: new Date().toISOString(),
    meta,
    total: results.length,
    passed,
    failed,
    results,
  };
  const jsonPath = path.join(RESULTS_DIR, 'last-run.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const lines = [
    '# V1.2 验收自动化执行结果（脚本自动生成）',
    '',
    `- 生成时间：${payload.generatedAt}`,
    `- 需求版本：V1.2`,
    `- 后端产物：${meta.backendAppPath}`,
    `- Node：${meta.nodeVersion}；平台：${meta.platform}`,
    `- 场景总数：${results.length}；通过：${passed}；失败：${failed}`,
    '',
    '| 编号 | 场景 | 需求 | 结果 | 耗时 | 失败原因 |',
    '|---|---|---|---|---|---|',
  ];
  for (const result of results) {
    const reason = result.status === 'FAIL' ? String(result.failure?.message ?? '').replace(/\|/g, '\\|') : '';
    lines.push(
      `| ${result.id} | ${result.title} | ${result.requirement ?? ''} | ${result.status} | ${formatDuration(result.durationMs)} | ${reason} |`,
    );
  }
  lines.push('');
  const markdownPath = path.join(RESULTS_DIR, 'last-run.md');
  fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`, 'utf8');

  return { jsonPath, markdownPath, passed, failed };
}

/** 控制台汇总表。 */
export function printSummary(results) {
  const idWidth = Math.max(...results.map((result) => result.id.length), 4);
  console.log('\n================ V1.2 验收场景执行汇总 ================');
  for (const result of results) {
    console.log(
      `${result.id.padEnd(idWidth)}  ${result.status === 'PASS' ? 'PASS' : 'FAIL'}  ${result.title}  (${formatDuration(result.durationMs)})`,
    );
  }
  const passed = results.filter((item) => item.status === 'PASS').length;
  const failed = results.length - passed;
  console.log('-------------------------------------------------------');
  console.log(`TOTAL=${results.length} PASSED=${passed} FAILED=${failed}`);
  return { total: results.length, passed, failed };
}
