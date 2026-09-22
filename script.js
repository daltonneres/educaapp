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
     escolaId: string           // role == "professor": 1ª escola da lista abaixo, mantido só por compatibilidade
     escolasIds: string[]       // role == "professor" (pode dar aula em +1 unidade) ou "instituicao"

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

   presencasAluno/{turmaId_data_nomeDoAluno}   (calendário do aluno/responsável —
                                    uma cópia "por aluno" de cada chamada salva,
                                    gravada junto com registrosAula; ver
                                    sincronizarCalendarioDaChamada)
     alunoKey: "escolaId:nome normalizado"    // liga o registro ao aluno (ver chaveAluno em calendario.js)
     alunoNome, escolaId, turmaId, turmaNome, disciplina, data
     status: "presente" | "falta" | "justificada"
     observacao: string          // observação do professor sobre o aluno naquele dia
     professorId, professorNome, atualizadoEm

   eventosCalendario/{id}   (avisos e lembretes criados pelo professor)
     tipo: "aviso" | "lembrete"
     titulo, descricao, data ("AAAA-MM-DD")
     alvo: "turma" | "aluno"        // turma inteira ou um aluno só
     paraQuem: "todos" | "responsaveis" | "alunos"
     turmaId, turmaNome, disciplina, alunoNome (só quando alvo == "aluno"), escolaId
     destinatarios: string[]   // chaveAluno de cada aluno que deve ver (consulta: array-contains)
     professorId, professorNome, criadoEm
   ================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
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
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  contratoEstadoInicial,
  contratoModal,
  contratoRecalcular,
  contratoAplicarEmpresa,
  contratoValidar,
  contratoSugerirAcessos,
  contratoPrecisaLoginAluno,
  abrirContratoParaImpressao,
  variantesDeEmail,
  senhaProvisoria,
  DOMINIO_ALUNO,
  DOMINIO_RESPONSAVEL,
  interpretarContratoTexto,
  importarContratosModal,
} from "./contratos.js";
import {
  calendarioHtml,
  eventoFormModalHtml,
  montarDias,
  chaveAluno,
  slugNome,
  hojeISO,
  dataValida,
} from "./calendario.js";

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

/* ------------------------------------------------------------------
   Funções administrativas (Cloud Functions com o Admin SDK).
   O SDK do navegador NÃO consegue trocar a senha nem apagar o login de
   OUTRA pessoa — só da conta que está logada no momento. Para a Gestão
   poder definir a senha de um aluno/professor/responsável na hora (e
   apagar o login de vez), existe um par de Cloud Functions no projeto
   (veja BACKEND-ADMIN.md, com o código pronto pra publicar).

   Sem essas funções publicadas, "Senhas & acessos" mostra o aviso pra
   publicar (BACKEND-ADMIN.md) em vez de travar — mas trocar a senha de
   outra pessoa depende delas de verdade, não tem plano B por e-mail
   aqui (a equipe até troca a própria senha sem backend, em "Meu
   perfil", porque aí é a própria conta logada).

   Se você publicar as funções em outra região, troque só a linha abaixo.
   ------------------------------------------------------------------ */
const REGIAO_FUNCOES = "us-central1";
let _funcoes = null;
function funcoesAdmin(){
  if(!_funcoes) _funcoes = getFunctions(firebaseApp, REGIAO_FUNCOES);
  return _funcoes;
}

/* Chama uma Cloud Function do Admin SDK. Devolve sempre um erro com
   `code` do Firebase pra quem chamou decidir a mensagem. */
async function chamarFuncaoAdmin(nome, dados){
  const fn = httpsCallable(funcoesAdmin(), nome);
  const resposta = await fn(dados);
  return resposta.data;
}

/* Traduz o erro de uma Cloud Function pra uma frase que a secretaria
   entenda — em especial o caso "ainda não publiquei o backend". */
function mensagemErroAdmin(err){
  const code = err?.code || "";
  if(code === "functions/not-found" || code === "functions/unavailable" || code === "functions/internal"){
    return "A função de administração ainda não está publicada no Firebase — sem ela, não dá pra trocar a senha de outra pessoa por aqui. Publique as Cloud Functions (passo a passo em BACKEND-ADMIN.md) e tente de novo.";
  }
  if(code === "functions/permission-denied") return "Seu usuário não tem permissão para essa ação administrativa.";
  if(code === "functions/unauthenticated") return "Sua sessão expirou. Saia e entre de novo.";
  if(code === "functions/invalid-argument") return err?.message || "Dados inválidos para essa ação.";
  return `Não foi possível concluir agora${code ? ` (${code})` : ""}. Tente de novo.`;
}

/* Define a senha de OUTRO usuário (precisa da Cloud Function publicada). */
async function definirSenhaDeOutroUsuario(uid, senha){
  return chamarFuncaoAdmin("definirSenhaUsuario", { uid, senha });
}

/* Apaga o login (Firebase Authentication) de outro usuário. Também
   depende da Cloud Function; quando ela não existe, o cadastro no
   Firestore é apagado mesmo assim e o login fica órfão (sem dados, a
   pessoa entra e não vê nada) até ser removido pelo Console. */
async function excluirLoginDeOutroUsuario(uid){
  return chamarFuncaoAdmin("excluirUsuarioAuth", { uid });
}

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
  pencil: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  spinner: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>`,
  book: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>`,
  chart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12.5" y="8" width="3" height="10"/><rect x="18" y="5" width="3" height="13"/></svg>`,
  upload: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>`,
  key: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.8-8.8"/><path d="m17 6 2.5 2.5"/><path d="m14.5 8.5 2.5 2.5"/></svg>`,
  shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  lifebuoy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/></svg>`,
  cake: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6Z"/><path d="M4 16c1.5 1.2 3 1.2 4.5 0S11.5 14.8 13 16s3 1.2 4.5 0"/><path d="M12 8V5"/><path d="M12 3.5c.7.6.7 1.4 0 1.5-.7-.1-.7-.9 0-1.5Z"/><path d="M8 9V6.5M16 9V6.5"/></svg>`,
  calendar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  fileText: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>`,
};

/* Contatos de WhatsApp da secretaria, por unidade. Ajuste os números aqui
   se eles mudarem — não precisa mexer em mais nenhum lugar do código. */
const SECRETARIA_WHATSAPP = [
  { id: "salto", nome: "Escola Salto do Lontra", numero: "46999318578" },
  { id: "prata", nome: "Escola Nova Prata do Iguaçu", numero: "4699274677" },
];

/* Contato do suporte técnico (quem cuida do sistema), mostrado na aba
   "Meu perfil" da EQUIPE — que é a própria secretaria e portanto não
   precisa de um botão "falar com a secretaria". Ajuste aqui. */
const SUPORTE_TECNICO = {
  nome: "Suporte do Educa+",
  whatsapp: "46999711937",
  email: "dev.neresdalton@gmail.com",
};

/* Mensagem de parabéns enviada pela aba "Aniversários". Ajuste os textos
   aqui se a escola quiser mudar o jeito de falar — o resto continua
   funcionando igual. */
const MENSAGEM_ANIVERSARIO = {
  paraAluno: (primeiroNome) =>
    `Feliz aniversário, ${primeiroNome}! 🎉\n\nToda a equipe do Educa+ Centro Educacional deseja um dia muito especial pra você. Conte sempre com a gente!`,
  paraResponsavel: (primeiroNomeResponsavel, nomeAluno) =>
    `Olá, ${primeiroNomeResponsavel}! 🎉\n\nHoje é aniversário do(a) ${nomeAluno}! A equipe do Educa+ Centro Educacional deseja muitas felicidades e pede que dê os parabéns por nós.`,
};

/* Link do WhatsApp já com a mensagem escrita, pronta pra secretaria só
   conferir e apertar enviar. */
function whatsappLinkComTexto(numero, texto){
  return `${whatsappLink(numero)}?text=${encodeURIComponent(texto)}`;
}

/* Um contato só vale como WhatsApp se tiver cara de telefone (DDD +
   número). E-mail ou campo vazio caem fora. */
function telefoneValido(contato){
  const digits = String(contato || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13 ? digits : "";
}

function primeiroNome(nome){
  return String(nome || "").trim().split(/\s+/)[0] || "";
}

function whatsappLink(numero){
  const digits = String(numero).replace(/\D/g, "");
  const comDdi = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${comDdi}`;
}

/* Mensagem que acompanha o contrato enviado pra assinatura. Edite aqui. */
const MENSAGEM_CONTRATO = {
  paraAssinatura: (primeiroNomeQuemAssina, nomeAluno) =>
    `Olá${primeiroNomeQuemAssina ? `, ${primeiroNomeQuemAssina}` : ""}! Tudo bem?\n\nSegue o contrato de prestação de serviços do(a) ${nomeAluno} no Educa+ Centro Educacional, em PDF, para assinatura.\n\nDepois de assinado, é só devolver por aqui mesmo (pode ser o PDF ou uma foto legível). Qualquer dúvida, é só chamar!`,
};

/* Endereço do app que vai na mensagem de acesso. Deixe vazio pra usar o
   endereço em que a secretaria está usando o sistema agora; se ela às
   vezes abre por um endereço de teste, preencha aqui com o endereço
   público (ex.: "https://app.educamais.com.br/"). */
const URL_DO_APP = "";

function linkDoApp(){
  return URL_DO_APP || `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}`;
}

/* Mensagem com o link do app + login + senha provisória. Edite aqui. */
const MENSAGEM_ACESSO = {
  paraResponsavel: (primeiroNomeResp, nomeAluno, link, login, senha) =>
    `Olá, ${primeiroNomeResp}! Tudo bem?\n\nSeguem os dados de acesso ao app do Educa+ Centro Educacional para acompanhar o(a) ${nomeAluno}:\n\n📲 Acesse: ${link}\n👤 Login: ${login}\n🔑 Senha provisória: ${senha}\n\nNo primeiro acesso, troque a senha em "Meu perfil". Qualquer dúvida, é só chamar!`,
  paraAluno: (primeiroNomeAluno, link, login, senha) =>
    `Olá, ${primeiroNomeAluno}! Tudo bem?\n\nSeguem seus dados de acesso ao app do Educa+ Centro Educacional:\n\n📲 Acesse: ${link}\n👤 Login: ${login}\n🔑 Senha provisória: ${senha}\n\nNo primeiro acesso, troque a senha em "Meu perfil". Qualquer dúvida, é só chamar!`,
};

/* Abre o WhatsApp já na conversa da pessoa, com a mensagem de acesso
   escrita. Precisa ser chamada direto de um clique. Devolve false se não
   há número válido ou acesso pra enviar. */
function abrirWhatsappDeAcesso({ ehResponsavel, acesso, nomeAluno, nomeDestino, contato }){
  const numero = telefoneValido(contato);
  if(!numero || !acesso) return false;
  const texto = ehResponsavel
    ? MENSAGEM_ACESSO.paraResponsavel(primeiroNome(nomeDestino), nomeAluno, linkDoApp(), acesso.email, acesso.senha)
    : MENSAGEM_ACESSO.paraAluno(primeiroNome(nomeDestino), linkDoApp(), acesso.email, acesso.senha);
  window.open(whatsappLinkComTexto(numero, texto), "_blank", "noopener");
  return true;
}

/* Manda o contrato em PDF pra assinatura pelo WhatsApp.
   O link "wa.me" só leva texto — não anexa arquivo. Então:
   - no celular (e em navegadores que suportam), abre a folha de
     compartilhamento com o PDF já anexado e a mensagem escrita; a
     secretaria escolhe o contato do WhatsApp;
   - no computador, baixa o PDF e abre a conversa já com a mensagem, e a
     secretaria arrasta o PDF pra dentro da conversa.
   Precisa ser chamada direto de um clique (sem esperar nada antes),
   senão o navegador bloqueia o compartilhamento.
   Devolve: "compartilhado" | "cancelado" | "manual" | "sem-numero". */
async function enviarContratoParaAssinatura({ arquivo, alunoNome, respNome, numero }){
  const texto = MENSAGEM_CONTRATO.paraAssinatura(primeiroNome(respNome), alunoNome);

  if(arquivo && typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] })){
    try {
      await navigator.share({ files: [arquivo], text: texto });
      return "compartilhado";
    } catch(err){
      if(err?.name === "AbortError") return "cancelado";
      // qualquer outro tropeço: segue pro plano B
    }
  }

  if(arquivo){
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo.name || "contrato.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  if(!numero) return "sem-numero";
  window.open(whatsappLinkComTexto(numero, texto), "_blank", "noopener");
  return "manual";
}

function textoResultadoEnvio(resultado){
  if(resultado === "compartilhado") return "Enviado pela folha de compartilhamento.";
  if(resultado === "manual") return "PDF baixado e WhatsApp aberto — arraste (ou anexe) o PDF na conversa antes de enviar.";
  if(resultado === "sem-numero") return "Não há WhatsApp cadastrado pra quem assina. O PDF foi baixado — cadastre o número e envie manualmente.";
  return "";
}

/* Quem assina o contrato: o responsável; se o aluno é maior de idade
   (sem responsável), o próprio aluno. Devolve o nome e o número. */
function destinoDoContratoImportado(c){
  if(!c.semResponsavel && telefoneValido(c.contatoResp)) return { nome: c.respNome, numero: telefoneValido(c.contatoResp) };
  return { nome: c.semResponsavel ? c.alunoNome : c.respNome, numero: telefoneValido(c.contatoAluno) };
}

