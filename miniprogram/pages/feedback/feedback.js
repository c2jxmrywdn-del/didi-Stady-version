// pages/feedback/feedback.js
const STORAGE_KEY = 'feedbackHistory';

const TYPES = [
  { key: 'function', label: '功能异常' },
  { key: 'experience', label: '体验建议' },
  { key: 'service', label: '服务问题' },
  { key: 'driver', label: '投诉司机' },
  { key: 'other', label: '其他' },
];

Page({
  data: {
    types: TYPES,
    currentType: 'experience',
    content: '',
    contact: '',
    images: [],
    submitting: false,
    canSubmit: false,
    history: [],
  },

  onLoad() {
    this.loadHistory();
  },

  onShow() {
    this.loadHistory();
  },

  loadHistory() {
    const list = wx.getStorageSync(STORAGE_KEY) || [];
    this.setData({ history: list });
  },

  onTypeSelect(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentType: key });
    this.updateCanSubmit();
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
    this.updateCanSubmit();
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  onAddImage() {
    wx.chooseMedia({
      count: 3 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        const images = this.data.images.concat(paths);
        this.setData({ images });
      },
    });
  },

  onImageTap(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images,
    });
  },

  onImageDelete(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  updateCanSubmit() {
    const canSubmit = this.data.content.trim().length >= 5;
    this.setData({ canSubmit });
  },

  onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;

    this.setData({ submitting: true });

    const typeLabel = TYPES.find(t => t.key === this.data.currentType)?.label || '其他';
    const item = {
      id: Date.now(),
      type: this.data.currentType,
      typeLabel,
      content: this.data.content.trim(),
      contact: this.data.contact.trim(),
      images: this.data.images,
      status: 'pending',
      time: Date.now(),
    };

    setTimeout(() => {
      const list = [item].concat(this.data.history);
      wx.setStorageSync(STORAGE_KEY, list);
      this.setData({
        history: list,
        content: '',
        contact: '',
        images: [],
        canSubmit: false,
        submitting: false,
      });
      wx.showToast({ title: '反馈已提交', icon: 'success' });
    }, 600);
  },
});
