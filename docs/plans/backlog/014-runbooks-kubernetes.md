# Runbooks e documentação de operação em Kubernetes

**ID:** 014 · **Épico:** Kubernetes · **Prioridade:** P1 · **Estimativa:** P

## Contexto

`docs/RUNBOOK.md` cobre a Fase 1: onde as coisas rodam (§1), variáveis (§2), acesso da equipe da
plataforma (§5), reinício e verificação da VM (§6), crescimento de disco (§7), restauração de mídia
(§8) e banco (§9), rotação de `MEDIA_URL_SECRET` (§10), reset de telefone (§11), aparelho que parou
de sincronizar (§12), logs (§13) e jobs de ciclo de vida (§14). `docs/RELEASING.md` cobre releases.
Ambos citam `ssh`, `docker compose` e `/srv/agrorende`.

## Objetivo

Atualizar a documentação operacional para o cluster, de forma que uma pessoa de plantão resolva os
incidentes comuns sem conhecer a história do projeto.

## Escopo

### Incluído

- Equivalentes em Kubernetes para §1, §6, §7, §8, §9, §10 e §13 (ex.: `kubectl rollout restart`,
  `kubectl logs -l app=web`, escalar réplicas, abrir shell de diagnóstico, reexecutar o job de
  migração).
- Novos runbooks: certificado não renovado, nó indisponível, Redis cheio, HPA no máximo, falha de
  sync do GitOps, reversão de versão.
- Acesso: como obter credenciais de leitura e de operação no cluster.
- Mover o conteúdo da Fase 1 para um anexo histórico após o cutover.

### Fora do escopo

- Processo de incidente e plantão (tarefa 039).

## Critérios de aceite

- [ ] Cada runbook tem sintomas, diagnóstico, ação e verificação.
- [ ] Uma pessoa que não participou da migração executa três runbooks em staging seguindo só o texto.
- [ ] Change requests abertos para `docs/RUNBOOK.md` e `docs/RELEASING.md` (arquivos com dono).

## Notas técnicas

- Manter nomes exatos: `APP_HOST`, `WS_HOST`, `SITE_HOST`, `/api/v1/health`, `/health`, imagens
  `agrorende-*`.

## Riscos

- Documentação desatualizada após mudanças no chart; incluir revisão no checklist de PR do chart.

## Dependências

- 013.
