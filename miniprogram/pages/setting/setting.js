// pages/setting/setting.js — 设置页
const app = getApp();

Page({
  data: {
    hasLogin: false,
    userInfo: {},
    defaultAvatar: '/images/icons/setting.svg',
    hasSetPwd: false,
    notify: {
      trip: true,
      promotion: true,
      system: true,
    },
    privacy: {
      location: true,
      shareRide: true,
    },
    unit: 'metric',
    language: 'zh',
    cacheSize: '约 2.5MB',
    showUnitModal: false,
    showLangModal: false,
  },

  onLoad() {
    this.loadSettings();
  },

  onShow() {
    this.loadUserInfo();
    this.loadPwdStatus();
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      hasLogin: !!userInfo.nickName,
      userInfo,
    });
  },

  // 加载是否已设置过密码
  loadPwdStatus() {
    const hasSetPwd = !!wx.getStorageSync('userPasswordHash');
    this.setData({ hasSetPwd });
  },

  // 加载本地设置
  loadSettings() {
    const settings = wx.getStorageSync('appSettings') || {};
    const merged = {
      notify: { ...this.data.notify, ...settings.notify },
      privacy: { ...this.data.privacy, ...settings.privacy },
      unit: settings.unit || 'metric',
      language: settings.language || 'zh',
    };
    // 估算缓存大小
    this.getCacheSize();
    this.setData(merged);
  },

  // 保存设置到本地
  saveSettings() {
    const { notify, privacy, unit, language } = this.data;
    wx.setStorageSync('appSettings', { notify, privacy, unit, language });
  },

  // 估算缓存大小
  getCacheSize() {
    try {
      const info = wx.getStorageInfoSync();
      const size = info.currentSize || 0;
      const sizeStr = size < 1024
        ? size + 'KB'
        : (size / 1024).toFixed(1) + 'MB';
      this.setData({ cacheSize: `约 ${sizeStr}` });
    } catch (e) {
      this.setData({ cacheSize: '约 0KB' });
    }
  },

  // 点击资料卡片
  onProfileTap() {
    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile',
    });
  },

  // 点击菜单项
  onMenuTap(e) {
    const action = e.currentTarget.dataset.action;
    switch (action) {
      case 'password':
        wx.navigateTo({ url: '/pages/change-password/change-password' });
        break;
      case 'security':
        wx.navigateTo({ url: '/pages/account-protection/account-protection' });
        break;
      case 'unit':
        this.setData({ showUnitModal: true });
        break;
      case 'language':
        this.setData({ showLangModal: true });
        break;
      case 'cache':
        wx.showModal({
          title: '清除缓存',
          content: '确定要清除所有本地缓存数据吗？\n（已读消息和登录信息会被保留）',
          confirmColor: '#2D2A26',
          success: (res) => {
            if (res.confirm) {
              // 只清理非关键缓存（保留 userInfo / appSettings / messages）
              try {
                const res2 = wx.getStorageInfoSync();
                const keepKeys = ['userInfo', 'appSettings', 'messages_v1', 'messageIdCounter', 'token'];
                res2.keys.forEach((k) => {
                  if (keepKeys.indexOf(k) === -1) {
                    try { wx.removeStorageSync(k); } catch (e) {}
                  }
                });
              } catch (e) {}
              wx.showToast({ title: '缓存已清除', icon: 'success' });
              this.getCacheSize();
              this.loadSettings();
            }
          },
        });
        break;
      case 'about':
        wx.showModal({
          title: '关于滴滴学习版',
          content: '滴滴学习版 v1.0.0\n\n本项目为学习交流用途的小程序仿制版。\n基于微信小程序 + 云开发 + 百度地图API构建。',
          showCancel: false,
          confirmColor: '#2D2A26',
        });
        break;
    }
  },

  // Switch 开关变化
  // 兼容:t-switch 传 { detail: { value } } / 原生 switch 传 e.detail.value
  onSwitchChange(e) {
    // 优先从 dataset 取 key/section(原生 switch 才有 currentTarget)
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const key = ds.key || e.key;
    const section = ds.section || e.section || 'notify';
    // 值兼容:detail.value(原生 / t-switch 一致) + 直接 value
    const checked = !!(e.detail && e.detail.value) || !!e.value;

    this.setData({
      [`${section}.${key}`]: checked,
    }, () => {
      this.saveSettings();
      // 通知开关变更时刷新未读数
      if (section === 'notify') {
        app.refreshUnread();
        // 提示
        const labelMap = { trip: '行程通知', promotion: '优惠通知', system: '系统通知' };
        const label = labelMap[key] || '通知';
        if (this.tMessage) {
          this.tMessage.show({ theme: checked ? 'success' : 'info', content: (checked ? '已开启' : '已关闭') + label, duration: 1500 });
        } else {
          wx.showToast({
            title: checked ? `已开启${label}` : `已关闭${label}`,
            icon: 'none',
          });
        }
      }
    });
  },

  onReady() {
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  // 单位选择
  onUnitSelect(e) {
    const unit = e.currentTarget.dataset.unit;
    this.setData({ unit, showUnitModal: false }, () => {
      this.saveSettings();
      wx.showToast({ title: unit === 'metric' ? '已切换为公里' : '已切换为英里', icon: 'success' });
    });
  },

  // 语言选择
  onLangSelect(e) {
    const lang = e.currentTarget.dataset.lang;
    this.setData({ language: lang, showLangModal: false }, () => {
      this.saveSettings();
      wx.showToast({ title: lang === 'zh' ? '已切换为简体中文' : 'Switched to English', icon: 'success' });
    });
  },

  // 关闭弹窗
  closeModals() {
    this.setData({ showUnitModal: false, showLangModal: false });
  },

  stopPropagation() {
    // 阻止冒泡
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#e74c3c',
      cancelColor: '#999',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('token');
          this.setData({
            hasLogin: false,
            userInfo: {},
          });
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  },
});
