# 🔒 安全规范 · SECURITY.md

> **该项目不会进行任何的商业化，仅供学习使用。所有密钥与第三方服务凭据均不得硬编码到源代码。**

## ⚠️ 已修复的安全问题(本轮)

| 类别 | 位置 | 状态 | 说明 |
|---|---|---|---|
| 微信支付商户密钥 | `cloudfunctions/wxpayFunctions/index.js` | ✅ 已修复 | 移除硬编码 `'PUB_KEY_ID_011...'` 字符串,改为 `process.env.WXPAY_MCH_KEY` 强校验 |
| 微信支付商户号 | `cloudfunctions/wxpayFunctions/index.js` | ✅ 已修复 | 移除硬编码 `'1746178875'`,改为 `process.env.WXPAY_MCH_ID` |
| 微信支付回调 URL | `cloudfunctions/wxpayFunctions/index.js` | ✅ 已修复 | 移除 `https://pay.weixin.qq.com/...` 占位符,改为 `process.env.WXPAY_NOTIFY_URL` |
| 百度地图 AK | `cloudfunctions/baiduMap/index.js` | ✅ 已修复 | 移除硬编码 `'gw0Pjd...NLpBX'`,改为 `process.env.BAIDU_MAP_AK` |
| 百度地图 MCP Key | `.mcp.json` | ✅ 已修复 | 改为 `${BAIDU_MAP_API_KEY}` 占位符 |
| 腾讯地图 API Key(Android) | `project.miniapp.json` | ✅ 已修复 | 改为 `${TENCENT_MAP_API_KEY_ANDROID}` |
| 腾讯地图 API Key(iOS) | `project.miniapp.json` | ✅ 已修复 | 改为 `${TENCENT_MAP_API_KEY_IOS}` |
| WeChat AppSecret | (无) | ✅ 从未发现 | 项目中没有任何 AppSecret 明文 |

## 🧯 依赖漏洞处置记录(Dependabot)

GitHub Dependabot 曾在本仓库默认分支报告 6 个依赖漏洞(4 high + 2 moderate)。处置如下:

### 已修复 ✅

`index/`(Vite 脚手架,构建期 dev 依赖,不进入小程序运行时)——`npm audit fix` 非破坏性升级:

| 包 | 旧 → 新 | 关联告警 |
|---|---|---|
| vite | 8.0.13 → 8.3.1 | `server.fs.deny` Windows 旁路、launch-editor NTLM 泄露 |
| postcss | 8.5.14 → 8.5.28 | 源码映射 `sourceMappingURL` 路径遍历 |
| nanoid | 3.3.12 → 3.3.19 | 非安全生成器可死循环 |

根 `@wxcloud/cli` 依赖链:审计 0 漏洞。

### 暂不处理·接受风险 ⚠️

6 个云函数(`orderFunctions` / `userFunctions` / `matchFunctions` / `wxpayFunctions` / `baiduMap` / `quickstartFunctions`)均依赖 `wx-server-sdk@~2.4.0`,其传递链含:

- `request` → `form-data`(**critical**:不安全随机边界、CRLF 注入)
- `jsonwebtoken`(**high**:签名校验绕过、可伪造令牌)
- 以及 `tough-cookie` / `xml2js` / `uuid`

**决定:维持现状,不升级。** 理由:本项目为教学演示、不联网商用、云函数不对公网直接暴露(仅小程序经 `wx.cloud.callFunction` 调用),上述漏洞的实际可达攻击面很低。彻底修复需把 `wx-server-sdk` 升到 `^4.0.2`(该版本移除了 `request` 依赖链),属**破坏性大版本升级**,需重新部署并在云环境逐个接口回归,暂不在本轮处理。

**Dependabot 忽略操作:** GitHub → Security → Dependabot alerts → 选中对应告警 → "Dismiss" → 理由选 "Not used in code paths I'm responsible for" / "Triggered by dev-only dependency",逐条标记,避免长期挂红。

### 将来升级路径 📌

若要根治:把各云函数 `package.json` 的 `"wx-server-sdk": "~2.4.0"` 改为 `"^4.0.2"` → 重新 `npm install` 生成 lock → **在微信开发者工具中重新部署全部云函数并冒烟测试**(下单/查询/支付回调/匹配/用户/地图各接口)。2.x→4.x 存在 API/行为差异,升级后务必回归,不要仅依赖 `npm audit fix --force`。

---

## 🛡️ 配置流程

### 1. 微信云开发控制台(推荐)

访问 [微信云开发控制台](https://console.cloud.tencent.com/tcb) → 你的环境 → 云函数 → 选择函数 → 配置 → 环境变量:

```
WXPAY_MCH_ID     = 1900000109
WXPAY_MCH_KEY    = 0123456789abcdef0123456789abcdef
WXPAY_NOTIFY_URL = https://your-domain.com/pay/notify
BAIDU_MAP_AK     = your_baidu_map_server_ak
```

### 2. `.env` 文件(本地开发)

```bash
# 1. 复制模板
cp .env.example .env

# 2. 编辑 .env 填入真实值
# 3. .gitignore 已忽略 .env
```

### 3. IDE 终端注入

```bash
# macOS / Linux
export $(cat .env | xargs)

# Windows PowerShell
Get-Content .env | ForEach-Object { Invoke-Expression "`n$_" }
```

### 4. 微信云托管 / CI

在云托管控制台配置环境变量,或在 GitHub Actions 中:

```yaml
env:
  WXPAY_MCH_KEY: ${{ secrets.WXPAY_MCH_KEY }}
  BAIDU_MAP_AK: ${{ secrets.BAIDU_MAP_AK }}
```

## 🔍 安全审计清单

部署前请逐项确认:

- [ ] 微信云函数环境变量已配置 `WXPAY_MCH_ID` / `WXPAY_MCH_KEY` / `WXPAY_NOTIFY_URL`
- [ ] 微信云函数环境变量已配置 `BAIDU_MAP_AK`(百度地图服务端类型)
- [ ] `.env` 文件已创建且未提交到 Git
- [ ] `.gitignore` 包含 `.env` / `.env.local` / `project.local.config.json`
- [ ] 历史 commit 中没有泄露过密钥(用 `git log -p | grep -i "key\|secret"` 检查)
- [ ] 如果历史 commit 中有泄露,**必须** 撤销并重新生成所有密钥
- [ ] 生产部署前**必须** 关闭 devtools 的"允许跨域请求"等调试选项
- [ ] `.mcp.json` 改为环境变量引用(本地通过 `~/.mcp_env` 或 IDE 注入)

## 📜 安全原则

1. **零硬编码**:任何密钥、令牌、密码都不应出现在源代码中
2. **最小权限**:云函数只申请必需的权限,数据库只暴露需要的集合
3. **环境隔离**:开发/测试/生产用不同的密钥和 AppID
4. **定期轮换**:生产密钥每 3-6 个月轮换一次
5. **审计日志**:启用云函数的日志查询,定期检查异常调用
6. **HTTPS only**:所有回调 URL 必须是 https,禁止 http

## 🛠 工具支持

- **git-secrets**:防止密钥被提交
  ```bash
  brew install git-secrets
  cd your-repo
  git secrets --install
  git secrets --register-aws  # 或自定义
  ```

- **truffleHog**:扫描历史 commit 中的密钥
  ```bash
  pip install truffleHog
  truffleHog --regex --entropy=False /path/to/repo
  ```

- **gitleaks**:类似工具,更快
  ```bash
  brew install gitleaks
  gitleaks detect --source ./
  ```

## 📞 问题反馈

发现安全问题请联系:项目维护者(本项目为学习项目,无商业支持)
