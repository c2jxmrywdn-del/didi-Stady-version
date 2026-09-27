# 滴滴学习版 · Didi Learning Version

> 一款仿制"滴滴出行"的微信小程序，**仅供学习交流使用，不会进行任何商业化**。

[![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini_Program-1AAD19?logo=wechat&logoColor=white)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![WeChat Cloud Base](https://img.shields.io/badge/CloudBase-微信云开发-FF7B00)](https://cloud.weixin.qq.com/cloudbase)
[![Library](https://img.shields.io/badge/Base_Library-3.16.1-blue)]()
[![Architecture](https://img.shields.io/badge/Architecture-MultiPlatform-purple)]()

---

## 📑 目录

- [项目声明](#-项目声明)
- [项目简介](#-项目简介)
- [技术栈](#-技术栈)
- [项目结构](#-项目结构)
- [核心功能](#-核心功能)
- [页面总览](#-页面总览)
- [云函数拆分](#-云函数拆分)
- [核心模块设计](#-核心模块设计)
- [数据存储与状态管理](#-数据存储与状态管理)
- [设计系统](#-设计系统)
- [运行与开发](#-运行与开发)
- [版本演进记录](#-版本演进记录)
- [参考文档](#-参考文档)

---

## 🚨 项目声明

> **该项目不会进行任何的商业化，仅供学习使用！！！**

本项目仅作为大学课程作业 / 编程学习用途，所有 UI 借鉴了"滴滴出行"的产品设计，但**未使用任何滴滴官方代码、商标、Logo 用于商业目的**。如需商用请自行取得授权并重新设计。

| 用途 | 是否允许 |
|---|---|
| 个人学习、毕设、课程作业 | ✅ |
| 代码片段借鉴、算法参考 | ✅ |
| 商业化运营、对外收费 | ❌ |
| 冒充"滴滴出行"官方 | ❌ |
| 抓取真实用户隐私数据 | ❌ |

---

## 🎯 项目简介

本项目从腾讯云官方提供的 [云开发 quickstart](https://github.com/TencentCloudBase/tcb-demo-weapp) 模板起步，逐步迭代为一款功能完整的网约车出行类小程序。整个迭代过程围绕"**真实数据闭环**"和"**跨页面状态同步**"两条主线展开：

- **业务闭环**：叫车 → 等待派单 → 行程中 → 支付 → 评价 → 行程记录
- **资产闭环**：钱包余额、信用额度、积分的扣减 / 充值 / 奖励
- **状态闭环**：订单、消息、用户资料在 30+ 个页面间实时同步

### 核心亮点

1. **统一数据源（Single Source of Truth）** — `orderStore` + `userStats` 双 store 架构，杜绝数据不互通
2. **冷启动 + 并发去重 + 失败重试 + 永久错误短路** — 自研 `cloud.js` 云函数调用层
3. **MUI / TDesign 双设计语言** — 全局跨页统一转场动画 + 卡片 elevation 体系
4. **30+ 业务页面** — 覆盖出行、订单、消息、钱包、安全、社区等核心场景
5. **零外部 npm 依赖** — 原生小程序架构，体积小、可读性强

---

## 🛠 技术栈

### 客户端

| 模块 | 选型 |
|---|---|
| 框架 | 微信小程序原生（ES6 + CommonJS） |
| 基础库 | `libVersion: 3.16.1` |
| 样式 | WXSS（CSS 变量 + rpx 适配） |
| 状态管理 | 自研 store + observer 模式（无 MobX / Redux） |
| 路由 | 原生 `wx.navigateTo` / `wx.switchTab` + 自定义 tabBar |
| 地图 | 百度地图 MCP（开发期） + 腾讯地图 SDK（运行期） |
| 支付 | `wxPay.js`（云函数 wxpayFunctions） |

### 后端

| 模块 | 选型 |
|---|---|
| 云开发 | 微信云开发（CloudBase） |
| 云函数 | 拆分 6 个：baiduMap / orderFunctions / userFunctions / matchFunctions / wxpayFunctions / quickstartFunctions |
| 数据库 | NoSQL（云开发 JSON 文档库）+ 本地缓存兜底 |
| 鉴权 | `wx.cloud` 私有协议免登录鉴权 |

### 工具链

| 模块 | 选型 |
|---|---|
| 编译器 | SWC（`swc: true`） |
| 代码压缩 | `uglifyFileName` + `minifyWXSS` + `minifyWXML` |
| 源码映射 | `uploadWithSourceMap`（sourcemap.zip） |
| 项目结构 | `projectArchitecture: "multiPlatform"`（支持多端编译） |
| MCP | 百度地图 MCP Server（开发期调试） |

---

## 📂 项目结构

```
didi-learning-version/
├── miniprogram/                # 小程序主包（编译入口）
│   ├── app.{js,json,wxss}      # 应用入口 + 全局样式
│   ├── sitemap.json
│   ├── envList.js
│   ├── custom-tab-bar/         # 自定义底部导航栏（4 个 tab）
│   │   └── index.{js,json,wxml,wxss}
│   ├── components/             # 业务组件
│   ├── images/                 # 静态资源
│   ├── pages/                  # 30+ 业务页面
│   │   ├── index/              # 首页（叫车）
│   │   ├── waiting/            # 等待派单
│   │   ├── riding/             # 行程中
│   │   ├── order-detail/       # 订单详情
│   │   ├── select-location/    # 起 / 终点选择
│   │   ├── trip/               # 我的行程
│   │   ├── message/            # 消息中心
│   │   ├── chat/               # 单聊窗口
│   │   ├── chat-list/          # 客服聊天列表
│   │   ├── message-detail/     # 消息详情
│   │   ├── profile/            # 我的（个人中心）
│   │   ├── login/              # 微信授权登录
│   │   ├── edit-profile/       # 编辑资料
│   │   ├── setting/            # 设置
│   │   ├── account-protection/ # 账号保护
│   │   ├── change-password/    # 修改密码
│   │   ├── security/           # 安全中心
│   │   ├── my-coupons/         # 我的优惠券
│   │   ├── fav-addresses/      # 收藏地址
│   │   ├── emergency-contact/  # 紧急联系人
│   │   ├── payment/            # 钱包 / 支付管理
│   │   ├── customer-service/   # 客服中心
│   │   ├── feedback/           # 意见反馈
│   │   ├── about/              # 关于我们
│   │   ├── team/               # 开发团队
│   │   ├── agreement/          # 用户协议
│   │   ├── privacy/            # 隐私政策
│   │   └── copyright/          # 版权声明
│   └── utils/                  # 核心工具模块
│       ├── cloud.js            # 云函数统一调用层
│       ├── orderStore.js       # 订单 store（单一真相）
│       ├── userStats.js        # 用户统计 + 钱包资产 store
│       ├── messageStore.js     # 消息 store
│       ├── chatStore.js        # 聊天记录 store
│       ├── orderMerge.js       # 订单合并去重工具
│       ├── txMap.js            # 腾讯地图 SDK 封装
│       └── wxPay.js            # 微信支付封装
│
├── cloudfunctions/             # 云函数源码（按业务拆分）
│   ├── quickstartFunctions/    # 模板默认
│   ├── baiduMap/               # 百度地图代理
│   ├── orderFunctions/         # 订单 CRUD
│   ├── userFunctions/          # 用户信息 / openId
│   ├── matchFunctions/         # 司机匹配
│   └── wxpayFunctions/         # 微信支付回调
│
├── index/                      # Web 端 Vite 入口（多端架构）
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│
├── miniapp/                    # 其他端构建产物（App / 抖音小程序等）
│
├── i18n/                       # 国际化文案
│   └── base.json
│
├── project.config.json         # 小程序项目配置
├── project.miniapp.json        # 多端扩展配置
├── project.private.config.json # 个人偏好配置
├── code_obfuscation_config.json # 代码混淆配置
├── uploadCloudFunction.sh      # 云函数批量上传脚本
├── .mcp.json                   # MCP Server 配置（百度地图）
└── README.md                   # 本文档
```

---

## 🚀 核心功能

### 出行主流程

```
首页(叫车) ─┬─→ 选择起点 ─→ 选择终点 ─→ 车型选择 ─→ 等待派单 ─┐
            │                                                    ↓
            └─→ 编辑常用地址 ─────────────────────────────────→ 行程中
                                                                 ↓
                                                          行程结束 / 支付
                                                                 ↓
                                                          行程记录 + 评价
```

### 1. 叫车首页（`pages/index`）

- 当前位置实时定位
- 起 / 终点输入与历史记录
- 车型选择（快车 / 舒适型 / 商务车 / 拼车）
- 价格预估（距离 × 时长 × 车型系数）
- 优惠券智能匹配

### 2. 行程状态机

| 页面 | 状态 | 主要交互 |
|---|---|---|
| `waiting` | 等待派单 | 倒计时、取消订单、查看附近司机 |
| `riding` | 行程中 | 实时地图、司机信息、紧急联系人、行程分享 |
| `order-detail` | 行程结束 | 支付、评价、开发票、再次叫车 |

### 3. 钱包与资产（`pages/payment`）

- 余额充值与扣减
- 信用额度（垫付）使用与偿还
- 积分消费与奖励
- 完整流水（与订单 store 联动）

### 4. 消息中心（`pages/message` / `chat`）

- 系统通知、行程通知、优惠通知分桶
- 单聊窗口（本地存储 + 云函数持久化）
- 未读红点（自定义 tabBar 角标，三档宽度）

### 5. 个人中心（`pages/profile`）

- 会员等级体系（V1 ~ V6 铜银金银铂钻黑金）
- 资产 / 订单 / 工具 / 菜单四大区块
- 8 个二级入口：支付 / 优惠券 / 收藏 / 紧急联系人 / 账号保护 / 改密 / 安全 / 设置 / 客服 / 反馈 / 关于

### 6. 账号安全（TDesign 风格）

- **修改密码**：原密码 → 新密码 → 确认密码，强度实时评估（弱 / 中 / 强）
- **账号保护**：7 项开关 + 登录设备管理 + 紧急冻结 + 注销账号
  - 指纹 / 面容解锁
  - 启动 PIN 码
  - 支付前生物认证
  - 隐藏真实手机号
  - 列表中隐藏头像
  - 新设备登录通知
  - 支付结果通知
  - 后台自动锁定时长（1/5/15/30/60 分钟）
- **安全评分**：0~100 动态分（颜色：红 / 橙 / 绿），可视化圆环

### 7. 设置（`pages/setting`）

- 资料卡片（点击进编辑）
- 账号安全（修改密码 / 账号保护）
- 通知开关（行程 / 优惠 / 系统）
- 隐私开关（位置 / 行程分享）
- 通用（单位 / 语言）
- 缓存清理（保留关键 key）
- 关于 / 退出登录

### 8. 微信授权登录（`pages/login`）

- 两步授权：先 `wx.getUserProfile` 拿头像昵称 → 再 `getPhoneNumber` 拿手机号
- 支持模拟器 fallback（无手机号时显示 `none`）
- 完整用户结构：openid / nickName / avatarUrl / gender / country / province / city / language / phone / age / loginType / loginTime

### 9. 开发团队（`pages/about` → `pages/team`）

- 团队 Banner + 3 个数据统计 + 成员介绍
- 6 个里程碑时间轴
- 联系方式（推特 / Facebook / GitHub / Gitee / 微信 / QQ / QQ 邮箱）
- 一键复制所有联系方式
- 统一 MUI 风格 + page-enter 转场

---

## 📱 页面总览

| 页面 | 路径 | 关键文件 | 说明 |
|---|---|---|---|
| 首页 | `pages/index` | 3 端 4 文件 | 叫车入口 |
| 等待派单 | `pages/waiting` | 4 文件 | 司机匹配中 |
| 行程中 | `pages/riding` | 4 文件 | 实时地图 + 司机联系 |
| 订单详情 | `pages/order-detail` | 4 文件 | 支付 / 评价 / 发票 |
| 选择位置 | `pages/select-location` | 4 文件 | 地图选点 |
| 我的行程 | `pages/trip` | 4 文件 | 全部 / 待支付 / 进行中 / 已完成 |
| 消息中心 | `pages/message` | 4 文件 | 三桶消息 + 角标 |
| 单聊 | `pages/chat` | 4 文件 | 客服对话窗口 |
| 聊天列表 | `pages/chat-list` | 4 文件 | 历史会话 |
| 消息详情 | `pages/message-detail` | 4 文件 | 通知详情 |
| 个人中心 | `pages/profile` | 4 文件 | 完整会员中心 |
| 登录 | `pages/login` | 4 文件 | 微信授权 |
| 编辑资料 | `pages/edit-profile` | 4 文件 | 修改昵称 / 头像 / 手机号 |
| 设置 | `pages/setting` | 4 文件 | 通知 / 隐私 / 通用 / 缓存 |
| 账号保护 | `pages/account-protection` | 4 文件 | TDesign 风格安全中心 |
| 修改密码 | `pages/change-password` | 4 文件 | TDesign 风格密码修改 |
| 安全中心 | `pages/security` | 4 文件 | 旧版安全设置 |
| 我的优惠券 | `pages/my-coupons` | 4 文件 | 优惠券列表 |
| 收藏地址 | `pages/fav-addresses` | 4 文件 | 家 / 公司 / 常用 |
| 紧急联系人 | `pages/emergency-contact` | 4 文件 | 行程分享对象 |
| 支付管理 | `pages/payment` | 4 文件 | 钱包 / 信用 / 积分 |
| 客服中心 | `pages/customer-service` | 4 文件 | 客服入口 |
| 意见反馈 | `pages/feedback` | 4 文件 | 用户反馈表单 |
| 关于我们 | `pages/about` | 4 文件 | 项目 + 团队入口 |
| 开发团队 | `pages/team` | 4 文件 | 团队完整介绍 |
| 用户协议 | `pages/agreement` | 4 文件 | 法律协议 |
| 隐私政策 | `pages/privacy` | 4 文件 | 隐私协议 |
| 版权声明 | `pages/copyright` | 4 文件 | 版权页 |

**总计：28 个业务页面 + 1 个自定义 tabBar + 若干组件。**

---

## ⚙️ 云函数拆分

为提升冷启动性能与并发承载，云函数按业务域拆分：

| 云函数 | 路由 | 职责 |
|---|---|---|
| `quickstartFunctions` | 默认 | 模板默认（数据库示例） |
| `baiduMap` | 独立 | 百度地图 API 代理 |
| `orderFunctions` | 订单域 | createOrder / getOrders / getOrderDetail / cancelOrder / completeOrder / payOrder / rateDriver / calcPrice / getMiniProgramCode |
| `userFunctions` | 用户域 | getOpenId / updateUser / getUserInfo / createCollection |
| `matchFunctions` | 匹配域 | matchDriver / getNearbyDrivers |
| `wxpayFunctions` | 支付域 | 微信支付回调 / 退款 |

### 调用层架构

```
┌────────────┐     ┌─────────────┐     ┌──────────────┐
│ Page       │ ──→ │ utils/cloud │ ──→ │ Cloud Function│
│            │     │ callCloud() │     │ (拆分路由)    │
└────────────┘     └─────────────┘     └──────────────┘
                        │
                        ├─ TTL 缓存（getOrders 5s 等）
                        ├─ In-Flight 去重（同 key 合并）
                        ├─ 失败重试 1 次（仅瞬态错误）
                        └─ 永久错误短路（-501000 等）
```

---

## 🏗 核心模块设计

### 1. 订单 store（`utils/orderStore.js`）

**目标**：让 `trip` / `profile` / `order-detail` 看到**完全一致**的订单数据。

```js
// 关键设计：本地 + 云端合并去重，本地优先
// 本地有最新 status / actualPrice，云端有其它端创建的订单
const merged = cloudOrders.map((o) => localMap.get(o._id) || o);
```

**防死循环**：通过 `userStats.__internal*` 暴露"内部写入"函数，`orderStore` 调它写本地但不触发反向通知。

### 2. 用户统计 store（`utils/userStats.js`）

**目标**：钱包余额 / 信用 / 积分 / 行程记录**真实累加**，防御所有异常。

```js
// 任何字段非法都自动回退到默认值，绝不抛错影响业务
function loadStatsFromStorage() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    MEM_STATS = !raw
      ? { ...DEFAULT_STATS }
      : (typeof raw === "string" ? JSON.parse(raw) : { ...DEFAULT_STATS, ...raw });
  } catch (e) {
    MEM_STATS = { ...DEFAULT_STATS };
  }
  return MEM_STATS;
}
```

**TDZ 修复**：`const _userStatsListeners` 必须在 `function notifyOrderChanged` 之前声明。

### 3. 消息 store（`utils/messageStore.js`）

- 三桶消息：系统 / 行程 / 优惠
- 未读数实时计算 + `app.refreshUnread()` 触发 tabBar 角标更新
- **setTimeout try/finally 包裹** — 修复 `Error: timeout at Timeout._onTimeout`

### 4. 云函数调用层（`utils/cloud.js`）

四重优化：
1. **拆分路由** — 6 个云函数独立扩缩容
2. **In-Flight 去重** — 短时间内相同请求合并
3. **TTL 内存缓存** — 减轻行程页 onShow 高频请求
4. **失败重试** — 仅瞬态错误重试，永久错误（`FUNCTION_NOT_FOUND`）立即失败

---

## 💾 数据存储与状态管理

### 本地存储键约定

| Key | 内容 | 写入模块 |
|---|---|---|
| `userInfo` | 用户信息 | `login` |
| `userStats_v1` | 钱包 / 信用 / 积分 / 行程统计 | `userStats` |
| `orderHistory_v1` | 本地订单历史 | `userStats` |
| `userPasswordHash` | 密码哈希（演示） | `change-password` |
| `accountProtectionSettings` | 账号保护开关 | `account-protection` |
| `accountLoginHistory` | 登录设备记录 | `account-protection` |
| `accountPinCode` | 启动 PIN 码 | `account-protection` |
| `appSettings` | 通知 / 隐私 / 单位 / 语言 | `setting` |
| `messages_v1` | 消息数据 | `messageStore` |
| `messageIdCounter` | 消息自增 ID | `messageStore` |

### 全局数据（`app.globalData`）

```js
{
  env: "",                  // 云开发环境 ID
  userInfo: null,           // 当前用户
  location: null,           // 当前位置
  currentOrder: null,       // 进行中的订单
  unreadCount: 0,           // 未读消息数
  openid: null,             // 异步预热
  pendingTripTab: "",       // 桥接 switchTab 参数
  onMessageChange: fn,      // 消息变更回调
}
```

---

## 🎨 设计系统

### 色板

| 名称 | 色值 | 用途 |
|---|---|---|
| 主橙 | `#FF7B00` | CTA 按钮 / 评分环 / 选中态 |
| 暖白 | `#FFFDF9` | 卡片背景 |
| 米白 | `#FAF8F5` | 页面背景 |
| 棕黑 | `#2D2A26` | 主文字 / 主按钮 |
| 米灰 | `#8A8278` | 次要文字 |
| 浅米灰 | `#C5B9A8` | 辅助 / 占位 |
| 边框 | `#EDE8E0` | 卡片描边 |
| 危险 | `#e74c3c` | 退出 / 注销 / 红点 |
| 成功 | `#5CAA5C` | 已开启 / 已完成 |

### 间距

8 / 12 / 16 / 24 / 32 rpx（4 的倍数）

### 圆角

4 / 8 / 12 / 16 / 24 rpx

### 阴影（MUI Material Elevation）

```css
.md-elev-1 { box-shadow: 0 1rpx 3rpx rgba(0, 0, 0, 0.04); }
.md-elev-2 { box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06); }
.md-elev-3 { box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08); }
.md-elev-4 { box-shadow: 0 6rpx 24rpx rgba(0, 0, 0, 0.10); }
```

### 跨页统一转场

```css
.page-enter {
  animation: pageEnter 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes pageEnter {
  from { opacity: 0; transform: translateX(40rpx); }
  to   { opacity: 1; transform: translateX(0); }
}
```

### TDesign 风格

`account-protection` / `change-password` / `login` 三个页面采用 TDesign 设计语言：

- 圆角 16rpx 卡片 + 0 2rpx 8rpx rgba(0,0,0,0.04) 阴影
- 24rpx 容器图标（8 种颜色：蓝 / 紫 / 橙 / 绿 / 青 / 红 / 黄 / 灰）
- 主色 `#FF7B00` 渐变（`#FF7B00 → #FF5500`）
- 成功动画：480ms cubic-bezier 缩放反馈

---

## 🛠 运行与开发

### 1. 环境要求

- 微信开发者工具 ≥ 3.16.1
- Node.js ≥ 16（仅 Web 端 `index/` 需要）
- 微信小程序基础库 ≥ 2.2.3（云能力）
- 微信云开发环境

### 2. 克隆与配置

```bash
git clone <your-fork-url>
cd didi-learning-version

# 1. 打开微信开发者工具
# 2. 导入本项目目录
# 3. AppID: wxf1775bf7bad5917d (项目自带)
# 4. 在云开发控制台创建环境，复制 EnvId
```

### 3. 配置云开发环境

编辑 `miniprogram/envList.js`：

```js
module.exports = {
  envList: [
    {
      env: "your-env-id",        // ← 替换为你的云开发 EnvId
      alias: "default"
    }
  ]
};
```

### 4. 部署云函数

```bash
# 方式一：使用项目脚本
bash uploadCloudFunction.sh

# 方式二：手动逐个上传
# 在微信开发者工具 → 云开发 → 云函数 → 右键 → 上传并部署
```

> ⚠️ **重要**：云函数未部署时，客户端会自动降级使用本地数据（`utils/orderStore.js` 的 `isPermanentError` 短路 + 5s 内存缓存兜底）。

### 5. 编译运行

在微信开发者工具中点击「编译」即可。首次运行会自动拉起微信授权登录。

### 6. Web 端开发（可选）

```bash
cd index
npm install
npm run dev   # 启动 Vite 开发服务器
```

---

## 📜 版本演进记录

> 本节按时间倒序记录主要功能迭代。

### v1.0 · 基础架构

- 28 个业务页面完整搭建
- 6 个云函数拆分（order / user / match / baiduMap / wxpay / quickstart）
- 自研 `cloud.js` 调用层（缓存 / 去重 / 重试）
- 自研 `orderStore` / `userStats` / `messageStore` 三大 store
- 跨页统一转场动画（MUI `pageEnter` 240ms cubic-bezier）
- TDesign 风格安全中心 + 登录页

### v0.x · 历史迭代

- **修复 `Error: timeout at Timeout._onTimeout`** — `messageStore.emitChange` 加 try/finally 包裹
- **修复 TDZ `ReferenceError: _userStatsListeners`** — const 声明上移
- **修复 WXML `Cannot read property '0' of null`** — avatarLetter 预计算到 data
- **修复 WXML `unexpected token [`** — 不支持 `[0]` 索引，改用 observers 派生
- **修复 `orderStore` 反复打云** — `isPermanentError` 短路 + 仅 `force=true` 时打云
- **修复"已完成"图标** — `.order-icon-refund` → `.order-icon-completed`
- **开发团队单页拆分** — `pages/team` 完整展示 7 个社交联系方式
- **修改密码 / 账号保护** — TDesign 风格完整功能（强度评估 / PIN 弹窗 / 设备管理）
- **登录授权升级** — 头像昵称 + 手机号 + 性别 + 年龄全量获取
- **关于页画风统一** — MUI 风格 + 移除重复返回箭头
- **tabBar 角标优化** — `hidden` 替代 `wx:if` + 三档宽度

---

## 📚 参考文档

### 官方文档

- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [云开发 HTTP API](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-http-api/)
- [微信支付接入](https://pay.weixin.qq.com/wiki/doc/api/index.html)

### 设计参考

- [TDesign · 腾讯企业级设计系统](https://tdesign.tencent.com/)
- [Material Design Elevation](https://m3.material.io/styles/elevation/overview)

### 学习资源

- [微信小程序官方 demo](https://github.com/wechat-miniprogram/miniprogram-demo)
- [awesome-wechat-weapp](https://github.com/justjavac/awesome-wechat-weapp)

---

## 📄 License

本项目仅供学习使用，不附带任何 License 授权。如需复用代码请保留原作者信息并注明来源。

```
Copyright © 2026 didi-learning-version Authors.
All Rights Reserved.
```
