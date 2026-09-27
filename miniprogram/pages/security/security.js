// pages/security/security.js
const STORAGE_KEY = 'securitySettings';

const DEFAULT_FEATURES = [
  { key: 'tripShare', name: '行程分享', desc: '将行程分享给亲友，实时查看您的位置', enabled: true, color: 'green' },
  { key: 'emergencyCall', name: '紧急求助', desc: '一键拨打报警电话，行程自动通知紧急联系人', enabled: true, color: 'red' },
  { key: 'numberProtect', name: '号码保护', desc: '司机乘客双方虚拟号码联系，保护隐私', enabled: true, color: 'blue' },
  { key: 'record', name: '行程录音', desc: '开启录音可在发生纠纷时提供凭证', enabled: false, color: 'orange' },
  { key: 'verification', name: '人脸验证', desc: '司机接驾前进行人脸识别，确保本人接单', enabled: true, color: 'purple' },
];

Page({
  data: {
    features: [],
  },

  onLoad() {
    this.loadSettings();
  },

  onShow() {
    this.loadSettings();
  },

  loadSettings() {
    let saved = wx.getStorageSync(STORAGE_KEY) || {};
    const features = DEFAULT_FEATURES.map(f => ({
      ...f,
      enabled: saved[f.key] !== undefined ? saved[f.key] : f.enabled,
    }));
    this.setData({ features });
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    const checked = e.detail.value;
    const features = this.data.features.map(f => f.key === key ? { ...f, enabled: checked } : f);
    this.setData({ features });
    const saved = {};
    features.forEach(f => { saved[f.key] = f.enabled; });
    wx.setStorageSync(STORAGE_KEY, saved);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onEmergencyCall() {
    wx.showModal({
      title: '紧急求助',
      content: '将拨打 110 报警电话，并通知您的紧急联系人。是否继续？',
      confirmText: '立即拨打',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({ phoneNumber: '110' });
        }
      },
    });
  },

  onFakeCall() {
    wx.showModal({
      title: '虚拟来电',
      content: '虚拟来电功能开发中，敬请期待',
      showCancel: false,
      confirmColor: '#2D2A26',
    });
  },

  onShareLocation() {
    wx.showModal({
      title: '行程分享',
      content: '请在行程中点击「分享」按钮分享给亲友',
      showCancel: false,
      confirmColor: '#2D2A26',
    });
  },

  onReport() {
    wx.showModal({
      title: '一键举报',
      content: '请在订单详情页使用举报功能',
      showCancel: false,
      confirmColor: '#2D2A26',
    });
  },
});
