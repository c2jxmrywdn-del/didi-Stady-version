# 部署指南 · DEPLOY.md

> 滴滴学习版的云函数部署流程,使用现代化的 **`@wxcloud/cli`** 工具。

## 🚀 快速开始(3 步)

### 1. 安装 + 登录

```bash
# 安装 CLI
npm install -g @wxcloud/cli

# 扫码登录
wxcloud login
```

### 2. 配置环境 ID

编辑 `miniprogram/envList.js`:

```js
const envList = [
  {
    env: "your-cloud-env-id-here",   // ← 替换为你的云开发 EnvId
    alias: "default"
  }
];
module.exports = { envList, isMac: false };
```

### 3. 一键部署

```bash
# 方式 1: 简单的 npm 命令
npm run deploy

# 方式 2: 友好的 bash 脚本(带确认 + 进度)
bash wxcloud-deploy.sh

# 方式 3: 跳过确认
bash wxcloud-deploy.sh --force

# 方式 4: 旧版兼容
bash uploadCloudFunction.sh
```

## 📦 三种部署方式对比

| 方式 | 命令 | 适合场景 | 输出 |
|---|---|---|---|
| **npm 一键** | `npm run deploy` | 日常开发,自动化 | 原始 CLI 输出 |
| **bash 脚本** | `bash wxcloud-deploy.sh` | 手动部署,需要确认 | 彩色进度 + 错误处理 |
| **旧版** | `bash uploadCloudFunction.sh` | 兼容老用户 | 简单统计 |

## 🔧 常用命令

```bash
# 部署所有云函数
npm run deploy:all

# 单个函数
npm run deploy:baidu
npm run deploy:order
npm run deploy:user
npm run deploy:match
npm run deploy:wxpay

# 查看函数列表
npm run function:list

# 查看运行日志
npm run function:log

# 查看函数详情
npm run function:detail

# 环境管理
npm run env:list
npm run env:login
npm run env:logout

# 存储管理
npm run storage:list
```

## 📦 6 个云函数清单

| 云函数 | 职责 | 必填环境变量 |
|---|---|---|
| `baiduMap` | 百度地图 API 代理(逆地理编码/路线/POI) | `BAIDU_MAP_AK` |
| `orderFunctions` | 订单 CRUD(createOrder/getOrders/cancelOrder/...) | 无 |
| `userFunctions` | 用户信息(getOpenId/updateUser/getUserInfo) | 无 |
| `matchFunctions` | 司机匹配(matchDriver/getNearbyDrivers) | 无 |
| `wxpayFunctions` | 微信支付(统一下单/退款/回调) | `WXPAY_MCH_ID` / `WXPAY_MCH_KEY` / `WXPAY_NOTIFY_URL` |
| `quickstartFunctions` | 兼容层(路由到上述 5 个) | 无 |

## 📦 6 个云函数清单

| 云函数 | 职责 | 必填环境变量 |
|---|---|---|
| `baiduMap` | 百度地图 API 代理(逆地理编码/路线/POI) | `BAIDU_MAP_AK` |
| `orderFunctions` | 订单 CRUD(createOrder/getOrders/cancelOrder/...) | 无 |
| `userFunctions` | 用户信息(getOpenId/updateUser/getUserInfo) | 无 |
| `matchFunctions` | 司机匹配(matchDriver/getNearbyDrivers) | 无 |
| `wxpayFunctions` | 微信支付(统一下单/退款/回调) | `WXPAY_MCH_ID` / `WXPAY_MCH_KEY` / `WXPAY_NOTIFY_URL` |
| `quickstartFunctions` | 兼容层(路由到上述 5 个) | 无 |

## 🔐 配置云函数环境变量

**两种方式**(推荐前者):

### 方式 A:微信云开发控制台(推荐)

1. 访问 [https://console.cloud.tencent.com/tcb](https://console.cloud.tencent.com/tcb)
2. 选择环境 → 云函数 → 选中函数 → 配置 → 环境变量
3. 添加:
   ```
   BAIDU_MAP_AK     = your_baidu_map_server_ak
   WXPAY_MCH_ID     = your_merchant_id
   WXPAY_MCH_KEY    = your_32_char_api_v2_key
   WXPAY_NOTIFY_URL = https://your-domain.com/pay/notify
   ```

### 方式 B:wxcloud CLI 设置

```bash
# 暂不支持直接通过 CLI 设置,需到控制台操作
# 但可通过 wxcloud functions detail 查看函数配置
wxcloud functions detail -n wxpayFunctions
```

## 🛠 故障排查

### Q1: `FunctionName parameter could not be found`
云函数未部署,或部署失败。
```bash
npm run function:list     # 检查所有云函数
npm run deploy:all         # 重新部署
```

### Q2: `FunctionName parameter could not be found` 但已部署
云函数名称拼写错误。检查 `miniprogram/utils/cloud.js` 的 `ROUTE` 映射:
```js
const ROUTE = {
  createOrder: "orderFunctions",  // ← 函数名必须与 cloudfunctions/ 目录下的一致
  getOrders: "orderFunctions",
  // ...
};
```

### Q3: `永久错误(-501000) FUNCTION_NOT_FOUND`
云函数根本未部署。`cloud.js` 已对永久错误短路,不会重试。本地缓存会自动兜底。

### Q4: wxcloud 命令不存在
未安装 CLI:
```bash
npm install -g @wxcloud/cli
```

### Q5: 部署超时
单个云函数代码不能超过 50MB。检查 `node_modules/` 是否被打入:
```bash
# 每个 cloudfunctions/*/ 目录下的 package.json 应指定 "dependencies"
# 但 wxcloud CLI 默认会忽略 node_modules
```

## 🔄 升级从旧版 `tcb` CLI

如果你之前用的是 `tcb` CLI(`uploadCloudFunction.sh` 旧版),迁移步骤:

```bash
# 1. 卸载旧版
npm uninstall -g tcb

# 2. 安装新版
npm install -g @wxcloud/cli

# 3. 重新登录
wxcloud login

# 4. 测试部署
npm run deploy:baidu
```

## 📋 完整命令清单

| npm script | 作用 |
|---|---|
| `npm run deploy:all` | 部署所有 6 个云函数 |
| `npm run deploy:baidu` | 只部署 baiduMap |
| `npm run deploy:order` | 只部署 orderFunctions |
| `npm run deploy:user` | 只部署 userFunctions |
| `npm run deploy:match` | 只部署 matchFunctions |
| `npm run deploy:wxpay` | 只部署 wxpayFunctions |
| `npm run deploy:quickstart` | 只部署 quickstartFunctions |
| `npm run function:list` | 列出所有云函数 |
| `npm run function:log` | 查看运行日志 |
| `npm run env:list` | 列出云开发环境 |
| `npm run env:login` | 登录 |
| `npm run env:logout` | 登出 |
| `npm run storage:list` | 列出云存储文件 |
| `npm run doc:tdesign` | 打开 TDesign 组件文档 |
| `npm run doc:security` | 打开安全规范文档 |
