# Terminuz Launch Announcement - Draft

> **Status:** PRONTO PARA PUBLICAÇÃO - go/no-go jurídico aprovado (2026-07-08).

## Título sugerido

**DeepCode is now Terminuz: The Open Source AI Coding Agent**

## Resumo (1 parágrafo)

O projeto anteriormente conhecido como DeepCode foi renomeado para **Terminuz**.
Esta mudança reflete a evolução do produto para um agente de codificação
multi-provider, local e com foco em permissões. Toda a funcionalidade existente
foi preservada, e usuários do DeepCode podem migrar sem perder configurações ou
sessões.

## O que muda para usuários existentes

- Instale o novo pacote: `npm install -g terminuz`
- Use o novo comando: `terminuz` (em vez de `deepcode`)
- Suas configurações em `.deepcode/` e variáveis `DEEPCODE_*` continuam funcionando
- O pacote `deepcode-ai` permanece disponível como wrapper de transição até 2027-01-08

## O que é novo

- Nome e identidade Terminuz
- Logo e assets de marca atualizados
- Repositório: https://github.com/N1ghthill/terminuz
- Pacote npm: https://www.npmjs.com/package/terminuz

## Linha do tempo de compatibilidade

| Data | Evento |
|------|--------|
| 2026-07-08 | GA lançado (terminuz@2.0.0) |
| 2026-07-08 | deepcode-ai@1.3.0 publicado como wrapper |
| 2027-01-08 | Prazo final para deepcode-ai (sujeito a deprecação) |

## Call to action

```bash
npm install -g terminuz
terminuz init
terminuz
```

## Canais sugeridos

- [ ] GitHub Release notes
- [ ] npm package page
- [ ] README do repositório
- [ ] Post em blog/dev.to
- [ ] Social (após go/no-go jurídico)

## Checklist pré-publicação

- [x] Busca jurídica concluída (go/no-go: GO)
- [x] Revisão deste rascunho
- [x] Aprovação do mantenedor
- [x] PR #22 merged na main
