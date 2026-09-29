/* ==================================================================
   Educa+ — horarios.js
   ------------------------------------------------------------------
   Aba "Horários" de professores e da secretaria.

   O que ela faz:
     • Agenda em três visões: Dia, Semana e Mês.
     • Alterar aula: só naquele dia (remarcar / cancelar) ou o horário
       fixo da turma. Pode avisar alunos e responsáveis no mesmo clique.
     • Ver a turma (alunos, sala, horário) e ir direto pra chamada.
     • Enviar lembretes/avisos pra turma (vão pro calendário do aluno).
     • Anotações pessoais, soltas ou ligadas a uma turma.
     • Criar e editar turmas com horário estruturado.

   Como se encaixa no app:
     • Este arquivo só monta HTML e fala com o Firestore. O estado e o
       render() continuam no script.js — tudo chega pelo `ctx` de
       criarHorarios(ctx).
     • Todas as ações da aba começam com "hor-" (data-action="hor-...").
     • Campos de formulário têm data-hor="f" e data-c="nome-do-campo";
       digitar NÃO re-renderiza (o cursor não pula), igual ao resto do app.

   Modelo de dados novo (ver HORARIOS.md pras regras do Firestore):

   turmas/{id}  ganha:  encontros: [{ dia: 0–6 (0 = domingo), inicio: "HH:MM", fim: "HH:MM" }]
     O campo antigo `horario` (texto) continua sendo gravado, gerado a
     partir dos encontros, pra o resto do app seguir funcionando. Turmas
     antigas, sem `encontros`, têm o texto de `horario` lido e
     interpretado na hora (ver encontrosDaTurma).

   horariosExcecoes/{turmaId_AAAA-MM-DD_indice}   (mudança de UMA aula)
     turmaId, turmaNome, escolaId, professorId
     dataOriginal, encIdx            // qual aula do horário fixo foi mexida
     tipo: "remarcada" | "cancelada"
     novaData, inicio, fim, sala     // só quando "remarcada"
     motivo, alteradoPorId, alteradoPorNome, atualizadoEm

   anotacoesHorario/{id}   (anotação pessoal — só o autor enxerga)
     autorId, autorNome, autorRole, escolaId
     titulo, texto, data, turmaId, turmaNome
     criadoEm, atualizadoEm

   Lembretes e avisos NÃO têm coleção nova: vão para eventosCalendario,
   no mesmo formato que o calendário já usa (professor: aviso/lembrete de
   turma; secretaria: item com escopo "escola" só pros alunos da turma).
   ================================================================== */

import { chaveAluno, hojeISO, dataValida, isoDe, gradeDoMes, MESES, normalizarTexto } from "./calendario.js";

const DIAS_LONGOS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CORES = ["#16304F", "#9C7A2E", "#3E7A57", "#B14A3D", "#5B6B7E", "#6B4C8A"];
const ATUALIZA_APOS_MS = 60 * 1000;

