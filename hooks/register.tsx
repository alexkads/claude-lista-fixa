import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Lista, Passo, Situacao } from '../types'

const PAINEL = 'lista-fixa'
const TITULO = 'Atividades'
const PLANO = 'mcp__ccd_turn__update_plan'
const FECHO = 'mcp__ccd_turn__wrap_up'

const VAZIA: Lista = { passos: [], atualizada: 0, encerrada: false }
const lista = atom({ plugin: 'lista-fixa', key: 'lista' } as const, VAZIA, {
  shape: 'lista-1',
})

type Pedido = {
  items?: unknown
  advance?: unknown
  done?: unknown
  start?: unknown
}

const situacao = (s: unknown): Situacao =>
  s === 'completed' || s === 'in_progress' ? s : 'pending'

// Reproduz o que o app faz com cada chamada de update_plan.
export const aplicar = (antes: Passo[], p: Pedido): Passo[] => {
  if (Array.isArray(p.items)) {
    return p.items.map(i => {
      const o = (i ?? {}) as { content?: unknown; status?: unknown }
      return { content: String(o.content ?? ''), status: situacao(o.status) }
    })
  }
  let passos = antes.map(x => ({ ...x }))
  const marcar = (i: number, status: Situacao) => {
    passos = passos.map((x, j) => (j === i ? { ...x, status } : x))
  }
  if (p.advance === true) {
    const atual = passos.findIndex(x => x.status === 'in_progress')
    if (atual >= 0) marcar(atual, 'completed')
    const depois = passos.findIndex((x, i) => i > atual && x.status === 'pending')
    const proximo = depois >= 0 ? depois : passos.findIndex(x => x.status === 'pending')
    if (proximo >= 0) marcar(proximo, 'in_progress')
  }
  if (Array.isArray(p.done)) {
    for (const n of p.done) if (typeof n === 'number') marcar(n - 1, 'completed')
  }
  if (typeof p.start === 'number') {
    const alvo = p.start - 1
    passos = passos.map((x, j) =>
      j === alvo ? { ...x, status: 'in_progress' as const }
      : x.status === 'in_progress' ? { ...x, status: 'pending' as const } : x,
    )
  }
  return passos
}

const ABRIR = { id: PAINEL, title: TITULO }

const hora = (ms: number) => {
  if (!ms) return ''
  const d = new Date(ms)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lista',
      description: 'Mostra a lista de atividades fixa à direita',
    })
    const r = await next(e)
    void $.ui.open(ABRIR)
    return r
  })

  on('command.run', { command: 'lista' }, async $ => {
    await $.ui.open(ABRIR)
    return { text: 'Lista de atividades aberta à direita.' }
  })

  on('tool.call', { tool: PLANO }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && (ran as { isError?: boolean }).isError !== true) {
      try {
        await update($, lista, l => ({
          passos: aplicar(l.passos, e as unknown as Pedido),
          atualizada: Date.now(),
          encerrada: false,
        }))
        void $.ui.open(ABRIR)
      } catch {
        // O painel nunca derruba o update_plan.
      }
    }
    return ran
  }).catch(($, e, next) => (next.called ? { result: {} } : next(e)))

  // O wrap_up dá baixa na lista: tudo feito.
  on('tool.call', { tool: FECHO }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined) {
      await update($, lista, l =>
        l.passos.length === 0
          ? l
          : {
              passos: l.passos.map(x => ({ ...x, status: 'completed' as const })),
              atualizada: Date.now(),
              encerrada: true,
            },
      ).catch(() => undefined)
    }
    return ran
  }).catch(($, e, next) => (next.called ? { result: {} } : next(e)))

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const l = await read($, lista)
    const feitos = l.passos.filter(x => x.status === 'completed').length

    if (l.passos.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Nenhuma lista enviada ainda nesta sessão.</Text>
        </Box>
      )
    }

    if (e.props.placement === 'widget') {
      const atual = l.passos.find(x => x.status === 'in_progress')
      return (
        <Box flexDirection="column">
          <Text bold>
            {feitos}/{l.passos.length}
          </Text>
          <Text>{atual ? atual.content : l.encerrada ? 'Concluída' : 'Parada'}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={0}>
        <Text dimColor>
          {feitos} de {l.passos.length} · {l.encerrada ? 'concluída' : 'atualizada'} às {hora(l.atualizada)}
        </Text>
        <Text> </Text>
        {l.passos.map(x =>
          x.status === 'completed' ? (
            <Text color="success">✓ <Text dimColor>{x.content}</Text></Text>
          ) : x.status === 'in_progress' ? (
            <Text color="claude" bold>◐ {x.content}</Text>
          ) : (
            <Text color="subtle">◌ {x.content}</Text>
          ),
        )}
      </Box>
    )
  })
}
