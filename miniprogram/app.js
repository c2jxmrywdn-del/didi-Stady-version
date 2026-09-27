// app.js
const messageStore = require("./utils/messageStore");
const userStats = require("./utils/userStats");

App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // 启动期预热(同步,优先保证首屏可见数据)
    messageStore.seedIfEmpty();
    this.refreshUnread();
    // 预热 userStats 到内存(后续 onShow 重复 getStats 命中内存)
    try { userStats.getStats(); } catch (e) {}

    // 全局消息变更回调
    this.globalData.onMessageChange = () => {
      this.refreshUnread();
    };

    // 自动获取用户位置
    this.getLocation();

    // 性能优化:后台异步预热 openid,避免后续业务请求在第一次时卡 200ms+
    this.warmupOpenId();
  },

  // 后台异步获取 openid,完成后写入 globalData(不阻塞 onLaunch)
  warmupOpenId() {
    if (!wx.cloud) return;
    const cloud = require("./utils/cloud");
    cloud.callCloud("getOpenId", {}, { ttl: 600000 })
      .then((res) => {
        if (res && res.openid) {
          this.globalData.openid = res.openid;
        }
      })
      .catch((err) => {
        console.warn("[app] 预热 openid 失败", err);
      });
  },

  refreshUnread() {
    try {
      const count = messageStore.getUnreadCount();
      this.globalData.unreadCount = count;
      // 同步到自定义 tabBar
      if (typeof this.updateTabBarBadge === "function") {
        this.updateTabBarBadge(count);
      } else {
        this.tryUpdateTabBar();
      }
    } catch (e) {}
  },

  // 兼容无 tabBar 实例的时机
  tryUpdateTabBar() {
    try {
      const pages = getCurrentPages();
      for (const p of pages) {
        if (p && p.getTabBar && p.getTabBar()) {
          p.getTabBar().setData({ unreadCount: this.globalData.unreadCount });
          break;
        }
      }
    } catch (e) {}
  },

  getLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.globalData.location = {
          latitude: res.latitude,
          longitude: res.longitude,
          speed: res.speed,
          accuracy: res.accuracy,
        };
      },
      fail: (err) => {
        console.log("获取位置失败", err);
      },
    });
  },

  // 全局共享数据:小程序约定定义为 App 静态属性,所有页面通过 getApp().globalData 访问。
  // onLaunch 中的 wx.cloud.init 会读取 env;openid 由 warmupOpenId 异步写入;
  // onMessageChange 回调在 onLaunch 中动态挂载到本对象上。
  globalData: {
    env: "", // 云开发环境 ID,空串表示使用默认环境
    userInfo: null,
    location: null,
    currentOrder: null,
    unreadCount: 0,
    openid: null, // 由 userFunctions.getOpenId / warmupOpenId 异步写入
  },
});
