// components/tdesign/t-message/index.js — TDesign 顶部消息条
// 用法(单例,推荐从 this.selectComponent 拿到后调用 show 方法):
//   this.tMessage = this.selectComponent('#t-message');
//   this.tMessage.show({ theme: 'success', content: '保存成功' });
//   this.tMessage.show({ theme: 'error', content: '密码不一致', duration: 2500 });
Component({
  options: { multipleSlots: true, addGlobalClass: true },
  properties: {
    visible: { type: Boolean, value: false },
    theme: { type: String, value: "info" },  // info | success | warning | error
    content: { type: String, value: "" },
    duration: { type: Number, value: 3000 }, // 自动关闭时间,0 = 不自动关
    marquee: { type: Boolean, value: false }, // 长文本滚动
    zIndex: { type: Number, value: 11000 },
  },
  data: { internalVisible: false, currentContent: "" },
  observers: {
    "visible"(v) { this.setData({ internalVisible: v, currentContent: this.data.content }); },
    "content"(c) { if (this.data.internalVisible) this.setData({ currentContent: c }); },
  },
  lifetimes: {
    ready() {
      if (this.data.visible) this.setData({ internalVisible: true, currentContent: this.data.content });
    },
    // 关键:组件销毁时清理所有 timer + 关闭显示 + 触发 close
    detached() {
      this._clearTimer();
      // 立即隐藏(避免 detached 后还显示)
      this.setData({ internalVisible: false });
    },
  },
  pageLifetimes: {
    // 监听所在页面的隐藏,提前清理(避免页面路由切换时路由报 webviewId not found)
    show() {
      // 页面重新显示时,清掉残留的 timer
      this._clearTimer();
    },
    hide() {
      // 页面被隐藏(切换到其他页面/最小化)时,清掉 timer
      this._clearTimer();
      this.setData({ internalVisible: false });
    },
  },
  methods: {
    // 计时器引用:不放在 data 里,避免被 setData 序列化 / 影响 data 观察
    _clearTimer() {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    },
    show(opts = {}) {
      const theme = opts.theme || "info";
      const content = opts.content || "";
      const duration = opts.duration != null ? opts.duration : 3000;
      this._clearTimer();
      this.setData({ internalVisible: true, currentContent: content, theme, duration });
      if (duration > 0) {
        // 关键:try/catch + detached 检查,防止页面已卸载时 setData 抛错
        // 导致 Error: timeout 和 routeDone webviewId not found
        this._timer = setTimeout(() => {
          this._timer = null;
          // 二次检查:组件已 detached 则不再 setData
          if (this.isDetached) return;
          try {
            this.setData({ internalVisible: false });
          } catch (e) {
            // 组件可能已 detached,静默
          }
          try {
            this.triggerEvent("close");
          } catch (e) { /* noop */ }
        }, duration);
      }
      try {
        this.triggerEvent("show", { theme, content });
      } catch (e) { /* noop */ }
    },
    hide() {
      this._clearTimer();
      this.setData({ internalVisible: false });
      try { this.triggerEvent("close"); } catch (e) { /* noop */ }
    },
    onTap() { this.hide(); },
  },
});
