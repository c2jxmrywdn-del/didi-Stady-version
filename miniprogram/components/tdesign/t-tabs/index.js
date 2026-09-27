// components/tdesign/t-tabs/index.js — TDesign 标签页
// 用法:
//   <t-tabs tabs="{{['全部', '已完成']}}" current="{{tabIndex}}" bind:change="onTab" />
Component({
  options: { addGlobalClass: true },
  properties: {
    tabs: { type: Array, value: [] },         // ['全部', '待支付', ...]
    current: { type: Number, value: 0 },
    scrollable: { type: Boolean, value: false },
    theme: { type: String, value: "line" },    // line | card
    size: { type: String, value: "medium" },
  },
  methods: {
    onTap(e) {
      const i = e.currentTarget.dataset.index;
      if (i === this.data.current) return;
      this.triggerEvent("change", { index: i, tab: this.data.tabs[i] });
    },
  },
});
