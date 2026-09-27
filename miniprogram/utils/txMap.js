// utils/txMap.js — 腾讯位置服务封装
// 设计目标:使用微信小程序原生 API(腾讯地图底座),不再依赖百度地图
// 所有功能均通过 wx.* 原生 API + 微信云函数实现:
//   1. 定位 wx.getLocation(type=gcj02) — 微信原生
//   2. 选点 wx.chooseLocation        — 微信原生,自带腾讯地图选点
//   3. 看位置 wx.openLocation         — 微信原生,弹腾讯地图卡,可一键导航
//   4. 逆地址 wx.getLocation + 云函数 — 通过云函数 reverseGeocode 反查
//   5. POI 搜索 wx.chooseLocation    — 微信原生,自带搜索
//   6. 距离计算 Haversine 公式        — 前端纯计算,无需网络
//   7. 路线规划:用 wx.openLocation 唤起用户手机原生地图 App(腾讯/百度/高德均可),
//      让用户自主选择导航方式

// 是否启用云函数(云函数不可用时静默降级)
let cloudAvailable = true;
try {
  if (!wx.cloud) cloudAvailable = false;
} catch (e) {
  cloudAvailable = false;
}

// ===================== 定位 =====================

// 当前位置(微信原生,gcj02)
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: "gcj02",
      altitude: false,
      isHighAccuracy: true,
      highAccuracyExpireTime: 3000,
      success: (res) => resolve({
        latitude: res.latitude,
        longitude: res.longitude,
        accuracy: res.accuracy,
        speed: res.speed,
      }),
      fail: (err) => reject(new Error("获取位置失败: " + (err.errMsg || "未知错误"))),
    });
  });
}

// ===================== 逆地址解析 =====================

// 通过云函数 reverseGeocode 反查;云函数不可用时降级为坐标字符串
// 修复:之前错误地调用了不存在的 `txMap` 云函数,导致每次都走 fallback
// 现在统一路由到 `baiduMap` 云函数(已实现 reverseGeocode / placeSearch / nearbyPoi)
function reverseGeocode(latitude, longitude) {
  if (cloudAvailable) {
    return wx.cloud.callFunction({
      name: "baiduMap",
      data: { type: "reverseGeocode", data: { latitude, longitude } },
    }).then((res) => {
      if (res && res.result && res.result.code === 0 && res.result.data) {
        // 兼容两种返回形态
        const d = res.result.data;
        const formatted = d.address || d.formatted_address || "";
        return {
          address: d.address || formatted,
          province: d.province || "",
          city: d.city || "",
          district: d.district || "",
          street: d.street || "",
          streetNumber: d.streetNumber || "",
          formattedAddress: formatted,
          pois: d.pois || [],
        };
      }
      throw new Error("逆地址解析失败");
    }).catch(() => fallbackReverseGeocode(latitude, longitude));
  }
  return fallbackReverseGeocode(latitude, longitude);
}

// 降级方案:返回坐标字符串,提示用户
function fallbackReverseGeocode(latitude, longitude) {
  return Promise.resolve({
    address: "",
    province: "",
    city: "",
    district: "",
    street: "",
    formattedAddress: `当前位置 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    fallback: true,
  });
}

// ===================== 选点 =====================

// 调起微信原生选点(腾讯地图选点器)
function chooseLocation() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success: (res) => resolve({
        name: res.name || "",
        address: res.address || "",
        latitude: res.latitude,
        longitude: res.longitude,
      }),
      fail: (err) => reject(new Error("选点失败: " + (err.errMsg || "已取消"))),
    });
  });
}

// ===================== 打开位置 / 调起原生地图 App 导航 =====================

// 关键功能:让用户自行跳转到手机原生地图软件(腾讯/百度/高德)进行导航
// 原理:wx.openLocation 弹出一个微信内置的"位置卡",
// 卡片右上角的"导航"按钮会自动调起用户手机上已安装的原生地图 App
function openLocationOnMap(latitude, longitude, name, address, scale) {
  return new Promise((resolve, reject) => {
    wx.openLocation({
      latitude: Number(latitude),
      longitude: Number(longitude),
      name: name || "位置",
      address: address || "",
      scale: scale || 16,
      success: () => resolve(true),
      fail: (err) => reject(new Error("打开地图失败: " + (err.errMsg || "未知错误"))),
    });
  });
}

// 调起原生 App 导航的便捷方法
function navigateViaMap(latitude, longitude, name, address) {
  return openLocationOnMap(latitude, longitude, name, address, 18);
}

// ===================== 距离计算 =====================

// Haversine 公式,输入 gcj02 坐标,返回米
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 友好距离显示:"800m" / "12.5km"
function formatDistance(meters) {
  const m = Number(meters) || 0;
  if (m < 1000) return Math.max(1, Math.round(m)) + "m";
  return (m / 1000).toFixed(1) + "km";
}

// ===================== POI 搜索 =====================

// 微信小程序没有"原生关键字搜索 API",改走云函数 baiduMap.placeSearch
// 修复:之前 name: "txMap" 拼错/云函数不存在,现在统一走 baiduMap
function searchPoi(keyword, region, latitude, longitude) {
  if (!keyword) return Promise.resolve({ list: [], total: 0 });
  if (cloudAvailable) {
    return wx.cloud.callFunction({
      name: "baiduMap",
      data: {
        type: "placeSearch",
        data: { keyword, region: region || "", latitude, longitude },
      },
    }).then((res) => {
      // baiduMap.placeSearch 直接返回 { code:0, data: [...], total: N }
      if (res && res.result && res.result.code === 0) {
        return { list: res.result.data || [], total: res.result.total || 0 };
      }
      throw new Error("POI 搜索失败");
    }).catch(() => ({ list: [], total: 0, fallback: true }));
  }
  return Promise.resolve({ list: [], total: 0, fallback: true });
}

// ===================== 路线规划 =====================

// 微信小程序没有"原生路线规划 API",
// 我们直接调起用户手机原生地图 App,让用户自主选择导航方式
// 这是用户期望的:"多余的地图改为让用户自行跳转到手机 APP 的地图软件"
function planRoute(_origin, destination, _mode) {
  return openLocationOnMap(
    destination.latitude,
    destination.longitude,
    destination.name || "目的地",
    destination.address || "",
    16
  );
}

// 计算预估行程(用 Haversine 直线距离 + 平均车速 30km/h)
function estimateTrip(distanceMeters, mode) {
  const km = distanceMeters / 1000;
  // 不同模式下的平均车速(km/h)
  const speedMap = { fast: 30, comfort: 30, business: 28, luxe: 30 };
  const speed = speedMap[mode] || 30;
  const minutes = Math.max(5, Math.ceil((km / speed) * 60));
  return {
    distance: km,
    distanceText: formatDistance(distanceMeters),
    duration: minutes,
  };
}

module.exports = {
  getCurrentLocation,
  reverseGeocode,
  chooseLocation,
  openLocationOnMap,
  navigateViaMap,
  distanceMeters,
  formatDistance,
  searchPoi,
  planRoute,
  estimateTrip,
};
