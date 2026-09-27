// pages/edit-profile/edit-profile.js — 编辑资料页
const app = getApp();
const cloud = require("../../utils/cloud");

Page({
  data: {
    avatarUrl: '',
    defaultAvatar: '',
    nickName: '',
    phone: '',
    gender: 0,    // 0-保密 1-男 2-女
    bio: '',
    originalData: {},
    saving: false,
    hasChanges: false,
    showActionSheet: false,
  },

  onLoad() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfoStr = wx.getStorageSync('userInfo');
    if (userInfoStr) {
      try {
        const userInfo = typeof userInfoStr === 'string' ? JSON.parse(userInfoStr) : userInfoStr;
        this.setData({
          avatarUrl: userInfo.avatarUrl || '',
          nickName: userInfo.nickName || '',
          phone: userInfo.phone || '',
          gender: userInfo.gender !== undefined ? userInfo.gender : 0,
          bio: userInfo.bio || '',
          originalData: { ...userInfo },
        });
      } catch (e) {
        console.error('解析用户信息失败', e);
      }
    }
  },

  // 头像编辑
  onAvatarTap() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择', '使用微信头像'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseImage('camera');
        } else if (res.tapIndex === 1) {
          this.chooseImage('album');
        } else if (res.tapIndex === 2) {
          this.useWechatAvatar();
        }
      },
    });
  },

  chooseImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: [sourceType],
      success: (res) => {
        const tempPath = res.tempFilePaths[0];
        this.setData({
          avatarUrl: tempPath,
          hasChanges: true,
        });
      },
    });
  },

  useWechatAvatar() {
    // 从微信用户信息获取头像
    wx.getUserProfile({
      desc: '用于展示头像',
      success: (res) => {
        const avatarUrl = res.userInfo.avatarUrl;
        this.setData({
          avatarUrl: avatarUrl || '',
          hasChanges: true,
        });
      },
      fail: () => {
        wx.showToast({ title: '获取头像失败', icon: 'none' });
      },
    });
  },

  // 昵称输入
  onNicknameInput(e) {
    const value = e.detail.value;
    this.setData({
      nickName: value,
      hasChanges: value !== this.data.originalData.nickName,
    });
  },

  // 性别选择
  onGenderSelect(e) {
    const gender = parseInt(e.currentTarget.dataset.gender);
    this.setData({
      gender,
      hasChanges: true,
    });
  },

  // 简介输入
  onBioInput(e) {
    this.setData({
      bio: e.detail.value,
      hasChanges: true,
    });
  },

  // 绑定手机
  onBindPhone() {
    wx.showToast({ title: '请先通过手机号登录绑定', icon: 'none' });
    // 可跳转登录页
    wx.navigateTo({
      url: '/pages/login/login',
    });
  },

  // 保存
  onSave() {
    if (this.data.saving) return;
    if (!this.data.nickName.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    if (this.data.nickName.trim().length < 1) {
      wx.showToast({ title: '昵称至少1个字符', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    const { avatarUrl, nickName, phone, gender, bio } = this.data;
    const userInfo = {
      nickName: nickName.trim(),
      avatarUrl,
      phone,
      gender,
      bio: bio || '',
      updateTime: Date.now(),
    };

    // 1. 保存到本地
    wx.setStorageSync('userInfo', JSON.stringify(userInfo));
    app.globalData.userInfo = userInfo;

    // 2. 同步到云数据库(走 cloud.callCloud → userFunctions,云端 upsert 原子化)
    // 性能优化:用云函数一次往返替代"where().get() + doc().update()"两次往返
    cloud.callCloud("updateUser", {
      nickName: userInfo.nickName,
      avatarUrl: userInfo.avatarUrl,
      gender: userInfo.gender,
      bio: userInfo.bio,
    }).catch(err => {
      // 云端同步失败不影响前端展示
      console.warn('云端同步失败', err);
    }).finally(() => {
      this.setData({ saving: false, hasChanges: false });
      wx.showToast({ title: '保存成功', icon: 'success' });

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    });
  },
});
