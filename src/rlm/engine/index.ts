/**
 * RLM Engine Module
 *
 * Recursive reasoning engine with REPL-style state management.
 */

export * from './types.js';
export { RLMState, type RLMStateData } from './state.js';
export { RLMEngine } from './rlm-engine.js';
export {
  rlmTools,
  peekContextSchema,
  searchContextSchema,
  getChunkSchema,
  subQuerySchema,
  finalAnswerSchema,
  type PeekContextArgs,
  type SearchContextArgs,
  type GetChunkArgs,
  type SubQueryArgs,
  type FinalAnswerArgs,
} from './tools.js';
export {
  RLMDispatcher,
  createDispatcher,
  DEFAULT_DISPATCHER_CONFIG,
  type DispatcherConfig,
  type VerifiedResult,
} from './dispatcher.js';