function destinoDoContratoDoAluno(aluno){
  const resp = (state.gestaoResponsaveis || [])
    .find(r => r.alunosIds.includes(aluno.id) && telefoneValido(r.contato));
  if(resp) return { nome: resp.nome, numero: telefoneValido(resp.contato) };
  const respSemTel = (state.gestaoResponsaveis || []).find(r => r.alunosIds.includes(aluno.id));
  return { nome: respSemTel?.nome || aluno.nome, numero: telefoneValido(aluno.contato) };
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

/* Ordem da semana, usada pra manter os dias escolhidos no contrato
   sempre na sequência certa ("terça-feira e quinta-feira"). */
const DIAS_SEMANA_ORDEM = ["segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];

/* Nomes dos meses usados na aba "Aniversários". */
const MESES_CURTOS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const MESES_LONGOS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function cursosDaEscola(nomeEscola){
  const nome = (nomeEscola || "").toLowerCase();
  if(nome.includes("prata")) return CURSOS_POR_ESCOLA.prata;
  if(nome.includes("salto")) return CURSOS_POR_ESCOLA.salto;
  return TODOS_OS_CURSOS;
}

/* Une os cursos oferecidos por um conjunto de escolas — usado no cadastro
   de professor quando ele dá aula em mais de uma unidade, pra mostrar só
   as disciplinas que fazem sentido pra pelo menos uma delas. */
function cursosDasEscolas(escolaIds){
  if(!Array.isArray(escolaIds) || escolaIds.length === 0) return TODOS_OS_CURSOS;
  const combinados = new Set();
  escolaIds.forEach(id => {
    const nome = state.data.escolas?.[id]?.nome || "";
    cursosDaEscola(nome).forEach(c => combinados.add(c));
  });
  return combinados.size ? Array.from(combinados) : TODOS_OS_CURSOS;
}

/* ---------------- Importação de turmas por texto colado (PDF) ----------------
   A secretaria recebe listas de turmas em PDF (uma por unidade), sempre no
   formato "TURMA  DIA  HORÁRIO  PROFESSOR(A)" — uma turma por linha. Pedir
   pra colar o texto (em vez de tentar ler o PDF binário no navegador) é bem
   mais confiável: o texto copiado do PDF já vem limpo, sem precisar de
   nenhuma biblioteca de leitura de PDF nem lidar com a posição de cada
   palavra na página. */
const DIA_SEMANA_REGEX_FONTE = "segunda-feira|segunda|ter[çc]a-feira|ter[çc]a|quarta-feira|quarta|quinta-feira|quinta|sexta-feira|sexta|s[áa]bado|domingo";
const DIA_SEMANA_REGEX = new RegExp(`(?:${DIA_SEMANA_REGEX_FONTE})(?:\\s*(?:,|e)\\s*(?:${DIA_SEMANA_REGEX_FONTE}))*`, "i");
const HORARIO_REGEX = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;

function normalizarNome(s){
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Aponta o PDF.js (carregado via <script> no index.html) pro worker certo,
// da mesma versão. Sem isso, ele tenta rodar sem worker e falha lento.
if(typeof window !== "undefined" && window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions){
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* Lê um arquivo PDF (a lista de turmas) direto no navegador e devolve o
   texto reconstruído linha por linha, pronto pra passar pra
   interpretarTextoTurmas() — igual ficaria se a pessoa tivesse copiado e
   colado o texto à mão. Cada item de texto do PDF vem com a posição (x,y)
   na página; agrupamos os que têm o mesmo "y" (mesma altura) numa linha e
   ordenamos por "x" (esquerda pra direita) pra reconstruir a ordem das
   colunas da tabela. Só funciona com PDF de texto de verdade — um PDF
   escaneado (foto/imagem da tabela) não tem essa camada de texto. */
async function extrairTextoDoPdf(file){
  if(!window.pdfjsLib) throw new Error("pdfjs-nao-carregado");
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const linhas = [];
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    // "disableCombineTextItems" faz o pdf.js devolver um item por posição
    // de verdade, sem juntar pedaços sozinho — é o que deixa o cálculo do
    // vão abaixo (item por item) confiável.
    const content = await page.getTextContent({ disableCombineTextItems: true });
    const grupos = [];
    content.items.forEach(item => {
      if(!item.str || !item.str.trim()) return;
      const y = Math.round(item.transform[5]);
      let grupo = grupos.find(g => Math.abs(g.y - y) <= 3);
      if(!grupo){ grupo = { y, itens: [] }; grupos.push(grupo); }
      grupo.itens.push({ x: item.transform[4], largura: item.width || 0, texto: item.str });
    });
    grupos.sort((a, b) => b.y - a.y); // maior y = mais acima na página → lê de cima pra baixo
    grupos.forEach(g => {
      // Só entra espaço entre dois pedaços quando existe um vão de verdade
      // entre eles. Sem isso, uma palavra acentuada que o PDF divide em
      // vários itens colados (ex.: "PRESTA" + "ÇÃ" + "O", sem nenhuma
      // distância entre um e outro) ganhava espaço no meio ("PRESTA ÇÃ O")
      // e quebrava qualquer busca de texto por essa palavra depois.
      const itens = g.itens.sort((a, b) => a.x - b.x);
      let linha = "";
      let fimAnterior = null;
      itens.forEach(it => {
        if(fimAnterior !== null && (it.x - fimAnterior) > 1) linha += " ";
        linha += it.texto;
        fimAnterior = it.x + it.largura;
      });
      linha = linha.replace(/\s+/g, " ").trim();
      if(linha) linhas.push(linha);
    });
  }
  return linhas.join("\n");
}

/* Tenta casar o nome de professor(a) que veio no PDF (geralmente só o
   primeiro nome, ex.: "Márcia") com alguém já cadastrado na unidade. Não é
   uma correspondência perfeita — por isso o preview sempre deixa a
   secretaria trocar manualmente antes de confirmar. */
function casarProfessorPorNome(nomePdf, professores){
  const alvo = normalizarNome(nomePdf);
  if(!alvo) return null;
  let match = professores.find(p => normalizarNome(p.nome) === alvo);
  if(match) return match;
  match = professores.find(p => {
    const pn = normalizarNome(p.nome);
    return pn.includes(alvo) || alvo.includes(pn);
  });
  if(match) return match;
  const alvoPalavras = alvo.split(/\s+/).filter(Boolean);
  match = professores.find(p => normalizarNome(p.nome).split(/\s+/).some(w => alvoPalavras.includes(w)));
  return match || null;
}

function adivinharDisciplina(turmaRaw, cursosDisponiveis){
  const alvo = normalizarNome(turmaRaw);
  if(alvo.includes("recrea") && cursosDisponiveis.includes("Recreação")) return "Recreação";
  if(alvo.includes("robotica") && cursosDisponiveis.includes("Robótica")) return "Robótica";
  if(alvo.includes("informatica") && cursosDisponiveis.includes("Informática")) return "Informática";
  return cursosDisponiveis.includes("Inglês") ? "Inglês" : (cursosDisponiveis[0] || "Inglês");
}

/* Recebe o texto colado (várias linhas) e devolve uma lista de linhas
   interpretadas, já tentando casar professor e disciplina — pronta pra
   virar a tabela de prévia. Linhas que não têm um horário reconhecível
   (ex.: o cabeçalho "TURMA DIA HORÁRIO PROFESSOR(A)") são ignoradas. */
function interpretarTextoTurmas(texto, escolaNome, professores){
  const cursosDisponiveis = cursosDaEscola(escolaNome);
  const linhas = (texto || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const resultado = [];
  linhas.forEach(linha => {
    const horarioMatch = linha.match(HORARIO_REGEX);
    if(!horarioMatch) return; // provavelmente o cabeçalho, ou linha vazia/quebrada
    const diaMatch = linha.slice(0, horarioMatch.index).match(DIA_SEMANA_REGEX);
    if(!diaMatch) return; // linha fora do formato esperado

    const turmaRaw = linha.slice(0, diaMatch.index).trim().replace(/[-–—]+$/, "").trim();
    const diaRaw = diaMatch[0].trim();
    const horarioRaw = `${horarioMatch[1]} - ${horarioMatch[2]}`;
    const professorRaw = linha.slice(horarioMatch.index + horarioMatch[0].length).trim();
    if(!turmaRaw || !professorRaw) return;

    const professorEncontrado = casarProfessorPorNome(professorRaw, professores);
    resultado.push({
      turmaRaw, diaRaw, horarioRaw, professorRaw,
      professorId: professorEncontrado ? professorEncontrado.id : "",
      disciplina: adivinharDisciplina(turmaRaw, cursosDisponiveis),
      selecionada: true,
    });
  });
  return resultado;
}

/* Roda interpretarTextoTurmas() em cima do texto (colado ou extraído do
   PDF) e atualiza o estado do modal de importação com o resultado —
   chamada tanto pelo botão "Analisar" quanto, automaticamente, depois de
   ler um PDF enviado direto. */
function analisarTextoImportado(texto){
  state.importTurmasTexto = texto;
  state.importTurmasResultado = null;
  const escola = state.data.escolas?.[state.escolaSelecionadaId];
  const professores = state.gestaoProfessores || [];
  const linhas = interpretarTextoTurmas(texto, escola?.nome || "", professores);
  if(linhas.length === 0){
    state.importTurmasErro = "Não encontrei nenhuma linha no formato esperado (turma, dia, horário e professor) dentro desse PDF. Verifique se o arquivo tem o formato certo, ou crie as turmas manualmente pelo botão \"Criar turma\".";
    state.importTurmasPreview = null;
  } else {
    state.importTurmasErro = "";
    state.importTurmasPreview = linhas;
  }
  render();
}

/* Grava as linhas marcadas como turmas de verdade (coleção "turmas"),
   pulando qualquer linha sem professor escolhido e qualquer turma que já
   exista na unidade com o mesmo nome + horário (evita duplicar se a
   secretaria importar a mesma lista duas vezes). */
async function importarTurmasEmLote(linhas, escolaId, escolaNome, professores){
  const existentesSnap = await getDocs(query(collection(db, "turmas"), where("escolaId", "==", escolaId)));
  const chavesExistentes = new Set(existentesSnap.docs.map(d => {
    const dados = d.data();
    return `${normalizarNome(dados.nome)}|${normalizarNome(dados.horario)}`;
  }));

  let criadas = 0, puladasSemProfessor = 0, puladasDuplicadas = 0;
  for(const linha of linhas){
    if(!linha.selecionada) continue;
    if(!linha.professorId){ puladasSemProfessor++; continue; }
    const horario = `${linha.diaRaw}, ${linha.horarioRaw}`;
    const chave = `${normalizarNome(linha.turmaRaw)}|${normalizarNome(horario)}`;
    if(chavesExistentes.has(chave)){ puladasDuplicadas++; continue; }

    const professor = professores.find(p => p.id === linha.professorId);
    await setDoc(doc(collection(db, "turmas")), {
      nome: linha.turmaRaw,
      horario,
      sala: "",
      escola: escolaNome,
      escolaId,
      disciplina: linha.disciplina,
      professorId: linha.professorId,
      alunos: [],
    });
    chavesExistentes.add(chave);
    criadas++;
  }
  return { criadas, puladasSemProfessor, puladasDuplicadas, total: linhas.filter(l => l.selecionada).length };
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

  alunoTab: "calendario",
  familiaTab: "calendario",
  cal: calNovoEstado(),          // calendário (aluno / responsável / professor) — ver seção "Calendário"
  familiaStudentId: null,
  escolaSelecionadaId: null,
  instTab: "turmas",
  gestaoSubTab: "cadastro",   // cadastro | acessos — sub-abas dentro de "Gestão"
  alunosBusca: "",
  professorTab: "calendario",
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
  novoUsuarioEscolasIds: [],      // escola(s) em que o professor dá aula (pode ser mais de uma)
  novoUsuarioContato: "",
  novoUsuarioSalvando: false,
  novoUsuarioAlunosVinculados: [], // ids de alunos escolhidos (role == responsavel)
  gestaoAlunosEscola: null,        // [{id,nome,turma}] carregado sob demanda p/ vincular responsável

  // --- Professores e responsáveis (abas separadas) ---
  gestaoEquipeCarregando: false,
  gestaoEquipeEscolaId: null,      // escolaId da última carga, p/ recarregar ao trocar de unidade
  gestaoProfessores: null,         // [{id,nome,disciplinas}]
  gestaoResponsaveis: null,        // [{id,nome,contato,alunosIds,uid}]
  gestaoEquipeErro: "",

  // modal "Turmas do professor"
  profTurmasModalAberto: false,    // controla a visibilidade do modal (independe de já ter professor escolhido)
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

  // modal "Editar professor" (nome + disciplinas) e exclusão
  editProfessorModalAberto: false,
  editProfessorId: null,
  editProfessorNome: "",
  editProfessorDisciplinas: [],
  editProfessorSalvando: false,
  editProfessorErro: "",
  editProfessorExcluindoId: null,  // uid em processo de exclusão (mostra "…" no botão da linha)

  // modal "Importar turmas" (colar texto do PDF de horários)
  importTurmasModalAberto: false,
  importTurmasTexto: "",
  importTurmasPreview: null,       // [{turmaRaw,diaRaw,horarioRaw,professorRaw,professorId,disciplina,selecionada}]
  importTurmasErro: "",
  importTurmasSalvando: false,
  importTurmasLendoPdf: false,     // true enquanto extrai o texto de dentro do PDF enviado
  importTurmasArquivoNome: "",     // nome do PDF escolhido, exibido na área de upload
  importTurmasResultado: null,     // {criadas,puladasSemProfessor,puladasDuplicadas,total}

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

  // "Meu perfil" > trocar a própria senha aqui mesmo (sem depender de
  // e-mail nem de desenvolvedor): pede a senha atual, confirma com o
  // Firebase e grava a nova.
  perfilSenhaTrocando: false,
  perfilSenhaErro: "",
  perfilSenhaMensagem: "",

  // Gestão > sub-aba "Senhas & acessos"
  gestaoAcessosBusca: "",
  gestaoAcessosGrupo: "todos",    // todos | alunos | professores | responsaveis

  // modal "Gerenciar acesso de {pessoa}" — troca de senha e exclusão
  acessoModalAberto: false,
  acessoTipo: "",                 // aluno | professor | responsavel
  acessoDocId: null,              // id do documento (alunos/{id} ou responsaveis/{id}); p/ professor é o próprio uid
  acessoUid: null,                // uid no Firebase Authentication (pode ser null se a pessoa não tem login)
  acessoNome: "",
  acessoEmail: "",                // e-mail de acesso conhecido (pode estar vazio em cadastros antigos)
  acessoDefinindoSenha: false,
  acessoCriandoLogin: false,
  acessoExcluindo: false,
  acessoConfirmandoExclusao: false,
  acessoErro: "",
  acessoMensagem: "",

  // aba "Alunos" da instituição — lista carregada direto da coleção `alunos`
  // (com id de verdade, ao contrário do array resumido salvo em escolas/{id}.alunos)
  instAlunos: null,               // [{id,nome,turma,contato,...}] ou null se ainda não carregou
  instAlunosEscolaId: null,        // escola a que a lista carregada pertence
  instAlunosCarregando: false,
  instAlunosErro: "",

  // aba "Turmas" — turmas de verdade (coleção "turmas"), não o array
  // estático que vinha dentro do documento da escola.
  instTurmas: null,                // [{id,nome,horario,sala,disciplina,professorId,alunos:[nomes]}] ou null
  instTurmasEscolaId: null,        // escola a que a lista carregada pertence
  instTurmasCarregando: false,
  instTurmasErro: "",
  turmaDetalheId: null,            // id da turma aberta no modal de detalhe (lista de alunos)

  // aba "Estatísticas" — presença/frequência de cada turma, calculada em
  // cima da chamada de verdade (coleção "registrosAula"), uma vez que a
  // escola tenha usado a chamada pelo menos algumas vezes.
  instFrequencia: null,            // { [turmaId]: {presentesHoje,totalHoje,temRegistroHoje,frequencia} } ou null
  instFrequenciaEscolaId: null,
  instFrequenciaCarregando: false,
  instFrequenciaErro: "",

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

  // aba "Aniversários"
  aniversarioMes: String(new Date().getMonth() + 1),  // "1".."12" ou "todos"

  alunoDetalheNascimentoInput: "",
  // ficha do aluno > seção "Turmas"
  alunoTurmaSelecionada: "",       // id da turma escolhida no seletor, ainda não adicionada
  alunoTurmaSalvando: false,
  alunoTurmaErro: "",
  alunoTurmaMensagem: "",

  // Aba "Contratos" — formulário do contrato que vai ser gerado.
  // Todo o conteúdo (modelos por CNPJ, cláusulas, cálculo das parcelas)
  // mora em contratos.js; aqui fica só o que o formulário digitou.
  contrato: contratoEstadoInicial(),

  // Aba "Contratos" > "Importar contratos": lê vários
  // PDFs de uma vez, tenta reconhecer os dados de cada um e mostra uma
  // prévia editável antes de gravar qualquer coisa no banco.
  importContratosModalAberto: false,
  importContratosLendo: false,          // true enquanto extrai texto de algum PDF
  importContratosItens: [],             // [{ id, arquivoNome, contrato, avisos, selecionado, criarAcesso, status, erro }]
  importContratosSalvando: false,
  importContratosProgresso: { feito: 0, total: 0 },
  importContratosResumo: null,          // { criados, atualizados, comLogin, pendentes, erros }

  // Contratos pendentes de assinatura: PDF escolhido pra enviar (só na
  // memória da aba — não é gravado em lugar nenhum) e recado do último envio.
  contratoArquivosEnvio: {},            // { [alunoId]: File }
  contratoEnvioMsg: {},                 // { [alunoId]: "texto" }
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
    state.alunoTab = "calendario";
    state.screen = "aluno";
    carregarCalendarioDoAluno(state.data.aluno);
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
    state.familiaTab = "calendario";
    state.screen = "familia";
    carregarCalendarioDoAluno(alunos[0]);
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
    state.professorTab = "calendario";
    state.professorTurmaId = null;
    state.screen = "professor";
    carregarConteudosDoProfessor(state.authUser.uid);
    carregarEventosDoProfessor();
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
      carregarTurmasDaInstituicao(state.escolaSelecionadaId);
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
    nascimento: dados.nascimento || "",   // "AAAA-MM-DD" — alimenta a aba "Aniversários"
    email: dados.email || "",      // e-mail de acesso (login), quando o aluno tem
    uid: dados.uid || null,        // uid no Firebase Auth, quando o aluno tem login
    escolaId: dados.escolaId || "",
    contratoStatus: dados.contratoStatus || "",          // "assinado" | "pendente" | "" (sem contrato registrado)
    contratoEnviadoEm: dados.contratoEnviadoEm || "",    // "AAAA-MM-DD" do último envio pra assinatura
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
    state.cal = calNovoEstado();
    state.screen = "login";
    state.loginCarregando = false;
    render();
    return;
  }
  state.authUser = user;
  state.cal = calNovoEstado();
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
    state.loginErro = mensagemErroCarregamento(err);
    await signOut(auth);
    return; // onAuthStateChanged será chamado de novo com user=null
  }
  render();
});

/* Traduz o erro de carregar o perfil (logo após o login) pra uma frase
   em português. Diferencia dois tipos de erro:
   - os que a GENTE lança de propósito (ex.: "Fale com a secretaria") —
     esses não têm `.code`, já vêm prontos, então é só usar a mensagem;
   - os que o Firestore lança sozinho (têm `.code`, tipo "unavailable")
     — esses vinham em inglês, direto da biblioteca, e apareciam crus na
     tela. Agora ganham uma tradução.
   Sem essa distinção, um erro de conexão aparecia como "Failed to get
   document because the client is offline." direto pro usuário. */
function mensagemErroCarregamento(err){
  if(!err?.code) return err?.message || "Não foi possível carregar seus dados. Tente novamente.";
  if(err.code === "unavailable"){
    return "Não conseguimos falar com o servidor agora. Verifique sua internet (tente outra rede, se puder) e entre de novo. Se continuar acontecendo, avise o suporte técnico.";
  }
  if(err.code === "permission-denied"){
    return "O servidor recusou o acesso (permission-denied). Fale com o suporte técnico.";
  }
  return `Não foi possível carregar seus dados agora (${err.code}). Tente novamente.`;
}

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
    { key:"calendario", label:"Calendário", icon:"calendar" },
    { key:"notas", label:"Notas", icon:"cap" },
    { key:"presenca", label:"Presença", icon:"clipboard" },
    { key:"comunicados", label:"Comunicados", icon:"megaphone" },
  ];

  let body = "";
  if(state.alunoTab === "calendario") body = calendarioAlunoView(student, "aluno");
  else if(state.alunoTab === "notas") body = notasView(student);
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
    { key:"calendario", label:"Calendário", icon:"calendar" },
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
  if(state.familiaTab === "calendario") body = calendarioAlunoView(student, "responsavel");
  else if(state.familiaTab === "notas") body = notasView(student);
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

/* ================================================================== */
/* Calendário (aluno / responsável / professor)                         */
/* ================================================================== */
/* A parte visual e as regras de cores estão em calendario.js. Aqui ficam
   só o estado, a leitura/gravação no Firestore e a ligação com as telas. */
function calNovoEstado(){
  const hoje = new Date();
  return {
    ano: hoje.getFullYear(),
    mes: hoje.getMonth(),        // 0–11
    diaAberto: null,             // "AAAA-MM-DD" do pop-up aberto
    cache: {},                   // { [alunoId]: { presencas, eventos, carregando, erro, carregadoEm } }
    prof: { eventos: [], carregando: false, erro: "", carregadoEm: 0 },
    form: null,                  // formulário de novo aviso (professor) — null = fechado
    excluirConfirmId: null,      // aviso esperando o 2º toque de "Confirmar exclusão"
    excluindoId: null,
  };
}

const CALENDARIO_ATUALIZA_APOS_MS = 60 * 1000;   // reabrir a aba dentro de 1 min não busca de novo

function mensagemErroCalendario(err){
  console.error("Erro no calendário:", err?.code, err);
  const codigo = err?.code ? ` (${err.code})` : "";
  if(err?.code === "permission-denied"){
    return `O servidor não liberou a leitura do calendário${codigo}. Avise o suporte técnico.`;
  }
  if(err?.code === "failed-precondition"){
    return `O Firestore pediu um índice para montar o calendário${codigo}. Avise o suporte técnico (o link para criar aparece no console do navegador, F12).`;
  }
  return `Não foi possível carregar o calendário agora${codigo}. Tente de novo.`;
}

/* Aluno atualmente na tela do calendário (o próprio aluno, ou o filho
   escolhido no seletor da família). */
function calAlunoAtual(){
  if(state.screen === "aluno") return state.data.aluno;
  if(state.screen === "familia"){
    return state.data.familiaAlunos.find(s => s.id === state.familiaStudentId) || state.data.familiaAlunos[0] || null;
  }
  return null;
}

/* Busca presenças (copiadas da chamada) e avisos que valem pra esse aluno.
   As duas consultas filtram por escolaId (as regras do Firestore precisam
   disso pra liberar a leitura) e pela chave do aluno. */
async function carregarCalendarioDoAluno(student, forcar = false){
  if(!student) return;
  const cal = state.cal;   // guarda a referência: se a pessoa sair no meio, o resultado cai no estado antigo
  const cache = cal.cache[student.id] || (cal.cache[student.id] = { presencas: [], eventos: [], carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const chave = chaveAluno(student.escolaId, student.nome);
    const [presSnap, evSnap] = await Promise.all([
      getDocs(query(collection(db, "presencasAluno"), where("escolaId", "==", student.escolaId), where("alunoKey", "==", chave))),
      getDocs(query(collection(db, "eventosCalendario"), where("escolaId", "==", student.escolaId), where("destinatarios", "array-contains", chave))),
    ]);
    cache.presencas = presSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    cache.eventos = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    cache.carregadoEm = Date.now();
  } catch(err){
    cache.erro = mensagemErroCalendario(err);
  } finally {
    cache.carregando = false;
    render();
  }
}

/* Avisos e lembretes que o professor logado criou. */
async function carregarEventosDoProfessor(forcar = false){
  const cal = state.cal;
  const prof = cal.prof;
  if(prof.carregando) return;
  if(!forcar && prof.carregadoEm && Date.now() - prof.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  prof.carregando = true;
  prof.erro = "";
  render();
  try {
    const snaps = await getDocs(query(collection(db, "eventosCalendario"), where("professorId", "==", state.authUser.uid)));
    prof.eventos = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
    prof.carregadoEm = Date.now();
  } catch(err){
    prof.erro = mensagemErroCalendario(err);
  } finally {
    prof.carregando = false;
    render();
  }
}

function calendarioAlunoView(student, papel){
  const cal = state.cal;
  const dados = cal.cache[student.id] || { presencas: [], eventos: [], carregando: false, erro: "" };
  return calendarioHtml({
    papel,
    ano: cal.ano, mes: cal.mes,
    dias: montarDias({ presencas: dados.presencas, eventos: dados.eventos, papel }),
    hoje: hojeISO(),
    carregando: dados.carregando,
    erro: dados.erro,
    diaAberto: cal.diaAberto,
    podeCriar: false,
  });
}

function calendarioProfessorView(){
  const cal = state.cal;
  return calendarioHtml({
    papel: "professor",
    ano: cal.ano, mes: cal.mes,
    dias: montarDias({ eventos: cal.prof.eventos, papel: "professor" }),
    hoje: hojeISO(),
    carregando: cal.prof.carregando,
    erro: cal.prof.erro,
    diaAberto: cal.diaAberto,
    podeCriar: true,
    excluirConfirmId: cal.excluirConfirmId,
    excluindoId: cal.excluindoId,
  }) + eventoFormModalHtml({ form: cal.form, turmas: state.data.professorTurmas });
}

/* Chamada salva -> grava também uma cópia por aluno em "presencasAluno".
   É essa cópia que o aluno e o responsável leem (a chamada em
   "registrosAula" tem TODOS os alunos da turma juntos, não dá pra abrir
   pra eles). O id é fixo (turma + dia + aluno), então salvar de novo a
   chamada do mesmo dia só sobrescreve. */
async function sincronizarCalendarioDaChamada(turma, presencas, observacoesAlunos, disciplina){
  const data = dataDeHojeISO();
  const nomes = turma.alunos || [];
  const agora = new Date().toISOString();
  for(let i = 0; i < nomes.length; i += 400){   // um lote do Firestore aceita até 500 gravações
    const lote = writeBatch(db);
    nomes.slice(i, i + 400).forEach((nome, j) => {
      lote.set(doc(db, "presencasAluno", `${turma.id}_${data}_${slugNome(nome, `aluno${i + j}`)}`), {
        alunoKey: chaveAluno(turma.escolaId, nome),
        alunoNome: nome,
        escolaId: turma.escolaId,
        turmaId: turma.id,
        turmaNome: turma.nome || "",
        disciplina: disciplina || turma.disciplina || "",
        data,
        status: presencas[nome] || "presente",
        observacao: String(observacoesAlunos[nome] || "").trim(),
        professorId: state.authUser.uid,
        professorNome: state.data.professorNome || "",
        atualizadoEm: agora,
      });
    });
    await lote.commit();
  }
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
    { key:"calendario", label:"Calendário", icon:"calendar" },
    { key:"aulas", label:"Aulas & chamada", icon:"clipboard" },
    { key:"conteudos", label:"Conteúdos", icon:"book" },
    { key:"avaliacoes", label:"Notas & atividades", icon:"cap" },
  ];
  const body = state.professorTab === "calendario" ? calendarioProfessorView()
    : state.professorTab === "aulas" ? professorAulasView()
    : state.professorTab === "conteudos" ? professorConteudosView()
    : professorAvaliacoesView();

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
    { key:"turmas", label:"Turmas", icon:"clipboard" },
    { key:"estatisticas", label:"Estatísticas", icon:"chart" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"alunos", label:"Alunos", icon:"users" },
    { key:"aniversarios", label:"Aniversários", icon:"cake" },
    { key:"professores", label:"Professores", icon:"users2" },
    { key:"responsaveis", label:"Responsáveis", icon:"users2" },
    { key:"contratos", label:"Contratos", icon:"fileText" },
    { key:"gestao", label:"Gestão", icon:"building" },
    { key:"perfil", label:"Meu perfil", icon:"user" },
  ];

  let body = "";
  if(state.instTab === "turmas") body = turmasView(school);
  else if(state.instTab === "estatisticas") body = estatisticasView(school);
  else if(state.instTab === "financeiro") body = financeiroInstituicaoView(school);
  else if(state.instTab === "alunos") body = alunosView(school);
  else if(state.instTab === "aniversarios") body = aniversariosView(school);
  else if(state.instTab === "professores") body = professoresView(school);
  else if(state.instTab === "responsaveis") body = responsaveisView(school);
  else if(state.instTab === "contratos") body = contratosView(school);
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
  }) + alunoDetalheModal() + turmaDetalheModal() + professorTurmasModal() + editarProfessorModal() + importarTurmasModal() + responsavelVinculoModal() + acessoUsuarioModal() + contratoModal(state.contrato, {
    cursos: cursosDaEscola(school?.nome || ""),
    alunos: state.instAlunos || [],
    turmas: state.instTurmas || [],
  }) + importarContratosModal(state, {
    cursos: cursosDaEscola(school?.nome || ""),
    turmas: state.instTurmas || [],
  });
}

