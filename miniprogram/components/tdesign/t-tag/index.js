// components/tdesign/t-tag/index.js — TDesign 标签
Component({
  options: { addGlobalClass: true },
  properties: {
    theme: { type: String, value: "primary" },  // primary | success | warning | danger | default
    variant: { type: String, value: "light" },   // light | dark | outline | light-outline
    size: { type: String, value: "small" },      // small | medium | large
    shape: { type: String, value: "square" },    // square | round
    closable: { type: Boolean, value: false },
  },
  methods: {
    onClose(e) {
      this.triggerEvent("close", e.detail);
    },
  },
});
