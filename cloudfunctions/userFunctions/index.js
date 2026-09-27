// userFunctions/index.js — 用户/系统类云函数
// 从原 quickstartFunctions 拆分出来,降低单函数代码体积与冷启动延迟
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// ===================== 获取 OpenId =====================
async function getOpenId(wxContext) {
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
}

// ===================== 更新用户信息(upsert) =====================
// 性能优化:用 _ + 原子 add 或 update,避免 where().get() 后再决定 add/update 的 2 次往返
async function updateUser(data, wxContext) {
  try {
    const OPENID = wxContext.OPENID;
    const userCollection = db.collection("users");

    // 1) 优先尝试 update 命中(_openid 上有索引)
    const updateRes = await userCollection
      .where({ _openid: OPENID })
      .update({
        data: { ...data, updateTime: db.serverDate() },
      });

    if (updateRes.stats && updateRes.stats.updated > 0) {
      return { code: 0, message: "用户信息更新成功" };
    }

    // 2) 没记录则 add(并发下 add 可能因 _id 冲突失败,再走一次 update)
    try {
      await userCollection.add({
        data: {
          _openid: OPENID,
          ...data,
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
        },
      });
      return { code: 0, message: "用户信息创建成功" };
    } catch (e) {
      // 并发:另一个请求刚刚 add,这里再 update 一次
      await userCollection
        .where({ _openid: OPENID })
        .update({ data: { ...data, updateTime: db.serverDate() } });
      return { code: 0, message: "用户信息更新成功" };
    }
  } catch (err) {
    return { code: -1, message: "更新用户信息失败: " + err.message };
  }
}

// ===================== 获取用户信息 =====================
async function getUserInfo(wxContext) {
  try {
    const result = await db
      .collection("users")
      .where({ _openid: wxContext.OPENID })
      .limit(1)
      .get();
    return { code: 0, data: result.data[0] || null };
  } catch (err) {
    return { code: -1, message: "获取用户信息失败: " + err.message };
  }
}

// ===================== 初始化数据库集合(幂等) =====================
async function createCollection() {
  const collections = ["orders", "users", "drivers", "messages"];
  // 并行:每个 createCollection 之间无依赖
  await Promise.all(
    collections.map((name) =>
      db.createCollection(name).catch(() => {
        // 集合可能已存在
      })
    )
  );
  return { code: 0, message: "集合创建成功" };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const { type, data } = event;
  try {
    switch (type) {
      case "getOpenId":      return await getOpenId(wxContext);
      case "updateUser":     return await updateUser(data, wxContext);
      case "getUserInfo":    return await getUserInfo(wxContext);
      case "createCollection":return await createCollection();
      default: return { code: -1, message: "未知操作类型: " + type };
    }
  } catch (err) {
    return { code: -1, message: "服务异常: " + err.message };
  }
};
