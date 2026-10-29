const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth } = require('../middleware/auth')

router.use(auth)

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 本周一 ~ 本周日
function weekRange() {
  const d = new Date()
  const day = d.getDay() || 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - day + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  return [fmt(monday), fmt(sunday)]
}

// 列表（Tab：today / week / all / done；前三者只显示未完成，done 显示已完成）
router.get('/', asyncHandler(async (req, res) => {
  const { tab } = req.query
  let where = 'user_id = ?'
  const params = [req.user.user_id]
  const t = todayStr()
  if (tab === 'done') {
    where += ' AND is_finish = 1'
  } else {
    where += ' AND is_finish = 0'
    if (tab === 'today') {
      where += ' AND plan_date = ?'
      params.push(t)
    } else if (tab === 'week') {
      const [s, e] = weekRange()
      where += ' AND plan_date BETWEEN ? AND ?'
      params.push(s, e)
    }
  }
  const rows = await query(
    `SELECT * FROM todo WHERE ${where} ORDER BY plan_date ASC, todo_id DESC`,
    params
  )
  ok(res, rows)
}))

// 当日未完成（供浮动面板 / 看板）
router.get('/pending/today', asyncHandler(async (req, res) => {
  const t = todayStr()
  const rows = await query(
    'SELECT * FROM todo WHERE user_id = ? AND plan_date = ? AND is_finish = 0 ORDER BY todo_id DESC',
    [req.user.user_id, t]
  )
  ok(res, rows)
}))

// 新增
router.post('/', asyncHandler(async (req, res) => {
  const { todo_title, todo_detail, plan_date, source, ticket_id } = req.body
  if (!todo_title) return fail(res, '待办标题必填')
  await query(
    'INSERT INTO todo (user_id, todo_title, todo_detail, plan_date, source, ticket_id) VALUES (?,?,?,?,?,?)',
    [req.user.user_id, todo_title, todo_detail || '', plan_date || null, source || 'manual', ticket_id || null]
  )
  ok(res, null, '创建成功')
}))

// 更新（含勾选完成、编辑）
router.put('/:id', asyncHandler(async (req, res) => {
  const { todo_title, todo_detail, plan_date, is_finish } = req.body
  const sets = [], vals = []
  if (todo_title !== undefined) { sets.push('todo_title = ?'); vals.push(todo_title) }
  if (todo_detail !== undefined) { sets.push('todo_detail = ?'); vals.push(todo_detail) }
  if (plan_date !== undefined) { sets.push('plan_date = ?'); vals.push(plan_date) }
  if (is_finish !== undefined) { sets.push('is_finish = ?'); vals.push(is_finish ? 1 : 0) }
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id, req.user.user_id)
  const result = await query('UPDATE todo SET ' + sets.join(', ') + ' WHERE todo_id = ? AND user_id = ?', vals)
  if (result.affectedRows === 0) return fail(res, '待办不存在或无权限')
  ok(res, null, '更新成功')
}))

// 删除
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM todo WHERE todo_id = ? AND user_id = ?', [req.params.id, req.user.user_id])
  if (result.affectedRows === 0) return fail(res, '待办不存在或无权限')
  ok(res, null, '删除成功')
}))

module.exports = router
