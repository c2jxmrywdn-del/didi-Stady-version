// utils/errorCodes.js — 云函数返回码统一字典(前后端约定)
// 约定:成功恒为 0;失败使用带语义的负码,便于前端区分"权限/限流/不存在/参数"等错误。
// 云函数各自独立部署、无法跨包 require,故在每个云函数入口文件顶部各自声明同名常量,
// 数值必须与本字典保持一致(见 matchFunctions / orderFunctions 顶部 ERROR 常量)。
const ERR = {
  OK: 0, // 成功
  PARAM: -100, // 参数缺失/非法
  PERMISSION_DENIED: -403, // 越权:资源不属于当前用户
  NOT_FOUND: -404, // 资源不存在
  RATE_LIMITED: -429, // 操作过于频繁(限流)
  SERVER: -500, // 服务端内部异常
  UNKNOWN: -1, // 兼容旧代码的通用错误
};

// 各错误码对应的默认用户提示文案(云函数未带 message 时前端兜底)
const ERR_MSG = {
  [ERR.PARAM]: "参数不完整",
  [ERR.PERMISSION_DENIED]: "订单不存在或无权操作",
  [ERR.NOT_FOUND]: "记录不存在",
  [ERR.RATE_LIMITED]: "操作过于频繁,请稍后再试",
  [ERR.SERVER]: "服务器错误,请稍后重试",
  [ERR.UNKNOWN]: "操作失败",
};

// 是否为"确定性业务错误"(不应自动重试):区别于网络抖动/冷启动等瞬时错误。
// 云函数返回的结构化错误都带语义 code;而 wx.cloud 传输层失败没有 code(交给重试)。
function isDefinitiveBusinessError(err) {
  return !!(err && typeof err.code === "number" && err.code !== 0);
}

module.exports = { ERR, ERR_MSG, isDefinitiveBusinessError };
