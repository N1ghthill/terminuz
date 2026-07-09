# Terminuz Launch Announcement

> **Status:** GA publicado em 2026-07-08. Use este texto como fonte para
> release notes, npm, blog e redes.

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
| 2026-07-09 | terminuz@2.0.0 promovido para stable |
| 2027-01-08 | Prazo final para deepcode-ai (sujeito a deprecação) |

## Call to action

```bash
npm install -g terminuz
terminuz init
terminuz
```

## Canais

- [ ] GitHub Release notes
- [x] npm package page
- [x] README do repositório
- [ ] Post em blog/dev.to
- [ ] Social
- [ ] Issue/discussion de migração, se o repositório usar GitHub Discussions

## Checklist de evidência

- [x] Busca jurídica concluída (go/no-go: GO)
- [x] Revisão deste rascunho
- [x] Aprovação do mantenedor
- [x] `terminuz@2.0.0` publicado no npm
- [x] `deepcode-ai@1.3.0` publicado como wrapper
- [x] `terminuz@2.0.0` promovido para `stable`
- [x] GitHub Release `terminuz-v2.0.0` criada
- [ ] Evidência jurídica externa arquivada fora do repositório
- [x] Links antigos críticos verificados depois do rename do GitHub
