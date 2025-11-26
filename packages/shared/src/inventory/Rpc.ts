import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import { InventoryDatabaseError, InventoryNotFoundError } from '../errors/index.js'
import {
  Inventory,
  InventoryCreate,
  InventoryDelete,
  InventoryListParams,
  InventoryMarkFinished,
  InventoryMarkOpened,
  InventoryUpdate,
} from './Inventory.js'

// ============================================
// Inventory RPCs
// ============================================

export const InventoryRpcs = RpcGroup.make(
  Rpc.make('InventoryList', {
    payload: InventoryListParams,
    success: Schema.Array(Inventory),
    error: InventoryDatabaseError,
  }),
  Rpc.make('InventoryGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(Inventory),
    error: InventoryDatabaseError,
  }),
  Rpc.make('InventoryCreate', {
    payload: InventoryCreate,
    success: Inventory,
    error: InventoryDatabaseError,
  }),
  Rpc.make('InventoryUpdate', {
    payload: InventoryUpdate,
    success: Inventory,
    error: Schema.Union(InventoryNotFoundError, InventoryDatabaseError),
  }),
  Rpc.make('InventoryDelete', {
    payload: InventoryDelete,
    success: Schema.Boolean,
    error: InventoryDatabaseError,
  }),
  Rpc.make('InventoryMarkFinished', {
    payload: InventoryMarkFinished,
    success: Inventory,
    error: Schema.Union(InventoryNotFoundError, InventoryDatabaseError),
  }),
  Rpc.make('InventoryMarkOpened', {
    payload: InventoryMarkOpened,
    success: Inventory,
    error: Schema.Union(InventoryNotFoundError, InventoryDatabaseError),
  }),
)
