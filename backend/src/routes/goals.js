const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth } = require('../middleware/auth')

router.use(auth)

// 按月份查询（done=1 已完成 / 否则未完成）
router.get('/', asyncHandler(async (req, res) => {
  const { month, done } = req.query
  let where = 'user_id = ?'
  const params = [req.user.user_id]
  if (month) { where += ' AND goal_month = ?'; params.push(month) }
  where += (done === '1' ? ' AND is_finish = 1' : ' AND is_finish = 0')
  const rows = await query(
    `SELECT * FROM month_goal WHERE ${where} ORDER BY goal_id DESC`, params
  )
  ok(res, rows)
}))

// 新增
router.post('/', asyncHandler(async (req, res) => {
  const { goal_month, goal_content, weight_score } = req.body
  if (!goal_month || !goal_content) return fail(res, '月份和目标内容必填')
  await query(
    'INSERT INTO month_goal (user_id, goal_month, goal_content, weight_score) VALUES (?,?,?,?)',
    [req.user.user_id, goal_month, goal_content, weight_score || 0]
  )
  ok(res, null, '创建成功')
}))

// 更新（含勾选完成；勾选时自动记录完成月份，取消时清空）
router.put('/:id', asyncHandler(async (req, res) => {
  const { goal_content, weight_score, is_finish } = req.body
  const sets = [], vals = []
  if (goal_content !== undefined) { sets.push('goal_content = ?'); vals.push(goal_content) }
  if (weight_score !== undefined) { sets.push('weight_score = ?'); vals.push(weight_score) }
  if (is_finish !== undefined) {
    sets.push('is_finish = ?'); vals.push(is_finish ? 1 : 0)
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    sets.push('finish_month = ?'); vals.push(is_finish ? ym : null)
  }
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id, req.user.user_id)
  const result = await query('UPDATE month_goal SET ' + sets.join(', ') + ' WHERE goal_id = ? AND user_id = ?', vals)
  if (result.affectedRows === 0) return fail(res, '目标不存在或无权限')
  ok(res, null, '更新成功')
}))

// 删除
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM month_goal WHERE goal_id = ? AND user_id = ?', [req.params.id, req.user.user_id])
  if (result.affectedRows === 0) return fail(res, '目标不存在或无权限')
  ok(res, null, '删除成功')
}))

module.exports = router
