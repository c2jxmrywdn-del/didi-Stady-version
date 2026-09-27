// pages/trip/trip.js — 我的订单(全部 / 待支付 / 进行中 / 已完成 / 已取消)
// 数据源:utils/orderStore.js(单一真相,本地+云端合并 + 跨页面实时同步)
// 性能优化:订单列表走 orderStore.load(5s 内存缓存),避免每次 onShow 都打云
const app = getApp();
const userStats = require("../../utils/userStats");
const messageStore = require("../../utils/messageStore");
const orderStore = require("../../utils/orderStore");

// Tab 索引与对应过滤规则
const TAB_FILTER = {
  0: null,                // 全部
  1: "unpaid",            // 待支付
  2: "ongoing",           // 进行中(等待/行程)
  3: "completed",         // 已完成
  4: "cancelled",         // 已取消
  5: "uncomment",         // 待评价
  6: "refund",            // 退款/售后
};

const STATUS_TEXT = {
  waiting: "等待中",
  riding: "行程中",
  completed: "已完成",
  cancelled: "已取消",
  unpaid: "待支付",
  refund: "退款中",
  refunding: "处理中",
  refunded: "已退款",
};

Page({
  data: {
    tabs: ["全部", "待支付", "进行中", "已完成", "已取消"],
    currentTab: 0,
    currentTabName: "全部",
    orders: [],
    loading: true,
    isEmpty: false,
    totalCount: 0,         // 全部订单数
    counts: {              // 各 tab 角标
      all: 0, unpaid: 0, ongoing: 0, completed: 0, cancelled: 0, uncomment: 0, refund: 0,
    },
  },

  onLoad(options) {
    // 支持从 profile / order-detail 携带 tab 参数
    if (options && options.tab) {
      this.applyTabParam(options.tab);
    }
    // 订阅 orderStore:订单变化时立即刷新(无需等 onShow)
    this._unsubscribeOrder = orderStore.subscribe((event) => {
      this.applyOrders(orderStore.getOrders());
    });
    this.loadOrders();
  },

  onUnload() {
    if (typeof this._unsubscribeOrder === "function") {
      this._unsubscribeOrder();
    }
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1,
        unreadCount: app.globalData.unreadCount || 0,
      });
    }
    // 兼容:switchTab 跳转时 onLoad 不会重新执行,
    // 通过 globalData.pendingTripTab 传递 tab 参数(由 profile / order-detail 设置)
    try {
      const app = getApp();
      if (app && app.globalData && app.globalData.pendingTripTab) {
        this.applyTabParam(app.globalData.pendingTripTab);
        app.globalData.pendingTripTab = null;
      }
    } catch (err) { /* noop */ }
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  onShareAppMessage() {
    return {
      title: "滴滴学习版 - 你的出行好帮手",
      path: "/pages/index/index",
    };
  },

  // 处理从其他页面带过来的 tab 参数
  applyTabParam(tab) {
    const t = String(tab || '').toLowerCase();
    const map = { all: 0, unpaid: 1, ongoing: 2, completed: 3, cancelled: 4 };
    const idx = map[t];
    if (idx !== undefined) {
      this.setData({ currentTab: idx, currentTabName: this.data.tabs[idx] });
    }
  },

  // 加载订单 — 统一从 orderStore 取(本地+云端合并,跨页面实时同步)
  // 单一数据源:trip / profile / order-detail / waiting 全部共享同一份数据
  async loadOrders() {
    this.setData({ loading: true });
    let orders = [];
    try {
      orders = await orderStore.load();
    } catch (err) {
      console.warn("[trip] orderStore.load 失败,使用本地数据", err);
      orders = userStats.getOrders();
    }

    // 若本地和云端都为空,给一点演示数据让用户有内容看
    if (orders.length === 0) {
      orders = this.getDemoOrders();
    }

    this.applyOrders(orders);
  },

  // 把订单应用到 UI(独立方法,可被订阅回调 / onShow / onPullDownRefresh 复用)
  applyOrders(orders) {
    const normalized = orders.map((o) => this.normalizeOrder(o));
    this.setData({ totalCount: normalized.length });
    this.filterOrders(normalized);
  },

  // 演示订单(首启动)
  getDemoOrders() {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return [
      {
        _id: "demo_001",
        startAddress: { name: "中关村软件园" },
        endAddress: { name: "望京 SOHO" },
        carName: "快车",
        carType: "fast",
        status: "completed",
        statusText: "已完成",
        actualPrice: 28.5,
        estimatePrice: 28.5,
        createTime: now - day,
        rideTime: this.fmtTime(now - day),
        distance: 12.5,
        duration: 1800,
        commented: true,
      },
      {
        _id: "demo_002",
        startAddress: { name: "国贸 CBD" },
        endAddress: { name: "三里屯" },
        carName: "舒适型",
        carType: "comfort",
        status: "completed",
        statusText: "已完成",
        actualPrice: 15.8,
        estimatePrice: 15.8,
        createTime: now - 2 * day,
        rideTime: this.fmtTime(now - 2 * day),
        distance: 6.3,
        duration: 1200,
        commented: false, // 待评价
      },
      {
        _id: "demo_003",
        startAddress: { name: "五道口" },
        endAddress: { name: "西单商圈" },
        carName: "快车",
        carType: "fast",
        status: "cancelled",
        statusText: "已取消",
        actualPrice: 0,
        estimatePrice: 32.0,
        createTime: now - 3 * day,
        rideTime: this.fmtTime(now - 3 * day),
        distance: 11.0,
        duration: 0,
      },
      {
        _id: "demo_004",
        startAddress: { name: "首都机场 T3" },
        endAddress: { name: "望京 SOHO" },
        carName: "商务车",
        carType: "business",
        status: "completed",
        statusText: "已完成",
        actualPrice: 156.0,
        estimatePrice: 156.0,
        createTime: now - 5 * day,
        rideTime: this.fmtTime(now - 5 * day),
        distance: 32.5,
        duration: 3600,
        commented: true,
      },
    ];
  },

  fmtTime(ts) {
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  },

  // 把外部/云端订单规整为统一结构
  normalizeOrder(o) {
    const s = o.status || "completed";
    return {
      ...o,
      _id: o._id || o.id || ("o_" + o.createTime),
      startAddress: o.startAddress || { name: "起点" },
      endAddress: o.endAddress || { name: "终点" },
      carName: o.carName || "快车",
      status: s,
      statusText: o.statusText || STATUS_TEXT[s] || s,
      actualPrice: o.actualPrice || o.estimatePrice || 0,
      createTime: o.createTime || Date.now(),
    };
  },

  filterOrders(orders) {
    const { currentTab } = this.data;
    const filter = TAB_FILTER[currentTab];
    let filtered = orders;
    if (filter === "ongoing") {
      filtered = orders.filter((o) => o.status === "waiting" || o.status === "riding");
    } else if (filter === "uncomment") {
      filtered = orders.filter((o) => o.status === "completed" && !o.commented);
    } else if (filter) {
      filtered = orders.filter((o) => o.status === filter);
    }
    // 规整字段(状态文本、显示时间)
    filtered = filtered.map((o) => ({
      ...o,
      statusText: STATUS_TEXT[o.status] || o.statusText || o.status,
      rideTime: o.rideTime || this.fmtTime(o.createTime),
      paidText: o.actualPrice && o.actualPrice > 0 ? ('¥' + Number(o.actualPrice).toFixed(2)) : (o.estimatePrice ? '¥' + Number(o.estimatePrice).toFixed(2) : '待计价'),
    }));
    // 各状态计数
    const counts = {
      all: orders.length,
      unpaid: orders.filter((o) => o.status === "unpaid").length,
      ongoing: orders.filter((o) => o.status === "waiting" || o.status === "riding").length,
      completed: orders.filter((o) => o.status === "completed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      uncomment: orders.filter((o) => o.status === "completed" && !o.commented).length,
      refund: orders.filter((o) => ["refund", "refunding", "refunded"].includes(o.status)).length,
    };
    this.setData({
      orders: filtered,
      isEmpty: filtered.length === 0,
      loading: false,
      counts,
    });
  },

  onTabChange(e) {
    // 兼容:t-tabs 传 { detail: { index } } / 原生 view 传 e.currentTarget.dataset.index
    const index = (e && e.detail && e.detail.index) || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
    if (index == null) return;
    this.setData({ currentTab: index, currentTabName: this.data.tabs[index] });
    this.loadOrders();
  },

  onOrderClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?orderId=${id}` });
  },

  onReOrder(e) {
    wx.navigateTo({ url: "/pages/index/index" });
  },

  // 取消订单
  onCancelOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "取消订单",
      content: "确定要取消这笔订单吗?",
      confirmColor: "#e74c3c",
      success: (res) => {
        if (!res.confirm) return;
        // userStats.updateOrder 内部会通知 orderStore,触发本页订阅回调自动刷新
        userStats.updateOrder(id, { status: "cancelled", statusText: "已取消" });
        // 同步云端(走拆分后的 orderFunctions)
        if (wx.cloud) {
          cloud.callCloud("cancelOrder", { orderId: id }, { retry: false })
            .then(() => cloud.invalidate("getOrders"))
            .catch(() => {});
        }
        messageStore.push({
          type: messageStore.TYPE.ORDER,
          title: "订单已取消",
          content: `订单 ${id} 已取消。`,
        });
        wx.showToast({ title: "已取消", icon: "success" });
      },
    });
  },

  // 支付订单(从 trip 列表直接支付)
  onPayOrder(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find((o) => o._id === id);
    if (!order) return;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${id}&payNow=1`,
    });
  },

  // 去评价
  onComment(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?orderId=${id}&commentNow=1` });
  },

  // 申请退款
  onRefund(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find((o) => o._id === id);
    if (!order) return;
    const amount = order.actualPrice || order.estimatePrice || 0;
    wx.showModal({
      title: "申请退款",
      content: `本次行程费用 ¥${Number(amount).toFixed(2)},将原路返回到您的支付账户。预计 1-3 个工作日到账。`,
      confirmText: "确认申请",
      confirmColor: "#FF7B00",
      success: (res) => {
        if (!res.confirm) return;
        userStats.updateOrder(id, { status: "refund", statusText: "退款中" });
        messageStore.push({
          type: messageStore.TYPE.ORDER,
          title: "退款申请已提交",
          content: `订单 ${id} 退款 ¥${Number(amount).toFixed(2)} 已提交,审核通过后将原路返回。`,
        });
        wx.showToast({ title: "已申请退款", icon: "success" });
        this.loadOrders();
      },
    });
  },

  onShareOrder(e) {
    const order = e.currentTarget.dataset.order;
    wx.showActionSheet({
      itemList: ["分享给微信好友", "复制行程信息"],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showToast({ title: "请点击右上角转发给好友", icon: "none", duration: 2000 });
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({
            data: `【滴滴学习版】${order.startAddress.name} → ${order.endAddress.name} | ${order.carName} | ¥${order.actualPrice || order.estimatePrice || '0.00'}`,
            success: () => wx.showToast({ title: "行程信息已复制", icon: "success" }),
          });
        }
      },
    });
  },
});
