// pages/message/message.js — 消息中心
// 核心改造:不同门类(type)分组;同门类多条按"主标题"合并为汇总卡片
// - currentCategory === "all":渲染 6 个 section,每个 section 内按 title 合并
// - currentCategory === 具体 type:沿用原"按日期分组"展示该 type 的明细,便于逐条阅读
const messageStore = require("../../utils/messageStore");
const chatStore = require("../../utils/chatStore");
const app = getApp();

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: messageStore.TYPE.ORDER, label: "行程" },
  { key: messageStore.TYPE.PROMO, label: "优惠" },
  { key: messageStore.TYPE.SYSTEM, label: "系统" },
  { key: messageStore.TYPE.SAFETY, label: "安全" },
];

// 用于"全部"视图:定义门类(出现顺序)和中文 label
const TYPE_SECTIONS = [
  { key: messageStore.TYPE.ORDER,   label: "行程",   icon: "mi-car" },
  { key: messageStore.TYPE.DRIVER,  label: "司机",   icon: "mi-driver" },
  { key: messageStore.TYPE.PROMO,   label: "优惠",   icon: "mi-gift" },
  { key: messageStore.TYPE.SYSTEM,  label: "系统",   icon: "mi-bell" },
  { key: messageStore.TYPE.SAFETY,  label: "安全",   icon: "mi-shield" },
  { key: messageStore.TYPE.SERVICE, label: "客服",   icon: "mi-service" },
];

