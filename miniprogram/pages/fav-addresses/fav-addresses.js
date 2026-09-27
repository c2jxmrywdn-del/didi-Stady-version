// pages/fav-addresses/fav-addresses.js
const STORAGE_KEY = 'favAddresses';

const DEFAULT_ADDRESSES = [
  { id: 1, name: '家', address: '朝阳区建国路88号 SOHO现代城', distance: '1.2km', tag: 'home', using: true, latitude: 39.908823, longitude: 116.397470 },
  { id: 2, name: '公司', address: '海淀区中关村软件园二期 9号楼', distance: '8.5km', tag: 'company', using: false, latitude: 40.056878, longitude: 116.308150 },
  { id: 3, name: '望京 SOHO', address: '朝阳区望京街10号', distance: '5.3km', tag: 'favorite', using: false, latitude: 39.996838, longitude: 116.475470 },
  { id: 4, name: '首都机场 T3', address: '顺义区首都机场路', distance: '28.6km', tag: 'favorite', using: false, latitude: 40.080111, longitude: 116.584556 },
];

Page({
  data: {
    addresses: [],
    actionMenuAddr: null,
  },

  onLoad() {
    this.loadAddresses();
  },

  onShow() {
    this.loadAddresses();
  },

  loadAddresses() {
    let list = wx.getStorageSync(STORAGE_KEY);
    if (!list || !list.length) {
      list = JSON.parse(JSON.stringify(DEFAULT_ADDRESSES));
      wx.setStorageSync(STORAGE_KEY, list);
    }
    this.setData({ addresses: list });
  },

  onAddAddress() {
    wx.chooseLocation({
      success: (res) => {
        const newAddr = {
          id: Date.now(),
          name: '新地址',
          address: res.address || res.name,
          distance: '',
          tag: 'favorite',
          using: false,
          latitude: res.latitude,
          longitude: res.longitude,
        };
        const list = this.data.addresses.concat(newAddr);
        wx.setStorageSync(STORAGE_KEY, list);
        this.setData({ addresses: list });
        wx.showToast({ title: '已添加', icon: 'success' });
        // 立即让用户命名
        setTimeout(() => {
          this.editAddressName(newAddr);
        }, 500);
      },
    });
  },

  onItemLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const addr = this.data.addresses.find(a => a.id === id);
    if (addr) {
      this.setData({ actionMenuAddr: addr });
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    }
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const addr = this.data.addresses.find(a => a.id === id);
    if (addr) {
      // 在地图上查看
      wx.openLocation({
        latitude: addr.latitude,
        longitude: addr.longitude,
        name: addr.name,
        address: addr.address,
        scale: 16,
      });
    }
  },

  onCloseAction() {
    this.setData({ actionMenuAddr: null });
  },

  onActionEdit() {
    const addr = this.data.actionMenuAddr;
    this.setData({ actionMenuAddr: null });
    if (addr) this.editAddressName(addr);
  },

  editAddressName(addr) {
    wx.showModal({
      title: '编辑地址',
      editable: true,
      placeholderText: '请输入名称（家/公司/其他）',
      content: addr.name,
      confirmText: '保存',
      confirmColor: '#2D2A26',
      success: (res) => {
        if (res.confirm && res.content) {
          const list = this.data.addresses.map(a => {
            if (a.id === addr.id) {
              return { ...a, name: res.content.trim() };
            }
            return a;
          });
          wx.setStorageSync(STORAGE_KEY, list);
          this.setData({ addresses: list });
          wx.showToast({ title: '已更新', icon: 'success' });
        }
      },
    });
  },

  onActionUse() {
    const addr = this.data.actionMenuAddr;
    this.setData({ actionMenuAddr: null });
    if (!addr) return;
    const list = this.data.addresses.map(a => ({ ...a, using: a.id === addr.id ? !addr.using : false }));
    wx.setStorageSync(STORAGE_KEY, list);
    this.setData({ addresses: list });
    wx.showToast({ title: addr.using ? '已取消' : '已设为常用', icon: 'success' });
  },

  onActionDelete() {
    const addr = this.data.actionMenuAddr;
    this.setData({ actionMenuAddr: null });
    if (!addr) return;
    wx.showModal({
      title: '删除地址',
      content: `确定删除「${addr.name}」吗？`,
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          const list = this.data.addresses.filter(a => a.id !== addr.id);
          wx.setStorageSync(STORAGE_KEY, list);
          this.setData({ addresses: list });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      },
    });
  },
});
