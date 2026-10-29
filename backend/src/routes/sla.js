// SLA 时效策略维护
const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth, adminOnly } = require('../middleware/auth')
const { backfillSla } = require('../utils/sla')

router.use(auth)

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM sla_policy ORDER BY problem_type, policy_id')
  ok(res, rows.map(r => ({
    ...r,
    respond_hours: Number(r.respond_hours),
    resolve_hours: Number(r.resolve_hours)
  })))
}))

router.post('/', adminOnly, asyncHandler(async (req, res) => {
  const b = req.body
  const r = await query(
    'INSERT INTO sla_policy (problem_type, priority, respond_hours, resolve_hours, remark) VALUES (?,?,?,?,?)',
    [b.problem_type || '*', b.priority || null, Number(b.respond_hours) || 4, Number(b.resolve_hours) || 24, b.remark || null]
  )
  ok(res, { policy_id: r.insertId }, '已新增策略')
}))

router.put('/:id', adminOnly, asyncHandler(async (req, res) => {
  const b = req.body
  const sets = []
  const vals = []
  ;['problem_type', 'priority', 'respond_hours', 'resolve_hours', 'remark'].forEach(f => {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f] === '' ? null : b[f]) }
  })
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id)
  const r = await query(`UPDATE sla_policy SET ${sets.join(', ')} WHERE policy_id = ?`, vals)
  if (!r.affectedRows) return fail(res, '策略不存在')
  ok(res, null, '已保存')
}))

router.delete('/:id', adminOnly, asyncHandler(async (req, res) => {
  const r = await query('DELETE FROM sla_policy WHERE policy_id = ?', [req.params.id])
  if (!r.affectedRows) return fail(res, '策略不存在')
  ok(res, null, '已删除')
}))

// 改完策略后重算全部工单的 SLA 截止时间
router.post('/recalc', adminOnly, asyncHandler(async (req, res) => {
  await query('UPDATE ticket SET sla_respond_due = NULL, sla_resolve_due = NULL WHERE happen_time IS NOT NULL')
  const n = await backfillSla()
  ok(res, { updated: n }, `已按当前策略重算 ${n} 条工单的时效`)
}))

module.exports = router
