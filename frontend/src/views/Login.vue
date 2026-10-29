<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <el-icon class="brand-icon"><Monitor /></el-icon>
        <div>
          <div class="brand-title">IT 运维工单系统</div>
          <div class="brand-sub">工单台账 · 日报自动生成 · 知识沉淀</div>
        </div>
      </div>

      <el-alert
        v-if="lockRemain > 0"
        type="error"
        :closable="false"
        show-icon
        class="lock-alert"
        :title="`账号已锁定，请 ${lockText} 后再试`"
      />

      <el-form :model="form" @submit.prevent="onLogin" size="large">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="登录账号"
            :prefix-icon="User"
            :disabled="lockRemain > 0"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            :disabled="lockRemain > 0"
            @keyup.enter="onLogin"
          />
        </el-form-item>

        <!-- 连续输错 3 次后强制验证码 -->
        <el-form-item v-if="needCaptcha">
          <div class="captcha-row">
            <el-input
              v-model="form.captcha_code"
              placeholder="验证码"
              :prefix-icon="Key"
              maxlength="4"
              :disabled="lockRemain > 0"
              @keyup.enter="onLogin"
            />
            <img
              v-if="captchaImg"
              class="captcha-img"
              :src="captchaImg"
              alt="点击刷新验证码"
              title="看不清？点击刷新"
              @click="refreshCaptcha"
            />
            <el-button v-else text :loading="captchaLoading" @click="refreshCaptcha">获取</el-button>
          </div>
        </el-form-item>

        <el-button
          type="primary"
          :loading="loading"
          class="login-btn"
          :disabled="lockRemain > 0"
          @click="onLogin"
        >{{ lockRemain > 0 ? '已锁定' : '登 录' }}</el-button>
      </el-form>

      <div class="hint">忘记密码请联系系统管理员重置</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock, Key } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import R from '../api'
import { useUserStore } from '../store/user'

const router = useRouter()
const userStore = useUserStore()
const form = ref({ username: '', password: '', captcha_code: '' })
const loading = ref(false)

// 验证码 / 锁定状态
const needCaptcha = ref(false)
const captchaImg = ref('')
const captchaId = ref('')
const captchaLoading = ref(false)
const lockRemain = ref(0) // 锁定剩余秒数
let lockTimer = null

const lockText = computed(() => {
  const s = lockRemain.value
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m} 分 ${String(r).padStart(2, '0')} 秒` : `${r} 秒`
})

async function refreshCaptcha() {
  captchaLoading.value = true
  try {
    const d = await R.getCaptcha()
    captchaImg.value = d.image
    captchaId.value = d.captcha_id
    form.value.captcha_code = ''
  } catch (e) {
    captchaImg.value = ''
  } finally {
    captchaLoading.value = false
  }
}

function startLockCountdown(seconds) {
  lockRemain.value = Math.max(0, Math.ceil(seconds || 0))
  if (lockTimer) clearInterval(lockTimer)
  lockTimer = setInterval(() => {
    lockRemain.value -= 1
    if (lockRemain.value <= 0) {
      lockRemain.value = 0
      clearInterval(lockTimer)
      lockTimer = null
      needCaptcha.value = true
      refreshCaptcha()
      ElMessage.info('锁定已解除，请输入验证码后重试')
    }
  }, 1000)
}

async function onLogin() {
  if (lockRemain.value > 0) return
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  if (needCaptcha.value && !form.value.captcha_code) {
    ElMessage.warning('请输入验证码')
    return
  }
  loading.value = true
  try {
    const data = await R.login(form.value.username, form.value.password, {
      captcha_id: captchaId.value,
      captcha_code: form.value.captcha_code
    })
    userStore.setAuth(data.token, data.user)
    ElMessage.success('登录成功')
    router.replace('/dashboard')
  } catch (e) {
    const info = e.data || {}
    if (info.locked) {
      startLockCountdown(info.lockRemain || 300)
      ElMessage.error(e.message)
    } else {
      ElMessage.error(e.message)
    }
    // 需要验证码：显示并立即刷新一张新图（旧码一次性失效）
    if (info.needCaptcha) {
      needCaptcha.value = true
      await refreshCaptcha()
    }
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (lockTimer) clearInterval(lockTimer)
})
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary-dark-2, #2f6fed) 0%, var(--it-primary, #2f6fed) 100%);
}
.login-card {
  width: 360px;
  background: #fff;
  border-radius: 16px;
  padding: 32px 28px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.brand-icon { font-size: 40px; color: var(--it-primary); }
.brand-title { font-size: 18px; font-weight: 700; }
.brand-sub { font-size: 12px; color: var(--it-text-sub); margin-top: 2px; }
.login-btn { width: 100%; }
.hint { margin-top: 16px; font-size: 12px; color: var(--it-text-sub); text-align: center; line-height: 1.6; }
.lock-alert { margin-bottom: 14px; }
.captcha-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.captcha-row :deep(.el-input) { flex: 1; }
.captcha-img {
  width: 110px;
  height: 38px;
  border-radius: 6px;
  border: 1px solid var(--it-border, #dcdfe6);
  cursor: pointer;
  flex: 0 0 110px;
}
</style>
