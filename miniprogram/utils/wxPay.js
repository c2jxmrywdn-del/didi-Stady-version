/**
 * 微信支付工具类
 * 通过云函数 wxpayFunctions 代理微信支付
 * 性能优化:queryOrder / closeOrder / refundQuery 加 60s 内存缓存,避免页面回退时重复打云
 */

const CLOUD_FN = 'wxpayFunctions';
const QUERY_TTL = 60000; // 60s
const QUERY_CACHE = new Map(); // key -> { value, expire }

function cachedCall(type, data, ttl) {
  const key = type + '::' + JSON.stringify(data || {});
  const now = Date.now();
  const hit = QUERY_CACHE.get(key);
  if (hit && hit.expire > now) return Promise.resolve(hit.value);
  return wx.cloud.callFunction({
    name: CLOUD_FN,
    data: { type, data },
  }).then((res) => {
    if (ttl > 0) QUERY_CACHE.set(key, { value: res.result, expire: now + ttl });
    return res.result;
  });
}

/**
 * 统一下单 + 拉起支付
 */
function pay(options) {
  return new Promise((resolve, reject) => {
    // 1. 先生成商户订单号
    wx.cloud.callFunction({
      name: CLOUD_FN,
      data: { type: 'generateOutTradeNo', data: { prefix: 'WX' } },
    }).then(res => {
      if (res.result.code !== 0) {
        reject(new Error(res.result.message || '生成订单号失败'));
        return;
      }
      const outTradeNo = options.outTradeNo || res.result.data.outTradeNo;

      // 2. 统一下单
      return wx.cloud.callFunction({
        name: CLOUD_FN,
        data: {
          type: 'createOrder',
          data: {
            outTradeNo,
            totalFee: Math.round(options.totalFee * 100), // 元 -> 分
            body: options.body,
            attach: options.attach || '',
            tradeType: 'JSAPI',
          },
        },
      });
    }).then(res => {
      if (res.result.code !== 0) {
        reject(new Error(res.result.message || '下单失败'));
        return;
      }

      const { outTradeNo, jsapiParams } = res.result.data;

      // 3. 拉起微信支付
      return new Promise((rs, rj) => {
        wx.requestPayment({
          timeStamp: jsapiParams.timeStamp,
          nonceStr: jsapiParams.nonceStr,
          package: jsapiParams.package,
          signType: jsapiParams.signType,
          paySign: jsapiParams.paySign,
          success: (payRes) => {
            resolve({ code: 0, message: '支付成功', data: { outTradeNo, ...payRes } });
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('cancel') > -1) {
              rj(new Error('用户取消支付'));
            } else {
              rj(new Error(err.errMsg || '支付失败'));
            }
          },
        });
      });
    }).catch(reject);
  });
}

/**
 * 查询订单状态(60s 内存缓存)
 */
function queryOrder(outTradeNo) {
  return cachedCall('queryOrder', { outTradeNo }, QUERY_TTL);
}

/**
 * 关闭订单
 */
function closeOrder(outTradeNo) {
  return cachedCall('closeOrder', { outTradeNo }, 0);
}

/**
 * 申请退款
 */
function refund(data) {
  return wx.cloud.callFunction({
    name: CLOUD_FN,
    data: { type: 'refund', data },
  }).then(res => res.result);
}

/**
 * 查询退款(60s 内存缓存)
 */
function refundQuery(data) {
  return cachedCall('refundQuery', data, QUERY_TTL);
}

module.exports = {
  pay,
  queryOrder,
  closeOrder,
  refund,
  refundQuery,
};
