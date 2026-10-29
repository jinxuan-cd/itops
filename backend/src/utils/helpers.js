// 通用工具：统一响应、异步包装、安全解析 JSON 字段

function ok(res, data = null, message = 'success') {
  res.json({ code: 0, message, data })
}

function fail(res, message = 'error', code = 1, status = 200) {
  res.status(status).json({ code, message, data: null })
}

// 包装 async 路由，自动捕获异常
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

// 安全解析 JSON（mysql2 已解析 JSON 列，这里兜底字符串情况）
function safeJson(val) {
  if (val == null) return null
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch (e) { return null }
  }
  return val
}

// 本机时区的「今天 / 现在」字符串。
// 不能用 toISOString()：那是 UTC，北京时间 00:00-08:00 之间会算成前一天。
function pad2(n) { return String(n).padStart(2, '0') }
function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function nowStr(d = new Date()) {
  return `${todayStr(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

module.exports = { ok, fail, asyncHandler, safeJson, todayStr, nowStr }
