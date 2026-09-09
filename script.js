/* ==================================================================
   Educa+ — app.js
   ------------------------------------------------------------------
   Login real via Firebase Authentication (e-mail/senha) e leitura de
   dados no Cloud Firestore. Não há mais dados fictícios: tudo que a
   tela mostra vem do banco, a partir do usuário autenticado.

   Modelo de dados (veja DATABASE.md para o detalhe e exemplos prontos
   para colar no console do Firebase):

   usuarios/{uid}
     role: "aluno" | "responsavel" | "professor" | "instituicao"
     nome: string
     alunoId: string            // só quando role == "aluno"
     alunosIds: string[]        // só quando role == "responsavel"
     disciplina: string         // só quando role == "professor"
     escolasIds: string[]       // só quando role == "instituicao"

   alunos/{alunoId}
     nome, turma, foto, escolaId, contato
     notas: [{ materia, nota, bimestre }]
     presenca: { percentual, faltasMes, registros: [{data,status}] }
     financeiro: { status, proxima, valor, historico: [{mes,status,data}] }
     comunicados: [{ titulo, data, urgente }]

   responsaveis/{id}        (cadastro só, sem login — criado pela Gestão)
     nome, escolaId, contato, alunosIds: [alunoId]

   escolas/{escolaId}
     nome, uf, data
     turmas: [{ nome, alunos, faltasHoje, frequencia }]
     faltantes: [{ nome, turma, faltasMes, ultima }]
     financeiro: { previsto, recebido, recebidoPct, variacao, inadimplenciaValor, inadimplenciaPct }
     inadimplentes: [{ nome, aluno, valor, atraso }]
     alunos: [{ nome, turma }]

   turmas/{turmaId}      (turmas de um professor — coleção própria)
     nome, horario, sala, escola, escolaId, disciplina, professorId
     alunos: [nomes]
   ================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
// Algumas redes (Wi-Fi de escola/empresa, certos antivírus/VPN) bloqueiam o
// canal de conexão padrão do Firestore e geram o erro "client is offline"
// mesmo com internet normal. Forçar long-polling resolve isso.
const db = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

/* ------------------------------------------------------------------
   App secundário do Firebase, usado SÓ para criar login (e-mail/senha)
   de aluno/responsável/professor/equipe pela tela de Gestão.
   Motivo: createUserWithEmailAndPassword loga automaticamente com o
   usuário recém-criado. Se usássemos o "auth" principal, a instituição
   seria deslogada e o novo usuário assumiria a sessão. Criando num app
   Firebase separado (com seu próprio Auth), a sessão da instituição no
   app principal não é afetada.
   ------------------------------------------------------------------ */
const secondaryApp = initializeApp(firebaseConfig, "secondary-user-creation");
const secondaryAuth = getAuth(secondaryApp);

/* ================================================================== */
/* Icons (tiny inline SVGs)                                             */
/* ================================================================== */
const ICONS = {
  cap: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/></svg>`,
  clipboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 4V2h6v2"/><path d="m9 13 2 2 4-4"/></svg>`,
  wallet: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h3v-4Z"/></svg>`,
  megaphone: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 13v-2Z"/><path d="M11.6 16.8 13 22h-3l-1.6-5.4"/></svg>`,
  users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  logout: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  chevronRight: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  chevronLeft: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  building: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v18"/><path d="M6 12H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/><path d="M18 9h2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2"/><path d="M10 6h1M13 6h1M10 10h1M13 10h1M10 14h1M13 14h1M10 18h1M13 18h1"/></svg>`,
  user: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-1a6 6 0 0 1 12 0v1"/></svg>`,
  users2: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  pin: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  pinSmall: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>`,
  warn: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a1 1 0 0 0 .9 1.5h18.6a1 1 0 0 0 .9-1.5L13.7 3.9a1 1 0 0 0-1.7 0Z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  trendUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>`,
  trendDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 6 6 4-4 8 8"/><path d="M17 17h4v-4"/></svg>`,
  menu: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  close: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  spinner: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>`,
};

function markSvg(size){
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="markGrad" x1="0" y1="0" x2="100" y2="100">
      <stop offset="0" stop-color="#E9CE8C"/><stop offset="1" stop-color="#9C7A2E"/>
    </linearGradient></defs>
    <circle cx="63" cy="22" r="11" fill="url(#markGrad)"/>
    <path d="M20 24 C40 30 52 46 55 66 C58 46 40 28 20 24 Z" fill="url(#markGrad)" opacity="0.9"/>
    <path d="M80 34 C68 46 60 58 55 78 C68 66 82 54 80 34 Z" fill="url(#markGrad)" opacity="0.9"/>
    <path d="M50 40 C56 54 56 66 50 86 C44 66 44 54 50 40 Z" fill="url(#markGrad)"/>
  </svg>`;
}

