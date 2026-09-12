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
     disciplinas: string[]      // idem — professor pode dar mais de uma
     escolaId: string           // só quando role == "professor" (pra listar na Gestão)
     escolasIds: string[]       // só quando role == "instituicao"

   alunos/{alunoId}
     nome, turma, foto, escolaId, contato
     notas: [{ materia, nota, bimestre }]
     presenca: { percentual, faltasMes, registros: [{data,status}] }
     financeiro: { status, proxima, valor, historico: [{mes,status,data}] }
     comunicados: [{ titulo, data, urgente }]

   responsaveis/{id}        (cadastro na Gestão; ganha login quando criado
                              com e-mail/senha — nesse caso guarda também o
                              uid, pra editar os vínculos em "usuarios" junto)
     nome, escolaId, contato, alunosIds: [alunoId], uid?: string

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

   conteudos/{conteudoId}   (banco de conteúdos do semestre, por disciplina)
     professorId, disciplina, texto
     — compartilhado entre todas as turmas do professor na mesma disciplina.

   registrosAula/{turmaId_data}   (chamada + conteúdo de uma turma num dia,
                                    um documento por turma por dia — data no
                                    formato "AAAA-MM-DD")
     turmaId, professorId, escolaId, disciplina, data
     conteudoId, conteudoTexto, observacao
     presencas: { [nomeAluno]: "presente" | "falta" | "justificada" }
     observacoesAlunos: { [nomeAluno]: string }
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
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
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
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
  spinner: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>`,
  book: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>`,
};

/* Contatos de WhatsApp da secretaria, por unidade. Ajuste os números aqui
   se eles mudarem — não precisa mexer em mais nenhum lugar do código. */
const SECRETARIA_WHATSAPP = [
  { id: "salto", nome: "Escola Salto do Lontra", numero: "469938578" },
  { id: "prata", nome: "Escola Nova Prata do Iguaçu", numero: "4699274677" },
];

