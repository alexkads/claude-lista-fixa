# lista-fixa

Mod do Claude Code que mantém a lista de atividades do turno num painel fixo à direita da conversa, no app desktop do Claude. É a mesma lista que a ferramenta `update_plan` desenha embaixo da última mensagem, mas ela não encolhe quando o turno termina: o painel sempre mostra a última lista enviada.

- Anel de progresso animado no topo; passo atual em destaque com um anel girando
- ✓ feito · ◐ em andamento · ◌ pendente (ícones em SVG animado no app; símbolos de texto no terminal)
- Cabeçalho com "3 de 5 · atualizada às 14:32" (vira "concluída" depois do `wrap_up`)
- Abre no primeiro `update_plan` e reabre a cada novo; `/lista` também abre o painel
- Minimizado, mostra só o placar e o passo atual

Como funciona: um hook `tool.call` em `mcp__ccd_turn__update_plan` reproduz `items`, `advance`, `done` e `start` no estado da sessão, e o `mcp__ccd_turn__wrap_up` dá baixa em todos os passos.

## Modelos do painel

O botão **⋯** no topo do painel abre um menu flutuante para escolher o modelo. A escolha fica guardada e vale para as próximas sessões.

| Modelo | Para quê |
| --- | --- |
| **Linha do tempo** (padrão) | Passos ligados por uma linha, o atual num cartão "Agora · há N min"; feitos recolhem quando passam de 3; rodapé com o próximo passo. |
| **Foco no agora** | Cartão grande com o anel de progresso e o passo atual; "A seguir" com os pendentes; feitos recolhíveis. |
| **Compacto** | Barra com um segmento por passo e lista numerada, densa, para planos longos. |

Atalhos com o painel focado: `1`, `2`, `3` trocam o modelo e `m` abre o menu. Também dá para trocar com `/lista linha`, `/lista foco` ou `/lista compacto`.

Em todos os modelos: quando o turno acabou com um passo em andamento, o painel diz **quem espera**: **Parada há N min / Aguardando sua resposta** só depois de um `AskUserQuestion`; **Em segundo plano** quando o turno abriu um `Monitor` ou um `Bash` com `run_in_background` (não é preciso responder); **Turno encerrado / Sem pergunta pendente** nos demais casos, **Concluída** com o tempo total depois do `wrap_up`, e uma versão curta quando o painel está minimizado.

O painel não recebe clique com o botão direito do mouse: o app desktop não entrega esse evento a um mod. Por isso o menu abre no **⋯**.

## Onde funciona

No app desktop do Claude, aba Code: é lá que existe a ferramenta `update_plan`. No terminal, no VS Code e no celular o mod fica quieto e o painel não abre.

## O que o mod faz e não faz

- Lê apenas as entradas das ferramentas `update_plan` e `wrap_up` da própria sessão.
- Guarda a lista só no estado da sessão do Claude Code (`$.state`); nada vai para disco fora disso.
- Não acessa rede, arquivos, processos nem variáveis de ambiente; não envia dados a lugar nenhum.
- Não muda permissões nem configurações do Claude.

## In English

Keeps the turn's task list (the one the `update_plan` tool draws under the last message in the Claude desktop app) pinned in a pane on the right of the chat, so it stays visible between replies and after the turn ends. Done, in-progress and pending steps get ✓, ◐ and ◌. It only reads the `update_plan` and `wrap_up` tool inputs of its own session, keeps the list in session state, and makes no network, file or process calls. Outside the desktop app's Code tab there is no `update_plan`, so the pane never opens.

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
