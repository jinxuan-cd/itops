const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth, adminOnly } = require('../middleware/auth')

router.use(auth)

const TYPES = ['dept', 'app_system', 'problem_type']
const LABELS = { dept: '部门', app_system: '应用系统', problem_type: '问题类别' }

// 获取全部字典（前端下拉）；manage=1 返回含停用项（管理员维护用）
router.get('/', asyncHandler(async (req, res) => {
  const manage = req.query.manage === '1' && req.user.role === 'admin'
  const result = {}
  for (const t of TYPES) {
    const rows = await query(
      `SELECT dict_id, dict_label, dict_value, sort, is_enable FROM sys_dict
       WHERE dict_type = ? ${manage ? '' : 'AND is_enable = 1'} ORDER BY sort, dict_id`,
      [t]
    )
    result[t] = rows
  }
  ok(res, result)
}))

// 单类型列表
router.get('/:type', asyncHandler(async (req, res) => {
  const { type } = req.params
  if (!TYPES.includes(type)) return fail(res, '字典类型错误')
  const rows = await query(
    'SELECT dict_id, dict_label, dict_value, sort, is_enable FROM sys_dict WHERE dict_type = ? ORDER BY sort, dict_id',
    [type]
  )
  ok(res, rows)
}))

// 新增（管理员）
router.post('/:type', auth, adminOnly, asyncHandler(async (req, res) => {
  const { type } = req.params
  if (!TYPES.includes(type)) return fail(res, '字典类型错误')
  const { dict_label, sort } = req.body
  if (!dict_label) return fail(res, '名称必填')
  await query(
    'INSERT INTO sys_dict (dict_type, dict_label, dict_value, sort, is_enable) VALUES (?,?,?,?,1)',
    [type, dict_label, dict_label, sort || 0]
  )
  ok(res, null, '新增成功')
}))

// 修改 / 停用（管理员）
router.put('/:type/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const { dict_label, sort, is_enable } = req.body
  const sets = [], vals = []
  if (dict_label !== undefined) { sets.push('dict_label = ?'); vals.push(dict_label); sets.push('dict_value = ?'); vals.push(dict_label) }
  if (sort !== undefined) { sets.push('sort = ?'); vals.push(sort) }
  if (is_enable !== undefined) { sets.push('is_enable = ?'); vals.push(is_enable ? 1 : 0) }
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id)
  await query(`UPDATE sys_dict SET ${sets.join(', ')} WHERE dict_id = ?`, vals)
  ok(res, null, '更新成功')
}))

// 删除（管理员）
router.delete('/:type/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  await query('DELETE FROM sys_dict WHERE dict_id = ?', [req.params.id])
  ok(res, null, '删除成功')
}))

module.exports = router