function whatsappLink(numero){
  const digits = String(numero).replace(/\D/g, "");
  const comDdi = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${comDdi}`;
}

/* Manuais e materiais de apoio mostrados na página "Meu perfil" da equipe
   administrativa. Ajuste título/descrição/link aqui — não precisa mexer em
   mais nenhum lugar do código. Pode ser um PDF, um vídeo, uma página, etc. */
const MANUAIS_INSTITUICAO = [
  { titulo: "Manual da instituição", descricao: "Passo a passo de cadastro de alunos, turmas e responsáveis.", url: "#" },
  { titulo: "Como lançar frequência e notas", descricao: "Guia rápido para a equipe orientar os professores.", url: "#" },
  { titulo: "Perguntas frequentes", descricao: "Dúvidas comuns sobre financeiro, acessos e comunicados.", url: "#" },
];

/* Cursos oferecidos por unidade. Usado no cadastro de aluno (escolhe o
   curso em que ele entra) e no cadastro de professor (restringe a
   disciplina às opções que a unidade realmente oferece). Se a escola não
   bater com nenhum nome abaixo, cai no catálogo completo por segurança. */
const CURSOS_POR_ESCOLA = {
  salto: ["Inglês", "Recreação", "Robótica", "Informática"],
  prata: ["Inglês", "Informática"],
};
const TODOS_OS_CURSOS = ["Inglês", "Recreação", "Robótica", "Informática"];

function cursosDaEscola(nomeEscola){
  const nome = (nomeEscola || "").toLowerCase();
  if(nome.includes("prata")) return CURSOS_POR_ESCOLA.prata;
  if(nome.includes("salto")) return CURSOS_POR_ESCOLA.salto;
  return TODOS_OS_CURSOS;
}

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
    professorDisciplinas: [],  // pode dar mais de uma disciplina
    professorTurmas: [],       // [{ id, nome, horario, sala, escola, disciplina, alunos:[nomes] }]
    escolas: {},                // { [escolaId]: { nome, uf, data, turmas, faltantes, financeiro, inadimplentes, alunos } }
  },

  alunoTab: "notas",
  familiaTab: "notas",
  familiaStudentId: null,
  escolaSelecionadaId: null,
  instTab: "turmas",
  gestaoSubTab: "cadastro",   // cadastro | equipe | contratos — sub-abas dentro de "Gestão"
  alunosBusca: "",
  professorTab: "aulas",
  professorTurmaId: null,
  professorPresencas: {},
  professorObservacoes: {},
  professorConteudo: "",
  professorConteudosBanco: {},          // { [disciplina]: [{id, texto}] } — conteúdos do semestre, compartilhados entre turmas da mesma disciplina
  professorConteudosCarregando: false,
  professorConteudosErro: "",
  professorConteudosSalvando: false,      // cadastrando um novo conteúdo pela aba "Conteúdos"
  professorConteudosDisciplinaSelecionada: null, // disciplina escolhida na aba "Conteúdos" (independe de turma vinculada)
  professorConteudoExcluindoId: null,
  professorConteudoSelecionadoId: "",   // id do conteúdo escolhido no select da aula de hoje
  professorConteudoCadastrando: false,  // mostra o campo p/ cadastrar um conteúdo novo direto na chamada
  professorConteudoNovoTexto: "",       // texto do novo conteúdo, digitado na chamada
  professorConteudoSalvando: false,       // cadastrando um novo conteúdo direto na chamada
  professorConteudoObservacao: "",      // observação geral da aula de hoje (opcional, separada da observação por aluno)
  professorRegistroErro: "",
  professorRegistroCarregando: false,     // carregando a chamada já registrada hoje, ao trocar de turma
  professorRegistroSalvando: false,       // salvando a chamada de hoje no Firestore
  professorConteudosNovoTextoGerenciar: "", // texto do novo conteúdo digitado na aba "Conteúdos"
  professorNotas: {},
  professorAvisoEnviado: "",
  professorRegistroSalvo: false,
  professorNotasSalvas: false,
  mobileMenuOpen: false,
  secretariaModalOpen: false,
  instituicaoMensagem: "",
  instituicaoErro: "",
  novoUsuarioRole: "aluno",       // aluno | responsavel | professor | instituicao
  novoUsuarioNome: "",
  novoUsuarioEmail: "",
  novoUsuarioSenha: "",
  novoUsuarioTurma: "",
  novoUsuarioDisciplinas: [],
  novoUsuarioContato: "",
  novoUsuarioSalvando: false,
  novoUsuarioAlunosVinculados: [], // ids de alunos escolhidos (role == responsavel)
  gestaoAlunosEscola: null,        // [{id,nome,turma}] carregado sob demanda p/ vincular responsável

  // --- Gestão > Professores e responsáveis ---
  gestaoEquipeCarregando: false,
  gestaoEquipeEscolaId: null,      // escolaId da última carga, p/ recarregar ao trocar de unidade
  gestaoProfessores: null,         // [{id,nome,disciplinas}]
  gestaoResponsaveis: null,        // [{id,nome,contato,alunosIds,uid}]
  gestaoEquipeErro: "",

  // modal "Turmas do professor"
  profTurmasModalId: null,         // uid do professor aberto
  profTurmasModalNome: "",
  profTurmasModalTurmas: null,     // [{id,nome,horario,sala,disciplina,alunos:[nomes]}]
  profTurmasModalCarregando: false,
  profTurmasModalErro: "",
  profTurmasModalMensagem: "",
  profTurmaExcluindoId: null,
  novaTurmaNome: "",
  novaTurmaDisciplina: "",
  novaTurmaHorario: "",
  novaTurmaSala: "",
  novaTurmaAlunos: [],             // nomes de alunos escolhidos p/ a nova turma
  novaTurmaSalvando: false,

  // modal "Alunos vinculados ao responsável"
  respModalId: null,               // id do documento em "responsaveis"
  respModalNome: "",
  respModalAlunosIds: [],          // seleção em edição
  respModalErro: "",
  respModalMensagem: "",
  respModalSalvando: false,
  gestaoAlunosCarregando: false,
  perfilNomeInput: "",
  perfilNomeSalvando: false,
  perfilNomeErro: "",
  perfilSenhaResetEnviando: false,
  perfilSenhaResetMensagem: "",
  perfilSenhaResetErro: "",

  // aba "Alunos" da instituição — lista carregada direto da coleção `alunos`
  // (com id de verdade, ao contrário do array resumido salvo em escolas/{id}.alunos)
  instAlunos: null,               // [{id,nome,turma,contato,...}] ou null se ainda não carregou
  instAlunosEscolaId: null,        // escola a que a lista carregada pertence
  instAlunosCarregando: false,
  instAlunosErro: "",

  // ficha do aluno (modal aberto ao clicar num aluno da lista)
  alunoDetalheId: null,
  alunoDetalheContatoInput: "",
  alunoDetalheSalvandoContato: false,
  alunoDetalheMensagem: "",
  alunoDetalheErro: "",
  alunoExcluirConfirmando: false,
  alunoExcluindo: false,

  // responsáveis vinculados ao aluno aberto na ficha + form de novo responsável
  alunoRespVinculados: null,
  alunoRespCarregando: false,
  alunoRespNome: "",
  alunoRespContato: "",
  alunoRespSalvando: false,
  alunoRespErro: "",
  alunoRespMensagem: "",
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
    state.data.professorDisciplinas = Array.isArray(perfil.disciplinas)
      ? perfil.disciplinas
      : (perfil.disciplina ? [perfil.disciplina] : []);
    const q = query(collection(db, "turmas"), where("professorId", "==", state.authUser.uid));
    const snaps = await getDocs(q);
    state.data.professorTurmas = snaps.docs.map(d => ({ id: d.id, ...d.data(), alunos: d.data().alunos || [] }));
    state.professorTab = "aulas";
    state.professorTurmaId = null;
    state.screen = "professor";
    carregarConteudosDoProfessor(state.authUser.uid);
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
    contato: dados.contato || "",
    escolaId: dados.escolaId || "",
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

function renderSecretariaModal(){
  if(!state.secretariaModalOpen) return "";
  const cards = SECRETARIA_WHATSAPP.map(escola => `
    <button type="button" class="secretaria-option" data-action="whatsapp-secretaria" data-escola="${escola.id}">
      <span class="secretaria-option-icon">${ICONS.pin}</span>
      <span>
        <span class="secretaria-option-name">${escapeHtml(escola.nome)}</span>
        <span class="secretaria-option-desc">Abrir WhatsApp da secretaria</span>
      </span>
      ${ICONS.chevronRight}
    </button>`).join("");

  return `
  <div class="secretaria-modal-backdrop" data-action="close-secretaria-modal">
    <div class="secretaria-modal" role="dialog" aria-modal="true" aria-label="Falar com a secretaria" data-action="noop">
      <div class="secretaria-modal-head">
        <h2>Falar com a secretaria</h2>
        <button type="button" class="secretaria-modal-close" data-action="close-secretaria-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>
      <p class="secretaria-modal-desc">Em qual unidade você (ou seu filho) está matriculado?</p>
      <div class="secretaria-options">${cards}</div>
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
    ${renderSecretariaModal()}
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
    { key:"conteudos", label:"Conteúdos", icon:"book" },
    { key:"avaliacoes", label:"Notas & atividades", icon:"cap" },
    { key:"recados", label:"Recados", icon:"megaphone" },
  ];
  const body = state.professorTab === "aulas" ? professorAulasView()
    : state.professorTab === "conteudos" ? professorConteudosView()
    : state.professorTab === "avaliacoes" ? professorAvaliacoesView()
    : professorRecadosView();

  return shell({
    navItems, active: state.professorTab,
    headerSub: `PROFESSOR${state.data.professorDisciplinas.length ? " · " + state.data.professorDisciplinas.join(" · ").toUpperCase() : ""}`,
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

  const disciplina = turma.disciplina;
  const conteudosDaDisciplina = state.professorConteudosBanco[disciplina] || [];
  const opcoesConteudo = conteudosDaDisciplina.map(c => `<option value="${escapeHtml(c.id)}" ${state.professorConteudoSelecionadoId === c.id ? "selected" : ""}>${escapeHtml(c.texto)}</option>`).join("");
  const conteudoSelectHtml = `
        <select id="lesson-content-select" class="teacher-text-input" ${state.professorRegistroCarregando ? "disabled" : ""}>
          <option value="" ${!state.professorConteudoSelecionadoId && !state.professorConteudoCadastrando ? "selected" : ""} disabled>Selecione o conteúdo trabalhado</option>
          ${opcoesConteudo}
          <option value="__novo__" ${state.professorConteudoCadastrando ? "selected" : ""}>+ Cadastrar novo conteúdo</option>
        </select>`;
  const cadastroInlineHtml = state.professorConteudoCadastrando ? `
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <input id="novo-conteudo-chamada" class="teacher-text-input" style="flex:1;min-width:200px;" placeholder="Digite o novo conteúdo" value="${escapeHtml(state.professorConteudoNovoTexto || "")}" ${state.professorConteudoSalvando ? "disabled" : ""} />
          <button type="button" class="teacher-primary-btn" data-action="cadastrar-conteudo-na-chamada" data-disciplina="${escapeHtml(disciplina)}" ${state.professorConteudoSalvando ? "disabled" : ""}>${state.professorConteudoSalvando ? "Adicionando…" : "Adicionar e usar hoje"}</button>
        </div>
        <p class="section-eyebrow" style="margin:4px 0 0;">Esse conteúdo também fica salvo no banco de ${escapeHtml(disciplina)}, na aba "Conteúdos".</p>` : "";

  const rotuloRegistrar = state.professorRegistroSalvando ? "Salvando…" : (state.professorRegistroSalvo ? "Conteúdo registrado" : "Registrar conteúdo");
  const carregandoAviso = state.professorRegistroCarregando ? `<p class="section-eyebrow" style="margin-top:10px;">Carregando a chamada de hoje…</p>` : "";

  return `
    <h2 class="section-title">Aulas de hoje</h2>
    <p class="section-eyebrow">Selecione uma turma para fazer a chamada e registrar a aula.</p>
    ${professorTurmaSelect()}
    <div class="teacher-panel">
      <div class="teacher-panel-head"><div><h2>${escapeHtml(turma.nome)} · ${escapeHtml(turma.disciplina)}</h2><p>${escapeHtml(turma.escola)} · ${escapeHtml(turma.horario)} · ${escapeHtml(turma.sala)}</p></div><span class="pill pill-green">${present}/${turma.alunos.length} presentes</span></div>
      <h3>Chamada</h3>
      <div class="attendance-list">${rows}</div>
      <div class="lesson-content">
        <label for="lesson-content-select">Conteúdo trabalhado</label>
        ${conteudoSelectHtml}
        ${cadastroInlineHtml}
        <label for="lesson-observacao" style="margin-top:14px;">Observação da aula (opcional)</label>
        <textarea id="lesson-observacao" placeholder="Ex.: Turma dividida em grupos, retomar o exercício 4 na próxima aula." ${state.professorRegistroCarregando ? "disabled" : ""}>${escapeHtml(state.professorConteudoObservacao)}</textarea>
        ${state.professorRegistroErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.professorRegistroErro)}</p>` : ""}
        <button class="teacher-primary-btn" data-action="save-lesson-content" ${(state.professorRegistroSalvando || state.professorRegistroCarregando) ? "disabled" : ""}>${rotuloRegistrar}</button>
      </div>
      ${carregandoAviso}
    </div>`;
}

function professorConteudosView(){
  const disciplinas = state.data.professorDisciplinas || [];
  if(disciplinas.length === 0){
    return `
      <h2 class="section-title">Conteúdos do semestre</h2>
      <p class="section-eyebrow">Você ainda não tem nenhuma disciplina cadastrada no seu perfil. Fale com a secretaria para vincular sua(s) disciplina(s) antes de cadastrar conteúdos.</p>`;
  }
  const disciplina = (state.professorConteudosDisciplinaSelecionada && disciplinas.includes(state.professorConteudosDisciplinaSelecionada))
    ? state.professorConteudosDisciplinaSelecionada
    : disciplinas[0];

  const cabecalhoDisciplina = disciplinas.length > 1 ? `
    <select id="conteudo-disciplina-select" class="teacher-text-input" style="margin-bottom:16px;">
      ${disciplinas.map(d => `<option value="${escapeHtml(d)}" ${d === disciplina ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}
    </select>` : `<p class="section-eyebrow" style="margin:2px 0 14px;">Disciplina: <strong style="color:var(--ink);">${escapeHtml(disciplina)}</strong></p>`;

  const lista = state.professorConteudosBanco[disciplina] || [];
  const itens = state.professorConteudosCarregando
    ? `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando conteúdos…</div>`
    : lista.map(c => `
    <div class="row">
      <div style="font-size:14.5px;color:var(--ink);">${escapeHtml(c.texto)}</div>
      <button type="button" class="attendance-btn" data-action="excluir-conteudo-banco" data-disciplina="${escapeHtml(disciplina)}" data-id="${escapeHtml(c.id)}" aria-label="Excluir conteúdo" ${state.professorConteudoExcluindoId === c.id ? "disabled" : ""}>${state.professorConteudoExcluindoId === c.id ? "…" : ICONS.trash}</button>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum conteúdo cadastrado ainda para ${escapeHtml(disciplina)}.</div>`;

  return `
    <h2 class="section-title">Conteúdos do semestre</h2>
    <p class="section-eyebrow">Cadastre aqui os conteúdos de cada disciplina — eles aparecem na hora da chamada, mesmo antes de você ter turmas vinculadas.</p>
    ${cabecalhoDisciplina}
    <div class="teacher-panel">
      <h3>Adicionar conteúdo</h3>
      <input id="novo-conteudo-banco" class="teacher-text-input" placeholder="Ex.: Frações equivalentes" value="${escapeHtml(state.professorConteudosNovoTextoGerenciar || "")}" ${state.professorConteudosSalvando ? "disabled" : ""} />
      <button class="teacher-primary-btn" style="margin-top:8px;" data-action="adicionar-conteudo-banco" data-disciplina="${escapeHtml(disciplina)}" ${state.professorConteudosSalvando ? "disabled" : ""}>${state.professorConteudosSalvando ? "Adicionando…" : "Adicionar à lista"}</button>
      ${state.professorConteudosErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.professorConteudosErro)}</p>` : ""}

      <h3 style="margin-top:22px;">Conteúdos cadastrados (${lista.length})</h3>
      <div class="card flush">${itens}</div>
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
function nomeEquipePendenteBanner(){
  return `
    <div class="profile-name-banner">
      <div class="profile-name-banner-text">
        <strong>Complete seu cadastro</strong>
        <p>Ainda não temos o seu nome salvo. Adicione para vermos você por aqui em vez de "Equipe".</p>
      </div>
      <div class="profile-name-form">
        <input id="profile-name-input" class="teacher-text-input" placeholder="Seu nome completo" value="${escapeHtml(state.perfilNomeInput || "")}" />
        <button class="teacher-primary-btn" data-action="save-profile-name" ${state.perfilNomeSalvando ? "disabled" : ""}>${state.perfilNomeSalvando ? "Salvando…" : "Salvar nome"}</button>
      </div>
      ${state.perfilNomeErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.perfilNomeErro)}</p>` : ""}
    </div>`;
}

function renderInstituicao(){
  const school = state.data.escolas[state.escolaSelecionadaId];
  const navItems = [
    { key:"turmas", label:"Turmas & faltas", icon:"clipboard" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"alunos", label:"Alunos", icon:"users" },
    { key:"gestao", label:"Gestão", icon:"building" },
    { key:"perfil", label:"Meu perfil", icon:"user" },
  ];

  let body = "";
  if(state.instTab === "turmas") body = turmasView(school);
  else if(state.instTab === "financeiro") body = financeiroInstituicaoView(school);
  else if(state.instTab === "alunos") body = alunosView(school);
  else if(state.instTab === "gestao") body = gestaoInstituicaoView(school);
  else if(state.instTab === "perfil") body = perfilInstituicaoView(school);

  const temMaisDeUmaEscola = Object.keys(state.data.escolas).length > 1;
  const nomePessoaLogada = (state.perfil?.nome || "").trim();
  // A própria aba "Meu perfil" já tem o campo de nome — evita duplicar o
  // aviso/input ali em cima quando a pessoa já está na aba certa pra isso.
  const avisoNomePendente = (!nomePessoaLogada && state.instTab !== "perfil") ? nomeEquipePendenteBanner() : "";

  return shell({
    navItems, active: state.instTab,
    headerSub: "ÁREA DA INSTITUIÇÃO", headerTitle: greeting(nomePessoaLogada || "Equipe"),
    bodyHtml: avisoNomePendente + body,
    navAction: "set-inst-tab",
    schoolBadge: `${ICONS.pinSmall} ${escapeHtml(school.nome)} — ${escapeHtml(school.uf)}`,
    schoolBadgeClickable: temMaisDeUmaEscola,
  }) + alunoDetalheModal() + professorTurmasModal() + responsavelVinculoModal();
}

function gestaoInstituicaoView(school){
  const subTabs = [
    { key: "cadastro", label: "Criar cadastro", icon: ICONS.user },
    { key: "equipe", label: "Professores e responsáveis", icon: ICONS.users2 },
    { key: "contratos", label: "Contratos & plano", icon: ICONS.wallet },
  ];
  const subNav = `<div class="subtab-bar">${subTabs.map(t => `
    <button type="button" class="subtab-btn ${state.gestaoSubTab === t.key ? "active" : ""}" data-action="set-gestao-subtab" data-key="${t.key}">
      ${t.icon}<span>${t.label}</span>
    </button>`).join("")}</div>`;

  let corpo;
  if(state.gestaoSubTab === "equipe") corpo = professoresResponsaveisSection();
  else if(state.gestaoSubTab === "contratos") corpo = gestaoContratosPlanoView();
  else corpo = gestaoCadastroView(school);

  return `
    <h2 class="section-title">Gestão da unidade</h2>
    <p class="section-eyebrow">Cadastros, turmas, contratos e plano de ${escapeHtml(school.nome)}.</p>
    ${subNav}
    ${corpo}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Sub-aba "Criar cadastro": formulário único de matrícula/login de
   aluno, responsável, professor e equipe administrativa. */
function gestaoCadastroView(school){
  const role = state.novoUsuarioRole;
  const precisaLogin = role === "professor" || role === "instituicao" || role === "aluno" || role === "responsavel";

  const cursosDisponiveis = cursosDaEscola(school.nome);

  const campoTurma = role === "aluno" ? `
        <label class="teacher-label" for="new-user-turma" style="margin-top:2px;">Curso</label>
        <select id="new-user-turma" class="teacher-text-input">
          <option value="" ${!state.novoUsuarioTurma ? "selected" : ""} disabled>Selecione o curso</option>
          ${cursosDisponiveis.map(curso => `<option value="${escapeHtml(curso)}" ${state.novoUsuarioTurma === curso ? "selected" : ""}>${escapeHtml(curso)}</option>`).join("")}
        </select>` : "";

  const campoDisciplina = role === "professor" ? `
        <div class="responsavel-vinculo-list" style="margin-top:8px;">
          <p class="section-eyebrow" style="margin:6px 0 4px;">Disciplinas que dá aula (pode marcar mais de uma)</p>
          ${cursosDisponiveis.map(curso => `
            <label class="responsavel-vinculo-item">
              <input type="checkbox" data-action="toggle-disciplina-professor" data-curso="${escapeHtml(curso)}" ${state.novoUsuarioDisciplinas.includes(curso) ? "checked" : ""} />
              <span>${escapeHtml(curso)}</span>
            </label>`).join("")}
        </div>` : "";

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
    : `Esse cadastro fica só nas coleções do banco, sem login.`;

  return `
    <div class="management-card management-card-wide">
      <h3>Criar cadastro</h3><p>Aluno, responsável, professor e equipe ganham login (e-mail/senha) para entrar no app.</p>
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
    </div>`;
}

/* Sub-aba "Contratos & plano": ações administrativas ainda simuladas,
   isoladas do formulário de cadastro pra não poluir a tela principal. */
function gestaoContratosPlanoView(){
  return `
    <div class="management-grid">
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
    </div>`;
}

/* Seção "Professores e responsáveis" dentro da aba Gestão: lista quem já
   está cadastrado na unidade e permite abrir um modal por pessoa —
   turmas (professor) ou alunos vinculados (responsável). */
function professoresResponsaveisSection(){
  let corpo;
  if(state.gestaoEquipeCarregando){
    corpo = `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando professores e responsáveis…</div>`;
  } else if(state.gestaoEquipeErro){
    corpo = `<div style="padding:20px;font-size:14px;color:var(--red,#C4544A);">${escapeHtml(state.gestaoEquipeErro)}</div>`;
  } else {
    const professores = state.gestaoProfessores || [];
    const responsaveis = state.gestaoResponsaveis || [];

    const linhasProfessores = professores.map(p => `
      <button type="button" class="row aluno-row" data-action="abrir-professor-turmas" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}">
        <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(p.nome)}</span>
        <span style="font-size:12.5px;color:var(--slate);display:flex;align-items:center;gap:8px;">
          ${escapeHtml(p.disciplinas.join(", ") || "Sem disciplina definida")} ${ICONS.chevronRight}
        </span>
      </button>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum professor cadastrado nesta unidade ainda.</div>`;

    const linhasResponsaveis = responsaveis.map(r => `
      <button type="button" class="row aluno-row" data-action="abrir-responsavel-vinculos" data-id="${escapeHtml(r.id)}" data-nome="${escapeHtml(r.nome)}">
        <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(r.nome)}</span>
        <span style="font-size:12.5px;color:var(--slate);display:flex;align-items:center;gap:8px;">
          ${r.alunosIds.length} ${r.alunosIds.length === 1 ? "aluno vinculado" : "alunos vinculados"} ${ICONS.chevronRight}
        </span>
      </button>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum responsável cadastrado nesta unidade ainda.</div>`;

    corpo = `
      <div class="management-card management-card-wide">
        <h3>Professores</h3><p>Toque num professor pra ver as turmas dele ou criar uma nova.</p>
        <div class="card flush">${linhasProfessores}</div>
      </div>
      <div class="management-card management-card-wide">
        <h3>Responsáveis</h3><p>Toque num responsável pra ajustar os alunos vinculados.</p>
        <div class="card flush">${linhasResponsaveis}</div>
      </div>`;
  }

  return corpo;
}

/* Modal "Turmas de {professor}" — lista as turmas já criadas para o
   professor (coleção "turmas") e um formulário pra criar uma nova,
   escolhendo disciplina (dentre as do próprio professor) e os alunos
   da unidade que vão fazer parte dela. */
function professorTurmasModal(){
  if(!state.profTurmasModalId) return "";
  const professor = (state.gestaoProfessores || []).find(p => p.id === state.profTurmasModalId);
  const disciplinasProfessor = professor ? professor.disciplinas : [];

  let listaTurmasHtml;
  if(state.profTurmasModalCarregando){
    listaTurmasHtml = `<p class="section-eyebrow" style="margin:6px 0;">Carregando turmas…</p>`;
  } else if(!state.profTurmasModalTurmas || state.profTurmasModalTurmas.length === 0){
    listaTurmasHtml = `<p class="section-eyebrow" style="margin:6px 0;">Nenhuma turma vinculada a este professor ainda.</p>`;
  } else {
    listaTurmasHtml = `<div class="aluno-modal-resp-list">${state.profTurmasModalTurmas.map(t => `
      <div class="aluno-modal-resp-item" style="align-items:flex-start;">
        <span>
          <span style="font-weight:600;color:var(--ink);font-size:13.5px;display:block;">${escapeHtml(t.nome)}</span>
          <span style="color:var(--slate);font-size:12px;">${escapeHtml(t.disciplina || "")}${t.horario ? ` · ${escapeHtml(t.horario)}` : ""}${t.sala ? ` · ${escapeHtml(t.sala)}` : ""} · ${(t.alunos || []).length} aluno(s)</span>
        </span>
        <button type="button" class="attendance-btn" data-action="excluir-turma-professor" data-id="${escapeHtml(t.id)}" aria-label="Excluir turma" ${state.profTurmaExcluindoId === t.id ? "disabled" : ""}>${state.profTurmaExcluindoId === t.id ? "…" : ICONS.trash}</button>
      </div>`).join("")}</div>`;
  }

  const alunosEscola = state.gestaoAlunosEscola || [];
  const checklistAlunosHtml = state.gestaoAlunosCarregando
    ? `<p class="section-eyebrow" style="margin:6px 0;">Carregando lista de alunos…</p>`
    : alunosEscola.length === 0
      ? `<p class="section-eyebrow" style="margin:6px 0;">Nenhum aluno cadastrado nesta unidade ainda.</p>`
      : `<div class="responsavel-vinculo-list">${alunosEscola.map(a => `
          <label class="responsavel-vinculo-item">
            <input type="checkbox" data-action="toggle-turma-aluno" data-nome="${escapeHtml(a.nome)}" ${state.novaTurmaAlunos.includes(a.nome) ? "checked" : ""} />
            <span>${escapeHtml(a.nome)}${a.turma ? ` · ${escapeHtml(a.turma)}` : ""}</span>
          </label>`).join("")}</div>`;

  const opcoesDisciplina = disciplinasProfessor.length
    ? disciplinasProfessor.map(d => `<option value="${escapeHtml(d)}" ${state.novaTurmaDisciplina === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")
    : `<option value="" disabled selected>Este professor não tem disciplinas cadastradas</option>`;

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-professor-turmas-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Turmas do professor" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>${escapeHtml(state.profTurmasModalNome)}</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(disciplinasProfessor.join(", ") || "Sem disciplina definida")}</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-professor-turmas-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Turmas já criadas</h3>
        ${listaTurmasHtml}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Nova turma</h3>
        <input id="nova-turma-nome" class="teacher-text-input" placeholder="Nome da turma (ex.: Robótica — Turma A)" value="${escapeHtml(state.novaTurmaNome)}" />
        <select id="nova-turma-disciplina" class="teacher-text-input" style="margin-top:8px;" ${disciplinasProfessor.length === 0 ? "disabled" : ""}>
          <option value="" ${!state.novaTurmaDisciplina ? "selected" : ""} disabled>Selecione a disciplina</option>
          ${opcoesDisciplina}
        </select>
        <input id="nova-turma-horario" class="teacher-text-input" style="margin-top:8px;" placeholder="Horário (ex.: Seg e Qua, 14h)" value="${escapeHtml(state.novaTurmaHorario)}" />
        <input id="nova-turma-sala" class="teacher-text-input" style="margin-top:8px;" placeholder="Sala (opcional)" value="${escapeHtml(state.novaTurmaSala)}" />
        <div style="margin-top:8px;">
          <p class="section-eyebrow" style="margin:6px 0 4px;">Alunos desta turma</p>
          ${checklistAlunosHtml}
        </div>
        <button type="button" class="teacher-primary-btn" style="margin-top:10px;" data-action="criar-turma-professor" ${state.novaTurmaSalvando ? "disabled" : ""}>${state.novaTurmaSalvando ? "Salvando…" : "Criar turma"}</button>
        ${state.profTurmasModalErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.profTurmasModalErro)}</p>` : ""}
        ${state.profTurmasModalMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.profTurmasModalMensagem)}</p>` : ""}
      </div>
    </div>
  </div>`;
}

/* Modal "Alunos vinculados a {responsável}" — checklist com todos os
   alunos da unidade, marca os já vinculados e salva a lista nova de uma
   vez (em "responsaveis" e, se o responsável já tiver login, também em
   "usuarios/{uid}" pra refletir no dashboard dele). */
function responsavelVinculoModal(){
  if(!state.respModalId) return "";
  const alunosEscola = state.gestaoAlunosEscola || [];

  const checklistHtml = state.gestaoAlunosCarregando
    ? `<p class="section-eyebrow" style="margin:6px 0;">Carregando lista de alunos…</p>`
    : alunosEscola.length === 0
      ? `<p class="section-eyebrow" style="margin:6px 0;">Nenhum aluno cadastrado nesta unidade ainda.</p>`
      : `<div class="responsavel-vinculo-list">${alunosEscola.map(a => `
          <label class="responsavel-vinculo-item">
            <input type="checkbox" data-action="toggle-resp-vinculo-aluno" data-id="${escapeHtml(a.id)}" ${state.respModalAlunosIds.includes(a.id) ? "checked" : ""} />
            <span>${escapeHtml(a.nome)}${a.turma ? ` · ${escapeHtml(a.turma)}` : ""}</span>
          </label>`).join("")}</div>`;

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-responsavel-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Alunos vinculados ao responsável" data-action="noop">
      <div class="aluno-modal-head">
        <div><h2>${escapeHtml(state.respModalNome)}</h2></div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-responsavel-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Alunos vinculados</h3>
        ${checklistHtml}
        <button type="button" class="teacher-primary-btn" style="margin-top:10px;" data-action="salvar-resp-vinculos" ${state.respModalSalvando ? "disabled" : ""}>${state.respModalSalvando ? "Salvando…" : "Salvar vínculos"}</button>
        ${state.respModalErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.respModalErro)}</p>` : ""}
        ${state.respModalMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.respModalMensagem)}</p>` : ""}
      </div>
    </div>
  </div>`;
}

/* Aba "Meu perfil" da equipe administrativa: dados da conta (nome, e-mail,
   escola vinculada), troca de senha e manuais/materiais de apoio. */
function perfilInstituicaoView(school){
  const nome = (state.perfil?.nome || "").trim();
  const email = state.authUser?.email || "—";

  const escolasVinculadas = Object.values(state.data.escolas || {}).map(e => e.nome).filter(Boolean);
  const escolasTexto = escolasVinculadas.length ? escolasVinculadas.join(", ") : escapeHtml(school?.nome || "—");

  const manuais = MANUAIS_INSTITUICAO.map(m => `
    <a class="manual-item" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
      <span class="manual-item-icon">${ICONS.clipboard}</span>
      <span class="manual-item-text">
        <span class="manual-item-title">${escapeHtml(m.titulo)}</span>
        <span class="manual-item-desc">${escapeHtml(m.descricao)}</span>
      </span>
      ${ICONS.chevronRight}
    </a>`).join("");

  return `
    <h2 class="section-title">Meu perfil</h2>
    <p class="section-eyebrow">Seus dados de acesso e materiais de apoio da equipe.</p>

    <div class="management-grid">
      <div class="management-card">
        <h3>Meus dados</h3>
        <p>Como seu nome aparece pro resto da equipe e da escola.</p>
        <input id="profile-name-input" class="teacher-text-input" placeholder="Seu nome completo" value="${escapeHtml(state.perfilNomeInput || "")}" />
        ${nome ? `<p class="section-eyebrow" style="margin:8px 0 0;">Nome atual: <strong style="color:var(--ink);">${escapeHtml(nome)}</strong></p>` : ""}
        <button class="teacher-primary-btn" data-action="save-profile-name" ${state.perfilNomeSalvando ? "disabled" : ""}>${state.perfilNomeSalvando ? "Salvando…" : (nome ? "Atualizar nome" : "Salvar nome")}</button>
        ${state.perfilNomeErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.perfilNomeErro)}</p>` : ""}
        <p class="section-eyebrow" style="margin-top:12px;">E-mail de acesso: <strong style="color:var(--ink);">${escapeHtml(email)}</strong></p>
        <p class="section-eyebrow" style="margin-top:2px;">Unidade(s) vinculada(s): <strong style="color:var(--ink);">${escolasTexto}</strong></p>
      </div>

      <div class="management-card">
        <h3>Segurança</h3>
        <p>Enviamos um e-mail com um link para você trocar sua senha.</p>
        <button class="teacher-primary-btn" data-action="reset-senha-perfil" ${state.perfilSenhaResetEnviando ? "disabled" : ""}>${state.perfilSenhaResetEnviando ? "Enviando…" : "Trocar minha senha"}</button>
        ${state.perfilSenhaResetErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.perfilSenhaResetErro)}</p>` : ""}
        ${state.perfilSenhaResetMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.perfilSenhaResetMensagem)}</p>` : ""}
      </div>

      <div class="management-card">
        <h3>Precisa de ajuda?</h3>
        <p>Fale direto com a secretaria da unidade por WhatsApp.</p>
        <button class="teacher-primary-btn" data-action="contact-secretaria">Falar com a secretaria</button>
      </div>
    </div>

    <h2 class="section-title" style="margin-top:28px;">Manuais e materiais de apoio</h2>
    <p class="section-eyebrow">Guias rápidos para o dia a dia da equipe.</p>
    <div class="card flush manual-list">${manuais}</div>`;
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

