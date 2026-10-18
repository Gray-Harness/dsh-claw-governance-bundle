/**
 * Stable error codes / names used across the claw suite.
 */

export function clawError(code, message, details) {
  const err = new Error(message || code)
  err.name = code
  err.code = code
  if (details !== undefined) err.details = details
  return err
}

export class ClawDegradedError extends Error {
  constructor(message, details) {
    super(message || 'Claw session degraded')
    this.name = 'ClawDegradedError'
    this.code = 'ClawDegradedError'
    if (details !== undefined) this.details = details
  }
}

export class SubagentStaleError extends Error {
  constructor(message, details) {
    super(message || 'Subagent generation is stale')
    this.name = 'SubagentStaleError'
    this.code = 'SubagentStaleError'
    if (details !== undefined) this.details = details
  }
}
