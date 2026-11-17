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
    // Só abre de cara quando a sessão já tem lista (retomada ou recarga).
    // Onde não existe update_plan (terminal, VS Code) o painel nunca aparece.
    const l = await read($, lista)
    if (l.passos.length > 0) void $.ui.open(ABRIR)
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
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const l = await read($, lista)
    const total = l.passos.length
    const feitos = l.passos.filter(x => x.status === 'completed').length
    const atual = l.passos.find(x => x.status === 'in_progress')
    const temSvg = e.surface !== 'terminal'
    const Svg = (ui as { Svg?: typeof ui.Box }).Svg as unknown as (p: {
      source: string
      alt: string
      width?: number
      height?: number
      isInteractive?: boolean
    }) => ReturnType<typeof ui.Box>
    const situacaoGeral = l.encerrada ? 'Concluída' : atual ? 'Em andamento' : 'Parada'

    if (total === 0) {
      return (
        <Box flexDirection="column" alignItems="center" paddingY="lg" gap="sm">
          {temSvg && <Svg source={vazio()} alt="Lista vazia" width={40} height={40} isInteractive />}
          <Text dimColor size="footnote">Nenhuma lista nesta sessão ainda.</Text>
        </Box>
      )
    }

    // Terminal: sem Svg, fica com os símbolos de texto.
    if (!temSvg) {
      return (
        <Box flexDirection="column">
          <Text dimColor>
            {feitos} de {total} · {situacaoGeral.toLowerCase()} às {hora(l.atualizada)}
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
    }

    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="row" alignItems="center" gap="sm" padding="xs">
          <Svg source={anel(feitos, total, 36)} alt={`${feitos} de ${total}`} width={36} height={36} isInteractive />
          <Box flexDirection="column" flexShrink={1}>
            <Text size="caption" dimColor>{situacaoGeral}</Text>
            <Text size="footnote" weight="medium">{atual ? atual.content : `${feitos} de ${total} feitos`}</Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="md" paddingX="sm" paddingY="sm">
        <Box flexDirection="row" alignItems="center" gap="md">
          <Svg source={anel(feitos, total, 52)} alt={`${feitos} de ${total} passos feitos`} width={52} height={52} isInteractive />
          <Box flexDirection="column" flexShrink={1}>
            <Text size="heading" weight="semibold">{situacaoGeral}</Text>
            <Text size="caption" dimColor tabular>
              {feitos} de {total} passos · {hora(l.atualizada)}
            </Text>
          </Box>
        </Box>

        <Box flexDirection="column" gap="xs">
          {l.passos.map((x, i) => {
            const ultimo = i === total - 1
            if (x.status === 'in_progress') {
              return (
                <Box
                  key={`p${i}`}
                  flexDirection="row"
                  alignItems="center"
                  gap="sm"
                  paddingX="sm"
                  paddingY="sm"
                  borderStyle="round"
                  borderColor="claude"
                >
                  <Svg source={girando()} alt="Em andamento" width={20} height={20} isInteractive />
                  <Box flexDirection="column" flexShrink={1}>
                    <Text size="caption" color="claude" weight="medium">Agora</Text>
                    <Text weight="semibold">{x.content}</Text>
                  </Box>
                </Box>
              )
            }
            return (
              <Box key={`p${i}`} flexDirection="row" alignItems="center" gap="sm" paddingX="sm" paddingY="xs">
                <Svg
                  source={x.status === 'completed' ? feito() : pendente(ultimo)}
                  alt={x.status === 'completed' ? 'Feito' : 'Pendente'}
                  width={20}
                  height={20}
                  isInteractive
                />
                <Box flexShrink={1}>
                  {x.status === 'completed' ? (
                    <Text dimColor>{x.content}</Text>
                  ) : (
                    <Text color="subtle">{x.content}</Text>
                  )}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}

const VERDE = '#3FA66A'
const LARANJA = '#D97757'
const CINZA = '#8A8580'

// Anel de progresso: enche do valor anterior até o atual a cada desenho.
const anel = (feitos: number, total: number, t: number) => {
  const r = t / 2 - 4
  const c = 2 * Math.PI * r
  const fim = total > 0 ? feitos / total : 0
  const cheio = fim >= 1
  const cor = cheio ? VERDE : LARANJA
  const off = (c * (1 - fim)).toFixed(2)
  const pct = Math.round(fim * 100)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}">
<style>
.f{animation:enche .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes enche{from{stroke-dashoffset:${c.toFixed(2)}}to{stroke-dashoffset:${off}}}
.n{font:600 ${Math.round(t * 0.27)}px -apple-system,system-ui,sans-serif;fill:${cor}}
.b{animation:pulso 2.4s ease-in-out infinite;transform-origin:center}
@keyframes pulso{0%,100%{opacity:.18}50%{opacity:.32}}
</style>
<circle cx="${t / 2}" cy="${t / 2}" r="${r}" fill="none" stroke="${CINZA}" stroke-opacity=".25" stroke-width="4"/>
${cheio ? `<circle class="b" cx="${t / 2}" cy="${t / 2}" r="${r}" fill="${VERDE}"/>` : ''}
<circle class="f" cx="${t / 2}" cy="${t / 2}" r="${r}" fill="none" stroke="${cor}" stroke-width="4" stroke-linecap="round"
 stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off}" transform="rotate(-90 ${t / 2} ${t / 2})"/>
<text class="n" x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${cheio ? '✓' : pct + '%'}</text>
</svg>`
}

// Passo atual: arco girando com um halo pulsando.
const girando = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
<style>
.g{animation:gira .9s linear infinite;transform-origin:10px 10px}
@keyframes gira{to{transform:rotate(360deg)}}
.h{animation:halo 1.6s ease-out infinite;transform-origin:10px 10px}
@keyframes halo{0%{transform:scale(.6);opacity:.5}100%{transform:scale(1);opacity:0}}
</style>
<circle class="h" cx="10" cy="10" r="9" fill="${LARANJA}"/>
<circle cx="10" cy="10" r="6.5" fill="none" stroke="${LARANJA}" stroke-opacity=".25" stroke-width="2.2"/>
<path class="g" d="M10 3.5 A6.5 6.5 0 0 1 16.5 10" fill="none" stroke="${LARANJA}" stroke-width="2.2" stroke-linecap="round"/>
</svg>`

// Feito: bolinha verde com o visto desenhado.
const feito = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
<style>.v{stroke-dasharray:12;animation:risca .45s ease-out both}@keyframes risca{from{stroke-dashoffset:12}to{stroke-dashoffset:0}}</style>
<circle cx="10" cy="10" r="8" fill="${VERDE}"/>
<path class="v" d="M6.2 10.3 L8.8 12.8 L13.8 7.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// Pendente: círculo tracejado, que gira devagar.
const pendente = (ultimo: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
<style>.d{animation:lento 12s linear infinite;transform-origin:10px 10px}@keyframes lento{to{transform:rotate(360deg)}}</style>
<circle class="d" cx="10" cy="10" r="7" fill="none" stroke="${CINZA}" stroke-opacity="${ultimo ? '.55' : '.7'}" stroke-width="1.8" stroke-dasharray="2.6 2.4"/>
</svg>`

const vazio = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<style>.d{animation:lento 14s linear infinite;transform-origin:20px 20px}@keyframes lento{to{transform:rotate(360deg)}}</style>
<circle class="d" cx="20" cy="20" r="15" fill="none" stroke="${CINZA}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="4 4"/>
<path d="M14 20h12M20 14v12" stroke="${CINZA}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>
</svg>`
