# TDesign 风格组件库

> 自研的 TDesign 风格小程序组件集合,无需 npm 安装,直接 `usingComponents` 引用。

## 组件清单

| 组件 | 路径 | 说明 |
|---|---|---|
| `t-button` | `tdesign/t-button` | 按钮(6 主题 × 4 变体 × 3 尺寸 × 4 形状) |
| `t-cell` | `tdesign/t-cell` | 单元格(标题/描述/图标/箭头) |
| `t-input` | `tdesign/t-input` | 输入框(标签/清除/密码切换/状态) |
| `t-switch` | `tdesign/t-switch` | 开关(带 240ms 缓动动画) |
| `t-message` | `tdesign/t-message` | 顶部消息条(info/success/warning/error) |
| `t-dialog` | `tdesign/t-dialog` | 对话框(自定义按钮文案/主题) |
| `t-divider` | `tdesign/t-divider` | 分割线(横/竖、文本) |
| `t-tag` | `tdesign/t-tag` | 标签(5 主题 × 4 变体 × 3 尺寸) |
| `t-tabs` | `tdesign/t-tabs` | 标签页(line/card) |
| `t-icon` | `tdesign/t-icon` | 图标(32+ 纯 CSS 图标) |
| `t-empty` | `tdesign/t-empty` | 空状态 |
| `t-avatar` | `tdesign/t-avatar` | 头像(图片/文字/3 形状/3 尺寸) |
| `t-progress` | `tdesign/t-progress` | 进度条(4 主题 × 3 尺寸) |

## 重要：按页面注册（非全局）

**本项目开启了 `lazyCodeLoading: "requiredComponents"`，必须按页面注册组件，否则会在启动时报 `Error: timeout`。**

在每个页面的 `*.json` 中,只声明该页面用到的组件:

```json
{
  "usingComponents": {
    "t-button":  "../../components/tdesign/t-button/index",
    "t-cell":    "../../components/tdesign/t-cell/index",
    "t-input":   "../../components/tdesign/t-input/index",
    "t-switch":  "../../components/tdesign/t-switch/index",
    "t-message": "../../components/tdesign/t-message/index",
    "t-dialog":  "../../components/tdesign/t-dialog/index",
    "t-divider": "../../components/tdesign/t-divider/index",
    "t-tag":     "../../components/tdesign/t-tag/index",
    "t-tabs":    "../../components/tdesign/t-tabs/index",
    "t-icon":    "../../components/tdesign/t-icon/index",
    "t-empty":   "../../components/tdesign/t-empty/index",
    "t-avatar":  "../../components/tdesign/t-avatar/index",
    "t-progress":"../../components/tdesign/t-progress/index"
  }
}
```

> **❌ 不要在 `app.json` 中全局注册**,会触发 WeChat 性能警告,且会破坏 `lazyCodeLoading` 模式。

## 当前各页面注册情况

| 页面 | 使用的组件 |
|---|---|
| `pages/index/index` | t-message, t-dialog, cloud-tip-modal |
| `pages/login/login` | t-input, t-divider, t-button, t-message, t-dialog |
| `pages/setting/setting` | t-switch, t-message, t-dialog |
| `pages/trip/trip` | t-tabs, t-empty |
| `pages/profile/profile` | t-message, t-dialog |
| `pages/account-protection/account-protection` | t-cell, t-switch, t-tag, t-message, t-dialog |
| `pages/change-password/change-password` | t-message, t-dialog |
| **`pages/example/example`** | **全部 14 个组件完整演示** ⭐ |

## 完整演示页

**`pages/example/example`** 页面是 14 个组件的完整功能演示：

- 通过"我的" → 菜单列表 → "TDesign 组件演示" 入口进入
- 展示 14 个组件的所有变体(主题/尺寸/变体/形状)
- 真实可交互:点击按钮、开关、标签、图标都会触发 `t-message` 反馈
- 同时集成 `cloud-tip-modal` 显示云开发环境配置提示
- 包含 Banner、用户信息卡、12 个独立 Section

```js
// 进入方式
wx.navigateTo({ url: '/pages/example/example' });
```

## 快速上手

### t-button
```xml
<t-button theme="primary" block bindtap="onSubmit">提交</t-button>
<t-button theme="danger" variant="outline">取消</t-button>
<t-button theme="default" loading>加载中</t-button>
```

### t-cell
```xml
<t-cell title="修改密码" arrow hover bindtap="onChangePassword" />
<t-cell title="账号保护" note="7 项安全设置" arrow />
<t-cell title="新消息" label="3" arrow value="开启" />
```

### t-input
```xml
<t-input
  label="密码"
  type="password"
  clearable
  value="{{pwd}}"
  bind:change="onPwdInput"
  tips="长度 8-20 位,含字母与数字"
/>
```

### t-switch
```xml
<t-switch value="{{on}}" bind:change="onChange" />
```

### t-message (顶部消息条)
```js
this.tMessage = this.selectComponent('#t-message');
this.tMessage.show({ theme: 'success', content: '保存成功' });
```
```xml
<t-message id="t-message" />
```

### t-dialog
```js
this.tDialog = this.selectComponent('#t-dialog');
this.tDialog.show({ title: '提示', content: '确定删除?', theme: 'danger' });
```
```xml
<t-dialog id="t-dialog" />
```

### t-icon
```xml
<t-icon name="user" size="medium" color="#FF7B00" />
<t-icon name="lock" size="small" />
```

## 设计语言

- **主色**：`#FF7B00` 渐变 `#FF7B00 → #FF5500`
- **辅色**：橙 / 蓝 / 紫 / 绿 / 青 / 红 / 黄 / 灰 8 色调
- **圆角**：4 / 6 / 8 / 12 / 16 / 24 rpx
- **阴影**：Material elevation 规范
- **动效**：cubic-bezier(0.2, 0.8, 0.2, 1) 标准曲线, 200~280ms
