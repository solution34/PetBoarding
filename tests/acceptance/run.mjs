/**
 * V1.2 验收场景自动化入口（纯 Node ESM，禁止 Node 派生子进程管道）。
 *
 * 运行：node tests/acceptance/run.mjs
 * 可选：
 *   node tests/acceptance/run.mjs TC01 TC02       只运行指定场景（支持编号前缀）
 *   node tests/acceptance/run.mjs --filter=TC1    等价写法
 *   node tests/acceptance/run.mjs --selfcheck     用内置 mock 后端自检 harness（不依赖后端编译产物）
 *
 * 实现方式：进程内 import apps/server/dist/app.js 的 createApp({ dbPath, todayOverride })，
 * app.listen(0,'127.0.0.1') 随机端口 + fetch + 手动 Cookie；
 * 每个场景使用 .tmp/acceptance 下独立 SQLite 文件与独立后端实例，多阶段日期对同一 DB 重新 createApp。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

import scenarios from './scenarios/index.mjs';
import {
  ACCEPTANCE_TMP_DIR,
  BACKEND_APP_PATH,
  executeScenario,
  ensureAcceptanceTmpDir,
  printSummary,
  writeResultArtifacts,
} from './lib/runner.mjs';
import { BackendHarness, Session } from './lib/harness.mjs';
import { shanghaiToday } from './lib/dates.mjs';

const rawArgs = process.argv.slice(2);
const selfCheck = rawArgs.includes('--selfcheck');
const filter = [];
for (const arg of rawArgs) {
  if (arg.startsWith('--filter=')) {
    filter.push(...arg.slice('--filter='.length).split(',').map((item) => item.trim()).filter(Boolean));
  } else if (!arg.startsWith('--')) {
    filter.push(arg.trim());
  }
}

function selectScenarios() {
  if (filter.length === 0) return scenarios;
  return scenarios.filter((scenario) =>
    filter.some((keyword) => scenario.id === keyword || scenario.id.startsWith(keyword) || scenario.title.includes(keyword)),
  );
}

async function main() {
  if (selfCheck) {
    process.exitCode = await runSelfCheck();
    return;
  }

  if (!fs.existsSync(BACKEND_APP_PATH)) {
    console.error(`[FATAL] 后端编译产物不存在：${BACKEND_APP_PATH}`);
    console.error('请先构建后端（npm run build:server），再运行 node tests/acceptance/run.mjs');
    process.exitCode = 1;
    return;
  }

  const selected = selectScenarios();
  if (selected.length === 0) {
    console.error(`[FATAL] 没有匹配的场景：${filter.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  ensureAcceptanceTmpDir();
  const startedAt = new Date();
  console.log('================ V1.2 验收场景自动化（API 级） ================');
  console.log(`场景数: ${selected.length} / 注册总数: ${scenarios.length}`);
  console.log(`后端产物: ${BACKEND_APP_PATH}`);
  console.log(`Node: ${process.version}  平台: ${process.platform} ${process.arch}`);
  console.log(`测试数据库目录: ${ACCEPTANCE_TMP_DIR}`);
  console.log('执行方式: 自动化 API 测试（进程内 createApp + fetch，非浏览器 UI 测试）');
  console.log('=============================================================\n');

  const results = [];
  for (let index = 0; index < selected.length; index += 1) {
    results.push(await executeScenario(selected[index], { index }));
  }

  const summary = printSummary(results);
  const meta = {
    requirementVersion: 'V1.2',
    backendAppPath: BACKEND_APP_PATH,
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    shanghaiToday: shanghaiToday(),
    todayOverrideBase: '2026-11-01',
    executionMode: '自动化 API 测试（进程内 createApp + fetch，非浏览器 UI 测试）',
    dbDirectory: ACCEPTANCE_TMP_DIR,
    scenarioSelection: filter.length > 0 ? filter : null,
  };
  const artifacts = writeResultArtifacts({ results, meta });
  console.log(`\n结果产物: ${artifacts.jsonPath}`);
  console.log(`结果摘要: ${artifacts.markdownPath}`);

  if (summary.failed > 0) {
    console.error(`\n[FAILED] 共 ${summary.failed} 个场景失败，退出码 1。`);
    process.exitCode = 1;
  } else {
    console.log(`\n[OK] 共 ${summary.passed} 个场景全部通过，退出码 0。`);
    process.exitCode = 0;
  }
}

function parseCookieHeader(header) {
  const result = {};
  for (const pair of String(header ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0) result[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return result;
}

/**
 * 自检模式：用一个极简 mock 后端验证 harness 的启动/关闭、Cookie 传递与 todayOverride，
 * 不依赖 apps/server/dist。正式验收不使用 mock。
 */
