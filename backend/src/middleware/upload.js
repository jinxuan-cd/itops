const multer = require('multer')
const path = require('path')
const fs = require('fs')

const uploadDir = process.env.UPLOAD_DIR || './uploads'
fs.mkdirSync(uploadDir, { recursive: true })

// 允许上传的扩展名白名单：附件、巡检照片、头像等场景够用。
// 不放开 html / svg / js 等可执行或可内联脚本的类型，
// 否则同源打开（/uploads/xxx.html）会变成存储型 XSS，可窃取 localStorage 里的 token。
const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic',
  '.pdf', '.txt', '.md', '.csv',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.log'
]
// 常见类型的 mimetype 白名单（浏览器有时给 application/octet-stream，故仅作辅助判断）
const ALLOWED_MIME = /^(image\/|text\/plain|text\/markdown|text\/csv|application\/pdf|application\/zip|application\/x-zip|application\/x-rar|application\/vnd\.|application\/msword|application\/octet-stream)/

function extOf(name) {
  return path.extname(String(name || '')).toLowerCase()
}

function fileFilter(req, file, cb) {
  const ext = extOf(file.originalname)
  if (!ext || !ALLOWED_EXT.includes(ext)) {
    return cb(new Error('不支持的文件类型：' + (ext || '未知') + '（允许图片、PDF、Office 文档、压缩包、文本）'))
  }
  if (file.mimetype && !ALLOWED_MIME.test(file.mimetype)) {
    return cb(new Error('文件类型校验失败：' + file.mimetype))
  }
  cb(null, true)
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // 统一用「时间戳-随机数 + 白名单后缀」，不使用用户上传的原始文件名（避免路径/特殊字符问题）
    const ext = extOf(file.originalname)
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
    cb(null, name)
  }
})

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 30 * 1024 * 1024 } // 单文件 30MB
})

// 静态目录的安全响应头：禁止浏览器猜测类型、禁止把上传文件当页面渲染
function uploadStaticOptions() {
  return {
    maxAge: '7d',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'none'; sandbox")
    }
  }
}

module.exports = { upload, uploadDir, uploadStaticOptions, ALLOWED_EXT }
