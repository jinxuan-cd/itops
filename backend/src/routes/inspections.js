// 机房 / 设备巡检：每日打卡式巡检记录，异常项可一键转工单
const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { ok, fail, asyncHandler, safeJson, todayStr } = require('../utils/helpers')
const { auth, isViewAll, adminOnly } = require('../middleware/auth')
const { applySla } = require('../utils/sla')
const { upload } = require('../middleware/upload')
const { settingGet, settingSet } = require('../utils/seed')

router.use(auth)

// 默认巡检项（设置页未配置时使用）
const DEFAULT_ITEMS = [
  { name: '机房温湿度（拍照记录读数）', need_photo: true, done: false, note: '' },
  { name: 'UPS / 电源指示正常', need_photo: false, done: false, note: '' },
  { name: '服务器运行状态正常（无异响/告警灯）', need_photo: false, done: false, note: '' },
  { name: '网络设备（交换机/路由/防火墙）指示灯正常', need_photo: false, done: false, note: '' },
  { name: '监控与告警平台无未处理告警', need_photo: false, done: false, note: '' },
  { name: '消防设施与门禁正常', need_photo: false, done: false, note: '' }
]

// 默认巡检区域
const DEFAULT_AREAS = ['主机房', '三楼弱电间', '二楼配电间']

// 设置项读写：同时兼容前端传数组和后台存的 JSON 字符串
async function readCfg(key, fallback) {
  try {
    const v = await settingGet(key)
    if (!v) return fallback
    const arr = JSON.parse(v)
    return Array.isArray(arr) && arr.length ? arr : fallback
  } catch { return fallback }
}
async function getAreas() { return readCfg('inspection_areas', DEFAULT_AREAS) }
async function getItems() {
  const items = await readCfg('inspection_items', DEFAULT_ITEMS.map(x => ({ name: x.name, need_photo: !!x.need_photo })))
  return items.map(x => ({ name: typeof x === 'string' ? x : x.name, need_photo: !!(x && x.need_photo) }))
}

// 图片只接受本站上传目录下的地址，防止写入外链
function cleanPhotos(v) {
  if (!Array.isArray(v)) return []
  return v.filter(u => typeof u === 'string' && u.startsWith('/uploads/')).slice(0, 4)
}
function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map(x => ({
    name: String(x.name || '').slice(0, 120),
    done: !!x.done,
    note: String(x.note || '').slice(0, 500),
    need_photo: !!x.need_photo,
    photos: cleanPhotos(x.photos)
  })).filter(x => x.name)
}

function scope(req, alias = '') {
  const pre = alias ? alias + '.' : ''
  if (isViewAll(req.user.role) && req.query.all === '1') return { clause: '', params: [] }
  return { clause: `AND ${pre}user_id = ?`, params: [req.user.user_id] }
}

// 写操作（编辑 / 删除 / 转工单）不受 all=1 限制，否则管理员能看到别人的记录却改不了
function writeScope(req) {
  if (isViewAll(req.user.role)) return { clause: '', params: [] }
  return { clause: 'AND user_id = ?', params: [req.user.user_id] }
}

// 巡检项模板（前端开始巡检时带出）
router.get('/template', asyncHandler(async (req, res) => ok(res, await getItems())))

// 巡检配置：区域 + 巡检项（设置页维护）
router.get('/config', asyncHandler(async (req, res) => {
  ok(res, { areas: await getAreas(), items: await getItems(), can_edit: req.user.role === 'admin' })
}))
router.put('/config', adminOnly, asyncHandler(async (req, res) => {
  const { areas, items } = req.body
  if (Array.isArray(areas)) {
    const clean = [...new Set(areas.map(a => String(a || '').trim()).filter(Boolean))].slice(0, 40)
    if (!clean.length) return fail(res, '至少保留一个巡检区域')
    await settingSet('inspection_areas', JSON.stringify(clean))
  }
  if (Array.isArray(items)) {
    const clean = items
      .map(x => ({ name: String((x && x.name) || '').trim().slice(0, 120), need_photo: !!(x && x.need_photo) }))
      .filter(x => x.name).slice(0, 80)
    if (!clean.length) return fail(res, '至少保留一个巡检项')
    await settingSet('inspection_items', JSON.stringify(clean))
  }
  ok(res, { areas: await getAreas(), items: await getItems() }, '已保存巡检设置')
}))

// 巡检拍照上传（手机端调用系统相机，桌面端选文件）
router.post('/upload', upload.array('files', 9), (req, res) => {
  const urls = (req.files || []).map(f => `/uploads/${f.filename}`)
  ok(res, urls)
})

