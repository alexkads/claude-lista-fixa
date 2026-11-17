import { expect, test } from 'claude-code/testing'

const PAINEL = {
  plugin: 'lista-fixa',
  component: 'Pane',
  requestId: 'lista-fixa',
  props: {
    title: 'Atividades',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('acompanha cada update_plan e guarda a última lista', async ($, on) => {
  on('command.register', () => ({ value: { command: 'lista' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [
      { content: 'Ler', status: 'in_progress' },
      { content: 'Construir', status: 'pending' },
      { content: 'Testar', status: 'pending' },
    ],
    scope: 'first_task',
  } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true } as never)

  const icones = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Svg' })).map(x => x.props.alt)

  // Terminal: símbolos de texto.
  const term = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /^✓/ }))?.text).toBe('✓ Ler')
  expect((await term.find({ type: 'Text', text: /^◐/ }))?.text).toBe('◐ Construir')
  expect((await term.find({ type: 'Text', text: /^◌/ }))?.text).toBe('◌ Testar')
  await term.unmount()

  // Desktop: anel de progresso e ícones animados.
  let ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await icones(ui)).toEqual(['1 de 3 passos feitos', 'Feito', 'Em andamento', 'Pendente'])
  expect((await ui.find({ type: 'Text', text: 'Construir' }))?.text).toBe('Construir')
  expect((await ui.find({ type: 'Text', text: /^Em andamento$/ }))?.text).toBe('Em andamento')
  await ui.unmount()

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', done: [2], start: 3 } as never)
  ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await icones(ui)).toEqual(['2 de 3 passos feitos', 'Feito', 'Feito', 'Em andamento'])
  await ui.unmount()

  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'ok' } as never)
  ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await icones(ui)).toEqual(['3 de 3 passos feitos', 'Feito', 'Feito', 'Feito'])
  expect((await ui.find({ type: 'Text', text: /^Concluída$/ }))?.text).toBe('Concluída')
  await ui.unmount()
})

test('sem update_plan o painel não abre (terminal, VS Code)', async ($, on) => {
  const abertos: string[] = []
  on('command.register', () => ({ value: { command: 'lista' } }))
  on('ui.open', (_, e) => {
    abertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(abertos).toEqual([])

  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [{ content: 'Um', status: 'in_progress' }],
  } as never)
  expect(abertos).toEqual(['lista-fixa'])
})
