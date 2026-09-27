// pages/message-detail/message-detail.js — 消息详情页
const messageStore = require('../../utils/messageStore');
const app = getApp();

Page({
  data: {
    message: null,
  },

  onLoad(options) {
    if (options.message) {
      try {
        const msg = JSON.parse(decodeURIComponent(options.message));
        this.setData({ message: msg });
        // 标记已读
        if (msg.id && !msg.read) {
          messageStore.markRead(msg.id);
        }
        wx.setNavigationBarTitle({ title: msg.title || '消息详情' });
      } catch (e) {
        console.error('解析消息失败', e);
        wx.navigateBack();
      }
    } else {
      wx.navigateBack();
    }
  },

  onActionClick() {
    const msg = this.data.message;
    if (!msg || !msg.action) return;

    const { type, url, phone, text } = msg.action;
    if (type === 'navigate' && url) {
      const tabPages = [
        '/pages/index/index',
        '/pages/trip/trip',
        '/pages/message/message',
        '/pages/profile/profile',
      ];
      if (tabPages.indexOf(url) > -1) {
        wx.switchTab({ url });
      } else {
        wx.navigateTo({ url });
      }
    } else if (type === 'call' && phone) {
      wx.makePhoneCall({ phoneNumber: phone });
    } else if (type === 'copy' && text) {
      wx.setClipboardData({
        data: text,
        success: () => wx.showToast({ title: '已复制', icon: 'success' }),
      });
    } else if (type === 'chat') {
      // 跳转到客服会话
      wx.navigateTo({ url: '/pages/chat/chat?type=service' });
    } else {
      wx.showToast({ title: '操作已触发', icon: 'none' });
    }
  },
});
