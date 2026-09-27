// pages/change-password/change-password.js — TDesign 风格
const app = getApp();
const STORAGE_KEY = 'userPasswordHash'; // 仅做本地"已设密码"标志位(模拟)

const PWD_MIN_LEN = 8;
const PWD_MAX_LEN = 20;

// 密码强度评估
function calcStrength(pwd) {
  if (!pwd) return { score: 0, level: 'none', label: '请输入密码', color: '#C5B9A8', pct: 0 };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[A-Z]/.test(pwd)) score += 1;
  if (/[a-z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
  if (score <= 2) return { score, level: 'weak',   label: '弱', color: '#E74C3C', pct: 25 };
  if (score <= 4) return { score, level: 'medium', label: '中', color: '#F1C40F', pct: 60 };
  return { score, level: 'strong', label: '强', color: '#5CAA5C', pct: 100 };
}

function maskPwd(pwd) {
  if (!pwd) return '';
  return '•'.repeat(pwd.length);
}

Page({
  data: {
    type: 'password',                // 'password' | 'phone'
    pageTitle: '修改登录密码',
    isFirstSet: false,               // 首次设置密码(无原密码)
    form: {
      current: '',
      next: '',
      confirm: '',
    },
    showPwd: { current: false, next: false, confirm: false },
    currentStrength: { score: 0, level: 'none', label: '请输入密码', color: '#C5B9A8', pct: 0 },
    confirmMatched: false,
    confirmTouched: false,
    canSubmit: false,
    submitting: false,
    showSuccess: false,
    showToast: false,
    toastText: '',
  },

  onLoad(options) {
    const type = (options && options.type) || 'password';
    const userInfo = wx.getStorageSync('userInfo');
    const hasSetPwd = !!wx.getStorageSync(STORAGE_KEY);
    // 演示:首次进入如果没设过密码,就走"设置密码"流程
    this.setData({
      type,
      pageTitle: type === 'phone' ? '修改手机号' : (hasSetPwd ? '修改登录密码' : '设置登录密码'),
      isFirstSet: !hasSetPwd,
    });
    this._userInfo = userInfo || null;
  },

  onUnload() {
    // 关键:清理所有 timer
    if (this._submitTimer) {
      clearTimeout(this._submitTimer);
      this._submitTimer = null;
    }
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value || '';
    const form = { ...this.data.form, [field]: value };
    this.setData({ form, confirmTouched: field === 'confirm' ? true : this.data.confirmTouched });
    this._refreshMeta(form);
  },

  _refreshMeta(form) {
    const nextStrength = calcStrength(form.next);
    const matched = !!(form.next && form.confirm && form.next === form.confirm);
    const canSubmit = this._canSubmit(form);
    this.setData({
      currentStrength: nextStrength,
      confirmMatched: matched,
      canSubmit,
    });
  },

  _canSubmit(form) {
    if (!form.next || form.next.length < PWD_MIN_LEN) return false;
    if (form.next.length > PWD_MAX_LEN) return false;
    if (!form.confirm || form.next !== form.confirm) return false;
    if (!this.data.isFirstSet && (!form.current || form.current.length < PWD_MIN_LEN)) return false;
    return true;
  },

  togglePwd(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ showPwd: { ...this.data.showPwd, [field]: !this.data.showPwd[field] } });
  },

  onSuggestionTap() {
    // 简单生成一个满足规则的密码
    const samples = ['Didi@2024!', 'Ride#888Safe', 'Xmry@921102', 'YJ-Tdesign#66', 'C2j@2026Strong'];
    const pwd = samples[Math.floor(Math.random() * samples.length)];
    const form = { ...this.data.form, next: pwd, confirm: pwd, confirmTouched: true };
    this._refreshMeta(form);
    this.flashToast('已填入推荐密码(可继续修改)');
  },

  onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;
    const { current, next, confirm } = this.data.form;

    // 模拟校验原密码
    if (!this.data.isFirstSet) {
      const savedPwd = wx.getStorageSync(STORAGE_KEY);
      if (savedPwd && savedPwd !== this._mockHash(current)) {
        this.flashToast('原密码不正确,请重新输入');
        return;
      }
    }

    if (next !== confirm) {
      this.flashToast('两次输入的密码不一致');
      return;
    }

    this.setData({ submitting: true });
    // 模拟提交到云端
    // 关键:try/catch + timer 句柄,避免 Error: timeout
    this._submitTimer = setTimeout(() => {
      this._submitTimer = null;
      try { wx.setStorageSync(STORAGE_KEY, this._mockHash(next)); } catch (e) {}
      // 同步更新 userInfo(便于下次自动登录场景)
      try {
        if (this._userInfo) {
          const updated = { ...this._userInfo, pwdUpdatedAt: Date.now() };
          wx.setStorageSync('userInfo', updated);
        }
      } catch (e) {}
      try { this.setData({ submitting: false, showSuccess: true }); } catch (e) { return; }
      this.flashToast(this.data.isFirstSet ? '密码已设置' : '密码已更新');
      this._navTimer = setTimeout(() => {
        this._navTimer = null;
        try { this.setData({ showSuccess: false }); } catch (e) {}
        try { wx.navigateBack({ delta: 1 }); } catch (e) {}
      }, 1100);
    }, 600);
  },

  // 仅做本地一致性校验(非真实哈希 — 演示用)
  _mockHash(pwd) {
    if (!pwd) return '';
    let h = 0;
    for (let i = 0; i < pwd.length; i++) {
      h = (h * 31 + pwd.charCodeAt(i)) | 0;
    }
    return 'h_' + Math.abs(h).toString(36);
  },

  onCancel() {
    wx.navigateBack({ delta: 1 });
  },

  onForgotPwd() {
    wx.showModal({
      title: '忘记密码',
      content: '将通过已绑定的手机号验证身份后重置密码。是否继续?',
      confirmText: '去验证',
      confirmColor: '#FF7B00',
      success: (res) => {
        if (res.confirm) {
          this.flashToast('已发送验证码(模拟)');
        }
      },
    });
  },

  onPwdFocus(e) {
    this._focusField = e.currentTarget.dataset.field;
  },

  flashToast(text) {
    // 优先用 TDesign t-message
    if (this.tMessage) {
      this.tMessage.show({ theme: "info", content: text, duration: 1800 });
      return;
    }
    this.setData({ showToast: true, toastText: text });
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.setData({ showToast: false });
    }, 1600);
  },

  onReady() {
    this.tMessage = this.selectComponent("#t-message");
    this.tDialog = this.selectComponent("#t-dialog");
  },

  // TDesign 顶部消息条
  showMessage(theme, content) {
    if (this.tMessage) {
      this.tMessage.show({ theme, content, duration: 2400 });
    } else {
      this.flashToast(content);
    }
  },

  // TDesign 对话框
  showDialog(opts) {
    if (this.tDialog) {
      this.tDialog.show(opts);
    }
  },
});
