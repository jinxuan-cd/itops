// 系统公共设置：自助报障入口开关 / 密钥 / FAQ 门户开关 / 公网门户地址
const express = require('express')
const router = express.Router()
const { ok, asyncHandler } = require('../utils/helpers')
const { auth, adminOnly } = require('../middleware/auth')
const { settingGet, settingSet } = require('../utils/seed')

router.use(auth)

// 公网门户地址规范化：去掉末尾 /，没写协议时默认补 http://
function normalizeBaseUrl(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  return s.replace(/\/+$/, '')
}

async function readPublicSettings() {
  return {
    report_enable: (await settingGet('report_enable')) === '1',
    faq_enable: (await settingGet('faq_enable')) === '1',
    report_key: (await settingGet('report_key')) || '',
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
  if (b.public_base_url !== undefined) await settingSet('public_base_url', normalizeBaseUrl(b.public_base_url))
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
