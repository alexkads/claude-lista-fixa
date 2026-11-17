import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'

import type { Lista, Modelo, Passo, Situacao } from '../types'

const PAINEL = 'lista-fixa'
const TITULO = 'Atividades'
const PLANO = 'mcp__ccd_turn__update_plan'
const FECHO = 'mcp__ccd_turn__wrap_up'
const MODELOS: readonly Modelo[] = ['linha', 'foco', 'compacto']
const NOME: Record<Modelo, string> = {
  linha: 'Linha do tempo',
  foco: 'Foco no agora',
  compacto: 'Compacto',
}

const VAZIA: Lista = {
  passos: [],
  atualizada: 0,
  comecou: 0,
  encerrada: false,
  rodando: false,
}
// O shape muda quando os campos mudam: um valor da 0.1.x é recusado e o
// painel volta vazio até o próximo update_plan.
const lista = atom({ plugin: 'lista-fixa', key: 'lista' } as const, VAZIA, {
  shape: 'lista-2',
})
const modelo = atom({ plugin: 'lista-fixa', key: 'modelo' } as const, 'linha' as Modelo, {
  shape: 'modelo-1',
})
const menuAberto = atom({ plugin: 'lista-fixa', key: 'menuAberto' } as const, false, {
  shape: 'menu-1',
})
const feitosAbertos = atom({ plugin: 'lista-fixa', key: 'feitosAbertos' } as const, false, {
  shape: 'feitos-1',
})

type Pedido = {
  items?: unknown
  advance?: unknown
  done?: unknown
  start?: unknown
}

const situacao = (s: unknown): Situacao =>
  s === 'completed' || s === 'in_progress' ? s : 'pending'

const ehModelo = (s: unknown): s is Modelo =>
  typeof s === 'string' && (MODELOS as readonly string[]).includes(s)