async function runSelfCheck() {
  console.log('[SELFCHECK] 使用内置 mock 后端校验 harness / Cookie Jar / 生命周期 …');
  const factory = async ({ todayOverride }) => {
    const businessToday = todayOverride ?? shanghaiToday();
    const accounts = {
      ownerA: { id: 1, loginName: 'ownerA', displayName: '王小明（主人A）', roles: ['owner'] },
    };
    const sessions = new Map();
    const app = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = rawBody ? JSON.parse(rawBody) : undefined;
      } catch {
        body = undefined;
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      const cookies = parseCookieHeader(request.headers.cookie);
      const send = (status, payload, extraHeaders = {}) => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders });
        response.end(payload === undefined ? '' : JSON.stringify(payload));
      };
      const unauth = () => send(401, { error: { code: 'UNAUTHENTICATED', message: '未登录或会话已过期' } });

      if (url.pathname === '/api/health') {
        return send(200, { today: businessToday, clockOverridden: Boolean(todayOverride) });
      }
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const account = accounts[body?.loginName];
        if (!account || body?.password !== 'owner123') {
          return send(401, { error: { code: 'LOGIN_FAILED', message: '账号或密码错误' } });
        }
        const token = `sid-${Math.random().toString(36).slice(2)}`;
        sessions.set(token, account);
        return send(
          200,
          { account },
          { 'set-cookie': `pb_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800` },
        );
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        if (!cookies.pb_session || !sessions.has(cookies.pb_session)) return unauth();
        sessions.delete(cookies.pb_session);
        return send(204, undefined, { 'set-cookie': 'pb_session=; HttpOnly; Path=/; Max-Age=0' });
      }
      if (url.pathname === '/api/auth/me') {
        const account = sessions.get(cookies.pb_session);
        return account ? send(200, { account }) : unauth();
      }
      if (url.pathname === '/api/pets') {
        return sessions.get(cookies.pb_session) ? send(200, { pets: [] }) : unauth();
      }
      return send(404, { error: { code: 'NOT_FOUND', message: 'not found' } });
    });
    return { app, close: async () => {} };
  };

  const trace = [];
  const dbPath = path.join(ACCEPTANCE_TMP_DIR, `selfcheck-${process.pid}.db`);
  ensureAcceptanceTmpDir();
  const failures = [];
  const expect = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const harness = new BackendHarness({ dbPath, trace, factory });
  try {
    await harness.start('2026-11-01');
    const session = new Session(harness, 'selfcheck');
    const login = await session.login('ownerA', 'owner123');
    expect(login.status === 200, '登录应返回 200');
    expect(login.body?.account?.loginName === 'ownerA', '登录响应应含 account.loginName');
    expect(/pb_session=/i.test(login.setCookies.join('; ')), '登录应下发 pb_session');
    expect(/HttpOnly/i.test(login.setCookies.join('; ')), 'Cookie 应带 HttpOnly');
    expect(Boolean(session.jar.get('pb_session')), 'Cookie Jar 应保存 pb_session');

    const me = await session.get('/api/auth/me');
    expect(me.status === 200 && me.body?.account?.loginName === 'ownerA', '带 Cookie 访问 /auth/me 应成功');

    const health = await session.get('/api/health');
    expect(health.body?.today === '2026-11-01', 'health.today 应为注入日期');
    expect(health.body?.clockOverridden === true, 'health.clockOverridden 应为 true');

    const logout = await session.post('/api/auth/logout');
    expect(logout.status === 204, '退出应返回 204');
    expect(!session.jar.get('pb_session'), '退出后 Cookie 应清除');
    const meAfter = await session.get('/api/auth/me');
    expect(meAfter.status === 401, '退出后 /auth/me 应 401');

    await harness.stop();
    await harness.start('2026-11-05');
    const health2 = await harness.request(null, 'GET', '/api/health');
    expect(health2.body?.today === '2026-11-05', '重新启动后 health.today 应跟随新 todayOverride');
    expect(health2.body?.clockOverridden === true, '重新启动后 clockOverridden 应为 true');
    await harness.stop();
  } catch (error) {
    failures.push(`自检异常：${error?.stack ?? error}`);
  } finally {
    try {
      await harness.stop();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(dbPath, { force: true });
    } catch {
      // ignore
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`[SELFCHECK FAIL] ${failure}`);
    console.error('\n[SELFCHECK FAILED] harness 自检未通过。');
    return 1;
  }
  console.log(`[SELFCHECK PASS] harness/Cookie/生命周期校验通过（trace 记录 ${trace.length} 条）。`);
  return 0;
}

try {
  await main();
} catch (error) {
  console.error('[FATAL] 验收脚本未捕获异常：');
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
