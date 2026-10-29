// 实时消息通道（SSE）：/api/realtime/stream?token=xxx
// 说明：浏览器的 EventSource 不能自定义请求头，所以 token 走查询参数
const express = require('express')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const router = express.Router()
const { JWT_SECRET } = require('../middleware/auth')
const rt = require('../utils/realtime')

router.get('/stream', (req, res) => {
  const token = String(req.query.token || '')
  if (!token) return res.status(401).json({ code: 1, message: '缺少 token' })
  let user
  try {
    user = jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return res.status(401).json({ code: 1, message: 'token 无效或已过期' })
  }
  rt.subscribe(req, res, user)
})

// 在线连接数（运维排查用）
router.get('/online', (req, res) => res.json({ code: 0, message: 'ok', data: { online: rt.count() } }))

// 内部事件转发入口：公网自助进程把「新报障」等事件推给管理进程，由管理进程分发给在线浏览器
// （浏览器只连管理进程）。只允许内部调用：校验 X-Internal-Token，外部用户拿不到该值。
router.post('/publish', (req, res) => {
  const got = String(req.headers['x-internal-token'] || '')
  const want = String(process.env.REALTIME_RELAY_SECRET || JWT_SECRET)
  const ok = got.length > 0 && got.length === want.length &&
    crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))
  if (!ok) return res.status(403).json({ code: 1, message: 'forbidden' })

  const { userIds = null, event, data } = req.body || {}
  if (!event || typeof event !== 'string') return res.status(400).json({ code: 1, message: 'event required' })

  const n = rt.localSend(Array.isArray(userIds) ? userIds : null, event, data)
  res.json({ code: 0, message: 'ok', data: { delivered: n } })
})

module.exports = router