function gestaoInstituicaoView(school){
  const subTabs = [
    { key: "cadastro", label: "Criar cadastro", icon: ICONS.user },
    { key: "acessos", label: "Senhas & acessos", icon: ICONS.key },
  ];
  const subNav = `<div class="subtab-bar">${subTabs.map(t => `
    <button type="button" class="subtab-btn ${state.gestaoSubTab === t.key ? "active" : ""}" data-action="set-gestao-subtab" data-key="${t.key}">
      ${t.icon}<span>${t.label}</span>
    </button>`).join("")}</div>`;

  let corpo;
  if(state.gestaoSubTab === "acessos") corpo = gestaoAcessosView();
  else corpo = gestaoCadastroView(school);

  return `
    <h2 class="section-title">Gestão da unidade</h2>
    <p class="section-eyebrow">Cadastros e senhas de ${escapeHtml(school.nome)}. Os contratos agora têm aba própria no menu. Para editar turmas de professores e vínculos de responsáveis, veja as abas "Professores" e "Responsáveis" no menu.</p>
    ${subNav}
    ${corpo}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Aba "Professores": lista de quem já está cadastrado na unidade, com um
   modal por professor pra ver/criar turmas dele. Antes vivia junto com
   "Responsáveis" numa aba só; agora cada um tem seu próprio menu. */
function professoresView(school){
  return `
    <h2 class="section-title">Professores</h2>
    <p class="section-eyebrow">Turmas de cada professor de ${escapeHtml(school.nome)}.</p>
    ${professoresSection()}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Aba "Responsáveis": lista de responsáveis cadastrados, com modal pra
   ajustar os alunos vinculados a cada um. */
function responsaveisView(school){
  return `
    <h2 class="section-title">Responsáveis</h2>
    <p class="section-eyebrow">Alunos vinculados a cada responsável de ${escapeHtml(school.nome)}.</p>
    ${responsaveisSection()}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Sub-aba "Criar cadastro": formulário único de matrícula/login de
   aluno, responsável, professor e equipe administrativa. */
function gestaoCadastroView(school){
  const role = state.novoUsuarioRole;
  const precisaLogin = role === "professor" || role === "instituicao" || role === "aluno" || role === "responsavel";

  const escolasDisponiveis = Object.entries(state.data.escolas || {}).map(([id, e]) => ({ id, nome: e.nome }));

  const cursosDisponiveis = role === "professor"
    ? cursosDasEscolas(state.novoUsuarioEscolasIds.length ? state.novoUsuarioEscolasIds : [state.escolaSelecionadaId])
    : cursosDaEscola(school.nome);

  const campoTurma = role === "aluno" ? `
        <label class="teacher-label" for="new-user-turma" style="margin-top:2px;">Curso</label>
        <select id="new-user-turma" class="teacher-text-input">
          <option value="" ${!state.novoUsuarioTurma ? "selected" : ""} disabled>Selecione o curso</option>
          ${cursosDisponiveis.map(curso => `<option value="${escapeHtml(curso)}" ${state.novoUsuarioTurma === curso ? "selected" : ""}>${escapeHtml(curso)}</option>`).join("")}
        </select>` : "";

  // Só mostra o seletor de unidade(s) se a instituição tiver mais de uma
  // escola vinculada — professor de unidade única não precisa escolher.
  const campoEscolasProfessor = (role === "professor" && escolasDisponiveis.length > 1) ? `
        <div class="responsavel-vinculo-list" style="margin-top:8px;">
          <p class="section-eyebrow" style="margin:6px 0 4px;">Dá aula em qual(is) unidade(s)?</p>
          ${escolasDisponiveis.map(esc => `
            <label class="responsavel-vinculo-item">
              <input type="checkbox" data-action="toggle-escola-professor" data-escola="${escapeHtml(esc.id)}" ${state.novoUsuarioEscolasIds.includes(esc.id) ? "checked" : ""} />
              <span>${escapeHtml(esc.nome)}</span>
            </label>`).join("")}
        </div>` : "";

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
    ? `Combine a senha provisória com a pessoa por fora — se precisar trocar depois, é em Gestão > Senhas & acessos.`
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
      ${campoEscolasProfessor}
      ${campoDisciplina}
      ${campoVinculo}
      ${campoContato}
      ${campoLogin}
      <button class="teacher-primary-btn" data-action="create-user" ${state.novoUsuarioSalvando ? "disabled" : ""}>${rotuloBotao}</button>
      ${state.instituicaoErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.instituicaoErro)}</p>` : ""}
      <p class="section-eyebrow" style="margin-top:8px;">${textoRodape}</p>
    </div>`;
}

/* ------------------------------------------------------------------
   Sub-aba "Senhas & acessos": um lugar só pra secretaria achar qualquer
   pessoa da unidade (aluno, professor ou responsável), trocar a senha
   dela e, se precisar, excluir o cadastro. Antes isso estava espalhado
   (senha não existia; excluir aluno só dentro da ficha; excluir
   responsável não existia) e qualquer troca de senha virava chamado pro
   desenvolvedor.
   ------------------------------------------------------------------ */
function gestaoAcessosView(){
  const busca = (state.gestaoAcessosBusca || "").trim().toLowerCase();
  const grupo = state.gestaoAcessosGrupo || "todos";

  const filtros = [
    { key: "todos", label: "Todos" },
    { key: "alunos", label: "Alunos" },
    { key: "professores", label: "Professores" },
    { key: "responsaveis", label: "Responsáveis" },
  ];
  const filtroHtml = `<div class="acesso-filtros">${filtros.map(f => `
    <button type="button" class="acesso-filtro ${grupo === f.key ? "active" : ""}" data-action="set-acessos-grupo" data-key="${f.key}">${f.label}</button>`).join("")}</div>`;

  const carregando = state.instAlunosCarregando || state.gestaoEquipeCarregando;

  // Monta uma lista única, com o tipo de cada pessoa junto, pra poder
  // buscar por nome sem se importar com a aba em que ela "mora".
  const pessoas = [];
  if(grupo === "todos" || grupo === "alunos"){
    (state.instAlunos || []).forEach(a => pessoas.push({
      tipo: "aluno", docId: a.id, uid: a.uid || null,
      nome: a.nome, detalhe: a.turma || "Sem curso", email: a.email || "",
    }));
  }
  if(grupo === "todos" || grupo === "professores"){
    (state.gestaoProfessores || []).forEach(p => pessoas.push({
      tipo: "professor", docId: p.id, uid: p.id,
      nome: p.nome, detalhe: (p.disciplinas || []).join(", ") || "Sem disciplina", email: p.email || "",
    }));
  }
  if(grupo === "todos" || grupo === "responsaveis"){
    (state.gestaoResponsaveis || []).forEach(r => pessoas.push({
      tipo: "responsavel", docId: r.id, uid: r.uid || null,
      nome: r.nome,
      detalhe: `${(r.alunosIds || []).length} ${(r.alunosIds || []).length === 1 ? "aluno vinculado" : "alunos vinculados"}`,
      email: r.email || "",
    }));
  }

  const rotuloTipo = { aluno: "Aluno", professor: "Professor", responsavel: "Responsável" };
  const filtradas = pessoas
    .filter(p => !busca || p.nome.toLowerCase().includes(busca) || (p.email || "").toLowerCase().includes(busca))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  let linhas;
  if(carregando){
    linhas = `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando pessoas da unidade…</div>`;
  } else if(filtradas.length === 0){
    linhas = `<div style="padding:20px;font-size:14px;color:var(--slate);">Ninguém encontrado com esse nome nesta unidade.</div>`;
  } else {
    linhas = filtradas.map(p => `
      <button type="button" class="row aluno-row" data-action="abrir-acesso-usuario"
        data-tipo="${escapeHtml(p.tipo)}" data-id="${escapeHtml(p.docId)}" data-uid="${escapeHtml(p.uid || "")}"
        data-nome="${escapeHtml(p.nome)}" data-email="${escapeHtml(p.email)}">
        <span style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;">
          <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(p.nome)}</span>
          <span style="font-size:12.5px;color:var(--slate);">${escapeHtml(rotuloTipo[p.tipo])} · ${escapeHtml(p.detalhe)}</span>
        </span>
        <span style="font-size:12.5px;color:var(--slate);display:flex;align-items:center;gap:8px;">
          ${p.uid ? "Tem login" : "Sem login"} ${ICONS.chevronRight}
        </span>
      </button>`).join("");
  }

  return `
    <div class="management-card management-card-wide">
      <h3>Senhas & acessos</h3>
      <p>Toque numa pessoa para trocar a senha, reenviar o link de acesso ou excluir o cadastro dela.</p>
      ${filtroHtml}
      <div class="search-wrap" style="margin:10px 0 12px;">
        ${ICONS.search}
        <input class="search-input" id="gestao-acessos-busca" placeholder="Buscar por nome ou e-mail" value="${escapeHtml(state.gestaoAcessosBusca)}" />
      </div>
      <div class="card flush">${linhas}</div>
      ${state.gestaoEquipeErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:10px;">${escapeHtml(state.gestaoEquipeErro)}</p>` : ""}
      <p class="section-eyebrow" style="margin-top:10px;">A equipe administrativa troca a própria senha em "Meu perfil".</p>
    </div>`;
}

/* Modal "Gerenciar acesso": as três coisas que a secretaria precisa
   resolver sozinha — mandar o link de redefinição, definir uma senha na
   hora (quando a pessoa não tem e-mail de verdade, o caso mais comum
   com aluno) e excluir o cadastro. */
function acessoUsuarioModal(){
  if(!state.acessoModalAberto) return "";

  const rotuloTipo = { aluno: "Aluno", professor: "Professor", responsavel: "Responsável" };
  const temLogin = !!state.acessoUid;
  const podeExcluir = state.acessoTipo !== "aluno" || !!(state.instAlunos || []).find(a => a.id === state.acessoDocId);

  const blocoSemLogin = `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Criar acesso</h3>
        <p class="section-eyebrow" style="margin:0 0 8px;">Esta pessoa ainda não tem login. Defina um e-mail e uma senha para ela entrar no app.</p>
        <input id="acesso-email" type="email" class="teacher-text-input" placeholder="E-mail de acesso" value="${escapeHtml(state.acessoEmail)}" />
        <input id="acesso-nova-senha" type="text" class="teacher-text-input" style="margin-top:8px;" placeholder="Senha (mín. 6 caracteres)" />
        <button type="button" class="teacher-primary-btn" data-action="criar-login-acesso" ${state.acessoCriandoLogin ? "disabled" : ""}>${state.acessoCriandoLogin ? "Criando…" : "Criar acesso"}</button>
      </div>`;

  const blocoComLogin = `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Trocar senha</h3>
        ${state.acessoEmail ? `<p class="section-eyebrow" style="margin:0 0 8px;">Login: <strong style="color:var(--ink);">${escapeHtml(state.acessoEmail)}</strong></p>` : ""}
        <input id="acesso-nova-senha" type="text" class="teacher-text-input" placeholder="Nova senha (mín. 6 caracteres)" />
        <button type="button" class="teacher-primary-btn" data-action="definir-senha-acesso" ${state.acessoDefinindoSenha ? "disabled" : ""}>${state.acessoDefinindoSenha ? "Salvando…" : "Salvar nova senha"}</button>
        <p class="section-eyebrow" style="margin-top:8px;">Combine a nova senha com a pessoa por fora — ela já entra com ela no próximo login.</p>
      </div>`;

  const blocoExcluir = state.acessoConfirmandoExclusao ? `
      <div class="aluno-modal-confirm">
        <p>Tem certeza? Isso apaga o cadastro${temLogin ? " e o acesso" : ""} de ${escapeHtml(state.acessoNome)} nesta unidade e não pode ser desfeito.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn-danger" data-action="confirmar-exclusao-acesso" ${state.acessoExcluindo ? "disabled" : ""}>${state.acessoExcluindo ? "Excluindo…" : `${ICONS.trash} Sim, excluir`}</button>
          <button type="button" class="btn-secondary" data-action="cancelar-exclusao-acesso" ${state.acessoExcluindo ? "disabled" : ""}>Cancelar</button>
        </div>
      </div>` : `
      <button type="button" class="btn-danger" data-action="iniciar-exclusao-acesso">${ICONS.trash} Excluir ${escapeHtml((rotuloTipo[state.acessoTipo] || "usuário").toLowerCase())}</button>`;

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-acesso-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Gerenciar acesso" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>${escapeHtml(state.acessoNome)}</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(rotuloTipo[state.acessoTipo] || "")} · ${temLogin ? "com login" : "sem login"}</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-acesso-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>

      ${temLogin ? blocoComLogin : blocoSemLogin}

      ${state.acessoErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin:4px 0;">${escapeHtml(state.acessoErro)}</p>` : ""}
      ${state.acessoMensagem ? `<p class="teacher-success" style="margin:4px 0;">${escapeHtml(state.acessoMensagem)}</p>` : ""}

      ${podeExcluir ? `<div class="aluno-modal-section aluno-modal-danger">${blocoExcluir}</div>` : ""}
    </div>
  </div>`;
}

/* Contratos que foram importados como "pendente de assinatura". Enquanto
   a validação por link não existe, o fluxo é: escolher o PDF, mandar pro
   responsável pelo WhatsApp e, quando voltar assinado, marcar aqui. O PDF
   não fica guardado no sistema (só a situação), por isso é preciso
   escolher o arquivo de novo se a página foi recarregada. */
function contratosPendentesCard(){
  if(state.instAlunosCarregando || state.gestaoEquipeCarregando){
    return `<div class="management-card management-card-wide" style="max-width:none;"><h3>Aguardando assinatura</h3><p>Carregando…</p></div>`;
  }
  const pendentes = (state.instAlunos || [])
    .filter(a => a.contratoStatus === "pendente")
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if(!pendentes.length) return "";

  const linhas = pendentes.map(a => {
    const destino = destinoDoContratoDoAluno(a);
    const arquivo = state.contratoArquivosEnvio[a.id];
    const msg = state.contratoEnvioMsg[a.id];
    const enviado = a.contratoEnviadoEm ? `Enviado em ${a.contratoEnviadoEm.split("-").reverse().join("/")}` : "Ainda não enviado";
    return `
      <div class="pendente-contrato-item">
        <div class="pendente-contrato-info">
          <strong>${escapeHtml(a.nome)}</strong>
          <span>${destino.numero ? `Enviar para ${escapeHtml(destino.nome)}` : `Sem WhatsApp cadastrado (${escapeHtml(destino.nome)})`} · ${enviado}</span>
          ${msg ? `<span class="pendente-contrato-msg">${escapeHtml(msg)}</span>` : ""}
        </div>
        <div class="pendente-contrato-acoes">
          <label class="pendente-contrato-anexar">
            ${ICONS.upload} <span>${arquivo ? escapeHtml(arquivo.name) : "Escolher PDF"}</span>
            <input type="file" accept="application/pdf" data-contrato-envio="${a.id}" style="display:none;" />
          </label>
          <button type="button" class="aniversario-btn" data-action="contrato-pendente-enviar" data-aluno="${a.id}" ${arquivo ? "" : "disabled"}>Enviar no WhatsApp</button>
          <button type="button" class="pendente-contrato-assinado" data-action="contrato-pendente-assinado" data-aluno="${a.id}">Marcar como assinado</button>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="management-card management-card-wide" style="max-width:none;">
      <h3>Aguardando assinatura (${pendentes.length})</h3>
      <p>Escolha o PDF do contrato, envie pelo WhatsApp e, quando voltar assinado, marque como assinado.</p>
      <div class="pendente-contrato-lista">${linhas}</div>
    </div>`;
}

/* Aba "Contratos": gerar contrato, importar PDFs e acompanhar quem ainda
   não assinou. Antes vivia como sub-aba dentro de "Gestão". */
function contratosView(school){
  return `
    <h2 class="section-title">Contratos</h2>
    <p class="section-eyebrow">Gere, importe e acompanhe a assinatura dos contratos de ${escapeHtml(school.nome)}.</p>
    ${contratosPendentesCard()}
    <div class="management-grid">
      <div class="management-card">
        <h3>Contratos</h3>
        <p>Monte o contrato de prestação de serviços já preenchido, pronto para imprimir ou salvar em PDF e colher as assinaturas.</p>
        <button class="teacher-primary-btn" data-action="abrir-contrato-modal">${ICONS.fileText} Gerar contrato</button>
        <p class="section-eyebrow" style="margin-top:8px;">O modelo (Salto do Lontra ou Nova Prata do Iguaçu) é definido pelo CNPJ escolhido.</p>
      </div>
      <div class="management-card">
        <h3>Importar contratos</h3>
        <p>Envie os PDFs dos contratos e o sistema cadastra os alunos (e responsáveis) de uma vez, com uma prévia pra conferir antes de salvar. Pra cada contrato você diz se já foi assinado e em qual turma o aluno entra.</p>
        <button class="teacher-primary-btn" data-action="abrir-importar-contratos-modal">${ICONS.upload} Importar contratos</button>
        <p class="section-eyebrow" style="margin-top:8px;">Funciona melhor com os PDFs do próprio modelo da escola — outros formatos podem vir com campos em branco pra preencher na mão.</p>
      </div>
    </div>
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Seção "Professores": lista quem já está cadastrado na unidade e permite
   abrir um modal por pessoa com as turmas dele. */
