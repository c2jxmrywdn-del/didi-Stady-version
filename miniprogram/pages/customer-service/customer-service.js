// pages/customer-service/customer-service.js

const FAQS = [
  { id: 1, question: '如何修改手机号？', answer: '进入「我的」→「设置」→「账号安全」即可修改已绑定的手机号。' },
  { id: 2, question: '如何领取优惠卷？', answer: '进入「我的」→「优惠卷」可查看所有优惠卷。新用户首单立减 10 元。' },
  { id: 3, question: '司机迟到怎么办？', answer: '可在行程页点击「联系司机」在线沟通，或拨打客服电话 400-000-0999 投诉。' },
  { id: 4, question: '如何开发票？', answer: '在订单详情页点击「申请发票」即可申请电子发票，3 个工作日内开具。' },
  { id: 5, question: '取消订单会扣费吗？', answer: '司机接驾前取消不收费，司机接驾后取消将根据行程距离收取一定空驶费。' },
  { id: 6, question: '如何联系不上司机？', answer: '可在行程页点击「紧急联系」或拨打客服电话，我们将协助您联系司机。' },
];

Page({
  data: {
    faqs: FAQS.map(f => ({ ...f, expanded: false })),
  },

  onLoad() {},

  onFaqTap(e) {
    const id = e.currentTarget.dataset.id;
    const faqs = this.data.faqs.map(f => f.id === id ? { ...f, expanded: !f.expanded } : f);
    this.setData({ faqs });
  },

  onOnlineService() {
    wx.navigateTo({ url: '/pages/chat/chat?type=service' });
  },

  onPhoneService() {
    wx.makePhoneCall({ phoneNumber: '400-000-0999' });
  },

  onCommonQues() {
    wx.showToast({ title: '请查看下方常见问题', icon: 'none' });
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  onCopyEmail() {
    wx.setClipboardData({
      data: '3514485358@qq.com',
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },
});
