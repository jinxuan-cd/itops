const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { signToken, auth } = require('../middleware/auth')
const guard = require('../utils/loginGuard')

// 登录验证码（公开接口）：连续输错 3 次后前端会显示并要求填写
router.get('/captcha', asyncHandler(async (req, res) => {
  const c = guard.createCaptcha()
  ok(res, c)
}))

// 登录
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password, captcha_id, captcha_code } = req.body
  if (!username || !password) return res.json({ code: 1, message: '账号和密码必填', data: null })

  // 1) 是否已被锁定
  const st = guard.status(username)
  if (st.locked) {
    const min = Math.ceil(st.lockRemain / 60)
    return res.json({
      code: 1,
      message: `密码连续输错 ${guard.LOCK_AFTER} 次，账号已锁定，请 ${min} 分钟后再试`,
      data: { locked: true, lockRemain: st.lockRemain, needCaptcha: true }
    })
  }

  // 2) 失败次数达到阈值后，必须先通过验证码
  if (st.needCaptcha) {
    if (!captcha_id || !captcha_code) {
      return res.json({ code: 1, message: '为保障账号安全，请输入验证码', data: { needCaptcha: true, remain: st.remain } })
    }
    if (!guard.verifyCaptcha(captcha_id, captcha_code)) {
      const s = guard.onFail(username) // 验证码错误同样计入失败，防绕过
      return res.json({
        code: 1,
        message: s.locked
          ? `验证码错误，且已连续失败 ${guard.LOCK_AFTER} 次，账号锁定 5 分钟`
          : '验证码错误或已过期，请刷新后重新输入',
        data: { needCaptcha: true, locked: !!s.locked, lockRemain: s.lockRemain, remain: s.remain }
      })
    }
  }

  // 3) 校验账号密码
  const rows = await query('SELECT * FROM sys_user WHERE username = ?', [username])
  const user = rows[0]
  // 账号不存在时也做一次 bcrypt 比对，避免通过响应时间判断账号是否存在
  const hash = user ? user.password : '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DrsdOSTPKPLpUhQGeKFuVXKpW7fpi'
  const match = await bcrypt.compare(String(password), hash)

  if (!user || !match) {
    const s = guard.onFail(username)
    let message = '账号或密码错误'
    if (s.justLocked) message = `密码连续输错 ${guard.LOCK_AFTER} 次，账号已锁定 5 分钟`
    else if (s.locked) message = `账号已锁定，请 ${Math.ceil(s.lockRemain / 60)} 分钟后再试`
    else if (s.needCaptcha) message = `账号或密码错误，再错 ${s.remain} 次将锁定账号，请输入验证码`
    else message = `账号或密码错误，还可尝试 ${s.remain} 次`
    return res.json({
      code: 1,
      message,
      data: { needCaptcha: s.needCaptcha, locked: !!s.locked, lockRemain: s.lockRemain, remain: s.remain }
    })
  }

  if (!user.is_enable) return res.json({ code: 1, message: '账号已停用，请联系管理员', data: null })

  // 登录成功：清零失败计数
  guard.onSuccess(username)
  const token = signToken(user)
  const { password: _p, ...safe } = user
  ok(res, { token, user: safe })
}))

// 当前登录人
router.get('/me', auth, asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT user_id, username, real_name, role, is_enable, create_time FROM sys_user WHERE user_id = ?',
    [req.user.user_id]
  )
  ok(res, rows[0] || null)
}))

// 修改个人信息（仅本人，可改 real_name）
router.put('/me', auth, asyncHandler(async (req, res) => {
  const { real_name } = req.body
  if (real_name === undefined) return fail(res, '无更新字段')
  await query('UPDATE sys_user SET real_name = ? WHERE user_id = ?', [real_name || '', req.user.user_id])
  const rows = await query(
    'SELECT user_id, username, real_name, role, is_enable, create_time FROM sys_user WHERE user_id = ?',
    [req.user.user_id]
  )
  ok(res, rows[0], '个人信息已更新')
}))

// 修改密码（本人，需校验旧密码）
router.put('/password', auth, asyncHandler(async (req, res) => {
  const { old_password, new_password } = req.body
  if (!old_password || !new_password) return fail(res, '旧密码和新密码必填')
  if (String(new_password).length < 6) return fail(res, '新密码至少 6 位')
  const rows = await query('SELECT * FROM sys_user WHERE user_id = ?', [req.user.user_id])
  if (!rows.length) return fail(res, '账号不存在')
  const match = await bcrypt.compare(old_password, rows[0].password)
  if (!match) return fail(res, '原密码不正确')
  await query('UPDATE sys_user SET password = ? WHERE user_id = ?', [await bcrypt.hash(new_password, 10), req.user.user_id])
  ok(res, null, '密码已修改，请重新登录')
}))

module.exports = router
