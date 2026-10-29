// 账号与权限台账：记录各系统账号的开通 / 变更 / 注销，用于合规审计与离职核查
const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler, todayStr } = require('../utils/helpers')
const { auth, isViewAll } = require('../middleware/auth')

router.use(auth)

function scope(req, alias = '') {
  const pre = alias ? alias + '.' : ''
  if (isViewAll(req.user.role) && req.query.all === '1') return { clause: '', params: [] }
  return { clause: `AND ${pre}user_id = ?`, params: [req.user.user_id] }
}

// 写操作（编辑 / 删除）：管理员、审计员不受 all=1 限制。
// 否则会出现「列表能看到别人的记录、点编辑却提示无权限」的问题（前端写操作不带 all 参数）
function writeScope(req) {
  if (isViewAll(req.user.role)) return { clause: '', params: [] }
  return { clause: 'AND user_id = ?', params: [req.user.user_id] }
}

router.get('/', asyncHandler(async (req, res) => {
  const { keyword, system_name, status, action, start, end } = req.query
  const sc = scope(req, 'a')
  const where = ['1=1']
  const params = []
  if (sc.clause) { where.push(sc.clause.replace(/^AND/, '')); params.push(...sc.params) }
  if (system_name) { where.push('a.system_name = ?'); params.push(system_name) }
  if (status) { where.push('a.status = ?'); params.push(status) }
  if (action) { where.push('a.action = ?'); params.push(action) }
  if (start) { where.push('a.operate_date >= ?'); params.push(start) }
  if (end) { where.push('a.operate_date <= ?'); params.push(end) }
  if (keyword) {
    where.push('(a.account_name LIKE ? OR a.owner_name LIKE ? OR a.dept LIKE ? OR a.permission_desc LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  const rows = await query(
    `SELECT a.*, u.real_name FROM account_ledger a LEFT JOIN sys_user u ON u.user_id = a.user_id
     WHERE ${where.join(' AND ')} ORDER BY a.operate_date DESC, a.account_id DESC LIMIT 1000`,
    params
  )
  ok(res, rows)
}))

// 汇总（按系统 / 按状态），用于台账页顶部统计
router.get('/summary', asyncHandler(async (req, res) => {
  // 汇总要跟列表用同一套筛选条件，否则「筛了系统/状态，列表变了、上面的卡片数字不变」
  const { keyword, system_name, status, action, start, end } = req.query
  const sc = scope(req)
  const where = ['1=1']
  const params = []
  if (sc.clause) { where.push(sc.clause.replace(/^AND/, '')); params.push(...sc.params) }
  if (system_name) { where.push('system_name = ?'); params.push(system_name) }
  if (status) { where.push('status = ?'); params.push(status) }
  if (action) { where.push('action = ?'); params.push(action) }
  if (start) { where.push('operate_date >= ?'); params.push(start) }
  if (end) { where.push('operate_date <= ?'); params.push(end) }
  if (keyword) {
    where.push('(account_name LIKE ? OR owner_name LIKE ? OR dept LIKE ? OR permission_desc LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  const bySystem = await query(
    `SELECT COALESCE(system_name,'未分类') AS name, COUNT(*) AS value,
            SUM(status='active') AS active_cnt
     FROM account_ledger WHERE ${where.join(' AND ')} GROUP BY name ORDER BY value DESC`, params
  )
  ok(res, bySystem.map(r => ({ name: r.name, value: Number(r.value), active: Number(r.active_cnt) })))
}))

router.post('/', asyncHandler(async (req, res) => {
  const b = req.body
  if (!b.account_name && !b.owner_name) return fail(res, '请至少填写账号或使用人')
  const r = await query(
    `INSERT INTO account_ledger (user_id, system_name, account_name, owner_name, dept, action, permission_desc, operate_date, status, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [req.user.user_id, b.system_name || null, b.account_name || null, b.owner_name || null, b.dept || null,
     b.action || '开通', b.permission_desc || null, b.operate_date || todayStr(),
     b.status || (b.action === '注销' ? 'closed' : 'active'), b.remark || null]
  )
  ok(res, { account_id: r.insertId }, '已登记')
}))

router.put('/:id', asyncHandler(async (req, res) => {
  const sc = writeScope(req)
  const b = req.body
  const editable = ['system_name', 'account_name', 'owner_name', 'dept', 'action', 'permission_desc', 'operate_date', 'status', 'remark']
  const sets = []
  const vals = []
  editable.forEach(f => { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f] === '' ? null : b[f]) } })
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id, ...sc.params)
  const r = await query(`UPDATE account_ledger SET ${sets.join(', ')} WHERE account_id = ? ${sc.clause}`, vals)
  if (!r.affectedRows) return fail(res, '记录不存在或无权限')
  ok(res, null, '已保存')
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const sc = writeScope(req)
  const r = await query(`DELETE FROM account_ledger WHERE account_id = ? ${sc.clause}`, [req.params.id, ...sc.params])
  if (!r.affectedRows) return fail(res, '记录不存在或无权限')
  ok(res, null, '已删除')
}))

module.exports = router
