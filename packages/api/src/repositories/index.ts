import { Layer } from 'effect'
import { InjectionLogRepoLive } from './InjectionLogRepo.js'
import { WeightLogRepoLive } from './WeightLogRepo.js'

export * from './InjectionLogRepo.js'
export * from './WeightLogRepo.js'

// Combined layer for all repositories
export const RepositoriesLive = Layer.mergeAll(WeightLogRepoLive, InjectionLogRepoLive)
