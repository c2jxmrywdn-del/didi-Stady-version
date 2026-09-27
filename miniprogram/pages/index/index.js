// pages/index/index.js — 腾讯地图原生版
// 使用微信小程序原生 API(基于腾讯地图底座) + utils/txMap.js
const app = getApp();
const txMap = require('../../utils/txMap');
const messageStore = require('../../utils/messageStore');
const userStats = require('../../utils/userStats');
const cloud = require('../../utils/cloud');

Page({
  data: {
    latitude: 39.908823,
    longitude: 116.397470,
    markers: [],
    polyline: [],
    locationName: "正在定位...",
    showTypePanel: false,
    currentType: "fast",
    carTypes: [
      { key: "fast", name: "快车", desc: "经济实惠", price: "1.8", active: true },
      { key: "comfort", name: "舒适型", desc: "舒适宽敞", price: "2.2", active: false },
      { key: "business", name: "商务车", desc: "商务出行", price: "3.5", active: false },
      { key: "luxe", name: "专车", desc: "尊贵体验", price: "4.0", active: false },
    ],
    startAddress: null,
    endAddress: null,
    nearbyDrivers: [],
    showLocationTip: false,
    locationAuth: false,
    estimatePrice: "--",
    estimateTime: "--",
    currentCarName: "快车",
    // 路线预估(米 / 分钟),从原生 API 算
    distanceMeters: 0,
    // 云开发环境提示(cloudTipModal 组件)
    showCloudTip: false,
  },

  onLoad() {
    this.initLocation();
    // 关键修复:onLoad 触发一次 checkCurrentOrder(只在冷启动/首次进入时)
    // 用户切走 tab 再回来,不会重复跳转(因为 onShow 不再调)
    this.checkCurrentOrder();
    // 首次进入提示:云开发环境未配置时显示
    this.maybeShowCloudTip();
  },

  // 检测云开发环境是否配置(用 cloudTipModal 组件提示)
  maybeShowCloudTip() {
    try {
      const envList = require("../../envList");
      const hasEnv = Array.isArray(envList.envList) && envList.envList.length > 0
        && envList.envList[0].env;
      const tipShown = wx.getStorageSync("cloudTipShown");
      if (!hasEnv && !tipShown) {
        // 延迟 600ms,避免阻塞首屏
        // 关键:try/catch 包裹,防止页面已 detach 时 setData 抛错导致 Error: timeout
        this._cloudTipTimer = setTimeout(() => {
          this._cloudTipTimer = null;
          try {
            this.setData({ showCloudTip: true });
          } catch (e) { /* 页面已卸载,静默 */ }
          try {
            wx.setStorageSync("cloudTipShown", true);
          } catch (e) { /* noop */ }
        }, 600);
      }
    } catch (e) {}
  },

  // 顶部消息条(全局 t-message)
  showMessage(theme, content) {
    if (this.tMessage) {
      this.tMessage.show({ theme, content, duration: 2400 });
    } else {
      // 兜底:用原生 toast
      wx.showToast({ title: content, icon: theme === "error" ? "error" : "none" });
    }
  },

  // 对话框(全局 t-dialog)
  showDialog(opts) {
    if (this.tDialog) {
      this.tDialog.show(opts);
    }
  },

  onReady() {
    // 获取全局 t-message / t-dialog 实例
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  onShareAppMessage() {
    return {
      title: "滴滴学习版 - 一键叫车，出行无忧",
      path: "/pages/index/index",
    };
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0,
        unreadCount: app.globalData.unreadCount || 0,
      });
    }
    // 关键修复:不在 onShow 调 checkCurrentOrder,
    // 否则用户切到其他 tab 再切回首页时,会被强制跳转到 riding/waiting,
    // 造成"切哪都被踢回"的死循环
    // 改为:只在 onLoad 触发一次(冷启动/主动进入时)
  },

  onUnload() {
    // 关键:页面卸载时清理 timer,避免 Error: timeout
    if (this._cloudTipTimer) {
      clearTimeout(this._cloudTipTimer);
      this._cloudTipTimer = null;
    }
  },

  // 初始化定位(微信原生 wx.getLocation,腾讯地图底座)
  initLocation() {
    txMap.getCurrentLocation().then((loc) => {
      this.setData({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationAuth: true,
      });
      app.globalData.location = loc;
      this.reverseGeocode(loc.latitude, loc.longitude);
      this.generateNearbyDrivers(loc.latitude, loc.longitude);
    }).catch(() => {
      this.setData({ showLocationTip: true });
      wx.showModal({
        title: "位置授权",
        content: "需要获取您的位置信息以提供叫车服务",
        confirmText: "去设置",
        success: (res) => {
          if (res.confirm) wx.openSetting();
        },
      });
    });
  },

  // 逆地址解析(通过云函数调腾讯 WebService)
  reverseGeocode(latitude, longitude) {
    txMap.reverseGeocode(latitude, longitude).then((data) => {
      // 只显示简洁位置名(不再带经纬度),实时定位由 map show-location 维持
      const rawName = data.formattedAddress || data.address ||
        (data.street ? data.street + (data.streetNumber || "") : "");
      const addressName = rawName && !data.fallback
        ? rawName.replace(/\s*\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*\)\s*$/, "")
        : "";
      this.setData({
        locationName: addressName || "当前位置",
        startAddress: {
          name: addressName || "当前位置",
          address: data.address || "",
          latitude,
          longitude,
        },
      });
    }).catch(() => {
      this.setData({
        locationName: "当前位置",
        startAddress: { name: "当前位置", latitude, longitude },
      });
    });
  },

  generateNearbyDrivers(latitude, longitude) {
    const drivers = [];
    for (let i = 0; i < 6; i++) {
      const lat = latitude + (Math.random() - 0.5) * 0.02;
      const lng = longitude + (Math.random() - 0.5) * 0.02;
      drivers.push({
        id: i,
        latitude: lat,
        longitude: lng,
        width: 24,
        height: 24,
        callout: {
          content: "●",
          fontSize: 12,
          borderRadius: 10,
          bgColor: "#ffffff",
          color: "#111",
          padding: 4,
          display: "ALWAYS",
        },
      });
    }
    this.setData({ nearbyDrivers: drivers, markers: drivers });
  },

  // 选点(微信原生 chooseLocation,自带腾讯地图选点器)
  onChooseStart() {
    txMap.chooseLocation().then((res) => {
      this.setData({
        startAddress: res,
        latitude: res.latitude,
        longitude: res.longitude,
      });
      this.calcEstimate();
    }).catch(() => {});
  },

  onChooseEnd() {
    txMap.chooseLocation().then((res) => {
      this.setData({ endAddress: res });
      this.calcEstimate();
    }).catch(() => {});
  },

  // 计算预估(纯前端 Haversine 距离 + 平均车速,不依赖第三方 API)
  calcEstimate() {
    const { startAddress, endAddress, carTypes, currentType } = this.data;
    if (!startAddress || !endAddress) return;

    this.setData({ estimatePrice: "计算中...", estimateTime: "--" });

    // 距离 + 时长(纯前端计算)
    const meters = txMap.distanceMeters(
      startAddress.latitude, startAddress.longitude,
      endAddress.latitude, endAddress.longitude
    );
    const est = txMap.estimateTrip(meters, currentType);
    const selectedCar = carTypes.find((c) => c.key === currentType);
    const price = Math.max(8, (est.distance * parseFloat(selectedCar.price)).toFixed(1));

    this.setData({
      distanceMeters: meters,
      estimatePrice: price,
      estimateTime: est.duration,
    });
  },

  onTypeSelect(e) {
    const key = e.currentTarget.dataset.key;
    const carTypes = this.data.carTypes.map((item) => ({ ...item, active: item.key === key }));
    const selectedCar = carTypes.find((c) => c.key === key);
    this.setData({ carTypes, currentType: key, currentCarName: selectedCar.name });
    this.calcEstimate();
  },

  onTogglePanel() {
    this.setData({ showTypePanel: !this.data.showTypePanel });
  },

  // 修复:用户自行发起的订单无法归档
  // 根因:onCallCar 没有调 userStats.createOrder / cloud.createOrder,导致 order 没有 _id
  // 后续 order-detail.afterPaySuccess 的 if (order._id) 守卫会让 updateOrder 跳过,
  // 虽 recordCompletedOrder 仍跑了统计,但 trip/profile 列表里没这条订单
  // 解法:这里先调 createOrder(本地+云端并行)拿到 _id,再透传给 waiting → riding → order-detail
  onCallCar() {
    const { startAddress, endAddress, currentType, carTypes, estimatePrice, estimateTime } = this.data;
    if (!startAddress) {
      wx.showToast({ title: "请选择出发地", icon: "none" });
      return;
    }
    if (!endAddress) {
      wx.showToast({ title: "请选择目的地", icon: "none" });
      return;
    }

    const selectedCar = carTypes.find((c) => c.key === currentType);
    const orderInfo = {
      startAddress,
      endAddress,
      carType: currentType,
      carName: selectedCar.name,
      estimatePrice,
      estimateTime,
      createTime: new Date().getTime(),
    };

    // 1) 本地先创建订单,拿到 _id(即时可见,trip/profile 列表立刻刷新)
    const localOrder = userStats.createOrder(orderInfo);
    orderInfo._id = localOrder._id;

    // 2) 并行:云端创建订单 + 真实路线规划
    //    关键:把云端 _id 同步回本地,保证"本地 _id == 云端 _id",
    //    trip.js / profile.js 按 _id 合并去重才能真正命中
    const cloudOrderPromise = cloud.callCloud("createOrder", {
      startAddress: orderInfo.startAddress,
      endAddress: orderInfo.endAddress,
      carType: orderInfo.carType,
      carName: orderInfo.carName,
      estimatePrice: orderInfo.estimatePrice,
      estimateTime: orderInfo.estimateTime,
    }).then((res) => {
      if (res && res.data && res.data.orderId) {
        const cloudId = res.data.orderId;
        // 用云端 _id 覆盖本地 _id(以云端为权威)
        if (cloudId !== orderInfo._id) {
          userStats.updateOrder(orderInfo._id, { _id: cloudId });
          orderInfo._id = cloudId;
        }
        orderInfo.cloudOrderId = cloudId;
      }
    }).catch((err) => console.warn("[index] 云端创建订单失败,继续本地流程", err));

    const routePromise = cloud.callCloud("directionDriving", {
      originLat: startAddress.latitude,
      originLng: startAddress.longitude,
      destLat: endAddress.latitude,
      destLng: endAddress.longitude,
    }, { ttl: 300000 }) // 5 分钟缓存,同一对起终点只查一次
      .then((res) => {
        if (res && res.data && Array.isArray(res.data.routePoints) && res.data.routePoints.length > 1) {
          orderInfo.routePoints = res.data.routePoints;
          // 顺便用真实距离更新计费
          if (res.data.distance) {
            const realKm = parseFloat(res.data.distance);
            const est = txMap.estimateTrip(realKm * 1000, currentType);
            const price = Math.max(8, (realKm * parseFloat(selectedCar.price)).toFixed(1));
            orderInfo.estimatePrice = price;
            orderInfo.estimateTime = est.duration;
            orderInfo.realDistanceKm = realKm;
          }
        }
      }).catch((err) => console.warn("[index] 路线规划失败,降级为直线", err));

    // 修复:用 try/catch 包裹,即使 Promise.all reject 也能正常进入等待页
    Promise.all([cloudOrderPromise, routePromise])
      .catch((err) => {
        console.warn("[index] onCallCar Promise.all 兜底:", err);
        return null; // 降级:继续走流程
      })
      .finally(() => {
        try {
          messageStore.push({
            type: messageStore.TYPE.ORDER,
            title: "正在为您匹配司机",
            content: `${startAddress.name} → ${endAddress.name}，已为您呼叫${selectedCar.name}。`,
            action: { type: "navigate", url: "/pages/trip/trip", label: "查看行程" },
            highlight: true,
          });
        } catch (e) {
          console.warn("[index] messageStore.push 失败", e);
        }

        wx.navigateTo({
          url: `/pages/waiting/waiting?orderInfo=${encodeURIComponent(JSON.stringify(orderInfo))}`,
        });
      });
  },

  // 回到我的位置
  onMoveToLocation() {
    this.mapCtx = wx.createMapContext("map");
    this.mapCtx.moveToLocation();
  },

  // 快捷入口(回家 / 公司 / 常去 / 收藏)
  // - 回家、公司:从收藏地址中按 tag 选一个,直接作为目的地
  // - 常去、收藏:跳转到收藏地址列表页
  onQuickTap(e) {
    const tag = e.currentTarget.dataset.tag;
    const addresses = this.getFavAddresses();
    let pick = null;

    if (tag === "home") {
      pick = addresses.find((a) => a.tag === "home") || null;
      if (!pick) {
        wx.showToast({ title: "请先在收藏中设置家", icon: "none" });
        this.openFavList();
        return;
      }
    } else if (tag === "company") {
      pick = addresses.find((a) => a.tag === "company") || null;
      if (!pick) {
        wx.showToast({ title: "请先在收藏中设置公司", icon: "none" });
        this.openFavList();
        return;
      }
    } else {
      // 常去 / 收藏:进入列表,让用户选
      this.openFavList();
      return;
    }

    this.applyFavAsEnd(pick);
  },

  getFavAddresses() {
    let list = wx.getStorageSync("favAddresses");
    if (!list || !list.length) {
      list = [
        { id: 1, name: "家", address: "朝阳区建国路88号 SOHO现代城", distance: "1.2km", tag: "home", using: true, latitude: 39.908823, longitude: 116.397470 },
        { id: 2, name: "公司", address: "海淀区中关村软件园二期 9号楼", distance: "8.5km", tag: "company", using: false, latitude: 40.056878, longitude: 116.308150 },
        { id: 3, name: "望京 SOHO", address: "朝阳区望京街10号", distance: "5.3km", tag: "favorite", using: false, latitude: 39.996838, longitude: 116.475470 },
        { id: 4, name: "首都机场 T3", address: "顺义区首都机场路", distance: "28.6km", tag: "favorite", using: false, latitude: 40.080111, longitude: 116.584556 },
      ];
      wx.setStorageSync("favAddresses", list);
    }
    return list;
  },

  applyFavAsEnd(pick) {
    const endAddress = {
      name: pick.name,
      address: pick.address || "",
      latitude: pick.latitude,
      longitude: pick.longitude,
    };
    this.setData({ endAddress });
    this.calcEstimate();
    wx.showToast({
      title: `目的地: ${pick.name}`,
      icon: "success",
      duration: 1200,
    });
  },

  openFavList() {
    wx.navigateTo({
      url: "/pages/fav-addresses/fav-addresses",
    });
  },

  // ============ 让用户自行跳转到手机原生地图 App 导航 ============
  // 不内置路线规划/导航 UI,而是调起用户手机上已安装的腾讯/百度/高德地图
  onOpenNaviApp() {
    const { endAddress } = this.data;
    if (!endAddress) {
      wx.showToast({ title: "请先选择目的地", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: ["腾讯地图导航", "查看位置卡", "复制坐标"],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 唤起手机原生地图 App(腾讯/百度/高德)进行导航
          // 微信小程序没有直接跳 App scheme 的能力,统一通过 wx.openLocation 让用户选
          txMap.navigateViaMap(
            endAddress.latitude, endAddress.longitude,
            endAddress.name, endAddress.address
          ).catch(() => {
            wx.showModal({
              title: "选择导航方式",
              content: `请选择您要使用的地图 App(需已安装):\n• 腾讯地图\n• 高德地图\n• 百度地图\n\n坐标: ${endAddress.latitude.toFixed(5)}, ${endAddress.longitude.toFixed(5)}`,
              confirmText: "我知道了",
              showCancel: false,
            });
          });
        } else if (res.tapIndex === 1) {
          // 打开微信内置位置卡(可一键导航到手机地图)
          txMap.openLocationOnMap(
            endAddress.latitude, endAddress.longitude,
            endAddress.name, endAddress.address
          );
        } else if (res.tapIndex === 2) {
          // 复制坐标
          wx.setClipboardData({
            data: `${endAddress.latitude.toFixed(6)},${endAddress.longitude.toFixed(6)}`,
            success: () => wx.showToast({ title: "坐标已复制", icon: "success" }),
          });
        }
      },
    });
  },

  checkCurrentOrder() {
    // 关键修复:不再强制跳转到 riding/waiting,避免死循环
    // 1) 用户主动从订单详情/我的订单触发 → 走 globalData.pendingResumeOrder 标志直接跳
    // 2) 冷启动或从 onLoad → 用浮窗提示,让用户自己点"继续"才跳
    const explicit = app.globalData.pendingResumeOrder;
    if (explicit && (explicit.status === "waiting" || explicit.status === "riding")) {
      app.globalData.pendingResumeOrder = null;
      const target = explicit.status === "riding" ? "riding" : "waiting";
      const url = target === "riding"
        ? `/pages/riding/riding?orderId=${explicit._id}`
        : `/pages/waiting/waiting?orderId=${explicit._id}`;
      wx.redirectTo({ url });
      return;
    }

    // 冷启动:从本地 userStats 找 waiting/riding 最新一条,只给"浮窗提示",不强制跳
    const all = userStats.getOrders();
    const ongoing = all
      .filter((o) => o.status === "waiting" || o.status === "riding")
      .sort((a, b) => (b.createTime || 0) - (a.createTime || 0))[0];
    if (ongoing) {
      // 恢复 globalData(后续 riding/waiting 可用)
      app.globalData.currentOrder = ongoing;
      // 浮窗提示,不主动跳转(用户切到别的 tab 不再被踢回)
      this._showOngoingHint(ongoing);
    }
  },

  // 显示"有未完成行程"浮窗提示
  _showOngoingHint(ongoing) {
    if (this._ongoingHintShown) return; // 同一个 onLoad 只显示一次
    this._ongoingHintShown = true;
    const isRiding = ongoing.status === "riding";
    const title = isRiding ? "您有进行中的行程" : "您有未完成的订单";
    const content = isRiding
      ? `司机 ${ongoing.driverInfo?.name || ""} 正在送您前往目的地。\n点"继续行程"可回到实时地图,点"暂不"可继续浏览其他页面。`
      : `正在为您匹配/等待司机接驾。\n点"继续等待"可查看进度,点"暂不"可继续浏览其他页面。`;

    // 延后到当前事件循环结束后,避免阻塞 onLoad
    setTimeout(() => {
      wx.showModal({
        title,
        content,
        confirmText: "继续行程",
        cancelText: "暂不",
        confirmColor: "#FF7B00",
        success: (res) => {
          if (res.confirm) {
            app.globalData.pendingResumeOrder = ongoing;
            this.checkCurrentOrder();
          }
        },
      });
    }, 800);
  },
});
