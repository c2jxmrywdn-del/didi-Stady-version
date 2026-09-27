// matchFunctions/index.js — 司机匹配/调度类云函数
// 从原 quickstartFunctions 拆分,独立扩缩容;模拟匹配逻辑可后续对接真实司机池
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 模拟司机池(可后续改为查 drivers 集合)
const DRIVER_POOL = [
  { name: "王师傅", car: "京A·88888", carModel: "丰田凯美瑞", rating: 4.9, trips: 5680, phone: "138****8888", avatar: "👨" },
  { name: "李师傅", car: "京B·66666", carModel: "本田雅阁", rating: 4.8, trips: 3240, phone: "139****6666", avatar: "👨‍🦱" },
  { name: "张师傅", car: "京C·99999", carModel: "大众帕萨特", rating: 4.95, trips: 8920, phone: "136****9999", avatar: "🧔" },
];

// ---- 统一错误码(与前端 miniprogram/utils/errorCodes.js 保持数值一致)----
const ERROR = {
  OK: 0,
  PARAM: -100,
  PERMISSION_DENIED: -403,
  NOT_FOUND: -404,
  RATE_LIMITED: -429,
  SERVER: -500,
  UNKNOWN: -1,
};

// ---- 尽力而为的限流(单实例内存滑动窗口)----
// 注意:云函数无状态、可能多实例并发且冷启动会清空本表,故此限流仅"尽力而为",
// 只能挡住单实例内的重复刷取;生产环境请改用 Redis / 数据库等全局共享存储做分布式限流。
const RATE_WINDOW_MS = 60000; // 60 秒窗口
const RATE_MAX = 20;          // 每窗口最多 20 次
const _rateBuckets = new Map(); // OPENID -> number[](命中时间戳)
function isRateLimited(OPENID) {
  if (!OPENID) return false;
  const now = Date.now();
  const recent = (_rateBuckets.get(OPENID) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    _rateBuckets.set(OPENID, recent);
    return true;
  }
  recent.push(now);
  _rateBuckets.set(OPENID, recent);
  // 防止 Map 无限增长:桶数偏多时清理过期键
  if (_rateBuckets.size > 1000) {
    for (const [k, v] of _rateBuckets) {
      const alive = v.filter((t) => now - t < RATE_WINDOW_MS);
      if (alive.length === 0) _rateBuckets.delete(k);
      else _rateBuckets.set(k, alive);
    }
  }
  return false;
}

// ===================== 匹配司机 =====================
async function matchDriver(data, wxContext) {
  const OPENID = wxContext.OPENID;

  // 尽力而为限流:防止单实例内被高频刷取(详见 isRateLimited 注释)
  if (isRateLimited(OPENID)) {
    return { code: ERROR.RATE_LIMITED, message: "操作过于频繁,请稍后再试" };
  }

  // 安全:更新订单前必须校验该订单归属当前用户,防止越权篡改他人订单(IDOR)
  // 步骤:先按 orderId 查询完整订单 → 比对 _openid → 不匹配直接返回权限错误
  if (data.orderId) {
    const order = await db.collection("orders").doc(data.orderId).get();
    if (!order.data || order.data._openid !== OPENID) {
      return { code: ERROR.PERMISSION_DENIED, message: "订单不存在或无权操作" };
    }
  }

  // 选司机
  const driver = DRIVER_POOL[Math.floor(Math.random() * DRIVER_POOL.length)];

  // 归属已确认后才更新订单状态;写库失败不应阻塞返回司机信息
  if (data.orderId) {
    try {
      await db
        .collection("orders")
        .doc(data.orderId)
        .update({
          data: {
            status: "riding",
            driverInfo: driver,
            matchTime: db.serverDate(),
          },
        });
    } catch (e) {
      // 匹配本身已成功,状态回写失败不影响返回司机
      console.warn("[matchDriver] 更新订单状态失败", e);
    }
  }

  return { code: 0, data: driver };
}

// ===================== 获取附近司机(模拟) =====================
async function getNearbyDrivers(data) {
  const { latitude, longitude } = data;
  const drivers = [];
  for (let i = 0; i < 8; i++) {
    drivers.push({
      id: i,
      latitude: latitude + (Math.random() - 0.5) * 0.02,
      longitude: longitude + (Math.random() - 0.5) * 0.02,
    });
  }
  return { code: 0, data: drivers };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const { type, data } = event;
  try {
    switch (type) {
      case "matchDriver":      return await matchDriver(data, wxContext);
      case "getNearbyDrivers": return await getNearbyDrivers(data);
      default: return { code: -1, message: "未知操作类型: " + type };
    }
  } catch (err) {
    return { code: -1, message: "服务异常: " + err.message };
  }
};
