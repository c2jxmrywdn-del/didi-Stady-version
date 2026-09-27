// pages/emergency-contact/emergency-contact.js
const STORAGE_KEY = 'emergencyContacts';

const DEFAULT_CONTACTS = [
  { id: 1, name: '张丽华', phone: '13800138001', relation: '家人' },
  { id: 2, name: '李明', phone: '13900139002', relation: '朋友' },
];

Page({
  data: {
    contacts: [],
    actionMenuContact: null,
  },

  onLoad() {
    this.loadContacts();
  },

  onShow() {
    this.loadContacts();
  },

  loadContacts() {
    let list = wx.getStorageSync(STORAGE_KEY);
    if (!list || !list.length) {
      list = JSON.parse(JSON.stringify(DEFAULT_CONTACTS));
      wx.setStorageSync(STORAGE_KEY, list);
    }
    this.setData({ contacts: list });
  },

  onAddContact() {
    this.showAddDialog();
  },

  showAddDialog() {
    wx.showModal({
      title: '添加紧急联系人',
      editable: true,
      placeholderText: '请输入姓名',
      content: '',
      confirmText: '下一步',
      confirmColor: '#2D2A26',
      success: (res1) => {
        if (!res1.confirm || !res1.content) return;
        const name = res1.content.trim();
        wx.showModal({
          title: '输入手机号',
          editable: true,
          placeholderText: '请输入11位手机号',
          content: '',
          confirmText: '下一步',
          confirmColor: '#2D2A26',
          success: (res2) => {
            if (!res2.confirm || !res2.content) return;
            const phone = res2.content.trim();
            if (!/^1\d{10}$/.test(phone)) {
              wx.showToast({ title: '手机号格式错误', icon: 'none' });
              return;
            }
            wx.showModal({
              title: '选择关系',
              editable: true,
              placeholderText: '家人/朋友/同事/其他',
              content: '家人',
              confirmText: '保存',
              confirmColor: '#2D2A26',
              success: (res3) => {
                if (!res3.confirm) return;
                const relation = (res3.content || '其他').trim();
                const newContact = { id: Date.now(), name, phone, relation };
                const list = this.data.contacts.concat(newContact);
                wx.setStorageSync(STORAGE_KEY, list);
                this.setData({ contacts: list });
                wx.showToast({ title: '已添加', icon: 'success' });
              },
            });
          },
        });
      },
    });
  },

  onCall(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onItemLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const c = this.data.contacts.find(x => x.id === id);
    if (c) {
      this.setData({ actionMenuContact: c });
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    }
  },

  onCloseAction() {
    this.setData({ actionMenuContact: null });
  },

  onActionEdit() {
    const c = this.data.actionMenuContact;
    this.setData({ actionMenuContact: null });
    if (!c) return;
    wx.showModal({
      title: '编辑联系人',
      editable: true,
      content: c.name,
      confirmColor: '#2D2A26',
      success: (r) => {
        if (!r.confirm) return;
        const name = r.content.trim();
        const list = this.data.contacts.map(x => x.id === c.id ? { ...x, name } : x);
        wx.setStorageSync(STORAGE_KEY, list);
        this.setData({ contacts: list });
        wx.showToast({ title: '已更新', icon: 'success' });
      },
    });
  },

  onActionDelete() {
    const c = this.data.actionMenuContact;
    this.setData({ actionMenuContact: null });
    if (!c) return;
    wx.showModal({
      title: '删除联系人',
      content: `确定删除「${c.name}」吗？`,
      confirmColor: '#e74c3c',
      success: (r) => {
        if (r.confirm) {
          const list = this.data.contacts.filter(x => x.id !== c.id);
          wx.setStorageSync(STORAGE_KEY, list);
          this.setData({ contacts: list });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      },
    });
  },
});
