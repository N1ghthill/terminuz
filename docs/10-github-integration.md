# 10 - Integração GitHub

## Visão Geral

Terminuz oferece integração completa com GitHub, permitindo que o agente interaja com issues, pull requests e código diretamente.

## Autenticação

### Métodos Suportados

1. **Personal Access Token (PAT)** via `GITHUB_TOKEN` ou `github.token`.
2. **OAuth Device Flow** via `terminuz github login`.

O device flow usa endpoints reais do GitHub e nao embute `client_id`. Configure um OAuth app com Device Flow habilitado e informe o client ID por `--client-id`, `GITHUB_OAUTH_CLIENT_ID` ou `github.oauthClientId`.

### Configuração

```json
{
  "github": {
    "token": "ghp_xxxxxxxxxxxx",
    "oauthClientId": "github-oauth-app-client-id",
    "oauthScopes": ["repo"],
    "enterpriseUrl": "https://github.company.com"
  }
}
```

```bash
terminuz github login --client-id "github-oauth-app-client-id" --scope repo
terminuz github whoami
```

`github whoami` and `doctor` validate the configured token with the real `GET /user` REST endpoint before reporting success.

## GitHub Client

```typescript
import { Octokit } from "@octokit/rest";

class GitHubIntegration {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(auth: GitHubAuth, repoUrl: string) {
    this.octokit = new Octokit({
      auth: auth.token,
      baseUrl: auth.enterpriseUrl,
    });

    const parsed = this.parseRepoUrl(repoUrl);
    this.owner = parsed.owner;
    this.repo = parsed.repo;
  }

  // Issues
  async listIssues(options?: IssueListOptions): Promise<Issue[]> {
    const response = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: options?.state || "open",
      labels: options?.labels,
      assignee: options?.assignee,
    });

    return response.data.map(this.mapIssue);
  }

  async getIssue(number: number): Promise<Issue> {
    const response = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
    });

    return this.mapIssue(response.data);
  }

  async createIssue(title: string, body: string, options?: IssueOptions): Promise<Issue> {
    const response = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels: options?.labels,
      assignees: options?.assignees,
    });

    return this.mapIssue(response.data);
  }

  async closeIssue(number: number): Promise<void> {
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      state: "closed",
    });
  }

  // Pull Requests
  async listPRs(options?: PRListOptions): Promise<PullRequest[]> {
    const response = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: options?.state || "open",
    });

    return response.data.map(this.mapPR);
  }

  async createPR(
    title: string,
    body: string,
    head: string,
    base: string = "main",
  ): Promise<PullRequest> {
    const response = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head,
      base,
    });

    return this.mapPR(response.data);
  }

  async mergePR(number: number, method: "merge" | "squash" | "rebase" = "squash"): Promise<void> {
    await this.octokit.pulls.merge({
      owner: this.owner,
      repo: this.repo,
      pull_number: number,
      merge_method: method,
    });
  }

  // Branches
  async listBranches(): Promise<Branch[]> {
    const response = await this.octokit.repos.listBranches({
      owner: this.owner,
      repo: this.repo,
    });

    return response.data.map((b) => ({
      name: b.name,
      protected: b.protected,
    }));
  }

  async createBranch(name: string, from: string = "main"): Promise<Branch> {
    // Get SHA of base branch
    const baseRef = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${from}`,
    });

    // Create new branch
    await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${name}`,
      sha: baseRef.data.object.sha,
    });

    return { name, protected: false };
  }

  // Code
  async getFileContent(path: string, ref?: string): Promise<string> {
    const response = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref,
    });

    if ("content" in response.data) {
      return Buffer.from(response.data.content, "base64").toString();
    }

    throw new Error("Path is a directory");
  }

  async createOrUpdateFile(
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string,
  ): Promise<void> {
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
      sha, // Required if updating existing file
    });
  }

  // Comments
  async addIssueComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async addPRComment(prNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      body,
    });
  }
}
```

## Workflow: Resolver Issue

