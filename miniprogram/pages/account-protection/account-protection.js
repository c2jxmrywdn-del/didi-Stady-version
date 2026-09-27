// pages/account-protection/account-protection.js — TDesign 风格
const app = getApp();
const STORAGE_KEY = 'accountProtectionSettings';

const DEFAULT_SETTINGS = {
  // 登录保护
  fingerprintUnlock: false,   // 指纹/面容解锁
  pinCode: false,             // 启动 PIN 码
  biometricPay: true,         // 支付前生物认证
  // 隐私保护
  hidePhoneInApp: true,       // 隐藏真实手机号
  hideAvatarInList: false,    // 列表中隐藏头像
  // 登录通知
  loginNotify: true,          // 新设备登录通知
  payNotify: true,            // 支付结果通知
  // 自动锁定
  autoLockMinutes: 5,         // 后台自动锁定时长
};

const LOGIN_HISTORY_SEED = [
  { id: 'h1', device: 'iPhone 15 Pro', os: 'iOS 17.5', city: '北京', ip: '203.0.113.**', time: Date.now() - 1000 * 60 * 30, current: true },
  { id: 'h2', device: 'iPhone 14',     os: 'iOS 17.2', city: '北京', ip: '198.51.100.**', time: Date.now() - 1000 * 60 * 60 * 24, current: false },
  { id: 'h3', device: 'MacBook Pro',   os: 'macOS 14', city: '上海', ip: '192.0.2.**', time: Date.now() - 1000 * 60 * 60 * 24 * 5, current: false },
];

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' 小时前';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + ' 天前';
  return fmtTime(ts);
}

