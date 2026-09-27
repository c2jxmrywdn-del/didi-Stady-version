// utils/messageStore.js — 统一消息存储/分发
// 设计目标：暖白极简、解耦、可在多个业务场景自动投递消息
// 性能优化:
//  1) 内存缓存 messages 数组,避免每次 getAll 都 wx.getStorageSync 全量 IO
//  2) setAll 写盘 + 通知做防抖(60ms),高频 push 不再触发多次渲染
//  3) 维护增量未读计数(在内存里),替代每次 getUnreadCount 全表 filter
//  4) 存储层仍为同步 wx.setStorageSync(数据规模 < 1KB/条时无 IO 瓶颈)

const STORAGE_KEY = "messages_v1";
const SETTINGS_KEY = "appSettings";
const COUNTER_KEY = "messageIdCounter";

// ============ 内存层 ============
let MEM_MESSAGES = null;       // 缓存:全量消息数组
let MEM_UNREAD = 0;            // 增量维护:未读总数(由 push/markRead/clear 等维护)
let MEM_UNREAD_DIRTY = false;  // 标记:在防抖窗口内合并通知
let NOTIFY_TIMER = null;       // 防抖定时器
const NOTIFY_DELAY = 60;       // 防抖窗口

function loadFromStorage() {
  if (MEM_MESSAGES !== null) return MEM_MESSAGES;
  try {
    const raw = wx.getStorageSync(STORAGE_KEY) || [];
    // 防御:过滤掉损坏的 null/undefined 条目
    MEM_MESSAGES = Array.isArray(raw) ? raw.filter((m) => m && typeof m === 'object') : [];
  } catch (e) {
    MEM_MESSAGES = [];
  }
  // 重建未读计数(每条 m 都已过滤 null,这里只访问 m.read 是安全的)
  MEM_UNREAD = MEM_MESSAGES.reduce((acc, m) => acc + (m.read ? 0 : 1), 0);
  return MEM_MESSAGES;
}

// 通知 tabBar / 消息页(防抖)
// 修复:外层包 try/catch,防止任何回调抛错卡住定时器
function emitChange() {
  MEM_UNREAD_DIRTY = true;
  if (NOTIFY_TIMER) return;
  NOTIFY_TIMER = setTimeout(() => {
    try {
      NOTIFY_TIMER = null;
      if (!MEM_UNREAD_DIRTY) return;
      MEM_UNREAD_DIRTY = false;
      // 1) 通知页面
      try {
        const pages = getCurrentPages();
        for (const p of pages) {
          if (p && typeof p.onMessagesUpdated === "function") {
            p.onMessagesUpdated();
            break; // 同类页面只通知一次
          }
        }
      } catch (e) { /* 单个页面回调失败不影响其他 */ }
      // 2) 通知 app 级
      try {
        const app = getApp();
        if (app && typeof app.globalData.onMessageChange === "function") {
          app.globalData.onMessageChange(loadFromStorage());
        }
      } catch (e) { /* noop */ }
    } finally {
      // 修复:无论上面是否抛错,都重置 NOTIFY_TIMER,保证下一次 emit 能正常触发
      NOTIFY_TIMER = null;
    }
  }, NOTIFY_DELAY);
}

// 消息类型（与 UI 颜色/图标对应）
const TYPE = {
  SYSTEM: "system",      // 系统通知
  ORDER: "order",        // 行程/订单
  PROMO: "promo",        // 优惠活动
  SAFETY: "safety",      // 安全提醒
  DRIVER: "driver",      // 司机消息
  SERVICE: "service",    // 客服消息
};

// 控制某一类消息是否启用（默认全开）
function getNotifySettings() {
  const settings = wx.getStorageSync(SETTINGS_KEY) || {};
  return {
    trip: settings.notify?.trip !== false,
    promotion: settings.notify?.promotion !== false,
    system: settings.notify?.system !== false,
  };
}

// 读取全部消息（按时间倒序）
function getAll() {
  return loadFromStorage();
}

