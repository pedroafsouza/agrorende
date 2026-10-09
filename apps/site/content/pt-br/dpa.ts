import type { LegalDocument } from "../types";

export const dpa: LegalDocument = {
  title: "Acordo de tratamento de dados (DPA)",
  intro:
    "Este acordo complementa os Termos de uso e define como o AgroRende, como operador, trata dados pessoais em nome da empresa cliente, que é a controladora, nos termos da LGPD.",
  sections: [
    {
      id: "objeto",
      heading: "Objeto",
      paragraphs: [
        "O AgroRende trata dados pessoais da equipe, dos clientes e dos contatos da empresa cliente somente para prestar o serviço contratado e segundo as instruções documentadas da controladora, incluindo as configurações feitas no próprio produto.",
      ],
    },
    {
      id: "categorias",
      heading: "Categorias de dados e titulares",
      paragraphs: ["Os titulares são usuários da empresa, clientes e contatos registrados por ela. As categorias são:"],
      list: [
        "identificação e contato: nome, e-mail, telefone e foto;",
        "dados de trabalho: relatos, mídias, checklists, assinaturas, ordens de serviço e locações;",
        "localização durante o turno, com retenção de 30 dias para posições brutas.",
      ],
    },
    {
      id: "seguranca",
      heading: "Segurança",
      paragraphs: [
        "O AgroRende mantém medidas técnicas e administrativas adequadas: isolamento de dados por empresa, criptografia em trânsito, controle de acesso por papel, registros de auditoria, cópias de segurança com teste mensal de restauração e confidencialidade das pessoas autorizadas.",
      ],
    },
    {
      id: "suboperadores",
      heading: "Suboperadores",
      paragraphs: [
        "A controladora autoriza o uso de suboperadores de infraestrutura, banco de dados, envio de e-mail e login social. O AgroRende mantém a lista atualizada, avisa sobre mudanças e exige de cada suboperador obrigações equivalentes às deste acordo.",
      ],
    },
    {
      id: "incidentes",
      heading: "Incidentes",
      paragraphs: [
        "O AgroRende comunica à controladora, sem demora indevida, qualquer incidente de segurança que possa acarretar risco ou dano relevante aos titulares, com as informações disponíveis para que ela cumpra suas obrigações perante a ANPD e os titulares.",
      ],
    },
    {
      id: "direitos",
      heading: "Direitos dos titulares",
      paragraphs: [
        "O AgroRende auxilia a controladora a atender pedidos dos titulares, oferecendo exportação, correção e exclusão de conta com anonimização. Pedidos recebidos diretamente pelo AgroRende são encaminhados à controladora.",
      ],
    },
    {
      id: "termino",
      heading: "Término",
      paragraphs: [
        "Ao fim do contrato, os dados ficam disponíveis para exportação por 90 dias e depois são eliminados, inclusive das cópias de segurança conforme o ciclo de expiração, salvo quando a lei exigir a guarda.",
      ],
    },
  ],
};
