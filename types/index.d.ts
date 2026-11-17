export type Situacao = 'completed' | 'in_progress' | 'pending'
export type Passo = { content: string; status: Situacao }
export type Lista = { passos: Passo[]; atualizada: number; encerrada: boolean }

declare module 'claude-code' {
  interface PluginState {
    'lista-fixa': { lista: Shaped<Lista> }
  }
}
