// components/tdesign/t-progress/index.js — TDesign 进度条
Component({
  options: { addGlobalClass: true },
  properties: {
    percent: { type: Number, value: 0 },
    theme: { type: String, value: "primary" },   // primary | success | warning | danger
    size: { type: String, value: "medium" },      // small(6rpx) | medium(12rpx) | large(20rpx)
    strokeWidth: { type: Number, value: 0 },
    label: { type: Boolean, value: false },
  },
});
