import React from "react";
import { motion } from "motion/react";
import { 
  FileText, CheckCircle2, Trash2, Plus, 
  MapPin, ShieldAlert, Phone, User, Landmark, HelpCircle, XCircle, Baby, Calendar, ArrowLeft, ExternalLink, Clock
} from "lucide-react";
import { ProcessoExtraido, ParteExtraida } from "../types";

interface PreviewConfirmProps {
  pendingProcesses: ProcessoExtraido[];
  onConfirm: (index: number, updated: ProcessoExtraido) => void;
  onDiscard: (index: number) => void;
  onUpdateProcess: (index: number, updated: ProcessoExtraido) => void;
  existingLinhas?: any[];
  advogadosMonitorados?: any[];
  onBack?: () => void;
}

export function formatBrazilianDate(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

export function formatWhatsappLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // Check if it already has the 55 country code (Brazil)
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    return `https://wa.me/55${digits}`;
  }
  return `https://wa.me/${digits}`;
}

export function detectSedeZonaRural(address: string): "Sede" | "Zona Rural" {
  if (!address) return "Sede";
  const normalized = address.toLowerCase();
  const keywords = [
    "zona rural", 
    "fazenda", 
    "povoado", 
    "assentamento", 
    "distrito", 
    "sítio", 
    "sitio", 
    "chácara", 
    "chacara", 
    "colônia", 
    "colonia"
  ];
  const isRural = keywords.some(kw => normalized.includes(kw));
  return isRural ? "Zona Rural" : "Sede";
}

