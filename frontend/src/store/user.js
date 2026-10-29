import { defineStore } from 'pinia'

// localStorage 里的用户信息可能是旧版本残留或被手工改坏，解析失败不能让整个应用白屏
function readUser() {
  try {
    return JSON.parse(localStorage.getItem('itops_user') || 'null')
  } catch (e) {
    localStorage.removeItem('itops_user')
    localStorage.removeItem('itops_token')
    return null
  }
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('itops_token') || '',
    user: readUser()
  }),
  getters: {
    isAdmin: (s) => s.user && s.user.role === 'admin',
    // 审计员：只读查看全公司数据（不能新增/修改业务数据）
    isAuditor: (s) => s.user && s.user.role === 'auditor',
    // 服务台（可选角色）：负责派单，可查看全部工单
    isService: (s) => s.user && s.user.role === 'service',
    // 可查看全公司数据（管理员 + 审计员）
    canViewAll: (s) => !!(s.user && (s.user.role === 'admin' || s.user.role === 'auditor')),
    // 可派单（管理员 + 服务台）
    canDispatch: (s) => !!(s.user && (s.user.role === 'admin' || s.user.role === 'service')),
    // 能接单（审计员只读，不能接单）
    canClaim: (s) => !!(s.user && s.user.role !== 'auditor'),
    roleLabel: (s) => {
      const r = s.user && s.user.role
      return r === 'admin' ? '管理员' : r === 'auditor' ? '审计员' : r === 'service' ? '服务台' : '运维工程师'
    },
    userId: (s) => (s.user && s.user.user_id) || null,
    realName: (s) => (s.user && s.user.real_name) || (s.user && s.user.username) || '未登录'
  },
  actions: {
    setAuth(token, user) {
      this.token = token
      this.user = user
      localStorage.setItem('itops_token', token)
      localStorage.setItem('itops_user', JSON.stringify(user))
    },
    // 局部更新用户信息（改姓名后刷新页面不该又变回旧值）
    patchUser(patch) {
      this.user = { ...(this.user || {}), ...patch }
      localStorage.setItem('itops_user', JSON.stringify(this.user))
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('itops_token')
      localStorage.removeItem('itops_user')
    }
  }
})
