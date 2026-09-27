// components/tdesign/t-button/index.js — TDesign 风格按钮
// 用法:
//   <t-button theme="primary" size="medium" block bindtap="onTap">主要按钮</t-button>
//   <t-button theme="danger" variant="outline">危险按钮</t-button>
//   <t-button theme="default" loading>加载中</t-button>
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
  },
  properties: {
    theme: {
      type: String,
      value: "primary",      // primary | danger | success | warning | default | light
    },
    variant: {
      type: String,
      value: "base",         // base | outline | text | dashed
    },
    size: {
      type: String,
      value: "medium",       // small | medium | large
    },
    block: {
      type: Boolean,
      value: false,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    icon: {
      type: String,
      value: "",
    },
    shape: {
      type: String,
      value: "rectangle",    // rectangle | square | round | circle
    },
    hoverClass: {
      type: String,
      value: "t-button-hover",
    },
  },
  data: {},
  methods: {
    onTap(e) {
      if (this.data.disabled || this.data.loading) return;
      this.triggerEvent("tap", e.detail, {});
    },
  },
});
