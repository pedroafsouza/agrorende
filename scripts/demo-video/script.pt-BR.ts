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
 *
 * Voice: short, concrete sentences at a brisk, energetic pace, in a confident, warm and respectful
 * tone for farm owners, managers and technicians. No jokes, irony, memes or slang. Write numbers, units and abbreviations as they are spoken ("cento e oitenta e cinco
 * reais", "ordem de serviço" rather than "OS"), because the text is both the caption and the speech.
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

/**
 * Spelling hints for the voices: applied to the spoken text only, so the captions keep the written
 * form. "Agrorrênde" makes both Kokoro and ElevenLabs say the brand as "agro rende".
 */
export const PRONUNCIATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/AgroRende/gu, "Agrorrênde"],
  [/\bOS\b/gu, "ordem de serviço"],
];

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
          "Isso é o AgroRende.",
          "Um sistema para locadoras de máquinas agrícolas que junta num só lugar o que hoje fica espalhado em planilha, caderno e ligação.",
          "Nos próximos minutos, você vai ver tudo funcionando de ponta a ponta, com dados de demonstração.",
        ],
      },
      {
        id: "s02-hero",
        highlight: true,
        visual: { kind: "clip", source: "landing", mark: "hero" },
        sentences: [
          "A ideia cabe numa frase.",
          "O técnico relata o problema no campo, mesmo sem sinal. O escritório vê, despacha e sabe quanto cada máquina custa.",
          "Um aplicativo no celular do técnico, um painel no computador do escritório, e os dois falando a mesma língua.",
          "Sem planilha. Sem caderno. Sem ligação perdida.",
          "Cada informação é registrada uma vez só, por quem está mais perto dela, e chega para quem precisa decidir.",
        ],
      },
      {
        id: "s03-jobs",
        visual: { kind: "clip", source: "landing", mark: "jobs" },
        sentences: [
          "A missão: nenhuma máquina parada por falta de informação.",
          "Para isso, o AgroRende faz exatamente três trabalhos.",
          "Um: registrar o problema no campo. Dois: cuidar da entrega e da devolução das máquinas alugadas. Três: mostrar o custo real de cada máquina.",
          "Três trabalhos, bem feitos, do jeito que a operação precisa.",
          "Vamos ver os três em ação, numa empresa de verdade, só que com dados de demonstração.",
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
        sentences: [
          "Capítulo um: uma empresa nova, começando do zero.",
        ],
      },
      {
        id: "s05-signup",
        visual: { kind: "clip", source: "signup", mark: "signup" },
        sentences: [
          "Essa é a Dona Dourada. Ela tem uma locadora em Ribeirão Preto e quer testar.",
          "Ela entra pelo site e clica em Continuar com Google.",
          "Nesta demonstração, a tela do Google é simulada.",
          "Sem criar senha nova, e sem mais um cadastro para lembrar.",
        ],
      },
      {
        id: "s06-company",
        visual: { kind: "clip", source: "signup", mark: "company" },
        sentences: [
          "Agora, os dados da empresa: Locadora Dourada, o telefone do escritório e a cidade.",
          "O CNPJ é opcional. Se ela informar, o sistema confere se o número é válido, e evita erro de digitação logo no começo.",
          "Um clique, conta criada, trinta dias grátis.",
        ],
      },
      {
        id: "s07-guide-welcome",
        visual: { kind: "clip", source: "signup", mark: "guide1" },
        sentences: [
          "Logo de cara, um guia de primeiros passos: cinco etapas curtas, direto ao ponto.",
          "Ninguém precisa de treinamento para começar.",
          "Dá para seguir agora ou deixar para depois. O guia espera.",
        ],
      },
      {
        id: "s08-guide-machine",
        visual: { kind: "clip", source: "signup", mark: "guide2" },
        sentences: [
          "Primeiro, a primeira máquina.",
          "Nome e tipo, e pronto: um trator John Deere seis mil cento e dez.",
          "Número de série, horímetro e o resto podem esperar.",
          "A máquina ganha um número próprio, que aparece em tudo: nos relatos, nas ordens de serviço e nos custos.",
        ],
      },
      {
        id: "s09-guide-invite",
        visual: { kind: "clip", source: "signup", mark: "guide3" },
        sentences: [
          "Depois, ela convida o técnico Tiago. Só nome e WhatsApp.",
          "O convite sai com um link e um código, prontos para mandar pelo WhatsApp.",
          "O Tiago instala o aplicativo, digita o código e já está dentro, sem precisar de e-mail.",
        ],
      },
      {
        id: "s10-guide-order",
        visual: { kind: "clip", source: "signup", mark: "guide4" },
        sentences: [
          "Agora, a primeira ordem de serviço: o que fazer, e em qual máquina.",
          "Uma revisão de quinhentas horas, no trator que a gente acabou de cadastrar.",
          "A ordem já nasce ligada à máquina, então o custo dessa revisão cai direto na ficha do trator.",
        ],
      },
      {
        id: "s11-guide-done",
        visual: { kind: "clip", source: "signup", mark: "guide5" },
        sentences: [
          "Pronto. Máquina, equipe e trabalho, em poucos minutos.",
          "A visão geral começa vazia, porque cada empresa só enxerga os próprios dados.",
          "Agora, vamos pular para uma empresa que já usa o AgroRende há uma safra inteira.",
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
        sentences: [
          "Capítulo dois: no campo, mesmo sem sinal.",
        ],
      },
      {
        id: "s13-intro",
        visual: { kind: "phone", source: "joana", mark: "intro", caption: "Joana, inspetora" },
        sentences: [
          "Essa é a Joana, que faz as inspeções.",
          "No primeiro acesso, o aplicativo se apresenta em três cartões curtos.",
          "Funciona sem sinal, acompanha do relato à entrega, e o cliente assina na tela do celular.",
          "Letra grande, botão largo. Feito para usar no sol, em cima da máquina.",
        ],
      },
      {
        id: "s14-report-start",
        highlight: true,
        visual: { kind: "phone", source: "joana", mark: "report1", caption: "Sem sinal no talhão" },
        sentences: [
          "A Joana está no talhão dois da Fazenda Santa Clara, e ali o celular está sem sinal.",
          "O trator doze está vazando óleo. Ela toca em Relatar problema.",
          "Busca a máquina pelo número e tira uma foto do vazamento, direto pelo aplicativo.",
          "Com a foto, o escritório vê a peça certa e entende o problema sem precisar ligar.",
        ],
      },
      {
        id: "s15-report-details",
        visual: { kind: "phone", source: "joana", mark: "report2", caption: "Poucos toques" },
        sentences: [
          "Agora, poucos toques: parte hidráulica, gravidade alta, máquina parada. Botões grandes, fáceis de tocar até de luva.",
          "Ela pede o conserto agora e escreve uma frase curta.",
          "E o aplicativo marca o local do relato no mapa.",
        ],
      },
      {
        id: "s16-saved",
        highlight: true,
        visual: { kind: "phone", source: "joana", mark: "saved", caption: "Salvo no celular" },
        sentences: [
          "Ela toca em Enviar relato. Ainda sem sinal nenhum.",
          "Repare no aviso: Salvo no celular.",
          "Nada se perde. O relato, a foto e o local ficam guardados no telefone.",
          "Ela pode fechar o aplicativo, guardar o celular no bolso e seguir o dia.",
        ],
      },
      {
        id: "s17-reconnect",
        highlight: true,
        visual: { kind: "split", phone: "joana", office: "joanaOffice", mark: "reconnect", caption: "O sinal voltou" },
        sentences: [
          "Quando a Joana volta para a sede e o sinal aparece, o celular envia tudo sozinho.",
          "Na tela de Envios, ela confere: tudo enviado.",
          "E, do outro lado, no escritório, o relato aparece na hora. Com a foto, e com o local.",
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
          "A visão geral mostra tudo num lugar só: as máquinas, os técnicos em serviço no mapa e o que precisa de atenção hoje.",
          "Esses pontos se movem porque os técnicos estão trabalhando agora mesmo.",
          "No topo: quantas máquinas estão paradas, quantos serviços estão abertos e quantas locações vencem hoje.",
        ],
      },
      {
        id: "s19-attention",
        visual: { kind: "clip", source: "office", mark: "attention" },
        sentences: [
          "Em Pendências, ela vê o que precisa de alguém do escritório. É a lista do que não pode esperar.",
          "Em Relatos, tudo o que chegou do campo. O relato da Joana está no topo, com prioridade alta.",
          "Nada se perde num grupo de mensagens, ou num papel em cima da mesa.",
          "Cada relato tem dono, prioridade e situação, do momento em que chega até ser resolvido.",
        ],
      },
      {
        id: "s20-report",
        visual: { kind: "clip", source: "office", mark: "report" },
        sentences: [
          "Ela abre o relato e vê exatamente o que a Joana viu: a máquina, a foto, a descrição e o ponto no mapa.",
          "Sem ligar para ninguém para entender o problema.",
          "Se não for nada sério, dá para deixar em observação, ou dispensar.",
        ],
      },
      {
        id: "s21-dispatch",
        highlight: true,
        visual: { kind: "clip", source: "office", mark: "dispatch" },
        sentences: [
          "Um clique em Encaminhar para reparo, e o relato vira uma ordem de serviço.",
          "O sistema sugere quem pode ir, começando por quem está com menos serviços abertos.",
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
        sentences: [
          "Capítulo três: o Carlos, o técnico que vai resolver isso.",
        ],
      },
      {
        id: "s23-accept",
        visual: { kind: "phone", source: "carlos", mark: "accept", caption: "Carlos, técnico" },
        sentences: [
          "O serviço novo aparece na lista do Carlos, com a máquina, a fazenda e a prioridade.",
          "Ele abre, lê o que a Joana escreveu, e aceita.",
          "E a Marina vê o aceite na mesma hora. Ninguém precisa ligar para confirmar.",
        ],
      },
      {
        id: "s24-route",
        visual: { kind: "phone", source: "carlos", mark: "route", caption: "A caminho" },
        sentences: [
          "Ele toca em A caminho, e o escritório passa a acompanhar o trajeto.",
          "Chegando perto da fazenda, o próprio aplicativo pergunta se ele chegou.",
          "Um toque em Cheguei, e o serviço começa.",
          "O horário de chegada fica registrado, sem o técnico precisar avisar ninguém.",
        ],
      },
      {
        id: "s25-parts",
        highlight: true,
        visual: { kind: "phone", source: "carlos", mark: "parts", caption: "Peça usada" },
        sentences: [
          "O Carlos troca a mangueira hidráulica e anota a peça que usou.",
          "Uma mangueira, cento e oitenta e cinco reais. Ele digita o valor, salva, e pronto.",
          "Esse valor já entra no custo do trator, sem ninguém digitar nada de novo no escritório.",
          "Nenhum comprovante se perde no caminho até o escritório.",
        ],
      },
      {
        id: "s26-checklist",
        visual: { kind: "phone", source: "carlos", mark: "checklist", caption: "Checklist" },
        sentences: [
          "Agora, o checklist de segurança. Item por item, um toque por resposta.",
          "Se algum item não estiver conforme, o aplicativo pede uma foto.",
          "Assim, todo serviço segue o mesmo padrão, não importa quem foi o técnico.",
        ],
      },
      {
        id: "s27-complete",
        visual: { kind: "phone", source: "carlos", mark: "complete", caption: "Conclusão" },
        sentences: [
          "Para fechar, ele descreve o que fez: trocou a mangueira e testou.",
          "Em seguida, tira a foto do depois, com o trator já sem vazamento.",
          "Anota o horímetro: quatro mil trezentas e doze horas.",
          "Com o horímetro em dia, o sistema sabe quando vem a próxima revisão, e a manutenção deixa de depender da memória.",
        ],
      },
      {
        id: "s28-signature",
        highlight: true,
        visual: { kind: "phone", source: "carlos", mark: "signature", caption: "Assinatura do cliente" },
        sentences: [
          "O cliente, Seu Antônio, assina com o dedo, na tela do celular.",
          "A assinatura fica junto com o serviço, com nome e horário.",
          "Fica claro, para os dois lados, o que foi feito e quando.",
        ],
      },
      {
        id: "s29-success",
        highlight: true,
        visual: { kind: "phone", source: "carlos", mark: "success", caption: "Serviço concluído" },
        sentences: [
          "Serviço concluído.",
          "E se estivesse sem sinal? Ficaria tudo salvo no celular, e iria para o escritório sozinho, depois.",
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
          "Fotos de antes e depois, a peça, o checklist e a assinatura. Tudo certo? Verificado.",
          "Sem sair da cadeira, e sem esperar o técnico voltar.",
        ],
      },
      {
        id: "s31-asset",
        highlight: true,
        visual: { kind: "clip", source: "costs", mark: "asset" },
        sentences: [
          "Na ficha do trator doze está tudo o que essa máquina já custou: peças, mão de obra e combustível.",
          "É assim que o dono descobre qual máquina dá lucro, e qual está custando mais do que rende.",
          "E a mangueira que o Carlos acabou de trocar? Já está somada aqui.",
        ],
      },
      {
        id: "s32-rental",
        visual: { kind: "clip", source: "costs", mark: "rental" },
        sentences: [
          "As locações também ficam à vista.",
          "Esta aqui passou da data de devolução, e o sistema avisa antes que vire prejuízo.",
          "Dá para ver qual máquina está com qual cliente, e até quando.",
          "Na entrega e na devolução, o técnico registra fotos, horímetro e assinatura, do mesmo jeito que no reparo.",
        ],
      },
      {
        id: "s33-costs",
        visual: { kind: "clip", source: "costs", mark: "costs" },
        sentences: [
          "E, no fim da safra, os custos aparecem por fazenda e por safra, prontos para a conversa com o cliente ou com o contador.",
          "E, se precisar, tudo pode ser exportado numa planilha.",
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
          "Recapitulando: o técnico relata no campo, mesmo sem sinal. O escritório vê e despacha. E cada máquina mostra quanto custa.",
          "Simples para quem está no campo, e claro para quem está no escritório.",
        ],
      },
      {
        id: "s35-cta",
        highlight: true,
        visual: { kind: "title", eyebrow: "agrorende.com.br", heading: "Teste grátis por 30 dias", sub: "Sem cartão de crédito. Com todos os recursos.", lottie: "success" },
        sentences: [
          "Quer ver isso na sua empresa? Teste grátis por trinta dias, sem cartão de crédito.",
          "Obrigado por assistir!",
        ],
      },
    ],
  },
];

export function allScenes(): Scene[] {
  return CHAPTERS.flatMap((c) => c.scenes);
}