// 列表
router.get('/', asyncHandler(async (req, res) => {
  const { start, end, result, keyword } = req.query
  const sc = scope(req, 'i')
  const where = ['1=1']
  const params = []
  if (sc.clause) { where.push(sc.clause.replace(/^AND/, '')); params.push(...sc.params) }
  if (start) { where.push('i.insp_date >= ?'); params.push(start) }
  if (end) { where.push('i.insp_date <= ?'); params.push(end) }
  if (result) { where.push('i.result = ?'); params.push(result) }
  if (keyword) { where.push('(i.area LIKE ? OR i.remark LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`) }
  const rows = await query(
    `SELECT i.*, u.real_name FROM inspection i LEFT JOIN sys_user u ON u.user_id = i.user_id
     WHERE ${where.join(' AND ')} ORDER BY i.insp_date DESC, i.inspection_id DESC LIMIT 300`,
    params
  )
  ok(res, rows.map(r => {
    const items = safeJson(r.items) || []
    return {
      ...r,
      items,
      item_total: items.length,
      item_done: items.filter(x => x.done).length,
      abnormal_names: items.filter(x => !x.done).map(x => x.name)
    }
  }))
}))

// 今日是否已巡检（首页提醒用）
router.get('/today', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT inspection_id FROM inspection WHERE user_id = ? AND insp_date = CURDATE() LIMIT 1',
    [req.user.user_id]
  )
  ok(res, { done: rows.length > 0 })
}))

// 新增
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body
  const items = Array.isArray(b.items) && b.items.length ? normalizeItems(b.items) : normalizeItems(await getItems())
  const abnormal = items.filter(x => !x.done).length
  // 需要拍照的项（如温湿度）未传图 → 提示补拍，但不阻断（现场可能确实拍不了）
  const missingPhoto = items.filter(x => x.need_photo && !x.photos.length).map(x => x.name)
  const result = b.result === 'abnormal' || abnormal > 0 ? 'abnormal' : 'normal'
  const r = await query(
    `INSERT INTO inspection (user_id, insp_date, area, items, result, remark, ticket_id)
     VALUES (?,?,?,?,?,?,?)`,
    [req.user.user_id, b.insp_date || todayStr(), b.area || (await getAreas())[0], JSON.stringify(items), result, b.remark || null, b.ticket_id || null]
  )
  const msg = result === 'abnormal'
    ? '已记录，存在异常项，建议转工单跟进'
    : (missingPhoto.length ? `巡检已记录，但「${missingPhoto.join('、')}」还没拍照留底` : '巡检已记录，一切正常')
  ok(res, { inspection_id: r.insertId, result, missing_photo: missingPhoto }, msg)
}))

// 更新
router.put('/:id', asyncHandler(async (req, res) => {
  const sc = writeScope(req)
  const b = req.body
  const sets = []
  const vals = []
  if (b.insp_date !== undefined) { sets.push('insp_date = ?'); vals.push(b.insp_date) }
  if (b.area !== undefined) { sets.push('area = ?'); vals.push(b.area) }
  if (b.items !== undefined) { sets.push('items = ?'); vals.push(JSON.stringify(normalizeItems(b.items))) }
  if (b.remark !== undefined) { sets.push('remark = ?'); vals.push(b.remark) }
  if (b.ticket_id !== undefined) { sets.push('ticket_id = ?'); vals.push(b.ticket_id) }
  if (b.result !== undefined) { sets.push('result = ?'); vals.push(b.result) }
  else if (Array.isArray(b.items)) { sets.push('result = ?'); vals.push(b.items.some(x => !x.done) ? 'abnormal' : 'normal') }
  if (!sets.length) return fail(res, '无更新字段')
  vals.push(req.params.id, ...sc.params)
  const r = await query(`UPDATE inspection SET ${sets.join(', ')} WHERE inspection_id = ? ${sc.clause}`, vals)
  if (!r.affectedRows) return fail(res, '巡检记录不存在或无权限')
  ok(res, null, '已保存')
}))

// 删除
router.delete('/:id', asyncHandler(async (req, res) => {
  const sc = writeScope(req)
  const r = await query(`DELETE FROM inspection WHERE inspection_id = ? ${sc.clause}`, [req.params.id, ...sc.params])
  if (!r.affectedRows) return fail(res, '巡检记录不存在或无权限')
  ok(res, null, '已删除')
}))

// 异常转工单：把异常巡检项汇总成一条工单
router.post('/:id/to-ticket', asyncHandler(async (req, res) => {
  const sc = writeScope(req)
  const rows = await query(`SELECT * FROM inspection WHERE inspection_id = ? ${sc.clause}`, [req.params.id, ...sc.params])
  if (!rows.length) return fail(res, '巡检记录不存在或无权限')
  const rec = rows[0]
  if (rec.ticket_id) return fail(res, '该巡检已生成过工单')
  const items = safeJson(rec.items) || []
  const bad = items.filter(x => !x.done).map(x => `- ${x.name}${x.note ? '：' + x.note : ''}`).join('\n') || '- 巡检异常'
  const ins = await query(
    `INSERT INTO ticket (user_id, happen_time, dept, service_content, app_system, problem_type, status, priority)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.user_id, `${rec.insp_date} 09:00:00`, '信息部',
     `【巡检异常】${rec.area || '机房'} ${rec.insp_date}\n${bad}`, '机房设备', '硬件问题', 'processing', 'high']
  )
  await query('UPDATE inspection SET ticket_id = ? WHERE inspection_id = ?', [ins.insertId, rec.inspection_id])
  await applySla(ins.insertId).catch(() => {})
  ok(res, { ticket_id: ins.insertId }, '已生成工单')
}))

module.exports = router
