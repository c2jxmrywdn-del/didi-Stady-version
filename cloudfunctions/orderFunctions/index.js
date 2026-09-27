// orderFunctions/index.js — 订单/行程专属云函数
// 从原 quickstartFunctions 拆分而来,独立冷启动与扩缩容,提升并发吞吐
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ===================== 创建订单 =====================
async function createOrder(data, wxContext) {
  try {
    const order = {
      _openid: wxContext.OPENID,
      startAddress: data.startAddress,
      endAddress: data.endAddress,
      carType: data.carType,
      carName: data.carName,
      estimatePrice: data.estimatePrice,
      estimateTime: data.estimateTime,
      status: "waiting",
      createTime: db.serverDate(),
      driverInfo: null,
      actualPrice: 0,
      duration: 0,
      distance: 0,
      rating: 0,
      comment: "",
      commentTags: [],
    };

    const result = await db.collection("orders").add({ data: order });
    return { code: 0, data: { orderId: result._id }, message: "订单创建成功" };
  } catch (err) {
    return { code: -1, message: "订单创建失败: " + err.message };
  }
}

// ===================== 获取订单列表 =====================
// 性能优化:count + get 改为 Promise.all 并行(原代码串行 2 次 DB 读)
async function getOrders(data, wxContext) {
  try {
    const { status, page = 1, pageSize = 10 } = data;
    const where = { _openid: wxContext.OPENID };
    if (status && status.length > 0) {
      where.status = _.in(status);
    }

    const [countResult, listResult] = await Promise.all([
      db.collection("orders").where(where).count(),
      db
        .collection("orders")
        .where(where)
        .orderBy("createTime", "desc")
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
    ]);

    return {
      code: 0,
      data: {
        list: listResult.data,
        total: countResult.total,
        page,
        pageSize,
      },
    };
  } catch (err) {
    return { code: -1, message: "获取订单列表失败: " + err.message };
  }
}

// ===================== 获取订单详情 =====================
async function getOrderDetail(data, wxContext) {
  try {
    const result = await db
      .collection("orders")
      .doc(data.orderId)
      .get();
    // 安全:只返回当前 openid 的订单
    if (!result.data || result.data._openid !== wxContext.OPENID) {
      return { code: -1, message: "订单不存在或无权访问" };
    }
    return { code: 0, data: result.data };
  } catch (err) {
    return { code: -1, message: "获取订单详情失败: " + err.message };
  }
}

// ===================== 取消订单 =====================
async function cancelOrder(data, wxContext) {
  try {
    // 关键修复:不能用 where({_id: ...}).update(),_id 是保留字段,会抛 sync-173-266
    // 改用 doc(_id) + 二次校验 _openid 的两步走(性能足够,用户量级 1k 内 < 5ms)
    const OPENID = wxContext.OPENID;
    const orderId = data.orderId;
    if (!orderId) return { code: -1, message: "订单 id 缺失" };

    const order = await db.collection("orders").doc(orderId).get();
    if (!order.data || order.data._openid !== OPENID) {
      return { code: -1, message: "订单不存在或无权操作" };
    }
    const result = await db.collection("orders").doc(orderId).update({
      data: {
        status: "cancelled",
        cancelReason: data.reason || "",
        cancelTime: db.serverDate(),
      },
    });
    if (!result.stats || result.stats.updated === 0) {
      return { code: -1, message: "订单更新失败" };
    }
    return { code: 0, message: "订单已取消" };
  } catch (err) {
    return { code: -1, message: "取消订单失败: " + err.message };
  }
}

// ===================== 完成订单 =====================
async function completeOrder(data, wxContext) {
  try {
    const OPENID = wxContext.OPENID;
    const orderId = data.orderId;
    if (!orderId) return { code: -1, message: "订单 id 缺失" };

    const order = await db.collection("orders").doc(orderId).get();
    if (!order.data || order.data._openid !== OPENID) {
      return { code: -1, message: "订单不存在或无权操作" };
    }
    const result = await db.collection("orders").doc(orderId).update({
      data: {
        status: "completed",
        actualPrice: data.actualPrice,
        duration: data.duration,
        distance: data.distance,
        endTime: db.serverDate(),
      },
    });
    if (!result.stats || result.stats.updated === 0) {
      return { code: -1, message: "订单更新失败" };
    }
    return { code: 0, message: "订单已完成" };
  } catch (err) {
    return { code: -1, message: "完成订单失败: " + err.message };
  }
}

