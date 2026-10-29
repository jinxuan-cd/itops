// 操作审计：记录所有写操作（POST / PUT / DELETE），用于追溯「谁在什么时候改了什么」
// 只记录结果，不阻断请求；失败也记，便于排查
const jwt = require('jsonwebtoken')
const { query } = require('../db')
const { JWT_SECRET } = require('./auth')

// 不记录的高频/无意义请求
const SKIP = [
  /^\/auth\/captcha/,
  /^\/auth\/login/,
  /^\/public\//,
  /^\/health/,
  /^\/ai\/test$/,
  /^\/ai\/models$/
]

// 敏感字段脱敏
const SENSITIVE = /password|token|api_key|apikey|secret/i

function actionOf(method, p) {
  const map = [
    [/^\/tickets\/batch-delete/, '批量删除工单'],
    [/^\/tickets\/batch-complete/, '批量标记完成'],
    [/^\/tickets\/batch-status/, '批量修改状态'],
    [/^\/tickets\/[^/]+\/assign/, '指派工单'],
    [/^\/tickets\/import/, '导入工单'],
    [/^\/tickets\/[^/]+\/complete/, '标记工单完成'],
    [/^\/tickets$/, '新增工单'],
    [/^\/tickets\/[^/]+$/, '修改/删除工单'],
    [/^\/incidents$/, '新增故障'],
    [/^\/incidents\/[^/]+$/, '修改/删除故障'],
    [/^\/inspections$/, '新增巡检'],
    [/^\/inspections\/[^/]+$/, '修改/删除巡检'],
    [/^\/accounts$/, '新增账号台账'],
    [/^\/accounts\/[^/]+$/, '修改/删除账号台账'],
    [/^\/knowledge/, '知识库操作'],
    [/^\/users/, '账号管理'],
    [/^\/dictionaries/, '字典维护'],
    [/^\/goals/, '月度目标'],
    [/^\/todos/, '待办'],
    [/^\/projects/, '项目'],
    [/^\/notify/, '通知配置'],
    [/^\/backup/, '数据备份'],
    [/^\/sla/, 'SLA 策略'],
    [/^\/ai\/config/, 'AI 配置'],
    [/^\/monthly-report/, '月度报告']
  ]
  const prefix = { POST: '新增', PUT: '修改', DELETE: '删除', PATCH: '修改' }[method] || method
  for (const [re, label] of map) if (re.test(p)) return label
  return prefix + ' ' + p
}

// 从请求参数里挑出关键信息，脱敏后截断
function pickDetail(body) {
  if (!body || typeof body !== 'object') return null
  const out = {}
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE.test(k)) { out[k] = '***'; continue }
    if (v && typeof v === 'object') { out[k] = Array.isArray(v) ? `[${v.length} 项]` : '{…}'; continue }
    const s = String(v == null ? '' : v)
    out[k] = s.length > 60 ? s.slice(0, 60) + '…' : s
  }
  const json = JSON.stringify(out)
  return json.length > 600 ? json.slice(0, 600) + '…' : json
}

function auditLogger(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const p = (req.path || '').replace(/^\/api/, '')
  if (SKIP.some(re => re.test(p))) return next()

  const bodySnapshot = req.body && typeof req.body === 'object' ? pickDetail(req.body) : null

  res.on('finish', () => {
    let user = {}
    const header = req.headers.authorization || ''
    if (header.startsWith('Bearer ')) {
      try { user = jwt.verify(header.slice(7), JWT_SECRET) || {} } catch { user = {} }
    }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim()
    query(
      `INSERT INTO audit_log (user_id, username, role, method, path, action, target, detail, ip, status_code)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [user.user_id || null, user.username || '(未登录)', user.role || null, req.method,
       p.slice(0, 240), actionOf(req.method, p), String(req.params && (req.params.id || req.params.key) || '').slice(0, 240) || null,
       bodySnapshot, ip.slice(0, 60), res.statusCode]
    ).catch(e => console.error('[audit] 写入失败', e.message))
  })
  next()
}

module.exports = { auditLogger, actionOf }
