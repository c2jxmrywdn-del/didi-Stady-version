// pages/team/team.js — 开发团队完整展示页
// 展示团队成员详情 + 联系方式,带可点击复制/打开外部链接
// 来源:about 页里的"开发团队"区块
const app = getApp();

// 团队成员完整数据
const TEAM_MEMBERS = [
  {
    id: 'jason',
    name: 'Ouyang Jason',
    role: '全栈开发 / 设计师',
    bio: '负责产品架构、前后端开发、UI 设计。微信小程序原生 + 微信云开发技术栈,关注代码可维护性与性能。',
    tags: ['全栈开发', 'UI/UX', '云开发', '产品架构'],
    avatar: '👨‍💻',
    location: '中国',
    joinedAt: '2024',
    socials: [
      {
        key: 'twitter',
        icon: 'X',
        name: 'X (Twitter)',
        handle: '@Orion_Yves_Jude',
        url: 'https://x.com/Orion_Yves_Jude',
        bg: 'linear-gradient(135deg, #000000 0%, #2c2c2c 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
      {
        key: 'facebook',
        icon: 'f',
        name: 'Facebook',
        handle: 'Ouyang Jason',
        url: 'https://www.facebook.com/profile.php?id=61590596057471',
        bg: 'linear-gradient(135deg, #1877F2 0%, #0E5FC1 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
      {
        key: 'github',
        icon: 'GH',
        name: 'GitHub',
        handle: '@c2jxmrywdn-del',
        url: 'https://github.com/c2jxmrywdn-del',
        bg: 'linear-gradient(135deg, #24292F 0%, #0d1117 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
      {
        key: 'gitee',
        icon: '码',
        name: 'Gitee',
        handle: '@yourui66',
        url: 'https://gitee.com/yourui66',
        bg: 'linear-gradient(135deg, #C71D23 0%, #A01519 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
      {
        key: 'wechat',
        icon: '微',
        name: '微信',
        handle: 'ouyang061021',
        url: 'ouyang061021',
        bg: 'linear-gradient(135deg, #07C160 0%, #04A14E 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
      {
        key: 'qq',
        icon: 'QQ',
        name: 'QQ',
        handle: '3514485358',
        url: '3514485358',
        bg: 'linear-gradient(135deg, #12B7F5 0%, #0E96D1 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
      {
        key: 'email',
        icon: '@',
        name: 'QQ 邮箱',
        handle: '3514485358@qq.com',
        url: '3514485358@qq.com',
        bg: 'linear-gradient(135deg, #FF7B00 0%, #E55A00 100%)',
        color: '#FFFFFF',
        action: 'copy',
      },
    ],
  },
];

// 项目里程碑
const MILESTONES = [
  { date: '2024.Q4', title: '项目启动', desc: '基于微信小程序原生 + 云开发,完成第一版架构' },
  { date: '2025.Q1', title: '订单中台', desc: '拆 orderFunctions / userFunctions / matchFunctions 三个云函数' },
  { date: '2025.Q2', title: '路线规划', desc: '接入 baiduMap.directionDriving,按真实路径模拟司机行驶' },
  { date: '2025.Q3', title: '订单中心', desc: '本地 + 云端合并,跨页面实时同步,解决数据不互通' },
  { date: '2025.Q4', title: '消息分组', desc: '按门类合并汇总卡片,支持展开/折叠查看明细' },
  { date: '2026.Q2', title: '团队与开源', desc: '完善团队展示页,集中所有联系方式' },
];

// 团队统计数据
const STATS = {
  commits: 0,         // 提交数(可在 onShow 从 userStats 读取)
  features: 5,        // 产品特色数
  pages: 27,          // 页面数(约)
  cloudFunctions: 4,  // 云函数(baiduMap / orderFunctions / userFunctions / matchFunctions)
};

Page({
  data: {
    teamMembers: TEAM_MEMBERS,
    milestones: MILESTONES,
    stats: STATS,
    // 详情展开:每个 member 独立控制,存 key 数组
    expandedMembers: ['jason'], // 默认展开
  },

  onLoad() {},

  onShow() {
    // 同步 tabBar 角标(避免从 team 页返回时数字残留)
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        unreadCount: app.globalData.unreadCount || 0,
      });
    }
  },

  // 切换成员详情展开
  onToggleMember(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = this.data.expandedMembers.slice();
    const idx = expanded.indexOf(id);
    if (idx >= 0) {
      expanded.splice(idx, 1);
    } else {
      expanded.push(id);
    }
    this.setData({ expandedMembers: expanded });
  },

  // 点击联系方式:复制 + 弹 toast
  onSocialTap(e) {
    const { url, name } = e.currentTarget.dataset;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: `${name} 已复制`,
          icon: 'success',
          duration: 1500,
        });
      },
      fail: (err) => {
        wx.showToast({ title: '复制失败,请手动复制', icon: 'none' });
        console.warn('[team] 复制失败', err);
      },
    });
  },

  // 一键复制所有联系方式(汇总)
  onCopyAll() {
    const all = this.data.teamMembers
      .flatMap((m) => m.socials.map((s) => `${s.name}: ${s.url}`))
      .join('\n');
    wx.setClipboardData({
      data: all,
      success: () => wx.showToast({ title: '所有联系方式已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
  },

  // 返回上一页
  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/profile/profile' }) });
  },
});
