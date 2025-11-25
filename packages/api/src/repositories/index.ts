import { Layer } from 'effect'
import { WeightLogRepoLive } from './WeightLogRepo.js'
import { InjectionLogRepoLive } from './InjectionLogRepo.js'

export * from './WeightLogRepo.js'
export * from './InjectionLogRepo.js'

// Combined layer for all repositories
export const RepositoriesLive = Layer.mergeAll(WeightLogRepoLive, InjectionLogRepoLive)
