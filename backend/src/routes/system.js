// 系统公共设置：自助报障入口开关 / 密钥 / FAQ 门户开关 / 公网门户地址
const express = require('express')
const router = express.Router()
const { ok, fail, asyncHandler } = require('../utils/helpers')
const { auth, adminOnly } = require('../middleware/auth')
const { settingGet, settingSet, ensurePublicSettings } = require('../utils/seed')

router.use(auth)

// 公网门户地址规范化：允许填 IP、域名、带端口，可不写协议
//   example.com:8090              -> http://example.com:8090
//   https://it.example.com/       -> https://it.example.com
//   http://1.2.3.4:8090/report    -> http://1.2.3.4:8090   （只保留到端口，路径丢掉）
function normalizeBaseUrl(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  try {
    const u = new URL(s)
    if (!u.hostname) return ''
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

async function readPublicSettings() {
  const ps = await ensurePublicSettings()
  return {
    report_enable: ps.report_enable,
    faq_enable: ps.faq_enable,
    report_key: ps.key,
    // 员工自助门户的公网地址，例如 http://it-report.example.com:8090
    public_base_url: (await settingGet('public_base_url')) || ''
  }
}

router.get('/public-settings', asyncHandler(async (req, res) => {
  ok(res, await readPublicSettings())
}))

// 修改开关；传 rotate=1 可重置入口密钥（旧二维码立即失效）
router.put('/public-settings', adminOnly, asyncHandler(async (req, res) => {
  const b = req.body
  if (b.report_enable !== undefined) await settingSet('report_enable', b.report_enable ? '1' : '0')
  if (b.faq_enable !== undefined) await settingSet('faq_enable', b.faq_enable ? '1' : '0')
  if (b.public_base_url !== undefined) {
    const raw = String(b.public_base_url || '').trim()
    const norm = normalizeBaseUrl(raw)
    // 填了但解析不出来，直接报错，避免存进空值后二维码指回内网地址
    if (raw && !norm) return fail(res, '公网门户地址格式不正确，请填写如 http://your-domain.com:8090')
    await settingSet('public_base_url', norm)
  }
  if (b.rotate) {
    const key = require('crypto').randomBytes(9).toString('hex')
    await settingSet('report_key', key)
  }
  ok(res, await readPublicSettings(), '已保存')
}))

// 工单流转设置：服务台开关（可选角色）
//   service_desk_enable = 0：新工单直接通知全部运维，谁抢到谁处理（默认）
//   service_desk_enable = 1：新工单只通知服务台 + 管理员，由服务台派单
router.get('/workflow-settings', asyncHandler(async (req, res) => {
  ok(res, {
    service_desk_enable: (await settingGet('service_desk_enable')) === '1'
  })
}))

router.put('/workflow-settings', adminOnly, asyncHandler(async (req, res) => {
  const b = req.body
  if (b.service_desk_enable !== undefined) await settingSet('service_desk_enable', b.service_desk_enable ? '1' : '0')
  ok(res, { service_desk_enable: (await settingGet('service_desk_enable')) === '1' }, '已保存')
}))

module.exports = router
