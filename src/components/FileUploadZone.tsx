import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { ProcessoExtraido } from "../types";

export interface UploadedFileState {
  id: string;
  name: string;
  size: string;
  progress: number;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
}

interface FileUploadZoneProps {
  onDataParsed: (fileName: string, data: ProcessoExtraido) => void;
  filesState: UploadedFileState[];
  setFilesState: React.Dispatch<React.SetStateAction<UploadedFileState[]>>;
  onExtractionAttempt?: () => void;
}

export default function FileUploadZone({
  onDataParsed,
  filesState,
  setFilesState,
  onExtractionAttempt
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [ignorarMenores, setIgnorarMenores] = useState(true);
  const [ignorarAtivos, setIgnorarAtivos] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const processFile = async (file: File, alvos: string[], ocultarDemais: boolean) => {
    const fileId = Math.random().toString(36).substring(2, 9);
    const newFileState: UploadedFileState = {
      id: fileId,
      name: file.name,
      size: formatSize(file.size),
      progress: 10,
      status: "processing",
    };

    setFilesState((prev) => [newFileState, ...prev]);

    try {
      // 1. Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data:application/pdf;base64, prefix
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error("Erro ao ler o arquivo PDF localmente"));
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;

      setFilesState((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, progress: 40 } : f))
      );

      // 2. Call server extraction endpoint
      if (onExtractionAttempt) {
        onExtractionAttempt();
      }
      
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          base64: base64Data,
          ignorarMenores,
          ignorarAtivos,
        }),
      });

      setFilesState((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, progress: 80 } : f))
      );

      if (!response.ok) {
        let errorMessage = `Erro do servidor (${response.status})`;
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch {
          // If response is not JSON
        }
        throw new Error(errorMessage);
      }

      const extractedData: ProcessoExtraido = await response.json();
      extractedData.fileName = file.name;

      // Ensure parts values are correct
      if (!extractedData.partes || !Array.isArray(extractedData.partes)) {
        extractedData.partes = [];
      }

      // Apply filter / highlights
      if (alvos && alvos.length > 0) {
        extractedData.partes.forEach(p => {
          let matches = false;
          if (alvos.includes("Ativo") && ["Autor", "Requerente", "Representante"].includes(p.polo)) {
            matches = true;
          }
          if (alvos.includes("Passivo") && ["Réu", "Requerido", "Representado"].includes(p.polo)) {
            matches = true;
          }
          if (alvos.includes("Terceiro") && p.polo === "Terceiro interessado") {
            matches = true;
          }
          p.alvoComunicacao = matches;
        });

        if (ocultarDemais) {
          extractedData.partes = extractedData.partes.filter(p => p.alvoComunicacao);
        }
      } else {
        // If empty selection, default to all as targets
        extractedData.partes.forEach(p => {
          p.alvoComunicacao = true;
        });
      }

      setFilesState((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, progress: 100, status: "success" as const }
            : f
        )
      );

      // Notify parent app
      onDataParsed(file.name, extractedData);
    } catch (err: any) {
      console.error(err);
      setFilesState((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                progress: 100,
                status: "error" as const,
                error: err.message || "Erro desconhecido na extração judicial",
              }
            : f
        )
      );
    }
  };

  const [pendingConfigs, setPendingConfigs] = useState<{file: File, id: string, alvos: string[], ocultarDemais: boolean}[]>([]);

  const handeFiles = async (files: FileList) => {
    const validFiles = Array.from(files).filter(file => {
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        return true;
      }
      alert(`O arquivo "${file.name}" não é um PDF. Selecione apenas petições ou capas em formato PDF.`);
      return false;
    });

    const newConfigs = validFiles.map(file => ({
      file,
      id: Math.random().toString(36).substring(2, 9),
      alvos: ["Passivo"],
      ocultarDemais: false
    }));

    setPendingConfigs(prev => [...prev, ...newConfigs]);
  };

  const startProcessingQueue = async () => {
    const configsToProcess = [...pendingConfigs];
    setPendingConfigs([]);
    
    for (const config of configsToProcess) {
      await processFile(config.file, config.alvos, config.ocultarDemais);
      // Add a small 1s delay between processing each file to help with Free Tier burst limits
      await new Promise(res => setTimeout(res, 1000));
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handeFiles(e.dataTransfer.files);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handeFiles(e.target.files);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const clearFile = (id: string) => {
    setFilesState((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Checkboxes globais foram removidos pois agora é configurado por arquivo */}
      </div>

      {pendingConfigs.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md animate-fade-in">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" />
            Configurações de Extração ({pendingConfigs.length} arquivo{pendingConfigs.length > 1 ? 's' : ''})
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Antes de a IA analisar os PDFs, informe para cada documento quem é o alvo da comunicação.
          </p>
          
          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto pr-2">
            {pendingConfigs.map((config, index) => (
              <div key={config.id} className="p-4 border border-slate-200 rounded-2xl bg-slate-50">
                <div className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  {config.file.name}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Para quem é a comunicação?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "Ativo", label: "Polo Ativo" },
                        { id: "Passivo", label: "Polo Passivo" },
                        { id: "Terceiro", label: "Terceiros" }
                      ].map(opt => {
                        const isChecked = config.alvos.includes(opt.id);
                        return (
                          <label key={opt.id} className="flex items-center gap-2 cursor-pointer bg-white border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const newConfigs = [...pendingConfigs];
                                if (e.target.checked) {
                                  newConfigs[index].alvos = [...config.alvos, opt.id];
                                } else {
                                  newConfigs[index].alvos = config.alvos.filter(a => a !== opt.id);
                                }
                                setPendingConfigs(newConfigs);
                              }}
                              className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-xs font-semibold text-slate-700">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center cursor-pointer gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={config.ocultarDemais}
                        onChange={(e) => {
                          const newConfigs = [...pendingConfigs];
                          newConfigs[index].ocultarDemais = e.target.checked;
                          setPendingConfigs(newConfigs);
                        }}
                        className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-sm font-semibold text-slate-700">Ocultar demais partes?</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPendingConfigs([])}
              className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={startProcessingQueue}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-md transition-colors"
            >
              Iniciar Análise com IA
            </button>
          </div>
        </div>
      ) : (
        <div
          id="drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={triggerUpload}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
          isDragging
            ? "border-emerald-500 bg-emerald-50 scale-[0.99] shadow-inner"
            : "border-slate-300 bg-slate-50/50 hover:border-emerald-500/50 hover:bg-slate-100/35 shadow-sm"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileChange}
          accept="application/pdf"
          multiple
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className={`p-4 rounded-full transition-colors duration-300 ${
            isDragging ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
          }`}>
            <UploadCloud size={38} className={isDragging ? "animate-bounce" : ""} />
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 text-base">
              Arraste e solte seus PDFs processuais aqui
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Petições iniciais, capas do PJe TJBA ou documentos complementares
            </p>
          </div>

          <button
            type="button"
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-xs hover:bg-emerald-500 shadow-sm tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            Selecionar Arquivos do Computador
          </button>
          
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Suporta múltiplos PDFs em lote</span>
        </div>
      </div>
      )}

      {filesState.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-205 shadow-md overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
            <h4 className="font-semibold text-slate-700 text-xs flex items-center gap-2">
              <FileText size={16} className="text-emerald-600" />
              Arquivos em Processamento ({filesState.length})
            </h4>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Extração via IA Gemini 3.5</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            <AnimatePresence initial={false}>
              {filesState.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-all"
                >
                  <div className="flex items-center space-x-3.5 flex-1 min-w-0 pr-4">
                    <div className={`p-2.5 rounded-lg ${
                      file.status === "success" 
                        ? "bg-emerald-50 text-emerald-600" 
                        : file.status === "error"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-600"
                    }`}>
                      {file.status === "success" && <CheckCircle2 size={18} />}
                      {file.status === "error" && <XCircle size={18} />}
                      {file.status === "processing" && <Loader2 size={18} className="animate-spin" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 text-sm truncate block">
                          {file.name}
                        </span>
                        <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                          {file.size}
                        </span>
                      </div>

                      {/* Loading Progress Bar */}
                      <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${file.progress}%` }}
                          transition={{ duration: 0.3 }}
                          className={`h-full rounded-full ${
                            file.status === "success"
                              ? "bg-emerald-500"
                              : file.status === "error"
                              ? "bg-red-500"
                              : "bg-amber-500 animate-pulse"
                          }`}
                        />
                      </div>

                      {file.error ? (
                        <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {file.error}
                        </p>
                      ) : file.status === "processing" ? (
                        <p className="text-xs text-amber-600 font-medium mt-1">
                          {file.progress < 40 ? "Lendo arquivo..." : "IA analisando documento judicial..."}
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-600 font-medium mt-1">
                          Dados estruturados prontos para conferência!
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFile(file.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition-all focus:outline-none"
                    title="Remover da lista"
                  >
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
