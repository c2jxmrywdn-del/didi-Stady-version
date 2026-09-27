// components/tdesign/t-icon/index.js — TDesign 图标(纯 CSS 实现,内置常用 32 个)
Component({
  options: { addGlobalClass: true },
  properties: {
    name: { type: String, value: "" },
    size: { type: String, value: "medium" },  // small(20) | medium(32) | large(48) | 数字 rpx
    color: { type: String, value: "" },
  },
  data: {
    SIZE_MAP: { small: 20, medium: 32, large: 48 },
  },
});
