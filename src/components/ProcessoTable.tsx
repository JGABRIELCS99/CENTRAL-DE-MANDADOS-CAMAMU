import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowUpDown, Search, FileDown, Trash2, Globe, ExternalLink, 
  Smile, Filter, ChevronUp, ChevronDown, RefreshCw, AlertCircle, Edit2, Check, Baby, Calendar, Send
} from "lucide-react";
import * as XLSX from "xlsx";
import { ProcessoLinha, Etiqueta, AdvogadoMonitorado } from "../types";
import { formatWhatsappLink } from "./PreviewConfirm";

// Helper to determine role (Polo) display order requested by user:
// 1. Autor, Requerente
// 2. Representante
// 3. Réu, Requerido
// 4. Representado
// 5. Outros / Terceiros
export function getPoloPriority(polo: string): number {
  if (!polo) return 99;
  const p = polo.trim().toLowerCase();
  if (p.includes("autor") || p.includes("requerente") || p.includes("exequente") || p.includes("ativo") || p.includes("reclamante")) return 1;
  if (p.includes("representante")) return 2;
  if (p.includes("réu") || p.includes("reu") || p.includes("requerido") || p.includes("executado") || p.includes("passivo") || p.includes("reclamado")) return 3;
  if (p.includes("representado")) return 4;
  return 5;
}

export function determinarTipoPolo(polo: string): "Ativo" | "Passivo" | "Outro" {
  if (!polo) return "Outro";
  const p = polo.trim().toLowerCase();
  if (p.includes("autor") || p.includes("requerente") || p.includes("exequente") || p.includes("representante") || p.includes("ativo") || p.includes("reclamante")) return "Ativo";
  if (p.includes("réu") || p.includes("reu") || p.includes("requerido") || p.includes("executado") || p.includes("representado") || p.includes("passivo") || p.includes("reclamado")) return "Passivo";
  return "Outro";
}

// Helper to check if lawyer exists (not 'NÃO consta' or empty)
export function hasAdv(adv: string | null | undefined): boolean {
  if (!adv) return false;
  const norm = adv.trim().toLowerCase();
  return (
    norm !== "" && 
    norm !== "não consta" && 
    norm !== "nao consta" && 
    norm !== "não" && 
    norm !== "nao" && 
    !norm.startsWith("não") && 
    !norm.startsWith("nao")
  );
}

interface ProcessoTableProps {
  linhas: ProcessoLinha[];
  onDeleteLinha: (id: string) => void;
  onDeleteProcesso: (numero: string) => void;
  onClearTable: () => void;
  onUpdateLinha: (id: string, updatedFields: Partial<ProcessoLinha>) => void;
  waTemplate: string;
  linkAudiencia: string;
  etiquetas?: Etiqueta[];
  advogados?: AdvogadoMonitorado[];
}

type SortKey = keyof ProcessoLinha | "";

interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

