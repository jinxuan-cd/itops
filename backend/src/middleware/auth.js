const jwt = require('jsonwebtoken')
const { fail } = require('../utils/helpers')
const { query } = require('../db')

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_prod'

// 角色说明：
//   admin    管理员：全部功能 + 账号/字典管理
//   auditor  审计员：只读查看全公司数据（看板、团队分析、工单/知识/项目），不能新增或修改业务数据
//   service  服务台（可选角色）：负责派单，可查看全部工单并指派/转单；不开服务台时由运维自行抢单
//   user     普通运维：只能看自己录的单、指派给自己的单，以及待接单池
const ROLE_VIEW_ALL = ['admin', 'auditor']
const ROLES = ['admin', 'auditor', 'service', 'user']

function isViewAll(role) { return ROLE_VIEW_ALL.includes(role) }

function signToken(user) {
  return jwt.sign(
    { user_id: user.user_id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  )
}

// 鉴权中间件：解析 Bearer Token，挂载 req.user
// 同时回查账号状态（60 秒缓存）：停用账号 / 角色变更不必等 token 过期就生效，
// 否则把某人降级为只读审计员后，他手里的旧 token 12 小时内仍可写数据
const STATUS_TTL = 60 * 1000
const statusCache = new Map() // user_id -> { role, is_enable, at }

function clearAuthCache(userId) {
  if (userId) statusCache.delete(Number(userId))
  else statusCache.clear()
}

async function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return fail(res, '未登录或 token 缺失', 401, 401)
  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return fail(res, 'token 无效或已过期', 401, 401)
  }
  try {
    const uid = Number(decoded.user_id)
    let c = statusCache.get(uid)
    if (!c || Date.now() - c.at > STATUS_TTL) {
      const rows = await query('SELECT role, is_enable FROM sys_user WHERE user_id = ?', [uid])
      if (!rows.length) return fail(res, '账号不存在或已被删除', 401, 401)
      c = { role: rows[0].role, is_enable: Number(rows[0].is_enable), at: Date.now() }
      statusCache.set(uid, c)
    }
    if (!c.is_enable) return fail(res, '账号已停用，请联系管理员', 403, 403)
    decoded.role = c.role // 以数据库里的最新角色为准
  } catch (e) {
    // 数据库异常时不阻断请求（避免数据库抖动导致全员掉线），沿用 token 里的角色
  }
  req.user = decoded
  next()
}

// 管理员中间件（账号管理 / 字典维护等写操作）
function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') return next()
  return fail(res, '需要管理员权限', 403, 403)
}

// 可查看全公司数据（管理员 + 审计员）
function canViewAll(req, res, next) {
  if (req.user && isViewAll(req.user.role)) return next()
  return fail(res, '需要管理员或审计员权限', 403, 403)
}

module.exports = { signToken, auth, adminOnly, canViewAll, isViewAll, clearAuthCache, JWT_SECRET, ROLES }
