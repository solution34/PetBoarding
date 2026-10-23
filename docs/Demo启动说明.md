# V1.2 Demo 启动说明

本指南用于 Windows PowerShell 下启动本地网页 Demo。全部命令均在仓库根目录执行，也就是包含 `package.json` 的目录。首次安装依赖需要联网；构建完成后的日常演示不需要外部服务。

## 环境准备

- Node.js 22.12及以上，推荐24.x；当前项目已在24.16.0运行。
- npm，随Node.js安装；首次下载仓库可使用Git，也可解压源码。
- 浏览器，无需单独安装MySQL或SQLite服务。

后端内置 `node:sqlite` 要求Node.js至少22.5；项目当前Vite依赖要求22.12及以上，因此完整项目以22.12为下限。

检查环境：

```powershell
node -v
npm -v
```

当前电脑进入项目目录：

```powershell
Set-Location 'C:\Users\chenyue\Documents\ChatGPT\petboarding'
```

其他成员请将路径替换为自己的克隆目录。首次获取当前Demo代码：

```powershell
git clone --branch FCL https://github.com/solution34/PetBoarding.git
Set-Location PetBoarding
```

已有仓库且准备更新时，先确认本地修改已妥善保存，再切换 `FCL` 并拉取最新代码。

## 首次启动

依次执行，上一条成功后再执行下一条：

```powershell
npm ci
npm run build
npm start
```

`npm ci` 按提交的锁文件安装依赖；日常新增或调整依赖才使用 `npm install` 更新锁文件。构建会生成后端 `apps/server/dist` 和前端 `apps/web/dist`。

看到服务启动提示后，打开 [http://localhost:3000](http://localhost:3000)。此模式前后端使用同一个地址，不必另外启动Vite。终端需要保持运行，按 `Ctrl+C` 停止服务。

接口自检地址为 [http://localhost:3000/api/health](http://localhost:3000/api/health)，返回JSON即可确认后端可访问；网页与业务交互需继续通过浏览器检查。

## 再次启动与更新

代码和依赖未变化时，进入根目录后直接执行：

```powershell
npm start
```

拉取新代码后重新执行 `npm ci`、`npm run build`、`npm start`。修改源代码后也要重新构建，才能在演示模式看到新页面和接口。

## 演示账号

登录页支持一键填入。以下为课程Demo账号，不是外部服务账号。

| 角色 | 登录名 | 密码 |
|---|---|---|
| 宠物主人A | ownerA | owner123 |
| 宠物主人B | ownerB | owner123 |
| 工作人员 | staff | staff123 |
| 管理员 | admin | admin123 |

建议按主人提交预约、工作人员分房与入住、登记照护、离店结算的顺序演示。使用同一个浏览器时先退出再切换角色；需要同时使用多个账号时使用不同浏览器配置或无痕窗口。详细步骤见[演示操作指南](演示操作指南.md)。

## 开发模式

安装依赖后打开两个终端，都进入仓库根目录。

终端一启动后端：

```powershell
npm run dev:server
```

终端二启动前端：

```powershell
npm run dev:web
```

访问Vite终端实际显示的地址，默认是 [http://localhost:5173](http://localhost:5173)。前端将 `/api` 代理到 `http://localhost:3000`，两个服务都需要运行。若改后端端口，需同步调整 `apps/web/vite.config.ts` 的代理地址。开发模式会在修改代码后自动更新。

## 数据与重置

默认数据库为 `data/petboarding.db`，首次启动自动建表并写入账号、宠物和房间等种子数据。正常重启保留现有业务数据。

需要重新演示初始流程时，先用 `Ctrl+C` 停止所有使用该数据库的后端进程，备份需要保留的数据文件，再运行：

```powershell
npm run db:reset
npm start
```

重置会删除当前数据库中的预约、照护、收款及其他本地修改，恢复演示种子数据。此命令只在需要清空数据时使用，不属于日常启动步骤。

## 可选环境变量

以下设置仅影响当前PowerShell窗口及从中启动的服务。

更换演示端口：

```powershell
$env:PORT = '3001'
npm start
```

此时访问 `http://localhost:3001`。开发模式的Vite代理也需要对应修改。

覆盖演示日期，用于展示延迟入住与逾期结算；每次修改后需停止并重新启动服务：

```powershell
$env:PB_TODAY = '2026-11-01'
npm start
```

默认日期按门店时区 `Asia/Shanghai` 计算。日期覆盖会影响业务判断与记录时间，健康接口可检查生效状态；完整跨日示例见操作指南。

恢复真实日期和默认端口，先停止服务后执行：

```powershell
Remove-Item Env:PB_TODAY -ErrorAction SilentlyContinue
Remove-Item Env:PORT -ErrorAction SilentlyContinue
npm start
```

## 常见启动问题

| 现象 | 处理方法 |
|---|---|
| 找不到node或npm | 安装Node.js后重新打开终端，检查 `node -v` 和 `npm -v` |
| PowerShell禁止运行npm.ps1 | 使用 `npm.cmd ci`、`npm.cmd run build`、`npm.cmd start`，无需更改系统执行策略 |
| 提示node:sqlite不存在或Vite不支持当前Node版本 | 切换到Node.js 22.12及以上，推荐24.x，再安装依赖与构建 |
| 提示缺少package.json | 回到仓库根目录执行命令 |
| npm ci下载失败 | 检查网络或代理配置，修复后重试，不手动删除锁文件 |
| 端口3000被占用 | 确认已有Demo是否正在运行；或使用上面的PORT设置换端口 |
| 前端尚未构建、找不到dist或修改未生效 | 停止服务，执行 `npm run build` 后重新启动 |
| 网页打开但开发模式登录失败 | 确认后端已启动、Vite代理端口一致，并从Vite地址访问网页 |
| 登录会话失效 | 重新登录；会话有效期为8小时 |
| 界面日期不符合预期 | 检查 `/api/health`，清除PB_TODAY后重启 |

## 验收命令

需要验证接口时执行：

```powershell
npm run build:server
npm run test:acceptance
```

验收使用独立临时数据库，不重置正常演示数据库。它验证API行为，不替代浏览器与手机页面走查；结果说明见[验收执行记录](验收执行记录.md)。
