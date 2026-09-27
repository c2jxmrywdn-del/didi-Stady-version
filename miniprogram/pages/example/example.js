// pages/example/example.js — TDesign 14 个组件完整演示
// 用法:从我的页面或团队页跳转到此页查看所有组件能力
const app = getApp();

Page({
  data: {
    // 用户信息(用于 t-avatar)
    userInfo: {
      nickName: "体验用户",
      avatarUrl: "",
    },

    // t-tabs 当前 tab
    tabIndex: 0,
    // t-tabs 数据源(关键:数组必须在 data 中定义,WXML 不支持内联数组)
    demoTabs: ["推荐", "附近", "历史"],

    // t-input 表单
    form: {
      name: "",
      phone: "",
      password: "",
    },

    // t-button loading 态
    btnLoading: false,

    // t-cell 隐私开关
    privacy: {
      location: true,
    },

    // t-switch 多开关
    switches: {
      notify: true,
      fingerprint: false,
      darkMode: false,
    },

    // t-empty 切换
    showEmpty: true,

    // cloud-tip-modal 开关
    showCloudTip: false,
  },

  onLoad() {
    // 加载用户信息(若有)
    try {
      const ui = wx.getStorageSync("userInfo");
      if (ui) {
        this.setData({
          "userInfo.nickName": ui.nickName || "体验用户",
          "userInfo.avatarUrl": ui.avatarUrl || "",
        });
      }
    } catch (e) {}
  },

  onReady() {
    // 关键:获取 TDesign 全局组件实例
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  // ============ 通用消息提示 ============
  // 关键:页面已卸载时不再调用组件 show(),避免 routeDone webviewId not found
  showMessage(theme, content) {
    if (this._destroyed) return;
    if (this.tMessage) {
      try { this.tMessage.show({ theme, content, duration: 1800 }); } catch (e) { /* noop */ }
    } else {
      try { wx.showToast({ title: content, icon: theme === "error" ? "error" : "none" }); } catch (e) { /* noop */ }
    }
  },

  showDialog(opts) {
    if (this._destroyed) return;
    if (this.tDialog) {
      try { this.tDialog.show(opts); } catch (e) { /* noop */ }
    } else {
      try { wx.showModal({ title: opts.title, content: opts.content, showCancel: opts.showCancel }); } catch (e) { /* noop */ }
    }
  },

  // ============ ① t-tabs ============
  onTabChange(e) {
    const idx = (e && e.detail && e.detail.index) || 0;
    this.setData({ tabIndex: idx });
  },

  // ============ ④ t-input ============
  onInputChange(e) {
    const ds = e && e.currentTarget && e.currentTarget.dataset;
    if (!ds) return;
    const v = (e && e.detail && e.detail.value) || (e && e.value) || "";
    this.setData({ [`form.${ds.field}`]: v });
  },

  // ============ ⑤ t-button ============
  onDemoTap(e) {
    const name = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.name) || "按钮";
    this.showMessage("info", `你点击了: ${name}`);
  },

  onSubmitDemo() {
    if (this.data.btnLoading) return;
    this.setData({ btnLoading: true });
    this.showMessage("success", "提交中...");
    // 关键:timer 句柄 + try/catch,避免 Error: timeout
    this._demoTimer = setTimeout(() => {
      this._demoTimer = null;
      try { this.setData({ btnLoading: false }); } catch (e) { /* noop */ }
      this.showMessage("success", "提交成功!");
    }, 1500);
  },

  onShowDialog() {
    this.showDialog({
      title: "TDesign 对话框",
      content: "这是一个 TDesign 风格对话框,支持多种主题和自定义按钮。",
      theme: "primary",
      confirmText: "我知道了",
      showCancel: false,
    });
  },

  // ============ ⑨ t-switch ============
  onSwitch(e) {
    const ds = e && e.currentTarget && e.currentTarget.dataset;
    if (!ds) return;
    const checked = !!(e.detail && e.detail.value);
    const key = ds.key;
    // 兼容 t-cell 内的开关 + 独立开关
    if (this.data.privacy.hasOwnProperty(key)) {
      this.setData({ [`privacy.${key}`]: checked });
    } else if (this.data.switches.hasOwnProperty(key)) {
      this.setData({ [`switches.${key}`]: checked });
    }
    this.showMessage(checked ? "success" : "info", `${key} 已${checked ? "开启" : "关闭"}`);
  },

  // ============ ⑥ t-tag 关闭 ============
  onTagClose(e) {
    this.showMessage("info", "标签已关闭");
  },

  // ============ ⑦ t-icon ============
  onIconTap(e) {
    const name = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.name) || "icon";
    this.showMessage("info", `你点击了图标: ${name}`);
  },

  // ============ ③ t-cell 跳转 ============
  onViewAgreement() {
    this.showMessage("info", "跳转到用户协议");
  },
  onContactCS() {
    this.showMessage("info", "联系客服");
  },

  // ============ ⑪ t-empty ============
  onRefreshEmpty() {
    this.showMessage("info", "刷新空状态");
  },
  toggleEmpty() {
    this.setData({ showEmpty: !this.data.showEmpty });
  },

  // ============ ⑫ t-message ============
  onMsg(e) {
    const ds = e && e.currentTarget && e.currentTarget.dataset;
    const theme = (ds && ds.theme) || "info";
    const map = { info: "这是一条普通消息", success: "操作成功!", warning: "请注意", error: "操作失败" };
    this.showMessage(theme, map[theme] || "消息");
  },

  // ============ ⑭ cloud-tip-modal ============
  onShowCloudTip() {
    this.setData({ showCloudTip: true });
  },

  onUnload() {
    // 关键:标记页面已销毁,所有 showMessage / showDialog 立即返回,
    // 避免 routeDone webviewId 109 is not found
    this._destroyed = true;
    // 清理 timer
    if (this._demoTimer) {
      clearTimeout(this._demoTimer);
      this._demoTimer = null;
    }
  },
});