Page({
  data: {
    categories: CATEGORIES,
    typeSections: TYPE_SECTIONS,
    currentCategory: "all",
    messages: [],
    grouped: [],           // 指定 type 视图:按日期分组
    sections: [],          // 全部视图:按 type 分组(section 内已合并)
    expandedSection: "",   // 当前展开的 type(空=全部收起,显示合并汇总)
    unreadCount: 0,
    hasUnread: false,
    selectedIds: [],
    selectMode: false,
    detail: null,
    chatUnread: 0,
  },

  onLoad() {
    messageStore.seedIfEmpty();
    this.loadMessages();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2, unreadCount: app.globalData.unreadCount || 0 });
    }
    this.loadMessages();
  },

  onPullDownRefresh() {
    this.loadMessages();
    wx.stopPullDownRefresh();
  },

  onMessagesUpdated() {
    this.loadMessages();
  },

  loadMessages() {
    const list = messageStore.filterByCategory(this.data.currentCategory);
    const grouped = this.groupByDate(list);
    const sections = this.data.currentCategory === "all" ? this.buildSections(list) : [];
    const unreadCount = messageStore.getUnreadCount();
    const chatUnread = chatStore.getTotalUnreadCount();
    this.setData({
      messages: list,
      grouped,
      sections,
      unreadCount,
      hasUnread: unreadCount > 0,
      chatUnread,
    });
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ unreadCount });
    }
    app.globalData.unreadCount = unreadCount;
    app.globalData.chatUnreadCount = chatUnread;
  },

  onOpenChatList() {
    wx.navigateTo({ url: '/pages/chat-list/chat-list' });
  },

  // 按日期分组(用于指定 type 视图)
  groupByDate(list) {
    const groups = {};
    list.forEach((m) => {
      const label = this.dateLabel(m.timestamp);
      if (!groups[label]) groups[label] = [];
      groups[label].push(m);
    });
    return Object.keys(groups).map((k) => ({ label: k, items: groups[k] }));
  },

  // ============ 全部视图:按 type 分组,section 内按"主标题"合并 ============
  buildSections(list) {
    // 1) 按 type 分桶
    const byType = {};
    list.forEach((m) => {
      if (!byType[m.type]) byType[m.type] = [];
      byType[m.type].push(m);
    });
    // 2) 按 TYPE_SECTIONS 顺序构造 section(保证 UI 顺序稳定)
    return TYPE_SECTIONS.map((cfg) => {
      const items = byType[cfg.key] || [];
      if (items.length === 0) return null;
      // 同 type 内按主标题(title)合并
      const clusters = this.clusterByTitle(items);
      return {
        key: cfg.key,
        label: cfg.label,
        icon: cfg.icon,
        total: items.length,
        unread: items.filter((m) => !m.read).length,
        latestTime: items[0] && items[0].time, // list 已按时间倒序
        clusters, // [{ title, count, unread, items, latest }]
      };
    }).filter(Boolean);
  },

  // 同 type 内按 title 合并(title 相同的归到一个 cluster)
  clusterByTitle(items) {
    const map = new Map();
    items.forEach((m) => {
      const t = m.title || "未分类";
      if (!map.has(t)) {
        map.set(t, { title: t, count: 0, unread: 0, items: [], latest: m });
      }
      const c = map.get(t);
      c.count += 1;
      if (!m.read) c.unread += 1;
      c.items.push(m);
      if (m.timestamp && (!c.latest || m.timestamp > c.latest.timestamp)) {
        c.latest = m;
      }
    });
    // 按"最新一条时间"倒序
    return Array.from(map.values()).sort((a, b) => {
      return (b.latest && b.latest.timestamp || 0) - (a.latest && a.latest.timestamp || 0);
    });
  },

  // 切换 section 展开/收起
  onToggleSection(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.selectMode) return;
    this.setData({ expandedSection: this.data.expandedSection === key ? "" : key });
  },

  // 点击汇总卡片(在未展开时)→ 展开;已展开时 → 跳到该 cluster 第一条详情
  onClusterTap(e) {
    if (this.data.selectMode) return;
    const { section, clusterIdx } = e.currentTarget.dataset;
    if (this.data.expandedSection !== section) {
      this.setData({ expandedSection: section });
      return;
    }
    const sec = (this.data.sections || []).find((s) => s.key === section);
    if (!sec) return;
    const cluster = (sec.clusters || [])[clusterIdx];
    if (!cluster || !cluster.latest) return;
    if (!cluster.latest.read) {
      messageStore.markRead(cluster.latest.id);
    }
    this.openMessage(cluster.latest);
  },

  // 汇总卡片内点具体某条
  onClusterItemTap(e) {
    if (this.data.selectMode) return;
    const id = e.currentTarget.dataset.id;
    const msg = this.data.messages.find((m) => m.id === id);
    if (!msg) return;
    if (!msg.read) messageStore.markRead(id);
    this.openMessage(msg);
  },

  dateLabel(ts) {
    if (!ts) return "更早";
    const d = new Date(ts);
    const now = new Date();
    const diffDay = Math.floor((now - d) / (24 * 60 * 60 * 1000));
    if (diffDay <= 0) return "今天";
    if (diffDay === 1) return "昨天";
    if (diffDay < 7) return "本周";
    if (d.getFullYear() === now.getFullYear()) {
      return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  },

  onCategoryChange(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.selectMode) return;
    this.setData({ currentCategory: key, expandedSection: "" });
    this.loadMessages();
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.selectMode) {
      this.toggleSelect(id);
      return;
    }
    const msg = this.data.messages.find((m) => m.id === id);
    if (!msg) return;
    if (!msg.read) {
      messageStore.markRead(id);
      this.loadMessages();
    }
    // 进入详情/触发 action
    this.openMessage(msg);
  },

  onItemLongPress(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.selectMode) {
      this.toggleSelect(id);
      return;
    }
    this.setData({ selectMode: true, selectedIds: [id] });
    wx.vibrateShort && wx.vibrateShort({ type: "light" });
  },

  toggleSelect(id) {
    let ids = [...this.data.selectedIds];
    const idx = ids.indexOf(id);
    if (idx > -1) ids.splice(idx, 1);
    else ids.push(id);
    this.setData({ selectedIds: ids });
  },

  exitSelectMode() {
    this.setData({ selectMode: false, selectedIds: [] });
  },

  onSelectAll() {
    const ids = this.data.messages.map((m) => m.id);
    const allSelected = ids.every((id) => this.data.selectedIds.includes(id));
    this.setData({ selectedIds: allSelected ? [] : ids });
  },

  onMarkReadSelected() {
    const { selectedIds } = this.data;
    if (!selectedIds.length) {
      wx.showToast({ title: "请选择消息", icon: "none" });
      return;
    }
    selectedIds.forEach((id) => messageStore.markRead(id));
    wx.showToast({ title: "已标记为已读", icon: "success" });
    this.exitSelectMode();
    this.loadMessages();
  },

  onDeleteSelected() {
    const { selectedIds } = this.data;
    if (!selectedIds.length) {
      wx.showToast({ title: "请选择消息", icon: "none" });
      return;
    }
    wx.showModal({
      title: "删除消息",
      content: `确定删除选中的 ${selectedIds.length} 条消息吗？`,
      confirmColor: "#e74c3c",
      success: (res) => {
        if (!res.confirm) return;
        messageStore.removeMany(selectedIds);
        wx.showToast({ title: "已删除", icon: "success" });
        this.exitSelectMode();
        this.loadMessages();
      },
    });
  },

  onReadAll() {
    messageStore.markAllRead();
    wx.showToast({ title: "已全部已读", icon: "success" });
    this.loadMessages();
  },

  onOpenSettings() {
    wx.navigateTo({ url: "/pages/setting/setting" });
  },

  onClearRead() {
    wx.showModal({
      title: "清空已读",
      content: "确定清空所有已读消息吗？未读消息将保留。",
      confirmColor: "#e74c3c",
      success: (res) => {
        if (!res.confirm) return;
        messageStore.clearRead();
        wx.showToast({ title: "已清空", icon: "success" });
        this.loadMessages();
      },
    });
  },

  onClearAll() {
    wx.showModal({
      title: "清空消息",
      content: "确定清空全部消息吗？此操作不可恢复。",
      confirmColor: "#e74c3c",
      success: (res) => {
        if (!res.confirm) return;
        messageStore.clear();
        wx.showToast({ title: "已清空", icon: "success" });
        this.loadMessages();
      },
    });
  },

  onActionClick(e) {
    const id = e.currentTarget.dataset.id;
    const msg = this.data.messages.find((m) => m.id === id);
    if (msg) this.openMessage(msg, true);
  },

  openMessage(msg) {
    // 跳转到独立详情页（更完整的展示）
    if (msg.type === 'order' || msg.type === 'promo' || msg.type === 'safety' || msg.summary) {
      const encoded = encodeURIComponent(JSON.stringify(msg));
      wx.navigateTo({
        url: `/pages/message-detail/message-detail?message=${encoded}`,
      });
      return;
    }

    // 有跳转动作
    if (msg.action && msg.action.type === "navigate" && msg.action.url) {
      const url = msg.action.url;
      // 区分 switchTab / navigateTo
      const tabPages = [
        "/pages/index/index",
        "/pages/trip/trip",
        "/pages/message/message",
        "/pages/profile/profile",
      ];
      if (tabPages.indexOf(url) > -1) {
        wx.switchTab({ url });
      } else {
        wx.navigateTo({ url });
      }
      return;
    }
    if (msg.action && msg.action.type === "call" && msg.action.phone) {
      wx.makePhoneCall({ phoneNumber: msg.action.phone });
      return;
    }
    if (msg.action && msg.action.type === "copy" && msg.action.text) {
      wx.setClipboardData({
        data: msg.action.text,
        success: () => wx.showToast({ title: "已复制", icon: "success" }),
      });
      return;
    }
    if (msg.action && msg.action.type === "chat") {
      wx.navigateTo({ url: '/pages/chat/chat?type=service' });
      return;
    }
    // 默认弹出详情
    this.setData({ detail: msg });
  },

  onCloseDetail() {
    this.setData({ detail: null });
  },

  onDetailAction() {
    const d = this.data.detail;
    if (!d || !d.action) return;
    this.setData({ detail: null });
    this.openMessage(d);
  },

  onDetailDelete() {
    const d = this.data.detail;
    if (!d) return;
    wx.showModal({
      title: "删除消息",
      content: "确定删除该消息吗？",
      confirmColor: "#e74c3c",
      success: (res) => {
        if (!res.confirm) return;
        messageStore.remove(d.id);
        this.setData({ detail: null });
        this.loadMessages();
      },
    });
  },
});
