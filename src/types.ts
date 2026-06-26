export interface ParteExtraida {
  nome: string;
  polo: string;
  advCadastrado: string;
  whatsapp: string | null;
  endereco: string;
  sedeZonaRural: "Sede" | "Zona Rural";
  obs: string;
  menorDeIdade?: string; // "Sim", "Não", or "" (deixa em branco)
  dataHoraAudiencia?: string; // data e hora da audiência (se houver)
  dataAudiencia?: string; // data da audiência (DD/MM/AAAA)
  horaAudiencia?: string; // hora da audiência (HH:MM)
  tipoComunicacao?: "audiencia" | "citacao" | "penhora" | "intimacao"; // Tipo de comunicação
  etiquetas?: string[]; // Etiquetas / marcadores
  alvoComunicacao?: boolean;
}

export interface AdvogadoMonitorado {
  id: string;
  nome: string;
  oab: string;
  whatsapp: string;
  monitorar: boolean;
}

export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
}

export interface ProcessoExtraido {
  fileName?: string;
  numeroProcesso: string | null;
  segredoJustica: boolean;
  comarcaTramitacao?: string;
  partes: ParteExtraida[];
}

export interface ProcessoLinha {
  id: string; // unique client row identifier
  processoSeq: number; // 1-indexed process sequence number (shared between multiple parts of the same case)
  numeroProcesso: string;
  segredoJustica: boolean;
  comarcaTramitacao: string;
  
  // Parte level fields
  nome: string;
  polo: string;
  advCadastrado: string;
  whatsapp: string;
  linkWhatsapp: string;
  endereco: string;
  sedeZonaRural: "Sede" | "Zona Rural";
  obs: string;
  menorDeIdade?: string; // "Sim", "Não", or ""
  dataHoraAudiencia?: string; // data e hora da audiência (se houver)
  dataAudiencia?: string; // data da audiência (DD/MM/AAAA)
  horaAudiencia?: string; // hora da audiência (HH:MM)
  tipoComunicacao?: "audiencia" | "citacao" | "penhora" | "intimacao"; // Tipo de comunicação
  citado?: boolean; // checkbox indicating successful citation/service
  dataCadastramento?: string; // ISO string date of registration
  dataCumprimento?: string | null; // ISO string date of completion
  etiquetas?: string[]; // Etiquetas / marcadores
  criadoPorEmail?: string; // Email of user who registered this process row
  criadoPorUid?: string; // UID of user who registered this process row
  alvoComunicacao?: boolean;
}
