/**
 * 聊天消息存储工具 - 模拟乘客与司机的会话
 */

const STORAGE_KEY = 'chatSessions';
const CURRENT_USER_ID = 'me';  // 乘客
const DRIVER_DEFAULT_AVATAR = '🚗';
const PASSENGER_DEFAULT_AVATAR = '🙋';

// 模拟数据：会话列表
const DEFAULT_SESSIONS = [
  {
    id: 'session_1',
    type: 'driver',
    targetId: 'driver_1',
    targetName: '王师傅',
    targetAvatar: '👨',
    targetSubtitle: '京A·88888 丰田凯美瑞',
    orderId: 'order_demo_1',
    orderStatus: 'completed',
    messages: [
      {
        id: 'm1',
        from: CURRENT_USER_ID,
        fromName: '我',
        type: 'text',
        content: '师傅，我已经到达上车点了',
        timestamp: Date.now() - 3600000,
      },
      {
        id: 'm2',
        from: 'driver_1',
        fromName: '王师傅',
        type: 'text',
        content: '好的，我看到您了，马上到',
        timestamp: Date.now() - 3500000,
      },
      {
        id: 'm3',
        from: 'driver_1',
        fromName: '王师傅',
        type: 'location',
        content: '我的位置',
        latitude: 39.908823,
        longitude: 116.397470,
        timestamp: Date.now() - 3400000,
      },
      {
        id: 'm4',
        from: CURRENT_USER_ID,
        fromName: '我',
        type: 'text',
        content: '好的，看到您了',
        timestamp: Date.now() - 3300000,
      },
    ],
    lastTimestamp: Date.now() - 3300000,
  },
  {
    id: 'session_2',
    type: 'driver',
    targetId: 'driver_2',
    targetName: '李师傅',
    targetAvatar: '👨‍🦱',
    targetSubtitle: '京B·66666 本田雅阁',
    orderId: 'order_demo_2',
    orderStatus: 'riding',
    messages: [
      {
        id: 'm5',
        from: 'driver_2',
        fromName: '李师傅',
        type: 'text',
        content: '您好，我已经接到您的订单了',
        timestamp: Date.now() - 600000,
      },
      {
        id: 'm6',
        from: 'driver_2',
        fromName: '李师傅',
        type: 'voice',
        content: '语音消息 5秒',
        duration: 5,
        timestamp: Date.now() - 500000,
      },
    ],
    lastTimestamp: Date.now() - 500000,
  },
];

function getSessions() {
  let sessions = wx.getStorageSync(STORAGE_KEY);
  if (!sessions || !sessions.length) {
    sessions = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
    wx.setStorageSync(STORAGE_KEY, sessions);
  }
  return sessions;
}

function saveSessions(sessions) {
  wx.setStorageSync(STORAGE_KEY, sessions);
}

// 获取所有会话
function listSessions() {
  return getSessions().sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
}

// 根据 ID 获取会话
function getSession(id) {
  return getSessions().find(s => s.id === id);
}

// 创建或获取司机会话（同一司机只存在一个会话）
function getOrCreateDriverSession(driverInfo, orderId) {
  const sessions = getSessions();
  let session = sessions.find(s => s.targetId === driverInfo.name);
  if (session) {
    // 更新订单信息
    if (orderId) session.orderId = orderId;
    if (driverInfo.car) session.targetSubtitle = `${driverInfo.car} ${driverInfo.carModel || ''}`;
    saveSessions(sessions);
    return session;
  }
  session = {
    id: 'session_' + Date.now(),
    type: 'driver',
    targetId: driverInfo.name,
    targetName: driverInfo.name,
    targetAvatar: driverInfo.avatar || DRIVER_DEFAULT_AVATAR,
    targetSubtitle: `${driverInfo.car || ''} ${driverInfo.carModel || ''}`.trim(),
    orderId: orderId || null,
    orderStatus: 'riding',
    messages: [],
    lastTimestamp: Date.now(),
  };
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

// 发送消息
function sendMessage(sessionId, message) {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const msg = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    from: CURRENT_USER_ID,
    fromName: '我',
    type: 'text',
    content: message,
    timestamp: Date.now(),
    status: 'sending',
  };

  session.messages.push(msg);
  session.lastTimestamp = msg.timestamp;
  saveSessions(sessions);

  // 模拟司机自动回复（仅 1-2 条）
  setTimeout(() => {
    const replies = [
      '好的，收到',
      '请稍等一下',
      '我马上到',
      '您在哪里？我快到了',
      '已确认，谢谢',
      '请系好安全带',
    ];
    const reply = {
      id: 'msg_' + Date.now() + '_reply',
      from: session.targetId,
      fromName: session.targetName,
      type: 'text',
      content: replies[Math.floor(Math.random() * replies.length)],
      timestamp: Date.now(),
    };
    const sessionsNow = getSessions();
    const sess = sessionsNow.find(s => s.id === sessionId);
    if (sess) {
      sess.messages.push(reply);
      sess.lastTimestamp = reply.timestamp;
      saveSessions(sessionsNow);
    }
  }, 1500 + Math.random() * 2000);

  return msg;
}

// 发送位置
function sendLocation(sessionId, latitude, longitude, address) {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const msg = {
    id: 'msg_' + Date.now(),
    from: CURRENT_USER_ID,
    fromName: '我',
    type: 'location',
    content: address || '我的位置',
    latitude,
    longitude,
    timestamp: Date.now(),
  };

  session.messages.push(msg);
  session.lastTimestamp = msg.timestamp;
  saveSessions(sessions);
  return msg;
}

// 发送快捷回复
function sendQuickReply(sessionId, content) {
  return sendMessage(sessionId, content);
}

// 删除会话
function removeSession(sessionId) {
  const sessions = getSessions().filter(s => s.id !== sessionId);
  saveSessions(sessions);
  return true;
}

// 清空会话消息（保留会话）
function clearSessionMessages(sessionId) {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.messages = [];
    session.lastTimestamp = Date.now();
    saveSessions(sessions);
  }
}

// 获取会话的未读数
function getUnreadCount(sessionId) {
  const session = getSession(sessionId);
  if (!session) return 0;
  return session.messages.filter(m => m.from !== CURRENT_USER_ID && !m.read).length;
}

// 获取所有会话的未读总数
function getTotalUnreadCount() {
  return getSessions().reduce((total, s) => {
    return total + (s.messages || []).filter(m => m.from !== CURRENT_USER_ID && !m.read).length;
  }, 0);
}

// 标记会话已读
function markSessionRead(sessionId) {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.messages.forEach(m => {
      if (m.from !== CURRENT_USER_ID) m.read = true;
    });
    saveSessions(sessions);
  }
}

// 模拟司机发送系统消息（如"已到达上车点"）
function pushSystemMessage(sessionId, content, type = 'system') {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;
  const msg = {
    id: 'sys_' + Date.now(),
    from: 'system',
    fromName: '系统',
    type,
    content,
    timestamp: Date.now(),
  };
  session.messages.push(msg);
  session.lastTimestamp = msg.timestamp;
  saveSessions(sessions);
  return msg;
}

module.exports = {
  CURRENT_USER_ID,
  PASSENGER_DEFAULT_AVATAR,
  listSessions,
  getSession,
  getOrCreateDriverSession,
  sendMessage,
  sendLocation,
  sendQuickReply,
  removeSession,
  clearSessionMessages,
  getUnreadCount,
  getTotalUnreadCount,
  markSessionRead,
  pushSystemMessage,
};
