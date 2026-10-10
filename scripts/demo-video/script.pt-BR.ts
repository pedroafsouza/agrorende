/**
 * Narration script for the AgroRende demo video (pt-BR).
 *
 * The video is a list of scenes. Each scene shows one visual and is narrated by one or more
 * sentences. Every sentence is synthesised separately, so captions are exact and each scene
 * lasts exactly as long as its narration (plus a short pause).
 *
 * Visuals:
 * - `title`: an HTML card with the brand, a heading and a Lottie animation.
 * - `clip`: a stretch of a browser recording between two marks (`<recording>:<mark>`).
 * - `phone`: like `clip`, but the recording is a phone screen shown inside a phone frame.
 * - `split`: a phone recording on the left and an office recording on the right, same marks.
 */

export type Visual =
  | { readonly kind: "title"; readonly heading: string; readonly sub?: string; readonly lottie?: string; readonly eyebrow?: string }
  | { readonly kind: "clip"; readonly source: string; readonly mark: string }
  | { readonly kind: "phone"; readonly source: string; readonly mark: string; readonly caption?: string }
  | { readonly kind: "split"; readonly phone: string; readonly office: string; readonly mark: string; readonly caption?: string };

export interface Scene {
  readonly id: string;
  readonly visual: Visual;
  readonly sentences: readonly string[];
  /** Include this scene in the ~3-minute highlights cut for the landing page. */
  readonly highlight?: boolean;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly scenes: readonly Scene[];
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "abertura",
    title: "Abertura",
    scenes: [
      {
        id: "s01-intro",
        highlight: true,
        visual: { kind: "title", eyebrow: "Demonstração", heading: "AgroRende", sub: "Máquinas, equipe de campo e cada conserto num só lugar.", lottie: "welcome" },
        sentences: [
          "Olá! Neste vídeo, você vai ver o AgroRende funcionando de ponta a ponta, com dados de demonstração.",
          "São uns dez minutos, contados do jeito que o dia acontece numa locadora de máquinas agrícolas.",
        ],
      },
      {
        id: "s02-hero",
        highlight: true,
        visual: { kind: "clip", source: "landing", mark: "hero" },
        sentences: [
          "O AgroRende cabe numa frase: o técnico relata o problema no campo, mesmo sem sinal, e o escritório vê, despacha e sabe quanto cada máquina custa.",
          "Sem planilha, sem caderno e sem ligação perdida.",
          "Funciona no celular do técnico e no computador do escritório, e os dois falam a mesma língua.",
        ],
      },
      {
        id: "s03-jobs",
        visual: { kind: "clip", source: "landing", mark: "jobs" },
        sentences: [
          "A nossa missão é simples: que nenhuma máquina fique parada por falta de informação.",
          "Para isso, o AgroRende faz três trabalhos.",
          "Registra o problema no campo, cuida da entrega e da devolução das máquinas alugadas, e mostra o custo real de cada máquina.",
          "Vamos ver cada um deles acontecendo, com uma empresa de verdade, só que com dados de demonstração.",
        ],
      },
    ],
  },
  {
    id: "nova-empresa",
    title: "Nova empresa e primeiros passos",
    scenes: [
      {
        id: "s04-card",
        visual: { kind: "title", eyebrow: "Capítulo 1", heading: "Uma empresa nova começa a usar", sub: "Cadastro em poucos minutos, sem cartão de crédito.", lottie: "flow-loop" },
        sentences: ["Vamos começar do zero, como um cliente novo."],
      },
      {
        id: "s05-signup",
        visual: { kind: "clip", source: "signup", mark: "signup" },
        sentences: [
          "A Dona Dourada tem uma locadora em Ribeirão Preto e quer experimentar.",
          "Ela entra pelo site e escolhe continuar com a conta do Google.",
          "Aqui, nesta demonstração, a tela do Google é simulada.",
          "Não precisa criar senha nova nem lembrar de mais um cadastro.",
        ],
      },
      {
        id: "s06-company",
        visual: { kind: "clip", source: "signup", mark: "company" },
        sentences: [
          "Depois, ela preenche os dados da empresa: o nome, Locadora Dourada, o telefone do escritório e a cidade.",
          "O CNPJ é opcional, e o sistema confere se o número é válido.",
          "Um clique, e a conta está criada, com trinta dias grátis.",
        ],
      },
      {
        id: "s07-guide-welcome",
        visual: { kind: "clip", source: "signup", mark: "guide1" },
        sentences: [
          "Logo na entrada, um guia de primeiros passos mostra o caminho em cinco etapas curtas.",
          "Ninguém precisa de treinamento para começar.",
          "Ela pode seguir agora ou continuar depois, e o guia espera por ela.",
        ],
      },
      {
        id: "s08-guide-machine",
        visual: { kind: "clip", source: "signup", mark: "guide2" },
        sentences: [
          "Primeiro, a primeira máquina.",
          "Basta o nome e o tipo: um trator John Deere seis mil cento e dez.",
          "Os detalhes, como número de série e horímetro, podem ficar para depois.",
          "A máquina ganha um número próprio, que vai aparecer em tudo: nos relatos, nas ordens e nos custos.",
        ],
      },
      {
        id: "s09-guide-invite",
        visual: { kind: "clip", source: "signup", mark: "guide3" },
        sentences: [
          "Em seguida, ela convida o técnico Tiago, só com o nome e o WhatsApp.",
          "O convite sai com um link e um código.",
          "O Tiago instala o aplicativo, digita o código e já está dentro, sem precisar de e-mail.",
        ],
      },
      {
        id: "s10-guide-order",
        visual: { kind: "clip", source: "signup", mark: "guide4" },
        sentences: [
          "Agora, a primeira ordem de serviço: o que precisa ser feito e em qual máquina.",
          "Uma revisão de quinhentas horas no trator que acabamos de cadastrar.",
          "A ordem já nasce ligada à máquina, então o custo dessa revisão vai direto para a ficha do trator.",
        ],
      },
      {
        id: "s11-guide-done",
        visual: { kind: "clip", source: "signup", mark: "guide5" },
        sentences: [
          "Pronto. Em poucos minutos, a empresa tem máquina, equipe e trabalho para fazer.",
          "A visão geral começa vazia, porque cada empresa só enxerga os próprios dados.",
          "Agora, vamos ver uma empresa que já usa o AgroRende há uma safra inteira.",
        ],
      },
    ],
  },
  {
    id: "tecnico-sem-sinal",
    title: "O técnico relata, mesmo sem sinal",
    scenes: [
      {
        id: "s12-card",
        visual: { kind: "title", eyebrow: "Capítulo 2", heading: "No campo, mesmo sem sinal", sub: "O relato fica salvo no celular e chega quando o sinal volta.", lottie: "report-offline" },
        sentences: ["Agora estamos no campo, com a Joana, que cuida das inspeções."],
      },
      {
        id: "s13-intro",
        visual: { kind: "phone", source: "joana", mark: "intro", caption: "Joana, inspetora" },
        sentences: [
          "No primeiro acesso, o aplicativo se apresenta em três cartões curtos.",
          "Funciona sem sinal, acompanha do relato à entrega, e o cliente assina na tela do celular.",
          "Ela pode passar por eles ou pular direto para o trabalho.",
          "As letras são grandes e os botões são largos, pensados para usar no sol, em cima da máquina.",
        ],
      },
      {
        id: "s14-report-start",
        highlight: true,
        visual: { kind: "phone", source: "joana", mark: "report1", caption: "Sem sinal no talhão" },
        sentences: [
          "A Joana está no talhão dois da Fazenda Santa Clara, e ali não tem sinal nenhum.",
          "Ela encontra o trator doze vazando óleo e toca em Relatar problema.",
          "Escolhe a máquina pelo número e tira uma foto do vazamento, direto pelo aplicativo.",
          "A foto vale mais do que qualquer explicação por telefone.",
        ],
      },
      {
        id: "s15-report-details",
        visual: { kind: "phone", source: "joana", mark: "report2", caption: "Poucos toques" },
        sentences: [
          "Depois, só toques grandes, fáceis de acertar até com luva: parte hidráulica, gravidade alta, máquina parada.",
          "Ela pede o conserto agora e escreve uma frase curta.",
          "O aplicativo marca o local do relato no mapa.",
        ],
      },
      {
        id: "s16-saved",
        highlight: true,
        visual: { kind: "phone", source: "joana", mark: "saved", caption: "Salvo no celular" },
        sentences: [
          "Ela toca em Enviar relato, mesmo sem sinal.",
          "Repare no aviso: Salvo no celular.",
          "Nada se perde. O relato, a foto e o local ficam guardados no telefone.",
          "Ela pode fechar o aplicativo, desligar a tela e seguir o dia normalmente.",
        ],
      },
      {
        id: "s17-reconnect",
        highlight: true,
        visual: { kind: "split", phone: "joana", office: "joanaOffice", mark: "reconnect", caption: "O sinal voltou" },
        sentences: [
          "Quando a Joana volta para a sede e o sinal aparece, o celular envia tudo sozinho.",
          "Na tela de Envios, ela confere que está tudo enviado.",
          "E, do outro lado, no escritório, o relato aparece na hora, com a foto e o local.",
        ],
      },
    ],
  },
  {
    id: "escritorio",
    title: "O escritório vê e despacha",
    scenes: [
      {
        id: "s18-ops",
        visual: { kind: "clip", source: "office", mark: "ops" },
        sentences: [
          "No escritório está a Marina, que organiza o trabalho da equipe.",
          "A visão geral mostra, num só lugar, as máquinas, os técnicos em serviço no mapa e o que precisa de atenção hoje.",
          "Os pontos se movem porque os técnicos estão trabalhando agora.",
          "Os números do topo mostram quantas máquinas estão paradas, quantos serviços estão abertos e quantas locações vencem hoje.",
        ],
      },
      {
        id: "s19-attention",
        visual: { kind: "clip", source: "office", mark: "attention" },
        sentences: [
          "Em Pendências, ela vê o que precisa de alguém no escritório.",
          "E, em Relatos, tudo o que chegou do campo. O relato da Joana está no topo, marcado como prioridade alta.",
          "Nada fica esquecido numa conversa de WhatsApp ou num papel em cima da mesa.",
        ],
      },
      {
        id: "s20-report",
        visual: { kind: "clip", source: "office", mark: "report" },
        sentences: [
          "Ela abre o relato e vê exatamente o que a Joana viu: a máquina, a foto, a descrição e o ponto no mapa.",
          "Não precisa ligar para ninguém para entender o problema.",
          "Ela também pode manter em observação ou dispensar, se não for nada sério.",
        ],
      },
      {
        id: "s21-dispatch",
        highlight: true,
        visual: { kind: "clip", source: "office", mark: "dispatch" },
        sentences: [
          "Com um clique em Encaminhar para reparo, o relato vira uma ordem de serviço.",
          "O sistema sugere quem pode ir, começando por quem tem menos serviços abertos.",
          "Ela escolhe o Carlos e cria a ordem. Pronto: o serviço já está no celular dele.",
        ],
      },
    ],
  },
  {
    id: "reparo",
    title: "O reparo no celular",
    scenes: [
      {
        id: "s22-card",
        visual: { kind: "title", eyebrow: "Capítulo 3", heading: "O reparo, passo a passo", sub: "Fotos, peças, checklist e assinatura, tudo no celular.", lottie: "saved-on-phone" },
        sentences: ["Agora acompanhamos o Carlos, o técnico que vai consertar o trator."],
      },
      {
        id: "s23-accept",
        visual: { kind: "phone", source: "carlos", mark: "accept", caption: "Carlos, técnico" },
        sentences: [
          "O serviço novo aparece na lista do Carlos, com a máquina, a fazenda e a prioridade.",
          "Ele abre, lê a descrição da Joana e aceita o serviço.",
          "A Marina vê na mesma hora que o serviço foi aceito.",
        ],
      },
      {
        id: "s24-route",
        visual: { kind: "phone", source: "carlos", mark: "route", caption: "A caminho" },
        sentences: [
          "Ele toca em A caminho, e o escritório passa a acompanhar o trajeto.",
          "Quando chega perto da fazenda, o próprio aplicativo pergunta se ele chegou.",
          "Um toque em Cheguei, e ele começa o serviço.",
        ],
      },
      {
        id: "s25-parts",
        highlight: true,
        visual: { kind: "phone", source: "carlos", mark: "parts", caption: "Peça usada" },
        sentences: [
          "O Carlos troca a mangueira hidráulica e anota a peça que usou.",
          "Uma mangueira, cento e oitenta e cinco reais.",
          "Esse valor já entra no custo do trator, sem ninguém digitar nada de novo no escritório.",
          "Nada de nota perdida no bolso do macacão.",
        ],
      },
      {
        id: "s26-checklist",
        visual: { kind: "phone", source: "carlos", mark: "checklist", caption: "Checklist" },
        sentences: [
          "Depois, ele responde o checklist de segurança, item por item, com um toque em cada resposta.",
          "Se algum item não estiver conforme, o aplicativo pede uma foto.",
          "Assim, todo serviço segue o mesmo padrão, não importa quem foi o técnico.",
        ],
      },
      {
        id: "s27-complete",
        visual: { kind: "phone", source: "carlos", mark: "complete", caption: "Conclusão" },
        sentences: [
          "Para concluir, ele escreve o que foi feito e tira a foto do depois, com o trator já sem vazamento.",
          "Ele também anota o horímetro: quatro mil trezentas e doze horas.",
          "Com o horímetro em dia, o sistema sabe quando vem a próxima revisão.",
        ],
      },
      {
        id: "s28-signature",
        highlight: true,
        visual: { kind: "phone", source: "carlos", mark: "signature", caption: "Assinatura do cliente" },
        sentences: [
          "O cliente, Seu Antônio, assina com o dedo, na tela do celular.",
          "A assinatura fica junto com o serviço, com nome e horário.",
          "Acabou a discussão sobre o que foi feito e quando.",
        ],
      },
      {
        id: "s29-success",
        highlight: true,
        visual: { kind: "phone", source: "carlos", mark: "success", caption: "Serviço concluído" },
        sentences: [
          "Serviço concluído.",
          "Se estivesse sem sinal, tudo ficaria salvo no celular e iria para o escritório depois, sozinho.",
        ],
      },
    ],
  },
  {
    id: "custos",
    title: "Verificação e custos",
    scenes: [
      {
        id: "s30-verify",
        visual: { kind: "clip", source: "costs", mark: "verify" },
        sentences: [
          "De volta ao escritório, a Marina abre a ordem concluída.",
          "Ela vê as fotos de antes e depois, a peça, o checklist e a assinatura, e marca o serviço como verificado.",
          "Ela confere tudo sem sair da cadeira e sem esperar o técnico voltar.",
        ],
      },
      {
        id: "s31-asset",
        highlight: true,
        visual: { kind: "clip", source: "costs", mark: "asset" },
        sentences: [
          "Na ficha do trator doze, aparece tudo o que essa máquina já custou: peças, mão de obra e combustível.",
          "É assim que o dono descobre qual máquina dá lucro e qual só dá trabalho.",
          "A mangueira que o Carlos acabou de trocar já está somada aqui.",
        ],
      },
      {
        id: "s32-rental",
        visual: { kind: "clip", source: "costs", mark: "rental" },
        sentences: [
          "As locações também ficam à vista.",
          "Esta aqui passou da data de devolução, e o sistema avisa antes que vire prejuízo.",
          "Na entrega e na devolução, o técnico registra fotos, horímetro e assinatura, igualzinho ao reparo.",
        ],
      },
      {
        id: "s33-costs",
        visual: { kind: "clip", source: "costs", mark: "costs" },
        sentences: [
          "E, no fim da safra, os custos aparecem por fazenda e por safra, prontos para conversar com o cliente ou com o contador.",
          "Tudo pode ser exportado numa planilha, se o contador preferir.",
        ],
      },
    ],
  },
  {
    id: "encerramento",
    title: "Encerramento",
    scenes: [
      {
        id: "s34-recap",
        visual: { kind: "title", eyebrow: "Resumo", heading: "Três trabalhos, um só lugar", sub: "Relato no campo · Entrega e devolução · Custo de cada máquina", lottie: "machine-cost" },
        sentences: [
          "Recapitulando: o técnico relata no campo, mesmo sem sinal; o escritório vê e despacha; e cada máquina mostra quanto custa.",
          "Tudo num só lugar, simples para quem está no campo e claro para quem está no escritório.",
        ],
      },
      {
        id: "s35-cta",
        highlight: true,
        visual: { kind: "title", eyebrow: "agrorende.com.br", heading: "Teste grátis por 30 dias", sub: "Sem cartão de crédito. Com todos os recursos.", lottie: "success" },
        sentences: [
          "Quer ver isso na sua empresa? Teste grátis por trinta dias, sem cartão de crédito.",
          "Obrigado por assistir, e até logo!",
        ],
      },
    ],
  },
];

export function allScenes(): Scene[] {
  return CHAPTERS.flatMap((c) => c.scenes);
}