function escapeHtml(value){
  return String(value || "").replace(/[&<>"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[char]);
}

/* ================================================================== */
/* App state                                                            */
/* ================================================================== */
const state = {
  screen: "login",        // login | carregando | escola-picker | aluno | familia | instituicao | professor
  authUser: null,
  perfil: null,            // documento de usuarios/{uid}
  loginCarregando: false,
  loginErro: "",
  loginAviso: "",

  // dados carregados do Firestore para a sessão atual
  data: {
    aluno: null,               // { id, nome, turma, foto, notas, presenca, financeiro, comunicados }
    familiaAlunos: [],         // mesma forma acima, um por filho
    professorNome: "",
    professorDisciplina: "",
    professorTurmas: [],       // [{ id, nome, horario, sala, escola, disciplina, alunos:[nomes] }]
    escolas: {},                // { [escolaId]: { nome, uf, data, turmas, faltantes, financeiro, inadimplentes, alunos } }
  },

  alunoTab: "notas",
  familiaTab: "notas",
  familiaStudentId: null,
  escolaSelecionadaId: null,
  instTab: "turmas",
  alunosBusca: "",
  professorTab: "aulas",
  professorTurmaId: null,
  professorPresencas: {},
  professorObservacoes: {},
  professorConteudo: "",
  professorNotas: {},
  professorAvisoEnviado: "",
  professorRegistroSalvo: false,
  professorNotasSalvas: false,
  mobileMenuOpen: false,
  instituicaoMensagem: "",
  instituicaoErro: "",
  novoUsuarioRole: "aluno",       // aluno | responsavel | professor | instituicao
  novoUsuarioNome: "",
  novoUsuarioEmail: "",
  novoUsuarioSenha: "",
  novoUsuarioTurma: "",
  novoUsuarioDisciplina: "",
  novoUsuarioContato: "",
  novoUsuarioSalvando: false,
  novoUsuarioAlunosVinculados: [], // ids de alunos escolhidos (role == responsavel)
  gestaoAlunosEscola: null,        // [{id,nome,turma}] carregado sob demanda p/ vincular responsável
  gestaoAlunosCarregando: false,
};

const app = document.getElementById("app");

/* ================================================================== */
/* Carregamento de dados no Firestore, por perfil                      */
/* ================================================================== */
async function carregarDadosDoPerfil(){
  const perfil = state.perfil;

  if(perfil.role === "aluno"){
    if(!perfil.alunoId) throw new Error("Seu perfil de aluno não está vinculado a um cadastro. Fale com a secretaria.");
    const snap = await getDoc(doc(db, "alunos", perfil.alunoId));
    if(!snap.exists()) throw new Error("Cadastro do aluno não encontrado. Fale com a secretaria.");
    state.data.aluno = normalizeAluno(snap.id, snap.data());
    state.alunoTab = "notas";
    state.screen = "aluno";
    return;
  }

  if(perfil.role === "responsavel"){
    const ids = Array.isArray(perfil.alunosIds) ? perfil.alunosIds : [];
    if(ids.length === 0) throw new Error("Nenhum aluno vinculado ao seu cadastro de responsável. Fale com a secretaria.");
    const snaps = await Promise.all(ids.map(id => getDoc(doc(db, "alunos", id))));
    const alunos = snaps.filter(s => s.exists()).map(s => normalizeAluno(s.id, s.data()));
    if(alunos.length === 0) throw new Error("Não encontramos os cadastros dos seus filhos. Fale com a secretaria.");
    state.data.familiaAlunos = alunos;
    state.familiaStudentId = alunos[0].id;
    state.familiaTab = "notas";
    state.screen = "familia";
    return;
  }

  if(perfil.role === "professor"){
    state.data.professorNome = perfil.nome || "Professor(a)";
    state.data.professorDisciplina = perfil.disciplina || "";
    const q = query(collection(db, "turmas"), where("professorId", "==", state.authUser.uid));
    const snaps = await getDocs(q);
    state.data.professorTurmas = snaps.docs.map(d => ({ id: d.id, ...d.data(), alunos: d.data().alunos || [] }));
    state.professorTab = "aulas";
    state.professorTurmaId = null;
    state.screen = "professor";
    return;
  }

  if(perfil.role === "instituicao"){
    const ids = Array.isArray(perfil.escolasIds) && perfil.escolasIds.length
      ? perfil.escolasIds
      : (perfil.escolaId ? [perfil.escolaId] : []);
    if(ids.length === 0) throw new Error("Nenhuma escola vinculada ao seu perfil. Fale com a secretaria.");
    const snaps = await Promise.all(ids.map(id => getDoc(doc(db, "escolas", id))));
    const escolas = {};
    snaps.forEach(s => { if(s.exists()) escolas[s.id] = normalizeEscola(s.data()); });
    if(Object.keys(escolas).length === 0) throw new Error("Não encontramos os dados da(s) escola(s) vinculada(s).");
    state.data.escolas = escolas;
    if(Object.keys(escolas).length === 1){
      state.escolaSelecionadaId = Object.keys(escolas)[0];
      state.instTab = "turmas";
      state.screen = "instituicao";
    } else {
      state.screen = "escola-picker";
    }
    return;
  }

  throw new Error("Seu usuário não tem um tipo de acesso configurado. Fale com a secretaria.");
}

function normalizeAluno(id, dados){
  return {
    id,
    nome: dados.nome || "",
    turma: dados.turma || "",
    foto: dados.foto || (dados.nome || "?").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase(),
    notas: Array.isArray(dados.notas) ? dados.notas : [],
    presenca: {
      percentual: dados.presenca?.percentual ?? 0,
      faltasMes: dados.presenca?.faltasMes ?? 0,
      registros: Array.isArray(dados.presenca?.registros) ? dados.presenca.registros : [],
    },
    financeiro: {
      status: dados.financeiro?.status || "—",
      proxima: dados.financeiro?.proxima || "—",
      valor: dados.financeiro?.valor || "—",
      historico: Array.isArray(dados.financeiro?.historico) ? dados.financeiro.historico : [],
    },
    comunicados: Array.isArray(dados.comunicados) ? dados.comunicados : [],
  };
}

function normalizeEscola(dados){
  return {
    nome: dados.nome || "",
    uf: dados.uf || "",
    data: dados.data || "",
    turmas: Array.isArray(dados.turmas) ? dados.turmas : [],
    faltantes: Array.isArray(dados.faltantes) ? dados.faltantes : [],
    financeiro: dados.financeiro || {},
    inadimplentes: Array.isArray(dados.inadimplentes) ? dados.inadimplentes : [],
    alunos: Array.isArray(dados.alunos) ? dados.alunos : [],
  };
}

/* ================================================================== */
/* Autenticação                                                         */
/* ================================================================== */
onAuthStateChanged(auth, async (user) => {
  if(!user){
    state.authUser = null;
    state.perfil = null;
    state.screen = "login";
    state.loginCarregando = false;
    render();
    return;
  }
  state.authUser = user;
  state.screen = "carregando";
  render();
  try {
    const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
    if(!perfilSnap.exists()){
      throw new Error("Não encontramos um cadastro para este acesso. Fale com a secretaria.");
    }
    state.perfil = perfilSnap.data();
    await carregarDadosDoPerfil();
    state.loginErro = "";
  } catch(err){
    console.error(err);
    state.loginErro = err.message || "Não foi possível carregar seus dados. Tente novamente.";
    await signOut(auth);
    return; // onAuthStateChanged será chamado de novo com user=null
  }
  render();
});

function mensagemErroFirebase(code){
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Este acesso está desativado. Fale com a secretaria.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente novamente.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/email-already-in-use": "Já existe um usuário com este e-mail.",
    "auth/weak-password": "A senha provisória precisa ter pelo menos 6 caracteres.",
    "auth/missing-password": "Informe uma senha provisória.",
  };
  return mapa[code] || "Não foi possível concluir. Tente novamente.";
}

/* ================================================================== */
/* Render dispatcher                                                    */
/* ================================================================== */
function render(){
  if(state.screen === "login") app.innerHTML = renderLogin();
  else if(state.screen === "carregando") app.innerHTML = renderCarregando();
  else if(state.screen === "escola-picker") app.innerHTML = renderEscolaPicker();
  else if(state.screen === "aluno") app.innerHTML = renderAluno();
  else if(state.screen === "familia") app.innerHTML = renderFamilia();
  else if(state.screen === "instituicao") app.innerHTML = renderInstituicao();
  else if(state.screen === "professor") app.innerHTML = renderProfessor();
}

function renderCarregando(){
  return `
  <div class="screen sign-in-screen">
    <div class="login-box modern-login-box" style="text-align:center;">
      <div class="login-logo-wrap"><img class="login-logo" src="imgs/logoeduca.jpeg" alt="Logo Educa+" /></div>
      <p style="color:var(--cream);margin-top:18px;">Carregando seus dados…</p>
    </div>
  </div>`;
}

function renderLogin(){
  return `
  <div class="screen sign-in-screen">
    <div class="login-box modern-login-box">
      <form id="login-form" class="login-card modern-login-card" novalidate>
        <div class="login-logo-wrap">
          <img class="login-logo" src="imgs/logoeduca.jpeg" alt="Logo Educa+" />
        </div>
        <div class="login-fields">
          <label class="sr-only" for="login-identifier">Informe seu e-mail</label>
          <input id="login-identifier" class="field-input modern-field-input" type="text" autocomplete="username" inputmode="email" placeholder="Informe seu e-mail" />
          <label class="sr-only" for="login-password">Senha</label>
          <input id="login-password" class="field-input modern-field-input" type="password" autocomplete="current-password" placeholder="Senha" />
          <p id="login-error" class="login-error" aria-live="polite">${escapeHtml(state.loginErro)}</p>
          ${state.loginAviso ? `<p class="login-error" style="color:#8fd0a5;" aria-live="polite">${escapeHtml(state.loginAviso)}</p>` : ""}
        </div>
        <div class="login-divider"></div>
        <button type="submit" class="btn-gold modern-sign-in-btn" ${state.loginCarregando ? "disabled" : ""}>${state.loginCarregando ? "Entrando…" : "Entrar"}</button>
        <div class="forgot-row modern-forgot-row">
          <button type="button" class="link-btn" data-action="forgot-password">Esqueci minha senha</button>
        </div>
        <p class="login-foot modern-login-foot">Precisa de acesso? <button type="button" class="inline-link" data-action="contact-secretaria">Fale com a secretaria.</button></p>
      </form>
    </div>
  </div>`;
}

function greeting(name){
  const hour = new Date().getHours();
  const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return `${period}, ${(name || "").split(" ")[0]}!`;
}

function classStatus(){
  const hour = new Date().getHours();
  if(hour < 14) return { label: "Programação de hoje", message: "Confira seu calendário para as próximas atividades.", tone: "gold" };
  if(hour < 15) return { label: "Atividade em andamento", message: "", tone: "green" };
  if(hour < 16) return { label: "Atividade em andamento", message: "", tone: "green" };
  return { label: "Programação de hoje", message: "Confira seu calendário para as próximas atividades.", tone: "gold" };
}

function classStatusCard(student, forFamily = false){
  const status = classStatus();
  return `
    <section class="course-agenda">
      <div class="course-agenda-head">
        <div><div class="course-agenda-label">${forFamily ? `Atividades de ${escapeHtml(student.nome.split(" ")[0])}` : "Minhas atividades de hoje"}</div><div class="course-agenda-subtitle">${escapeHtml(student.turma)}</div></div>
        <span class="course-live ${status.tone === "green" ? "active" : ""}">${status.tone === "green" ? (forFamily ? "Presente agora" : "Em andamento") : "Agenda do dia"}</span>
      </div>
    </section>`;
}

/* ---------------- ESCOLA PICKER (perfis institucionais com mais de uma unidade) ---------------- */
function renderEscolaPicker(){
  const escolas = state.data.escolas;
  const jaTemEscolaAberta = !!(state.escolaSelecionadaId && escolas[state.escolaSelecionadaId]);
  const cards = Object.keys(escolas).map(id => `
    <button class="picker-card ${id === state.escolaSelecionadaId ? "picker-card-active" : ""}" data-action="select-escola" data-escola="${id}">
      <div class="picker-icon">${ICONS.pin}</div>
      <div>
        <div class="picker-card-title">${escapeHtml(escolas[id].nome)}</div>
        <div class="picker-card-desc">${escapeHtml(escolas[id].uf)}</div>
      </div>
      <div class="picker-cta">${id === state.escolaSelecionadaId ? "Unidade atual" : "Entrar"} ${ICONS.chevronRight}</div>
    </button>`).join("");

  return `
  <div class="screen">
    <div class="picker-box narrow">
      <button class="back-btn" data-action="${jaTemEscolaAberta ? "cancel-escola-picker" : "logout"}">${ICONS.chevronLeft} ${jaTemEscolaAberta ? "Voltar" : "Sair"}</button>
      <h1 class="picker-title">Qual unidade você acessa?</h1>
      <p class="picker-desc">Selecione a escola para carregar as turmas e o financeiro certos.</p>
      <div class="picker-grid">${cards}</div>
    </div>
  </div>`;
}

/* ---------------- SHELL (sidebar + main) ---------------- */
function shell({ navItems, active, headerSub, headerTitle, bodyHtml, navAction, schoolBadge, schoolBadgeClickable }){
  const navBtns = navItems.map(item => `
    <button class="nav-btn ${active===item.key?'active':''}" data-action="${navAction}" data-key="${item.key}">
      ${ICONS[item.icon]} ${item.label}
    </button>`).join("");

  const mobileDrawerBtns = navItems.map(item => `
    <button class="mobile-drawer-btn ${active===item.key?'active':''}" data-action="${navAction}" data-key="${item.key}">
      ${ICONS[item.icon]} <span>${item.label}</span>
    </button>`).join("");

  return `
  <div class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand sidebar-brand-logo">
        <img src="imgs/logoeduca.jpeg" alt="Educa+ Centro Educacional" />
      </div>
      ${schoolBadge ? (
        schoolBadgeClickable
          ? `<button type="button" class="sidebar-school sidebar-school-clickable" data-action="open-escola-picker" title="Trocar de unidade">${schoolBadge} ${ICONS.chevronRight}</button>`
          : `<div class="sidebar-school">${schoolBadge}</div>`
      ) : ""}
      <nav class="sidebar-nav">${navBtns}</nav>
      <button class="logout-btn" data-action="logout">${ICONS.logout} Sair</button>
    </aside>
    <main class="main">
      <div class="main-head">
        <div>
          <div class="main-head-sub">${headerSub}</div>
          <h1 class="main-head-title">${headerTitle}</h1>
        </div>
      </div>
      ${bodyHtml}
    </main>
    <button class="mobile-menu-toggle" data-action="toggle-mobile-menu" aria-label="Abrir menu" aria-expanded="${state.mobileMenuOpen}">
      ${state.mobileMenuOpen ? ICONS.close : ICONS.menu}<span>Menu</span>
    </button>
    <div class="mobile-menu-backdrop ${state.mobileMenuOpen ? "open" : ""}" data-action="close-mobile-menu"></div>
    <nav class="mobile-drawer ${state.mobileMenuOpen ? "open" : ""}" aria-label="Menu principal">
      <div class="mobile-drawer-head"><strong>Menu</strong><button data-action="close-mobile-menu" aria-label="Fechar menu">${ICONS.close}</button></div>
      <div class="mobile-drawer-nav">${mobileDrawerBtns}</div>
      <button class="mobile-drawer-logout" data-action="logout">${ICONS.logout} Sair da conta</button>
    </nav>
  </div>`;
}

/* ---------------- ALUNO DASHBOARD (login direto do aluno) ---------------- */
function renderAluno(){
  const student = state.data.aluno;
  const navItems = [
    { key:"notas", label:"Notas", icon:"cap" },
    { key:"presenca", label:"Presença", icon:"clipboard" },
    { key:"comunicados", label:"Comunicados", icon:"megaphone" },
  ];

  let body = "";
  if(state.alunoTab === "notas") body = notasView(student);
  else if(state.alunoTab === "presenca") body = presencaView(student);
  else if(state.alunoTab === "comunicados") body = comunicadosView(student);

  return shell({
    navItems, active: state.alunoTab,
    headerSub: `ALUNO · ${escapeHtml(student.turma)}`, headerTitle: greeting(student.nome),
    bodyHtml: classStatusCard(student) + body,
    navAction: "set-aluno-tab",
  });
}

/* ---------------- FAMÍLIA (RESPONSÁVEL) DASHBOARD ---------------- */
function renderFamilia(){
  const alunos = state.data.familiaAlunos;
  const student = alunos.find(s => s.id === state.familiaStudentId) || alunos[0];
  const navItems = [
    { key:"notas", label:"Notas", icon:"cap" },
    { key:"presenca", label:"Presença", icon:"clipboard" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"comunicados", label:"Comunicados", icon:"megaphone" },
  ];

  let switcher = "";
  if(alunos.length > 1){
    switcher = `<div class="student-switch">` + alunos.map(s => `
      <button class="student-chip ${s.id===state.familiaStudentId?'active':''}" data-action="switch-student" data-id="${s.id}">
        <span class="student-avatar">${escapeHtml(s.foto)}</span>
        <span class="student-chip-name">${escapeHtml(s.nome.split(" ")[0])}</span>
        <span class="student-chip-turma">· ${escapeHtml(s.turma)}</span>
      </button>`).join("") + `</div>`;
  }

  let body = "";
  if(state.familiaTab === "notas") body = notasView(student);
  else if(state.familiaTab === "presenca") body = presencaView(student);
  else if(state.familiaTab === "financeiro") body = financeiroFamiliaView(student);
  else if(state.familiaTab === "comunicados") body = comunicadosView(student);

  return shell({
    navItems, active: state.familiaTab,
    headerSub: "RESPONSÁVEL", headerTitle: greeting(state.perfil?.nome || "Responsável"),
    bodyHtml: switcher + classStatusCard(student, true) + body,
    navAction: "set-familia-tab",
  });
}

function notasView(student){
  const media = student.notas.length
    ? (student.notas.reduce((a,n)=>a+n.nota,0)/student.notas.length).toFixed(1)
    : "—";
  const rows = student.notas.map(n => `
    <div class="row">
      <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(n.materia)}</span>
      <span style="font-size:15px;font-weight:700;color:${n.nota>=7?'var(--green)':'var(--red)'}">${Number(n.nota).toFixed(1)}</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma nota lançada ainda.</div>`;
  return `
    <h2 class="section-title" style="display:inline-block;margin-right:12px;">Boletim</h2>
    <span class="pill ${media!=="—" && media>=7?'pill-green':'pill-red'}">Média geral ${media}</span>
    <p class="section-eyebrow">${escapeHtml(student.turma)} · ${escapeHtml(student.notas[0]?.bimestre||'')}</p>
    <div class="card flush">${rows}</div>`;
}

function presencaView(student){
  const rows = student.presenca.registros.map(r => `
    <div class="row">
      <span style="font-size:14px;color:var(--ink);">${escapeHtml(r.data)}</span>
      ${r.status==="presente"
        ? `<span class="pill pill-green">${ICONS.check} Presente</span>`
        : `<span class="pill pill-red">${ICONS.warn} Falta</span>`}
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum registro de presença ainda.</div>`;
  return `
    <h2 class="section-title">Presença</h2>
    <p class="section-eyebrow">Ano letivo</p>
    <div class="grid-cards" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Frequência</div>
        <div style="font-family:var(--font-display);font-size:30px;color:var(--ink);">${student.presenca.percentual}%</div>
      </div>
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Faltas no mês</div>
        <div style="font-family:var(--font-display);font-size:30px;color:var(--ink);">${student.presenca.faltasMes}</div>
      </div>
    </div>
    <div class="card flush">${rows}</div>`;
}

function financeiroFamiliaView(student){
  const hist = student.financeiro.historico.map(h => `
    <div class="row" style="font-size:14px;">
      <span style="color:var(--ink);">${escapeHtml(h.mes)}</span>
      <span style="color:var(--slate);">${escapeHtml(h.data)}</span>
      <span class="pill pill-green">${escapeHtml(h.status)}</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum histórico disponível.</div>`;
  return `
    <h2 class="section-title">Financeiro</h2>
    <p class="section-eyebrow">Mensalidades da matrícula</p>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-size:13px;color:var(--slate);">Situação atual</div>
          <div style="margin-top:4px;"><span class="pill pill-green">${ICONS.check} ${escapeHtml(student.financeiro.status)}</span></div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--slate);">Próximo vencimento</div>
          <div style="font-size:15px;font-weight:600;color:var(--ink);margin-top:4px;">${escapeHtml(student.financeiro.proxima)}</div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--slate);">Valor</div>
          <div style="font-size:15px;font-weight:600;color:var(--ink);margin-top:4px;">${escapeHtml(student.financeiro.valor)}</div>
        </div>
      </div>
    </div>
    <h3 style="font-family:var(--font-display);font-size:17px;color:var(--ink);font-weight:500;">Histórico</h3>
    <div class="card flush">${hist}</div>`;
}

function comunicadosView(student){
  const items = student.comunicados.map(c => `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--ink);">${escapeHtml(c.titulo)}</div>
        <div style="font-size:13px;color:var(--slate);margin-top:3px;">${escapeHtml(c.data)}</div>
      </div>
      ${c.urgente ? `<span class="pill pill-red">Importante</span>` : ""}
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum comunicado no momento.</div>`;
  return `
    <h2 class="section-title">Comunicados</h2>
    <p class="section-eyebrow">Avisos da turma e da escola</p>
    <div>${items}</div>`;
}

/* ---------------- PROFESSOR ---------------- */
function professorTurmaAtual(){
  return state.data.professorTurmas.find(turma => turma.id === state.professorTurmaId);
}

function professorTurmaSelect(){
  const turmas = state.data.professorTurmas;
  if(turmas.length === 0) return `<div class="teacher-empty-state"><strong>Nenhuma turma vinculada a você ainda.</strong><span>Fale com a secretaria para vincular suas turmas.</span></div>`;
  return `<div class="teacher-class-list">${turmas.map(turma => `
    <button class="teacher-class-card ${turma.id === state.professorTurmaId ? "active" : ""}" data-action="set-professor-class" data-id="${turma.id}">
      <span>${escapeHtml(turma.horario)}</span><strong>${escapeHtml(turma.nome)}</strong><small>${escapeHtml(turma.escola)} · ${escapeHtml(turma.sala)}</small>
    </button>`).join("")}</div>`;
}

function renderProfessor(){
  const navItems = [
    { key:"aulas", label:"Aulas & chamada", icon:"clipboard" },
    { key:"avaliacoes", label:"Notas & atividades", icon:"cap" },
    { key:"recados", label:"Recados", icon:"megaphone" },
  ];
  const body = state.professorTab === "aulas" ? professorAulasView()
    : state.professorTab === "avaliacoes" ? professorAvaliacoesView()
    : professorRecadosView();

  return shell({
    navItems, active: state.professorTab,
    headerSub: `PROFESSOR${state.data.professorDisciplina ? " · " + state.data.professorDisciplina.toUpperCase() : ""}`,
    headerTitle: greeting(state.data.professorNome),
    bodyHtml: body,
    navAction: "set-professor-tab",
  });
}

function professorAulasView(){
  const turma = professorTurmaAtual();
  if(!turma){
    return `
      <h2 class="section-title">Aulas de hoje</h2>
      <p class="section-eyebrow">Escolha uma turma para abrir a chamada, registrar observações e o conteúdo da aula.</p>
      ${professorTurmaSelect()}`;
  }
  const present = turma.alunos.filter(aluno => (state.professorPresencas[`${turma.id}-${aluno}`] || "presente") === "presente").length;
  const rows = turma.alunos.map(aluno => {
    const key = `${turma.id}-${aluno}`;
    const status = state.professorPresencas[key] || "presente";
    return `<div class="attendance-row">
      <div class="attendance-student"><strong>${escapeHtml(aluno)}</strong><input class="teacher-observation" data-observation="${escapeHtml(key)}" value="${escapeHtml(state.professorObservacoes[key])}" placeholder="Observação (opcional)" /></div>
      <div class="attendance-actions">
        <button class="attendance-btn ${status === "presente" ? "active present" : ""}" data-action="set-presence" data-student="${escapeHtml(aluno)}" data-status="presente">Presente</button>
        <button class="attendance-btn ${status === "falta" ? "active absent" : ""}" data-action="set-presence" data-student="${escapeHtml(aluno)}" data-status="falta">Falta</button>
        <button class="attendance-btn ${status === "justificada" ? "active justified" : ""}" data-action="set-presence" data-student="${escapeHtml(aluno)}" data-status="justificada">Justificada</button>
      </div>
    </div>`;
  }).join("");

  return `
    <h2 class="section-title">Aulas de hoje</h2>
    <p class="section-eyebrow">Selecione uma turma para fazer a chamada e registrar a aula.</p>
    ${professorTurmaSelect()}
    <div class="teacher-panel">
      <div class="teacher-panel-head"><div><h2>${escapeHtml(turma.nome)} · ${escapeHtml(turma.disciplina)}</h2><p>${escapeHtml(turma.escola)} · ${escapeHtml(turma.horario)} · ${escapeHtml(turma.sala)}</p></div><span class="pill pill-green">${present}/${turma.alunos.length} presentes</span></div>
      <h3>Chamada</h3>
      <div class="attendance-list">${rows}</div>
      <div class="lesson-content">
        <label for="lesson-content">Conteúdo trabalhado</label>
        <textarea id="lesson-content" placeholder="Ex.: Frações equivalentes e resolução de exercícios.">${escapeHtml(state.professorConteudo)}</textarea>
        <button class="teacher-primary-btn" data-action="save-lesson-content">${state.professorRegistroSalvo ? "Conteúdo registrado" : "Registrar conteúdo"}</button>
      </div>
      <p class="section-eyebrow" style="margin-top:10px;">A chamada e o conteúdo ainda são registrados só nesta sessão — a gravação no banco entra na próxima etapa.</p>
    </div>`;
}

function professorAvaliacoesView(){
  const turma = professorTurmaAtual();
  if(!turma){
    return `
      <h2 class="section-title">Notas e atividades</h2>
      <p class="section-eyebrow">Selecione a turma em que deseja lançar uma atividade ou notas.</p>
      ${professorTurmaSelect()}`;
  }
  const rows = turma.alunos.map(aluno => {
    const key = `${turma.id}-${aluno}`;
    return `<div class="grade-row"><strong>${escapeHtml(aluno)}</strong><input class="grade-input" data-grade="${escapeHtml(key)}" type="number" min="0" max="10" step="0.1" value="${escapeHtml(state.professorNotas[key])}" placeholder="Nota" /></div>`;
  }).join("");
  return `
    <h2 class="section-title">Notas e atividades</h2>
    <p class="section-eyebrow">Lance uma atividade e as notas da turma selecionada.</p>
    ${professorTurmaSelect()}
    <div class="teacher-panel">
      <div class="teacher-panel-head"><div><h2>${escapeHtml(turma.nome)}</h2><p>${escapeHtml(turma.escola)} · ${escapeHtml(turma.disciplina)}</p></div></div>
      <label class="teacher-label" for="activity-name">Atividade ou avaliação</label>
      <input id="activity-name" class="teacher-text-input" placeholder="Ex.: Lista de exercícios — Frações" />
      <div class="grade-list">${rows}</div>
      <button class="teacher-primary-btn" data-action="save-grades">Salvar notas e atividade</button>
      ${state.professorNotasSalvas ? `<p class="teacher-success">Notas e atividade salvas para a turma (ainda só nesta sessão).</p>` : ""}
    </div>`;
}

function professorRecadosView(){
  return `
    <h2 class="section-title">Enviar recado</h2>
    <p class="section-eyebrow">Escolha o público e envie uma comunicação pelo Educa+.</p>
    <div class="teacher-panel teacher-message-panel">
      <label class="teacher-label" for="notice-audience">Enviar para</label>
      <select id="notice-audience" class="teacher-text-input"><option value="Aluno individual">Aluno individual</option><option value="Família">Família</option><option value="Turma">Turma</option><option value="Todos">Todos os responsáveis e alunos</option></select>
      <label class="teacher-label" for="notice-recipient">Destinatário</label>
      <input id="notice-recipient" class="teacher-text-input" placeholder="Ex.: Ana Beatriz, Família Souza ou 5º Ano B" />
      <label class="teacher-label" for="notice-subject">Assunto</label>
      <input id="notice-subject" class="teacher-text-input" placeholder="Ex.: Lembrete sobre a atividade" />
      <label class="teacher-label" for="notice-message">Mensagem</label>
      <textarea id="notice-message" placeholder="Escreva o recado aqui."></textarea>
      <button class="teacher-primary-btn" data-action="send-notice">Enviar recado</button>
      ${state.professorAvisoEnviado ? `<p class="teacher-success">${escapeHtml(state.professorAvisoEnviado)}</p>` : ""}
    </div>`;
}

/* ---------------- INSTITUIÇÃO DASHBOARD ---------------- */
function renderInstituicao(){
  const school = state.data.escolas[state.escolaSelecionadaId];
  const navItems = [
    { key:"turmas", label:"Turmas & faltas", icon:"clipboard" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"alunos", label:"Alunos", icon:"users" },
    { key:"gestao", label:"Gestão", icon:"building" },
  ];

  let body = "";
  if(state.instTab === "turmas") body = turmasView(school);
  else if(state.instTab === "financeiro") body = financeiroInstituicaoView(school);
  else if(state.instTab === "alunos") body = alunosView(school);
  else if(state.instTab === "gestao") body = gestaoInstituicaoView(school);

  const temMaisDeUmaEscola = Object.keys(state.data.escolas).length > 1;

  return shell({
    navItems, active: state.instTab,
    headerSub: "ÁREA DA INSTITUIÇÃO", headerTitle: greeting("Equipe"),
    bodyHtml: body,
    navAction: "set-inst-tab",
    schoolBadge: `${ICONS.pinSmall} ${escapeHtml(school.nome)} — ${escapeHtml(school.uf)}`,
    schoolBadgeClickable: temMaisDeUmaEscola,
  });
}

function gestaoInstituicaoView(school){
  const role = state.novoUsuarioRole;
  const precisaLogin = role === "professor" || role === "instituicao";

  const campoTurma = role === "aluno" ? `
        <input id="new-user-turma" class="teacher-text-input" placeholder="Turma (ex.: 5º Ano B)" value="${escapeHtml(state.novoUsuarioTurma || "")}" />` : "";

  const campoDisciplina = role === "professor" ? `
        <input id="new-user-disciplina" class="teacher-text-input" placeholder="Disciplina (ex.: Matemática)" value="${escapeHtml(state.novoUsuarioDisciplina || "")}" />` : "";

  const campoContato = (role === "aluno" || role === "responsavel") ? `
        <input id="new-user-contato" class="teacher-text-input" placeholder="Contato (telefone ou e-mail) — opcional" value="${escapeHtml(state.novoUsuarioContato || "")}" />` : "";

  let campoVinculo = "";
  if(role === "responsavel"){
    if(state.gestaoAlunosCarregando){
      campoVinculo = `<p class="section-eyebrow" style="margin:6px 0;">Carregando lista de alunos…</p>`;
    } else if(!state.gestaoAlunosEscola || state.gestaoAlunosEscola.length === 0){
      campoVinculo = `<p class="section-eyebrow" style="margin:6px 0;">Nenhum aluno cadastrado nesta unidade ainda. Cadastre o aluno primeiro.</p>`;
    } else {
      campoVinculo = `
        <div class="responsavel-vinculo-list">
          <p class="section-eyebrow" style="margin:6px 0 4px;">Vincular a qual(is) aluno(s)?</p>
          ${state.gestaoAlunosEscola.map(a => `
            <label class="responsavel-vinculo-item">
              <input type="checkbox" data-action="toggle-vinculo-aluno" data-id="${escapeHtml(a.id)}" ${state.novoUsuarioAlunosVinculados.includes(a.id) ? "checked" : ""} />
              <span>${escapeHtml(a.nome)}${a.turma ? ` · ${escapeHtml(a.turma)}` : ""}</span>
            </label>`).join("")}
        </div>`;
    }
  }

  const campoLogin = precisaLogin ? `
        <input id="new-user-email" type="email" class="teacher-text-input" placeholder="E-mail de acesso" value="${escapeHtml(state.novoUsuarioEmail || "")}" />
        <input id="new-user-senha" type="text" class="teacher-text-input" placeholder="Senha provisória (mín. 6 caracteres)" value="${escapeHtml(state.novoUsuarioSenha || "")}" />` : "";

  const rotuloBotao = state.novoUsuarioSalvando
    ? "Salvando…"
    : (role === "aluno" ? "Cadastrar aluno" : role === "responsavel" ? "Cadastrar responsável" : "Criar usuário");

  const textoRodape = precisaLogin
    ? `Combine a senha provisória com a pessoa por fora — ela pode trocar depois com "Esqueci minha senha" na tela de login.`
    : `Esse cadastro fica só nas coleções do banco, sem login — hoje só professor e equipe entram no app com e-mail e senha.`;

  return `
    <h2 class="section-title">Gestão da unidade</h2>
    <p class="section-eyebrow">Cadastros, contratos e planos de ${escapeHtml(school.nome)}.</p>
    <div class="management-grid">
      <div class="management-card">
        <h3>Criar cadastro</h3><p>Aluno e responsável entram só como cadastro. Professor e equipe já ganham login (e-mail/senha).</p>
        <input id="new-user-name" class="teacher-text-input" placeholder="Nome completo" value="${escapeHtml(state.novoUsuarioNome || "")}" />
        <select id="new-user-role" class="teacher-text-input" data-action="change-new-user-role">
          <option value="aluno" ${role === "aluno" ? "selected" : ""}>Aluno</option>
          <option value="responsavel" ${role === "responsavel" ? "selected" : ""}>Responsável</option>
          <option value="professor" ${role === "professor" ? "selected" : ""}>Professor</option>
          <option value="instituicao" ${role === "instituicao" ? "selected" : ""}>Equipe administrativa</option>
        </select>
        ${campoTurma}
        ${campoDisciplina}
        ${campoVinculo}
        ${campoContato}
        ${campoLogin}
        <button class="teacher-primary-btn" data-action="create-user" ${state.novoUsuarioSalvando ? "disabled" : ""}>${rotuloBotao}</button>
        ${state.instituicaoErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.instituicaoErro)}</p>` : ""}
        <p class="section-eyebrow" style="margin-top:8px;">${textoRodape}</p>
      </div>
      <div class="management-card">
        <h3>Contratos</h3><p>Gere um contrato de matrícula em PDF para assinatura.</p>
        <button class="teacher-primary-btn" data-action="generate-contract">Gerar contrato</button>
        <p class="section-eyebrow" style="margin-top:8px;">Esta ação ainda é simulada.</p>
      </div>
      <div class="management-card">
        <h3>Planos</h3><p>Plano atual: <strong>Profissional</strong></p>
        <div class="plan-tags"><span>Alunos ilimitados</span><span>Financeiro</span><span>Comunicados</span></div>
        <button class="teacher-primary-btn" data-action="manage-plan">Gerenciar plano</button>
        <p class="section-eyebrow" style="margin-top:8px;">Esta ação ainda é simulada.</p>
      </div>
    </div>
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

async function carregarAlunosParaVinculo(escolaId){
  state.gestaoAlunosCarregando = true;
  render();
  try {
    const q = query(collection(db, "alunos"), where("escolaId", "==", escolaId));
    const snaps = await getDocs(q);
    state.gestaoAlunosEscola = snaps.docs.map(d => ({ id: d.id, nome: d.data().nome || "", turma: d.data().turma || "" }));
  } catch(err){
    state.gestaoAlunosEscola = [];
    state.instituicaoErro = "Não foi possível carregar a lista de alunos para vincular. Tente de novo.";
  } finally {
    state.gestaoAlunosCarregando = false;
    render();
  }
}

/* Cria o login (Firebase Auth) e os documentos no Firestore para um novo
   aluno, responsável, professor ou membro da equipe administrativa.
   Usa o app secundário do Firebase para não deslogar a instituição. */
/* Cria o cadastro de um novo aluno, responsável, professor ou membro da
   equipe administrativa.
   - aluno / responsavel: só grava nas coleções (`alunos` / `responsaveis`),
     sem login — o cadastro fica pronto, e um acesso pode ser criado depois
     se algum dia for preciso.
   - professor / instituicao: além do documento, cria o login (Firebase
     Auth) usando o app secundário, pra não deslogar quem está usando a
     Gestão. */
async function criarUsuarioNaInstituicao({ role, nome, email, senha, escolaId, turma, disciplina, contato, alunosIds }){
  const precisaLogin = role === "professor" || role === "instituicao";

  if(!precisaLogin){
    if(role === "aluno"){
      const novoAlunoRef = doc(collection(db, "alunos"));
      await setDoc(novoAlunoRef, {
        nome, turma: turma || "", escolaId, contato: contato || "",
        foto: "",
        notas: [],
        presenca: { percentual: 0, faltasMes: 0, registros: [] },
        financeiro: { status: "", proxima: "", valor: "", historico: [] },
        comunicados: [],
      });
      await updateDoc(doc(db, "escolas", escolaId), {
        alunos: arrayUnion({ nome, turma: turma || "" }),
      });
      return { alunoId: novoAlunoRef.id };
    }

    if(role === "responsavel"){
      const novoResponsavelRef = doc(collection(db, "responsaveis"));
      await setDoc(novoResponsavelRef, {
        nome, escolaId, contato: contato || "",
        alunosIds: alunosIds || [],
      });
      return { responsavelId: novoResponsavelRef.id };
    }
  }

  // professor / instituicao: precisa de login de verdade
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
  const uid = cred.user.uid;

  try {
    const usuarioDoc = { role, nome };
    if(role === "professor") usuarioDoc.disciplina = disciplina || "";
    if(role === "instituicao") usuarioDoc.escolasIds = [escolaId];

    await setDoc(doc(db, "usuarios", uid), usuarioDoc);
    return { uid };
  } catch(err){
    // A gravação no Firestore falhou depois do login já ter sido criado.
    // Desfaz o login pra não deixar uma conta "fantasma" (sem cadastro)
    // presa no e-mail, o que travaria uma nova tentativa.
    try { await cred.user.delete(); } catch(_deleteErr) { /* segue mesmo se não conseguir apagar */ }
    throw err;
  } finally {
    // Encerra a sessão do app secundário em qualquer cenário (sucesso ou erro).
    try { await signOut(secondaryAuth); } catch(_signOutErr) { /* ignora */ }
  }
}

function turmasView(school){
  const cards = school.turmas.map(t => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:15.5px;font-weight:600;color:var(--ink);">${escapeHtml(t.nome)}</div>
          <div style="font-size:12.5px;color:var(--slate);margin-top:2px;">${t.alunos} alunos</div>
        </div>
        <span class="pill ${t.faltasHoje>4?'pill-red':t.faltasHoje>1?'pill-gold':'pill-green'}">
          ${t.faltasHoje} ${t.faltasHoje===1?'falta':'faltas'} hoje
        </span>
      </div>
      <div style="margin-top:14px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--slate);margin-bottom:4px;">
          <span>Frequência do mês</span><span style="font-weight:600;color:var(--ink);">${t.frequencia}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${t.frequencia}%; background:${t.frequencia<90?'#C4544A':'linear-gradient(90deg, var(--gold), var(--gold-light))'};"></div>
        </div>
      </div>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma turma cadastrada ainda.</div>`;

  const faltantes = school.faltantes.map(a => `
    <div class="row">
      <div>
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(a.nome)}</div>
        <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(a.turma)} · última falta em ${escapeHtml(a.ultima)}</div>
      </div>
      <span class="pill pill-red">${a.faltasMes} faltas</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Sem destaques de falta.</div>`;

  return `
    <h2 class="section-title">Frequência de hoje</h2>
    <p class="section-eyebrow">${escapeHtml(school.data)}</p>
    <div class="grid-cards">${cards}</div>
    <h2 class="section-title">Alunos com mais faltas</h2>
    <p class="section-eyebrow">Últimos 30 dias · acompanhamento recomendado</p>
    <div class="card flush">${faltantes}</div>`;
}

function financeiroInstituicaoView(school){
  const f = school.financeiro;
  const inad = school.inadimplentes.map(x => `
    <div class="row">
      <div>
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(x.nome)}</div>
        <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(x.aluno)} · ${escapeHtml(x.valor)}</div>
      </div>
      <span class="pill pill-red">${ICONS.clock} ${escapeHtml(x.atraso)}</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma família em atraso.</div>`;

  return `
    <h2 class="section-title">Visão geral</h2>
    <div class="grid-cards">
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Receita prevista</div>
        <div style="font-family:var(--font-display);font-size:26px;color:var(--ink);">${escapeHtml(f.previsto || "—")}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:6px;color:var(--green);font-size:12.5px;">${ICONS.trendUp} ${escapeHtml(f.variacao || "")}</div>
      </div>
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Recebido</div>
        <div style="font-family:var(--font-display);font-size:26px;color:var(--ink);">${escapeHtml(f.recebido || "—")}</div>
        <div style="font-size:12.5px;color:var(--slate);margin-top:6px;">${escapeHtml(f.recebidoPct || "")}</div>
      </div>
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Inadimplência</div>
        <div style="font-family:var(--font-display);font-size:26px;color:var(--red);">${escapeHtml(f.inadimplenciaValor || "—")}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:6px;color:var(--red);font-size:12.5px;">${ICONS.trendDown} ${escapeHtml(f.inadimplenciaPct || "")}</div>
      </div>
    </div>
    <h2 class="section-title">Famílias em atraso</h2>
    <p class="section-eyebrow">Ordenado por dias de atraso</p>
    <div class="card flush">${inad}</div>
    <div class="finance-tools">
      <div class="finance-actions"><h3>Cobranças</h3><p>Gere um boleto para uma matrícula ou envie uma segunda via.</p><button class="teacher-primary-btn" data-action="generate-boleto">Gerar boleto</button></div>
    </div>
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

function alunosView(school){
  const busca = state.alunosBusca.toLowerCase();
  const filtrados = school.alunos.filter(s => s.nome.toLowerCase().includes(busca));
  const rows = filtrados.map(s => `
    <div class="row">
      <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(s.nome)}</span>
      <span style="font-size:12.5px;color:var(--slate);">${escapeHtml(s.turma)}</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum aluno encontrado.</div>`;

  return `
    <h2 class="section-title">Alunos matriculados</h2>
    <p class="section-eyebrow">${school.alunos.length} alunos ativos em ${escapeHtml(school.nome)}</p>
    <div class="search-wrap">
      ${ICONS.search}
      <input class="search-input" id="alunos-busca" placeholder="Buscar aluno pelo nome" value="${escapeHtml(state.alunosBusca)}" />
    </div>
    <div class="card flush">${rows}</div>`;
}

/* ================================================================== */
/* Eventos — delegação, ligados uma única vez em #app                  */
/* ================================================================== */
function bindEvents(){
  app.addEventListener("submit", async (e) => {
    if(e.target && e.target.id === "login-form"){
      e.preventDefault();
      const email = document.getElementById("login-identifier").value.trim();
      const senha = document.getElementById("login-password").value;
      if(!email || !senha){
        state.loginErro = "Informe e-mail e senha.";
        render();
        return;
      }
      state.loginCarregando = true;
      state.loginErro = "";
      state.loginAviso = "";
      render();
      try {
        await signInWithEmailAndPassword(auth, email, senha);
        // onAuthStateChanged cuida do resto (carregar perfil e navegar)
      } catch(err){
        state.loginCarregando = false;
        state.loginErro = mensagemErroFirebase(err.code);
        render();
      }
    }
  });

  app.addEventListener("input", (e) => {
    const t = e.target;
    if(t.id === "alunos-busca"){
      const cursor = t.selectionStart;
      state.alunosBusca = t.value;
      render();
      const novo = document.getElementById("alunos-busca");
      if(novo){ novo.focus(); novo.setSelectionRange(cursor, cursor); }
      return;
    }
    if(t.dataset && t.dataset.observation){
      state.professorObservacoes[t.dataset.observation] = t.value;
      return;
    }
    if(t.dataset && t.dataset.grade){
      state.professorNotas[t.dataset.grade] = t.value;
      return;
    }
    if(t.id === "lesson-content"){
      state.professorConteudo = t.value;
      return;
    }
    if(t.id === "new-user-name"){ state.novoUsuarioNome = t.value; return; }
    if(t.id === "new-user-email"){ state.novoUsuarioEmail = t.value; return; }
    if(t.id === "new-user-senha"){ state.novoUsuarioSenha = t.value; return; }
    if(t.id === "new-user-turma"){ state.novoUsuarioTurma = t.value; return; }
    if(t.id === "new-user-disciplina"){ state.novoUsuarioDisciplina = t.value; return; }
    if(t.id === "new-user-contato"){ state.novoUsuarioContato = t.value; return; }
  });

  app.addEventListener("change", async (e) => {
    const t = e.target;
    if(t.id === "new-user-role"){
      state.novoUsuarioRole = t.value;
      state.instituicaoErro = "";
      if(t.value === "responsavel" && state.escolaSelecionadaId){
        await carregarAlunosParaVinculo(state.escolaSelecionadaId);
      }
      render();
    }
  });

  app.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if(!el) return;
    const action = el.dataset.action;

    switch(action){
      case "logout":
        state.mobileMenuOpen = false;
        await signOut(auth);
        break;

      case "select-escola":
        state.escolaSelecionadaId = el.dataset.escola;
        state.instTab = "turmas";
        state.screen = "instituicao";
        render();
        break;

      case "open-escola-picker":
        state.screen = "escola-picker";
        render();
        break;

      case "cancel-escola-picker":
        state.screen = "instituicao";
        render();
        break;

      case "set-aluno-tab":
        state.alunoTab = el.dataset.key; render();
        break;
      case "set-familia-tab":
        state.familiaTab = el.dataset.key; render();
        break;
      case "switch-student":
        state.familiaStudentId = el.dataset.id; render();
        break;
      case "set-inst-tab":
        state.instTab = el.dataset.key; render();
        break;
      case "set-professor-tab":
        state.professorTab = el.dataset.key; render();
        break;
      case "set-professor-class":
        state.professorTurmaId = el.dataset.id;
        state.professorRegistroSalvo = false;
        state.professorNotasSalvas = false;
        render();
        break;

      case "set-presence": {
        const turma = professorTurmaAtual();
        if(turma){
          const key = `${turma.id}-${el.dataset.student}`;
          state.professorPresencas[key] = el.dataset.status;
          render();
        }
        break;
      }

      case "save-lesson-content":
        state.professorRegistroSalvo = true; render();
        break;
      case "save-grades":
        state.professorNotasSalvas = true; render();
        break;
      case "send-notice":
        state.professorAvisoEnviado = "Recado enviado (simulado — ainda não grava no banco).";
        render();
        break;

      case "toggle-vinculo-aluno": {
        const id = el.dataset.id;
        const lista = state.novoUsuarioAlunosVinculados;
        state.novoUsuarioAlunosVinculados = lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id];
        render();
        break;
      }

      case "create-user": {
        state.instituicaoErro = "";
        state.instituicaoMensagem = "";
        const role = state.novoUsuarioRole;
        const precisaLogin = role === "professor" || role === "instituicao";
        const nome = (state.novoUsuarioNome || "").trim();
        const email = (state.novoUsuarioEmail || "").trim();
        const senha = state.novoUsuarioSenha || "";
        const escolaId = state.escolaSelecionadaId;

        if(!nome){
          state.instituicaoErro = "Preencha o nome completo.";
          render();
          break;
        }
        if(precisaLogin && (!email || !senha)){
          state.instituicaoErro = "Preencha e-mail e senha provisória.";
          render();
          break;
        }
        if(precisaLogin && senha.length < 6){
          state.instituicaoErro = "A senha provisória precisa ter pelo menos 6 caracteres.";
          render();
          break;
        }
        if(role === "responsavel" && state.novoUsuarioAlunosVinculados.length === 0){
          state.instituicaoErro = "Selecione ao menos um aluno para vincular a este responsável.";
          render();
          break;
        }

        state.novoUsuarioSalvando = true;
        render();
        try {
          await criarUsuarioNaInstituicao({
            role, nome, email, senha, escolaId,
            turma: state.novoUsuarioTurma,
            disciplina: state.novoUsuarioDisciplina,
            contato: state.novoUsuarioContato,
            alunosIds: state.novoUsuarioAlunosVinculados,
          });
          state.instituicaoMensagem = precisaLogin
            ? `Usuário "${nome}" criado com sucesso. Passe o e-mail e a senha provisória para a pessoa.`
            : `Cadastro de "${nome}" salvo com sucesso.`;
          // limpa o formulário, mantendo o papel selecionado
          state.novoUsuarioNome = "";
          state.novoUsuarioEmail = "";
          state.novoUsuarioSenha = "";
          state.novoUsuarioTurma = "";
          state.novoUsuarioDisciplina = "";
          state.novoUsuarioContato = "";
          state.novoUsuarioAlunosVinculados = [];
          if(role === "aluno" && state.data.escolas[escolaId]){
            // reflete o novo aluno na lista local sem precisar recarregar
            state.data.escolas[escolaId].alunos.push({ nome, turma: state.novoUsuarioTurma || "" });
          }
        } catch(err){
          const isAuthErr = typeof err.code === "string" && err.code.startsWith("auth/");
          if(isAuthErr){
            state.instituicaoErro = mensagemErroFirebase(err.code);
          } else if(err.code === "permission-denied"){
            state.instituicaoErro = "O Firestore recusou a gravação (permission-denied). As regras de segurança ainda não liberam escrita para a instituição — ajuste as regras e tente de novo.";
          } else {
            state.instituicaoErro = `Não foi possível criar o cadastro${err.code ? ` (${err.code})` : ""}${err.message ? `: ${err.message}` : ". Tente novamente."}`;
          }
        } finally {
          state.novoUsuarioSalvando = false;
          render();
        }
        break;
      }

      case "generate-contract":
      case "manage-plan":
      case "generate-boleto":
        state.instituicaoMensagem = "Ação simulada — a integração de escrita com o banco entra na próxima etapa.";
        render();
        break;

      case "toggle-mobile-menu":
        state.mobileMenuOpen = !state.mobileMenuOpen; render();
        break;
      case "close-mobile-menu":
        state.mobileMenuOpen = false; render();
        break;

      case "forgot-password": {
        const email = document.getElementById("login-identifier")?.value.trim();
        if(!email){
          state.loginErro = "Digite seu e-mail no campo acima e clique de novo em \"Esqueci minha senha\".";
          render();
          break;
        }
        try {
          await sendPasswordResetEmail(auth, email);
          state.loginErro = "";
          state.loginAviso = "Enviamos um e-mail com instruções para redefinir sua senha.";
        } catch(err){
          state.loginAviso = "";
          state.loginErro = mensagemErroFirebase(err.code);
        }
        render();
        break;
      }

      case "contact-secretaria":
        state.loginAviso = "";
        state.loginErro = "Fale com a secretaria da sua unidade para solicitar acesso.";
        render();
        break;
    }
  });
}

bindEvents();
render();
