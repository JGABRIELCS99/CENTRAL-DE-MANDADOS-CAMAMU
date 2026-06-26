import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, CheckSquare, ListPlus, Download, 
  HelpCircle, ArrowRight, Info, Scale, Clock, AlertTriangle, Sliders, X, PieChart,
  LayoutDashboard, LogOut, Menu, Lock, Mail, UserPlus, FolderOpen, Users, 
  CheckCircle, Calendar, MapPin, Activity, FileSpreadsheet, Landmark, Baby,
  MessageCircle, Tag, ArrowLeft, Trash2, Check
} from "lucide-react";

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  Legend, 
  AreaChart, 
  Area,
  LineChart,
  Line
} from "recharts";

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

import { ProcessoExtraido, ProcessoLinha, ParteExtraida, AdvogadoMonitorado, Etiqueta } from "./types";
import FileUploadZone, { UploadedFileState } from "./components/FileUploadZone";
import PreviewConfirm, { formatWhatsappLink } from "./components/PreviewConfirm";
import ProcessoTable from "./components/ProcessoTable";
import { db, auth, advogadosCol, etiquetasCol } from "./lib/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch, addDoc } from "firebase/firestore";

export default function App() {
  const [activeTab, setActiveTab] = useState<"upload" | "list" | "dashboard" | "settings" | "manual">("dashboard");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"whatsapp" | "advogados" | "etiquetas" | null>(null);
  const [pendingProcesses, setPendingProcesses] = useState<ProcessoExtraido[]>([]);
  const [linhas, setLinhas] = useState<ProcessoLinha[]>([]);
  const [filesState, setFilesState] = useState<UploadedFileState[]>([]);
  const [showWelcomeMsg, setShowWelcomeMsg] = useState(true);

  // Auth & Sidebar States
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!authEmail || !authPassword) {
      setAuthError("Por favor, preencha todos os campos.");
      return;
    }
    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/invalid-credential") {
        setAuthError("E-mail ou senha incorretos.");
      } else if (err.code === "auth/email-already-in-use") {
        setAuthError("Este e-mail já está em uso.");
      } else if (err.code === "auth/weak-password") {
        setAuthError("A senha deve conter pelo menos 6 caracteres.");
      } else if (err.code === "auth/invalid-email") {
        setAuthError("Formato de e-mail inválido.");
      } else {
        setAuthError(err.message || "Ocorreu um erro na autenticação.");
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/popup-blocked") {
        setAuthError("O pop-up de login foi bloqueado. Por favor, permita pop-ups para fazer login com o Google ou abra o aplicativo em uma nova aba.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setAuthError("O login com o Google foi fechado antes de concluir.");
      } else if (err.code === "auth/operation-not-allowed") {
        setAuthError("O provedor Google ainda não está totalmente ativo ou permitido nas regras. Verifique se o Google está ativado no painel.");
      } else {
        setAuthError(err.message || "Erro ao fazer login com o Google.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab("dashboard");
    } catch (err) {
      console.error("Erro ao deslogar:", err);
    }
  };

  // Dashboard Filters State & Memoized Filtered Lines
  const [dashOcultarMenores, setDashOcultarMenores] = useState(true);
  const [dashOcultarPoloAtivo, setDashOcultarPoloAtivo] = useState(true);

  const filteredDashboardLinhas = useMemo(() => {
    return linhas.filter((l) => {
      if (dashOcultarMenores && (l.menorDeIdade === "Sim" || l.menorDeIdade === "sim")) {
        return false;
      }
      const isAtivo = l.polo && (
        l.polo.toLowerCase().includes("autor") ||
        l.polo.toLowerCase().includes("requerente") ||
        l.polo.toLowerCase().includes("ativo") ||
        l.polo.toLowerCase().includes("exequente") ||
        l.polo.toLowerCase().includes("reclamante")
      );
      if (dashOcultarPoloAtivo && isAtivo) {
        return false;
      }
      return true;
    });
  }, [linhas, dashOcultarMenores, dashOcultarPoloAtivo]);
  
  const totalProcessos = useMemo(() => {
    return new Set(linhas.map((l) => l.numeroProcesso)).size;
  }, [linhas]);

  // Derived charts and analytics data
  const poloData = useMemo(() => {
    const counts: Record<string, number> = { "Polo Ativo": 0, "Polo Passivo": 0, "Terceiros": 0 };
    filteredDashboardLinhas.forEach((l) => {
      const p = (l.polo || "").toLowerCase();
      if (p.includes("autor") || p.includes("requerente") || p.includes("ativo") || p.includes("exequente") || p.includes("reclamante")) {
        counts["Polo Ativo"]++;
      } else if (p.includes("réu") || p.includes("reu") || p.includes("requerido") || p.includes("passivo") || p.includes("executado") || p.includes("reclamado")) {
        counts["Polo Passivo"]++;
      } else {
        counts["Terceiros"]++;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredDashboardLinhas]);

  const zonaData = useMemo(() => {
    let sede = 0;
    let rural = 0;
    filteredDashboardLinhas.forEach((l) => {
      if (l.sedeZonaRural === "Zona Rural") {
        rural++;
      } else {
        sede++;
      }
    });
    return [
      { name: "Sede", value: sede },
      { name: "Zona Rural", value: rural }
    ];
  }, [filteredDashboardLinhas]);

  const comunicacaoData = useMemo(() => {
    const counts: Record<string, number> = { "Citação": 0, "Audiência": 0, "Intimação": 0, "Penhora": 0 };
    filteredDashboardLinhas.forEach((l) => {
      const t = l.tipoComunicacao || "citacao";
      if (t === "audiencia") counts["Audiência"]++;
      else if (t === "intimacao") counts["Intimação"]++;
      else if (t === "penhora") counts["Penhora"]++;
      else counts["Citação"]++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredDashboardLinhas]);

  const citacaoStatusData = useMemo(() => {
    let citados = 0;
    let pendentes = 0;
    filteredDashboardLinhas.forEach((l) => {
      if (l.citado) {
        citados++;
      } else {
        pendentes++;
      }
    });
    return [
      { name: "Citado", value: citados },
      { name: "Pendente", value: pendentes }
    ];
  }, [filteredDashboardLinhas]);

  const dateMetricsData = useMemo(() => {
    // We group by YYYY-MM-DD
    const dateMap: Record<string, { cadastrados: number, cumpridos: number }> = {};
    
    filteredDashboardLinhas.forEach(l => {
      if (l.dataCadastramento) {
        const d = l.dataCadastramento.split("T")[0];
        if (!dateMap[d]) dateMap[d] = { cadastrados: 0, cumpridos: 0 };
        dateMap[d].cadastrados++;
      }
      if (l.dataCumprimento && l.citado) {
        const d = l.dataCumprimento.split("T")[0];
        if (!dateMap[d]) dateMap[d] = { cadastrados: 0, cumpridos: 0 };
        dateMap[d].cumpridos++;
      }
    });

    // sort keys
    return Object.keys(dateMap).sort().map(date => {
      // transform "2026-06-25" to "25/06"
      const [y, m, d] = date.split("-");
      const shortDate = `${d}/${m}`;
      return {
        date,
        shortDate,
        Cadastrados: dateMap[date].cadastrados,
        Cumpridos: dateMap[date].cumpridos
      };
    });
  }, [filteredDashboardLinhas]);

  // Load data from Firestore in real-time
  const [advogados, setAdvogados] = useState<AdvogadoMonitorado[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);

  useEffect(() => {
    const unsubscribeMandados = onSnapshot(collection(db, "mandados"), (snapshot) => {
      const loaded: ProcessoLinha[] = [];
      snapshot.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() } as ProcessoLinha);
      });
      loaded.sort((a, b) => {
        if (a.processoSeq !== b.processoSeq) {
          return a.processoSeq - b.processoSeq;
        }
        return a.nome.localeCompare(b.nome);
      });
      setLinhas(loaded);
    });

    const unsubscribeAdvogados = onSnapshot(collection(db, "advogados"), (snapshot) => {
      const loaded: AdvogadoMonitorado[] = [];
      snapshot.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() } as AdvogadoMonitorado);
      });
      setAdvogados(loaded);
    });

    const unsubscribeEtiquetas = onSnapshot(collection(db, "etiquetas"), (snapshot) => {
      const loaded: Etiqueta[] = [];
      snapshot.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() } as Etiqueta);
      });
      setEtiquetas(loaded);
    });

    return () => {
      unsubscribeMandados();
      unsubscribeAdvogados();
      unsubscribeEtiquetas();
    };
  }, []);

  // States for WhatsApp Dynamic Message Template & Hearing URL
  const [waTemplate, setWaTemplate] = useState<string>(() => {
    const saved = localStorage.getItem("mensagem_whatsapp_modelo");
    return saved || "Olá, *{nome}*!\n\nSou Oficial de Justiça e entro em contato para realizar a citação ref. ao *Processo nº {processo}*.\n\nA audiência de conciliação está agendada para: *{audiencia}*.\n\nLink para acesso à sala virtual da audiência: {link_audiencia}\n\nFavor confirmar o recebimento desta mensagem.";
  });

  const [linkAudiencia, setLinkAudiencia] = useState<string>(() => {
    const saved = localStorage.getItem("link_audiencia_modelo");
    return saved || "https://vc.tjba.jus.br/";
  });

  const [usageData, setUsageData] = useState<{ count: number; date: string }>(() => {
    const today = new Date().toLocaleDateString("pt-BR");
    const saved = localStorage.getItem("gemini_usage");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.date === today) {
          return parsed;
        }
      } catch (e) {}
    }
    return { count: 0, date: today };
  });

  const incrementUsage = () => {
    setUsageData((prev) => {
      const today = new Date().toLocaleDateString("pt-BR");
      const nextCount = prev.date === today ? prev.count + 1 : 1;
      const nextObj = { count: nextCount, date: today };
      localStorage.setItem("gemini_usage", JSON.stringify(nextObj));
      return nextObj;
    });
  };

  const [tempWaTemplate, setTempWaTemplate] = useState("");
  const [tempLinkAudiencia, setTempLinkAudiencia] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isSettingsOpen) {
      setTempWaTemplate(waTemplate);
      setTempLinkAudiencia(linkAudiencia);
    }
  }, [isSettingsOpen, waTemplate, linkAudiencia]);

  const insertTagAtCursor = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setTempWaTemplate((prev) => prev + " " + tag);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const updated = before + tag + after;
    setTempWaTemplate(updated);
    
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }, 50);
  };

  const handleSaveSettings = () => {
    setWaTemplate(tempWaTemplate);
    localStorage.setItem("mensagem_whatsapp_modelo", tempWaTemplate);
    setLinkAudiencia(tempLinkAudiencia);
    localStorage.setItem("link_audiencia_modelo", tempLinkAudiencia);
    setIsSettingsOpen(false);
  };

  // Called when server successfully analyzes a single process file
  const handleDataParsed = (fileName: string, data: ProcessoExtraido) => {
    setPendingProcesses((prev) => [data, ...prev]);
  };

  // Called when updating fields in a pending process (Preview form)
  const handleUpdateProcess = (index: number, updated: ProcessoExtraido) => {
    setPendingProcesses((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  // Helper to sanitize advocate name and remove "SIM -" prefix
  const sanitizeAdvogado = (value: string): string => {
    if (!value) return "NÃO consta";
    let trimmed = value.trim();
    if (/^sim\s*-\s*/i.test(trimmed)) {
      trimmed = trimmed.replace(/^sim\s*-\s*/i, "");
    } else if (/^sim\s*:\s*/i.test(trimmed)) {
      trimmed = trimmed.replace(/^sim\s*:\s*/i, "");
    } else if (/^sim\s+/i.test(trimmed)) {
      trimmed = trimmed.replace(/^sim\s+/i, "");
    }
    return trimmed || "NÃO consta";
  };

  // Called when user clicks "Confirmar e adicionar à lista" in preview (Tela 2)
  const handleConfirmProcess = (index: number, updated: ProcessoExtraido) => {
    // 1. Find next sequence index. (Same process shares same index, even with 2+ parts!)
    const currentMaxSeq = linhas.reduce((max, r) => Math.max(max, r.processoSeq), 0);
    const nextSeq = currentMaxSeq + 1;

    // Ordered list of parts: we will sort the verified list during mapping!
    // Wait, the user requested: "Sempre mostre na ordem: autr/representante/ reuerente e depois reu/ requerido e depois representado/terceiros"
    // Let's implement sorting here during confirm, or sorting in the table view!
    // Sorting during display in ProcessoTable and also sorting during confirm is best. Let's do it in both so they default to the right order!

    // 2. Map parts into persistent row objects
    const newRows: ProcessoLinha[] = updated.partes.map((part) => {
      const waDigits = part.whatsapp ? part.whatsapp.replace(/\D/g, "") : "";
      return {
        id: Math.random().toString(36).substring(2, 9) + "_" + Date.now(),
        processoSeq: nextSeq,
        numeroProcesso: updated.numeroProcesso || "NÃO CONSTA",
        segredoJustica: updated.segredoJustica || false,
        comarcaTramitacao: updated.comarcaTramitacao || "TJBA",
        
        nome: part.nome || "Parte Sem Nome",
        polo: part.polo || "Réu",
        advCadastrado: sanitizeAdvogado(part.advCadastrado),
        whatsapp: waDigits,
        linkWhatsapp: formatWhatsappLink(waDigits),
        endereco: part.endereco || "Não consta nos autos",
        sedeZonaRural: part.sedeZonaRural || "Sede",
        obs: part.obs || "",
        menorDeIdade: part.menorDeIdade || "",
        dataHoraAudiencia: part.dataHoraAudiencia || "",
        tipoComunicacao: part.tipoComunicacao || "citacao",
        etiquetas: part.etiquetas || [],
        citado: false,
        dataCadastramento: new Date().toISOString(),
        dataCumprimento: null,
        criadoPorEmail: user?.email || "Anônimo",
        criadoPorUid: user?.uid || "anonimo",
        alvoComunicacao: part.alvoComunicacao !== false, // Default true if undefined
      };
    });

    // Write new rows to Firestore
    newRows.forEach((row) => {
      setDoc(doc(db, "mandados", row.id), row).catch((err) => {
        console.error("Error writing document to firestore: ", err);
      });
    });

    // 3. Remove this compiled process from the pending review list
    setPendingProcesses((prev) => prev.filter((_, idx) => idx !== index));

    // 4. Redirect if no more pending reviews
    if (pendingProcesses.length <= 1) {
      setActiveTab("list");
    }
  };

  // Discard a parsed process without adding
  const handleDiscardProcess = (index: number) => {
    if (confirm("Tem certeza que deseja descartar estes dados extraídos do documento? Eles não serão salvos.")) {
      setPendingProcesses((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  // Delete a row in final table
  const handleDeleteLinha = async (id: string) => {
    if (confirm("Excluir esta parte da sua relação consolidada?")) {
      try {
        await deleteDoc(doc(db, "mandados", id));
      } catch (err) {
        console.error("Erro ao deletar documento:", err);
      }
    }
  };

  const handleDeleteProcesso = async (numeroProcesso: string) => {
    if (confirm(`Tem certeza que deseja excluir TODOS os registros associados ao processo ${numeroProcesso}?`)) {
      try {
        const batch = writeBatch(db);
        const processRows = linhas.filter(l => l.numeroProcesso === numeroProcesso);
        processRows.forEach((row) => {
          batch.delete(doc(db, "mandados", row.id));
        });
        await batch.commit();
      } catch (err) {
        console.error("Erro ao deletar processo:", err);
      }
    }
  };

  // Inline table edit updates
  const handleUpdateLinha = async (id: string, updatedFields: Partial<ProcessoLinha>) => {
    try {
      await updateDoc(doc(db, "mandados", id), updatedFields);
    } catch (err) {
      console.error("Erro ao atualizar documento:", err);
    }
  };

  const handleClearTable = async () => {
    if (confirm("Tem certeza que deseja apagar TODOS os mandados da sua central? Essa ação não pode ser desfeita.")) {
      try {
        const batch = writeBatch(db);
        linhas.forEach((row) => {
          batch.delete(doc(db, "mandados", row.id));
        });
        await batch.commit();
      } catch (err) {
        console.error("Erro ao limpar tabela:", err);
      }
    }
  };

  const [novoAdvNome, setNovoAdvNome] = useState("");
  const [novoAdvOab, setNovoAdvOab] = useState("");
  const [novoAdvWhatsapp, setNovoAdvWhatsapp] = useState("");
  const [novoAdvMonitorar, setNovoAdvMonitorar] = useState(true);

  const [novaEtiquetaNome, setNovaEtiquetaNome] = useState("");
  const [novaEtiquetaCor, setNovaEtiquetaCor] = useState("#3B82F6"); // Default blue

  const handleAddAdvogado = async () => {
    if (!novoAdvNome.trim()) return;
    try {
      await addDoc(advogadosCol, {
        nome: novoAdvNome,
        oab: novoAdvOab,
        whatsapp: novoAdvWhatsapp,
        monitorar: novoAdvMonitorar
      });
      setNovoAdvNome("");
      setNovoAdvOab("");
      setNovoAdvWhatsapp("");
      setNovoAdvMonitorar(true);
    } catch (err) {
      console.error("Erro ao adicionar advogado:", err);
    }
  };

  const handleAddEtiqueta = async () => {
    if (!novaEtiquetaNome.trim()) return;
    try {
      await addDoc(etiquetasCol, {
        nome: novaEtiquetaNome,
        cor: novaEtiquetaCor
      });
      setNovaEtiquetaNome("");
      setNovaEtiquetaCor("#3B82F6");
    } catch (err) {
      console.error("Erro ao adicionar etiqueta:", err);
    }
  };

  const handleDeleteEtiqueta = async (id: string) => {
    try {
      await deleteDoc(doc(db, "etiquetas", id));
    } catch (err) {
      console.error("Erro ao deletar etiqueta:", err);
    }
  };

  const handleDeleteAdvogado = async (id: string) => {
    try {
      await deleteDoc(doc(db, "advogados", id));
    } catch (err) {
      console.error("Erro ao deletar advogado:", err);
    }
  };

  const handleToggleMonitorarAdvogado = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, "advogados", id), { monitorar: !current });
    } catch (err) {
      console.error("Erro ao atualizar monitoramento:", err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans">
        <Scale className="animate-spin text-emerald-500 mb-4" size={48} />
        <h2 className="text-xl font-bold tracking-tight">Central de Mandados Camamu</h2>
        <p className="text-xs text-slate-400 mt-2">Carregando sistema seguro...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
        {/* Abstract background blobs for design polish */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full filter blur-3xl translate-x-1/2 translate-y-1/2" />
        
        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-xl shadow-emerald-950/20">
              <Scale size={32} className="stroke-2" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Central de Mandados Camamu
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Faça login para acessar o painel de gerenciamento de mandados
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
          <div className="bg-slate-900 border border-slate-800/80 py-8 px-6 shadow-2xl rounded-3xl sm:px-10">
            {authError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Google Sign-In Button */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl text-sm transition-all focus:outline-none cursor-pointer flex items-center justify-center gap-3 shadow-md"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-xs font-black text-slate-800 border border-slate-300">
                  G
                </span>
                <span>Entrar com o Google</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active view content components selector helper
  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-6">
            {/* Main Stats Summary Header Panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-lg">
              <div className="mb-6 flex flex-wrap justify-between items-center gap-4 border-b border-slate-100 pb-5">
                <div className="flex space-x-3 items-center">
                  <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                    <LayoutDashboard size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Painel Geral de Métricas</h2>
                    <p className="text-xs text-slate-500">Controle analítico de mandados ativos e citações na Comarca</p>
                  </div>
                </div>

                {/* Dashboard Filters checkboxes */}
                <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-2 px-4 rounded-2xl border border-slate-200 text-xs shadow-inner">
                  <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Filtrar Métricas:</span>
                  
                  <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-650">
                    <input
                      type="checkbox"
                      checked={dashOcultarMenores}
                      onChange={(e) => setDashOcultarMenores(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Ocultar Menores</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-650">
                    <input
                      type="checkbox"
                      checked={dashOcultarPoloAtivo}
                      onChange={(e) => setDashOcultarPoloAtivo(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Ocultar Polo Ativo</span>
                  </label>
                </div>
              </div>

              {/* Big metric cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center shadow-sm relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-3 text-amber-200 opacity-40 group-hover:scale-110 transition-transform">
                    <Clock size={48} />
                  </div>
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Pendentes de Citação</p>
                  <h3 className="text-3xl font-extrabold text-amber-650 mt-1">
                    {filteredDashboardLinhas.filter(l => !l.citado).length}
                  </h3>
                  <p className="text-[10px] text-amber-600 mt-1">requerem contato / diligência</p>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 text-center shadow-sm relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-3 text-indigo-200 opacity-40 group-hover:scale-110 transition-transform">
                    <FileText size={48} />
                  </div>
                  <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Total de Processos</p>
                  <h3 className="text-3xl font-extrabold text-indigo-850 mt-1">{totalProcessos}</h3>
                  <p className="text-[10px] text-indigo-500 mt-1">processos únicos consolidados</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center shadow-sm relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-3 text-slate-200 opacity-40 group-hover:scale-110 transition-transform">
                    <FolderOpen size={48} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total de Mandados</p>
                  <h3 className="text-3xl font-extrabold text-slate-850 mt-1">{filteredDashboardLinhas.length}</h3>
                  <p className="text-[10px] text-slate-400 mt-1">partes mapeadas no sistema</p>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center shadow-sm relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-3 text-emerald-200 opacity-40 group-hover:scale-110 transition-transform">
                    <CheckCircle size={48} />
                  </div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Citados (Concluídos)</p>
                  <h3 className="text-3xl font-extrabold text-emerald-650 mt-1">
                    {filteredDashboardLinhas.filter(l => l.citado).length}
                  </h3>
                  <p className="text-[10px] text-emerald-600 mt-1">
                    {filteredDashboardLinhas.length > 0 
                      ? `${Math.round((filteredDashboardLinhas.filter(l => l.citado).length / filteredDashboardLinhas.length) * 100)}% de taxa de conclusão`
                      : "0% concluídos"
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Dashboard Graphical Section - Bento Grid */}
            {filteredDashboardLinhas.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. PieChart: Situação de Citação */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-md flex flex-col justify-between min-h-[320px]">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600" />
                      Status de Cumprimento dos Mandados
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Percentual de partes citadas com sucesso</p>
                  </div>
                  <div className="h-48 my-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={citacaoStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#10B981" />
                          <Cell fill="#F59E0B" />
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px" }} />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. BarChart: Distribuição por Polo */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-md flex flex-col justify-between min-h-[320px]">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Users size={16} className="text-indigo-600" />
                      Distribuição de Partes por Polo Processual
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Classificação jurídica das partes salvas</p>
                  </div>
                  <div className="h-48 my-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={poloData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} />
                        <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px" }} />
                        <Bar dataKey="value" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. BarChart: Distribuição por Localidade */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-md flex flex-col justify-between min-h-[320px]">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <MapPin size={16} className="text-amber-600" />
                      Zonas de Diligência (Sede vs Zona Rural)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Volume de mandados a cumprir por localidade</p>
                  </div>
                  <div className="h-48 my-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={zonaData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} />
                        <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px" }} />
                        <Bar dataKey="value" fill="#D97706" radius={[6, 6, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 4. AreaChart: Tipo de Comunicação */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-md flex flex-col justify-between min-h-[320px]">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Activity size={16} className="text-rose-600" />
                      Finalidade das Comunicações Processuais
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Quantitativo por objeto do mandado</p>
                  </div>
                  <div className="h-48 my-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={comunicacaoData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} />
                        <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px" }} />
                        <Area type="monotone" dataKey="value" stroke="#E11D48" fill="#FFE4E6" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
                <p className="text-sm text-slate-500">Nenhum dado cadastrado para exibir gráficos de desempenho.</p>
              </div>
            )}

            {/* 5. LineChart: Cadastramento vs Cumprimento (Full Width) */}
            {filteredDashboardLinhas.length > 0 && dateMetricsData.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-md flex flex-col justify-between min-h-[320px]">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={16} className="text-blue-600" />
                    Métricas de Fluxo (Cadastramento vs Cumprimento)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Evolução diária de novos mandados e citações cumpridas</p>
                </div>
                <div className="h-64 my-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dateMetricsData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="shortDate" stroke="#64748B" fontSize={10} tickLine={false} />
                      <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px" }} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Line type="monotone" dataKey="Cadastrados" stroke="#4F46E5" strokeWidth={2} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="Cumpridos" stroke="#10B981" strokeWidth={2} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Atividades Recentes list with Created By info */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-lg space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={16} className="text-emerald-600" />
                  Atividades Recentes e Registro de Envio
                </h3>
                <p className="text-xs text-slate-500">Últimos processos consolidados com registro do remetente</p>
              </div>

              {filteredDashboardLinhas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-150">
                        <th className="p-3">Processo</th>
                        <th className="p-3">Nome / Parte</th>
                        <th className="p-3">Polo</th>
                        <th className="p-3">Registrado Por</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDashboardLinhas.slice(-5).reverse().map((linha) => (
                        <tr key={linha.id} className="hover:bg-slate-50/55 transition-all">
                          <td className="p-3 font-mono font-bold text-slate-700">{linha.numeroProcesso}</td>
                          <td className="p-3 text-slate-800 font-semibold">{linha.nome}</td>
                          <td className="p-3 text-slate-550">{linha.polo}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                              {linha.criadoPorEmail || "Anônimo"}
                            </span>
                          </td>
                          <td className="p-3">
                            {linha.citado ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                                CITADO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                                PENDENTE
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  Nenhum mandado registrado recentemente.
                </div>
              )}
            </div>

          </div>
        );

      case "upload":
        if (pendingProcesses.length > 0) {
          return (
            <div className="space-y-6">
              <PreviewConfirm
                pendingProcesses={pendingProcesses}
                onConfirm={handleConfirmProcess}
                onDiscard={handleDiscardProcess}
                onUpdateProcess={handleUpdateProcess}
                existingLinhas={linhas}
                advogadosMonitorados={advogados}
                onBack={() => {
                  if (confirm("Deseja voltar para a tela de envio? Os dados extraídos pendentes serão descartados.")) {
                    setPendingProcesses([]);
                  }
                }}
              />
            </div>
          );
        }
        return (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-lg space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Anexar Peças do TJBA</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Adicione PDFs de uma petição inicial ou capa do PJe. Os arquivos serão analisados automaticamente pela inteligência artificial.
                </p>
              </div>
              
              <FileUploadZone
                onDataParsed={handleDataParsed}
                filesState={filesState}
                setFilesState={setFilesState}
                onExtractionAttempt={incrementUsage}
              />
            </div>
          </div>
        );

      case "list":
        return (
          <div className="space-y-6">
            <ProcessoTable
              linhas={linhas}
              onDeleteLinha={handleDeleteLinha}
              onDeleteProcesso={handleDeleteProcesso}
              onClearTable={handleClearTable}
              onUpdateLinha={handleUpdateLinha}
              waTemplate={waTemplate}
              linkAudiencia={linkAudiencia}
              etiquetas={etiquetas}
              advogados={advogados}
            />
          </div>
        );

      case "settings":
        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-lg space-y-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="text-emerald-600" size={20} />
                  Configurações do Sistema
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gerencie modelos do WhatsApp, etiquetas e advogados conhecidos
                </p>
              </div>

              {settingsTab !== null && (
                <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
                  <button
                    type="button"
                    onClick={() => setSettingsTab(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                  >
                    <ArrowLeft size={14} />
                    Voltar
                  </button>
                  <span className="text-sm font-bold text-slate-800 ml-2">
                    {settingsTab === "whatsapp" && "Modelos de WhatsApp"}
                    {settingsTab === "advogados" && "Lista de Advogados"}
                    {settingsTab === "etiquetas" && "Etiquetas"}
                  </span>
                </div>
              )}
            </div>

            {settingsTab === null && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in pt-4">
                <button
                  type="button"
                  onClick={() => setSettingsTab("whatsapp")}
                  className="flex flex-col items-center justify-center p-8 border-2 border-slate-200 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                >
                  <div className="p-4 bg-emerald-100 text-emerald-600 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <MessageCircle size={32} />
                  </div>
                  <h4 className="text-base font-bold text-slate-800 mb-2">WhatsApp</h4>
                  <p className="text-xs text-slate-500 text-center">Configurar modelos de mensagens e link da sala de audiência</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsTab("etiquetas")}
                  className="flex flex-col items-center justify-center p-8 border-2 border-slate-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                >
                  <div className="p-4 bg-blue-100 text-blue-600 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <Tag size={32} />
                  </div>
                  <h4 className="text-base font-bold text-slate-800 mb-2">Etiquetas</h4>
                  <p className="text-xs text-slate-500 text-center">Gerenciar etiquetas customizadas para os processos</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsTab("advogados")}
                  className="flex flex-col items-center justify-center p-8 border-2 border-slate-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                >
                  <div className="p-4 bg-indigo-100 text-indigo-600 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <Users size={32} />
                  </div>
                  <h4 className="text-base font-bold text-slate-800 mb-2">Lista de Advogados</h4>
                  <p className="text-xs text-slate-500 text-center">Cadastrar advogados para monitoramento</p>
                </button>
              </div>
            )}

            {settingsTab === "whatsapp" && (
              <div className="space-y-6 max-w-3xl animate-fade-in">
                {/* Hearing link standard input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Link Padrão da Audiência Virtual (Sala do TJBA)
                  </label>
                  <input
                    type="url"
                    value={tempLinkAudiencia}
                    onChange={(e) => setTempLinkAudiencia(e.target.value)}
                    placeholder="https://vc.tjba.jus.br/sala-exemplo"
                    className="w-full px-3.5 py-2.5 border border-slate-300 bg-white text-slate-800 rounded-xl text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                  />
                  <p className="text-[10px] text-slate-400">
                    Substituirá automaticamente a tag <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-700 font-mono font-bold">{'{link_audiencia}'}</code> no seu modelo.
                  </p>
                </div>

                {/* Template textarea */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-sans">
                      Texto Padrão do WhatsApp
                    </label>
                    <span className="text-[10px] font-bold text-slate-400">Suporta *negrito* do WhatsApp</span>
                  </div>
                  
                  <textarea
                    ref={textareaRef}
                    rows={8}
                    value={tempWaTemplate}
                    onChange={(e) => setTempWaTemplate(e.target.value)}
                    className="w-full px-3.5 py-3 border border-slate-300 bg-white text-slate-800 rounded-xl text-xs font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-relaxed shadow-inner"
                    placeholder="Digite o texto padrão da mensagem do WhatsApp..."
                  />

                  {/* Quick tags inserting badges */}
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Injetar tag dinâmica na posição atual:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { tag: "{nome}", label: "Nome" },
                        { tag: "{processo}", label: "Processo" },
                        { tag: "{audiencia}", label: "Data/Hora" },
                        { tag: "{link_audiencia}", label: "Link" },
                      ].map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => insertTagAtCursor(item.tag)}
                          className="px-2 py-1 text-[10px] font-bold border border-slate-300 bg-white hover:border-emerald-400 hover:text-emerald-700 rounded-lg shadow-sm transition-all text-slate-655 cursor-pointer flex items-center justify-center"
                        >
                          {item.tag} <span className="text-[8px] font-normal text-slate-400 ml-1">({item.label})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Simulation */}
                <div className="p-4 rounded-2xl bg-[#E5DDD5] border border-[#dad2c9] space-y-3 font-sans">
                  <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block text-center bg-white/60 p-1 rounded max-w-[200px] mx-auto">
                    Demonstração da Mensagem
                  </span>
                  
                  <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm max-w-[90%] border border-white relative whitespace-pre-wrap text-slate-800 text-xs leading-normal">
                    {tempWaTemplate
                      .replace(/{nome}/g, "João da Silva")
                      .replace(/{processo}/g, "0001234-56.2026.8.05.0001")
                      .replace(/{audiencia}/g, "25/11/2026 às 14:00")
                      .replace(/{link_audiencia}/g, tempLinkAudiencia || "[LINK]")
                    }
                    <div className="text-[9px] text-slate-400 text-right mt-1">14:00</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="pt-4 border-t border-slate-100 flex items-center gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTempWaTemplate(waTemplate);
                      setTempLinkAudiencia(linkAudiencia);
                    }}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-55 cursor-pointer"
                  >
                    Restaurar Salvos
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    Salvar Parâmetros
                  </button>
                </div>
              </div>
            )}

            {settingsTab === "advogados" && (
              <div className="space-y-6 max-w-4xl animate-fade-in">
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Cadastrar Novo Advogado</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Cadastre advogados conhecidos para monitorar as partes contrárias e solicitar os contatos das mesmas (ex: WhatsApp).</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Nome do Advogado</label>
                      <input 
                        type="text" 
                        value={novoAdvNome}
                        onChange={(e) => setNovoAdvNome(e.target.value)}
                        placeholder="Ex: Dr. Fulano"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">OAB</label>
                      <input 
                        type="text" 
                        value={novoAdvOab}
                        onChange={(e) => setNovoAdvOab(e.target.value)}
                        placeholder="Ex: BA12345"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">WhatsApp</label>
                      <input 
                        type="text" 
                        value={novoAdvWhatsapp}
                        onChange={(e) => setNovoAdvWhatsapp(e.target.value)}
                        placeholder="Ex: 71999999999"
                        className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={handleAddAdvogado}
                        className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <UserPlus size={14} /> Adicionar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Advogado</th>
                          <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">OAB</th>
                          <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">WhatsApp</th>
                          <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-center">Monitorar</th>
                          <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 bg-white">
                        {advogados.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                              Nenhum advogado cadastrado.
                            </td>
                          </tr>
                        ) : (
                          advogados.map((adv) => (
                            <tr key={adv.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-800">{adv.nome}</td>
                              <td className="px-4 py-3 text-slate-600">{adv.oab || "-"}</td>
                              <td className="px-4 py-3 font-mono text-slate-600">{adv.whatsapp || "-"}</td>
                              <td className="px-4 py-3 text-center">
                                <label className="inline-flex items-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={adv.monitorar} 
                                    onChange={() => handleToggleMonitorarAdvogado(adv.id, adv.monitorar)}
                                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                </label>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAdvogado(adv.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer"
                                  title="Deletar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {settingsTab === "etiquetas" && (
              <div className="space-y-6 max-w-4xl animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Tag size={120} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Tag size={16} className="text-emerald-600" />
                    Gerenciar Etiquetas
                  </h3>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Adicionar Nova Etiqueta</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Nome da Etiqueta</label>
                        <input 
                          type="text" 
                          value={novaEtiquetaNome}
                          onChange={(e) => setNovaEtiquetaNome(e.target.value)}
                          placeholder="Ex: Urgente"
                          className="w-full px-3 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Cor (Opcional)</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={novaEtiquetaCor}
                            onChange={(e) => setNovaEtiquetaCor(e.target.value)}
                            className="w-10 h-10 p-1 border border-slate-300 bg-white rounded-lg cursor-pointer"
                          />
                          <span className="text-xs text-slate-500">{novaEtiquetaCor}</span>
                        </div>
                      </div>
                      <div>
                        <button 
                          onClick={handleAddEtiqueta}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow-md transition-colors flex justify-center items-center gap-2"
                        >
                          <Check size={14} /> Salvar Etiqueta
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-200">
                          <th className="p-4 font-bold">Etiqueta</th>
                          <th className="p-4 font-bold">Cor</th>
                          <th className="p-4 font-bold text-center w-24">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {etiquetas.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-8 text-center text-slate-400 text-sm">
                              Nenhuma etiqueta cadastrada. Adicione sua primeira etiqueta acima.
                            </td>
                          </tr>
                        ) : (
                          etiquetas.map((etq) => (
                            <tr key={etq.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-4">
                                <span 
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
                                  style={{ backgroundColor: `${etq.cor}15`, color: etq.cor, borderColor: `${etq.cor}30` }}
                                >
                                  <Tag size={12} /> {etq.nome}
                                </span>
                              </td>
                              <td className="p-4 text-xs font-mono text-slate-500">
                                <div className="flex items-center gap-2">
                                  <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: etq.cor }}></div>
                                  {etq.cor}
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => handleDeleteEtiqueta(etq.id)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Remover Etiqueta"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "manual":
        return (
          <div className="space-y-8 animate-fade-in">
            {/* Header section with elegant styling */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 border border-slate-800 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 translate-x-10 translate-y-10">
                <HelpCircle size={240} />
              </div>
              <div className="relative z-10 space-y-3 max-w-2xl">
                <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-bold text-[10px] uppercase tracking-wider">
                  Guia Interativo de Uso • Central Camamu
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                  Manual de Instruções do Sistema
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed font-light">
                  Aprenda a utilizar os recursos de inteligência artificial, filtros de importação e automação de contatos para acelerar o cumprimento de seus mandados judiciais.
                </p>
              </div>
            </div>

            {/* Grid layout for cards / Quick access */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Card 1: Dashboard */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl w-fit mb-4">
                    <LayoutDashboard size={24} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">1. Dashboard Analítico</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Acompanhe em tempo real os indicadores da comarca, contagem de processos únicos extraídos, taxa de sucesso de notificações, gráficos de distribuição por bairro e polos processuais.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                  <span>Monitoramento Completo</span>
                  <span className="px-2 py-0.5 bg-indigo-50 rounded text-[9px]">Análise</span>
                </div>
              </div>

              {/* Card 2: Enviar PDF */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl w-fit mb-4">
                    <ListPlus size={24} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">2. Enviar PDF e IA Gemini</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Carregue decisões ou mandados em formato PDF. A IA extrai instantaneamente dados de qualificações, endereços, bairros de Camamu, e datas/links de audiências agendadas.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-emerald-600">
                  <span>Extração Automatizada</span>
                  <span className="px-2 py-0.5 bg-emerald-50 rounded text-[9px]">Inteligência</span>
                </div>
              </div>

              {/* Card 3: Filtros de Ocultação */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl w-fit mb-4 flex gap-1">
                    <Baby size={18} />
                    <Users size={18} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">3. Filtros Nativos de Importação</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <strong>Nativamente ativos:</strong> Evite poluir sua relação de trabalho filtrando automaticamente o Polo Ativo (Autores) e omitindo Menores de Idade (para priorizar o contato direto com o representante legal).
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-amber-600">
                  <span>Habilitados por Padrão</span>
                  <span className="px-2 py-0.5 bg-amber-50 rounded text-[9px]">Controle</span>
                </div>
              </div>

              {/* Card 4: Conferir e Corrigir */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl w-fit mb-4">
                    <CheckSquare size={24} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">4. Conferir e Corrigir</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Revise os dados estruturados extraídos pela IA antes de salvar. Você pode ajustar endereços, corrigir grafias de nomes, associar cores de prioridade ou descartar linhas.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-blue-600">
                  <span>Garantia de Qualidade</span>
                  <span className="px-2 py-0.5 bg-blue-50 rounded text-[9px]">Curadoria</span>
                </div>
              </div>

              {/* Card 5: Relação Consolidada */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl w-fit mb-4">
                    <FileSpreadsheet size={24} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">5. Relação e Ações de Produtividade</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Sua base de dados definitiva e persistente em nuvem Firestore. Acesse o botão do WhatsApp com modelos preenchidos automaticamente, mapeamento no Google Maps, e exporte para Excel.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-purple-600">
                  <span>Sincronização em Nuvem</span>
                  <span className="px-2 py-0.5 bg-purple-50 rounded text-[9px]">Ações</span>
                </div>
              </div>

              {/* Card 6: Configurações de Template */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="p-3 bg-pink-50 text-pink-600 rounded-xl w-fit mb-4">
                    <Sliders size={24} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">6. Configurações de Mensagens</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Edite o modelo de texto padrão que será enviado pelo WhatsApp. Use etiquetas inteligentes como <code className="bg-slate-100 px-1 py-0.5 text-[10px] text-pink-700">{`{nome}`}</code> e <code className="bg-slate-100 px-1 py-0.5 text-[10px] text-pink-700">{`{processo}`}</code>.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-pink-600">
                  <span>Customização Dinâmica</span>
                  <span className="px-2 py-0.5 bg-pink-50 rounded text-[9px]">Configuração</span>
                </div>
              </div>

            </div>

            {/* Detailed step-by-step documentation panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-8">
              <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4">
                Passo a Passo Detalhado para o Dia a Dia
              </h3>

              {/* Step 1 */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-sm">
                  1
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-800">Extração Inteligente de Mandados</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Acesse a aba <strong>Enviar PDF</strong>. Antes de arrastar os arquivos, note as opções de pré-filtragem. 
                    Por padrão do tribunal, as caixas <strong>Ocultar Req./Polo Ativo</strong> e <strong>Ocultar menores de idade</strong> estão marcadas. 
                    Isto significa que a inteligência artificial removerá do resultado final as partes que entram com a ação (polo ativo) e os menores de idade 
                    (que necessitam de notificação direta ao representante). Caso deseje incluí-los no processamento, basta desmarcar essas opções e enviar o arquivo PDF.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-sm">
                  2
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-800">Conferência e Curadoria dos Resultados</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Ao concluir o envio, você será direcionado automaticamente para a aba <strong>Conferir e Corrigir</strong>. 
                    Nesta tela, examine cada registro encontrado. Se houver nomes com abreviações ou erros na extração original do PDF, clique sobre o campo desejado para editá-lo diretamente na grade. 
                    Você também pode atribuir uma cor de prioridade ou sinalizar pendências de endereço. Se estiver satisfeito com o resultado, clique em <strong>Confirmar Tudo</strong>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-sm">
                  3
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-800">Relação e Ações de Contato em Lote</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Acesse a aba <strong>Relação</strong> para gerenciar seus mandados consolidados no banco de dados permanente:
                  </p>
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-2">
                    <li>
                      <strong>WhatsApp Inteligente</strong>: Clique no botão do WhatsApp ao lado de uma parte. O sistema abrirá uma janela contendo a mensagem preenchida de forma personalizada com o nome, número do processo, data/hora da audiência de conciliação e o link oficial da sala de audiência virtual do tribunal.
                    </li>
                    <li>
                      <strong>Google Maps</strong>: Use o botão de localização para abrir instantaneamente o endereço no Google Maps e traçar a melhor rota de cumprimento.
                    </li>
                    <li>
                      <strong>Check de Conclusão</strong>: Ao notificar o destinatário com sucesso, clique na caixa de seleção ao lado esquerdo da linha. Isto marcará o mandado como cumprido, atualizando seus gráficos estatísticos.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-sm">
                  4
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-800">Personalização Completa nas Configurações</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Você pode alterar o comportamento e os dados gerados pelo sistema a qualquer momento:
                  </p>
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-2">
                    <li>
                      Acesse a aba <strong>Configurações</strong>.
                    </li>
                    <li>
                      Altere o link padrão de salas de audiência virtual (que será inserido na tag dinâmica <code className="bg-slate-100 px-1 py-0.5 text-slate-700">{`{link_audiencia}`}</code>).
                    </li>
                    <li>
                      Ajuste o texto padrão de cumprimento do WhatsApp de acordo com suas necessidades, utilizando as tags automáticas para economizar tempo de digitação repetitiva.
                    </li>
                  </ul>
                </div>
              </div>

            </div>

            {/* Help and support notice */}
            <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-6 text-emerald-850 flex items-start gap-4 shadow-inner">
              <div className="p-2 bg-emerald-600 text-white rounded-xl">
                <Info size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-emerald-900">Precisa de Ajuda Adicional?</h4>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Lembre-se de que os dados do aplicativo são salvos de forma segura no Firebase do tribunal, permitindo que você mude de computador ou acesse via celular sem o risco de perder as informações extraídas de seus processos jurídicos.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans">
      
      {/* 1. LEFT SIDEBAR MENU PANEL */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 text-white flex flex-col justify-between transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        
        {/* Sidebar Header Brand area */}
        <div className="p-5 border-b border-slate-800 flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-md flex items-center justify-center">
              <Scale size={20} className="stroke-2" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight leading-tight text-white">
                Central Camamu
              </h1>
              <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider leading-none">
                Gestão de Mandados
              </p>
            </div>
          </div>
        </div>

        {/* Vertical menu navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {[
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, fontSize: "18px" },
            { 
              id: "upload", 
              label: "Enviar e Conferir", 
              icon: ListPlus, 
              fontSize: "17px",
              badge: pendingProcesses.length > 0 ? pendingProcesses.length : undefined
            },
            { 
              id: "list", 
              label: "Relação", 
              icon: FileSpreadsheet,
              fontSize: "17px",
              badge: linhas.length > 0 ? linhas.length : undefined
            },
            { id: "settings", label: "Configurações", icon: Sliders, fontSize: "17px" },
            { id: "manual", label: "Manual", icon: HelpCircle, fontSize: "17px" }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsSidebarOpen(false); // Auto close sidebar on mobile
                }}
                style={{ fontSize: item.fontSize }}
                className={`w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl font-semibold transition-all text-left focus:outline-none cursor-pointer ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile and Logout Footer area */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none">Conectado como</p>
            <p className="text-xs text-slate-305 font-medium truncate" title={user.email || ""}>
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full mt-1.5 flex items-center gap-2 justify-center py-2 border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-850 rounded-xl text-xs font-bold text-rose-450 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            Sair do Sistema
          </button>
        </div>

      </aside>

      {/* Sidebar Backdrop Overlay on Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* 2. MAIN APPLICATION WORKSPACE WINDOW */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Mobile Navbar Header with Hamburger triggers */}
        <header className="sticky top-0 z-20 md:hidden bg-white text-slate-800 border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 focus:outline-none cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-1.5">
              <Scale size={16} className="text-emerald-600" />
              <span className="text-xs font-extrabold text-slate-900 tracking-tight">Central Camamu</span>
            </div>
          </div>
          
          <span className="text-[9px] px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full font-bold text-slate-500">
            {activeTab.toUpperCase()}
          </span>
        </header>

        {/* Content canvas viewport */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {renderTabContent()}
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

    </div>
  );
}