// ===================== 支付订单 =====================
async function payOrder(data, wxContext) {
  try {
    const OPENID = wxContext.OPENID;
    const orderId = data.orderId;
    if (!orderId) return { code: -1, message: "订单 id 缺失" };

    const order = await db.collection("orders").doc(orderId).get();
    if (!order.data || order.data._openid !== OPENID) {
      return { code: -1, message: "订单不存在或无权操作" };
    }
    const result = await db.collection("orders").doc(orderId).update({
      data: {
        payStatus: "paid",
        payMethod: data.payMethod || "wechat",
        payTime: db.serverDate(),
        actualPrice: data.actualPrice,
      },
    });
    if (!result.stats || result.stats.updated === 0) {
      return { code: -1, message: "订单更新失败" };
    }
    return { code: 0, message: "支付成功" };
  } catch (err) {
    return { code: -1, message: "支付失败: " + err.message };
  }
}

// ===================== 评价司机 =====================
async function rateDriver(data, wxContext) {
  try {
    const OPENID = wxContext.OPENID;
    const orderId = data.orderId;
    if (!orderId) return { code: -1, message: "订单 id 缺失" };

    const order = await db.collection("orders").doc(orderId).get();
    if (!order.data || order.data._openid !== OPENID) {
      return { code: -1, message: "订单不存在或无权操作" };
    }
    const updateData = {
      rating: data.rating,
      comment: data.comment || "",
      commentTags: data.commentTags || [],
      rateTime: db.serverDate(),
    };
    if (data.appRating !== undefined) updateData.appRating = data.appRating;
    if (data.appCommentTags) updateData.appCommentTags = data.appCommentTags;
    const result = await db.collection("orders").doc(orderId).update({ data: updateData });
    if (!result.stats || result.stats.updated === 0) {
      return { code: -1, message: "订单更新失败" };
    }
    return { code: 0, message: "评价成功" };
  } catch (err) {
    return { code: -1, message: "评价失败: " + err.message };
  }
}

// ===================== 计算价格 =====================
async function calcPrice(data) {
  const { distance, duration, carType } = data;
  const priceConfig = {
    fast: { base: 8, pricePerKm: 1.8, pricePerMin: 0.3, minPrice: 8 },
    comfort: { base: 10, pricePerKm: 2.2, pricePerMin: 0.4, minPrice: 10 },
    business: { base: 15, pricePerKm: 3.5, pricePerMin: 0.5, minPrice: 15 },
    luxe: { base: 20, pricePerKm: 4.0, pricePerMin: 0.6, minPrice: 20 },
  };
  const config = priceConfig[carType] || priceConfig.fast;
  const price =
    config.base +
    distance * config.pricePerKm +
    (duration / 60) * config.pricePerMin;
  const finalPrice = Math.max(config.minPrice, price).toFixed(1);
  return {
    code: 0,
    data: {
      price: finalPrice,
      distance: distance.toFixed(1),
      duration: Math.ceil(duration / 60),
    },
  };
}

// ===================== 生成小程序码 =====================
async function getMiniProgramCode(wxContext) {
  try {
    const result = await cloud.openapi.wxacode.get({
      path: "pages/index/index",
      width: 430,
      autoColor: true,
    });
    const uploadResult = await cloud.uploadFile({
      cloudPath: `qrcode/${wxContext.OPENID}-${Date.now()}.png`,
      fileContent: result.buffer,
    });
    return { code: 0, data: { fileID: uploadResult.fileID } };
  } catch (err) {
    return { code: -1, message: "生成小程序码失败: " + err.message };
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const { type, data } = event;
  try {
    switch (type) {
      case "createOrder":       return await createOrder(data, wxContext);
      case "getOrders":         return await getOrders(data, wxContext);
      case "getOrderDetail":    return await getOrderDetail(data, wxContext);
      case "cancelOrder":       return await cancelOrder(data, wxContext);
      case "completeOrder":     return await completeOrder(data, wxContext);
      case "payOrder":          return await payOrder(data, wxContext);
      case "rateDriver":        return await rateDriver(data, wxContext);
      case "calcPrice":         return await calcPrice(data);
      case "getMiniProgramCode":return await getMiniProgramCode(wxContext);
      default: return { code: -1, message: "未知操作类型: " + type };
    }
  } catch (err) {
    return { code: -1, message: "服务异常: " + err.message };
  }
};
