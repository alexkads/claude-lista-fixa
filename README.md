# lista-fixa

Mod do Claude Code que mantém a lista de atividades do turno num painel fixo à direita da conversa, no app desktop do Claude. É a mesma lista que a ferramenta `update_plan` desenha embaixo da última mensagem, mas ela não encolhe quando o turno termina: o painel sempre mostra a última lista enviada.

- ✓ feito · ◐ em andamento · ◌ pendente
- Cabeçalho com "3 de 5 · atualizada às 14:32" (vira "concluída" depois do `wrap_up`)
- Reabre sozinho a cada `update_plan`; `/lista` também abre o painel
- Minimizado, mostra só o placar e o passo atual

Como funciona: um hook `tool.call` em `mcp__ccd_turn__update_plan` reproduz `items`, `advance`, `done` e `start` no estado da sessão, e o `mcp__ccd_turn__wrap_up` dá baixa em todos os passos.

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
