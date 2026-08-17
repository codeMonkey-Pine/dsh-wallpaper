/**
 * Host state persistence for dsh-wallpaper: reads and writes
 * `~/.dsh/dsh-wallpaper.json` — the Wallpaper Engine path overrides
 * (engineDir / steamDir) and the agent-set desired state that the browser
 * half merges on boot. The browser's own settings live in localStorage; this
 * file only carries what the host owns.
 * @module dsh-wallpaper/engine/state
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { HostState } from '../protocol.ts'

/** State file location under the dsh home. */
export function statePath(): string {
  return join(homedir(), '.dsh', 'dsh-wallpaper.json')
}

/** Empty desired state. */
function emptyDesired(): HostState['desired'] {
  return {}
}

/** Load the state file; absent or unparsable files fall back to empty state. */
export function loadState(): HostState {
  try {
    const raw = readFileSync(statePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { desired: emptyDesired() }
    const state = parsed as Partial<HostState>
    return {
      engineDir: typeof state.engineDir === 'string' ? state.engineDir : undefined,
      steamDir: typeof state.steamDir === 'string' ? state.steamDir : undefined,
      desired: typeof state.desired === 'object' && state.desired !== null ? state.desired : emptyDesired(),
    }
  } catch {
    return { desired: emptyDesired() }
  }
}

/** Persist the state file; a write failure is logged and swallowed (never fatal). */
export function saveState(state: HostState): void {
  try {
    const file = statePath()
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    console.error(`[dsh-wallpaper] failed to save state: ${error instanceof Error ? error.message : String(error)}`)
  }
}