// 写入并发出事件
function setAll(list) {
  // 防御:list 为 null/undefined 时不崩,降级为空数组
  if (!Array.isArray(list)) list = [];
  MEM_MESSAGES = list;
  MEM_UNREAD = list.reduce((acc, m) => acc + (m && m.read ? 0 : 1), 0);
  // 同步写盘(同步 API 性能足够,且保留在用户主动清缓存前的数据)
  try { wx.setStorageSync(STORAGE_KEY, list); } catch (e) {}
  try { emitChange(); } catch (e) { /* noop */ }
}

// 取下一个自增 id
function nextId() {
  let counter = wx.getStorageSync(COUNTER_KEY) || 0;
  counter += 1;
  wx.setStorageSync(COUNTER_KEY, counter);
  return counter;
}

// 相对时间格式：刚刚 / X分钟前 / X小时前 / 昨天 HH:MM / MM-DD
function formatTime(ts) {
  if (!ts) return "";
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + "分钟前";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "小时前";
  const d = new Date(ts);
  const nowD = new Date(now);
  const isYesterday =
    nowD.getFullYear() === d.getFullYear() &&
    nowD.getMonth() === d.getMonth() &&
    nowD.getDate() - d.getDate() === 1;
  if (isYesterday) {
    return "昨天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  if (nowD.getFullYear() === d.getFullYear()) {
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate())
  );
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// 计算未读数（按通知开关过滤,内存计数兜底）
// 性能优化:全表 filter 改为只统计受开关影响的类型;
// 由 MEM_UNREAD 维护未读总数,只有当开关状态变化时才需要重算
function getUnreadCount() {
  const notify = getNotifySettings();
  const all = loadFromStorage();
  if (notify.trip && notify.promotion && notify.system) {
    // 全部开关开,直接返回内存里的总数
    return MEM_UNREAD;
  }
  // 有开关关闭,精确计数
  return all.filter((m) => {
    if (m.read) return false;
    if (m.type === TYPE.ORDER) return notify.trip;
    if (m.type === TYPE.PROMO) return notify.promotion;
    if (m.type === TYPE.SYSTEM) return notify.system;
    return true;
  }).length;
}

// 派发一条新消息(性能优化:增量维护未读计数,走内存 unshift)
function push(options) {
  // 关键修复:防御性 null 检查,避免 options 为 null 时访问 .type 抛错
  options = options || {};
  const {
    type = TYPE.SYSTEM,
    title = "",
    content = "",
    action = null,
    extra = null,
    iconKey = null,
    highlight = false,
    persist = true,
  } = options;

  // 确保 type 是有效字符串(防止空 type 进入 setData 后 wx:for 报 undefined)
  const safeType = (typeof type === 'string' && type) ? type : TYPE.SYSTEM;

  const msg = {
    id: nextId(),
    type: safeType,
    title: title || "",
    summary: options.summary || '',
    content: content || "",
    time: formatTime(Date.now()),
    timestamp: Date.now(),
    read: false,
    action: action,
    extra: extra,
    orderInfo: options.orderInfo || null,
    couponInfo: options.couponInfo || null,
    coupons: options.coupons || null,
    couponCount: options.couponCount || 0,
    driverInfo: options.driverInfo || null,
    iconKey: iconKey,
    highlight: !!highlight,
  };

  // 内存 unshift(防御 list 为 null,极端情况)
  let list = loadFromStorage();
  if (!Array.isArray(list)) list = [];
  list.unshift(msg);
  if (persist) {
    try {
      setAll(list);
    } catch (e) {
      // setAll 失败也不影响内存,只丢盘
      MEM_MESSAGES = list;
    }
  } else {
    // 不持久化:只更新内存 + 未读计数 + 通知
    MEM_UNREAD += 1;
    try { emitChange(); } catch (e) { /* noop */ }
  }
  return msg;
}

// 标记单条已读
function markRead(id) {
  const list = getAll();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return;
  list[idx].read = true;
  setAll(list);
}

// 标记全部已读
function markAllRead() {
  const list = getAll().map((m) => ({ ...m, read: true }));
  setAll(list);
}

