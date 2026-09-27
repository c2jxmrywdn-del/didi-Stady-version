// pages/chat/chat.js — 聊天详情页(乘客 ↔ 司机)
const chatStore = require('../../utils/chatStore');
const app = getApp();

const QUICK_REPLIES_DRIVER = [
  '我已到达上车点',
  '请稍等片刻',
  '你到哪里了？',
  '我看到你了',
  '请按导航过来',
  '可以走XX路吗',
];

const QUICK_REPLIES_SERVICE = [
  '我要开发票',
  '联系不上司机',
  '车费问题',
  '物品遗失',
  '投诉建议',
];

Page({
  data: {
    sessionId: '',
    session: null,
    target: {},         // 对方信息
    messages: [],
    currentUserId: chatStore.CURRENT_USER_ID,
    inputValue: '',
    scrollIntoView: '',
    showQuickReplies: false,
    quickReplies: [],
    showOrder: false,
    order: null,
    serviceSubtitle: '7x24小时为您服务',
    passengerInfo: {
      id: chatStore.CURRENT_USER_ID,
      name: '我',
      avatar: '🙋',
    },
  },

  onLoad(options) {
    const sessionId = options.sessionId;
    const isService = options.type === 'service';

    if (isService) {
      this.initServiceChat();
    } else if (sessionId) {
      this.initSessionChat(sessionId);
    } else {
      wx.showToast({ title: '会话不存在', icon: 'none' });
      wx.navigateBack();
    }
  },

  onShow() {
    this.scrollToBottom();
  },

  onUnload() {
    // 离开时标记已读
    if (this.data.sessionId) {
      chatStore.markSessionRead(this.data.sessionId);
    }
  },

  // 初始化司机会话
  initSessionChat(sessionId) {
    const session = chatStore.getSession(sessionId);
    if (!session) {
      wx.showToast({ title: '会话不存在', icon: 'none' });
      wx.navigateBack();
      return;
    }

    const messages = this.formatMessages(session.messages || []);
    const order = session.orderId ? this.buildOrderInfo(session) : null;

    this.setData({
      sessionId,
      session,
      target: {
        id: session.targetId,
        name: session.targetName,
        avatar: session.targetAvatar,
        subtitle: session.targetSubtitle,
        online: session.orderStatus === 'riding' || session.orderStatus === 'waiting',
      },
      messages,
      showOrder: !!order,
      order,
      quickReplies: QUICK_REPLIES_DRIVER,
    });

    wx.setNavigationBarTitle({ title: session.targetName || '聊天' });
    chatStore.markSessionRead(sessionId);
    setTimeout(() => this.scrollToBottom(), 100);
  },

  // 初始化客服会话
  initServiceChat() {
    const userInfoStr = wx.getStorageSync('userInfo');
    const userInfo = userInfoStr ? JSON.parse(userInfoStr) : {};
    const myName = userInfo.nickName || '我';
    const myAvatar = userInfo.avatarUrl || '🙋';

    // 检查是否已有客服会话
    const sessions = chatStore.listSessions();
    let serviceSession = sessions.find(s => s.type === 'service');

    if (!serviceSession) {
      // 创建客服会话
      serviceSession = {
        id: 'session_service',
        type: 'service',
        targetId: 'service_001',
        targetName: '滴滴学习版客服',
        targetAvatar: '🎧',
        targetSubtitle: '在线客服',
        messages: [
          {
            id: 'sys_welcome',
            from: 'system',
            fromName: '系统',
            type: 'system',
            content: '欢迎使用滴滴学习版客服，请描述您的问题',
            timestamp: Date.now(),
          },
        ],
        lastTimestamp: Date.now(),
      };
      sessions.push(serviceSession);
      wx.setStorageSync('chatSessions', sessions);
    }

    this.setData({
      sessionId: serviceSession.id,
      session: serviceSession,
      target: {
        id: 'service_001',
        name: '滴滴学习版客服',
        avatar: '🎧',
        subtitle: '在线客服',
        online: true,
      },
      passengerInfo: { id: chatStore.CURRENT_USER_ID, name: myName, avatar: myAvatar },
      messages: this.formatMessages(serviceSession.messages || []),
      quickReplies: QUICK_REPLIES_SERVICE,
    });
    wx.setNavigationBarTitle({ title: '在线客服' });
    chatStore.markSessionRead(serviceSession.id);
    setTimeout(() => this.scrollToBottom(), 100);
  },

  // 构造订单信息
  buildOrderInfo(session) {
    const statusMap = {
      waiting: '等待接驾',
      riding: '行程中',
      arriving: '即将到达',
      arrived: '已到达',
      completed: '已完成',
      cancelled: '已取消',
    };
    return {
      id: session.orderId,
      status: session.orderStatus || 'riding',
      statusText: statusMap[session.orderStatus] || '行程中',
      startAddress: '当前位置',
      endAddress: '目的地',
    };
  },

  // 格式化消息列表
  formatMessages(rawMessages) {
    if (!rawMessages || rawMessages.length === 0) return [];
    const result = [];
    let lastTs = 0;
    for (let i = 0; i < rawMessages.length; i++) {
      const m = rawMessages[i];
      const ts = m.timestamp || 0;
      // 5分钟以上的间隔显示时间
      const showTime = !lastTs || (ts - lastTs) > 5 * 60 * 1000;
      result.push({
        ...m,
        showTime,
        timeText: showTime ? this.formatMessageTime(ts) : '',
        avatar: m.from === chatStore.CURRENT_USER_ID ? this.data.passengerInfo.avatar : (this.data.target.avatar || '🚗'),
      });
      lastTs = ts;
    }
    return result;
  },

  formatMessageTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) {
      return `今天 ${hh}:${mm}`;
    }
    if (d.getFullYear() === now.getFullYear()) {
      return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`;
  },

  // 输入变化
  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // 发送
  onSend() {
    const value = this.data.inputValue.trim();
    if (!value || !this.data.sessionId) return;

    chatStore.sendMessage(this.data.sessionId, value);
    this.setData({ inputValue: '' });
    this.refreshMessages();

    // 客服会话自动回复
    if (this.data.session && this.data.session.type === 'service') {
      setTimeout(() => {
        const responses = [
          '已收到您的问题，正在为您处理...',
          '感谢您的反馈，我们会在24小时内回复',
          '请问您还有其他问题吗？',
          '请提供订单号以便我们查询',
        ];
        const reply = responses[Math.floor(Math.random() * responses.length)];
        const allSessions = chatStore.listSessions();
        const sess = allSessions.find(s => s.id === this.data.sessionId);
        if (sess) {
          sess.messages.push({
            id: 'msg_' + Date.now(),
            from: 'service_001',
            fromName: '客服',
            type: 'text',
            content: reply,
            timestamp: Date.now(),
          });
          sess.lastTimestamp = Date.now();
          wx.setStorageSync('chatSessions', allSessions);
          this.refreshMessages();
        }
      }, 1200);
    }
  },

  // 切换快捷回复
  onToggleQuickReplies() {
    this.setData({ showQuickReplies: !this.data.showQuickReplies });
  },

  // 点击快捷回复
  onQuickReply(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({
      inputValue: text,
      showQuickReplies: false,
    });
    setTimeout(() => this.onSend(), 100);
  },

  // 发送位置
  onSendLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        chatStore.sendLocation(this.data.sessionId, res.latitude, res.longitude, '我的位置');
        this.refreshMessages();
      },
      fail: () => {
        // 模拟位置
        chatStore.sendLocation(this.data.sessionId, 39.908823, 116.397470, '我的位置');
        this.refreshMessages();
      },
    });
  },

  // 发送语音(模拟)
  onSendVoice() {
    wx.showToast({ title: '长按可录制语音，点击仅模拟', icon: 'none' });
    const allSessions = chatStore.listSessions();
    const sess = allSessions.find(s => s.id === this.data.sessionId);
    if (sess) {
      sess.messages.push({
        id: 'msg_' + Date.now(),
        from: chatStore.CURRENT_USER_ID,
        fromName: '我',
        type: 'voice',
        content: '语音消息',
        duration: 3 + Math.floor(Math.random() * 10),
        timestamp: Date.now(),
      });
      sess.lastTimestamp = Date.now();
      wx.setStorageSync('chatSessions', allSessions);
      this.refreshMessages();
    }
  },

  // 播放语音
  onPlayVoice(e) {
    const item = e.currentTarget.dataset.item;
    wx.showToast({ title: `播放 ${item.duration || 0}秒 语音`, icon: 'none' });
  },

  // 点击位置
  onLocationTap(e) {
    const item = e.currentTarget.dataset.item;
    if (item.latitude && item.longitude) {
      wx.openLocation({
        latitude: item.latitude,
        longitude: item.longitude,
        name: item.content || '位置',
        scale: 16,
      });
    }
  },

  // 点击图片
  onImageTap(e) {
    const item = e.currentTarget.dataset.item;
    if (item.content) {
      wx.previewImage({ urls: [item.content] });
    }
  },

  // 点击订单
  onOrderTap() {
    if (this.data.order && this.data.order.id) {
      // 跳转到订单详情
      wx.navigateTo({
        url: `/pages/order-detail/order-detail?orderId=${this.data.order.id}`,
      });
    }
  },

  // 刷新消息
  refreshMessages() {
    const session = chatStore.getSession(this.data.sessionId);
    if (!session) return;
    const messages = this.formatMessages(session.messages || []);
    this.setData({ messages, session }, () => {
      this.scrollToBottom();
    });
  },

  // 滚动到底部
  scrollToBottom() {
    const messages = this.data.messages;
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1].id;
    this.setData({ scrollIntoView: 'msg-' + lastId });
  },
});
