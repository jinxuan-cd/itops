// 操作审计日志查询（管理员 / 审计员只读）
const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, asyncHandler } = require('../utils/helpers')
const { auth, canViewAll } = require('../middleware/auth')

router.use(auth, canViewAll)

router.get('/', asyncHandler(async (req, res) => {
  const { start, end, keyword, username, method, path, limit } = req.query
  const where = ['1=1']
  const params = []
  if (start) { where.push('create_time >= ?'); params.push(start) }
  if (end) { where.push('create_time <= ?'); params.push(end + ' 23:59:59') }
  if (username) { where.push('username = ?'); params.push(username) }
  if (method) { where.push('method = ?'); params.push(method) }
  if (path) { where.push('path LIKE ?'); params.push(`%${path}%`) }
  if (keyword) {
    where.push('(action LIKE ? OR target LIKE ? OR detail LIKE ? OR ip LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  const n = Math.min(Math.max(parseInt(limit, 10) || 300, 1), 1000)
  const rows = await query(
    `SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY log_id DESC LIMIT ${n}`,
    params
  )
  ok(res, rows)
}))

// 操作人下拉
router.get('/users', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT username, COUNT(*) AS cnt FROM audit_log GROUP BY username ORDER BY cnt DESC LIMIT 50'
  )
  ok(res, rows.map(r => ({ username: r.username, count: Number(r.cnt) })))
}))

// 概览：近 7 天每天的操作数 + 高频动作
router.get('/summary', asyncHandler(async (req, res) => {
  const daily = await query(
    `SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c
     FROM audit_log WHERE create_time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY d ORDER BY d`
  )
  const top = await query(
    `SELECT action, COUNT(*) AS c FROM audit_log
     WHERE create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY action ORDER BY c DESC LIMIT 8`
  )
  const total = await query('SELECT COUNT(*) AS c FROM audit_log')
  ok(res, {
    daily: daily.map(r => ({ date: r.d, count: Number(r.c) })),
    top: top.map(r => ({ action: r.action, count: Number(r.c) })),
    total: Number(total[0].c || 0)
  })
}))

module.exports = router