// 删除单条
function remove(id) {
  const list = getAll().filter((m) => m.id !== id);
  setAll(list);
}

// 批量删除
function removeMany(ids) {
  const set = new Set(ids);
  const list = getAll().filter((m) => !set.has(m.id));
  setAll(list);
}

// 清空全部
function clear() {
  setAll([]);
}

// 清空已读
function clearRead() {
  setAll(getAll().filter((m) => !m.read));
}

// 根据类别过滤（同时尊重通知开关）
function filterByCategory(category) {
  const notify = getNotifySettings();
  const all = getAll();
  if (!category || category === "all") {
    // 全部：按开关过滤掉被禁用的类型
    return all.filter((m) => {
      if (m.type === TYPE.ORDER) return notify.trip;
      if (m.type === TYPE.PROMO) return notify.promotion;
      if (m.type === TYPE.SYSTEM) return notify.system;
      return true;
    });
  }
  return all.filter((m) => m.type === category);
}

// 种子数据（仅当本地为空时插入）
function seedIfEmpty() {
  const list = getAll();
  if (list && list.length) return;
  const now = Date.now();
  const seed = [
    {
      type: TYPE.SYSTEM,
      title: "欢迎使用滴滴学习版",
      summary: "智享每一次出行",
      content: "欢迎使用滴滴学习版小程序！我们将为您提供便捷、安全、舒适的出行体验。\n\n您可以：\n• 一键叫车：选择出发地与目的地，匹配附近司机\n• 多种车型：快车、舒适型、商务车、专车满足不同需求\n• 行程分享：与家人朋友分享您的实时位置\n• 在线客服：7x24 小时为您服务\n\n如有任何问题，请点击下方按钮联系客服。",
      ts: now - 60 * 1000,
      action: { type: "chat", label: "联系客服" },
    },
    // 优惠中心 - 合并的优惠卷汇总
    {
      type: TYPE.PROMO,
      title: "优惠卷已到账",
      summary: "3 张优惠卷待使用",
      content: "您有 3 张优惠卷已到账，请尽快使用避免过期。\n\n• 新用户专享卷：¥10 (满20可用)\n• 周末出行卷：¥15 (满50可用)\n• 深夜出行卷：¥8 (满30可用)\n\n点击下方按钮立即前往首页使用。",
      ts: now - 30 * 60 * 1000,
      coupons: [
        { name: '新用户专享卷', amount: 10, minAmount: 20, expire: '领取后7天' },
        { name: '周末出行卷', amount: 15, minAmount: 50, expire: '本周日' },
        { name: '深夜出行卷', amount: 8, minAmount: 30, expire: '本月内' },
      ],
      couponCount: 3,
      action: { type: "navigate", url: "/pages/index/index", label: "立即使用" },
    },
    // 行程消息（订单类）
    {
      type: TYPE.ORDER,
      title: "行程已完成",
      summary: "望京 SOHO → 中关村",
      content: "您昨日的行程已结束，费用已自动结算。感谢您选择滴滴学习版。\n\n如有疑问或需要帮助，请联系客服。",
      ts: now - 22 * 60 * 60 * 1000,
      orderInfo: {
        startAddress: '望京 SOHO',
        endAddress: '中关村',
        carName: '舒适型',
        price: '48.5',
        time: '昨天 18:32',
        driverName: '王师傅',
        driverCar: '京A·88888',
      },
      action: { type: "navigate", url: "/pages/trip/trip", label: "查看详情" },
    },
    {
      type: TYPE.SAFETY,
      title: "安全出行提醒",
      summary: "请注意出行安全",
      content: "夜间出行请注意以下安全事项：\n\n1. 上车前请核对车牌号和司机信息\n2. 全程请系好安全带\n3. 可使用行程分享功能告知家人朋友\n4. 遇到紧急情况可点击「紧急求助」按钮\n5. 请在车内后排乘坐\n\n滴滴学习版将全程守护您的安全。",
      ts: now - 2 * 24 * 60 * 60 * 1000,
    },
    {
      type: TYPE.SYSTEM,
      title: "版本更新 v1.2.0",
      summary: "全新消息中心上线",
      content: "全新消息中心上线，重要通知一目了然。\n\n• 新增会话列表：与司机在线沟通\n• 新增消息详情页：完整查看通知内容\n• 优化通知分类与筛选\n• 支持自定义通知开关\n\n立即体验新版功能！",
      ts: now - 3 * 24 * 60 * 60 * 1000,
    },
    // 司机消息 - 每条独立显示
    {
      type: TYPE.DRIVER,
      title: "王师傅已接驾",
      summary: "京A·88888 · 丰田凯美瑞",
      content: "您的司机王师傅已接驾，正在赶往您的出发地三里屯太古里。\n\n预计 3 分钟内到达，请准备好上车。",
      ts: now - 6 * 60 * 60 * 1000,
      driverInfo: {
        name: '王师傅',
        avatar: '👨',
        car: '京A·88888',
        carModel: '丰田凯美瑞',
        rating: 4.9,
        trips: 5680,
      },
      orderInfo: {
        startAddress: '三里屯太古里',
        endAddress: '首都机场 T3',
        carName: '舒适型',
        price: '128.0',
        time: '今天 08:30',
        driverName: '王师傅',
        driverCar: '京A·88888',
      },
      action: { type: "navigate", url: "/pages/trip/trip", label: "查看行程" },
    },
    {
      type: TYPE.DRIVER,
      title: "李师傅邀请您评价",
      summary: "京B·66666 · 本田雅阁",
      content: "您的司机李师傅邀请您对本次行程进行评价。您的反馈将帮助李师傅提供更好的服务。",
      ts: now - 30 * 60 * 60 * 1000,
      driverInfo: {
        name: '李师傅',
        avatar: '👨‍🦱',
        car: '京B·66666',
        carModel: '本田雅阁',
        rating: 4.8,
        trips: 3240,
      },
      orderInfo: {
        startAddress: '国贸 CBD',
        endAddress: '望京 SOHO',
        carName: '快车',
        price: '38.5',
        time: '昨天 22:15',
        driverName: '李师傅',
        driverCar: '京B·66666',
      },
      action: { type: "navigate", url: "/pages/trip/trip", label: "去评价" },
    },
    {
      type: TYPE.DRIVER,
      title: "张师傅留言",
      summary: "京C·99999 · 大众帕萨特",
      content: "张师傅给您留言：「感谢您选择我的服务，希望下次还能为您服务。如有任何问题请联系客服。」",
      ts: now - 2 * 24 * 60 * 60 * 1000,
      driverInfo: {
        name: '张师傅',
        avatar: '🧔',
        car: '京C·99999',
        carModel: '大众帕萨特',
        rating: 4.95,
        trips: 8920,
      },
      orderInfo: {
        startAddress: '中关村软件园',
        endAddress: '北京西站',
        carName: '商务车',
        price: '186.0',
        time: '2天前 09:20',
        driverName: '张师傅',
        driverCar: '京C·99999',
      },
      action: { type: "navigate", url: "/pages/trip/trip", label: "查看行程" },
    },
  ];
  const list2 = seed.map((s) => ({
    id: nextId(),
    type: s.type,
    title: s.title,
    summary: s.summary || '',
    content: s.content,
    time: formatTime(s.ts),
    timestamp: s.ts,
    read: true,
    action: s.action || null,
    extra: null,
    orderInfo: s.orderInfo || null,
    couponInfo: s.couponInfo || null,
    coupons: s.coupons || null,         // 合并的多优惠
    couponCount: s.couponCount || 0,    // 优惠张数
    driverInfo: s.driverInfo || null,   // 司机信息(独立)
    iconKey: null,
    highlight: false,
  }));
  setAll(list2);
}

module.exports = {
  TYPE,
  getAll,
  push,
  markRead,
  markAllRead,
  remove,
  removeMany,
  clear,
  clearRead,
  filterByCategory,
  getUnreadCount,
  formatTime,
  seedIfEmpty,
  getNotifySettings,
};
