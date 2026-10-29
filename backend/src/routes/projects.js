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

// ---- 阶段处理：stages 存 JSON 数组 [{ name, done }] ----
function normalizeStages(v) {
  let arr = v
  if (typeof v === 'string') {
    try { arr = JSON.parse(v) } catch (e) { arr = [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter(s => s && typeof s === 'object' && String(s.name || '').trim())
    .map(s => ({ name: String(s.name).trim(), done: !!s.done }))
}
function deriveProgress(stages, fallback) {
  if (Array.isArray(stages) && stages.length) {
    const done = stages.filter(s => s.done).length
    return Math.round((done / stages.length) * 100)
  }
  return Math.max(0, Math.min(100, Number(fallback) || 0))
}
function currentStageName(stages) {
  if (!Array.isArray(stages) || !stages.length) return ''
  const idx = stages.findIndex(s => !s.done)
  return idx === -1 ? stages[stages.length - 1].name : stages[idx].name
}

// 列表：?status=active/done/paused；?due=1 返回「周期已到仍未完成」的项目
router.get('/', asyncHandler(async (req, res) => {
  const { status, due } = req.query
  let where = 'user_id = ?'
  const params = [req.user.user_id]
  if (status) { where += ' AND status = ?'; params.push(status) }
  if (due === '1') {
    where += " AND status = 'active' AND end_date IS NOT NULL AND end_date < ?"
    params.push(todayStr())
  }
  const rows = await query(`SELECT * FROM project WHERE ${where} ORDER BY end_date IS NULL, end_date ASC, project_id DESC`, params)
  rows.forEach(r => {
    r.stages = normalizeStages(r.stages)
    r.progress = deriveProgress(r.stages, r.progress)
    r.current_stage = currentStageName(r.stages)
    r.stage_done = r.stages.filter(s => s.done).length
    r.stage_total = r.stages.length
  })
  ok(res, rows)
}))

// 新增
router.post('/', asyncHandler(async (req, res) => {
  const { project_name, project_desc, start_date, end_date, progress, status, stages } = req.body
  if (!project_name) return fail(res, '项目名称必填')
  const st = normalizeStages(stages)
  const prog = deriveProgress(st, progress)
  await query(
    `INSERT INTO project (user_id, project_name, project_desc, stages, start_date, end_date, progress, status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.user_id, project_name, project_desc || '', JSON.stringify(st), start_date || null, end_date || null,
     prog, status || 'active']
  )
  ok(res, null, '创建成功')
}))

// 更新
router.put('/:id', asyncHandler(async (req, res) => {
  const b = req.body
  const sets = [], vals = []
  const editable = ['project_name', 'project_desc', 'start_date', 'end_date', 'progress', 'status']
  editable.forEach(f => {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(f === 'progress' ? (Number(b[f]) || 0) : b[f]) }
  })
  // 阶段：保存 JSON，并按完成比例自动回写 progress（除非调用方显式传了 progress）
  if (b.stages !== undefined) {
    const st = normalizeStages(b.stages)
    sets.push('stages = ?'); vals.push(JSON.stringify(st))
    if (b.progress === undefined) {
      sets.push('progress = ?'); vals.push(deriveProgress(st, 0))
    }
  }
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id, req.user.user_id)
  const result = await query(`UPDATE project SET ${sets.join(', ')} WHERE project_id = ? AND user_id = ?`, vals)
  if (result.affectedRows === 0) return fail(res, '项目不存在或无权限')
  ok(res, null, '更新成功')
}))

// 删除
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM project WHERE project_id = ? AND user_id = ?', [req.params.id, req.user.user_id])
  if (result.affectedRows === 0) return fail(res, '项目不存在或无权限')
  ok(res, null, '删除成功')
}))

module.exports = router