// Reproduz o que o app faz com cada chamada de update_plan, anotando quando
// cada passo começou e terminou.
export const aplicar = (antes: Passo[], p: Pedido, agora = 0): Passo[] => {
  const carimbar = (x: Passo, status: Situacao): Passo => {
    if (x.status === status) return x
    if (status === 'in_progress') return { ...x, status, inicio: agora, fim: undefined }
    if (status === 'completed') return { ...x, status, fim: agora }
    return { ...x, status, inicio: undefined, fim: undefined }
  }
  if (Array.isArray(p.items)) {
    return p.items.map(i => {
      const o = (i ?? {}) as { content?: unknown; status?: unknown }
      const content = String(o.content ?? '')
      const status = situacao(o.status)
      const igual = antes.find(x => x.content === content)
      if (igual) return carimbar(igual, status)
      return status === 'in_progress' ? { content, status, inicio: agora } : { content, status }
    })
  }
  let passos = antes.map(x => ({ ...x }))
  const marcar = (i: number, status: Situacao) => {
    passos = passos.map((x, j) => (j === i ? carimbar(x, status) : x))
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
    passos.forEach((x, j) => {
      if (j !== alvo && x.status === 'in_progress') marcar(j, 'pending')
    })
    marcar(alvo, 'in_progress')
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

const duracao = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${resto} min` : `${h} h`
}
const ha = (desde: number | undefined, agora: number) =>
  desde ? (agora - desde < 60000 ? 'agora há pouco' : `há ${duracao(agora - desde)}`) : ''

async function trocar($: EngineInterface, m: Modelo) {
  await update($, modelo, () => m)
  await update($, menuAberto, () => false)
  try {
    await $.store.set('modelo', m)
  } catch {
    // Sem store, a escolha vale só nesta sessão.
  }
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lista',
      description: 'Abre o painel de atividades; com linha, foco ou compacto troca o modelo',
      argumentHint: '[linha|foco|compacto]',
    })
    const r = await next(e)
    try {
      const salvo = await $.store.get('modelo')
      if (ehModelo(salvo)) await update($, modelo, () => salvo)
    } catch {
      // Sem store: fica o modelo padrão.
    }
    // Redesenha a cada 30 s para o "há N min" andar.
    $.clock.every(30000, () => {
      void read($, lista).then(l => {
        if (l.passos.some(x => x.status === 'in_progress')) $.ui.invalidate('ui.render')
      })
    })
    // Só abre de cara quando a sessão já tem lista (retomada ou recarga).
    // Onde não existe update_plan (terminal, VS Code) o painel nunca aparece.
    const l = await read($, lista)
    if (l.passos.length > 0) void $.ui.open(ABRIR)
    return r
  })

  on('command.run', { command: 'lista' }, async ($, e) => {
    const pedido = (e.args ?? '').trim().toLowerCase()
    if (ehModelo(pedido)) await trocar($, pedido)
    await $.ui.open(ABRIR)
    return {
      text: ehModelo(pedido)
        ? `Painel de atividades no modelo ${NOME[pedido]}.`
        : 'Painel de atividades aberto à direita.',
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, lista, l => (l.passos.length ? { ...l, rodando: true, paradaEm: undefined } : l)).catch(
        () => undefined,
      )
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      await update($, lista, l =>
        l.passos.length ? { ...l, rodando: false, paradaEm: Date.now() } : l,
      ).catch(() => undefined)
    }
    return r
  })

  on('tool.call', { tool: PLANO }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && (ran as { isError?: boolean }).isError !== true) {
      try {
        const agora = Date.now()
        const pedido = e as unknown as Pedido
        await update($, lista, l => ({
          passos: aplicar(l.encerrada && Array.isArray(pedido.items) ? [] : l.passos, pedido, agora),
          atualizada: agora,
          comecou: Array.isArray(pedido.items) && (l.encerrada || !l.comecou) ? agora : l.comecou || agora,
          encerrada: false,
          rodando: true,
          paradaEm: undefined,
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
      const agora = Date.now()
      await update($, lista, l =>
        l.passos.length === 0
          ? l
          : {
              ...l,
              passos: l.passos.map(x =>
                x.status === 'completed' ? x : { ...x, status: 'completed' as const, fim: agora },
              ),
              atualizada: agora,
              encerrada: true,
            },
      ).catch(() => undefined)
    }
    return ran
  }).catch(($, e, next) => (next.called ? { result: {} } : next(e)))

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const ui = $.ui.resolve(e) as unknown as Elementos
    const { Box, Text } = ui
    const l = await read($, lista)
    const m = await read($, modelo)
    const aberto = await read($, menuAberto)
    const verFeitos = await read($, feitosAbertos)
    const agora = Date.now()
    const total = l.passos.length
    const feitos = l.passos.filter(x => x.status === 'completed').length
    const atual = l.passos.find(x => x.status === 'in_progress')
    const parada = !l.rodando && !l.encerrada && atual !== undefined

    if (total === 0) {
      return (
        <Box flexDirection="column" alignItems="center" paddingY={2} gap={1}>
          {e.surface !== 'terminal' && <ui.Svg source={svgVazio()} alt="Lista vazia" width={40} height={40} isInteractive />}
          <Text dimColor>A lista aparece aqui quando o Claude começar uma tarefa.</Text>
        </Box>
      )
    }

    // Terminal: sem Svg nem menu, ficam os símbolos de texto.
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          <Text dimColor>
            {feitos} de {total} · {l.encerrada ? 'concluída' : parada ? 'parada' : 'atualizada'} às {hora(l.atualizada)}
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

    const d: Dados = { l, total, feitos, atual, parada, agora, verFeitos }

    if (e.props.placement === 'widget') return widget(ui, d)

    const corpo =
      l.encerrada ? concluida(ui, d) : m === 'foco' ? foco(ui, d, $) : m === 'compacto' ? compacto(ui, d) : linha(ui, d, $)

    const { Button } = ui
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingX={1}>
          <Text size="caption" dimColor>
            {NOME[m]}
          </Text>
          <Button key="menu" hotkey="m" plain dimColor label="⋯" onPress={() => update($, menuAberto, x => !x)} />
        </Box>
        {MODELOS.map((x, i) => (
          <Box display="none">
            <Button key={`atalho-${x}`} hotkey={String(i + 1)} plain label={NOME[x]} onPress={() => trocar($, x)} />
          </Box>
        ))}
        {corpo}
        {aberto && (
          <Box
            key="menu-flutuante"
            position="absolute"
            top={2}
            right={1}
            flexDirection="column"
            gap={0}
            paddingX={1}
            paddingY={1}
            borderStyle="round"
            borderColor="subtle"
            backgroundColor="inverseText"
          >
            <Text size="caption" dimColor>Modelo do painel</Text>
            {MODELOS.map((x, i) => (
              <Button
                key={`modelo-${x}`}
                plain
                dimColor={x !== m}
                label={`${x === m ? '● ' : '○ '}${NOME[x]}  ${i + 1}`}
                onPress={() => trocar($, x)}
              />
            ))}
            <Text> </Text>
            <Button
              key="feitos"
              plain
              dimColor
              label={verFeitos ? 'Esconder passos feitos' : 'Mostrar passos feitos'}
              onPress={async () => {
                await update($, feitosAbertos, x => !x)
                await update($, menuAberto, () => false)
              }}
            />
            <Button key="fechar" plain dimColor label="Fechar" onPress={() => update($, menuAberto, () => false)} />
          </Box>
        )}
      </Box>
    )
  })
}

// ---------------------------------------------------------------- desenho

type Elementos = ElementTable<'desktop'>
type Engine = EngineInterface

type Dados = {
  l: Lista
  total: number
  feitos: number
  atual: Passo | undefined
  parada: boolean
  agora: number
  verFeitos: boolean
}

const VERDE = '#3FA66A'
const LARANJA = '#D97757'
const AMBAR = '#C9A24A'
const CINZA = '#8A8580'

const svgFeito = (linha: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 ${linha ? 40 : 24}">
<style>.v{stroke-dasharray:14;animation:r .45s ease-out both}@keyframes r{from{stroke-dashoffset:14}to{stroke-dashoffset:0}}</style>
<circle cx="12" cy="12" r="9" fill="${VERDE}"/>
<path class="v" d="M8 12.3l2.6 2.5 5.4-5.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
${linha ? `<path d="M12 23v17" stroke="${VERDE}" stroke-opacity=".55" stroke-width="2"/>` : ''}
</svg>`

const svgAgora = (linha: boolean, cor = LARANJA) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 ${linha ? 40 : 24}">
<style>
.g{animation:g .9s linear infinite;transform-origin:12px 12px}@keyframes g{to{transform:rotate(360deg)}}
.h{animation:h 1.6s ease-out infinite;transform-origin:12px 12px}@keyframes h{0%{transform:scale(.55);opacity:.5}100%{transform:scale(1);opacity:0}}
</style>
<circle class="h" cx="12" cy="12" r="11" fill="${cor}"/>
<circle cx="12" cy="12" r="7.5" fill="none" stroke="${cor}" stroke-opacity=".3" stroke-width="2.4"/>
<path class="g" d="M12 4.5A7.5 7.5 0 0 1 19.5 12" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linecap="round"/>
${linha ? `<path d="M12 23v17" stroke="${CINZA}" stroke-opacity=".35" stroke-width="2"/>` : ''}
</svg>`

const svgParada = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="8" fill="none" stroke="${AMBAR}" stroke-width="2"/>
<path d="M10 9v6M14 9v6" stroke="${AMBAR}" stroke-width="2" stroke-linecap="round"/>
</svg>`

const svgPendente = (linha: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 ${linha ? 40 : 24}">
<style>.d{animation:l 12s linear infinite;transform-origin:12px 12px}@keyframes l{to{transform:rotate(360deg)}}</style>
<circle class="d" cx="12" cy="12" r="8" fill="none" stroke="${CINZA}" stroke-opacity=".75" stroke-width="1.8" stroke-dasharray="3 3"/>
${linha ? `<path d="M12 22v18" stroke="${CINZA}" stroke-opacity=".35" stroke-width="2"/>` : ''}
</svg>`

const svgVazio = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<style>.d{animation:l 14s linear infinite;transform-origin:20px 20px}@keyframes l{to{transform:rotate(360deg)}}</style>
<circle class="d" cx="20" cy="20" r="15" fill="none" stroke="${CINZA}" stroke-opacity=".6" stroke-width="2" stroke-dasharray="4 4"/>
</svg>`

const svgAnel = (feitos: number, total: number, t: number, parada: boolean) => {
  const r = t / 2 - 5
  const c = 2 * Math.PI * r
  const fim = total ? feitos / total : 0
  const cor = fim >= 1 ? VERDE : parada ? AMBAR : LARANJA
  const off = (c * (1 - fim)).toFixed(2)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}">
<style>.f{animation:e 1s cubic-bezier(.2,.8,.2,1) both}@keyframes e{from{stroke-dashoffset:${c.toFixed(2)}}to{stroke-dashoffset:${off}}}
.n{font:600 ${Math.round(t * 0.22)}px -apple-system,system-ui,sans-serif;fill:${cor}}</style>
<circle cx="${t / 2}" cy="${t / 2}" r="${r}" fill="none" stroke="${CINZA}" stroke-opacity=".25" stroke-width="5"/>
<circle class="f" cx="${t / 2}" cy="${t / 2}" r="${r}" fill="none" stroke="${cor}" stroke-width="5" stroke-linecap="round"
 stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off}" transform="rotate(-90 ${t / 2} ${t / 2})"/>
<text class="n" x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${feitos}/${total}</text>
</svg>`
}

const svgSegmentos = (passos: Passo[]) => {
  const n = Math.max(1, passos.length)
  const gap = 3
  const w = 360
  const s = (w - gap * (n - 1)) / n
  const barras = passos
    .map((x, i) => {
      const cor = x.status === 'completed' ? VERDE : x.status === 'in_progress' ? LARANJA : CINZA
      const op = x.status === 'pending' ? '.3' : '1'
      const pulsa = x.status === 'in_progress' ? ' class="p"' : ''
      return `<rect${pulsa} x="${(i * (s + gap)).toFixed(1)}" y="0" width="${s.toFixed(1)}" height="6" rx="3" fill="${cor}" fill-opacity="${op}"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 6">
<style>.p{animation:p 1.4s ease-in-out infinite}@keyframes p{0%,100%{opacity:1}50%{opacity:.4}}</style>${barras}</svg>`
}

const icone = (ui: Elementos, x: Passo, linha: boolean, parada: boolean) =>
  x.status === 'completed' ? (
    <ui.Svg source={svgFeito(linha)} alt="Feito" width={20} height={linha ? 34 : 20} isInteractive />
  ) : x.status === 'in_progress' ? (
    <ui.Svg
      source={parada ? svgParada() : svgAgora(linha)}
      alt={parada ? 'Parado' : 'Em andamento'}
      width={20}
      height={linha && !parada ? 34 : 20}
      isInteractive
    />
  ) : (
    <ui.Svg source={svgPendente(linha)} alt="Pendente" width={20} height={linha ? 34 : 20} isInteractive />
  )

const rotuloAgora = (d: Dados) =>
  d.parada ? `Parada ${ha(d.l.paradaEm, d.agora)}` : `Agora · ${ha(d.atual?.inicio, d.agora) || 'agora há pouco'}`

const cartaoAgora = (ui: Elementos, d: Dados, x: Passo) => {
  const { Box, Text } = ui
  return (
    <Box
      flexDirection="row"
      alignItems="flex-start"
      gap={1}
      paddingX={1}
      paddingY={1}
      borderStyle="round"
      borderColor={d.parada ? 'warning' : 'claude'}
    >
      {icone(ui, x, false, d.parada)}
      <Box flexDirection="column" flexShrink={1}>
        <Text size="caption" weight="semibold" color={d.parada ? 'warning' : 'claude'}>
          {rotuloAgora(d).toUpperCase()}
        </Text>
        <Text weight="semibold">{x.content}</Text>
        {d.parada && (
          <Text size="caption" dimColor>
            Aguardando sua resposta
          </Text>
        )}
      </Box>
    </Box>
  )
}

const linhaSimples = (ui: Elementos, x: Passo, linha: boolean) => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" alignItems="flex-start" gap={1}>
      {icone(ui, x, linha, false)}
      <Box flexShrink={1} paddingTop={0}>
        {x.status === 'completed' ? <Text dimColor>{x.content}</Text> : <Text color="subtle">{x.content}</Text>}
      </Box>
    </Box>
  )
}

const progresso = (ui: Elementos, d: Dados) => (
  <ui.Progress
    label={`${d.feitos} de ${d.total} passos`}
    value={d.feitos}
    max={d.total}
    valueText={hora(d.l.atualizada)}
    color={d.parada ? 'warning' : 'claude'}
  />
)

// A · Linha do tempo
const linha = (ui: Elementos, d: Dados, $: Engine) => {
  const { Box, Text, Button } = ui
  const feitos = d.l.passos.filter(x => x.status === 'completed')
  const recolher = feitos.length > 3 && !d.verFeitos
  const visiveis = d.l.passos.filter(x => !(recolher && x.status === 'completed'))
  const proximo = d.l.passos.find(x => x.status === 'pending')
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {progresso(ui, d)}
      <Box flexDirection="column">
        {recolher && (
          <Button
            key="ver-feitos"
            plain
            dimColor
            label={`✓ ${feitos.length} passos feitos · mostrar`}
            onPress={() => update($, feitosAbertos, () => true)}
          />
        )}
        {visiveis.map((x, i) =>
          x.status === 'in_progress' ? (
            <Box paddingY={0}>{cartaoAgora(ui, d, x)}</Box>
          ) : (
            linhaSimples(ui, x, i < visiveis.length - 1)
          ),
        )}
      </Box>
      {proximo && (
        <Text size="caption" dimColor>
          Próximo: {proximo.content}
        </Text>
      )}
    </Box>
  )
}

// B · Foco no agora
const foco = (ui: Elementos, d: Dados, $: Engine) => {
  const { Box, Text, Button } = ui
  const pendentes = d.l.passos.filter(x => x.status === 'pending')
  const feitos = d.l.passos.filter(x => x.status === 'completed')
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="row" alignItems="center" gap={2} paddingX={1} paddingY={1} borderStyle="round" borderColor="subtle">
        <ui.Svg source={svgAnel(d.feitos, d.total, 64, d.parada)} alt={`${d.feitos} de ${d.total} passos feitos`} width={64} height={64} isInteractive />
        <Box flexDirection="column" flexShrink={1}>
          <Text size="caption" weight="semibold" color={d.parada ? 'warning' : 'claude'}>
            {d.atual ? rotuloAgora(d).toUpperCase() : 'SEM PASSO EM ANDAMENTO'}
          </Text>
          <Text size="heading" weight="semibold">
            {d.atual ? d.atual.content : `${d.feitos} de ${d.total} feitos`}
          </Text>
        </Box>
      </Box>
      {pendentes.length > 0 && (
        <Box flexDirection="column">
          <Text size="caption" weight="semibold" dimColor>
            A SEGUIR
          </Text>
          {pendentes.map(x => linhaSimples(ui, x, false))}
        </Box>
      )}
      {feitos.length > 0 && (
        <Box flexDirection="column">
          <Button
            key="foco-feitos"
            plain
            dimColor
            label={`FEITOS · ${feitos.length}  ${d.verFeitos ? '▴' : '▾'}`}
            onPress={() => update($, feitosAbertos, x => !x)}
          />
          {d.verFeitos && feitos.map(x => linhaSimples(ui, x, false))}
        </Box>
      )}
    </Box>
  )
}

// C · Compacto
const compacto = (ui: Elementos, d: Dados) => {
  const { Box, Text } = ui
  const pct = d.total ? Math.round((d.feitos / d.total) * 100) : 0
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text size="caption" dimColor tabular>
          {d.feitos} de {d.total}
        </Text>
        <Text size="caption" dimColor tabular>
          {pct}% · {hora(d.l.atualizada)}
        </Text>
      </Box>
      <ui.Svg source={svgSegmentos(d.l.passos)} alt={`${d.feitos} de ${d.total} passos feitos`} width={360} height={6} isInteractive />
      <Box flexDirection="column">
        {d.l.passos.map((x, i) => {
          const n = String(i + 1).padStart(2, '0')
          if (x.status === 'completed')
            return (
              <Box flexDirection="row" gap={1}>
                <Text mono color="success">✓ </Text>
                <Text dimColor>{x.content}</Text>
              </Box>
            )
          if (x.status === 'in_progress')
            return (
              <Box flexDirection="row" gap={1} backgroundColor={d.parada ? 'rgba(201,162,74,.16)' : 'rgba(217,119,87,.16)'} paddingX={1}>
                <Text mono weight="bold" color={d.parada ? 'warning' : 'claude'}>{n}</Text>
                <Text weight="semibold">{x.content}</Text>
              </Box>
            )
          return (
            <Box flexDirection="row" gap={1}>
              <Text mono color="subtle">{n}</Text>
              <Text color="subtle">{x.content}</Text>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// Estado concluída (todos os modelos)
const concluida = (ui: Elementos, d: Dados) => {
  const { Box, Text } = ui
  const fim = Math.max(...d.l.passos.map(x => x.fim ?? 0), d.l.atualizada)
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="row" alignItems="center" gap={2} paddingX={1} paddingY={1} borderStyle="round" borderColor="success">
        <ui.Svg source={svgAnel(d.total, d.total, 48, false)} alt="Concluída" width={48} height={48} isInteractive />
        <Box flexDirection="column">
          <Text size="heading" weight="semibold">
            {d.total} de {d.total} concluídos
          </Text>
          <Text size="caption" dimColor tabular>
            {d.l.comecou ? `em ${duracao(fim - d.l.comecou)} · ` : ''}
            {hora(fim)}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">{d.l.passos.map(x => linhaSimples(ui, x, false))}</Box>
    </Box>
  )
}

// Minimizado (widget do app)
const widget = (ui: Elementos, d: Dados) => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" gap={1} padding={1}>
      {progresso(ui, d)}
      <Text size="footnote" weight="semibold">
        {d.l.encerrada ? 'Concluída' : d.atual ? d.atual.content : `${d.feitos} de ${d.total} feitos`}
      </Text>
      {d.parada && (
        <Text size="caption" color="warning">
          {rotuloAgora(d)}
        </Text>
      )}
    </Box>
  )
}
