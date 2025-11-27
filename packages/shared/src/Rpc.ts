import { AuthRpcMiddleware } from './AuthMiddleware.js'
import { InjectionRpcs } from './injection/Rpc.js'
import { InventoryRpcs } from './inventory/Rpc.js'
import { ScheduleRpcs } from './schedule/Rpc.js'
import { StatsRpcs } from './stats/Rpc.js'
import { WeightRpcs } from './weight/Rpc.js'

// ============================================
// Combined App RPCs - Merge all domain RPCs
// ============================================

export const AppRpcs = WeightRpcs.merge(InjectionRpcs)
  .merge(InventoryRpcs)
  .merge(ScheduleRpcs)
  .merge(StatsRpcs)
  .middleware(AuthRpcMiddleware)

// Re-export domain RPCs for selective use
export { WeightRpcs } from './weight/Rpc.js'
export { InjectionRpcs } from './injection/Rpc.js'
export { InventoryRpcs } from './inventory/Rpc.js'
export { ScheduleRpcs } from './schedule/Rpc.js'
export { StatsRpcs } from './stats/Rpc.js'