function professoresSection(){
  if(state.gestaoEquipeCarregando){
    return `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando professores…</div>`;
  }
  if(state.gestaoEquipeErro){
    return `<div style="padding:20px;font-size:14px;color:var(--red,#C4544A);">${escapeHtml(state.gestaoEquipeErro)}</div>`;
  }
  const professores = state.gestaoProfessores || [];
  const linhasProfessores = professores.map(p => `
    <div class="row aluno-row" style="cursor:default;">
      <button type="button" data-action="abrir-professor-turmas" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" style="flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:none;border:none;text-align:left;cursor:pointer;padding:0;">
        <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(p.nome)}</span>
        <span style="font-size:12.5px;color:var(--slate);">${escapeHtml(p.disciplinas.join(", ") || "Sem disciplina definida")}</span>
      </button>
      <span style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="attendance-btn" data-action="abrir-acesso-usuario" data-tipo="professor" data-id="${escapeHtml(p.id)}" data-uid="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" data-email="${escapeHtml(p.email || "")}" aria-label="Senha e acesso">${ICONS.key}</button>
        <button type="button" class="attendance-btn" data-action="abrir-editar-professor" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" aria-label="Editar professor">${ICONS.pencil}</button>
        <button type="button" class="attendance-btn" data-action="confirmar-excluir-professor" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" aria-label="Excluir professor" ${state.editProfessorExcluindoId === p.id ? "disabled" : ""}>${state.editProfessorExcluindoId === p.id ? "…" : ICONS.trash}</button>
      </span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum professor cadastrado nesta unidade ainda.</div>`;

  return `
    <div class="management-card management-card-wide">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div><h3>Professores</h3><p>Toque num professor pra ver as turmas dele.</p></div>
      </div>
      <div class="card flush">${linhasProfessores}</div>
    </div>`;
}

/* Seção "Responsáveis": lista quem já está cadastrado na unidade e permite
   abrir um modal por pessoa com os alunos vinculados. */
function responsaveisSection(){
  if(state.gestaoEquipeCarregando){
    return `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando responsáveis…</div>`;
  }
  if(state.gestaoEquipeErro){
    return `<div style="padding:20px;font-size:14px;color:var(--red,#C4544A);">${escapeHtml(state.gestaoEquipeErro)}</div>`;
  }
  const responsaveis = state.gestaoResponsaveis || [];
  const linhasResponsaveis = responsaveis.map(r => `
    <div class="row aluno-row" style="cursor:default;">
      <button type="button" data-action="abrir-responsavel-vinculos" data-id="${escapeHtml(r.id)}" data-nome="${escapeHtml(r.nome)}" style="flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:none;border:none;text-align:left;cursor:pointer;padding:0;">
        <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(r.nome)}</span>
        <span style="font-size:12.5px;color:var(--slate);">${r.alunosIds.length} ${r.alunosIds.length === 1 ? "aluno vinculado" : "alunos vinculados"}${r.uid ? "" : " · sem login"}</span>
      </button>
      <span style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="attendance-btn" data-action="abrir-acesso-usuario" data-tipo="responsavel" data-id="${escapeHtml(r.id)}" data-uid="${escapeHtml(r.uid || "")}" data-nome="${escapeHtml(r.nome)}" data-email="${escapeHtml(r.email || "")}" aria-label="Senha e acesso">${ICONS.key}</button>
        <button type="button" class="attendance-btn" data-action="abrir-acesso-usuario" data-tipo="responsavel" data-id="${escapeHtml(r.id)}" data-uid="${escapeHtml(r.uid || "")}" data-nome="${escapeHtml(r.nome)}" data-email="${escapeHtml(r.email || "")}" data-excluir="1" aria-label="Excluir responsável">${ICONS.trash}</button>
      </span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum responsável cadastrado nesta unidade ainda.</div>`;

  return `
    <div class="management-card management-card-wide">
      <h3>Responsáveis</h3><p>Toque num responsável pra ajustar os alunos vinculados.</p>
      <div class="card flush">${linhasResponsaveis}</div>
    </div>`;
}

/* Modal "Turmas de {professor}" — lista as turmas já criadas para o
   professor (coleção "turmas") e um formulário pra criar uma nova,
   escolhendo disciplina (dentre as do próprio professor) e os alunos
   da unidade que vão fazer parte dela. */
function professorTurmasModal(){
  if(!state.profTurmasModalAberto) return "";
  const professor = (state.gestaoProfessores || []).find(p => p.id === state.profTurmasModalId);
  const disciplinasProfessor = professor ? professor.disciplinas : [];

  // Seletor de professor: aparece sempre, pra dar pra criar/ver turmas de
  // qualquer professor a partir daqui (não só clicando num professor
  // específico na lista da aba "Professores").
  const professoresDisponiveis = state.gestaoProfessores || [];
  const seletorProfessorHtml = `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Professor</h3>
      ${state.gestaoEquipeCarregando
        ? `<p class="section-eyebrow" style="margin:6px 0;">Carregando professores…</p>`
        : professoresDisponiveis.length === 0
          ? `<p class="section-eyebrow" style="margin:6px 0;">Nenhum professor cadastrado nesta unidade ainda.</p>`
          : `<select id="turma-modal-professor" class="teacher-text-input">
              <option value="" ${!state.profTurmasModalId ? "selected" : ""} disabled>Selecione o professor</option>
              ${professoresDisponiveis.map(p => `<option value="${escapeHtml(p.id)}" ${state.profTurmasModalId === p.id ? "selected" : ""}>${escapeHtml(p.nome)}</option>`).join("")}
            </select>`}
    </div>`;

  if(!professor){
    return `
    <div class="aluno-modal-backdrop" data-action="fechar-professor-turmas-modal">
      <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Nova turma" data-action="noop">
        <div class="aluno-modal-head">
          <div><h2>Nova turma</h2><p class="section-eyebrow" style="margin:2px 0 0;">Escolha o professor pra ver as turmas dele ou criar uma nova.</p></div>
          <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-professor-turmas-modal" aria-label="Fechar">${ICONS.close}</button>
        </div>
        ${seletorProfessorHtml}
      </div>
    </div>`;
  }

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

      ${seletorProfessorHtml}

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Turmas já criadas</h3>
        ${listaTurmasHtml}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Nova turma</h3>
        <input id="nova-turma-nome" class="teacher-text-input" placeholder="Nome da turma (ex.: Inglês — Turma A)" value="${escapeHtml(state.novaTurmaNome)}" />
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

/* Modal "Editar professor" — troca o nome e as disciplinas do professor.
   Atualiza tanto o cadastro em "usuarios/{uid}" quanto todos os vínculos
   dele em "escolaProfessores" (um por unidade em que dá aula), pra manter
   os dois em sincronia — ver salvarEdicaoProfessor(). */
function editarProfessorModal(){
  if(!state.editProfessorModalAberto) return "";
  const disciplinasDisponiveis = cursosDaEscola(state.data.escolas?.[state.escolaSelecionadaId]?.nome || "");
  const opcoesDisciplinas = disciplinasDisponiveis.map(curso => `
    <label class="responsavel-vinculo-item">
      <input type="checkbox" data-action="toggle-disciplina-editar-professor" data-curso="${escapeHtml(curso)}" ${state.editProfessorDisciplinas.includes(curso) ? "checked" : ""} />
      <span>${escapeHtml(curso)}</span>
    </label>`).join("");

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-editar-professor-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Editar professor" data-action="noop">
      <div class="aluno-modal-head">
        <div><h2>Editar professor</h2></div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-editar-professor-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Nome</h3>
        <input id="edit-professor-nome" class="teacher-text-input" placeholder="Nome completo" value="${escapeHtml(state.editProfessorNome)}" />
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Disciplinas</h3>
        <div class="responsavel-vinculo-list">${opcoesDisciplinas}</div>
      </div>

      <div class="aluno-modal-section">
        <button type="button" class="teacher-primary-btn" data-action="salvar-edicao-professor" ${state.editProfessorSalvando ? "disabled" : ""}>${state.editProfessorSalvando ? "Salvando…" : "Salvar alterações"}</button>
        ${state.editProfessorErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.editProfessorErro)}</p>` : ""}
      </div>
    </div>
  </div>`;
}

/* Modal "Importar turmas" — a secretaria cola o texto copiado do PDF de
   horários (formato "TURMA DIA HORÁRIO PROFESSOR(A)", uma turma por
   linha), revisa a prévia (pode corrigir o professor casado errado, a
   disciplina, ou desmarcar linhas) e só então confirma a gravação. */
function importarTurmasModal(){
  if(!state.importTurmasModalAberto) return "";
  const escola = state.data.escolas?.[state.escolaSelecionadaId];
  const cursosDisponiveis = cursosDaEscola(escola?.nome || "");
  const professores = state.gestaoProfessores || [];

  const areaUploadHtml = `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Enviar o PDF da lista de turmas</h3>
      <p class="section-eyebrow" style="margin:0 0 10px;">O texto é lido aqui mesmo no navegador — o arquivo não é enviado pra nenhum servidor.</p>
      <label class="upload-dropzone${state.importTurmasLendoPdf ? " is-loading" : ""}" for="import-turmas-pdf-file">
        <span class="upload-dropzone-icon">${state.importTurmasLendoPdf ? ICONS.spinner : ICONS.upload}</span>
        <span class="upload-dropzone-text">
          <strong>${state.importTurmasLendoPdf ? "Lendo o PDF…" : (state.importTurmasArquivoNome ? state.importTurmasArquivoNome : "Toque pra escolher o PDF")}</strong>
          <span>${state.importTurmasArquivoNome && !state.importTurmasLendoPdf ? "Toque pra escolher outro arquivo" : "PDF com a lista de turmas da unidade"}</span>
        </span>
        <input type="file" id="import-turmas-pdf-file" accept="application/pdf" style="display:none;" ${state.importTurmasLendoPdf ? "disabled" : ""} />
      </label>
      ${state.importTurmasErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:10px;">${escapeHtml(state.importTurmasErro)}</p>` : ""}
    </div>`;

  let previewHtml = "";
  if(state.importTurmasPreview && state.importTurmasPreview.length){
    const linhasHtml = state.importTurmasPreview.map((linha, i) => {
      const opcoesProfessor = `<option value="" ${!linha.professorId ? "selected" : ""}>— não encontrado —</option>` +
        professores.map(p => `<option value="${escapeHtml(p.id)}" ${linha.professorId === p.id ? "selected" : ""}>${escapeHtml(p.nome)}</option>`).join("");
      const opcoesDisciplina = cursosDisponiveis.map(c => `<option value="${escapeHtml(c)}" ${linha.disciplina === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
      return `
      <div class="aluno-modal-resp-item" style="align-items:flex-start;flex-wrap:wrap;gap:8px;${linha.selecionada ? "" : "opacity:.5;"}">
        <label style="display:flex;gap:8px;align-items:flex-start;flex:1;min-width:220px;">
          <input type="checkbox" data-action="toggle-importar-linha" data-row="${i}" ${linha.selecionada ? "checked" : ""} style="margin-top:3px;" />
          <span>
            <span style="font-weight:600;color:var(--ink);font-size:13.5px;display:block;">${escapeHtml(linha.turmaRaw)}</span>
            <span style="color:var(--slate);font-size:12px;">${escapeHtml(linha.diaRaw)} · ${escapeHtml(linha.horarioRaw)}${!linha.professorId ? " · professor não encontrado, escolha ao lado" : ""}</span>
          </span>
        </label>
        <select class="teacher-text-input" style="width:auto;min-width:150px;" data-import-field="professorId" data-row="${i}">${opcoesProfessor}</select>
        <select class="teacher-text-input" style="width:auto;min-width:120px;" data-import-field="disciplina" data-row="${i}">${opcoesDisciplina}</select>
      </div>`;
    }).join("");
    const semProfessor = state.importTurmasPreview.filter(l => !l.professorId).length;
    previewHtml = `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Prévia — ${state.importTurmasPreview.length} turma(s) encontradas${semProfessor ? `, ${semProfessor} sem professor casado` : ""}</h3>
        <div class="aluno-modal-resp-list">${linhasHtml}</div>
        <button type="button" class="teacher-primary-btn" style="margin-top:10px;" data-action="confirmar-importar-turmas" ${state.importTurmasSalvando ? "disabled" : ""}>${state.importTurmasSalvando ? "Importando…" : "Confirmar e criar turmas"}</button>
      </div>`;
  }

  const resultadoHtml = state.importTurmasResultado ? `
    <div class="aluno-modal-section">
      <p class="teacher-success">${state.importTurmasResultado.criadas} turma(s) criada(s).
        ${state.importTurmasResultado.puladasDuplicadas ? ` ${state.importTurmasResultado.puladasDuplicadas} já existia(m) e foram puladas.` : ""}
        ${state.importTurmasResultado.puladasSemProfessor ? ` ${state.importTurmasResultado.puladasSemProfessor} sem professor selecionado, não foram criadas.` : ""}
      </p>
    </div>` : "";

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-importar-turmas-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Importar turmas" data-action="noop">
      <div class="aluno-modal-head">
        <div><h2>Importar turmas</h2><p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(escola?.nome || "")}</p></div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-importar-turmas-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>
      ${areaUploadHtml}
      ${previewHtml}
      ${resultadoHtml}
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
        <h3>${ICONS.shield} Trocar minha senha</h3>
        <p>Você mesmo troca sua senha aqui, na hora. Confirme a senha atual e escolha a nova.</p>
        <input id="perfil-senha-atual" type="password" class="teacher-text-input" placeholder="Senha atual" autocomplete="current-password" />
        <input id="perfil-senha-nova" type="password" class="teacher-text-input" style="margin-top:8px;" placeholder="Nova senha (mín. 6 caracteres)" autocomplete="new-password" />
        <input id="perfil-senha-confirma" type="password" class="teacher-text-input" style="margin-top:8px;" placeholder="Repita a nova senha" autocomplete="new-password" />
        <button class="teacher-primary-btn" data-action="trocar-minha-senha" ${state.perfilSenhaTrocando ? "disabled" : ""}>${state.perfilSenhaTrocando ? "Salvando…" : "Salvar nova senha"}</button>
        ${state.perfilSenhaErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.perfilSenhaErro)}</p>` : ""}
        ${state.perfilSenhaMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.perfilSenhaMensagem)}</p>` : ""}

        <p class="section-eyebrow" style="margin-top:14px;">Esqueceu a senha atual? Não mandamos link por e-mail — fale com o suporte técnico logo abaixo.</p>
      </div>

      <div class="management-card">
        <h3>${ICONS.key} Senhas da escola</h3>
        <p>Trocar a senha de um aluno, professor ou responsável, ou excluir um cadastro, é na Gestão.</p>
        <button class="teacher-primary-btn" data-action="ir-para-acessos">Abrir Senhas & acessos</button>
        <p class="section-eyebrow" style="margin-top:8px;">Atalho para Gestão &gt; Senhas &amp; acessos.</p>
      </div>

      <div class="management-card">
        <h3>${ICONS.lifebuoy} Suporte técnico</h3>
        <p>Problema no sistema (erro na tela, acesso travado, dado que não salva)? Fale com quem cuida do app.</p>
        <button class="teacher-primary-btn" data-action="whatsapp-suporte">Chamar o suporte no WhatsApp</button>
        <p class="section-eyebrow" style="margin-top:8px;">Ou por e-mail: <strong style="color:var(--ink);">${escapeHtml(SUPORTE_TECNICO.email)}</strong></p>
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
   aba "Professores" (e também "Responsáveis", que usa os mesmos dados). Também garante que a lista de
   alunos da unidade (gestaoAlunosEscola) esteja disponível, já que os
   dois modais (turmas do professor / vínculos do responsável) precisam
   dela para montar os checklists. */
