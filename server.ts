import express from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Ensure DNS resolution defaults to IPv4
dns.setDefaultResultOrder("ipv4first");

const app = express();
const PORT = 3000;

// Body parser with 50mb limit to handle pdf base64 payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy initializer for Gemini client to prevent crashing on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "A chave GEMINI_API_KEY não foi encontrada nas variáveis de ambiente. Por favor, adicione-a em Settings > Secrets."
      );
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Extraction API
app.post("/api/extract", async (req, res) => {
  try {
    const { fileName, mimeType, base64, ignorarMenores, ignorarAtivos } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "O conteúdo base64 do arquivo é obrigatório." });
    }

    const client = getGeminiClient();

    let systemInstruction = 
      "Você é um assistente jurídico de alta precisão especializado em analisar processos do TJBA (Tribunal de Justiça da Bahia) que tramitam no PJe (Processo Judicial Eletrônico). " +
      "Seu objetivo é analisar o documento fornecido (petição inicial, capa do PJe, certidões etc.) e extrair os dados de TODAS as partes envolvidas " +
      "para criar uma lista de citações por oficial de justiça. " +
      "\n\n" +
      "Instruções cruciais:\n" +
      "1. NUNCA invente dados. Se um campo não costar expressamente no documento, retorne null.\n" +
      "2. Capa do PJe (que contém cabeçalhos detalhados do TJBA) é a fonte mais confiável para o Número do Processo (campo 'Número:'). " +
      "Se houver divergência entre o número do processo na capa do PJe e no cabeçalho ou texto da petição, informe essa divergência estritamente no campo 'obs'.\n" +
      "3. Nome do Cliente/Parte: Se a capa do PJe abreviar o nome de menores de idade com iniciais (ex: 'J.L.D.S.S.'), procure ativamente pelo nome por extenso no corpo da petição e use-o no campo de nome, sinalizando na obs a divergência de nome.\n" +
      "4. Comarca de Tramitação: Descubra para qual comarca do TJBA a petição é dirigida (ex: Seabra, Guanambi, Salvador, Barreiras, etc.). Mantenha no campo 'comarcaTramitacao'.\n" +
      "5. Identifique se o réu/polo passivo reside em comarca ou município diferente da comarca de tramitação. Nesse caso, sinalize em 'obs' que há 'Necessidade de CARTA PRECATÓRIA'.\n" +
      "6. Advogado Cadastrado: Procure se a parte possui advogado associado. Para o Autor/Requerente, quase sempre haverá o advogado que assina (ex: [nome] (OAB/...)). Para o Réu/Requerido, informe se consta já cadastrado ou 'NÃO consta'.\n" +
      "7. Citação por WhatsApp: Examine se a petição inicial pede expressamente a 'citação por WhatsApp' (com base no art. 246, §1º-C do CPC ou provimento local). Se houver o telefone da parte no documento e pedido de citação eletrônica/WhatsApp, extraia esse número e escreva na 'obs' a menção expressa.\n" +
      "8. Verifique se o processo está marcado como Segredo de Justiça na capa (Segredo de justiça? Sim/Não) e defina 'segredoJustica' de acordo (true ou false).\n" +
      "9. Se houver representantes (como mãe representando menor), inclua-os também na lista de partes ou descreva as informações cuidadosamente no campo 'obs' com o CPF do representante.\n" +
      "10. Classifique o endereço em 'Sede' ou 'Zona Rural'. Por padrão, se houver marcadores como 'povoado', 'fazenda', 'assentamento', 'área rural', 'sítio', 'chácara', 'zona rural', 'distrito', classifique como 'Zona Rural'. Senão, mantenha 'Sede'.";

    if (ignorarMenores) {
      systemInstruction += "\n11. IMPORTANTE (OPÇÃO ATIVADA NO SISTEMA): VOCÊ DEVE OBRIGATORIAMENTE OCULTAR/IGNORAR OS MENORES DE IDADE DA LISTA DE 'PARTES'. Liste APENAS o representante civil do menor (por exemplo, a mãe que está representando), qualificando a representante no lugar do menor, e NUNCA retorne o menor de idade no array de partes.";
    }

    if (ignorarAtivos) {
      systemInstruction += "\n12. IMPORTANTE (OPÇÃO ATIVADA NO SISTEMA): VOCÊ DEVE OBRIGATORIAMENTE OCULTAR/IGNORAR A PARTE REQUERENTE / POLO ATIVO DA LISTA DE 'PARTES'. Liste APENAS as partes do polo passivo (e.g. Réu), representantes ou terceiros. NUNCA retorne as partes do polo ativo/acionante no array de partes.";
    }

    const prompt = 
      "Analise com o máximo rigor este documento do processo judicial e extraia todos os dados estruturados " +
      "solicitados de acordo com o esquema JSON. Preencha todos os campos observando as regras de integridade jurídica fornecidas.";

    const filePart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: base64,
      },
    };

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [filePart, { text: prompt }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            numeroProcesso: {
              type: Type.STRING,
              description: "Número do processo unificado (CNJ) completo com formatação, ou null se não encontrado."
            },
            segredoJustica: {
              type: Type.BOOLEAN,
              description: "Indica se o processo tramita em segredo de justiça (true/false)."
            },
            comarcaTramitacao: {
              type: Type.STRING,
              description: "Cidade da comarca na Bahia em que o processo está tramitando (ex: Salvador, Barreiras, etc.)."
            },
            partes: {
              type: Type.ARRAY,
              description: "Lista de pessoas/empresas envolvidas no processo que necessitam ser qualificadas ou citadas.",
              items: {
                type: Type.OBJECT,
                properties: {
                  nome: {
                    type: Type.STRING,
                    description: "Nome completo por extenso da parte (se menor estiver abreviado na capa, busque o por extenso no corpo)."
                  },
                  menorDeIdade: {
                    type: Type.STRING,
                    description: "Indica se a pessoa é menor de idade. Retorne 'Sim' se for explicitamente menor de idade, 'Não' se for explicitamente maior ou capaz, ou deixe em branco '' se não for possível determinar com precisão ou não houver dados."
                  },
                  dataHoraAudiencia: {
                    type: Type.STRING,
                    description: "Data e hora da audiência designada (ex: '20/10/2026 às 14:30' ou '20/10/2026 - 14:00'). Procure no corpo do processo por despachos com datas de audiência. Caso não haja nos autos, retorne em branco ''."
                  },
                  dataAudiencia: {
                    type: Type.STRING,
                    description: "Data da audiência designada obrigatoriamente formatada como XX/XX/XXXX (DD/MM/AAAA) (ex: '20/10/2026'). Caso não haja nos autos, retorne em branco ''."
                  },
                  horaAudiencia: {
                    type: Type.STRING,
                    description: "Hora da audiência designada formatada como HH:MM (ex: '14:30'). Caso não haja nos autos, retorne em branco ''."
                  },
                  polo: {
                    type: Type.STRING,
                    description: "Polo na lide, escolha um entre (Autor, Requerente, Réu, Requerido, Representante, Representado, Terceiro interessado)."
                  },
                  advCadastrado: {
                    type: Type.STRING,
                    description: "Nome do advogado e OAB no formato: '[Nome] (OAB/BA nº XXXX)' ou 'NÃO consta'."
                  },
                  whatsapp: {
                    type: Type.STRING,
                    description: "Apenas os dígitos numéricos do telefone celular da parte, se houver expressamente (ex: 71999999999). NÃO coloque telefone do advogado."
                  },
                  endereco: {
                    type: Type.STRING,
                    description: "Endereço completo da parte (rua, número, bairro, cidade/UF, CEP) encontrado nos autos ou capa."
                  },
                  sedeZonaRural: {
                    type: Type.STRING,
                    description: "Deve ser exatamente 'Sede' se residir na zona urbana ou 'Zona Rural' se residir em fazendas, povoados, assentamentos, chácaras, etc."
                  },
                  obs: {
                    type: Type.STRING,
                    description: "Observação consolidada detalhando particularidades (e.g., menor, necessidade de precatória se reside fora da comarca, réu sem defensor cadastrado, pedido de citação por WhatsApp mencione art. 246, §1º-C, divergências TJBA capa x inicial, etc.)."
                  }
                },
                required: ["nome", "polo", "advCadastrado", "endereco", "sedeZonaRural", "obs", "menorDeIdade", "dataHoraAudiencia", "dataAudiencia", "horaAudiencia"]
              }
            }
          },
          required: ["numeroProcesso", "segredoJustica", "partes"]
        }
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("O Gemini retornou uma resposta vazia.");
    }

    const data = JSON.parse(outputText.trim());
    return res.json(data);
  } catch (error: any) {
    console.error("Erro na extração:", error);
    
    let errorMessage = error.message || "Erro desconhecido ao processar o PDF.";
    
    if (
      errorMessage.includes("429") || 
      errorMessage.includes("RESOURCE_EXHAUSTED") || 
      errorMessage.includes("Quota exceeded") || 
      errorMessage.includes("Too Many Requests")
    ) {
      errorMessage = "Limite de requisições à IA excedido (Quota Free Tier). Por favor, aguarde cerca de um minuto antes de tentar enviar novos processos.";
    } else if (errorMessage.includes("401") || errorMessage.includes("API_KEY_INVALID")) {
      errorMessage = "Chave da API do Gemini inválida ou inexistente. Por favor, configure uma chave válida em Settings > Secrets.";
    }

    return res.status(500).json({ error: errorMessage });
  }
});

