/* ==================================================================
   Educa+ — calendario.js
   ------------------------------------------------------------------
   Calendário mensal usado na tela inicial de aluno, responsável e
   professor. Este arquivo NÃO fala com o Firebase: só recebe dados já
   carregados (presenças e avisos) e devolve HTML. Quem busca/grava no
   Firestore é o script.js.

   Cores dos dias (só aluno/responsável):
     verde    = presença
     amarelo  = falta justificada
     vermelho = falta
   Se no mesmo dia houver mais de uma aula, vale a "pior": falta >
   justificada > presença. O detalhe de cada aula aparece no pop-up.

   Ícone de alerta (só responsável): o dia tem observação do professor
   sobre o aluno (campo "Observação" da chamada).

   Ligação entre o professor e o aluno: o app inteiro já identifica o
   aluno pelo NOME dentro da turma (turmas.alunos é uma lista de nomes),
   então aqui a "chave" do aluno é escolaId + nome normalizado (sem
   acento, minúsculo). Veja chaveAluno().
   ================================================================== */

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const ROTULO_STATUS = { presente: "Presente", falta: "Falta", justificada: "Justificada" };
const PRIORIDADE_STATUS = { falta: 3, justificada: 2, presente: 1 };
const ROTULO_PARA_QUEM = {
  todos: "Alunos e responsáveis",
  responsaveis: "Só responsáveis",
  alunos: "Só alunos",
};
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

