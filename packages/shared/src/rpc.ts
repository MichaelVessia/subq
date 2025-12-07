import { AuthRpcMiddleware } from './auth-middleware.js'
import { GoalRpcs } from './goals/rpc.js'
import { InjectionRpcs } from './injection/rpc.js'
import { InventoryRpcs } from './inventory/rpc.js'
import { ScheduleRpcs } from './schedule/rpc.js'
import { SettingsRpcs } from './settings/rpc.js'
import { StatsRpcs } from './stats/rpc.js'
import { WeightRpcs } from './weight/rpc.js'

// ============================================
// Combined App RPCs - Merge all domain RPCs
// ============================================

export const AppRpcs = WeightRpcs.merge(InjectionRpcs)
  .merge(InventoryRpcs)
  .merge(ScheduleRpcs)
  .merge(StatsRpcs)
  .merge(GoalRpcs)
  .merge(SettingsRpcs)
  .middleware(AuthRpcMiddleware)

// Re-export domain RPCs for selective use
export { WeightRpcs } from './weight/rpc.js'
export { InjectionRpcs } from './injection/rpc.js'
export { InventoryRpcs } from './inventory/rpc.js'
export { ScheduleRpcs } from './schedule/rpc.js'
export { StatsRpcs } from './stats/rpc.js'
export { GoalRpcs } from './goals/rpc.js'
export { SettingsRpcs } from './settings/rpc.js'