/* Carrega professores e responsáveis da unidade selecionada, pra aba
   Gestão > "Professores e responsáveis". Também garante que a lista de
   alunos da unidade (gestaoAlunosEscola) esteja disponível, já que os
   dois modais (turmas do professor / vínculos do responsável) precisam
   dela para montar os checklists. */
async function carregarEquipeDaEscola(escolaId){
  state.gestaoEquipeCarregando = true;
  state.gestaoEquipeErro = "";
  render();
  try {
    const qProf = query(collection(db, "usuarios"), where("role", "==", "professor"), where("escolaId", "==", escolaId));
    const qResp = query(collection(db, "responsaveis"), where("escolaId", "==", escolaId));
    const tarefas = [getDocs(qProf), getDocs(qResp)];
    if(!state.gestaoAlunosEscola) tarefas.push(carregarAlunosParaVinculo(escolaId));
    const [profSnaps, respSnaps] = await Promise.all(tarefas);
    state.gestaoProfessores = profSnaps.docs.map(d => ({
      id: d.id,
      nome: d.data().nome || "Professor(a)",
      disciplinas: Array.isArray(d.data().disciplinas) ? d.data().disciplinas : [],
    }));
    state.gestaoResponsaveis = respSnaps.docs.map(d => ({
      id: d.id,
      nome: d.data().nome || "Responsável",
      contato: d.data().contato || "",
      alunosIds: Array.isArray(d.data().alunosIds) ? d.data().alunosIds : [],
      uid: d.data().uid || null,
    }));
    state.gestaoEquipeEscolaId = escolaId;
  } catch(err){
    state.gestaoProfessores = [];
    state.gestaoResponsaveis = [];
    state.gestaoEquipeErro = "Não foi possível carregar professores e responsáveis agora. Tente de novo.";
  } finally {
    state.gestaoEquipeCarregando = false;
    render();
  }
}

