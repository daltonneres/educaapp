/* ==================================================================
   Educa+ — avaliacoes.js
   ------------------------------------------------------------------
   Aba "Avaliações" (aluno, responsável, professor e secretaria).
   Este arquivo NÃO fala com o Firebase: só recebe dados já carregados
   e devolve HTML (igual calendario.js e contratos.js). Quem busca e
   grava no Firestore é o script.js.

   Duas partes:

   1) BOLETIM (Report Card) — só alunos de Inglês.
      Preenchido pelo professor (ou pela secretaria) e lido pelo aluno
      e pelo responsável. Segue o modelo impresso: identificação
      (aluno, livro, professor, grupo), seis critérios marcados com X
      em "Perfect! / Good / Try to do better" nos dois semestres,
      bloco Extra Grades / Practice Tests / Total (nota 0–100) e o
      feedback em texto.

   2) AVALIAÇÃO INSTITUCIONAL — todos os alunos e responsáveis.
      Questionário de 1 a 5 sobre o Educa+ (aulas, professores,
      material, estrutura, secretaria, comunicação), uma resposta por
      pessoa, por aluno e por semestre. A secretaria vê o resultado
      consolidado, sem o nome de quem respondeu.
   ================================================================== */

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function esc(v){
  return String(v == null ? "" : v).replace(/[&<>"]/g, c => ESC_MAP[c]);
}

export function normalizar(s){
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/* O curso do aluno (campo "turma" do cadastro) e a disciplina da turma
   guardam o texto "Inglês". Só esses entram no boletim. */
export function ehAlunoDeIngles(texto){
  return normalizar(texto).includes("ingles");
}

/* ================================================================== */
/* Estado inicial da aba (usado em state.aval do script.js)             */
/* ================================================================== */
export function avalNovoEstado(){
  return {
    sub: "boletim",              // boletim | institucional (aluno, responsável e secretaria)

    // lado do aluno/responsável
    boletimCache: {},            // { [alunoId]: { registros, carregando, erro, carregadoEm } }
    instCache: {},               // { [alunoId]: { registro, carregando, erro, carregadoEm } }
    instConfigCache: {},         // { [escolaId]: { config: {ativo, perguntas}, carregando, erro, carregadoEm } }
    instForm: null,              // { respostas: {id: 1..5}, comentario }
    instFormAlunoId: null,       // aluno a que instForm pertence
    instSalvando: false,
    instErro: "",
    instOk: false,

    // lado de quem preenche o boletim (professor e secretaria)
    turmaId: null,
    lista: null,                 // boletins já salvos da turma escolhida
    listaTurmaId: null,
    carregando: false,
    erro: "",
    alunoNome: null,             // aluno aberto no editor
    form: null,                  // ver boletimFormVazio()
    salvando: false,
    formErro: "",
    formOk: false,
    impressaoErro: "",

    // resultados da avaliação institucional (secretaria)
    periodo: periodoAtual(),
    resultados: null,            // { escolaId, periodo, registros, carregadoEm }
    resultadosCarregando: false,
    resultadosErro: "",

    // configuração da avaliação institucional (secretaria): perguntas
    // personalizadas e liga/desliga de respostas novas — ver
    // avaliacaoInstConfig/{escolaId}
    configEscolaId: null,
    configForm: null,            // { ativo, perguntas: [{id, texto}] } — rascunho em edição
    configFormCarregado: false,  // true depois que o rascunho já nasceu em cima dos dados reais (não do padrão provisório)
    configCarregando: false,
    configSalvando: false,
    configErro: "",
    configOk: false,
  };
}

/* ================================================================== */
/* Boletim (Report Card)                                                */
/* ================================================================== */
export const CRITERIOS_BOLETIM = [
  { id: "fluenciaOral",     rotulo: "Fluência Oral" },
  { id: "fluenciaAuditiva", rotulo: "Fluência Auditiva" },
  { id: "fluenciaEscrita",  rotulo: "Fluência Escrita" },
  { id: "tarefa",           rotulo: "Tarefa" },
  { id: "participacao",     rotulo: "Participação" },
  { id: "presenca",         rotulo: "Presença" },
];

export const NIVEIS_BOLETIM = [
  { id: "perfect", rotulo: "Perfect!" },
  { id: "good",    rotulo: "Good" },
  { id: "try",     rotulo: "Try to do better" },
];

const CAMPOS_EXTRA = [
  { id: "extraGrades",   rotulo: "Extra Grades" },
  { id: "practiceTests", rotulo: "Practice Tests" },
  { id: "total",         rotulo: "Total" },
];

/* Texto do modelo, oferecido no botão "Inserir texto sugerido" — o
   professor ajusta em cima dele. */
export const FEEDBACK_PADRAO =
  "O(a) aluno(a) apresentou bom desempenho ao longo do período, participando das atividades propostas e demonstrando evolução na compreensão e no uso da língua inglesa. Recomenda-se manter os estudos e a prática constante para ampliar o vocabulário e desenvolver ainda mais a comunicação em inglês.";

function semVazio(){
  const o = {};
  CRITERIOS_BOLETIM.forEach(c => { o[c.id] = ""; });
  return o;
}

function semLimpo(sem){
  const o = semVazio();
  CRITERIOS_BOLETIM.forEach(c => {
    const v = sem && sem[c.id];
    o[c.id] = NIVEIS_BOLETIM.some(n => n.id === v) ? v : "";
  });
  return o;
}

/* "8,5" ou "8.5" -> 8.5 · vazio -> null · texto inválido -> NaN */
export function parseNota(texto){
  const t = String(texto == null ? "" : texto).trim().replace(",", ".");
  if(t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/* 9 -> "9,0" · 8.5 -> "8,5" · null/"" -> "" */
export function fmtNota(valor){
  if(valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : parseNota(valor);
  if(n === null || Number.isNaN(n)) return "";
  let s = String(Math.round(n * 100) / 100);
  if(!s.includes(".")) s += ".0";
  return s.replace(".", ",");
}

/* Formulário (tudo texto, é o que os campos da tela editam) */
export function boletimFormVazio({ livro = "", grupo = "", professor = "" } = {}){
  return {
    livro, grupo, professor,
    sem1: semVazio(),
    sem2: semVazio(),
    extra: { extraGrades: "", practiceTests: "", total: "" },
    feedback: "",
  };
}

/* Documento do Firestore -> formulário */
export function boletimParaForm(b){
  const x = (b && b.extra) || {};
  return {
    livro: (b && b.livro) || "",
    grupo: (b && b.grupo) || "",
    professor: (b && b.professorNome) || "",
    sem1: semLimpo(b && b.sem1),
    sem2: semLimpo(b && b.sem2),
    extra: {
      extraGrades: fmtNota(x.extraGrades),
      practiceTests: fmtNota(x.practiceTests),
      total: fmtNota(x.total),
    },
    feedback: (b && b.feedback) || "",
  };
}

/* Devolve o texto do erro (ou "" se estiver tudo certo). */
export function validarBoletimForm(form){
  for(const campo of CAMPOS_EXTRA){
    const n = parseNota(form.extra[campo.id]);
    if(Number.isNaN(n)) return `${campo.rotulo}: use só números (ex.: 8,5).`;
    if(n !== null && (n < 0 || n > 100)) return `${campo.rotulo}: a nota vai de 0 a 100.`;
  }
  return "";
}

/* Formulário -> campos prontos pra gravar (notas viram número ou null). */
export function formParaBoletim(form){
  return {
    livro: (form.livro || "").trim(),
    grupo: (form.grupo || "").trim(),
    professorNome: (form.professor || "").trim(),
    sem1: semLimpo(form.sem1),
    sem2: semLimpo(form.sem2),
    extra: {
      extraGrades: parseNota(form.extra.extraGrades),
      practiceTests: parseNota(form.extra.practiceTests),
      total: parseNota(form.extra.total),
    },
    feedback: (form.feedback || "").trim(),
  };
}

/* O mesmo HTML serve pra tela editável (professor/secretaria), pra tela
   de leitura (aluno/responsável) e pra impressão. */
export function boletimHtml({ alunoNome, form, editavel }){
  const ident = (rotulo, campo, valor) => editavel
    ? `<label class="rc-ident-item"><span>${rotulo}</span><input class="teacher-text-input" data-aval-campo="${campo}" value="${esc(valor)}" /></label>`
    : `<div class="rc-ident-item"><span>${rotulo}</span><strong>${esc(valor) || "—"}</strong></div>`;

  const celula = (sem, crit, nivel) => {
    const marcado = form["sem" + sem][crit.id] === nivel.id;
    if(editavel){
      return `<td class="rc-cel"><button type="button" class="rc-marca ${marcado ? "on" : ""}" data-action="aval-marcar" data-sem="${sem}" data-crit="${crit.id}" data-nivel="${nivel.id}" aria-pressed="${marcado}" aria-label="${esc(crit.rotulo)} — ${esc(nivel.rotulo)} (${sem === 1 ? "First" : "Second"} Semester)">${marcado ? "X" : ""}</button></td>`;
    }
    return `<td class="rc-cel">${marcado ? `<span class="rc-x">X</span>` : ""}</td>`;
  };

  const niveisCab = NIVEIS_BOLETIM.map(n => `<th class="rc-nivel">${n.rotulo}</th>`).join("");
  const linhas = CRITERIOS_BOLETIM.map(crit => `
      <tr>
        <th scope="row" class="rc-crit">${crit.rotulo}</th>
        ${NIVEIS_BOLETIM.map(n => celula(1, crit, n)).join("")}
        ${NIVEIS_BOLETIM.map(n => celula(2, crit, n)).join("")}
      </tr>`).join("");

  const celulaExtra = campo => editavel
    ? `<td class="rc-cel"><input class="rc-nota-input" inputmode="decimal" placeholder="0–100" data-aval-campo="extra.${campo.id}" value="${esc(form.extra[campo.id])}" aria-label="${esc(campo.rotulo)}" /></td>`
    : `<td class="rc-cel rc-nota">${esc(fmtNota(form.extra[campo.id])) || "—"}</td>`;

  const feedback = editavel
    ? `<textarea class="rc-feedback-input" rows="5" data-aval-campo="feedback" placeholder="Feedback do professor sobre o período">${esc(form.feedback)}</textarea>
       <button type="button" class="attendance-btn" style="margin-top:8px;" data-action="aval-feedback-padrao">Inserir texto sugerido</button>`
    : `<p class="rc-feedback">${esc(form.feedback) || "—"}</p>`;

  return `
  <div class="rc">
    <div class="rc-titulo">Report Card – BOLETIM</div>
    <div class="rc-ident">
      <div class="rc-ident-item"><span>Student’s Name:</span><strong>${esc(alunoNome) || "—"}</strong></div>
      ${ident("Book:", "livro", form.livro)}
      ${ident("Teacher’s Name:", "professor", form.professor)}
      ${ident("Group:", "grupo", form.grupo)}
    </div>

    <div class="rc-scroll">
      <table class="rc-tabela">
        <thead>
          <tr>
            <th rowspan="2" class="rc-vazio"></th>
            <th colspan="3" class="rc-sem">First Semester</th>
            <th colspan="3" class="rc-sem">Second Semester</th>
          </tr>
          <tr>${niveisCab}${niveisCab}</tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>

    <div class="rc-scroll">
      <table class="rc-tabela rc-extra">
        <thead>
          <tr><th colspan="4" class="rc-sem">Extra Grades</th></tr>
          <tr><th class="rc-vazio"></th>${CAMPOS_EXTRA.map(c => `<th class="rc-nivel">${c.rotulo}</th>`).join("")}</tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" class="rc-crit">Nota (0 – 100)</th>
            ${CAMPOS_EXTRA.map(celulaExtra).join("")}
          </tr>
        </tbody>
      </table>
    </div>

    <div class="rc-feedback-bloco">
      <div class="rc-feedback-rotulo">Feedback:</div>
      ${feedback}
    </div>
  </div>`;
}

/* ---------------- impressão / PDF ---------------- */
const CSS_IMPRESSAO = `
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#122032;margin:0;padding:28px;max-width:820px;margin-inline:auto}
  header{text-align:center;margin-bottom:14px}
  header img{max-height:64px}
  .rc-titulo{text-align:center;font-size:20px;font-weight:700;letter-spacing:.5px;margin:6px 0 14px}
  .rc-ident{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:16px;font-size:14px}
  .rc-ident-item span{color:#5B6B7E;margin-right:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px}
  th,td{border:1px solid #122032;padding:8px 6px;text-align:center}
  .rc-crit{text-align:left;font-weight:600;background:#F7F3E9}
  .rc-sem,.rc-nivel{background:#0E2038;color:#fff}
  .rc-nivel{font-size:12px}
  .rc-vazio{background:#fff;border-top-color:#fff;border-left-color:#fff}
  .rc-x{font-weight:700;font-size:16px}
  .rc-nota{font-weight:700}
  .rc-feedback-bloco{border:1px solid #122032;padding:10px 12px;font-size:13.5px;line-height:1.5}
  .rc-feedback-rotulo{font-weight:700;margin-bottom:4px}
  .rc-feedback{margin:0;white-space:pre-wrap}
  @media print{body{padding:0}}
`;

export function boletimDocumentoImpressao({ alunoNome, form, logoUrl }){
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" />
<title>Boletim — ${esc(alunoNome)}</title>
<style>${CSS_IMPRESSAO}</style></head>
<body>
<header><img src="${esc(logoUrl)}" alt="Educa+ Centro Educacional" /></header>
${boletimHtml({ alunoNome, form, editavel: false })}
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<\/script>
</body></html>`;
}

/* Abre o boletim numa aba nova, já chamando a impressão (a pessoa pode
   escolher "Salvar como PDF"). Devolve false se o navegador bloqueou o pop-up. */
export function abrirBoletimParaImpressao({ alunoNome, form }){
  const logoUrl = new URL("imgs/logoeduca.jpeg", window.location.href).href;
  const html = boletimDocumentoImpressao({ alunoNome, form, logoUrl });
  const janela = window.open("", "_blank");
  if(!janela) return false;
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
  return true;
}

/* ================================================================== */
/* Sub-abas (Boletim | Avaliação institucional)                         */
/* ================================================================== */
export function avalSubAbasHtml(subs, atual){
  return `<div class="aval-subabas">${subs.map(s => `
    <button type="button" class="teacher-class-card ${s.key === atual ? "active" : ""}" data-action="aval-sub" data-sub="${esc(s.key)}">
      <strong>${esc(s.label)}</strong>
      ${s.desc ? `<small>${esc(s.desc)}</small>` : ""}
    </button>`).join("")}</div>`;
}

/* ================================================================== */
/* Avaliação institucional                                              */
/* ================================================================== */
export const PERGUNTAS_INSTITUCIONAIS = [
  { id: "aulas",        texto: "As aulas são claras, dinâmicas e interessantes." },
  { id: "professores",  texto: "Os professores são atenciosos e respeitosos com os alunos." },
  { id: "material",     texto: "O material didático é adequado e bem aproveitado nas aulas." },
  { id: "estrutura",    texto: "A estrutura da escola (salas, limpeza, equipamentos) é boa." },
  { id: "secretaria",   texto: "O atendimento da secretaria é atencioso e resolve o que preciso." },
  { id: "comunicacao",  texto: "A comunicação da escola (avisos, app, WhatsApp) funciona bem." },
  { id: "evolucao",     texto: "Percebo evolução no aprendizado ao longo do semestre." },
  { id: "recomendaria", texto: "Eu recomendaria o Educa+ para um amigo ou familiar." },
];

export const ESCALA_INSTITUCIONAL = [
  "Discordo totalmente", "Discordo", "Neutro", "Concordo", "Concordo totalmente",
];

/* ================================================================== */
/* Configuração da avaliação institucional (secretaria)                 */
/* ------------------------------------------------------------------
   A secretaria pode trocar as perguntas e abrir/bloquear as respostas
   a qualquer momento (coleção avaliacaoInstConfig/{escolaId}). Sem
   configuração salva ainda, valem as perguntas padrão acima e a
   avaliação fica aberta.
   ================================================================== */
export function avalConfigPadrao(){
  return { ativo: true, perguntas: PERGUNTAS_INSTITUCIONAIS.map(p => ({ ...p })) };
}

/* Documento do Firestore (ou null/inexistente) -> configuração usada
   pelas telas. Perguntas inválidas ou ausentes caem no padrão. */
export function avalConfigDeDocumento(dados){
  const brutas = Array.isArray(dados && dados.perguntas) ? dados.perguntas : [];
  const perguntas = brutas
    .map(p => ({ id: String((p && p.id) || "").trim(), texto: String((p && p.texto) || "").trim() }))
    .filter(p => p.id && p.texto);
  return {
    ativo: !(dados && dados.ativo === false),
    perguntas: perguntas.length ? perguntas : PERGUNTAS_INSTITUCIONAIS.map(p => ({ ...p })),
  };
}

/* Texto -> id (slug) único dentro da lista já existente, pra não colidir
   com perguntas antigas cujas respostas já foram salvas. */
export function novoIdPergunta(texto, perguntasExistentes){
  const base = normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "pergunta";
  const usados = new Set((perguntasExistentes || []).map(p => p.id));
  if(!usados.has(base)) return base;
  let i = 2;
  while(usados.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/* Devolve o texto do erro (ou "" se estiver tudo certo) pra salvar a
   configuração de perguntas. */
export function validarConfigPerguntas(perguntas){
  const lista = Array.isArray(perguntas) ? perguntas : [];
  if(lista.length === 0) return "Cadastre pelo menos uma pergunta.";
  if(lista.some(p => !String((p && p.texto) || "").trim())) return "Nenhuma pergunta pode ficar em branco.";
  return "";
}

/* Painel de configuração (secretaria): liga/desliga e edição das
   perguntas de 1 a 5. */
export function avalConfigInstitucionalHtml({ form, carregando, salvando, erro, ok }){
  if(carregando && !form){
    return `<div class="card flush"><div style="padding:20px;font-size:14px;color:var(--slate);">Carregando configuração…</div></div>`;
  }
  const f = form || avalConfigPadrao();
  const perguntas = f.perguntas.map((p, i) => `
    <div class="aval-config-pergunta">
      <span class="aval-n">${i + 1}</span>
      <input class="teacher-text-input" data-action="aval-config-pergunta-texto" data-idx="${i}" value="${esc(p.texto)}" placeholder="Texto da pergunta" />
      <button type="button" class="attendance-btn aval-config-remover" data-action="aval-config-pergunta-remover" data-idx="${i}" ${f.perguntas.length <= 1 ? "disabled" : ""} aria-label="Remover esta pergunta">✕</button>
    </div>`).join("");

  return `
  <div class="teacher-panel aval-config">
    <div class="teacher-panel-head">
      <div><h2>Configurar avaliação institucional</h2><p>Personalize as perguntas e libere ou bloqueie novas respostas quando quiser.</p></div>
      <button type="button" class="aval-config-toggle ${f.ativo ? "on" : "off"}" data-action="aval-config-toggle" role="switch" aria-checked="${f.ativo}" title="${f.ativo ? "Clique para bloquear" : "Clique para liberar"}">
        <span class="aval-config-toggle-bolinha"></span>
      </button>
    </div>
    <p class="aval-intro">${f.ativo
      ? "Aberta: alunos e responsáveis podem responder (ou atualizar a resposta) neste semestre."
      : "Bloqueada: ninguém consegue enviar ou alterar respostas até você liberar de novo."}</p>

    <h3 class="aval-h3" style="margin-top:18px;">Perguntas (escala de 1 a 5)</h3>
    <div class="aval-config-lista">${perguntas}</div>
    <div class="aval-config-acoes">
      <button type="button" class="attendance-btn" data-action="aval-config-pergunta-add">+ Adicionar pergunta</button>
      <button type="button" class="attendance-btn" data-action="aval-config-restaurar">Restaurar perguntas padrão</button>
    </div>

    <button type="button" class="teacher-primary-btn" style="margin-top:18px;" data-action="aval-config-salvar" ${salvando ? "disabled" : ""}>${salvando ? "Salvando…" : "Salvar configuração"}</button>
    ${erro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${esc(erro)}</p>` : ""}
    ${ok ? `<p class="teacher-success">Configuração salva.</p>` : ""}
  </div>`;
}

/* Uma avaliação por semestre: jan–jun = 1º, jul–dez = 2º. */
export function periodoAtual(data = new Date()){
  return `${data.getFullYear()}-S${data.getMonth() < 6 ? 1 : 2}`;
}

export function rotuloPeriodo(periodo){
  const m = /^(\d{4})-S([12])$/.exec(periodo || "");
  return m ? `${m[2]}º semestre de ${m[1]}` : String(periodo || "");
}

export function periodosRecentes(qtd = 4){
  const [ano, sem] = periodoAtual().split("-S").map(Number);
  const lista = [];
  let a = ano, s = sem;
  for(let i = 0; i < qtd; i++){
    lista.push(`${a}-S${s}`);
    if(s === 1){ s = 2; a -= 1; } else { s = 1; }
  }
  return lista;
}

/* Devolve o texto do erro (ou "" se estiver completo). "perguntas" é a
   lista efetiva (padrão ou personalizada pela secretaria). */
export function validarAvaliacaoInstitucional(form, perguntas = PERGUNTAS_INSTITUCIONAIS){
  const faltam = perguntas.filter(p => {
    const v = Number(form && form.respostas && form.respostas[p.id]);
    return !(v >= 1 && v <= 5);
  }).length;
  if(faltam === 0) return "";
  return faltam === 1 ? "Falta responder 1 pergunta." : `Faltam ${faltam} perguntas para responder.`;
}

/* Só as respostas válidas (1 a 5), na ordem das perguntas. */
export function respostasLimpas(form, perguntas = PERGUNTAS_INSTITUCIONAIS){
  const o = {};
  perguntas.forEach(p => {
    const v = Number(form && form.respostas && form.respostas[p.id]);
    if(v >= 1 && v <= 5) o[p.id] = v;
  });
  return o;
}

export function avaliacaoInstitucionalHtml({ periodo, perguntas = PERGUNTAS_INSTITUCIONAIS, form, jaRespondeu, salvando, erro, ok, bloqueada }){
  const perguntasHtml = perguntas.map((p, i) => {
    const atual = Number(form.respostas[p.id]) || 0;
    return `
      <div class="aval-pergunta">
        <p><span class="aval-n">${i + 1}</span>${esc(p.texto)}</p>
        <div class="aval-escala" role="radiogroup" aria-label="${esc(p.texto)}">
          ${[1, 2, 3, 4, 5].map(n => `
            <button type="button" class="aval-nota ${atual === n ? "on" : ""}" role="radio" aria-checked="${atual === n}" title="${esc(ESCALA_INSTITUCIONAL[n - 1])}" data-action="aval-inst-nota" data-q="${p.id}" data-nota="${n}">${n}</button>`).join("")}
        </div>
      </div>`;
  }).join("");

  return `
  <div class="teacher-panel">
    <div class="teacher-panel-head">
      <div><h2>Avaliação institucional</h2><p>${esc(rotuloPeriodo(periodo))}</p></div>
      ${bloqueada ? `<span class="pill pill-red">Bloqueada</span>` : (jaRespondeu ? `<span class="pill pill-green">Respondida</span>` : `<span class="pill pill-gold">Pendente</span>`)}
    </div>
    ${bloqueada ? `
    <p class="aval-intro">A secretaria pausou temporariamente as respostas desta avaliação. Volte mais tarde.</p>
    ${jaRespondeu ? `<p class="aval-intro" style="color:var(--green);font-weight:600;">Sua resposta deste semestre já foi registrada. Obrigado pela sua opinião!</p>` : ""}
    ` : `
    <p class="aval-intro">Sua opinião ajuda o Educa+ a melhorar. As respostas chegam à equipe de forma geral, sem o seu nome.</p>
    ${jaRespondeu ? `<p class="aval-intro" style="color:var(--green);font-weight:600;">Você já respondeu neste semestre. Se quiser, é só alterar e enviar de novo.</p>` : ""}
    <p class="aval-legenda"><strong>1</strong> = ${esc(ESCALA_INSTITUCIONAL[0])} &nbsp;·&nbsp; <strong>5</strong> = ${esc(ESCALA_INSTITUCIONAL[4])}</p>
    ${perguntasHtml}
    <label class="teacher-label" for="aval-inst-comentario" style="margin-top:18px;">Elogios, críticas ou sugestões (opcional)</label>
    <textarea id="aval-inst-comentario" class="rc-feedback-input" rows="4" data-aval-inst="comentario" maxlength="1000" placeholder="Escreva aqui, se quiser">${esc(form.comentario)}</textarea>
    <button type="button" class="teacher-primary-btn" data-action="aval-inst-enviar" ${salvando ? "disabled" : ""}>${salvando ? "Enviando…" : (jaRespondeu ? "Atualizar avaliação" : "Enviar avaliação")}</button>
    ${erro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${esc(erro)}</p>` : ""}
    ${ok ? `<p class="teacher-success">Avaliação enviada. Obrigado pela sua opinião!</p>` : ""}
    `}
  </div>`;
}

/* ---------------- resultado consolidado (secretaria) ---------------- */
function media(valores){
  const nums = valores.map(Number).filter(n => Number.isFinite(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function calcularResultadosInstitucionais(registros, perguntas = PERGUNTAS_INSTITUCIONAIS){
  const lista = Array.isArray(registros) ? registros : [];

  const porPergunta = perguntas.map(p => {
    const notas = lista.map(r => r.respostas && r.respostas[p.id]).filter(v => Number(v) >= 1);
    return { id: p.id, texto: p.texto, media: media(notas), n: notas.length };
  });

  const todasNotas = [];
  lista.forEach(r => perguntas.forEach(p => {
    const v = r.respostas && r.respostas[p.id];
    if(Number(v) >= 1) todasNotas.push(Number(v));
  }));

  const cursos = {};
  lista.forEach(r => {
    const curso = r.curso || "Sem curso";
    (cursos[curso] = cursos[curso] || []).push(r);
  });
  const porCurso = Object.keys(cursos).sort().map(curso => {
    const notas = [];
    cursos[curso].forEach(r => perguntas.forEach(p => {
      const v = r.respostas && r.respostas[p.id];
      if(Number(v) >= 1) notas.push(Number(v));
    }));
    return { curso, n: cursos[curso].length, media: media(notas) };
  });

  const comentarios = lista
    .filter(r => (r.comentario || "").trim())
    .sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""))
    .map(r => ({
      texto: r.comentario.trim(),
      papel: r.autorRole === "responsavel" ? "Responsável" : "Aluno",
      curso: r.curso || "",
      data: (r.atualizadoEm || "").slice(0, 10),
    }));

  return {
    total: lista.length,
    responsaveis: lista.filter(r => r.autorRole === "responsavel").length,
    alunos: lista.filter(r => r.autorRole !== "responsavel").length,
    mediaGeral: media(todasNotas),
    porPergunta, porCurso, comentarios,
  };
}

function fmtMedia(v){ return v === null || v === undefined ? "—" : v.toFixed(1).replace(".", ","); }
function classeMedia(v){
  if(v === null || v === undefined) return "";
  return v >= 4 ? "alta" : (v >= 3 ? "media" : "baixa");
}
function dataBR(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function resultadosInstitucionaisHtml({ periodo, perguntas = PERGUNTAS_INSTITUCIONAIS, resultados, carregando, erro }){
  const seletor = `
    <div class="aval-filtro">
      <label class="teacher-label" for="aval-inst-periodo">Período</label>
      <select id="aval-inst-periodo" class="teacher-text-input" style="max-width:260px;">
        ${periodosRecentes(4).map(p => `<option value="${p}" ${p === periodo ? "selected" : ""}>${esc(rotuloPeriodo(p))}</option>`).join("")}
      </select>
    </div>`;

  if(erro){
    return `${seletor}<p class="teacher-error" style="color:var(--red,#C4544A);font-size:13px;">${esc(erro)}</p>`;
  }
  if(carregando && !resultados){
    return `${seletor}<p class="section-eyebrow">Carregando respostas…</p>`;
  }

  const r = calcularResultadosInstitucionais(resultados ? resultados.registros : [], perguntas);
  if(r.total === 0){
    return `${seletor}<div class="card flush"><div style="padding:20px;font-size:14px;color:var(--slate);">Ninguém respondeu a avaliação neste período ainda.</div></div>`;
  }

  const resumo = `
    <div class="grid-cards" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
      <div class="card"><div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Respostas</div>
        <div style="font-family:var(--font-display);font-size:30px;color:var(--ink);">${r.total}</div>
        <div style="font-size:12px;color:var(--slate);">${r.alunos} aluno(s) · ${r.responsaveis} responsável(is)</div></div>
      <div class="card"><div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Média geral (de 5)</div>
        <div style="font-family:var(--font-display);font-size:30px;color:var(--ink);">${fmtMedia(r.mediaGeral)}</div></div>
    </div>`;

  const barras = `
    <h3 class="aval-h3">Média por pergunta</h3>
    <div class="card flush">
      ${r.porPergunta.map(p => `
        <div class="aval-barra-linha">
          <span class="aval-barra-texto">${esc(p.texto)}</span>
          <div class="aval-barra"><div class="aval-barra-cheia ${classeMedia(p.media)}" style="width:${p.media === null ? 0 : Math.round((p.media / 5) * 100)}%"></div></div>
          <strong class="aval-barra-valor">${fmtMedia(p.media)}</strong>
        </div>`).join("")}
    </div>`;

  const cursos = r.porCurso.length > 1 ? `
    <h3 class="aval-h3">Média por curso</h3>
    <div class="card flush">
      ${r.porCurso.map(c => `
        <div class="row">
          <span style="font-size:14px;color:var(--ink);">${esc(c.curso)} <span style="color:var(--slate);font-size:12px;">· ${c.n} resposta(s)</span></span>
          <span class="pill ${c.media !== null && c.media >= 4 ? "pill-green" : (c.media !== null && c.media < 3 ? "pill-red" : "pill-gold")}">${fmtMedia(c.media)}</span>
        </div>`).join("")}
    </div>` : "";

  const comentarios = `
    <h3 class="aval-h3">Comentários (${r.comentarios.length})</h3>
    ${r.comentarios.length ? `<div class="card flush">
      ${r.comentarios.map(c => `
        <div class="aval-comentario">
          <div class="aval-comentario-meta">${esc(c.papel)}${c.curso ? " · " + esc(c.curso) : ""}${c.data ? " · " + esc(dataBR(c.data)) : ""}</div>
          <p>${esc(c.texto)}</p>
        </div>`).join("")}
    </div>` : `<p class="section-eyebrow">Ninguém deixou comentário.</p>`}`;

  return `${seletor}${resumo}${barras}${cursos}${comentarios}`;
}
