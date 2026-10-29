<template>
  <div class="it-page">
    <h3 class="it-section-title">报表导出</h3>

    <div class="it-card">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px"
        title="导出字段严格沿用原有 Excel 表格格式：时间、联系人、部门、运维服务内容、应用系统、问题类别、完成时间、处理说明" />

      <el-form :inline="true" :model="filters">
        <el-form-item label="时间段">
          <el-date-picker v-model="filters.range" type="daterange" value-format="YYYY-MM-DD" range-separator="~" start-placeholder="开始" end-placeholder="结束" />
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="filters.dept" placeholder="全部" clearable style="width:130px">
            <el-option v-for="d in dicts.dept" :key="d.dict_id" :label="d.dict_label" :value="d.dict_label" />
          </el-select>
        </el-form-item>
        <el-form-item label="应用系统">
          <el-select v-model="filters.app_system" placeholder="全部" clearable style="width:140px">
            <el-option v-for="d in dicts.app_system" :key="d.dict_id" :label="d.dict_label" :value="d.dict_label" />
          </el-select>
        </el-form-item>
        <el-form-item label="问题类别">
          <el-select v-model="filters.problem_type" placeholder="全部" clearable style="width:140px">
            <el-option v-for="d in dicts.problem_type" :key="d.dict_id" :label="d.dict_label" :value="d.dict_label" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width:120px">
            <el-option label="待接单" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已完成" value="done" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="preview"><el-icon><Search /></el-icon> 预览数量</el-button>
          <el-button type="success" @click="onExport"><el-icon><Download /></el-icon> 导出 Excel</el-button>
        </el-form-item>
      </el-form>

      <el-divider />
      <div class="count">当前筛选条件下工单数量：<b>{{ count }}</b> 条</div>
    </div>

    <!-- 历史工单导入 -->
    <div class="it-card" style="margin-top:14px">
      <h4 class="it-section-title">导入历史工单</h4>
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px"
        title="支持沿用原 Excel 表格直接导入：具体时间、联系人、部门、运维服务内容、应用系统、问题类别、服务完成时间、处理说明。仅支持 .xlsx（旧 .xls 请先另存为 .xlsx）；导入的数据归属当前登录账号，有完成时间的自动标记为已完成。" />
      <el-upload
        drag
        accept=".xlsx"
        :show-file-list="false"
        :http-request="onImport"
        :disabled="importing"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">{{ importing ? '正在导入…' : '将历史工单 Excel 拖到此处，或点击选择文件' }}</div>
        <template #tip>
          <div class="el-upload__tip">导入完成后可在「工单记录管理」中查看</div>
        </template>
      </el-upload>
      <div v-if="importResult" class="import-result">
        <el-alert
          :type="importResult.failed.length ? 'warning' : 'success'"
          :closable="false"
          show-icon
          :title="`成功导入 ${importResult.inserted} 条${importResult.failed.length ? '，失败 ' + importResult.failed.length + ' 条' : ''}`"
        />
        <el-table v-if="importResult.failed.length" :data="importResult.failed" size="small" style="margin-top:10px" max-height="220">
          <el-table-column prop="row" label="行号" width="80" />
          <el-table-column prop="reason" label="失败原因" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Search, Download, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import R from '../api'

const dicts = reactive({ dept: [], app_system: [], problem_type: [] })
const filters = reactive({ range: [], dept: '', app_system: '', problem_type: '', status: '' })
const count = ref(0)

async function loadDicts() {
  const data = await R.getDicts(false)
  dicts.dept = data.dept; dicts.app_system = data.app_system; dicts.problem_type = data.problem_type
}
function buildParams() {
  const p = {}
  if (filters.range && filters.range.length === 2) { p.start = filters.range[0]; p.end = filters.range[1] }
  if (filters.dept) p.dept = filters.dept
  if (filters.app_system) p.app_system = filters.app_system
  if (filters.problem_type) p.problem_type = filters.problem_type
  if (filters.status) p.status = filters.status
  return p
}
async function preview() {
  try { const rows = await R.listTickets(buildParams()); count.value = rows.length; ElMessage.success('已统计') } catch (e) { ElMessage.error(e.message) }
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
async function onExport() {
  try {
    const blob = await R.exportTicketsBlob(buildParams())
    const d = new Date()
    const p = n => String(n).padStart(2, '0')
    const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    downloadBlob(blob, `it_tickets_${day}.xlsx`)
    ElMessage.success('导出成功')
  } catch (e) { ElMessage.error('导出失败：' + e.message) }
}

// 导入历史工单
const importing = ref(false)
const importResult = ref(null)
async function onImport({ file }) {
  const isXlsx = /\.xlsx$/i.test(file.name)
  if (!isXlsx) { ElMessage.error('仅支持 .xlsx 文件，旧 .xls 请先在 Excel 中另存为 .xlsx'); return }
  importing.value = true
  importResult.value = null
  try {
    const data = await R.importTickets(file)
    importResult.value = data
    ElMessage.success((data && data.__message) || '导入完成')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    importing.value = false
  }
}

onMounted(loadDicts)
</script>

<style scoped>
.count { font-size: 14px; color: #4a5266; }
.count b { color: var(--it-primary); font-size: 18px; }
.import-result { margin-top: 12px; }
</style>
