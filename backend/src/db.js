require('dotenv').config()

const mysql = require('mysql2/promise')

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
  charset: 'utf8mb4'
})

// 统一查询封装
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params)
  return rows
}

module.exports = { pool, query }
