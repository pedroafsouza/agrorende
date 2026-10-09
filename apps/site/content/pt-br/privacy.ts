import type { LegalDocument } from "../types";

export const privacy: LegalDocument = {
  title: "Política de privacidade",
  intro:
    "Esta política explica como o AgroRende trata dados pessoais no site, no app de campo e na web do escritório, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).",
  sections: [
    {
      id: "papeis",
      heading: "Quem é responsável",
      paragraphs: [
        "A empresa cliente que contrata o AgroRende é a controladora dos dados da sua equipe, dos seus clientes e das suas operações. O AgroRende atua como operador e trata esses dados apenas para prestar o serviço contratado, conforme o Acordo de tratamento de dados (DPA).",
        "Para os dados de cadastro da conta da empresa, de cobrança e de suporte, o AgroRende é o controlador.",
      ],
    },
    {
      id: "dados",
      heading: "Quais dados tratamos",
      paragraphs: ["Tratamos somente o necessário para o serviço funcionar:"],
      list: [
        "Dados de conta: nome, e-mail, telefone, foto opcional, idioma e empresa.",
        "Dados de acesso: identificadores do Google ou da Apple quando você entra com essas contas, sessões e aparelhos conectados.",
        "Dados de trabalho: relatos, fotos, vídeos, áudios, checklists, assinaturas, ordens de serviço, locações, peças e custos registrados pela equipe.",
        "Localização: posição do aparelho enquanto você está em turno no app de campo e a localização anexada a fotos e relatos.",
        "Diagnóstico: versão do app, modelo do aparelho e registros técnicos de sincronização, sem conteúdo de formulários.",
      ],
    },
    {
      id: "finalidades",
      heading: "Para que usamos",
      paragraphs: [
        "Usamos os dados para executar o contrato com a empresa cliente: registrar e encaminhar relatos, organizar reparos e locações, mostrar a operação ao vivo para o escritório, calcular custos e cobranças e dar suporte. Não vendemos dados e não os usamos para publicidade.",
      ],
    },
    {
      id: "localizacao",
      heading: "Localização em turno",
      paragraphs: [
        "O app de campo só registra a posição enquanto o turno está ativo e mostra um aviso permanente nesse período. As posições brutas são guardadas por 30 dias e depois apagadas. Fora do turno, nenhuma posição é coletada.",
      ],
    },
    {
      id: "retencao",
      heading: "Por quanto tempo guardamos",
      paragraphs: [
        "Os registros de trabalho ficam enquanto a empresa mantiver a assinatura. Depois do cancelamento, ficam 90 dias disponíveis para exportação e então são apagados. Diagnósticos técnicos ficam 30 dias. Cópias de segurança seguem o ciclo de 30 pontos diários e 12 mensais e expiram depois disso.",
      ],
    },
    {
      id: "compartilhamento",
      heading: "Com quem compartilhamos",
      paragraphs: [
        "Os dados ficam em servidores no Brasil. Usamos fornecedores de infraestrutura, banco de dados, envio de e-mail e login social apenas para operar o serviço, sob contrato e com obrigações de confidencialidade e segurança.",
      ],
    },
    {
      id: "site",
      heading: "Este site",
      paragraphs: [
        "Este site não usa cookies, não usa scripts de terceiros e não guarda o que você digita. As fontes e imagens são servidas pelo próprio site. Os botões de WhatsApp e e-mail apenas abrem o aplicativo do seu aparelho.",
      ],
    },
    {
      id: "direitos",
      heading: "Seus direitos",
      paragraphs: [
        "Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento e exclusão dos seus dados. Quando o AgroRende é operador, encaminhamos o pedido para a empresa controladora e a ajudamos a responder. Você também pode excluir a sua conta pelo app ou pela web.",
      ],
    },
    {
      id: "contato",
      heading: "Encarregado de dados",
      paragraphs: [
        "Fale com o encarregado de dados do AgroRende pelo e-mail indicado no rodapé desta página. Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
  ],
};
