// components/tdesign/t-input/index.js — TDesign 输入框
// 用法:
//   <t-input label="密码" password placeholder="请输入密码" value="{{pwd}}" bind:change="onInput" />
//   <t-input label="原密码" clearable password maxlength="20" />
Component({
  options: { addGlobalClass: true },
  properties: {
    label: { type: String, value: "" },
    value: { type: String, value: "" },
    type: { type: String, value: "text" },      // text | number | digit | idcard | safe-password
    placeholder: { type: String, value: "请输入" },
    placeholderClass: { type: String, value: "t-input__ph" },
    maxlength: { type: Number, value: 140 },
    disabled: { type: Boolean, value: false },
    readonly: { type: Boolean, value: false },
    clearable: { type: Boolean, value: false },
    password: { type: Boolean, value: false },   // true = 隐藏输入内容
    required: { type: Boolean, value: false },
    bordered: { type: Boolean, value: true },
    align: { type: String, value: "left" },     // left | center | right
    status: { type: String, value: "" },         // "" | error | warning | success
    tips: { type: String, value: "" },           // 下方提示
  },
  data: {
    focused: false,
  },
  methods: {
    onInput(e) {
      const v = e.detail.value;
      this.setData({ value: v });
      this.triggerEvent("input", { value: v });
      this.triggerEvent("change", { value: v });
    },
    onFocus(e) {
      this.setData({ focused: true });
      this.triggerEvent("focus", e.detail);
    },
    onBlur(e) {
      this.setData({ focused: false });
      this.triggerEvent("blur", e.detail);
    },
    onConfirm(e) {
      this.triggerEvent("enter", { value: e.detail.value });
    },
    onClear() {
      this.setData({ value: "" });
      this.triggerEvent("input", { value: "" });
      this.triggerEvent("change", { value: "" });
      this.triggerEvent("clear");
    },
  },
});
