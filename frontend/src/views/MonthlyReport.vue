<template>
  <div class="it-page">
    <div class="it-between" style="margin-bottom:14px">
      <h3 class="it-section-title" style="margin:0">月度工作报告</h3>
      <div>
        <el-date-picker
          v-model="month"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择月份"
          style="width:150px;margin-right:10px"
          @change="onMonthChange"
        />
        <el-button type="primary" :loading="genLoading" @click="generate">
          <el-icon><MagicStick /></el-icon> 生成 / 重新生成
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="aiNote"
      :title="aiNote"
      :type="aiUsed ? 'success' : 'info'"
      :closable="false"
      show-icon
      style="margin-bottom:14px"
    />

    <el-row :gutter="14">
      <el-col :md="16">
        <div class="it-card">
          <div class="it-between" style="margin-bottom:10px">
            <h4 class="it-section-title" style="margin:0">汇报内容（可复制 / 微调）</h4>
            <el-button size="small" type="success" @click="copyReport"><el-icon><DocumentCopy /></el-icon> 一键复制</el-button>
          </div>
          <el-input
            v-model="content"
            type="textarea"
            :rows="22"
            placeholder="选择月份后点击「生成 / 重新生成」；若配置了 AI 接口将生成向上汇报风格报告，未配置则使用规则汇总。"
          />
        </div>
      </el-col>

      <el-col :md="8">
        <div class="it-card" style="margin-bottom:14px">
          <h4 class="it-section-title" style="margin-bottom:10px">本月统计</h4>
          <div v-if="!stats.ticket" class="it-text-sub">暂无数据</div>
          <template v-else>
            <div class="stat-row"><span>工单总量</span><b>{{ stats.ticket.total || 0 }} 单</b></div>
            <div class="stat-row"><span>已完成</span><b>{{ stats.ticket.done_cnt || 0 }} 单</b></div>
            <div class="stat-row"><span>平均处理时长</span><b>{{ stats.ticket.avg_hours || 0 }} 小时</b></div>
            <div class="stat-row"><span>月度目标</span><b>{{ (stats.goal || {}).done || 0 }} / {{ (stats.goal || {}).total || 0 }}</b></div>
            <div class="stat-row"><span>在办项目</span><b>{{ (stats.projects || []).length }} 个</b></div>
            <el-divider style="margin:10px 0" />
            <div class="mini-title">问题类别 TOP</div>
            <div v-for="x in (stats.byType || []).slice(0,5)" :key="x.name" class="mini-line">{{ x.name }}：{{ x.value }} 单</div>
            <div class="mini-title" style="margin-top:8px">应用系统 TOP</div>
            <div v-for="x in (stats.bySystem || []).slice(0,5)" :key="x.name" class="mini-line">{{ x.name }}：{{ x.value }} 单</div>
          </template>
        </div>

        <div class="it-card">
          <h4 class="it-section-title" style="margin-bottom:10px">历史报告</h4>
          <el-timeline v-if="history.length">
            <el-timeline-item
              v-for="h in history"
              :key="h.report_id"
              :timestamp="h.report_month"
              placement="top"
            >
              <span class="his-link" @click="loadMonth(h.report_month)">{{ (h.preview || '').replace(/\n/g, ' ') || '（点击查看）' }}</span>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="it-text-sub">暂无历史月度报告</div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { MagicStick, DocumentCopy } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import R from '../api'

const month = ref(currentMonth())
const content = ref('')
const stats = ref({})
const history = ref([])
const genLoading = ref(false)
const aiUsed = ref(false)
const aiNote = ref('')

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function generate() {
  if (!month.value) { ElMessage.warning('请选择月份'); return }
  genLoading.value = true
  try {
    const res = await R.generateMonthlyReport(month.value)
    content.value = res.content || ''
    stats.value = res.stats || {}
    aiUsed.value = !!res.ai_used
    aiNote.value = res.ai_used
      ? `已使用 AI 生成「${month.value}」月度汇报报告，可直接复制归档用于年度汇报。`
      : `已生成「${month.value}」月度报告（规则汇总）。如需 AI 向上汇报风格，请在后端 .env 配置 AI_API_URL / AI_API_KEY / AI_MODEL。`
    ElMessage.success(res.ai_used ? 'AI 月度报告已生成' : '月度报告已生成')
    loadHistory()
  } catch (e) { ElMessage.error(e.message) } finally { genLoading.value = false }
}

async function onMonthChange() {
  if (!month.value) return
  try {
    const row = await R.getMonthlyReport(month.value)
    if (row) {
      content.value = row.content || ''
      aiNote.value = ''
      // 已存报告不带回统计明细，重新生成可刷新统计
    } else {
      content.value = ''
      aiNote.value = ''
    }
  } catch (e) { ElMessage.error(e.message) }
}

async function loadMonth(m) {
  month.value = m
  await onMonthChange()
}

async function loadHistory() {
  try { history.value = await R.monthlyReportHistory() } catch (e) {}
}

function copyReport() {
  const text = content.value || ''
  if (!text.trim()) { ElMessage.warning('暂无可复制内容'); return }
  navigator.clipboard.writeText(text).then(
    () => ElMessage.success('已复制到剪贴板'),
    () => {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      ElMessage.success('已复制到剪贴板')
    }
  )
}

onMounted(() => { loadHistory(); onMonthChange() })
</script>

<style scoped>
.stat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--it-border); font-size: 13px; }
.stat-row span { color: var(--it-text-sub); }
.stat-row b { color: #2b3245; }
.mini-title { font-weight: 600; font-size: 12px; color: #2b3245; margin-bottom: 4px; }
.mini-line { font-size: 12px; color: #4a5266; padding: 2px 0; }
.his-link { cursor: pointer; color: #4a5266; font-size: 13px; }
.his-link:hover { color: var(--it-primary); }
</style>
