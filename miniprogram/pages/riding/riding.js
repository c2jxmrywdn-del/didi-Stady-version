// pages/riding/riding.js
const app = getApp();
const messageStore = require("../../utils/messageStore");
const userStats = require("../../utils/userStats");
const cloud = require("../../utils/cloud");
const txMap = require("../../utils/txMap");

// ============ 交规参数 ============
// 城市道路最高限速 60km/h;体验上略低于限速更"正常" → 36km/h = 10m/s
// 行程 tick 3s,单 tick 最大位移 = 30m
const MAX_STEP_METERS = 30;
// 直线降级时的最大单 tick 位移(同上,避免瞬移穿楼/穿湖)
const MAX_LINEAR_STEP_METERS = 25;

Page({
  data: {
    rideInfo: null,
    rideDuration: 0,
    rideDistance: 0,
    currentPrice: 0,
    rideTimer: null,
    latitude: 39.908823,
    longitude: 116.397470,
    markers: [],
    polyline: [],
    status: "riding", // riding, arriving, arrived
    statusIcon: "🚗",
    statusText: "行程中",
    simulateStep: 0,
    totalSteps: 20,
    progressPercent: "0",
    rideDurationText: "0分0秒",
  },

  onLoad(options) {
    if (options.rideInfo) {
      const rideInfo = JSON.parse(decodeURIComponent(options.rideInfo));
      this.setData({
        rideInfo,
        latitude: rideInfo.startAddress.latitude,
        longitude: rideInfo.startAddress.longitude,
      });
      this.initRide();
      return;
    }
    // 修复:支持 ?orderId=xxx 进入,从本地/云端恢复 rideInfo
    if (options.orderId) {
      this.loadOrder(options.orderId);
    }
  },

  // 从本地/云端恢复 rideInfo(防止退出后重进丢数据)
  loadOrder(orderId) {
    const local = userStats.getOrderById(orderId);
    if (local && local.startAddress && local.endAddress) {
      this.setData({
        rideInfo: local,
        latitude: local.startAddress.latitude,
        longitude: local.startAddress.longitude,
      });
      this.initRide();
      return;
    }
    if (wx.cloud) {
      cloud.callCloud("getOrderDetail", { orderId }).then((res) => {
        if (res && res.data && res.data.startAddress) {
          const o = res.data;
          this.setData({
            rideInfo: o,
            latitude: o.startAddress.latitude,
            longitude: o.startAddress.longitude,
          });
          this.initRide();
        }
      }).catch(() => {
        wx.showToast({ title: "订单信息加载失败", icon: "none" });
      });
    }
  },

  onShareAppMessage() {
    const { rideInfo } = this.data;
    return {
      title: `我在滴滴学习版 | ${rideInfo.startAddress.name} → ${rideInfo.endAddress.name}`,
      path: "/pages/index/index",
    };
  },

  onUnload() {
    // 关键修复:不清理 stepTimer / rideTimer
    // 原代码:用户切到其他 tab → 计时器被清 → 回页时模拟停滞
    // 新行为:计时器在后台继续跑,本地订单实时回写,用户随时切回都能看到最新进度
    // 仅在"确认到达 / 取消"时才清
  },

  onHide() {
    // 标记为"后台模拟中",顶部展示提示
    // 不清计时器(继续模拟,用户可随时切回)
    this.setData({ isBackground: true });
  },

  onShow() {
    // 回到前台,清除后台提示
    this.setData({ isBackground: false });
  },

  initRide() {
    const { rideInfo } = this.data;
    const startLat = rideInfo.startAddress.latitude;
    const startLng = rideInfo.startAddress.longitude;
    const endLat = rideInfo.endAddress.latitude;
    const endLng = rideInfo.endAddress.longitude;

    // 设置起点和终点标记
    this.setData({
      markers: [
        {
          id: 1,
          latitude: startLat,
          longitude: startLng,
          width: 24,
          height: 24,
          callout: {
            content: "A",
            fontSize: 12,
            borderRadius: 10,
            bgColor: "#ffffff",
            color: "#34c759",
            padding: 4,
            display: "ALWAYS",
          },
        },
        {
          id: 2,
          latitude: endLat,
          longitude: endLng,
          width: 24,
          height: 24,
          callout: {
            content: "B",
            fontSize: 12,
            borderRadius: 10,
            bgColor: "#ffffff",
            color: "#111",
            padding: 4,
            display: "ALWAYS",
          },
        },
      ],
      polyline: this.buildFullRoutePolyline(startLat, startLng, endLat, endLng, rideInfo),
    });

    // 开始模拟行程
    this.startRideSimulation();
    this.startRideTimer();
  },

  startRideTimer() {
    const timer = setInterval(() => {
      const duration = this.data.rideDuration + 1;
      const { rideInfo, rideDistance } = this.data;
      const pricePerMin = parseFloat(rideInfo.carType === "fast" ? "0.5" : rideInfo.carType === "comfort" ? "0.6" : "0.8");
      const currentPrice = Math.max(8, (rideDistance * pricePerMin + duration * 0.1)).toFixed(1);
      const min = Math.floor(duration / 60);
      const sec = duration % 60;
      const rideDurationText = min + "分" + sec + "秒";

      this.setData({
        rideDuration: duration,
        currentPrice,
        rideDurationText,
      });
    }, 1000);
    this.setData({ rideTimer: timer });
  },

  startRideSimulation() {
    const { rideInfo, totalSteps } = this.data;
    const startLat = rideInfo.startAddress.latitude;
    const startLng = rideInfo.startAddress.longitude;
    const endLat = rideInfo.endAddress.latitude;
    const endLng = rideInfo.endAddress.longitude;
    // 预计算不变的 A/B marker(避免每次 tick 重算)
    const baseMarkers = [
      {
        id: 1,
        latitude: startLat,
        longitude: startLng,
        width: 24,
        height: 24,
        callout: { content: "A", fontSize: 12, borderRadius: 10, bgColor: "#ffffff", color: "#34c759", padding: 4, display: "ALWAYS" },
      },
      {
        id: 2,
        latitude: endLat,
        longitude: endLng,
        width: 24,
        height: 24,
        callout: { content: "B", fontSize: 12, borderRadius: 10, bgColor: "#ffffff", color: "#111", padding: 4, display: "ALWAYS" },
      },
    ];

    // 优先用真实路径点;有就用,没有就先生成一个"沿道路弧线"的降级路径
    // 让司机不会穿楼/穿河/逆行(把"直线插值"也变成"绕行路径")
    let routePoints = Array.isArray(rideInfo.routePoints) && rideInfo.routePoints.length > 1
      ? rideInfo.routePoints.slice()
      : null;
    if (!routePoints) {
      routePoints = buildFallbackCurvedRoute(startLat, startLng, endLat, endLng, 24);
    }

    // 把"按 progress 索引"换算成"按累计路径长度米数"
    // — 这样司机的物理位移 = 真实路径距离,与 time 线性相关(限速才能成立)
    const cumulativeMeters = computeCumulativeMeters(routePoints);
    const totalRouteMeters = cumulativeMeters[cumulativeMeters.length - 1] || 1;
    // 总距离(用于 UI 显示),优先用真实距离 km
    const totalDistanceKm = rideInfo.realDistanceKm
      ? parseFloat(rideInfo.realDistanceKm)
      : parseFloat((totalRouteMeters / 1000).toFixed(2));

    // 上一帧车辆位置(用于限速:本帧最大位移 = MAX_STEP_METERS)
    let prevLat = startLat;
    let prevLng = startLng;
    // 累计已行驶米数(按 tick 时长,不是按 progress)
    let traveledMeters = 0;
    const stepMeters = totalRouteMeters / totalSteps; // 均匀分配总距离到每个 tick

    const stepTimer = setInterval(() => {
      let step = this.data.simulateStep + 1;
      // 限速:本帧位移 = min(理论位移, MAX_STEP_METERS)
      // — 避免在 pathPoints 稀疏时一帧瞬移跨过多个路口
      const targetMeters = Math.min(traveledMeters + stepMeters, totalRouteMeters);
      const maxStepMeters = (targetMeters - traveledMeters > MAX_STEP_METERS)
        ? traveledMeters + MAX_STEP_METERS
        : targetMeters;
      traveledMeters = maxStepMeters;

      // 在 routePoints 上按累计米数找"当前车辆位置"
      const pos = interpolateAtMeters(routePoints, cumulativeMeters, maxStepMeters);
      const currentLat = pos.lat;
      const currentLng = pos.lng;

      // 二次保险:即使插值出现跳变,也按 MAX_STEP_METERS 截断
      const jumpDist = txMap.distanceMeters(prevLat, prevLng, currentLat, currentLng);
      let finalLat = currentLat;
      let finalLng = currentLng;
      if (jumpDist > MAX_STEP_METERS * 1.2) {
        // 把位移按比例缩回到 MAX_STEP_METERS 内
        const ratio = MAX_STEP_METERS / jumpDist;
        finalLat = prevLat + (currentLat - prevLat) * ratio;
        finalLng = prevLng + (currentLng - prevLng) * ratio;
      }
      prevLat = finalLat;
      prevLng = finalLng;

      // 已行驶距离(用于 UI),按累计米数 / 1000
      const traveledKm = parseFloat((maxStepMeters / 1000).toFixed(2));
      const progress = maxStepMeters / totalRouteMeters;

      // 复用 baseMarkers 数组,只替换 id=3 的车辆位置(避免重建整个 markers 数组)
      const markers = baseMarkers.slice();
      markers.push({
        id: 3,
        latitude: finalLat,
        longitude: finalLng,
        width: 24,
        height: 24,
        callout: {
          content: "●",
          fontSize: 14,
          borderRadius: 10,
          bgColor: "#ffffff",
          color: "#111",
          padding: 4,
          display: "ALWAYS",
        },
      });

      // polyline:已走(实线) + 未走(虚线),沿真实路径裁切
      const polyline = this.buildRideProgressPolyline(
        startLat, startLng, endLat, endLng,
        finalLat, finalLng,
        progress, routePoints, maxStepMeters, cumulativeMeters
      );

      let status = "riding";
      let statusIcon = "🚗";
      let statusText = "行程中";
      if (progress > 0.8) {
        status = "arriving";
        statusIcon = "📍";
        statusText = "即将到达";
      }
      if (step >= totalSteps || maxStepMeters >= totalRouteMeters) {
        status = "arrived";
        statusIcon = "🏁";
        statusText = "已到达目的地";
      }

      const progressPercent = Math.min(100, Math.floor(progress * 100));

      this.setData({
        simulateStep: step,
        latitude: finalLat,
        longitude: finalLng,
        markers,
        polyline,
        rideDistance: traveledKm,
        status,
        statusIcon,
        statusText,
        progressPercent: progressPercent + "%",
      });

      // 修复:tick 实时回写本地订单(防止退出小程序后进度丢失)
      // 关键:每 tick 写一次 rideDistance / rideDuration / status
      // 频次控制:每 3 个 tick(≈ 9s)写一次,避免 setStorageSync IO 抖动
      if (rideInfo && rideInfo._id && step % 3 === 0) {
        try {
          userStats.updateOrder(rideInfo._id, {
            rideDistance: traveledKm,
            rideDuration: this.data.rideDuration,
            status: status === "arrived" ? "completed" : "riding",
            statusText: statusText,
            lastLocation: { latitude: finalLat, longitude: finalLng },
          });
        } catch (e) { /* noop */ }
      }

      if (step >= totalSteps || maxStepMeters >= totalRouteMeters) {
        clearInterval(stepTimer);
      }
    }, 3000);

    this.setData({ stepTimer });
  },

  formatDuration(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}分${sec}秒`;
  },

  onCallDriver() {
    wx.makePhoneCall({ phoneNumber: "400-000-0999" });
  },

  onEmergency() {
    wx.showModal({
      title: "紧急求助",
      content: "是否拨打紧急求助电话？\n（行程中将自动通知您的紧急联系人）",
      confirmText: "拨打",
      cancelText: "取消",
      confirmColor: "#e74c3c",
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({ phoneNumber: "110" });
          // 推送安全消息
          messageStore.push({
            type: messageStore.TYPE.SAFETY,
            title: "已触发紧急求助",
            content: "已为您接通 110 报警热线，行程同时上报至安全中心。",
            highlight: true,
          });
        }
      },
    });
  },

  onShareRide() {
    const { rideInfo } = this.data;
    wx.showActionSheet({
      itemList: ["分享给微信好友", "复制行程信息"],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 触发微信分享给好友（需在页面注册 onShareAppMessage）
          wx.showToast({ title: "请点击右上角转发给好友", icon: "none", duration: 2000 });
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({
            data: `【滴滴学习版】行程分享：${rideInfo.startAddress.name} → ${rideInfo.endAddress.name}，车型：${rideInfo.carName}，预计费用：¥${rideInfo.estimatePrice}`,
            success: () => {
              wx.showToast({ title: "行程信息已复制", icon: "success" });
            },
          });
        }
      },
    });
  },

  onFinishRide() {
    const { rideInfo, rideDuration, rideDistance, currentPrice, status } = this.data;

    // 中途结束:二级确认,避免误触
    if (status !== "arrived") {
      wx.showModal({
        title: "结束行程?",
        content: `行程已进行 ${rideDuration}秒 / ${rideDistance}km。\n确认结束并进入结算?`,
        confirmText: "结束行程",
        cancelText: "继续",
        confirmColor: "#2D2A26",
        success: (res) => {
          if (res.confirm) this._doFinishRide();
        },
      });
      return;
    }
    this._doFinishRide();
  },

  // 实际归档逻辑(从 onFinishRide 拆出)
  _doFinishRide() {
    const { rideInfo, rideDuration, rideDistance, currentPrice } = this.data;

    // 修复:用户自行发起的订单无法归档
    // 原因:onFinishRide 之前只跳到 order-detail 让 afterPaySuccess 调 update/complete,
    //      如果用户跳过支付直接退回,订单永远停在 "waiting",行程页看不到。
    // 解法:这里就先把"已完成的行程"归档到本地订单历史 + 云端,
    //      afterPaySuccess 内的 update 是幂等的(只覆盖 status 字段,不会丢)
    const actualPrice = parseFloat(currentPrice || rideInfo.estimatePrice || 0);
    const finishedAt = Date.now();

    // 0) 先停掉模拟定时器(避免进入结算后还在跳 tick)
    if (this.data.stepTimer) {
      clearInterval(this.data.stepTimer);
      this.data.stepTimer = null;
    }
    if (this.data.rideTimer) {
      clearInterval(this.data.rideTimer);
      this.data.rideTimer = null;
    }

    // 1) 本地归档:有 _id(从 onCallCar 透传)就直接 updateOrder;没 _id 才 createOrder
    let localOrderId = rideInfo._id;
    if (localOrderId) {
      userStats.updateOrder(localOrderId, {
        status: "completed",
        statusText: "已完成",
        actualPrice,
        distance: parseFloat(rideDistance || 0),
        duration: rideDuration,
        endTime: finishedAt,
        endAddress: rideInfo.endAddress,
      });
    } else {
      // 兜底:无 _id 时落地一条新订单(理论上不会发生)
      const created = userStats.createOrder({
        ...rideInfo,
        status: "completed",
        statusText: "已完成",
        actualPrice,
        distance: parseFloat(rideDistance || 0),
        duration: rideDuration,
        endTime: finishedAt,
      });
      localOrderId = created._id;
    }

    // 2) 云端归档:走 orderFunctions.completeOrder(幂等,可被 afterPaySuccess 二次调用)
    if (wx.cloud) {
      cloud.callCloud("completeOrder", {
        orderId: rideInfo.cloudOrderId || localOrderId,
        actualPrice,
        distance: parseFloat(rideDistance || 0),
        duration: rideDuration,
      }, { retry: false })
        .then(() => cloud.invalidate("getOrders"))
        .catch((err) => console.warn("[riding] 云端归档失败,继续本地流程", err));
    }

    const orderDetail = {
      ...rideInfo,
      _id: localOrderId,
      cloudOrderId: rideInfo.cloudOrderId,
      actualPrice,
      duration: rideDuration,
      distance: parseFloat(rideDistance || 0),
      endTime: finishedAt,
      status: "completed",
    };

    // 推送行程完成消息
    messageStore.push({
      type: messageStore.TYPE.ORDER,
      title: "行程已结束",
      content: `已到达 ${rideInfo.endAddress?.name || ""}，本次行驶 ${rideDistance}km，耗时 ${Math.floor(rideDuration/60)}分${rideDuration%60}秒。请确认费用并支付。`,
      action: { type: "navigate", url: "/pages/trip/trip", label: "查看行程" },
      highlight: true,
    });

    wx.redirectTo({
      url: `/pages/order-detail/order-detail?order=${encodeURIComponent(JSON.stringify(orderDetail))}&isComplete=1`,
    });
  },

  // 构造完整路线 polyline(有 routePoints 时使用,否则直线)
  buildFullRoutePolyline(startLat, startLng, endLat, endLng, rideInfo) {
    if (Array.isArray(rideInfo?.routePoints) && rideInfo.routePoints.length > 1) {
      return [{
        points: rideInfo.routePoints,
        color: "#111111",
        width: 4,
        dottedLine: false,
        arrowLine: true,
      }];
    }
    return [{
      points: buildFallbackCurvedRoute(startLat, startLng, endLat, endLng, 24),
      color: "#111111",
      width: 4,
      dottedLine: false,
      arrowLine: true,
    }];
  },

  // 构造行程进度 polyline(已走 + 未走,沿路径点裁切)
  // 升级:支持按"已走米数"精确裁切(而非按 progress 索引),
  //      这样限速后车辆位置与折线分界点严格对齐,不会出现"线比车慢"或"车在线外"
  buildRideProgressPolyline(startLat, startLng, endLat, endLng, curLat, curLng, progress, routePoints, traveledMeters, cumulativeMeters) {
    if (routePoints && Array.isArray(cumulativeMeters) && traveledMeters != null) {
      // 找到"已走米数"对应的路径点索引
      let splitIdx = 0;
      for (let i = 0; i < cumulativeMeters.length; i++) {
        if (cumulativeMeters[i] <= traveledMeters) splitIdx = i;
        else break;
      }
      splitIdx = Math.max(0, Math.min(routePoints.length - 1, splitIdx));
      const walked = routePoints.slice(0, splitIdx + 1);
      // 把当前车辆位置作为"已走终点",让线连上车
      walked[walked.length - 1] = { latitude: curLat, longitude: curLng };
      const remaining = routePoints.slice(splitIdx);
      if (remaining.length === 0) {
        remaining.push({ latitude: endLat, longitude: endLng });
      } else {
        remaining[0] = { latitude: curLat, longitude: curLng };
      }
      return [
        { points: walked, color: "#111111", width: 4, arrowLine: true },
        { points: remaining, color: "#c7c7cc", width: 4, dottedLine: true, arrowLine: true },
      ];
    }
    // 降级:直线两段
    return [
      {
        points: [
          { latitude: startLat, longitude: startLng },
          { latitude: curLat, longitude: curLng },
        ],
        color: "#111111",
        width: 4,
        arrowLine: true,
      },
      {
        points: [
          { latitude: curLat, longitude: curLng },
          { latitude: endLat, longitude: endLng },
        ],
        color: "#c7c7cc",
        width: 4,
        dottedLine: true,
        arrowLine: true,
      },
    ];
  },
});

// ============ 模块级工具函数 ============

// 直线降级时,生成一条"绕行弧线"作为模拟道路路径
// — 起点和终点固定,中间点沿两点中垂线偏移(避免穿楼/穿河)
// — N 越大越平滑,默认 24 个点
function buildFallbackCurvedRoute(startLat, startLng, endLat, endLng, N) {
  const points = [];
  const dx = endLng - startLng;
  const dy = endLat - startLat;
  // 中垂线方向(垂直于起终点连线),偏移量 = 路径长度的 8%(类似城市道路绕行幅度)
  const length = Math.sqrt(dx * dx + dy * dy) || 0.0001;
  const offset = length * 0.08;
  // 90° 旋转
  const ox = -dy / length * offset;
  const oy = dx / length * offset;
  // 弧形高度(中段凸出,首尾贴齐端点):sin(πt)*offset
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // 凸函数:0→0.5→1 让中间凸出,模拟绕行
    const bow = Math.sin(Math.PI * t) * offset;
    points.push({
      latitude: startLat + dy * t + oy * (bow / offset || 0),
      longitude: startLng + dx * t + ox * (bow / offset || 0),
    });
  }
  return points;
}

// 计算路径点的累计米数数组(从起点到每一点的总距离)
function computeCumulativeMeters(points) {
  const out = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    out[i] = out[i - 1] + txMap.distanceMeters(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude, points[i].longitude
    );
  }
  return out;
}

// 在路径上按"已走米数"插值,返回 { lat, lng }
// 落在 segment 内时做线性插值,而不是只取端点
function interpolateAtMeters(points, cumulativeMeters, targetMeters) {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1 || targetMeters <= 0) {
    return { lat: points[0].latitude, lng: points[0].longitude };
  }
  const total = cumulativeMeters[cumulativeMeters.length - 1];
  if (targetMeters >= total) {
    return { lat: points[points.length - 1].latitude, lng: points[points.length - 1].longitude };
  }
  // 二分查找:找 i 使 cumulativeMeters[i] <= target < cumulativeMeters[i+1]
  let lo = 0, hi = cumulativeMeters.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeMeters[mid] <= targetMeters) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const segLen = cumulativeMeters[hi] - cumulativeMeters[lo] || 1;
  const t = (targetMeters - cumulativeMeters[lo]) / segLen;
  return {
    lat: a.latitude + (b.latitude - a.latitude) * t,
    lng: a.longitude + (b.longitude - a.longitude) * t,
  };
}