Page({
  data: {
    settings: { ...DEFAULT_SETTINGS },
    loginHistory: [],
    securityScore: 0,
    scoreColor: '#FF7B00',
    scoreTip: '',
    showPinDialog: false,
    pinInput: '',
    showToast: false,
    toastText: '',
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    this.loadAll();
  },

  loadAll() {
    const settings = this.loadSettings();
    const history = this.loadHistory().map(h => ({ ...h, timeText: relativeTime(h.time) }));
    const { score, tip, color } = this.calcScore(settings);
    this.setData({
      settings,
      loginHistory: history,
      securityScore: score,
      scoreTip: tip,
      scoreColor: color,
    });
  },

  loadSettings() {
    const saved = wx.getStorageSync(STORAGE_KEY) || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  },

  loadHistory() {
    const saved = wx.getStorageSync('accountLoginHistory');
    if (Array.isArray(saved) && saved.length > 0) return saved;
    wx.setStorageSync('accountLoginHistory', LOGIN_HISTORY_SEED);
    return LOGIN_HISTORY_SEED;
  },

  saveSettings(next) {
    wx.setStorageSync(STORAGE_KEY, next);
    const { score, tip, color } = this.calcScore(next);
    this.setData({ settings: next, securityScore: score, scoreTip: tip, scoreColor: color });
  },

  // 计算安全评分(0~100)
  calcScore(s) {
    const items = [
      !!s.fingerprintUnlock,
      !!s.pinCode,
      !!s.biometricPay,
      !!s.hidePhoneInApp,
      !!s.loginNotify,
      !!s.payNotify,
    ];
    const on = items.filter(Boolean).length;
    const score = Math.round(40 + (on / items.length) * 60);
    let tip = '您的账号安全等级较低,建议开启更多保护';
    let color = '#e74c3c';
    if (score >= 90) { tip = '账号防护极佳,请保持'; color = '#5CAA5C'; }
    else if (score >= 75) { tip = '账号防护良好,可进一步完善'; color = '#FF7B00'; }
    else if (score >= 60) { tip = '账号防护一般,建议加强'; color = '#e7a85f'; }
    return { score, tip, color };
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    const checked = e.detail.value;

    // PIN 码开启时弹出输入框(简单模拟)
    if (key === 'pinCode' && checked) {
      this.setData({ showPinDialog: true, pinInput: '' });
      return;
    }

    const next = { ...this.data.settings, [key]: checked };
    this.saveSettings(next);
    this.flashToast(checked ? '已开启' : '已关闭');
  },

  onPinInput(e) {
    this.setData({ pinInput: e.detail.value });
  },

  onPinConfirm() {
    const pin = this.data.pinInput;
    if (!/^\d{4,6}$/.test(pin)) {
      this.flashToast('请输入 4-6 位数字');
      return;
    }
    wx.setStorageSync('accountPinCode', pin);
    const next = { ...this.data.settings, pinCode: true };
    this.saveSettings(next);
    this.setData({ showPinDialog: false, pinInput: '' });
    this.flashToast('PIN 码已设置');
  },

  onPinCancel() {
    this.setData({ showPinDialog: false, pinInput: '' });
  },

  onSelectAutoLock() {
    const opts = ['1', '5', '15', '30', '60'];
    const labels = { '1': '1 分钟', '5': '5 分钟', '15': '15 分钟', '30': '30 分钟', '60': '1 小时' };
    const current = this.data.settings.autoLockMinutes;
    wx.showActionSheet({
      itemList: opts.map(o => (o === String(current) ? labels[o] + '  ✓' : labels[o])),
      success: (res) => {
        const minutes = parseInt(opts[res.tapIndex], 10);
        if (Number.isFinite(minutes) && minutes !== current) {
          const next = { ...this.data.settings, autoLockMinutes: minutes };
          this.saveSettings(next);
          this.flashToast('已更新');
        }
      },
    });
  },

  onKickDevice(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.loginHistory || []).find(h => h.id === id);
    if (!item || item.current) return;
    wx.showModal({
      title: '退出此设备',
      content: `确定要退出「${item.device}」的登录吗?该设备将需要重新登录。`,
      confirmText: '退出',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          const next = (this.data.loginHistory || []).filter(h => h.id !== id);
          wx.setStorageSync('accountLoginHistory', next);
          this.setData({ loginHistory: next });
          this.flashToast('已退出该设备');
        }
      },
    });
  },

  onClearLoginHistory() {
    wx.showModal({
      title: '清空登录记录',
      content: '将清空所有历史登录设备记录,确定继续?',
      confirmText: '清空',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('accountLoginHistory', []);
          this.setData({ loginHistory: [] });
          this.flashToast('已清空');
        }
      },
    });
  },

  onChangePhone() {
    wx.navigateTo({ url: '/pages/change-password/change-password?type=phone' });
  },

  onChangePassword() {
    wx.navigateTo({ url: '/pages/change-password/change-password' });
  },

  onEmergencyFreeze() {
    wx.showModal({
      title: '紧急冻结账号',
      content: '冻结后账号将无法登录,需要通过手机号验证才能解冻。是否继续?',
      confirmText: '立即冻结',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          this.flashToast('账号已冻结(模拟)');
        }
      },
    });
  },

  onDestroyAccount() {
    wx.showModal({
      title: '注销账号',
      content: '账号注销后所有数据将无法恢复,请谨慎操作。是否继续?',
      confirmText: '继续注销',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          this.flashToast('注销申请已提交(模拟)');
        }
      },
    });
  },

  onStopTap() {
    // 阻止冒泡
  },

  flashToast(text) {
    // 优先用 TDesign t-message(顶部消息条,更醒目)
    if (this.tMessage) {
      this.tMessage.show({ theme: "info", content: text, duration: 1800 });
      return;
    }
    this.setData({ showToast: true, toastText: text });
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.setData({ showToast: false });
    }, 1600);
  },

  onReady() {
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  // TDesign 顶部消息条
  showMessage(theme, content) {
    if (this.tMessage) {
      this.tMessage.show({ theme, content, duration: 2400 });
    } else {
      this.flashToast(content);
    }
  },

  // TDesign 对话框
  showDialog(opts) {
    if (this.tDialog) {
      this.tDialog.show(opts);
    }
  },
});
