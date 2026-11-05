/* ==================================================================
   Contratos — cópia local (neste computador) e geração de PDF
   ------------------------------------------------------------------
   Duas camadas, as duas só no navegador (nada disso vai pro servidor):

   1) IndexedDB ("educa-contratos-local"): TODO contrato que o sistema
      guarda (gerado, importado, renovado, assinado) ganha uma cópia
      aqui, sempre, sem a pessoa precisar fazer nada. É o "localStorage"
      de verdade pra arquivos: o localStorage em si só aguenta ~5 MB no
      total (poucos PDFs), o IndexedDB aguenta centenas de MB.

   2) Pasta do computador (File System Access API — Chrome/Edge): a
      secretaria escolhe UMA vez uma pasta (ex.: Documentos/Contratos
      Educa) e o sistema passa a gravar os PDFs lá dentro, organizados
      em subpastas por aluno. O navegador guarda a permissão; às vezes
      pede pra liberar de novo (um clique). Sem suporte (Firefox/Safari)
      a cópia fica só no IndexedDB e dá pra baixar pelo botão.

   Geração de PDF: html2pdf.js (carregado no index.html) desenha o
   contrato (mesmo HTML da impressão) direto em PDF A4, no navegador.
   ================================================================== */

const DB_NOME = "educa-contratos-local";
const DB_VERSAO = 1;
const LOJA_ARQUIVOS = "arquivos";
const LOJA_CONFIG = "config";

/* ---------------- IndexedDB ---------------- */
let dbPromessa = null;
function abrirDb(){
  if(dbPromessa) return dbPromessa;
  dbPromessa = new Promise((resolve, reject) => {
    if(typeof indexedDB === "undefined"){ reject(new Error("sem-indexeddb")); return; }
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(LOJA_ARQUIVOS)) db.createObjectStore(LOJA_ARQUIVOS, { keyPath: "id" });
      if(!db.objectStoreNames.contains(LOJA_CONFIG)) db.createObjectStore(LOJA_CONFIG);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromessa = null; reject(req.error); };
  });
  return dbPromessa;
}

function pedido(loja, modo, fn){
  return abrirDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(loja, modo);
    const req = fn(tx.objectStore(loja));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/* ---------------- nomes de arquivo/pasta ---------------- */
export function nomeSeguro(txt, max = 60){
  return String(txt || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, max);
}

/* "Contrato_Maria_Souza_Ingles_2026-11-05_renovacao.pdf" */
export function nomeArquivoContrato({ aluno, curso, data, sufixo = "", ext = "pdf" }){
  const partes = ["Contrato", nomeSeguro(aluno) || "aluno", nomeSeguro(curso, 30), String(data || "").slice(0, 10), nomeSeguro(sufixo, 20)]
    .filter(Boolean);
  return `${partes.join("_")}.${ext}`;
}

/* ---------------- pasta do computador ---------------- */
export function pastaSuportada(){
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function lerPasta(){
  try { return (await pedido(LOJA_CONFIG, "readonly", s => s.get("pasta"))) || null; }
  catch { return null; }
}

export async function pastaNome(){
  const h = await lerPasta();
  return h ? h.name : "";
}

/* Abre o seletor de pasta (precisa ser chamado direto de um clique). */
export async function escolherPasta(){
  if(!pastaSuportada()) throw new Error("sem-suporte");
  const handle = await window.showDirectoryPicker({ id: "educa-contratos", mode: "readwrite", startIn: "documents" });
  await pedido(LOJA_CONFIG, "readwrite", s => s.put(handle, "pasta"));
  return handle.name;
}

export async function removerPasta(){
  await pedido(LOJA_CONFIG, "readwrite", s => s.delete("pasta"));
}

/* Confere (e, se der, pede) a permissão de escrita na pasta. Chamar logo
   no começo de um clique, antes de qualquer espera longa, pra o navegador
   aceitar o pedido. Devolve true se dá pra gravar. */
export async function prepararPasta(){
  const h = await lerPasta();
  if(!h) return false;
  try {
    const opcoes = { mode: "readwrite" };
    if((await h.queryPermission(opcoes)) === "granted") return true;
    return (await h.requestPermission(opcoes)) === "granted";
  } catch { return false; }
}

async function gravarNaPasta(subpasta, nome, blob){
  const raiz = await lerPasta();
  if(!raiz) return false;
  const opcoes = { mode: "readwrite" };
  if((await raiz.queryPermission(opcoes)) !== "granted") return false;
  let dir = raiz;
  for(const parte of String(subpasta || "").split("/").filter(Boolean)){
    dir = await dir.getDirectoryHandle(nomeSeguro(parte, 80) || "pasta", { create: true });
  }
  const arq = await dir.getFileHandle(nome, { create: true });
  const w = await arq.createWritable();
  await w.write(blob);
  await w.close();
  return true;
}

/* ---------------- guardar um arquivo (as duas camadas) ----------------
   Nunca lança erro: devolve { navegador, pasta, erro } pra a tela avisar
   o que ficou guardado. `subpasta`: ex. "Maria_Souza". */
export async function guardarCopiaLocal({ nome, blob, subpasta = "", meta = {} }){
  const r = { navegador: false, pasta: false, erro: "" };
  const id = `${subpasta}/${nome}`;
  try {
    await pedido(LOJA_ARQUIVOS, "readwrite", s => s.put({
      id, nome, subpasta, blob, tamanho: blob.size, tipo: blob.type || "application/pdf",
      criadoEm: new Date().toISOString(), meta,
    }));
    r.navegador = true;
  } catch(err){ r.erro = err?.message || "indexeddb"; }
  try { r.pasta = await gravarNaPasta(subpasta, nome, blob); }
  catch(err){ r.erro = r.erro || err?.message || "pasta"; }
  return r;
}

/* Frase pronta pra mostrar na tela. */
export function resumoCopiaLocal(r){
  if(r.pasta && r.navegador) return "Cópia salva na pasta do computador e no navegador.";
  if(r.pasta) return "Cópia salva na pasta do computador.";
  if(r.navegador) return "Cópia salva no navegador (escolha uma pasta na aba Gerar e importar pra gravar também no computador).";
  return "Não consegui guardar a cópia local.";
}

/* ---------------- lista / exportação ---------------- */
export async function listarCopiasLocais(){
  try {
    const todos = await pedido(LOJA_ARQUIVOS, "readonly", s => s.getAll());
    return (todos || []).map(({ blob, ...resto }) => resto)
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  } catch { return []; }
}

export async function resumoLocal(){
  const lista = await listarCopiasLocais();
  const bytes = lista.reduce((t, x) => t + (x.tamanho || 0), 0);
  return { total: lista.length, bytes, pasta: await pastaNome(), pastaSuportada: pastaSuportada() };
}

/* Copia pra pasta tudo o que está guardado no navegador (serve pra
   "encher" a pasta depois de escolhê-la). Devolve { gravados, falhas }. */
export async function exportarTudoParaPasta(){
  const todos = await pedido(LOJA_ARQUIVOS, "readonly", s => s.getAll());
  let gravados = 0, falhas = 0;
  for(const item of (todos || [])){
    try { if(await gravarNaPasta(item.subpasta, item.nome, item.blob)) gravados++; else falhas++; }
    catch { falhas++; }
  }
  return { gravados, falhas };
}

/* Baixa um arquivo guardado no navegador (pelo id). */
export async function baixarCopiaLocal(id){
  const item = await pedido(LOJA_ARQUIVOS, "readonly", s => s.get(id));
  if(!item) return false;
  baixarBlob(item.blob, item.nome);
  return true;
}

export function baixarBlob(blob, nome){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ================================================================== */
/* HTML do contrato -> PDF (A4)                                         */
/* ================================================================== */

/* Limite igual ao do sistema (CONTRATO_PDF_TAMANHO_MAX em script.js). */
const PDF_MAX_BYTES = 4 * 1024 * 1024;

function esperarImagens(doc){
  const imgs = Array.from(doc.images || []);
  return Promise.all(imgs.map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = res; })));
}

