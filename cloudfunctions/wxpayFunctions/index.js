// 云函数入口 - 微信支付
// 文档: https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/pay/wxpay.api-chooseWXPay.html
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ============ 支付配置(从云开发环境变量读取) ============
//
// 安全:严禁硬编码任何支付相关密钥
// 配置路径: 微信云开发控制台 → 云函数 → wxpayFunctions → 配置 → 环境变量
// 必填环境变量:
//   WXPAY_MCH_ID     - 商户号
//   WXPAY_MCH_KEY    - 商户支付密钥(APIv2 key,32 字符)
//   WXPAY_NOTIFY_URL - 支付回调地址(必须是 https 公网可访问)
function loadPayConfig() {
  const mchid = process.env.WXPAY_MCH_ID;
  const mchKey = process.env.WXPAY_MCH_KEY;
  const notifyUrl = process.env.WXPAY_NOTIFY_URL;

  // 启动期检测:关键密钥缺失时直接抛错,避免静默失败
  if (!mchid) throw new Error('云函数环境变量 WXPAY_MCH_ID 未配置');
  if (!mchKey) throw new Error('云函数环境变量 WXPAY_MCH_KEY 未配置');
  if (!notifyUrl) throw new Error('云函数环境变量 WXPAY_NOTIFY_URL 未配置');

  return { mchid, mchKey, notifyUrl };
}

// 模块初始化阶段一次性读取并缓存:环境变量配置在实例生命周期内保持不变,
// 避免每次调用都重复读取 process.env 与执行缺失检查。
const PAY_CONFIG = loadPayConfig();

// 注意:appid 来自 cloud.getWXContext(),是「每次调用」的运行时上下文,
// 在模块初始化(尤其热启动)时并无有效调用上下文,因此不能缓存,须每次实时获取。
function getPayConfig() {
  return { appid: cloud.getWXContext().APPID, ...PAY_CONFIG };
}

// ============ 工具函数 ============

// 生成随机字符串
function nonceStr(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let str = '';
  for (let i = 0; i < length; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

// 生成签名(MD5)
function sign(params, key) {
  // 1. 参数按 ASCII 字典序排序
  const sortedKeys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort();
  // 2. 拼接成 URL key=value 形式
  const stringA = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  // 3. 拼接 API 密钥
  const stringSignTemp = `${stringA}&key=${key}`;
  // 4. MD5 加密并转大写
  return crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();
}

// 校验签名
function verifySign(params, key, signToVerify) {
  const computed = sign(params, key);
  return computed === signToVerify;
}

// XML 转对象
function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

// 对象转 XML
function toXml(obj) {
  let xml = '<xml>';
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== '') {
      xml += `<${key}><![CDATA[${obj[key]}]]></${key}>`;
    }
  }
  xml += '</xml>';
  return xml;
}

// 发起 HTTPS 请求(同步)
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: options.method || 'POST', ...options }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ============ 业务实现 ============

// 1. 统一下单(JSAPI / 小程序支付)
async function createOrder(data) {
  const { outTradeNo, totalFee, body, openid, attach, tradeType = 'JSAPI' } = data;
  const config = getPayConfig();

  if (!outTradeNo || !totalFee || !body) {
    return { code: -1, message: '参数不完整' };
  }
  if (tradeType === 'JSAPI' && !openid) {
    return { code: -1, message: 'JSAPI 支付需要 openid' };
  }

  // 构造统一下单参数
  const params = {
    appid: config.appid,
    mch_id: config.mchid,
    nonce_str: nonceStr(),
    body: body,
    out_trade_no: outTradeNo,
    total_fee: Math.round(totalFee), // 单位:分
    spbill_create_ip: data.spbillCreateIp || '127.0.0.1',
    notify_url: config.notifyUrl,
    trade_type: tradeType,
    attach: attach || '',
  };

  if (tradeType === 'JSAPI') {
    params.openid = openid;
  }

  // 签名
  params.sign = sign(params, config.mchKey);

  // 构造 XML
  const xmlData = toXml(params);

  try {
    // 实际生产:应调用 https://api.mch.weixin.qq.com/pay/unifiedorder
    // 这里使用云开发 openapi
    const res = await cloud.openapi.wxpay.createOrder({
      body: xmlData,
    });
    const result = parseXml(res);

    if (result.return_code !== 'SUCCESS') {
      return { code: -1, message: result.return_msg || '下单失败', data: result };
    }
    if (result.result_code !== 'SUCCESS') {
      return { code: -1, message: result.err_code_des || result.err_code || '业务错误', data: result };
    }

    // 保存订单到数据库
    await saveOrderToDB({
      outTradeNo,
      openid: openid || '',
      totalFee,
      body,
      attach: attach || '',
      prepayId: result.prepay_id,
      tradeType,
      status: 'PENDING',
      createTime: db.serverDate(),
    });

    // JSAPI 需要二次签名返回给前端
    if (tradeType === 'JSAPI') {
      const jsapiParams = {
        appId: config.appid,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: nonceStr(),
        package: `prepay_id=${result.prepay_id}`,
        signType: 'MD5',
      };
      jsapiParams.paySign = sign(jsapiParams, config.mchKey);

      return {
        code: 0,
        message: '下单成功',
        data: {
          outTradeNo,
          prepayId: result.prepay_id,
          jsapiParams,
        },
      };
    }

    return {
      code: 0,
      message: '下单成功',
      data: { outTradeNo, prepayId: result.prepay_id },
    };
  } catch (err) {
    console.error('统一下单失败', err);
    return { code: -1, message: '下单失败: ' + err.message };
  }
}

