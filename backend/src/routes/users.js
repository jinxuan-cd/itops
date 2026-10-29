const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth, adminOnly, clearAuthCache, ROLES } = require('../middleware/auth')

// 角色白名单校验：admin（管理员）/ auditor（审计员，只读全公司）/ service（服务台，派单）/ user（运维工程师）
function normRole(r) { return ROLES.includes(r) ? r : 'user' }

// 仅管理员可访问用户管理
router.use(auth, adminOnly)

// 当前还有几个可用的管理员（防止把自己降权/停用/删掉后再也进不了后台）
async function activeAdminCount(excludeId = null) {
  const rows = excludeId
    ? await query("SELECT COUNT(*) AS n FROM sys_user WHERE role = 'admin' AND is_enable = 1 AND user_id <> ?", [excludeId])
    : await query("SELECT COUNT(*) AS n FROM sys_user WHERE role = 'admin' AND is_enable = 1")
  return Number((rows[0] && rows[0].n) || 0)
}

// 列表
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT user_id, username, real_name, role, is_enable, create_time FROM sys_user ORDER BY user_id'
  )
  ok(res, rows)
}))

// 新增
router.post('/', asyncHandler(async (req, res) => {
  const { username, password, real_name, role } = req.body
  if (!username || !password) return fail(res, '账号和密码必填')
  if (String(password).length < 6) return fail(res, '密码至少 6 位')
  const exists = await query('SELECT 1 FROM sys_user WHERE username = ?', [username])
  if (exists.length) return fail(res, '账号已存在')

  const hash = await bcrypt.hash(password, 10)
  await query(
    'INSERT INTO sys_user (username, password, real_name, role, is_enable) VALUES (?,?,?,?,1)',
    [username, hash, real_name || '', normRole(role)]
  )
  ok(res, null, '创建成功')
}))

// 修改（含启用/停用、改密码）
router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const { real_name, role, is_enable, password } = req.body
  const sets = []
  const params = []

  // 保护最后一个可用管理员：不能降级、不能停用
  const willDropAdmin = (role !== undefined && normRole(role) !== 'admin') || (is_enable !== undefined && !is_enable)
  if (willDropAdmin) {
    const target = await query('SELECT role FROM sys_user WHERE user_id = ?', [id])
    if (!target.length) return fail(res, '账号不存在')
    if (target[0].role === 'admin' && Number(id) !== Number(req.user.user_id)) {
      // 别的管理员降级：至少还要剩一个
      if (await activeAdminCount(id) === 0) return fail(res, '系统至少要保留一个可用的管理员账号')
    }
    if (target[0].role === 'admin' && Number(id) === Number(req.user.user_id)) {
      if (await activeAdminCount(id) === 0) return fail(res, '这是最后一个管理员账号，不能降级或停用，请先新增一个管理员')
    }
  }

  if (real_name !== undefined) { sets.push('real_name = ?'); params.push(real_name) }
  if (role !== undefined) { sets.push('role = ?'); params.push(normRole(role)) }
  if (is_enable !== undefined) { sets.push('is_enable = ?'); params.push(is_enable ? 1 : 0) }
  if (password) {
    if (String(password).length < 6) return fail(res, '密码至少 6 位')
    sets.push('password = ?'); params.push(await bcrypt.hash(password, 10))
  }
  if (!sets.length) return fail(res, '无更新字段')
  params.push(id)
  await query(`UPDATE sys_user SET ${sets.join(', ')} WHERE user_id = ?`, params)
  // 角色/启用状态立即生效（清掉 60 秒的账号状态缓存）
  clearAuthCache(id)
  ok(res, null, '更新成功')
}))

// 删除
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  // 不允许删除自己
  if (id === Number(req.user.user_id)) return fail(res, '不能删除当前登录账号')
  const target = await query('SELECT role FROM sys_user WHERE user_id = ?', [id])
  if (!target.length) return fail(res, '账号不存在')
  if (target[0].role === 'admin' && await activeAdminCount(id) === 0) {
    return fail(res, '系统至少要保留一个可用的管理员账号')
  }

  // 该账号名下的工单/知识库等数据保留（便于追溯），仅解除归属，避免统计出现空人名
  await query('UPDATE ticket SET assignee_id = NULL, assign_time = NULL WHERE assignee_id = ?', [id]).catch(() => {})
  await query('DELETE FROM user_ai_config WHERE user_id = ?', [id]).catch(() => {})
  await query('DELETE FROM todo WHERE user_id = ?', [id]).catch(() => {})
  await query('DELETE FROM sys_user WHERE user_id = ?', [id])
  clearAuthCache(id)
  ok(res, null, '删除成功（其历史工单与知识库仍保留）')
}))

module.exports = router
