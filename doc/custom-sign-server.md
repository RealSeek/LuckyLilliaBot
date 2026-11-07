# 自定义 Linux QQ 签名服务

直连模式支持自部署签名服务的基础 URL，首版仅支持 Linux QQ 协议。
可在 WebUI 登录页展开「签名服务设置」，或登录后在「其他配置 → 签名服务」中设置地址。
没有官方 Auth Token 时，录入弹窗也提供「使用自定义签名服务」入口。

点击「测试连接」由 Bot 服务器检查该地址的 `/health`，不修改配置。
点击「保存签名配置」写入进程共用的 `data/signing.json`，显示当前地址和待生效地址；重启 Bot 进程后生效，刷新网页不会生效。
签名后端和原生设备初始化绑定进程，保存不会在已有会话中途热切换。
这项单独保存，不需要点击其他配置页的总保存按钮。

未保存网页配置时，支持通过 `LLBOT_SIGN_URL` 指定默认值。
优先级为 `data/signing.json` > 环境变量 > 内置服务；网页保存空地址会明确切回内置服务，覆盖此前环境变量的值。
该文件独立于按账号配置，首次扫码前也可编辑；多个进程需要不同配置时应使用独立数据目录。
地址在启动时读取，可以带反向代理路径前缀，例如 `http://signer:18080/qq`。

```sh
PROTOCOL=linux LLBOT_SIGN_URL=http://127.0.0.1:18080 node dist/llbot.js
```

PowerShell：

```powershell
$env:PROTOCOL = 'linux'
$env:LLBOT_SIGN_URL = 'http://127.0.0.1:18080'
node dist/llbot.js
```

配置自定义服务后，不需要官方 manager 的 `AUTH_TOKEN` 或 `data/auth_token.txt`。
登录前以该服务的健康检查判断就绪，WebUI 不再要求录入官方 Auth Token。
服务不可用时保留错误原因并按现有登录流程重试；签名失败不会切回官方签名服务。
未配置地址时继续使用内置签名流程。

Bot 仍需内置 `.node` 提供本地设备初始化、Linux ESK / SA token 握手、报文和遥测功能。
缺少 `getLinuxSAToken` 的原生模块会报错，不会退回 manager 获取 token。
这不是完全移除原生模块的实现，也不保证第三方服务的签名能通过 QQ 校验。
签名端必须支持 Bot 使用的 QUA、设备信息及 QQ 版本；需要真实账号扫码登录验证。

## HTTP 接口

所有响应使用 JSON；请求超时为 5 秒。基础 URL 后追加以下路径。
URL 不接受用户名密码、查询参数或片段。当前接口没有内置服务访问密钥配置。
以下是本功能约定的接口；其他 SignServer 的路径和字段不一定相同，需要适配。

### `GET /health`

就绪时返回 HTTP 200 和 `{ "ok": true }`。健康检查不等同于真实登录验证。

### `POST /sign`

请求：

```json
{
  "cmd": "wtlogin.login",
  "bodyHex": "01020304",
  "seq": 10001,
  "guidHex": "00112233445566778899aabbccddeeff",
  "qua": "V1_LNX_NQ_3.2.28_48517_GW_B",
  "uin": 0,
  "protocolTokenHex": ""
}
```

`bodyHex` 是 SSO 包体；`guidHex` 为持久化的 16 字节设备 GUID。
`protocolTokenHex` 是 QQ 本地 ESK / SA 握手取得的协议 token 的 hex，登录前可以为空；不是 manager JWT。
`seq` 是 SSO 序号，`uin` 是数字 QQ 号，登录前可以为 0。

响应必须包含 `sign`、`token`、`extra` 三个 hex 字符串，`sign` 非空：

```json
{ "sign": "aabb", "token": "", "extra": "0102" }
```

上例只展示字段格式，不是有效 QQ 签名。错误返回非 2xx HTTP 状态码，Bot 会记录状态和响应正文。

### `POST /sign/batch`

登录突发报文需要此接口，不能只实现单次签名。
请求为 `{ "args": 上面的签名参数, "count": 950 }`，响应为长度等于 `count` 的结果数组。
每个结果格式与 `/sign` 相同，数组顺序对应发包顺序；签名服务负责为各项生成合适的时间和状态。

## 验证

```sh
npm run test:sign-http
npm run test:unit
npm run check
npm run build
```

HTTP 测试使用本地真实 HTTP 服务，不需要 QQ 账号或项目依赖。
其余命令需要已安装项目依赖；真实登录仍需测试账号扫码完成。

## 上游同步

本 fork 的 `main` 保留自定义 HTTP 签名入口。`Sync upstream` Action 每 6 小时运行一次，
也可以在 Actions 页面手动运行。它合并 `LLOneBot/LuckyLilliaBot` 的 `main`，运行 HTTP 接口测试后推送。
遇到合并冲突或测试失败时任务失败，不推送更新，需要手动处理；不会强制覆盖 fork 的修改。
GitHub 的定时任务可能延迟；公共仓库连续 60 天没有活动时，平台可能暂停定时任务，需要重新启用。

签名服务独立部署，本仓库只约定 HTTP 接口。自动同步不更新签名服务，也不能代替 QQ 协议兼容性和登录验证。
