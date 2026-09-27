// utils/orderStore.js — 订单中心(单一数据源)
// 设计目标:
//  1) trip / profile / order-detail 共用同一份合并后的订单数据,杜绝数据不互通
//  2) 本地 + 云端合并去重,本地优先(本地有最新状态,云端有其它端创建的订单)
//  3) 内存缓存 + 订阅发布,订单变更后 trip / profile 立即收到通知
//  4) 统一 _id 规则:与云端 _id 同构(后续可改为云端 _id 全覆盖本地,当前保持"本地 _id 优先"策略)
//
// 关键修复(防死循环):
//  原实现:upsertLocal → userStats.updateOrder → notifyOrderChanged → orderStore.upsertLocal → ...
//         (无限递归 → JS 引擎栈溢出 → 模拟器长无响应 / 卡死)
//  新实现:userStats 暴露"内部写入"函数 __internal*(不 emit 通知),
//         orderStore 调它写本地(但不再反向触发 userStats 通知),
//         顶层入口(onCallCar / order-detail 等)仍用 userStats.createOrder/updateOrder,
//         它们会单向 emit 给 orderStore 的订阅者
const userStats = require("./userStats");
const cloud = require("./cloud");

// ============ 内存层 ============
let MEM_ORDERS = [];        // 合并去重后的订单列表
let MEM_LOADING = false;     // 防止并发 load
let MEM_DIRTY = true;        // true 表示需要重新拉取
let LAST_LOAD_AT = 0;        // 上次拉取时间戳
const FRESH_WINDOW = 5000;   // 5s 内命中内存(避免频繁 setData / 网络)

// 订阅者(各页面 onLoad 时 subscribe, onUnload 时 unsubscribe)
const SUBSCRIBERS = new Set();

function subscribe(fn) { SUBSCRIBERS.add(fn); return () => SUBSCRIBERS.delete(fn); }
function emit(event) {
  for (const fn of SUBSCRIBERS) {
    try { fn(event); } catch (e) { /* noop */ }
  }
}

// ============ 核心:加载 + 合并 ============
async function load(force) {
  if (MEM_LOADING) return getOrders();
  const now = Date.now();
  if (!force && !MEM_DIRTY && now - LAST_LOAD_AT < FRESH_WINDOW && MEM_ORDERS.length > 0) {
    return getOrders();
  }
  MEM_LOADING = true;
  try {
    let cloudOrders = [];
    // 1) 云端拉取(失败不阻塞,降级为本地)
    //    关键:仅在 force=true(显式 refresh)或内存里完全没有数据时才尝试云端,
    //         避免每次 onShow 都重复触发 -501000 错误(云函数未部署时)
    if (wx.cloud && (force || MEM_ORDERS.length === 0)) {
      try {
        const res = await cloud.callCloud("getOrders", { page: 1, pageSize: 50 });
        const list = res && res.data && res.data.list;
        cloudOrders = Array.isArray(list) ? list : [];
      } catch (err) {
        // 静默:云函数未部署时不要每次都打 console
        // (首次运行教学版小程序,云函数通常未部署,本地缓存足够)
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[orderStore] 云端拉取失败,使用本地数据", err && err.errMsg || err);
        }
      }
    }
    // 2) 合并:以 _id 为 key,本地优先(本地有最新 status / actualPrice)
    const localOrders = userStats.getOrders() || [];
    const localMap = new Map(localOrders.map((o) => [o._id, o]));
    const merged = cloudOrders.map((o) => localMap.get(o._id) || o);
    // 本地有但云端没有的,补上
    const cloudIds = new Set(merged.map((o) => o._id));
    localOrders.forEach((o) => {
      if (!cloudIds.has(o._id)) merged.push(o);
    });
    // 按 createTime 倒序
    merged.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
    MEM_ORDERS = merged;
    MEM_DIRTY = false;
    LAST_LOAD_AT = Date.now();
    emit({ type: "loaded", orders: MEM_ORDERS });
    return MEM_ORDERS;
  } finally {
    MEM_LOADING = false;
  }
}

function getOrders() {
  // 同步返回内存(可能为空数组 — 让调用方决定是否要 await load())
  return MEM_ORDERS;
}

// 订单状态变更后调:写本地 + 通知订阅者
// 关键:用 userStats 暴露的"内部写入"函数(不 emit 通知),避免反向递归
function upsertLocal(orderOrPatch) {
  if (!orderOrPatch || !orderOrPatch._id) return;
  // 1) 写本地(走"内部"函数,不触发反向通知)
  const existed = userStats.__internalGetOrderById(orderOrPatch._id);
  if (existed) {
    userStats.__internalUpdateOrder(orderOrPatch._id, orderOrPatch);
  } else {
    userStats.__internalCreateOrder(orderOrPatch);
  }
  // 2) 更新内存
  const idx = MEM_ORDERS.findIndex((o) => o._id === orderOrPatch._id);
  const updated = idx >= 0
    ? { ...MEM_ORDERS[idx], ...orderOrPatch }
    : { ...orderOrPatch };
  if (idx >= 0) MEM_ORDERS[idx] = updated;
  else MEM_ORDERS.unshift(updated);
  MEM_ORDERS.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  // 3) 通知
  emit({ type: "upsert", order: updated });
}

// 状态变更后,主动失效缓存(下次 load 拉最新)
function invalidate() {
  MEM_DIRTY = true;
  LAST_LOAD_AT = 0;
}

// 立即重新拉取(给订阅者)
async function refresh() {
  invalidate();
  return await load(true);
}

module.exports = {
  load,
  refresh,
  getOrders,
  subscribe,
  upsertLocal,
  invalidate,
};
