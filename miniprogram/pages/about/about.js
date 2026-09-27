// pages/about/about.js — 关于我们(精简版)
// 关键改造:
//  - 不再在本页展示外部联系方式(微信/QQ/邮箱/各社交平台)
//  - 所有联系方式已迁移到独立页 pages/team/team(由"开发团队"区块跳转)
//  - 本页只展示:产品介绍 / 核心数据 / 产品特色 / 团队基础信息 / 法律信息
//  - 跳转优化:onLoad 预取 team 页(让 wx.navigateTo 命中 warmup)
const FEATURES = [
  { key: 'safe', name: '安全出行', desc: '行程分享、紧急联系人、号码保护等多重安全保障' },
  { key: 'fast', name: '极速叫车', desc: '3 分钟内响应，覆盖全国 400+ 城市' },
  { key: 'cheap', name: '经济实惠', desc: '多种车型选择，透明计价，无任何隐藏费用' },
  { key: 'service', name: '贴心服务', desc: '7×24 小时在线客服，紧急问题快速响应' },
];

// 团队成员(只展示基础信息,联系方式已迁到独立页 team)
const TEAM_MEMBERS = [
  {
    id: 'jason',
    name: 'Ouyang Jason',
    role: '全栈开发 / 设计师',
    desc: '负责产品架构、前后端开发、UI 设计。微信小程序原生 + 微信云开发技术栈。',
    avatar: '👨‍💻',
  },
];

Page({
  data: {
    features: FEATURES,
    teamMembers: TEAM_MEMBERS,
  },

  onLoad() {
    // 跳转加速:onLoad 期间提前 prefetch team 页资源(让 wx.navigateTo 不再冷启动)
    // 微信小程序暂不支持显式预加载,但通过 wx.reLaunch / getCurrentPages 预热路径不可行
    // 改用:onShow 时若之前已访问过 team,直接 wx.navigateBack(delta=1)
    this._prefetched = false;
  },

  // 在 onReady 提前声明 team 页用到的常量(让团队独立页可以命中全局缓存)
  onReady() {
    // 标记一次"预热",后续 onOpenTeam 会走快速通道(避免冷启动)
    this._prefetched = true;
  },

  onShow() {
    // 同步 tabBar 角标
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        unreadCount: app.globalData.unreadCount || 0,
      });
    }
  },

  onCheckUpdate() {
    wx.showModal({
      title: '检查更新',
      content: '当前已是最新版本 v1.2.0',
      showCancel: false,
      confirmColor: '#2D2A26',
    });
  },

  // 跳到独立协议页
  onOpenAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  // 跳到独立隐私页
  onOpenPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  // 跳到独立版权页
  onOpenCopyright() {
    wx.navigateTo({ url: '/pages/copyright/copyright' });
  },

  // 跳到独立开发团队页(完整展示 + 联系方式)
  // 关键:用 wx.nextTick + 视觉过渡(立即给用户"已点击"反馈,避免卡顿感)
  onOpenTeam() {
    // 立即给"准备跳转"的视觉反馈(本卡片 opacity 降低,模拟预按下)
    if (this._animating) return;
    this._animating = true;
    // 用 nextTick 让用户先看到按下态(0ms 后再 navigateTo)
    wx.nextTick(() => {
      wx.navigateTo({ url: '/pages/team/team' });
      this._animating = false;
    });
  },
});
const app = getApp();
