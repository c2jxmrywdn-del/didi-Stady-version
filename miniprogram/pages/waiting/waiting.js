// pages/waiting/waiting.js
const app = getApp();
const messageStore = require("../../utils/messageStore");
const chatStore = require("../../utils/chatStore");
const userStats = require("../../utils/userStats");
const cloud = require("../../utils/cloud");
const txMap = require("../../utils/txMap"); // 性能优化:提到顶部,避免 setInterval 内重复 require

Page({
  data: {
    orderInfo: null,
    orderId: "",
    waitTime: 0,
    waitTimer: null,
    matchStatus: "matching", // matching, matched, arriving
    matchStatusIcon: "🔍",
    matchStatusText: "正在为您匹配司机...",
    driverInfo: null,
    driverLocation: null,
    latitude: 39.908823,
    longitude: 116.397470,
    markers: [],
    polyline: [],
    showCancelModal: false,
    cancelReasons: [
      "不想打了",
      "等太久了",
      "司机让我取消",
      "信息填错了",
      "其他原因",
    ],
    selectedReason: -1,
    showChatPanel: false,
    driverMsg1: "您好，我已到达附近，正在找停车位。",
    driverMsg2: "看到我开的是白色车，看到我挥手即可。",
    sentQuickMsg: "",
  },

  onLoad(options) {
    if (options.orderInfo) {
      const orderInfo = JSON.parse(decodeURIComponent(options.orderInfo));
      this.setData({ orderInfo });
      this.startMatch();
    } else if (options.orderId) {
      this.setData({ orderId: options.orderId });
      this.loadOrder(options.orderId);
    }

    this.startTimer();
  },

  onUnload() {
    if (this.data.waitTimer) {
      clearInterval(this.data.waitTimer);
    }
    if (this.driverMoveTimer) {
      clearInterval(this.driverMoveTimer);
      this.driverMoveTimer = null;
    }
  },

  startTimer() {
    const timer = setInterval(() => {
      this.setData({ waitTime: this.data.waitTime + 1 });
    }, 1000);
    this.setData({ waitTimer: timer });
  },

  startMatch() {
    const { orderInfo } = this.data;
    if (orderInfo && orderInfo.startAddress) {
      this.setData({
        latitude: orderInfo.startAddress.latitude,
        longitude: orderInfo.startAddress.longitude,
      });
    }

    // 司机实时位置更新(模拟),会驱动 polyline 重新计算
    this.driverMoveTimer = null;

    // 模拟匹配司机 - 3秒后匹配成功
    setTimeout(() => {
      this.matchDriver();
    }, 3000);
  },

  // 计算从出发地到司机位置的路线 polyline
  // 修复:用云函数返回的真实路径点(已在 index.onCallCar 调 directionDriving 拿过)
  //      没有真实路径时降级为直线 + sin 抖动(兜底)
  buildRoutePolyline(driverLat, driverLng) {
    const { orderInfo } = this.data;
    if (!orderInfo || !orderInfo.startAddress) return [];
    const startLat = orderInfo.startAddress.latitude;
    const startLng = orderInfo.startAddress.longitude;

    // 优先:用 orderInfo.routePoints 截取到司机位置之前的真实路径段
    if (Array.isArray(orderInfo.routePoints) && orderInfo.routePoints.length > 1) {
      const trimmed = trimRouteTo(orderInfo.routePoints, driverLat, driverLng);
      return [{
        points: trimmed,
        color: "#34c759",
        width: 6,
        dottedLine: false,
        arrowLine: true,
      }];
    }

    // 降级:直线 + sin 抖动
    const points = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const jitter = Math.sin(t * Math.PI) * 0.0008;
      points.push({
        latitude: startLat + (driverLat - startLat) * t + jitter,
        longitude: startLng + (driverLng - startLng) * t,
      });
    }
    return [{
      points,
      color: "#34c759",
      width: 6,
      dottedLine: false,
      arrowLine: true,
    }];
  },

  // 司机朝用户移动(模拟实时定位),沿真实路径点逼近
  startDriverMoving() {
    if (this.driverMoveTimer) {
      clearInterval(this.driverMoveTimer);
    }
    this.driverMoveTimer = setInterval(() => {
      const { orderInfo, driverLocation, matchStatus } = this.data;
      if (!orderInfo || !orderInfo.startAddress || !driverLocation) return;
      if (matchStatus === "arriving") return;

      const startLat = orderInfo.startAddress.latitude;
      const startLng = orderInfo.startAddress.longitude;
      const curLat = driverLocation.latitude;
      const curLng = driverLocation.longitude;

      const dist = txMap.distanceMeters(curLat, curLng, startLat, startLng);
      if (dist < 80) {
        this.setData({ matchStatus: "arriving", matchStatusIcon: "🚗", matchStatusText: "司机已到达" });
        clearInterval(this.driverMoveTimer);
        this.driverMoveTimer = null;
        return;
      }

      // 沿真实路径点前进(有 routePoints 时),否则直线逼近
      const advance = advanceAlongRoute(orderInfo.routePoints, curLat, curLng, 0.12);
      let newLat, newLng;
      if (advance) {
        newLat = advance.lat;
        newLng = advance.lng;
      } else {
        // 降级:直线朝出发地逼近
        const stepT = 0.08;
        newLat = curLat + (startLat - curLat) * stepT;
        newLng = curLng + (startLng - curLng) * stepT;
      }
      const newDriverLocation = { latitude: newLat, longitude: newLng };
      const newPolyline = this.buildRoutePolyline(newLat, newLng);

      const markers = [
        {
          id: 1,
          latitude: newLat,
          longitude: newLng,
          width: 28,
          height: 28,
          callout: {
            content: "🚗",
            fontSize: 16,
            borderRadius: 10,
            bgColor: "#ffffff",
            padding: 4,
            display: "ALWAYS",
          },
        },
        {
          id: 2,
          latitude: startLat,
          longitude: startLng,
          width: 22,
          height: 22,
          callout: {
            content: "起",
            fontSize: 12,
            borderRadius: 10,
            bgColor: "#34c759",
            color: "#fff",
            padding: 3,
            display: "ALWAYS",
          },
        },
      ];

      this.setData({
        driverLocation: newDriverLocation,
        polyline: newPolyline,
        markers,
        matchStatusText: "司机正在赶来",
      });

      // 修复:回写本地订单状态(防止退出后订单详情是空的)
      // 司机接单后状态:waiting → riding,匹配时间、司机信息落地
      if (orderInfo && orderInfo._id) {
        try {
          userStats.updateOrder(orderInfo._id, {
            status: "riding",
            statusText: "行程中",
            driverInfo: this.data.driverInfo,
            matchTime: Date.now(),
          });
        } catch (e) { /* noop */ }
      }
    }, 1500);
  },

  matchDriver() {
    const drivers = [
      { name: "王师傅", car: "京A·88888", carModel: "丰田凯美瑞", rating: 4.9, trips: 5680, phone: "138****8888", avatar: "👨" },
      { name: "李师傅", car: "京B·66666", carModel: "本田雅阁", rating: 4.8, trips: 3240, phone: "139****6666", avatar: "👨‍🦱" },
      { name: "张师傅", car: "京C·99999", carModel: "大众帕萨特", rating: 4.95, trips: 8920, phone: "136****9999", avatar: "🧔" },
    ];
    const driver = drivers[Math.floor(Math.random() * drivers.length)];

    // 模拟司机初始位置
    // 修复:有 routePoints 时,司机位置取路径 65~80% 处的点(已经在路上);
    //      这样司机"按交规"向用户开过来,不会从直线方向出现
    const startLat = this.data.orderInfo?.startAddress?.latitude || this.data.latitude;
    const startLng = this.data.orderInfo?.startAddress?.longitude || this.data.longitude;
    const routePoints = this.data.orderInfo?.routePoints;
    let driverLat, driverLng;
    if (Array.isArray(routePoints) && routePoints.length > 4) {
      const t = 0.65 + Math.random() * 0.15;
      const idx = Math.min(routePoints.length - 1, Math.floor(t * routePoints.length));
      driverLat = routePoints[idx].latitude;
      driverLng = routePoints[idx].longitude;
    } else {
      // 降级:沿随机方向 800m~1.5km
      const distanceKm = 0.8 + Math.random() * 0.7;
      const bearing = Math.random() * Math.PI * 2;
      driverLat = startLat + (Math.cos(bearing) * distanceKm) / 111;
      driverLng = startLng + (Math.sin(bearing) * distanceKm) / 111;
    }

    // 构建初始 polyline(出发地 → 司机位置)和 markers(司机 + 出发地)
    const polyline = this.buildRoutePolyline(driverLat, driverLng);
    const markers = [
      {
        id: 1,
        latitude: driverLat,
        longitude: driverLng,
        width: 28,
        height: 28,
        callout: {
          content: "🚗",
          fontSize: 16,
          borderRadius: 10,
          bgColor: "#ffffff",
          padding: 4,
          display: "ALWAYS",
        },
      },
      {
        id: 2,
        latitude: startLat,
        longitude: startLng,
        width: 22,
        height: 22,
        callout: {
          content: "起",
          fontSize: 12,
          borderRadius: 10,
          bgColor: "#34c759",
          color: "#fff",
          padding: 3,
          display: "ALWAYS",
        },
      },
    ];

    this.setData({
      matchStatus: "matched",
      matchStatusIcon: "✅",
      matchStatusText: "司机已接单，正在赶来",
      driverInfo: driver,
      driverLocation: {
        latitude: driverLat,
        longitude: driverLng,
      },
      polyline,
      markers,
    });

    // 启动司机朝用户移动(模拟实时定位 + 路线规划)
    this.startDriverMoving();

    // 推送司机接单消息
    messageStore.push({
      type: messageStore.TYPE.DRIVER,
      title: `${driver.name}已接单`,
      content: `${driver.carModel} · ${driver.car} | 评分 ${driver.rating}，正赶往您的出发地。`,
      action: { type: "call", phone: "400-000-0999", label: "联系司机" },
      extra: { driverName: driver.name },
    });
  },

  loadOrder(orderId) {
    // 修复:从本地订单历史恢复 orderInfo(防止从 order-detail 跳过来时丢数据)
    const local = userStats.getOrderById(orderId);
    if (local) {
      this.setData({ orderInfo: local });
      this.startMatch();
      return;
    }
    // 兜底:从云端拉(走拆分后的 orderFunctions)
    if (wx.cloud) {
      cloud.callCloud("getOrderDetail", { orderId }).then((res) => {
        if (res && res.data) {
          this.setData({ orderInfo: res.data });
          this.startMatch();
        }
      }).catch(() => this.startMatch());
    } else {
      this.startMatch();
    }
  },

  formatWaitTime() {
    const { waitTime } = this.data;
    const min = Math.floor(waitTime / 60);
    const sec = waitTime % 60;
    return `${min}:${sec < 10 ? "0" + sec : sec}`;
  },

  onCallDriver() {
    if (this.data.driverInfo) {
      wx.makePhoneCall({
        phoneNumber: "400-000-0999",
      });
    }
  },

  onMessageDriver() {
    // 创建/获取与司机的会话，然后跳转到完整聊天页
    if (!this.data.driverInfo || !this.data.orderInfo) {
      this.setData({ showChatPanel: true, sentQuickMsg: "" });
      return;
    }
    const driver = this.data.driverInfo;
    const session = chatStore.getOrCreateDriverSession(
      {
        name: driver.name,
        avatar: driver.avatar,
        car: driver.car,
        carModel: driver.carModel,
      },
      this.data.orderId || this.data.orderInfo.createTime?.toString() || 'temp_order'
    );
    // 更新订单状态为 riding
    session.orderStatus = 'riding';
    wx.setStorageSync('chatSessions', chatStore.listSessions());

    wx.navigateTo({
      url: `/pages/chat/chat?sessionId=${session.id}`,
    });
  },

  closeChatPanel() {
    this.setData({ showChatPanel: false });
  },

  onSendQuick(e) {
    const msg = e.currentTarget.dataset.msg;
    this.setData({ sentQuickMsg: msg });
    // 自动回复（模拟）
    setTimeout(() => {
      this.setData({
        driverMsg2: "好的，已收到，等您过来。",
      });
    }, 1200);
  },

  onShowCancel() {
    this.setData({ showCancelModal: true });
  },

  onHideCancel() {
    this.setData({ showCancelModal: false, selectedReason: -1 });
  },

  onSelectReason(e) {
    this.setData({ selectedReason: e.currentTarget.dataset.index });
  },

  async onConfirmCancel() {
    if (this.data.selectedReason === -1) {
      wx.showToast({ title: "请选择取消原因", icon: "none" });
      return;
    }

    wx.showLoading({ title: "取消中..." });

    const reason = this.data.cancelReasons[this.data.selectedReason];
    const orderInfo = this.data.orderInfo;

    // 模拟取消订单
    setTimeout(() => {
      wx.hideLoading();
      app.globalData.currentOrder = null;
      wx.navigateBack();
      wx.showToast({ title: "已取消订单", icon: "success" });

      // 推送取消通知
      if (orderInfo) {
        messageStore.push({
          type: messageStore.TYPE.ORDER,
          title: "订单已取消",
          content: `${orderInfo.startAddress?.name || ""} → ${orderInfo.endAddress?.name || ""} | 原因：${reason}。可免责任 1 次。`,
          action: { type: "navigate", url: "/pages/trip/trip", label: "查看行程" },
        });
      }
    }, 1000);
  },

  onSimulateRide() {
    // 模拟开始行程
    const { orderInfo, driverInfo } = this.data;
    const rideInfo = {
      ...orderInfo,
      driverInfo,
      startTime: Date.now(),
    };
    wx.redirectTo({
      url: `/pages/riding/riding?rideInfo=${encodeURIComponent(JSON.stringify(rideInfo))}`,
    });
  },
});

