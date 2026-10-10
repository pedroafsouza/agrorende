# Fonte do wiki

Os arquivos desta pasta são a fonte do wiki do GitHub em
<https://github.com/pedroafsouza/agrorende/wiki>. Edite aqui, revise no pull request e depois
publique. Este `README.md` não é publicado.

## Formato

- Pasta plana; o nome do arquivo é o nome da página (`Primeiros-Passos.md` vira a página
  "Primeiros Passos").
- `Home.md` é a página inicial; `_Sidebar.md` e `_Footer.md` aparecem em todas as páginas.
- Links entre páginas usam o nome sem extensão: `[Primeiros passos](Primeiros-Passos)`.
- Links para código usam URLs absolutas `https://github.com/pedroafsouza/agrorende/blob/main/<caminho>`,
  porque o wiki é um repositório separado.

## Como publicar

1. Uma única vez: ative o wiki em **Settings → Features → Wikis** e crie a primeira página pela
   interface do GitHub. Sem isso o repositório `.wiki.git` não existe.
2. Clone o wiki fora deste repositório e copie as páginas:

   ```bash
   git clone https://github.com/pedroafsouza/agrorende.wiki.git
   cd agrorende.wiki
   rsync -av --exclude README.md ../agrorende/docs/wiki/ ./
   git add -A
   git commit -m "docs(wiki): sincroniza com docs/wiki"
   git push
   ```

   Ajuste o caminho `../agrorende` para onde está o seu clone.
3. Confira a página inicial e a barra lateral no navegador.

Páginas removidas aqui também devem ser apagadas no clone do wiki (o `rsync` acima não remove
arquivos; use `--delete` com cuidado, porque ele apagaria páginas criadas só pela interface).
