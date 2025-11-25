import { AppRpcs } from '@scale/shared'
import { Effect, Layer, Option } from 'effect'
import { Greeter } from './Greeter.js'
import { WeightLogRepo } from './repositories/WeightLogRepo.js'
import { InjectionLogRepo } from './repositories/InjectionLogRepo.js'

export const RpcHandlersLive = AppRpcs.toLayer(
  Effect.gen(function* () {
    const greeter = yield* Greeter
    const weightLogRepo = yield* WeightLogRepo
    const injectionLogRepo = yield* InjectionLogRepo

    return {
      // Existing
      Greet: ({ name }: { name: string }) => greeter.greet(name),

      // Weight Log handlers
      WeightLogList: (params: Parameters<typeof weightLogRepo.list>[0]) => weightLogRepo.list(params),
      WeightLogGet: ({ id }: { id: string }) => weightLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      WeightLogCreate: (data: Parameters<typeof weightLogRepo.create>[0]) => weightLogRepo.create(data),
      WeightLogUpdate: (data: Parameters<typeof weightLogRepo.update>[0]) => weightLogRepo.update(data),
      WeightLogDelete: ({ id }: { id: string }) => weightLogRepo.delete(id),

      // Injection Log handlers
      InjectionLogList: (params: Parameters<typeof injectionLogRepo.list>[0]) => injectionLogRepo.list(params),
      InjectionLogGet: ({ id }: { id: string }) => injectionLogRepo.findById(id).pipe(Effect.map(Option.getOrNull)),
      InjectionLogCreate: (data: Parameters<typeof injectionLogRepo.create>[0]) => injectionLogRepo.create(data),
      InjectionLogUpdate: (data: Parameters<typeof injectionLogRepo.update>[0]) => injectionLogRepo.update(data),
      InjectionLogDelete: ({ id }: { id: string }) => injectionLogRepo.delete(id),
      InjectionLogGetDrugs: () => injectionLogRepo.getUniqueDrugs(),
      InjectionLogGetSites: () => injectionLogRepo.getUniqueSites(),
    }
  }),
).pipe(Layer.provide(Greeter.layer))
