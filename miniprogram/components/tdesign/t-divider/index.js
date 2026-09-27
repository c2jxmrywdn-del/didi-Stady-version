// components/tdesign/t-divider/index.js — TDesign 分割线
// 用法:
//   <t-divider />
//   <t-divider content="或者" align="center" />
Component({
  options: { addGlobalClass: true },
  properties: {
    content: { type: String, value: "" },
    align: { type: String, value: "center" },   // left | center | right
    dashed: { type: Boolean, value: false },
    layout: { type: String, value: "horizontal" }, // horizontal | vertical
  },
});