export default function PreviewConfirm({
  pendingProcesses,
  onConfirm,
  onDiscard,
  onUpdateProcess,
  existingLinhas = [],
  advogadosMonitorados = [],
  onBack,
}: PreviewConfirmProps) {
  const [ocultarMenoresMap, setOcultarMenoresMap] = React.useState<Record<number, boolean>>({});
  const [ocultarPoloAtivoMap, setOcultarPoloAtivoMap] = React.useState<Record<number, boolean>>({});
  const [showOpposingMap, setShowOpposingMap] = React.useState<Record<string, boolean>>({});

  const toggleOpposing = (procIdx: number, partyIdx: number) => {
    const key = `${procIdx}-${partyIdx}`;
    setShowOpposingMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const hasAdv = (adv: string | null | undefined) => {
    if (!adv) return false;
    const norm = adv.trim().toLowerCase();
    return (
      norm !== "" && 
      norm !== "não consta" && 
      norm !== "nao consta" && 
      norm !== "não" && 
      norm !== "nao" && 
      !norm.startsWith("não") && 
      !norm.startsWith("nao") &&
      norm.length > 5
    );
  };

  const determinarTipoPolo = (polo: string | null | undefined): "Ativo" | "Passivo" | "Outro" => {
    if (!polo) return "Outro";
    const p = polo.toLowerCase();
    if (p.includes("autor") || p.includes("requerente") || p.includes("ativo") || p.includes("exequente") || p.includes("reclamante")) return "Ativo";
    if (p.includes("réu") || p.includes("reu") || p.includes("requerido") || p.includes("passivo") || p.includes("executado") || p.includes("reclamado")) return "Passivo";
    return "Outro";
  };

  const getOpposingLawyersInPreview = (process: ProcessoExtraido, currentPartyIndex: number) => {
    const currentParty = process.partes[currentPartyIndex];
    const currentPoloType = determinarTipoPolo(currentParty.polo);
    
    const opposingAdvs = process.partes
      .filter((p, idx) => {
        if (idx === currentPartyIndex) return false;
        const pType = determinarTipoPolo(p.polo);
        if (currentPoloType === "Ativo") return pType === "Passivo" && hasAdv(p.advCadastrado);
        if (currentPoloType === "Passivo") return pType === "Ativo" && hasAdv(p.advCadastrado);
        return pType !== "Outro" && hasAdv(p.advCadastrado);
      })
      .map(p => p.advCadastrado);

    return Array.from(new Set(opposingAdvs));
  };

  const isAlreadySaved = (numProc: string | null) => {
    if (!numProc) return false;
    const clean = (s: string) => s.replace(/\D/g, "");
    const cleanNum = clean(numProc);
    if (!cleanNum) return false;
    return existingLinhas.some((l) => clean(l.numeroProcesso) === cleanNum);
  };

  const isPartyFiltered = (party: ParteExtraida, procIndex: number) => {
    const isMinor = party.menorDeIdade === "Sim" || party.menorDeIdade === "sim";
    const isActive = party.polo && (
      party.polo.toLowerCase().includes("autor") ||
      party.polo.toLowerCase().includes("requerente") ||
      party.polo.toLowerCase().includes("ativo") ||
      party.polo.toLowerCase().includes("exequente") ||
      party.polo.toLowerCase().includes("reclamante")
    );
    
    const ocultarMenores = ocultarMenoresMap[procIndex] !== false;
    const ocultarPoloAtivo = ocultarPoloAtivoMap[procIndex] !== false;

    if (ocultarMenores && isMinor) {
      return true;
    }
    if (ocultarPoloAtivo && isActive) {
      return true;
    }
    return false;
  };

  const checkMonitoredLawyer = (process: ProcessoExtraido, currentPartyIndex: number) => {
    const currentParty = process.partes[currentPartyIndex];
    if (currentParty.advCadastrado && currentParty.advCadastrado.trim().length > 5 && currentParty.advCadastrado.toLowerCase() !== "não informado" && currentParty.advCadastrado.toLowerCase() !== "não consta") {
      return null;
    }

    const monitoredInList = advogadosMonitorados.filter((adv) => adv.monitorar);
    
    for (let i = 0; i < process.partes.length; i++) {
      if (i === currentPartyIndex) continue;
      const otherParty = process.partes[i];
      if (otherParty.advCadastrado) {
        const found = monitoredInList.find(adv => 
          (adv.nome && otherParty.advCadastrado.toLowerCase().includes(adv.nome.toLowerCase())) || 
          (adv.oab && otherParty.advCadastrado.includes(adv.oab))
        );
        if (found) {
          return { found, otherPartyName: otherParty.nome };
        }
      }
    }
    return null;
  };

  const handleProcessChange = (procIndex: number, field: string, value: any) => {
    const updated = { ...pendingProcesses[procIndex], [field]: value };
    onUpdateProcess(procIndex, updated);
  };

  const handlePartyChange = (
    procIndex: number, 
    partyIndex: number, 
    field: keyof ParteExtraida, 
    value: any
  ) => {
    const process = pendingProcesses[procIndex];
    const updatedParties = [...process.partes];
    
    // Create updated party
    const updatedParty = { ...updatedParties[partyIndex], [field]: value };
    
    // Auto detection of Sede/Zona Rural if address is edited
    if (field === "endereco") {
      updatedParty.sedeZonaRural = detectSedeZonaRural(value);
    }

    // Sync dataHoraAudiencia when dataAudiencia or horaAudiencia is updated
    if (field === "dataAudiencia" || field === "horaAudiencia") {
      const d = field === "dataAudiencia" ? value : (updatedParty.dataAudiencia || "");
      const h = field === "horaAudiencia" ? value : (updatedParty.horaAudiencia || "");
      if (d && h) {
        updatedParty.dataHoraAudiencia = `${d} às ${h}`;
      } else if (d) {
        updatedParty.dataHoraAudiencia = d;
      } else if (h) {
        updatedParty.dataHoraAudiencia = h;
      } else {
        updatedParty.dataHoraAudiencia = "";
      }
    }
    
    updatedParties[partyIndex] = updatedParty;
    onUpdateProcess(procIndex, { ...process, partes: updatedParties });
  };

  const addParty = (procIndex: number) => {
    const process = pendingProcesses[procIndex];
    const newParty: ParteExtraida = {
      nome: "",
      polo: "Réu",
      menorDeIdade: "",
      dataHoraAudiencia: "",
      advCadastrado: "NÃO consta",
      whatsapp: "",
      endereco: "",
      sedeZonaRural: "Sede",
      obs: ""
    };
    onUpdateProcess(procIndex, { ...process, partes: [...process.partes, newParty] });
  };

  const removeParty = (procIndex: number, partyIndex: number) => {
    const process = pendingProcesses[procIndex];
    if (process.partes.length <= 1) {
      alert("O processo precisa conter ao menos uma parte qualificada.");
      return;
    }
    const updatedParties = process.partes.filter((_, idx) => idx !== partyIndex);
    onUpdateProcess(procIndex, { ...process, partes: updatedParties });
  };

  if (pendingProcesses.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {onBack && (
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 font-semibold text-sm rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft size={16} className="text-slate-500" />
            <span>Voltar para Anexar Peças</span>
          </button>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-4 shadow-sm">
        <ShieldAlert className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="font-semibold text-amber-800 text-sm">Etapa de Conferência Obrigatória</h4>
          <p className="text-slate-600 text-xs mt-1 leading-relaxed">
            Abaixo estão os dados extraídos dos arquivos usando Inteligência Artificial. Por favor, 
            <strong> configure, revise e corrija</strong> quaisquer divergências ou dados ausentes antes de clicar em 
            <em> "Confirmar e adicionar"</em>.
          </p>
        </div>
      </div>

      {pendingProcesses.map((process, procIndex) => (
        <motion.div
          key={procIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
        >
          {/* Header of Process Card */}
          <div className="px-6 py-5 bg-slate-50/70 border-b border-slate-150 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <FileText size={20} />
              </div>
              <div>
                <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">
                  Documento: {process.fileName || "Importado"}
                </span>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">
                    Dados do Processo Judicial
                  </h3>
                  {isAlreadySaved(process.numeroProcesso) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-red-100 text-red-800 border border-red-200 uppercase tracking-wider animate-pulse">
                      <ShieldAlert size={12} className="text-red-700 stroke-[2.5]" />
                      PROCESSO JÁ ENVIADO ANTES!
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Process Number Field */}
              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-slate-505 font-mono text-[11px] uppercase tracking-wider">PROCESSO CNJ:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={process.numeroProcesso || ""}
                    onChange={(e) => handleProcessChange(procIndex, "numeroProcesso", e.target.value)}
                    placeholder="0000000-00.0000.0.00.0000"
                    className={`px-3 py-1.5 border rounded-lg text-sm font-mono focus:ring-1 w-56 text-slate-900 font-medium shadow-inner ${
                      isAlreadySaved(process.numeroProcesso)
                        ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500"
                        : "border-slate-350 bg-white focus:border-emerald-500 focus:ring-emerald-500"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Opções de Filtro de Importação */}
          <div className="bg-slate-100/90 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-6 text-xs text-slate-700">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
              Filtros Pré-Importação:
            </span>
            
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ocultarMenoresMap[procIndex] !== false}
                onChange={(e) => setOcultarMenoresMap({
                  ...ocultarMenoresMap,
                  [procIndex]: e.target.checked
                })}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="font-semibold flex items-center gap-1 text-slate-700">
                <Baby size={14} className="text-emerald-600" />
                Ocultar Menores de Idade (Importar apenas o representante)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ocultarPoloAtivoMap[procIndex] !== false}
                onChange={(e) => setOcultarPoloAtivoMap({
                  ...ocultarPoloAtivoMap,
                  [procIndex]: e.target.checked
                })}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="font-semibold flex items-center gap-1 text-slate-700">
                <Landmark size={14} className="text-emerald-600" />
                Ocultar Parte Requerente / Polo Ativo
              </span>
            </label>
          </div>

          {/* Form Body for individual parties */}
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                Qualificação das Partes / Réus ({process.partes.length})
              </h4>
              <button
                type="button"
                onClick={() => addParty(procIndex)}
                className="px-3.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1.5 transition-all border border-emerald-200 focus:outline-none shadow-sm"
              >
                <Plus size={14} /> Adicionar Parte
              </button>
            </div>

            <div className="space-y-6">
              {process.partes.map((party, partyIndex) => {
                const isFiltered = isPartyFiltered(party, procIndex);
                return (
                  <div 
                    key={partyIndex}
                    className={`p-5 border transition-all relative overflow-hidden rounded-2xl ${
                      isFiltered 
                        ? "border-rose-200 bg-rose-50/20 opacity-60 grayscale" 
                        : "border-slate-201 bg-slate-50/40 hover:bg-slate-50/80"
                    }`}
                  >
                    {/* Absolute header tag for visual differentiation */}
                    <div className="flex justify-between items-center border-b border-slate-150 pb-4 mb-4 gap-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${
                          isFiltered ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-700"
                        }`}>
                          Parte #{partyIndex + 1}
                        </span>
                        {isFiltered && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-100/50 border border-rose-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Excluído pelo Filtro Pré-Importação
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeParty(procIndex, partyIndex)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-slate-100 transition-all focus:outline-none"
                        title="Deletar parte"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {(() => {
                      const monitoredLawyer = checkMonitoredLawyer(process, partyIndex);
                      if (monitoredLawyer) {
                        return (
                          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 shadow-sm animate-pulse-slow">
                            <div className="flex items-start gap-2.5">
                              <ShieldAlert size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                <h5 className="text-xs font-bold text-amber-800 uppercase tracking-tight">Oportunidade de Contato!</h5>
                                <p className="text-xs text-amber-700/90 leading-snug">
                                  Esta parte está sem advogado, mas a outra parte ({monitoredLawyer.otherPartyName}) possui um <strong>Advogado Monitorado</strong> cadastrado: <span className="font-bold">{monitoredLawyer.found.nome}</span>. 
                                  Você pode solicitar o contato dessa parte para o advogado adversário!
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Nome completo */}
                    <div className="space-y-1 md:col-span-2 lg:col-span-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                          <User size={13} className="text-emerald-600" /> Nome Completo
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md hover:bg-slate-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={party.alvoComunicacao !== false}
                            onChange={(e) => handlePartyChange(procIndex, partyIndex, "alvoComunicacao", e.target.checked as any)}
                            className="w-3 h-3 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                          />
                          <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">
                            Expedir
                          </span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={party.nome}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "nome", e.target.value)}
                        placeholder="Nome completo da parte"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                        required
                      />
                    </div>

                    {/* Polo */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <Landmark size={13} className="text-emerald-600" /> Polo Processual
                      </label>
                      <select
                        value={party.polo}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "polo", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium shadow-inner"
                      >
                        <option value="Autor">Autor</option>
                        <option value="Requerente">Requerente</option>
                        <option value="Réu">Réu</option>
                        <option value="Requerido">Requerido</option>
                        <option value="Representante">Representante</option>
                        <option value="Representado">Representado</option>
                        <option value="Terceiro interessado">Terceiro interessado</option>
                      </select>
                    </div>

                    {/* Menor de idade */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <Baby size={13} className="text-emerald-600" /> Menor de Idade?
                      </label>
                      <select
                        value={party.menorDeIdade || ""}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "menorDeIdade", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium shadow-inner"
                      >
                        <option value="">Deixar em branco / Não conferido</option>
                        <option value="Sim">Sim (Menor de Idade)</option>
                        <option value="Não">Não (Maior de Idade)</option>
                      </select>
                    </div>

                    {/* Tipo de Comunicação */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <Calendar size={13} className="text-emerald-600" /> Tipo de Comunicação
                      </label>
                      <select
                        value={party.tipoComunicacao || "citacao"}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "tipoComunicacao", e.target.value as any)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 font-bold shadow-sm transition-colors duration-150 ${
                          party.tipoComunicacao === "audiencia"
                            ? "bg-purple-100 text-purple-900 border-purple-300 focus:border-purple-500 focus:ring-purple-500"
                            : party.tipoComunicacao === "intimacao"
                            ? "bg-teal-100 text-teal-900 border-teal-300 focus:border-teal-500 focus:ring-teal-500"
                            : party.tipoComunicacao === "penhora"
                            ? "bg-amber-100 text-amber-900 border-amber-300 focus:border-amber-500 focus:ring-amber-500"
                            : "bg-blue-100 text-blue-900 border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                        }`}
                      >
                        <option value="citacao">Citação</option>
                        <option value="audiencia">Audiência</option>
                        <option value="penhora">Penhora</option>
                        <option value="intimacao">Intimação</option>
                      </select>
                    </div>

                    {/* Prazos Judiciais SLA */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <Calendar size={13} className="text-emerald-600" /> Data de Recebimento
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        value={party.dataRecebimento || ""}
                        onChange={(e) => {
                          const formatted = formatBrazilianDate(e.target.value);
                          handlePartyChange(procIndex, partyIndex, "dataRecebimento", formatted);
                        }}
                        placeholder="DD/MM/AAAA"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner font-semibold"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <Clock size={13} className="text-emerald-600" /> Prazo (Dias)
                      </label>
                      <select
                        value={party.prazoDias || ""}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "prazoDias", e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner font-semibold"
                      >
                        <option value="">Sem prazo</option>
                        <option value="5">5 dias</option>
                        <option value="15">15 dias</option>
                        <option value="20">20 dias</option>
                        <option value="30">30 dias</option>
                        <option value="45">45 dias</option>
                        <option value="60">60 dias</option>
                      </select>
                    </div>

                    {/* Data/Hora da Audiência como 2 campos distintos */}
                    {(party.tipoComunicacao === "audiencia" || party.dataHoraAudiencia || party.dataAudiencia || party.horaAudiencia) && (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                            <Calendar size={13} className="text-emerald-600" /> Data da Audiência (XX/XX/XXXX)
                          </label>
                          <input
                            type="text"
                            maxLength={10}
                            value={party.dataAudiencia || ""}
                            onChange={(e) => {
                              const formatted = formatBrazilianDate(e.target.value);
                              handlePartyChange(procIndex, partyIndex, "dataAudiencia", formatted);
                            }}
                            placeholder="DD/MM/AAAA"
                            className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner font-semibold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                            <Calendar size={13} className="text-emerald-600" /> Hora da Audiência (HH:MM)
                          </label>
                          <input
                            type="text"
                            maxLength={5}
                            value={party.horaAudiencia || ""}
                            onChange={(e) => {
                              let val = e.target.value.replace(/\D/g, "");
                              if (val.length > 2) {
                                val = `${val.slice(0, 2)}:${val.slice(2, 4)}`;
                              }
                              handlePartyChange(procIndex, partyIndex, "horaAudiencia", val);
                            }}
                            placeholder="HH:MM"
                            className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner font-semibold"
                          />
                        </div>
                      </>
                    )}

                    {/* Advogado Cadastrado */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-tight">
                        Advogado Constituído / Cadastrado
                      </label>
                      <input
                        type="text"
                        value={party.advCadastrado}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "advCadastrado", e.target.value)}
                        placeholder="[Nome do Advogado] (OAB/... ) ou NÃO consta"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner font-bold"
                      />
                    </div>

                    {/* Advogado da Parte Contrária Card */}
                    {(() => {
                      const opposingAdvs = getOpposingLawyersInPreview(process, partyIndex);
                      if (opposingAdvs.length === 0) return null;
                      
                      const showKey = `${procIndex}-${partyIndex}`;
                      const isShowing = showOpposingMap[showKey];

                      return (
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-rose-600 uppercase tracking-tight">
                            Advogado da Parte Contrária
                          </label>
                          <div 
                            onClick={() => toggleOpposing(procIndex, partyIndex)}
                            className={`p-3 border rounded-xl cursor-pointer transition-all ${
                              isShowing 
                                ? "bg-rose-50 border-rose-200 shadow-sm" 
                                : "bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/30"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                isShowing ? "text-rose-600" : "text-slate-500"
                              }`}>
                                {isShowing ? "Informações Visíveis" : "Informações Ocultas"}
                              </span>
                              <span className="text-[10px] font-bold text-rose-500 uppercase">
                                {isShowing ? "Ocultar" : "Mostrar"}
                              </span>
                            </div>
                            {isShowing ? (
                              <div className="space-y-1.5">
                                {opposingAdvs.map((adv, idx) => (
                                  <div key={idx} className="text-xs font-bold text-rose-700 bg-rose-100/50 px-2 py-1 rounded border border-rose-200/50">
                                    {adv}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] font-medium text-slate-400 italic">
                                Clique para desocultar advogado adverso...
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Endereço */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <MapPin size={13} className="text-emerald-600" /> Endereço Completo
                      </label>
                      <input
                        type="text"
                        value={party.endereco}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "endereco", e.target.value)}
                        placeholder="Logradouro, Nº, Bairro, Cidade/UF, CEP"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                        required
                      />
                      {party.endereco && party.endereco.trim().length > 0 && (
                        <div className="pt-1 flex">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(party.endereco)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all text-xs font-semibold cursor-pointer shadow-sm"
                          >
                            <MapPin size={12} className="text-emerald-500" />
                            <span>Abrir Google Maps</span>
                            <ExternalLink size={11} className="text-emerald-400" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Sede / Zona Rural */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-tight">
                        Classificação Localidade (Sede / Zona Rural)
                      </label>
                      <select
                        value={party.sedeZonaRural}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "sedeZonaRural", e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium shadow-inner"
                      >
                        <option value="Sede">Sede</option>
                        <option value="Zona Rural">Zona Rural</option>
                      </select>
                    </div>

                    {/* WhatsApp */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <Phone size={13} className="text-emerald-600" /> Telefone / WhatsApp da Parte
                      </label>
                      <div className="relative">
                        <input
                           type="text"
                           value={party.whatsapp || ""}
                           onChange={(e) => handlePartyChange(procIndex, partyIndex, "whatsapp", e.target.value)}
                           placeholder="DDD e número (apenas dígitos)"
                           className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono shadow-inner"
                        />
                      </div>
                      {party.whatsapp && (
                        <p className="text-[11px] text-emerald-600 font-mono italic">
                          Link gerado: {formatWhatsappLink(party.whatsapp)}
                        </p>
                      )}
                    </div>

                    {/* Observações */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1 uppercase tracking-tight">
                        <HelpCircle size={13} className="text-emerald-600" /> Observações para o Ofício Judicial
                      </label>
                      <textarea
                        value={party.obs}
                        onChange={(e) => handlePartyChange(procIndex, partyIndex, "obs", e.target.value)}
                        placeholder="Requisitos de precatória, menores, réu desatendido, citações via WhatsApp, etc."
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-normal shadow-inner"
                      />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Action Footer for the Process Card */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => onDiscard(procIndex)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-red-500 hover:bg-slate-100 rounded-xl transition-all border border-transparent hover:border-slate-200 focus:outline-none flex items-center gap-1.5"
            >
              <XCircle size={15} /> Descartar
            </button>
            <button
              type="button"
              onClick={() => {
                const filteredPartes = process.partes.filter(p => !isPartyFiltered(p, procIndex));
                if (filteredPartes.length === 0) {
                  alert("Todas as partes deste processo foram ocultadas pelos filtros pré-importação. Para confirmar, desmarque os filtros ou certifique-se de que ao menos uma parte permaneça visível.");
                  return;
                }
                onConfirm(procIndex, { ...process, partes: filteredPartes });
              }}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all border border-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-emerald-500 flex items-center gap-1.5 uppercase tracking-wide cursor-pointer"
            >
              <CheckCircle2 size={15} /> Confirmar e Adicionar à Relação
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
