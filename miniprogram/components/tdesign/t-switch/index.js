// components/tdesign/t-switch/index.js — TDesign 开关
// 用法:
//   <t-switch value="{{on}}" bind:change="onChange" />
//   <t-switch value="{{on}}" label="开启" />
Component({
  options: { addGlobalClass: true },
  properties: {
    value: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    label: { type: String, value: "" },           // 右侧文本
    colors: { type: Object, value: {} },          // 自定义颜色
    size: { type: String, value: "medium" },     // small | medium
  },
  methods: {
    onTap() {
      if (this.data.disabled) return;
      const v = !this.data.value;
      this.triggerEvent("change", { value: v });
    },
  },
});