/* ---------------- nomes / chaves ---------------- */
export function normalizarTexto(s){
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/* Chave que liga o registro do professor ao aluno. Tem que ser calculada
   do MESMO jeito nos dois lados (professor grava, aluno/responsável lê). */
export function chaveAluno(escolaId, nome){
  return `${escolaId || ""}:${normalizarTexto(nome)}`;
}

/* Pedaço do id do documento de presença (não pode ter "/" nem espaços). */
export function slugNome(nome, alternativa){
  const s = normalizarTexto(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || alternativa || "aluno";
}

/* ---------------- datas (sempre "AAAA-MM-DD", sem fuso) ---------------- */
export function isoDe(ano, mes, dia){
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function hojeISO(){
  const d = new Date();
  return isoDe(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dataValida(iso){
  if(!ISO_REGEX.test(iso || "")) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function dataDoISO(iso){
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function dataExtenso(iso){
  const texto = dataDoISO(iso).toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* Lista de células do mês, começando no domingo: cada uma é "AAAA-MM-DD"
   ou null (espaço vazio antes do dia 1 / depois do último dia). */
export function gradeDoMes(ano, mes){
  const vazios = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  const celulas = [];
  for(let i = 0; i < vazios; i++) celulas.push(null);
  for(let d = 1; d <= total; d++) celulas.push(isoDe(ano, mes, d));
  while(celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

/* ---------------- junta presenças e avisos por dia ---------------- */
/* papel: "aluno" | "responsavel" | "professor".
   - aluno não vê aviso marcado "só responsáveis" e não vê observações;
   - responsável não vê aviso marcado "só alunos" e vê as observações;
   - professor vê todos os avisos que ele mesmo criou. */
export function montarDias({ presencas = [], eventos = [], papel }){
  const dias = {};
  const dia = (iso) => {
    if(!dias[iso]) dias[iso] = { presencas: [], eventos: [], observacoes: [], status: "" };
    return dias[iso];
  };

  presencas.forEach(p => {
    if(!ISO_REGEX.test(p.data || "")) return;
    const d = dia(p.data);
    d.presencas.push(p);
    if((PRIORIDADE_STATUS[p.status] || 0) > (PRIORIDADE_STATUS[d.status] || 0)) d.status = p.status;
    if(papel === "responsavel" && String(p.observacao || "").trim()) d.observacoes.push(p);
  });

  eventos.forEach(e => {
    if(!ISO_REGEX.test(e.data || "")) return;
    if(papel === "aluno" && e.paraQuem === "responsaveis") return;
    if(papel === "responsavel" && e.paraQuem === "alunos") return;
    dia(e.data).eventos.push(e);
  });

  Object.keys(dias).forEach(iso => {
    dias[iso].presencas.sort((a, b) => String(a.disciplina || "").localeCompare(String(b.disciplina || ""), "pt-BR"));
    dias[iso].observacoes.sort((a, b) => String(a.disciplina || "").localeCompare(String(b.disciplina || ""), "pt-BR"));
    dias[iso].eventos.sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")));
  });
  return dias;
}

/* ---------------- ícones locais ---------------- */
const SVG_ALERTA = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.6v.01" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const SVG_FECHAR = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>`;
const SVG_ANTERIOR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
const SVG_PROXIMO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
const SVG_MAIS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const SVG_LIXEIRA = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;

/* ---------------- célula de um dia ---------------- */
function celulaHtml(iso, dia, ehHoje, podeCriar){
  const d = dia || { presencas: [], eventos: [], observacoes: [], status: "" };
  const temItens = d.presencas.length + d.eventos.length > 0;
  const clicavel = temItens || podeCriar;

  const classes = ["cal-dia"];
  if(d.status) classes.push(`cal-${d.status}`);
  if(ehHoje) classes.push("cal-hoje");

  const numero = Number(iso.slice(8));
  const partes = [`${numero} de ${MESES[Number(iso.slice(5, 7)) - 1].toLowerCase()}`];
  if(ehHoje) partes.push("hoje");
  if(d.status) partes.push(ROTULO_STATUS[d.status]);
  if(d.eventos.length) partes.push(`${d.eventos.length} ${d.eventos.length === 1 ? "aviso" : "avisos"}`);
  if(d.observacoes.length) partes.push("com observação do professor");

  const pontos = Math.min(d.eventos.length, 3);
  const marcas = pontos ? `<span class="cal-dia-marcas">${"<i class=\"cal-ponto\"></i>".repeat(pontos)}</span>` : "";
  const alerta = d.observacoes.length ? `<span class="cal-alerta" title="Observação do professor">${SVG_ALERTA}</span>` : "";

  return `<button type="button" class="${classes.join(" ")}" ${clicavel ? `data-action="cal-abrir-dia" data-dia="${iso}"` : "disabled"} aria-label="${esc(partes.join(", "))}">
      <span class="cal-dia-num">${numero}</span>${marcas}${alerta}
    </button>`;
}

/* ---------------- pop-up do dia ---------------- */
function eventoCardHtml(e, papel, { excluirConfirmId, excluindoId }){
  const tipo = e.tipo === "lembrete"
    ? `<span class="pill cal-pill-lembrete">Lembrete</span>`
    : `<span class="pill pill-gold">Aviso</span>`;

  let meta;
  if(papel === "professor"){
    const destino = e.alvo === "aluno"
      ? `Aluno: ${esc(e.alunoNome)} (${esc(e.turmaNome)})`
      : `Turma: ${esc(e.turmaNome)}`;
    meta = `${destino} · ${esc(ROTULO_PARA_QUEM[e.paraQuem] || ROTULO_PARA_QUEM.todos)}`;
  } else {
    meta = `Por ${esc(e.professorNome || "Professor(a)")}${e.disciplina ? ` · ${esc(e.disciplina)}` : ""}`;
  }

  let acoes = "";
  if(papel === "professor"){
    if(excluirConfirmId === e.id){
      acoes = `<div class="cal-evento-acoes">
        <button type="button" class="btn-danger" data-action="cal-excluir-evento" data-id="${esc(e.id)}" ${excluindoId === e.id ? "disabled" : ""}>${excluindoId === e.id ? "Excluindo…" : "Confirmar exclusão"}</button>
        <button type="button" class="attendance-btn" data-action="cal-cancelar-exclusao">Cancelar</button>
      </div>`;
    } else {
      acoes = `<div class="cal-evento-acoes"><button type="button" class="attendance-btn" data-action="cal-excluir-evento" data-id="${esc(e.id)}" aria-label="Excluir">${SVG_LIXEIRA} Excluir</button></div>`;
    }
  }

  return `<div class="cal-evento">
      <div class="cal-evento-topo">${tipo}<strong>${esc(e.titulo)}</strong></div>
      ${e.descricao ? `<p class="cal-evento-desc">${esc(e.descricao)}</p>` : ""}
      <div class="cal-evento-meta">${meta}</div>
      ${acoes}
    </div>`;
}

function diaModalHtml(iso, dia, papel, opcoes){
  const d = dia || { presencas: [], eventos: [], observacoes: [], status: "" };

  const presencasHtml = d.presencas.length ? `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Presença</h3>
      <div class="aluno-modal-resp-list">${d.presencas.map(p => `
        <div class="cal-linha-presenca">
          <span>${esc(p.disciplina || "Aula")}${p.turmaNome ? ` <small>· ${esc(p.turmaNome)}</small>` : ""}</span>
          <span class="pill cal-pill-${esc(p.status)}">${esc(ROTULO_STATUS[p.status] || p.status)}</span>
        </div>`).join("")}
      </div>
    </div>` : "";

  const observacoesHtml = d.observacoes.length ? `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Observação do professor</h3>
      <div class="aluno-modal-resp-list">${d.observacoes.map(p => `
        <div class="cal-observacao">
          <span class="cal-observacao-icone">${SVG_ALERTA}</span>
          <div>
            <p>${esc(p.observacao)}</p>
            <small>${esc(p.professorNome || "Professor(a)")}${p.disciplina ? ` · ${esc(p.disciplina)}` : ""}</small>
          </div>
        </div>`).join("")}
      </div>
    </div>` : "";

  const eventosHtml = d.eventos.length ? `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Avisos e lembretes</h3>
      <div class="aluno-modal-resp-list">${d.eventos.map(e => eventoCardHtml(e, papel, opcoes)).join("")}</div>
    </div>` : "";

  const vazio = (!presencasHtml && !observacoesHtml && !eventosHtml)
    ? `<div class="aluno-modal-section"><p class="section-eyebrow" style="margin:0;">Nada registrado neste dia.</p></div>` : "";

  const novo = papel === "professor" ? `
    <div class="aluno-modal-section">
      <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="cal-novo-evento" data-dia="${iso}">${SVG_MAIS} Novo aviso ou lembrete neste dia</button>
    </div>` : "";

  return `
  <div class="aluno-modal-backdrop" data-action="cal-fechar-dia">
    <div class="aluno-modal cal-modal" role="dialog" aria-modal="true" aria-label="Dia ${esc(dataExtenso(iso))}" data-action="noop">
      <div class="aluno-modal-head">
        <div><h2>${esc(dataExtenso(iso))}</h2></div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="cal-fechar-dia" aria-label="Fechar">${SVG_FECHAR}</button>
      </div>
      ${presencasHtml}${observacoesHtml}${eventosHtml}${vazio}${novo}
    </div>
  </div>`;
}

/* ---------------- calendário completo ---------------- */
/* opcoes: { papel, ano, mes, dias, hoje, carregando, erro, diaAberto,
             podeCriar, excluirConfirmId, excluindoId } */
export function calendarioHtml(opcoes){
  const { papel, ano, mes, dias, hoje, carregando, erro, diaAberto, podeCriar } = opcoes;

  const cabecalhoSemana = DIAS_SEMANA.map(s => `<div class="cal-semana">${s}</div>`).join("");
  const celulas = gradeDoMes(ano, mes)
    .map(iso => iso ? celulaHtml(iso, dias[iso], iso === hoje, podeCriar) : `<div class="cal-vazio"></div>`)
    .join("");

  const legenda = papel === "professor"
    ? `<span><i class="cal-ponto"></i>Aviso ou lembrete que você criou</span>`
    : `<span><i class="cal-leg cal-leg-presente"></i>Presença</span>
       <span><i class="cal-leg cal-leg-justificada"></i>Justificada</span>
       <span><i class="cal-leg cal-leg-falta"></i>Falta</span>
       <span><i class="cal-ponto"></i>Aviso ou lembrete</span>
       ${papel === "responsavel" ? `<span class="cal-leg-alerta">${SVG_ALERTA}Observação do professor</span>` : ""}`;

  const erroHtml = erro ? `
    <div class="cal-erro">
      <span>${esc(erro)}</span>
      <button type="button" class="attendance-btn" data-action="cal-atualizar">Tentar de novo</button>
    </div>` : "";

  const novoBtn = podeCriar
    ? `<button type="button" class="teacher-primary-btn cal-novo" data-action="cal-novo-evento">${SVG_MAIS} Novo aviso ou lembrete</button>` : "";

  const modal = diaAberto ? diaModalHtml(diaAberto, dias[diaAberto], papel, opcoes) : "";

  return `
    <div class="cal-topo">
      <div>
        <h2 class="section-title">Calendário</h2>
        <p class="section-eyebrow" style="margin-bottom:0;">${papel === "professor"
          ? "Avisos e lembretes que você criou. Toque num dia para ver ou adicionar."
          : "Toque num dia com cor ou marcação para ver os detalhes."}</p>
      </div>
      ${novoBtn}
    </div>
    <div class="card cal-card">
      <div class="cal-nav">
        <button type="button" class="cal-nav-btn" data-action="cal-mes-anterior" aria-label="Mês anterior">${SVG_ANTERIOR}</button>
        <div class="cal-nav-titulo">${MESES[mes]} <span>${ano}</span></div>
        <button type="button" class="cal-nav-btn" data-action="cal-mes-proximo" aria-label="Próximo mês">${SVG_PROXIMO}</button>
      </div>
      <div class="cal-nav-extra">
        <button type="button" class="cal-link" data-action="cal-hoje">Hoje</button>
        <button type="button" class="cal-link" data-action="cal-atualizar" ${carregando ? "disabled" : ""}>${carregando ? "Carregando…" : "Atualizar"}</button>
      </div>
      ${erroHtml}
      <div class="cal-grade" role="grid">${cabecalhoSemana}${celulas}</div>
      <div class="cal-legenda">${legenda}</div>
    </div>
    ${modal}`;
}

/* ---------------- formulário de novo aviso/lembrete (professor) ---------------- */
/* form: { aberto, tipo, titulo, descricao, data, alvo, turmaId, alunoNome,
           paraQuem, salvando, erro }
   turmas: [{ id, nome, disciplina, escola, alunos:[nomes] }] */
export function eventoFormModalHtml({ form, turmas }){
  if(!form) return "";
  const turma = turmas.find(t => t.id === form.turmaId) || null;

  if(turmas.length === 0){
    return `
    <div class="aluno-modal-backdrop" data-action="cal-fechar-form">
      <div class="aluno-modal cal-modal" role="dialog" aria-modal="true" aria-label="Novo aviso" data-action="noop">
        <div class="aluno-modal-head">
          <div><h2>Novo aviso ou lembrete</h2></div>
          <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="cal-fechar-form" aria-label="Fechar">${SVG_FECHAR}</button>
        </div>
        <div class="teacher-empty-state" style="margin-top:16px;"><strong>Nenhuma turma vinculada a você ainda.</strong><span>Fale com a secretaria para vincular suas turmas e poder enviar avisos.</span></div>
      </div>
    </div>`;
  }

  const opcoesTurma = turmas.map(t => `<option value="${esc(t.id)}" ${t.id === form.turmaId ? "selected" : ""}>${esc(t.nome)}${t.disciplina ? ` · ${esc(t.disciplina)}` : ""}${t.escola ? ` (${esc(t.escola)})` : ""}</option>`).join("");

  const alunos = turma ? [...(turma.alunos || [])].sort((a, b) => a.localeCompare(b, "pt-BR")) : [];
  const alunoHtml = form.alvo === "aluno" ? `
      <label class="teacher-label" for="ev-aluno">Aluno</label>
      ${alunos.length === 0
        ? `<p class="section-eyebrow" style="margin:4px 0 0;">Esta turma ainda não tem alunos.</p>`
        : `<select id="ev-aluno" class="teacher-text-input" data-ev-campo="alunoNome">
            <option value="" ${!form.alunoNome ? "selected" : ""} disabled>Selecione o aluno</option>
            ${alunos.map(a => `<option value="${esc(a)}" ${a === form.alunoNome ? "selected" : ""}>${esc(a)}</option>`).join("")}
          </select>`}` : "";

  return `
  <div class="aluno-modal-backdrop" data-action="cal-fechar-form">
    <div class="aluno-modal cal-modal" role="dialog" aria-modal="true" aria-label="Novo aviso ou lembrete" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>Novo aviso ou lembrete</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">Aparece no calendário na data escolhida e fica salvo.</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="cal-fechar-form" aria-label="Fechar">${SVG_FECHAR}</button>
      </div>

      <div class="cal-form">
        <label class="teacher-label" for="ev-tipo">Tipo</label>
        <select id="ev-tipo" class="teacher-text-input" data-ev-campo="tipo">
          <option value="aviso" ${form.tipo === "aviso" ? "selected" : ""}>Aviso</option>
          <option value="lembrete" ${form.tipo === "lembrete" ? "selected" : ""}>Lembrete</option>
        </select>

        <label class="teacher-label" for="ev-titulo">Título</label>
        <input id="ev-titulo" class="teacher-text-input" data-ev-campo="titulo" maxlength="120" placeholder="Ex.: Prova de inglês" value="${esc(form.titulo)}" />

        <label class="teacher-label" for="ev-desc">Detalhes (opcional)</label>
        <textarea id="ev-desc" class="teacher-text-input" data-ev-campo="descricao" rows="3" maxlength="600" placeholder="Ex.: Trazer caderno e caneta. Conteúdo: unidades 3 e 4.">${esc(form.descricao)}</textarea>

        <label class="teacher-label" for="ev-data">Data</label>
        <input id="ev-data" type="date" class="teacher-text-input" data-ev-campo="data" value="${esc(form.data)}" />

        <label class="teacher-label" for="ev-turma">Turma</label>
        <select id="ev-turma" class="teacher-text-input" data-ev-campo="turmaId">${opcoesTurma}</select>

        <label class="teacher-label" for="ev-alvo">Enviar para</label>
        <select id="ev-alvo" class="teacher-text-input" data-ev-campo="alvo">
          <option value="turma" ${form.alvo === "turma" ? "selected" : ""}>Turma inteira${turma ? ` (${(turma.alunos || []).length})` : ""}</option>
          <option value="aluno" ${form.alvo === "aluno" ? "selected" : ""}>Um aluno específico</option>
        </select>
        ${alunoHtml}

        <label class="teacher-label" for="ev-para">Quem vai ver</label>
        <select id="ev-para" class="teacher-text-input" data-ev-campo="paraQuem">
          ${Object.keys(ROTULO_PARA_QUEM).map(k => `<option value="${k}" ${form.paraQuem === k ? "selected" : ""}>${ROTULO_PARA_QUEM[k]}</option>`).join("")}
        </select>
      </div>

      ${form.erro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:10px;">${esc(form.erro)}</p>` : ""}
      <div class="cal-form-botoes">
        <button type="button" class="teacher-primary-btn" data-action="cal-salvar-evento" ${form.salvando ? "disabled" : ""}>${form.salvando ? "Salvando…" : "Salvar no calendário"}</button>
        <button type="button" class="attendance-btn" data-action="cal-fechar-form">Cancelar</button>
      </div>
    </div>
  </div>`;
}