/* Carrega as turmas (coleção "turmas") já vinculadas a um professor
   específico — usado ao abrir o modal "Turmas de {professor}". */
async function carregarTurmasDoProfessorGestao(professorId){
  state.profTurmasModalCarregando = true;
  state.profTurmasModalErro = "";
  render();
  try {
    const q = query(collection(db, "turmas"), where("professorId", "==", professorId));
    const snaps = await getDocs(q);
    state.profTurmasModalTurmas = snaps.docs.map(d => ({ id: d.id, ...d.data(), alunos: d.data().alunos || [] }));
  } catch(err){
    state.profTurmasModalTurmas = [];
    state.profTurmasModalErro = "Não foi possível carregar as turmas deste professor agora. Tente de novo.";
  } finally {
    state.profTurmasModalCarregando = false;
    render();
  }
}

/* Carrega os alunos de uma escola direto da coleção `alunos` (com o id de
   verdade do documento), usado pela aba "Alunos" da instituição. O array
   escolas/{id}.alunos guarda só um resumo (nome+turma) sem id, então não dá
   pra abrir/editar/excluir a partir dele — por isso a lista real é buscada
   aqui, do mesmo jeito que carregarAlunosParaVinculo já faz. */
async function carregarAlunosDaInstituicao(escolaId){
  state.instAlunosCarregando = true;
  state.instAlunosErro = "";
  render();
  try {
    const q = query(collection(db, "alunos"), where("escolaId", "==", escolaId));
    const snaps = await getDocs(q);
    state.instAlunos = snaps.docs.map(d => normalizeAluno(d.id, d.data()));
    state.instAlunosEscolaId = escolaId;
  } catch(err){
    state.instAlunos = [];
    state.instAlunosErro = "Não foi possível carregar a lista de alunos. Tente de novo.";
  } finally {
    state.instAlunosCarregando = false;
    render();
  }
}

