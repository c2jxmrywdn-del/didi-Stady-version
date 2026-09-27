// 百度地图API代理云函数
// 在云函数后端调用百度地图Web API，避免前端暴露API Key
//
// 安全:AK 必须通过云函数环境变量配置,严禁硬编码
// 配置路径: 微信云开发控制台 → 云函数 → baiduMap → 配置 → 环境变量
// 变量名: BAIDU_MAP_AK
// 变量值: [你的百度地图服务端 AK]
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 安全:必须从云函数环境变量读取,不允许硬编码 fallback
const BMap_AK = process.env.BAIDU_MAP_AK;
if (!BMap_AK) {
  console.error('[baiduMap] 环境变量 BAIDU_MAP_AK 未配置');
  // 不抛出,避免影响其他云函数,返回明确的错误码
}

// 通用HTTP GET请求
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('解析响应失败: ' + data.substring(0, 200)));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// 统一错误响应(关键:AK 未配置时返回友好错误)
function requireAk() {
  if (!BMap_AK) {
    return { code: -1, message: '百度地图 AK 未配置,请在云函数环境变量中设置 BAIDU_MAP_AK' };
  }
  return null;
}

// 逆地理编码：坐标 → 详细地址
async function reverseGeocode(latitude, longitude) {
  const guard = requireAk();
  if (guard) return guard;
  const url = `https://api.map.baidu.com/reverse_geocoding/v3/?ak=${BMap_AK}&output=json&coordtype=gcj02ll&location=${latitude},${longitude}&extensions_poi=1`;
  const result = await httpsGet(url);

  if (result.status !== 0) {
    return { code: -1, message: '逆地理编码失败: ' + (result.message || '未知错误') };
  }

  const addr = result.result;
  return {
    code: 0,
    data: {
      address: addr.formatted_address || '',
      province: addr.addressComponent?.province || '',
      city: addr.addressComponent?.city || '',
      district: addr.addressComponent?.district || '',
      street: addr.addressComponent?.street || '',
      streetNumber: addr.addressComponent?.street_number || '',
      businessArea: addr.business_area || '',
      pois: (addr.pois || []).slice(0, 5).map(p => ({
        name: p.name,
        address: p.addr,
        latitude: p.point?.lat || latitude,
        longitude: p.point?.lng || longitude,
        distance: p.distance || 0,
      })),
    },
  };
}

// 地理编码：地址 → 坐标
async function geocode(address, city) {
  const guard = requireAk();
  if (guard) return guard;
  const url = `https://api.map.baidu.com/geocoding/v3/?ak=${BMap_AK}&output=json&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city || '')}&ret_coordtype=gcj02ll`;
  const result = await httpsGet(url);

  if (result.status !== 0) {
    return { code: -1, message: '地理编码失败: ' + (result.message || '未知错误') };
  }

  return {
    code: 0,
    data: {
      latitude: result.result?.location?.lat || 0,
      longitude: result.result?.location?.lng || 0,
      precise: result.result?.precise || 0,
      confidence: result.result?.confidence || 0,
      level: result.result?.level || '',
    },
  };
}

// POI/地点搜索
async function placeSearch(keyword, region, lat, lng) {
  const guard = requireAk();
  if (guard) return guard;
  let url = `https://api.map.baidu.com/place/v2/search?query=${encodeURIComponent(keyword)}&region=${encodeURIComponent(region || '全国')}&output=json&ak=${BMap_AK}&page_size=20&page_num=0&scope=2`;

  // 如果传入了经纬度，按周边排序
  if (lat && lng) {
    url += `&location=${lat},${lng}&radius=5000`;
  }

  const result = await httpsGet(url);

  if (result.status !== 0) {
    return { code: -1, message: '地点搜索失败: ' + (result.message || '未知错误') };
  }

  return {
    code: 0,
    data: (result.results || []).map(p => ({
      name: p.name,
      address: p.address || '',
      latitude: p.location?.lat || 0,
      longitude: p.location?.lng || 0,
      distance: p.detail_info?.distance || 0,
      province: p.province || '',
      city: p.city || '',
      area: p.area || '',
      tag: p.detail_info?.tag || '',
    })),
    total: result.total || 0,
  };
}

// 驾车路线规划：获取真实距离和时间
async function directionDriving(originLat, originLng, destLat, destLng) {
  const guard = requireAk();
  if (guard) return guard;
  const url = `https://api.map.baidu.com/directionlite/v1/driving?origin=${originLat},${originLng}&destination=${destLat},${destLng}&ak=${BMap_AK}&coord_type=gcj02&ret_coordtype=gcj02`;
  const result = await httpsGet(url);

  if (result.status !== 0) {
    return { code: -1, message: '路线规划失败: ' + (result.message || '未知错误') };
  }

  // 提取路线坐标点用于绘制polyline
  const route = result.result?.routes?.[0];
  if (!route) {
    return { code: -1, message: '未找到可行路线' };
  }

  const steps = route.steps || [];
  const routePoints = [];
  steps.forEach(step => {
    if (step.path) {
      const points = step.path.split(';').map(p => {
        const [lng, lat] = p.split(',');
        return { latitude: parseFloat(lat), longitude: parseFloat(lng) };
      });
      routePoints.push(...points);
    }
  });

  return {
    code: 0,
    data: {
      distance: (route.distance / 1000).toFixed(1),    // 公里
      duration: Math.ceil(route.duration / 60),         // 分钟
      tolls: route.toll || 0,
      trafficCondition: route.traffic_condition || [],
      routePoints,
    },
  };
}

// 获取周边推荐地点（用于"附近"列表）
async function nearbyPoi(latitude, longitude, radius) {
  const guard = requireAk();
  if (guard) return guard;
  const url = `https://api.map.baidu.com/place/v2/search?query=交通设施|餐饮|购物|生活服务&location=${latitude},${longitude}&radius=${radius || 3000}&output=json&ak=${BMap_AK}&scope=2&page_size=10&page_num=0`;
  const result = await httpsGet(url);

  if (result.status !== 0) {
    return { code: -1, message: '获取周边POI失败: ' + (result.message || '未知错误') };
  }

  const pois = (result.results || []).slice(0, 10).map(p => ({
    name: p.name,
    address: p.address || '',
    latitude: p.location?.lat || latitude,
    longitude: p.location?.lng || longitude,
    distance: p.detail_info?.distance || 0,
    tag: p.detail_info?.tag || '',
  }));

  // 按距离排序
  pois.sort((a, b) => a.distance - b.distance);

  return { code: 0, data: pois };
}

// 云函数入口
exports.main = async (event, context) => {
  const { type, data } = event;

  // 启动期检测:AK 未配置时打 warning 日志(便于控制台排查)
  if (!BMap_AK) {
    console.warn('[baiduMap] BAIDU_MAP_AK 未配置,所有地图 API 调用将失败');
  }

  try {
    switch (type) {
      case 'reverseGeocode':
        return await reverseGeocode(data.latitude, data.longitude);
      case 'geocode':
        return await geocode(data.address, data.city);
      case 'placeSearch':
        return await placeSearch(data.keyword, data.region, data.latitude, data.longitude);
      case 'directionDriving':
        return await directionDriving(
          data.originLat, data.originLng,
          data.destLat, data.destLng
        );
      case 'nearbyPoi':
        return await nearbyPoi(data.latitude, data.longitude, data.radius);
      default:
        return { code: -1, message: '未知操作类型' };
    }
  } catch (err) {
    return { code: -1, message: '请求百度地图API失败: ' + err.message };
  }
};
