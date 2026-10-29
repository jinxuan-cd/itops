require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const jwt = require('jsonwebtoken')
const { query } = require('./db')
const { fail } = require('./utils/helpers')
const { seedDefaultUsers, migrateSchema } = require('./utils/seed')
const { JWT_SECRET } = require('./middleware/auth')
const { auditLogger } = require('./middleware/audit')

const { uploadDir, uploadStaticOptions } = require('./middleware/upload')

// ============================================================================
//  单个后端进程，同时为两个入口提供 API
//  ---------------------------------------------------------------------------
//  · 管理端容器（内网端口，默认 8080）：完整后台，可访问全部接口
//  · 员工自助容器（公网端口，默认 8090）：只有报障/查进度/满意度/FAQ 页面，
//    nginx 只把 /api/public/* 反代到这里，其余路径在网关层就是 404
//  两个入口连的是**同一个 backend、同一个数据库**，数据天然互通，不需要任何同步。
//  公网安全边界由「网关只放行 /api/public/」+「宝塔 WAF」共同保证。
// ============================================================================

const app = express()
const PORT = process.env.PORT || 3000

// 挂在 Nginx 后面，需信任代理才能拿到真实客户端 IP（公网接口按 IP 限频依赖它）
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// 审计员（auditor）只读：除登录与修改本人资料/密码外，拦截一切写操作
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return next()
  let role = ''
  try { role = (jwt.verify(header.slice(7), JWT_SECRET) || {}).role } catch (e) { return next() }
  if (role !== 'auditor') return next()
  if (/^\/auth\/(me|password)$/.test(req.path)) return next()
  return fail(res, '审计员为只读账号，不能提交或修改业务数据', 1, 403)
})

// 操作审计：记录所有写操作（在路由之前注册，保证能拿到结果状态码）
app.use('/api', auditLogger)

// 上传文件静态访问
app.use('/uploads', express.static(path.resolve(uploadDir), uploadStaticOptions()))

// 路由
app.use('/api/auth', require('./routes/auth'))
app.use('/api/users', require('./routes/users'))
app.use('/api/tickets', require('./routes/tickets'))
app.use('/api/todos', require('./routes/todos'))
app.use('/api/goals', require('./routes/goals'))
app.use('/api/knowledge', require('./routes/knowledge'))
app.use('/api/dictionaries', require('./routes/dictionary'))
app.use('/api/dashboard', require('./routes/dashboard'))
app.use('/api/analytics', require('./routes/analytics'))
app.use('/api/daily-report', require('./routes/dailyReport'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/monthly-report', require('./routes/monthlyReport'))
app.use('/api/ai', require('./routes/aiConfig'))
app.use('/api/incidents', require('./routes/incidents'))
app.use('/api/inspections', require('./routes/inspections'))
app.use('/api/accounts', require('./routes/accounts'))
app.use('/api/audit-logs', require('./routes/auditLog'))
app.use('/api/notify', require('./routes/notify'))
app.use('/api/backup', require('./routes/backup'))
app.use('/api/sla', require('./routes/sla'))
app.use('/api/system', require('./routes/system'))
// 实时消息（SSE）：新工单接单提醒
app.use('/api/realtime', require('./routes/realtime'))
// 免登录公开接口：员工自助门户（公网）与管理端预览共用
app.use('/api/public', require('./routes/publicApi'))

app.get('/api/health', (req, res) => res.json({ code: 0, message: 'ok', data: { time: new Date() } }))

// 404
app.use((req, res) => fail(res, '接口不存在', 404, 404))

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err.message)
  if (err.code === 'LIMIT_FILE_SIZE') return fail(res, '文件过大（上限 30MB）', 1, 413)
  fail(res, err.message || '服务器内部错误', 1, 500)
})

// 等待 MySQL 就绪（Docker 中 db 容器已启动但可能尚未接受连接）
async function waitForDb(retries = 30, interval = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await query('SELECT 1')
      console.log('[db] MySQL 连接成功')
      return true
    } catch (e) {
      console.log(`[db] MySQL 尚未就绪，第 ${i + 1}/${retries} 次重试：${e.message}`)
      await new Promise((r) => setTimeout(r, interval))
    }
  }
  return false
}

async function start() {
  const dbOk = await waitForDb()

  if (dbOk) {
    try {
      await migrateSchema()
      await seedDefaultUsers()
    } catch (e) {
      console.error('[seed] 初始化失败：', e.message)
    }
  } else {
    console.error('[db] 多次重试仍无法连接 MySQL，已跳过 seed；请检查数据库配置后重启后端')
  }

  app.listen(PORT, () => {
    console.log(`[server] 后端已启动：http://localhost:${PORT}（单进程，管理端 + 员工自助共用）`)
  })

  if (dbOk) {
    // 每月底（最后一天 17 点后，每 30 分钟检查一次）自动生成当月月度报告
    const { autoGenerateMonthEnd } = require('./routes/monthlyReport')
    setInterval(() => {
      autoGenerateMonthEnd().catch(e => console.error('[monthlyReport] 定时任务异常：', e.message))
    }, 30 * 60 * 1000)
    // 每日定时提醒（09:00 待跟进 / 18:00 今日小结）
    require('./utils/scheduler').startScheduler()
  }
}

start()

module.exports = app
