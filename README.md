# lista-fixa

Mod do Claude Code que mantém a lista de atividades do turno num painel fixo à direita da conversa, no app desktop do Claude. É a mesma lista que a ferramenta `update_plan` desenha embaixo da última mensagem, mas ela não encolhe quando o turno termina: o painel sempre mostra a última lista enviada.

## Por que este mod existe

**O problema.** No app desktop do Claude, a lista de atividades que o Claude mantém durante uma tarefa (a ferramenta `update_plan`) aparece embaixo da última mensagem do chat. Quando o turno termina, ela encolhe; a cada nova mensagem, desce. O app não tem nenhuma opção para deixá-la fixa ou sempre aberta: não dá para controlar isso.

**O que não resolve.** Os painéis Plano e Tarefas do app não fazem esse papel: o painel Tarefas mostra só comandos que rodam em segundo plano, não os passos da tarefa.

**O efeito.** Quem acompanha o trabalho pela lista perde o fio entre uma resposta e outra: o que já foi feito, o que está em andamento, onde o Claude parou.

**O objetivo.** Ter a lista sempre à vista, num painel fixo à direita da conversa, com a última lista enviada, inclusive com o turno parado.

**Os princípios.** O mod só lê o que o Claude já manda para o app; nada sai da sessão; ele não muda como o Claude trabalha nem o que a lista contém.

**Fora do escopo.** O mod não cria a lista (quem escreve é o Claude) e não substitui a lista do chat, que continua lá.

## O que aparece no painel

- Anel de progresso animado no topo; passo atual em destaque com um anel girando
- ✓ feito · ◐ em andamento · ◌ pendente (ícones em SVG animado no app; símbolos de texto no terminal)
- Cabeçalho com "3 de 5 · atualizada às 14:32" (vira "concluída" depois do `wrap_up`)
- Abre no primeiro `update_plan` e reabre a cada novo; `/lista` também abre o painel
- Minimizado, mostra só o placar e o passo atual

Como funciona: um hook `tool.call` em `mcp__ccd_turn__update_plan` reproduz `items`, `advance`, `done` e `start` no estado da sessão, e o `mcp__ccd_turn__wrap_up` dá baixa em todos os passos.

## Onde funciona

No app desktop do Claude, aba Code: é lá que existe a ferramenta `update_plan`. No terminal, no VS Code e no celular o mod fica quieto e o painel não abre.

## O que o mod faz e não faz

- Lê apenas as entradas das ferramentas `update_plan` e `wrap_up` da própria sessão.
- Guarda a lista só no estado da sessão do Claude Code (`$.state`); nada vai para disco fora disso.
- Não acessa rede, arquivos, processos nem variáveis de ambiente; não envia dados a lugar nenhum.
- Não muda permissões nem configurações do Claude.

## In English

Why: in the Claude desktop app, the task list Claude keeps with the `update_plan` tool is drawn under the last chat message, shrinks when the turn ends and moves down with every new message, and the app has no setting to keep it pinned. This mod keeps the turn's task list pinned in a pane on the right of the chat, so it stays visible between replies and after the turn ends. Done, in-progress and pending steps get ✓, ◐ and ◌. It only reads the `update_plan` and `wrap_up` tool inputs of its own session, keeps the list in session state, and makes no network, file or process calls. Outside the desktop app's Code tab there is no `update_plan`, so the pane never opens.

## Instalar

No prompt de uma sessão de terminal:

```
/plugin install lista-fixa --marketplace alexkads/claude-lista-fixa
```

Responda `y` para adicionar o marketplace e escolha o escopo (usuário, com Enter).

Do shell:

```bash
claude plugin install lista-fixa --marketplace alexkads/claude-lista-fixa
```

No app desktop, onde `/plugin` não roda: clique em + ao lado da caixa do prompt, depois Plugins, Add marketplace com `alexkads/claude-lista-fixa`, e então Add plugin.

Instalado no escopo de usuário a partir do terminal, o mod também carrega nas sessões locais da aba Code do app desktop.

## Testar

```bash
claude plugin validate .
claude plugin test .
```
