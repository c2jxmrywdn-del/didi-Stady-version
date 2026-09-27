// pages/copyright/copyright.js
Page({
  data: {},

  onLoad() {},

  // 复制作者
  onCopyAuthor() {
    wx.setClipboardData({
      data: '@ouyang jason',
      success: () => wx.showToast({ title: '已复制作者名', icon: 'success' }),
    });
  },

  // 复制邮箱
  onCopyEmail() {
    wx.setClipboardData({
      data: '3514485358@qq.com',
      success: () => wx.showToast({ title: '已复制邮箱', icon: 'success' }),
    });
  },
});
