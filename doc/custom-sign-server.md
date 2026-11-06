# 自定义 Linux QQ 签名服务

直连模式支持通过 `LLBOT_SIGN_URL` 指定自部署服务的基础 URL，首版仅支持 Linux QQ 协议。
地址在启动时读取，修改后重启 Bot。可以带路径前缀，例如 `http://signer:18080/qq`。

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

本次本地已通过两项真实 HTTP 接口测试，并验证内置 Windows x64 原生模块可用内部标记完成不带 uin 的初始化。
尚未运行完整构建、Vitest 路由测试或真实账号登录；不能据此认定 QQ 已接受自定义签名。
