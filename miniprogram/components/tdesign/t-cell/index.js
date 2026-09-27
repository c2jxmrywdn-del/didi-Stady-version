// components/tdesign/t-cell/index.js — TDesign 单元格
// 用法:
//   <t-cell title="标题" note="描述" arrow bindtap="onTap"></t-cell>
//   <t-cell title="标题" hover>
Component({
  options: { multipleSlots: true, addGlobalClass: true },
  properties: {
    title: { type: String, value: "" },
    note: { type: String, value: "" },          // 副标题/描述
    label: { type: String, value: "" },         // 右上角标签
    value: { type: String, value: "" },         // 右侧值
    arrow: { type: Boolean, value: false },
    hover: { type: Boolean, value: false },
    bordered: { type: Boolean, value: true },
    align: { type: String, value: "middle" },   // top | middle | bottom
    image: { type: String, value: "" },         // 左侧图标 URL
    iconName: { type: String, value: "" },      // 左侧图标名(简单 css 图标)
    iconBg: { type: String, value: "" },        // 左侧图标背景色
    rightIcon: { type: String, value: "" },
  },
  methods: {
    onTap(e) { this.triggerEvent("tap", e.detail); },
  },
});
