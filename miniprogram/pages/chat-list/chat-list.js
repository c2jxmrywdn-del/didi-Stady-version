// pages/chat-list/chat-list.js — 会话列表页
const chatStore = require('../../utils/chatStore');
const app = getApp();

Page({
  data: {
    sessions: [],
    filteredSessions: [],
    unreadCount: 0,
    searchValue: '',
    serviceSubtitle: '7x24小时在线为您服务',
    actionMenuSession: null,
  },

  onLoad() {
    this.loadSessions();
  },

  onShow() {
    this.loadSessions();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onPullDownRefresh() {
    this.loadSessions();
    wx.stopPullDownRefresh();
  },

  loadSessions() {
    const sessions = chatStore.listSessions();
    const enriched = sessions.map(s => this.enrichSession(s));
    this.setData({
      sessions: enriched,
      filteredSessions: this.filterSessions(enriched, this.data.searchValue),
      unreadCount: chatStore.getTotalUnreadCount(),
    });
    app.globalData.chatUnreadCount = this.data.unreadCount;
  },

  enrichSession(s) {
    const lastMsg = s.messages && s.messages.length > 0 ? s.messages[s.messages.length - 1] : null;
    const unread = (s.messages || []).filter(m => m.from !== chatStore.CURRENT_USER_ID && !m.read).length;
    return {
      ...s,
      lastMessage: lastMsg ? lastMsg.content : '',
      lastMessageType: lastMsg ? lastMsg.type : '',
      lastTimeText: lastMsg ? this.formatTime(lastMsg.timestamp) : '',
      unread,
    };
  },

  filterSessions(sessions, keyword) {
    if (!keyword) return sessions;
    const k = keyword.toLowerCase();
    return sessions.filter(s =>
      s.targetName.toLowerCase().includes(k) ||
      (s.targetSubtitle || '').toLowerCase().includes(k) ||
      (s.lastMessage || '').toLowerCase().includes(k)
    );
  },

  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + '天前';
    return (d.getMonth() + 1) + '/' + d.getDate();
  },

  onSearchInput(e) {
    const value = e.detail.value;
    this.setData({
      searchValue: value,
      filteredSessions: this.filterSessions(this.data.sessions, value),
    });
  },

  onSessionTap(e) {
    const session = e.currentTarget.dataset.session;
    wx.navigateTo({
      url: `/pages/chat/chat?sessionId=${session.id}`,
    });
  },

  onSessionLongPress(e) {
    const session = e.currentTarget.dataset.session;
    this.setData({ actionMenuSession: session });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  onCloseAction() {
    this.setData({ actionMenuSession: null });
  },

  onActionMarkRead() {
    const session = this.data.actionMenuSession;
    if (!session) return;
    if (session.unread > 0) {
      // 标记已读
      const allSessions = chatStore.listSessions();
      const target = allSessions.find(s => s.id === session.id);
      if (target) {
        target.messages.forEach(m => {
          if (m.from !== chatStore.CURRENT_USER_ID) m.read = true;
        });
        wx.setStorageSync('chatSessions', allSessions);
        wx.showToast({ title: '已标为已读', icon: 'success' });
      }
    } else {
      // 标记为未读：将最后一条对方消息置为未读
      const allSessions = chatStore.listSessions();
      const target = allSessions.find(s => s.id === session.id);
      if (target && target.messages.length > 0) {
        for (let i = target.messages.length - 1; i >= 0; i--) {
          if (target.messages[i].from !== chatStore.CURRENT_USER_ID) {
            target.messages[i].read = false;
            break;
          }
        }
        wx.setStorageSync('chatSessions', allSessions);
        wx.showToast({ title: '已标为未读', icon: 'success' });
      }
    }
    this.setData({ actionMenuSession: null });
    this.loadSessions();
  },

  onActionClear() {
    const session = this.data.actionMenuSession;
    if (!session) return;
    wx.showModal({
      title: '清空聊天记录',
      content: `确定清空与 ${session.targetName} 的聊天记录吗？`,
      confirmColor: '#2D2A26',
      success: (res) => {
        if (res.confirm) {
          chatStore.clearSessionMessages(session.id);
          wx.showToast({ title: '已清空', icon: 'success' });
          this.setData({ actionMenuSession: null });
          this.loadSessions();
        }
      },
    });
  },

  onActionDelete() {
    const session = this.data.actionMenuSession;
    if (!session) return;
    wx.showModal({
      title: '删除会话',
      content: `确定删除与 ${session.targetName} 的会话吗？`,
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          chatStore.removeSession(session.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.setData({ actionMenuSession: null });
          this.loadSessions();
        }
      },
    });
  },

  onServiceTap() {
    // 客服会话
    wx.navigateTo({
      url: '/pages/chat/chat?type=service',
    });
  },
});
