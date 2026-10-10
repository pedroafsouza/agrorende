# Glossário

O produto fala português do Brasil; o código e a especificação usam inglês. Esta tabela liga os
dois mundos. Fontes: [`docs/PRD.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/PRD.md) §6,
[`docs/plans/SIMPLER-TO-SELL.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/plans/SIMPLER-TO-SELL.md) §1 e §10,
e os rótulos de [`apps/web/messages/pt-BR/admin.json`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/messages/pt-BR/admin.json)
e [`apps/mobile/src/i18n/pt-BR/common.json`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/src/i18n/pt-BR/common.json).

## Termos do domínio

| pt-BR (produto) | Inglês (código e especificação) | Significado |
|---|---|---|
| Máquina | Asset | Máquina ou implemento acompanhado pela AgroRende. Cada uma tem um código único (`AGR-000123`) impresso numa etiqueta QR. |
| Local | Site | Lugar com coordenadas: fazenda, pátio, oficina, concessionária ou obra. |
| Talhão | Plot | Área com nome dentro de uma fazenda; pode ter polígono e cultura. |
| Safra | Season | Safra agrícola (ex.: "Safra 2026/27"); dimensão de custo, pode ter janelas críticas (plantio, colheita). |
| Cliente | Customer | Empresa ou pessoa atendida ou para quem se aluga. Parceiro/fornecedor é um cliente com a marcação de fornecedor. |
| Relato (relato de campo) | Field report | Registro de um problema numa máquina feito no campo: problema, fotos, localização. |
| Marcado para reparo | Marked for repair | Decisão de triagem que transforma um relato numa ordem de serviço. |
| OS (Ordem de serviço) | Work order (WO) | Trabalho de reparo ou verificação atribuído a um técnico. Códigos `WO-000001`. |
| Vistoria | Inspection | Checklist com fotos e leituras, na entrega, na devolução ou durante um reparo. |
| Avaria | Damage | Defeito registrado numa máquina (zona, gravidade, foto). Cada máquina tem seu registro de avarias. |
| Locação | Rental | Alugar uma máquina nossa para fora, ou alugar a máquina de um parceiro, por um período. Códigos `RN-000001`. |
| Entrega / Devolução | Check-out / Check-in | Vistoria guiada na saída e na volta da locação. |
| Horímetro | Hour meter | Horas de motor; a principal medida de uso de máquinas agrícolas e base do custo por hora. |
| Em serviço | On duty | Enquanto a pessoa está em serviço, sua localização é compartilhada com o escritório. |
| Peças · Estoque | Parts · Stock | Catálogo de peças e níveis de estoque por local. |
| Combustível | Fuel log | Abastecimentos por máquina. |
| Manutenção preventiva | Maintenance plan | Revisões programadas por horas ou datas. |
| Modelo de checklist | Checklist template | Lista de itens a conferir numa vistoria ou OS. |

## Termos de sincronização (evite no texto para o cliente)

| pt-BR | Inglês | Significado | Diga ao cliente |
|---|---|---|---|
| Sincronização | Sync | Troca dos dados offline com o servidor. | "Enviado quando tiver sinal" |
| Fila de envio | Outbox | Ações esperando no celular para serem enviadas. | "Salvo no celular" |
| Conflito | Conflict | Ação offline que o servidor não conseguiu aplicar (ex.: a OS foi cancelada nesse meio-tempo). | — |
| Envios | Sync center | A tela do app que mostra o que está salvo no celular e o que já foi enviado. | "Envios" |

## Rótulos de navegação

| Onde | Rótulo pt-BR | Rota ou chave |
|---|---|---|
| Painel | Visão geral | `/ops` (Central de Operações; chave `nav.ops`) |
| Painel | Pendências | `/attention` (fila de atenção e triagem) |
| Painel | Relatos · Ordens de serviço · Locações | `/reports` · `/work-orders` · `/rentals` |
| Painel | Máquinas · Locais · Safras · Clientes | `/assets` · `/sites` · `/seasons` · `/customers` |
| Painel | Custos · Indicadores · Faturamento | `/costs` · `/analytics` · `/billing` |
| Painel | Equipe · Celulares da equipe · Configurações · Assinatura | `/team` · `/team/devices` · `/settings` · `/settings/subscription` |
| Painel | Importar planilha | `/imports` |
| App | Hoje · Relatos · Serviços · Locações · Mais | abas `today` · `reports` · `jobs` · `rentals` · `more` |
| App | Envios | `sync-center` |

## Papéis

| pt-BR | Código | Quem é |
|---|---|---|
| Administrador | `ADMIN` | Dono ou responsável pela conta: configurações, equipe, assinatura. |
| Gestor | `MANAGER` | Escritório: despacho, triagem, relatórios, custos. |
| Campo | `FIELD` | Técnicos, inspetores e pessoal de locação, no app. |

## Termos de negócio

| Termo | Significado |
|---|---|
| Organização (tenant) | Uma empresa cliente, com dados isolados das demais. |
| Trial | Os 30 dias grátis antes de o cliente decidir assinar (`TRIAL_DAYS=30`). |
| Primeiro uso | Os passos guiados que um cliente novo vê logo após se cadastrar (`/getting-started` no painel). |
| Módulo | Parte do produto que pode ser ligada ou desligada, como Peças ou Combustível. |
| Conversão | Fração de pessoas que avança para o próximo passo (ex.: da visita ao cadastro). |
| Lottie | Pequeno arquivo de animação que roda leve no web e no celular. |
| Primeira safra · Segunda safra | Nomes das releases MVP e v1.1. |

## Palavras que evitamos

Do plano "Simpler to sell" (§1):

| Em vez de | Diga | Por quê |
|---|---|---|
| ERP de campo | Controle das máquinas no campo | Pequenos donos associam ERP a projetos caros e lentos. |
| Sincronização, fila, outbox | Salvo no celular, enviado quando tiver sinal | Descreve o resultado, não o mecanismo. |
| Central de operações | Visão geral | Palavras simples que um usuário novo adivinha. |
| Atenção, triagem | Pendências | Uma palavra que todo mundo já usa. |
| Dispositivos | Celulares da equipe | Nomeia o objeto real. |
| Template | Modelo de checklist | Em português e diz o que é. |
| Importar CSV | Trazer sua planilha | Clientes têm planilhas, não arquivos CSV. |
| Código do erro | Código para o suporte | Explica por que o código aparece. |