/* Data de hoje no formato "AAAA-MM-DD", usada como parte do id do
   documento em `registrosAula` (um por turma por dia). */
function dataDeHojeISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/* Carrega, na coleção `conteudos`, todos os conteúdos já cadastrados pelo
   professor logado, agrupados por disciplina — usado no select da chamada
   e na aba "Conteúdos". */
async function carregarConteudosDoProfessor(professorId){
  state.professorConteudosCarregando = true;
  state.professorConteudosErro = "";
  render();
  try {
    const q = query(collection(db, "conteudos"), where("professorId", "==", professorId));
    const snaps = await getDocs(q);
    const banco = {};
    snaps.docs.forEach(d => {
      const dados = d.data();
      const disciplina = dados.disciplina || "";
      if(!banco[disciplina]) banco[disciplina] = [];
      banco[disciplina].push({ id: d.id, texto: dados.texto || "" });
    });
    state.professorConteudosBanco = banco;
  } catch(err){
    state.professorConteudosErro = "Não foi possível carregar os conteúdos cadastrados. Tente recarregar a página.";
  } finally {
    state.professorConteudosCarregando = false;
    render();
  }
}

/* Cria um conteúdo novo na coleção `conteudos` (banco do semestre da
   disciplina) e já reflete no estado local. Usado tanto pela aba
   "Conteúdos" quanto pelo cadastro rápido direto na chamada. */
async function criarConteudoNoBanco(disciplina, texto){
  const novoRef = doc(collection(db, "conteudos"));
  await setDoc(novoRef, {
    professorId: state.authUser.uid,
    disciplina,
    texto,
  });
  if(!state.professorConteudosBanco[disciplina]) state.professorConteudosBanco[disciplina] = [];
  state.professorConteudosBanco[disciplina].push({ id: novoRef.id, texto });
  return novoRef.id;
}

/* Busca em `registrosAula` a chamada de hoje para a turma escolhida —
   se já existir, preenche presença/observações/conteúdo do dia; se não
   existir ainda, deixa tudo em branco pra uma chamada nova. */
async function carregarRegistroDoDia(turma){
  state.professorRegistroCarregando = true;
  state.professorRegistroErro = "";
  render();
  const data = dataDeHojeISO();
  try {
    const snap = await getDoc(doc(db, "registrosAula", `${turma.id}_${data}`));

    state.professorPresencas = {};
    state.professorObservacoes = {};
    turma.alunos.forEach(aluno => { state.professorObservacoes[`${turma.id}-${aluno}`] = ""; });
    state.professorConteudoSelecionadoId = "";
    state.professorConteudoObservacao = "";
    state.professorConteudoCadastrando = false;
    state.professorConteudoNovoTexto = "";
    state.professorRegistroSalvo = false;

    if(snap.exists()){
      const dados = snap.data();
      const presencas = dados.presencas || {};
      const observacoesAlunos = dados.observacoesAlunos || {};
      Object.keys(presencas).forEach(aluno => { state.professorPresencas[`${turma.id}-${aluno}`] = presencas[aluno]; });
      Object.keys(observacoesAlunos).forEach(aluno => { state.professorObservacoes[`${turma.id}-${aluno}`] = observacoesAlunos[aluno]; });
      state.professorConteudoSelecionadoId = dados.conteudoId || "";
      state.professorConteudoObservacao = dados.observacao || "";
      state.professorRegistroSalvo = true;
    }
  } catch(err){
    state.professorRegistroErro = "Não foi possível carregar a chamada de hoje para esta turma. Tente selecioná-la de novo.";
  } finally {
    state.professorRegistroCarregando = false;
    render();
  }
}


async function carregarResponsaveisDoAluno(alunoId){
  state.alunoRespCarregando = true;
  render();
  try {
    const q = query(
      collection(db, "responsaveis"),
      where("escolaId", "==", state.escolaSelecionadaId),
      where("alunosIds", "array-contains", alunoId),
    );
    const snaps = await getDocs(q);
    state.alunoRespVinculados = snaps.docs.map(d => ({
      id: d.id, nome: d.data().nome || "", contato: d.data().contato || "",
    }));
  } catch(err){
    state.alunoRespVinculados = [];
  } finally {
    state.alunoRespCarregando = false;
    render();
  }
}

/* Exclui o cadastro do aluno (coleção `alunos`) e tenta manter o resumo
   guardado em escolas/{id}.alunos em sincronia. Se a instituição criou o
   aluno com login (Firebase Auth), esse login não é apagado por aqui —
   a exclusão de contas de autenticação exige privilégio de admin, então
   fica registrado só o cadastro; se for preciso, revogue o acesso à parte. */
async function excluirAlunoDaInstituicao(aluno, escolaId){
  state.alunoExcluindo = true;
  state.alunoDetalheErro = "";
  render();
  try {
    await deleteDoc(doc(db, "alunos", aluno.id));
    try {
      await updateDoc(doc(db, "escolas", escolaId), {
        alunos: arrayRemove({ nome: aluno.nome, turma: aluno.turma }),
      });
    } catch(_syncErr) {
      // Não bloqueia a exclusão principal se só esse resumo falhar em atualizar.
    }
    state.instAlunos = (state.instAlunos || []).filter(a => a.id !== aluno.id);
    state.alunoDetalheId = null;
    state.alunoExcluirConfirmando = false;
    state.instituicaoMensagem = `Aluno "${aluno.nome}" excluído com sucesso.`;
  } catch(err){
    state.alunoDetalheErro = `Não foi possível excluir o aluno agora${err.code ? ` (${err.code})` : ""}. Tente de novo.`;
  } finally {
    state.alunoExcluindo = false;
    render();
  }
}

/* Cria o login (Firebase Auth) e os documentos no Firestore para um novo
   aluno, responsável, professor ou membro da equipe administrativa.
   Usa o app secundário do Firebase para não deslogar a instituição. */
/* Cria o cadastro de um novo aluno, responsável, professor ou membro da
   equipe administrativa.
   - responsavel: grava o registro na coleção `responsaveis` e, se vier
     e-mail e senha, cria também o login (Firebase Auth) — quando vem
     sem e-mail/senha (cadastro rápido pela ficha do aluno), fica só
     como registro, sem login, podendo ganhar acesso depois.
   - aluno / professor / instituicao: além do(s) documento(s), cria o
     login (Firebase Auth) usando o app secundário, pra não deslogar
     quem está usando a Gestão. */