export default function ProcessoTable({
  linhas,
  onDeleteLinha,
  onDeleteProcesso,
  onClearTable,
  onUpdateLinha,
  waTemplate,
  linkAudiencia,
  etiquetas = [],
  advogados = [],
}: ProcessoTableProps) {
  // Helper to dynamically compute WhatsApp link with custom message templates
  const getWhatsAppUrl = (phone: string | null | undefined, nome: string, numeroProcesso: string, dataHoraAudiencia?: string) => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (!digits) return "";
    
    const formattedText = waTemplate
      .replace(/{nome}/g, nome || "")
      .replace(/{processo}/g, numeroProcesso || "")
      .replace(/{audiencia}/g, dataHoraAudiencia || "Não definida")
      .replace(/{link_audiencia}/g, linkAudiencia);

    const phonePart = digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")
      ? `55${digits}`
      : digits;

    return `https://wa.me/${phonePart}?text=${encodeURIComponent(formattedText)}`;
  };

  // Helper to parse Brazilian date format for sorting
  const parseBrazilianDate = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 9999999999999; // Empty dates go to end
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const year = parseInt(match[3]);
      let hours = 0;
      let minutes = 0;
      const timeMatch = dateStr.match(/(\d{2})[:h](\d{2})/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
      }
      return new Date(year, month, day, hours, minutes).getTime();
    }
    return 9999999999999;
  };

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPolo, setFilterPolo] = useState("Todos");
  const [filterAdv, setFilterAdv] = useState("Todos"); // "Todos", "Sim", "Não"
  const [filterLocalidade, setFilterLocalidade] = useState("Todos"); // "Todos", "Sede", "Zona Rural"
  const [filterTipoComunicacao, setFilterTipoComunicacao] = useState("Todos"); // "Todos", "audiencia", etc
  const [filterEtiqueta, setFilterEtiqueta] = useState("Todos");
  const [groupProcess, setGroupProcess] = useState(true); // default true for clean layout
  
  // Sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "processoSeq", direction: "asc" });

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProcessoLinha>>({});

  // List of unique values for quick filters dropdowns
  const uniquePolos = useMemo(() => {
    const list = new Set(linhas.map((l) => l.polo));
    return ["Todos", ...Array.from(list)];
  }, [linhas]);

  const uniqueEtiquetas = useMemo(() => {
    const set = new Set<string>();
    linhas.forEach((l) => {
      if (l.etiquetas) {
        l.etiquetas.forEach((tag) => {
          if (tag && tag.trim()) {
            set.add(tag.trim());
          }
        });
      }
    });
    return ["Todos", ...Array.from(set)];
  }, [linhas]);

  // Expanded state for summary accordion of processes
  const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({});
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  // Toggle for opposing counsel visibility
  const [showOpposing, setShowOpposing] = useState<Record<string, boolean>>({});

  const toggleOpposing = (linhaId: string) => {
    setShowOpposing((prev) => ({
      ...prev,
      [linhaId]: !prev[linhaId],
    }));
  };

  const getAdvogadasContrarias = (linha: ProcessoLinha) => {
    // We look for all lines in the same process
    const currentProcessLines = linhas.filter(l => l.numeroProcesso === linha.numeroProcesso);
    const currentTipo = determinarTipoPolo(linha.polo);
    
    // Opposing sides: Ativo vs Passivo
    const opposingLinhas = currentProcessLines.filter(l => {
      const tipo = determinarTipoPolo(l.polo);
      // If I'm Ativo, opposing is Passivo. If I'm Passivo, opposing is Ativo.
      // If I'm Outro, I see everyone else who has a lawyer.
      if (currentTipo === "Ativo") return tipo === "Passivo" && hasAdv(l.advCadastrado);
      if (currentTipo === "Passivo") return tipo === "Ativo" && hasAdv(l.advCadastrado);
      return tipo !== "Outro" && hasAdv(l.advCadastrado);
    });

    return Array.from(new Set(opposingLinhas.map(l => l.advCadastrado)));
  };

  const toggleProcess = (numeroProcesso: string) => {
    setExpandedProcesses((prev) => ({
      ...prev,
      [numeroProcesso]: !prev[numeroProcesso],
    }));
  };

  // Request sort helper
  const requestSort = (key: keyof ProcessoLinha) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // Export handlers
  const handleExportExcel = () => {
    if (linhas.length === 0) return;
    const exportData = filteredAndSortedLinhas.map((linha) => ({
      "Nº Sequencial": linha.processoSeq,
      "Número do Processo": linha.numeroProcesso,
      "Parte / Nome": linha.nome,
      "Polo": determinarTipoPolo(linha.polo),
      "Tipo": linha.polo,
      "Menor de Idade": linha.menorDeIdade || "",
      "Data/Hora Audiência": linha.dataHoraAudiencia || "",
      "Citado?": linha.citado ? "Sim" : "Não",
      "Advogado Cadastrado": linha.advCadastrado,
      "WhatsApp": linha.whatsapp || "NÃO consta",
      "Link WhatsApp": getWhatsAppUrl(linha.whatsapp, linha.nome, linha.numeroProcesso, linha.dataHoraAudiencia) || "",
      "Endereço": linha.endereco,
      "Localidade": linha.sedeZonaRural,
      "Observações Gerais": linha.obs,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Controle de Citações");
    
    // Auto-fit column widths
    const maxLens = Object.keys(exportData[0] || {}).map(() => 15);
    exportData.forEach((row: any) => {
      Object.keys(row).forEach((key, colIdx) => {
        const len = String(row[key] || "").length;
        if (len > maxLens[colIdx]) {
          maxLens[colIdx] = Math.min(len, 60); 
        }
      });
    });
    worksheet["!cols"] = maxLens.map((w) => ({ wch: w }));

    XLSX.writeFile(workbook, "Relação_Oficial_Citações_TJBA.xlsx");
  };

  const handleExportCSV = () => {
    if (linhas.length === 0) return;
    const headers = [
      "Nº Sequencial",
      "Número do Processo",
      "Parte / Nome",
      "Polo",
      "Tipo",
      "Menor de Idade",
      "Data/Hora Audiência",
      "Citado?",
      "Advogado Cadastrado",
      "WhatsApp",
      "Link WhatsApp",
      "Endereço",
      "Sede / Zona Rural",
      "Observações"
    ];
    
    // Semi-colon separation works perfectly with Excel in PT-BR environments
    const csvRows = [headers.join(";")];
    
    filteredAndSortedLinhas.forEach((linha) => {
      const row = [
        linha.processoSeq,
        `"${linha.numeroProcesso.replace(/"/g, '""')}"`,
        `"${linha.nome.replace(/"/g, '""')}"`,
        `"${determinarTipoPolo(linha.polo)}"`,
        `"${linha.polo.replace(/"/g, '""')}"`,
        `"${(linha.menorDeIdade || "").replace(/"/g, '""')}"`,
        `"${(linha.dataHoraAudiencia || "").replace(/"/g, '""')}"`,
        `"${linha.citado ? "Sim" : "Não"}"`,
        `"${linha.advCadastrado.replace(/"/g, '""')}"`,
        `"${(linha.whatsapp || "").replace(/"/g, '""')}"`,
        `"${(getWhatsAppUrl(linha.whatsapp, linha.nome, linha.numeroProcesso, linha.dataHoraAudiencia) || "").replace(/"/g, '""')}"`,
        `"${linha.endereco.replace(/"/g, '""')}"`,
        `"${linha.sedeZonaRural}"`,
        `"${linha.obs.replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(";"));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Relação_Oficial_Citações_TJBA.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Inline editing actions
  const startEdit = (linha: ProcessoLinha) => {
    setEditingId(linha.id);
    setEditValues({ ...linha });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = (id: string) => {
    // Regenerate WhatsApp Link if WhatsApp has been modified
    if (editValues.whatsapp !== undefined) {
      editValues.linkWhatsapp = formatWhatsappLink(editValues.whatsapp);
    }
    onUpdateLinha(id, editValues);
    setEditingId(null);
    setEditValues({});
  };

  // Master Filter and Sorter Computation
  const filteredAndSortedLinhas = useMemo(() => {
    let result = [...linhas];

    // 1. Live text search
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          l.nome.toLowerCase().includes(search) ||
          l.numeroProcesso.toLowerCase().includes(search) ||
          l.endereco.toLowerCase().includes(search) ||
          l.obs.toLowerCase().includes(search) ||
          l.advCadastrado.toLowerCase().includes(search)
      );
    }

    // 2. Filter Polo
    if (filterPolo !== "Todos") {
      result = result.filter((l) => l.polo === filterPolo);
    }

    // 3. Filter Advogado Cadastrado
    if (filterAdv !== "Todos") {
      if (filterAdv === "Sim") {
        result = result.filter((l) => hasAdv(l.advCadastrado));
      } else {
        result = result.filter((l) => !hasAdv(l.advCadastrado));
      }
    }

    // 4. Filter Localidade (Sede/Rural)
    if (filterLocalidade !== "Todos") {
      result = result.filter((l) => l.sedeZonaRural === filterLocalidade);
    }

    // 4.1 Filter Tipo de Comunicação
    if (filterTipoComunicacao !== "Todos") {
      result = result.filter((l) => l.tipoComunicacao === filterTipoComunicacao);
    }

    // 4.2 Filter Etiquetas
    if (filterEtiqueta !== "Todos") {
      result = result.filter((l) => l.etiquetas && l.etiquetas.includes(filterEtiqueta));
    }

    // 5. Sorting
    if (sortConfig.key) {
      const key = sortConfig.key;
      result.sort((a, b) => {
        if (key === "processoSeq") {
          if (a.processoSeq !== b.processoSeq) {
            return sortConfig.direction === "asc"
              ? a.processoSeq - b.processoSeq
              : b.processoSeq - a.processoSeq;
          }
          // Secondary Sort: Polo Priority within the same process
          const priorityA = getPoloPriority(a.polo);
          const priorityB = getPoloPriority(b.polo);
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          return a.nome.localeCompare(b.nome, "pt-BR");
        }

        if (key === "dataHoraAudiencia") {
          const dateA = parseBrazilianDate(a.dataHoraAudiencia);
          const dateB = parseBrazilianDate(b.dataHoraAudiencia);
          if (dateA !== dateB) {
            return sortConfig.direction === "asc" ? dateA - dateB : dateB - dateA;
          }
        }

        let valA = a[key];
        let valB = b[key];

        if (typeof valA === "number" && typeof valB === "number") {
          if (valA !== valB) {
            return sortConfig.direction === "asc" ? valA - valB : valB - valA;
          }
        } else {
          // String comparison
          const strA = String(valA || "").toLowerCase();
          const strB = String(valB || "").toLowerCase();
          if (strA !== strB) {
            return sortConfig.direction === "asc"
              ? strA.localeCompare(strB, "pt-BR")
              : strB.localeCompare(strA, "pt-BR");
          }
        }

        // Tertiary fallback: Polo Priority within same sorted values
        const priorityA = getPoloPriority(a.polo);
        const priorityB = getPoloPriority(b.polo);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
    }

    // 6. Grouping by process visually if toggle is enabled
    // We achieve this sorting by processoSeq as primary, to make sure same processes stay contiguous,
    // unless another sorting is requested. If sorting key is processoSeq or numeroProcesso, grouping is natural.
    if (groupProcess && sortConfig.key === "processoSeq") {
      // already sorted by default processoSeq
    }

    return result;
  }, [linhas, searchTerm, filterPolo, filterAdv, filterLocalidade, filterTipoComunicacao, filterEtiqueta, sortConfig, groupProcess]);

  // Group processes by numeroProcesso based on active filteredAndSortedLinhas
  const processosAgrupados = useMemo(() => {
    const mapUnique: Record<string, ProcessoLinha[]> = {};
    const orderedProcesses: string[] = [];

    filteredAndSortedLinhas.forEach((linha) => {
      if (!mapUnique[linha.numeroProcesso]) {
        mapUnique[linha.numeroProcesso] = [];
        orderedProcesses.push(linha.numeroProcesso);
      }
      mapUnique[linha.numeroProcesso].push(linha);
    });

    return orderedProcesses.map((num) => {
      // Sort lines within each process group by getPoloPriority
      const sortedLinhas = [...mapUnique[num]].sort((a, b) => {
        const priorityA = getPoloPriority(a.polo);
        const priorityB = getPoloPriority(b.polo);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
      return {
        numeroProcesso: num,
        linhas: sortedLinhas,
      };
    });
  }, [filteredAndSortedLinhas]);

  // Clean filters helper
  const resetFilters = () => {
    setSearchTerm("");
    setFilterPolo("Todos");
    setFilterAdv("Todos");
    setFilterLocalidade("Todos");
    setFilterTipoComunicacao("Todos");
    setFilterEtiqueta("Todos");
    setSortConfig({ key: "processoSeq", direction: "asc" });
  };

  const getSortIcon = (key: keyof ProcessoLinha) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={13} className="text-slate-550" />;
    return sortConfig.direction === "asc" 
      ? <ChevronUp size={13} className="text-emerald-400 font-bold" />
      : <ChevronDown size={13} className="text-emerald-400 font-bold" />;
  };

  if (linhas.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-lg">
        <div className="max-w-md mx-auto space-y-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full inline-block">
            <Globe size={40} className="stroke-1.5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Nenhum processo confirmado ainda</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Envie PDFs jurídicos no painel superior e confirme os dados extraídos pela IA para montar 
              sua tabela cumulativa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters Hub */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Main search input */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por parte, número de processo, OAB, endereço ou observações..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 shadow-inner"
            />
          </div>

          {/* Quick Info & Export Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg uppercase tracking-wider">
              Total: {filteredAndSortedLinhas.length} de {linhas.length} linhas
            </span>

            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <FileDown size={14} /> Exportar Excel (.xlsx)
            </button>

            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
            >
              <FileDown size={14} /> Exportar CSV
            </button>

            <button
              onClick={() => {
                if (confirm("Deseja realmente limpar toda a relação de processos da sessão? Esta ação é irreversível.")) {
                  onClearTable();
                }
              }}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 cursor-pointer"
              title="Limpar Relação"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Dropdowns Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200 items-center">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Polo:</span>
            <select
              value={filterPolo}
              onChange={(e) => setFilterPolo(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 flex-1 min-w-0 shadow-sm"
            >
              {uniquePolos.map((polo) => (
                <option key={polo} value={polo}>{polo}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Adv:</span>
            <select
              value={filterAdv}
              onChange={(e) => setFilterAdv(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 flex-1 min-w-0 shadow-sm"
            >
              <option value="Todos">Todos</option>
              <option value="Sim">Advogado Constituído (Sim)</option>
              <option value="Não">Falta Advogado (Não)</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Zona:</span>
            <select
              value={filterLocalidade}
              onChange={(e) => setFilterLocalidade(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 flex-1 min-w-0 shadow-sm"
            >
              <option value="Todos">Todas Localidades</option>
              <option value="Sede">Sede</option>
              <option value="Zona Rural">Zona Rural</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Tipo:</span>
            <select
              value={filterTipoComunicacao}
              onChange={(e) => setFilterTipoComunicacao(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 flex-1 min-w-0 shadow-sm"
            >
              <option value="Todos">Todos os Tipos</option>
              <option value="citacao">Citação</option>
              <option value="audiencia">Audiência</option>
              <option value="penhora">Penhora</option>
              <option value="intimacao">Intimação</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Etiqueta:</span>
            <select
              value={filterEtiqueta}
              onChange={(e) => setFilterEtiqueta(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 flex-1 min-w-0 shadow-sm"
            >
              {uniqueEtiquetas.map((tag) => (
                <option key={tag} value={tag}>{tag === "Todos" ? "Todas" : tag}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 lg:col-span-2 xl:col-span-1">
            <label className="flex items-center space-x-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={groupProcess}
                onChange={(e) => setGroupProcess(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 bg-white border-slate-300 h-3.5 w-3.5 cursor-pointer"
              />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Agrupar</span>
            </label>

            {(searchTerm || filterPolo !== "Todos" || filterAdv !== "Todos" || filterLocalidade !== "Todos" || filterTipoComunicacao !== "Todos" || filterEtiqueta !== "Todos") && (
              <button
                onClick={resetFilters}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 transition-all cursor-pointer"
              >
                <RefreshCw size={11} /> Limpar Filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section 1: Summary List divided by Process */}
      <div className="space-y-4">
        <div className="border-b border-slate-200 pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-555 bg-emerald-500 shadow-md"></span>
            Relação Resumida de Processos
            <span className="text-[10px] font-normal text-slate-500 normal-case">
              (Clique em um processo para visualizar as partes identificadas)
            </span>
          </h3>
        </div>

        <div className="space-y-3">
          {processosAgrupados.map((proc) => {
            const isExpanded = !!expandedProcesses[proc.numeroProcesso];
            return (
              <div 
                key={proc.numeroProcesso}
                className="border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-sm transition-all duration-250 hover:border-slate-300"
              >
                {/* Header clickable bar */}
                <button
                  type="button"
                  onClick={() => toggleProcess(proc.numeroProcesso)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-100/60 text-left transition-all cursor-pointer focus:outline-none"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-extrabold text-slate-800 tracking-wide">
                      PROCESSO: {proc.numeroProcesso}
                    </span>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-0.5 rounded-full font-bold">
                      {proc.linhas.length} {proc.linhas.length === 1 ? "parte localizada" : "partes localizadas"}
                    </span>
                    
                    {/* Compact layout summary inline when collapsed */}
                    {!isExpanded && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 ml-2 border-l border-slate-200 pl-4">
                        {proc.linhas.map((l, idx) => (
                          <span 
                            key={l.id || idx}
                            className={`px-2 py-0.2 rounded-md text-[9px] font-medium border ${
                              determinarTipoPolo(l.polo) === "Ativo"
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : determinarTipoPolo(l.polo) === "Passivo"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {l.nome.split(" ")[0]} ({l.polo})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-slate-500 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {/* Expanded dossier cards list */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-slate-200 bg-slate-50/40 p-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {proc.linhas.map((linha) => (
                          <div 
                            key={linha.id}
                            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-all space-y-4 shadow-sm hover:shadow-md"
                          >
                            {editingId === linha.id ? (
                              <div className="space-y-3">
                                <h3 className="text-xs font-bold text-indigo-700 border-b border-indigo-100 pb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                                  <Edit2 size={12} /> Editar Dados da Parte
                                </h3>
                                
                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Número do Processo</label>
                                  <input
                                    type="text"
                                    value={editValues.numeroProcesso || ""}
                                    onChange={(e) => setEditValues({ ...editValues, numeroProcesso: e.target.value })}
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Nome da Parte</label>
                                  <input
                                    type="text"
                                    value={editValues.nome || ""}
                                    onChange={(e) => setEditValues({ ...editValues, nome: e.target.value })}
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Polo</label>
                                    <select
                                      value={editValues.polo || "Réu"}
                                      onChange={(e) => setEditValues({ ...editValues, polo: e.target.value })}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-sm"
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
                                  <div>
                                    <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Menor de Idade?</label>
                                    <select
                                      value={editValues.menorDeIdade || ""}
                                      onChange={(e) => setEditValues({ ...editValues, menorDeIdade: e.target.value })}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                                    >
                                      <option value="">Deixar em branco</option>
                                      <option value="Sim">Sim</option>
                                      <option value="Não">Não</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Tipo Comunicação</label>
                                    <select
                                      value={editValues.tipoComunicacao || "citacao"}
                                      onChange={(e) => setEditValues({ ...editValues, tipoComunicacao: e.target.value })}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                                    >
                                      <option value="citacao">Citação</option>
                                      <option value="audiencia">Audiência</option>
                                      <option value="penhora">Penhora</option>
                                      <option value="intimacao">Intimação</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Localidade</label>
                                    <select
                                      value={editValues.sedeZonaRural || "Sede"}
                                      onChange={(e) => setEditValues({ ...editValues, sedeZonaRural: e.target.value as any })}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-805 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                                    >
                                      <option value="Sede">Sede</option>
                                      <option value="Zona Rural">Zona Rural</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Data/Hora Audiência</label>
                                  <input
                                    type="text"
                                    value={editValues.dataHoraAudiencia || ""}
                                    onChange={(e) => setEditValues({ ...editValues, dataHoraAudiencia: e.target.value })}
                                    placeholder="ex: 20/06 às 14:00"
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Advogado Cadastrado</label>
                                  <input
                                    type="text"
                                    value={editValues.advCadastrado || ""}
                                    onChange={(e) => setEditValues({ ...editValues, advCadastrado: e.target.value })}
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">WhatsApp (Apenas números)</label>
                                  <input
                                    type="text"
                                    value={editValues.whatsapp || ""}
                                    onChange={(e) => setEditValues({ ...editValues, whatsapp: e.target.value })}
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Endereço Completo</label>
                                  <textarea
                                    value={editValues.endereco || ""}
                                    onChange={(e) => setEditValues({ ...editValues, endereco: e.target.value })}
                                    rows={2}
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 leading-tight focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Observações / Alertas</label>
                                  <textarea
                                    value={editValues.obs || ""}
                                    onChange={(e) => setEditValues({ ...editValues, obs: e.target.value })}
                                    rows={2}
                                    className="mt-1 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 leading-tight focus:ring-1 focus:ring-emerald-500 shadow-inner"
                                  />
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                  <button
                                    onClick={() => saveEdit(linha.id)}
                                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <Check size={14} /> Salvar Alterações
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border border-slate-250 font-bold rounded-xl text-xs transition-all cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      {linha.numeroProcesso}
                                    </span>
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteProcesso(linha.numeroProcesso); }}
                                    className="text-[9px] font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Excluir Processo Inteiro"
                                  >
                                    <Trash2 size={11} /> Excluir Processo
                                  </button>
                                </div>
                                <div className="space-y-3">
                                  {/* Header: Name & Role Badge */}
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <h4 className="text-[9px] font-bold text-slate-450 uppercase tracking-widest leading-none">NOME DA PARTE</h4>
                                      <p className="text-sm font-bold mt-1 leading-snug flex items-center gap-2">
                                        <span className={linha.alvoComunicacao === false ? "text-slate-400 line-through" : "text-slate-800"}>{linha.nome}</span>
                                        {linha.alvoComunicacao !== false && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[9px] uppercase font-bold tracking-widest" title="Alvo da Comunicação">
                                            <Send size={10} /> Alvo
                                          </span>
                                        )}
                                      </p>
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {linha.menorDeIdade?.toLowerCase() === 'sim' && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8.5px] font-bold rounded bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider">
                                            <Baby size={10} className="text-amber-700" /> Menor: {linha.menorDeIdade}
                                          </span>
                                        )}
                                        {linha.dataHoraAudiencia && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8.5px] font-bold rounded bg-indigo-50 text-indigo-800 border border-indigo-200 uppercase tracking-wider" title="Data/Hora Audiência">
                                            <Calendar size={10} className="text-indigo-700" /> Aud: {linha.dataHoraAudiencia}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider flex-shrink-0 border ${
                                        determinarTipoPolo(linha.polo) === "Ativo"
                                          ? "bg-blue-100 text-blue-800 border-blue-200"
                                          : determinarTipoPolo(linha.polo) === "Passivo"
                                          ? "bg-rose-100 text-rose-800 border-rose-200"
                                          : "bg-slate-100 text-slate-700 border-slate-200"
                                      }`}>
                                        {determinarTipoPolo(linha.polo)}
                                      </span>
                                      <span className="text-[8.5px] text-slate-500 font-semibold uppercase tracking-widest">{linha.polo}</span>
                                    </div>
                                  </div>

                                  {/* Advogado */}
                                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                                    <h4 className="text-[9px] font-bold text-slate-450 uppercase tracking-widest leading-none">Advogado Cadastrado</h4>
                                    <p className={`text-xs mt-1 font-medium ${
                                      hasAdv(linha.advCadastrado) 
                                        ? "text-emerald-700 font-bold" 
                                        : "text-slate-500 font-mono italic text-[11px]"
                                    }`}>
                                      {linha.advCadastrado}
                                    </p>

                                    {/* Advogado da Parte Contrária Card */}
                                    {(() => {
                                      const opposingAdvs = getAdvogadasContrarias(linha);
                                      if (opposingAdvs.length === 0) return null;
                                      
                                      const isShowing = showOpposing[linha.id];

                                      return (
                                        <div 
                                          onClick={(e) => { e.stopPropagation(); toggleOpposing(linha.id); }}
                                          className={`mt-2 p-3 border rounded-xl cursor-pointer transition-all shadow-sm ${
                                            isShowing 
                                              ? "bg-rose-50 border-rose-200" 
                                              : "bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/20"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <h4 className={`text-[8px] font-bold uppercase tracking-widest leading-none ${
                                              isShowing ? "text-rose-600" : "text-slate-500"
                                            }`}>
                                              Advogado Parte Contrária
                                            </h4>
                                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-tighter">
                                              {isShowing ? "Ocultar" : "Mostrar"}
                                            </span>
                                          </div>
                                          {isShowing ? (
                                            <div className="mt-2 space-y-1.5">
                                              {opposingAdvs.map((adv, idx) => (
                                                <div key={idx} className="text-[11px] font-bold text-rose-700 bg-rose-100/40 px-2 py-1 rounded border border-rose-200/40 leading-tight">
                                                  {adv}
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="text-[10px] font-medium text-slate-400 italic">
                                              Clique para visualizar...
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {/* Citado? Switch/Checkbox */}
                                  <div 
                                    onClick={() => onUpdateLinha(linha.id, { citado: !linha.citado, dataCumprimento: !linha.citado ? new Date().toISOString() : null })}
                                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                                      linha.citado 
                                        ? "bg-emerald-50/50 border-emerald-200 text-emerald-905" 
                                        : "bg-slate-50 border-slate-150 hover:bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    <span className="text-[10px] font-extrabold flex items-center gap-1.5 uppercase tracking-wider">
                                      <Check size={14} className={linha.citado ? "text-emerald-600 font-black" : "text-slate-400"} />
                                      Citação efetuada?
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={!!linha.citado}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        onUpdateLinha(linha.id, { citado: e.target.checked, dataCumprimento: e.target.checked ? new Date().toISOString() : null });
                                      }}
                                      className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 bg-white border-slate-300 cursor-pointer"
                                    />
                                  </div>

                                  {/* Localidade / Sede ou Zona Rural */}
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-[9px] font-bold text-slate-450 uppercase tracking-widest leading-none">Localidade:</h4>
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                                      linha.sedeZonaRural === "Zona Rural"
                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                        : "bg-sky-50 text-sky-850 border-sky-200"
                                    }`}>
                                      {linha.sedeZonaRural}
                                    </span>
                                  </div>

                                  {/* Endereço */}
                                  <div>
                                    <h4 className="text-[9px] font-bold text-slate-450 uppercase tracking-widest leading-none">Endereço Completo</h4>
                                    <p className="text-xs text-slate-750 leading-relaxed mt-1 bg-slate-50/50 p-1.5 rounded border border-slate-100 shadow-inner">
                                      {linha.endereco || <span className="text-slate-400 italic">Não consta no documento</span>}
                                    </p>
                                  </div>

                                  {/* Observações */}
                                  {linha.obs && (
                                    <div className="pt-2 border-t border-slate-150">
                                      <h4 className="text-[9px] font-bold text-slate-450 uppercase tracking-widest leading-none">Observações / Alertas</h4>
                                      <p className="text-xs text-slate-600 leading-normal mt-1 italic">
                                        {linha.obs}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* WhatsApp Call Button & Edit Actions */}
                                <div className="pt-3 border-t border-slate-150 flex items-center justify-between gap-2">
                                  <div>
                                    <h4 className="text-[9px] font-bold text-slate-450 uppercase tracking-widest">Contato</h4>
                                    <span className="text-xs font-mono text-slate-700 font-semibold">{linha.whatsapp || "Não cadastrado"}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(linha)}
                                      className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer border border-slate-100 bg-slate-50 hover:shadow-sm"
                                      title="Editar"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm("Deseja realmente excluir esta parte do processo?")) {
                                          onDeleteLinha(linha.id);
                                        }
                                      }}
                                      className="p-1.5 text-slate-405 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer border border-slate-100 bg-slate-50 hover:shadow-sm"
                                      title="Excluir Parte"
                                    >
                                      <Trash2 size={13} />
                                    </button>

                                    {linha.whatsapp ? (
                                      <a
                                        href={getWhatsAppUrl(linha.whatsapp, linha.nome, linha.numeroProcesso, linha.dataHoraAudiencia)}
                                        target="_blank"
                                        referrerPolicy="no-referrer"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 rounded-lg shadow-md transition-all uppercase tracking-wider text-[10px]"
                                      >
                                        WhatsApp <ExternalLink size={12} />
                                      </a>
                                    ) : (
                                      <span className="text-[10.5px] font-mono text-slate-400 italic">Conversa indisponível</span>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Table Screen */}
      <div className="space-y-3">
        <div 
          className="border-b border-slate-200 pb-2 cursor-pointer flex justify-between items-center group"
          onClick={() => setIsTableExpanded(!isTableExpanded)}
        >
          <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2 group-hover:text-slate-800 transition-colors">
            <span className={`w-2.5 h-2.5 rounded-full transition-colors ${isTableExpanded ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            Relação Completa (Tabela Consolidada)
          </h3>
          <button className="p-1 text-slate-400 group-hover:text-slate-600 transition-colors">
            {isTableExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        
        <AnimatePresence>
          {isTableExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-4 text-center w-14">Nº</th>
                <th className="py-4 px-4 text-center w-24 whitespace-nowrap">Citado?</th>
                <th 
                  onClick={() => requestSort("numeroProcesso")} 
                  className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-48 whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">Processo CNJ {getSortIcon("numeroProcesso")}</span>
                </th>
                <th 
                  onClick={() => requestSort("nome")} 
                  className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap w-56 select-none"
                >
                  <span className="flex items-center gap-1">Parte / Nome {getSortIcon("nome")}</span>
                </th>
                <th 
                  onClick={() => requestSort("polo")} 
                  className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-24 whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">Polo {getSortIcon("polo")}</span>
                </th>
                <th 
                  onClick={() => requestSort("tipoComunicacao")}
                  className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-32 whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">Comunicação / Etiquetas {getSortIcon("tipoComunicacao")}</span>
                </th>
                <th 
                  onClick={() => requestSort("advCadastrado")} 
                  className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-44 whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">Advogado Cadastrado {getSortIcon("advCadastrado")}</span>
                </th>
                <th className="py-4 px-4 w-36 whitespace-nowrap">Registrado Por</th>
                <th className="py-4 px-4 w-32 whitespace-nowrap">WhatsApp</th>
                <th className="py-4 px-4 w-[280px] min-w-[200px]">Endereço Completo</th>
                <th 
                  onClick={() => requestSort("sedeZonaRural")} 
                  className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-28 whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">Localidade {getSortIcon("sedeZonaRural")}</span>
                </th>
                <th className="py-4 px-4 w-[300px] min-w-[200px]">Observações / Alertas</th>
                <th className="py-4 px-4 text-center w-28 whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              <AnimatePresence initial={false}>
                {filteredAndSortedLinhas.map((linha, index) => {
                  // Zebra color calculations for grouped cases
                  const isEvenProcess = groupProcess ? linha.processoSeq % 2 === 0 : false;
                  const rowBg = editingId === linha.id 
                    ? "bg-amber-50" 
                    : isEvenProcess 
                    ? "bg-slate-50/45 hover:bg-slate-100" 
                    : "bg-transparent hover:bg-slate-50";

                  return (
                    <motion.tr
                      key={linha.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={`${rowBg} group transition-colors text-xs text-slate-700`}
                    >
                      {/* Process seq automatic numbering */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-400 border-r border-slate-100">
                        {linha.processoSeq}
                      </td>

                      {/* Citado? Checkbox */}
                      <td className="py-3 px-4 text-center border-r border-slate-100">
                        <input
                          type="checkbox"
                          checked={!!linha.citado}
                          onChange={(e) => onUpdateLinha(linha.id, { citado: e.target.checked, dataCumprimento: e.target.checked ? new Date().toISOString() : null })}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 bg-white border-slate-300 cursor-pointer transition-all"
                          title="Marcar como Citado"
                        />
                      </td>

                      {/* Processo CNJ */}
                      <td className="py-3 px-4 font-mono text-xs font-semibold whitespace-nowrap text-slate-800">
                        {editingId === linha.id ? (
                          <input
                            type="text"
                            value={editValues.numeroProcesso || ""}
                            onChange={(e) => setEditValues({ ...editValues, numeroProcesso: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded font-mono text-xs bg-white text-slate-800 w-full shadow-inner"
                          />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="block">{linha.numeroProcesso}</span>
                            <button 
                              onClick={() => onDeleteProcesso(linha.numeroProcesso)}
                              className="text-[9px] font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
                              title="Excluir Processo Inteiro"
                            >
                              <Trash2 size={10} /> Excluir Processo
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Nome da Parte */}
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {editingId === linha.id ? (
                          <input
                            type="text"
                            value={editValues.nome || ""}
                            onChange={(e) => setEditValues({ ...editValues, nome: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full font-medium shadow-inner"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={linha.alvoComunicacao === false ? "text-slate-400 line-through" : ""}>{linha.nome}</span>
                            {linha.alvoComunicacao !== false && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8.5px] uppercase font-bold tracking-widest" title="Alvo da Comunicação">
                                <Send size={9} /> Alvo
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Polo */}
                      <td className="py-3 px-4">
                        {editingId === linha.id ? (
                          <div className="space-y-1.5 min-w-[120px]">
                            <select
                              value={editValues.polo || "Réu"}
                              onChange={(e) => setEditValues({ ...editValues, polo: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-805 w-full shadow-sm"
                            >
                              <option value="Autor">Autor</option>
                              <option value="Requerente">Requerente</option>
                              <option value="Réu">Réu</option>
                              <option value="Requerido">Requerido</option>
                              <option value="Representante">Representante</option>
                              <option value="Representado">Representado</option>
                              <option value="Terceiro interessado">Terceiro interessado</option>
                            </select>
                            
                            <select
                              value={editValues.menorDeIdade || ""}
                              onChange={(e) => setEditValues({ ...editValues, menorDeIdade: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-[10px] bg-white text-slate-700 w-full shadow-sm"
                            >
                              <option value="">Deixar em branco</option>
                              <option value="Sim">Menor: Sim</option>
                              <option value="Não">Menor: Não</option>
                            </select>

                            <input
                              type="text"
                              value={editValues.dataHoraAudiencia || ""}
                              onChange={(e) => setEditValues({ ...editValues, dataHoraAudiencia: e.target.value })}
                              placeholder="Audiência (ex: 20/06 14:00)"
                              className="px-2 py-1 border border-slate-300 rounded text-[10px] bg-white text-slate-700 w-full font-sans shadow-sm"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                              determinarTipoPolo(linha.polo) === "Ativo"
                                ? "bg-blue-100 text-blue-800 border-blue-200"
                                : determinarTipoPolo(linha.polo) === "Passivo"
                                ? "bg-rose-100 text-rose-800 border-rose-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}>
                              {determinarTipoPolo(linha.polo)}
                            </span>
                            {linha.menorDeIdade?.toLowerCase() === 'sim' && (
                              <div className="text-[9px] text-amber-800 font-extrabold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit uppercase flex items-center gap-0.5">
                                <Baby size={9} /> Menor: {linha.menorDeIdade}
                              </div>
                            )}
                            {linha.dataHoraAudiencia && (
                              <div className="text-[9px] text-indigo-850 font-extrabold bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded w-fit uppercase flex items-center gap-0.5" title="Data/Hora da Audiência">
                                <Calendar size={9} /> Aud: {linha.dataHoraAudiencia}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Comunicação / Etiquetas */}
                      <td className="py-3 px-4">
                        {editingId === linha.id ? (
                          <div className="space-y-1.5 min-w-[135px]">
                            <select
                              value={editValues.tipoComunicacao || "citacao"}
                              onChange={(e) => setEditValues({ ...editValues, tipoComunicacao: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full shadow-sm"
                            >
                              <option value="citacao">Citação</option>
                              <option value="audiencia">Audiência</option>
                              <option value="penhora">Penhora</option>
                              <option value="intimacao">Intimação</option>
                            </select>
                            
                            <input
                              type="text"
                              value={editValues.etiquetas ? editValues.etiquetas.join(", ") : ""}
                              onChange={(e) => setEditValues({ 
                                ...editValues, 
                                etiquetas: e.target.value.split(",").map(x => x.trim()).filter(Boolean) 
                              })}
                              placeholder="Etiquetas (separadas por vírgula)"
                              className="px-2 py-1 border border-slate-300 rounded text-[10px] bg-white text-slate-700 w-full shadow-sm"
                            />
                            {etiquetas.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {etiquetas.map(e => (
                                  <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => {
                                      const current = editValues.etiquetas || [];
                                      if (!current.includes(e.nome)) {
                                        setEditValues({ ...editValues, etiquetas: [...current, e.nome] });
                                      }
                                    }}
                                    className="px-1 py-0.5 text-[7px] border rounded hover:bg-slate-50 transition-colors"
                                    style={{ color: e.cor, borderColor: e.cor }}
                                  >
                                    + {e.nome}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <span className={`inline-flex px-2 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider border ${
                              linha.tipoComunicacao === "audiencia"
                                ? "bg-purple-100 text-purple-800 border-purple-200"
                                : linha.tipoComunicacao === "penhora"
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : linha.tipoComunicacao === "intimacao"
                                ? "bg-teal-100 text-teal-800 border-teal-200"
                                : "bg-blue-100 text-blue-800 border-blue-200" // citacao
                            }`}>
                              {linha.tipoComunicacao === "audiencia"
                                ? "Audiência"
                                : linha.tipoComunicacao === "penhora"
                                ? "Penhora"
                                : linha.tipoComunicacao === "intimacao"
                                ? "Intimação"
                                : "Citação"}
                            </span>

                            {linha.etiquetas && linha.etiquetas.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {linha.etiquetas.map((tagName, tIdx) => {
                                  const etqDef = etiquetas.find(e => e.nome.toLowerCase() === tagName.toLowerCase());
                                  const color = etqDef?.cor || "#64748b"; // default slate-500
                                  return (
                                    <span 
                                      key={tIdx} 
                                      className="inline-block px-1.5 py-0.5 text-[8px] font-bold border rounded-md shadow-sm"
                                      style={{ 
                                        backgroundColor: `${color}15`, 
                                        color: color, 
                                        borderColor: `${color}30` 
                                      }}
                                    >
                                      {tagName}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Advogado Cadastrado */}
                      <td className="py-3 px-4 text-xs text-slate-600 line-clamp-3 leading-tight pt-4">
                        {editingId === linha.id ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              list="advogados-list"
                              value={editValues.advCadastrado || ""}
                              onChange={(e) => setEditValues({ ...editValues, advCadastrado: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full shadow-inner"
                            />
                            <datalist id="advogados-list">
                              {advogados.map(adv => (
                                <option key={adv.id} value={adv.nome}>{adv.oab ? `${adv.nome} (${adv.oab})` : adv.nome}</option>
                              ))}
                            </datalist>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div>
                              <span className={hasAdv(linha.advCadastrado) ? "text-emerald-700 font-bold" : "text-slate-500 font-mono"}>
                                {linha.advCadastrado}
                              </span>
                            </div>

                            {/* Advogado da Parte Contrária Toggle */}
                            {(() => {
                              const opposingAdvs = getAdvogadasContrarias(linha);
                              if (opposingAdvs.length === 0) return null;

                              const isShowing = showOpposing[linha.id];

                              return (
                                <div className="mt-2">
                                  <button 
                                    onClick={() => toggleOpposing(linha.id)}
                                    className={`w-full text-left p-1.5 border rounded-lg transition-all ${
                                      isShowing 
                                        ? "bg-rose-50 border-rose-200 text-rose-700" 
                                        : "bg-white border-slate-200 text-slate-500 hover:border-rose-300"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] font-bold uppercase tracking-widest">Adv. Contrária</span>
                                      <span className="text-[8px] font-bold text-rose-500 uppercase">{isShowing ? "Ocultar" : "Mostrar"}</span>
                                    </div>
                                    {isShowing && (
                                      <div className="mt-1 space-y-0.5">
                                        {opposingAdvs.map((adv, idx) => (
                                          <div key={idx} className="text-[9px] font-bold text-rose-700 leading-tight border-t border-rose-100 pt-0.5 mt-0.5 first:border-0 first:pt-0 first:mt-0">
                                            {adv}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </td>

                      {/* Registrado Por */}
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md font-medium text-[10px] truncate max-w-[140px] block" title={linha.criadoPorEmail || "Anônimo"}>
                          {linha.criadoPorEmail || "Anônimo"}
                        </span>
                      </td>

                      {/* WhatsApp com Link automático */}
                      <td className="py-3 px-4 text-xs font-mono">
                        {editingId === linha.id ? (
                          <input
                            type="text"
                            value={editValues.whatsapp || ""}
                            onChange={(e) => setEditValues({ ...editValues, whatsapp: e.target.value })}
                            placeholder="Apenas dígitos"
                            className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full font-mono shadow-inner"
                          />
                        ) : linha.whatsapp ? (
                          <div className="space-y-1">
                            <span className="block text-slate-705">{linha.whatsapp}</span>
                            <a
                              href={getWhatsAppUrl(linha.whatsapp, linha.nome, linha.numeroProcesso, linha.dataHoraAudiencia)}
                              target="_blank"
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-750 hover:bg-emerald-100 border border-emerald-300 rounded transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider"
                            >
                                  WhatsApp <ExternalLink size={10} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono italic">indisponível</span>
                        )}
                      </td>

                      {/* Endereço */}
                      <td className="py-3 px-4 text-xs text-slate-650 leading-normal max-w-[280px]">
                        {editingId === linha.id ? (
                          <textarea
                            value={editValues.endereco || ""}
                            onChange={(e) => setEditValues({ ...editValues, endereco: e.target.value })}
                            rows={2}
                            className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full leading-tight shadow-inner"
                          />
                        ) : (
                          linha.endereco || <span className="font-mono text-slate-400">NÃO CONSTA</span>
                        )}
                      </td>

                      {/* Sede / Zona Rural */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {editingId === math_random_key_hack(linha.id) ? null : editingId === linha.id ? (
                          <select
                            value={editValues.sedeZonaRural || "Sede"}
                            onChange={(e) => setEditValues({ ...editValues, sedeZonaRural: e.target.value as any })}
                            className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full font-medium shadow-sm"
                          >
                            <option value="Sede">Sede</option>
                            <option value="Zona Rural">Zona Rural</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded border ${
                            linha.sedeZonaRural === "Zona Rural"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-sky-50 text-sky-800 border-sky-200"
                          }`}>
                            {linha.sedeZonaRural}
                          </span>
                        )}
                      </td>

                      {/* Observações */}
                      <td className="py-3 px-4 text-xs text-slate-650 leading-normal max-w-[300px]">
                        {editingId === linha.id ? (
                          <textarea
                            value={editValues.obs || ""}
                            onChange={(e) => setEditValues({ ...editValues, obs: e.target.value })}
                            rows={2}
                            className="px-2 py-1 border border-slate-300 rounded text-xs bg-white text-slate-800 w-full leading-tight shadow-inner"
                          />
                        ) : (
                          <span className="whitespace-pre-line text-slate-605">{linha.obs || "-"}</span>
                        )}
                      </td>

                      {/* Inline Actions */}
                      <td className="py-3 px-4 text-center border-l border-slate-150">
                        {editingId === linha.id ? (
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => saveEdit(linha.id)}
                              className="p-1 px-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-all font-semibold text-xs flex items-center gap-0.5"
                              title="Salvar"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 px-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-md border border-slate-200 transition-all font-semibold text-xs flex items-center gap-0.5"
                              title="Cancelar"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => startEdit(linha)}
                              className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Editar linha"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => onDeleteLinha(linha.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Excluir parte"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
  );
}

// Inline dummy helper for ts declaration safety
function math_random_key_hack(id: string) {
  return id + "_hack_none";
}
