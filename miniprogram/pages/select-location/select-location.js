// pages/select-location/select-location.js — 选点页(腾讯地图原生版)
const txMap = require('../../utils/txMap');

Page({
  data: {
    searchValue: "",
    searchResults: [],
    searching: false,
    hotLocations: [
      { name: "北京站", address: "东城区毛家湾胡同甲13号", latitude: 39.9028, longitude: 116.4272 },
      { name: "北京西站", address: "丰台区莲花池东路118号", latitude: 39.8949, longitude: 116.3219 },
      { name: "首都机场T3", address: "顺义区首都机场路", latitude: 40.0801, longitude: 116.6031 },
      { name: "国贸CBD", address: "朝阳区建国门外大街1号", latitude: 39.9088, longitude: 116.4604 },
      { name: "中关村", address: "海淀区中关村大街", latitude: 39.9819, longitude: 116.3163 },
      { name: "望京SOHO", address: "朝阳区望京街10号", latitude: 39.9971, longitude: 116.4801 },
    ],
    historyLocations: [
      { name: "家", address: "朝阳区建国路88号", latitude: 39.9088, longitude: 116.4604 },
      { name: "公司", address: "海淀区中关村软件园", latitude: 40.0511, longitude: 116.3050 },
    ],
    nearbyLocations: [],
    type: "end",
    userLatitude: 0,
    userLongitude: 0,
  },

  onLoad(options) {
    if (options.type) {
      this.setData({ type: options.type });
      wx.setNavigationBarTitle({
        title: options.type === "start" ? "选择出发地" : "选择目的地",
      });
    }

    // 微信原生定位
    txMap.getCurrentLocation().then((loc) => {
      this.setData({ userLatitude: loc.latitude, userLongitude: loc.longitude });
      this.loadNearbyLocations(loc.latitude, loc.longitude);
    }).catch(() => {
      this.setData({ userLatitude: 39.908823, userLongitude: 116.397470 });
      // 失败时用静态 nearby 数据兜底
      this.setData({
        nearbyLocations: [
          { name: "三里屯太古里", address: "朝阳区三里屯路19号", distance: "1.2km" },
          { name: "朝阳大悦城", address: "朝阳区朝阳北路101号", distance: "2.5km" },
          { name: "世贸天阶", address: "朝阳区光华路9号", distance: "3.1km" },
        ],
      });
    });
  },

  // 周边搜索(通过云函数调腾讯 WebService;不可用时降级)
  loadNearbyLocations(latitude, longitude) {
    txMap.searchPoi("交通设施|餐饮|购物|生活服务", "北京", latitude, longitude).then((data) => {
      if (data.list && data.list.length > 0) {
        const nearbyLocations = data.list.map((p) => ({
          name: p.name,
          address: p.address || "",
          distance: txMap.formatDistance(p.distance || 0),
          latitude: p.latitude,
          longitude: p.longitude,
          tag: p.tag || "",
        }));
        this.setData({ nearbyLocations });
      } else {
        this.setData({
          nearbyLocations: [
            { name: "三里屯太古里", address: "朝阳区三里屯路19号", distance: "1.2km" },
            { name: "朝阳大悦城", address: "朝阳区朝阳北路101号", distance: "2.5km" },
            { name: "世贸天阶", address: "朝阳区光华路9号", distance: "3.1km" },
          ],
        });
      }
    }).catch(() => {
      this.setData({
        nearbyLocations: [
          { name: "三里屯太古里", address: "朝阳区三里屯路19号", distance: "1.2km" },
          { name: "朝阳大悦城", address: "朝阳区朝阳北路101号", distance: "2.5km" },
          { name: "世贸天阶", address: "朝阳区光华路9号", distance: "3.1km" },
        ],
      });
    });
  },

  onSearchInput(e) {
    const value = e.detail.value;
    this.setData({ searchValue: value });
    // 性能优化:搜索防抖(300ms)避免 keyup 风暴 + 60s 内存缓存
    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (value.length > 0) {
      this._searchTimer = setTimeout(() => {
        this.searchLocation(value);
      }, 300);
    } else {
      this.setData({ searchResults: [] });
    }
  },

  // POI 搜索(云函数) — 带 60s 内存缓存
  searchLocation(keyword) {
    const cacheKey = keyword + "|" + this.data.userLatitude.toFixed(3) + "|" + this.data.userLongitude.toFixed(3);
    const now = Date.now();
    if (this._searchCache && this._searchCache.key === cacheKey && now - this._searchCache.t < 60000) {
      // 命中缓存
      this.setData({ searchResults: this._searchCache.results, searching: false });
      return;
    }
    this.setData({ searching: true });
    txMap.searchPoi(keyword, "北京", this.data.userLatitude, this.data.userLongitude)
      .then((data) => {
        const results = (data.list || []).map((p) => ({
          name: p.name,
          address: p.address || "",
          latitude: p.latitude,
          longitude: p.longitude,
          distance: txMap.formatDistance(p.distance || 0),
          tag: p.tag || "",
        }));
        this._searchCache = { key: cacheKey, t: now, results };
        this.setData({ searchResults: results, searching: false });
      })
      .catch(() => this.setData({ searching: false }));
  },

  onSelectLocation(e) {
    const location = e.currentTarget.dataset.location;
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];

    const lat = location.latitude || this.data.userLatitude || 39.908823;
    const lng = location.longitude || this.data.userLongitude || 116.397470;

    if (prevPage) {
      const addressData = {
        name: location.name,
        address: location.address || location.name,
        latitude: lat,
        longitude: lng,
      };

      if (this.data.type === "start") {
        prevPage.setData({
          startAddress: addressData,
          latitude: lat,
          longitude: lng,
        });
      } else {
        prevPage.setData({ endAddress: addressData });
        if (prevPage.calcEstimate) prevPage.calcEstimate();
      }
    }

    wx.navigateBack();
  },

  onCurrentLocation() {
    txMap.getCurrentLocation().then((res) => {
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage) {
        prevPage.setData({
          startAddress: {
            name: "当前位置",
            latitude: res.latitude,
            longitude: res.longitude,
          },
          latitude: res.latitude,
          longitude: res.longitude,
        });
      }
      wx.navigateBack();
    }).catch(() => {});
  },

  onMapChoose() {
    txMap.chooseLocation().then((res) => {
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage) {
        const addressData = {
          name: res.name || res.address,
          address: res.address,
          latitude: res.latitude,
          longitude: res.longitude,
        };
        if (this.data.type === "start") {
          prevPage.setData({ startAddress: addressData });
        } else {
          prevPage.setData({ endAddress: addressData });
          if (prevPage.calcEstimate) prevPage.calcEstimate();
        }
      }
      wx.navigateBack();
    }).catch(() => {});
  },
});
