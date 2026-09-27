// pages/login/login.js — 登录页(TDesign 风格)
// 设计目标:
//  1) 完整获取微信用户信息:头像 / 昵称 / 性别 / 城市 / 省份 / 国家 / 语言
//  2) 通过 button open-type="getPhoneNumber" 拿到手机号(真机有效)
//  3) 字段全部归档到 storage + 云端,供其他页面展示
//  4) 流程分两步:先 getUserProfile 拿基础信息 → 再 getPhoneNumber 拿手机号
//  5) 兜底:用户拒绝授权时使用模拟信息(教学演示)
const app = getApp();
const messageStore = require("../../utils/messageStore");
const cloud = require("../../utils/cloud");

// 默认信息(用户拒绝授权 / 演示用)
const DEFAULT_PROFILE = () => ({
  nickName: "微信用户" + Math.floor(1000 + Math.random() * 9000),
  avatarUrl: "",
  gender: 0,           // 0=未知, 1=男, 2=女
  country: "中国",
  province: "",
  city: "",
  language: "zh_CN",
});

Page({
  data: {
    phone: "",                  // 验证码登录的手机号输入
    code: "",
    countdown: 0,
    agreed: false,
    submitting: false,

    // 微信用户信息完整结构(TDesign 风格卡片展示)
    wechatProfile: null,        // 完整 { nickName, avatarUrl, gender, country, province, city, language }
    wechatProfileKnown: false,  // 是否已拿到基础信息(用于按钮 enabled 态)
    phoneGranted: false,        // 是否已拿到手机号
    phoneMasked: "",            // 脱敏后手机号(138****1234)
  },

  onLoad() {
    const existing = wx.getStorageSync("userInfo");
    if (existing && existing.nickName) {
      // 已登录:不自动退出,允许切换账号
    }
  },

  // ============ 输入处理 ============
  // 兼容:t-input 组件传 { value } + 原生 input 传 e.detail.value
  onPhoneInput(e) {
    const v = (e && e.detail && e.detail.value) || (e && e.value) || "";
    this.setData({ phone: v });
  },
  onClearPhone() {
    this.setData({ phone: "" });
  },
  onCodeInput(e) {
    const v = (e && e.detail && e.detail.value) || (e && e.value) || "";
    this.setData({ code: v });
  },

  onUnload() {
    // 关键:页面卸载清理所有 timer,防止 Error: timeout
    this._clearCodeTimer();
    if (this._loginTimer) {
      clearTimeout(this._loginTimer);
      this._loginTimer = null;
    }
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
  },

  onReady() {
    // 获取 TDesign 全局组件实例
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  // 顶部消息条快捷方法
  showMessage(theme, content) {
    if (this.tMessage) {
      this.tMessage.show({ theme, content, duration: 2400 });
    } else {
      wx.showToast({ title: content, icon: theme === "error" ? "error" : "none" });
    }
  },

  showDialog(opts) {
    if (this.tDialog) {
      this.tDialog.show(opts);
    }
  },

  // ============ 验证码发送(模拟) ============
  onSendCode() {
    const { phone, countdown } = this.data;
    if (countdown > 0) return;
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "请输入正确手机号", icon: "none" });
      return;
    }
    wx.showToast({ title: "验证码已发送", icon: "success" });
    this.setData({ countdown: 60 });
    // 关键:timer 保存到 this,onUnload 时清理,setData 加 try/catch
    // 防止页面已 detach 时 Error: timeout
    this._codeTimer = setInterval(() => {
      const cd = this.data.countdown - 1;
      if (cd <= 0) {
        this._clearCodeTimer();
        try { this.setData({ countdown: 0 }); } catch (e) { /* noop */ }
      } else {
        try { this.setData({ countdown: cd }); } catch (e) { this._clearCodeTimer(); }
      }
    }, 1000);
  },

  // 清理验证码倒计时定时器
  _clearCodeTimer() {
    if (this._codeTimer) {
      clearInterval(this._codeTimer);
      this._codeTimer = null;
    }
  },

  // ============ 协议勾选 / 跳转 ============
  onAgreement() {
    this.setData({ agreed: !this.data.agreed });
  },
  onViewAgreement() { wx.navigateTo({ url: "/pages/agreement/agreement" }); },
  onViewPrivacy() { wx.navigateTo({ url: "/pages/privacy/privacy" }); },
  onContact() { wx.navigateTo({ url: "/pages/customer-service/customer-service" }); },

  // ============ 微信一键登录(主流程) ============
  // 流程:
  //   step 1: wx.getUserProfile → 头像/昵称/性别/城市/省份/国家
  //   step 2: button open-type="getPhoneNumber" → 手机号(真机有效)
  //   step 3: 合并 + 同步本地 + 同步云端 + 推送消息 + 返回
  onWechatQuickLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: "请先勾选用户协议", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在获取微信信息...", mask: true });
    // wx.getUserProfile 自基础库 2.27.1 起被收回,
    // 推荐改用 button open-type="chooseAvatar" + 头像 + 昵称输入框
    // 但教学演示仍保留 getUserProfile(老用户可拉起,新基础库弹"已废弃"提示)
    if (typeof wx.getUserProfile === "function") {
      wx.getUserProfile({
        desc: "用于完善用户资料(头像、昵称、性别、城市)",
        success: (profileRes) => {
          this._setWechatProfile(profileRes.userInfo);
          wx.hideLoading();
          // 提示用户:下一步获取手机号
          this._promptPhone();
        },
        fail: () => {
          // 用户拒绝 → 用默认信息
          wx.hideLoading();
          this._setWechatProfile(DEFAULT_PROFILE());
          this._promptPhone();
        },
      });
    } else {
      // 新版基础库:用默认信息(避免阻塞登录)
      wx.hideLoading();
      this._setWechatProfile(DEFAULT_PROFILE());
      this._promptPhone();
    }
  },

  // 归一化微信信息(只取需要的字段,缺失给默认值)
  _setWechatProfile(raw) {
    const profile = {
      nickName: (raw && raw.nickName) || DEFAULT_PROFILE().nickName,
      avatarUrl: (raw && raw.avatarUrl) || "",
      gender: (raw && typeof raw.gender === "number") ? raw.gender : 0,
      country: (raw && raw.country) || "中国",
      province: (raw && raw.province) || "",
      city: (raw && raw.city) || "",
      language: (raw && raw.language) || "zh_CN",
    };
    this.setData({ wechatProfile: profile, wechatProfileKnown: true });
  },

  // 头像加载失败兜底:用首字母占位
  onProfileAvatarError() {
    const wp = this.data.wechatProfile;
    if (wp) {
      this.setData({ "wechatProfile.avatarUrl": "" });
    }
  },

  // 弹窗:让用户选择"继续获取手机号"或"只用基础信息登录"
  _promptPhone() {
    const { wechatProfile, agreed } = this.data;
    if (!agreed) {
      this._doLogin({ phone: this.generateMockPhone() });
      return;
    }
    wx.showModal({
      title: "授权获取手机号",
      content: `Hi ${wechatProfile.nickName},是否授权获取微信绑定的手机号,用于订单通知 / 安全登录?`,
      confirmText: "授权",
      cancelText: "暂不",
      confirmColor: "#FF7B00",
      success: (res) => {
        if (res.confirm) {
          // 触发 button open-type="getPhoneNumber" 流程(由 wxml 的 catchtap 触发)
          this.setData({ _needPhone: true });
        } else {
          // 用户拒绝手机号,直接用模拟手机号登录
          this._doLogin({ phone: this.generateMockPhone() });
        }
      },
    });
  },

  // button open-type="getPhoneNumber" 回调
  onGetPhoneNumber(e) {
    // 微信基础库 2.21.2 起,getPhoneNumber 改为:用户点击 button 时直接弹窗授权
    // 回调 detail.encryptedData / iv / cloudID 拿到加密数据
    // 真机: 调云函数 decryptPhoneNumber 解密
    // 模拟器 / 教学演示: 直接用 generateMockPhone
    if (e && e.detail && e.detail.errMsg === "getPhoneNumber:ok") {
      // 真机场景: 把 cloudID / encryptedData / iv 发到云函数解密
      const encrypted = {
        encryptedData: e.detail.encryptedData,
        iv: e.detail.iv,
        cloudID: e.detail.cloudID,
      };
      // 走云函数解密(失败兜底)
      this._decryptPhone(encrypted).then((phone) => {
        this._doLogin({ phone });
      }).catch(() => {
        this._doLogin({ phone: this.generateMockPhone() });
      });
    } else {
      // 用户拒绝 / 失败 → 用模拟手机号
      this._doLogin({ phone: this.generateMockPhone() });
    }
  },

  // 调用云函数解密手机号(真机有效,模拟器会失败)
  _decryptPhone(encrypted) {
    return new Promise((resolve, reject) => {
      if (!wx.cloud) return reject(new Error("no cloud"));
      wx.cloud.callFunction({
        name: "userFunctions",
        data: { type: "decryptPhone", data: encrypted },
        success: (res) => {
          if (res && res.result && res.result.code === 0 && res.result.data && res.result.data.phone) {
            resolve(res.result.data.phone);
          } else {
            reject(new Error("decrypt failed"));
          }
        },
        fail: (err) => reject(err),
      });
    });
  },

  // 生成模拟手机号(教学演示,真机不走)
  generateMockPhone() {
    const prefixes = ["138", "139", "150", "186", "188", "176"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    let suffix = "";
    for (let i = 0; i < 8; i++) suffix += Math.floor(Math.random() * 10);
    return prefix + suffix;
  },

  // 遮罩手机号中间 4 位
  maskPhone(phone) {
    if (!phone || phone.length !== 11) return phone || "";
    return phone.slice(0, 3) + "****" + phone.slice(-4);
  },

  // ============ 手机号 + 验证码登录 ============
  onLogin() {
    if (this.data.submitting) return;
    const { phone, code, agreed } = this.data;
    if (!agreed) { wx.showToast({ title: "请先同意用户协议", icon: "none" }); return; }
    if (!/^1\d{10}$/.test(phone)) { wx.showToast({ title: "请输入正确手机号", icon: "none" }); return; }
    if (!code || code.length < 4) { wx.showToast({ title: "请输入验证码", icon: "none" }); return; }

    this.setData({ submitting: true });
    wx.showLoading({ title: "登录中...", mask: true });
    // 关键:try/catch + timer 句柄,避免 Error: timeout
    this._loginTimer = setTimeout(() => {
      this._loginTimer = null;
      try { this._doLogin({ phone }); } catch (e) { /* noop */ }
    }, 1000);
  },

  // ============ 统一的登录处理 ============
  // 接收 partial:{ phone, nickName?, avatarUrl?, gender?, city?, province?, country? }
  _doLogin(partial) {
    const { wechatProfile } = this.data;
    // 1) 合并微信基础信息(若有)
    const nickName = (partial.nickName) || (wechatProfile && wechatProfile.nickName) || ("用户" + (partial.phone || "").slice(-4));
    const avatarUrl = (partial.avatarUrl) || (wechatProfile && wechatProfile.avatarUrl) || "";
    const gender = (partial.gender !== undefined ? partial.gender : (wechatProfile && wechatProfile.gender)) || 0;
    const city = (partial.city) || (wechatProfile && wechatProfile.city) || "";
    const province = (partial.province) || (wechatProfile && wechatProfile.province) || "";
    const country = (partial.country) || (wechatProfile && wechatProfile.country) || "中国";
    const language = (wechatProfile && wechatProfile.language) || "zh_CN";

    const userInfo = {
      openid: app.globalData.openid || null,
      nickName,
      avatarUrl,
      gender,
      city,
      province,
      country,
      language,
      phone: partial.phone || "",
      age: this._estimateAge(gender),  // 教学演示:基于性别+地区简单推一个年龄段
      loginType: wechatProfile ? "wechat" : "phone",
      loginTime: Date.now(),
    };

    // 2) 存储到本地
    wx.setStorageSync("userInfo", JSON.stringify(userInfo));
    app.globalData.userInfo = userInfo;
    const phoneMasked = this.maskPhone(userInfo.phone);

    // 3) 同步到云端(走 userFunctions,云端 upsert)
    this.syncUserToCloud(userInfo);

    // 4) 推送登录成功消息
    messageStore.push({
      type: messageStore.TYPE.SYSTEM,
      title: userInfo.loginType === "wechat" ? "微信登录成功" : "登录成功",
      content: userInfo.loginType === "wechat"
        ? `Hi ${userInfo.nickName}!已为你保存:头像/昵称/性别(${this.genderText(userInfo.gender)})/城市(${userInfo.country} ${userInfo.province} ${userInfo.city})/手机号 ${phoneMasked}。`
        : `欢迎回来,${userInfo.nickName}!手机号 ${phoneMasked} 已绑定,新用户首单立减 10 元。`,
      action: { type: "navigate", url: "/pages/index/index", label: "去叫车" },
      highlight: true,
    });

    // 5) 更新本地状态
    this.setData({ submitting: false, phoneGranted: true, phoneMasked });

    wx.hideLoading();
    wx.showToast({ title: "登录成功", icon: "success" });

    // 关键:try/catch + timer 句柄,避免 Error: timeout
    this._navTimer = setTimeout(() => {
      this._navTimer = null;
      try {
        wx.navigateBack({ delta: 1, fail: () => {
          try { wx.switchTab({ url: "/pages/profile/profile" }); } catch (e) {}
        } });
      } catch (e) { /* noop */ }
    }, 1200);
  },

  // 性别文本转换(0=未知, 1=男, 2=女)
  genderText(g) {
    if (g === 1) return "男";
    if (g === 2) return "女";
    return "未知";
  },

  // 教学演示:简单估算一个年龄段(实际生产由后端或用户自己填写)
  _estimateAge() {
    // 占位:不真去估算,返回 null 让前端兜底"未填写"
    return null;
  },

  // 同步到云端
  syncUserToCloud(userInfo) {
    if (!wx.cloud) return;
    cloud.callCloud("updateUser", {
      nickName: userInfo.nickName,
      avatarUrl: userInfo.avatarUrl,
      phone: userInfo.phone || "",
      gender: userInfo.gender || 0,
      bio: (userInfo.city || "") + (userInfo.province || ""),
    }).then(() => {
      console.log("[login] 用户信息同步成功");
    }).catch((err) => console.log("[login] 用户信息同步失败", err));
  },
});
