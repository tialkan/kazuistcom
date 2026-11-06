/**
 * Browser build of the line validator (plan 8.1, BYOK istemci): the BYOK client validates each model line with
 * exactly the code the server runs. No Node built-ins, no network, no storage; a test enforces this.
 */
export * from './normalize.ts';
export * from './answer/names.ts';
export * from './answer/validator.ts';
export { passagesFromPrompt } from './answer/passages.ts';
