require('dotenv').config()

const mysql = require('mysql2/promise')

// 数据库连接池（兼容 MariaDB 10.11 / MySQL 8.0，两者协议一致）
// 注意：默认口令必须与 docker-compose.yml 里的默认值保持一致，否则本地直连会连不上
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'itops',
  password: process.env.DB_PASSWORD || 'itops_2026',
  database: process.env.DB_NAME || 'itops',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+08:00',
  dateStrings: true,
  charset: 'utf8mb4',
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
})

// 连接目标（不含口令）：排查「数据库连不上」时打日志用
function dbTarget() {
  const host = process.env.DB_HOST || '127.0.0.1'
  const port = process.env.DB_PORT || 3306
  const db = process.env.DB_NAME || 'itops'
  const user = process.env.DB_USER || 'itops'
  return `${user}@${host}:${port}/${db}`
}

// 统一查询封装
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params)
  return rows
}

module.exports = { pool, query, dbTarget }