/* ---------------- datas e horas ---------------- */
const pad = (n) => String(n).padStart(2, "0");
function dataDoISO(iso){ const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }
function isoDoDate(dt){ return isoDe(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
function somarDias(iso, n){ const dt = dataDoISO(iso); dt.setDate(dt.getDate() + n); return isoDoDate(dt); }
function somarMeses(iso, n){ const dt = dataDoISO(iso); dt.setDate(1); dt.setMonth(dt.getMonth() + n); return isoDoDate(dt); }
function segundaDaSemana(iso){ const dt = dataDoISO(iso); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return isoDoDate(dt); }
function dataCurta(iso){ const [, m, d] = iso.split("-"); return `${d}/${m}`; }
function dataLonga(iso){ const dt = dataDoISO(iso); return `${DIAS_LONGOS[dt.getDay()]}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`; }
function diaDaSemanaCurto(iso){ return DIAS_CURTOS[dataDoISO(iso).getDay()]; }
function agoraEmMinutos(){ const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

/* "14", "14h", "14h30", "14:30" -> "14:00" / "14:30". Inválido -> "". */
function normHora(txt){
  const m = String(txt || "").trim().toLowerCase().match(/^(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})?)?$/);
  if(!m) return "";
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if(h > 23 || min > 59) return "";
  return `${pad(h)}:${pad(min)}`;
}
function minutos(hhmm){
  if(!/^\d{2}:\d{2}$/.test(hhmm || "")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/* ---------------- horário das turmas ---------------- */
const DIA_TOKENS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

/* Lê o texto antigo do campo `horario` ("segunda-feira, 14:00 - 15:00",
   "Seg e Qua, 14h"…) e devolve encontros estruturados. Se não der pra
   entender, devolve [] — a turma aparece em "sem horário definido". */
export function parseHorarioLegado(texto){
  const t = normalizarTexto(texto);
  if(!t) return [];
  const dias = [];
  const reDia = /\b(dom|seg|ter|qua|qui|sex|sab)[a-z]*/g;
  let m;
  while((m = reDia.exec(t))){
    const d = DIA_TOKENS[m[1]];
    if(!dias.includes(d)) dias.push(d);
  }
  let inicio = "", fim = "";
  const faixa = t.match(/(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*(?:-|as|a|ate)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?/);
  if(faixa){
    inicio = normHora(`${faixa[1]}:${faixa[2] || "00"}`);
    fim = normHora(`${faixa[3]}:${faixa[4] || "00"}`);
  } else {
    const so = t.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
    if(so) inicio = normHora(`${so[1]}:${so[2] || "00"}`);
  }
  if(!dias.length || !inicio) return [];
  return dias.map(dia => ({ dia, inicio, fim }));
}

export function encontrosDaTurma(turma){
  if(Array.isArray(turma.encontros) && turma.encontros.length){
    return turma.encontros
      .map(e => ({ dia: Number(e.dia), inicio: e.inicio || "", fim: e.fim || "" }))
      .filter(e => e.dia >= 0 && e.dia <= 6 && e.inicio);
  }
  return parseHorarioLegado(turma.horario);
}

/* [{dia:1,inicio:"14:00",fim:"15:00"},{dia:3,...}] -> "Seg e Qua, 14:00 - 15:00" */
export function textoHorario(encontros){
  const grupos = new Map();
  [...encontros]
    .sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio))
    .forEach(e => {
      const k = `${e.inicio}|${e.fim || ""}`;
      if(!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(e.dia);
    });
  return [...grupos].map(([k, dias]) => {
    const [ini, fim] = k.split("|");
    const nomes = dias.map(d => DIAS_CURTOS[d]);
    const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0];
    return `${lista}, ${ini}${fim ? ` - ${fim}` : ""}`;
  }).join(" · ");
}

function corDaDisciplina(disciplina){
  const s = normalizarTexto(disciplina || "");
  let h = 0;
  for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CORES[h % CORES.length];
}

/* Valida uma lista de encontros digitada num formulário. Devolve
   { erro } ou { encontros } já normalizados. */
function validarEncontros(lista){
  if(!lista.length) return { erro: "Adicione pelo menos um dia e horário." };
  const saida = [];
  for(const e of lista){
    const inicio = normHora(e.inicio);
    const fim = e.fim ? normHora(e.fim) : "";
    if(!inicio) return { erro: "Preencha o horário de início de todas as aulas." };
    if(e.fim && !fim) return { erro: "Um dos horários de término não é válido." };
    if(fim && minutos(fim) <= minutos(inicio)) return { erro: "O término precisa ser depois do início." };
    saida.push({ dia: Number(e.dia), inicio, fim });
  }
  const vistos = new Set();
  for(const e of saida){
    const k = `${e.dia}|${e.inicio}`;
    if(vistos.has(k)) return { erro: "Há dois horários iguais na lista." };
    vistos.add(k);
  }
  return { encontros: saida };
}

/* ================================================================== */
export function criarHorarios(ctx){
  const { state, db, fs, render, ICONS } = ctx;
  const esc = ctx.escapeHtml;
  const { doc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, getDoc } = fs;

  const H = novoEstado();

  function novoEstado(){
    return {
      chave: "", visao: "semana", ref: hojeISO(),
      filtroProf: "", filtroTurma: "",
      excecoes: [], anotacoes: [],
      carregando: false, carregado: false, carregadoEm: 0, erro: "",
      modal: null,            // { tipo, ... } — só um modal por vez
      aviso: "",
      excluirAnotacaoId: null,
      alunos: null, alunosEscolaId: null, alunosCarregando: false, alunosErro: "",
      nomesEscolas: {},
    };
  }
  function resetar(){ Object.assign(H, novoEstado()); }

  /* ---------------- quem está usando ---------------- */
  function eu(){
    if(state.screen === "professor"){
      const p = state.perfil || {};
      const escolasIds = Array.isArray(p.escolasIds) && p.escolasIds.length ? p.escolasIds : (p.escolaId ? [p.escolaId] : []);
      return {
        papel: "professor", uid: state.authUser.uid, nome: state.data.professorNome || "Professor(a)",
        escolasIds, escolaId: escolasIds[0] || "", disciplinas: state.data.professorDisciplinas || [],
      };
    }
    return {
      papel: "instituicao", uid: state.authUser.uid, nome: (state.perfil?.nome || "").trim() || "Secretaria",
      escolasIds: [state.escolaSelecionadaId], escolaId: state.escolaSelecionadaId, disciplinas: [],
    };
  }
  function ativo(){
    return (state.screen === "professor" && state.professorTab === "horarios")
      || (state.screen === "instituicao" && state.instTab === "horarios");
  }
  function todasAsTurmas(){
    return eu().papel === "professor" ? (state.data.professorTurmas || []) : (state.instTurmas || []);
  }
  function turmasVisiveis(){
    let l = todasAsTurmas();
    if(H.filtroProf) l = l.filter(t => t.professorId === H.filtroProf);
    if(H.filtroTurma) l = l.filter(t => t.id === H.filtroTurma);
    return l;
  }
  function turmaPorId(id){ return todasAsTurmas().find(t => t.id === id) || null; }
  function professoresDaUnidade(){ return state.gestaoProfessores || []; }
  function nomeProfessor(id){
    const p = professoresDaUnidade().find(x => x.id === id);
    return p ? p.nome : "";
  }
  function nomeDaEscola(escolaId){
    return state.data.escolas?.[escolaId]?.nome
      || H.nomesEscolas[escolaId]
      || (todasAsTurmas().find(t => t.escolaId === escolaId)?.escola)
      || "";
  }
  function anotacoesVisiveis(){
    const e = eu();
    return H.anotacoes.filter(n => e.papel === "professor" || !n.escolaId || n.escolaId === e.escolaId);
  }

  /* ---------------- carregamento ---------------- */
  function aoAbrir(){
    const e = eu();
    const chave = `${e.papel}:${e.uid}:${e.escolaId}`;
    if(H.chave !== chave){ resetar(); H.chave = chave; }
    H.modal = null;
    H.aviso = "";
    if(H.filtroTurma && !turmaPorId(H.filtroTurma)) H.filtroTurma = "";
    if(e.papel === "instituicao"){
      ctx.garantirTurmas();
      ctx.garantirEquipe();
    }
    ctx.carregarEventosCalendario();
    carregar();
  }

  async function carregar(forcar = false){
    if(H.carregando) return;
    if(!forcar && H.carregadoEm && Date.now() - H.carregadoEm < ATUALIZA_APOS_MS) return;
    const e = eu();
    H.carregando = true;
    H.erro = "";
    render();
    try {
      const qEx = e.papel === "professor"
        ? query(collection(db, "horariosExcecoes"), where("professorId", "==", e.uid))
        : query(collection(db, "horariosExcecoes"), where("escolaId", "==", e.escolaId));
      const qAn = query(collection(db, "anotacoesHorario"), where("autorId", "==", e.uid));
      const [ex, an] = await Promise.allSettled([getDocs(qEx), getDocs(qAn)]);
      if(ex.status === "fulfilled") H.excecoes = ex.value.docs.map(d => ({ id: d.id, ...d.data() }));
      if(an.status === "fulfilled") H.anotacoes = an.value.docs.map(d => ({ id: d.id, ...d.data() }));
      if(ex.status === "rejected" && an.status === "rejected") throw ex.reason;
      if(ex.status === "rejected") H.erro = erroAmigavel(ex.reason, "as mudanças de horário");
      else if(an.status === "rejected") H.erro = erroAmigavel(an.reason, "suas anotações");
      H.carregadoEm = Date.now();
      H.carregado = true;
    } catch(err){
      H.erro = erroAmigavel(err, "os horários");
    } finally {
      H.carregando = false;
      render();
    }
  }

  function erroAmigavel(err, oQue){
    console.error("Horários:", err?.code, err);
    const cod = err?.code ? ` (${err.code})` : "";
    if(err?.code === "permission-denied") return `O servidor não liberou a leitura d${oQue.startsWith("as") || oQue.startsWith("os") ? "" : "e "}${oQue}${cod}. As regras do Firestore para esta aba ainda precisam ser publicadas — veja HORARIOS.md.`;
    return `Não foi possível carregar ${oQue} agora${cod}. Tente de novo.`;
  }

  async function carregarAlunos(escolaId){
    if(!escolaId || H.alunosCarregando) return;
    if(H.alunos && H.alunosEscolaId === escolaId) return;
    H.alunosCarregando = true;
    H.alunosErro = "";
    render();
    try {
      const snaps = await getDocs(query(collection(db, "alunos"), where("escolaId", "==", escolaId)));
      H.alunos = snaps.docs
        .map(d => ({ id: d.id, nome: d.data().nome || "", turma: d.data().turma || "" }))
        .filter(a => a.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      H.alunosEscolaId = escolaId;
    } catch(err){
      console.error("Horários > alunos:", err?.code, err);
      H.alunos = [];
      H.alunosEscolaId = escolaId;
      H.alunosErro = "Não consegui listar os alunos da unidade agora. Você pode salvar a turma assim mesmo e pedir pra secretaria vincular os alunos.";
    } finally {
      H.alunosCarregando = false;
      render();
    }
  }

  async function descobrirNomeDaEscola(escolaId){
    if(!escolaId || nomeDaEscola(escolaId)) return;
    try {
      const s = await getDoc(doc(db, "escolas", escolaId));
      if(s.exists()) H.nomesEscolas[escolaId] = s.data().nome || "";
    } catch(_) { /* sem permissão: cai no id */ }
  }

  /* ---------------- montagem do dia ---------------- */
  function eventosSemAula(iso){
    return (ctx.eventosCalendario() || []).filter(ev => ev.escopo === "escola" && ev.tipo === "sem_aula" && ev.data === iso);
  }
  function eventosDoDia(iso){
    return (ctx.eventosCalendario() || []).filter(ev => ev.data === iso && ev.tipo !== "sem_aula");
  }

  /* Cada aula do dia: { turma, encIdx, origemIso, iso, inicio, fim, sala, status, ex, semAula }
     status: normal | alterada | reposicao | cancelada | saiu | semaula */
  function ocorrencias(iso){
    const dow = dataDoISO(iso).getDay();
    const semAula = eventosSemAula(iso);
    const out = [];
    turmasVisiveis().forEach(t => {
      const bloqueio = semAula.find(ev => !Array.isArray(ev.cursos) || ev.cursos.includes(t.disciplina));
      encontrosDaTurma(t).forEach((enc, idx) => {
        if(enc.dia !== dow) return;
        const ex = H.excecoes.find(x => x.turmaId === t.id && x.dataOriginal === iso && (x.encIdx || 0) === idx);
        const base = { turma: t, encIdx: idx, origemIso: iso, iso, inicio: enc.inicio, fim: enc.fim, sala: t.sala || "", ex: ex || null, semAula: bloqueio || null };
        if(ex && ex.tipo === "cancelada") out.push({ ...base, status: "cancelada" });
        else if(ex && ex.tipo === "remarcada" && ex.novaData !== iso) out.push({ ...base, status: "saiu" });
        else if(ex && ex.tipo === "remarcada") out.push({ ...base, inicio: ex.inicio || enc.inicio, fim: ex.fim || enc.fim, sala: ex.sala || base.sala, status: "alterada", inicioOriginal: enc.inicio });
        else out.push({ ...base, status: bloqueio ? "semaula" : "normal" });
      });
      H.excecoes
        .filter(x => x.turmaId === t.id && x.tipo === "remarcada" && x.novaData === iso && x.dataOriginal !== iso)
        .forEach(ex => out.push({
          turma: t, encIdx: ex.encIdx || 0, origemIso: ex.dataOriginal, iso, inicio: ex.inicio, fim: ex.fim || "",
          sala: ex.sala || t.sala || "", ex, semAula: bloqueio || null, status: "reposicao",
        }));
    });
    return out.sort((a, b) => (minutos(a.inicio) ?? 0) - (minutos(b.inicio) ?? 0) || a.turma.nome.localeCompare(b.turma.nome, "pt-BR"));
  }
  const conta = (lista) => lista.filter(o => o.status === "normal" || o.status === "alterada" || o.status === "reposicao").length;

  /* Outra aula do MESMO professor que bate com o horário escolhido. */
  function conflitosCom(turma, iso, inicio, fim, ignorarChave){
    const ini = minutos(inicio);
    const fi = minutos(fim) ?? (ini + 60);
    const eventosDoProfessor = todasAsTurmas().filter(t => t.professorId === turma.professorId);
    const salvoFiltro = { p: H.filtroProf, t: H.filtroTurma };
    H.filtroProf = ""; H.filtroTurma = "";
    let lista = [];
    try { lista = ocorrencias(iso); } finally { H.filtroProf = salvoFiltro.p; H.filtroTurma = salvoFiltro.t; }
    return lista.filter(o => {
      if(!eventosDoProfessor.some(t => t.id === o.turma.id)) return false;
      if(o.status === "cancelada" || o.status === "saiu") return false;
      if(`${o.turma.id}|${o.origemIso}|${o.encIdx}` === ignorarChave) return false;
      const oi = minutos(o.inicio);
      const of = minutos(o.fim) ?? (oi + 60);
      return oi < fi && ini < of;
    });
  }

  /* ================================================================ */
  /* Visões                                                            */
  /* ================================================================ */
  const RSTATUS = {
    cancelada: { txt: "Cancelada", cls: "cancelada" },
    saiu: { txt: "Remarcada", cls: "saiu" },
    alterada: { txt: "Horário alterado", cls: "alterada" },
    reposicao: { txt: "Reposição", cls: "reposicao" },
    semaula: { txt: "Sem aula", cls: "semaula" },
  };

  function badgesDaAula(o, ehHoje, proxima){
    const b = [];
    if(RSTATUS[o.status]) b.push(`<span class="hor-badge ${RSTATUS[o.status].cls}">${RSTATUS[o.status].txt}</span>`);
    if(ehHoje && (o.status === "normal" || o.status === "alterada" || o.status === "reposicao")){
      const agora = agoraEmMinutos();
      const ini = minutos(o.inicio), fi = minutos(o.fim);
      if(ini !== null && agora >= ini && agora < (fi ?? ini + 60)) b.push(`<span class="hor-badge agora">Em andamento</span>`);
      else if(proxima) b.push(`<span class="hor-badge proxima">Próxima</span>`);
    }
    return b.join("");
  }

  function detalheDoStatus(o){
    if(o.status === "cancelada") return `Aula cancelada${o.ex?.motivo ? `: ${esc(o.ex.motivo)}` : "."}`;
    if(o.status === "saiu") return `Remarcada para ${dataCurta(o.ex.novaData)} às ${esc(o.ex.inicio || "")}${o.ex.motivo ? ` — ${esc(o.ex.motivo)}` : ""}`;
    if(o.status === "alterada") return `Era às ${esc(o.inicioOriginal || "")}${o.ex?.motivo ? ` — ${esc(o.ex.motivo)}` : ""}`;
    if(o.status === "reposicao") return `Aula de ${dataCurta(o.origemIso)} remarcada pra cá${o.ex?.motivo ? ` — ${esc(o.ex.motivo)}` : ""}`;
    if(o.status === "semaula") return `${esc(o.semAula?.titulo || "Sem aula")}`;
    return "";
  }

  const dataAttrs = (o) => `data-t="${esc(o.turma.id)}" data-o="${esc(o.origemIso)}" data-i="${o.encIdx}" data-v="${esc(o.iso)}"`;

  function aulaCardHtml(o, ehHoje, proxima){
    const e = eu();
    const apagada = o.status === "cancelada" || o.status === "saiu" || o.status === "semaula";
    const t = o.turma;
    const detalhe = detalheDoStatus(o);
    const alunos = (t.alunos || []).length;
    const varias = new Set(todasAsTurmas().map(x => x.escolaId)).size > 1;
    const meta = [
      t.disciplina ? `<span class="turma-card-tag">${esc(t.disciplina)}</span>` : "",
      o.sala ? `<span class="turma-card-tag">Sala ${esc(o.sala)}</span>` : "",
      t.escola && varias ? `<span class="turma-card-tag">${ICONS.pinSmall} ${esc(t.escola)}</span>` : "",
      `<span class="turma-card-tag">${ICONS.users} ${alunos} aluno${alunos === 1 ? "" : "s"}</span>`,
      e.papel === "instituicao" && nomeProfessor(t.professorId) ? `<span class="turma-card-tag">${esc(nomeProfessor(t.professorId))}</span>` : "",
    ].join("");
    return `
      <article class="hor-aula ${apagada ? "apagada" : ""}" style="--hor-cor:${corDaDisciplina(t.disciplina)}">
        <div class="hor-aula-hora"><strong>${esc(o.inicio)}</strong>${o.fim ? `<span>${esc(o.fim)}</span>` : ""}</div>
        <div class="hor-aula-corpo">
          <div class="hor-aula-linha">
            <button type="button" class="hor-aula-titulo" data-action="hor-abrir-aula" ${dataAttrs(o)}>${esc(t.nome)}</button>
            ${badgesDaAula(o, ehHoje, proxima)}
          </div>
          <div class="hor-aula-meta">${meta}</div>
          ${detalhe ? `<p class="hor-aula-detalhe">${detalhe}</p>` : ""}
          <div class="hor-aula-acoes">
            <button type="button" class="attendance-btn" data-action="hor-alterar" ${dataAttrs(o)}>${ICONS.pencil} Alterar</button>
            <button type="button" class="attendance-btn" data-action="hor-lembrete-aula" ${dataAttrs(o)}>Lembrete</button>
            <button type="button" class="attendance-btn" data-action="hor-nota-aula" ${dataAttrs(o)}>Anotar</button>
          </div>
        </div>
      </article>`;
  }

  function notasDoDia(iso){ return anotacoesVisiveis().filter(n => n.data === iso).sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""))); }

  function notaCardHtml(n){
    const confirmando = H.excluirAnotacaoId === n.id;
    return `
      <div class="hor-nota">
        ${n.turmaNome ? `<span class="hor-nota-turma">${esc(n.turmaNome)}</span>` : ""}
        ${n.titulo ? `<strong>${esc(n.titulo)}</strong>` : ""}
        <p>${esc(n.texto).replace(/\n/g, "<br>")}</p>
        <div class="hor-nota-acoes">
          <button type="button" class="attendance-btn" data-action="hor-editar-anotacao" data-id="${esc(n.id)}" aria-label="Editar anotação">${ICONS.pencil}</button>
          <button type="button" class="attendance-btn ${confirmando ? "hor-perigo" : ""}" data-action="hor-excluir-anotacao" data-id="${esc(n.id)}" aria-label="Excluir anotação">${confirmando ? "Confirmar exclusão" : ICONS.trash}</button>
        </div>
      </div>`;
  }

  function diaView(){
    const iso = H.ref;
    const lista = ocorrencias(iso);
    const ehHoje = iso === hojeISO();
    const agora = agoraEmMinutos();
    const proximaIdx = ehHoje ? lista.findIndex(o => (o.status === "normal" || o.status === "alterada" || o.status === "reposicao") && (minutos(o.inicio) ?? 0) > agora) : -1;
    const ativas = lista.filter(o => ["normal", "alterada", "reposicao"].includes(o.status));
    const faixa = ativas.length ? `${ativas[0].inicio} às ${ativas.reduce((m, o) => (minutos(o.fim || o.inicio) > minutos(m) ? (o.fim || o.inicio) : m), ativas[0].fim || ativas[0].inicio)}` : "";
    const banners = eventosSemAula(iso).map(ev => `<div class="hor-faixa semaula">${ICONS.warn}<span><strong>${esc(ev.titulo)}</strong>${ev.descricao ? ` — ${esc(ev.descricao)}` : ""}</span></div>`).join("");
    const outros = eventosDoDia(iso).map(ev => `<li><span class="hor-lado-tipo">${esc(ev.tipo === "lembrete" ? "Lembrete" : ev.tipo === "prova" ? "Prova" : "Aviso")}</span> ${esc(ev.titulo)}${ev.turmaNome ? ` <em>· ${esc(ev.turmaNome)}</em>` : ""}</li>`).join("");
    const notas = notasDoDia(iso);

    return `
      ${banners}
      <div class="hor-dia-grid">
        <section aria-label="Aulas do dia">
          <p class="hor-resumo">${ativas.length ? `${ativas.length} aula${ativas.length === 1 ? "" : "s"} · ${faixa}` : "Nenhuma aula neste dia"}</p>
          ${lista.length ? `<div class="hor-timeline">${lista.map((o, i) => aulaCardHtml(o, ehHoje, i === proximaIdx)).join("")}</div>`
            : `<div class="teacher-empty-state"><strong>Dia livre.</strong><span>Sem aulas no horário fixo. Use “Nova turma” ou “Alterar” numa aula para marcar uma reposição nesta data.</span></div>`}
        </section>
        <aside class="hor-lado" aria-label="Anotações e avisos do dia">
          <div class="card">
            <div class="hor-lado-topo"><h3>Anotações</h3><button type="button" class="attendance-btn" data-action="hor-nova-anotacao" data-iso="${esc(iso)}">+ Nova</button></div>
            ${notas.length ? notas.map(notaCardHtml).join("") : `<p class="hor-vazio-txt">Nada anotado para este dia.</p>`}
          </div>
          ${outros ? `<div class="card"><h3>No calendário</h3><ul class="hor-lado-lista">${outros}</ul></div>` : ""}
        </aside>
      </div>`;
  }

  function legendaHtml(){
    const ds = [...new Set(turmasVisiveis().map(t => t.disciplina).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if(ds.length < 2) return "";
    return `<div class="hor-legenda">${ds.map(d => `<span><i style="background:${corDaDisciplina(d)}"></i>${esc(d)}</span>`).join("")}</div>`;
  }

  function semanaView(){
    const seg = segundaDaSemana(H.ref);
    const usaDomingo = turmasVisiveis().some(t => encontrosDaTurma(t).some(e => e.dia === 0));
    const dias = Array.from({ length: usaDomingo ? 7 : 6 }, (_, i) => somarDias(seg, i));
    const hoje = hojeISO();
    let total = 0;
    const colunas = dias.map(iso => {
      const lista = ocorrencias(iso);
      total += conta(lista);
      const notas = notasDoDia(iso).length;
      const blocos = lista.map(o => {
        const apagada = ["cancelada", "saiu", "semaula"].includes(o.status);
        return `<button type="button" class="hor-bloco ${apagada ? "apagada" : ""} ${o.status === "alterada" || o.status === "reposicao" ? "destaque" : ""}" style="--hor-cor:${corDaDisciplina(o.turma.disciplina)}" data-action="hor-abrir-aula" ${dataAttrs(o)}>
          <span class="hor-bloco-hora">${esc(o.inicio)}${o.fim ? `–${esc(o.fim)}` : ""}</span>
          <span class="hor-bloco-nome">${esc(o.turma.nome)}</span>
          ${o.sala ? `<span class="hor-bloco-sala">Sala ${esc(o.sala)}</span>` : ""}
          ${RSTATUS[o.status] ? `<span class="hor-bloco-flag ${RSTATUS[o.status].cls}">${RSTATUS[o.status].txt}</span>` : ""}
        </button>`;
      }).join("");
      const semAula = eventosSemAula(iso)[0];
      return `
        <div class="hor-col ${iso === hoje ? "hoje" : ""}">
          <button type="button" class="hor-col-topo" data-action="hor-ir-dia" data-iso="${esc(iso)}" aria-label="Abrir ${esc(dataLonga(iso))}">
            <span>${diaDaSemanaCurto(iso)}</span><strong>${Number(iso.slice(8))}</strong>
          </button>
          ${semAula ? `<div class="hor-col-aviso">${esc(semAula.titulo)}</div>` : ""}
          <div class="hor-col-corpo">${blocos || `<span class="hor-col-vazio">Livre</span>`}</div>
          ${notas ? `<button type="button" class="hor-col-notas" data-action="hor-ir-dia" data-iso="${esc(iso)}">${notas} anotaç${notas === 1 ? "ão" : "ões"}</button>` : ""}
        </div>`;
    }).join("");
    return `
      <p class="hor-resumo">${total} aula${total === 1 ? "" : "s"} nesta semana</p>
      <div class="hor-semana ${usaDomingo ? "com-domingo" : ""}">${colunas}</div>
      ${legendaHtml()}`;
  }

  function mesView(){
    const d = dataDoISO(H.ref);
    const ano = d.getFullYear(), mes = d.getMonth();
    const hoje = hojeISO();
    let total = 0;
    const celulas = gradeDoMes(ano, mes).map(iso => {
      if(!iso) return `<div class="hor-mes-vazio"></div>`;
      const lista = ocorrencias(iso);
      const n = conta(lista);
      total += n;
      const cancel = lista.filter(o => o.status === "cancelada" || o.status === "saiu").length;
      const alterada = lista.some(o => o.status === "alterada" || o.status === "reposicao");
      const notas = notasDoDia(iso).length;
      const semAula = eventosSemAula(iso).length > 0;
      const dow = dataDoISO(iso).getDay();
      return `
        <button type="button" class="hor-mes-dia ${iso === hoje ? "hoje" : ""} ${semAula ? "semaula" : ""} ${dow === 0 ? "domingo" : ""}" data-action="hor-ir-dia" data-iso="${esc(iso)}" aria-label="${esc(dataLonga(iso))}: ${n} aula(s)">
          <span class="hor-mes-num">${Number(iso.slice(8))}</span>
          ${n ? `<span class="hor-mes-aulas">${n} aula${n === 1 ? "" : "s"}</span>` : ""}
          <span class="hor-mes-marcas">
            ${alterada ? `<i class="alterada" title="Horário alterado"></i>` : ""}
            ${cancel ? `<i class="cancelada" title="Cancelada ou remarcada"></i>` : ""}
            ${notas ? `<i class="nota" title="Anotação"></i>` : ""}
          </span>
        </button>`;
    }).join("");
    return `
      <p class="hor-resumo">${total} aula${total === 1 ? "" : "s"} em ${MESES[mes].toLowerCase()}</p>
      <div class="card hor-mes-card">
        <div class="hor-mes-semanas">${DIAS_CURTOS.map(s => `<span>${s}</span>`).join("")}</div>
        <div class="hor-mes-grade">${celulas}</div>
        <div class="hor-legenda marcas"><span><i class="alterada"></i>Horário alterado</span><span><i class="cancelada"></i>Cancelada / remarcada</span><span><i class="nota"></i>Anotação</span></div>
      </div>`;
  }

  function semHorarioHtml(){
    const sem = todasAsTurmas().filter(t => encontrosDaTurma(t).length === 0);
    if(!sem.length) return "";
    return `
      <div class="card hor-sem-horario">
        <h3>Turmas sem horário definido</h3>
        <p>Estas turmas não aparecem na agenda porque o horário não está preenchido de um jeito que dê pra entender.</p>
        ${sem.map(t => `<div class="hor-sem-linha"><span><strong>${esc(t.nome)}</strong>${t.horario ? ` <em>“${esc(t.horario)}”</em>` : ""}</span>
          <button type="button" class="attendance-btn" data-action="hor-definir-horario" data-t="${esc(t.id)}">Definir horário</button></div>`).join("")}
      </div>`;
  }

  function tituloDaNavegacao(){
    if(H.visao === "dia") return dataLonga(H.ref);
    if(H.visao === "semana"){
      const seg = segundaDaSemana(H.ref);
      return `${dataCurta(seg)} a ${dataCurta(somarDias(seg, 5))}`;
    }
    const d = dataDoISO(H.ref);
    return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  }

  function filtrosHtml(){
    const e = eu();
    const turmas = todasAsTurmas();
    if(turmas.length < 2 && e.papel === "professor") return "";
    const profs = e.papel === "instituicao" ? professoresDaUnidade() : [];
    const turmasDoFiltro = H.filtroProf ? turmas.filter(t => t.professorId === H.filtroProf) : turmas;
    return `
      <div class="hor-filtros">
        ${e.papel === "instituicao" ? `
          <select class="teacher-text-input" data-hor="filtro" data-c="filtroProf" aria-label="Filtrar por professor">
            <option value="">Todos os professores</option>
            ${profs.map(p => `<option value="${esc(p.id)}" ${H.filtroProf === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
          </select>` : ""}
        <select class="teacher-text-input" data-hor="filtro" data-c="filtroTurma" aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>
          ${[...turmasDoFiltro].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(t => `<option value="${esc(t.id)}" ${H.filtroTurma === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}
        </select>
      </div>`;
  }

  function view(){
    const e = eu();
    const carregandoTurmas = e.papel === "instituicao" && state.instTurmas === null;
    const seg = (chave, rotulo) => `<button type="button" role="tab" aria-selected="${H.visao === chave}" class="${H.visao === chave ? "ativo" : ""}" data-action="hor-visao" data-v="${chave}">${rotulo}</button>`;
    let corpo;
    if(carregandoTurmas) corpo = `<p class="section-eyebrow">Carregando turmas…</p>`;
    else if(todasAsTurmas().length === 0){
      corpo = `<div class="teacher-empty-state"><strong>Nenhuma turma por aqui ainda.</strong><span>${e.papel === "professor" ? "Crie sua primeira turma pelo botão acima — com dia, horário e alunos." : "Crie uma turma pelo botão acima ou importe a lista em Gestão."}</span></div>`;
    } else corpo = H.visao === "dia" ? diaView() : H.visao === "semana" ? semanaView() : mesView();

    return `
      <div class="hor-topo">
        <div>
          <h2 class="section-title">Horários</h2>
          <p class="section-eyebrow">${e.papel === "professor" ? "Suas aulas do dia, da semana e do mês — e tudo que você precisa fazer com elas." : "As aulas da unidade em um só lugar: ajuste horários, avise as turmas e anote o que precisa."}</p>
        </div>
        <div class="hor-acoes">
          <button type="button" class="attendance-btn" data-action="hor-nova-anotacao" data-iso="${esc(H.visao === "dia" ? H.ref : hojeISO())}">Anotação</button>
          <button type="button" class="attendance-btn" data-action="hor-novo-lembrete">Lembrete</button>
          <button type="button" class="teacher-primary-btn" data-action="hor-nova-turma">+ Nova turma</button>
        </div>
      </div>

      ${H.aviso ? `<p class="hor-aviso" role="status">${ICONS.check} ${esc(H.aviso)}</p>` : ""}
      ${H.erro ? `<div class="cal-erro"><span>${esc(H.erro)}</span><button type="button" class="cal-link" data-action="hor-atualizar">Tentar de novo</button></div>` : ""}

      <div class="hor-barra">
        <div class="hor-seg" role="tablist" aria-label="Visão">${seg("dia", "Dia")}${seg("semana", "Semana")}${seg("mes", "Mês")}</div>
        <div class="hor-nav">
          <button type="button" class="cal-nav-btn" data-action="hor-nav" data-d="-1" aria-label="Anterior">${ICONS.chevronLeft}</button>
          <span class="hor-nav-titulo" aria-live="polite">${esc(tituloDaNavegacao())}</span>
          <button type="button" class="cal-nav-btn" data-action="hor-nav" data-d="1" aria-label="Próximo">${ICONS.chevronRight}</button>
        </div>
        <div class="hor-nav-extra">
          <button type="button" class="cal-link" data-action="hor-hoje">Hoje</button>
          <button type="button" class="cal-link" data-action="hor-atualizar" ${H.carregando ? "disabled" : ""}>${H.carregando ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </div>
      ${filtrosHtml()}
      ${corpo}
      ${semHorarioHtml()}`;
  }

  /* ================================================================ */
  /* Modais                                                            */
  /* ================================================================ */
  const moldura = (titulo, sub, corpo, { largo = false } = {}) => `
    <div class="aluno-modal-backdrop" data-action="hor-fechar">
      <div class="aluno-modal ${largo ? "hor-modal-largo" : ""}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" data-action="hor-noop">
        <div class="aluno-modal-head">
          <div><h2>${esc(titulo)}</h2>${sub ? `<p class="section-eyebrow" style="margin:2px 0 0;">${sub}</p>` : ""}</div>
          <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="hor-fechar" aria-label="Fechar">${ICONS.close}</button>
        </div>
        ${corpo}
      </div>
    </div>`;

  const campo = (rotulo, html, dica = "") => `<label class="hor-campo"><span class="teacher-label">${rotulo}</span>${html}${dica ? `<small>${dica}</small>` : ""}</label>`;
  const inp = (c, valor, extra = "") => `<input class="teacher-text-input" data-hor="f" data-c="${c}" value="${esc(valor)}" ${extra} />`;
  const rodapeForm = (f, rotuloSalvar, acao) => `
    ${f.erro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin:10px 0 0;">${esc(f.erro)}</p>` : ""}
    <div class="hor-modal-rodape">
      <button type="button" class="attendance-btn" data-action="hor-fechar">Cancelar</button>
      <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="${acao}" ${f.salvando ? "disabled" : ""}>${f.salvando ? "Salvando…" : rotuloSalvar}</button>
    </div>`;

  function selectTurmas(valor, c, { vazio = "" } = {}){
    const l = [...todasAsTurmas()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return `<select class="teacher-text-input" data-hor="f" data-c="${c}">
      ${vazio ? `<option value="" ${!valor ? "selected" : ""}>${esc(vazio)}</option>` : `<option value="" disabled ${!valor ? "selected" : ""}>Escolha a turma</option>`}
      ${l.map(t => `<option value="${esc(t.id)}" ${valor === t.id ? "selected" : ""}>${esc(t.nome)}${t.disciplina ? ` — ${esc(t.disciplina)}` : ""}</option>`).join("")}
    </select>`;
  }

  function encontrosEditorHtml(f){
    return `
      <div class="hor-encontros">
        ${f.encontros.map((en, i) => `
          <div class="hor-encontro">
            <select class="teacher-text-input" data-hor="f" data-c="dia" data-i="${i}" aria-label="Dia da semana">
              ${DIAS_LONGOS.map((n, d) => `<option value="${d}" ${Number(en.dia) === d ? "selected" : ""}>${n}</option>`).join("")}
            </select>
            <input type="time" class="teacher-text-input" data-hor="f" data-c="inicio" data-i="${i}" value="${esc(en.inicio)}" aria-label="Início" />
            <span aria-hidden="true">às</span>
            <input type="time" class="teacher-text-input" data-hor="f" data-c="fim" data-i="${i}" value="${esc(en.fim)}" aria-label="Término" />
            <button type="button" class="attendance-btn" data-action="hor-enc-rem" data-i="${i}" aria-label="Remover horário" ${f.encontros.length === 1 ? "disabled" : ""}>${ICONS.trash}</button>
          </div>`).join("")}
        <button type="button" class="cal-link" data-action="hor-enc-add">+ Adicionar outro dia</button>
      </div>`;
  }

  function avisarHtml(f, texto){
    return `<label class="hor-check"><input type="checkbox" data-hor="avisar" ${f.avisar ? "checked" : ""} /> <span>${texto}</span></label>`;
  }

  /* ---- Detalhe da aula ---- */
  function modalAula(m){
    const t = turmaPorId(m.turmaId);
    if(!t) return "";
    const e = eu();
    const o = resolver(m);
    const alunos = [...(t.alunos || [])].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
    const linha = (k, v) => v ? `<div class="hor-info-linha"><span>${k}</span><strong>${v}</strong></div>` : "";
    const quando = o.enc || o.ex ? `${dataLonga(m.viewIso)} · ${esc(o.inicio)}${o.fim ? `–${esc(o.fim)}` : ""}` : dataLonga(m.viewIso);
    const status = detalheDoStatus(o);
    const corpo = `
      ${status ? `<div class="hor-faixa ${RSTATUS[o.status]?.cls || ""}">${ICONS.warn}<span>${status}</span></div>` : ""}
      <div class="hor-info">
        ${linha("Disciplina", esc(t.disciplina || ""))}
        ${linha("Sala", esc(o.sala || t.sala || ""))}
        ${linha("Unidade", esc(t.escola || ""))}
        ${e.papel === "instituicao" ? linha("Professor(a)", esc(nomeProfessor(t.professorId))) : ""}
        ${linha("Horário fixo", esc(textoHorario(encontrosDaTurma(t)) || t.horario || "não definido"))}
      </div>
      <h3 class="teacher-label" style="margin:14px 0 6px;">Alunos (${alunos.length})</h3>
      ${alunos.length ? `<div class="hor-alunos-chips">${alunos.map(n => `<span>${esc(n)}</span>`).join("")}</div>` : `<p class="hor-vazio-txt">Nenhum aluno vinculado ainda. Use “Editar turma” pra adicionar.</p>`}
      <div class="hor-modal-acoes">
        <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="hor-alterar" data-t="${esc(t.id)}" data-o="${esc(m.origemIso)}" data-i="${m.encIdx}" data-v="${esc(m.viewIso)}">Alterar horário</button>
        <button type="button" class="attendance-btn" data-action="hor-lembrete-aula" data-t="${esc(t.id)}" data-o="${esc(m.origemIso)}" data-i="${m.encIdx}" data-v="${esc(m.viewIso)}">Enviar lembrete</button>
        <button type="button" class="attendance-btn" data-action="hor-nota-aula" data-t="${esc(t.id)}" data-o="${esc(m.origemIso)}" data-i="${m.encIdx}" data-v="${esc(m.viewIso)}">Anotar</button>
        <button type="button" class="attendance-btn" data-action="hor-editar-turma" data-t="${esc(t.id)}">Editar turma</button>
        ${e.papel === "professor" ? `<button type="button" class="attendance-btn" data-action="hor-chamada" data-t="${esc(t.id)}">Fazer chamada</button>` : ""}
      </div>`;
    return moldura(t.nome, quando, corpo);
  }

  /* Reconstrói a "aula" a partir do que o modal guardou. */
  function resolver(m){
    const t = turmaPorId(m.turmaId);
    const encs = t ? encontrosDaTurma(t) : [];
    const enc = encs[m.encIdx] || null;
    const ex = H.excecoes.find(x => x.turmaId === m.turmaId && x.dataOriginal === m.origemIso && (x.encIdx || 0) === m.encIdx) || null;
    let status = "normal", inicio = enc ? enc.inicio : "", fim = enc ? enc.fim : "", sala = t?.sala || "";
    if(ex && ex.tipo === "cancelada") status = "cancelada";
    else if(ex && ex.tipo === "remarcada"){
      inicio = ex.inicio || inicio; fim = ex.fim || fim; sala = ex.sala || sala;
      status = ex.novaData === m.origemIso ? "alterada" : (m.viewIso === m.origemIso ? "saiu" : "reposicao");
    }
    return { turma: t, enc, ex, status, inicio, fim, sala, origemIso: m.origemIso, inicioOriginal: enc ? enc.inicio : "", semAula: eventosSemAula(m.viewIso)[0] || null };
  }

  /* ---- Alterar horário ---- */
  function abrirAlterar(alvo, modoInicial){
    const t = turmaPorId(alvo.turmaId);
    if(!t) return;
    const o = alvo.origemIso ? resolver(alvo) : null;
    const semEncontro = !o || !o.enc;
    const encs = encontrosDaTurma(t);
    H.modal = {
      tipo: "alterar", ...alvo,
      modo: semEncontro ? "fixo" : (modoInicial || "dia"),
      f: {
        novaData: (o && o.ex && o.ex.novaData) || alvo.origemIso || hojeISO(),
        inicio: (o && o.inicio) || "", fim: (o && o.fim) || "", sala: (o && o.sala) || t.sala || "",
        motivo: (o && o.ex && o.ex.motivo) || "",
        avisar: true,
        encontros: encs.length ? encs.map(e => ({ ...e })) : [{ dia: 1, inicio: "", fim: "" }],
        salaFixa: t.sala || "",
        erro: "", salvando: false, confirmarConflito: false,
      },
    };
    render();
  }

  function modalAlterar(m){
    const t = turmaPorId(m.turmaId);
    if(!t) return "";
    const f = m.f;
    const o = m.origemIso ? resolver(m) : null;
    const temOcorrencia = !!(o && o.enc);
    const aba = (modo, rotulo) => `<button type="button" role="tab" aria-selected="${m.modo === modo}" class="${m.modo === modo ? "ativo" : ""}" data-action="hor-alt-modo" data-m="${modo}">${rotulo}</button>`;
    let corpo = "";
    if(m.modo === "dia"){
      corpo = `
        <div class="hor-dois">
          ${campo("Nova data", `<input type="date" class="teacher-text-input" data-hor="f" data-c="novaData" value="${esc(f.novaData)}" />`)}
          ${campo("Sala", inp("sala", f.sala, `placeholder="Igual à da turma"`))}
        </div>
        <div class="hor-dois">
          ${campo("Início", `<input type="time" class="teacher-text-input" data-hor="f" data-c="inicio" value="${esc(f.inicio)}" />`)}
          ${campo("Término", `<input type="time" class="teacher-text-input" data-hor="f" data-c="fim" value="${esc(f.fim)}" />`)}
        </div>
        ${campo("Motivo (opcional)", inp("motivo", f.motivo, `placeholder="Ex.: reunião pedagógica"`))}
        ${avisarHtml(f, "Avisar os alunos e responsáveis no calendário")}
        ${o && o.ex ? `<button type="button" class="cal-link" data-action="hor-restaurar">Voltar ao horário normal desta aula</button>` : ""}`;
    } else if(m.modo === "cancelar"){
      corpo = `
        <p class="hor-vazio-txt" style="margin:0 0 10px;">A aula de ${esc(dataLonga(m.origemIso))} deixa de acontecer. O horário fixo da turma não muda.</p>
        ${campo("Motivo (opcional)", inp("motivo", f.motivo, `placeholder="Ex.: professor em formação"`))}
        ${avisarHtml(f, "Avisar os alunos e responsáveis no calendário")}
        ${o && o.ex ? `<button type="button" class="cal-link" data-action="hor-restaurar">Voltar ao horário normal desta aula</button>` : ""}`;
    } else {
      corpo = `
        <p class="hor-vazio-txt" style="margin:0 0 10px;">Vale para <strong>todas as aulas</strong> daqui pra frente.</p>
        ${encontrosEditorHtml(f)}
        ${campo("Sala", inp("salaFixa", f.salaFixa, `placeholder="Ex.: 3"`))}
        ${avisarHtml(f, "Avisar os alunos e responsáveis sobre o novo horário")}`;
    }
    const sub = temOcorrencia ? `${dataLonga(m.origemIso)} · ${esc(o.enc.inicio)}${o.enc.fim ? `–${esc(o.enc.fim)}` : ""}` : "Defina os dias e horários da turma";
    const rotuloSalvar = m.modo === "cancelar" ? "Cancelar a aula" : "Salvar";
    return moldura(`Alterar — ${t.nome}`, sub, `
      ${temOcorrencia ? `<div class="hor-seg hor-seg-modal" role="tablist">${aba("dia", "Só esta aula")}${aba("cancelar", "Cancelar esta aula")}${aba("fixo", "Horário fixo")}</div>` : ""}
      ${corpo}
      ${rodapeForm(f, f.confirmarConflito ? "Salvar mesmo assim" : rotuloSalvar, "hor-salvar-alteracao")}`, { largo: true });
  }

  /* ---- Lembrete ---- */
  function abrirLembrete(turmaId, dataIso){
    H.modal = {
      tipo: "lembrete",
      f: {
        turmaId: turmaId || (todasAsTurmas().length === 1 ? todasAsTurmas()[0].id : ""),
        tipo: "lembrete", data: dataIso || hojeISO(), titulo: "", descricao: "", paraQuem: "todos",
        erro: "", salvando: false,
      },
    };
    render();
  }

  function modalLembrete(m){
    const f = m.f;
    const e = eu();
    const t = turmaPorId(f.turmaId);
    const qtd = t ? (t.alunos || []).length : 0;
    return moldura("Enviar lembrete", "Aparece no calendário dos alunos e responsáveis da turma.", `
      ${campo("Turma", selectTurmas(f.turmaId, "turmaId"), t ? `${qtd} aluno${qtd === 1 ? "" : "s"} vão receber` : "")}
      <div class="hor-dois">
        ${campo("Data", `<input type="date" class="teacher-text-input" data-hor="f" data-c="data" value="${esc(f.data)}" />`, "O dia em que aparece no calendário")}
        ${e.papel === "professor" ? campo("Tipo", `<select class="teacher-text-input" data-hor="f" data-c="tipo"><option value="lembrete" ${f.tipo === "lembrete" ? "selected" : ""}>Lembrete</option><option value="aviso" ${f.tipo === "aviso" ? "selected" : ""}>Aviso</option></select>`) : ""}
      </div>
      ${campo("Título", inp("titulo", f.titulo, `maxlength="80" placeholder="Ex.: Trazer o livro na próxima aula"`))}
      ${campo("Detalhes (opcional)", `<textarea class="teacher-text-input" rows="3" data-hor="f" data-c="descricao" placeholder="Explique melhor, se precisar">${esc(f.descricao)}</textarea>`)}
      ${e.papel === "professor" ? campo("Quem vê", `<select class="teacher-text-input" data-hor="f" data-c="paraQuem"><option value="todos" ${f.paraQuem === "todos" ? "selected" : ""}>Alunos e responsáveis</option><option value="responsaveis" ${f.paraQuem === "responsaveis" ? "selected" : ""}>Só responsáveis</option><option value="alunos" ${f.paraQuem === "alunos" ? "selected" : ""}>Só alunos</option></select>`) : ""}
      ${rodapeForm(f, "Enviar", "hor-salvar-lembrete")}`);
  }

  /* ---- Anotação ---- */
  function abrirAnotacao({ id, turmaId, data } = {}){
    const existente = id ? H.anotacoes.find(n => n.id === id) : null;
    H.modal = {
      tipo: "anotacao", editId: id || null,
      f: {
        titulo: existente?.titulo || "", texto: existente?.texto || "",
        data: existente?.data || data || hojeISO(), turmaId: existente?.turmaId ?? turmaId ?? "",
        erro: "", salvando: false,
      },
    };
    render();
  }

  function modalAnotacao(m){
    const f = m.f;
    return moldura(m.editId ? "Editar anotação" : "Nova anotação", "Só você vê o que escreve aqui.", `
      <div class="hor-dois">
        ${campo("Data", `<input type="date" class="teacher-text-input" data-hor="f" data-c="data" value="${esc(f.data)}" />`)}
        ${campo("Turma (opcional)", selectTurmas(f.turmaId, "turmaId", { vazio: "Geral — sem turma" }))}
      </div>
      ${campo("Título (opcional)", inp("titulo", f.titulo, `maxlength="80" placeholder="Ex.: Reposição da turma B"`))}
      ${campo("Anotação", `<textarea class="teacher-text-input" rows="5" data-hor="f" data-c="texto" placeholder="Escreva o que precisa lembrar">${esc(f.texto)}</textarea>`)}
      ${rodapeForm(f, "Salvar anotação", "hor-salvar-anotacao")}`);
  }

  /* ---- Criar / editar turma ---- */
  function abrirTurma(turmaId){
    const e = eu();
    const t = turmaId ? turmaPorId(turmaId) : null;
    const escolaId = t?.escolaId || e.escolaId;
    const encs = t ? encontrosDaTurma(t) : [];
    H.modal = {
      tipo: "turma", editId: t ? t.id : null,
      f: {
        nome: t?.nome || "", disciplina: t?.disciplina || (e.disciplinas.length === 1 ? e.disciplinas[0] : ""),
        escolaId, sala: t?.sala || "",
        professorId: t?.professorId || (e.papel === "professor" ? e.uid : ""),
        encontros: encs.length ? encs.map(x => ({ ...x })) : [{ dia: 1, inicio: "", fim: "" }],
        alunos: [...(t?.alunos || [])],
        erro: "", salvando: false,
      },
    };
    render();
    carregarAlunos(escolaId);
    descobrirNomeDaEscola(escolaId);
  }

  function disciplinasParaTurma(f){
    const e = eu();
    if(e.papel === "professor") return e.disciplinas.length ? e.disciplinas : ctx.todosOsCursos;
    const prof = professoresDaUnidade().find(p => p.id === f.professorId);
    if(prof && prof.disciplinas?.length) return prof.disciplinas;
    return ctx.cursosDaEscola(nomeDaEscola(f.escolaId));
  }

  function modalTurma(m){
    const f = m.f;
    const e = eu();
    const disciplinas = disciplinasParaTurma(f);
    if(f.disciplina && !disciplinas.includes(f.disciplina)) disciplinas.push(f.disciplina);
    const nomesAlunos = new Set([...(H.alunos || []).map(a => a.nome), ...f.alunos]);
    const listaAlunos = [...nomesAlunos].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const turmaDe = new Map((H.alunos || []).map(a => [a.nome, a.turma]));
    const alunosHtml = H.alunosCarregando
      ? `<p class="hor-vazio-txt">Carregando alunos…</p>`
      : listaAlunos.length === 0
        ? `<p class="hor-vazio-txt">Nenhum aluno para escolher${H.alunosErro ? "" : " nesta unidade ainda"}.</p>`
        : `<div class="responsavel-vinculo-list hor-alunos-lista">${listaAlunos.map(n => `
            <label class="responsavel-vinculo-item hor-aluno-item" data-n="${esc(normalizarTexto(n))}">
              <input type="checkbox" data-hor="aluno" data-nome="${esc(n)}" ${f.alunos.includes(n) ? "checked" : ""} />
              <span>${esc(n)}${turmaDe.get(n) ? ` · ${esc(turmaDe.get(n))}` : ""}</span>
            </label>`).join("")}</div>`;
    const multiEscola = e.escolasIds.length > 1;
    return moldura(m.editId ? "Editar turma" : "Nova turma", e.papel === "professor" ? "Você será o(a) professor(a) desta turma." : "", `
      ${campo("Nome da turma", inp("nome", f.nome, `placeholder="Ex.: Inglês — Turma A"`))}
      ${e.papel === "instituicao" ? campo("Professor(a)", `<select class="teacher-text-input" data-hor="f" data-c="professorId">
          <option value="" disabled ${!f.professorId ? "selected" : ""}>${professoresDaUnidade().length ? "Escolha o(a) professor(a)" : "Carregando professores…"}</option>
          ${professoresDaUnidade().map(p => `<option value="${esc(p.id)}" ${f.professorId === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
        </select>`) : ""}
      <div class="hor-dois">
        ${campo("Disciplina", `<select class="teacher-text-input" data-hor="f" data-c="disciplina">
          <option value="" disabled ${!f.disciplina ? "selected" : ""}>Escolha</option>
          ${disciplinas.map(d => `<option value="${esc(d)}" ${f.disciplina === d ? "selected" : ""}>${esc(d)}</option>`).join("")}
        </select>`)}
        ${campo("Sala (opcional)", inp("sala", f.sala))}
      </div>
      ${multiEscola && e.papel === "professor" && !m.editId ? campo("Unidade", `<select class="teacher-text-input" data-hor="f" data-c="escolaId">
          ${e.escolasIds.map(id => `<option value="${esc(id)}" ${f.escolaId === id ? "selected" : ""}>${esc(nomeDaEscola(id) || id)}</option>`).join("")}
        </select>`) : ""}
      <span class="teacher-label" style="margin-top:12px;display:block;">Dias e horários</span>
      ${encontrosEditorHtml(f)}
      <span id="hor-alunos-contagem" class="teacher-label" style="margin-top:14px;display:block;">Alunos (${f.alunos.length} selecionado${f.alunos.length === 1 ? "" : "s"})</span>
      ${listaAlunos.length > 8 ? `<input class="teacher-text-input" data-hor="busca-aluno" placeholder="Buscar aluno" aria-label="Buscar aluno" style="margin-bottom:8px;" />` : ""}
      ${alunosHtml}
      ${H.alunosErro ? `<p class="hor-vazio-txt" style="color:var(--red);">${esc(H.alunosErro)}</p>` : ""}
      ${rodapeForm(f, m.editId ? "Salvar alterações" : "Criar turma", "hor-salvar-turma")}`, { largo: true });
  }

  function modais(){
    if(!ativo() || !H.modal) return "";
    const m = H.modal;
    if(m.tipo === "aula") return modalAula(m);
    if(m.tipo === "alterar") return modalAlterar(m);
    if(m.tipo === "lembrete") return modalLembrete(m);
    if(m.tipo === "anotacao") return modalAnotacao(m);
    if(m.tipo === "turma") return modalTurma(m);
    return "";
  }

  /* ================================================================ */
  /* Gravações                                                         */
  /* ================================================================ */
  function atualizarTurmaLocal(id, patch){
    [state.data.professorTurmas, state.instTurmas].forEach(lista => {
      const t = (lista || []).find(x => x.id === id);
      if(t) Object.assign(t, patch);
    });
  }

  async function publicarAviso(turma, { titulo, descricao, data, tipo = "aviso", paraQuem = "todos" }){
    const e = eu();
    const destinatarios = [...new Set((turma.alunos || []).map(n => chaveAluno(turma.escolaId, n)))];
    if(!destinatarios.length) return false;
    const base = { titulo, descricao: descricao || "", data, escolaId: turma.escolaId, turmaId: turma.id, turmaNome: turma.nome || "", criadoEm: new Date().toISOString() };
    const dados = e.papel === "professor"
      ? { tipo: tipo === "lembrete" ? "lembrete" : "aviso", ...base, alvo: "turma", paraQuem: ["todos", "responsaveis", "alunos"].includes(paraQuem) ? paraQuem : "todos", disciplina: turma.disciplina || "", alunoNome: "", destinatarios, professorId: e.uid, professorNome: e.nome }
      : { escopo: "escola", tipo: "aviso", ...base, titulo: `${titulo} — ${turma.nome}`, cursos: turma.disciplina ? [turma.disciplina] : null, destinatarios, destinatariosProfessores: turma.professorId ? [turma.professorId] : [], criadoPorId: e.uid, criadoPorNome: e.nome };
    const ref = doc(collection(db, "eventosCalendario"));
    await setDoc(ref, dados);
    const lista = ctx.eventosCalendario();
    if(Array.isArray(lista)) lista.push({ id: ref.id, ...dados });
    return true;
  }

  const rotuloAula = (t) => t.disciplina || t.nome;
  const lowerDia = (iso) => DIAS_LONGOS[dataDoISO(iso).getDay()].toLowerCase();

  async function salvarAlteracao(){
    const m = H.modal;
    if(!m || m.f.salvando) return;
    const f = m.f, e = eu();
    const t = turmaPorId(m.turmaId);
    if(!t) return;
    f.erro = "";

    try {
      if(m.modo === "fixo"){
        const v = validarEncontros(f.encontros);
        if(v.erro){ f.erro = v.erro; render(); return; }
        f.salvando = true; render();
        const patch = { encontros: v.encontros, horario: textoHorario(v.encontros), sala: (f.salaFixa || "").trim() };
        await updateDoc(doc(db, "turmas", t.id), patch);
        atualizarTurmaLocal(t.id, patch);
        let avisou = false;
        if(f.avisar) avisou = await publicarAviso(t, { titulo: `Novo horário — ${rotuloAula(t)}`, descricao: `A turma ${t.nome} agora tem aula: ${patch.horario}.`, data: hojeISO() });
        H.modal = null;
        H.aviso = `Horário de ${t.nome} atualizado${avisou ? " e alunos avisados" : ""}.`;
        return;
      }

      const enc = encontrosDaTurma(t)[m.encIdx];
      if(!enc){ f.erro = "Essa aula não existe mais no horário da turma."; render(); return; }
      const idDoc = `${t.id}_${m.origemIso}_${m.encIdx}`;
      const base = {
        turmaId: t.id, turmaNome: t.nome || "", escolaId: t.escolaId, professorId: t.professorId || e.uid,
        dataOriginal: m.origemIso, encIdx: m.encIdx, motivo: (f.motivo || "").trim(),
        alteradoPorId: e.uid, alteradoPorNome: e.nome, atualizadoEm: new Date().toISOString(),
      };
      let dados, aviso;

      if(m.modo === "cancelar"){
        dados = { ...base, tipo: "cancelada", novaData: "", inicio: "", fim: "", sala: "" };
        aviso = { titulo: `Aula cancelada — ${rotuloAula(t)}`, descricao: `A aula de ${lowerDia(m.origemIso)} (${dataCurta(m.origemIso)}) da turma ${t.nome} não vai acontecer.${base.motivo ? ` Motivo: ${base.motivo}.` : ""}`, data: m.origemIso };
      } else {
        const inicio = normHora(f.inicio);
        const fim = f.fim ? normHora(f.fim) : "";
        if(!dataValida(f.novaData)){ f.erro = "Escolha uma data válida."; render(); return; }
        if(!inicio){ f.erro = "Informe o horário de início."; render(); return; }
        if(f.fim && !fim){ f.erro = "O horário de término não é válido."; render(); return; }
        if(fim && minutos(fim) <= minutos(inicio)){ f.erro = "O término precisa ser depois do início."; render(); return; }
        const mesmoDia = f.novaData === m.origemIso;
        if(mesmoDia && inicio === enc.inicio && (fim || "") === (enc.fim || "") && !(f.sala || "").trim() && !base.motivo){
          f.erro = "Nada mudou. Altere o horário, a data ou a sala."; render(); return;
        }
        if(!f.confirmarConflito){
          const conflitos = conflitosCom(t, f.novaData, inicio, fim, `${t.id}|${m.origemIso}|${m.encIdx}`);
          if(conflitos.length){
            f.confirmarConflito = true;
            f.erro = `Atenção: já existe ${conflitos.map(c => `${c.turma.nome} (${c.inicio}${c.fim ? `–${c.fim}` : ""})`).join(", ")} nesse horário. Toque em “Salvar mesmo assim” para confirmar.`;
            render();
            return;
          }
        }
        dados = { ...base, tipo: "remarcada", novaData: f.novaData, inicio, fim, sala: (f.sala || "").trim() };
        const quando = `${lowerDia(f.novaData)} (${dataCurta(f.novaData)}) às ${inicio}${fim ? `–${fim}` : ""}`;
        aviso = {
          titulo: mesmoDia ? `Horário alterado — ${rotuloAula(t)}` : `Aula remarcada — ${rotuloAula(t)}`,
          descricao: `${mesmoDia ? "A aula de hoje" : `A aula de ${lowerDia(m.origemIso)} (${dataCurta(m.origemIso)})`} da turma ${t.nome} será ${quando}.${dados.sala ? ` Sala ${dados.sala}.` : ""}${base.motivo ? ` Motivo: ${base.motivo}.` : ""}`,
          data: f.novaData,
        };
      }

      f.salvando = true; render();
      await setDoc(doc(db, "horariosExcecoes", idDoc), dados);
      H.excecoes = [...H.excecoes.filter(x => x.id !== idDoc), { id: idDoc, ...dados }];
      let avisou = false;
      if(f.avisar) avisou = await publicarAviso(t, aviso);
      H.modal = null;
      H.aviso = `${m.modo === "cancelar" ? "Aula cancelada" : "Aula atualizada"}${avisou ? " e alunos avisados" : ""}.`;
    } catch(err){
      console.error("Horários > salvar alteração:", err?.code, err);
      f.salvando = false;
      f.erro = `Não foi possível salvar agora${err?.code ? ` (${err.code})` : ""}.${err?.code === "permission-denied" ? " As regras do Firestore para esta aba ainda precisam ser publicadas (HORARIOS.md)." : " Tente de novo."}`;
    } finally {
      render();
    }
  }

  async function restaurarAula(){
    const m = H.modal;
    const idDoc = `${m.turmaId}_${m.origemIso}_${m.encIdx}`;
    const f = m.f;
    f.salvando = true; render();
    try {
      await deleteDoc(doc(db, "horariosExcecoes", idDoc));
      H.excecoes = H.excecoes.filter(x => x.id !== idDoc);
      H.modal = null;
      H.aviso = "A aula voltou ao horário normal.";
    } catch(err){
      console.error("Horários > restaurar:", err?.code, err);
      f.salvando = false;
      f.erro = `Não foi possível restaurar agora${err?.code ? ` (${err.code})` : ""}.`;
    } finally { render(); }
  }

  async function salvarLembrete(){
    const m = H.modal, f = m.f;
    if(f.salvando) return;
    const t = turmaPorId(f.turmaId);
    const titulo = (f.titulo || "").trim();
    let erro = "";
    if(!t) erro = "Escolha a turma.";
    else if(!titulo) erro = "Digite o título do lembrete.";
    else if(!dataValida(f.data)) erro = "Escolha uma data válida.";
    else if((t.alunos || []).length === 0) erro = "Esta turma ainda não tem alunos. Adicione alunos em “Editar turma”.";
    if(erro){ f.erro = erro; render(); return; }
    f.erro = ""; f.salvando = true; render();
    try {
      await publicarAviso(t, { titulo, descricao: (f.descricao || "").trim(), data: f.data, tipo: f.tipo, paraQuem: f.paraQuem });
      H.modal = null;
      H.aviso = `Lembrete enviado para ${t.nome} (${dataCurta(f.data)}).`;
    } catch(err){
      console.error("Horários > lembrete:", err?.code, err);
      f.salvando = false;
      f.erro = `Não foi possível enviar agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
    } finally { render(); }
  }

  async function salvarAnotacao(){
    const m = H.modal, f = m.f, e = eu();
    if(f.salvando) return;
    const texto = (f.texto || "").trim();
    let erro = "";
    if(!texto) erro = "Escreva a anotação.";
    else if(!dataValida(f.data)) erro = "Escolha uma data válida.";
    if(erro){ f.erro = erro; render(); return; }
    const t = f.turmaId ? turmaPorId(f.turmaId) : null;
    const existente = m.editId ? H.anotacoes.find(n => n.id === m.editId) : null;
    const ref = m.editId ? doc(db, "anotacoesHorario", m.editId) : doc(collection(db, "anotacoesHorario"));
    const agora = new Date().toISOString();
    const dados = {
      autorId: e.uid, autorNome: e.nome, autorRole: e.papel, escolaId: t?.escolaId || e.escolaId,
      titulo: (f.titulo || "").trim(), texto, data: f.data,
      turmaId: t ? t.id : "", turmaNome: t ? t.nome : "",
      criadoEm: existente?.criadoEm || agora, atualizadoEm: agora,
    };
    f.erro = ""; f.salvando = true; render();
    try {
      await setDoc(ref, dados);
      H.anotacoes = [...H.anotacoes.filter(n => n.id !== ref.id), { id: ref.id, ...dados }];
      H.ref = f.data;
      H.modal = null;
      H.aviso = "Anotação salva.";
    } catch(err){
      console.error("Horários > anotação:", err?.code, err);
      f.salvando = false;
      f.erro = `Não foi possível salvar agora${err?.code ? ` (${err.code})` : ""}.${err?.code === "permission-denied" ? " As regras do Firestore para esta aba ainda precisam ser publicadas (HORARIOS.md)." : ""}`;
    } finally { render(); }
  }

  async function excluirAnotacao(id){
    if(H.excluirAnotacaoId !== id){ H.excluirAnotacaoId = id; render(); return; }
    try {
      await deleteDoc(doc(db, "anotacoesHorario", id));
      H.anotacoes = H.anotacoes.filter(n => n.id !== id);
      H.aviso = "Anotação excluída.";
    } catch(err){
      console.error("Horários > excluir anotação:", err?.code, err);
      H.erro = `Não foi possível excluir a anotação agora${err?.code ? ` (${err.code})` : ""}.`;
    } finally {
      H.excluirAnotacaoId = null;
      render();
    }
  }

  async function salvarTurma(){
    const m = H.modal, f = m.f, e = eu();
    if(f.salvando) return;
    const nome = (f.nome || "").trim();
    const v = validarEncontros(f.encontros);
    let erro = "";
    if(!nome) erro = "Digite o nome da turma.";
    else if(e.papel === "instituicao" && !f.professorId) erro = "Escolha o(a) professor(a) da turma.";
    else if(!f.disciplina) erro = "Escolha a disciplina.";
    else if(v.erro) erro = v.erro;
    if(erro){ f.erro = erro; render(); return; }

    const escolaId = f.escolaId || e.escolaId;
    await descobrirNomeDaEscola(escolaId);
    const dados = {
      nome, horario: textoHorario(v.encontros), encontros: v.encontros, sala: (f.sala || "").trim(),
      escola: nomeDaEscola(escolaId), escolaId, disciplina: f.disciplina,
      professorId: e.papel === "professor" ? e.uid : f.professorId, alunos: f.alunos,
    };
    f.erro = ""; f.salvando = true; render();
    try {
      if(m.editId){
        const { escola, escolaId: _e, ...alteraveis } = dados;   // escola da turma não muda na edição
        await updateDoc(doc(db, "turmas", m.editId), alteraveis);
        atualizarTurmaLocal(m.editId, alteraveis);
        H.aviso = `Turma ${nome} atualizada.`;
      } else {
        const ref = doc(collection(db, "turmas"));
        await setDoc(ref, dados);
        const nova = { id: ref.id, ...dados };
        if(e.papel === "professor") state.data.professorTurmas = [...(state.data.professorTurmas || []), nova];
        else state.instTurmas = [...(state.instTurmas || []), nova];
        H.aviso = `Turma ${nome} criada. Ela já aparece na sua agenda.`;
      }
      H.modal = null;
    } catch(err){
      console.error("Horários > turma:", err?.code, err);
      f.salvando = false;
      f.erro = `Não foi possível salvar a turma agora${err?.code ? ` (${err.code})` : ""}.${err?.code === "permission-denied" ? " O Firestore não liberou a gravação — veja as regras de “turmas” em HORARIOS.md." : " Tente de novo."}`;
    } finally { render(); }
  }

  /* ================================================================ */
  /* Eventos vindos do script.js                                       */
  /* ================================================================ */
  const alvoDe = (el) => ({ turmaId: el.dataset.t, origemIso: el.dataset.o, encIdx: Number(el.dataset.i || 0), viewIso: el.dataset.v || el.dataset.o });

  async function click(el){
    const a = el.dataset.action;
    if(a !== "hor-excluir-anotacao") H.excluirAnotacaoId = null;
    if(a !== "hor-noop" && a !== "hor-salvar-alteracao") H.aviso = "";

    switch(a){
      case "hor-noop": return;
      case "hor-fechar": H.modal = null; render(); return;
      case "hor-visao":
        H.visao = el.dataset.v;
        render(); return;
      case "hor-nav": {
        const d = Number(el.dataset.d);
        H.ref = H.visao === "dia" ? somarDias(H.ref, d) : H.visao === "semana" ? somarDias(H.ref, 7 * d) : somarMeses(H.ref, d);
        render(); return;
      }
      case "hor-hoje": H.ref = hojeISO(); render(); return;
      case "hor-ir-dia": H.ref = el.dataset.iso; H.visao = "dia"; render(); return;
      case "hor-atualizar": ctx.carregarEventosCalendario(true); carregar(true); return;

      case "hor-abrir-aula": H.modal = { tipo: "aula", ...alvoDe(el) }; render(); return;
      case "hor-alterar": abrirAlterar(alvoDe(el)); return;
      case "hor-definir-horario": abrirAlterar({ turmaId: el.dataset.t, origemIso: "", encIdx: 0, viewIso: hojeISO() }, "fixo"); return;
      case "hor-alt-modo": H.modal.modo = el.dataset.m; H.modal.f.erro = ""; H.modal.f.confirmarConflito = false; render(); return;
      case "hor-enc-add": {
        const f = H.modal.f;
        const ult = f.encontros[f.encontros.length - 1] || {};
        f.encontros.push({ dia: ((Number(ult.dia) || 1) % 6) + 1, inicio: ult.inicio || "", fim: ult.fim || "" });
        render(); return;
      }
      case "hor-enc-rem": {
        const f = H.modal.f;
        if(f.encontros.length > 1) f.encontros.splice(Number(el.dataset.i), 1);
        render(); return;
      }
      case "hor-salvar-alteracao": await salvarAlteracao(); return;
      case "hor-restaurar": await restaurarAula(); return;

      case "hor-novo-lembrete": abrirLembrete("", H.visao === "dia" ? H.ref : hojeISO()); return;
      case "hor-lembrete-aula": { const al = alvoDe(el); abrirLembrete(al.turmaId, al.viewIso); return; }
      case "hor-salvar-lembrete": await salvarLembrete(); return;

      case "hor-nova-anotacao": abrirAnotacao({ data: el.dataset.iso }); return;
      case "hor-nota-aula": { const al = alvoDe(el); abrirAnotacao({ turmaId: al.turmaId, data: al.viewIso }); return; }
      case "hor-editar-anotacao": abrirAnotacao({ id: el.dataset.id }); return;
      case "hor-excluir-anotacao": await excluirAnotacao(el.dataset.id); return;
      case "hor-salvar-anotacao": await salvarAnotacao(); return;

      case "hor-nova-turma": abrirTurma(null); return;
      case "hor-editar-turma": abrirTurma(el.dataset.t); return;
      case "hor-salvar-turma": await salvarTurma(); return;

      case "hor-chamada": {
        const id = el.dataset.t;
        H.modal = null;
        ctx.abrirChamada(id);
        return;
      }
    }
  }

  /* Digitação: só guarda o valor (sem re-render) pra o cursor não pular. */
  function input(t){
    if(t.dataset.hor === "busca-aluno"){
      const q = normalizarTexto(t.value);
      document.querySelectorAll(".hor-aluno-item").forEach(item => { item.hidden = !!q && !item.dataset.n.includes(q); });
      return;
    }
    if(t.type === "checkbox") return;
    const f = H.modal && H.modal.f;
    if(t.dataset.hor !== "f" || !f) return;
    const c = t.dataset.c;
    if(t.dataset.i !== undefined){
      const en = f.encontros[Number(t.dataset.i)];
      if(en) en[c] = c === "dia" ? Number(t.value) : t.value;
      return;
    }
    f[c] = t.value;
    if(H.modal.tipo === "alterar") f.confirmarConflito = false;
  }

  /* Mudanças de <select>/checkbox: as que alteram o layout re-renderizam. */
  function change(t){
    const h = t.dataset.hor;
    if(h === "filtro"){
      H[t.dataset.c] = t.value;
      if(t.dataset.c === "filtroProf") H.filtroTurma = "";
      render();
      return;
    }
    const f = H.modal && H.modal.f;
    if(!f) return;
    if(h === "avisar"){ f.avisar = t.checked; return; }
    if(h === "aluno"){
      const nome = t.dataset.nome;
      f.alunos = t.checked ? [...new Set([...f.alunos, nome])] : f.alunos.filter(n => n !== nome);
      const contagem = document.getElementById("hor-alunos-contagem");
      if(contagem) contagem.textContent = `Alunos (${f.alunos.length} selecionado${f.alunos.length === 1 ? "" : "s"})`;
      return;
    }
    if(h !== "f") return;
    if(H.modal.tipo === "turma" && (t.dataset.c === "escolaId")){
      f.escolaId = t.value;
      render();
      carregarAlunos(t.value);
      descobrirNomeDaEscola(t.value);
      return;
    }
    if(H.modal.tipo === "turma" && t.dataset.c === "professorId"){
      f.professorId = t.value;
      const ok = disciplinasParaTurma(f);
      if(f.disciplina && !ok.includes(f.disciplina)) f.disciplina = "";
      render();
      return;
    }
  }

  return { view, modais, aoAbrir, click, input, change };
}
