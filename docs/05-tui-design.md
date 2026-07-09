# 05 - Design da TUI (Terminal User Interface)

## Visão Geral

O Terminuz utiliza uma interface TUI (Terminal User Interface) exclusiva, sem GUI ou web. A interface é construída com **Ink**, um framework React para terminais.

## Layout Principal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🧠 Terminuz v1.0.0                                  Provider: Claude  │ ⏻ │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │                              │  │  🔄 Status: Executando...            │ │
│  │  💬 Chat                     │  │  ──────────────────────────────────  │ │
│  │                              │  │  📋 Atividades Recentes:             │ │
│  │  > Adicione autenticação JWT │  │  • ✅ Lendo: src/app.js              │ │
│  │                              │  │  • ✏️ Editando: src/auth.js          │ │
│  │  Claro! Vou analisar o       │  │  • 🔄 Executando: npm test           │ │
│  │  projeto e implementar...    │  │                                      │ │
│  │                              │  │  ──────────────────────────────────  │ │
│  │  [████████░░] 80%            │  │  📊 Estatísticas:                    │ │
│  │                              │  │  • Tokens: 2.4k / 128k              │ │
│  │  ✅ Implementação concluída! │  │  • Tools: 12 chamadas               │ │
│  │                              │  │  • Tempo: 45s                       │ │
│  │                              │  │                                      │ │
│  │                              │  │  ──────────────────────────────────  │ │
│  │                              │  │  ⚠️ Pendentes (1):                  │ │
│  │                              │  │  [!] git push origin main           │ │
│  │                              │  │      [A]provar  [N]egar             │ │
│  │                              │  │                                      │ │
│  └──────────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  > _                                                                        │
│  [Ctrl+H: Ajuda]  [Ctrl+N: Nova Sessão]  [Ctrl+Q: Sair]                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Componentes Principais

### 1. Header

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🧠 Terminuz v1.0.0                                  Provider: Claude  │ ⏻ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Informações:**

- Logo + Versão
- Provider LLM ativo
- Botão de saída

### 2. Painel de Chat (Esquerda)

**Largura**: 60% da tela  
**Conteúdo**:

- Histórico de mensagens
- Input de comandos
- Progress indicators
- Streaming de respostas

**Componentes:**

```typescript
<ChatPanel>
  <MessageList>
    <UserMessage text="Adicione autenticação JWT" />
    <AssistantMessage>
      <Text>Claro! Vou analisar...</Text>
      <ProgressBar value={80} />
    </AssistantMessage>
  </MessageList>
  <InputBox
    placeholder="Digite sua mensagem..."
    onSubmit={handleSubmit}
  />
</ChatPanel>
```

### 3. Painel de Status (Direita)

**Largura**: 40% da tela  
**Seções:**

#### 3.1 Status Atual

```
🔄 Status: Executando...
├─ Agente: planner
├─ Tarefa: Analisando estrutura
└─ Progresso: 75%
```

#### 3.2 Atividades Recentes

```
📋 Atividades Recentes
├─ ✅ Lendo: src/app.js (2s atrás)
├─ ✏️ Editando: src/auth.js (5s atrás)
├─ 🔄 Executando: npm test (agora)
└─ ⏳ Pendente: git commit
```

#### 3.3 Estatísticas

```
📊 Estatísticas
├─ Tokens: 2.4k / 128k
├─ Tools: 12 chamadas
├─ Tempo: 45s
└─ Sessão: #42
```

#### 3.4 Aprovações Pendentes

```
⚠️ Pendentes (1)
├─ [!] git push origin main
│   [A]provar  [D]enegar  [V]er diff
└─
```

### 4. Footer

