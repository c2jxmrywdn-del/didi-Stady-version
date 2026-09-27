// pages/order-detail/order-detail.js — 订单详情
// 真实数据源:utils/userStats.js;支付完成时累加行程/里程/花费,扣减余额/信用,奖励积分
// 性能/安全优化:云端读订单改走 cloud.callCloud → orderFunctions.getOrderDetail(自带 openid 鉴权)
// 跨页互通:订单状态变更后调 orderStore.upsertLocal,让 trip / profile 立即刷新
const app = getApp();
const messageStore = require("../../utils/messageStore");
const wxPay = require("../../utils/wxPay");
const userStats = require("../../utils/userStats");
const cloud = require("../../utils/cloud");
const orderStore = require("../../utils/orderStore");

Page({
  data: {
    order: null,
    isComplete: false,
    showPaySuccess: false,
    payMethods: [
      { key: "wechat", name: "微信支付", selected: true },
      { key: "alipay", name: "支付宝", selected: false },
      { key: "wallet", name: "钱包余额", selected: false },
      { key: "credit", name: "信用支付", selected: false },
    ],
    // 司机评价
    rating: 0,
    stars: [1, 2, 3, 4, 5],
    commentTags: ["驾驶平稳", "服务态度好", "车内整洁", "路线熟悉", "准时到达"],
    selectedTags: [],
    tagSelectedMap: {},
    // APP满意度评价
    appRating: 0,
    appStars: [1, 2, 3, 4, 5],
    appCommentTags: ["界面美观", "操作便捷", "响应迅速", "功能丰富", "安全可靠"],
    selectedAppTags: [],
    appTagSelectedMap: {},
    rateStep: "driver",
    // 分享弹窗
    showShareModal: false,
    // 钱包余额提示
    balance: 0,
    creditRemain: 0,
    payNowAuto: false,    // 进入即触发支付
    commentNowAuto: false, // 进入即进入评价
  },

  onLoad(options) {
    if (options.order) {
      const order = JSON.parse(decodeURIComponent(options.order));
      this.processOrder(order, options.isComplete === "1");
    } else if (options.orderId) {
      this.loadOrder(options.orderId);
    }
    this.setData({
      payNowAuto: options.payNow === "1",
      commentNowAuto: options.commentNow === "1",
    });
  },

  onShow() {
    // 每次显示时刷新钱包/信用显示
    const s = userStats.getStats();
    this.setData({
      balance: s.balance,
      creditRemain: Math.max(0, s.creditLimit - s.creditUsed),
    });
  },

  onShareAppMessage() {
    const { order } = this.data;
    return {
      title: `滴滴学习版 | ${order.startAddress.name} → ${order.endAddress.name} ¥${order.actualPrice || order.estimatePrice}`,
      path: `/pages/index/index`,
      imageUrl: "",
    };
  },

  processOrder(order, isComplete) {
    const price = order.actualPrice || order.estimatePrice || 0;
    order.mileageFee = (price * 0.7).toFixed(1);
    order.timeFee = (price * 0.2).toFixed(1);
    order.longFee = (price * 0.1).toFixed(1);
    // 修复:进行中订单的 duration 也展示出来(秒→分钟,而不是 '--')
    if (order.duration && order.duration > 0) {
      const min = Math.floor(order.duration / 60);
      const sec = order.duration % 60;
      order.durationText = min > 0 ? (min + '分' + (sec > 0 ? sec + '秒' : '')) : (sec + '秒');
    } else {
      order.durationText = '--';
    }
    // 修复:进行中订单的 distance 也展示(浮点 km,优先 rideDistance 实时回写)
    if (order.rideDistance != null) {
      order.distance = Number(order.rideDistance).toFixed(1);
    } else if (typeof order.distance === 'number') {
      order.distance = order.distance.toFixed(1);
    }
    const statusMap = {
      completed: '行程已完成',
      cancelled: '行程已取消',
      waiting: '等待中',
      riding: '行程中',
      unpaid: '待支付',
      refund: '退款中',
    };
    order.statusText = statusMap[order.status] || '行程中';
    if (order.createTime) {
      const d = new Date(order.createTime);
      order.rideTime = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }
    // 真实展示可支付金额
    order.actualPrice = Number(order.actualPrice || order.estimatePrice || 0).toFixed(2);
    order.estimatePrice = Number(order.estimatePrice || order.actualPrice || 0).toFixed(2);
    this.setData({ order, isComplete });
    // 如果是待支付,直接走支付流程
    if (order.status === "unpaid" && this.data.payNowAuto) {
      setTimeout(() => this.onPay(), 200);
    }
    // 进入即进入评价
    if (order.status === "completed" && this.data.commentNowAuto) {
      this.setData({ showPaySuccess: true, rateStep: "driver" });
    }
  },

  // 恢复行程:从订单详情跳回 waiting/riding 继续(可携带最新进度)
  onResumeRide() {
    const { order } = this.data;
    if (!order) return;
    // 优先用云端 orderId,没有就回退到本地 _id
    const orderId = order.cloudOrderId || order._id;
    if (!orderId) {
      wx.showToast({ title: "订单信息异常", icon: "none" });
      return;
    }
    const target = order.status === "riding" ? "riding" : "waiting";
    const url = target === "riding"
      ? `/pages/riding/riding?orderId=${orderId}`
      : `/pages/waiting/waiting?orderId=${orderId}`;
    wx.redirectTo({ url });
  },

  loadOrder(orderId) {
    // 优先从本地订单存储读取
    const local = userStats.getOrderById(orderId);
    if (local) {
      this.processOrder(local, local.status === "completed");
      return;
    }
    // 兜底:从云端取(走拆分后的 orderFunctions,云端已做 openid 鉴权)
    if (wx.cloud) {
      cloud.callCloud("getOrderDetail", { orderId }).then((res) => {
        this.processOrder((res && res.data) || this.buildMock(orderId), true);
      }).catch(() => {
        this.processOrder(this.buildMock(orderId), true);
      });
    } else {
      this.processOrder(this.buildMock(orderId), true);
    }
  },

  buildMock(orderId) {
    return {
      _id: orderId,
      startAddress: { name: "中关村软件园", latitude: 39.98, longitude: 116.31 },
      endAddress: { name: "望京SOHO", latitude: 39.99, longitude: 116.48 },
      carName: "快车",
      carType: "fast",
      estimatePrice: 28.5,
      actualPrice: 32.0,
      duration: 1800,
      distance: 12.5,
      createTime: Date.now() - 3600000,
      status: "completed",
      driverInfo: {
        name: "王师傅", car: "京A·88888", carModel: "丰田凯美瑞", rating: 4.9, avatar: "👨",
      },
    };
  },

  onSelectPayMethod(e) {
    const key = e.currentTarget.dataset.key;
    const payMethods = this.data.payMethods.map((m) => ({
      ...m, selected: m.key === key,
    }));
    this.setData({ payMethods });
  },

  onPay() {
    const selectedMethod = this.data.payMethods.find(m => m.selected);
    if (!selectedMethod) {
      wx.showToast({ title: '请选择支付方式', icon: 'none' });
      return;
    }
    if (selectedMethod.key === "wechat") {
      this.wechatPay();
    } else if (selectedMethod.key === "wallet") {
      this.walletPay();
    } else if (selectedMethod.key === "credit") {
      this.creditPay();
    } else {
      this.simulatePay(selectedMethod.key);
    }
  },

  // ============ 支付分支 ============
  wechatPay() {
    const { order } = this.data;
    const price = parseFloat(order.actualPrice || order.estimatePrice || 0);
    if (price <= 0) {
      wx.showToast({ title: '订单金额异常', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在拉起微信支付...', mask: true });
    wxPay.pay({
      body: `滴滴学习版-行程费用`,
      totalFee: price,
      attach: order._id || order.createTime?.toString() || '',
    }).then(() => {
      wx.hideLoading();
      this.afterPaySuccess("wechat");
    }).catch((err) => {
      wx.hideLoading();
      const msg = err.message || '支付失败';
      if (msg.indexOf('取消') > -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        console.warn('微信支付失败，降级模拟支付', msg);
        wx.showModal({
          title: '支付提示',
          content: '微信支付暂不可用（' + msg + '），是否使用模拟支付完成订单？',
          confirmText: '模拟支付',
          cancelText: '取消',
          confirmColor: '#2D2A26',
          success: (res) => { if (res.confirm) this.simulatePay("wechat"); },
        });
      }
    });
  },

  walletPay() {
    const { order } = this.data;
    const price = parseFloat(order.actualPrice || order.estimatePrice || 0);
    const res = userStats.payFromBalance(price);
    if (!res.ok) {
      wx.showModal({
        title: '余额不足',
        content: `钱包余额 ¥${res.stats.balance.toFixed(2)},本次需支付 ¥${price.toFixed(2)},还差 ¥${res.need.toFixed(2)}。\n请前往"支付管理"充值,或更换支付方式。`,
        confirmText: '去充值',
        cancelText: '换支付方式',
        success: (r) => {
          if (r.confirm) {
            wx.navigateTo({ url: '/pages/payment/payment?tab=balance' });
          }
        },
      });
      return;
    }
    this.afterPaySuccess("wallet", res.stats);
  },

  creditPay() {
    const { order } = this.data;
    const price = parseFloat(order.actualPrice || order.estimatePrice || 0);
    const res = userStats.payFromCredit(price);
    if (!res.ok) {
      wx.showModal({
        title: '信用额度不足',
        content: `本次需支付 ¥${price.toFixed(2)},信用余额仅剩 ¥${(res.stats.creditLimit - res.stats.creditUsed).toFixed(2)}。请更换支付方式。`,
        showCancel: false,
        confirmText: '我知道了',
      });
      return;
    }
    this.afterPaySuccess("credit", res.stats);
  },

  simulatePay(method = "wechat") {
    wx.showLoading({ title: "支付中..." });
    setTimeout(() => {
      wx.hideLoading();
      this.afterPaySuccess(method);
    }, 1200);
  },

  // 支付成功统一收口:更新本地订单、累加统计、奖励积分
  // 修复:即使上游没有传 _id(老调用方或直跳 order-detail),也能兜底创建本地订单并归档
  //      同时把云端 completeOrder 从空壳 quickstartFunctions 改为 orderFunctions
  afterPaySuccess(payFrom, updatedStats) {
    const { order } = this.data;
    const price = parseFloat(order.actualPrice || order.estimatePrice || 0);

    // 0) 兜底:order 没有 _id 时,自动写入本地订单历史(归档链路)
    if (!order._id) {
      const created = userStats.createOrder({
        startAddress: order.startAddress,
        endAddress: order.endAddress,
        carType: order.carType || "fast",
        carName: order.carName || "快车",
        estimatePrice: order.estimatePrice || price,
        estimateTime: order.estimateTime || 0,
        actualPrice: price,
        distance: order.distance || 0,
        duration: order.duration || 0,
        status: "completed",
        statusText: "已完成",
        createTime: order.createTime || Date.now(),
      });
      order._id = created._id;
      this.setData({ order });
    }

    // 1) 同步到本地订单存储
    userStats.updateOrder(order._id, {
      status: "completed",
      statusText: "已完成",
      actualPrice: price,
      payFrom,
      paidAt: Date.now(),
    });
    // 2) 累加出行统计;积分按 1元=1积分
    const rewardPts = Math.max(1, Math.floor(price));
    userStats.recordCompletedOrder({
      distance: order.distance || 0,
      duration: order.duration || 0,
      amount: price,
      payFrom,
      rewardPts,
    });
    // 3) UI 切到支付成功 + 评价步骤
    this.setData({
      showPaySuccess: true,
      rateStep: "driver",
      isComplete: true,
    });
    // 4) 同步云端(走拆分后的 orderFunctions,带 5s 缓存;同时失效订单列表缓存)
    if (wx.cloud) {
      cloud.callCloud("completeOrder", {
        orderId: order.cloudOrderId || order._id,
        actualPrice: price,
        payFrom,
        distance: order.distance || 0,
        duration: order.duration || 0,
      }, { retry: false })
        .then(() => cloud.invalidate("getOrders"))
        .catch((err) => console.warn("[order-detail] 云端 completeOrder 失败", err));
    }
    // 5) 跨页面同步:让 orderStore 内存里也有这条"已支付"订单,
    //    trip / profile 在订阅回调里立即重算(无需等下次 onShow)
    orderStore.upsertLocal({
      _id: order._id,
      status: "completed",
      statusText: "已完成",
      actualPrice: price,
      payFrom,
      paidAt: Date.now(),
    });
    // 5) 推送支付成功消息
    const statsNow = updatedStats || userStats.getStats();
    messageStore.push({
      type: messageStore.TYPE.ORDER,
      title: '支付成功',
      content: `${order.startAddress?.name || ''} → ${order.endAddress?.name || ''} 已支付 ¥${price.toFixed(2)},获得 ${rewardPts} 积分。`,
      action: { type: 'navigate', url: '/pages/trip/trip', label: '查看行程' },
    });
    wx.showToast({ title: '支付成功', icon: 'success' });
  },

  // ========== 评价 ==========
  onRate(e) { this.setData({ rating: e.currentTarget.dataset.score }); },

  onTagSelect(e) {
    const tag = e.currentTarget.dataset.tag;
    let selectedTags = [...this.data.selectedTags];
    const index = selectedTags.indexOf(tag);
    if (index > -1) selectedTags.splice(index, 1); else selectedTags.push(tag);
    const tagSelectedMap = {};
    this.data.commentTags.forEach((t) => { tagSelectedMap[t] = selectedTags.indexOf(t) > -1; });
    this.setData({ selectedTags, tagSelectedMap });
  },

  onAppRate(e) { this.setData({ appRating: e.currentTarget.dataset.score }); },

  onAppTagSelect(e) {
    const tag = e.currentTarget.dataset.tag;
    let selectedAppTags = [...this.data.selectedAppTags];
    const index = selectedAppTags.indexOf(tag);
    if (index > -1) selectedAppTags.splice(index, 1); else selectedAppTags.push(tag);
    const appTagSelectedMap = {};
    this.data.appCommentTags.forEach((t) => { appTagSelectedMap[t] = selectedAppTags.indexOf(t) > -1; });
    this.setData({ selectedAppTags, appTagSelectedMap });
  },

  onDriverRateNext() {
    if (this.data.rating === 0) {
      wx.showToast({ title: "请先给司机评分", icon: "none" });
      return;
    }
    this.setData({ rateStep: "app" });
  },

  // 提交评价
  onSubmitReview() {
    const { order, rating, selectedTags, appRating, selectedAppTags } = this.data;
    wx.showLoading({ title: "提交中..." });
    const driverName = order.driverInfo?.name || "司机";
    messageStore.push({
      type: messageStore.TYPE.ORDER,
      title: "感谢您的评价",
      content: `您给${driverName}打了 ${rating} 星${appRating ? `,给 APP 打了 ${appRating} 星` : ""},您的反馈将帮助我们提供更好服务。`,
    });
    // 标记订单已评价
    if (order._id) {
      userStats.updateOrder(order._id, { commented: true });
    }
    if (order._id && wx.cloud) {
      wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "rateDriver",
          data: { orderId: order._id, rating, comment: "", commentTags: selectedTags, appRating, appCommentTags: selectedAppTags },
        },
        success: () => { wx.hideLoading(); wx.showToast({ title: "评价成功", icon: "success" }); setTimeout(() => wx.navigateBack(), 1200); },
        fail: () => { wx.hideLoading(); wx.showToast({ title: "评价成功", icon: "success" }); setTimeout(() => wx.navigateBack(), 1200); },
      });
    } else {
      wx.hideLoading();
      wx.showToast({ title: "评价成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  onSkipAppRate() { this.onSubmitReview(); },

  // ========== 分享 ==========
  onShareOrder() { this.setData({ showShareModal: true }); },
  onCloseShareModal() { this.setData({ showShareModal: false }); },
  onShareToFriend() { this.setData({ showShareModal: false }); },
  onShareToTimeline() {
    const { order } = this.data;
    this.setData({ showShareModal: false });
    const text = `滴滴学习版 | ${order.startAddress.name} → ${order.endAddress.name} | ¥${order.actualPrice || order.estimatePrice}`;
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: "行程信息已复制", icon: "none", duration: 2000 });
        messageStore.push({ type: messageStore.TYPE.SYSTEM, title: "行程已分享", content: "已复制行程信息到剪贴板,可前往朋友圈粘贴分享。" });
      },
    });
  },

  onReOrder() { wx.switchTab({ url: "/pages/index/index" }); },
  onContactDriver() { wx.makePhoneCall({ phoneNumber: "400-000-0999" }); },

  onCustomerService() {
    messageStore.push({
      type: messageStore.TYPE.SERVICE,
      title: "已为您接入在线客服",
      content: "正在为您接通智能客服小滴,预计等待 30 秒。紧急问题可拨打 400-000-0999。",
      action: { type: "call", phone: "400-000-0999", label: "拨打客服" },
    });
    wx.showModal({
      title: "在线客服", content: "客服工作时间 9:00-22:00,紧急问题请拨打 400-000-0999",
      showCancel: false, confirmText: "我知道了", confirmColor: "#2D2A26",
    });
  },
});