// Geocode Proxy Route
app.get("/api/geocode", async (req, res) => {
  try {
    const address = req.query.address as string;
    if (!address) {
      return res.status(400).json({ error: "O endereço é obrigatório." });
    }

    // Try finding the exact address first
    let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: {
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": "TJBA-Assistant/1.0"
      }
    });
    
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    // Fallback: If not found, try appending 'Brasil' to give more context
    if (!data || data.length === 0) {
      const fallbackQuery = `${address}, Brasil`;
      response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`, {
        headers: {
          "Accept-Language": "pt-BR,pt;q=0.9",
          "User-Agent": "TJBA-Assistant/1.0"
        }
      });
      try {
        data = await response.json();
      } catch (e) {
        data = [];
      }
    }
    
    return res.json(data);
  } catch (error: any) {
    console.error("Geocode error:", error);
    return res.status(500).json({ error: "Failed to fetch coordinates" });
  }
});

// Distance Proxy Route (OSRM)
app.get("/api/distance", async (req, res) => {
  try {
    const { lon1, lat1, lon2, lat2 } = req.query;
    if (!lon1 || !lat1 || !lon2 || !lat2) {
      return res.status(400).json({ error: "Coordenadas obrigatórias." });
    }

    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`);
    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error("Distance error:", error);
    return res.status(500).json({ error: "Failed to fetch distance" });
  }
});

// Serve frontend assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FULLSTACK] Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
