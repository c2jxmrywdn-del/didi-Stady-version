// utils/userStats.js — 用户出行统计 & 钱包资产统一存储
// 设计目标：
// 1) 单点真相:profile / trip / order-detail / payment / index 共享同一份本地数据
// 2) 真实累加:每完成一笔订单就把里程/花费/行程+1,并扣减余额/信用,奖励积分
// 3) 防御:任何字段非法都自动回退到默认值,绝不抛错影响业务
// 性能优化:内存缓存 stats + orders,getStats/getOrders 命中内存避免每次 wx.getStorageSync
//          在 onShow/支付/订单完成等高频路径的多次重复读

const STORAGE_KEY = "userStats_v1";
const ORDER_HISTORY_KEY = "orderHistory_v1";

// 内存层(null 表示未加载)
let MEM_STATS = null;
let MEM_ORDERS = null;

const DEFAULT_STATS = {
  // 出行记录
  totalTrips: 0,            // 累计行程数
  totalDistance: 0,         // 累计里程(km)
  totalDuration: 0,         // 累计时长(秒)
  totalAmount: 0,           // 累计花费(元)
  // 钱包资产
  balance: 88.5,            // 钱包余额
  creditLimit: 500,         // 信用额度(可垫付额度)
  creditUsed: 0,            // 已用信用
  points: 1280,             // 可用积分
  // 时间戳
  updatedAt: 0,
};