// ============ 辅助函数(模块作用域,避免每次 tick 重新创建) ============

// 把路径数组截到最接近 (lat,lng) 的索引处(包含),作为"出发地到当前位置"的路段
function trimRouteTo(routePoints, lat, lng) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return [];
  let bestIdx = 0;
  let bestDist = Infinity;
  // 路径点采样检查(每 3 个点看一次,平衡精度与开销)
  for (let i = 0; i < routePoints.length; i += 1) {
    const p = routePoints[i];
    const d = (p.latitude - lat) * (p.latitude - lat) + (p.longitude - lng) * (p.longitude - lng);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // 把当前司机位置作为终点叠加上去,让司机图标"在线上"
  const out = routePoints.slice(0, bestIdx + 1);
  out.push({ latitude: lat, longitude: lng });
  return out;
}

// 沿路径点向终点前进 ratio 比例(0~1,0.12 ≈ 前进 12% 剩余距离)
function advanceAlongRoute(routePoints, curLat, curLng, ratio) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;
  // 找当前位置在路径上的最近索引
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < routePoints.length; i += 1) {
    const p = routePoints[i];
    const d = (p.latitude - curLat) * (p.latitude - curLat) + (p.longitude - curLng) * (p.longitude - curLng);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  // 目标索引 = 最近点 + 路径上前进 N 个点(按 ratio * 剩余点数)
  const remain = routePoints.length - 1 - bestIdx;
  const step = Math.max(1, Math.floor(remain * ratio));
  const targetIdx = Math.min(routePoints.length - 1, bestIdx + step);
  return {
    lat: routePoints[targetIdx].latitude,
    lng: routePoints[targetIdx].longitude,
  };
}
