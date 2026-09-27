// pages/payment/payment.js — 支付管理
// 真实数据源:utils/userStats.js(钱包/信用/积分);本地存储管理支付方式/银行卡/账单
const userStats = require("../../utils/userStats");
const messageStore = require("../../utils/messageStore");

const STORAGE_KEY = 'paymentSettings';

const DEFAULT_BANK_CARDS = [
  { id: 1, bankName: '中国工商银行', cardType: '储蓄卡', cardNum: '****  ****  ****  8856', holder: '@ouyang jason', isDefault: true },
  { id: 2, bankName: '招商银行', cardType: '信用卡', cardNum: '****  ****  ****  4218', holder: '@ouyang jason', isDefault: false },
];

const DEFAULT_TX = [
  { id: 1, type: 'pay', title: '望京 SOHO → 首都机场 T3', amount: '128.50', timeText: '今天 14:20', status: 'success', statusText: '已支付' },
  { id: 2, type: 'recharge', title: '钱包充值', amount: '200.00', timeText: '昨天 09:15', status: 'success', statusText: '已到账' },
  { id: 3, type: 'pay', title: '国贸 CBD → 望京 SOHO', amount: '38.50', timeText: '5天前 22:15', status: 'success', statusText: '已支付' },
  { id: 4, type: 'refund', title: '订单退款', amount: '48.50', timeText: '7天前 10:30', status: 'success', statusText: '已退还' },
];