// 2. 查询订单
async function queryOrder(data) {
  const { outTradeNo, transactionId } = data;
  const config = getPayConfig();

  if (!outTradeNo && !transactionId) {
    return { code: -1, message: '请提供商户订单号或微信订单号' };
  }

  const params = {
    appid: config.appid,
    mch_id: config.mchid,
    nonce_str: nonceStr(),
  };
  if (outTradeNo) params.out_trade_no = outTradeNo;
  if (transactionId) params.transaction_id = transactionId;
  params.sign = sign(params, config.mchKey);

  try {
    const res = await cloud.openapi.wxpay.queryOrder({
      body: toXml(params),
    });
    const result = parseXml(res);

    // 同步数据库状态
    if (result.return_code === 'SUCCESS' && result.out_trade_no) {
      await updateOrderStatus(result.out_trade_no, {
        status: result.trade_state || 'UNKNOWN',
        transactionId: result.transaction_id,
        timeEnd: result.time_end,
        totalFee: result.total_fee,
      });
    }

    return { code: 0, data: result };
  } catch (err) {
    return { code: -1, message: '查询失败: ' + err.message };
  }
}

// 3. 关闭订单
async function closeOrder(data) {
  const { outTradeNo } = data;
  const config = getPayConfig();

  if (!outTradeNo) return { code: -1, message: '请提供商户订单号' };

  const params = {
    appid: config.appid,
    mch_id: config.mchid,
    out_trade_no: outTradeNo,
    nonce_str: nonceStr(),
  };
  params.sign = sign(params, config.mchKey);

  try {
    const res = await cloud.openapi.wxpay.closeOrder({
      body: toXml(params),
    });
    const result = parseXml(res);

    if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
      await updateOrderStatus(outTradeNo, { status: 'CLOSED' });
    }

    return { code: 0, data: result };
  } catch (err) {
    return { code: -1, message: '关闭失败: ' + err.message };
  }
}

// 4. 申请退款
async function refund(data) {
  const { outTradeNo, outRefundNo, totalFee, refundFee, reason = '用户申请退款' } = data;
  const config = getPayConfig();

  if (!outTradeNo || !outRefundNo || !totalFee || !refundFee) {
    return { code: -1, message: '参数不完整' };
  }

  const params = {
    appid: config.appid,
    mch_id: config.mchid,
    nonce_str: nonceStr(),
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    total_fee: Math.round(totalFee),
    refund_fee: Math.round(refundFee),
    refund_desc: reason,
    notify_url: config.notifyUrl,
  };
  params.sign = sign(params, config.mchKey);

  try {
    const res = await cloud.openapi.wxpay.refund({
      body: toXml(params),
    });
    const result = parseXml(res);

    if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
      await updateOrderStatus(outTradeNo, {
        status: 'REFUNDING',
        refundNo: outRefundNo,
        refundFee,
      });
    }

    return { code: 0, data: result };
  } catch (err) {
    return { code: -1, message: '退款失败: ' + err.message };
  }
}