function loadStatsFromStorage() {
  if (MEM_STATS !== null) return MEM_STATS;
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

function persistStats(stats) {
  MEM_STATS = stats;
  try { wx.setStorageSync(STORAGE_KEY, stats); } catch (e) {}
}

function loadOrdersFromStorage() {
  if (MEM_ORDERS !== null) return MEM_ORDERS;
  try {
    const raw = wx.getStorageSync(ORDER_HISTORY_KEY);
    MEM_ORDERS = !raw ? [] : (typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch (e) {
    MEM_ORDERS = [];
  }
  return MEM_ORDERS;
}

function persistOrders(list) {
  MEM_ORDERS = list;
  try { wx.setStorageSync(ORDER_HISTORY_KEY, list); } catch (e) {}
}

// 获取完整统计;命中内存,首次 miss 才走 storage
function getStats() {
  return loadStatsFromStorage();
}

// 仅刷新到内存(同步写盘,保证下次冷启动可见)
function setStats(partial) {
  const current = loadStatsFromStorage();
  const next = { ...current, ...partial, updatedAt: Date.now() };
  persistStats(next);
  return next;
}

// ============ 资产操作 ============

// 钱包扣款;不足时返回 false
function payFromBalance(amount) {
  const cur = getStats();
  const amt = Number(amount) || 0;
  if (amt <= 0) return { ok: true, stats: cur, paid: 0 };
  if (cur.balance >= amt) {
    return {
      ok: true,
      stats: setStats({ balance: +(cur.balance - amt).toFixed(2) }),
      paid: amt,
      from: "balance",
    };
  }
  return {
    ok: false,
    stats: cur,
    paid: 0,
    need: +(amt - cur.balance).toFixed(2),
    reason: "余额不足",
  };
}

// 钱包充值
function rechargeBalance(amount) {
  const cur = getStats();
  const amt = Number(amount) || 0;
  if (amt <= 0) return cur;
  return setStats({ balance: +(cur.balance + amt).toFixed(2) });
}

// 信用支付(垫付);超过剩余额度返回 false
function payFromCredit(amount) {
  const cur = getStats();
  const amt = Number(amount) || 0;
  if (amt <= 0) return { ok: true, stats: cur, paid: 0 };
  const remain = +(cur.creditLimit - cur.creditUsed).toFixed(2);
  if (amt > remain) {
    return { ok: false, stats: cur, paid: 0, need: +(amt - remain).toFixed(2), reason: "信用额度不足" };
  }
  return {
    ok: true,
    stats: setStats({ creditUsed: +(cur.creditUsed + amt).toFixed(2) }),
    paid: amt,
    from: "credit",
  };
}

// 信用偿还(从余额扣减)
function repayCredit(amount) {
  const cur = getStats();
  const amt = Number(amount) || 0;
  if (amt <= 0) return { ok: false, stats: cur, reason: "金额无效" };
  const actual = Math.min(amt, cur.creditUsed);
  if (cur.balance < actual) {
    return { ok: false, stats: cur, need: actual, reason: "余额不足,无法偿还" };
  }
  return {
    ok: true,
    stats: setStats({
      balance: +(cur.balance - actual).toFixed(2),
      creditUsed: +(cur.creditUsed - actual).toFixed(2),
    }),
    paid: actual,
  };
}

// 积分扣减(用于兑换/支付);不足返回 false
function spendPoints(pts) {
  const cur = getStats();
  const p = Number(pts) || 0;
  if (p <= 0) return { ok: true, stats: cur, spent: 0 };
  if (cur.points < p) {
    return { ok: false, stats: cur, need: p, reason: "积分不足" };
  }
  return {
    ok: true,
    stats: setStats({ points: cur.points - p }),
    spent: p,
  };
}

// 积分奖励(订单完成后赠送)
function rewardPoints(pts) {
  const cur = getStats();
  const p = Math.max(0, Math.floor(Number(pts) || 0));
  if (p === 0) return cur;
  return setStats({ points: cur.points + p });
}

// ============ 行程累加 ============

// 订单完成时累加:里程、时长、行程数 +1;花费按支付方式扣减
// options = { distance, duration, amount, payFrom: 'balance'|'credit'|'wechat', rewardPts }
function recordCompletedOrder(options) {
  const { distance = 0, duration = 0, amount = 0, payFrom = "wechat", rewardPts = 0 } = options || {};
  const cur = getStats();

  const dist = Number(distance) || 0;
  const dur = Number(duration) || 0;
  const amt = Number(amount) || 0;
  const rwd = Math.max(0, Math.floor(Number(rewardPts) || 0));

  const next = {
    totalTrips: cur.totalTrips + 1,
    totalDistance: +(cur.totalDistance + dist).toFixed(2),
    totalDuration: cur.totalDuration + dur,
    totalAmount: +(cur.totalAmount + amt).toFixed(2),
  };

  // 按支付方式扣减/记账
  if (payFrom === "balance") {
    const pay = payFromBalance(amt);
    if (pay.ok) {
      // 已成功扣减
    }
  } else if (payFrom === "credit") {
    const pay = payFromCredit(amt);
    if (pay.ok) {
      // 已成功记账
    }
  } else {
    // 微信支付:不影响余额/信用,但累计总花费
  }

  // 奖励积分
  if (rwd > 0) {
    rewardPoints(rwd);
    next.points = getStats().points;
  } else {
    next.points = cur.points;
  }

  // 保留余额/信用最新值
  const latest = getStats();
  next.balance = latest.balance;
  next.creditUsed = latest.creditUsed;
  next.creditLimit = latest.creditLimit;
  next.points = latest.points;

  return setStats(next);
}

// ============ 订单历史 ============

function getOrders() {
  const list = loadOrdersFromStorage();
  return Array.isArray(list) ? list : [];
}

function setOrders(list) {
  persistOrders(list);
  return list;
}

// 创建订单(下单时调用,状态 = waiting)
function createOrder(order) {
  const list = getOrders();
  const id = order._id || order.id || ("o_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
  const item = {
    _id: id,
    status: "waiting", // waiting/riding/completed/cancelled/unpaid
    createTime: Date.now(),
    ...order,
    _id: id,
  };
  list.unshift(item);
  setOrders(list);
  // 跨模块通知:让 trip / profile 立即刷新
  notifyOrderChanged({ type: "create", order: item });
  return item;
}

function updateOrder(id, patch) {
  const list = getOrders();
  const idx = list.findIndex((o) => o._id === id);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...patch, updateTime: Date.now() };
  // 兼容:_id 被改写时(如同步云端 _id),删除原条目,按新 _id 重新插入头部
  if (patch && patch._id && patch._id !== id) {
    list.splice(idx, 1);
    list.unshift(merged);
  } else {
    list[idx] = merged;
  }
  setOrders(list);
  // 跨模块通知:让 trip / profile 立即刷新
  notifyOrderChanged({ type: "update", order: merged });
  return merged;
}

// ============ 内部写入函数(供 orderStore 调用,不 emit 通知) ============
// 关键:这些函数不走 notifyOrderChanged,避免反向递归导致栈溢出
// orderStore.upsertLocal 会调它们来写本地数据,而不是调 createOrder/updateOrder
function __internalGetOrderById(id) {
  return getOrders().find((o) => o._id === id) || null;
}

function __internalUpdateOrder(id, patch) {
  const list = getOrders();
  const idx = list.findIndex((o) => o._id === id);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...patch, updateTime: Date.now() };
  if (patch && patch._id && patch._id !== id) {
    list.splice(idx, 1);
    list.unshift(merged);
  } else {
    list[idx] = merged;
  }
  // 直接 setOrders,不调 notifyOrderChanged
  setOrders(list);
  return merged;
}

function __internalCreateOrder(order) {
  const list = getOrders();
  const id = order._id || order.id || ("o_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
  const item = {
    _id: id,
    status: "waiting",
    createTime: Date.now(),
    ...order,
    _id: id,
  };
  list.unshift(item);
  setOrders(list);
  return item;
}

// 简易事件订阅(供 orderStore 接入)
// 关键修复:const 声明必须在 function 之前,避免 TDZ ReferenceError
const _userStatsListeners = new Set();
function onOrderChanged(fn) { _userStatsListeners.add(fn); return () => _userStatsListeners.delete(fn); }

// 通知订阅者(若 orderStore 已加载,触发它的订阅回调)
// 关键修复:不再调 orderStore.upsertLocal(会触发反向递归 → 栈溢出 / 死循环)
// 改为:用户层直接调 orderStore.upsertLocal(order),userStats 只 emit 本地事件
function notifyOrderChanged(event) {
  // 保留 hook 点(目前 orderStore 通过 subscribe 自接,不需要直接调它)
  // 如果未来需要更多订阅者,改成 EventBus
  if (_userStatsListeners && _userStatsListeners.size > 0) {
    for (const fn of _userStatsListeners) {
      try { fn(event); } catch (e) { /* noop */ }
    }
  }
}

function getOrderById(id) {
  return getOrders().find((o) => o._id === id) || null;
}

function removeOrder(id) {
  const list = getOrders().filter((o) => o._id !== id);
  setOrders(list);
  return list;
}

// 按状态筛选
function filterOrders(status) {
  const list = getOrders();
  if (!status || status === "all") return list;
  if (Array.isArray(status)) return list.filter((o) => status.includes(o.status));
  return list.filter((o) => o.status === status);
}

// 各状态订单计数
function countOrdersByStatus() {
  const list = getOrders();
  return {
    all: list.length,
    waiting: list.filter((o) => o.status === "waiting").length,
    riding: list.filter((o) => o.status === "riding").length,
    completed: list.filter((o) => o.status === "completed").length,
    cancelled: list.filter((o) => o.status === "cancelled").length,
    unpaid: list.filter((o) => o.status === "unpaid").length,
    ongoing: list.filter((o) => o.status === "waiting" || o.status === "riding").length,
    uncomment: list.filter((o) => o.status === "completed" && !o.commented).length,
    refund: list.filter((o) => o.status === "refund" || o.status === "refunding").length,
  };
}

module.exports = {
  DEFAULT_STATS,
  getStats,
  setStats,
  payFromBalance,
  rechargeBalance,
  payFromCredit,
  repayCredit,
  spendPoints,
  rewardPoints,
  recordCompletedOrder,
  getOrders,
  setOrders,
  createOrder,
  updateOrder,
  getOrderById,
  removeOrder,
  filterOrders,
  countOrdersByStatus,
  // 内部写入函数(供 orderStore 调用,不 emit 通知,防死循环)
  __internalGetOrderById,
  __internalUpdateOrder,
  __internalCreateOrder,
  // 简易事件订阅(目前未使用,保留扩展点)
  onOrderChanged,
};
