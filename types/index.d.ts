export type Situacao = 'completed' | 'in_progress' | 'pending'
export type Passo = {
  content: string
  status: Situacao
  /** ms em que o passo ficou em andamento */
  inicio?: number
  /** ms em que o passo foi feito */
  fim?: number
}
export type Lista = {
  passos: Passo[]
  /** ms da última mudança */
  atualizada: number
  /** ms do primeiro `items` desta lista */
  comecou: number
  /** o wrap_up deu baixa */
  encerrada: boolean
  /** turno da conversa principal em curso */
  rodando: boolean
  /** ms do fim do último turno */
  paradaEm?: number
}
export type Modelo = 'linha' | 'foco' | 'compacto'

declare module 'claude-code' {
  interface PluginState {
    'lista-fixa': {
      lista: Shaped<Lista>
      modelo: Shaped<Modelo>
      menuAberto: Shaped<boolean>
      feitosAbertos: Shaped<boolean>
    }
  }
}
