/**
 * 后端进程内启动 + HTTP 客户端（fetch + 手动 Cookie Jar）。
 *
 * 约束：本沙箱禁止 Node 派生子进程管道，因此验收脚本不使用 node --test / vitest，
 * 而是直接 import 后端编译产物 apps/server/dist/app.js，调用
 *   createApp({ dbPath, todayOverride }) -> { app, close }
 * 并用 app.listen(0, '127.0.0.1') 在随机端口启动，全部请求走 fetch。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CheckFailure } from './assert.mjs';

/** 后端编译产物（相对本文件：tests/acceptance/lib -> 仓库根/apps/server/dist/app.js） */
export const DEFAULT_BACKEND_APP_PATH = new URL('../../../apps/server/dist/app.js', import.meta.url);

/** 可注入的 createApp 工厂；正式运行使用后端编译产物。 */
export async function loadBackendFactory(appPath = DEFAULT_BACKEND_APP_PATH) {
  const filePath = appPath instanceof URL ? appPath : pathToFileURL(path.resolve(appPath));
  if (!fs.existsSync(filePath)) {
    throw new CheckFailure(
      `后端编译产物不存在：${filePath}\n请先构建后端（npm run build:server），再运行验收脚本。`,
    );
  }
  const module = await import(filePath.href);
  const factory = module.createApp ?? module.default?.createApp ?? (typeof module.default === 'function' ? module.default : null);
  if (typeof factory !== 'function') {
    throw new CheckFailure(`后端编译产物未导出 createApp：${filePath}`);
  }
  return factory;
}

function readSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

/** 极简 Cookie Jar：只保存 name=value，覆盖 pb_session 的登录/退出。 */
export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  applySetCookie(setCookieHeaders) {
    for (const raw of setCookieHeaders ?? []) {
      const parts = String(raw).split(';');
      const pair = parts[0]?.trim();
      if (!pair) continue;
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const attributes = parts.slice(1).map((item) => item.trim());
      const expired =
        attributes.some((attribute) => /^max-age\s*=\s*0$/i.test(attribute) || /^max-age\s*=\s*-/i.test(attribute)) ||
        attributes.some((attribute) => /^expires\s*=\s*thu,?\s*01\s*jan\s*1970/i.test(attribute));
      if (!value || expired) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  serialize() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get(name) {
    return this.cookies.get(name);
  }

  has(name) {
    return this.cookies.has(name);
  }

  clear() {
    this.cookies.clear();
  }
}

/** 一个登录会话（一个浏览器 Cookie 容器）。 */
export class Session {
  constructor(harness, label = 'anon') {
    this.harness = harness;
    this.label = label;
    this.jar = new CookieJar();
    this.account = null;
    this.loginName = null;
  }

  /** 登录；返回原始响应，是否成功由调用方断言。 */
  async login(loginName, password) {
    const response = await this.harness.request(this, 'POST', '/api/auth/login', { loginName, password });
    if (response.status === 200 && response.body?.account) {
      this.account = response.body.account;
      this.loginName = loginName;
    }
    return response;
  }

  async logout() {
    const response = await this.harness.request(this, 'POST', '/api/auth/logout', undefined);
    this.jar.clear();
    this.account = null;
    return response;
  }

  get(pathname) {
    return this.harness.request(this, 'GET', pathname, undefined);
  }

  post(pathname, body) {
    return this.harness.request(this, 'POST', pathname, body);
  }

  put(pathname, body) {
    return this.harness.request(this, 'PUT', pathname, body);
  }

  delete(pathname) {
    return this.harness.request(this, 'DELETE', pathname, undefined);
  }
}

/**
 * 一个后端实例：加载 createApp、启动随机端口、提供 request。
 * 每个场景使用独立 dbPath；多阶段日期场景通过 stop() 关闭后以同一 dbPath 重新 start()。
 */
export class BackendHarness {
  constructor({ dbPath, trace = [], factory = null, appPath = DEFAULT_BACKEND_APP_PATH }) {
    this.dbPath = dbPath;
    this.trace = trace;
    this.factory = factory;
    this.appPath = appPath;
    this.app = null;
    this.server = null;
    this.closeBackend = null;
    this.baseUrl = null;
    this.todayOverride = null;
  }

  async start(todayOverride) {
    const factory = this.factory ?? (this.factory = await loadBackendFactory(this.appPath));
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    const createOptions = { dbPath: this.dbPath };
    if (todayOverride !== undefined && todayOverride !== null) createOptions.todayOverride = todayOverride;

    let created;
    try {
      created = await factory(createOptions);
    } catch (error) {
      throw new CheckFailure(
        `createApp 启动失败（dbPath=${this.dbPath}, todayOverride=${todayOverride ?? '(真实日期)'}）：${error?.message ?? error}\n${error?.stack ?? ''}`,
      );
    }
    if (!created || typeof created !== 'object' || !created.app) {
      throw new CheckFailure('createApp 未返回 { app, close } 结构（见 docs/API.md / 任务约定）。');
    }
    this.app = created.app;
    this.closeBackend = typeof created.close === 'function' ? created.close : null;

    this.server = await new Promise((resolve, reject) => {
      const server = this.app.listen(0, '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });
    const address = this.server.address();
    this.baseUrl = `http://127.0.0.1:${address.port}`;
    this.todayOverride = todayOverride ?? null;
    return this;
  }

  async stop() {
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          server.close(finish);
        } catch {
          finish();
        }
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        const timer = setTimeout(finish, 3000);
        if (typeof timer.unref === 'function') timer.unref();
      });
    }
    const closeBackend = this.closeBackend;
    this.closeBackend = null;
    this.app = null;
    this.baseUrl = null;
    if (closeBackend) {
      try {
        await closeBackend();
      } catch (error) {
        throw new CheckFailure(`后端 close() 失败：${error?.message ?? error}`);
      }
    }
  }

  /**
   * 发送请求并记录交互轨迹。
   * @param {Session | null} session 会话；null 表示不带 Cookie（未登录）
   */
  async request(session, method, pathname, body) {
    if (!this.baseUrl) throw new CheckFailure('后端尚未启动，无法发送请求。');
    const headers = { accept: 'application/json' };
    const cookie = session?.jar?.serialize();
    if (cookie) headers.cookie = cookie;

    /** @type {RequestInit} */
    const init = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let fetchResponse;
    try {
      fetchResponse = await fetch(this.baseUrl + pathname, init);
    } catch (error) {
      throw new CheckFailure(`请求失败 ${method} ${pathname}：${error?.message ?? error}`);
    }

    const setCookies = readSetCookieHeaders(fetchResponse.headers);
    if (session?.jar && setCookies.length > 0) session.jar.applySetCookie(setCookies);

    const text = await fetchResponse.text();
    let responseBody = null;
    if (text && text.trim() !== '') {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = { __unparsed: text };
      }
    }

    const envelope = {
      request: { method, path: pathname, body: body ?? null },
      status: fetchResponse.status,
      ok: fetchResponse.ok,
      headers: fetchResponse.headers,
      setCookies,
      body: responseBody,
      text,
    };
    this.trace.push({
      kind: 'http',
      method,
      path: pathname,
      session: session?.label ?? 'anon',
      requestBody: body ?? null,
      status: envelope.status,
      responseBody,
    });
    return envelope;
  }
}
