// pages/agreement/agreement.js
const STORAGE_KEY = 'agreementAccepted';

Page({
  data: {
    agreed: false,
  },

  onLoad() {
    // 读取是否已同意
    const accepted = wx.getStorageSync(STORAGE_KEY) || false;
    if (accepted) {
      this.setData({ agreed: true });
    }
  },

  // 切换同意状态
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // 确认
  onConfirm() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选同意', icon: 'none' });
      return;
    }
    wx.setStorageSync(STORAGE_KEY, true);
    wx.showToast({ title: '已同意协议', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack();
    }, 800);
  },
});
