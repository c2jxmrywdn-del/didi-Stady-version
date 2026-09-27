// components/tdesign/t-empty/index.js — TDesign 空状态
Component({
  options: { addGlobalClass: true },
  properties: {
    icon: { type: String, value: "" },       // 自定义图标:emoji/字符/URL
    description: { type: String, value: "暂无数据" },
    actionText: { type: String, value: "" }, // 行动按钮文案
    size: { type: String, value: "medium" }, // small | medium | large
  },
  methods: {
    onAction() { this.triggerEvent("action"); },
  },
});
