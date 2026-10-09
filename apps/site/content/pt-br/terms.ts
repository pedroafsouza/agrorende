import type { LegalDocument } from "../types";

export const terms: LegalDocument = {
  title: "Termos de uso",
  intro:
    "Estes termos regem o uso do AgroRende pela empresa cliente e pelas pessoas que ela convida. Ao criar uma empresa ou aceitar um convite, você concorda com eles.",
  sections: [
    {
      id: "servico",
      heading: "O serviço",
      paragraphs: [
        "O AgroRende é um software por assinatura para gestão de frota agrícola: relatos de campo, reparos, locações, central de operações e cadastros do ERP agro, com app de campo e web para o escritório.",
      ],
    },
    {
      id: "contas",
      heading: "Contas e acesso",
      paragraphs: [
        "A empresa cliente é responsável por quem convida, pelos papéis que atribui e por desativar o acesso de quem sai da equipe. Cada pessoa deve manter o próprio acesso em segurança e avisar a empresa se suspeitar de uso indevido.",
      ],
    },
    {
      id: "teste",
      heading: "Teste e assinatura",
      paragraphs: [
        "Toda empresa nova tem 30 dias de teste com todos os módulos. Depois disso, o uso continua conforme o plano contratado. A cobrança é por usuário de campo ativo; usuários de escritório não são cobrados. Não há taxa de implantação.",
      ],
    },
    {
      id: "uso",
      heading: "Uso aceitável",
      paragraphs: ["Não é permitido:"],
      list: [
        "usar o serviço para atividades ilegais ou para registrar dados de terceiros sem base legal;",
        "tentar acessar dados de outra empresa ou contornar controles de acesso;",
        "sobrecarregar o serviço de forma intencional ou fazer engenharia reversa dele.",
      ],
    },
    {
      id: "dados",
      heading: "Seus dados",
      paragraphs: [
        "Os dados registrados pertencem à empresa cliente. Ela pode exportá-los em CSV a qualquer momento. Após o cancelamento, os dados ficam 90 dias disponíveis para exportação e depois são apagados. O tratamento de dados pessoais segue a Política de privacidade e o DPA.",
      ],
    },
    {
      id: "disponibilidade",
      heading: "Disponibilidade",
      paragraphs: [
        "Trabalhamos para manter o serviço disponível e avisamos com antecedência sobre manutenções programadas. O app de campo continua registrando trabalho sem conexão e envia tudo quando o serviço volta.",
      ],
    },
    {
      id: "responsabilidade",
      heading: "Limitação de responsabilidade",
      paragraphs: [
        "O AgroRende apoia a gestão da frota, mas as decisões operacionais, de segurança e de manutenção continuam sendo da empresa cliente. A responsabilidade do AgroRende fica limitada ao valor pago nos 12 meses anteriores ao evento, salvo quando a lei dispuser de outra forma.",
      ],
    },
    {
      id: "mudancas",
      heading: "Mudanças nestes termos",
      paragraphs: [
        "Podemos atualizar estes termos. Mudanças relevantes são avisadas no app e por e-mail com antecedência, e a versão vigente fica indicada no topo desta página.",
      ],
    },
    {
      id: "foro",
      heading: "Lei aplicável",
      paragraphs: ["Estes termos seguem a lei brasileira. Fica eleito o foro da comarca da sede do AgroRende."],
    },
  ],
};
