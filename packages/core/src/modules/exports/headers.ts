import type { ExportLocale } from "./dto.js";

type Label = Readonly<Record<ExportLocale, string>>;

/**
 * Localized CSV column headers. No messages catalogue is owned by T05, so the labels live
 * here as a typed pt-BR/en map (see docs/progress/T05.md, assumptions).
 */
export const EXPORT_HEADERS = {
  number: { "pt-BR": "Número", en: "Number" },
  title: { "pt-BR": "Título", en: "Title" },
  type: { "pt-BR": "Tipo", en: "Type" },
  category: { "pt-BR": "Categoria", en: "Category" },
  priority: { "pt-BR": "Prioridade", en: "Priority" },
  status: { "pt-BR": "Situação", en: "Status" },
  assetId: { "pt-BR": "ID da máquina", en: "Machine ID" },
  reporterId: { "pt-BR": "ID de quem relatou", en: "Reporter ID" },
  assigneeId: { "pt-BR": "ID do responsável", en: "Assignee ID" },
  customerId: { "pt-BR": "ID do cliente", en: "Customer ID" },
  userId: { "pt-BR": "ID do usuário", en: "User ID" },
  deviceId: { "pt-BR": "ID do aparelho", en: "Device ID" },
  workOrderId: { "pt-BR": "ID da OS", en: "Work order ID" },
  occurredAt: { "pt-BR": "Ocorrido em", en: "Occurred at" },
  createdAt: { "pt-BR": "Criado em", en: "Created at" },
  scheduledFor: { "pt-BR": "Agendado para", en: "Scheduled for" },
  completedAt: { "pt-BR": "Concluído em", en: "Completed at" },
  machineOperable: { "pt-BR": "Máquina operando", en: "Machine operable" },
  lat: { "pt-BR": "Latitude", en: "Latitude" },
  lng: { "pt-BR": "Longitude", en: "Longitude" },
  accuracyM: { "pt-BR": "Precisão (m)", en: "Accuracy (m)" },
  speedMps: { "pt-BR": "Velocidade (m/s)", en: "Speed (m/s)" },
  heading: { "pt-BR": "Direção (°)", en: "Heading (°)" },
  batteryLevel: { "pt-BR": "Bateria", en: "Battery" },
  recordedAt: { "pt-BR": "Registrado em", en: "Recorded at" },
  laborCostCents: { "pt-BR": "Mão de obra (R$)", en: "Labour (BRL)" },
  partsCostCents: { "pt-BR": "Peças (R$)", en: "Parts (BRL)" },
  externalCostCents: { "pt-BR": "Serviços externos (R$)", en: "External services (BRL)" },
  totalCostCents: { "pt-BR": "Custo total (R$)", en: "Total cost (BRL)" },
  direction: { "pt-BR": "Sentido", en: "Direction" },
  plannedStart: { "pt-BR": "Início previsto", en: "Planned start" },
  plannedEnd: { "pt-BR": "Fim previsto", en: "Planned end" },
  actualStart: { "pt-BR": "Início real", en: "Actual start" },
  actualEnd: { "pt-BR": "Fim real", en: "Actual end" },
  rateCents: { "pt-BR": "Valor da diária (R$)", en: "Rate (BRL)" },
  rateUnit: { "pt-BR": "Unidade de cobrança", en: "Rate unit" },
  chargesTotalCents: { "pt-BR": "Total de cobranças (R$)", en: "Charges total (BRL)" },
  balanceDueCents: { "pt-BR": "Saldo devedor (R$)", en: "Balance due (BRL)" },
  code: { "pt-BR": "Código", en: "Code" },
  name: { "pt-BR": "Nome", en: "Name" },
  make: { "pt-BR": "Marca", en: "Make" },
  model: { "pt-BR": "Modelo", en: "Model" },
  year: { "pt-BR": "Ano", en: "Year" },
  serialNumber: { "pt-BR": "Número de série", en: "Serial number" },
  plate: { "pt-BR": "Placa", en: "Plate" },
  condition: { "pt-BR": "Condição", en: "Condition" },
  hourMeter: { "pt-BR": "Horímetro (h)", en: "Hour meter (h)" },
  odometerKm: { "pt-BR": "Hodômetro (km)", en: "Odometer (km)" },
  isRentable: { "pt-BR": "Disponível para locação", en: "Rentable" },
  defaultRateCents: { "pt-BR": "Valor padrão (R$)", en: "Default rate (BRL)" },
} as const satisfies Record<string, Label>;

export type ExportHeaderKey = keyof typeof EXPORT_HEADERS;

export const BOOLEAN_LABELS = {
  "pt-BR": { yes: "Sim", no: "Não" },
  en: { yes: "Yes", no: "No" },
} as const satisfies Record<ExportLocale, { yes: string; no: string }>;
