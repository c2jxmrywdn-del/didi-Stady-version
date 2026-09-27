// pages/profile/profile.js — 个人中心(完整版)
// 真实数据源:utils/orderStore.js(本地+云端合并,单一真相) + userStats(钱包/积分)
const app = getApp();
const messageStore = require("../../utils/messageStore");
const userStats = require("../../utils/userStats");
const orderStore = require("../../utils/orderStore");

// 会员等级配置(最后一档用 Infinity 防止边界回退到首档)
const LEVELS = [
  { exp: 0, maxExp: 200, name: '青铜会员', shortName: 'V1', bg: 'linear-gradient(135deg, #CD7F32 0%, #A05A2C 100%)' },
  { exp: 200, maxExp: 500, name: '白银会员', shortName: 'V2', bg: 'linear-gradient(135deg, #C0C0C0 0%, #8A8A8A 100%)' },
  { exp: 500, maxExp: 1000, name: '黄金会员', shortName: 'V3', bg: 'linear-gradient(135deg, #FFD700 0%, #DAA520 100%)' },
  { exp: 1000, maxExp: 2000, name: '铂金会员', shortName: 'V4', bg: 'linear-gradient(135deg, #E5E4E2 0%, #BFC1C2 100%)' },
  { exp: 2000, maxExp: 5000, name: '钻石会员', shortName: 'V5', bg: 'linear-gradient(135deg, #B9F2FF 0%, #6EC5E9 100%)' },
  { exp: 5000, maxExp: Infinity, name: '黑金会员', shortName: 'V6', bg: 'linear-gradient(135deg, #2D2A26 0%, #5C554C 100%)' },
];

function calcLevel(points) {
  const safePoints = Number.isFinite(points) && points >= 0 ? points : 0;
  const lvl = LEVELS.find(l => safePoints >= l.exp && safePoints < l.maxExp) || LEVELS[0];
  const range = lvl.maxExp - lvl.exp;
  const percent = !isFinite(range) || range <= 0
    ? 100
    : Math.min(100, Math.floor(((safePoints - lvl.exp) / range) * 100));
  return { ...lvl, percent };
}

function pctClassOf(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  if (p >= 88) return 'bar-pct-100';
  if (p >= 63) return 'bar-pct-75';
  if (p >= 38) return 'bar-pct-50';
  if (p >= 13) return 'bar-pct-25';
  return 'bar-pct-0';
}

// 数字格式化:整数去小数尾
function formatNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 10000) {
    return (v / 10000).toFixed(1) + "w";
  }
  return v.toFixed(1).replace(/\.0$/, "");
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00";
  return v.toFixed(2);
}

