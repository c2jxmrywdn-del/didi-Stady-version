// utils/orderMerge.js — 订单"云端 + 本地"合并的统一真相
// 修复"行程 / 我的"页面数据无法互联互通:
//   - 原 trip.js 走 cloud.callCloud("getOrders") 直接拿云端,
//     但没写回 cloudOrdersCache,导致 profile.js 永远读到空数组
//   - 原 profile.js 仅依赖 cloudOrdersCache,数据滞后/缺失
// 解法:
//   1) 暴露一个统一 mergeOrders(cloudList, localList) 合并规则,所有页面共用
//   2) 暴露一个 fetchAllMergedOrders() 一站式:取云端 -> 与本地合并 -> 写缓存 -> 返回
//      内存层 5s 缓存,避免 trip.onShow + profile.onShow 同时打云
//   3) onOrderChanged() 失效缓存,任何订单状态变更后调用

const CACHE_KEY = "cloudOrdersCache";
const CACHE_TTL = 5000;

let MEM_CLOUD = null;      // { value, expire }
let MEM_INFLIGHT = null;   // Promise

function getUserStats() {
  return require("./userStats");
}
function getCloud() {
  return require("./cloud");
}

// 内存层读云端缓存
function readCloudCache() {
  if (MEM_CLOUD && MEM_CLOUD.expire > Date.now()) {
    return MEM_CLOUD.value;
  }
  // 内存 miss 才走 storage
  try {
    const raw = wx.getStorageSync(CACHE_KEY);
    if (!raw) return [];
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeCloudCache(list) {
  MEM_CLOUD = { value: list, expire: Date.now() + CACHE_TTL };
  try { wx.setStorageSync(CACHE_KEY, list); } catch (e) {}
}

// ===================== 核心:合并规则 =====================
// 单一真相:本地优先(本地包含最新的距离/时长/状态,云端可能滞后)
function mergeOrders(cloudList, localList) {
  const cloud = Array.isArray(cloudList) ? cloudList : [];
  const local = Array.isArray(localList) ? localList : [];
  if (cloud.length === 0) return local.slice();
  if (local.length === 0) return cloud.slice();

  const localMap = new Map(local.map((o) => [o._id, o]));
  // 云端顺序保留(通常 createTime desc),但用本地覆盖同 _id 的字段
  const merged = cloud.map((o) => localMap.get(o._id) || o);
  // 本地有但云端没有的,补上
  const cloudIds = new Set(merged.map((o) => o._id));
  local.forEach((o) => {
    if (!cloudIds.has(o._id)) merged.push(o);
  });
  // 按 createTime 降序
  merged.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  return merged;
}

// ===================== 一站式:云端 + 本地合并 =====================
// 性能优化:
//  - 5s 内存缓存,避免 trip.onShow + profile.onShow 同时触发打云
//  - in-flight 去重
//  - 自动写 cloudOrdersCache,让其他页面(只看缓存的)能立即看到
async function fetchAllMergedOrders(opts) {
  const o = opts || {};
  const userStats = getUserStats();
  const cloud = getCloud();

  // 1) 命中内存缓存
  if (!o.forceRefresh && MEM_CLOUD && MEM_CLOUD.expire > Date.now()) {
    return mergeOrders(MEM_CLOUD.value, userStats.getOrders());
  }

  // 2) in-flight 去重
  if (MEM_INFLIGHT) {
    return MEM_INFLIGHT.then((cloudList) =>
      mergeOrders(cloudList, userStats.getOrders())
    );
  }

  // 3) 真实打云
  MEM_INFLIGHT = (async () => {
    let cloudList = [];
    try {
      if (wx.cloud) {
        const res = await cloud.callCloud("getOrders", { page: 1, pageSize: 50 });
        cloudList = (res && res.data && res.data.list) || [];
      }
    } catch (err) {
      console.warn("[orderMerge] 云端订单读取失败,使用本地", err);
      // 兜底:从 storage 读
      cloudList = readCloudCache();
    }
    // 写回缓存(供其他页面读)
    writeCloudCache(cloudList);
    return cloudList;
  })();

  try {
    const cloudList = await MEM_INFLIGHT;
    return mergeOrders(cloudList, userStats.getOrders());
  } finally {
    MEM_INFLIGHT = null;
  }
}

// ===================== 状态变更后失效 =====================
function onOrderChanged() {
  MEM_CLOUD = null;
  // 同时让云函数缓存也失效
  try {
    const cloud = getCloud();
    cloud.invalidate("getOrders");
  } catch (e) {}
}

// ===================== 把单条本地订单回流到云端缓存(让未打云也能立即看到) =====================
// 用于:index.onCallCar / waiting.matchDriver / riding.onFinishRide / order-detail.afterPaySuccess
function pushLocalToCloudCache(order) {
  if (!order || !order._id) return;
  const list = readCloudCache();
  const idx = list.findIndex((o) => o._id === order._id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...order };
  } else {
    list.unshift(order);
  }
  writeCloudCache(list);
}

module.exports = {
  mergeOrders,
  fetchAllMergedOrders,
  onOrderChanged,
  pushLocalToCloudCache,
  // 内部:暴露给 utils/cloud 的 invalidate
  _clearCache: () => { MEM_CLOUD = null; },
};