// 5. 查询退款
async function refundQuery(data) {
  const { outTradeNo, outRefundNo, transactionId, refundId } = data;
  const config = getPayConfig();

  const params = {
    appid: config.appid,
    mch_id: config.mchid,
    nonce_str: nonceStr(),
  };
  if (outTradeNo) params.out_trade_no = outTradeNo;
  if (outRefundNo) params.out_refund_no = outRefundNo;
  if (transactionId) params.transaction_id = transactionId;
  if (refundId) params.refund_id = refundId;
  params.sign = sign(params, config.mchKey);

  try {
    const res = await cloud.openapi.wxpay.refundQuery({
      body: toXml(params),
    });
    return { code: 0, data: parseXml(res) };
  } catch (err) {
    return { code: -1, message: '查询退款失败: ' + err.message };
  }
}

// 6. 支付回调通知
async function payNotify(data) {
  // 微信支付回调,验证签名并处理业务逻辑
  // data.xml: 微信回调的 XML 数据
  const config = getPayConfig();
  const xml = data.xml || '';
  const result = parseXml(xml);

  // 验证签名
  const signToVerify = result.sign;
  delete result.sign;
  if (!verifySign(result, config.mchKey, signToVerify)) {
    return { code: -1, message: '签名验证失败' };
  }

  // 验证结果
  if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS') {
    return { code: -1, message: '支付失败' };
  }

  // 更新订单状态
  await updateOrderStatus(result.out_trade_no, {
    status: 'SUCCESS',
    transactionId: result.transaction_id,
    timeEnd: result.time_end,
    totalFee: result.total_fee,
    paidAt: db.serverDate(),
  });

  // 业务处理: 标记订单为已支付
  try {
    const ordersCol = db.collection('orders');
    const orderRes = await ordersCol.where({ outTradeNo: result.out_trade_no }).get();
    if (orderRes.data.length > 0) {
      await ordersCol.doc(orderRes.data[0]._id).update({
        data: {
          payStatus: 'paid',
          payTime: db.serverDate(),
          payMethod: 'wechat',
          transactionId: result.transaction_id,
        },
      });
    }
  } catch (err) {
    console.warn('更新订单状态失败', err);
  }

  // 返回成功给微信
  return {
    code: 0,
    data: {
      return_code: 'SUCCESS',
      return_msg: 'OK',
    },
    xml: toXml({ return_code: 'SUCCESS', return_msg: 'OK' }),
  };
}

// 7. 生成商户订单号
function generateOutTradeNo(prefix = 'WX') {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const hms = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${ymd}${hms}${rand}`;
}

// ============ 数据库辅助 ============
async function saveOrderToDB(order) {
  try {
    await db.collection('wxpayOrders').add({ data: order });
  } catch (e) {
    if (e.errCode === -501001) {
      // 集合不存在,自动创建
      await db.createCollection('wxpayOrders');
      await db.collection('wxpayOrders').add({ data: order });
    } else {
      console.warn('保存订单失败', e);
    }
  }
}

async function updateOrderStatus(outTradeNo, updates) {
  try {
    const col = db.collection('wxpayOrders');
    // 优化:where({outTradeNo}).update() 一次往返(原代码先 get 再 update 两次往返)
    await col.where({ outTradeNo }).update({
      data: { ...updates, updateTime: db.serverDate() },
    });
  } catch (e) {
    console.warn('更新订单状态失败', e);
  }
}

// ============ 云函数入口 ============
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { type, data } = event;

  try {
    switch (type) {
      case 'createOrder':
        return await createOrder({ ...data, openid: data.openid || wxContext.OPENID });
      case 'queryOrder':
        return await queryOrder(data);
      case 'closeOrder':
        return await closeOrder(data);
      case 'refund':
        return await refund(data);
      case 'refundQuery':
        return await refundQuery(data);
      case 'payNotify':
        return await payNotify(data);
      case 'generateOutTradeNo':
        return { code: 0, data: { outTradeNo: generateOutTradeNo(data.prefix) } };
      default:
        return { code: -1, message: '未知操作类型: ' + type };
    }
  } catch (err) {
    console.error('wxpayFunctions 错误:', err);
    return { code: -1, message: '服务器错误: ' + err.message };
  }
};
