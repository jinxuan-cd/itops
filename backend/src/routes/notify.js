// 消息通知配置（企微 / 钉钉 / 飞书 群机器人）
const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth, adminOnly } = require('../middleware/auth')
const { sendTest } = require('../utils/notifier')

router.use(auth)

router.get('/config', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM notify_config WHERE user_id = ?', [req.user.user_id])
  if (!rows.length) return ok(res, { channel: 'wecom', webhook: '', secret: '', events: 'overdue,report,incident', is_enable: 1, configured: false })
  const r = rows[0]
  ok(res, {
    config_id: r.config_id,
    channel: r.channel,
    webhook: r.webhook,
    secret: r.secret || '',
    events: r.events || '',
    is_enable: Number(r.is_enable),
    configured: true
  })
}))

router.put('/config', adminOnly, asyncHandler(async (req, res) => {
  const b = req.body
  if (!b.webhook) return fail(res, '请填写机器人 Webhook 地址')
  await query(
    `INSERT INTO notify_config (user_id, channel, webhook, secret, events, is_enable)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE channel = ?, webhook = ?, secret = ?, events = ?, is_enable = ?`,
    [req.user.user_id, b.channel || 'wecom', b.webhook, b.secret || null, b.events || 'overdue,report,incident', b.is_enable ? 1 : 0,
     b.channel || 'wecom', b.webhook, b.secret || null, b.events || 'overdue,report,incident', b.is_enable ? 1 : 0]
  )
  ok(res, null, '已保存通知配置')
}))

router.post('/test', adminOnly, asyncHandler(async (req, res) => {
  const b = req.body
  const cfg = { channel: b.channel || 'wecom', webhook: b.webhook, secret: b.secret }
  if (!cfg.webhook) return fail(res, '请先填写 Webhook 地址')
  const r = await sendTest(cfg)
  if (!r.ok) return fail(res, `发送失败：${r.message || '请检查地址是否正确'}`)
  ok(res, null, '测试消息已发送，请查看群消息')
}))

module.exports = router