async function carregarEquipeDaEscola(escolaId){
  state.gestaoEquipeCarregando = true;
  state.gestaoEquipeErro = "";
  render();
  try {
    // Professores em mais de uma escola são resolvidos via a coleção
    // "escolaProfessores" (um doc por par escola+professor, ver
    // criarUsuarioNaInstituicao) — consulta de igualdade simples, que a
    // regra de segurança consegue confirmar sem recusar a consulta
    // inteira (o antigo "array-contains" em cima de "escolasIds" era
    // negado pelo Firestore quando combinado com o get() da regra;
    // permission-denied mesmo com professor/dados corretos).
    // A consulta legada em "usuarios.escolaId" continua aqui só como
    // fallback pra professores cadastrados ANTES dessa migração e que
    // ainda não têm doc em "escolaProfessores" — depois de rodar a
    // migração (ver MIGRACAO.md), dá pra remover esse fallback.
    const qVinculos = query(collection(db, "escolaProfessores"), where("escolaId", "==", escolaId));
    const qProfLegado = query(collection(db, "usuarios"), where("role", "==", "professor"), where("escolaId", "==", escolaId));
    const qResp = query(collection(db, "responsaveis"), where("escolaId", "==", escolaId));

    // Usa allSettled (em vez de Promise.all) de propósito: assim, se UMA
    // das consultas for negada pelas regras do Firestore, as outras ainda
    // carregam normalmente — antes, uma negada derrubava as três juntas e
    // a mensagem de erro não dizia qual delas era a culpada. Cada consulta
    // também loga separadamente no console (F12), com o nome dela e o
    // err.code, pra dar pra apontar o dedo pra regra certa direto.
    const tarefasExtras = [];
    if(!state.gestaoAlunosEscola) tarefasExtras.push(carregarAlunosParaVinculo(escolaId));

    const [vinculosR, profLegadoR, respR] = await Promise.allSettled([
      getDocs(qVinculos), getDocs(qProfLegado), getDocs(qResp),
    ]);
    await Promise.allSettled(tarefasExtras);

    [
      ["escolaProfessores", vinculosR],
      ["usuarios (escolaId legado)", profLegadoR],
      ["responsaveis", respR],
    ].forEach(([nome, resultado]) => {
      if(resultado.status === "rejected"){
        console.error(`Consulta "${nome}" negada:`, resultado.reason?.code, resultado.reason);
      }
    });

    // Junta os dois jeitos de achar professor (vínculo novo + fallback
    // legado) sem duplicar, indexando pelo uid do PROFESSOR (não pelo id
    // do documento de vínculo, que é "escolaId_uid").
    const profPorUid = new Map();
    if(vinculosR.status === "fulfilled"){
      vinculosR.value.docs.forEach(d => {
        const dados = d.data();
        if(dados.professorId) profPorUid.set(dados.professorId, {
          id: dados.professorId,
          nome: dados.nome || "Professor(a)",
          email: dados.email || "",
          disciplinas: Array.isArray(dados.disciplinas) ? dados.disciplinas : [],
        });
      });
    }
    if(profLegadoR.status === "fulfilled"){
      profLegadoR.value.docs.forEach(d => {
        if(!profPorUid.has(d.id)) profPorUid.set(d.id, {
          id: d.id,
          nome: d.data().nome || "Professor(a)",
          email: d.data().email || "",
          disciplinas: Array.isArray(d.data().disciplinas) ? d.data().disciplinas : [],
        });
      });
    }
    state.gestaoProfessores = Array.from(profPorUid.values());

    state.gestaoResponsaveis = respR.status === "fulfilled"
      ? respR.value.docs.map(d => ({
          id: d.id,
          nome: d.data().nome || "Responsável",
          contato: d.data().contato || "",
          email: d.data().email || "",
          alunosIds: Array.isArray(d.data().alunosIds) ? d.data().alunosIds : [],
          uid: d.data().uid || null,
        }))
      : [];

    // Monta a mensagem de erro só com o que de fato falhou, citando a
    // consulta pelo nome — em vez do "não foi possível carregar" genérico
    // de antes, que escondia qual das três estava sendo negada.
    const falhas = [
      vinculosR.status === "rejected" ? { nome: "professores (vínculos)", err: vinculosR.reason } : null,
      profLegadoR.status === "rejected" ? { nome: "professores (escolaId legado)", err: profLegadoR.reason } : null,
      respR.status === "rejected" ? { nome: "responsáveis", err: respR.reason } : null,
    ].filter(Boolean);

    if(falhas.length > 0){
      const temIndiceFaltando = falhas.some(f => f.err?.code === "failed-precondition");
      const dicaIndice = temIndiceFaltando
        ? " O Firestore precisa de um índice composto pra essa busca — abra o console do navegador (F12), procure o link que ele imprimiu (\"...create it here...\") e clique em \"Criar índice\"; depois de alguns minutos, tente de novo."
        : "";
      const listaFalhas = falhas.map(f => `${f.nome}${f.err?.code ? ` (${f.err.code})` : ""}`).join(", ");
      state.gestaoEquipeErro = `Não foi possível carregar: ${listaFalhas}.${dicaIndice}`;
    } else {
      state.gestaoEquipeErro = "";
    }
    state.gestaoEquipeEscolaId = escolaId;
  } catch(err){
    state.gestaoProfessores = [];
    state.gestaoResponsaveis = [];
    console.error("Erro inesperado ao carregar professores/responsáveis:", err);
    state.gestaoEquipeErro = `Não foi possível carregar professores e responsáveis agora${err.code ? ` (${err.code})` : ""}.`;
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
    // As regras de segurança do Firestore (ver DATABASE.md / firestore.rules)
    // só conseguem confirmar a permissão da instituição em "turmas" se a
    // consulta filtrar por "escolaId ==" também — sem isso, o Firestore não
    // consegue provar estaticamente que TODOS os resultados pertencem à
    // escola da instituição logada, e recusa a consulta inteira com
    // "permission-denied" (mesmo que os documentos, um a um, passassem na
    // regra). Filtrar pelas duas igualdades (professorId E escolaId) não
    // precisa de índice composto — o Firestore combina os dois índices
    // automáticos normalmente.
    const q = query(
      collection(db, "turmas"),
      where("professorId", "==", professorId),
      where("escolaId", "==", state.escolaSelecionadaId),
    );
    const snaps = await getDocs(q);
    state.profTurmasModalTurmas = snaps.docs.map(d => ({ id: d.id, ...d.data(), alunos: d.data().alunos || [] }));
  } catch(err){
    state.profTurmasModalTurmas = [];
    // Loga o código de verdade (F12 no navegador) — "permission-denied" aqui
    // costuma ser a regra de segurança do Firestore pra "turmas" negando a
    // consulta; "failed-precondition" é índice composto faltando (o console
    // do navegador imprime um link "...create it here..." pra criar).
    console.error("Erro ao carregar turmas do professor:", err?.code, err);
    const dica = err?.code === "failed-precondition"
      ? " O Firestore está pedindo um índice pra essa busca — abra o console do navegador (F12) e clique no link que ele imprimiu (\"...create it here...\")."
      : err?.code === "permission-denied"
        ? " As regras de segurança do Firestore estão bloqueando essa consulta na coleção \"turmas\" — vale revisar se elas permitem `list` filtrando por professorId pra quem é da equipe da escola."
        : "";
    state.profTurmasModalErro = `Não foi possível carregar as turmas deste professor agora${err?.code ? ` (${err.code})` : ""}.${dica}`;
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

/* Turmas de verdade da escola (coleção "turmas"), usadas na aba "Turmas".
   Antes essa aba lia de school.turmas, um array estático que vinha dentro
   do próprio documento da escola e nunca era atualizado — turmas criadas
   ou importadas pela aba "Professores" (que gravam na coleção "turmas")
   não apareciam aqui. Uma única igualdade (escolaId ==) não precisa de
   índice composto no Firestore. */
async function carregarTurmasDaInstituicao(escolaId){
  state.instTurmasCarregando = true;
  state.instTurmasErro = "";
  render();
  try {
    const q = query(collection(db, "turmas"), where("escolaId", "==", escolaId));
    const snaps = await getDocs(q);
    state.instTurmas = snaps.docs.map(d => ({ id: d.id, ...d.data(), alunos: d.data().alunos || [] }));
    state.instTurmasEscolaId = escolaId;
  } catch(err){
    state.instTurmas = [];
    console.error("Erro ao carregar turmas da instituição:", err?.code, err);
    state.instTurmasErro = "Não foi possível carregar as turmas agora. Tente de novo.";
  } finally {
    state.instTurmasCarregando = false;
    render();
  }
}

/* Carrega as turmas da unidade só se ainda não estiverem em memória —
   usado pelas telas que precisam do seletor de turma (ficha do aluno,
   contrato, importação de contratos). */
function garantirTurmasDaUnidade(){
  const escolaId = state.escolaSelecionadaId;
  if(!escolaId) return;
  if((state.instTurmas === null || state.instTurmasEscolaId !== escolaId) && !state.instTurmasCarregando){
    carregarTurmasDaInstituicao(escolaId);
  }
}

/* Turmas em que um aluno já está. A turma guarda só o NOME dos alunos
   (turmas/{id}.alunos: [nomes] — é assim que a chamada e o calendário
   os enxergam), então a comparação é por nome sem acento/maiúscula. */
function turmasDoAluno(nome){
  const alvo = normalizarNome(nome);
  return (state.instTurmas || []).filter(t => (t.alunos || []).some(n => normalizarNome(n) === alvo));
}

/* Coloca o aluno na turma. Devolve "ja-estava" se já constava (não grava
   nada) ou "ok". arrayUnion evita duplicar e não mexe no resto do
   documento da turma (professor, horário, etc.). */
async function vincularAlunoNaTurma(nome, turmaId){
  const nomeLimpo = String(nome || "").trim();
  const turma = (state.instTurmas || []).find(t => t.id === turmaId);
  const alvo = normalizarNome(nomeLimpo);
  if(turma && (turma.alunos || []).some(n => normalizarNome(n) === alvo)) return "ja-estava";
  await updateDoc(doc(db, "turmas", turmaId), { alunos: arrayUnion(nomeLimpo) });
  if(turma) turma.alunos = [...(turma.alunos || []), nomeLimpo];
  return "ok";
}

/* Tira o aluno da turma. arrayRemove precisa do valor exato que está
   gravado, então removemos a grafia que a própria turma tem. */
async function desvincularAlunoDaTurma(nome, turmaId){
  const turma = (state.instTurmas || []).find(t => t.id === turmaId);
  if(!turma) return;
  const alvo = normalizarNome(nome);
  const gravados = (turma.alunos || []).filter(n => normalizarNome(n) === alvo);
  if(!gravados.length) return;
  await updateDoc(doc(db, "turmas", turmaId), { alunos: arrayRemove(...gravados) });
  turma.alunos = (turma.alunos || []).filter(n => normalizarNome(n) !== alvo);
}

/* Frequência real de cada turma, calculada em cima da chamada que os
   professores já fizeram (coleção "registrosAula" — um documento por
   turma por dia, com `presencas: { [nomeAluno]: "presente"|"falta"|
   "justificada" }`). Antes a aba "Estatísticas" só mostrava um número
   de frequência estático (digitado direto no documento da escola);
   agora ele é a média de presença de verdade, dia a dia.
   Observação: isso traz TODOS os registros de chamada da escola numa
   query só (só dá pra filtrar por escolaId, que é o que as regras do
   Firestore exigem — ver o comentário em carregarTurmasDoProfessorGestao
   sobre isso). Pra uma escola pequena isso é tranquilo; se a lista de
   chamadas crescer muito ao longo dos anos, vale limitar por um período
   (ex.: só o mês atual) usando um índice composto (escolaId + data). */
async function carregarFrequenciaDaInstituicao(escolaId){
  state.instFrequenciaCarregando = true;
  state.instFrequenciaErro = "";
  render();
  try {
    const q = query(collection(db, "registrosAula"), where("escolaId", "==", escolaId));
    const snaps = await getDocs(q);
    const hoje = dataDeHojeISO();
    const porTurma = {};
    snaps.forEach(doc => {
      const dados = doc.data();
      const turmaId = dados.turmaId;
      if(!turmaId) return;
      if(!porTurma[turmaId]){
        porTurma[turmaId] = { presentesTotal: 0, totalRegistros: 0, presentesHoje: 0, totalHoje: 0, temRegistroHoje: false };
      }
      const valores = Object.values(dados.presencas || {});
      const presentesDoDia = valores.filter(v => v === "presente").length;
      porTurma[turmaId].presentesTotal += presentesDoDia;
      porTurma[turmaId].totalRegistros += valores.length;
      if(dados.data === hoje){
        porTurma[turmaId].presentesHoje = presentesDoDia;
        porTurma[turmaId].totalHoje = valores.length;
        porTurma[turmaId].temRegistroHoje = true;
      }
    });
    Object.values(porTurma).forEach(t => {
      t.frequencia = t.totalRegistros ? Math.round((t.presentesTotal / t.totalRegistros) * 100) : null;
    });
    state.instFrequencia = porTurma;
    state.instFrequenciaEscolaId = escolaId;
  } catch(err){
    console.error("Erro ao carregar frequência das turmas:", err?.code, err);
    state.instFrequencia = {};
    state.instFrequenciaErro = "Não foi possível carregar a frequência das turmas agora.";
  } finally {
    state.instFrequenciaCarregando = false;
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

/* Data de hoje por extenso, em português, pra exibir na tela (ex.:
   "segunda-feira, 15 de setembro de 2026"). Antes esses cabeçalhos
   mostravam um texto fixo digitado no documento da escola (campo
   "data"), que nunca mudava — agora é sempre o dia real do aparelho
   de quem está usando o site. */
function dataDeHojeExtenso(){
  const texto = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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
    // O documento de login (usuarios/{uid}) precisa sair ANTES do cadastro
    // do aluno: a regra de segurança descobre a unidade dele lendo
    // alunos/{id}, que deixa de existir depois do deleteDoc abaixo.
    const uid = aluno.uid || await descobrirUidDoAluno(aluno.id);
    let loginDocApagado = false;
    if(uid){
      try {
        await deleteDoc(doc(db, "usuarios", uid));
        loginDocApagado = true;
      } catch(e){
        console.warn("Não consegui apagar o cadastro de login do aluno (usuarios):", e?.code || e);
      }
    }

    await deleteDoc(doc(db, "alunos", aluno.id));
    try {
      await updateDoc(doc(db, "escolas", escolaId), {
        alunos: arrayRemove({ nome: aluno.nome, turma: aluno.turma }),
      });
    } catch(_syncErr) {
      // Não bloqueia a exclusão principal se só esse resumo falhar em atualizar.
    }

    // Tira o aluno da lista de quem era responsável por ele — senão o
    // responsável continua vendo um "filho" que não existe mais.
    try {
      const qResp = query(
        collection(db, "responsaveis"),
        where("escolaId", "==", escolaId),
        where("alunosIds", "array-contains", aluno.id),
      );
      const respSnap = await getDocs(qResp);
      await Promise.all(respSnap.docs.map(async d => {
        const restantes = (d.data().alunosIds || []).filter(x => x !== aluno.id);
        await updateDoc(d.ref, { alunosIds: restantes });
        if(d.data().uid){
          try { await updateDoc(doc(db, "usuarios", d.data().uid), { alunosIds: restantes }); } catch(_e){ /* ignora */ }
        }
      }));
    } catch(_vinculoErr) { /* não bloqueia a exclusão principal */ }

    // Se a Cloud Function de admin estiver publicada, apaga o login em si
    // (Firebase Authentication).
    if(uid){
      try { await excluirLoginDeOutroUsuario(uid); } catch(_e){ /* sem backend: login fica órfão */ }
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

/* A sub-aba "Senhas & acessos" mistura alunos, professores e
   responsáveis numa lista só, então precisa das duas cargas (a lista de
   alunos e a de equipe) — que até aqui só eram feitas quando as abas
   correspondentes eram abertas. */
/* Todos os logins que já existem na unidade (alunos, responsáveis e
   professores). É o que permite gerar "joao.silva" pro primeiro João
   Silva e "joao.p.silva" pro segundo, em vez de esbarrar num e-mail
   repetido só na hora de salvar. Cobre a unidade aberta; homônimo de
   outra unidade ainda pode existir, e aí a criação do login tenta a
   próxima variação sozinha. */
function emailsUsadosDaUnidade(){
  const emails = [];
  (state.instAlunos || []).forEach(a => a.email && emails.push(a.email));
  (state.gestaoResponsaveis || []).forEach(r => r.email && emails.push(r.email));
  (state.gestaoProfessores || []).forEach(p => p.email && emails.push(p.email));
  return emails;
}

function garantirPessoasDaUnidade(){
  const escolaId = state.escolaSelecionadaId;
  if(!escolaId) return;
  if((state.instAlunos === null || state.instAlunosEscolaId !== escolaId) && !state.instAlunosCarregando){
    carregarAlunosDaInstituicao(escolaId);
  }
  if((state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== escolaId) && !state.gestaoEquipeCarregando){
    carregarEquipeDaEscola(escolaId);
  }
  // as turmas alimentam o seletor "Turma" dos contratos
  garantirTurmasDaUnidade();
}

/* Cadastros de aluno feitos ANTES de o uid passar a ser guardado no
   próprio documento do aluno não sabem qual é o login deles. Nesse caso,
   procuramos em "usuarios" quem aponta para esse alunoId. Se as regras do
   Firestore não deixarem a instituição listar "usuarios", devolve null —
   e a tela cai no plano B (pedir o e-mail pra secretaria digitar). */
async function descobrirUidDoAluno(alunoId){
  try {
    const snaps = await getDocs(query(collection(db, "usuarios"), where("alunoId", "==", alunoId)));
    const primeiro = snaps.docs[0];
    return primeiro ? primeiro.id : null;
  } catch(_err){
    return null;
  }
}

/* Exclui um responsável da unidade: apaga o cadastro em "responsaveis",
   o documento de login em "usuarios" (se ele tinha acesso) e, quando a
   Cloud Function de admin está publicada, o login em si. */
async function excluirResponsavelDaEscola(responsavel){
  await deleteDoc(doc(db, "responsaveis", responsavel.id));
  if(responsavel.uid){
    try { await deleteDoc(doc(db, "usuarios", responsavel.uid)); } catch(_e){ /* ignora */ }
    try { await excluirLoginDeOutroUsuario(responsavel.uid); } catch(_e){ /* sem backend: login fica órfão */ }
  }
}

/* Dá acesso (e-mail/senha) a um responsável que foi cadastrado sem login
   — o caso do cadastro rápido feito pela ficha do aluno. Usa o app
   secundário pra não deslogar quem está na Gestão. */
async function criarLoginParaResponsavel(responsavel, email, senha){
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
  const uid = cred.user.uid;
  try {
    await setDoc(doc(db, "usuarios", uid), {
      role: "responsavel", nome: responsavel.nome, email,
      alunosIds: responsavel.alunosIds || [],
      escolaId: state.escolaSelecionadaId,
    });
    await updateDoc(doc(db, "responsaveis", responsavel.id), { uid, email });
    return uid;
  } catch(err){
    try { await cred.user.delete(); } catch(_e){ /* ignora */ }
    throw err;
  } finally {
    try { await signOut(secondaryAuth); } catch(_e){ /* ignora */ }
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
/* Cria o login tentando, em ordem, cada e-mail da lista. Se o primeiro
   já estiver em uso (homônimo de outra unidade, por exemplo), passa pro
   próximo sozinho em vez de estourar o erro na cara da secretaria.
   Devolve também qual e-mail acabou valendo. */
async function criarLoginComAlternativas(emails, senha){
  const candidatos = emails.filter(Boolean);
  let ultimoErro = null;
  for(const candidato of candidatos){
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, candidato, senha);
      return { cred, email: candidato };
    } catch(err){
      ultimoErro = err;
      // qualquer erro que não seja "e-mail ocupado" é problema de verdade
      if(err?.code !== "auth/email-already-in-use") throw err;
    }
  }
  throw ultimoErro || new Error("Nenhum e-mail disponível para criar o login.");
}

async function criarUsuarioNaInstituicao({ role, nome, email, senha, escolaId, escolasIds, turma, disciplinas, contato, alunosIds, nascimento, emailsAlternativos }){
  if(role === "responsavel"){
    const novoResponsavelRef = doc(collection(db, "responsaveis"));
    await setDoc(novoResponsavelRef, {
      nome, escolaId, contato: contato || "",
      email: email || "",   // guardado pra Gestão poder reenviar senha depois
      alunosIds: alunosIds || [],
    });

    // Se vier e-mail e senha, cria também o login (Firebase Auth) do
    // responsável — igual já acontece com aluno/professor/instituição.
    // Sem e-mail/senha (ex.: cadastro rápido pela ficha do aluno), o
    // responsável fica só como registro, sem acesso, como antes.
    if(!email || !senha) return { responsavelId: novoResponsavelRef.id };

    const { cred, email: emailFinal } = await criarLoginComAlternativas(
      [email, ...(emailsAlternativos || [])], senha,
    );
    const uid = cred.user.uid;
    try {
      await setDoc(doc(db, "usuarios", uid), { role: "responsavel", nome, email: emailFinal, alunosIds: alunosIds || [], escolaId });
      // Guarda o uid também no cadastro em "responsaveis" pra podermos, mais
      // tarde (na Gestão), editar os alunos vinculados em UM lugar só e
      // refletir no login do responsável ao mesmo tempo.
      await updateDoc(novoResponsavelRef, { uid, email: emailFinal });
      return { responsavelId: novoResponsavelRef.id, uid, email: emailFinal };
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
      nascimento: nascimento || "",   // usado pela aba "Aniversários"
      email: email || "",   // e-mail de acesso, pra Gestão poder redefinir a senha depois
      foto: "",
      notas: [],
      presenca: { percentual: 0, faltasMes: 0, registros: [] },
      financeiro: { status: "", proxima: "", valor: "", historico: [] },
      comunicados: [],
    });
    await updateDoc(doc(db, "escolas", escolaId), {
      alunos: arrayUnion({ nome, turma: turma || "" }),
    });

    // Aluno sem e-mail/senha fica só como cadastro, sem login — é o caso
    // da Recreação, em que quem acompanha pelo app é o responsável.
    if(!email || !senha) return { alunoId: novoAlunoRef.id };

    // 2. cria o login do aluno (Firebase Auth) no app secundário, pra não
    //    deslogar a instituição que está fazendo o cadastro.
    const { cred, email: emailFinal } = await criarLoginComAlternativas(
      [email, ...(emailsAlternativos || [])], senha,
    );
    const uid = cred.user.uid;
    try {
      await setDoc(doc(db, "usuarios", uid), { role: "aluno", nome, email: emailFinal, alunoId: novoAlunoRef.id });
      // Guarda o uid no próprio cadastro do aluno: é o que permite à
      // Gestão trocar a senha / excluir o login dele depois sem precisar
      // varrer a coleção "usuarios" atrás de quem tem esse alunoId.
      await updateDoc(novoAlunoRef, { uid, email: emailFinal });
      return { alunoId: novoAlunoRef.id, uid, email: emailFinal };
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
    const usuarioDoc = { role, nome, email };
    let listaEscolas = [];
    if(role === "professor"){
      usuarioDoc.disciplinas = disciplinas || [];
      // Guarda a(s) escola(s) do professor pra podermos listá-lo na tela de
      // aba "Professores" e vincular turmas a ele — um
      // professor pode dar aula em mais de uma unidade. "escolaId" (a
      // primeira da lista) fica guardado também só por compatibilidade com
      // cadastros antigos que ainda dependem dele.
      listaEscolas = (escolasIds && escolasIds.length) ? escolasIds : [escolaId];
      usuarioDoc.escolasIds = listaEscolas;
      usuarioDoc.escolaId = listaEscolas[0];
    }
    if(role === "instituicao") usuarioDoc.escolasIds = [escolaId];

    await setDoc(doc(db, "usuarios", uid), usuarioDoc);

    if(role === "professor"){
      // Um documento de vínculo por escola, em vez de depender de uma
      // consulta "array-contains" em cima de "escolasIds" (que o Firestore
      // nega quando a regra de segurança também precisa de um get()
      // cruzado — ver DATABASE.md). Consultar "escolaProfessores" com
      // "escolaId ==" é uma igualdade simples, então a regra de segurança
      // consegue confirmar o acesso sem recusar a consulta inteira.
      // Um professor em 2 escolas gera 2 documentos aqui, um pra cada.
      await Promise.all(listaEscolas.map(id => setDoc(
        doc(db, "escolaProfessores", `${id}_${uid}`),
        { escolaId: id, professorId: uid, nome, email, disciplinas: disciplinas || [] },
      )));
    }

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

/* ------------------------------------------------------------------
   Cadastros criados junto com o contrato.
   Depois de gerar o documento, a secretaria não precisa digitar tudo de
   novo na aba "Criar cadastro": o aluno entra na coleção `alunos` (com
   data de nascimento e WhatsApp, que é o que alimenta os aniversários),
   o responsável entra em `responsaveis` já vinculado a ele, e os dois
   ganham login — menos o aluno de Recreação, que por ser pequeno não
   recebe acesso próprio.
   Se o aluno já existir na unidade (mesmo nome), o cadastro é apenas
   atualizado, sem duplicar nem mexer no login que ele já tem. */
async function criarCadastrosDoContrato(c){
  const escolaId = state.escolaSelecionadaId;
  const avisos = [];
  const resultado = { aluno: null, responsavel: null, avisos };
  const precisaLoginAluno = contratoPrecisaLoginAluno(c);

  // --- aluno ---
  const jaCadastrado = (state.instAlunos || [])
    .find(a => normalizarNome(a.nome) === normalizarNome(c.alunoNome));

  let alunoId = jaCadastrado?.id || null;

  if(jaCadastrado){
    await updateDoc(doc(db, "alunos", jaCadastrado.id), {
      nascimento: c.alunoNascimento || jaCadastrado.nascimento || "",
      contato: c.contatoAluno || jaCadastrado.contato || "",
      turma: c.curso || jaCadastrado.turma || "",
    });
    avisos.push(`${c.alunoNome} já tinha cadastro nesta unidade — atualizei os dados e mantive o acesso que já existia.`);
  } else {
    const criado = await criarUsuarioNaInstituicao({
      role: "aluno",
      nome: c.alunoNome.trim(),
      turma: c.curso,
      escolaId,
      contato: c.contatoAluno || "",
      nascimento: c.alunoNascimento || "",
      // sem e-mail/senha o aluno fica só com cadastro, sem login
      email: precisaLoginAluno ? c.emailAluno.trim() : "",
      senha: precisaLoginAluno ? c.senhaAluno : "",
      // se o login escolhido já estiver ocupado, cai pra próxima variação
      emailsAlternativos: precisaLoginAluno ? variantesDeEmail(c.alunoNome, DOMINIO_ALUNO) : [],
    });
    alunoId = criado.alunoId;
    // Decide pelo que REALMENTE aconteceu (criado.email só vem preenchido
    // se um login foi criado de verdade), não só pela regra do curso —
    // isso cobre também a importação em lote, onde a secretaria pode
    // desmarcar "criar acesso" mesmo num curso que normalmente ganharia.
    if(criado.email){
      resultado.aluno = { email: criado.email, senha: c.senhaAluno };
      if(criado.uid) await marcarSenhaProvisoria(criado.uid);
      if(criado.email !== c.emailAluno.trim()){
        avisos.push(`Já existia um login "${c.emailAluno.trim()}", então o aluno ficou com "${criado.email}".`);
        c.emailAluno = criado.email;
      }
    } else if(precisaLoginAluno){
      avisos.push(`${c.alunoNome} ficou sem login (nenhum e-mail foi gerado).`);
    } else {
      avisos.push(`Aluno de ${c.curso} não recebe login próprio — só o responsável acompanha pelo app.`);
    }
    // Registra na lista local (sem esperar um novo carregamento do
    // Firestore) — essencial numa importação em lote: se dois contratos
    // do mesmo lote forem de irmãos, o segundo precisa achar o primeiro
    // já criado pra não duplicar o aluno nem o login do responsável.
    if(state.instAlunos){
      state.instAlunos.push(normalizeAluno(alunoId, {
        nome: c.alunoNome.trim(), turma: c.curso, escolaId,
        contato: c.contatoAluno || "", nascimento: c.alunoNascimento || "",
        email: criado.email || "", uid: criado.uid || null,
      }));
    }
  }

  // --- turma ---
  if(alunoId && c.turmaId){
    const turmaEscolhida = (state.instTurmas || []).find(t => t.id === c.turmaId);
    const nomeNaTurma = jaCadastrado ? jaCadastrado.nome : c.alunoNome.trim();
    try {
      const r = await vincularAlunoNaTurma(nomeNaTurma, c.turmaId);
      const nomeTurma = turmaEscolhida?.nome || "escolhida";
      avisos.push(r === "ja-estava"
        ? `${nomeNaTurma} já estava na turma ${nomeTurma}.`
        : `${nomeNaTurma} foi colocado(a) na turma ${nomeTurma}.`);
    } catch(err){
      console.error("Erro ao colocar o aluno na turma:", err);
      avisos.push(`Não consegui colocar ${nomeNaTurma} na turma agora${err?.code ? ` (${err.code})` : ""}. Abra a ficha do aluno e adicione a turma por lá.`);
    }
  }

  // --- situação da assinatura ---
  if(alunoId && c.contratoStatus){
    const gravou = await gravarStatusContrato(alunoId, c.contratoStatus);
    if(gravou === "mantido"){
      avisos.push(`${c.alunoNome} já constava com contrato assinado — mantive como assinado.`);
    }
  }
  resultado.alunoId = alunoId;

  // --- responsável ---
  if(!c.semResponsavel && c.respNome.trim()){
    const respExistente = (state.gestaoResponsaveis || [])
      .find(r => normalizarNome(r.nome) === normalizarNome(c.respNome));

    if(respExistente){
      const vinculos = respExistente.alunosIds.includes(alunoId)
        ? respExistente.alunosIds
        : [...respExistente.alunosIds, alunoId];
      await updateDoc(doc(db, "responsaveis", respExistente.id), {
        alunosIds: vinculos,
        contato: c.contatoResp || respExistente.contato || "",
      });
      if(respExistente.uid){
        await updateDoc(doc(db, "usuarios", respExistente.uid), { alunosIds: vinculos });
      }
      respExistente.alunosIds = vinculos;
      avisos.push(`${c.respNome} já era cadastrado(a) — vinculei ${c.alunoNome} ao acesso que ele(a) já tem.`);
    } else {
      const criadoResp = await criarUsuarioNaInstituicao({
        role: "responsavel",
        nome: c.respNome.trim(),
        escolaId,
        contato: c.contatoResp || "",
        alunosIds: alunoId ? [alunoId] : [],
        email: c.emailResp.trim(),
        senha: c.senhaResp,
        emailsAlternativos: variantesDeEmail(c.respNome, DOMINIO_RESPONSAVEL),
      });
      if(criadoResp.email){
        resultado.responsavel = { email: criadoResp.email, senha: c.senhaResp };
        if(criadoResp.uid) await marcarSenhaProvisoria(criadoResp.uid);
        if(criadoResp.email !== c.emailResp.trim()){
          avisos.push(`Já existia um login "${c.emailResp.trim()}", então o responsável ficou com "${criadoResp.email}".`);
          c.emailResp = criadoResp.email;
        }
      }
      // Mesma lógica do aluno: registra localmente pra um segundo irmão,
      // já no mesmo lote, encontrar esse responsável e só vincular, em
      // vez de criar um cadastro (e um login) duplicado pra ele(a).
      if(state.gestaoResponsaveis){
        state.gestaoResponsaveis.push({
          id: criadoResp.responsavelId, nome: c.respNome.trim(),
          contato: c.contatoResp || "", email: criadoResp.email || "",
          alunosIds: alunoId ? [alunoId] : [], uid: criadoResp.uid || null,
        });
      }
    }
  }

  return resultado;
}

/* Situação da assinatura do contrato, guardada no próprio cadastro do
   aluno ("assinado" | "pendente"). Um contrato que já constava como
   assinado nunca volta a "pendente" só porque outro PDF foi importado.
   Devolve "mantido" quando ignorou o rebaixamento, "ok" quando gravou. */
async function gravarStatusContrato(alunoId, status, extras = {}){
  const aluno = (state.instAlunos || []).find(a => a.id === alunoId);
  if(status === "pendente" && aluno?.contratoStatus === "assinado") return "mantido";
  const dados = { contratoStatus: status, ...extras };
  await updateDoc(doc(db, "alunos", alunoId), dados);
  if(aluno) Object.assign(aluno, dados);
  return "ok";
}

async function marcarContratoEnviado(alunoId){
  try {
    await updateDoc(doc(db, "alunos", alunoId), { contratoEnviadoEm: dataDeHojeISO() });
    const aluno = (state.instAlunos || []).find(a => a.id === alunoId);
    if(aluno) aluno.contratoEnviadoEm = dataDeHojeISO();
  } catch(err){
    console.warn("Não consegui registrar o envio do contrato:", err?.code || err);
  }
}

/* Deixa marcado no cadastro que a senha atual é a provisória de 6
   dígitos, sorteada na geração do contrato. Serve de registro pra
   secretaria (e abre caminho pra, no futuro, o app pedir a troca já no
   primeiro acesso). Se a gravação falhar, não atrapalha o resto. */
async function marcarSenhaProvisoria(uid){
  try {
    await updateDoc(doc(db, "usuarios", uid), { senhaProvisoria: true });
  } catch(err){
    console.warn("Não consegui marcar a senha como provisória:", err?.code || err);
  }
}

/* Traduz o tropeço mais comum na criação dos acessos (e-mail repetido)
   numa frase que diga o que fazer, em vez do código cru do Firebase. */
function mensagemErroAcessosContrato(err){
  if(err?.code === "auth/email-already-in-use"){
    return "Todas as variações de login para esse nome já estão em uso. Use o botão \"Gerar outro\" e tente novamente — o contrato em si já está pronto na outra aba.";
  }
  if(err?.code === "auth/weak-password"){
    return "A senha provisória precisa ter pelo menos 6 caracteres.";
  }
  if(err?.code === "permission-denied"){
    return "O Firestore recusou a gravação dos cadastros (permission-denied). O contrato já está pronto na outra aba; o cadastro precisa ser feito pela aba \"Criar cadastro\".";
  }
  return `Não consegui criar os cadastros agora${err?.code ? ` (${err.code})` : ""}. O contrato já está pronto na outra aba — dá pra cadastrar o aluno depois pela aba "Criar cadastro".`;
}

/* Atualiza nome/disciplinas de um professor em TODOS os lugares onde eles
   ficam guardados: o cadastro "usuarios/{uid}" (fonte usada pelo próprio
   login do professor) e cada doc de vínculo em "escolaProfessores" — um
   por unidade em que ele dá aula, já que a lista da Gestão lê daí (ver
   carregarEquipeDaEscola). Sem atualizar os dois, o nome ficaria
   desatualizado ora no dashboard do professor, ora na lista da Gestão. */
async function salvarEdicaoProfessor(uid, nome, disciplinas){
  await updateDoc(doc(db, "usuarios", uid), { nome, disciplinas });
  const qVinculos = query(collection(db, "escolaProfessores"), where("professorId", "==", uid));
  const snaps = await getDocs(qVinculos);
  await Promise.all(snaps.docs.map(d => updateDoc(d.ref, { nome, disciplinas })));
}

/* Remove um professor de UMA unidade: apaga o vínculo dele em
   "escolaProfessores" pra essa escola e as turmas dele nessa mesma
   escola (senão ficariam turmas "órfãs", sem professor visível pra
   ninguém editar). Se essa era a única unidade em que ele dava aula,
   também apaga o cadastro em "usuarios/{uid}".
   Observação: isso NÃO apaga o login dele no Firebase Authentication —
   o SDK do cliente só pode apagar a conta que está logada no momento,
   nunca a de outra pessoa. Pra remover o acesso por completo (o e-mail
   deixar de funcionar), é preciso uma Cloud Function com o Admin SDK, ou
   apagar manualmente pelo Console do Firebase (Authentication > Users). */
async function excluirProfessorDaEscola(uid, escolaId){
  await deleteDoc(doc(db, "escolaProfessores", `${escolaId}_${uid}`));

  const qTurmas = query(collection(db, "turmas"), where("professorId", "==", uid), where("escolaId", "==", escolaId));
  const turmasSnap = await getDocs(qTurmas);
  await Promise.all(turmasSnap.docs.map(d => deleteDoc(d.ref)));

  const qOutrosVinculos = query(collection(db, "escolaProfessores"), where("professorId", "==", uid));
  const outrosSnap = await getDocs(qOutrosVinculos);
  if(outrosSnap.empty){
    await deleteDoc(doc(db, "usuarios", uid));
    // Se a Cloud Function de admin estiver publicada, apaga o login de
    // vez; sem ela, o e-mail continua existindo no Authentication (mas
    // sem cadastro nenhum, então a pessoa entra e não vê dado algum).
    try { await excluirLoginDeOutroUsuario(uid); } catch(_e){ /* segue */ }
  }
}

function turmasView(school){
  let cards;
  if(state.instTurmasCarregando){
    cards = `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando turmas…</div>`;
  } else if(state.instTurmasErro){
    cards = `<div style="padding:20px;font-size:14px;color:var(--red);">${escapeHtml(state.instTurmasErro)}</div>`;
  } else {
    const turmas = state.instTurmas || [];
    cards = turmas.map(t => {
      const qtdAlunos = (t.alunos || []).length;
      return `
      <button type="button" class="turma-card" data-action="abrir-turma-detalhe" data-id="${escapeHtml(t.id)}">
        <div class="turma-card-head">
          <div>
            <div class="turma-card-nome">${escapeHtml(t.nome)}</div>
            ${t.disciplina ? `<div class="turma-card-disciplina">${escapeHtml(t.disciplina)}</div>` : ""}
          </div>
          <span class="turma-card-chevron">${ICONS.chevronRight}</span>
        </div>
        <div class="turma-card-meta">
          ${t.horario ? `<span class="turma-card-tag">${ICONS.clock} ${escapeHtml(t.horario)}</span>` : ""}
          ${t.sala ? `<span class="turma-card-tag">Sala ${escapeHtml(t.sala)}</span>` : ""}
          <span class="turma-card-tag">${ICONS.users} ${qtdAlunos} aluno${qtdAlunos===1?"":"s"}</span>
        </div>
      </button>`;
    }).join("") || `<div class="turmas-empty-state"><strong>Nenhuma turma cadastrada ainda.</strong><span>Use um dos botões acima para criar a primeira turma desta unidade.</span></div>`;
  }

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
      <div>
        <h2 class="section-title" style="margin-bottom:0;">Turmas</h2>
        <p class="section-eyebrow">${escapeHtml(school.nome)} · ${escapeHtml(dataDeHojeExtenso())}</p>
      </div>
      <span style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="teacher-primary-btn" style="white-space:nowrap;background:#fff;color:var(--ink);border:1px solid rgba(18,32,50,.16);margin-top:0;" data-action="abrir-importar-turmas">${ICONS.upload} Importar turmas (PDF)</button>
        <button type="button" class="teacher-primary-btn" style="white-space:nowrap;margin-top:0;" data-action="abrir-criar-turma">Criar turma</button>
      </span>
    </div>
    <div class="grid-cards turma-cards-grid">${cards}</div>`;
}

/* Modal de detalhe de uma turma (aberto ao tocar no card na aba
   "Turmas") — mostra os dados da turma e a lista de alunos vinculados. */
function turmaDetalheModal(){
  if(!state.turmaDetalheId) return "";
  const turma = (state.instTurmas || []).find(t => t.id === state.turmaDetalheId);
  if(!turma) return "";

  const alunos = turma.alunos || [];
  const listaAlunosHtml = alunos.length
    ? `<div class="card flush">${alunos.map(nome => `
        <div class="row">
          <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(nome)}</span>
        </div>`).join("")}</div>`
    : `<div class="teacher-empty-state"><strong>Nenhum aluno vinculado ainda.</strong><span>Abra a ficha do aluno (aba "Alunos") e use "Adicionar à turma".</span></div>`;

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-turma-detalhe-modal">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Detalhes da turma" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>${escapeHtml(turma.nome)}</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(turma.disciplina || "")}${turma.disciplina && turma.horario ? " · " : ""}${escapeHtml(turma.horario || "")}${turma.sala ? ` · Sala ${escapeHtml(turma.sala)}` : ""}</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-turma-detalhe-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>
      <div class="aluno-modal-section">
        <h3 class="teacher-label">${alunos.length} aluno${alunos.length===1?"":"s"}</h3>
        ${listaAlunosHtml}
      </div>
    </div>
  </div>`;
}

/* Sub-aba "Estatísticas": indicadores de frequência da unidade — antes
   vivia junto com a lista de turmas, agora fica separada pra não misturar
   "cadastro/gestão de turmas" com "acompanhamento de faltas". */
function estatisticasView(school){
  const faltantes = school.faltantes.map(a => `
    <div class="row">
      <div>
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(a.nome)}</div>
        <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(a.turma)} · última falta em ${escapeHtml(a.ultima)}</div>
      </div>
      <span class="pill pill-red">${a.faltasMes} faltas</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Sem destaques de falta.</div>`;

  let turmasHtml;
  if(state.instTurmasCarregando || state.instFrequenciaCarregando){
    turmasHtml = `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando frequência das turmas…</div>`;
  } else if(state.instTurmasErro || state.instFrequenciaErro){
    turmasHtml = `<div style="padding:20px;font-size:14px;color:var(--red);">${escapeHtml(state.instTurmasErro || state.instFrequenciaErro)}</div>`;
  } else {
    const turmas = state.instTurmas || [];
    const frequencias = state.instFrequencia || {};
    // Turma com frequência calculada vem primeiro, da maior pra menor;
    // quem ainda não tem nenhuma chamada registrada fica por último.
    const turmasOrdenadas = [...turmas].sort((a, b) => {
      const fa = frequencias[a.id]?.frequencia;
      const fb = frequencias[b.id]?.frequencia;
      if(fa == null && fb == null) return 0;
      if(fa == null) return 1;
      if(fb == null) return -1;
      return fb - fa;
    });
    turmasHtml = turmasOrdenadas.map((t, i) => {
      const f = frequencias[t.id];
      const destaque = i === 0 && f && f.frequencia != null;
      const frequenciaHtml = (f && f.frequencia != null)
        ? `<div style="margin-top:12px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--slate);margin-bottom:4px;">
              <span>Frequência geral</span><span style="font-weight:600;color:var(--ink);">${f.frequencia}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${f.frequencia}%; background:${f.frequencia<75?'#C4544A':'linear-gradient(90deg, var(--gold), var(--gold-light))'};"></div>
            </div>
          </div>`
        : `<p style="font-size:12.5px;color:var(--slate);margin-top:12px;">Ainda sem chamada registrada.</p>`;
      const presencaHojeHtml = (f && f.temRegistroHoje)
        ? `<span class="pill ${f.presentesHoje === f.totalHoje ? 'pill-green' : (f.totalHoje - f.presentesHoje > 3 ? 'pill-red' : 'pill-gold')}">${f.presentesHoje}/${f.totalHoje} presentes hoje</span>`
        : `<span class="pill" style="background:rgba(18,32,50,.06);color:var(--slate);">Sem chamada hoje</span>`;
      return `
      <div class="card${destaque ? " turma-destaque-card" : ""}" style="${destaque ? "" : ""}">
        ${destaque ? `<div class="turma-destaque-badge">${ICONS.trendUp} Maior frequência</div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:15.5px;font-weight:600;color:var(--ink);">${escapeHtml(t.nome)}</div>
            ${t.disciplina ? `<div style="font-size:12.5px;color:var(--slate);margin-top:2px;">${escapeHtml(t.disciplina)}</div>` : ""}
          </div>
          ${presencaHojeHtml}
        </div>
        ${frequenciaHtml}
      </div>`;
    }).join("") || `<div class="turmas-empty-state"><strong>Nenhuma turma cadastrada ainda.</strong><span>Crie turmas na aba "Turmas" pra acompanhar a frequência delas aqui.</span></div>`;
  }

  return `
    <h2 class="section-title">Frequência de hoje</h2>
    <p class="section-eyebrow">${escapeHtml(dataDeHojeExtenso())}</p>
    <div class="grid-cards turma-cards-grid">${turmasHtml}</div>
    <h2 class="section-title" style="margin-top:22px;">Alunos com mais faltas</h2>
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

/* ------------------------------------------------------------------
   Aba "Aniversários".
   Lista quem faz aniversário no mês (e destaca quem faz hoje) a partir
   da data de nascimento guardada no cadastro do aluno — a mesma que o
   contrato preenche. Cada linha já vem com o botão do WhatsApp e a
   mensagem escrita: se o aluno tem número próprio, a mensagem vai pra
   ele; se não tem, vai pro responsável vinculado que tiver telefone. */
function destinoDoParabens(aluno){
  const doAluno = telefoneValido(aluno.contato);
  if(doAluno){
    return {
      tipo: "aluno",
      nome: aluno.nome,
      numero: doAluno,
      texto: MENSAGEM_ANIVERSARIO.paraAluno(primeiroNome(aluno.nome)),
    };
  }
  const responsavel = (state.gestaoResponsaveis || [])
    .find(r => r.alunosIds.includes(aluno.id) && telefoneValido(r.contato));
  if(responsavel){
    return {
      tipo: "responsavel",
      nome: responsavel.nome,
      numero: telefoneValido(responsavel.contato),
      texto: MENSAGEM_ANIVERSARIO.paraResponsavel(primeiroNome(responsavel.nome), aluno.nome),
    };
  }
  return null;
}

function aniversariosView(school){
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth() + 1;

  if(state.instAlunosCarregando || state.gestaoEquipeCarregando){
    return `
      <h2 class="section-title">Aniversários</h2>
      <div style="padding:20px;font-size:14px;color:var(--slate);">Carregando aniversariantes…</div>`;
  }

  const todos = state.instAlunos || [];
  const comData = todos
    .filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a.nascimento || ""))
    .map(a => {
      const [ano, mes, dia] = a.nascimento.split("-").map(Number);
      // idade que ele completa neste ano
      const idade = hoje.getFullYear() - ano;
      return { ...a, dia, mes, ano, idade, ehHoje: dia === diaHoje && mes === mesHoje };
    });
  const semData = todos.length - comData.length;

  const filtrados = (state.aniversarioMes === "todos"
    ? comData
    : comData.filter(a => a.mes === Number(state.aniversarioMes))
  ).sort((a, b) => (a.mes - b.mes) || (a.dia - b.dia) || a.nome.localeCompare(b.nome));

  const aniversariantesHoje = comData.filter(a => a.ehHoje);

  const linha = (a) => {
    const destino = destinoDoParabens(a);
    const rotuloDestino = destino
      ? (destino.tipo === "aluno"
          ? "WhatsApp do aluno"
          : `Responsável: ${escapeHtml(destino.nome)}`)
      : "Sem WhatsApp cadastrado";
    const botao = destino
      ? `<a class="aniversario-btn" href="${whatsappLinkComTexto(destino.numero, destino.texto)}" target="_blank" rel="noopener">${ICONS.megaphone} Enviar parabéns</a>`
      : `<button type="button" class="btn-secondary" data-action="abrir-aluno" data-id="${escapeHtml(a.id)}">Cadastrar contato</button>`;
    return `
      <div class="aniversario-row${a.ehHoje ? " is-hoje" : ""}">
        <div class="aniversario-data">
          <strong>${String(a.dia).padStart(2, "0")}</strong>
          <span>${MESES_CURTOS[a.mes - 1]}</span>
        </div>
        <div class="aniversario-info">
          <span class="aniversario-nome">${escapeHtml(a.nome)}${a.ehHoje ? ` <span class="aniversario-hoje-tag">hoje</span>` : ""}</span>
          <span class="aniversario-sub">${escapeHtml(a.turma || "—")} · faz ${a.idade} anos · ${rotuloDestino}</span>
        </div>
        ${botao}
      </div>`;
  };

  const opcoesMes = MESES_LONGOS.map((nome, i) => `
    <option value="${i + 1}" ${state.aniversarioMes === String(i + 1) ? "selected" : ""}>${nome}</option>`).join("")
    + `<option value="todos" ${state.aniversarioMes === "todos" ? "selected" : ""}>Todos os meses</option>`;

  const blocoHoje = aniversariantesHoje.length ? `
    <div class="aniversario-hoje-card">
      <h3>${ICONS.cake} ${aniversariantesHoje.length === 1 ? "Aniversariante de hoje" : "Aniversariantes de hoje"}</h3>
      ${aniversariantesHoje.map(linha).join("")}
    </div>` : "";

  const lista = filtrados.length
    ? filtrados.map(linha).join("")
    : `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum aniversariante ${state.aniversarioMes === "todos" ? "com data cadastrada" : `em ${MESES_LONGOS[Number(state.aniversarioMes) - 1].toLowerCase()}`}.</div>`;

  return `
    <h2 class="section-title">Aniversários</h2>
    <p class="section-eyebrow">Alunos de ${escapeHtml(school.nome)} por data de nascimento. A mensagem já vai escrita: se o aluno tem WhatsApp, vai pra ele; se não tem, vai pro responsável vinculado.</p>
    ${blocoHoje}
    <div class="aniversario-filtro">
      <label class="teacher-label" for="aniversario-mes">Mês</label>
      <select id="aniversario-mes" class="teacher-text-input" data-action="noop">${opcoesMes}</select>
    </div>
    <div class="card flush">${lista}</div>
    ${semData ? `<p class="section-eyebrow" style="margin-top:10px;">${semData} aluno(s) ainda sem data de nascimento no cadastro. Dá pra preencher na ficha do aluno, na aba "Alunos" — os contratos novos já gravam a data sozinhos.</p>` : ""}`;
}

/* Ficha do aluno — modal aberto ao clicar num aluno na aba "Alunos". Mostra
   contato editável, resumo de frequência/financeiro, responsáveis já
   vinculados, um formulário pra cadastrar um novo responsável e o botão
   de excluir o aluno (com confirmação em dois passos). */
function alunoDetalheModal(){
  if(!state.alunoDetalheId) return "";
  const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
  if(!aluno) return "";

  // Turmas: as que ele já frequenta (com botão de tirar) + seletor pra
  // colocá-lo em outra. Vem de instTurmas (coleção "turmas").
  let turmasHtml;
  if(state.instTurmasCarregando && state.instTurmas === null){
    turmasHtml = `<p class="section-eyebrow" style="margin:6px 0;">Carregando turmas…</p>`;
  } else if(state.instTurmasErro || state.instTurmas === null){
    turmasHtml = `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin:6px 0;">${escapeHtml(state.instTurmasErro || "Não foi possível carregar as turmas agora.")}</p>`;
  } else {
    const dele = turmasDoAluno(aluno.nome);
    const disponiveis = state.instTurmas
      .filter(t => !dele.some(x => x.id === t.id))
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
    const listaHtml = dele.length
      ? `<div class="aluno-modal-resp-list">${dele.map(t => `
        <div class="aluno-modal-resp-item" style="align-items:flex-start;">
          <span>
            <span style="font-weight:600;color:var(--ink);font-size:13.5px;display:block;">${escapeHtml(t.nome)}</span>
            <span style="color:var(--slate);font-size:12px;">${escapeHtml([t.disciplina, t.horario, t.sala ? `Sala ${t.sala}` : ""].filter(Boolean).join(" · ") || "—")}</span>
          </span>
          <button type="button" class="attendance-btn" data-action="remover-aluno-da-turma" data-turma="${escapeHtml(t.id)}" aria-label="Tirar da turma" title="Tirar da turma" ${state.alunoTurmaSalvando ? "disabled" : ""}>${ICONS.close}</button>
        </div>`).join("")}</div>`
      : `<p class="section-eyebrow" style="margin:6px 0;">Ainda não está em nenhuma turma.</p>`;
    const adicionarHtml = state.instTurmas.length === 0
      ? `<p class="section-eyebrow" style="margin:8px 0 0;">Nenhuma turma criada nesta unidade ainda — crie na aba "Turmas".</p>`
      : disponiveis.length === 0
        ? `<p class="section-eyebrow" style="margin:8px 0 0;">Este aluno já está em todas as turmas da unidade.</p>`
        : `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
            <select id="aluno-turma-select" class="teacher-text-input" style="flex:1 1 220px;margin:0;">
              <option value="" ${!state.alunoTurmaSelecionada ? "selected" : ""} disabled>Escolha a turma</option>
              ${disponiveis.map(t => `<option value="${escapeHtml(t.id)}" ${state.alunoTurmaSelecionada === t.id ? "selected" : ""}>${escapeHtml(`${t.nome}${t.disciplina ? ` (${t.disciplina})` : ""}${t.horario ? ` · ${t.horario}` : ""}`)}</option>`).join("")}
            </select>
            <button type="button" class="teacher-primary-btn" style="margin-top:0;white-space:nowrap;" data-action="adicionar-aluno-na-turma" ${state.alunoTurmaSalvando ? "disabled" : ""}>${state.alunoTurmaSalvando ? "Salvando…" : "Adicionar à turma"}</button>
          </div>`;
    turmasHtml = `${listaHtml}${adicionarHtml}`;
  }

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
        <input id="aluno-detalhe-contato" class="teacher-text-input" placeholder="WhatsApp (com DDD) ou e-mail" value="${escapeHtml(state.alunoDetalheContatoInput)}" />
        <label class="teacher-label" for="aluno-detalhe-nascimento" style="display:block;margin-top:10px;">Data de nascimento</label>
        <input id="aluno-detalhe-nascimento" type="date" class="teacher-text-input" value="${escapeHtml(state.alunoDetalheNascimentoInput)}" />
        <p class="section-eyebrow" style="margin:6px 0 0;">Com a data preenchida o aluno passa a aparecer na aba "Aniversários".</p>
        <button type="button" class="teacher-primary-btn" data-action="salvar-aluno-contato" ${state.alunoDetalheSalvandoContato ? "disabled" : ""}>${state.alunoDetalheSalvandoContato ? "Salvando…" : "Salvar contato e data"}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Turmas</h3>
        ${turmasHtml}
        ${state.alunoTurmaErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.alunoTurmaErro)}</p>` : ""}
        ${state.alunoTurmaMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.alunoTurmaMensagem)}</p>` : ""}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Acesso ao app</h3>
        <p class="section-eyebrow" style="margin:0 0 8px;">${aluno.email ? `Entra com <strong style="color:var(--ink);">${escapeHtml(aluno.email)}</strong>` : "E-mail de acesso não registrado neste cadastro."}</p>
        <button type="button" class="btn-secondary" data-action="abrir-acesso-usuario" data-tipo="aluno" data-id="${escapeHtml(aluno.id)}" data-uid="${escapeHtml(aluno.uid || "")}" data-nome="${escapeHtml(aluno.nome)}" data-email="${escapeHtml(aluno.email || "")}">${ICONS.key} Trocar senha / gerenciar acesso</button>
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
    // Formulário de novo aviso (professor): guarda sem re-renderizar, pro cursor não pular.
    if(t.dataset && t.dataset.evCampo){
      if(state.cal.form) state.cal.form[t.dataset.evCampo] = t.value;
      return;
    }
    if(t.id === "alunos-busca"){
      const cursor = t.selectionStart;
      state.alunosBusca = t.value;
      render();
      const novo = document.getElementById("alunos-busca");
      if(novo){ novo.focus(); novo.setSelectionRange(cursor, cursor); }
      return;
    }
    if(t.id === "gestao-acessos-busca"){
      const cursor = t.selectionStart;
      state.gestaoAcessosBusca = t.value;
      render();
      const novo = document.getElementById("gestao-acessos-busca");
      if(novo){ novo.focus(); novo.setSelectionRange(cursor, cursor); }
      return;
    }
    if(t.id === "acesso-email"){ state.acessoEmail = t.value; return; }
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
    // Campos do contrato: guardam o valor sem re-renderizar, senão o
    // cursor pula pra fora do input a cada tecla. O recálculo (parcelas,
    // término) acontece no "change", quando a pessoa sai do campo.
    if(t.dataset && t.dataset.contratoField){
      state.contrato[t.dataset.contratoField] = t.value;
      return;
    }
    if(t.dataset && t.dataset.importCampo){
      const i = Number(t.dataset.row);
      const item = state.importContratosItens[i];
      if(item) item.contrato[t.dataset.importCampo] = t.value;
      return;
    }
    if(t.id === "nova-turma-nome"){ state.novaTurmaNome = t.value; return; }
    if(t.id === "nova-turma-horario"){ state.novaTurmaHorario = t.value; return; }
    if(t.id === "nova-turma-sala"){ state.novaTurmaSala = t.value; return; }
  });

  app.addEventListener("change", async (e) => {
    const t = e.target;
    if(t.dataset && t.dataset.evCampo){
      const f = state.cal.form;
      if(!f) return;
      const campo = t.dataset.evCampo;
      f[campo] = t.value;
      // trocar turma ou "enviar para" muda a lista de alunos do formulário
      if(campo === "turmaId" || campo === "alvo"){
        f.alunoNome = "";
        render();
      }
      return;
    }
    if(t.id === "aniversario-mes"){
      state.aniversarioMes = t.value;
      render();
      return;
    }
    if(t.id === "aluno-turma-select"){
      state.alunoTurmaSelecionada = t.value;
      return;
    }
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
    if(t.dataset && t.dataset.contratoEnvio){
      const arq = t.files && t.files[0];
      if(arq) state.contratoArquivosEnvio[t.dataset.contratoEnvio] = arq;
      t.value = "";
      render();
      return;
    }
    if(t.id === "import-contratos-pdf-files"){
      const arquivos = Array.from(t.files || []);
      if(!arquivos.length) return;
      state.importContratosLendo = true;
      state.importContratosResumo = null;
      render();
      for(const arquivo of arquivos){
        try {
          const texto = await extrairTextoDoPdf(arquivo);
          const { contrato, avisos } = interpretarContratoTexto(texto);
          const precisaLogin = contratoPrecisaLoginAluno(contrato);
          if(precisaLogin) contratoSugerirAcessos(contrato, emailsUsadosDaUnidade());
          state.importContratosItens.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            arquivoNome: arquivo.name,
            arquivo,            // fica só na memória, pra poder mandar o PDF pra assinatura
            assinado: true,     // padrão: já assinado; a secretaria troca pra "pendente" se for o caso
            contrato,
            avisos,
            selecionado: true,
            // por padrão cria acesso se o curso reconhecido permitir —
            // some antes de confirmar a lista inteira, se for o caso
            criarAcesso: precisaLogin || !contrato.curso,
            status: "",
            erro: "",
          });
        } catch(err){
          console.error("Erro ao ler PDF de contrato:", arquivo.name, err);
          state.importContratosItens.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            arquivoNome: arquivo.name,
            arquivo,
            assinado: true,
            contrato: contratoEstadoInicial(),
            avisos: [err?.message === "pdfjs-nao-carregado"
              ? "A biblioteca de leitura de PDF não carregou (conexão bloqueada?). Tente de novo."
              : "Não consegui ler este PDF (pode ser uma imagem escaneada, sem texto selecionável). Preencha manualmente ou pule este arquivo."],
            selecionado: false,
            criarAcesso: false,
            status: "",
            erro: "",
          });
        }
      }
      state.importContratosLendo = false;
      t.value = "";  // permite escolher o mesmo arquivo de novo, se precisar
      render();
      return;
    }
    if(t.dataset && t.dataset.importCampo === "curso" && t.tagName === "SELECT"){
      const i = Number(t.dataset.row);
      const item = state.importContratosItens[i];
      if(item){
        item.contrato.curso = t.value;
        // curso decide se o aluno ganha login (Recreação não ganha) —
        // reajusta o padrão da caixinha, mas só se a secretaria ainda
        // não tiver mexido nela manualmente pra este item
        item.criarAcesso = contratoPrecisaLoginAluno(item.contrato);
      }
      render();
      return;
    }
    if(t.dataset && t.dataset.importCampo === "cnpj" && t.tagName === "SELECT"){
      const i = Number(t.dataset.row);
      const item = state.importContratosItens[i];
      if(item) contratoAplicarEmpresa(item.contrato, t.value);
      render();
      return;
    }
    if(t.id === "import-turmas-pdf-file"){
      const file = t.files && t.files[0];
      if(!file) return;
      state.importTurmasArquivoNome = file.name;
      state.importTurmasLendoPdf = true;
      state.importTurmasErro = "";
      state.importTurmasPreview = null;
      state.importTurmasResultado = null;
      render();
      try {
        const texto = await extrairTextoDoPdf(file);
        analisarTextoImportado(texto);
      } catch(err){
        console.error("Erro ao ler PDF:", err);
        state.importTurmasErro = err?.message === "pdfjs-nao-carregado"
          ? "A biblioteca de leitura de PDF não carregou (conexão com cdnjs.cloudflare.com bloqueada?). Tente de novo em alguns instantes."
          : "Não consegui ler esse PDF automaticamente (pode ser uma imagem escaneada, sem texto de verdade). Tente exportar a lista novamente em um PDF com texto selecionável, ou crie as turmas manualmente pelo botão \"Criar turma\".";
      } finally {
        state.importTurmasLendoPdf = false;
        render();
      }
      return;
    }
    if(t.dataset && t.dataset.importField){
      const i = Number(t.dataset.row);
      if(state.importTurmasPreview && state.importTurmasPreview[i]){
        state.importTurmasPreview[i][t.dataset.importField] = t.value;
      }
      return;
    }
    // --- Contrato ---
    if(t.dataset && t.dataset.contratoSelect){
      const campo = t.dataset.contratoSelect;
      const c = state.contrato;
      if(campo === "cnpj"){
        contratoAplicarEmpresa(c, t.value);
      } else if(campo === "alunoCadastrado"){
        // atalho: puxa o nome de um aluno já cadastrado na unidade
        if(t.value) c.alunoNome = t.value;
      } else {
        c[campo] = t.value;
      }
      if(campo === "duracao") contratoRecalcular(c, { forcarParcelas: true });
      else contratoRecalcular(c);
      // o curso decide se o aluno recebe login (Recreação não recebe)
      if(campo === "curso" || campo === "alunoCadastrado") contratoSugerirAcessos(c, emailsUsadosDaUnidade());
      c.erro = "";
      render();
      return;
    }
    if(t.dataset && t.dataset.contratoField){
      // datas e valores: ao sair do campo, recalcula término/parcelas
      state.contrato[t.dataset.contratoField] = t.value;
      const recalcula = ["dataInicio","duracaoCustom","valorCurso","valorMaterial","numParcelas","qtdParcelasIniciais"];
      // nome mudou: o login antigo não serve mais, refaz do zero
      const sugereAcesso = ["alunoNome","respNome"];
      if(t.dataset.contratoField === "alunoNome") state.contrato.emailAluno = "";
      if(t.dataset.contratoField === "respNome") state.contrato.emailResp = "";
      if(recalcula.includes(t.dataset.contratoField)){
        contratoRecalcular(state.contrato);
        render();
      } else if(sugereAcesso.includes(t.dataset.contratoField)){
        contratoSugerirAcessos(state.contrato, emailsUsadosDaUnidade());
        render();
      }
      return;
    }
    if(t.id === "nova-turma-disciplina"){ state.novaTurmaDisciplina = t.value; return; }
    if(t.id === "turma-modal-professor"){
      const id = t.value;
      const professor = (state.gestaoProfessores || []).find(p => p.id === id);
      state.profTurmasModalId = id || null;
      state.profTurmasModalNome = professor ? professor.nome : "";
      state.profTurmasModalTurmas = null;
      state.profTurmasModalErro = "";
      state.profTurmasModalMensagem = "";
      state.novaTurmaNome = "";
      state.novaTurmaDisciplina = "";
      state.novaTurmaHorario = "";
      state.novaTurmaSala = "";
      state.novaTurmaAlunos = [];
      render();
      if(id) carregarTurmasDoProfessorGestao(id);
      return;
    }
    if(t.id === "new-user-turma"){ state.novoUsuarioTurma = t.value; return; }
    if(t.id === "new-user-role"){
      state.novoUsuarioRole = t.value;
      state.instituicaoErro = "";
      if(t.value === "responsavel" && state.escolaSelecionadaId){
        await carregarAlunosParaVinculo(state.escolaSelecionadaId);
      }
      if(t.value === "professor" && state.novoUsuarioEscolasIds.length === 0 && state.escolaSelecionadaId){
        // começa marcado só na unidade atual; a secretaria desmarca/marca
        // outras se o professor também der aula nelas.
        state.novoUsuarioEscolasIds = [state.escolaSelecionadaId];
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
        state.instTurmas = null;
        state.instTurmasEscolaId = null;
        state.instFrequencia = null;
        state.instFrequenciaEscolaId = null;
        state.screen = "instituicao";
        render();
        carregarTurmasDaInstituicao(state.escolaSelecionadaId);
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
        state.alunoTab = el.dataset.key;
        state.cal.diaAberto = null;
        render();
        if(state.alunoTab === "calendario") carregarCalendarioDoAluno(state.data.aluno);
        break;
      case "set-familia-tab":
        state.familiaTab = el.dataset.key;
        state.cal.diaAberto = null;
        render();
        if(state.familiaTab === "calendario") carregarCalendarioDoAluno(calAlunoAtual());
        break;
      case "switch-student":
        state.familiaStudentId = el.dataset.id;
        state.cal.diaAberto = null;
        render();
        if(state.familiaTab === "calendario") carregarCalendarioDoAluno(calAlunoAtual());
        break;
      case "set-inst-tab":
        state.instTab = el.dataset.key;
        render();
        if(state.instTab === "turmas" && state.escolaSelecionadaId
          && (state.instTurmas === null || state.instTurmasEscolaId !== state.escolaSelecionadaId)
          && !state.instTurmasCarregando){
          carregarTurmasDaInstituicao(state.escolaSelecionadaId);
        }
        if(state.instTab === "estatisticas" && state.escolaSelecionadaId){
          if((state.instTurmas === null || state.instTurmasEscolaId !== state.escolaSelecionadaId) && !state.instTurmasCarregando){
            carregarTurmasDaInstituicao(state.escolaSelecionadaId);
          }
          if((state.instFrequencia === null || state.instFrequenciaEscolaId !== state.escolaSelecionadaId) && !state.instFrequenciaCarregando){
            carregarFrequenciaDaInstituicao(state.escolaSelecionadaId);
          }
        }
        if(state.instTab === "alunos" && state.escolaSelecionadaId
          && (state.instAlunos === null || state.instAlunosEscolaId !== state.escolaSelecionadaId)
          && !state.instAlunosCarregando){
          carregarAlunosDaInstituicao(state.escolaSelecionadaId);
        }
        if(state.instTab === "gestao" && state.gestaoSubTab === "acessos"){
          garantirPessoasDaUnidade();
        }
        // contratos precisa dos alunos (pendentes de assinatura, nomes já
        // cadastrados) e das turmas (seletor de turma)
        if(state.instTab === "contratos"){
          garantirPessoasDaUnidade();
        }
        // aniversários precisa dos alunos (data de nascimento) e dos
        // responsáveis (pra quem tem WhatsApp quando o aluno não tem)
        if(state.instTab === "aniversarios"){
          garantirPessoasDaUnidade();
        }
        if((state.instTab === "professores" || state.instTab === "responsaveis") && state.escolaSelecionadaId
          && (state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== state.escolaSelecionadaId)
          && !state.gestaoEquipeCarregando){
          carregarEquipeDaEscola(state.escolaSelecionadaId);
        }
        break;
      case "set-gestao-subtab":
        state.gestaoSubTab = el.dataset.key;
        render();
        if(state.gestaoSubTab === "acessos") garantirPessoasDaUnidade();
        break;

      case "set-acessos-grupo":
        state.gestaoAcessosGrupo = el.dataset.key;
        render();
        break;

      case "ir-para-acessos":
        state.instTab = "gestao";
        state.gestaoSubTab = "acessos";
        render();
        garantirPessoasDaUnidade();
        break;

      case "whatsapp-suporte":
        window.open(whatsappLink(SUPORTE_TECNICO.whatsapp), "_blank", "noopener");
        break;
      case "set-professor-tab":
        state.professorTab = el.dataset.key;
        state.cal.diaAberto = null;
        render();
        if(state.professorTab === "calendario") carregarEventosDoProfessor();
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
          // Cópia por aluno, que alimenta o calendário do aluno e do responsável.
          // Se falhar, a chamada em si já está salva — só avisa o professor.
          try {
            await sincronizarCalendarioDaChamada(turma, presencas, observacoesAlunos, disciplina);
          } catch(errCal){
            console.error("Erro ao atualizar o calendário dos alunos:", errCal?.code, errCal);
            state.professorRegistroErro = `A chamada foi salva, mas não foi possível atualizar o calendário dos alunos agora${errCal?.code ? ` (${errCal.code})` : ""}. Avise o suporte técnico.`;
          }
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

      case "toggle-escola-professor": {
        const escId = el.dataset.escola;
        const lista = state.novoUsuarioEscolasIds;
        state.novoUsuarioEscolasIds = lista.includes(escId) ? lista.filter(x => x !== escId) : [...lista, escId];
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
        // professor pode ter marcado mais de uma unidade; sem nada marcado
        // (unidade única, ou form ainda não tocado), cai na unidade atual.
        const escolasIdsProfessor = state.novoUsuarioEscolasIds.length
          ? state.novoUsuarioEscolasIds
          : (escolaId ? [escolaId] : []);

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
        if(role === "professor" && escolasIdsProfessor.length === 0){
          state.instituicaoErro = "Selecione ao menos uma unidade em que o professor dá aula.";
          render();
          break;
        }

        state.novoUsuarioSalvando = true;
        render();
        try {
          await criarUsuarioNaInstituicao({
            role, nome, email, senha, escolaId,
            escolasIds: escolasIdsProfessor,
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
          state.novoUsuarioEscolasIds = [];
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

      case "abrir-importar-contratos-modal":
        state.importContratosModalAberto = true;
        state.importContratosItens = [];
        state.importContratosResumo = null;
        render();
        garantirPessoasDaUnidade();
        break;

      case "fechar-importar-contratos-modal":
        state.importContratosModalAberto = false;
        render();
        break;

      case "import-contrato-toggle": {
        const item = state.importContratosItens[Number(el.dataset.row)];
        if(item) item.selecionado = !item.selecionado;
        render();
        break;
      }

      case "import-contrato-toggle-acesso": {
        const item = state.importContratosItens[Number(el.dataset.row)];
        if(item) item.criarAcesso = !item.criarAcesso;
        render();
        break;
      }

      case "import-contrato-assinatura": {
        const item = state.importContratosItens[Number(el.dataset.row)];
        if(item && item.status !== "ok") item.assinado = el.dataset.valor === "assinado";
        render();
        break;
      }

      case "import-contrato-assinatura-todos":
        state.importContratosItens.forEach(it => {
          if(it.status !== "ok") it.assinado = el.dataset.valor === "assinado";
        });
        render();
        break;

      case "import-contrato-enviar": {
        const item = state.importContratosItens[Number(el.dataset.row)];
        if(!item || !item.arquivo) break;
        const destino = destinoDoContratoImportado(item.contrato);
        const resultado = await enviarContratoParaAssinatura({
          arquivo: item.arquivo,
          alunoNome: item.contrato.alunoNome,
          respNome: destino.nome,
          numero: destino.numero,
        });
        item.envioMsg = textoResultadoEnvio(resultado);
        if((resultado === "compartilhado" || resultado === "manual") && item.alunoId){
          await marcarContratoEnviado(item.alunoId);
        }
        render();
        break;
      }

      case "contrato-pendente-enviar": {
        const alunoId = el.dataset.aluno;
        const aluno = (state.instAlunos || []).find(a => a.id === alunoId);
        const arquivo = state.contratoArquivosEnvio[alunoId];
        if(!aluno || !arquivo) break;
        const destino = destinoDoContratoDoAluno(aluno);
        const resultado = await enviarContratoParaAssinatura({
          arquivo, alunoNome: aluno.nome, respNome: destino.nome, numero: destino.numero,
        });
        state.contratoEnvioMsg[alunoId] = textoResultadoEnvio(resultado);
        if(resultado === "compartilhado" || resultado === "manual") await marcarContratoEnviado(alunoId);
        render();
        break;
      }

      case "contrato-pendente-assinado": {
        const alunoId = el.dataset.aluno;
        try {
          await gravarStatusContrato(alunoId, "assinado");
          delete state.contratoArquivosEnvio[alunoId];
          delete state.contratoEnvioMsg[alunoId];
        } catch(err){
          console.error("Erro ao marcar contrato como assinado:", err);
          state.contratoEnvioMsg[alunoId] = `Não consegui salvar${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        }
        render();
        break;
      }

      case "import-contrato-enviar-acesso": {
        const item = state.importContratosItens[Number(el.dataset.row)];
        if(!item || !item.acessos) break;
        const c = item.contrato;
        const ehResp = el.dataset.quem === "resp";
        abrirWhatsappDeAcesso({
          ehResponsavel: ehResp,
          acesso: ehResp ? item.acessos.responsavel : item.acessos.aluno,
          nomeAluno: c.alunoNome,
          nomeDestino: ehResp ? c.respNome : c.alunoNome,
          contato: ehResp ? c.contatoResp : c.contatoAluno,
        });
        break;
      }

      case "contrato-enviar-acesso": {
        const c = state.contrato;
        const r = c.resultadoAcessos;
        if(!r) break;
        const ehResp = el.dataset.quem === "resp";
        abrirWhatsappDeAcesso({
          ehResponsavel: ehResp,
          acesso: ehResp ? r.responsavel : r.aluno,
          nomeAluno: c.alunoNome,
          nomeDestino: ehResp ? c.respNome : c.alunoNome,
          contato: ehResp ? c.contatoResp : c.contatoAluno,
        });
        break;
      }

      case "import-contrato-remover":
        state.importContratosItens.splice(Number(el.dataset.row), 1);
        render();
        break;

      case "import-contrato-confirmar": {
        const itens = state.importContratosItens.filter(it => it.selecionado && it.status !== "ok");
        if(!itens.length) break;

        state.importContratosSalvando = true;
        state.importContratosProgresso = { feito: 0, total: itens.length };
        state.importContratosResumo = null;
        render();

        // acumula os logins já usados/escolhidos NESTA leva, pra dois
        // homônimos do mesmo lote não saírem com o mesmo login antes
        // mesmo de qualquer um ter sido gravado no banco
        let emailsLote = emailsUsadosDaUnidade();
        const resumo = { criados: 0, atualizados: 0, comLogin: 0, pendentes: 0, erros: 0 };

        for(const item of itens){
          const c = item.contrato;
          item.status = "salvando";
          render();

          const problema = !c.alunoNome.trim() ? "Falta o nome do aluno."
            : !c.cnpj ? "Falta escolher o CNPJ."
            : !c.curso ? "Falta escolher o curso."
            : "";
          if(problema){
            item.status = "erro";
            item.erro = problema;
            resumo.erros++;
            state.importContratosProgresso.feito++;
            render();
            continue;
          }

          if(item.criarAcesso){
            // limpa e sorteia de novo contra a lista mais atual do lote,
            // garantindo que ninguém saia com login repetido
            c.emailAluno = ""; c.senhaAluno = "";
            c.emailResp = ""; c.senhaResp = "";
            contratoSugerirAcessos(c, emailsLote);
          } else {
            c.emailAluno = ""; c.senhaAluno = "";
            c.emailResp = ""; c.senhaResp = "";
          }

          c.contratoStatus = item.assinado ? "assinado" : "pendente";

          const jaExistiaAntes = (state.instAlunos || [])
            .some(a => normalizarNome(a.nome) === normalizarNome(c.alunoNome));

          try {
            const resultado = await criarCadastrosDoContrato(c);
            if(jaExistiaAntes) resumo.atualizados++; else resumo.criados++;
            if(resultado.aluno) { emailsLote.push(resultado.aluno.email); resumo.comLogin++; }
            if(resultado.responsavel){ emailsLote.push(resultado.responsavel.email); resumo.comLogin++; }
            item.status = "ok";
            item.alunoId = resultado.alunoId || null;
            item.acessos = { aluno: resultado.aluno, responsavel: resultado.responsavel };
            if(!item.assinado) resumo.pendentes++;
            item.avisos = resultado.avisos || [];
          } catch(err){
            console.error("Erro ao importar contrato:", item.arquivoNome, err);
            item.status = "erro";
            item.erro = mensagemErroAcessosContrato(err);
            resumo.erros++;
          }

          state.importContratosProgresso.feito++;
          render();
        }

        state.importContratosSalvando = false;
        state.importContratosResumo = resumo;
        render();
        garantirPessoasDaUnidade();
        break;
      }

      case "abrir-contrato-modal": {
        const c = state.contrato;
        c.aberto = true;
        c.erro = "";
        c.resultadoAcessos = null;
        if(!c.cnpj){
          // Já chuta o CNPJ pela unidade aberta no sistema, pra secretaria
          // só confirmar (ou trocar, se for outro CNPJ da mesma cidade).
          const nomeEscola = (state.data.escolas?.[state.escolaSelecionadaId]?.nome || "").toLowerCase();
          const preferido = nomeEscola.includes("prata") ? "46.616.889/0001-37"
            : nomeEscola.includes("salto") ? "49.080.272/0001-38" : "";
          if(preferido) contratoAplicarEmpresa(c, preferido);
        }
        if(!c.dataAssinatura) c.dataAssinatura = dataDeHojeISO();
        contratoRecalcular(c);
        contratoSugerirAcessos(c, emailsUsadosDaUnidade());
        render();
        // alunos e responsáveis já cadastrados: servem pro atalho de
        // preencher o nome e pra não duplicar cadastro na hora de gerar
        garantirPessoasDaUnidade();
        break;
      }

      case "fechar-contrato-modal":
        state.contrato.aberto = false;
        state.contrato.erro = "";
        render();
        break;

      case "contrato-sem-responsavel":
        state.contrato.semResponsavel = !state.contrato.semResponsavel;
        contratoSugerirAcessos(state.contrato, emailsUsadosDaUnidade());
        render();
        break;

      case "contrato-gerar-outro-login": {
        const c = state.contrato;
        const quem = el.dataset.quem;
        // guarda o login atual como "ocupado" e pede o próximo da fila,
        // junto com uma senha nova
        if(quem === "aluno"){
          const usados = [...emailsUsadosDaUnidade(), c.emailAluno];
          c.emailAluno = "";
          c.senhaAluno = senhaProvisoria();
          contratoSugerirAcessos(c, usados);
        } else {
          const usados = [...emailsUsadosDaUnidade(), c.emailResp];
          c.emailResp = "";
          c.senhaResp = senhaProvisoria();
          contratoSugerirAcessos(c, usados);
        }
        render();
        break;
      }

      case "contrato-criar-acessos":
        state.contrato.criarAcessos = !state.contrato.criarAcessos;
        contratoSugerirAcessos(state.contrato, emailsUsadosDaUnidade());
        render();
        break;

      case "contrato-dia": {
        const dia = el.dataset.dia;
        const dias = state.contrato.dias;
        state.contrato.dias = dias.includes(dia)
          ? dias.filter(d => d !== dia)
          // mantém sempre na ordem da semana, pra sair "terça-feira e quinta-feira"
          : [...dias, dia].sort((a, b) => DIAS_SEMANA_ORDEM.indexOf(a) - DIAS_SEMANA_ORDEM.indexOf(b));
        render();
        break;
      }

      case "contrato-gerar": {
        const c = state.contrato;
        contratoRecalcular(c);
        const problema = contratoValidar(c);
        if(problema){
          c.erro = problema;
          render();
          break;
        }
        // A janela precisa abrir no clique, antes de qualquer await, senão
        // o navegador entende como pop-up e bloqueia.
        const abriu = abrirContratoParaImpressao(c);
        if(!abriu){
          c.erro = "O navegador bloqueou a janela do contrato. Libere os pop-ups deste site e tente de novo.";
          render();
          break;
        }
        c.erro = "";
        state.instituicaoMensagem = `Contrato de ${c.alunoNome} gerado. Confira na aba que abriu e mande imprimir.`;

        if(!c.criarAcessos){
          c.aberto = false;
          render();
          break;
        }

        c.salvandoAcessos = true;
        c.resultadoAcessos = null;
        render();
        try {
          c.resultadoAcessos = await criarCadastrosDoContrato(c);
          // lista de alunos muda, então força recarregar na próxima abertura
          state.instAlunos = null;
          state.instAlunosEscolaId = null;
          state.gestaoProfessores = null;
          state.gestaoEquipeEscolaId = null;
        } catch(err){
          console.error("Erro ao criar cadastros do contrato:", err);
          c.erro = mensagemErroAcessosContrato(err);
        } finally {
          c.salvandoAcessos = false;
          render();
          // recarrega alunos e responsáveis pra lista já refletir o novo
          // cadastro (e pra um segundo contrato não duplicar ninguém)
          garantirPessoasDaUnidade();
        }
        break;
      }

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

      /* ---------- Senhas & acessos (Gestão) ---------- */

      case "abrir-acesso-usuario": {
        const tipo = el.dataset.tipo;
        const docId = el.dataset.id;
        let uid = el.dataset.uid || null;
        let email = el.dataset.email || "";

        // Cadastros antigos de aluno não guardavam o uid/e-mail no próprio
        // documento — tenta descobrir antes de abrir, pra tela já vir com
        // as opções certas.
        if(tipo === "aluno" && !uid){
          const aluno = (state.instAlunos || []).find(a => a.id === docId);
          uid = aluno?.uid || await descobrirUidDoAluno(docId) || null;
          if(!email) email = aluno?.email || "";
        }

        state.acessoModalAberto = true;
        state.acessoTipo = tipo;
        state.acessoDocId = docId;
        state.acessoUid = uid;
        state.acessoNome = el.dataset.nome || "";
        state.acessoEmail = email;
        state.acessoErro = "";
        state.acessoMensagem = "";
        state.acessoConfirmandoExclusao = el.dataset.excluir === "1";
        // Abrir o gerenciador de acesso a partir da ficha do aluno fecha a
        // ficha — dois modais empilhados só atrapalham no celular.
        if(tipo === "aluno") state.alunoDetalheId = null;
        render();
        break;
      }

      case "fechar-acesso-modal":
        state.acessoModalAberto = false;
        state.acessoConfirmandoExclusao = false;
        state.acessoErro = "";
        state.acessoMensagem = "";
        render();
        break;

      case "definir-senha-acesso": {
        const senha = document.getElementById("acesso-nova-senha")?.value || "";
        state.acessoErro = "";
        state.acessoMensagem = "";
        if(senha.length < 6){
          state.acessoErro = "A senha precisa ter pelo menos 6 caracteres.";
          render();
          break;
        }
        if(!state.acessoUid){
          state.acessoErro = "Não encontramos o login desta pessoa. Use o link por e-mail ou recadastre o acesso.";
          render();
          break;
        }
        state.acessoDefinindoSenha = true;
        render();
        try {
          await definirSenhaDeOutroUsuario(state.acessoUid, senha);
          state.acessoMensagem = `Senha de ${state.acessoNome} alterada. Entregue a nova senha para a pessoa.`;
        } catch(err){
          state.acessoErro = mensagemErroAdmin(err);
        } finally {
          state.acessoDefinindoSenha = false;
          render();
        }
        break;
      }

      case "criar-login-acesso": {
        const email = (document.getElementById("acesso-email")?.value || "").trim();
        const senha = document.getElementById("acesso-nova-senha")?.value || "";
        state.acessoErro = "";
        state.acessoMensagem = "";
        if(!email || senha.length < 6){
          state.acessoErro = "Preencha o e-mail e uma senha de pelo menos 6 caracteres.";
          render();
          break;
        }
        if(state.acessoTipo !== "responsavel"){
          state.acessoErro = "Por enquanto só dá pra criar acesso de responsável por aqui. Para aluno e professor, use Gestão > Criar cadastro.";
          render();
          break;
        }
        const responsavel = (state.gestaoResponsaveis || []).find(r => r.id === state.acessoDocId);
        if(!responsavel){
          state.acessoErro = "Cadastro não encontrado. Feche e abra a lista de novo.";
          render();
          break;
        }
        state.acessoCriandoLogin = true;
        render();
        try {
          const uid = await criarLoginParaResponsavel(responsavel, email, senha);
          responsavel.uid = uid;
          responsavel.email = email;
          state.acessoUid = uid;
          state.acessoEmail = email;
          state.acessoMensagem = `Acesso criado. ${responsavel.nome} entra com ${email} e a senha que você definiu.`;
        } catch(err){
          state.acessoErro = err?.code?.startsWith("auth/")
            ? mensagemErroFirebase(err.code)
            : `Não foi possível criar o acesso agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.acessoCriandoLogin = false;
          render();
        }
        break;
      }

      case "iniciar-exclusao-acesso":
        state.acessoConfirmandoExclusao = true;
        state.acessoErro = "";
        state.acessoMensagem = "";
        render();
        break;

      case "cancelar-exclusao-acesso":
        state.acessoConfirmandoExclusao = false;
        render();
        break;

      case "confirmar-exclusao-acesso": {
        const escolaId = state.escolaSelecionadaId;
        if(!escolaId) break;
        state.acessoExcluindo = true;
        state.acessoErro = "";
        render();
        try {
          if(state.acessoTipo === "aluno"){
            const aluno = (state.instAlunos || []).find(a => a.id === state.acessoDocId);
            if(!aluno) throw new Error("aluno-nao-encontrado");
            await excluirAlunoDaInstituicao(aluno, escolaId);
          } else if(state.acessoTipo === "professor"){
            await excluirProfessorDaEscola(state.acessoDocId, escolaId);
            await carregarEquipeDaEscola(escolaId);
          } else if(state.acessoTipo === "responsavel"){
            const responsavel = (state.gestaoResponsaveis || []).find(r => r.id === state.acessoDocId);
            if(!responsavel) throw new Error("responsavel-nao-encontrado");
            await excluirResponsavelDaEscola(responsavel);
            await carregarEquipeDaEscola(escolaId);
          }
          state.instituicaoMensagem = `${state.acessoNome} foi excluído(a) desta unidade.`;
          state.acessoModalAberto = false;
          state.acessoConfirmandoExclusao = false;
        } catch(err){
          state.acessoErro = `Não foi possível excluir agora${err.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.acessoExcluindo = false;
          render();
        }
        break;
      }

      case "trocar-minha-senha": {
        const atual = document.getElementById("perfil-senha-atual")?.value || "";
        const nova = document.getElementById("perfil-senha-nova")?.value || "";
        const confirma = document.getElementById("perfil-senha-confirma")?.value || "";
        state.perfilSenhaErro = "";
        state.perfilSenhaMensagem = "";
        if(!atual || !nova){
          state.perfilSenhaErro = "Preencha a senha atual e a nova.";
          render();
          break;
        }
        if(nova.length < 6){
          state.perfilSenhaErro = "A nova senha precisa ter pelo menos 6 caracteres.";
          render();
          break;
        }
        if(nova !== confirma){
          state.perfilSenhaErro = "A confirmação não bate com a nova senha.";
          render();
          break;
        }
        const usuario = auth.currentUser;
        if(!usuario?.email){
          state.perfilSenhaErro = "Sua sessão expirou. Saia e entre de novo.";
          render();
          break;
        }
        state.perfilSenhaTrocando = true;
        render();
        try {
          // O Firebase exige confirmar a senha atual antes de trocar
          // (reautenticação) — é o que impede alguém de mudar a senha
          // numa sessão deixada aberta.
          await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(usuario.email, atual));
          await updatePassword(usuario, nova);
          state.perfilSenhaMensagem = "Senha alterada. Use a nova senha no próximo login.";
        } catch(err){
          state.perfilSenhaErro = err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential"
            ? "A senha atual está incorreta."
            : mensagemErroFirebase(err?.code);
        } finally {
          state.perfilSenhaTrocando = false;
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
        state.loginErro = "";
        state.loginAviso = "Entre em contato com a secretaria para a alteração de senha.";
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
        state.alunoDetalheNascimentoInput = aluno ? (aluno.nascimento || "") : "";
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        state.alunoExcluirConfirmando = false;
        state.alunoRespVinculados = null;
        state.alunoRespNome = "";
        state.alunoRespContato = "";
        state.alunoRespErro = "";
        state.alunoRespMensagem = "";
        state.alunoTurmaSelecionada = "";
        state.alunoTurmaErro = "";
        state.alunoTurmaMensagem = "";
        render();
        garantirTurmasDaUnidade();
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
        const nascimento = (document.getElementById("aluno-detalhe-nascimento")?.value || "").trim();
        state.alunoDetalheSalvandoContato = true;
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        render();
        try {
          await updateDoc(doc(db, "alunos", aluno.id), { contato, nascimento });
          aluno.contato = contato;
          aluno.nascimento = nascimento;
          state.alunoDetalheContatoInput = contato;
          state.alunoDetalheNascimentoInput = nascimento;
          state.alunoDetalheMensagem = "Cadastro atualizado.";
        } catch(err){
          state.alunoDetalheErro = "Não foi possível salvar agora. Tente de novo.";
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

      case "adicionar-aluno-na-turma": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno) break;
        const turmaId = state.alunoTurmaSelecionada;
        state.alunoTurmaErro = "";
        state.alunoTurmaMensagem = "";
        if(!turmaId){
          state.alunoTurmaErro = "Escolha a turma primeiro.";
          render();
          break;
        }
        state.alunoTurmaSalvando = true;
        render();
        try {
          await vincularAlunoNaTurma(aluno.nome, turmaId);
          const turma = (state.instTurmas || []).find(t => t.id === turmaId);
          state.alunoTurmaMensagem = `${aluno.nome} agora está na turma ${turma?.nome || "escolhida"}.`;
          state.alunoTurmaSelecionada = "";
        } catch(err){
          console.error("Erro ao adicionar aluno na turma:", err);
          state.alunoTurmaErro = `Não foi possível adicionar à turma agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.alunoTurmaSalvando = false;
          render();
        }
        break;
      }

      case "remover-aluno-da-turma": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        const turmaId = el.dataset.turma;
        if(!aluno || !turmaId) break;
        state.alunoTurmaErro = "";
        state.alunoTurmaMensagem = "";
        state.alunoTurmaSalvando = true;
        render();
        try {
          await desvincularAlunoDaTurma(aluno.nome, turmaId);
          const turma = (state.instTurmas || []).find(t => t.id === turmaId);
          state.alunoTurmaMensagem = `${aluno.nome} saiu da turma ${turma?.nome || ""}.`.replace(" .", ".");
        } catch(err){
          console.error("Erro ao tirar aluno da turma:", err);
          state.alunoTurmaErro = `Não foi possível tirar da turma agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.alunoTurmaSalvando = false;
          render();
        }
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
        state.profTurmasModalAberto = true;
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

      // Abre o mesmo modal de turmas, mas sem professor pré-selecionado —
      // usado pelo botão "Criar turma" da aba "Turmas", já que uma
      // disciplina (ex.: Inglês) pode ter várias turmas, cada uma com
      // professor e horário diferentes.
      case "abrir-criar-turma": {
        state.profTurmasModalAberto = true;
        state.profTurmasModalId = null;
        state.profTurmasModalNome = "";
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
        if((state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== state.escolaSelecionadaId)
          && !state.gestaoEquipeCarregando && state.escolaSelecionadaId){
          carregarEquipeDaEscola(state.escolaSelecionadaId);
        }
        break;
      }

      case "abrir-turma-detalhe": {
        state.turmaDetalheId = el.dataset.id;
        render();
        break;
      }

      case "fechar-turma-detalhe-modal":
        state.turmaDetalheId = null;
        render();
        break;

      case "fechar-professor-turmas-modal":
        state.profTurmasModalAberto = false;
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
          if(state.instTurmasEscolaId === state.escolaSelecionadaId){
            carregarTurmasDaInstituicao(state.escolaSelecionadaId);
          }
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

      case "abrir-editar-professor": {
        const id = el.dataset.id;
        const professor = (state.gestaoProfessores || []).find(p => p.id === id);
        state.editProfessorModalAberto = true;
        state.editProfessorId = id;
        state.editProfessorNome = professor?.nome || el.dataset.nome || "";
        state.editProfessorDisciplinas = professor ? [...professor.disciplinas] : [];
        state.editProfessorErro = "";
        render();
        break;
      }

      case "fechar-editar-professor-modal":
        state.editProfessorModalAberto = false;
        state.editProfessorId = null;
        render();
        break;

      case "toggle-disciplina-editar-professor": {
        const curso = el.dataset.curso;
        const lista = state.editProfessorDisciplinas;
        state.editProfessorDisciplinas = lista.includes(curso) ? lista.filter(x => x !== curso) : [...lista, curso];
        render();
        break;
      }

      case "salvar-edicao-professor": {
        const uid = state.editProfessorId;
        if(!uid) break;
        const nome = (document.getElementById("edit-professor-nome")?.value || "").trim();
        state.editProfessorErro = "";
        if(!nome){
          state.editProfessorErro = "Digite o nome do professor.";
          render();
          break;
        }
        if(state.editProfessorDisciplinas.length === 0){
          state.editProfessorErro = "Selecione ao menos uma disciplina.";
          render();
          break;
        }
        state.editProfessorSalvando = true;
        render();
        try {
          await salvarEdicaoProfessor(uid, nome, state.editProfessorDisciplinas);
          state.editProfessorModalAberto = false;
          state.editProfessorId = null;
          await carregarEquipeDaEscola(state.escolaSelecionadaId);
        } catch(err){
          state.editProfessorErro = `Não foi possível salvar as alterações agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.editProfessorSalvando = false;
          render();
        }
        break;
      }

      case "confirmar-excluir-professor": {
        const id = el.dataset.id;
        const nome = el.dataset.nome || "este professor";
        if(!id) break;
        // Confirmação nativa mesmo — é uma ação destrutiva (some da unidade
        // atual e apaga as turmas dele aqui) e não tem "desfazer".
        const ok = window.confirm(`Remover ${nome} desta unidade? As turmas dele nesta unidade também serão excluídas. Se esta era a única unidade dele, o acesso também é encerrado.`);
        if(!ok) break;
        state.editProfessorExcluindoId = id;
        render();
        try {
          await excluirProfessorDaEscola(id, state.escolaSelecionadaId);
          await carregarEquipeDaEscola(state.escolaSelecionadaId);
        } catch(err){
          state.gestaoEquipeErro = `Não foi possível excluir o professor agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.editProfessorExcluindoId = null;
          render();
        }
        break;
      }

      case "abrir-importar-turmas": {
        state.importTurmasModalAberto = true;
        state.importTurmasTexto = "";
        state.importTurmasArquivoNome = "";
        state.importTurmasPreview = null;
        state.importTurmasErro = "";
        state.importTurmasResultado = null;
        render();
        if((state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== state.escolaSelecionadaId)
          && !state.gestaoEquipeCarregando && state.escolaSelecionadaId){
          carregarEquipeDaEscola(state.escolaSelecionadaId);
        }
        break;
      }

      case "fechar-importar-turmas-modal":
        state.importTurmasModalAberto = false;
        render();
        break;

      case "toggle-importar-linha": {
        const i = Number(el.dataset.row);
        if(!state.importTurmasPreview || !state.importTurmasPreview[i]) break;
        state.importTurmasPreview[i].selecionada = !state.importTurmasPreview[i].selecionada;
        render();
        break;
      }

      case "confirmar-importar-turmas": {
        const escola = state.data.escolas?.[state.escolaSelecionadaId];
        if(!escola || !state.importTurmasPreview) break;
        state.importTurmasSalvando = true;
        state.importTurmasErro = "";
        render();
        try {
          const resultado = await importarTurmasEmLote(
            state.importTurmasPreview, state.escolaSelecionadaId, escola.nome, state.gestaoProfessores || [],
          );
          state.importTurmasResultado = resultado;
          state.importTurmasPreview = null;
          state.importTurmasTexto = "";
          if(state.instTurmasEscolaId === state.escolaSelecionadaId){
            carregarTurmasDaInstituicao(state.escolaSelecionadaId);
          }
        } catch(err){
          state.importTurmasErro = `Não foi possível importar as turmas agora${err.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.importTurmasSalvando = false;
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

      /* ---------- Calendário ---------- */
      case "cal-mes-anterior": {
        const c = state.cal;
        c.mes -= 1;
        if(c.mes < 0){ c.mes = 11; c.ano -= 1; }
        render();
        break;
      }
      case "cal-mes-proximo": {
        const c = state.cal;
        c.mes += 1;
        if(c.mes > 11){ c.mes = 0; c.ano += 1; }
        render();
        break;
      }
      case "cal-hoje": {
        const hoje = new Date();
        state.cal.ano = hoje.getFullYear();
        state.cal.mes = hoje.getMonth();
        render();
        break;
      }
      case "cal-abrir-dia":
        state.cal.diaAberto = el.dataset.dia;
        state.cal.excluirConfirmId = null;
        render();
        break;
      case "cal-fechar-dia":
        state.cal.diaAberto = null;
        state.cal.excluirConfirmId = null;
        render();
        break;
      case "cal-atualizar":
        if(state.screen === "professor") carregarEventosDoProfessor(true);
        else carregarCalendarioDoAluno(calAlunoAtual(), true);
        break;

      case "cal-novo-evento": {
        const turmas = state.data.professorTurmas;
        const turmaPadrao = turmas.find(t => t.id === state.professorTurmaId) || turmas[0];
        state.cal.form = {
          tipo: "aviso", titulo: "", descricao: "",
          data: el.dataset.dia || hojeISO(),
          alvo: "turma", turmaId: turmaPadrao ? turmaPadrao.id : "", alunoNome: "",
          paraQuem: "todos", salvando: false, erro: "",
        };
        state.cal.diaAberto = null;
        render();
        break;
      }
      case "cal-fechar-form":
        state.cal.form = null;
        render();
        break;

      case "cal-salvar-evento": {
        const cal = state.cal;
        const f = cal.form;
        if(!f || f.salvando) break;
        const turma = state.data.professorTurmas.find(t => t.id === f.turmaId);
        const titulo = (f.titulo || "").trim();
        const alunosDaTurma = turma ? (turma.alunos || []) : [];

        let erro = "";
        let destinatarios = [];
        if(!titulo) erro = "Digite o título do aviso.";
        else if(!dataValida(f.data)) erro = "Escolha uma data válida.";
        else if(!turma) erro = "Escolha a turma.";
        else if(f.alvo === "aluno"){
          if(!f.alunoNome || !alunosDaTurma.includes(f.alunoNome)) erro = "Escolha o aluno.";
          else destinatarios = [chaveAluno(turma.escolaId, f.alunoNome)];
        } else {
          if(alunosDaTurma.length === 0) erro = "Esta turma ainda não tem alunos.";
          else destinatarios = [...new Set(alunosDaTurma.map(n => chaveAluno(turma.escolaId, n)))];
        }
        if(erro){ f.erro = erro; render(); break; }

        f.erro = "";
        f.salvando = true;
        render();
        try {
          const dados = {
            tipo: f.tipo === "lembrete" ? "lembrete" : "aviso",
            titulo,
            descricao: (f.descricao || "").trim(),
            data: f.data,
            alvo: f.alvo === "aluno" ? "aluno" : "turma",
            paraQuem: ["todos", "responsaveis", "alunos"].includes(f.paraQuem) ? f.paraQuem : "todos",
            turmaId: turma.id,
            turmaNome: turma.nome || "",
            disciplina: turma.disciplina || "",
            alunoNome: f.alvo === "aluno" ? f.alunoNome : "",
            escolaId: turma.escolaId,
            destinatarios,
            professorId: state.authUser.uid,
            professorNome: state.data.professorNome || "",
            criadoEm: new Date().toISOString(),
          };
          const ref = doc(collection(db, "eventosCalendario"));
          await setDoc(ref, dados);
          cal.prof.eventos.push({ id: ref.id, ...dados });
          // leva o calendário pro mês do aviso e abre o dia, pra a pessoa ver onde ele caiu
          const [ano, mes] = dados.data.split("-").map(Number);
          cal.ano = ano;
          cal.mes = mes - 1;
          cal.diaAberto = dados.data;
          cal.form = null;
        } catch(err){
          f.erro = `Não foi possível salvar o aviso agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
          f.salvando = false;
          console.error("Erro ao salvar aviso:", err?.code, err);
        } finally {
          render();
        }
        break;
      }

      case "cal-cancelar-exclusao":
        state.cal.excluirConfirmId = null;
        render();
        break;

      case "cal-excluir-evento": {
        const cal = state.cal;
        const id = el.dataset.id;
        if(cal.excluirConfirmId !== id){   // 1º toque só pede confirmação
          cal.excluirConfirmId = id;
          render();
          break;
        }
        cal.excluindoId = id;
        render();
        try {
          await deleteDoc(doc(db, "eventosCalendario", id));
          cal.prof.eventos = cal.prof.eventos.filter(e => e.id !== id);
        } catch(err){
          cal.prof.erro = `Não foi possível excluir o aviso agora${err?.code ? ` (${err.code})` : ""}.`;
          cal.diaAberto = null;
        } finally {
          cal.excluirConfirmId = null;
          cal.excluindoId = null;
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