```
├─────────────────────────────────────────────────────────────────────────────┤
│  > _                                                                        │
│  [Ctrl+H: Ajuda]  [Ctrl+N: Nova Sessão]  [Ctrl+Q: Sair]                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Elementos:**

- Input com cursor
- Atalhos de teclado

## Telas/Modos

### 1. Tela Home

```
┌─────────────────────────────────────────────────────────────┐
│  🧠 Terminuz                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     ██████╗ ███████╗███████╗██████╗  ██████╗ ██████╗ ██████╗│
│     ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗│
│     ██║  ██║█████╗  █████╗  ██████╔╝██║     ██████╔╝██║  ██║│
│     ██║  ██║██╔══╝  ██╔══╝  ██╔═══╝ ██║     ██╔══██╗██║  ██║│
│     ██████╔╝███████╗███████╗██║     ╚██████╗██║  ██║██████╔╝│
│     ╚═════╝ ╚══════╝╚══════╝╚═╝      ╚═════╝╚═╝  ╚═╝╚═════╝ │
│                                                             │
│  Assistente de código AI profissional                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  > Como posso ajudar?                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Sessões Recentes:                                          │
│  • Adicionar autenticação JWT (há 2 horas)                 │
│  • Refatorar módulo users (ontem)                          │
│  • Fix bug #42 (2 dias atrás)                              │
│                                                             │
│  [N] Nova Sessão  [↑↓] Navegar  [Enter] Selecionar         │
└─────────────────────────────────────────────────────────────┘
```

### 2. Tela de Sessão (Principal)

Layout multi-painel descrito acima.

### 3. Tela de Aprovação (Modal)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚠️ APROVAÇÃO NECESSÁRIA                            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                      │   │
│  │  A seguinte operação requer sua aprovação:          │   │
│  │                                                      │   │
│  │  📝 Comando: git push origin main                   │   │
│  │  📁 Diretório: /home/user/project                   │   │
│  │  ⚡ Nível: Git Remote (3)                           │   │
│  │                                                      │   │
│  │  [Ver Diff] [Ver Detalhes]                          │   │
│  │                                                      │   │
│  │  Você deseja permitir esta operação?                │   │
│  │                                                      │   │
│  │     [A] Aprovar    [D] Negar    [T] Sempre perguntar│   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Tela de Configuração

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Configurações                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Providers:                                                 │
│  ├─ [✓] OpenRouter     [Configurar]                       │
│  ├─ [✓] Claude         [Configurar]                       │
│  ├─ [✗] GPT-4          [Configurar]                       │
│  └─ [✓] DeepSeek       [Configurar]                       │
│                                                             │
│  Permissões:                                                │
│  ├─ Editar Arquivos:  [Permitir ▼]                        │
│  ├─ Executar Shell:   [Perguntar ▼]                       │
│  ├─ Git Commit:       [Permitir ▼]                        │
│  └─ Git Push:         [Perguntar ▼]                       │
│                                                             │
│  Tema: [Dark ▼]  │  Fonte: [Monospace ▼]                  │
│                                                             │
│  [Salvar]  [Cancelar]  [Restaurar Padrões]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5. Tela de Ajuda

```
┌─────────────────────────────────────────────────────────────┐
│  ❓ Ajuda - Atalhos de Teclado                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Navegação:                                                 │
│  Tab / Shift+Tab    Alternar entre painéis                │
│  ↑ / ↓              Navegar no histórico                  │
│  Ctrl+C             Cancelar operação atual               │
│                                                             │
│  Sessões:                                                   │
│  Ctrl+N             Nova sessão                           │
│  Ctrl+O             Abrir sessão existente                │
│  Ctrl+W             Fechar sessão atual                   │
│                                                             │
│  Chat:                                                      │
│  Enter              Enviar mensagem                       │
│  Shift+Enter        Nova linha                            │
│  Ctrl+L             Limpar chat                           │
│                                                             │
│  Aprovações:                                                │
│  A                  Aprovar ação                          │
│  D                  Negar ação                            │
│  V                  Ver detalhes/diff                     │
│                                                             │
│  Geral:                                                     │
│  Ctrl+H             Mostrar esta ajuda                    │
│  Ctrl+Q             Sair do Terminuz                      │
│  ?                  Mostrar atalhos do contexto atual     │
│                                                             │
│                    [Fechar]  [Ver Online]                  │
└─────────────────────────────────────────────────────────────┘
```

## Keybindings

### Navegação Global

```typescript
const globalKeybindings = {
  "Ctrl+c": "quit",
  "Ctrl+q": "quit",
  "Ctrl+h": "help",
  "Ctrl+n": "new_session",
  "Ctrl+o": "open_session",
  "Ctrl+w": "close_session",
  Tab: "next_panel",
  "Shift+Tab": "prev_panel",
};
```

### Chat

```typescript
const chatKeybindings = {
  Enter: "send_message",
  "Shift+Enter": "new_line",
  "Ctrl+l": "clear_chat",
  "Ctrl+r": "refresh_index",
  "↑": "prev_message",
  "↓": "next_message",
};
```

### Aprovações

```typescript
const approvalKeybindings = {
  a: "approve",
  d: "deny",
  v: "view_details",
  t: "toggle_always_ask",
};
```

### Vim-Style (Opcional)

```typescript
const vimKeybindings = {
  j: "down",
  k: "up",
  h: "left",
  l: "right",
  gg: "top",
  G: "bottom",
};
```

## Sistema de Temas

### Tema Padrão (Dark)

```typescript
const darkTheme = {
  colors: {
    // Base
    background: "#0f172a",
    foreground: "#f8fafc",
    muted: "#64748b",
    border: "#334155",

    // Semantic
    primary: "#3b82f6",
    secondary: "#8b5cf6",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#06b6d4",

    // Diff
    diffAdded: "#22c55e",
    diffRemoved: "#ef4444",
    diffContext: "#64748b",

    // Syntax
    comment: "#64748b",
    keyword: "#c084fc",
    string: "#86efac",
    function: "#60a5fa",
    number: "#fbbf24",
  },
};
```

### Tema Light

```typescript
const lightTheme = {
  colors: {
    background: "#ffffff",
    foreground: "#0f172a",
    // ... etc
  },
};
```

## Componentes Ink

```typescript
// Estrutura de componentes
components/
├── App.tsx                 # Componente raiz
├── screens/
│   ├── HomeScreen.tsx
│   ├── SessionScreen.tsx
│   ├── ConfigScreen.tsx
│   └── HelpScreen.tsx
├── panels/
│   ├── ChatPanel.tsx
│   ├── StatusPanel.tsx
│   ├── ActivityPanel.tsx
│   └── ApprovalPanel.tsx
├── modals/
│   ├── ApprovalModal.tsx
│   ├── ConfirmModal.tsx
│   └── InputModal.tsx
├── common/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── ProgressBar.tsx
│   ├── Message.tsx
│   └── Input.tsx
├── hooks/
│   ├── useKeybindings.ts
│   ├── useSession.ts
│   └── useTheme.ts
└── theme/
    ├── ThemeProvider.tsx
    ├── themes.ts
    └── types.ts
```

## Responsividade

### Breakpoints

```typescript
const breakpoints = {
  small: 80, // < 80 cols: Layout compacto
  medium: 120, // < 120 cols: Layout padrão
  large: 160, // >= 160 cols: Layout expandido
};
```

### Adaptações

- **Small**: Painéis sobrepostos (Tab para alternar)
- **Medium**: Layout padrão 60/40
- **Large**: Layout expandido com mais informações

## Animações

### Loading States

```
Spinner: ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏ (braille)
Progress: [░░░░░░░░░░] → [██████████]
Typing: ● ● ● (pulsing dots)
```

### Transições

- **Fade**: 100ms entre telas
- **Slide**: 200ms para modais
- **Typing**: Real-time streaming

---

**Anterior**: [04 - Fases de Implementação](./04-implementation-phases.md)  
**Próximo**: [06 - Modelo de Segurança](./06-security-model.md)