async function criarUsuarioNaInstituicao({ role, nome, email, senha, escolaId, turma, disciplinas, contato, alunosIds }){
  if(role === "responsavel"){
    const novoResponsavelRef = doc(collection(db, "responsaveis"));
    await setDoc(novoResponsavelRef, {
      nome, escolaId, contato: contato || "",
      alunosIds: alunosIds || [],
    });

    // Se vier e-mail e senha, cria também o login (Firebase Auth) do
    // responsável — igual já acontece com aluno/professor/instituição.
    // Sem e-mail/senha (ex.: cadastro rápido pela ficha do aluno), o
    // responsável fica só como registro, sem acesso, como antes.
    if(!email || !senha) return { responsavelId: novoResponsavelRef.id };

    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    const uid = cred.user.uid;
    try {
      await setDoc(doc(db, "usuarios", uid), { role: "responsavel", nome, alunosIds: alunosIds || [], escolaId });
      // Guarda o uid também no cadastro em "responsaveis" pra podermos, mais
      // tarde (na Gestão), editar os alunos vinculados em UM lugar só e
      // refletir no login do responsável ao mesmo tempo.
      await updateDoc(novoResponsavelRef, { uid });
      return { responsavelId: novoResponsavelRef.id, uid };
    } catch(err){
      // A gravação em "usuarios" falhou depois do login já ter sido criado.
      // Desfaz o login pra não deixar uma conta "fantasma" presa no e-mail.
      try { await cred.user.delete(); } catch(_deleteErr) { /* segue mesmo se não conseguir apagar */ }
      throw err;
    } finally {
      try { await signOut(secondaryAuth); } catch(_signOutErr) { /* ignora */ }
    }
  }

  if(role === "aluno"){
    // 1. grava o cadastro do aluno primeiro (é o que alimenta o dashboard dele)
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

    // 2. cria o login do aluno (Firebase Auth) no app secundário, pra não
    //    deslogar a instituição que está fazendo o cadastro.
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    const uid = cred.user.uid;
    try {
      await setDoc(doc(db, "usuarios", uid), { role: "aluno", nome, alunoId: novoAlunoRef.id });
      return { alunoId: novoAlunoRef.id, uid };
    } catch(err){
      // A gravação em "usuarios" falhou depois do login já ter sido criado.
      // Desfaz o login pra não deixar uma conta "fantasma" presa no e-mail
      // (o cadastro em "alunos" continua valendo e pode ganhar um login
      // depois, se for tentado de novo).
      try { await cred.user.delete(); } catch(_deleteErr) { /* segue mesmo se não conseguir apagar */ }
      throw err;
    } finally {
      try { await signOut(secondaryAuth); } catch(_signOutErr) { /* ignora */ }
    }
  }

  // professor / instituicao: precisa de login de verdade
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
  const uid = cred.user.uid;

  try {
    const usuarioDoc = { role, nome };
    if(role === "professor"){
      usuarioDoc.disciplinas = disciplinas || [];
      // Guarda a escola do professor pra podermos listá-lo na tela de
      // Gestão > Professores e responsáveis e vincular turmas a ele.
      usuarioDoc.escolaId = escolaId;
    }
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
  const lista = state.instAlunos;

  let rows;
  let total;
  if(state.instAlunosCarregando){
    rows = `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando alunos…</div>`;
    total = school.alunos.length;
  } else if(state.instAlunosErro){
    rows = `<div style="padding:20px;font-size:14px;color:var(--red);">${escapeHtml(state.instAlunosErro)}</div>`;
    total = school.alunos.length;
  } else {
    const filtrados = (lista || []).filter(s => s.nome.toLowerCase().includes(busca));
    rows = filtrados.map(s => `
      <button type="button" class="row aluno-row" data-action="abrir-aluno" data-id="${escapeHtml(s.id)}">
        <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(s.nome)}</span>
        <span style="font-size:12.5px;color:var(--slate);display:flex;align-items:center;gap:8px;">${escapeHtml(s.turma)} ${ICONS.chevronRight}</span>
      </button>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum aluno encontrado.</div>`;
    total = (lista || []).length;
  }

  return `
    <h2 class="section-title">Alunos matriculados</h2>
    <p class="section-eyebrow">${total} alunos ativos em ${escapeHtml(school.nome)} · toque em um aluno para ver a ficha completa</p>
    <div class="search-wrap">
      ${ICONS.search}
      <input class="search-input" id="alunos-busca" placeholder="Buscar aluno pelo nome" value="${escapeHtml(state.alunosBusca)}" />
    </div>
    <div class="card flush">${rows}</div>
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Ficha do aluno — modal aberto ao clicar num aluno na aba "Alunos". Mostra
   contato editável, resumo de frequência/financeiro, responsáveis já
   vinculados, um formulário pra cadastrar um novo responsável e o botão
   de excluir o aluno (com confirmação em dois passos). */
function alunoDetalheModal(){
  if(!state.alunoDetalheId) return "";
  const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
  if(!aluno) return "";

  let respHtml;
  if(state.alunoRespCarregando){
    respHtml = `<p class="section-eyebrow" style="margin:6px 0;">Carregando responsáveis…</p>`;
  } else if(!state.alunoRespVinculados || state.alunoRespVinculados.length === 0){
    respHtml = `<p class="section-eyebrow" style="margin:6px 0;">Nenhum responsável vinculado ainda.</p>`;
  } else {
    respHtml = `<div class="aluno-modal-resp-list">${state.alunoRespVinculados.map(r => `
      <div class="aluno-modal-resp-item">
        <span style="font-weight:600;color:var(--ink);font-size:13.5px;">${escapeHtml(r.nome)}</span>
        <span style="color:var(--slate);font-size:12px;">${escapeHtml(r.contato || "Sem contato informado")}</span>
      </div>`).join("")}</div>`;
  }

  const excluirHtml = state.alunoExcluirConfirmando ? `
    <div class="aluno-modal-confirm">
      <p>Tem certeza? Essa ação apaga o cadastro do aluno e não pode ser desfeita.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn-danger" data-action="confirmar-exclusao-aluno" ${state.alunoExcluindo ? "disabled" : ""}>${state.alunoExcluindo ? "Excluindo…" : `${ICONS.trash} Sim, excluir`}</button>
        <button type="button" class="btn-secondary" data-action="cancelar-exclusao-aluno" ${state.alunoExcluindo ? "disabled" : ""}>Cancelar</button>
      </div>
    </div>` : `
    <button type="button" class="btn-danger" data-action="iniciar-exclusao-aluno">${ICONS.trash} Excluir aluno</button>`;

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-aluno-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Ficha do aluno" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>${escapeHtml(aluno.nome)}</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(aluno.turma)}</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-aluno-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Contato do aluno</h3>
        <input id="aluno-detalhe-contato" class="teacher-text-input" placeholder="Telefone ou e-mail de contato" value="${escapeHtml(state.alunoDetalheContatoInput)}" />
        <button type="button" class="teacher-primary-btn" data-action="salvar-aluno-contato" ${state.alunoDetalheSalvandoContato ? "disabled" : ""}>${state.alunoDetalheSalvandoContato ? "Salvando…" : "Salvar contato"}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Resumo</h3>
        <p class="section-eyebrow" style="margin:0;">Frequência: ${aluno.presenca.percentual}% · ${aluno.presenca.faltasMes} faltas no mês</p>
        <p class="section-eyebrow" style="margin:4px 0 0;">Financeiro: ${escapeHtml(aluno.financeiro.status || "—")}</p>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Responsáveis vinculados</h3>
        ${respHtml}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Cadastrar responsável</h3>
        <input id="aluno-resp-nome" class="teacher-text-input" placeholder="Nome completo do responsável" value="${escapeHtml(state.alunoRespNome)}" />
        <input id="aluno-resp-contato" class="teacher-text-input" style="margin-top:8px;" placeholder="Contato (telefone ou e-mail) — opcional" value="${escapeHtml(state.alunoRespContato)}" />
        <button type="button" class="teacher-primary-btn" data-action="cadastrar-responsavel-do-aluno" ${state.alunoRespSalvando ? "disabled" : ""}>${state.alunoRespSalvando ? "Salvando…" : "Cadastrar e vincular"}</button>
        ${state.alunoRespErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.alunoRespErro)}</p>` : ""}
        ${state.alunoRespMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.alunoRespMensagem)}</p>` : ""}
      </div>

      ${state.alunoDetalheErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:4px;">${escapeHtml(state.alunoDetalheErro)}</p>` : ""}
      ${state.alunoDetalheMensagem ? `<p class="teacher-success" style="margin-top:4px;">${escapeHtml(state.alunoDetalheMensagem)}</p>` : ""}

      <div class="aluno-modal-section aluno-modal-danger">
        ${excluirHtml}
      </div>
    </div>
  </div>`;
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
    if(t.id === "lesson-observacao"){
      state.professorConteudoObservacao = t.value;
      return;
    }
    if(t.id === "novo-conteudo-chamada"){
      state.professorConteudoNovoTexto = t.value;
      return;
    }
    if(t.id === "novo-conteudo-banco"){
      state.professorConteudosNovoTextoGerenciar = t.value;
      return;
    }
    if(t.id === "new-user-name"){ state.novoUsuarioNome = t.value; return; }
    if(t.id === "new-user-email"){ state.novoUsuarioEmail = t.value; return; }
    if(t.id === "new-user-senha"){ state.novoUsuarioSenha = t.value; return; }
    if(t.id === "new-user-turma"){ state.novoUsuarioTurma = t.value; return; }
    if(t.id === "new-user-contato"){ state.novoUsuarioContato = t.value; return; }
    if(t.id === "profile-name-input"){ state.perfilNomeInput = t.value; return; }
    if(t.id === "aluno-detalhe-contato"){ state.alunoDetalheContatoInput = t.value; return; }
    if(t.id === "aluno-resp-nome"){ state.alunoRespNome = t.value; return; }
    if(t.id === "aluno-resp-contato"){ state.alunoRespContato = t.value; return; }
    if(t.id === "nova-turma-nome"){ state.novaTurmaNome = t.value; return; }
    if(t.id === "nova-turma-horario"){ state.novaTurmaHorario = t.value; return; }
    if(t.id === "nova-turma-sala"){ state.novaTurmaSala = t.value; return; }
  });

  app.addEventListener("change", async (e) => {
    const t = e.target;
    if(t.id === "conteudo-disciplina-select"){
      state.professorConteudosDisciplinaSelecionada = t.value;
      render();
      return;
    }
    if(t.id === "lesson-content-select"){
      if(t.value === "__novo__"){
        state.professorConteudoCadastrando = true;
        state.professorConteudoSelecionadoId = "";
      } else {
        state.professorConteudoCadastrando = false;
        state.professorConteudoNovoTexto = "";
        state.professorConteudoSelecionadoId = t.value;
      }
      state.professorRegistroSalvo = false;
      state.professorRegistroErro = "";
      render();
      return;
    }
    if(t.id === "nova-turma-disciplina"){ state.novaTurmaDisciplina = t.value; return; }
    if(t.id === "new-user-turma"){ state.novoUsuarioTurma = t.value; return; }
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
        state.instAlunos = null;
        state.instAlunosEscolaId = null;
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
        state.instTab = el.dataset.key;
        render();
        if(state.instTab === "alunos" && state.escolaSelecionadaId
          && (state.instAlunos === null || state.instAlunosEscolaId !== state.escolaSelecionadaId)
          && !state.instAlunosCarregando){
          carregarAlunosDaInstituicao(state.escolaSelecionadaId);
        }
        if(state.instTab === "gestao" && state.gestaoSubTab === "equipe" && state.escolaSelecionadaId
          && (state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== state.escolaSelecionadaId)
          && !state.gestaoEquipeCarregando){
          carregarEquipeDaEscola(state.escolaSelecionadaId);
        }
        break;
      case "set-gestao-subtab":
        state.gestaoSubTab = el.dataset.key;
        render();
        if(state.gestaoSubTab === "equipe" && state.escolaSelecionadaId
          && (state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== state.escolaSelecionadaId)
          && !state.gestaoEquipeCarregando){
          carregarEquipeDaEscola(state.escolaSelecionadaId);
        }
        break;
      case "set-professor-tab":
        state.professorTab = el.dataset.key; render();
        break;
      case "set-professor-class": {
        state.professorTurmaId = el.dataset.id;
        state.professorNotasSalvas = false;
        const turma = professorTurmaAtual();
        if(turma) await carregarRegistroDoDia(turma);
        else render();
        break;
      }

      case "set-presence": {
        const turma = professorTurmaAtual();
        if(turma){
          const key = `${turma.id}-${el.dataset.student}`;
          state.professorPresencas[key] = el.dataset.status;
          render();
        }
        break;
      }

      case "save-lesson-content": {
        const turma = professorTurmaAtual();
        if(!turma) break;
        if(!state.professorConteudoSelecionadoId){
          state.professorRegistroErro = "Selecione ou cadastre o conteúdo trabalhado antes de registrar.";
          render();
          break;
        }
        state.professorRegistroErro = "";
        state.professorRegistroSalvando = true;
        render();
        try {
          const disciplina = turma.disciplina;
          const conteudoTexto = ((state.professorConteudosBanco[disciplina] || []).find(c => c.id === state.professorConteudoSelecionadoId) || {}).texto || "";
          const presencas = {};
          const observacoesAlunos = {};
          turma.alunos.forEach(aluno => {
            const key = `${turma.id}-${aluno}`;
            presencas[aluno] = state.professorPresencas[key] || "presente";
            observacoesAlunos[aluno] = state.professorObservacoes[key] || "";
          });
          await setDoc(doc(db, "registrosAula", `${turma.id}_${dataDeHojeISO()}`), {
            turmaId: turma.id,
            professorId: state.authUser.uid,
            escolaId: turma.escolaId,
            disciplina,
            data: dataDeHojeISO(),
            conteudoId: state.professorConteudoSelecionadoId,
            conteudoTexto,
            observacao: state.professorConteudoObservacao || "",
            presencas,
            observacoesAlunos,
          });
          state.professorRegistroSalvo = true;
        } catch(err){
          state.professorRegistroErro = `Não foi possível salvar a chamada agora${err.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.professorRegistroSalvando = false;
          render();
        }
        break;
      }

      case "cadastrar-conteudo-na-chamada": {
        const disciplina = el.dataset.disciplina;
        const texto = (state.professorConteudoNovoTexto || "").trim();
        if(!texto){
          state.professorRegistroErro = "Digite o conteúdo antes de adicionar.";
          render();
          break;
        }
        state.professorRegistroErro = "";
        state.professorConteudoSalvando = true;
        render();
        try {
          const novoId = await criarConteudoNoBanco(disciplina, texto);
          state.professorConteudoSelecionadoId = novoId;
          state.professorConteudoCadastrando = false;
          state.professorConteudoNovoTexto = "";
          state.professorRegistroSalvo = false;
        } catch(err){
          state.professorRegistroErro = `Não foi possível cadastrar o conteúdo agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.professorConteudoSalvando = false;
          render();
        }
        break;
      }

      case "adicionar-conteudo-banco": {
        const disciplina = el.dataset.disciplina;
        const texto = (state.professorConteudosNovoTextoGerenciar || "").trim();
        if(!texto) break;
        state.professorConteudosErro = "";
        state.professorConteudosSalvando = true;
        render();
        try {
          await criarConteudoNoBanco(disciplina, texto);
          state.professorConteudosNovoTextoGerenciar = "";
        } catch(err){
          state.professorConteudosErro = `Não foi possível cadastrar o conteúdo agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.professorConteudosSalvando = false;
          render();
        }
        break;
      }

      case "excluir-conteudo-banco": {
        const disciplina = el.dataset.disciplina;
        const id = el.dataset.id;
        state.professorConteudoExcluindoId = id;
        state.professorConteudosErro = "";
        render();
        try {
          await deleteDoc(doc(db, "conteudos", id));
          state.professorConteudosBanco[disciplina] = (state.professorConteudosBanco[disciplina] || []).filter(c => c.id !== id);
          if(state.professorConteudoSelecionadoId === id) state.professorConteudoSelecionadoId = "";
        } catch(err){
          state.professorConteudosErro = `Não foi possível excluir o conteúdo agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.professorConteudoExcluindoId = null;
          render();
        }
        break;
      }
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

      case "toggle-disciplina-professor": {
        const curso = el.dataset.curso;
        const lista = state.novoUsuarioDisciplinas;
        state.novoUsuarioDisciplinas = lista.includes(curso) ? lista.filter(x => x !== curso) : [...lista, curso];
        render();
        break;
      }

      case "create-user": {
        state.instituicaoErro = "";
        state.instituicaoMensagem = "";
        const role = state.novoUsuarioRole;
        const precisaLogin = role === "professor" || role === "instituicao" || role === "aluno" || role === "responsavel";
        const nome = (state.novoUsuarioNome || "").trim();
        const email = (state.novoUsuarioEmail || "").trim();
        const senha = state.novoUsuarioSenha || "";
        const turmaSelecionada = state.novoUsuarioTurma || "";
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
        if(role === "aluno" && !state.novoUsuarioTurma){
          state.instituicaoErro = "Selecione o curso do aluno.";
          render();
          break;
        }
        if(role === "professor" && state.novoUsuarioDisciplinas.length === 0){
          state.instituicaoErro = "Selecione ao menos uma disciplina para o professor.";
          render();
          break;
        }

        state.novoUsuarioSalvando = true;
        render();
        try {
          await criarUsuarioNaInstituicao({
            role, nome, email, senha, escolaId,
            turma: turmaSelecionada,
            disciplinas: state.novoUsuarioDisciplinas,
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
          state.novoUsuarioDisciplinas = [];
          state.novoUsuarioContato = "";
          state.novoUsuarioAlunosVinculados = [];
          if(role === "aluno" && state.data.escolas[escolaId]){
            // reflete o novo aluno na lista local sem precisar recarregar
            state.data.escolas[escolaId].alunos.push({ nome, turma: turmaSelecionada });
            // força recarregar a lista de verdade (com id) na próxima vez que a aba Alunos abrir
            state.instAlunos = null;
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

      case "save-profile-name": {
        const nomeInformado = (state.perfilNomeInput || document.getElementById("profile-name-input")?.value || "").trim();
        state.perfilNomeErro = "";
        if(!nomeInformado){
          state.perfilNomeErro = "Digite seu nome completo.";
          render();
          break;
        }
        state.perfilNomeSalvando = true;
        render();
        try {
          await updateDoc(doc(db, "usuarios", state.authUser.uid), { nome: nomeInformado });
          state.perfil = { ...state.perfil, nome: nomeInformado };
          state.perfilNomeInput = "";
        } catch(err){
          state.perfilNomeErro = "Não foi possível salvar seu nome agora. Tente de novo.";
        } finally {
          state.perfilNomeSalvando = false;
          render();
        }
        break;
      }

      case "reset-senha-perfil": {
        state.perfilSenhaResetErro = "";
        state.perfilSenhaResetMensagem = "";
        const email = state.authUser?.email;
        if(!email){
          state.perfilSenhaResetErro = "Não encontramos seu e-mail de acesso. Fale com a secretaria.";
          render();
          break;
        }
        state.perfilSenhaResetEnviando = true;
        render();
        try {
          await sendPasswordResetEmail(auth, email);
          state.perfilSenhaResetMensagem = `Enviamos um e-mail para ${email} com o link para trocar sua senha.`;
        } catch(err){
          state.perfilSenhaResetErro = mensagemErroFirebase(err.code);
        } finally {
          state.perfilSenhaResetEnviando = false;
          render();
        }
        break;
      }

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
        state.secretariaModalOpen = true;
        render();
        break;

      case "close-secretaria-modal":
        state.secretariaModalOpen = false;
        render();
        break;

      case "whatsapp-secretaria": {
        const escola = SECRETARIA_WHATSAPP.find(e => e.id === el.dataset.escola);
        if(escola){
          window.open(whatsappLink(escola.numero), "_blank", "noopener");
        }
        state.secretariaModalOpen = false;
        render();
        break;
      }

      case "abrir-aluno": {
        const id = el.dataset.id;
        const aluno = (state.instAlunos || []).find(a => a.id === id);
        state.alunoDetalheId = id;
        state.alunoDetalheContatoInput = aluno ? (aluno.contato || "") : "";
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        state.alunoExcluirConfirmando = false;
        state.alunoRespVinculados = null;
        state.alunoRespNome = "";
        state.alunoRespContato = "";
        state.alunoRespErro = "";
        state.alunoRespMensagem = "";
        render();
        carregarResponsaveisDoAluno(id);
        break;
      }

      case "fechar-aluno-modal":
        state.alunoDetalheId = null;
        state.alunoExcluirConfirmando = false;
        render();
        break;

      case "salvar-aluno-contato": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno) break;
        const contato = (document.getElementById("aluno-detalhe-contato")?.value || "").trim();
        state.alunoDetalheSalvandoContato = true;
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        render();
        try {
          await updateDoc(doc(db, "alunos", aluno.id), { contato });
          aluno.contato = contato;
          state.alunoDetalheContatoInput = contato;
          state.alunoDetalheMensagem = "Contato atualizado.";
        } catch(err){
          state.alunoDetalheErro = "Não foi possível salvar o contato agora. Tente de novo.";
        } finally {
          state.alunoDetalheSalvandoContato = false;
          render();
        }
        break;
      }

      case "iniciar-exclusao-aluno":
        state.alunoExcluirConfirmando = true;
        render();
        break;

      case "cancelar-exclusao-aluno":
        state.alunoExcluirConfirmando = false;
        render();
        break;

      case "confirmar-exclusao-aluno": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno || !state.escolaSelecionadaId) break;
        await excluirAlunoDaInstituicao(aluno, state.escolaSelecionadaId);
        break;
      }

      case "cadastrar-responsavel-do-aluno": {
        const alunoId = state.alunoDetalheId;
        if(!alunoId || !state.escolaSelecionadaId) break;
        const nome = (document.getElementById("aluno-resp-nome")?.value || "").trim();
        const contato = (document.getElementById("aluno-resp-contato")?.value || "").trim();
        state.alunoRespErro = "";
        state.alunoRespMensagem = "";
        if(!nome){
          state.alunoRespErro = "Digite o nome do responsável.";
          render();
          break;
        }
        state.alunoRespSalvando = true;
        render();
        try {
          await criarUsuarioNaInstituicao({
            role: "responsavel", nome, contato,
            escolaId: state.escolaSelecionadaId,
            alunosIds: [alunoId],
          });
          state.alunoRespNome = "";
          state.alunoRespContato = "";
          state.alunoRespMensagem = `Responsável "${nome}" cadastrado e vinculado.`;
          await carregarResponsaveisDoAluno(alunoId);
        } catch(err){
          state.alunoRespErro = `Não foi possível cadastrar o responsável agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.alunoRespSalvando = false;
          render();
        }
        break;
      }

      case "abrir-professor-turmas": {
        const id = el.dataset.id;
        state.profTurmasModalId = id;
        state.profTurmasModalNome = el.dataset.nome || "";
        state.profTurmasModalTurmas = null;
        state.profTurmasModalErro = "";
        state.profTurmasModalMensagem = "";
        state.novaTurmaNome = "";
        state.novaTurmaDisciplina = "";
        state.novaTurmaHorario = "";
        state.novaTurmaSala = "";
        state.novaTurmaAlunos = [];
        render();
        if(!state.gestaoAlunosEscola && state.escolaSelecionadaId) carregarAlunosParaVinculo(state.escolaSelecionadaId);
        carregarTurmasDoProfessorGestao(id);
        break;
      }

      case "fechar-professor-turmas-modal":
        state.profTurmasModalId = null;
        render();
        break;

      case "toggle-turma-aluno": {
        const nome = el.dataset.nome;
        const lista = state.novaTurmaAlunos;
        state.novaTurmaAlunos = lista.includes(nome) ? lista.filter(x => x !== nome) : [...lista, nome];
        render();
        break;
      }

      case "criar-turma-professor": {
        const professorId = state.profTurmasModalId;
        const school = state.data.escolas[state.escolaSelecionadaId];
        if(!professorId || !school) break;
        const nome = (document.getElementById("nova-turma-nome")?.value || "").trim();
        const disciplina = document.getElementById("nova-turma-disciplina")?.value || "";
        const horario = (document.getElementById("nova-turma-horario")?.value || "").trim();
        const sala = (document.getElementById("nova-turma-sala")?.value || "").trim();
        state.profTurmasModalErro = "";
        state.profTurmasModalMensagem = "";
        if(!nome){
          state.profTurmasModalErro = "Digite o nome da turma.";
          render();
          break;
        }
        if(!disciplina){
          state.profTurmasModalErro = "Selecione a disciplina da turma.";
          render();
          break;
        }
        state.novaTurmaSalvando = true;
        render();
        try {
          await setDoc(doc(collection(db, "turmas")), {
            nome, horario, sala,
            escola: school.nome,
            escolaId: state.escolaSelecionadaId,
            disciplina,
            professorId,
            alunos: state.novaTurmaAlunos,
          });
          state.profTurmasModalMensagem = `Turma "${nome}" criada com sucesso.`;
          state.novaTurmaNome = "";
          state.novaTurmaDisciplina = "";
          state.novaTurmaHorario = "";
          state.novaTurmaSala = "";
          state.novaTurmaAlunos = [];
          await carregarTurmasDoProfessorGestao(professorId);
        } catch(err){
          state.profTurmasModalErro = `Não foi possível criar a turma agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.novaTurmaSalvando = false;
          render();
        }
        break;
      }

      case "excluir-turma-professor": {
        const id = el.dataset.id;
        const professorId = state.profTurmasModalId;
        if(!id || !professorId) break;
        state.profTurmaExcluindoId = id;
        state.profTurmasModalErro = "";
        render();
        try {
          await deleteDoc(doc(db, "turmas", id));
          state.profTurmasModalTurmas = (state.profTurmasModalTurmas || []).filter(t => t.id !== id);
        } catch(err){
          state.profTurmasModalErro = `Não foi possível excluir a turma agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.profTurmaExcluindoId = null;
          render();
        }
        break;
      }

      case "abrir-responsavel-vinculos": {
        const id = el.dataset.id;
        const responsavel = (state.gestaoResponsaveis || []).find(r => r.id === id);
        state.respModalId = id;
        state.respModalNome = el.dataset.nome || "";
        state.respModalAlunosIds = responsavel ? [...responsavel.alunosIds] : [];
        state.respModalErro = "";
        state.respModalMensagem = "";
        render();
        if(!state.gestaoAlunosEscola && state.escolaSelecionadaId) carregarAlunosParaVinculo(state.escolaSelecionadaId);
        break;
      }

      case "fechar-responsavel-modal":
        state.respModalId = null;
        render();
        break;

      case "toggle-resp-vinculo-aluno": {
        const id = el.dataset.id;
        const lista = state.respModalAlunosIds;
        state.respModalAlunosIds = lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id];
        render();
        break;
      }

      case "salvar-resp-vinculos": {
        const id = state.respModalId;
        const responsavel = (state.gestaoResponsaveis || []).find(r => r.id === id);
        if(!id || !responsavel) break;
        state.respModalErro = "";
        state.respModalMensagem = "";
        state.respModalSalvando = true;
        render();
        try {
          await updateDoc(doc(db, "responsaveis", id), { alunosIds: state.respModalAlunosIds });
          // Se este responsável já tem login, mantém o dashboard dele em dia.
          if(responsavel.uid){
            await updateDoc(doc(db, "usuarios", responsavel.uid), { alunosIds: state.respModalAlunosIds });
          }
          responsavel.alunosIds = [...state.respModalAlunosIds];
          state.respModalMensagem = "Vínculos atualizados.";
        } catch(err){
          state.respModalErro = `Não foi possível salvar os vínculos agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.respModalSalvando = false;
          render();
        }
        break;
      }

      case "noop":
        break;
    }
  });
}

bindEvents();
render();
