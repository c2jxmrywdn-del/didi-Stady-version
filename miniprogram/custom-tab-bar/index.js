Component({
  data: {
    selected: 0,
    color: "#c7c7cc",
    selectedColor: "#111",
    unreadCount: 0,
    // 派生字段(由 observers 维护),WXML 不直接做多次比较
    badgeText: "",          // 显示文本:"" / "1" ~ "99" / "99+"
    badgeSizeClass: "",     // 宽度 class:"" (1位) / "tab-badge-long" (2位) / "tab-badge-xl" (3位)
    list: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        key: "home",
      },
      {
        pagePath: "/pages/trip/trip",
        text: "行程",
        key: "trip",
      },
      {
        pagePath: "/pages/message/message",
        text: "消息",
        key: "msg",
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的",
        key: "profile",
      },
    ],
  },
  observers: {
    // unreadCount 变化时,统一算出 badgeText / badgeSizeClass
    // 关键:不再让 WXML 重复读 unreadCount 3 次(性能 + 可维护性)
    "unreadCount"(n) {
      const count = Number(n) || 0;
      let text = "";
      let cls = "";
      if (count > 0) {
        if (count > 99) {
          text = "99+";
          cls = "tab-badge-xl";        // 3 字符宽度
        } else if (count > 9) {
          text = String(count);
          cls = "tab-badge-long";      // 2 字符宽度
        } else {
          text = String(count);
          cls = "";                    // 1 字符宽度
        }
      }
      if (text !== this.data.badgeText || cls !== this.data.badgeSizeClass) {
        this.setData({ badgeText: text, badgeSizeClass: cls });
      }
    },
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    },
  },
});