Page({
  data: {
    balance: '0',
    balanceDecimal: '00',
    points: 0,
    creditLimit: 500,
    creditUsed: 0,
    creditRemain: 500,
    couponCount: 3,
    payMethods: {
      wechat: true, balance: true, credit: false, enterprise: false,
    },
    freePayEnabled: true,
    freePayLimit: 200,
    autoPayEnabled: false,
    bankCards: [],
    transactions: [],
    highlightTab: '',   // 来自 ?tab= 参数
  },

  onLoad(options) {
    if (options && options.tab) {
      this.setData({ highlightTab: options.tab });
      // 滚动到对应区域
      setTimeout(() => this.scrollToTab(options.tab), 300);
    }
    this.loadSettings();
  },

  onShow() {
    this.loadSettings();
  },

  // 加载支付方式/银行卡/账单 + 真实钱包数据
  loadSettings() {
    const saved = wx.getStorageSync(STORAGE_KEY) || {};
    // 钱包/信用/积分 从 userStats 读取(单一真相)
    const s = userStats.getStats();
    this.setData({
      payMethods: { ...this.data.payMethods, ...saved.payMethods },
      freePayEnabled: saved.freePayEnabled !== undefined ? saved.freePayEnabled : this.data.freePayEnabled,
      freePayLimit: saved.freePayLimit || this.data.freePayLimit,
      autoPayEnabled: saved.autoPayEnabled !== undefined ? saved.autoPayEnabled : this.data.autoPayEnabled,
      bankCards: saved.bankCards && saved.bankCards.length > 0 ? saved.bankCards : DEFAULT_BANK_CARDS,
      transactions: saved.transactions && saved.transactions.length > 0 ? saved.transactions : DEFAULT_TX,
      // 真实数据
      balance: String(Math.floor(s.balance)),
      balanceDecimal: s.balance.toFixed(2).split('.')[1] || '00',
      points: s.points,
      creditLimit: s.creditLimit,
      creditUsed: s.creditUsed,
      creditRemain: Math.max(0, +(s.creditLimit - s.creditUsed).toFixed(2)),
    });
    if (!saved.bankCards) this.saveSettings({ bankCards: DEFAULT_BANK_CARDS, transactions: DEFAULT_TX });
  },

  scrollToTab(tab) {
    const idMap = { balance: 'wallet-card', credit: 'credit-card', points: 'points-card' };
    const id = idMap[tab];
    if (!id) return;
    try {
      wx.pageScrollTo({ selector: '#' + id, duration: 200 });
    } catch (e) {}
  },

  saveSettings(partial) {
    const current = wx.getStorageSync(STORAGE_KEY) || {};
    const merged = { ...current, ...partial };
    wx.setStorageSync(STORAGE_KEY, merged);
  },

  onPayMethodChange(e) {
    const method = e.currentTarget.dataset.method;
    const value = e.detail.value;
    const payMethods = { ...this.data.payMethods, [method]: value };
    this.setData({ payMethods });
    this.saveSettings({ payMethods });
    wx.showToast({ title: value ? '已开启' : '已关闭', icon: 'success' });
  },

  onPayMethodToggle(e) {
    const method = e.currentTarget.dataset.method;
    const newVal = !this.data.payMethods[method];
    const payMethods = { ...this.data.payMethods, [method]: newVal };
    this.setData({ payMethods });
    this.saveSettings({ payMethods });
    wx.showToast({ title: newVal ? '已开启' : '已关闭', icon: 'success' });
  },

  onFreePayChange(e) {
    this.setData({ freePayEnabled: e.detail.value });
    this.saveSettings({ freePayEnabled: e.detail.value });
  },

  onSetLimit() {
    const limits = [100, 200, 500, 1000, 2000];
    wx.showActionSheet({
      itemList: limits.map(l => '¥' + l + ' 元'),
      success: (res) => {
        const limit = limits[res.tapIndex];
        if (limit) {
          this.setData({ freePayLimit: limit });
          this.saveSettings({ freePayLimit: limit });
          wx.showToast({ title: '已设置为 ¥' + limit, icon: 'success' });
        }
      },
    });
  },

  onAutoPayChange(e) {
    this.setData({ autoPayEnabled: e.detail.value });
    this.saveSettings({ autoPayEnabled: e.detail.value });
  },

  // 充值(真实更新 userStats)
  onRecharge() {
    const amounts = [50, 100, 200, 500, 1000];
    wx.showActionSheet({
      itemList: amounts.map(a => '¥' + a),
      success: (res) => {
        const amount = amounts[res.tapIndex];
        if (amount) {
          wx.showModal({
            title: '钱包充值',
            content: `充值 ¥${amount} 元到钱包余额？\n\n将使用微信支付完成充值`,
            confirmText: '立即充值',
            confirmColor: '#FF7B00',
            success: (r) => {
              if (r.confirm) {
                const updated = userStats.rechargeBalance(amount);
                const tx = {
                  id: Date.now(),
                  type: 'recharge', title: '钱包充值',
                  amount: amount.toFixed(2), timeText: '刚刚',
                  status: 'success', statusText: '已到账',
                };
                const transactions = [tx].concat(this.data.transactions);
                this.setData({ transactions });
                this.saveSettings({ transactions });
                // 刷新显示
                this.setData({
                  balance: String(Math.floor(updated.balance)),
                  balanceDecimal: updated.balance.toFixed(2).split('.')[1] || '00',
                });
                messageStore.push({
                  type: messageStore.TYPE.ORDER,
                  title: '钱包充值成功',
                  content: `已成功充值 ¥${amount.toFixed(2)} 到钱包,当前余额 ¥${updated.balance.toFixed(2)}。`,
                });
                wx.showToast({ title: '充值成功', icon: 'success' });
              }
            },
          });
        }
      },
    });
  },

  // 偿还信用
  onRepayCredit() {
    if (this.data.creditUsed <= 0) {
      wx.showToast({ title: '当前无待还信用', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '偿还信用',
      content: `当前已用信用 ¥${this.data.creditUsed.toFixed(2)}。\n可使用钱包余额一次性偿还。`,
      confirmText: '立即偿还',
      confirmColor: '#FF7B00',
      success: (r) => {
        if (!r.confirm) return;
        const res = userStats.repayCredit(this.data.creditUsed);
        if (!res.ok) {
          wx.showToast({ title: res.reason || '偿还失败', icon: 'none' });
          return;
        }
        this.setData({
          balance: String(Math.floor(res.stats.balance)),
          balanceDecimal: res.stats.balance.toFixed(2).split('.')[1] || '00',
          creditUsed: res.stats.creditUsed,
          creditRemain: Math.max(0, +(res.stats.creditLimit - res.stats.creditUsed).toFixed(2)),
        });
        messageStore.push({
          type: messageStore.TYPE.ORDER,
          title: '信用已偿还',
          content: `已成功偿还 ¥${res.paid.toFixed(2)} 信用额度,钱包余额 ¥${res.stats.balance.toFixed(2)}。`,
        });
        wx.showToast({ title: '偿还成功', icon: 'success' });
      },
    });
  },

  onWithdraw() { wx.showToast({ title: '提现功能开发中', icon: 'none' }); },
  onTransfer() { wx.showToast({ title: '转账功能开发中', icon: 'none' }); },
  onBankCard() { wx.showToast({ title: '请使用下方"添加银行卡"', icon: 'none' }); },

  onAddBankCard() {
    wx.showModal({
      title: '添加银行卡', editable: true, placeholderText: '请输入卡号', content: '',
      confirmText: '下一步', confirmColor: '#FF7B00',
      success: (r1) => {
        if (!r1.confirm || !r1.content) return;
        const cardNum = r1.content.trim();
        if (!/^\d{16,19}$/.test(cardNum.replace(/\s/g, ''))) {
          wx.showToast({ title: '卡号格式错误', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '持卡人信息', editable: true, placeholderText: '持卡人姓名', content: '@ouyang jason',
          confirmText: '添加', confirmColor: '#FF7B00',
          success: (r2) => {
            if (!r2.confirm) return;
            const last4 = cardNum.slice(-4);
            const newCard = {
              id: Date.now(), bankName: '新绑定银行卡', cardType: '储蓄卡',
              cardNum: `****  ****  ****  ${last4}`,
              holder: r2.content.trim() || '@ouyang jason',
              isDefault: this.data.bankCards.length === 0,
            };
            const bankCards = this.data.bankCards.concat(newCard);
            this.setData({ bankCards });
            this.saveSettings({ bankCards });
            wx.showToast({ title: '添加成功', icon: 'success' });
          },
        });
      },
    });
  },

  onBankCardLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const card = this.data.bankCards.find(c => c.id === id);
    if (!card) return;
    wx.showActionSheet({
      itemList: ['设为默认卡', '删除银行卡'],
      success: (res) => {
        if (res.tapIndex === 0) {
          const bankCards = this.data.bankCards.map(c => ({ ...c, isDefault: c.id === id }));
          this.setData({ bankCards });
          this.saveSettings({ bankCards });
          wx.showToast({ title: '已设为默认', icon: 'success' });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除银行卡', content: '确定删除此银行卡？', confirmColor: '#e74c3c',
            success: (r) => {
              if (r.confirm) {
                const bankCards = this.data.bankCards.filter(c => c.id !== id);
                this.setData({ bankCards });
                this.saveSettings({ bankCards });
                wx.showToast({ title: '已删除', icon: 'success' });
              }
            },
          });
        }
      },
    });
  },

  onWalletDetail() {
    wx.showModal({
      title: '账单明细',
      content: '本功能正在完善,您可在"我的订单"查看历史行程的扣费明细。',
      showCancel: false, confirmText: '我知道了',
    });
  },

  onViewCoupons() { wx.navigateTo({ url: '/pages/my-coupons/my-coupons' }); },
  onViewAllTransactions() { wx.showToast({ title: '全部交易功能开发中', icon: 'none' }); },
  onInvoiceSetting() { wx.showToast({ title: '发票管理功能开发中', icon: 'none' }); },
  onPayHistory() { wx.showToast({ title: '扣费记录功能开发中', icon: 'none' }); },

  // 兑换积分
  onExchangePoints() {
    if (this.data.points < 100) {
      wx.showToast({ title: '积分不足 100,无法兑换', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '积分兑换',
      content: `当前可用积分 ${this.data.points},100 积分可兑换 ¥1 钱包余额。\n请输入要兑换的积分数(必须是 100 的整数倍):`,
      editable: true,
      placeholderText: '请输入积分数',
      confirmText: '立即兑换',
      confirmColor: '#FF7B00',
      success: (r) => {
        if (!r.confirm) return;
        const pts = parseInt(r.content, 10);
        if (!Number.isFinite(pts) || pts <= 0 || pts % 100 !== 0) {
          wx.showToast({ title: '请输入 100 的整数倍', icon: 'none' });
          return;
        }
        const spend = userStats.spendPoints(pts);
        if (!spend.ok) {
          wx.showToast({ title: spend.reason || '兑换失败', icon: 'none' });
          return;
        }
        const amount = +(pts / 100).toFixed(2);
        const updated = userStats.rechargeBalance(amount);
        this.setData({
          points: updated.points,
          balance: String(Math.floor(updated.balance)),
          balanceDecimal: updated.balance.toFixed(2).split('.')[1] || '00',
        });
        messageStore.push({
          type: messageStore.TYPE.ORDER,
          title: '积分兑换成功',
          content: `使用 ${pts} 积分兑换 ¥${amount.toFixed(2)} 钱包余额,已到账。`,
        });
        wx.showToast({ title: '兑换成功', icon: 'success' });
      },
    });
  },
});