```typescript
class IssueSolver {
  constructor(
    private github: GitHubIntegration,
    private git: GitIntegration,
    private agent: Agent,
  ) {}

  async solve(issueNumber: number): Promise<SolutionResult> {
    // 1. Busca detalhes da issue
    console.log(`🔍 Analisando issue #${issueNumber}...`);
    const issue = await this.github.getIssue(issueNumber);

    // 2. Cria branch
    const branchName = `terminuz/fix-issue-${issueNumber}`;
    console.log(`🌿 Criando branch: ${branchName}`);
    await this.github.createBranch(branchName);
    await this.git.checkout(branchName);

    // 3. Analisa e implementa solução
    console.log("🤖 Implementando solução...");
    const prompt = `
      Resolva a seguinte issue:
      
      Título: ${issue.title}
      Descrição: ${issue.body}
      
      Etapas:
      1. Analise o código relevante
      2. Implemente a correção
      3. Adicione/atualize testes
      4. Verifique se tudo funciona
    `;

    await this.agent.run(prompt);

    // 4. Commit
    console.log("💾 Criando commit...");
    await this.git.add(".");
    await this.git.commit(`fix: resolve issue #${issueNumber}

${issue.title}

Closes #${issueNumber}`);

    // 5. Push
    console.log("📤 Enviando para GitHub...");
    await this.git.push("origin", branchName);

    // 6. Cria PR
    console.log("📋 Criando Pull Request...");
    const pr = await this.github.createPR(
      `Fix: ${issue.title}`,
      `## Descrição
      
Esta PR resolve a issue #${issueNumber}.

### Mudanças
${this.generateSummary()}

### Testes
- [ ] Testes unitários adicionados
- [ ] Testes de integração passando

Closes #${issueNumber}`,
      branchName,
      "main",
    );

    // 7. Adiciona comentário na issue
    await this.github.addIssueComment(
      issueNumber,
      `🤖 Terminuz criou uma PR para resolver esta issue: ${pr.url}`,
    );

    return {
      success: true,
      branch: branchName,
      prNumber: pr.number,
      prUrl: pr.url,
    };
  }

  private generateSummary(): string {
    // Gera resumo das mudanças
    const status = this.git.status();
    return status.files.map((f) => `- ${f.status}: ${f.path}`).join("\n");
  }
}
```

## Tool: github

```typescript
const githubTool = tool({
  name: "github",
  description: "Execute GitHub operations",
  parameters: z.object({
    operation: z.enum([
      "list_issues",
      "get_issue",
      "create_issue",
      "close_issue",
      "list_prs",
      "create_pr",
      "merge_pr",
      "list_branches",
      "create_branch",
      "get_file",
      "create_file",
      "update_file",
      "add_comment",
    ]),
    args: z.record(z.any()).optional(),
  }),
  execute: async (params, context) => {
    const github = await getGitHubIntegration(context.worktree);

    switch (params.operation) {
      case "list_issues":
        return await github.listIssues(params.args);

      case "get_issue":
        return await github.getIssue(params.args.number);

      case "create_issue":
        return await github.createIssue(params.args.title, params.args.body, params.args);

      case "list_prs":
        return await github.listPRs(params.args);

      case "create_pr":
        // Sempre requer aprovação
        const allowed = await context.requestPermission(`Create PR: ${params.args.title}`);
        if (!allowed) throw new PermissionDeniedError();

        return await github.createPR(
          params.args.title,
          params.args.body,
          params.args.head,
          params.args.base,
        );

      case "merge_pr":
        const mergeAllowed = await context.requestPermission(`Merge PR #${params.args.number}`);
        if (!mergeAllowed) throw new PermissionDeniedError();

        await github.mergePR(params.args.number, params.args.method);
        return "PR merged successfully";

      // ... outros casos
    }
  },
});
```

## Configuração de Permissões

```json
{
  "permissions": {
    "github": {
      "read": "allow",
      "create_branch": "allow",
      "commit": "allow",
      "push": "ask",
      "create_pr": "ask",
      "merge_pr": "ask"
    }
  }
}
```

## Exemplo de Uso

```typescript
// CLI
$ terminuz github issue solve 42

// Ou via chat
> Resolva a issue #42
Analisando issue #42: "Bug no login"...
Criando branch terminuz/fix-issue-42...
Implementando correção...
Criando commit...
Enviando para GitHub...
Criando PR #123
✅ Issue #42 resolvida! PR: https://github.com/user/repo/pull/123
```

---

**Anterior**: [09 - Loop do Agente](./09-agent-loop.md)  
**Próximo**: [11 - Estratégia de Busca](./11-search-strategy.md)
