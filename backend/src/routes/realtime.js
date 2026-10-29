// 实时消息通道（SSE）：/api/realtime/stream?token=xxx
// 说明：浏览器的 EventSource 不能自定义请求头，所以 token 走查询参数
const express = require('express')
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

module.exports = router
