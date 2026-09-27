// components/tdesign/t-avatar/index.js — TDesign 头像
Component({
  options: { addGlobalClass: true },
  properties: {
    src: { type: String, value: "" },
    text: { type: String, value: "" },         // 文字头像(取首字符)
    alt: { type: String, value: "" },
    size: { type: String, value: "medium" },   // small(64) | medium(96) | large(128) | 数字 rpx
    shape: { type: String, value: "circle" },  // circle | round | square
    bordered: { type: Boolean, value: false },
    bgColor: { type: String, value: "" },
    color: { type: String, value: "#FFFFFF" },
  },
  data: {
    initial: "U",
  },
  observers: {
    "text"(t) {
      const s = (t || "").toString().trim();
      const arr = Array.from(s);
      this.setData({ initial: arr[0] || "U" });
    },
  },
  methods: {
    onError() {
      this.triggerEvent("error");
    },
  },
});
