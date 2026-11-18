import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PAINEL = {
  plugin: 'lista-fixa',
  component: 'Pane',
  requestId: 'lista-fixa',
  props: {
    title: 'Atividades',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const PLANO = 'mcp__ccd_turn__update_plan'

// Motor de mentira: abre painel, guarda o store e responde às ferramentas.
const motor = (on: Parameters<TestBody>[1], store: Record<string, unknown> = {}) => {
  const abertos: string[] = []
  on('command.register', () => ({ value: { command: 'lista' } }))
  on('ui.open', (_, e) => {
    abertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('clock.every', () => ({ value: undefined }))
  return { abertos, store }
}

const lista3 = {
  tool: PLANO,
  items: [
    { content: 'Ler', status: 'in_progress' },
    { content: 'Construir', status: 'pending' },
    { content: 'Testar', status: 'pending' },
  ],
} as never

test('acompanha cada update_plan; terminal com símbolos', async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  await $.tool.call({ tool: PLANO, advance: true } as never)

  const term = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /^✓/ }))?.text).toBe('✓ Ler')
  expect((await term.find({ type: 'Text', text: /^◐/ }))?.text).toBe('◐ Construir')
  expect((await term.find({ type: 'Text', text: /^◌/ }))?.text).toBe('◌ Testar')
  await term.unmount()

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Linha do tempo$/ }))?.text).toBe('Linha do tempo')
  expect((await ui.find({ type: 'Text', text: /^AGORA/ }))?.text).toMatch(/^AGORA · /)
  expect((await ui.find({ type: 'Text', text: /^Próximo:/ }))?.text).toBe('Próximo: Testar')
  await ui.unmount()
})

test('menu flutuante troca o modelo e guarda a escolha', async ($, on) => {
  const { store } = motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await ui.find({ key: 'menu-flutuante' })).toBe(undefined)
  await ui.press({ key: 'menu' })
  expect(await ui.find({ key: 'menu-flutuante' })).toBeDefined()

  await ui.press({ key: 'modelo-compacto' })
  expect(await ui.find({ key: 'menu-flutuante' })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /^Compacto$/ }))?.text).toBe('Compacto')
  expect(store.modelo).toBe('compacto')

  // Atalho 2: Foco no agora.
  await ui.press({ key: 'atalho-foco' })
  expect((await ui.find({ type: 'Text', text: /^A SEGUIR$/ }))?.text).toBe('A SEGUIR')
  expect(store.modelo).toBe('foco')
  await ui.unmount()
})

test('modelo salvo vale numa sessão nova; /lista troca', async ($, on) => {
  motor(on, { modelo: 'foco' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  let ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Foco no agora$/ }))?.text).toBe('Foco no agora')
  await ui.unmount()

  const r = await $.command.run({ command: 'lista', args: 'compacto' } as never)
  expect((r as { text?: string }).text).toMatch(/Compacto/)
  ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Compacto$/ }))?.text).toBe('Compacto')
  await ui.unmount()
})

const fimDoTurno = { turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'end_turn', text: '' } as never

test('turno parado com passo aberto e sem pergunta não pede resposta; wrap_up conclui', async ($, on) => {
  motor(on)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  await $.turn.complete(fimDoTurno)

  let ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^TURNO ENCERRADO/ }))?.text).toMatch(/^TURNO ENCERRADO/)
  expect((await ui.find({ type: 'Text', text: 'Sem pergunta pendente' }))?.text).toBe('Sem pergunta pendente')
  expect(await ui.find({ type: 'Text', text: 'Aguardando sua resposta' })).toBeUndefined()
  await ui.unmount()

  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'ok' } as never)
  ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /3 de 3 concluídos/ }))?.text).toBe('3 de 3 concluídos')
  await ui.unmount()
})

test('Monitor ou Bash em segundo plano: a espera é da máquina, não do usuário', async ($, on) => {
  motor(on)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  await $.tool.call({ tool: 'Bash', command: 'make', run_in_background: true } as never)
  // um update_plan depois do comando em segundo plano não apaga o sinal
  await $.tool.call(lista3)
  await $.turn.complete(fimDoTurno)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^EM SEGUNDO PLANO/ }))?.text).toMatch(/^EM SEGUNDO PLANO/)
  expect((await ui.find({ type: 'Text', text: /segundo plano; não é preciso responder/ }))?.text).toMatch(/não é preciso responder/)
  expect(await ui.find({ type: 'Text', text: 'Aguardando sua resposta' })).toBeUndefined()
  await ui.unmount()
})

test('Bash comum não conta como segundo plano', async ($, on) => {
  motor(on)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete(fimDoTurno)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: 'Sem pergunta pendente' }))?.text).toBe('Sem pergunta pendente')
  await ui.unmount()
})

test('AskUserQuestion: aí sim aguarda a resposta do usuário', async ($, on) => {
  motor(on)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await $.turn.complete(fimDoTurno)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^PARADA/ }))?.text).toMatch(/^PARADA/)
  expect((await ui.find({ type: 'Text', text: 'Aguardando sua resposta' }))?.text).toBe('Aguardando sua resposta')
  await ui.unmount()
})

test('um turno novo zera os sinais de espera', async ($, on) => {
  motor(on)
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.start', () => ({ turnId: 't2' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(lista3)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await $.turn.complete(fimDoTurno)
  await $.turn.start({ turnId: 't2' } as never)
  await $.turn.complete({ ...(fimDoTurno as object), turnId: 't2' } as never)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Aguardando sua resposta' })).toBeUndefined()
  await ui.unmount()
})

test('sem update_plan o painel não abre (terminal, VS Code)', async ($, on) => {
  const { abertos } = motor(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(abertos).toEqual([])
  await $.tool.call(lista3)
  expect(abertos).toEqual(['lista-fixa'])
})

test('estado da 0.1.x é recusado sem erro', async ($, on) => {
  motor(on)
  on('state.get', () => ({ value: { value: { passos: [{ content: 'velho' }] }, version: 1 } }))
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('A lista aparece aqui quando o Claude começar uma tarefa.')
  await ui.unmount()
})
