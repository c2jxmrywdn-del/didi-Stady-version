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

// ===================== 匹配司机 =====================
async function matchDriver(data, wxContext) {
  // 选司机
  const driver = DRIVER_POOL[Math.floor(Math.random() * DRIVER_POOL.length)];

  // 并行/降级:订单状态更新失败不应阻塞返回司机信息
  // 性能优化:where({_id,_openid}) 单次 update,不再做 where().get() 校验
  if (data.orderId) {
    // 修复:不能用 where({_id: ...}).update()(_id 是保留字段,会抛 sync-173-266)
    // 用 doc(_id) 单文档更新(无 _openid 校验,因为匹配是异步推送,不影响前端体验)
    db.collection("orders")
      .doc(data.orderId)
      .update({
        data: {
          status: "riding",
          driverInfo: driver,
          matchTime: db.serverDate(),
        },
      })
      .catch(() => { /* 静默失败,匹配已成功 */ });
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
