// components/tdesign/t-dialog/index.js — TDesign 对话框
// 用法:
//   <t-dialog id="t-dialog" />
//   this.tDialog = this.selectComponent('#t-dialog');
//   this.tDialog.show({ title: '提示', content: '...', confirmText: '确认' });
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: "" },
    content: { type: String, value: "" },
    confirmText: { type: String, value: "确定" },
    cancelText: { type: String, value: "取消" },
    showCancel: { type: Boolean, value: true },
    theme: { type: String, value: "default" },      // default | success | warning | danger
    zIndex: { type: Number, value: 11500 },
  },
  data: { internalVisible: false },
  observers: {
    "visible"(v) { this.setData({ internalVisible: v }); },
  },
  lifetimes: {
    // 关键:组件销毁时立即关闭
    detached() {
      this.setData({ internalVisible: false });
    },
  },
  pageLifetimes: {
    // 页面隐藏时立即关闭,避免路由切换时报 webviewId not found
    hide() { this.setData({ internalVisible: false }); },
  },
  methods: {
    show(opts = {}) {
      this.setData({
        internalVisible: true,
        title: opts.title || this.data.title,
        content: opts.content || this.data.content,
        confirmText: opts.confirmText || this.data.confirmText,
        cancelText: opts.cancelText || this.data.cancelText,
        showCancel: opts.showCancel != null ? opts.showCancel : this.data.showCancel,
        theme: opts.theme || this.data.theme,
      });
    },
    hide() {
      // 关键:异常隔离,避免 setData / triggerEvent 抛错被外层捕获
      try {
        this.setData({ internalVisible: false });
      } catch (e) { /* noop */ }
      try {
        this.triggerEvent("close");
      } catch (e) { /* noop */ }
    },
    onConfirm() {
      // 关键:confirm/cancel 事件用 try/catch 包裹,避免父级监听器抛错导致 UI 卡死
      try { this.triggerEvent("confirm"); } catch (e) { /* noop */ }
      this.hide();
    },
    onCancel() {
      try { this.triggerEvent("cancel"); } catch (e) { /* noop */ }
      this.hide();
    },
    onMaskTap() {
      // 默认点击遮罩不关闭(避免误触);可由父级监听 close 决定
    },
  },
});
