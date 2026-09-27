// pages/my-coupons/my-coupons.js
const app = getApp();

// 模拟优惠卷数据
const COUPONS = [
  { id: 1, name: '新用户专享卷', amount: 10, minAmount: 20, type: 'cash', scope: '快车/舒适型可用', status: 'unused', expire: Date.now() + 7 * 24 * 3600 * 1000 },
  { id: 2, name: '周末出行卷', amount: 15, minAmount: 50, type: 'cash', scope: '全场可用', status: 'unused', expire: Date.now() + 3 * 24 * 3600 * 1000 },
  { id: 3, name: '深夜出行卷', amount: 8, minAmount: 30, type: 'cash', scope: '22:00-06:00有效', status: 'unused', expire: Date.now() + 15 * 24 * 3600 * 1000 },
  { id: 4, name: '生日特惠卷', amount: 30, minAmount: 100, type: 'cash', scope: '全场可用', status: 'unused', expire: Date.now() + 30 * 24 * 3600 * 1000 },
  { id: 5, name: '打车折扣卷', amount: 0, discount: 8.5, minAmount: 0, type: 'discount', scope: '商务车/专车可用', status: 'used', expire: Date.now() - 1 * 24 * 3600 * 1000, usedTime: Date.now() - 2 * 24 * 3600 * 1000 },
  { id: 6, name: '会员专享卷', amount: 20, minAmount: 60, type: 'cash', scope: '专车可用', status: 'used', expire: Date.now() - 5 * 24 * 3600 * 1000, usedTime: Date.now() - 3 * 24 * 3600 * 1000 },
  { id: 7, name: '国庆特惠卷', amount: 50, minAmount: 200, type: 'cash', scope: '全场可用', status: 'expired', expire: Date.now() - 10 * 24 * 3600 * 1000 },
  { id: 8, name: '清凉夏日卷', amount: 12, minAmount: 40, type: 'cash', scope: '快车可用', status: 'expired', expire: Date.now() - 20 * 24 * 3600 * 1000 },
];

Page({
  data: {
    tabs: [
      { key: 'unused', label: '未使用', count: 0 },
      { key: 'used', label: '已使用', count: 0 },
      { key: 'expired', label: '已过期', count: 0 },
    ],
    currentTab: 'unused',
    currentTabLabel: '未使用',
    emptyHint: '快去领取更多优惠卷吧',
    displayCoupons: [],
  },

  onLoad() {
    this.formatAndFilter();
  },

  onShow() {
    this.formatAndFilter();
  },

  // 格式化时间与分类统计
  formatAndFilter() {
    const counts = { unused: 0, used: 0, expired: 0 };
    const now = Date.now();
    const formatted = COUPONS.map(c => {
      // 智能判断是否过期
      if (c.status === 'unused' && c.expire < now) {
        c.status = 'expired';
      }
      counts[c.status] = (counts[c.status] || 0) + 1;
      return {
        ...c,
        expireText: this.formatExpire(c.expire, c.status, c.usedTime),
      };
    });

    const tabs = this.data.tabs.map(t => ({ ...t, count: counts[t.key] || 0 }));
    const displayCoupons = formatted.filter(c => c.status === this.data.currentTab);

    this.setData({ tabs, displayCoupons });
  },

  formatExpire(expire, status, usedTime) {
    if (status === 'used' && usedTime) {
      return this.formatDate(usedTime) + ' 已使用';
    }
    if (status === 'expired') {
      return this.formatDate(expire) + ' 已过期';
    }
    // 未使用
    const now = Date.now();
    const days = Math.ceil((expire - now) / (24 * 3600 * 1000));
    if (days <= 3) {
      return this.formatDate(expire) + ` (剩${days}天)`;
    }
    return '至 ' + this.formatDate(expire);
  },

  formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  },

  // 切换标签
  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    const labels = { unused: '未使用', used: '已使用', expired: '已过期' };
    const hints = {
      unused: '快去领取更多优惠卷吧',
      used: '已使用的优惠卷将保留30天',
      expired: '过期的优惠卷无法继续使用',
    };
    this.setData({
      currentTab: key,
      currentTabLabel: labels[key],
      emptyHint: hints[key],
    });
    this.formatAndFilter();
  },

  // 立即使用
  onUseCoupon(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: '跳转到首页使用', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 800);
  },

  // 领取更多
  onGetMore() {
    wx.showModal({
      title: '领取更多优惠卷',
      content: '前往「发现活动」页面领取更多优惠卷？',
      confirmColor: '#2D2A26',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '活动页面开发中', icon: 'none' });
        }
      },
    });
  },
});