/* Recebe o HTML completo do contrato (contratoHtml) e devolve um File PDF.
   O contrato é desenhado num iframe escondido (pra o CSS dele não vazar
   pro app) com margens de 18/16 mm, e as páginas saem em JPEG. Se o PDF
   passar do limite, refaz com qualidade menor. */
export async function htmlParaPdfFile(html, nomeArquivo){
  if(typeof window.html2pdf !== "function") throw new Error("html2pdf-ausente");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  try {
    const idoc = iframe.contentDocument;
    idoc.open(); idoc.write(html); idoc.close();
    // layout próprio do PDF: sem a barra de impressão, sem sombra, largura útil
    const css = idoc.createElement("style");
    css.textContent = `
      body { background:#fff !important; }
      .barra-imprimir { display:none !important; }
      .folha { width:178mm !important; min-height:0 !important; margin:0 !important; padding:0 !important; box-shadow:none !important; }
    `;
    idoc.head.appendChild(css);
    await esperarImagens(idoc);
    if(idoc.fonts && idoc.fonts.ready) await idoc.fonts.ready;
    const alvo = idoc.querySelector(".folha");
    if(!alvo) throw new Error("contrato-vazio");

    let ultimo = null;
    for(const [escala, qualidade] of [[2, 0.92], [1.6, 0.85], [1.25, 0.78]]){
      const blob = await window.html2pdf().set({
        margin: [18, 16, 18, 16],
        filename: nomeArquivo,
        image: { type: "jpeg", quality: qualidade },
        html2canvas: { scale: escala, useCORS: true, backgroundColor: "#ffffff", windowWidth: alvo.scrollWidth || 673 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
        pagebreak: { mode: ["css", "legacy"], avoid: ["p", "li", ".linha-assinatura", ".testemunhas"] },
      }).from(alvo).outputPdf("blob");
      ultimo = blob;
      if(blob.size <= PDF_MAX_BYTES) break;
    }
    if(!ultimo) throw new Error("pdf-vazio");
    return new File([ultimo], nomeArquivo, { type: "application/pdf" });
  } finally {
    iframe.remove();
  }
}