Page({
  data: {
    userInfo: null,
    hasLogin: false,
    avatarLetter: 'U',     // 头像回退字母(从 nickName[0] 计算,WXML 不支持 [0] 索引)
    level: null,
    // 钱包资产(读自 userStats)
    balance: "0.00",
    creditLimit: 500,
    creditUsed: 0,
    creditRemain: 500,
    points: 0,
    couponCount: 3,
    // 出行记录(从订单列表聚合,与 Trip 页同源,保证一致)
    stats: {
      totalTrips: 0,
      totalDistance: "0",
      totalAmount: "0.00",
      points: 0,
    },
    // 订单状态计数
    orderStats: {
      unpaid: 0,
      ongoing: 0,
      uncomment: 0,
      completed: 0,
    },
    // 会员等级进度条
    levelBarPctClass: 'bar-pct-0',
    menuList: [
      {
        title: "出行服务",
        items: [
          { iconKey: "wallet", name: "支付管理", page: "" },
          { iconKey: "coupon", name: "优惠券", badge: "3", page: "" },
          { iconKey: "address", name: "收藏地址", page: "" },
          { iconKey: "contact", name: "紧急联系人", page: "" },
        ],
      },
      {
        title: "更多服务",
        items: [
          { iconKey: "shield", name: "账号保护", page: "account-protection" },
          { iconKey: "lock", name: "修改密码", page: "change-password" },
          { iconKey: "security", name: "安全中心", page: "" },
          { iconKey: "service", name: "客服中心", page: "" },
          { iconKey: "setting", name: "设置", page: "" },
          { iconKey: "feedback", name: "意见反馈", page: "" },
          { iconKey: "about", name: "关于我们", page: "" },
        ],
      },
    ],
  },

  onLoad() {
    this.checkLogin();
    // 订阅 orderStore:订单变化时立即刷新统计(无需等 onShow)
    this._unsubscribeOrder = orderStore.subscribe(() => {
      if (this.data.hasLogin) this.loadUserStats();
    });
  },

  onUnload() {
    if (typeof this._unsubscribeOrder === "function") {
      this._unsubscribeOrder();
    }
  },

  onReady() {
    // 获取 TDesign 全局组件实例
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  // TDesign 顶部消息条
  showMessage(theme, content) {
    if (this.tMessage) {
      this.tMessage.show({ theme, content, duration: 2200 });
    } else {
      wx.showToast({ title: content, icon: theme === "error" ? "error" : "none" });
    }
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3,
        unreadCount: app.globalData.unreadCount || 0,
      });
    }
    this.checkLogin();
    // 每次 onShow 都重算统计(订单完成后从其他页面回来立即刷新)
    if (this.data.hasLogin) {
      this.loadUserStats();
    }
  },

  checkLogin() {
    const userInfo = wx.getStorageSync("userInfo");
    if (userInfo) {
      let parsed = null;
      try {
        parsed = typeof userInfo === 'string' ? JSON.parse(userInfo) : userInfo;
      } catch (e) {
        wx.removeStorageSync("userInfo");
        console.error('[profile] userInfo 解析失败,已清除', e);
        return;
      }
      this.setData({
        hasLogin: true,
        userInfo: parsed,
        avatarLetter: this.computeAvatarLetter(parsed),
      });
      this.loadUserStats();
    }
  },

  maskPhone(phone) {
    if (!phone) return '';
    const str = String(phone);
    if (str.length === 11 && /^1\d{10}$/.test(str)) {
      return str.slice(0, 3) + '****' + str.slice(-4);
    }
    if (str.length > 7) {
      return str.slice(0, 2) + '****' + str.slice(-2);
    }
    return '****';
  },

  // 计算头像回退字母(从 nickName[0])
  // 关键:WXML 不支持 {{nickName[0]}} 这种索引访问,必须先在 JS 算出再 setData
  computeAvatarLetter(userInfo) {
    if (!userInfo) return 'U';
    const nick = (userInfo.nickName || '').toString().trim();
    if (!nick) return 'U';
    // 取第一个字符(支持中文/emoji)
    return Array.from(nick)[0] || 'U';
  },

  // 核心:从订单列表聚合出与 Trip 页完全一致的统计
  // 关键:异步触发 orderStore.load()(首次进入 profile 时 MEM_ORDERS 为空)
  // 同步先用本地数据,等 orderStore 拉完云端后再 recalcStats 一次
  loadUserStats() {
    // 1) 同步先用本地/缓存数据占位,避免空白闪烁
    const ordersSync = this.getAllOrdersForStats();
    this.recalcStats(ordersSync);

    // 2) 异步用云端最新数据重算
    orderStore.load().then((orders) => {
      if (Array.isArray(orders) && orders.length > 0) {
        this.recalcStats(orders);
      }
    }).catch((err) => {
      console.warn("[profile] orderStore.load 失败", err);
    });
  },

  // 抽离的"重算并 setData",可被异步 load 完成后再次调用
  recalcStats(orders) {
    if (!Array.isArray(orders)) return;
    const s = userStats.getStats();
    const counts = userStats.countOrdersByStatus();
    const level = calcLevel(s.points);

    let totalTrips = 0;
    let totalDistance = 0;
    let totalAmount = 0;
    orders.forEach((o) => {
      const dist = Number(o.distance) || 0;
      const isCompleted = o.status === "completed";
      if (isCompleted) totalTrips += 1;
      if (dist > 0) totalDistance += dist;
      if (isCompleted) {
        const price = Number(o.actualPrice || o.estimatePrice || 0) || 0;
        totalAmount += price;
      }
    });

    this.setData({
      level,
      levelBarPctClass: pctClassOf(level && level.percent),
      balance: formatMoney(s.balance),
      creditLimit: formatMoney(s.creditLimit),
      creditUsed: formatMoney(s.creditUsed),
      creditRemain: formatMoney(Math.max(0, s.creditLimit - s.creditUsed)),
      points: s.points,
      stats: {
        totalTrips,
        totalDistance: formatNum(totalDistance),
        totalAmount: formatMoney(totalAmount),
        points: s.points,
      },
      orderStats: {
        unpaid: counts.unpaid || 0,
        ongoing: counts.ongoing || 0,
        uncomment: counts.uncomment || 0,
        completed: counts.completed || 0,
      },
    });
  },

  // 与 trip.js 同一数据源 — 走 orderStore(本地+云端合并,内存缓存)
  // 修复:旧版本只读 wx.getStorageSync("cloudOrdersCache"),但该 key 从未被任何代码写入,
  //      导致 profile 永远只看到本地订单,看不到云端订单(数据不互通的根因之一)
  getAllOrdersForStats() {
    let all = orderStore.getOrders() || [];
    if (all.length === 0) {
      // 兜底:从本地拿(可能 orderStore 还没加载,或网络完全不可用)
      all = userStats.getOrders();
    }
    if (all.length === 0) {
      // 与 trip.js 一致的演示数据
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      all = [
        { _id: "demo_001", startAddress: { name: "中关村软件园" }, endAddress: { name: "望京 SOHO" }, carName: "快车", carType: "fast", status: "completed", statusText: "已完成", actualPrice: 28.5, estimatePrice: 28.5, createTime: now - day, distance: 12.5, duration: 1800, commented: true },
        { _id: "demo_002", startAddress: { name: "国贸 CBD" }, endAddress: { name: "三里屯" }, carName: "舒适型", carType: "comfort", status: "completed", statusText: "已完成", actualPrice: 15.8, estimatePrice: 15.8, createTime: now - 2 * day, distance: 6.3, duration: 1200, commented: false },
        { _id: "demo_003", startAddress: { name: "五道口" }, endAddress: { name: "西单商圈" }, carName: "快车", carType: "fast", status: "cancelled", statusText: "已取消", actualPrice: 0, estimatePrice: 32.0, createTime: now - 3 * day, distance: 11.0, duration: 0 },
        { _id: "demo_004", startAddress: { name: "首都机场 T3" }, endAddress: { name: "望京 SOHO" }, carName: "商务车", carType: "business", status: "completed", statusText: "已完成", actualPrice: 156.0, estimatePrice: 156.0, createTime: now - 5 * day, distance: 32.5, duration: 3600, commented: true },
      ];
    }
    return all;
  },

  onLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  onAvatarTap() {
    if (!this.data.hasLogin) {
      this.onLogin();
    } else {
      wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
    }
  },

  onViewWallet() {
    if (!this.checkAuth()) return;
    wx.navigateTo({ url: '/pages/payment/payment' });
  },
  onViewCoupons() {
    if (!this.checkAuth()) return;
    wx.navigateTo({ url: '/pages/my-coupons/my-coupons' });
  },
  onViewSettings() {
    wx.navigateTo({ url: '/pages/setting/setting' });
  },

  // 资产区点击:跳到支付管理对应区块
  onAssetTap(e) {
    if (!this.checkAuth()) return;
    const asset = e.currentTarget.dataset.asset;
    if (asset === "balance" || asset === "credit" || asset === "points") {
      wx.navigateTo({ url: '/pages/payment/payment?tab=' + asset });
    } else {
      const names = { balance: '钱包余额', credit: '信用额度', points: '积分' };
      wx.showToast({ title: names[asset] + '功能开发中', icon: 'none' });
    }
  },

  // 跳转到我的订单并切换 tab(switchTab 无法传 query,用 globalData 桥接)
  goTrip(tab) {
    try { app.globalData.pendingTripTab = tab || ''; } catch (e) {}
    wx.switchTab({ url: '/pages/trip/trip' });
  },

  // 统计点击
  onStatTap(e) {
    const stat = e.currentTarget.dataset.stat;
    if (stat === 'trips' || stat === 'distance' || stat === 'amount') {
      this.goTrip('completed');
    } else if (stat === 'points') {
      wx.navigateTo({ url: '/pages/payment/payment?tab=points' });
    }
  },

  // 订单类型
  onOrderType(e) {
    if (!this.checkAuth()) return;
    const type = e.currentTarget.dataset.type;
    if (type === "uncomment") {
      this.goTrip('completed');
      return;
    }
    if (type === "completed") {
      // 已完成:跳到行程页"已完成"tab
      this.goTrip('completed');
      return;
    }
    if (type === "ongoing") {
      const order = app.globalData.currentOrder;
      if (order && (order.status === 'waiting' || order.status === 'riding')) {
        const url = order.status === 'waiting'
          ? `/pages/waiting/waiting?orderId=${order._id || ''}`
          : `/pages/riding/riding?orderId=${order._id || ''}`;
        wx.navigateTo({ url });
        return;
      }
      this.goTrip('ongoing');
      return;
    }
    if (type === "unpaid") {
      this.goTrip('unpaid');
      return;
    }
  },

  onViewAllOrders() {
    this.goTrip('');
  },

  onToolTap(e) {
    const tool = e.currentTarget.dataset.tool;
    const map = {
      invoice: '申请发票',
      tripShare: '行程分享',
      invoiceHistory: '历史发票',
      creditScore: '信用分',
      levelMall: '会员商城',
      invite: '邀请好友',
    };
    if (tool === 'invite') {
      const inviteCode = (app && app.globalData && app.globalData.inviteCode) || '请前往个人中心生成';
      wx.showModal({
        title: '邀请好友',
        content: `分享你的专属邀请码：${inviteCode}\n每邀请一位新用户，双方各得 50 积分`,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#FF7B00',
      });
    } else if (tool === 'creditScore') {
      // 跳到信用分详情
      wx.showModal({
        title: '信用分',
        content: `您的信用额度 ¥${this.data.creditLimit}，已使用 ¥${this.data.creditUsed}，剩余 ¥${this.data.creditRemain}。\n保持良好用车习惯可提升额度。`,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#FF7B00',
      });
    } else {
      wx.showToast({ title: (map[tool] || '该功能') + '功能开发中', icon: 'none' });
    }
  },

  onMenuClick(e) {
    if (!this.checkAuth()) return;
    const { name, page } = e.currentTarget.dataset;
    const map = {
      '支付管理': '/pages/payment/payment',
      '优惠券': '/pages/my-coupons/my-coupons',
      '收藏地址': '/pages/fav-addresses/fav-addresses',
      '紧急联系人': '/pages/emergency-contact/emergency-contact',
      '账号保护': '/pages/account-protection/account-protection',
      '修改密码': '/pages/change-password/change-password',
      '安全中心': '/pages/security/security',
      '客服中心': '/pages/customer-service/customer-service',
      '设置': '/pages/setting/setting',
      '意见反馈': '/pages/feedback/feedback',
      '关于我们': '/pages/about/about',
    };
    // 优先使用 data-page 路由(更明确),兜底按 name 匹配
    const target = page && page.startsWith('/') ? page : (map[name] || (page ? '/' + page + '/' + page : null));
    if (target) {
      // 点击反馈:先高亮再跳转,避免卡顿
      this._animating = true;
      wx.nextTick(() => {
        wx.navigateTo({ url: target });
        this._animating = false;
      });
    } else if (map[name]) {
      wx.navigateTo({ url: map[name] });
    }
  },

  checkAuth() {
    if (!this.data.hasLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        confirmColor: '#FF7B00',
        success: (res) => {
          if (res.confirm) this.onLogin();
        },
      });
      return false;
    }
    return true;
  },

  onLogout() {
    // 优先用 TDesign t-dialog(组件已注册)
    // 实际使用需要 WXML 模板里监听 bind:confirm,这里为了简单继续用 wx.showModal
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync("userInfo");
          app.globalData.userInfo = null;
          this.setData({
            hasLogin: false,
            userInfo: null,
            avatarLetter: 'U',
            level: null,
            levelBarPctClass: 'bar-pct-0',
          });
          wx.showToast({ title: '已退出登录', icon: 'success' });
          messageStore.push({
            type: messageStore.TYPE.SYSTEM,
            title: '账号已退出',
            content: '您已安全退出登录，下次使用请重新登录。',
          });
        }
      },
    });
  },
});
