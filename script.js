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
     situacao: "ativo" | "inativo" | "cancelado"   // sem o campo = ativo (cadastros antigos)
     matriculadoEm: "AAAA-MM-DD"    // alimenta "alunos novos" nas Estatísticas
     situacaoEm: "AAAA-MM-DD", motivoSaida: string   // quando virou inativo/cancelado
     notas: [] // campo antigo, não é mais usado (ver "atividades" e "notasAluno" abaixo)
     presenca: { percentual, faltasMes, registros: [{data,status}] }
     financeiro: { mensalidades: [{ id, competencia (\"AAAA-MM\"), valor,
                    vencimento (\"AAAA-MM-DD\"), status: \"pendente\"|\"pago\",
                    formaPagamento: \"dinheiro\"|\"pix\"|\"cartao\"|\"\", dataPagamento,
                    pixCopiaCola, codigoBarras, boletoPdfNome, boletoPdfDados }] }
                  // lançado à mão pela secretaria na ficha do aluno (aba Financeiro)
                  // ou direto pela aba "Financeiro" da instituição; status/próxima
                  // cobrança/histórico exibidos na tela são sempre calculados em
                  // cima dessa lista (ver resumoFinanceiroAluno). pixCopiaCola,
                  // codigoBarras e boletoPdfDados (data URL base64, ver
                  // BOLETO_PDF_TAMANHO_MAX) são anexos opcionais, digitados/
                  // escolhidos à mão — ainda sem gateway/banco de verdade.
     comunicados: [{ titulo, data, urgente }]

   responsaveis/{id}        (cadastro na Gestão; ganha login quando criado
                              com e-mail/senha — nesse caso guarda também o
                              uid, pra editar os vínculos em "usuarios" junto)
     nome, escolaId, contato, alunosIds: [alunoId], uid?: string

   escolas/{escolaId}
     nome, uf, data
     turmas: [{ nome, alunos, faltasHoje, frequencia }]
     faltantes: [{ nome, turma, faltasMes, ultima }]
     alunos: [{ nome, turma }]
     // Não guarda mais financeiro/inadimplentes prontos: a aba "Financeiro" da
     // instituição soma, na hora, as mensalidades de cada aluno da unidade
     // (coleção `alunos`, ver acima) — sempre dado real, nunca texto digitado.

   turmas/{turmaId}      (turmas de um professor — coleção própria)
     nome, horario, sala, escola, escolaId, disciplina, professorId
     alunos: [nomes]
     encontros: [{ dia: 0–6 (0 = domingo), inicio: "HH:MM", fim: "HH:MM" }]   // aba Horários;
                // `horario` (texto) continua sendo gravado a partir dele. Turmas antigas
                // sem `encontros` têm o texto lido na hora (ver horarios.js).

   horariosExcecoes/{turmaId_AAAA-MM-DD_indice}   (aba Horários — mudança de UMA aula:
                                    remarcada ou cancelada; o horário fixo da turma não muda)
     turmaId, turmaNome, escolaId, professorId, dataOriginal, encIdx
     tipo: "remarcada" | "cancelada", novaData, inicio, fim, sala, motivo
     alteradoPorId, alteradoPorNome, atualizadoEm

   anotacoesHorario/{id}   (aba Horários — anotação pessoal, só o autor lê)
     autorId, autorNome, autorRole, escolaId, titulo, texto, data, turmaId, turmaNome
     criadoEm, atualizadoEm

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

   atividades/{atividadeId}   (uma prova/trabalho lançado pelo professor —
                                um documento por atividade, com a nota de
                                cada aluno da turma junto)
     turmaId, turmaNome, professorId, professorNome, escolaId, disciplina
     bimestre: 1 | 2
     nome (ex.: "Prova 1 — Frações"), data ("AAAA-MM-DD" do lançamento)
     notas: { [nomeAluno]: number }   // só entra quem tem nota lançada
     atualizadoEm

   certificadosAluno/{turmaId_modulo_nomeDoAluno}   (certificado de um módulo,
                                anexado pela secretaria ou pelo professor —
                                hoje, um link do Drive. Recreação não entra
                                aqui: não tem módulo pra certificar. Mesmo
                                padrão de id determinístico de presencasAluno/
                                notasAluno, pra reanexar o mesmo módulo do
                                mesmo aluno atualizar em vez de duplicar)
     alunoKey, alunoNome, escolaId, turmaId, turmaNome, disciplina
     modulo (ex.: "Módulo 1"), link (URL do Drive)
     anexadoPorId, anexadoPorNome, atualizadoEm

   notasAluno/{atividadeId_nomeDoAluno}   (cópia "por aluno" de cada nota
                                de "atividades", igual o padrão de
                                presencasAluno — é o que o boletim do
                                aluno/responsável lê, sem precisar de
                                acesso à turma inteira)
     alunoKey, alunoNome, escolaId, turmaId, turmaNome, disciplina
     bimestre: 1 | 2
     atividadeId, atividadeNome, nota: number
     professorId, professorNome, atualizadoEm
     — a média do bimestre é a média das notas de todas as atividades da
       disciplina naquele bimestre; a média final do semestre é a média
       simples entre o 1º e o 2º bimestre (só calculada quando os dois
       já têm nota lançada).

   boletinsIngles/{turmaId_nomeDoAluno}   (Report Card de Inglês — um por aluno por
                                turma; preenchido pelo professor ou pela secretaria e
                                lido pelo aluno/responsável via alunoKey)
     alunoKey, alunoNome, escolaId, turmaId, turmaNome, professorId
     livro, grupo, professorNome        // "Book", "Group" e "Teacher's Name" do boletim
     sem1, sem2: { fluenciaOral, fluenciaAuditiva, fluenciaEscrita, tarefa,
                   participacao, presenca }   // cada um: "perfect" | "good" | "try" | ""
     extra: { extraGrades, practiceTests, total }   // number (0–100) | null
     feedback: string
     atualizadoEm, atualizadoPorId, atualizadoPorNome

   avaliacoesInstitucionais/{periodo_uid_nomeDoAluno}   (questionário sobre o Educa+ —
                                uma resposta por pessoa, por aluno e por semestre;
                                periodo no formato "2026-S2")
     periodo, escolaId, autorId, autorRole: "aluno" | "responsavel", alunoKey, curso
     respostas: { [perguntaId]: 1..5 }   // perguntas em avaliacoes.js
     comentario: string
     criadoEm, atualizadoEm

   avaliacaoInstConfig/{escolaId}   (configuração da avaliação institucional da
                                unidade — a secretaria personaliza as perguntas
                                e libera/bloqueia novas respostas quando quiser;
                                sem documento, vale o padrão de avaliacoes.js)
     ativo: boolean            // false = bloqueada (ninguém consegue responder)
     perguntas: [{ id, texto }]
     atualizadoEm, atualizadoPorId

   eventosCalendario/{id}   (avisos e lembretes criados pelo professor OU
                              itens do calendário da secretaria — os dois
                              tipos moram na mesma coleção, diferenciados
                              pelo campo "escopo")
     -- criado pelo professor (escopo ausente, vale só pra turma/aluno) --
     tipo: "aviso" | "lembrete"
     titulo, descricao, data ("AAAA-MM-DD")
     alvo: "turma" | "aluno"        // turma inteira ou um aluno só
     paraQuem: "todos" | "responsaveis" | "alunos"
     turmaId, turmaNome, disciplina, alunoNome (só quando alvo == "aluno"), escolaId
     destinatarios: string[]   // chaveAluno de cada aluno que deve ver (consulta: array-contains)
     professorId, professorNome, criadoEm

     -- criado pela secretaria (escopo == "escola", vale pra toda a unidade) --
     escopo: "escola"
     tipo: "sem_aula" | "prova" | "atividade" | "aviso" | "outro"  (ver TIPOS_INSTITUICAO em calendario.js)
     titulo, descricao, data ("AAAA-MM-DD"), escolaId
     cursos: string[] | null   // null = vale pra escola inteira (padrão);
                                // array = só pros cursos listados (ex.: um
                                // feriado que não vale pra Recreação). Ver
                                // destinatariosDaEscola/destinatariosProfessoresDaEscola.
     destinatarios: string[]              // chaveAluno de todo aluno da escola que está em algum curso incluído
     destinatariosProfessores: string[]   // uid de todo professor que dá aula em algum curso incluído
     criadoPorId, criadoPorNome, criadoEm
     origemSeed?: true   // marca os itens trazidos do botão "Importar calendário da SEED"
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
  deleteField,
  writeBatch,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
import { criarHorarios } from "./horarios.js";
import {
  contratoEstadoInicial,
  contratoModal,
  contratoRecalcular,
  contratoAplicarEmpresa,
  contratoValidar,
  contratoSugerirAcessos,
  contratoPrecisaLoginAluno,
  contratoNomesAlunos,
  contratoTemSegundoAluno,
  abrirContratoParaImpressao,
  variantesDeEmail,
  escolherEmailLivre,
  senhaProvisoria,
  DOMINIO_ALUNO,
  DOMINIO_RESPONSAVEL,
  interpretarContratoTexto,
  importarContratosModal,
} from "./contratos.js";
import {
  calendarioHtml,
  eventoFormModalHtml,
  eventoInstituicaoFormModalHtml,
  importarSeedModalHtml,
  TIPOS_INSTITUICAO,
  montarDias,
  chaveAluno,
  slugNome,
  hojeISO,
  dataValida,
  dataExtenso,
} from "./calendario.js";
import {
  avalNovoEstado,
  ehAlunoDeIngles,
  CRITERIOS_BOLETIM,
  NIVEIS_BOLETIM,
  FEEDBACK_PADRAO,
  boletimFormVazio,
  boletimParaForm,
  formParaBoletim,
  validarBoletimForm,
  boletimHtml,
  abrirBoletimParaImpressao,
  avalSubAbasHtml,
  periodoAtual,
  validarAvaliacaoInstitucional,
  respostasLimpas,
  avaliacaoInstitucionalHtml,
  resultadosInstitucionaisHtml,
  avalConfigPadrao,
  avalConfigDeDocumento,
  novoIdPergunta,
  validarConfigPerguntas,
  avalConfigInstitucionalHtml,
} from "./avaliacoes.js";

/* Datas do calendário oficial da SEED-PR pra 2026 (Anexo da Resolução
   6.494/2025 - GS/SEED), usadas no botão "Importar calendário da SEED" da
   aba Calendário da secretaria. Só os itens que vêm escritos por extenso
   no documento (feriados, observações numeradas e início/fim de cada
   trimestre) — os dias de recesso/estudo-planejamento que só aparecem
   coloridos no PDF (sem a data escrita ao lado) não entraram aqui pra não
   arriscar errar a data; lance-os à mão pela tela se precisar. As datas
   exatas da Prova Paraná (maio e setembro) também não estão aqui porque o
   documento não informa o dia. */
const CALENDARIO_SEED_PR_2026 = [
  { data: "2026-01-01", tipo: "sem_aula", titulo: "Feriado — Ano Novo" },
  { data: "2026-02-05", tipo: "aviso", titulo: "Início do 1º trimestre" },
  { data: "2026-03-16", tipo: "aviso", titulo: "Semana de combate à violência contra a mulher", descricao: "De 16 a 20/03. Lei Nº 14.164/2021." },
  { data: "2026-04-03", tipo: "sem_aula", titulo: "Feriado — Paixão (Sexta-feira Santa)" },
  { data: "2026-04-05", tipo: "sem_aula", titulo: "Feriado — Páscoa" },
  { data: "2026-04-21", tipo: "sem_aula", titulo: "Feriado — Tiradentes" },
  { data: "2026-05-01", tipo: "sem_aula", titulo: "Feriado — Dia do Trabalho" },
  { data: "2026-05-14", tipo: "aviso", titulo: "Fim do 1º trimestre" },
  { data: "2026-05-18", tipo: "aviso", titulo: "Início do 2º trimestre" },
  { data: "2026-06-04", tipo: "sem_aula", titulo: "Feriado — Corpus Christi" },
  { data: "2026-08-07", tipo: "aviso", titulo: "Dia do Funcionário de Escola" },
  { data: "2026-08-11", tipo: "aviso", titulo: "Dia do Estudante" },
  { data: "2026-09-04", tipo: "aviso", titulo: "Fim do 2º trimestre" },
  { data: "2026-09-07", tipo: "sem_aula", titulo: "Feriado — Independência" },
  { data: "2026-09-08", tipo: "aviso", titulo: "Início do 3º trimestre" },
  { data: "2026-10-12", tipo: "sem_aula", titulo: "Feriado — N. Sra. Aparecida" },
  { data: "2026-10-13", tipo: "aviso", titulo: "Dia do Professor (antecipado) / Dia Internacional p/ Redução do Risco e Desastre" },
  { data: "2026-10-28", tipo: "aviso", titulo: "Dia do Servidor Público" },
  { data: "2026-11-02", tipo: "sem_aula", titulo: "Feriado — Finados" },
  { data: "2026-11-15", tipo: "sem_aula", titulo: "Feriado — Proclamação da República" },
  { data: "2026-11-20", tipo: "sem_aula", titulo: "Feriado — Zumbi e Consciência Negra" },
  { data: "2026-12-18", tipo: "aviso", titulo: "Fim do 3º trimestre" },
  { data: "2026-12-25", tipo: "sem_aula", titulo: "Feriado — Natal" },
];

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
  award: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="m9 13.5-1.5 7L12 18l4.5 2.5-1.5-7"/></svg>`,
  star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  horarios: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
};

/* Contatos de WhatsApp da secretaria, por unidade. Ajuste os números aqui
   se eles mudarem — não precisa mexer em mais nenhum lugar do código. */
const SECRETARIA_WHATSAPP = [
  { id: "salto", nome: "Escola Salto do Lontra", numero: "46999318578", foto: "imgs/secretaria-salto.jpg" },
  { id: "prata", nome: "Escola Nova Prata do Iguaçu", numero: "4699274677", foto: "imgs/secretaria-prata.jpg" },
];

/* ------------------------------------------------------------------
   IDALUNO — código sequencial (0001, 0002, ...) só pra identificar o
   aluno mais fácil (ex.: dois alunos com o mesmo nome). Não substitui
   nada do que já existe (turmas, presença, notas etc. continuam
   funcionando do jeito que já funcionavam, por nome) — é só um campo
   novo, gravado em alunos/{id}.idAluno.

   O número vem de um contador único em contadores/alunos (campo
   "ultimo"), incrementado dentro de uma transação pra dois cadastros
   feitos ao mesmo tempo não saírem com o mesmo número. Pra isso
   funcionar, a regra de segurança do Firestore precisa liberar
   leitura E escrita em "contadores/alunos" pra quem tem role
   "instituicao" (do jeito que já libera escrita em "alunos").
   ------------------------------------------------------------------ */
async function proximoIdAluno(){
  const ref = doc(db, "contadores", "alunos");
  const proximo = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists() ? Number(snap.data().ultimo) || 0 : 0;
    const novo = atual + 1;
    tx.set(ref, { ultimo: novo }, { merge: true });
    return novo;
  });
  return String(proximo).padStart(4, "0");
}

/* ------------------------------------------------------------------
   Fotos por categoria: todo menino usa a mesma foto, toda menina usa
   outra, cada professor(a) usa a foto do seu gênero, e cada secretaria
   por unidade usa sua própria imagem. O responsável não tem foto padrão
   na pasta atual, então cai no avatar com iniciais. */
const FOTO_PADRAO = {
  alunoMenino: "imgs/aluno-menino.jpg",
  alunoMenina: "imgs/aluno-menina.jpg",
  professor: "imgs/professor.jpg",
  professora: "imgs/professora.jpg",
  responsavel: "",
};

function fotoDoAluno(aluno){
  if(aluno?.sexo === "feminino") return FOTO_PADRAO.alunoMenina;
  if(aluno?.sexo === "masculino") return FOTO_PADRAO.alunoMenino;
  return "";   // sexo ainda não informado — cai no avatar com iniciais
}

function fotoDoProfessor(professor){
  if(professor?.sexo === "feminino") return FOTO_PADRAO.professora;
  if(professor?.sexo === "masculino") return FOTO_PADRAO.professor;
  return "";
}

/* Monta o avatar: foto de verdade quando tem uma definida pro caso, ou
   as iniciais (como já era) quando ainda não dá pra saber a foto certa. */
function avatarHtml(fotoUrl, iniciaisFallback, extraClasse){
  const classeExtra = extraClasse ? ` ${extraClasse}` : "";
  if(fotoUrl){
    return `<img class="avatar-foto${classeExtra}" src="${escapeHtml(fotoUrl)}" alt="" />`;
  }
  return `<span class="student-avatar${classeExtra}">${escapeHtml(iniciaisFallback || "?")}</span>`;
}

/* Contato do suporte técnico (quem cuida do sistema), mostrado na aba
   "Meu perfil" da EQUIPE — que é a própria secretaria e portanto não
   precisa de um botão "falar com a secretaria". Ajuste aqui. */
const SUPORTE_TECNICO = {
  nome: "Suporte do Educa+",
  whatsapp: "46999711937",
  email: "dev.neresdalton@gmail.com",
};

/* Mensagem que o responsável manda pra secretaria pedindo o certificado
   do filho, na aba "Certificados". Ajuste o texto aqui. */
const MENSAGEM_CERTIFICADO = {
  solicitar: (nomeAluno, turma) =>
    `Olá! Gostaria de solicitar o certificado do(a) aluno(a) ${nomeAluno}${turma ? ` (${turma})` : ""}, por favor.`,
};

/* Mensagens de parabéns da aba "Aniversários". A secretaria pode
   personalizar (botão "Personalizar mensagem"); o texto fica salvo por
   unidade em mensagensAniversario/{escolaId}. Se não houver texto salvo,
   vale o padrão abaixo.
   Variáveis: {nome} = primeiro nome de quem recebe · {aluno} = nome do
   aluno (na mensagem ao responsável) · {idade} = idade que completa. */
const TEMPLATES_ANIVERSARIO_PADRAO = {
  aluno: "Feliz aniversário, {nome}! 🎉\n\nToda a equipe do Educa+ Centro Educacional deseja um dia muito especial pra você. Conte sempre com a gente!",
  responsavel: "Olá, {nome}! 🎉\n\nHoje é aniversário do(a) {aluno}! A equipe do Educa+ Centro Educacional deseja muitas felicidades e pede que dê os parabéns por nós.",
  professor: "Parabéns, {nome}! 🎉\n\nToda a equipe do Educa+ Centro Educacional deseja um dia muito especial, com muita saúde e alegria. Obrigado(a) por fazer parte da nossa escola! 💙",
};
const TIPOS_MSG_ANIVERSARIO = [
  { key: "aluno", titulo: "Para o aluno", dica: "Enviada ao WhatsApp do próprio aluno. Variáveis: {nome} e {idade}." },
  { key: "responsavel", titulo: "Para o responsável", dica: "Enviada quando o aluno não tem WhatsApp. Variáveis: {nome} (do responsável), {aluno} e {idade}." },
  { key: "professor", titulo: "Para o professor", dica: "Variáveis: {nome} e {idade}." },
];

function textoAniversario(tipo, vars){
  const salvo = state.aniversarioMsgs && typeof state.aniversarioMsgs[tipo] === "string" ? state.aniversarioMsgs[tipo].trim() : "";
  const modelo = salvo || TEMPLATES_ANIVERSARIO_PADRAO[tipo];
  return modelo.replace(/\{(nome|aluno|idade)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ""));
}

async function carregarMensagensAniversario(escolaId){
  if(!escolaId) return;
  state.aniversarioMsgsEscolaId = escolaId;
  try {
    const snap = await getDoc(doc(db, "mensagensAniversario", escolaId));
    state.aniversarioMsgs = snap.exists() ? snap.data() : {};
  } catch(err){
    console.error("Mensagens de aniversário não carregadas (usando o padrão):", err?.code);
    state.aniversarioMsgs = {};
  }
  render();
}

/* ---- Cartão com a logo da escola (imagem PNG gerada no navegador) ---- */
const LOGO_ESCOLA_SRC = "imgs/logoeduca.jpeg";
let _logoEscolaPromise = null;
function carregarLogoEscola(){
  if(!_logoEscolaPromise){
    _logoEscolaPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = LOGO_ESCOLA_SRC;
    });
  }
  return _logoEscolaPromise;
}

async function gerarCartaoAniversario(nome, tipo){
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const INK = "#122032", OURO = "#C9A24A";

  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, "#FFFDF7");
  fundo.addColorStop(1, "#F6EBD0");
  ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = OURO; ctx.lineWidth = 10; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.lineWidth = 2; ctx.strokeRect(58, 58, W - 116, H - 116);

  const logo = await carregarLogoEscola();
  let y = 120;
  if(logo){
    const alvoW = 420;
    const alvoH = alvoW * (logo.naturalHeight / logo.naturalWidth);
    const alturaMax = 300;
    const esc = alvoH > alturaMax ? alturaMax / alvoH : 1;
    const w = alvoW * esc, h = alvoH * esc;
    ctx.drawImage(logo, (W - w) / 2, y, w, h);
    y += h + 50;
  } else {
    y += 120;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = OURO;
  ctx.font = "700 40px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("🎉  " + (tipo === "aluno" ? "FELIZ ANIVERSÁRIO" : "PARABÉNS") + "  🎉", W / 2, y + 40);

  // nome: reduz a fonte até caber
  let tamanho = 120;
  ctx.fillStyle = INK;
  do {
    ctx.font = `700 ${tamanho}px Georgia, 'Times New Roman', serif`;
    tamanho -= 4;
  } while(ctx.measureText(nome).width > W - 200 && tamanho > 40);
  ctx.fillText(nome, W / 2, y + 190);

  ctx.fillStyle = "#4A5A6E";
  ctx.font = "400 38px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("Muita saúde, alegria e conquistas!", W / 2, y + 270);
  ctx.fillStyle = INK;
  ctx.font = "700 34px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("Educa+ Centro Educacional", W / 2, H - 110);

  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

const ehCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

async function enviarParabensComLogo({ numero, texto, nome, tipo }){
  state.aniversarioAviso = "";
  const linkWhats = whatsappLinkComTexto(numero, texto);
  const nomeArquivo = `parabens-${String(nome || "aniversariante").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}.png`;

  // Celular: abre a folha de compartilhar do sistema com imagem + texto
  // (a pessoa escolhe o WhatsApp e o contato).
  if(ehCelular() && navigator.canShare && navigator.share){
    try {
      const blob = await gerarCartaoAniversario(nome, tipo);
      const arquivo = new File([blob], nomeArquivo, { type: "image/png" });
      if(navigator.canShare({ files: [arquivo] })){
        await navigator.share({ files: [arquivo], text: texto });
        return;
      }
    } catch(err){
      if(err && err.name === "AbortError") return;   // pessoa cancelou
      console.error("Compartilhar cartão falhou:", err);
    }
    window.open(linkWhats, "_blank", "noopener");
    state.aniversarioAviso = "Não deu para anexar a logo neste aparelho — abri o WhatsApp só com o texto.";
    render();
    return;
  }

  // Computador: copia o cartão para a área de transferência e abre a
  // conversa já com o texto; é só colar (Ctrl+V) e enviar. Se o navegador
  // não deixar copiar imagem, baixa o arquivo.
  const janela = window.open("about:blank", "_blank");
  const blobPromise = gerarCartaoAniversario(nome, tipo);
  let copiou = false;
  try {
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      copiou = true;
    }
  } catch(_e){ copiou = false; }
  if(!copiou){
    try {
      const blob = await blobPromise;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch(_e){ /* segue só com o texto */ }
  }
  if(janela) janela.location.href = linkWhats; else window.open(linkWhats, "_blank", "noopener");
  state.aniversarioAviso = copiou
    ? "Cartão com a logo copiado! Na conversa do WhatsApp, cole com Ctrl+V (a mensagem já está escrita) e envie."
    : "Cartão com a logo baixado. Na conversa do WhatsApp, anexe a imagem baixada (a mensagem já está escrita).";
  render();
}

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
   administrativa. É o CATÁLOGO do que deve ser produzido: cada item tem
   categoria, tipo, título e descrição. Enquanto o manual não existe, deixe
   url vazia ("") — o cartão aparece como "Em breve". Quando o material
   ficar pronto (PDF, vídeo, página...), é só colar o link em url e o
   cartão vira clicável. Não precisa mexer em mais nenhum lugar do código.

   tipo: "visual" (guia com imagens/prints) | "passo" (passo a passo) |
         "automatico" (o que o sistema faz sozinho) | "referencia" (consulta rápida) */
const MANUAIS_TIPOS = {
  visual: "Guia visual",
  passo: "Passo a passo",
  automatico: "Função automática",
  referencia: "Consulta rápida",
};

const MANUAIS_CATEGORIAS = [
  { key: "inicio", icon: "building", titulo: "Primeiros passos", descricao: "Para quem está começando a usar o Educa+." },
  { key: "cadastros", icon: "user", titulo: "Cadastros e acessos", descricao: "Criar pessoas, dar login, trocar senha e importar turmas." },
  { key: "rotina", icon: "calendar", titulo: "Turmas, alunos e calendário", descricao: "O dia a dia da secretaria com turmas, fichas e avisos." },
  { key: "horarios", icon: "horarios", titulo: "Horários e agenda", descricao: "Agenda de aulas, remarcações, lembretes para as turmas e anotações." },
  { key: "financeiro", icon: "wallet", titulo: "Financeiro", descricao: "Lançar cobranças e consultar boletos." },
  { key: "contratos", icon: "fileText", titulo: "Contratos", descricao: "Gerar, importar e acompanhar a assinatura." },
  { key: "pedagogico", icon: "cap", titulo: "Acompanhamento pedagógico", descricao: "Faltas, boletim, avaliações, certificados e aniversários." },
  { key: "perfis", icon: "users2", titulo: "Guias por perfil", descricao: "O que o professor e a família veem e fazem no app — para orientar por telefone.", descricaoProfessor: "Como o app funciona no seu dia a dia: chamada, conteúdos e notas." },
  { key: "automatico", icon: "clock", titulo: "O que o sistema faz sozinho", descricao: "Funções que rodam sem ninguém pedir — saber disso evita retrabalho." },
  { key: "ajuda", icon: "lifebuoy", titulo: "Quando algo dá errado", descricao: "Erros comuns e o que fazer em cada um." },
];

const MANUAIS_INSTITUICAO = [
  // ---- Primeiros passos
  { categoria: "inicio", tipo: "visual", titulo: "Tour pelo menu da equipe", descricao: "Mapa ilustrado de cada aba (Turmas, Calendário, Estatísticas, Financeiro, Alunos, Aniversários, Professores, Responsáveis, Contratos, Avaliações, Certificados, Gestão e Meu perfil) e para que cada uma serve.", url: "manuais/primeiros-passos.html#tour" },
  { categoria: "inicio", tipo: "passo", titulo: "Entrar, trocar de unidade e sair", descricao: "Como fazer login, alternar entre Salto do Lontra e Nova Prata pelo selo da unidade no menu e sair da conta com segurança.", url: "manuais/primeiros-passos.html#entrar" },
  { categoria: "inicio", tipo: "visual", titulo: "Como cada perfil enxerga o app", descricao: "Telas de aluno, responsável e professor ao lado da sua, para você saber exatamente o que a pessoa vê quando pede ajuda por telefone.", url: "manuais/primeiros-passos.html#perfis" },
  { categoria: "inicio", tipo: "referencia", titulo: "Glossário do Educa+", descricao: "Curso, turma, IDALUNO, vínculo, competência, escopo do aviso, situação do contrato: os termos das telas em linguagem simples.", url: "manuais/primeiros-passos.html#glossario" },

  // ---- Cadastros e acessos
  { categoria: "cadastros", tipo: "passo", titulo: "Cadastrar um aluno", descricao: "Curso, menino/menina (define a foto), contato, e-mail e senha provisória — e onde aparece o IDALUNO gerado.", url: "manuais/cadastros.html#aluno" },
  { categoria: "cadastros", tipo: "passo", titulo: "Cadastrar responsável e vincular aos filhos", descricao: "Escolher os alunos, dar login ao responsável e ajustar os vínculos depois na aba Responsáveis.", url: "manuais/cadastros.html#responsavel" },
  { categoria: "cadastros", tipo: "passo", titulo: "Cadastrar e editar professor", descricao: "Unidades, disciplinas, homem/mulher (foto), e-mail e senha; como editar depois e o que muda nas listas.", url: "manuais/cadastros.html#professor" },
  { categoria: "cadastros", tipo: "passo", titulo: "Cadastrar outra pessoa da equipe", descricao: "Criar login administrativo para a unidade e o que esse acesso permite fazer.", url: "manuais/cadastros.html#equipe" },
  { categoria: "cadastros", tipo: "passo", titulo: "Senhas & acessos: trocar senha, criar login, excluir", descricao: "Como resolver sozinha quem esqueceu a senha, quem não tem e-mail de verdade e quem precisa ser removido — e o que acontece com o acesso dela.", url: "manuais/cadastros.html#acessos" },
  { categoria: "cadastros", tipo: "passo", titulo: "Importar turmas por PDF", descricao: "Enviar a lista de turmas, conferir a prévia, escolher o professor de cada linha e evitar turmas duplicadas.", url: "manuais/cadastros.html#importar-turmas" },
  { professor: true, categoria: "cadastros", tipo: "passo", titulo: "Minha ficha e ficha do professor", descricao: "O que preencher (contato de emergência, alergias, tipo sanguíneo…), quem enxerga e como a secretaria abre a ficha de um professor.", url: "manuais/ficha.html" },

  // ---- Turmas, alunos e calendário
  { categoria: "rotina", tipo: "passo", titulo: "Criar e ajustar turmas", descricao: "Nome, horário, sala e disciplina; colocar e tirar alunos de uma turma; quando excluir.", url: "manuais/rotina.html#turmas" },
  { categoria: "rotina", tipo: "visual", titulo: "Ficha do aluno por dentro", descricao: "Dados, turma, contato, aniversário, situação do contrato e financeiro — o que dá para editar em cada campo.", url: "manuais/rotina.html#ficha-aluno" },
  { categoria: "rotina", tipo: "passo", titulo: "Lançar itens no calendário da unidade", descricao: "Dia sem aula, prova, atividade e aviso; escolher quem recebe (alunos, responsáveis, professores) e por curso.", url: "manuais/rotina.html#calendario-unidade" },
  { categoria: "rotina", tipo: "visual", titulo: "Como o calendário aparece para a família", descricao: "Cores de presença, faltas justificadas, ícone de observação do professor e os avisos da escola vistos pelo responsável.", url: "manuais/rotina.html#calendario-familia" },

  // ---- Horários e agenda
  { professor: true, categoria: "horarios", tipo: "passo", titulo: "Aba Horários: agenda do dia, da semana e do mês", descricao: "Navegar pela agenda, filtrar por turma ou professor, abrir a ficha da aula e ir direto para a chamada.", url: "manuais/horarios.html" },
  { professor: true, categoria: "horarios", tipo: "passo", titulo: "Remarcar ou cancelar uma aula", descricao: "Só aquele dia, cancelamento ou mudança do horário fixo; aviso de conflito e como voltar ao horário normal.", url: "manuais/horarios.html#alterar" },
  { professor: true, categoria: "horarios", tipo: "passo", titulo: "Lembretes e avisos para a turma", descricao: "Enviar recado que aparece no calendário dos alunos e responsáveis da turma.", url: "manuais/horarios.html#lembrete" },
  { professor: true, categoria: "horarios", tipo: "passo", titulo: "Criar turma com dias e horários", descricao: "Nome, professor, disciplina, sala, encontros da semana e alunos; como resolver \"Turmas sem horário definido\".", url: "manuais/horarios.html#turma" },
  { professor: true, categoria: "horarios", tipo: "passo", titulo: "Anotações pessoais", descricao: "Anotações que só você vê, soltas ou ligadas a uma turma.", url: "manuais/horarios.html#anotacoes" },
  { categoria: "horarios", tipo: "referencia", titulo: "Como avisar as famílias: qual ferramenta usar", descricao: "Horários, Calendário da unidade ou Comunicados: quando usar cada um e quem recebe.", url: "manuais/avisar-familias.html" },

  // ---- Financeiro
  { categoria: "financeiro", tipo: "passo", titulo: "Lançar mensalidades", descricao: "Competência, valor e vencimento — pela aba Financeiro ou direto na ficha do aluno.", url: "manuais/financeiro.html#lancar" },
  { categoria: "financeiro", tipo: "passo", titulo: "Anexar Pix copia e cola, código de barras e boleto", descricao: "O que dá para anexar em cada cobrança, limite de tamanho do PDF e como o responsável vê isso.", url: "manuais/financeiro.html#anexos" },
  { categoria: "financeiro", tipo: "visual", titulo: "Boletos e cobranças: visão geral", descricao: "Onde fica a aba Financeiro, como a secretaria só lança e o que a família vê, mês a mês, com vencimento e forma de pagamento.", url: "manuais/financeiro-boletos.html" },
  { categoria: "financeiro", tipo: "automatico", titulo: "Leitura automática do PDF do boleto", descricao: "Ao anexar o PDF, o app preenche código de barras, Pix, valor e vencimento sozinho. O que ele lê e quando precisa digitar à mão.", url: "manuais/financeiro-boletos.html#leitura" },
  { categoria: "financeiro", tipo: "automatico", titulo: "Cobrança nova no dia 01 e aviso na tela", descricao: "A família vê a cobrança a partir do dia 01 do mês de referência e recebe um aviso ao entrar no app. Sem mensagem da secretaria.", url: "manuais/financeiro-boletos.html#dia-01" },
  { categoria: "financeiro", tipo: "automatico", titulo: "Vencimentos no calendário do responsável", descricao: "O dia de vencimento de cada boleto aparece marcado com \"$\" no calendário, com valor e forma de pagamento.", url: "manuais/financeiro-boletos.html#calendario" },
  
  // ---- Contratos
  { categoria: "contratos", tipo: "passo", titulo: "Gerar um contrato pronto para assinar", descricao: "Escolher o CNPJ (que define unidade, endereço e sócia), preencher aluno, curso, horário e valores, e imprimir ou salvar em PDF.", url: "manuais/contratos.html#gerar" },
  { categoria: "contratos", tipo: "passo", titulo: "Importar contratos em lote", descricao: "Enviar vários contratos de uma vez, conferir o que foi lido e corrigir o que veio errado antes de confirmar.", url: "manuais/contratos.html#importar" },
  { categoria: "contratos", tipo: "passo", titulo: "Acompanhar assinaturas pendentes", descricao: "Mandar o PDF pelo WhatsApp, marcar como assinado quando voltar e o que fazer se a página for recarregada.", url: "manuais/contratos.html#assinaturas" },

  // ---- Acompanhamento pedagógico
  { categoria: "pedagogico", tipo: "visual", titulo: "Estatísticas e alunos com faltas", descricao: "Leitura do painel dos últimos 30 dias e da lista de acompanhamento recomendado.", url: "manuais/pedagogico.html#estatisticas" },
  { professor: true, categoria: "pedagogico", tipo: "passo", titulo: "Boletim de Inglês (Report Card)", descricao: "Quem preenche, os seis critérios, as notas do semestre, o feedback e o que o aluno e o responsável enxergam.", url: "manuais/pedagogico.html#boletim" },
  { categoria: "pedagogico", tipo: "passo", titulo: "Avaliação institucional", descricao: "Abrir e bloquear respostas, criar perguntas próprias e ler o resultado consolidado sem identificar quem respondeu.", url: "manuais/pedagogico.html#avaliacao" },
  { professor: true, categoria: "pedagogico", tipo: "passo", titulo: "Certificados", descricao: "Anexar o link do certificado (Drive) ao fim do módulo, por que a Recreação não entra e como a família pede o dela.", url: "manuais/pedagogico.html#certificados" },
  { categoria: "pedagogico", tipo: "passo", titulo: "Aniversários e mensagem no WhatsApp", descricao: "Como a mensagem já vem pronta e para quem ela vai: o aluno, se tiver WhatsApp, ou o responsável.", url: "manuais/pedagogico.html#aniversarios" },
  { professor: true, categoria: "pedagogico", tipo: "visual", titulo: "Do professor ao boletim: notas e atividades", descricao: "Como o professor lança atividades e notas nas duas etapas e como o boletim do aluno é montado a partir delas.", url: "manuais/pedagogico.html#notas" },

  // ---- Guias por perfil
  { professor: true, categoria: "perfis", tipo: "visual", titulo: "Guia do professor: chamada, conteúdos e notas", descricao: "Aulas de hoje, Conteúdos do semestre e Notas e atividades — e como isso vira o boletim.", url: "manuais/guia-professor.html" },
  { categoria: "perfis", tipo: "visual", titulo: "Guia do aluno e do responsável", descricao: "Calendário, boletim, presença, certificados, financeiro e comunicados, como a família vê.", url: "manuais/guia-familia.html" },

  // ---- Funções automáticas
  { categoria: "automatico", tipo: "automatico", titulo: "IDALUNO sequencial", descricao: "Cada novo aluno recebe o próximo número (0001, 0002…) sozinho, para todas as unidades — e o botão Gerar IDALUNO numera os alunos antigos.", url: "manuais/automatico.html#idaluno" },
  { professor: true, categoria: "automatico", tipo: "automatico", titulo: "Fotos padrão por perfil", descricao: "Menino/menina, professor/professora e a foto da secretaria de cada unidade; quando aparecem as iniciais no lugar.", url: "manuais/automatico.html#fotos" },
  { categoria: "automatico", tipo: "automatico", titulo: "Situação financeira calculada", descricao: "Em dia, atrasada há X dias e próxima cobrança são calculadas sozinhas a partir das mensalidades lançadas — nunca digitadas.", url: "manuais/automatico.html#situacao-financeira" },
  { professor: true, categoria: "automatico", tipo: "automatico", titulo: "Cores e alertas da presença", descricao: "Verde, amarelo e vermelho no calendário, a regra do \"pior status do dia\" e o alerta de observação do professor.", url: "manuais/automatico.html#cores" },
  { professor: true, categoria: "automatico", tipo: "automatico", titulo: "Boletim montado sozinho", descricao: "As notas do aluno vêm das atividades lançadas pelo professor; ninguém precisa digitar de novo.", url: "manuais/automatico.html#boletim-auto" },
  { categoria: "automatico", tipo: "automatico", titulo: "Senha nova encerra sessões antigas", descricao: "Ao trocar a senha de alguém, quem estava logado com a antiga é desconectado em até 1 hora.", url: "manuais/automatico.html#senha-sessoes" },
  { categoria: "automatico", tipo: "automatico", titulo: "Nome e disciplinas sempre iguais", descricao: "Ao editar um professor, o app atualiza o cadastro, a lista da Gestão e o vínculo com cada unidade de uma vez.", url: "manuais/automatico.html#nome-disciplinas" },
  { professor: true, categoria: "automatico", tipo: "automatico", titulo: "Saudação e status do dia", descricao: "Bom dia/tarde/noite e o selo \"Em andamento\" (aluno), \"Presente agora\" (família) ou \"Agenda do dia\", conforme o horário do relógio.", url: "manuais/automatico.html#saudacao" },

  // ---- Quando algo dá errado
  { categoria: "ajuda", tipo: "referencia", titulo: "A pessoa não consegue entrar", descricao: "Checklist: tem login? o e-mail está certo? a senha foi trocada? o cadastro foi excluído? Quando criar um novo acesso.", url: "manuais/ajuda.html#entrar" },
  { professor: true, categoria: "ajuda", tipo: "referencia", titulo: "\"Não foi possível salvar\" (permission-denied)", descricao: "O que essa mensagem significa, o que conferir (unidade, tipo de acesso) e quando acionar o suporte.", url: "manuais/ajuda.html#permissao" },
  { categoria: "ajuda", tipo: "referencia", titulo: "O PDF não foi lido", descricao: "Por que PDFs escaneados (imagem) não funcionam, como exportar de novo com texto selecionável e como preencher à mão.", url: "manuais/ajuda.html#pdf" },
  { categoria: "ajuda", tipo: "referencia", titulo: "A foto não aparece", descricao: "Sexo não informado no cadastro, arquivo de imagem faltando ou com nome diferente, e como corrigir.", url: "manuais/ajuda.html#foto" },
  { professor: true, categoria: "ajuda", tipo: "referencia", titulo: "Como falar com o suporte", descricao: "Quando chamar, o que enviar junto (print, nome da pessoa, o que estava fazendo) e os canais de contato.", url: "manuais/ajuda.html#suporte" },
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

/* Modalidades = combos de cursos vendidos juntos. Aparecem nas listas ao
   lado dos cursos avulsos (contrato, cadastro de aluno, disciplinas do
   professor, criação/importação de turmas). O nome é os cursos unidos por
   " + " — é assim que o sistema sabe quais cursos compõem a modalidade. */
const SEPARADOR_MODALIDADE = " + ";
const MODALIDADES_POR_ESCOLA = {
  salto: ["Inglês + Recreação + Robótica", "Inglês + Informática"],
  prata: ["Inglês + Informática"],
};

/* "Inglês + Informática" -> ["Inglês", "Informática"]; curso avulso volta
   como lista de um item só. */
function cursosDaModalidade(nome){
  return String(nome || "").split("+").map(x => x.trim()).filter(Boolean);
}

/* Cursos avulsos + modalidades da unidade (nessa ordem). */
function cursosEModalidadesDaEscola(nomeEscola){
  const nome = (nomeEscola || "").toLowerCase();
  const combos = nome.includes("prata") ? MODALIDADES_POR_ESCOLA.prata
    : nome.includes("salto") ? MODALIDADES_POR_ESCOLA.salto
    : [...new Set([...MODALIDADES_POR_ESCOLA.salto, ...MODALIDADES_POR_ESCOLA.prata])];
  return [...cursosDaEscola(nomeEscola), ...combos];
}

/* Versão de cursosDasEscolas (professor em mais de uma unidade) que inclui as modalidades. */
function cursosEModalidadesDasEscolas(escolaIds){
  if(!Array.isArray(escolaIds) || escolaIds.length === 0) return [...TODOS_OS_CURSOS, ...new Set([...MODALIDADES_POR_ESCOLA.salto, ...MODALIDADES_POR_ESCOLA.prata])];
  const combinados = new Set();
  escolaIds.forEach(id => {
    cursosEModalidadesDaEscola(state.data.escolas?.[id]?.nome || "").forEach(x => combinados.add(x));
  });
  return Array.from(combinados);
}

/* Uma disciplina/turma bate com uma lista de cursos se ela mesma, ou
   qualquer curso que a compõe (no caso de modalidade), está na lista. */
function disciplinaCasaComCursos(disciplina, cursos){
  return cursosDaModalidade(disciplina).some(d => cursos.includes(d)) || cursos.includes(disciplina);
}

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

/* Parentesco do responsável com o aluno — aparece na lista da Gestão e na
   ficha do aluno. Guardado em responsaveis/{id}.parentesco. */
const PARENTESCOS = [
  { key: "pai", label: "Pai" },
  { key: "mae", label: "Mãe" },
  { key: "responsavel_legal", label: "Responsável legal" },
];
function parentescoLabel(chave){
  const p = PARENTESCOS.find(x => x.key === chave);
  return p ? p.label : "";
}
function parentescoSelectHtml(id, valor){
  return `<select id="${id}" class="teacher-text-input">
    <option value="" ${!valor ? "selected" : ""}>Parentesco (opcional)</option>
    ${PARENTESCOS.map(p => `<option value="${p.key}" ${valor === p.key ? "selected" : ""}>${p.label}</option>`).join("")}
  </select>`;
}

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


/* ------------------------------------------------------------------
   OCR para PDFs escaneados (contratos).
   Um PDF escaneado é só uma foto de cada página: o pdf.js não acha texto
   nenhum nele. Aqui desenhamos cada página num <canvas> e passamos pelo
   Tesseract.js (OCR em português), tudo no navegador. O worker é criado
   uma vez e reaproveitado entre as páginas/arquivos; os dados do idioma
   (~2 MB) baixam na primeira vez e ficam em cache.
   ------------------------------------------------------------------ */
let _ocrWorker = null;
async function obterOcrWorker(){
  if(!window.Tesseract) throw new Error("tesseract-nao-carregado");
  if(!_ocrWorker){
    _ocrWorker = await window.Tesseract.createWorker("por");
    // modo 6 = "bloco único de texto": foi o que melhor leu o modelo de contrato
    await _ocrWorker.setParameters({ tessedit_pageseg_mode: "6" });
  }
  return _ocrWorker;
}
async function encerrarOcrWorker(){
  if(_ocrWorker){ try { await _ocrWorker.terminate(); } catch(e){} _ocrWorker = null; }
}

/* Lê um PDF escaneado página por página. `aoProgresso(paginaAtual, total)`
   é opcional, só pra mostrar "página 3 de 6" na tela. */
async function extrairTextoDoPdfComOcr(file, aoProgresso){
  if(!window.pdfjsLib) throw new Error("pdfjs-nao-carregado");
  const worker = await obterOcrWorker();
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const paginas = [];
  for(let p = 1; p <= pdf.numPages; p++){
    if(aoProgresso) aoProgresso(p, pdf.numPages);
    const page = await pdf.getPage(p);
    // escala 2.5 ≈ 180 dpi numa folha A4: nítido o bastante pro OCR sem pesar
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const { data } = await worker.recognize(canvas);
    paginas.push(data.text || "");
    canvas.width = canvas.height = 0; // libera memória
  }
  return paginas.join("\n");
}

/* Tenta o texto "de verdade" do PDF primeiro (rápido e exato); se vier
   quase vazio — PDF escaneado — cai pro OCR. Devolve também se usou OCR,
   pra tela avisar a secretaria pra conferir os dados com mais atenção. */
async function extrairTextoContrato(file, aoProgresso){
  let texto = "";
  try { texto = await extrairTextoDoPdf(file); } catch(err){
    if(err?.message === "pdfjs-nao-carregado") throw err;
  }
  if(texto.replace(/\s+/g, "").length >= 300) return { texto, ocr: false };
  const ocrTexto = await extrairTextoDoPdfComOcr(file, aoProgresso);
  return { texto: ocrTexto, ocr: true };
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

/* A Recreação é só um turno de brincadeiras, sem módulo nem avaliação —
   por isso não entra na aba "Certificados" (nem do lado de quem anexa,
   nem do lado do aluno/responsável). Recebe a disciplina da turma quando
   tem (mais confiável) ou o nome da turma como alternativa, e usa a mesma
   heurística de texto de adivinharDisciplina. */
function ehTurmaDeRecreacao(textoOuTurma){
  const texto = normalizarNome(textoOuTurma || "");
  // Modalidade (ex.: "Inglês + Recreação + Robótica") não é Recreação pura:
  // o aluno tem login, certificados e ficha como os demais cursos.
  if(texto.includes("+")) return false;
  return texto.includes("recrea");
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
    escolas: {},                // { [escolaId]: { nome, uf, data, turmas, faltantes, alunos } }
  },

  alunoTab: "calendario",
  familiaTab: "calendario",
  cal: calNovoEstado(),          // calendário (aluno / responsável / professor) — ver seção "Calendário"
  boletim: { cache: {} },        // notas do aluno/responsável — { cache: { [alunoId]: { registros, carregando, erro, carregadoEm } } }
  aval: avalNovoEstado(),        // aba Avaliações (boletim de Inglês + avaliação institucional) — ver avaliacoes.js
  familiaStudentId: null,
  escolaSelecionadaId: null,
  instTab: "turmas",
  gestaoSubTab: "cadastro",   // cadastro | acessos — sub-abas dentro de "Gestão"
  finSubTab: "consultar",     // consultar | lancar — sub-abas dentro de "Financeiro"
  finConsultaBusca: "",         // texto da busca (aluno/turma/IDALUNO) em Financeiro > Consultar
  alunosBusca: "",
  respBusca: "",
  avisosPopup: { aberto: false, itens: [], vistos: [] },   // pop-up de avisos novos (aluno/família)
  profBusca: "",
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
  professorAvisoEnviado: "",
  professorRegistroSalvo: false,

  // --- Notas & atividades (boletim) ---
  professorAvaliacaoBimestre: 1,        // 1 ou 2 — etapa escolhida na aba "Notas & atividades"
  professorAtividadesTodas: [],         // TODAS as atividades da turma selecionada (as duas etapas), carregadas do Firestore
  professorAtividadesCarregando: false,
  professorAtividadesErro: "",
  professorAtividadeEditandoId: null,   // id da atividade em edição (null = lançando uma nova)
  professorAtividadeNome: "",           // texto do campo "Atividade ou avaliação"
  professorAtividadeExcluirConfirmId: null, // id esperando o 2º toque de "Confirmar exclusão"
  professorAtividadeExcluindoId: null,
  professorNotas: {},                   // notas digitadas agora, chave `${turmaId}-${nomeAluno}`
  professorNotasSalvando: false,
  professorNotasSalvas: false,
  professorNotasErro: "",
  mobileMenuOpen: false,
  secretariaModalOpen: false,
  instituicaoMensagem: "",
  instituicaoErro: "",
  novoUsuarioRole: "aluno",       // aluno | responsavel | professor | instituicao
  novoUsuarioNome: "",
  novoUsuarioSexo: "",       // "masculino" | "feminino" — define a foto padrão (aluno/professor)
  novoUsuarioEmail: "",
  novoUsuarioSenha: "",
  novoUsuarioEmailManual: false,  // true quando a secretaria digitou o e-mail à mão (aí não sobrescrevemos)
  novoUsuarioTurma: "",
  novoUsuarioDisciplinas: [],
  novoUsuarioEscolasIds: [],      // escola(s) em que o professor dá aula (pode ser mais de uma)
  novoUsuarioContato: "",
  novoUsuarioParentesco: "",     // pai | mae | responsavel_legal (só role == responsavel)
  novoUsuarioSalvando: false,
  acessoGerado: null,             // { role, nome, email, senha, contato, nomeAluno } — último login criado em Gestão, pra enviar os acessos
  removerLoginConfirmando: false, // aba Alunos: confirmação do "remover login" em lote (Recreação)
  removerLoginRodando: false,
  alunoLoginConfirmando: false,   // ficha do aluno: confirmação do "remover login" individual
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
  editProfessorSexo: "",     // "masculino" | "feminino" — foto padrão do professor
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
  respModalNomeInput: "",          // edição dos dados do responsável (modal da aba Responsáveis)
  respModalParentesco: "",
  respModalContato: "",
  respModalEmail: "",
  respModalDadosSalvando: false,
  respModalDadosErro: "",
  respModalDadosMsg: "",
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

  // "Meu perfil" > ficha pessoal (contato de emergência, endereço,
  // aniversário, alergias…). Vale pra professor e pra equipe.
  // Fica em usuarios/{uid}.ficha. fichaForm é o rascunho do formulário.
  perfilSubTab: "dados",     // dados | senha | ficha | manuais — sub-abas de "Meu perfil"
  manuaisAbertos: {},       // grupos de manuais expandidos em "Meu perfil" (chave = categoria)
  fichaForm: null,
  fichaSalvando: false,
  fichaErro: "",
  fichaMensagem: "",
  // Ficha do ALUNO (alunos/{id}.ficha) — preenchida pelo próprio aluno (login),
  // pelo responsável, ou só pelo responsável na Recreação. Rascunho por aluno.
  alunoFicha: { alunoId: null, form: null, salvando: false, erro: "", mensagem: "" },

  // Professor > aba "Turmas": turma com a lista de alunos aberta
  professorTurmaDetalheId: null,

  // Secretaria > Professores > "Ver ficha" (só leitura)
  fichaModalAberto: false,
  fichaModalNome: "",
  fichaModalEmail: "",
  fichaModalDisciplinas: [],
  fichaModalCarregando: false,
  fichaModalErro: "",
  fichaModalDados: null,

  // Gestão > sub-aba "Senhas & acessos"
  gestaoAcessosBusca: "",
  gestaoAcessosGrupo: "todos",    // todos | alunos | professores | responsaveis | semlogin
  geracaoLoteConfirmando: false,  // aba Senhas & acessos > Sem login: confirmação do "gerar login de todos"
  geracaoLoteRodando: false,
  geracaoLoteProgresso: "",       // texto "3 de 20…"
  geracaoLoteResultado: null,     // { criados: [{nome,tipo,email,senha}], falhas: [{nome,motivo}] }

  // modal "Gerenciar acesso de {pessoa}" — troca de senha e exclusão
  acessoModalAberto: false,
  acessoTipo: "",                 // aluno | professor | responsavel
  acessoDocId: null,              // id do documento (alunos/{id} ou responsaveis/{id}); p/ professor é o próprio uid
  acessoUid: null,                // uid no Firebase Authentication (pode ser null se a pessoa não tem login)
  acessoNome: "",
  acessoEmail: "",                // e-mail de acesso conhecido (pode estar vazio em cadastros antigos)
  acessoSenhaSugerida: "",        // senha provisória já sugerida ao abrir quem está sem login
  acessoDefinindoSenha: false,
  acessoCriandoLogin: false,
  acessoExcluindo: false,
  acessoConfirmandoExclusao: false,
  acessoErro: "",
  acessoMensagem: "",

  // aba "Alunos" da instituição — lista carregada direto da coleção `alunos`
  // (com id de verdade, ao contrário do array resumido salvo em escolas/{id}.alunos)
  instAlunos: null,               // [{id,nome,turma,contato,...}] ou null se ainda não carregou
  gerandoIdAluno: false,          // true enquanto o botão "Gerar IDALUNO" está processando os pendentes
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

  // Contratos salvos no sistema (PDF guardado) — ver "Contratos guardados no sistema"
  contratosInst: { escolaId: null, itens: [], carregando: false, carregado: false, erro: "" },  // equipe: todos da unidade
  contratosFam: {},                     // responsável: { [alunoId]: { itens, carregando, carregado, erro } }
  contratoUpStatus: "pendente",         // situação dos PDFs que a secretaria vai anexar na ficha
  contratoUpEnviando: false,
  contratoUpMsg: "",
  contratoUpErro: "",
  contratoOcupado: {},                  // { [contratoId]: true } enquanto envia/atualiza
  contratoVis: null,                    // visualizador de contrato dentro do app

  // ficha do aluno (modal aberto ao clicar num aluno da lista)
  alunoDetalheId: null,
  alunoDetalheNomeInput: "",
  alunoDetalheContatoInput: "",
  alunoDetalheSexoInput: "",   // "masculino" | "feminino" — foto padrão do aluno
  alunoDetalheSalvandoContato: false,
  alunoDetalheMensagem: "",
  alunoDetalheErro: "",
  alunoExcluirConfirmando: false,
  alunoExcluindo: false,

  // financeiro da ficha do aluno (aba "Financeiro" dentro do modal) —
  // mensalidades lançadas à mão pela secretaria, sem ligação com contrato
  alunoFinCompetencia: "",
  alunoFinValor: "",
  alunoFinVencimento: "",
  alunoFinForma: "boleto",           // boleto | pix | cartao | dinheiro — forma de pagamento esperada da cobrança sendo lançada
  alunoFinPixTipo: "copiaCola",      // copiaCola | chaveEscola — só quando alunoFinForma === "pix"
  alunoFinBoletoComPix: false,       // quando alunoFinForma === "boleto": também oferece Pix copia e cola?
  alunoFinLinkCartao: "",            // link de pagamento — só quando alunoFinForma === "cartao"
  alunoFinPix: "",                   // código Pix copia-e-cola da cobrança sendo lançada (opcional)
  alunoFinCodigoBarras: "",          // código de barras/linha digitável do boleto (opcional)
  alunoFinBoletoArquivo: null,       // { nome, dados } depois de ler o PDF escolhido, ou null
  alunoFinBoletoLendo: false,
  alunoFinSalvando: false,
  alunoFinErro: "",
  alunoFinMensagem: "",

  // Aba "Financeiro" (visão geral da escola) > lançar cobrança direto
  // por ali, sem precisar abrir a ficha do aluno primeiro.
  finCobrancaAberto: false,
  finCobrancaAlunoId: "",
  estPeriodo: "mes",            // mes | 30 | 90 | ano — período das Estatísticas
  alunoSitSituacao: "ativo",    // ficha do aluno > "Situação na escola"
  alunoSitMatricula: "",
  alunoSitData: "",
  alunoSitMotivo: "",
  alunoSitSalvando: false,
  alunoSitErro: "",
  alunoSitMensagem: "",
  finStatusSalvandoId: "",      // id da cobrança que está sendo alternada pendente/pago (Financeiro > Consultar boletos)
  finStatusErro: "",
  finCobrancaBusca: "",         // texto digitado na busca de aluno (Financeiro > Lançar cobrança)
  finCobrancaCompetencia: "",
  finCobrancaValor: "",
  finCobrancaVencimento: "",
  finCobrancaForma: "boleto",        // boleto | pix | cartao | dinheiro — forma de pagamento esperada da cobrança sendo lançada
  finCobrancaPixTipo: "copiaCola",   // copiaCola | chaveEscola — só quando finCobrancaForma === "pix"
  finCobrancaBoletoComPix: false,    // quando finCobrancaForma === "boleto": também oferece Pix copia e cola?
  finCobrancaLinkCartao: "",         // link de pagamento — só quando finCobrancaForma === "cartao"
  finCobrancaPix: "",
  finCobrancaCodigoBarras: "",
  finCobrancaBoletoArquivo: null,    // { nome, dados }
  finCobrancaBoletoLendo: false,
  finCobrancaSalvando: false,
  finCobrancaErro: "",
  finCobrancaMensagem: "",

  // responsáveis vinculados ao aluno aberto na ficha + form de novo responsável
  alunoRespVinculados: null,
  alunoRespCarregando: false,
  alunoRespNome: "",
  alunoRespContato: "",
  alunoRespParentesco: "",
  alunoRespSalvando: false,
  alunoRespErro: "",
  alunoRespMensagem: "",

  // aba "Aniversários"
  aniversarioMes: String(new Date().getMonth() + 1),  // "1".."12" ou "todos"
  aniversarioMsgs: null,            // { aluno, responsavel, professor } salvos da unidade ({} = usar padrão)
  aniversarioMsgsEscolaId: null,
  aniversarioMsgModalAberto: false,
  aniversarioMsgRascunho: null,
  aniversarioMsgSalvando: false,
  aniversarioMsgErro: "",
  aniversarioAviso: "",

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
  importContratosOcrAndamento: "",       // andamento do OCR (PDF escaneado)
  importContratosItens: [],             // [{ id, arquivoNome, contrato, avisos, selecionado, criarAcesso, status, erro }]
  importContratosSalvando: false,
  importContratosProgresso: { feito: 0, total: 0 },
  importContratosResumo: null,          // { criados, atualizados, comLogin, pendentes, erros }

  // Contratos pendentes de assinatura: PDF escolhido pra enviar (só na
  // memória da aba — não é gravado em lugar nenhum) e recado do último envio.
  contratoArquivosEnvio: {},            // { [alunoId]: File }
  contratoEnvioMsg: {},                 // { [alunoId]: "texto" }

  // --- Certificados (aba "Certificados") ---
  // Lado da secretaria/professor: escolhe a turma, vê os alunos dela e
  // anexa/edita o certificado (link do Drive) de cada um, módulo a módulo.
  certTurmaId: null,               // turma escolhida na aba
  certLista: null,                 // [{id, alunoNome, modulo, link, ...}] da turma escolhida, ou null se não carregou
  certListaTurmaId: null,          // turma a que certLista pertence
  certCarregando: false,
  certErro: "",
  certFormAlunoNome: null,         // aluno com o formulário de "novo certificado" aberto
  certFormModulo: "",
  certFormLink: "",
  certFormErro: "",
  certSalvando: false,
  certExcluirConfirmId: null,      // id esperando o 2º toque de "Confirmar exclusão"
  certExcluindoId: null,

  // Lado do aluno/responsável: mesmo padrão de cache do boletim (por alunoId)
  certificados: { cache: {} },     // { cache: { [alunoId]: { registros, carregando, erro, carregadoEm } } }
};

const app = document.getElementById("app");

/* ------------------------------------------------------------------
   Aba "Horários" (professor e secretaria). Toda a tela, os formulários e
   a gravação no Firestore ficam em horarios.js; aqui só entregamos o que
   ele precisa do resto do app.
   ------------------------------------------------------------------ */
const horarios = criarHorarios({
  state, db, render,
  fs: { doc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, getDoc },
  ICONS, escapeHtml,
  cursosDaEscola, todosOsCursos: TODOS_OS_CURSOS,
  // itens do calendário (sem aula, avisos) — os mesmos que a aba Calendário já carrega
  eventosCalendario: () => state.screen === "professor"
    ? state.cal.prof.eventos
    : (state.cal.inst.cache[state.escolaSelecionadaId]?.eventos || []),
  carregarEventosCalendario: (forcar = false) => state.screen === "professor"
    ? carregarEventosDoProfessor(forcar)
    : carregarEventosDaInstituicao(state.escolaSelecionadaId, forcar),
  garantirTurmas: () => garantirTurmasDaUnidade(),
  garantirEquipe: () => {
    const id = state.escolaSelecionadaId;
    if(id && (state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== id) && !state.gestaoEquipeCarregando){
      carregarEquipeDaEscola(id);
    }
  },
  // "Fazer chamada" a partir de uma aula da agenda (mesmo caminho da aba Turmas)
  abrirChamada: async (turmaId) => {
    state.professorTurmaId = turmaId;
    state.professorTab = "aulas";
    state.professorNotasSalvas = false;
    state.professorNotasErro = "";
    state.professorAtividadeEditandoId = null;
    state.professorAtividadeNome = "";
    state.professorAtividadeExcluirConfirmId = null;
    state.cal.diaAberto = null;
    const turma = professorTurmaAtual();
    render();
    if(turma) await Promise.all([carregarRegistroDoDia(turma), carregarAtividadesDaTurma(turma)]);
  },
});

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
    idAluno: dados.idAluno || "",   // código sequencial (ver proximoIdAluno) — pode não existir em cadastros antigos ainda não migrados
    sexo: dados.sexo || "",         // "masculino" | "feminino" | "" — define qual foto padrão aparece
    situacao: ["ativo", "inativo", "cancelado"].includes(dados.situacao) ? dados.situacao : "ativo",
    situacaoEm: dados.situacaoEm || "",        // "AAAA-MM-DD" em que virou inativo/cancelado
    motivoSaida: dados.motivoSaida || "",
    matriculadoEm: dados.matriculadoEm || "",  // "AAAA-MM-DD" da matrícula (vazio em cadastros antigos)
    contratoStatus: dados.contratoStatus || "",          // "assinado" | "pendente" | "" (sem contrato registrado)
    contratoEnviadoEm: dados.contratoEnviadoEm || "",    // "AAAA-MM-DD" do último envio pra assinatura
    contratosSalvos: Number(dados.contratosSalvos) || 0, // quantos PDFs de contrato estão guardados (coleção `contratos`)
    foto: dados.foto || (dados.nome || "?").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase(),
    notas: Array.isArray(dados.notas) ? dados.notas : [],
    presenca: {
      percentual: dados.presenca?.percentual ?? 0,
      faltasMes: dados.presenca?.faltasMes ?? 0,
      registros: Array.isArray(dados.presenca?.registros) ? dados.presenca.registros : [],
    },
    financeiro: {
      mensalidades: Array.isArray(dados.financeiro?.mensalidades)
        ? dados.financeiro.mensalidades.map(normalizeMensalidade)
        : [],
    },
    comunicados: Array.isArray(dados.comunicados) ? dados.comunicados : [],
    ficha: dados.ficha && typeof dados.ficha === "object" ? dados.ficha : null,   // ficha de saúde/emergência (ver alunoFichaInfo)
  };
}

function normalizeEscola(dados){
  return {
    nome: dados.nome || "",
    uf: dados.uf || "",
    data: dados.data || "",
    turmas: Array.isArray(dados.turmas) ? dados.turmas : [],
    faltantes: Array.isArray(dados.faltantes) ? dados.faltantes : [],
    alunos: Array.isArray(dados.alunos) ? dados.alunos : [],
  };
}

/* ==================================================================
   Financeiro — mensalidades lançadas à mão pela secretaria na ficha
   de cada aluno (sem ligação com contrato, sem boleto/gateway). Tudo
   que a tela mostra (status, próxima cobrança, histórico, o painel da
   instituição) é calculado em cima dessa lista — nunca fica um número
   "pronto" guardado no banco, pra nunca ficar desatualizado.
   ================================================================== */
function normalizeMensalidade(m){
  return {
    id: m.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
    competencia: m.competencia || "",      // "AAAA-MM"
    valor: Number(m.valor) || 0,
    vencimento: m.vencimento || "",        // "AAAA-MM-DD"
    status: m.status === "pago" ? "pago" : "pendente",
    formaPagamento: m.formaPagamento || "",
    dataPagamento: m.dataPagamento || "",
    // Anexos opcionais lançados à mão pela secretaria (sem gateway/banco
    // de verdade — ver comentário no topo do arquivo): o PDF do boleto
    // fica embutido em base64 no próprio documento (o app não usa
    // Storage), por isso o limite de tamanho em BOLETO_PDF_TAMANHO_MAX.
    pixCopiaCola: m.pixCopiaCola || "",
    pixTipo: m.pixTipo || "",                 // "copiaCola" | "chaveEscola" — só quando há Pix envolvido
    codigoBarras: m.codigoBarras || "",
    boletoPdfNome: m.boletoPdfNome || "",
    boletoPdfDados: m.boletoPdfDados || "",   // data URL "data:application/pdf;base64,...."
    linkPagamento: m.linkPagamento || "",     // link de pagamento (cartão)
    criadoEm: m.criadoEm || "",               // "AAAA-MM-DD" do dia em que a cobrança foi lançada
                                               // (alimenta "Cobranças dos últimos 30 dias" na aba Financeiro)
  };
}

// Firestore recusa gravar documento com mais de 1 MiB; um PDF em base64
// cresce uns 33% sobre o tamanho original, então trava bem antes disso
// pra sempre sobrar espaço pro resto do documento do aluno.
const BOLETO_PDF_TAMANHO_MAX = 600 * 1024; // 600KB

/* Lê um arquivo escolhido pelo <input type="file"> e devolve como Data
   URL (base64), pronto pra guardar direto no campo boletoPdfDados. */
function lerArquivoComoDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------
   Leitura automática do PDF do boleto.
   Ao anexar o PDF, o app lê o arquivo no próprio navegador (nada vai pra
   servidor) e tenta achar:
     • a linha digitável / código de barras (47 dígitos de boleto bancário
       ou 48 de convênio/arrecadação) — com conferência dos dígitos
       verificadores, pra saber se a leitura veio certa;
     • o Pix copia e cola (texto que começa com 000201 e termina com o CRC
       "6304XXXX"), conferindo o CRC; se o PDF só tiver o QR Code do Pix
       (sem o texto), o QR é decodificado com o jsQR;
     • o valor e o vencimento, que vêm embutidos na linha digitável de 47
       dígitos (só preenche se os campos estiverem vazios).
   PDF escaneado (só imagem) cai no OCR, que erra mais — nesse caso a tela
   avisa pra conferir. Nada é gravado até a secretaria clicar em "Lançar".
   ------------------------------------------------------------------ */
function dvMod10(num){
  let soma = 0, mult = 2;
  for(let i = num.length - 1; i >= 0; i--){
    const p = Number(num[i]) * mult;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    mult = mult === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function linhaDigitavel47Valida(d){
  if(d.length !== 47) return false;
  return [[0, 9, 9], [10, 20, 20], [21, 31, 31]].every(([ini, fim, dv]) => dvMod10(d.slice(ini, fim)) === Number(d[dv]));
}

function linhaDigitavel48Valida(d){
  if(d.length !== 48) return false;
  // blocos de 11 dígitos + DV. Mod 10 vale pra identificadores 6 e 7; os
  // demais usam mod 11, que não conferimos aqui (aceitamos como "ok").
  if(!["6", "7"].includes(d[2])) return true;
  return [0, 12, 24, 36].every(i => dvMod10(d.slice(i, i + 11)) === Number(d[i + 11]));
}

function acharLinhaDigitavel(texto){
  const t = String(texto || "");
  const candidatos = [];
  const re47 = /(\d{5})[.\s]?(\d{5})\s+(\d{5})[.\s]?(\d{6})\s+(\d{5})[.\s]?(\d{6})\s+(\d)\s+(\d{14})/g;
  const re48 = /(\d{11})[-\s]?(\d)\s+(\d{11})[-\s]?(\d)\s+(\d{11})[-\s]?(\d)\s+(\d{11})[-\s]?(\d)/g;
  const reSolta = /\d[\d.\s-]{44,62}\d/g;
  let m;
  while((m = re47.exec(t))) candidatos.push(m[0].replace(/\D/g, ""));
  while((m = re48.exec(t))) candidatos.push(m[0].replace(/\D/g, ""));
  while((m = reSolta.exec(t))) candidatos.push(m[0].replace(/\D/g, ""));
  const validos = candidatos.filter(d => (d.length === 47 && linhaDigitavel47Valida(d)) || (d.length === 48 && linhaDigitavel48Valida(d)));
  if(validos.length) return { digitos: validos[0], valida: true };
  const qualquer = candidatos.find(d => d.length === 47 || d.length === 48);
  return qualquer ? { digitos: qualquer, valida: false } : { digitos: "", valida: false };
}

/* O vencimento do boleto vem como "fator" (dias desde 07/10/1997). Em
   fev/2025 o fator voltou pra 1000, então um mesmo número pode ser de dois
   ciclos: escolhemos a data mais próxima de hoje. */
function vencimentoDoFator(fator){
  const n = Number(fator);
  if(!n) return "";
  const DIA = 86400000;
  const c1 = Date.UTC(1997, 9, 7) + n * DIA;
  const c2 = c1 + 9000 * DIA;
  const agora = Date.now();
  const alvo = Math.abs(c1 - agora) <= Math.abs(c2 - agora) ? c1 : c2;
  return new Date(alvo).toISOString().slice(0, 10);
}

function crc16Pix(str){
  let crc = 0xFFFF;
  for(let i = 0; i < str.length; i++){
    crc ^= str.charCodeAt(i) << 8;
    for(let b = 0; b < 8; b++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/* O Pix pode ter espaços de verdade (nome do recebedor, cidade), e quando o
   código quebra de linha no PDF não há espaço nenhum na quebra. Por isso
   tentamos primeiro só sem as quebras de linha e, se o CRC não fechar,
   sem nenhum espaço. O CRC garante que só devolvemos um código íntegro. */
function acharPixNoTexto(texto){
  const variantes = [
    String(texto || "").replace(/[\r\n]+/g, ""),
    String(texto || "").replace(/\s+/g, ""),
  ];
  for(const t of variantes){
    let i = t.indexOf("000201");
    while(i !== -1){
      let j = t.indexOf("6304", i + 6);
      while(j !== -1 && (j - i) <= 700){
        const cand = t.slice(i, j + 8);
        if(cand.length === (j - i) + 8 && crc16Pix(cand.slice(0, -4)) === cand.slice(-4).toUpperCase()) return cand;
        j = t.indexOf("6304", j + 1);
      }
      i = t.indexOf("000201", i + 1);
    }
  }
  return "";
}

async function lerQrPixDoPdf(file){
  if(!window.jsQR || !window.pdfjsLib) return "";
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const paginas = Math.min(pdf.numPages, 2);
  for(let p = 1; p <= paginas; p++){
    const page = await pdf.getPage(p);
    for(const escala of [2, 3]){
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const r = window.jsQR(img.data, canvas.width, canvas.height);
      canvas.width = canvas.height = 0;
      if(r && r.data){
        const pix = acharPixNoTexto(r.data);
        if(pix) return pix;
      }
    }
  }
  return "";
}

/* Devolve { codigoBarras, pix, valor, vencimento, avisos[] }. Nunca lança
   erro por causa da leitura em si: se não achou nada, volta tudo vazio. */
async function lerDadosDoBoletoPdf(file){
  const avisos = [];
  let texto = "";
  try { texto = await extrairTextoDoPdf(file); } catch(e){ texto = ""; }

  let linha = acharLinhaDigitavel(texto);
  let pix = acharPixNoTexto(texto);

  const semTexto = texto.replace(/\s+/g, "").length < 80;
  if(semTexto && !linha.digitos){
    try {
      const r = await extrairTextoContrato(file);
      texto = r.texto;
      linha = acharLinhaDigitavel(texto);
      if(!pix) pix = acharPixNoTexto(texto);
      avisos.push("PDF escaneado, lido por OCR — confira os números com o boleto.");
    } catch(e){ /* OCR indisponível: segue sem */ }
  }
  if(!pix){
    try { pix = await lerQrPixDoPdf(file); } catch(e){ pix = ""; }
  }

  if(linha.digitos && !linha.valida){
    avisos.push("A linha digitável lida não passou na conferência dos dígitos — confira com o boleto.");
  }

  let valor = 0, vencimento = "";
  if(linha.digitos.length === 47){
    valor = Number(linha.digitos.slice(37, 47)) / 100;
    vencimento = vencimentoDoFator(linha.digitos.slice(33, 37));
  }
  return { codigoBarras: linha.digitos, pix, valor, vencimento, avisos };
}

/* Joga o que foi lido nos campos do formulário (da aba Financeiro ou da
   ficha do aluno). Valor e vencimento só entram se estiverem vazios. */
function aplicarDadosDoBoleto(prefixo, lido){
  const k = prefixo === "aluno-fin"
    ? { cod: "alunoFinCodigoBarras", pix: "alunoFinPix", comPix: "alunoFinBoletoComPix", valor: "alunoFinValor", venc: "alunoFinVencimento", msg: "alunoFinMensagem" }
    : { cod: "finCobrancaCodigoBarras", pix: "finCobrancaPix", comPix: "finCobrancaBoletoComPix", valor: "finCobrancaValor", venc: "finCobrancaVencimento", msg: "finCobrancaMensagem" };
  if(!lido){
    state[k.msg] = "PDF anexado, mas não consegui ler os códigos — digite o código de barras e o Pix à mão.";
    return;
  }
  const achou = [];
  if(lido.codigoBarras){ state[k.cod] = lido.codigoBarras; achou.push("código de barras"); }
  if(lido.pix){ state[k.pix] = lido.pix; state[k.comPix] = true; achou.push("Pix copia e cola"); }
  if(lido.valor > 0 && !String(state[k.valor] || "").trim()){ state[k.valor] = lido.valor.toFixed(2); achou.push("valor"); }
  if(lido.vencimento && !String(state[k.venc] || "").trim()){ state[k.venc] = lido.vencimento; achou.push("vencimento"); }
  if(achou.length){
    state[k.msg] = `Lido do PDF: ${achou.join(", ")}.${lido.avisos.length ? " " + lido.avisos.join(" ") : ""}`;
  } else {
    state[k.msg] = `PDF anexado, mas não achei código de barras nem Pix nele — digite à mão.${lido.avisos.length ? " " + lido.avisos.join(" ") : ""}`;
  }
}

function resetarFormCobrancaFin(){
  state.finCobrancaAlunoId = "";
  state.finCobrancaBusca = "";
  state.finCobrancaCompetencia = competenciaAtual();
  state.finCobrancaValor = "";
  state.finCobrancaVencimento = "";
  state.finCobrancaForma = "boleto";
  state.finCobrancaPixTipo = "copiaCola";
  state.finCobrancaBoletoComPix = false;
  state.finCobrancaLinkCartao = "";
  state.finCobrancaPix = "";
  state.finCobrancaCodigoBarras = "";
  state.finCobrancaBoletoArquivo = null;
  state.finCobrancaErro = "";
  state.finCobrancaMensagem = "";
}

/* Quando a família passa a ver uma cobrança: a partir do dia 01 do mês de
   referência (competência). A secretaria pode lançar antes — só aparece
   pra família (aba Financeiro, calendário e pop-up) no dia 01. Cobrança
   lançada depois do dia 01 aparece na hora. */
function cobrancaDisponivelParaFamilia(m){
  if(!/^\d{4}-\d{2}$/.test(m.competencia || "")) return true;
  return hojeISO() >= `${m.competencia}-01`;
}

function cobrancasDisponiveisDoAluno(aluno){
  return (aluno?.financeiro?.mensalidades || []).filter(cobrancaDisponivelParaFamilia);
}

/* Botões de "Baixar boleto" / "Copiar Pix" / "Copiar código de barras"
   embaixo de uma cobrança, só com o que estiver preenchido. Usado tanto
   na ficha do aluno (secretaria) quanto na aba Financeiro da família. */
function anexosMensalidadeHtml(m){
  const partes = [];
  if(m.boletoPdfDados){
    partes.push(`<a href="${escapeHtml(m.boletoPdfDados)}" download="${escapeHtml(m.boletoPdfNome || "boleto.pdf")}" class="btn-secondary" style="text-decoration:none;">${ICONS.fileText} Boleto (PDF)</a>`);
  }
  if(m.pixCopiaCola){
    partes.push(`<button type="button" class="btn-secondary" data-action="copiar-texto" data-copiar="${escapeHtml(m.pixCopiaCola)}">Copiar Pix</button>`);
  }
  if(m.codigoBarras){
    partes.push(`<button type="button" class="btn-secondary" data-action="copiar-texto" data-copiar="${escapeHtml(m.codigoBarras)}">Copiar código de barras</button>`);
  }
  if(m.formaPagamento === "pix" && m.pixTipo === "chaveEscola" && !m.pixCopiaCola){
    partes.push(`<span class="pill" style="pointer-events:none;">${ICONS.fileText} Pix com a chave da escola</span>`);
  }
  if(m.linkPagamento){
    partes.push(`<a href="${escapeHtml(m.linkPagamento)}" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;">${ICONS.fileText} Link de pagamento</a>`);
  }
  if(!partes.length) return "";
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${partes.join("")}</div>`;
}

function formatarMoeda(n){
  return "R$" + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarDataBr(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const MESES_COMPETENCIA = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function competenciaAtual(){
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function competenciaLabel(c){
  const m = /^(\d{4})-(\d{2})$/.exec(c || "");
  if(!m) return c || "—";
  const nome = MESES_COMPETENCIA[Number(m[2]) - 1];
  return nome ? `${nome}/${m[1]}` : c;
}

function formaPagamentoLabel(f){
  return { boleto: "Boleto", dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão" }[f] || "—";
}

/* <select> de "Forma de pagamento" usado tanto ao lançar uma cobrança
   (forma esperada — decide se mostra o campo de Pix ou de boleto) quanto
   ao dar baixa (forma como foi realmente paga). */
function selectFormaPagamentoHtml(id, valorAtual){
  const opcoes = [
    { valor: "boleto", texto: "Boleto" },
    { valor: "pix", texto: "Pix" },
    { valor: "cartao", texto: "Cartão" },
    { valor: "dinheiro", texto: "Dinheiro" },
  ];
  return `<select id="${id}" class="teacher-text-input" style="margin:0;flex:1 1 140px;">${opcoes
    .map(o => `<option value="${o.valor}" ${valorAtual === o.valor ? "selected" : ""}>${o.texto}</option>`)
    .join("")}</select>`;
}

/* Campos extras do formulário de "Lançar cobrança" que dependem da forma
   de pagamento escolhida — mesma lógica usada tanto na sub-aba Financeiro
   da instituição quanto na ficha do aluno, então fica num lugar só.
     pix    → escolhe entre "Pix copia e cola" (pede o código) ou "Chave
              Pix da escola" (nada pra preencher, é a chave fixa da unidade)
     boleto → código de barras + PDF, com a opção de incluir também um
              Pix copia e cola pra quem quiser pagar por ele em vez do boleto
     cartão → link de pagamento (ex.: link da maquininha/gateway)
   `prefix` vira o id dos campos (ex.: "fin-cobranca" ou "aluno-fin") pra
   bater com os ids já usados nos listeners de input/change/arquivo. */
function camposFormaPagamentoHtml(prefix, forma, v){
  if(forma === "pix"){
    const pixTipo = v.pixTipo || "copiaCola";
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">
        <span style="font-size:12.5px;color:var(--slate);">Tipo de Pix</span>
        <select id="${prefix}-pix-tipo" class="teacher-text-input" style="margin:0;flex:1 1 200px;">
          <option value="copiaCola" ${pixTipo === "copiaCola" ? "selected" : ""}>Pix copia e cola</option>
          <option value="chaveEscola" ${pixTipo === "chaveEscola" ? "selected" : ""}>Chave Pix da escola</option>
        </select>
      </div>
      ${pixTipo === "copiaCola"
        ? `<div style="margin-top:8px;"><input id="${prefix}-pix" type="text" class="teacher-text-input" style="width:100%;margin:0;" placeholder="Código Pix copia e cola" value="${escapeHtml(v.pix)}" /></div>`
        : `<p style="font-size:12.5px;color:var(--slate);margin-top:8px;">A família paga com a chave Pix já cadastrada da escola — nada pra preencher aqui.</p>`}`;
  }
  if(forma === "boleto"){
    const comPix = !!v.boletoComPix;
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <input id="${prefix}-codigo-barras" type="text" class="teacher-text-input" style="flex:1 1 220px;margin:0;" placeholder="Código de barras do boleto (opcional)" value="${escapeHtml(v.codigoBarras)}" />
      </div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <label class="pendente-contrato-anexar">
          ${ICONS.upload} <span>${v.boletoArquivo ? escapeHtml(v.boletoArquivo.nome) : "Anexar PDF do boleto (opcional)"}</span>
          <input type="file" accept="application/pdf" data-${prefix}-boleto="1" style="display:none;" ${v.boletoLendo ? "disabled" : ""} />
        </label>
        ${v.boletoLendo ? `<span style="font-size:12px;color:var(--slate);">Lendo o boleto (código de barras e Pix)…</span>` : ""}
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;color:var(--ink);cursor:pointer;">
        <input type="checkbox" data-action="toggle-${prefix}-boleto-pix" ${comPix ? "checked" : ""} />
        Incluir também um Pix copia e cola
      </label>
      ${comPix ? `<div style="margin-top:8px;"><input id="${prefix}-pix" type="text" class="teacher-text-input" style="width:100%;margin:0;" placeholder="Código Pix copia e cola" value="${escapeHtml(v.pix)}" /></div>` : ""}`;
  }
  if(forma === "cartao"){
    return `
      <div style="margin-top:8px;">
        <input id="${prefix}-link-cartao" type="url" class="teacher-text-input" style="width:100%;margin:0;" placeholder="Link para pagamento" value="${escapeHtml(v.linkCartao)}" />
      </div>`;
  }
  return "";
}

function diasAtraso(vencimentoIso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoIso || "")) return 0;
  const venc = new Date(vencimentoIso + "T00:00:00");
  const hoje = new Date(dataDeHojeISO() + "T00:00:00");
  return Math.max(0, Math.round((hoje - venc) / 86400000));
}

/* Dias corridos desde uma data ISO ("AAAA-MM-DD") até hoje. Usado pra
   filtrar "Cobranças dos últimos 30 dias" na aba Financeiro. */
function diasDesde(dataIso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dataIso || "")) return Infinity;
  const data = new Date(dataIso + "T00:00:00");
  const hoje = new Date(dataDeHojeISO() + "T00:00:00");
  return Math.round((hoje - data) / 86400000);
}

function mensalidadeEstaAtrasada(m){
  return m.status === "pendente" && m.vencimento && m.vencimento < dataDeHojeISO();
}

/* Resumo exibido no cartão do aluno/responsável e na ficha da secretaria —
   sempre recalculado a partir de financeiro.mensalidades. */
function resumoFinanceiroAluno(financeiro){
  const mensalidades = Array.isArray(financeiro?.mensalidades) ? financeiro.mensalidades : [];
  const pendentes = mensalidades
    .filter(m => m.status === "pendente")
    .sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""));
  const atrasada = pendentes.find(mensalidadeEstaAtrasada);
  const proximaM = atrasada || pendentes[0] || null;

  let status = "—";
  if(atrasada) status = `Atrasada há ${diasAtraso(atrasada.vencimento)} dia(s)`;
  else if(proximaM) status = "Em dia";
  else if(mensalidades.length > 0) status = "Em dia";

  return {
    status,
    atrasada: !!atrasada,
    proxima: proximaM ? `${competenciaLabel(proximaM.competencia)} · vence em ${formatarDataBr(proximaM.vencimento)}` : "—",
    valor: proximaM ? formatarMoeda(proximaM.valor) : "—",
    historico: mensalidades.slice().sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || "")),
  };
}

/* ================================================================== */
/* Autenticação                                                         */
/* ================================================================== */
onAuthStateChanged(auth, async (user) => {
  if(!user){
    contratosResetar();
    state.authUser = null;
    state.perfil = null;
    state.fichaForm = null;
    state.alunoFicha = { alunoId: null, form: null, salvando: false, erro: "", mensagem: "" };
    state.cal = calNovoEstado();
    state.aval = avalNovoEstado();
    state.avisosPopup = { aberto: false, itens: [], vistos: [] };
    state.screen = "login";
    state.loginCarregando = false;
    render();
    return;
  }
  contratosResetar();
  state.authUser = user;
  state.cal = calNovoEstado();
    state.aval = avalNovoEstado();
  state.avisosPopup = { aberto: false, itens: [], vistos: [] };
  state.screen = "carregando";
  render();
  try {
    const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
    if(!perfilSnap.exists()){
      throw new Error("Não encontramos um cadastro para este acesso. Fale com a secretaria.");
    }
    state.perfil = perfilSnap.data();
    state.fichaForm = null;
    state.alunoFicha = { alunoId: null, form: null, salvando: false, erro: "", mensagem: "" };
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
      <span class="secretaria-option-icon secretaria-option-icon-foto">${avatarHtml(escola.foto, "?")}</span>
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


/* Foto que aparece no cabeçalho da tela inicial, ao lado do nome (canto
   direito). Aluno e professor usam a foto do gênero; a equipe usa a foto
   da secretaria da unidade aberta; responsável cai nas iniciais. */
function fotoSecretariaDaEscola(escola){
  const nome = (escola?.nome || "").toLowerCase();
  if(nome.includes("salto")) return SECRETARIA_WHATSAPP.find(e => e.id === "salto")?.foto || "";
  if(nome.includes("prata")) return SECRETARIA_WHATSAPP.find(e => e.id === "prata")?.foto || "";
  return "";
}

function iniciaisDoNome(nome){
  return (nome || "?").trim().split(/\s+/).map(p => p[0]).slice(0,2).join("").toUpperCase() || "?";
}

function headerFotoHtml(fotoUrl, nome){
  return avatarHtml(fotoUrl, iniciaisDoNome(nome), "avatar-foto-cabecalho");
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
function shell({ navItems, active, headerSub, headerTitle, headerFoto, bodyHtml, navAction, schoolBadge, schoolBadgeClickable }){
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
        ${headerFoto ? `<div class="main-head-foto">${headerFoto}</div>` : ""}
        <div class="main-head-texto">
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
      ${schoolBadge ? (
        schoolBadgeClickable
          ? `<button type="button" class="sidebar-school sidebar-school-clickable" data-action="open-escola-picker" title="Trocar de unidade">${schoolBadge} ${ICONS.chevronRight}</button>`
          : `<div class="sidebar-school">${schoolBadge}</div>`
      ) : ""}
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
    { key:"aval", label:"Avaliações", icon:"star" },
    { key:"presenca", label:"Presença", icon:"clipboard" },
    ...(ehTurmaDeRecreacao(student.turma) ? [] : [{ key:"certificados", label:"Certificados", icon:"award" }]),
    { key:"comunicados", label:"Comunicados", icon:"megaphone" },
    ...(ehTurmaDeRecreacao(student.turma) ? [] : [{ key:"ficha", label:"Minha ficha", icon:"shield" }]),
  ];

  let body = "";
  if(state.alunoTab === "calendario") body = calendarioAlunoView(student, "aluno");
  else if(state.alunoTab === "notas") body = notasView(student);
  else if(state.alunoTab === "aval") body = avaliacoesAlunoView(student, "aluno");
  else if(state.alunoTab === "presenca") body = presencaView(student);
  else if(state.alunoTab === "certificados") body = certificadosView(student, false);
  else if(state.alunoTab === "comunicados") body = comunicadosView(student);
  else if(state.alunoTab === "ficha") body = alunoFichaView(student, "aluno");

  return shell({
    navItems, active: state.alunoTab,
    headerSub: `ALUNO · ${escapeHtml(student.turma)}`, headerTitle: greeting(student.nome),
    headerFoto: headerFotoHtml(fotoDoAluno(student), student.nome),
    bodyHtml: classStatusCard(student) + body,
    navAction: "set-aluno-tab",
  }) + avisosPopupHtml();
}

/* ---------------- FAMÍLIA (RESPONSÁVEL) DASHBOARD ---------------- */
function renderFamilia(){
  const alunos = state.data.familiaAlunos;
  const student = alunos.find(s => s.id === state.familiaStudentId) || alunos[0];
  // Mostra a aba se pelo menos um dos filhos não for só de Recreação; ao
  // abrir num filho que é só de Recreação, certificadosView já explica.
  const algumFilhoTemCertificado = alunos.some(s => !ehTurmaDeRecreacao(s.turma));
  const navItems = [
    { key:"calendario", label:"Calendário", icon:"calendar" },
    { key:"notas", label:"Notas", icon:"cap" },
    { key:"aval", label:"Avaliações", icon:"star" },
    { key:"presenca", label:"Presença", icon:"clipboard" },
    ...(algumFilhoTemCertificado ? [{ key:"certificados", label:"Certificados", icon:"award" }] : []),
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"contratos", label:"Contratos", icon:"fileText" },
    { key:"comunicados", label:"Comunicados", icon:"megaphone" },
    { key:"ficha", label:"Ficha", icon:"shield" },
  ];

  let switcher = "";
  if(alunos.length > 1){
    switcher = `<div class="student-switch">` + alunos.map(s => `
      <button class="student-chip ${s.id===state.familiaStudentId?'active':''}" data-action="switch-student" data-id="${s.id}">
        ${avatarHtml(fotoDoAluno(s), s.foto)}
        <span class="student-chip-name">${escapeHtml(s.nome.split(" ")[0])}</span>
        <span class="student-chip-turma">· ${escapeHtml(s.turma)}</span>
      </button>`).join("") + `</div>`;
  }

  let body = "";
  if(state.familiaTab === "calendario") body = calendarioAlunoView(student, "responsavel");
  else if(state.familiaTab === "notas") body = notasView(student);
  else if(state.familiaTab === "aval") body = avaliacoesAlunoView(student, "responsavel");
  else if(state.familiaTab === "presenca") body = presencaView(student);
  else if(state.familiaTab === "certificados") body = certificadosView(student, true);
  else if(state.familiaTab === "financeiro") body = financeiroFamiliaView(student);
  else if(state.familiaTab === "contratos") body = contratosFamiliaView(student);
  else if(state.familiaTab === "comunicados") body = comunicadosView(student);
  else if(state.familiaTab === "ficha") body = alunoFichaView(student, "responsavel");

  return shell({
    navItems, active: state.familiaTab,
    headerSub: "RESPONSÁVEL", headerTitle: greeting(state.perfil?.nome || "Responsável"),
    headerFoto: headerFotoHtml(FOTO_PADRAO.responsavel, state.perfil?.nome || "Responsável"),
    bodyHtml: switcher + classStatusCard(student, true) + body,
    navAction: "set-familia-tab",
  }) + avisosPopupHtml() + contratoVisualizadorModal();
}

function notasView(student){
  const cache = state.boletim.cache[student.id] || { registros: [], carregando: false, erro: "" };

  if(cache.erro){
    return `
      <h2 class="section-title">Boletim</h2>
      <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
      <p class="teacher-error" style="color:var(--red,#C4544A);font-size:13px;">${escapeHtml(cache.erro)}</p>`;
  }
  if(cache.carregando && cache.registros.length === 0){
    return `
      <h2 class="section-title">Boletim</h2>
      <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
      <p class="section-eyebrow">Carregando notas…</p>`;
  }

  const disciplinas = montarBoletim(cache.registros);
  const fmt = v => v === null ? "—" : v.toFixed(1);
  const corMedia = v => v === null ? "var(--slate)" : (v >= 7 ? "var(--green)" : "var(--red)");
  const pillMedia = v => v === null ? "" : (v >= 7 ? "pill-green" : "pill-red");
  const mediaGeral = mediaDeNotas(disciplinas.map(d => d.final).filter(v => v !== null));

  if(disciplinas.length === 0){
    return `
      <h2 class="section-title" style="display:inline-block;margin-right:12px;">Boletim</h2>
      <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
      <div class="card flush"><div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma nota lançada ainda.</div></div>`;
  }

  const listaAtividades = atividades => atividades.length
    ? atividades.map(a => `
        <div class="row">
          <span style="font-size:13.5px;color:var(--ink);">${escapeHtml(a.atividadeNome || "")}</span>
          <span style="font-size:14px;font-weight:700;color:${corMedia(Number(a.nota))};">${fmt(Number(a.nota))}</span>
        </div>`).join("")
    : `<div class="row"><span style="font-size:13px;color:var(--slate);">Nenhuma atividade lançada ainda</span></div>`;

  const cards = disciplinas.map(d => `
    <div class="boletim-disciplina">
      <div class="boletim-disciplina-head">
        <h3>${escapeHtml(d.disciplina)}</h3>
        <span class="pill ${pillMedia(d.final)}">Média final ${fmt(d.final)}</span>
      </div>
      <div class="boletim-etapa">
        <div class="boletim-etapa-head"><strong>1º bimestre</strong><span style="color:${corMedia(d.media1)};font-weight:700;">${fmt(d.media1)}</span></div>
        <div class="card flush">${listaAtividades(d.atividades1)}</div>
      </div>
      <div class="boletim-etapa">
        <div class="boletim-etapa-head"><strong>2º bimestre</strong><span style="color:${corMedia(d.media2)};font-weight:700;">${fmt(d.media2)}</span></div>
        <div class="card flush">${listaAtividades(d.atividades2)}</div>
      </div>
    </div>`).join("");

  return `
    <h2 class="section-title" style="display:inline-block;margin-right:12px;">Boletim</h2>
    <span class="pill ${pillMedia(mediaGeral)}">Média geral ${fmt(mediaGeral)}</span>
    <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
    ${cards}`;
}

/* ---------------- Certificados (lado do aluno/responsável) ----------------
   A Recreação não tem módulo pra certificar, então nem mostra a lista —
   só uma explicação curta. Responsável também ganha um jeito rápido de
   pedir o certificado direto pra secretaria pelo WhatsApp. */
function certificadosView(student, ehResponsavel){
  if(ehTurmaDeRecreacao(student.turma)){
    return `
      <h2 class="section-title">Certificados</h2>
      <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
      <div class="card flush"><div style="padding:20px;font-size:14px;color:var(--slate);">A Recreação não tem módulos, então não emite certificado por aqui.</div></div>`;
  }

  const cache = state.certificados.cache[student.id] || { registros: [], carregando: false, erro: "" };

  if(cache.erro){
    return `
      <h2 class="section-title">Certificados</h2>
      <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
      <p class="teacher-error" style="color:var(--red,#C4544A);font-size:13px;">${escapeHtml(cache.erro)}</p>`;
  }
  if(cache.carregando && cache.registros.length === 0){
    return `
      <h2 class="section-title">Certificados</h2>
      <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
      <p class="section-eyebrow">Carregando certificados…</p>`;
  }

  const linhas = cache.registros.length
    ? cache.registros.map(c => `
      <div class="row">
        <div>
          <strong style="display:block;font-size:14px;color:var(--ink);">${escapeHtml(c.modulo)}</strong>
          <span style="font-size:12px;color:var(--slate);">Anexado em ${escapeHtml((c.atualizadoEm || "").slice(0, 10))}</span>
        </div>
        <a class="attendance-btn" style="text-decoration:none;" href="${escapeHtml(c.link)}" target="_blank" rel="noopener">${ICONS.award} Ver certificado</a>
      </div>`).join("")
    : `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum certificado anexado ainda.</div>`;

  const blocoSolicitar = ehResponsavel ? `
    <div class="teacher-panel" style="margin-top:16px;">
      <h3>Não achou o certificado?</h3>
      <p class="section-eyebrow">Peça direto pra secretaria da unidade do(a) ${escapeHtml(primeiroNome(student.nome))}, pelo WhatsApp.</p>
      ${SECRETARIA_WHATSAPP.map(escola => `
        <a class="secretaria-option" style="text-decoration:none;margin-top:8px;" href="${whatsappLinkComTexto(escola.numero, MENSAGEM_CERTIFICADO.solicitar(student.nome, student.turma))}" target="_blank" rel="noopener">
          <span class="secretaria-option-icon secretaria-option-icon-foto">${avatarHtml(escola.foto, "?")}</span>
          <span>
            <span class="secretaria-option-name">${escapeHtml(escola.nome)}</span>
            <span class="secretaria-option-desc">Solicitar pelo WhatsApp</span>
          </span>
          ${ICONS.chevronRight}
        </a>`).join("")}
    </div>` : "";

  return `
    <h2 class="section-title">Certificados</h2>
    <p class="section-eyebrow">${escapeHtml(student.turma)}</p>
    <div class="card flush">${linhas}</div>
    ${blocoSolicitar}`;
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
  const resumo = resumoFinanceiroAluno(student.financeiro);
  const hist = resumo.historico.filter(cobrancaDisponivelParaFamilia).map(m => `
    <div class="row" style="font-size:14px;flex-direction:column;align-items:stretch;gap:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="color:var(--ink);font-weight:600;">${escapeHtml(competenciaLabel(m.competencia))}</span>
        <span style="color:var(--slate);">${escapeHtml(formatarMoeda(m.valor))} · vence ${escapeHtml(formatarDataBr(m.vencimento))} · ${escapeHtml(formaPagamentoLabel(m.formaPagamento))}</span>
      </div>
      ${anexosMensalidadeHtml(m)}
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum boleto disponível.</div>`;
  return `
    <h2 class="section-title">Financeiro</h2>
    <p class="section-eyebrow">Boletos e mensalidades da matrícula, mês a mês</p>
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
    inst: { cache: {} },         // { [escolaId]: { eventos, carregando, erro, carregadoEm } } — calendário da secretaria
    form: null,                  // formulário de novo aviso (professor) — null = fechado
    formInst: null,               // formulário de novo item (secretaria) — null = fechado
    seed: null,                   // { itens, enviando, erro } — modal "Importar calendário da SEED"
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

/* ---------------- POP-UP DE AVISOS NOVOS (aluno e responsável) ----------------
   Ao entrar (e quando a agenda de um filho termina de carregar), junta os avisos
   que ainda não foram vistos e valem de hoje em diante: avisos/lembretes do
   professor e itens da secretaria. Os ids já vistos ficam guardados no
   navegador (por usuário), então o mesmo aviso não aparece de novo. */
const AVISOS_VISTOS_MAX = 300;

function avisosVistosChave(){
  return `educa:avisos-vistos:${state.authUser?.uid || "anon"}`;
}

function lerAvisosVistos(){
  let guardados = [];
  try {
    const bruto = localStorage.getItem(avisosVistosChave());
    const lista = bruto ? JSON.parse(bruto) : [];
    if(Array.isArray(lista)) guardados = lista;
  } catch(_e){ /* sem armazenamento: vale só a sessão */ }
  return new Set([...guardados, ...(state.avisosPopup.vistos || [])]);
}

function gravarAvisosVistos(ids){
  const todos = [...new Set([...lerAvisosVistos(), ...ids])];
  state.avisosPopup.vistos = todos;
  try {
    localStorage.setItem(avisosVistosChave(), JSON.stringify(todos.slice(-AVISOS_VISTOS_MAX)));
  } catch(_e){ /* sem armazenamento: segue só com a memória da sessão */ }
}

function avisosNovosParaMostrar(){
  const ehFamilia = state.screen === "familia";
  const alunos = ehFamilia ? (state.data.familiaAlunos || []) : (state.data.aluno ? [state.data.aluno] : []);
  const papel = ehFamilia ? "responsavel" : "aluno";
  const vistos = lerAvisosVistos();
  const hoje = hojeISO();
  const porId = new Map();

  alunos.forEach(al => {
    const eventos = state.cal.cache[al.id]?.eventos || [];
    eventos.forEach(e => {
      if(!e.id || vistos.has(e.id) || porId.has(e.id)) return;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(e.data || "") || e.data < hoje) return;
      if(e.escopo !== "escola"){
        if(papel === "aluno" && e.paraQuem === "responsaveis") return;
        if(papel === "responsavel" && e.paraQuem === "alunos") return;
      }
      porId.set(e.id, { ...e, _aluno: ehFamilia && alunos.length > 1 ? String(al.nome || "").split(" ")[0] : "" });
    });
  });

  // Cobranças novas (só responsável): já disponíveis (dia 01 do mês) e ainda não vistas.
  if(ehFamilia){
    alunos.forEach(al => {
      cobrancasDisponiveisDoAluno(al).forEach(m => {
        const id = `cob:${al.id}:${m.id}`;
        if(vistos.has(id) || porId.has(id)) return;
        if(m.vencimento && m.vencimento < hoje) return;   // já venceu: não é "novidade"
        porId.set(id, {
          id, escopo: "cobranca", data: m.vencimento || "", competencia: m.competencia,
          valor: m.valor, formaPagamento: m.formaPagamento, criadoEm: m.criadoEm || "",
          _aluno: alunos.length > 1 ? String(al.nome || "").split(" ")[0] : "",
        });
      });
    });
  }

  return [...porId.values()].sort((a, b) =>
    (a.escopo === "cobranca" ? 0 : 1) - (b.escopo === "cobranca" ? 0 : 1) ||
    String(a.data).localeCompare(String(b.data)) || String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")));
}

function verificarAvisosNovos(){
  if(state.screen !== "aluno" && state.screen !== "familia") return;
  if(state.avisosPopup.aberto) return;
  const itens = avisosNovosParaMostrar();
  if(itens.length === 0) return;
  state.avisosPopup.itens = itens;
  state.avisosPopup.aberto = true;
}

function avisosPopupHtml(){
  const p = state.avisosPopup;
  if(!p.aberto || !p.itens.length) return "";
  const cards = p.itens.map(e => {
    if(e.escopo === "cobranca"){
      return `
      <div class="avisos-popup-item">
        <div class="avisos-popup-topo"><span class="pill pill-gold">Financeiro</span><strong>Cobrança nova disponível — ${escapeHtml(competenciaLabel(e.competencia))}</strong></div>
        <p class="avisos-popup-desc">${escapeHtml(formatarMoeda(e.valor))} · vence ${escapeHtml(formatarDataBr(e.data))} · ${escapeHtml(formaPagamentoLabel(e.formaPagamento))}</p>
        <div class="avisos-popup-meta">Veja o boleto na aba Financeiro${e._aluno ? ` · ${escapeHtml(e._aluno)}` : ""}</div>
      </div>`;
    }
    let pill, meta;
    if(e.escopo === "escola"){
      const info = TIPOS_INSTITUICAO[e.tipo] || TIPOS_INSTITUICAO.outro;
      pill = `<span class="pill cal-pill-inst-${info.classe}">${escapeHtml(info.rotulo)}</span>`;
      meta = "Secretaria";
    } else {
      pill = e.tipo === "lembrete"
        ? `<span class="pill cal-pill-lembrete">Lembrete</span>`
        : `<span class="pill pill-gold">Aviso</span>`;
      meta = `Por ${escapeHtml(e.professorNome || "Professor(a)")}${e.disciplina ? ` · ${escapeHtml(e.disciplina)}` : ""}`;
    }
    return `
      <div class="avisos-popup-item">
        <div class="avisos-popup-data">${escapeHtml(dataExtenso(e.data))}</div>
        <div class="avisos-popup-topo">${pill}<strong>${escapeHtml(e.titulo || "Aviso")}</strong></div>
        ${e.descricao ? `<p class="avisos-popup-desc">${escapeHtml(e.descricao)}</p>` : ""}
        <div class="avisos-popup-meta">${meta}${e._aluno ? ` · ${escapeHtml(e._aluno)}` : ""}</div>
      </div>`;
  }).join("");
  const n = p.itens.length;
  return `
    <div class="aluno-modal-backdrop" data-action="avisos-popup-fechar">
      <div class="aluno-modal avisos-popup" role="dialog" aria-modal="true" aria-label="Avisos novos" data-action="noop">
        <div class="aluno-modal-head">
          <div>
            <h2>${n === 1 ? "Você tem 1 aviso novo" : `Você tem ${n} avisos novos`}</h2>
            <p class="section-eyebrow" style="margin:2px 0 0;">${p.itens.every(e => e.escopo === "cobranca") ? "Financeiro" : "Da escola, dos professores e do financeiro"}</p>
          </div>
          <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="avisos-popup-fechar" aria-label="Fechar">${ICONS.close}</button>
        </div>
        <div class="avisos-popup-lista">${cards}</div>
        <button type="button" class="teacher-primary-btn avisos-popup-ok" data-action="avisos-popup-fechar">Entendi</button>
      </div>
    </div>`;
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
    verificarAvisosNovos();
    render();
  }
}

/* Média simples de uma lista de notas, ignorando o que não for número.
   Devolve null (em vez de 0) quando não há nenhuma nota — assim dá pra
   distinguir "tirou zero" de "ainda não tem nota lançada". */
function mediaDeNotas(valores){
  const nums = (valores || []).map(Number).filter(n => !isNaN(n));
  if(!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/* Agrupa os registros de "notasAluno" por disciplina e bimestre, e já
   calcula a média de cada etapa e a média final (só quando as duas
   etapas têm nota). Uma função pura, sem tocar no state — assim
   notasView() e o resumo do professor podem reaproveitar a mesma conta. */
function montarBoletim(registros){
  const porDisciplina = {};
  (registros || []).forEach(r => {
    const disciplina = r.disciplina || "Sem disciplina";
    if(!porDisciplina[disciplina]) porDisciplina[disciplina] = { 1: [], 2: [] };
    const bimestre = Number(r.bimestre) === 2 ? 2 : 1;
    porDisciplina[disciplina][bimestre].push(r);
  });
  return Object.keys(porDisciplina).sort().map(disciplina => {
    const etapas = porDisciplina[disciplina];
    const atividades1 = etapas[1].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const atividades2 = etapas[2].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const media1 = mediaDeNotas(atividades1.map(a => a.nota));
    const media2 = mediaDeNotas(atividades2.map(a => a.nota));
    const final = (media1 !== null && media2 !== null) ? (media1 + media2) / 2 : null;
    return { disciplina, atividades1, atividades2, media1, media2, final };
  });
}

/* Busca as notas (copiadas de "atividades" em "notasAluno") do aluno,
   pra montar o boletim. Mesmo padrão de carregarCalendarioDoAluno: cache
   por alunoId, com uma leitura só que filtra por escolaId + alunoKey. */
async function carregarBoletimDoAluno(student, forcar = false){
  if(!student) return;
  const cache = state.boletim.cache[student.id] || (state.boletim.cache[student.id] = { registros: [], carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const chave = chaveAluno(student.escolaId, student.nome);
    const snap = await getDocs(query(collection(db, "notasAluno"), where("escolaId", "==", student.escolaId), where("alunoKey", "==", chave)));
    cache.registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cache.carregadoEm = Date.now();
  } catch(err){
    cache.erro = mensagemErroCalendario(err);
  } finally {
    cache.carregando = false;
    render();
  }
}

/* ---------------- Certificados ----------------
   Um documento por aluno por módulo (coleção "certificadosAluno"), no
   mesmo padrão de "notasAluno"/"presencasAluno": id determinístico (pra
   reanexar o mesmo módulo do mesmo aluno atualizar em vez de duplicar) e
   alunoKey pra quem lê do lado do aluno/responsável. */
function certificadoDocId(turmaId, modulo, alunoNome){
  return `${turmaId}_${slugNome(modulo, "modulo")}_${slugNome(alunoNome, "aluno")}`;
}

/* Todos os certificados já anexados pra uma turma (usado do lado de quem
   anexa — secretaria/professor). Uma leitura só, filtrando por turmaId;
   agrupar por aluno é feito na hora de montar a tela. */
async function carregarCertificadosDaTurma(turma, forcar = false){
  if(!turma) return;
  if(!forcar && state.certLista !== null && state.certListaTurmaId === turma.id) return;
  state.certCarregando = true;
  state.certErro = "";
  render();
  try {
    const snap = await getDocs(query(collection(db, "certificadosAluno"), where("turmaId", "==", turma.id)));
    state.certLista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.certListaTurmaId = turma.id;
  } catch(err){
    state.certLista = [];
    state.certListaTurmaId = turma.id;
    state.certErro = "Não foi possível carregar os certificados desta turma. Tente de novo.";
  } finally {
    state.certCarregando = false;
    render();
  }
}

/* Salva (ou corrige, se já existir o mesmo módulo pra esse aluno nessa
   turma) o link do certificado. Quem chama (secretaria ou professor) já
   está identificado por state.authUser/state.perfil. */
async function salvarCertificado(turma, alunoNome, modulo, link){
  const id = certificadoDocId(turma.id, modulo, alunoNome);
  const agora = new Date().toISOString();
  const dados = {
    alunoKey: chaveAluno(turma.escolaId, alunoNome),
    alunoNome,
    escolaId: turma.escolaId,
    turmaId: turma.id,
    turmaNome: turma.nome || "",
    disciplina: turma.disciplina || "",
    modulo,
    link,
    anexadoPorId: state.authUser ? state.authUser.uid : "",
    anexadoPorNome: (state.perfil && state.perfil.nome) || state.data.professorNome || "",
    atualizadoEm: agora,
  };
  await setDoc(doc(db, "certificadosAluno", id), dados);
  return { id, ...dados };
}

async function excluirCertificado(id){
  await deleteDoc(doc(db, "certificadosAluno", id));
}

/* Lado do aluno/responsável — mesmo padrão de carregarBoletimDoAluno:
   cache por alunoId, uma leitura só filtrando por escolaId + alunoKey. */
async function carregarCertificadosDoAluno(student, forcar = false){
  if(!student) return;
  const cache = state.certificados.cache[student.id] || (state.certificados.cache[student.id] = { registros: [], carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const chave = chaveAluno(student.escolaId, student.nome);
    const snap = await getDocs(query(collection(db, "certificadosAluno"), where("escolaId", "==", student.escolaId), where("alunoKey", "==", chave)));
    cache.registros = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.modulo || "").localeCompare(b.modulo || ""));
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
    // Duas leituras: os avisos/lembretes que o próprio professor criou, e
    // os itens da secretaria (sem aula, prova...) marcados pra ele. São
    // independentes: se uma for recusada pelo servidor, a outra ainda
    // aparece, e o aviso diz qual das duas falhou.
    const [proprios, daSecretaria] = await Promise.allSettled([
      getDocs(query(collection(db, "eventosCalendario"), where("professorId", "==", state.authUser.uid))),
      getDocs(query(collection(db, "eventosCalendario"), where("destinatariosProfessores", "array-contains", state.authUser.uid))),
    ]);
    const porId = new Map();
    if(proprios.status === "fulfilled") proprios.value.docs.forEach(d => porId.set(d.id, { id: d.id, ...d.data() }));
    if(daSecretaria.status === "fulfilled") daSecretaria.value.docs.forEach(d => porId.set(d.id, { id: d.id, ...d.data() }));
    prof.eventos = [...porId.values()];

    if(proprios.status === "rejected" && daSecretaria.status === "rejected"){
      throw proprios.reason;
    }
    if(proprios.status === "rejected"){
      prof.erro = mensagemErroCalendario(proprios.reason).replace("a leitura do calendário", "a leitura dos seus avisos e lembretes");
    } else if(daSecretaria.status === "rejected"){
      prof.erro = mensagemErroCalendario(daSecretaria.reason).replace("a leitura do calendário", "a leitura dos itens da secretaria (sem aula, provas, avisos da escola)");
    }
    prof.carregadoEm = Date.now();
  } catch(err){
    prof.erro = mensagemErroCalendario(err);
  } finally {
    prof.carregando = false;
    render();
  }
}

/* Dias de vencimento das cobranças (só pro responsável — o aluno não tem
   a aba Financeiro). Entram no calendário quando a cobrança já está
   disponível pra família (dia 01 do mês de referência). */
function vencimentosParaCalendario(student, papel){
  if(papel !== "responsavel") return [];
  return cobrancasDisponiveisDoAluno(student)
    .filter(m => /^\d{4}-\d{2}-\d{2}$/.test(m.vencimento || ""))
    .map(m => ({
      id: `venc:${student.id}:${m.id}`,
      data: m.vencimento,
      titulo: `Vencimento — ${competenciaLabel(m.competencia)}`,
      valor: formatarMoeda(m.valor),
      forma: formaPagamentoLabel(m.formaPagamento),
      aluno: (state.data.familiaAlunos || []).length > 1 ? student.nome : "",
    }));
}

function calendarioAlunoView(student, papel){
  const cal = state.cal;
  const dados = cal.cache[student.id] || { presencas: [], eventos: [], carregando: false, erro: "" };
  return calendarioHtml({
    papel,
    ano: cal.ano, mes: cal.mes,
    dias: montarDias({ presencas: dados.presencas, eventos: dados.eventos, vencimentos: vencimentosParaCalendario(student, papel), papel }),
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

/* Chave de cada aluno atualmente matriculado na escola — usada como
   "destinatarios" nos itens do calendário da secretaria, pro aluno e o
   responsável dele já enxergarem no calendário deles (mesma consulta que
   já existe em carregarCalendarioDoAluno). Alunos matriculados DEPOIS de
   um item já salvo não entram nele automaticamente — mesma limitação que
   já existe hoje pros avisos de turma do professor. */
function destinatariosDaEscola(escolaId, cursos){
  const alunos = (state.instAlunos || []).filter(a => a.escolaId === escolaId);
  // cursos ausente/null = comportamento antigo, vale pra escola inteira.
  if(!Array.isArray(cursos)){
    return [...new Set(alunos.map(a => chaveAluno(a.escolaId, a.nome)))];
  }
  // Só entra quem está em pelo menos uma turma (desta escola) de um dos
  // cursos escolhidos — turmasDoAluno já filtra por state.instTurmas,
  // que só tem turmas da escola selecionada.
  return [...new Set(
    alunos
      .filter(a => turmasDoAluno(a.nome).some(t => disciplinaCasaComCursos(t.disciplina, cursos)))
      .map(a => chaveAluno(a.escolaId, a.nome))
  )];
}

/* uid de cada professor atualmente cadastrado na escola — usado pra
   professores também enxergarem os itens da secretaria no calendário
   deles (precisa de uma leitura correspondente no lado do professor).
   cursos ausente/null = todo mundo; array = só quem dá aula em algum dos
   cursos escolhidos (campo "disciplinas" do cadastro do professor). */
function destinatariosProfessoresDaEscola(cursos){
  const professores = state.gestaoProfessores || [];
  if(!Array.isArray(cursos)) return professores.map(p => p.id).filter(Boolean);
  return professores
    .filter(p => (p.disciplinas || []).some(d => disciplinaCasaComCursos(d, cursos)))
    .map(p => p.id)
    .filter(Boolean);
}

/* Itens do calendário lançados pela SECRETARIA (sem aula, prova, atividade
   diferente…) pra toda a escola. Ao contrário do calendário do professor,
   aqui a leitura é direta por escolaId — a mesma unidade que a instituição
   já lê integralmente em outras abas (turmas, alunos, professores). */
async function carregarEventosDaInstituicao(escolaId, forcar = false){
  if(!escolaId) return;
  const cal = state.cal;
  const cache = cal.inst.cache[escolaId] || (cal.inst.cache[escolaId] = { eventos: [], carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const snaps = await getDocs(query(collection(db, "eventosCalendario"), where("escolaId", "==", escolaId), where("escopo", "==", "escola")));
    cache.eventos = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
    cache.carregadoEm = Date.now();
  } catch(err){
    cache.erro = mensagemErroCalendario(err);
  } finally {
    cache.carregando = false;
    render();
  }
}

function calendarioInstituicaoView(school){
  const escolaId = state.escolaSelecionadaId;
  const cal = state.cal;
  const cache = cal.inst.cache[escolaId] || { eventos: [], carregando: false, erro: "" };
  const cursos = cursosDaEscola(school?.nome || "");
  return calendarioHtml({
    papel: "instituicao",
    ano: cal.ano, mes: cal.mes,
    dias: montarDias({ eventos: cache.eventos, papel: "instituicao" }),
    hoje: hojeISO(),
    carregando: cache.carregando,
    erro: cache.erro,
    diaAberto: cal.diaAberto,
    podeCriar: true,
    excluirConfirmId: cal.excluirConfirmId,
    excluindoId: cal.excluindoId,
  }) + `
    <div style="margin-top:14px;">
      <button type="button" class="attendance-btn" data-action="calseed-abrir">Importar calendário da SEED</button>
    </div>` + eventoInstituicaoFormModalHtml({ form: cal.formInst, cursos }) + importarSeedModalHtml({ form: cal.seed, cursos });
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
    { key:"horarios", label:"Horários", icon:"horarios" },
    { key:"turmas", label:"Turmas", icon:"users" },
    { key:"aulas", label:"Aulas & chamada", icon:"clipboard" },
    { key:"conteudos", label:"Conteúdos", icon:"book" },
    { key:"avaliacoes", label:"Notas & atividades", icon:"cap" },
    { key:"aval", label:"Avaliações", icon:"star" },
    { key:"certificados", label:"Certificados", icon:"award" },
    { key:"perfil", label:"Meu perfil", icon:"user" },
  ];
  const body = state.professorTab === "calendario" ? calendarioProfessorView()
    : state.professorTab === "horarios" ? horarios.view()
    : state.professorTab === "turmas" ? professorTurmasView()
    : state.professorTab === "perfil" ? professorPerfilView()
    : state.professorTab === "aulas" ? professorAulasView()
    : state.professorTab === "conteudos" ? professorConteudosView()
    : state.professorTab === "aval" ? avaliacoesProfessorView()
    : state.professorTab === "certificados" ? certificadosGestaoView(state.data.professorTurmas)
    : professorAvaliacoesView();

  return shell({
    navItems, active: state.professorTab,
    headerSub: `PROFESSOR${state.data.professorDisciplinas.length ? " · " + state.data.professorDisciplinas.join(" · ").toUpperCase() : ""}`,
    headerTitle: greeting(state.data.professorNome),
    headerFoto: headerFotoHtml(fotoDoProfessor({ sexo: state.perfil?.sexo }), state.data.professorNome),
    bodyHtml: body,
    navAction: "set-professor-tab",
  }) + horarios.modais();
}


/* ---------------- PROFESSOR > TURMAS ---------------- */
function professorTurmasView(){
  const turmas = state.data.professorTurmas || [];
  if(turmas.length === 0){
    return `
      <h2 class="section-title">Minhas turmas</h2>
      <p class="section-eyebrow">Suas turmas e os alunos de cada uma.</p>
      <div class="teacher-empty-state"><strong>Nenhuma turma vinculada a você ainda.</strong><span>Fale com a secretaria para vincular suas turmas.</span></div>`;
  }
  const cards = turmas.map(t => {
    const aberta = state.professorTurmaDetalheId === t.id;
    const alunos = [...(t.alunos || [])].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
    const qtd = alunos.length;
    const detalhe = aberta ? `
      <div class="professor-turma-detalhe">
        <div class="card flush">${alunos.map(nome => `
          <div class="row"><span style="font-size:14.5px;color:var(--ink);font-weight:500;">${escapeHtml(nome)}</span></div>`).join("")
          || `<div style="padding:16px;font-size:14px;color:var(--slate);">Nenhum aluno vinculado a esta turma ainda.</div>`}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="professor-abrir-turma-em" data-tab="aulas" data-id="${escapeHtml(t.id)}">Fazer chamada</button>
          <button type="button" class="attendance-btn" data-action="professor-abrir-turma-em" data-tab="avaliacoes" data-id="${escapeHtml(t.id)}">Lançar notas</button>
        </div>
      </div>` : "";
    return `
      <div class="professor-turma-wrap">
        <button type="button" class="turma-card ${aberta ? "active" : ""}" data-action="professor-toggle-turma" data-id="${escapeHtml(t.id)}" aria-expanded="${aberta}">
          <div class="turma-card-head">
            <div>
              <div class="turma-card-nome">${escapeHtml(t.nome)}</div>
              ${t.disciplina ? `<div class="turma-card-disciplina">${escapeHtml(t.disciplina)}</div>` : ""}
            </div>
            <span class="turma-card-chevron" style="${aberta ? "transform:rotate(90deg);" : ""}">${ICONS.chevronRight}</span>
          </div>
          <div class="turma-card-meta">
            ${horarioTagsHtml(t.horario)}
            ${t.sala ? `<span class="turma-card-tag">Sala ${escapeHtml(t.sala)}</span>` : ""}
            ${t.escola ? `<span class="turma-card-tag">${ICONS.pinSmall} ${escapeHtml(t.escola)}</span>` : ""}
            <span class="turma-card-tag">${ICONS.users} ${qtd} aluno${qtd === 1 ? "" : "s"}</span>
          </div>
        </button>
        ${detalhe}
      </div>`;
  }).join("");

  return `
    <h2 class="section-title">Minhas turmas</h2>
    <p class="section-eyebrow">Toque numa turma para ver os alunos, fazer a chamada ou lançar notas.</p>
    <div class="grid-cards turma-cards-grid">${cards}</div>`;
}

/* ---------------- FICHA PESSOAL (professor e equipe) ----------------
   Guardada em usuarios/{uid}.ficha. Só a própria pessoa edita; a
   secretaria consulta em Professores > "Ver ficha". */
const FICHA_CAMPOS = ["telefone", "nascimento", "endereco", "bairro", "cidade",
  "emergenciaNome", "emergenciaParentesco", "emergenciaTelefone",
  "tipoSanguineo", "alergias", "condicoes", "observacoes"];

const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function fichaDoPerfil(perfil){
  const f = (perfil && perfil.ficha) || {};
  const out = {};
  FICHA_CAMPOS.forEach(k => { out[k] = typeof f[k] === "string" ? f[k] : ""; });
  return out;
}

function fichaFormAtual(){
  if(!state.fichaForm) state.fichaForm = fichaDoPerfil(state.perfil);
  return state.fichaForm;
}

function fichaFormCardHtml(){
  const f = fichaFormAtual();
  const bloqueado = state.fichaSalvando ? "disabled" : "";
  const input = (k, label, placeholder, tipo) => `
    <div class="ficha-campo">
      <label class="teacher-label" for="ficha-${k}">${label}</label>
      <input id="ficha-${k}" type="${tipo || "text"}" class="teacher-text-input" data-ficha="${k}" maxlength="120" placeholder="${escapeHtml(placeholder || "")}" value="${escapeHtml(f[k] || "")}" ${bloqueado} />
    </div>`;
  const area = (k, label, placeholder) => `
    <div class="ficha-campo ficha-campo-cheio">
      <label class="teacher-label" for="ficha-${k}">${label}</label>
      <textarea id="ficha-${k}" class="teacher-text-input ficha-textarea" data-ficha="${k}" maxlength="500" rows="2" placeholder="${escapeHtml(placeholder || "")}" ${bloqueado}>${escapeHtml(f[k] || "")}</textarea>
    </div>`;

  return `
    <div class="management-card management-card-wide">
      <h3>${ICONS.shield} Minha ficha</h3>
      <p>Informações para a escola te ajudar numa emergência e cuidar de você. A secretaria consegue ver estes dados; os outros perfis não.</p>

      <h4 class="ficha-secao">Dados pessoais</h4>
      <div class="ficha-grid">
        ${input("telefone", "Meu telefone / WhatsApp", "(46) 99999-9999", "tel")}
        ${input("nascimento", "Data de aniversário", "", "date")}
      </div>

      <h4 class="ficha-secao">Localização</h4>
      <div class="ficha-grid">
        <div class="ficha-campo-cheio">${input("endereco", "Endereço (rua e número)", "Rua das Flores, 123")}</div>
        ${input("bairro", "Bairro", "")}
        ${input("cidade", "Cidade", "Salto do Lontra")}
      </div>

      <h4 class="ficha-secao">Contato de emergência</h4>
      <div class="ficha-grid">
        ${input("emergenciaNome", "Nome", "Quem devemos chamar")}
        ${input("emergenciaParentesco", "Parentesco", "Ex.: esposo, mãe, irmã")}
        ${input("emergenciaTelefone", "Telefone", "(46) 99999-9999", "tel")}
      </div>

      <h4 class="ficha-secao">Saúde</h4>
      <div class="ficha-grid">
        <div class="ficha-campo">
          <label class="teacher-label" for="ficha-tipoSanguineo">Tipo sanguíneo</label>
          <select id="ficha-tipoSanguineo" class="teacher-text-input" data-ficha="tipoSanguineo" ${bloqueado}>
            <option value="" ${!f.tipoSanguineo ? "selected" : ""}>Não informar</option>
            ${TIPOS_SANGUINEOS.map(t => `<option value="${t}" ${f.tipoSanguineo === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        ${area("alergias", "Alergias", "Medicamentos, alimentos, picadas… ou escreva “nenhuma”")}
        ${area("condicoes", "Condições de saúde e medicamentos de uso contínuo", "Ex.: diabetes, hipertensão, asma")}
        ${area("observacoes", "Outras observações", "Algo mais que a escola deva saber")}
      </div>

      <button class="teacher-primary-btn" data-action="salvar-minha-ficha" ${bloqueado}>${state.fichaSalvando ? "Salvando…" : "Salvar minha ficha"}</button>
      ${state.fichaErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.fichaErro)}</p>` : ""}
      ${state.fichaMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.fichaMensagem)}</p>` : ""}
    </div>`;
}

async function salvarMinhaFicha(){
  const f = fichaFormAtual();
  const limpa = {};
  FICHA_CAMPOS.forEach(k => { limpa[k] = String(f[k] || "").trim().slice(0, 500); });
  state.fichaErro = "";
  state.fichaMensagem = "";
  if(limpa.nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(limpa.nascimento)){
    state.fichaErro = "Confira a data de aniversário.";
    render();
    return;
  }
  const comEmergencia = limpa.emergenciaNome || limpa.emergenciaParentesco;
  if(comEmergencia && !limpa.emergenciaTelefone){
    state.fichaErro = "Informe também o telefone do contato de emergência.";
    render();
    return;
  }
  state.fichaSalvando = true;
  render();
  try {
    const ficha = { ...limpa, atualizadaEm: new Date().toISOString() };
    await updateDoc(doc(db, "usuarios", state.authUser.uid), { ficha });
    state.perfil = { ...state.perfil, ficha };
    state.fichaForm = null;
    state.fichaMensagem = "Ficha salva. A secretaria já consegue ver.";
  } catch(err){
    console.error("Erro ao salvar ficha:", err?.code, err);
    state.fichaErro = err?.code === "permission-denied"
      ? "Sem permissão para salvar a ficha. Avise o suporte (as regras do Firestore precisam liberar o campo “ficha”)."
      : "Não foi possível salvar agora. Tente de novo.";
  } finally {
    state.fichaSalvando = false;
    render();
  }
}

/* Secretaria: lê a ficha de outra pessoa (só leitura). */
async function abrirFichaUsuario(uid, nome){
  state.fichaModalAberto = true;
  state.fichaModalNome = nome || "";
  const prof = (state.gestaoProfessores || []).find(p => p.id === uid);
  state.fichaModalEmail = prof?.email || "";
  state.fichaModalDisciplinas = prof?.disciplinas || [];
  state.fichaModalDados = null;
  state.fichaModalErro = "";
  state.fichaModalCarregando = true;
  render();
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    if(!snap.exists()){
      state.fichaModalErro = "Este professor ainda não tem login/cadastro de perfil, então não há ficha.";
    } else {
      state.fichaModalDados = fichaDoPerfil(snap.data());
      state.fichaModalDados.atualizadaEm = (snap.data().ficha && snap.data().ficha.atualizadaEm) || "";
    }
  } catch(err){
    console.error("Erro ao ler ficha:", err?.code, err);
    state.fichaModalErro = err?.code === "permission-denied"
      ? "Sem permissão para ler a ficha desta pessoa (regras do Firestore)."
      : "Não foi possível carregar a ficha agora.";
  } finally {
    state.fichaModalCarregando = false;
    render();
  }
}

function fichaModoLeituraHtml(f, op){
  op = op || {};
  const vazio = `<span style="color:var(--slate);font-weight:400;">não informado</span>`;
  const tel = (n) => n ? `<a href="tel:${encodeURIComponent(n)}" style="color:var(--ink);">${escapeHtml(n)}</a>` : vazio;
  const txt = (v) => v ? escapeHtml(v) : vazio;
  const local = [f.endereco, f.bairro, f.cidade].filter(Boolean).join(" · ");
  const emergencia = f.emergenciaNome || f.emergenciaTelefone
    ? `${escapeHtml(f.emergenciaNome || "—")}${f.emergenciaParentesco ? ` (${escapeHtml(f.emergenciaParentesco)})` : ""}`
    : "";
  const whats = telefoneValido(f.emergenciaTelefone)
    ? ` <a class="aniversario-btn" style="margin-left:6px;" href="${whatsappLink(telefoneValido(f.emergenciaTelefone))}" target="_blank" rel="noopener">WhatsApp</a>` : "";
  return `
    <dl class="perfil-dados ficha-leitura">
      ${op.recreacao ? "" : `<div><dt>Telefone</dt><dd>${tel(f.telefone)}</dd></div>`}
      <div><dt>Aniversário</dt><dd>${f.nascimento ? formatarDataBr(f.nascimento) : vazio}</dd></div>
      <div><dt>Localização</dt><dd>${txt(local)}</dd></div>
      <div><dt>Contato de emergência</dt><dd>${emergencia ? emergencia : vazio}</dd></div>
      <div><dt>Telefone de emergência</dt><dd>${tel(f.emergenciaTelefone)}${whats}</dd></div>
      ${op.recreacao ? "" : `<div><dt>Tipo sanguíneo</dt><dd>${txt(f.tipoSanguineo)}</dd></div>`}
      <div><dt>Alergias</dt><dd>${txt(f.alergias)}</dd></div>
      <div><dt>${op.recreacao ? "Medicações" : "Condições / medicamentos"}</dt><dd>${txt(f.condicoes)}</dd></div>
      <div><dt>Observações</dt><dd>${txt(f.observacoes)}</dd></div>
    </dl>`;
}

function fichaUsuarioModal(){
  if(!state.fichaModalAberto) return "";
  let corpo;
  if(state.fichaModalCarregando) corpo = `<p class="section-eyebrow" style="margin:6px 0;">Carregando ficha…</p>`;
  else if(state.fichaModalErro) corpo = `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:13px;">${escapeHtml(state.fichaModalErro)}</p>`;
  else if(state.fichaModalDados){
    const d = state.fichaModalDados;
    const vazia = FICHA_CAMPOS.every(k => !d[k]);
    corpo = vazia
      ? `<div class="teacher-empty-state"><strong>Ficha ainda não preenchida.</strong><span>O professor preenche em “Meu perfil”.</span></div>`
      : fichaModoLeituraHtml(d) + (d.atualizadaEm ? `<p class="section-eyebrow" style="margin-top:12px;">Atualizada em ${formatarDataBr(d.atualizadaEm.slice(0, 10))}</p>` : "");
  } else corpo = "";
  return `
  <div class="aluno-modal-backdrop" data-action="fechar-ficha-usuario">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Ficha do professor" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>${escapeHtml(state.fichaModalNome)}</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(state.fichaModalDisciplinas.join(" · ") || "Professor(a)")}${state.fichaModalEmail ? ` · ${escapeHtml(state.fichaModalEmail)}` : ""}</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-ficha-usuario" aria-label="Fechar">${ICONS.close}</button>
      </div>
      <div class="aluno-modal-section">${corpo}</div>
    </div>
  </div>`;
}

/* ---------------- FICHA DO ALUNO ----------------
   Guardada em alunos/{id}.ficha (mesmos campos da ficha de professor/equipe,
   mais preenchidaPor e ciencia). Fica no documento do aluno — e não em
   usuarios/ — porque o aluno da Recreação não tem login.

   Quem preenche:
     · Recreação ............ só o responsável (sem tipo sanguíneo; só alergias e medicações)
     · 18 anos ou mais ...... o próprio aluno (o responsável só enxerga)
     · menor de 18 .......... o aluno pode preencher e o responsável também; quando o
                              aluno salva, fica "aguardando ciência" até o responsável
                              revisar e confirmar. Sem data de nascimento = tratado como menor.
   A idade vem do cadastro (aluno.nascimento); se a secretaria ainda não
   preencheu, usa a data que a pessoa informou na própria ficha. */
function idadeEmAnos(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  const [a, m, d] = iso.split("-").map(Number);
  const h = new Date(dataDeHojeISO() + "T00:00:00");
  let idade = h.getFullYear() - a;
  if(h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) idade--;
  return idade;
}

function alunoFichaInfo(aluno){
  const recreacao = ehTurmaDeRecreacao(aluno.turma);
  const nascimento = aluno.nascimento || (aluno.ficha && aluno.ficha.nascimento) || "";
  const idade = idadeEmAnos(nascimento);
  const maior = !recreacao && idade !== null && idade >= 18;
  return { recreacao, idade, maior, nascimentoNoCadastro: !!aluno.nascimento };
}

function alunoFichaPreenchida(aluno){
  const f = aluno.ficha;
  return !!f && FICHA_CAMPOS.some(k => typeof f[k] === "string" && f[k].trim());
}

/* Situação da ficha, pra mostrar na família, no aluno e na secretaria. */
function alunoFichaStatus(aluno){
  const info = alunoFichaInfo(aluno);
  const f = aluno.ficha;
  if(!alunoFichaPreenchida(aluno)){
    return { tom: "pendente", texto: info.recreacao ? "Aguardando o responsável preencher"
      : info.maior ? "Aguardando o aluno preencher" : "Ainda não preenchida" };
  }
  if(!info.recreacao && !info.maior && !(f.ciencia && f.ciencia.em)){
    return { tom: "pendente", texto: "Preenchida pelo aluno — aguardando a ciência do responsável" };
  }
  const por = f.preenchidaPor === "responsavel" ? "pelo responsável" : "pelo aluno";
  const quando = f.atualizadaEm ? ` em ${formatarDataBr(f.atualizadaEm.slice(0, 10))}` : "";
  const ciente = (!info.recreacao && !info.maior && f.ciencia && f.ciencia.nome) ? ` · responsável ciente: ${f.ciencia.nome}` : "";
  return { tom: "ok", texto: `Preenchida ${por}${quando}${ciente}` };
}

function alunoFichaEstado(aluno){
  const est = state.alunoFicha;
  if(est.alunoId !== aluno.id){
    est.alunoId = aluno.id;
    est.form = null; est.salvando = false; est.erro = ""; est.mensagem = "";
  }
  if(!est.form){
    est.form = {};
    const f = aluno.ficha || {};
    FICHA_CAMPOS.forEach(k => { est.form[k] = typeof f[k] === "string" ? f[k] : ""; });
    if(!est.form.nascimento) est.form.nascimento = aluno.nascimento || "";
  }
  return est;
}

function alunoFichaView(aluno, quem){
  const info = alunoFichaInfo(aluno);
  const est = alunoFichaEstado(aluno);
  const f = est.form;
  const status = alunoFichaStatus(aluno);
  const primeiro = (aluno.nome || "").split(" ")[0] || "o aluno";
  const podeEditar = quem === "responsavel" ? (info.recreacao || !info.maior) : !info.recreacao;
  const bloqueado = est.salvando ? "disabled" : "";

  const titulo = quem === "aluno" ? "Minha ficha" : `Ficha de ${escapeHtml(primeiro)}`;
  let intro;
  if(quem === "responsavel" && info.recreacao){
    intro = `${escapeHtml(primeiro)} não tem login próprio na Recreação, então quem preenche é você. Só pedimos o essencial para cuidar bem dele(a): contato de emergência, alergias e medicações.`;
  } else if(quem === "responsavel" && info.maior){
    intro = `${escapeHtml(primeiro)} é maior de idade e preenche a própria ficha. Você pode apenas consultar.`;
  } else if(quem === "responsavel"){
    intro = `${escapeHtml(primeiro)} pode preencher a ficha, mas você precisa acompanhar: revise os dados e confirme em “Li e estou ciente”. Você também pode corrigir qualquer campo.`;
  } else if(info.maior){
    intro = "Informações para a escola te ajudar numa emergência e cuidar de você. A secretaria consegue ver estes dados.";
  } else {
    intro = "Você pode preencher a sua ficha, mas seu responsável precisa acompanhar e confirmar. Depois de salvar, avise ele(a) para olhar a aba de ficha.";
  }

  const cabecalho = `
    <h3>${ICONS.shield} ${titulo}</h3>
    <p>${intro}</p>
    <p class="section-eyebrow" style="margin:0 0 4px;"><strong style="color:${status.tom === "ok" ? "var(--green,#2E7D5B)" : "var(--gold,#B7791F)"};">${escapeHtml(status.texto)}</strong></p>`;

  // Somente leitura (responsável de aluno maior de idade)
  if(!podeEditar){
    return `
      <div class="management-card management-card-wide">
        ${cabecalho}
        ${alunoFichaPreenchida(aluno) ? fichaModoLeituraHtml(aluno.ficha, { recreacao: info.recreacao }) : ""}
      </div>`;
  }

  const input = (k, label, placeholder, tipo) => `
    <div class="ficha-campo">
      <label class="teacher-label" for="ficha-aluno-${k}">${label}</label>
      <input id="ficha-aluno-${k}" type="${tipo || "text"}" class="teacher-text-input" data-ficha-aluno="${k}" maxlength="120" placeholder="${escapeHtml(placeholder || "")}" value="${escapeHtml(f[k] || "")}" ${bloqueado} />
    </div>`;
  const area = (k, label, placeholder) => `
    <div class="ficha-campo ficha-campo-cheio">
      <label class="teacher-label" for="ficha-aluno-${k}">${label}</label>
      <textarea id="ficha-aluno-${k}" class="teacher-text-input ficha-textarea" data-ficha-aluno="${k}" maxlength="500" rows="2" placeholder="${escapeHtml(placeholder || "")}" ${bloqueado}>${escapeHtml(f[k] || "")}</textarea>
    </div>`;

  const dadosPessoais = [
    info.recreacao ? "" : input("telefone", quem === "aluno" ? "Meu telefone / WhatsApp" : "Telefone / WhatsApp do aluno", "(46) 99999-9999", "tel"),
    info.nascimentoNoCadastro ? "" : input("nascimento", "Data de nascimento", "", "date"),
  ].filter(Boolean).join("");

  const saude = info.recreacao
    ? `${area("alergias", "Alergias", "Alimentos, remédios, picadas… ou escreva “nenhuma”")}
       ${area("condicoes", "Medicações", "Remédios de uso contínuo ou que precisem ser dados na escola — ou escreva “nenhuma”")}
       ${area("observacoes", "Outras observações", "Algo mais que a escola deva saber")}`
    : `<div class="ficha-campo">
         <label class="teacher-label" for="ficha-aluno-tipoSanguineo">Tipo sanguíneo</label>
         <select id="ficha-aluno-tipoSanguineo" class="teacher-text-input" data-ficha-aluno="tipoSanguineo" ${bloqueado}>
           <option value="" ${!f.tipoSanguineo ? "selected" : ""}>Não informar</option>
           ${TIPOS_SANGUINEOS.map(t => `<option value="${t}" ${f.tipoSanguineo === t ? "selected" : ""}>${t}</option>`).join("")}
         </select>
       </div>
       ${area("alergias", "Alergias", "Medicamentos, alimentos, picadas… ou escreva “nenhuma”")}
       ${area("condicoes", "Condições de saúde e medicamentos de uso contínuo", "Ex.: asma, diabetes")}
       ${area("observacoes", "Outras observações", "Algo mais que a escola deva saber")}`;

  const precisaCiencia = quem === "responsavel" && !info.recreacao && !info.maior
    && alunoFichaPreenchida(aluno) && !(aluno.ficha.ciencia && aluno.ficha.ciencia.em);

  return `
    <div class="management-card management-card-wide">
      ${cabecalho}
      ${dadosPessoais ? `<h4 class="ficha-secao">Dados pessoais</h4><div class="ficha-grid">${dadosPessoais}</div>` : ""}

      <h4 class="ficha-secao">Localização</h4>
      <div class="ficha-grid">
        <div class="ficha-campo-cheio">${input("endereco", "Endereço (rua e número)", "Rua das Flores, 123")}</div>
        ${input("bairro", "Bairro", "")}
        ${input("cidade", "Cidade", "Salto do Lontra")}
      </div>

      <h4 class="ficha-secao">Contato de emergência</h4>
      <div class="ficha-grid">
        ${input("emergenciaNome", "Nome", "Quem devemos chamar")}
        ${input("emergenciaParentesco", "Parentesco", "Ex.: mãe, pai, avó")}
        ${input("emergenciaTelefone", "Telefone", "(46) 99999-9999", "tel")}
      </div>

      <h4 class="ficha-secao">Saúde</h4>
      <div class="ficha-grid">${saude}</div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px;">
        <button class="teacher-primary-btn" data-action="salvar-ficha-aluno" data-quem="${quem}" ${bloqueado}>${est.salvando ? "Salvando…" : (quem === "aluno" ? "Salvar minha ficha" : "Salvar ficha")}</button>
        ${precisaCiencia ? `<button class="btn-secondary" data-action="ciente-ficha-aluno" ${bloqueado}>${ICONS.shield} Li e estou ciente</button>` : ""}
      </div>
      ${est.erro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(est.erro)}</p>` : ""}
      ${est.mensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(est.mensagem)}</p>` : ""}
    </div>`;
}

function mensagemErroFichaAluno(err){
  return err?.code === "permission-denied"
    ? "Sem permissão para salvar a ficha. Avise a secretaria (as regras do Firestore precisam liberar o campo “ficha” do aluno)."
    : "Não foi possível salvar agora. Tente de novo.";
}

async function salvarFichaDoAluno(aluno, quem){
  const est = alunoFichaEstado(aluno);
  const info = alunoFichaInfo(aluno);
  const limpa = {};
  FICHA_CAMPOS.forEach(k => { limpa[k] = String(est.form[k] || "").trim().slice(0, 500); });
  if(info.recreacao){ limpa.tipoSanguineo = ""; limpa.telefone = ""; }
  est.erro = ""; est.mensagem = "";
  if(limpa.nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(limpa.nascimento)){
    est.erro = "Confira a data de nascimento.";
    render(); return;
  }
  if((limpa.emergenciaNome || limpa.emergenciaParentesco) && !limpa.emergenciaTelefone){
    est.erro = "Informe também o telefone do contato de emergência.";
    render(); return;
  }
  est.salvando = true;
  render();
  try {
    const agora = new Date().toISOString();
    const ficha = {
      ...limpa,
      preenchidaPor: quem === "responsavel" ? "responsavel" : "aluno",
      atualizadaEm: agora,
      // responsável salvando já conta como ciente; se foi o aluno menor, volta a aguardar
      ciencia: quem === "responsavel" ? { nome: state.perfil?.nome || "Responsável", em: agora } : null,
    };
    await updateDoc(doc(db, "alunos", aluno.id), { ficha });
    aluno.ficha = ficha;
    est.form = null;
    est.mensagem = quem === "aluno" && !info.maior
      ? "Ficha salva. Agora peça para o seu responsável olhar e confirmar."
      : "Ficha salva. A secretaria já consegue ver.";
  } catch(err){
    console.error("Erro ao salvar ficha do aluno:", err?.code, err);
    est.erro = mensagemErroFichaAluno(err);
  } finally {
    est.salvando = false;
    render();
  }
}

/* Responsável confirma que acompanhou a ficha que o aluno menor preencheu. */
async function darCienciaFichaDoAluno(aluno){
  const est = alunoFichaEstado(aluno);
  est.erro = ""; est.mensagem = "";
  est.salvando = true;
  render();
  try {
    const ciencia = { nome: state.perfil?.nome || "Responsável", em: new Date().toISOString() };
    await updateDoc(doc(db, "alunos", aluno.id), { "ficha.ciencia": ciencia });
    aluno.ficha = { ...(aluno.ficha || {}), ciencia };
    est.mensagem = "Obrigado! Ciência registrada.";
  } catch(err){
    console.error("Erro ao registrar ciência da ficha:", err?.code, err);
    est.erro = mensagemErroFichaAluno(err);
  } finally {
    est.salvando = false;
    render();
  }
}

/* Secretaria: bloco só de leitura dentro do modal do aluno. */
function alunoFichaSecretariaHtml(aluno){
  const info = alunoFichaInfo(aluno);
  const status = alunoFichaStatus(aluno);
  return `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Ficha de saúde e emergência</h3>
        <p class="section-eyebrow" style="margin:0 0 8px;"><strong style="color:${status.tom === "ok" ? "var(--green,#2E7D5B)" : "var(--gold,#B7791F)"};">${escapeHtml(status.texto)}</strong></p>
        ${alunoFichaPreenchida(aluno)
          ? fichaModoLeituraHtml(aluno.ficha, { recreacao: info.recreacao })
          : `<p class="section-eyebrow" style="margin:6px 0;">${info.recreacao ? "O responsável preenche em “Ficha”, no acesso dele." : info.maior ? "O aluno preenche em “Minha ficha”." : "O aluno ou o responsável preenche no acesso da família."}</p>`}
      </div>`;
}

/* ---------------- PROFESSOR > MEU PERFIL ---------------- */
function professorPerfilView(){
  const nome = (state.data.professorNome || state.perfil?.nome || "").trim();
  const email = state.authUser?.email || "—";
  const disciplinas = state.data.professorDisciplinas || [];
  const unidades = [...new Set((state.data.professorTurmas || []).map(t => t.escola).filter(Boolean))];
  const abasProf = [
    { key: "dados", label: "Meus dados", icon: ICONS.user },
    { key: "senha", label: "Trocar minha senha", icon: ICONS.key },
    { key: "ficha", label: "Minha ficha", icon: ICONS.shield },
    { key: "manuais", label: "Manuais e materiais", icon: ICONS.book },
  ];
  const ativaProf = perfilSubTabAtiva(abasProf);
  const manuaisProf = MANUAIS_INSTITUICAO.filter(m => m.professor);
  const manuaisProfProntos = manuaisProf.filter(m => m.url && m.url !== "#").length;
  const chips = [...disciplinas.map(d => `<span class="perfil-chip">${ICONS.book} ${escapeHtml(d)}</span>`),
                 ...unidades.map(u => `<span class="perfil-chip">${ICONS.pinSmall} ${escapeHtml(u)}</span>`)].join("");

  return `
    <h2 class="section-title">Meu perfil</h2>
    <p class="section-eyebrow">Seus dados de acesso, a ficha que a secretaria usa em caso de emergência e os manuais de apoio.</p>

    <section class="perfil-hero">
      <div class="perfil-hero-foto">${avatarHtml(fotoDoProfessor({ sexo: state.perfil?.sexo }), iniciaisDoNome(nome || "Professor"), "avatar-foto-perfil")}</div>
      <div class="perfil-hero-info">
        <span class="perfil-hero-badge">Professor(a)</span>
        <h2>${escapeHtml(nome || "Professor(a)")}</h2>
        <p>${escapeHtml(email)}</p>
        <div class="perfil-chips">${chips}</div>
      </div>
    </section>

    ${perfilSubNavHtml(abasProf)}
    ${ativaProf === "dados" ? `
      <div class="management-card management-card-wide">
        <h3>${ICONS.user} Meus dados</h3>
        <p>Nome e disciplinas são cadastrados pela secretaria. Se algo estiver errado, avise por lá.</p>
        <dl class="perfil-dados">
          <div><dt>Nome</dt><dd>${escapeHtml(nome || "—")}</dd></div>
          <div><dt>E-mail de acesso</dt><dd>${escapeHtml(email)}</dd></div>
          <div><dt>Disciplinas</dt><dd>${escapeHtml(disciplinas.join(", ") || "—")}</dd></div>
        </dl>
      </div>`
    : ativaProf === "senha" ? perfilSenhaCardHtml("Esqueceu a senha atual? Peça para a secretaria definir uma nova.")
    : ativaProf === "manuais" ? `
      <div class="manuais-cabecalho">
        <h2 class="section-title">Manuais e materiais de apoio</h2>
        <span class="manuais-progresso">${manuaisProfProntos} de ${manuaisProf.length} prontos</span>
      </div>
      <p class="section-eyebrow">Toque em um assunto para ver os guias. Os marcados como "Em breve" ainda serão produzidos.</p>
      ${manuaisAgrupadosHtml("professor")}`
    : fichaFormCardHtml()}`;
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

  const bimestre = state.professorAvaliacaoBimestre === 2 ? 2 : 1;
  const todas = state.professorAtividadesTodas || [];
  const atividadesEtapa = todas.filter(a => Number(a.bimestre) === bimestre).sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const editando = atividadesEtapa.find(a => a.id === state.professorAtividadeEditandoId) || null;

  const rows = turma.alunos.map(aluno => {
    const key = `${turma.id}-${aluno}`;
    const valor = state.professorNotas[key] ?? "";
    return `<div class="grade-row"><strong>${escapeHtml(aluno)}</strong><input class="grade-input" data-grade="${escapeHtml(key)}" type="number" min="0" max="10" step="0.1" value="${escapeHtml(valor)}" placeholder="Nota" /></div>`;
  }).join("");

  const listaAtividades = atividadesEtapa.length ? `
    <h3 style="margin-top:22px;">Atividades lançadas nesta etapa (${atividadesEtapa.length})</h3>
    <div class="card flush">
      ${atividadesEtapa.map(a => `
        <div class="row">
          <div>
            <strong style="display:block;font-size:14px;color:var(--ink);">${escapeHtml(a.nome)}</strong>
            <span style="font-size:12px;color:var(--slate);">${escapeHtml(a.data || "")} · ${Object.keys(a.notas || {}).length} nota(s) lançada(s)</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" class="attendance-btn" data-action="editar-atividade" data-id="${escapeHtml(a.id)}">Editar</button>
            <button type="button" class="attendance-btn" data-action="excluir-atividade" data-id="${escapeHtml(a.id)}" ${state.professorAtividadeExcluindoId === a.id ? "disabled" : ""}>${state.professorAtividadeExcluindoId === a.id ? "Excluindo…" : (state.professorAtividadeExcluirConfirmId === a.id ? "Confirmar exclusão?" : `${ICONS.trash} Excluir`)}</button>
          </div>
        </div>`).join("")}
    </div>` : "";

  const resumo = professorResumoMediasHtml(turma, todas);

  return `
    <h2 class="section-title">Notas e atividades</h2>
    <p class="section-eyebrow">Lance atividades e notas — o boletim do aluno é montado automaticamente a partir delas.</p>
    ${professorTurmaSelect()}
    <div class="teacher-class-list" style="grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 360px;">
      <button type="button" class="teacher-class-card ${bimestre === 1 ? "active" : ""}" data-action="set-bimestre" data-bimestre="1"><strong>1º bimestre</strong></button>
      <button type="button" class="teacher-class-card ${bimestre === 2 ? "active" : ""}" data-action="set-bimestre" data-bimestre="2"><strong>2º bimestre</strong></button>
    </div>
    <div class="teacher-panel">
      <div class="teacher-panel-head"><div><h2>${escapeHtml(turma.nome)}</h2><p>${escapeHtml(turma.escola)} · ${escapeHtml(turma.disciplina)}</p></div></div>
      ${editando ? `<p class="section-eyebrow" style="color:var(--gold-deep);">Editando "${escapeHtml(editando.nome)}" — salvar vai substituir as notas já lançadas para essa atividade.</p>` : ""}
      <label class="teacher-label" for="activity-name">Atividade ou avaliação</label>
      <input id="activity-name" class="teacher-text-input" placeholder="Ex.: Lista de exercícios — Frações" value="${escapeHtml(state.professorAtividadeNome || "")}" ${state.professorNotasSalvando ? "disabled" : ""} />
      <div class="grade-list">${rows}</div>
      <button class="teacher-primary-btn" data-action="save-grades" ${state.professorNotasSalvando ? "disabled" : ""}>${state.professorNotasSalvando ? "Salvando…" : (editando ? "Salvar alterações" : "Salvar notas da atividade")}</button>
      ${editando ? `<button type="button" class="attendance-btn" style="margin-top:10px;" data-action="cancelar-edicao-atividade">Cancelar edição e lançar nova atividade</button>` : ""}
      ${state.professorNotasErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.professorNotasErro)}</p>` : ""}
      ${state.professorNotasSalvas ? `<p class="teacher-success">Notas salvas — já aparecem no boletim do aluno e do responsável.</p>` : ""}
    </div>
    ${state.professorAtividadesErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:12px;">${escapeHtml(state.professorAtividadesErro)}</p>` : ""}
    ${state.professorAtividadesCarregando ? `<p class="section-eyebrow" style="margin-top:12px;">Carregando notas já lançadas…</p>` : listaAtividades}
    ${resumo}`;
}

/* ---------------- Certificados (lado de quem anexa: secretaria/professor) ----------------
   Compartilhada pelas abas "Certificados" da instituição e do professor —
   só muda a lista de turmas que cada uma passa (state.instTurmas ou
   state.data.professorTurmas). Recreação fica de fora: não tem módulo. */
function certificadosGestaoView(turmasDisponiveis){
  const turmas = (turmasDisponiveis || []).filter(t => !ehTurmaDeRecreacao(t.disciplina || t.nome));
  const intro = `
    <h2 class="section-title">Certificados</h2>
    <p class="section-eyebrow">Ao fim de cada módulo, anexe aqui o certificado do aluno — hoje, como um link do Drive. A Recreação não entra: não tem módulo pra certificar.</p>`;

  if(turmas.length === 0){
    return `${intro}<p class="section-eyebrow">Nenhuma turma disponível ainda.</p>`;
  }

  const turmaAtual = turmas.find(t => t.id === state.certTurmaId) || null;

  const seletor = `<div class="teacher-class-list">${turmas.map(t => `
    <button class="teacher-class-card ${turmaAtual && t.id === turmaAtual.id ? "active" : ""}" data-action="set-cert-turma" data-id="${t.id}">
      <span>${escapeHtml(t.disciplina || "")}</span><strong>${escapeHtml(t.nome)}</strong><small>${escapeHtml(t.escola || "")} · ${escapeHtml(t.horario || "")}</small>
    </button>`).join("")}</div>`;

  if(!turmaAtual){
    return `${intro}${seletor}`;
  }

  if(state.certCarregando && state.certListaTurmaId !== turmaAtual.id){
    return `${intro}${seletor}<p class="section-eyebrow" style="margin-top:16px;">Carregando certificados desta turma…</p>`;
  }

  const certsDaTurma = state.certListaTurmaId === turmaAtual.id ? (state.certLista || []) : [];
  const alunos = turmaAtual.alunos || [];
  const linhasAlunos = alunos.length
    ? alunos.map(alunoNome => certificadoAlunoRowHtml(alunoNome, certsDaTurma.filter(c => c.alunoNome === alunoNome))).join("")
    : `<div style="padding:20px;font-size:14px;color:var(--slate);">Esta turma ainda não tem alunos.</div>`;

  return `
    ${intro}
    ${seletor}
    <div class="teacher-panel" style="margin-top:16px;">
      <div class="teacher-panel-head"><div><h2>${escapeHtml(turmaAtual.nome)}</h2><p>${escapeHtml(turmaAtual.escola || "")} · ${escapeHtml(turmaAtual.disciplina || "")}</p></div></div>
      ${state.certErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-bottom:8px;">${escapeHtml(state.certErro)}</p>` : ""}
      <div class="card flush">${linhasAlunos}</div>
    </div>`;
}

/* Uma linha por aluno: os certificados já anexados (cada um vira um link
   pro Drive) e, quando o formulário está aberto pra esse aluno, os campos
   pra anexar mais um módulo. */
function certificadoAlunoRowHtml(alunoNome, certs){
  const formAberto = state.certFormAlunoNome === alunoNome;

  const chips = certs.length
    ? certs.map(c => `<span class="pill pill-green" style="margin:2px 6px 2px 0;"><a href="${escapeHtml(c.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${ICONS.award} ${escapeHtml(c.modulo)}</a></span>`).join("")
    : `<span style="font-size:12.5px;color:var(--slate);">Nenhum certificado anexado</span>`;

  const excluirBtns = certs.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${certs.map(c => `
    <button type="button" class="attendance-btn" data-action="excluir-certificado" data-id="${escapeHtml(c.id)}" ${state.certExcluindoId === c.id ? "disabled" : ""}>
      ${state.certExcluindoId === c.id ? "Excluindo…" : (state.certExcluirConfirmId === c.id ? `Excluir "${escapeHtml(c.modulo)}"?` : `${ICONS.trash} Excluir "${escapeHtml(c.modulo)}"`)}
    </button>`).join("")}</div>` : "";

  const form = formAberto ? `
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div style="flex:1;min-width:140px;">
        <label class="teacher-label" for="cert-form-modulo">Módulo</label>
        <input id="cert-form-modulo" class="teacher-text-input" value="${escapeHtml(state.certFormModulo)}" placeholder="Ex.: Módulo 1" ${state.certSalvando ? "disabled" : ""} />
      </div>
      <div style="flex:2;min-width:220px;">
        <label class="teacher-label" for="cert-form-link">Link do Drive</label>
        <input id="cert-form-link" class="teacher-text-input" value="${escapeHtml(state.certFormLink)}" placeholder="https://drive.google.com/…" ${state.certSalvando ? "disabled" : ""} />
      </div>
      <button type="button" class="teacher-primary-btn" data-action="salvar-certificado" data-aluno="${escapeHtml(alunoNome)}" ${state.certSalvando ? "disabled" : ""}>${state.certSalvando ? "Salvando…" : "Salvar"}</button>
      <button type="button" class="attendance-btn" data-action="cancelar-certificado-form" ${state.certSalvando ? "disabled" : ""}>Cancelar</button>
    </div>
    ${state.certFormErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:6px;">${escapeHtml(state.certFormErro)}</p>` : ""}` : "";

  return `
    <div class="row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <strong style="font-size:14px;color:var(--ink);">${escapeHtml(alunoNome)}</strong>
        <button type="button" class="attendance-btn" data-action="${formAberto ? "cancelar-certificado-form" : "abrir-certificado-form"}" data-aluno="${escapeHtml(alunoNome)}">${formAberto ? "Fechar" : "+ Certificado"}</button>
      </div>
      <div>${chips}</div>
      ${excluirBtns}
      ${form}
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
    { key:"calendario", label:"Calendário", icon:"calendar" },
    { key:"horarios", label:"Horários", icon:"horarios" },
    { key:"estatisticas", label:"Estatísticas", icon:"chart" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"alunos", label:"Alunos", icon:"users" },
    { key:"aniversarios", label:"Aniversários", icon:"cake" },
    { key:"professores", label:"Professores", icon:"users2" },
    { key:"responsaveis", label:"Responsáveis", icon:"users2" },
    { key:"contratos", label:"Contratos", icon:"fileText" },
    { key:"aval", label:"Avaliações", icon:"star" },
    { key:"certificados", label:"Certificados", icon:"award" },
    { key:"gestao", label:"Gestão", icon:"building" },
    { key:"perfil", label:"Meu perfil", icon:"user" },
  ];

  let body = "";
  if(state.instTab === "turmas") body = turmasView(school);
  else if(state.instTab === "calendario") body = calendarioInstituicaoView(school);
  else if(state.instTab === "horarios") body = horarios.view();
  else if(state.instTab === "estatisticas") body = estatisticasView(school);
  else if(state.instTab === "financeiro") body = financeiroInstituicaoView(school);
  else if(state.instTab === "alunos") body = alunosView(school);
  else if(state.instTab === "aniversarios") body = aniversariosView(school);
  else if(state.instTab === "professores") body = professoresView(school);
  else if(state.instTab === "responsaveis") body = responsaveisView(school);
  else if(state.instTab === "contratos") body = contratosView(school);
  else if(state.instTab === "aval") body = avaliacoesInstituicaoView(school);
  else if(state.instTab === "certificados") body = certificadosGestaoView(state.instTurmas || []);
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
    headerFoto: headerFotoHtml(fotoSecretariaDaEscola(school), nomePessoaLogada || "Equipe"),
    bodyHtml: avisoNomePendente + body,
    navAction: "set-inst-tab",
    schoolBadge: `${ICONS.pinSmall} ${escapeHtml(school.nome)} — ${escapeHtml(school.uf)}`,
    schoolBadgeClickable: temMaisDeUmaEscola,
  }) + horarios.modais() + alunoDetalheModal() + turmaDetalheModal() + professorTurmasModal() + editarProfessorModal() + fichaUsuarioModal() + aniversarioMsgModal() + importarTurmasModal() + responsavelVinculoModal() + acessoUsuarioModal() + contratoModal(state.contrato, {
    cursos: cursosEModalidadesDaEscola(school?.nome || ""),
    alunos: state.instAlunos || [],
    turmas: state.instTurmas || [],
  }) + importarContratosModal(state, {
    cursos: cursosEModalidadesDaEscola(school?.nome || ""),
    turmas: state.instTurmas || [],
  }) + contratoVisualizadorModal();
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

  // Resumo da unidade: números reais, vindos das mesmas listas que as
  // outras abas já carregam. Enquanto não chegam, mostra "—".
  const alunos = state.instAlunos;
  const professores = state.gestaoProfessores;
  const responsaveis = state.gestaoResponsaveis;
  const carregandoResumo = state.instAlunosCarregando || state.gestaoEquipeCarregando;
  const num = (lista) => Array.isArray(lista) && !carregandoResumo ? lista.length : "—";
  const semLogin = (Array.isArray(alunos) && Array.isArray(responsaveis) && !carregandoResumo)
    ? alunos.filter(a => !a.uid && !ehTurmaDeRecreacao(a.turma)).length + responsaveis.filter(r => !r.uid).length
    : "—";
  const tiles = [
    { rotulo: "Alunos", valor: num(alunos), icon: ICONS.users, aba: "alunos" },
    { rotulo: "Professores", valor: num(professores), icon: ICONS.users2, aba: "professores" },
    { rotulo: "Responsáveis", valor: num(responsaveis), icon: ICONS.user, aba: "responsaveis" },
    { rotulo: "Sem login", valor: semLogin, icon: ICONS.key, aba: null, alerta: semLogin !== "—" && semLogin > 0 },
  ];
  const resumo = `<div class="gestao-resumo">${tiles.map(t => {
    const conteudo = `
      <span class="gestao-tile-icon">${t.icon}</span>
      <span class="gestao-tile-valor">${t.valor}</span>
      <span class="gestao-tile-rotulo">${t.rotulo}</span>`;
    return t.aba
      ? `<button type="button" class="gestao-tile" data-action="set-inst-tab" data-key="${t.aba}" title="Abrir ${t.rotulo}">${conteudo}</button>`
      : `<button type="button" class="gestao-tile ${t.alerta ? "gestao-tile-alerta" : ""}" data-action="ver-sem-login" title="Ver só quem está sem login (alunos só de Recreação não contam: não têm login)">${conteudo}</button>`;
  }).join("")}</div>`;

  return `
    <h2 class="section-title">Gestão da unidade</h2>
    <p class="section-eyebrow">Cadastros e acessos de ${escapeHtml(school.nome)}. Turmas de professores e vínculos de responsáveis ficam nas abas Professores e Responsáveis; contratos têm aba própria.</p>
    ${resumo}
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
    <p class="section-eyebrow">${escapeHtml(school.nome)} · toque num professor para ver as turmas dele · o escudo abre a ficha (emergência, alergias, endereço)</p>
    ${professoresSection()}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Aba "Responsáveis": lista de responsáveis cadastrados, com modal pra
   ajustar os alunos vinculados a cada um. */
function responsaveisView(school){
  return `
    <h2 class="section-title">Responsáveis</h2>
    <p class="section-eyebrow">${escapeHtml(school.nome)} · toque num responsável para editar os dados e os alunos vinculados</p>
    ${responsaveisSection()}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Sub-aba "Criar cadastro": formulário único de matrícula/login de
   aluno, responsável, professor e equipe administrativa. */
function gestaoCadastroView(school){
  const role = state.novoUsuarioRole;
  // Aluno da Recreação não tem login próprio: quem acessa é o responsável.
  const alunoRecreacao = role === "aluno" && ehTurmaDeRecreacao(state.novoUsuarioTurma);
  const precisaLogin = role === "professor" || role === "instituicao" || role === "responsavel" || (role === "aluno" && !alunoRecreacao);

  const escolasDisponiveis = Object.entries(state.data.escolas || {}).map(([id, e]) => ({ id, nome: e.nome }));

  const cursosDisponiveis = role === "professor"
    ? cursosEModalidadesDasEscolas(state.novoUsuarioEscolasIds.length ? state.novoUsuarioEscolasIds : [state.escolaSelecionadaId])
    : cursosEModalidadesDaEscola(school.nome);

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

  const campoParentesco = role === "responsavel"
    ? parentescoSelectHtml("new-user-parentesco", state.novoUsuarioParentesco) : "";

  // Define qual foto padrão a pessoa vai ter (ver FOTO_PADRAO). Só existe
  // pra aluno e professor — responsável tem uma foto única e a secretaria
  // é por unidade, nenhuma das duas depende do que a instituição escolhe aqui.
  const campoSexo = (role === "aluno" || role === "professor") ? `
        <label class="teacher-label" for="new-user-sexo" style="margin-top:2px;">${role === "aluno" ? "Aluno(a) é" : "Professor(a) é"}</label>
        <select id="new-user-sexo" class="teacher-text-input">
          <option value="" ${!state.novoUsuarioSexo ? "selected" : ""} disabled>Selecione</option>
          <option value="masculino" ${state.novoUsuarioSexo === "masculino" ? "selected" : ""}>${role === "aluno" ? "Menino" : "Homem"}</option>
          <option value="feminino" ${state.novoUsuarioSexo === "feminino" ? "selected" : ""}>${role === "aluno" ? "Menina" : "Mulher"}</option>
        </select>
        <p class="section-eyebrow" style="margin:4px 0 0;">Define a foto padrão que aparece na ficha e nas listas.</p>` : "";

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
        <input id="new-user-senha" type="text" class="teacher-text-input" placeholder="Senha provisória (mín. 6 caracteres)" value="${escapeHtml(state.novoUsuarioSenha || "")}" />
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
          <button type="button" class="btn-secondary" data-action="gerar-senha-novo-usuario">Gerar outra senha</button>
          ${role === "aluno" || role === "responsavel" ? `<button type="button" class="btn-secondary" data-action="gerar-acesso-novo-usuario">Gerar outro login e senha</button>` : ""}
        </div>
        <p class="section-eyebrow" style="margin:4px 0 0;">${role === "aluno" || role === "responsavel" ? "Login e senha são gerados sozinhos a partir do nome — você pode editar." : "A senha é gerada sozinha; informe o e-mail da pessoa."}</p>` : "";

  const rotuloBotao = state.novoUsuarioSalvando
    ? "Salvando…"
    : (role === "aluno" ? "Cadastrar aluno" : role === "responsavel" ? "Cadastrar responsável" : "Criar usuário");

  const textoRodape = alunoRecreacao
    ? `Aluno da Recreação não tem login: cadastre-o aqui e crie o login só do responsável (tipo "Responsável"), vinculando a este aluno.`
    : precisaLogin
    ? `Ao salvar, aparece o botão para enviar login e senha pelo WhatsApp. Para trocar a senha depois, vá em Gestão > Senhas & acessos.`
    : `Esse cadastro fica só nas coleções do banco, sem login.`;

  const papeis = [
    { key: "aluno", label: "Aluno", icon: ICONS.cap },
    { key: "responsavel", label: "Responsável", icon: ICONS.user },
    { key: "professor", label: "Professor", icon: ICONS.book },
    { key: "instituicao", label: "Equipe", icon: ICONS.building },
  ];
  const chipsPapel = `<div class="papel-chips" role="group" aria-label="Tipo de cadastro">${papeis.map(p => `
    <button type="button" class="papel-chip ${role === p.key ? "active" : ""}" data-action="set-new-user-role" data-role="${p.key}" aria-pressed="${role === p.key}">
      ${p.icon}<span>${p.label}</span>
    </button>`).join("")}</div>`;

  const ajudaPorPapel = {
    aluno: {
      titulo: "Cadastro de aluno",
      itens: [
        "Recebe um IDALUNO sequencial (0001, 0002…) sozinho.",
        "Menino/Menina define a foto padrão na ficha e nas listas.",
        "Entra no app com o e-mail e a senha provisória que você definir (na Recreação não há login: só o responsável acessa).",
        "Cadastre o aluno antes do responsável, para poder vincular os dois.",
      ],
    },
    responsavel: {
      titulo: "Cadastro de responsável",
      itens: [
        "Marque os filhos já cadastrados para vincular.",
        "Vê calendário, notas, presença e financeiro de cada filho.",
        "Com mais de um filho, alterna entre eles no topo da tela.",
        "Os vínculos podem ser ajustados depois na aba Responsáveis.",
      ],
    },
    professor: {
      titulo: "Cadastro de professor",
      itens: [
        "Marque a(s) unidade(s) e a(s) disciplina(s) que ele dá.",
        "Homem/Mulher define a foto no cabeçalho e nas listas.",
        "As turmas são criadas depois, na aba Professores.",
        "Nome, disciplinas e foto podem ser editados em Professores.",
      ],
    },
    instituicao: {
      titulo: "Cadastro da equipe",
      itens: [
        "Acesso administrativo completo à unidade atual.",
        "A pessoa troca a própria senha em Meu perfil.",
        "Só cadastre quem realmente precisa ver dados financeiros e de alunos.",
      ],
    },
  };
  const ajuda = ajudaPorPapel[role] || ajudaPorPapel.aluno;

  const ag = state.acessoGerado;
  const painelAcessoGerado = ag ? `
      <div class="card" style="padding:14px 16px;margin:0 0 14px;border-left:3px solid var(--green,#2E9E6B);">
        <p style="margin:0 0 4px;font-weight:600;color:var(--ink);">Acesso de ${escapeHtml(ag.nome)} criado</p>
        <p class="section-eyebrow" style="margin:0 0 10px;">Login: <strong style="color:var(--ink);">${escapeHtml(ag.email)}</strong> · Senha provisória: <strong style="color:var(--ink);">${escapeHtml(ag.senha)}</strong><br>A senha só aparece aqui agora; depois de fechar este aviso ela não fica guardada.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="teacher-primary-btn" style="margin:0;" data-action="enviar-acesso-gerado" data-via="whatsapp">${telefoneValido(ag.contato) ? "Enviar por WhatsApp" : "Enviar por WhatsApp (escolher contato)"}</button>
          ${/@/.test(ag.contato || "") ? `<button type="button" class="btn-secondary" data-action="enviar-acesso-gerado" data-via="email">Enviar por e-mail</button>` : ""}
          <button type="button" class="btn-secondary" data-action="enviar-acesso-gerado" data-via="copiar">Copiar mensagem</button>
          <button type="button" class="btn-secondary" data-action="fechar-acesso-gerado">Fechar</button>
        </div>
        ${!telefoneValido(ag.contato) ? `<p class="section-eyebrow" style="margin:8px 0 0;">Sem WhatsApp no cadastro: o botão abre o WhatsApp com a mensagem pronta e você escolhe o contato.</p>` : ""}
      </div>` : "";

  const formulario = `
    <div class="management-card management-card-wide gestao-form">
      <h3>Criar cadastro</h3>
      <p>Todo mundo ganha login (e-mail e senha) para entrar no app. Escolha o tipo e preencha os dados.</p>

      ${painelAcessoGerado}

      <p class="form-secao">1 · Quem é</p>
      ${chipsPapel}

      <p class="form-secao">2 · Dados</p>
      <input id="new-user-name" class="teacher-text-input" placeholder="Nome completo" value="${escapeHtml(state.novoUsuarioNome || "")}" />
      ${campoTurma}
      ${campoSexo}
      ${campoEscolasProfessor}
      ${campoDisciplina}
      ${campoVinculo}
      ${campoContato}
      ${campoParentesco}

      ${precisaLogin ? `<p class="form-secao">3 · Acesso ao app</p>` : ""}
      ${campoLogin}

      <button class="teacher-primary-btn" data-action="create-user" ${state.novoUsuarioSalvando ? "disabled" : ""}>${rotuloBotao}</button>
      ${state.instituicaoErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.instituicaoErro)}</p>` : ""}
      <p class="section-eyebrow" style="margin-top:8px;">${textoRodape}</p>
    </div>`;

  const painelAjuda = `
    <aside class="gestao-ajuda">
      <h4>${escapeHtml(ajuda.titulo)}</h4>
      <p>Como funciona</p>
      <ul>${ajuda.itens.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    </aside>`;

  return `<div class="gestao-cadastro-layout">${formulario}${painelAjuda}</div>`;
}

/* ------------------------------------------------------------------
   Sub-aba "Senhas & acessos": um lugar só pra secretaria achar qualquer
   pessoa da unidade (aluno, professor ou responsável), trocar a senha
   dela e, se precisar, excluir o cadastro. Antes isso estava espalhado
   (senha não existia; excluir aluno só dentro da ficha; excluir
   responsável não existia) e qualquer troca de senha virava chamado pro
   desenvolvedor.
   ------------------------------------------------------------------ */
/* Quem está sem login de verdade: alunos (menos os só de Recreação, que
   não têm login por regra) e responsáveis sem uid. Professor sempre tem. */
function pessoasSemLogin(){
  const alunos = (state.instAlunos || [])
    .filter(a => !a.uid && !ehTurmaDeRecreacao(a.turma))
    .map(a => ({ tipo: "aluno", ref: a }));
  const resps = (state.gestaoResponsaveis || [])
    .filter(r => !r.uid)
    .map(r => ({ tipo: "responsavel", ref: r }));
  return [...alunos, ...resps];
}

function painelGerarLoginsEmLote(qtdVisivel, carregando){
  const total = pessoasSemLogin().length;
  const res = state.geracaoLoteResultado;

  let painelResultado = "";
  if(res){
    const linhasOk = res.criados.map(c => `
      <tr><td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.tipo === "aluno" ? "Aluno" : "Responsável")}</td><td>${escapeHtml(c.email)}</td><td><strong>${escapeHtml(c.senha)}</strong></td></tr>`).join("");
    painelResultado = `
      <div class="card" style="padding:14px 16px;margin:0 0 12px;border-left:3px solid var(--green,#2E9E6B);">
        <p style="margin:0 0 4px;font-weight:600;color:var(--ink);">${res.criados.length} ${res.criados.length === 1 ? "login criado" : "logins criados"}${res.falhas.length ? ` · ${res.falhas.length} com problema` : ""}</p>
        <p class="section-eyebrow" style="margin:0 0 8px;">Anote ou copie agora: a senha provisória não aparece de novo depois que você fechar este aviso.</p>
        ${res.criados.length ? `<div style="overflow-x:auto;"><table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead><tr style="text-align:left;color:var(--slate);"><th>Nome</th><th>Tipo</th><th>Login</th><th>Senha</th></tr></thead>
          <tbody>${linhasOk}</tbody></table></div>` : ""}
        ${res.falhas.length ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin:8px 0 0;">Não deu certo para: ${res.falhas.map(f => `${escapeHtml(f.nome)} (${escapeHtml(f.motivo)})`).join("; ")}. Abra a pessoa na lista e tente de novo.</p>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          ${res.criados.length ? `<button type="button" class="teacher-primary-btn" style="margin:0;" data-action="copiar-logins-lote">Copiar lista</button>` : ""}
          <button type="button" class="btn-secondary" data-action="fechar-resultado-lote">Fechar</button>
        </div>
      </div>`;
  }

  let acao = "";
  if(state.geracaoLoteRodando){
    acao = `<p class="section-eyebrow" style="margin:0 0 10px;">Gerando logins… ${escapeHtml(state.geracaoLoteProgresso)} Não feche esta tela.</p>`;
  } else if(state.geracaoLoteConfirmando){
    acao = `
      <div class="aluno-modal-confirm" style="margin:0 0 12px;">
        <p>Vou criar login e senha provisória para ${total} ${total === 1 ? "pessoa" : "pessoas"} (alunos e responsáveis sem acesso; alunos só de Recreação ficam de fora). Depois mostro a lista para você repassar às famílias.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="teacher-primary-btn" style="margin:0;" data-action="confirmar-gerar-logins-lote">Sim, gerar logins</button>
          <button type="button" class="btn-secondary" data-action="cancelar-gerar-logins-lote">Cancelar</button>
        </div>
      </div>`;
  } else if(!carregando && total > 0){
    acao = `
      <div style="margin:0 0 12px;">
        <p class="section-eyebrow" style="margin:0 0 8px;">${total} ${total === 1 ? "pessoa está" : "pessoas estão"} sem login (alunos só de Recreação não contam). Toque numa pessoa para criar o acesso dela, ou gere todos de uma vez.</p>
        <button type="button" class="teacher-primary-btn" style="margin:0;" data-action="gerar-logins-lote">Gerar login de todos (${total})</button>
      </div>`;
  } else if(!carregando && !res){
    acao = `<p class="section-eyebrow" style="margin:0 0 10px;">Todo mundo que precisa de login já tem. 🎉</p>`;
  }
  return `${painelResultado}${acao}`;
}

/* Cria o login de um aluno que já existe (cadastro sem acesso). Mesmo
   caminho do cadastro novo: Auth no app secundário + usuarios/{uid} +
   uid/e-mail gravados no próprio aluno. */
async function criarLoginParaAluno(aluno, emails, senha){
  const { cred, email: emailFinal } = await criarLoginComAlternativas(emails, senha);
  const uid = cred.user.uid;
  try {
    await setDoc(doc(db, "usuarios", uid), { role: "aluno", nome: aluno.nome, email: emailFinal, alunoId: aluno.id });
    await updateDoc(doc(db, "alunos", aluno.id), { uid, email: emailFinal });
    return { uid, email: emailFinal };
  } catch(err){
    try { await cred.user.delete(); } catch(_e){ /* ignora */ }
    throw err;
  } finally {
    try { await signOut(secondaryAuth); } catch(_e){ /* ignora */ }
  }
}

/* Versão do responsável que aceita lista de e-mails alternativos. */
async function criarLoginParaResponsavelComAlternativas(responsavel, emails, senha){
  const { cred, email: emailFinal } = await criarLoginComAlternativas(emails, senha);
  const uid = cred.user.uid;
  try {
    await setDoc(doc(db, "usuarios", uid), {
      role: "responsavel", nome: responsavel.nome, email: emailFinal,
      alunosIds: responsavel.alunosIds || [],
      escolaId: state.escolaSelecionadaId,
    });
    await updateDoc(doc(db, "responsaveis", responsavel.id), { uid, email: emailFinal });
    return { uid, email: emailFinal };
  } catch(err){
    try { await cred.user.delete(); } catch(_e){ /* ignora */ }
    throw err;
  } finally {
    try { await signOut(secondaryAuth); } catch(_e){ /* ignora */ }
  }
}

function gestaoAcessosView(){
  const busca = (state.gestaoAcessosBusca || "").trim().toLowerCase();
  const grupo = state.gestaoAcessosGrupo || "todos";

  const filtros = [
    { key: "todos", label: "Todos" },
    { key: "alunos", label: "Alunos" },
    { key: "professores", label: "Professores" },
    { key: "responsaveis", label: "Responsáveis" },
    { key: "semlogin", label: "Sem login" },
  ];
  const contagem = {
    alunos: (state.instAlunos || []).length,
    professores: (state.gestaoProfessores || []).length,
    responsaveis: (state.gestaoResponsaveis || []).length,
  };
  contagem.todos = contagem.alunos + contagem.professores + contagem.responsaveis;
  contagem.semlogin = pessoasSemLogin().length;
  const filtroHtml = `<div class="acesso-filtros">${filtros.map(f => `
    <button type="button" class="acesso-filtro ${grupo === f.key ? "active" : ""}" data-action="set-acessos-grupo" data-key="${f.key}">${f.label}${contagem[f.key] ? ` <span class="acesso-filtro-count">${contagem[f.key]}</span>` : ""}</button>`).join("")}</div>`;

  const carregando = state.instAlunosCarregando || state.gestaoEquipeCarregando;

  // Monta uma lista única, com o tipo de cada pessoa junto, pra poder
  // buscar por nome sem se importar com a aba em que ela "mora".
  const pessoas = [];
  if(grupo === "todos" || grupo === "alunos" || grupo === "semlogin"){
    (state.instAlunos || []).forEach(a => pessoas.push({
      tipo: "aluno", docId: a.id, uid: a.uid || null,
      nome: a.nome, detalhe: a.turma || "Sem curso", email: a.email || "",
      semLoginNormal: !a.uid && ehTurmaDeRecreacao(a.turma),
    }));
  }
  if(grupo === "todos" || grupo === "professores"){
    (state.gestaoProfessores || []).forEach(p => pessoas.push({
      tipo: "professor", docId: p.id, uid: p.id,
      nome: p.nome, detalhe: (p.disciplinas || []).join(", ") || "Sem disciplina", email: p.email || "",
    }));
  }
  if(grupo === "todos" || grupo === "responsaveis" || grupo === "semlogin"){
    (state.gestaoResponsaveis || []).forEach(r => pessoas.push({
      tipo: "responsavel", docId: r.id, uid: r.uid || null,
      nome: r.nome,
      detalhe: `${(r.alunosIds || []).length} ${(r.alunosIds || []).length === 1 ? "aluno vinculado" : "alunos vinculados"}`,
      email: r.email || "",
    }));
  }

  const rotuloTipo = { aluno: "Aluno", professor: "Professor", responsavel: "Responsável" };
  const filtradas = pessoas
    .filter(p => grupo !== "semlogin" || (!p.uid && !p.semLoginNormal))
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
          ${p.uid ? "Tem login" : (p.semLoginNormal ? "Recreação (sem login)" : "Sem login")} ${ICONS.chevronRight}
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
      ${grupo === "semlogin" ? painelGerarLoginsEmLote(filtradas.length, carregando) : ""}
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

  const alunoDoModal = state.acessoTipo === "aluno"
    ? (state.instAlunos || []).find(a => a.id === state.acessoDocId)
    : null;
  const alunoRecreacaoSemLogin = !!alunoDoModal && !temLogin && ehTurmaDeRecreacao(alunoDoModal.turma);

  const blocoSemLogin = alunoRecreacaoSemLogin ? `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Sem login (Recreação)</h3>
        <p class="section-eyebrow" style="margin:0;">Aluno só de Recreação não tem login próprio: quem acessa o app é o responsável. Se precisar de acesso, confira o cadastro do responsável vinculado.</p>
      </div>` : `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Criar acesso</h3>
        <p class="section-eyebrow" style="margin:0 0 8px;">Esta pessoa ainda não tem login. Defina um e-mail e uma senha para ela entrar no app.</p>
        <input id="acesso-email" type="email" class="teacher-text-input" placeholder="E-mail de acesso" value="${escapeHtml(state.acessoEmail)}" />
        <input id="acesso-nova-senha" type="text" class="teacher-text-input" style="margin-top:8px;" placeholder="Senha (mín. 6 caracteres)" value="${escapeHtml(state.acessoSenhaSugerida || "")}" />
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn-secondary" data-action="gerar-senha-acesso">Gerar outra senha</button>
          ${state.acessoTipo === "aluno" || state.acessoTipo === "responsavel" ? `<button type="button" class="btn-secondary" data-action="gerar-login-e-senha-acesso">Gerar outro login e senha</button>` : ""}
        </div>
        <button type="button" class="teacher-primary-btn" data-action="criar-login-acesso" ${state.acessoCriandoLogin ? "disabled" : ""}>${state.acessoCriandoLogin ? "Criando…" : "Criar acesso"}</button>
      </div>`;

  const blocoComLogin = `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Trocar senha</h3>
        ${state.acessoEmail ? `<p class="section-eyebrow" style="margin:0 0 8px;">Login: <strong style="color:var(--ink);">${escapeHtml(state.acessoEmail)}</strong></p>` : ""}
        <input id="acesso-nova-senha" type="text" class="teacher-text-input" placeholder="Nova senha (mín. 6 caracteres)" />
        <button type="button" class="btn-secondary" style="margin:8px 0 0;" data-action="gerar-senha-acesso">Gerar outra senha</button>
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

/* Aba "Contratos" — dois avisos:
   1) contratos aguardando assinatura. Os que têm PDF salvo no sistema já
      saem prontos pra ver, mandar pelo WhatsApp e marcar como assinado,
      um por um (o aluno pode ter mais de um). Os que foram só marcados
      como pendentes, sem PDF, continuam no fluxo antigo (escolher o PDF
      de novo) e ganham o botão "Salvar no sistema".
   2) alunos que ainda não têm nenhum contrato guardado no sistema — pede
      pra anexar, pra ficar salvo e visível aos responsáveis. */
function linhaPendenteSemArquivo(a){
  const destino = destinoDoContratoDoAluno(a);
  const arquivo = state.contratoArquivosEnvio[a.id];
  const msg = state.contratoEnvioMsg[a.id];
  const enviado = a.contratoEnviadoEm ? `Enviado em ${a.contratoEnviadoEm.split("-").reverse().join("/")}` : "Ainda não enviado";
  return `
      <div class="pendente-contrato-item">
        <div class="pendente-contrato-info">
          <strong>${escapeHtml(a.nome)}</strong>
          <span>${destino.numero ? `Enviar para ${escapeHtml(destino.nome)}` : `Sem WhatsApp cadastrado (${escapeHtml(destino.nome)})`} · ${enviado}</span>
          <span class="pendente-contrato-msg">O PDF deste contrato não está salvo no sistema.</span>
          ${msg ? `<span class="pendente-contrato-msg">${escapeHtml(msg)}</span>` : ""}
        </div>
        <div class="pendente-contrato-acoes">
          <label class="pendente-contrato-anexar">
            ${ICONS.upload} <span>${arquivo ? escapeHtml(arquivo.name) : "Escolher PDF"}</span>
            <input type="file" accept="application/pdf" data-contrato-envio="${a.id}" style="display:none;" />
          </label>
          <button type="button" class="aniversario-btn" data-action="contrato-pendente-salvar" data-aluno="${a.id}" ${arquivo ? "" : "disabled"}>Salvar no sistema</button>
          <button type="button" class="aniversario-btn" data-action="contrato-pendente-enviar" data-aluno="${a.id}" ${arquivo ? "" : "disabled"}>Enviar no WhatsApp</button>
          <button type="button" class="pendente-contrato-assinado" data-action="contrato-pendente-assinado" data-aluno="${a.id}">Marcar como assinado</button>
        </div>
      </div>`;
}

function contratosPendentesCard(){
  if(state.instAlunosCarregando || state.gestaoEquipeCarregando || state.contratosInst.carregando){
    return `<div class="management-card management-card-wide" style="max-width:none;"><h3>Aguardando assinatura</h3><p>Carregando…</p></div>`;
  }
  const c = state.contratosInst;
  const alunos = state.instAlunos || [];
  const salvos = c.carregado ? c.itens : [];
  let html = "";

  if(c.erro){
    html += `<div class="management-card management-card-wide" style="max-width:none;"><h3>Contratos salvos</h3><p class="teacher-error" style="color:var(--red);">${escapeHtml(c.erro)}</p></div>`;
  }

  // 1) aguardando assinatura
  const linhas = [];
  alunos
    .filter(a => a.contratoStatus === "pendente" || salvos.some(m => m.alunoId === a.id && m.status === "pendente"))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach(a => {
      const pend = ordenarContratos(salvos.filter(m => m.alunoId === a.id && m.status === "pendente"));
      if(pend.length) pend.forEach(m => linhas.push(contratoItemHtml(m, { nomeAluno: a.nome })));
      else linhas.push(linhaPendenteSemArquivo(a));
    });
  if(linhas.length){
    html += `
    <div class="management-card management-card-wide" style="max-width:none;">
      <h3>Aguardando assinatura (${linhas.length})</h3>
      <p>Abra o contrato, envie pelo WhatsApp e, quando voltar assinado, marque como assinado. Se o aluno tiver mais de um contrato, cada um aparece separado.</p>
      <div class="pendente-contrato-lista">${linhas.join("")}</div>
    </div>`;
  }

  // 2) sem contrato salvo
  if(c.carregado){
    const semArquivo = alunos
      .filter(a => a.situacao !== "cancelado" && !salvos.some(m => m.alunoId === a.id))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    if(semArquivo.length){
      const mostrar = semArquivo.slice(0, 12).map(a => `
        <div class="pendente-contrato-item">
          <div class="pendente-contrato-info">
            <strong>${escapeHtml(a.nome)}</strong>
            <span>${escapeHtml(a.turma || "Sem turma")}${a.contratoStatus ? ` · registrado como ${a.contratoStatus === "assinado" ? "assinado" : "aguardando assinatura"}` : " · sem contrato registrado"}</span>
          </div>
          <div class="pendente-contrato-acoes">
            <button type="button" class="aniversario-btn" data-action="abrir-aluno" data-id="${escapeHtml(a.id)}">${ICONS.upload} Anexar contrato</button>
          </div>
        </div>`).join("");
      html += `
    <div class="management-card management-card-wide" style="max-width:none;">
      <h3>Sem contrato salvo no sistema (${semArquivo.length})</h3>
      <p>Estes alunos ainda não têm o PDF do contrato guardado. Abra a ficha e anexe o arquivo — assim ele fica salvo e os responsáveis conseguem ver no app.</p>
      <div class="pendente-contrato-lista">${mostrar}</div>
      ${semArquivo.length > 12 ? `<p class="section-eyebrow" style="margin-top:10px;">+ ${semArquivo.length - 12} outros alunos. Conforme você anexa, a lista diminui.</p>` : ""}
    </div>`;
    }
  }
  return html;
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
  const todos = state.gestaoProfessores || [];
  const busca = (state.profBusca || "").trim().toLowerCase();
  const professores = busca ? todos.filter(p => (p.nome || "").toLowerCase().includes(busca)) : todos;
  const linhasProfessores = professores.map(p => `
    <div class="row aluno-row pessoa-row pessoa-row-quebra" style="cursor:default;">
      <button type="button" class="pessoa-principal" data-action="abrir-professor-turmas" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}">
        ${avatarHtml(fotoDoProfessor(p), iniciaisDoNome(p.nome))}
        <span class="pessoa-info">
          <span class="pessoa-nome">${escapeHtml(p.nome)}</span>
          <span class="pessoa-sub">${escapeHtml(p.disciplinas.join(", ") || "Sem disciplina definida")}</span>
        </span>
      </button>
      <span class="pessoa-meta">
        <button type="button" class="icon-acao" data-action="abrir-ficha-usuario" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" aria-label="Ver ficha (contato de emergência, alergias…)" title="Ver ficha">${ICONS.shield}</button>
        <button type="button" class="icon-acao" data-action="abrir-acesso-usuario" data-tipo="professor" data-id="${escapeHtml(p.id)}" data-uid="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" data-email="${escapeHtml(p.email || "")}" aria-label="Senha e acesso" title="Senha e acesso">${ICONS.key}</button>
        <button type="button" class="icon-acao" data-action="abrir-editar-professor" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" aria-label="Editar professor" title="Editar">${ICONS.pencil}</button>
        <button type="button" class="icon-acao icon-acao-perigo" data-action="confirmar-excluir-professor" data-id="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome)}" aria-label="Excluir professor" title="Excluir" ${state.editProfessorExcluindoId === p.id ? "disabled" : ""}>${state.editProfessorExcluindoId === p.id ? "…" : ICONS.trash}</button>
      </span>
    </div>`).join("") || `<div class="lista-vazia">${busca ? "Nenhum professor encontrado." : "Nenhum professor cadastrado nesta unidade ainda."}</div>`;

  return `
    <div class="lista-toolbar">
      <div class="search-wrap">
        ${ICONS.search}
        <input class="search-input" id="prof-busca" placeholder="Buscar professor pelo nome" value="${escapeHtml(state.profBusca || "")}" />
      </div>
      <span class="lista-contador"><strong>${todos.length}</strong> ${todos.length === 1 ? "professor" : "professores"}</span>
    </div>
    <div class="card flush lista-pessoas">${linhasProfessores}</div>`;
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
  const todos = state.gestaoResponsaveis || [];
  const busca = (state.respBusca || "").trim().toLowerCase();
  const responsaveis = busca ? todos.filter(r => (r.nome || "").toLowerCase().includes(busca)) : todos;
  const linhasResponsaveis = responsaveis.map(r => {
    const qtd = r.alunosIds.length;
    return `
    <div class="row aluno-row pessoa-row" style="cursor:default;">
      <button type="button" class="pessoa-principal" data-action="abrir-responsavel-vinculos" data-id="${escapeHtml(r.id)}" data-nome="${escapeHtml(r.nome)}">
        ${avatarHtml(FOTO_PADRAO.responsavel, iniciaisDoNome(r.nome))}
        <span class="pessoa-info">
          <span class="pessoa-nome">${escapeHtml(r.nome)}</span>
          <span class="pessoa-sub">${r.parentesco ? `${escapeHtml(parentescoLabel(r.parentesco))} · ` : ""}${qtd} ${qtd === 1 ? "aluno vinculado" : "alunos vinculados"}</span>
        </span>
      </button>
      <span class="pessoa-meta">
        ${r.uid ? "" : `<span class="status-pill status-pill-aviso">Sem login</span>`}
        <button type="button" class="icon-acao" title="Senha e acesso" data-action="abrir-acesso-usuario" data-tipo="responsavel" data-id="${escapeHtml(r.id)}" data-uid="${escapeHtml(r.uid || "")}" data-nome="${escapeHtml(r.nome)}" data-email="${escapeHtml(r.email || "")}" aria-label="Senha e acesso">${ICONS.key}</button>
        <button type="button" class="icon-acao icon-acao-perigo" title="Excluir responsável" data-action="abrir-acesso-usuario" data-tipo="responsavel" data-id="${escapeHtml(r.id)}" data-uid="${escapeHtml(r.uid || "")}" data-nome="${escapeHtml(r.nome)}" data-email="${escapeHtml(r.email || "")}" data-excluir="1" aria-label="Excluir responsável">${ICONS.trash}</button>
      </span>
    </div>`;
  }).join("") || `<div class="lista-vazia">${busca ? "Nenhum responsável encontrado." : "Nenhum responsável cadastrado nesta unidade ainda."}</div>`;

  return `
    <div class="lista-toolbar">
      <div class="search-wrap">
        ${ICONS.search}
        <input class="search-input" id="resp-busca" placeholder="Buscar responsável pelo nome" value="${escapeHtml(state.respBusca || "")}" />
      </div>
      <span class="lista-contador"><strong>${todos.length}</strong> ${todos.length === 1 ? "responsável" : "responsáveis"}</span>
    </div>
    <div class="card flush lista-pessoas">${linhasResponsaveis}</div>`;
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
  const disciplinasDisponiveis = cursosEModalidadesDaEscola(state.data.escolas?.[state.escolaSelecionadaId]?.nome || "");
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
        <h3 class="teacher-label">Professor(a) é</h3>
        <select id="edit-professor-sexo" class="teacher-text-input">
          <option value="" ${!state.editProfessorSexo ? "selected" : ""} disabled>Selecione</option>
          <option value="masculino" ${state.editProfessorSexo === "masculino" ? "selected" : ""}>Homem</option>
          <option value="feminino" ${state.editProfessorSexo === "feminino" ? "selected" : ""}>Mulher</option>
        </select>
        <p class="section-eyebrow" style="margin:4px 0 0;">Define a foto que aparece na lista de professores.</p>
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
  const cursosDisponiveis = cursosEModalidadesDaEscola(escola?.nome || "");
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
        <h3 class="teacher-label">Dados do responsável</h3>
        <label class="teacher-label" for="resp-modal-nome" style="display:block;">Nome</label>
        <input id="resp-modal-nome" class="teacher-text-input" placeholder="Nome completo" value="${escapeHtml(state.respModalNomeInput)}" />
        <label class="teacher-label" for="resp-modal-parentesco" style="display:block;margin-top:10px;">Parentesco</label>
        ${parentescoSelectHtml("resp-modal-parentesco", state.respModalParentesco)}
        <label class="teacher-label" for="resp-modal-contato" style="display:block;margin-top:10px;">Contato (WhatsApp ou e-mail)</label>
        <input id="resp-modal-contato" class="teacher-text-input" placeholder="(46) 99999-9999" value="${escapeHtml(state.respModalContato)}" />
        <label class="teacher-label" for="resp-modal-email" style="display:block;margin-top:10px;">E-mail de acesso</label>
        <input id="resp-modal-email" type="email" class="teacher-text-input" placeholder="E-mail" value="${escapeHtml(state.respModalEmail)}" />
        ${(state.gestaoResponsaveis || []).find(r => r.id === state.respModalId)?.uid
          ? `<p class="section-eyebrow" style="margin:4px 0 0;">Este responsável já tem login. Trocar o e-mail aqui também troca o login dele.</p>`
          : `<p class="section-eyebrow" style="margin:4px 0 0;">Sem login ainda: o e-mail fica só registrado no cadastro.</p>`}
        <button type="button" class="teacher-primary-btn" style="margin-top:10px;" data-action="salvar-resp-dados" ${state.respModalDadosSalvando ? "disabled" : ""}>${state.respModalDadosSalvando ? "Salvando…" : "Salvar dados"}</button>
        ${state.respModalDadosErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.respModalDadosErro)}</p>` : ""}
        ${state.respModalDadosMsg ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.respModalDadosMsg)}</p>` : ""}
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

/* Aba "Meu perfil" da equipe administrativa: cartão de identificação
   (foto, nome, e-mail, unidades), dados e senha, atalhos (Senhas & acessos,
   suporte) e o catálogo de manuais agrupado por assunto. */
function manuaisAgrupadosHtml(publico = "instituicao"){
  const ehProf = publico === "professor";
  const catalogo = ehProf ? MANUAIS_INSTITUICAO.filter(m => m.professor) : MANUAIS_INSTITUICAO;
  return MANUAIS_CATEGORIAS.map(cat => {
    const itens = catalogo.filter(m => m.categoria === cat.key);
    if(!itens.length) return "";
    const aberto = !!state.manuaisAbertos[cat.key];
    const descCat = (ehProf && cat.descricaoProfessor) || cat.descricao;
    const cards = itens.map(m => {
      const pronto = !!(m.url && m.url !== "#");
      const tag = `<span class="manual-tag manual-tag-${escapeHtml(m.tipo)}">${escapeHtml(MANUAIS_TIPOS[m.tipo] || "Guia")}</span>`;
      const miolo = `
        <span class="manual-item-icon">${ICONS[cat.icon] || ICONS.clipboard}</span>
        <span class="manual-item-text">
          <span class="manual-item-title">${escapeHtml(m.titulo)}</span>
          <span class="manual-item-desc">${escapeHtml(m.descricao)}</span>
          <span class="manual-item-meta">${tag}${pronto ? "" : `<span class="manual-tag manual-tag-breve">Em breve</span>`}</span>
        </span>`;
      return pronto
        ? `<a class="manual-item" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${miolo}${ICONS.chevronRight}</a>`
        : `<div class="manual-item manual-item-breve">${miolo}</div>`;
    }).join("");
    return `
      <section class="manual-grupo ${aberto ? "aberto" : ""}">
        <button type="button" class="manual-grupo-head manual-grupo-toggle" data-action="toggle-manual-grupo" data-key="${escapeHtml(cat.key)}" aria-expanded="${aberto}">
          <span class="manual-grupo-icon">${ICONS[cat.icon] || ICONS.clipboard}</span>
          <div>
            <h3>${escapeHtml(cat.titulo)} <span class="manual-grupo-count">${itens.length}</span></h3>
            <p>${escapeHtml(descCat)}</p>
          </div>
          <span class="manual-grupo-chevron">${ICONS.chevronRight}</span>
        </button>
        ${aberto ? `<div class="card flush manual-list">${cards}</div>` : ""}
      </section>`;
  }).join("");
}

/* Sub-abas de "Meu perfil" (secretaria e professor). */
function perfilSubNavHtml(abas){
  const ativa = abas.some(a => a.key === state.perfilSubTab) ? state.perfilSubTab : abas[0].key;
  return `<div class="subtab-bar">${abas.map(t => `
    <button type="button" class="subtab-btn ${ativa === t.key ? "active" : ""}" data-action="set-perfil-subtab" data-key="${t.key}">
      ${t.icon}<span>${t.label}</span>
    </button>`).join("")}</div>`;
}

function perfilSubTabAtiva(abas){
  return abas.some(a => a.key === state.perfilSubTab) ? state.perfilSubTab : abas[0].key;
}

function perfilSenhaCardHtml(notaRodape){
  return `
    <div class="management-card management-card-wide">
      <h3>${ICONS.shield} Trocar minha senha</h3>
      <p>Confirme a senha atual e escolha a nova. A troca vale na hora.</p>
      <div style="max-width:420px;">
        <input id="perfil-senha-atual" type="password" class="teacher-text-input" placeholder="Senha atual" autocomplete="current-password" />
        <input id="perfil-senha-nova" type="password" class="teacher-text-input" placeholder="Nova senha (mín. 6 caracteres)" autocomplete="new-password" />
        <input id="perfil-senha-confirma" type="password" class="teacher-text-input" placeholder="Repita a nova senha" autocomplete="new-password" />
        <button class="teacher-primary-btn" data-action="trocar-minha-senha" ${state.perfilSenhaTrocando ? "disabled" : ""}>${state.perfilSenhaTrocando ? "Salvando…" : "Salvar nova senha"}</button>
      </div>
      ${state.perfilSenhaErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.perfilSenhaErro)}</p>` : ""}
      ${state.perfilSenhaMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.perfilSenhaMensagem)}</p>` : ""}
      <p class="section-eyebrow" style="margin-top:12px;">${notaRodape}</p>
    </div>`;
}

function perfilInstituicaoView(school){
  const nome = (state.perfil?.nome || "").trim();
  const email = state.authUser?.email || "—";

  const escolasVinculadas = Object.values(state.data.escolas || {}).map(e => e.nome).filter(Boolean);
  const chipsEscolas = (escolasVinculadas.length ? escolasVinculadas : [school?.nome || "—"])
    .map(n => `<span class="perfil-chip">${ICONS.pinSmall} ${escapeHtml(n)}</span>`).join("");

  const totalManuais = MANUAIS_INSTITUICAO.length;
  const prontos = MANUAIS_INSTITUICAO.filter(m => m.url && m.url !== "#").length;

  const abas = [
    { key: "dados", label: "Meus dados", icon: ICONS.user },
    { key: "senha", label: "Trocar minha senha", icon: ICONS.key },
    { key: "ficha", label: "Minha ficha", icon: ICONS.shield },
    { key: "manuais", label: "Manuais e materiais", icon: ICONS.book },
  ];
  const ativa = perfilSubTabAtiva(abas);

  let corpo = "";
  if(ativa === "dados"){
    corpo = `
      <div class="management-card management-card-wide">
        <h3>${ICONS.user} Meus dados</h3>
        <p>Como seu nome aparece para o resto da equipe e da escola.</p>
        <div style="max-width:420px;">
          <label class="teacher-label" for="profile-name-input">Nome completo</label>
          <input id="profile-name-input" class="teacher-text-input" placeholder="Seu nome completo" value="${escapeHtml(state.perfilNomeInput || "")}" />
          <button class="teacher-primary-btn" data-action="save-profile-name" ${state.perfilNomeSalvando ? "disabled" : ""}>${state.perfilNomeSalvando ? "Salvando…" : (nome ? "Atualizar nome" : "Salvar nome")}</button>
        </div>
        ${state.perfilNomeErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.perfilNomeErro)}</p>` : ""}
        <dl class="perfil-dados">
          <div><dt>E-mail de acesso</dt><dd>${escapeHtml(email)}</dd></div>
          <div><dt>Tipo de acesso</dt><dd>Equipe administrativa</dd></div>
        </dl>
      </div>

      <div class="perfil-atalhos">
        <div class="perfil-atalho">
          <span class="perfil-atalho-icon">${ICONS.key}</span>
          <div class="perfil-atalho-texto">
            <strong>Senhas da escola</strong>
            <span>Trocar senha de aluno, professor ou responsável, ou excluir um cadastro.</span>
          </div>
          <button class="teacher-primary-btn" data-action="ir-para-acessos">Abrir</button>
        </div>
        <div class="perfil-atalho">
          <span class="perfil-atalho-icon">${ICONS.lifebuoy}</span>
          <div class="perfil-atalho-texto">
            <strong>Suporte técnico</strong>
            <span>Erro na tela, acesso travado ou dado que não salva? WhatsApp ou ${escapeHtml(SUPORTE_TECNICO.email)}.</span>
          </div>
          <button class="teacher-primary-btn" data-action="whatsapp-suporte">WhatsApp</button>
        </div>
      </div>`;
  } else if(ativa === "senha"){
    corpo = perfilSenhaCardHtml("Esqueceu a senha atual? Não mandamos link por e-mail — fale com o suporte (aba “Meus dados”).");
  } else if(ativa === "ficha"){
    corpo = fichaFormCardHtml();
  } else {
    corpo = `
      <div class="manuais-cabecalho">
        <h2 class="section-title">Manuais e materiais de apoio</h2>
        <span class="manuais-progresso">${prontos} de ${totalManuais} prontos</span>
      </div>
      <p class="section-eyebrow">Guias para o dia a dia da equipe. Toque em um assunto para ver os guias. Os marcados como "Em breve" ainda serão produzidos.</p>
      ${manuaisAgrupadosHtml()}`;
  }

  return `
    <h2 class="section-title">Meu perfil</h2>
    <p class="section-eyebrow">Seus dados de acesso, ficha pessoal e materiais de apoio da equipe.</p>

    <section class="perfil-hero">
      <div class="perfil-hero-foto">${avatarHtml(fotoSecretariaDaEscola(school), iniciaisDoNome(nome || "Equipe"), "avatar-foto-perfil")}</div>
      <div class="perfil-hero-info">
        <span class="perfil-hero-badge">Equipe administrativa</span>
        <h2>${nome ? escapeHtml(nome) : "Adicione seu nome"}</h2>
        <p>${escapeHtml(email)}</p>
        <div class="perfil-chips">${chipsEscolas}</div>
      </div>
    </section>

    ${perfilSubNavHtml(abas)}
    ${corpo}`;
}

/* Troca o tipo de cadastro em Gestão > Criar cadastro (aluno, responsável,
   professor, equipe). Usado pelos botões de tipo. */
/* Gera sozinho o e-mail de acesso e a senha provisória do formulário
   "Criar cadastro" (Gestão). Aluno e responsável usam o mesmo padrão dos
   contratos (nome.sobrenome@alunoeduca.app / @responsaveleduca.app, pulando
   os já usados na unidade). Professor e equipe usam e-mail próprio, então
   só a senha é gerada pra eles. Nunca sobrescreve o que a secretaria
   digitou, a menos que `novoLogin` seja true (botão "Gerar outro"). */
function sugerirAcessoNovoUsuario({ novoLogin = false } = {}){
  const role = state.novoUsuarioRole;
  if(role === "aluno" && ehTurmaDeRecreacao(state.novoUsuarioTurma)) return;
  const nome = (state.novoUsuarioNome || "").trim();
  const dominio = role === "aluno" ? DOMINIO_ALUNO : role === "responsavel" ? DOMINIO_RESPONSAVEL : "";

  if(dominio && nome && (novoLogin || !state.novoUsuarioEmailManual)){
    const usados = emailsUsadosDaUnidade();
    if(novoLogin && state.novoUsuarioEmail) usados.push(state.novoUsuarioEmail);
    state.novoUsuarioEmail = escolherEmailLivre(nome, dominio, usados);
    state.novoUsuarioEmailManual = false;
  }
  if(novoLogin || !state.novoUsuarioSenha){
    state.novoUsuarioSenha = senhaProvisoria();
  }
}

async function mudarPapelNovoUsuario(papel){
  state.novoUsuarioRole = papel;
  state.instituicaoErro = "";
  // cada tipo tem seu domínio de login: recomeça e gera de novo
  state.novoUsuarioEmail = "";
  state.novoUsuarioSenha = "";
  state.novoUsuarioEmailManual = false;
  sugerirAcessoNovoUsuario();
  if(papel === "responsavel" && state.escolaSelecionadaId){
    await carregarAlunosParaVinculo(state.escolaSelecionadaId);
  }
  if(papel === "professor" && state.novoUsuarioEscolasIds.length === 0 && state.escolaSelecionadaId){
    // começa marcado só na unidade atual; a secretaria desmarca/marca
    // outras se o professor também der aula nelas.
    state.novoUsuarioEscolasIds = [state.escolaSelecionadaId];
  }
  render();
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
          sexo: dados.sexo || "",
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
          sexo: d.data().sexo || "",
          disciplinas: Array.isArray(d.data().disciplinas) ? d.data().disciplinas : [],
        });
      });
    }
    state.gestaoProfessores = Array.from(profPorUid.values());

    // Aniversário e telefone vêm da ficha pessoal (usuarios/{uid}.ficha) —
    // alimentam a aba "Aniversários". Falha de um não derruba os outros.
    await Promise.allSettled(state.gestaoProfessores.map(async (p) => {
      try {
        const snap = await getDoc(doc(db, "usuarios", p.id));
        const ficha = (snap.exists() && snap.data().ficha) || {};
        p.nascimento = typeof ficha.nascimento === "string" ? ficha.nascimento : "";
        p.telefone = typeof ficha.telefone === "string" ? ficha.telefone : "";
      } catch(_e){ p.nascimento = ""; p.telefone = ""; }
    }));

    state.gestaoResponsaveis = respR.status === "fulfilled"
      ? respR.value.docs.map(d => ({
          id: d.id,
          nome: d.data().nome || "Responsável",
          contato: d.data().contato || "",
          email: d.data().email || "",
          alunosIds: Array.isArray(d.data().alunosIds) ? d.data().alunosIds : [],
          uid: d.data().uid || null,
          parentesco: d.data().parentesco || "",
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

/* Troca o nome do aluno nos lugares que guardam o NOME (e não o id):
   a lista da turma (turmas.alunos), o resumo da escola, o login
   (usuarios/{uid}.nome) e o alunoKey/alunoNome dos registros que o
   aluno/responsável lê (presenças, notas, certificados, boletim).
   Tudo isso depois do nome principal já ter sido salvo em alunos/{id};
   o que falhar aqui só é registrado no console, sem travar a edição.
   Obs.: as chamadas antigas dentro de registrosAula/atividades
   (mapas indexados pelo nome) continuam com o nome antigo. */
async function propagarNovoNomeDoAluno(aluno, nomeAntigo, nomeNovo){
  const escolaId = state.escolaSelecionadaId;
  const alvo = normalizarNome(nomeAntigo);

  // 1) Turmas: troca a grafia antiga pela nova mantendo a posição.
  const turmas = (state.instTurmas || []).filter(t => (t.alunos || []).some(n => normalizarNome(n) === alvo));
  await Promise.all(turmas.map(async t => {
    const novaLista = (t.alunos || []).map(n => normalizarNome(n) === alvo ? nomeNovo : n);
    try {
      await updateDoc(doc(db, "turmas", t.id), { alunos: novaLista });
      t.alunos = novaLista;
    } catch(e){ console.warn("Não consegui atualizar o nome na turma", t.id, e?.code || e); }
  }));

  // 2) Resumo da escola (escolas/{id}.alunos: [{ nome, turma }])
  try {
    await updateDoc(doc(db, "escolas", escolaId), { alunos: arrayRemove({ nome: nomeAntigo, turma: aluno.turma }) });
    await updateDoc(doc(db, "escolas", escolaId), { alunos: arrayUnion({ nome: nomeNovo, turma: aluno.turma }) });
  } catch(e){ console.warn("Não consegui atualizar o resumo da escola:", e?.code || e); }

  // 3) Login do aluno
  try {
    const uid = aluno.uid || await descobrirUidDoAluno(aluno.id);
    if(uid) await updateDoc(doc(db, "usuarios", uid), { nome: nomeNovo });
  } catch(e){ console.warn("Não consegui atualizar o nome no login:", e?.code || e); }

  // 4) Registros que o aluno/responsável lê pela chave "escolaId:nome"
  const chaveAntiga = chaveAluno(escolaId, nomeAntigo);
  const chaveNova = chaveAluno(escolaId, nomeNovo);
  for(const colecao of ["presencasAluno", "notasAluno", "certificadosAluno", "boletinsIngles"]){
    try {
      const snap = await getDocs(query(collection(db, colecao), where("escolaId", "==", escolaId), where("alunoKey", "==", chaveAntiga)));
      await Promise.all(snap.docs.map(d => updateDoc(d.ref, { alunoKey: chaveNova, alunoNome: nomeNovo })));
    } catch(e){ console.warn(`Não consegui atualizar ${colecao}:`, e?.code || e); }
  }
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


/* Busca em "atividades" TODAS as atividades já lançadas pra essa turma
   (as duas etapas juntas) — filtramos o bimestre no cliente pra não
   depender de índice composto no Firestore, do mesmo jeito que outras
   consultas do app preferem trazer um pouco mais de dado a exigir um
   índice extra (ver comentário de carregarEquipeDaEscola). */
async function carregarAtividadesDaTurma(turma){
  state.professorAtividadesCarregando = true;
  state.professorAtividadesErro = "";
  render();
  try {
    const snap = await getDocs(query(collection(db, "atividades"), where("turmaId", "==", turma.id)));
    state.professorAtividadesTodas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(err){
    state.professorAtividadesTodas = [];
    state.professorAtividadesErro = "Não foi possível carregar as notas já lançadas para esta turma. Tente selecioná-la de novo.";
  } finally {
    state.professorAtividadesCarregando = false;
    render();
  }
}

/* Salva (ou corrige, se atividadeIdExistente vier preenchido) uma
   atividade e as notas da turma toda pra ela. Grava o documento
   "mestre" em "atividades" e, junto, uma cópia por aluno em
   "notasAluno" — é essa cópia que o boletim (aluno/responsável) lê,
   igual o padrão já usado pra presença (ver sincronizarCalendarioDaChamada).
   Quem ficou sem nota (campo em branco) não entra no documento mestre e
   tem a cópia em "notasAluno" apagada, caso já existisse de uma edição
   anterior. */
async function salvarAtividade(turma, bimestre, nome, notasPorAluno, atividadeIdExistente){
  const atividadeId = atividadeIdExistente || doc(collection(db, "atividades")).id;
  const agora = new Date().toISOString();
  const dataAtividade = dataDeHojeISO();

  await setDoc(doc(db, "atividades", atividadeId), {
    turmaId: turma.id,
    turmaNome: turma.nome || "",
    professorId: state.authUser.uid,
    professorNome: state.data.professorNome || "",
    escolaId: turma.escolaId,
    disciplina: turma.disciplina,
    bimestre,
    nome,
    data: dataAtividade,
    notas: notasPorAluno,
    atualizadoEm: agora,
  });

  const nomes = turma.alunos || [];
  for(let i = 0; i < nomes.length; i += 400){   // um lote do Firestore aceita até 500 gravações
    const lote = writeBatch(db);
    nomes.slice(i, i + 400).forEach((aluno, j) => {
      const ref = doc(db, "notasAluno", `${atividadeId}_${slugNome(aluno, `aluno${i + j}`)}`);
      const nota = notasPorAluno[aluno];
      if(nota === undefined){
        lote.delete(ref);   // sem nota pra esse aluno (ou foi apagada numa correção) — some do boletim dele
        return;
      }
      lote.set(ref, {
        alunoKey: chaveAluno(turma.escolaId, aluno),
        alunoNome: aluno,
        escolaId: turma.escolaId,
        turmaId: turma.id,
        turmaNome: turma.nome || "",
        disciplina: turma.disciplina,
        bimestre,
        atividadeId,
        atividadeNome: nome,
        nota,
        professorId: state.authUser.uid,
        professorNome: state.data.professorNome || "",
        atualizadoEm: agora,
      });
    });
    await lote.commit();
  }

  return { id: atividadeId, turmaId: turma.id, bimestre, nome, data: dataAtividade, notas: notasPorAluno, atualizadoEm: agora };
}

/* Apaga uma atividade e a cópia de cada aluno em "notasAluno". */
async function excluirAtividade(turma, atividadeId){
  await deleteDoc(doc(db, "atividades", atividadeId));
  const nomes = turma.alunos || [];
  for(let i = 0; i < nomes.length; i += 400){
    const lote = writeBatch(db);
    nomes.slice(i, i + 400).forEach((aluno, j) => {
      lote.delete(doc(db, "notasAluno", `${atividadeId}_${slugNome(aluno, `aluno${i + j}`)}`));
    });
    await lote.commit();
  }
}

/* Painel "Médias da turma", na aba do professor: para cada aluno, a
   média de cada bimestre e a média final (as duas etapas juntas),
   calculadas em cima de todas as atividades já lançadas na turma. */
function professorResumoMediasHtml(turma, atividades){
  if(!atividades.length) return "";
  const bim1 = atividades.filter(a => Number(a.bimestre) === 1);
  const bim2 = atividades.filter(a => Number(a.bimestre) === 2);
  const fmt = v => v === null ? "—" : v.toFixed(1);
  const cor = v => v === null ? "var(--slate)" : (v >= 7 ? "var(--green)" : "var(--red)");
  const linhas = (turma.alunos || []).map(aluno => {
    const m1 = mediaDeNotas(bim1.map(a => a.notas ? a.notas[aluno] : undefined));
    const m2 = mediaDeNotas(bim2.map(a => a.notas ? a.notas[aluno] : undefined));
    const final = (m1 !== null && m2 !== null) ? (m1 + m2) / 2 : null;
    return `
      <div class="row">
        <span style="font-size:14px;color:var(--ink);font-weight:500;">${escapeHtml(aluno)}</span>
        <span style="display:flex;gap:16px;font-size:13px;">
          <span style="color:${cor(m1)};">1º: <strong>${fmt(m1)}</strong></span>
          <span style="color:${cor(m2)};">2º: <strong>${fmt(m2)}</strong></span>
          <span style="color:${cor(final)};">Final: <strong>${fmt(final)}</strong></span>
        </span>
      </div>`;
  }).join("");
  return `
    <h3 style="margin-top:28px;">Médias da turma</h3>
    <p class="section-eyebrow">Calculadas em cima de todas as atividades já lançadas nas duas etapas.</p>
    <div class="card flush">${linhas}</div>`;
}

/* ==================================================================
   Contratos guardados no sistema (PDF salvo)
   ------------------------------------------------------------------
   Cada contrato em PDF vira um documento em `contratos/{id}` (só os
   dados: aluno, unidade, nome do arquivo, situação, datas) e o PDF em
   si fica em `contratosArquivos/{id}_{n}`, cortado em pedaços de ~700 KB
   (base64) porque o Firestore recusa documento acima de 1 MiB e o app
   não usa Storage. Um aluno pode ter vários contratos (ex.: renovação,
   segundo curso), cada um com a sua situação:
     contratos/{id}
       alunoId, escolaId, nome (arquivo), tamanho, partes,
       status: "pendente" | "assinado", criadoEm, assinadoEm, enviadoEm
     contratosArquivos/{id}_{n}
       contratoId, alunoId, escolaId, ordem, parte (texto base64)
   O campo `contratoStatus` do aluno continua existindo (as Estatísticas
   dependem dele) e passa a ser o RESUMO dos contratos salvos: "pendente"
   se algum ainda não foi assinado, senão "assinado". `contratosSalvos`
   guarda quantos PDFs o aluno tem salvos.
   ================================================================== */
const CONTRATO_PDF_TAMANHO_MAX = 4 * 1024 * 1024;   // 4 MB por PDF
const CONTRATO_PARTE_TAMANHO = 700000;               // caracteres base64 por documento
const CONTRATO_PAGINAS_MAX = 40;                     // páginas desenhadas no visualizador
let contratoVisToken = 0;                            // cancela a abertura se o visualizador fechar antes

function normalizeContrato(id, d){
  return {
    id,
    alunoId: d.alunoId || "",
    escolaId: d.escolaId || "",
    nome: d.nome || "contrato.pdf",
    tamanho: Number(d.tamanho) || 0,
    partes: Number(d.partes) || 1,
    status: d.status === "assinado" ? "assinado" : "pendente",
    criadoEm: d.criadoEm || "",
    assinadoEm: d.assinadoEm || "",
    enviadoEm: d.enviadoEm || "",
  };
}

function ordenarContratos(lista){
  return lista.slice().sort((a, b) =>
    String(b.criadoEm).localeCompare(String(a.criadoEm)) || a.nome.localeCompare(b.nome));
}

function tamanhoLegivel(bytes){
  if(bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function contratosDoAluno(alunoId){
  return state.contratosInst.itens.filter(c => c.alunoId === alunoId);
}

function acharContratoSalvo(id){
  const naEscola = state.contratosInst.itens.find(c => c.id === id);
  if(naEscola) return naEscola;
  for(const k of Object.keys(state.contratosFam)){
    const achou = (state.contratosFam[k].itens || []).find(c => c.id === id);
    if(achou) return achou;
  }
  return null;
}

function contratosResetar(){
  contratoVisFechar();
  state.contratosInst = { escolaId: null, itens: [], carregando: false, carregado: false, erro: "" };
  state.contratosFam = {};
  state.contratoUpStatus = "pendente";
  state.contratoUpEnviando = false;
  state.contratoUpMsg = "";
  state.contratoUpErro = "";
  state.contratoOcupado = {};
}

function textoErroContratos(err, ehEquipe){
  if(err?.code === "permission-denied"){
    return ehEquipe
      ? "O Firestore recusou a leitura dos contratos (permission-denied). Publique as regras de `contratos` e `contratosArquivos` (arquivo firestore-contratos.rules)."
      : "Não foi possível abrir os contratos agora. Fale com a secretaria.";
  }
  return `Não consegui carregar os contratos${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
}

/* ---------- carregar listas (só os dados, sem o PDF) ---------- */
async function carregarContratosDaEscola(escolaId, forcar = false){
  const c = state.contratosInst;
  if(!escolaId || c.carregando) return;
  if(!forcar && c.carregado && c.escolaId === escolaId) return;
  c.carregando = true; c.erro = "";
  render();
  try {
    const snaps = await getDocs(query(collection(db, "contratos"), where("escolaId", "==", escolaId)));
    c.itens = snaps.docs.map(d => normalizeContrato(d.id, d.data()));
    c.escolaId = escolaId;
    c.carregado = true;
  } catch(err){
    console.error("Erro ao carregar contratos:", err);
    c.itens = []; c.carregado = false;
    c.erro = textoErroContratos(err, true);
  } finally {
    c.carregando = false;
    render();
  }
}

async function carregarContratosDoAluno(alunoId, forcar = false){
  if(!alunoId) return;
  const atual = state.contratosFam[alunoId];
  if(atual && (atual.carregando || (atual.carregado && !forcar))) return;
  state.contratosFam[alunoId] = { itens: atual?.itens || [], carregando: true, carregado: false, erro: "" };
  render();
  try {
    const snaps = await getDocs(query(collection(db, "contratos"), where("alunoId", "==", alunoId)));
    state.contratosFam[alunoId] = {
      itens: snaps.docs.map(d => normalizeContrato(d.id, d.data())),
      carregando: false, carregado: true, erro: "",
    };
  } catch(err){
    console.error("Erro ao carregar contratos do aluno:", err);
    state.contratosFam[alunoId] = { itens: [], carregando: false, carregado: false, erro: textoErroContratos(err, false) };
  }
  render();
}

/* ---------- gravar / ler o PDF ---------- */
function validarArquivoContrato(arquivo){
  const ehPdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name || "");
  if(!ehPdf) return `"${arquivo.name}" não é um PDF.`;
  if(arquivo.size > CONTRATO_PDF_TAMANHO_MAX){
    return `"${arquivo.name}" tem ${tamanhoLegivel(arquivo.size)} e o limite é ${tamanhoLegivel(CONTRATO_PDF_TAMANHO_MAX)}. Digitalize em resolução menor ou comprima o PDF.`;
  }
  return "";
}

async function salvarContratoPdf({ alunoId, escolaId, arquivo, status, enviadoEm = "" }){
  const dados = await lerArquivoComoDataUrl(arquivo);
  const partes = [];
  for(let i = 0; i < dados.length; i += CONTRATO_PARTE_TAMANHO) partes.push(dados.slice(i, i + CONTRATO_PARTE_TAMANHO));
  const ref = doc(collection(db, "contratos"));
  const hoje = dataDeHojeISO();
  const assinado = status === "assinado";
  const meta = {
    alunoId, escolaId,
    nome: arquivo.name || "contrato.pdf",
    tamanho: arquivo.size,
    partes: partes.length,
    status: assinado ? "assinado" : "pendente",
    criadoEm: hoje,
    assinadoEm: assinado ? hoje : "",
    enviadoEm: enviadoEm || "",
    criadoPor: state.authUser?.uid || "",
  };
  // tudo ou nada: ou o contrato e todos os pedaços entram, ou nada entra
  const batch = writeBatch(db);
  partes.forEach((parte, i) => {
    batch.set(doc(db, "contratosArquivos", `${ref.id}_${i}`), { contratoId: ref.id, alunoId, escolaId, ordem: i, parte });
  });
  batch.set(ref, meta);
  await batch.commit();
  return normalizeContrato(ref.id, meta);
}

async function lerDataUrlDoContrato(meta){
  const snaps = await Promise.all(
    Array.from({ length: meta.partes || 1 }, (_, i) => getDoc(doc(db, "contratosArquivos", `${meta.id}_${i}`)))
  );
  if(snaps.some(s => !s.exists())) throw new Error("contrato-incompleto");
  return snaps.map(s => s.data().parte).join("");
}

function dataUrlParaBlob(dataUrl){
  const [cabecalho, base64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(cabecalho)?.[1] || "application/pdf";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function arquivoDoContratoSalvo(meta){
  const blob = dataUrlParaBlob(await lerDataUrlDoContrato(meta));
  return new File([blob], meta.nome, { type: "application/pdf" });
}

async function baixarContratoSalvo(meta){
  const arquivo = await arquivoDoContratoSalvo(meta);
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url; a.download = meta.nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- resumo no cadastro do aluno ---------- */
async function sincronizarResumoContratos(alunoId, escolaId){
  const snaps = await getDocs(query(
    collection(db, "contratos"),
    where("escolaId", "==", escolaId),
    where("alunoId", "==", alunoId),
  ));
  const lista = snaps.docs.map(d => normalizeContrato(d.id, d.data()));
  const dados = { contratosSalvos: lista.length };
  if(lista.some(c => c.status === "pendente")) dados.contratoStatus = "pendente";
  else if(lista.length) dados.contratoStatus = "assinado";
  await updateDoc(doc(db, "alunos", alunoId), dados);
  const aluno = (state.instAlunos || []).find(a => a.id === alunoId);
  if(aluno) Object.assign(aluno, dados);
  const c = state.contratosInst;
  if(c.escolaId === escolaId) c.itens = c.itens.filter(x => x.alunoId !== alunoId).concat(lista);
}

async function anexarContratosDoAluno(aluno, arquivos){
  const escolaId = state.escolaSelecionadaId;
  const status = state.contratoUpStatus;
  state.contratoUpEnviando = true; state.contratoUpErro = ""; state.contratoUpMsg = "";
  render();
  let salvos = 0;
  const erros = [];
  for(const arq of arquivos){
    const problema = validarArquivoContrato(arq);
    if(problema){ erros.push(problema); continue; }
    try {
      await salvarContratoPdf({ alunoId: aluno.id, escolaId, arquivo: arq, status });
      salvos++;
    } catch(err){
      console.error("Erro ao salvar contrato:", arq.name, err);
      erros.push(`Não consegui salvar "${arq.name}"${err?.code ? ` (${err.code})` : ""}.`);
    }
  }
  if(salvos){
    try { await sincronizarResumoContratos(aluno.id, escolaId); }
    catch(err){ console.warn("Contratos salvos, mas não atualizei o resumo do aluno:", err?.code || err); }
  }
  state.contratoUpMsg = salvos ? `${salvos} contrato${salvos > 1 ? "s salvos" : " salvo"} no cadastro de ${aluno.nome}.` : "";
  state.contratoUpErro = erros.join(" ");
  state.contratoUpEnviando = false;
  render();
}

async function marcarContratoSalvoAssinado(meta){
  await updateDoc(doc(db, "contratos", meta.id), { status: "assinado", assinadoEm: dataDeHojeISO() });
  await sincronizarResumoContratos(meta.alunoId, meta.escolaId);
}

async function marcarContratoSalvoEnviado(meta){
  try {
    await updateDoc(doc(db, "contratos", meta.id), { enviadoEm: dataDeHojeISO() });
    meta.enviadoEm = dataDeHojeISO();
    await marcarContratoEnviado(meta.alunoId);
  } catch(err){
    console.warn("Não consegui registrar o envio do contrato:", err?.code || err);
  }
}

async function excluirContratoSalvo(meta){
  const batch = writeBatch(db);
  for(let i = 0; i < (meta.partes || 1); i++) batch.delete(doc(db, "contratosArquivos", `${meta.id}_${i}`));
  batch.delete(doc(db, "contratos", meta.id));
  await batch.commit();
  await sincronizarResumoContratos(meta.alunoId, meta.escolaId);
}

/* Usado ao excluir o aluno: leva junto todos os contratos dele. */
async function apagarContratosDoAluno(alunoId, escolaId){
  const snaps = await getDocs(query(
    collection(db, "contratos"),
    where("escolaId", "==", escolaId),
    where("alunoId", "==", alunoId),
  ));
  for(const d of snaps.docs){
    const batch = writeBatch(db);
    for(let i = 0; i < (Number(d.data().partes) || 1); i++) batch.delete(doc(db, "contratosArquivos", `${d.id}_${i}`));
    batch.delete(d.ref);
    await batch.commit();
  }
  state.contratosInst.itens = state.contratosInst.itens.filter(c => c.alunoId !== alunoId);
}

/* ---------- visualizador dentro do app ---------- */
function contratoVisFechar(){
  contratoVisToken++;
  if(state.contratoVis?.blobUrl) URL.revokeObjectURL(state.contratoVis.blobUrl);
  state.contratoVis = null;
}

/* Abre o PDF numa janela do próprio app. As páginas são desenhadas com o
   PDF.js (que já é carregado pra importação) e guardadas como imagem, o
   que funciona igual no celular — onde um <iframe> de PDF costuma mostrar
   só a primeira página. */
async function abrirContratoNoApp(meta){
  contratoVisFechar();
  const token = contratoVisToken;
  state.contratoVis = {
    id: meta.id, nome: meta.nome, status: meta.status, assinadoEm: meta.assinadoEm,
    carregando: true, erro: "", progresso: "", paginas: [], totalPaginas: 0, blobUrl: "",
  };
  render();
  try {
    const blob = dataUrlParaBlob(await lerDataUrlDoContrato(meta));
    if(token !== contratoVisToken) return;
    state.contratoVis.blobUrl = URL.createObjectURL(blob);
    if(window.pdfjsLib){
      const pdf = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
      state.contratoVis.totalPaginas = pdf.numPages;
      const paginas = [];
      for(let p = 1; p <= Math.min(pdf.numPages, CONTRATO_PAGINAS_MAX); p++){
        if(token !== contratoVisToken) return;
        state.contratoVis.progresso = `Preparando página ${p} de ${Math.min(pdf.numPages, CONTRATO_PAGINAS_MAX)}…`;
        if(p > 1) render();
        const page = await pdf.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1000 / base.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        paginas.push(canvas.toDataURL("image/jpeg", 0.85));
      }
      if(token !== contratoVisToken) return;
      state.contratoVis.paginas = paginas;
    }
  } catch(err){
    console.error("Erro ao abrir contrato:", err);
    if(token !== contratoVisToken) return;
    state.contratoVis.erro = err?.code === "permission-denied"
      ? "Você não tem permissão para abrir este contrato."
      : "Não consegui abrir este contrato agora. Tente de novo.";
  }
  if(token !== contratoVisToken) return;
  state.contratoVis.carregando = false;
  render();
}

function contratoVisualizadorModal(){
  const v = state.contratoVis;
  if(!v) return "";
  let corpo;
  if(v.carregando){
    corpo = `<p class="contrato-vis-aviso">${escapeHtml(v.progresso || "Abrindo contrato…")}</p>`;
  } else if(v.erro){
    corpo = `<p class="contrato-vis-aviso" style="color:var(--red);">${escapeHtml(v.erro)}</p>`;
  } else if(v.paginas.length){
    corpo = v.paginas.map((src, i) => `<img class="contrato-vis-pagina" src="${src}" alt="Página ${i + 1} do contrato" />`).join("")
      + (v.totalPaginas > v.paginas.length ? `<p class="contrato-vis-aviso">Mostrando as primeiras ${v.paginas.length} de ${v.totalPaginas} páginas. Baixe o PDF para ver o resto.</p>` : "");
  } else {
    corpo = `<p class="contrato-vis-aviso">Não deu para mostrar o contrato aqui. Use “Baixar PDF” ou “Abrir em outra aba”.</p>`;
  }
  const pill = v.status === "assinado"
    ? `<span class="pill pill-green">Assinado${v.assinadoEm ? ` em ${escapeHtml(formatarDataBr(v.assinadoEm))}` : ""}</span>`
    : `<span class="pill pill-gold">Aguardando assinatura</span>`;
  const acoesArquivo = v.blobUrl ? `
        <a class="btn-secondary contrato-vis-link" href="${escapeHtml(v.blobUrl)}" download="${escapeHtml(v.nome)}">Baixar PDF</a>
        <a class="btn-secondary contrato-vis-link" href="${escapeHtml(v.blobUrl)}" target="_blank" rel="noopener">Abrir em outra aba</a>` : "";
  return `
  <div class="contrato-vis-backdrop" data-action="fechar-contrato-vis">
    <div class="contrato-vis" role="dialog" aria-modal="true" aria-label="Contrato" data-action="noop">
      <div class="contrato-vis-head">
        <div style="min-width:0;">
          <h2>${escapeHtml(v.nome)}</h2>
          ${pill}
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-contrato-vis" aria-label="Fechar">${ICONS.close}</button>
      </div>
      <div class="contrato-vis-corpo">${corpo}</div>
      ${acoesArquivo ? `<div class="contrato-vis-rodape">${acoesArquivo}</div>` : ""}
    </div>
  </div>`;
}

/* ---------- telas ---------- */
function contratoStatusPill(meta){
  return meta.status === "assinado"
    ? `<span class="pill pill-green">Assinado${meta.assinadoEm ? ` em ${escapeHtml(formatarDataBr(meta.assinadoEm))}` : ""}</span>`
    : `<span class="pill pill-gold">Aguardando assinatura</span>`;
}

/* Uma linha de contrato salvo, com as ações da secretaria. */
function contratoItemHtml(meta, { nomeAluno = "" } = {}){
  const ocupado = !!state.contratoOcupado[meta.id];
  const pendente = meta.status === "pendente";
  const msg = state.contratoEnvioMsg[meta.id];
  const enviado = meta.enviadoEm ? ` · Enviado em ${escapeHtml(formatarDataBr(meta.enviadoEm))}` : (pendente ? " · Ainda não enviado" : "");
  return `
    <div class="pendente-contrato-item">
      <div class="pendente-contrato-info">
        <strong>${escapeHtml(nomeAluno || meta.nome)}</strong>
        <span>${nomeAluno ? `${escapeHtml(meta.nome)} · ` : ""}Salvo em ${meta.criadoEm ? escapeHtml(formatarDataBr(meta.criadoEm)) : "—"} · ${escapeHtml(tamanhoLegivel(meta.tamanho))}${enviado}</span>
        <span>${contratoStatusPill(meta)}</span>
        ${msg ? `<span class="pendente-contrato-msg">${escapeHtml(msg)}</span>` : ""}
      </div>
      <div class="pendente-contrato-acoes">
        <button type="button" class="aniversario-btn" data-action="ver-contrato" data-id="${escapeHtml(meta.id)}" ${ocupado ? "disabled" : ""}>Ver contrato</button>
        ${pendente ? `
        <button type="button" class="aniversario-btn" data-action="contrato-salvo-enviar" data-id="${escapeHtml(meta.id)}" ${ocupado ? "disabled" : ""}>${ocupado ? "Aguarde…" : "Enviar no WhatsApp"}</button>
        <button type="button" class="pendente-contrato-assinado" data-action="contrato-salvo-assinado" data-id="${escapeHtml(meta.id)}" ${ocupado ? "disabled" : ""}>Marcar como assinado</button>` : ""}
        <button type="button" class="attendance-btn" data-action="contrato-salvo-excluir" data-id="${escapeHtml(meta.id)}" aria-label="Excluir contrato" title="Excluir contrato" ${ocupado ? "disabled" : ""}>${ICONS.trash}</button>
      </div>
    </div>`;
}

/* Seção "Contratos" da ficha do aluno (secretaria). */
function contratosAlunoSection(aluno){
  const c = state.contratosInst;
  let lista;
  if(c.erro){
    lista = `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin:6px 0;">${escapeHtml(c.erro)}</p>`;
  } else if(!c.carregado){
    lista = `<p class="section-eyebrow" style="margin:6px 0;">Carregando contratos…</p>`;
  } else {
    const itens = ordenarContratos(contratosDoAluno(aluno.id));
    lista = itens.length
      ? `<div class="pendente-contrato-lista">${itens.map(m => contratoItemHtml(m)).join("")}</div>`
      : `<div class="contrato-aviso">
           <strong>Nenhum contrato salvo para este aluno.</strong>
           Anexe o PDF abaixo para ele ficar guardado no sistema — os responsáveis passam a ver na aba Contratos do app.
           ${aluno.contratoStatus ? `<br>Situação registrada antes: ${aluno.contratoStatus === "assinado" ? "assinado" : "aguardando assinatura"} (sem o PDF guardado).` : ""}
         </div>`;
  }
  return `
      <div class="aluno-modal-section">
        <h3 class="teacher-label">Contratos</h3>
        ${lista}
        <div class="contrato-anexar-bloco">
          <label class="teacher-label" for="contrato-up-status" style="display:block;">Situação dos PDFs que vai anexar</label>
          <select id="contrato-up-status" class="teacher-text-input">
            <option value="pendente" ${state.contratoUpStatus === "pendente" ? "selected" : ""}>Aguardando assinatura</option>
            <option value="assinado" ${state.contratoUpStatus === "assinado" ? "selected" : ""}>Já assinado</option>
          </select>
          <label class="pendente-contrato-anexar" style="margin-top:10px;max-width:none;${state.contratoUpEnviando ? "opacity:.6;pointer-events:none;" : ""}">
            ${ICONS.upload} <span>${state.contratoUpEnviando ? "Salvando…" : "Anexar contrato(s) em PDF"}</span>
            <input type="file" accept="application/pdf" multiple data-contrato-anexo="${escapeHtml(aluno.id)}" style="display:none;" />
          </label>
          <p class="section-eyebrow" style="margin:6px 0 0;">Dá para escolher mais de um PDF de uma vez. Até ${escapeHtml(tamanhoLegivel(CONTRATO_PDF_TAMANHO_MAX))} cada.</p>
          ${state.contratoUpErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.contratoUpErro)}</p>` : ""}
          ${state.contratoUpMsg ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.contratoUpMsg)}</p>` : ""}
        </div>
      </div>`;
}

/* Aba "Contratos" do responsável: lê só o que é do filho escolhido. */
function contratosFamiliaView(student){
  const cache = state.contratosFam[student.id];
  let corpo;
  if(!cache || (cache.carregando && !cache.itens.length)){
    corpo = `<div style="padding:20px;font-size:14px;color:var(--slate);">Carregando contratos…</div>`;
  } else if(cache.erro){
    corpo = `<div style="padding:20px;font-size:14px;color:var(--red);">${escapeHtml(cache.erro)}</div>`;
  } else if(!cache.itens.length){
    corpo = `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum contrato disponível no app ainda. Se você já assinou um contrato, a secretaria pode anexá-lo aqui.</div>`;
  } else {
    corpo = ordenarContratos(cache.itens).map(m => `
      <div class="row contrato-fam-item">
        <div style="min-width:0;">
          <div style="color:var(--ink);font-weight:600;font-size:14px;word-break:break-word;">${escapeHtml(m.nome)}</div>
          <div style="color:var(--slate);font-size:12.5px;margin-top:2px;">Anexado em ${m.criadoEm ? escapeHtml(formatarDataBr(m.criadoEm)) : "—"} · ${escapeHtml(tamanhoLegivel(m.tamanho))}</div>
          <div style="margin-top:6px;">${contratoStatusPill(m)}</div>
        </div>
        <div class="contrato-fam-acoes">
          <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="ver-contrato" data-id="${escapeHtml(m.id)}">Ver contrato</button>
          <button type="button" class="btn-secondary" data-action="baixar-contrato" data-id="${escapeHtml(m.id)}">Baixar PDF</button>
        </div>
      </div>`).join("");
  }
  return `
    <h2 class="section-title">Contratos</h2>
    <p class="section-eyebrow">Contratos de prestação de serviços de ${escapeHtml(student.nome)}</p>
    <div class="card flush">${corpo}</div>`;
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
      email: d.data().email || "", parentesco: d.data().parentesco || "",
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
    try { await apagarContratosDoAluno(aluno.id, escolaId); }
    catch(e){ console.warn("Não consegui apagar os contratos salvos do aluno:", e?.code || e); }
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
  if(state.aniversarioMsgsEscolaId !== escolaId){
    carregarMensagensAniversario(escolaId);
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

/* Tira o acesso (login) de um aluno SEM apagar o cadastro dele: apaga o
   login no Firebase Authentication (se a Cloud Function estiver
   publicada), apaga usuarios/{uid} (é o que impede o app de reconhecer
   o login) e limpa uid/e-mail do documento do aluno. O aluno continua
   na turma, com histórico, e o responsável segue acessando por ele.
   Devolve "ok" ou "sem-login" (não havia login pra tirar). */
async function removerLoginDoAluno(aluno){
  // Caminho principal: a Cloud Function faz tudo no servidor e acha o
  // login mesmo nos cadastros antigos, que não guardam o uid.
  try {
    const r = await chamarFuncaoAdmin("removerLoginAluno", { alunoId: aluno.id });
    aluno.uid = null;
    aluno.email = "";
    return r && r.removido ? "ok" : "sem-login";
  } catch(err){
    const code = err?.code || "";
    const semBackend = code === "functions/not-found" || code === "functions/unavailable" || code === "functions/internal";
    if(!semBackend) throw err;
  }

  // Plano B (função ainda não publicada): só dá pra agir quando o uid está
  // gravado no aluno. Sem uid não há como achar o login daqui, e fingir
  // que removeu deixaria a pessoa entrando — então avisa com um erro.
  if(!aluno.uid && !aluno.email) return "sem-login";
  if(!aluno.uid){
    const e = new Error("Login antigo, sem uid gravado: precisa da Cloud Function removerLoginAluno publicada.");
    e.code = "login-nao-localizado";
    throw e;
  }
  try { await excluirLoginDeOutroUsuario(aluno.uid); } catch(_e){ /* sem backend: o login fica órfão no Auth, mas sem perfil não entra */ }
  await deleteDoc(doc(db, "usuarios", aluno.uid));
  await updateDoc(doc(db, "alunos", aluno.id), { uid: deleteField(), email: "" });
  aluno.uid = null;
  aluno.email = "";
  return "ok";
}

/* Alunos da Recreação que ainda têm login (uid ou e-mail gravado). */
function alunosRecreacaoComLogin(){
  return (state.instAlunos || []).filter(a => ehTurmaDeRecreacao(a.turma) && (a.uid || a.email));
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

async function criarUsuarioNaInstituicao({ role, nome, email, senha, escolaId, escolasIds, turma, disciplinas, contato, alunosIds, nascimento, emailsAlternativos, sexo, parentesco }){
  if(role === "responsavel"){
    const novoResponsavelRef = doc(collection(db, "responsaveis"));
    await setDoc(novoResponsavelRef, {
      nome, escolaId, contato: contato || "",
      email: email || "",   // guardado pra Gestão poder reenviar senha depois
      parentesco: parentesco || "",   // "pai" | "mae" | "responsavel_legal" | ""
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
    const idAluno = await proximoIdAluno();
    const novoAlunoRef = doc(collection(db, "alunos"));
    await setDoc(novoAlunoRef, {
      nome, turma: turma || "", escolaId, contato: contato || "",
      idAluno, sexo: sexo || "",
      situacao: "ativo", matriculadoEm: dataDeHojeISO(),   // alimenta as Estatísticas
      nascimento: nascimento || "",   // usado pela aba "Aniversários"
      email: email || "",   // e-mail de acesso, pra Gestão poder redefinir a senha depois
      foto: "",
      notas: [],
      presenca: { percentual: 0, faltasMes: 0, registros: [] },
      financeiro: { mensalidades: [] },
      comunicados: [],
    });
    await updateDoc(doc(db, "escolas", escolaId), {
      alunos: arrayUnion({ nome, turma: turma || "" }),
    });

    // Aluno sem e-mail/senha fica só como cadastro, sem login — é o caso
    // da Recreação, em que quem acompanha pelo app é o responsável.
    if(!email || !senha) return { alunoId: novoAlunoRef.id, idAluno };

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
      return { alunoId: novoAlunoRef.id, idAluno, uid, email: emailFinal };
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
      usuarioDoc.sexo = sexo || "";
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
        { escolaId: id, professorId: uid, nome, email, disciplinas: disciplinas || [], sexo: sexo || "" },
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
  const resultado = { aluno: null, aluno2: null, responsavel: null, avisos };
  const precisaLoginAluno = contratoPrecisaLoginAluno(c);

  // Cada aluno do contrato (um, ou dois irmãos) passa pelo mesmo caminho:
  // cadastro (ou atualização), login, turma e situação da assinatura.
  const processarAluno = async ({ nome, nascimento, contato, emailCampo, senhaCampo }) => {
    const nomeLimpo = String(nome || "").trim();
    const emailDigitado = String(c[emailCampo] || "").trim();
    const jaCadastrado = (state.instAlunos || [])
      .find(a => normalizarNome(a.nome) === normalizarNome(nomeLimpo));

    let alunoId = jaCadastrado?.id || null;
    let acesso = null;

    if(jaCadastrado){
      await updateDoc(doc(db, "alunos", jaCadastrado.id), {
        nascimento: nascimento || jaCadastrado.nascimento || "",
        contato: contato || jaCadastrado.contato || "",
        turma: c.curso || jaCadastrado.turma || "",
      });
      avisos.push(`${nomeLimpo} já tinha cadastro nesta unidade — atualizei os dados e mantive o acesso que já existia.`);
    } else {
      const criado = await criarUsuarioNaInstituicao({
        role: "aluno",
        nome: nomeLimpo,
        turma: c.curso,
        escolaId,
        contato: contato || "",
        nascimento: nascimento || "",
        // sem e-mail/senha o aluno fica só com cadastro, sem login
        email: precisaLoginAluno ? emailDigitado : "",
        senha: precisaLoginAluno ? c[senhaCampo] : "",
        // se o login escolhido já estiver ocupado, cai pra próxima variação
        emailsAlternativos: precisaLoginAluno ? variantesDeEmail(nomeLimpo, DOMINIO_ALUNO) : [],
      });
      alunoId = criado.alunoId;
      // Decide pelo que REALMENTE aconteceu (criado.email só vem preenchido
      // se um login foi criado de verdade), não só pela regra do curso —
      // isso cobre também a importação em lote, onde a secretaria pode
      // desmarcar "criar acesso" mesmo num curso que normalmente ganharia.
      if(criado.email){
        acesso = { email: criado.email, senha: c[senhaCampo] };
        if(criado.uid) await marcarSenhaProvisoria(criado.uid);
        if(criado.email !== emailDigitado){
          avisos.push(`Já existia um login "${emailDigitado}", então ${nomeLimpo} ficou com "${criado.email}".`);
          c[emailCampo] = criado.email;
        }
      } else if(precisaLoginAluno){
        avisos.push(`${nomeLimpo} ficou sem login (nenhum e-mail foi gerado).`);
      } else {
        avisos.push(`Aluno de ${c.curso} não recebe login próprio — só o responsável acompanha pelo app.`);
      }
      // Registra na lista local (sem esperar um novo carregamento do
      // Firestore) — essencial numa importação em lote e também aqui: se
      // o segundo irmão (ou outro contrato do lote) for do mesmo
      // responsável, ele precisa achar esse aluno já criado.
      if(state.instAlunos){
        state.instAlunos.push(normalizeAluno(alunoId, {
          nome: nomeLimpo, turma: c.curso, escolaId,
          contato: contato || "", nascimento: nascimento || "",
          email: criado.email || "", uid: criado.uid || null,
        }));
      }
    }

    // --- turma ---
    if(alunoId && c.turmaId){
      const turmaEscolhida = (state.instTurmas || []).find(t => t.id === c.turmaId);
      const nomeNaTurma = jaCadastrado ? jaCadastrado.nome : nomeLimpo;
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
        avisos.push(`${nomeLimpo} já constava com contrato assinado — mantive como assinado.`);
      }
    }
    return { alunoId, acesso };
  };

  const r1 = await processarAluno({
    nome: c.alunoNome, nascimento: c.alunoNascimento, contato: c.contatoAluno,
    emailCampo: "emailAluno", senhaCampo: "senhaAluno",
  });
  resultado.aluno = r1.acesso;
  resultado.alunoId = r1.alunoId;
  const alunosIds = [r1.alunoId];
  const nomesAlunos = [String(c.alunoNome || "").trim()];

  if(contratoTemSegundoAluno(c)){
    const r2 = await processarAluno({
      nome: c.aluno2Nome, nascimento: c.aluno2Nascimento, contato: c.contatoAluno2,
      emailCampo: "emailAluno2", senhaCampo: "senhaAluno2",
    });
    resultado.aluno2 = r2.acesso;
    resultado.alunoId2 = r2.alunoId;
    alunosIds.push(r2.alunoId);
    nomesAlunos.push(String(c.aluno2Nome || "").trim());
  }
  const idsDosAlunos = alunosIds.filter(Boolean);
  const nomesDosAlunos = nomesAlunos.join(" e ");

  // --- responsável (principal + outros) ---
  // Mesmo caminho para todos: se já existe um cadastro com esse nome na
  // unidade, só vincula o(s) aluno(s) a ele; senão cria cadastro (e login,
  // quando há e-mail e senha). `parentesco` é "mae" | "pai" | "responsavel_legal".
  const processarResponsavel = async ({ nome, contato, parentesco, email, senha, aoMudarEmail }) => {
    const nomeLimpo = String(nome || "").trim();
    const emailDigitado = String(email || "").trim();
    const respExistente = (state.gestaoResponsaveis || [])
      .find(r => normalizarNome(r.nome) === normalizarNome(nomeLimpo));

    if(respExistente){
      const vinculos = [...new Set([...respExistente.alunosIds, ...idsDosAlunos])];
      await updateDoc(doc(db, "responsaveis", respExistente.id), {
        alunosIds: vinculos,
        contato: contato || respExistente.contato || "",
        ...(parentesco ? { parentesco } : {}),
      });
      if(respExistente.uid){
        await updateDoc(doc(db, "usuarios", respExistente.uid), { alunosIds: vinculos });
      }
      respExistente.alunosIds = vinculos;
      if(parentesco) respExistente.parentesco = parentesco;
      avisos.push(`${nomeLimpo} já era cadastrado(a) — vinculei ${nomesDosAlunos} ao acesso que ele(a) já tem.`);
      return null;
    }

    const criadoResp = await criarUsuarioNaInstituicao({
      role: "responsavel",
      nome: nomeLimpo,
      escolaId,
      contato: contato || "",
      parentesco: parentesco || "",
      alunosIds: idsDosAlunos,
      email: emailDigitado,
      senha,
      emailsAlternativos: variantesDeEmail(nomeLimpo, DOMINIO_RESPONSAVEL),
    });
    let acesso = null;
    if(criadoResp.email){
      acesso = { email: criadoResp.email, senha };
      if(criadoResp.uid) await marcarSenhaProvisoria(criadoResp.uid);
      if(criadoResp.email !== emailDigitado){
        avisos.push(`Já existia um login "${emailDigitado}", então ${nomeLimpo} ficou com "${criadoResp.email}".`);
        if(aoMudarEmail) aoMudarEmail(criadoResp.email);
      }
    }
    // Mesma lógica do aluno: registra localmente pra um segundo irmão,
    // já no mesmo lote, encontrar esse responsável e só vincular, em
    // vez de criar um cadastro (e um login) duplicado pra ele(a).
    if(state.gestaoResponsaveis){
      state.gestaoResponsaveis.push({
        id: criadoResp.responsavelId, nome: nomeLimpo,
        contato: contato || "", email: criadoResp.email || "",
        parentesco: parentesco || "",
        alunosIds: idsDosAlunos, uid: criadoResp.uid || null,
      });
    }
    return acesso;
  };

  if(!c.semResponsavel && c.respNome.trim()){
    resultado.responsavel = await processarResponsavel({
      nome: c.respNome, contato: c.contatoResp, parentesco: c.respParentesco,
      email: c.emailResp, senha: c.senhaResp,
      aoMudarEmail: (novo) => { c.emailResp = novo; },
    });

    // outros responsáveis do mesmo aluno (ignora linha vazia e nome repetido)
    resultado.extras = [];
    const nomesVistos = new Set([normalizarNome(c.respNome)]);
    for(const e of (c.respsExtras || [])){
      const nomeExtra = String(e.nome || "").trim();
      if(!nomeExtra || nomesVistos.has(normalizarNome(nomeExtra))) continue;
      nomesVistos.add(normalizarNome(nomeExtra));
      const acessoExtra = await processarResponsavel({
        nome: nomeExtra, contato: e.contato, parentesco: e.parentesco,
        email: e.email, senha: e.senha,
        aoMudarEmail: (novo) => { e.email = novo; },
      });
      if(acessoExtra) resultado.extras.push({ nome: nomeExtra, contato: e.contato || "", acesso: acessoExtra });
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
async function salvarEdicaoProfessor(uid, nome, disciplinas, sexo){
  await updateDoc(doc(db, "usuarios", uid), { nome, disciplinas, sexo: sexo || "" });

  // Uma consulta POR unidade da equipe logada, sempre com "escolaId ==".
  // Consultar só por "professorId ==" faz o Firestore recusar a consulta
  // inteira (permission-denied), porque a regra de segurança exige provar
  // o escolaId na própria consulta — e sem ele não dá pra provar nada.
  const escolasIds = Object.keys(state.data.escolas || {});
  const resultados = await Promise.all(escolasIds.map(escolaId => getDocs(query(
    collection(db, "escolaProfessores"),
    where("escolaId", "==", escolaId),
    where("professorId", "==", uid),
  ))));
  const vinculos = resultados.flatMap(snap => snap.docs);
  await Promise.all(vinculos.map(d => updateDoc(d.ref, { nome, disciplinas, sexo: sexo || "" })));
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

// Quebra "Seg 14h · Qua 15h" em uma etiqueta por horário (turmas com vários encontros, ex.: Robótica)
function horarioTagsHtml(horario){
  return String(horario || "").split(" · ").map(x => x.trim()).filter(Boolean)
    .map(x => `<span class="turma-card-tag">${ICONS.clock} ${escapeHtml(x)}</span>`).join("");
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
          ${horarioTagsHtml(t.horario)}
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
/* ------------------------------------------------------------------
   Estatísticas — visão geral da escola (alunos e contratos).
   Tudo é calculado na hora em cima de state.instAlunos.
   ------------------------------------------------------------------ */
const EST_PERIODOS = [
  { key: "mes", label: "Este mês" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "ano", label: "Este ano" },
];

function estInicioDoPeriodo(p){
  const hoje = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if(p === "30" || p === "90") return fmt(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - Number(p)));
  if(p === "ano") return `${hoje.getFullYear()}-01-01`;
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
}

function estCard(rotulo, valor, sub, cor){
  return `
    <div class="card">
      <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">${escapeHtml(rotulo)}</div>
      <div style="font-family:var(--font-display);font-size:28px;color:${cor || "var(--ink)"};">${escapeHtml(String(valor))}</div>
      ${sub ? `<div style="font-size:12.5px;color:var(--slate);margin-top:6px;">${escapeHtml(sub)}</div>` : ""}
    </div>`;
}

function estatisticasVisaoGeralHtml(school){
  if(state.instAlunosCarregando && state.instAlunos === null){
    return `<h2 class="section-title">Visão geral</h2><div style="padding:20px;font-size:14px;color:var(--slate);">Carregando dados dos alunos…</div>`;
  }
  if(state.instAlunosErro){
    return `<h2 class="section-title">Visão geral</h2><div style="padding:20px;font-size:14px;color:var(--red);">${escapeHtml(state.instAlunosErro)}</div>`;
  }

  const alunos = state.instAlunos || [];
  const inicio = estInicioDoPeriodo(state.estPeriodo);
  const periodoLabel = (EST_PERIODOS.find(p => p.key === state.estPeriodo) || EST_PERIODOS[0]).label.toLowerCase();

  const ativos = alunos.filter(a => a.situacao === "ativo");
  const inativos = alunos.filter(a => a.situacao === "inativo");
  const cancelados = alunos.filter(a => a.situacao === "cancelado");
  const novos = alunos.filter(a => a.matriculadoEm && a.matriculadoEm >= inicio);
  const cancelamentos = cancelados.filter(a => a.situacaoEm && a.situacaoEm >= inicio);
  const inativados = inativos.filter(a => a.situacaoEm && a.situacaoEm >= inicio);
  const semMatricula = alunos.filter(a => !a.matriculadoEm).length;
  const saldo = novos.length - cancelamentos.length;

  // contratos: considera todo mundo que não cancelou
  const comContrato = alunos.filter(a => a.situacao !== "cancelado");
  const assinados = comContrato.filter(a => a.contratoStatus === "assinado");
  const pendentes = comContrato.filter(a => a.contratoStatus === "pendente");
  const semContrato = comContrato.filter(a => !a.contratoStatus);
  const pctAssinado = comContrato.length ? Math.round((assinados.length / comContrato.length) * 100) : null;
  const pendentesOrdenados = pendentes.slice().sort((a, b) => diasDesde(b.contratoEnviadoEm) - diasDesde(a.contratoEnviadoEm));
  const pendentes7 = pendentes.filter(a => a.contratoEnviadoEm && diasDesde(a.contratoEnviadoEm) > 7).length;

  const pendentesHtml = pendentesOrdenados.slice(0, 10).map(a => {
    const d = diasDesde(a.contratoEnviadoEm);
    const txt = d === Infinity ? "ainda não enviado" : (d === 0 ? "enviado hoje" : `enviado há ${d} dia(s)`);
    return `
    <div class="row">
      <div>
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(a.nome)}</div>
        <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(a.turma || "Sem turma")}</div>
      </div>
      <span class="pill ${d !== Infinity && d > 7 ? "pill-red" : "pill-gold"}">${ICONS.clock} ${escapeHtml(txt)}</span>
    </div>`;
  }).join("") + (pendentesOrdenados.length > 10
    ? `<div style="padding:10px 14px;font-size:12.5px;color:var(--slate);">+ ${pendentesOrdenados.length - 10} outros na aba Contratos.</div>` : "")
    || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum contrato aguardando assinatura.</div>`;

  const saidas = [...cancelamentos, ...inativados].sort((a, b) => (b.situacaoEm || "").localeCompare(a.situacaoEm || ""));
  const saidasHtml = saidas.map(a => `
    <div class="row">
      <div>
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(a.nome)}</div>
        <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(a.turma || "Sem turma")} · ${escapeHtml(formatarDataBr(a.situacaoEm))}${a.motivoSaida ? ` · ${escapeHtml(a.motivoSaida)}` : ""}</div>
      </div>
      <span class="pill ${a.situacao === "cancelado" ? "pill-red" : "pill-gold"}">${a.situacao === "cancelado" ? "Cancelado" : "Inativo"}</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma saída registrada neste período.</div>`;

  // alunos ativos por turma/curso
  const porTurma = new Map();
  ativos.forEach(a => { const k = a.turma || "Sem turma"; porTurma.set(k, (porTurma.get(k) || 0) + 1); });
  const turmasOrd = Array.from(porTurma.entries()).sort((a, b) => b[1] - a[1]);
  const maxTurma = Math.max(1, ...turmasOrd.map(t => t[1]));
  const turmasHtml = turmasOrd.map(([nome, qtd]) => `
    <div class="row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;justify-content:space-between;font-size:14px;color:var(--ink);"><span>${escapeHtml(nome)}</span><span style="font-weight:600;">${qtd}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.round((qtd / maxTurma) * 100)}%;background:linear-gradient(90deg, var(--gold), var(--gold-light));"></div></div>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum aluno ativo ainda.</div>`;

  const mesAtual = String(new Date().getMonth() + 1).padStart(2, "0");
  const aniversariantes = ativos.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a.nascimento || "") && a.nascimento.slice(5, 7) === mesAtual).length;

  const periodoBar = `<div class="subtab-bar">${EST_PERIODOS.map(p => `
    <button type="button" class="subtab-btn ${state.estPeriodo === p.key ? "active" : ""}" data-action="set-est-periodo" data-key="${p.key}"><span>${p.label}</span></button>`).join("")}</div>`;

  return `
    <h2 class="section-title">Visão geral</h2>
    <p class="section-eyebrow">${escapeHtml(school.nome)} · período: ${escapeHtml(periodoLabel)} (a partir de ${escapeHtml(formatarDataBr(inicio))})</p>
    ${periodoBar}

    <h2 class="section-title" style="margin-top:18px;">Alunos</h2>
    <div class="grid-cards">
      ${estCard("Alunos ativos", ativos.length, `${alunos.length} cadastrados no total`)}
      ${estCard("Alunos inativos", inativos.length, inativados.length ? `${inativados.length} ficaram inativos no período` : "Pausaram ou trancaram")}
      ${estCard("Alunos novos", novos.length, `Matriculados no período`, "var(--green, #2f6b4f)")}
      ${estCard("Cancelamentos", cancelamentos.length, `${cancelados.length} cancelados no total`, cancelamentos.length ? "var(--red)" : "")}
      ${estCard("Saldo do período", (saldo > 0 ? "+" : "") + saldo, "Novos menos cancelamentos", saldo < 0 ? "var(--red)" : "")}
      ${estCard("Aniversariantes do mês", aniversariantes, "Entre os alunos ativos")}
    </div>
    ${semMatricula ? `<p class="section-eyebrow" style="margin-top:10px;">${semMatricula} aluno(s) sem data de matrícula não entram em "alunos novos". Preencha em Alunos → ficha → Situação na escola.</p>` : ""}

    <h2 class="section-title" style="margin-top:22px;">Contratos</h2>
    <div class="grid-cards">
      ${estCard("Assinados", assinados.length, pctAssinado === null ? "" : `${pctAssinado}% dos alunos (sem contar cancelados)`, "var(--green, #2f6b4f)")}
      ${estCard("Pendentes de assinatura", pendentes.length, pendentes7 ? `${pendentes7} há mais de 7 dias` : "Nenhum atrasado", pendentes7 ? "var(--red)" : "")}
      ${estCard("Sem contrato registrado", semContrato.length, "Alunos sem status de contrato")}
    </div>
    <h3 style="font-family:var(--font-display);font-size:17px;color:var(--ink);font-weight:500;margin-top:16px;">Aguardando assinatura</h3>
    <div class="card flush">${pendentesHtml}</div>

    <h2 class="section-title" style="margin-top:22px;">Entradas e saídas</h2>
    <p class="section-eyebrow">Cancelamentos e alunos que ficaram inativos no período.</p>
    <div class="card flush">${saidasHtml}</div>

    <h2 class="section-title" style="margin-top:22px;">Alunos ativos por turma</h2>
    <div class="card flush">${turmasHtml}</div>
  `;
}

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
    ${estatisticasVisaoGeralHtml(school)}
    <h2 class="section-title" style="margin-top:28px;">Frequência de hoje</h2>
    <p class="section-eyebrow">${escapeHtml(dataDeHojeExtenso())}</p>
    <div class="grid-cards turma-cards-grid">${turmasHtml}</div>
    <h2 class="section-title" style="margin-top:22px;">Alunos com mais faltas</h2>
    <p class="section-eyebrow">Últimos 30 dias · acompanhamento recomendado</p>
    <div class="card flush">${faltantes}</div>`;
}

/* Todas as cobranças de todos os alunos da unidade, já com o aluno dono
   anexado — pra consultar boletos e dar baixa direto na aba Financeiro, sem
   abrir a ficha. Ordenadas pelo vencimento, da mais recente pra mais antiga. */
function todasCobrancas(alunos){
  const lista = [];
  alunos.forEach(aluno => {
    (aluno.financeiro?.mensalidades || []).forEach(m => lista.push({ aluno, mensalidade: m }));
  });
  return lista.sort((a, b) => (b.mensalidade.vencimento || "").localeCompare(a.mensalidade.vencimento || ""));
}

function financeiroInstituicaoView(school){
  if(state.instAlunosCarregando && state.instAlunos === null){
    return `<h2 class="section-title">Financeiro</h2><div style="padding:20px;font-size:14px;color:var(--slate);">Carregando financeiro…</div>`;
  }
  if(state.instAlunosErro){
    return `<h2 class="section-title">Financeiro</h2><div style="padding:20px;font-size:14px;color:var(--red);">${escapeHtml(state.instAlunosErro)}</div>`;
  }

  const subTabs = [
    { key: "consultar", label: "Consultar boletos", icon: ICONS.wallet },
    { key: "lancar", label: "Lançar cobrança", icon: ICONS.fileText },
  ];
  const subNav = `<div class="subtab-bar">${subTabs.map(t => `
    <button type="button" class="subtab-btn ${state.finSubTab === t.key ? "active" : ""}" data-action="set-fin-subtab" data-key="${t.key}">
      ${t.icon}<span>${t.label}</span>
    </button>`).join("")}</div>`;

  const corpo = state.finSubTab === "lancar"
    ? financeiroLancarCobrancaView()
    : financeiroConsultarView();

  return `
    <h2 class="section-title">Financeiro</h2>
    ${subNav}
    ${corpo}
    ${state.instituicaoMensagem ? `<p class="teacher-success institution-success">${escapeHtml(state.instituicaoMensagem)}</p>` : ""}`;
}

/* Busca de aluno (Financeiro > Lançar cobrança). Sem escolha feita: campo de
   busca + lista filtrada. Com aluno escolhido: mostra o nome e "Trocar". */
function semAcento(t){
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function financeiroResultadosBuscaHtml(){
  const termo = semAcento(state.finCobrancaBusca).trim();
  if(!termo){
    return `<div style="padding:12px;font-size:13px;color:var(--slate);">Digite o nome do aluno (ou da turma) para buscar.</div>`;
  }
  const achados = (state.instAlunos || [])
    .filter(a => semAcento(a.nome).includes(termo) || semAcento(a.turma).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if(achados.length === 0){
    return `<div style="padding:12px;font-size:13px;color:var(--slate);">Nenhum aluno encontrado.</div>`;
  }
  return achados.slice(0, 30).map(a => `
    <button type="button" class="row aluno-row" data-action="escolher-fin-aluno" data-id="${escapeHtml(a.id)}">
      <span class="linha-com-foto-info">
        <span class="linha-nome">${escapeHtml(a.nome)}</span>
        ${a.turma ? `<span class="linha-sub">${escapeHtml(a.turma)}</span>` : ""}
      </span>
    </button>`).join("") + (achados.length > 30
      ? `<div style="padding:10px 12px;font-size:12.5px;color:var(--slate);">Mostrando 30 de ${achados.length}. Continue digitando para filtrar.</div>`
      : "");
}

/* Atualiza só a lista de resultados, sem re-renderizar a tela (senão o
   cursor sai do campo a cada letra digitada). */
function atualizarResultadosBuscaFin(){
  const el = document.getElementById("fin-cobranca-resultados");
  if(el) el.innerHTML = financeiroResultadosBuscaHtml();
}

function financeiroEscolhaAlunoHtml(){
  const escolhido = (state.instAlunos || []).find(a => a.id === state.finCobrancaAlunoId);
  if(escolhido){
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line, #e5e0d3);border-radius:10px;margin-bottom:8px;">
        <div>
          <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(escolhido.nome)}</div>
          ${escolhido.turma ? `<div style="font-size:12.5px;color:var(--slate);">${escapeHtml(escolhido.turma)}</div>` : ""}
        </div>
        <button type="button" class="btn-secondary" style="margin:0;" data-action="trocar-fin-aluno">Trocar aluno</button>
      </div>`;
  }
  return `
    <input id="fin-cobranca-busca" type="search" class="teacher-text-input" style="margin:0 0 6px;" placeholder="Buscar aluno pelo nome ou turma…" autocomplete="off" value="${escapeHtml(state.finCobrancaBusca)}" />
    <div id="fin-cobranca-resultados" class="card flush" style="max-height:240px;overflow-y:auto;margin-bottom:8px;">${financeiroResultadosBuscaHtml()}</div>`;
}

/* Sub-aba "Lançar cobrança" dentro de Financeiro: mesmo lançamento da
   ficha do aluno, só que escolhendo o aluno por um <select>, pra não
   precisar abrir a ficha primeiro. A forma de pagamento aqui é a
   ESPERADA (decide se mostra o campo de Pix ou o de boleto); a forma
   como a cobrança foi de fato paga continua sendo registrada só na
   hora de "dar baixa". */
function financeiroLancarCobrancaView(){
  const forma = state.finCobrancaForma || "boleto";
  const camposForma = camposFormaPagamentoHtml("fin-cobranca", forma, {
    pix: state.finCobrancaPix,
    pixTipo: state.finCobrancaPixTipo,
    codigoBarras: state.finCobrancaCodigoBarras,
    boletoArquivo: state.finCobrancaBoletoArquivo,
    boletoLendo: state.finCobrancaBoletoLendo,
    boletoComPix: state.finCobrancaBoletoComPix,
    linkCartao: state.finCobrancaLinkCartao,
  });

  return `
    <p class="section-eyebrow">Lance aqui mesmo, sem abrir a ficha do aluno — ou pela ficha (aba "Alunos" → toque no aluno → "Financeiro"), como já era.</p>
    <div class="card" style="margin-top:10px;">
      <p class="teacher-label" style="margin-bottom:6px;">Nova cobrança</p>
      ${financeiroEscolhaAlunoHtml()}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="fin-cobranca-competencia" type="month" class="teacher-text-input" style="flex:1 1 140px;margin:0;" value="${escapeHtml(state.finCobrancaCompetencia)}" title="Mês de referência" />
        <input id="fin-cobranca-valor" type="number" min="0" step="0.01" class="teacher-text-input" style="flex:1 1 120px;margin:0;" placeholder="Valor (R$)" value="${escapeHtml(state.finCobrancaValor)}" />
        <input id="fin-cobranca-vencimento" type="date" class="teacher-text-input" style="flex:1 1 140px;margin:0;" value="${escapeHtml(state.finCobrancaVencimento)}" title="Vencimento" />
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">
        <span style="font-size:12.5px;color:var(--slate);">Forma de pagamento</span>
        ${selectFormaPagamentoHtml("fin-cobranca-forma", forma)}
      </div>
      ${camposForma}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button type="button" class="teacher-primary-btn" style="margin:0;" data-action="lancar-fin-cobranca" ${state.finCobrancaSalvando ? "disabled" : ""}>${state.finCobrancaSalvando ? "Salvando…" : "Lançar cobrança"}</button>
      </div>
      ${state.finCobrancaErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.finCobrancaErro)}</p>` : ""}
      ${state.finCobrancaMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.finCobrancaMensagem)}</p>` : ""}
    </div>`;
}

function financeiroFiltrarCobrancas(){
  const termo = semAcento(state.finConsultaBusca).trim();
  return todasCobrancas(state.instAlunos || []).filter(({ aluno, mensalidade: m }) => {
    if(termo && !(semAcento(aluno.nome).includes(termo) || semAcento(aluno.turma).includes(termo) || semAcento(aluno.idAluno).includes(termo))) return false;
    return true;
  });
}

function financeiroListaConsultaHtml(){
  const lista = financeiroFiltrarCobrancas();
  const termo = semAcento(state.finConsultaBusca).trim();

  // Alunos que batem com a busca (até 5), cada um com atalho pra lançar cobrança
  let alunosHtml = "";
  if(termo){
    const achados = (state.instAlunos || [])
      .filter(a => semAcento(a.nome).includes(termo) || semAcento(a.turma).includes(termo) || semAcento(a.idAluno).includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    if(achados.length && achados.length <= 5){
      alunosHtml = `<div class="card flush" style="margin-top:10px;">${achados.map(a => `
        <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(a.nome)}</div>
            <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(a.turma || "")}${(a.financeiro?.mensalidades || []).length ? ` · ${(a.financeiro.mensalidades).length} cobrança(s)` : " · sem cobranças"}</div>
          </div>
          <button type="button" class="teacher-primary-btn" style="margin:0;" data-action="fin-lancar-para" data-id="${escapeHtml(a.id)}">Lançar cobrança</button>
        </div>`).join("")}</div>`;
    }
  }

  const resumo = `<p class="section-eyebrow" style="margin-top:10px;">${lista.length} cobrança(s)</p>`;

  const linhas = lista.map(({ aluno, mensalidade: m }) => `
      <div class="row" style="flex-direction:column;align-items:stretch;">
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(aluno.nome)} · ${escapeHtml(competenciaLabel(m.competencia))}</div>
        <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(formatarMoeda(m.valor))} · vence em ${escapeHtml(formatarDataBr(m.vencimento))} · ${escapeHtml(formaPagamentoLabel(m.formaPagamento))}${m.criadoEm ? ` · lançada em ${escapeHtml(formatarDataBr(m.criadoEm))}` : ""}</div>
        ${anexosMensalidadeHtml(m)}
      </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma cobrança encontrada.</div>`;

  return `${alunosHtml}${resumo}<div class="card flush" style="margin-top:6px;">${linhas}</div>`;
}

/* Atualiza só a lista (sem re-renderizar a tela inteira), pro cursor não
   sair do campo de busca a cada letra. */
function atualizarListaConsultaFin(){
  const el = document.getElementById("fin-consulta-lista");
  if(el) el.innerHTML = financeiroListaConsultaHtml();
}

function financeiroConsultarView(){
  return `
    <p class="section-eyebrow">Busque o aluno (nome, turma ou IDALUNO) para ver as cobranças dele ou lançar uma nova.</p>
    <input id="fin-consulta-busca" type="search" class="teacher-text-input" style="margin:10px 0 0;" placeholder="Buscar aluno, turma ou IDALUNO…" autocomplete="off" value="${escapeHtml(state.finConsultaBusca)}" />
    <div id="fin-consulta-lista">${financeiroListaConsultaHtml()}</div>`;
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
      <button type="button" class="row aluno-row pessoa-row" data-action="abrir-aluno" data-id="${escapeHtml(s.id)}">
        ${avatarHtml(fotoDoAluno(s), iniciaisDoNome(s.nome))}
        <span class="pessoa-info">
          <span class="pessoa-nome">${escapeHtml(s.nome)}</span>
          <span class="pessoa-sub">${escapeHtml(s.turma || "Sem turma")}</span>
        </span>
        <span class="pessoa-meta">
          ${s.idAluno ? `<span class="id-aluno-tag">ID ${escapeHtml(s.idAluno)}</span>` : ""}
          <span class="pessoa-chevron">${ICONS.chevronRight}</span>
        </span>
      </button>`).join("") || `<div class="lista-vazia">Nenhum aluno encontrado.</div>`;
    total = (lista || []).length;
  }

  const comLoginRec = state.instAlunos ? alunosRecreacaoComLogin() : [];
  const avisoLoginRec = comLoginRec.length > 0 ? `
    <div class="card" style="padding:14px 16px;margin-bottom:12px;">
      <p class="section-eyebrow" style="margin:0 0 10px;">${comLoginRec.length} ${comLoginRec.length === 1 ? "aluno da Recreação ainda tem" : "alunos da Recreação ainda têm"} login próprio. Na Recreação quem acessa é o responsável.</p>
      ${state.removerLoginConfirmando ? `
        <p style="font-size:13.5px;margin:0 0 10px;color:var(--ink);">Remover o login de ${comLoginRec.length} ${comLoginRec.length === 1 ? "aluno" : "alunos"}? Os cadastros, turmas e históricos continuam; só o e-mail e a senha deixam de funcionar.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn-danger" data-action="confirmar-remover-login-recreacao" ${state.removerLoginRodando ? "disabled" : ""}>${state.removerLoginRodando ? "Removendo…" : "Sim, remover os logins"}</button>
          <button type="button" class="btn-secondary" data-action="cancelar-remover-login-recreacao" ${state.removerLoginRodando ? "disabled" : ""}>Cancelar</button>
        </div>`
      : `<button type="button" class="btn-secondary" data-action="remover-login-recreacao">Remover login dos alunos da Recreação</button>`}
    </div>` : "";

  const semId = (lista || []).filter(a => !a.idAluno).length;
  const avisoSemId = semId > 0 ? `
    <div class="card" style="padding:14px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <p class="section-eyebrow" style="margin:0;">${semId} ${semId === 1 ? "aluno ainda não tem" : "alunos ainda não têm"} IDALUNO.</p>
      <button type="button" class="btn-secondary" data-action="gerar-idaluno-pendentes" ${state.gerandoIdAluno ? "disabled" : ""}>${state.gerandoIdAluno ? "Gerando…" : "Gerar IDALUNO"}</button>
    </div>` : "";

  return `
    <h2 class="section-title">Alunos matriculados</h2>
    <p class="section-eyebrow">${escapeHtml(school.nome)} · toque em um aluno para ver a ficha completa</p>
    <div class="lista-toolbar">
      <div class="search-wrap">
        ${ICONS.search}
        <input class="search-input" id="alunos-busca" placeholder="Buscar aluno pelo nome" value="${escapeHtml(state.alunosBusca)}" />
      </div>
      <span class="lista-contador"><strong>${total}</strong> ${total === 1 ? "aluno ativo" : "alunos ativos"}</span>
    </div>
    ${avisoLoginRec}
    ${avisoSemId}
    <div class="card flush lista-pessoas">${rows}</div>
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
      texto: textoAniversario("aluno", { nome: primeiroNome(aluno.nome), idade: aluno.idade }),
    };
  }
  const responsavel = (state.gestaoResponsaveis || [])
    .find(r => r.alunosIds.includes(aluno.id) && telefoneValido(r.contato));
  if(responsavel){
    return {
      tipo: "responsavel",
      nome: responsavel.nome,
      numero: telefoneValido(responsavel.contato),
      texto: textoAniversario("responsavel", { nome: primeiroNome(responsavel.nome), aluno: aluno.nome, idade: aluno.idade }),
    };
  }
  return null;
}


function aniversarioMsgModal(){
  if(!state.aniversarioMsgModalAberto || !state.aniversarioMsgRascunho) return "";
  const r = state.aniversarioMsgRascunho;
  const campos = TIPOS_MSG_ANIVERSARIO.map(t => `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">${t.titulo}</h3>
      <textarea class="teacher-text-input ficha-textarea" style="min-height:120px;" maxlength="800" data-aniv-msg="${t.key}" ${state.aniversarioMsgSalvando ? "disabled" : ""}>${escapeHtml(r[t.key] || "")}</textarea>
      <p class="section-eyebrow" style="margin:4px 0 0;">${t.dica}</p>
    </div>`).join("");
  return `
  <div class="aluno-modal-backdrop" data-action="fechar-aniv-msg">
    <div class="aluno-modal" role="dialog" aria-modal="true" aria-label="Personalizar mensagem de aniversário" data-action="noop">
      <div class="aluno-modal-head">
        <div><h2>Mensagem de aniversário</h2><p class="section-eyebrow" style="margin:2px 0 0;">Vale para toda a equipe desta unidade. Use as variáveis entre chaves, como {nome}.</p></div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-aniv-msg" aria-label="Fechar">${ICONS.close}</button>
      </div>
      ${campos}
      <div class="aluno-modal-section">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="salvar-aniv-msg" ${state.aniversarioMsgSalvando ? "disabled" : ""}>${state.aniversarioMsgSalvando ? "Salvando…" : "Salvar mensagens"}</button>
          <button type="button" class="attendance-btn" data-action="restaurar-aniv-msg" ${state.aniversarioMsgSalvando ? "disabled" : ""}>Restaurar padrão</button>
        </div>
        ${state.aniversarioMsgErro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${escapeHtml(state.aniversarioMsgErro)}</p>` : ""}
      </div>
    </div>
  </div>`;
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

  const alunosTodos = state.instAlunos || [];
  const professoresTodos = (state.gestaoProfessores || []).map(p => ({ ...p, ehProfessor: true }));
  const todos = [...alunosTodos, ...professoresTodos];
  const comData = todos
    .filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a.nascimento || ""))
    .map(a => {
      const [ano, mes, dia] = a.nascimento.split("-").map(Number);
      // idade que ele completa neste ano
      const idade = hoje.getFullYear() - ano;
      return { ...a, dia, mes, ano, idade, ehHoje: dia === diaHoje && mes === mesHoje };
    });
  const semData = alunosTodos.length - comData.filter(a => !a.ehProfessor).length;
  const profSemData = professoresTodos.length - comData.filter(a => a.ehProfessor).length;

  const filtrados = (state.aniversarioMes === "todos"
    ? comData
    : comData.filter(a => a.mes === Number(state.aniversarioMes))
  ).sort((a, b) => (a.mes - b.mes) || (a.dia - b.dia) || a.nome.localeCompare(b.nome));

  const aniversariantesHoje = comData.filter(a => a.ehHoje);

  const linhaProfessor = (a) => {
    const numero = telefoneValido(a.telefone);
    const texto = textoAniversario("professor", { nome: primeiroNome(a.nome), idade: a.idade });
    return `
      <div class="aniversario-row${a.ehHoje ? " is-hoje" : ""}">
        <div class="aniversario-data">
          <strong>${String(a.dia).padStart(2, "0")}</strong>
          <span>${MESES_CURTOS[a.mes - 1]}</span>
        </div>
        <div class="aniversario-info">
          <span class="aniversario-nome">${escapeHtml(a.nome)} <span class="pill pill-gold" style="font-size:11px;">Professor(a)</span>${a.ehHoje ? ` <span class="aniversario-hoje-tag">hoje</span>` : ""}</span>
          <span class="aniversario-sub">${escapeHtml((a.disciplinas || []).join(", ") || "Professor(a)")} · faz ${a.idade} anos · ${numero ? "WhatsApp do professor" : "Sem WhatsApp na ficha"}</span>
        </div>
        ${numero ? `<button type="button" class="aniversario-btn" data-action="enviar-parabens" data-tipo="professor" data-numero="${escapeHtml(numero)}" data-nome="${escapeHtml(primeiroNome(a.nome))}" data-texto="${escapeHtml(texto)}">${ICONS.megaphone} Enviar parabéns</button>` : ""}
      </div>`;
  };

  const linha = (a) => {
    if(a.ehProfessor) return linhaProfessor(a);
    const destino = destinoDoParabens(a);
    const rotuloDestino = destino
      ? (destino.tipo === "aluno"
          ? "WhatsApp do aluno"
          : `Responsável: ${escapeHtml(destino.nome)}`)
      : "Sem WhatsApp cadastrado";
    const botao = destino
      ? `<button type="button" class="aniversario-btn" data-action="enviar-parabens" data-tipo="aluno" data-numero="${escapeHtml(destino.numero)}" data-nome="${escapeHtml(primeiroNome(a.nome))}" data-texto="${escapeHtml(destino.texto)}">${ICONS.megaphone} Enviar parabéns</button>`
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
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
      <h2 class="section-title" style="margin-bottom:0;">Aniversários</h2>
      <button type="button" class="attendance-btn" data-action="abrir-aniv-msg">${ICONS.pencil} Personalizar mensagem</button>
    </div>
    ${state.aniversarioAviso ? `<p class="teacher-success institution-success" style="margin-top:10px;">${escapeHtml(state.aniversarioAviso)}</p>` : ""}
    <p class="section-eyebrow">Alunos e professores de ${escapeHtml(school.nome)} por data de nascimento. A mensagem já vai escrita: se o aluno tem WhatsApp, vai pra ele; se não tem, vai pro responsável vinculado. Professores entram quando preenchem o aniversário em "Meu perfil". Ao enviar, a mensagem vai acompanhada de um cartão com a logo da escola.</p>
    ${blocoHoje}
    <div class="aniversario-filtro">
      <label class="teacher-label" for="aniversario-mes">Mês</label>
      <select id="aniversario-mes" class="teacher-text-input" data-action="noop">${opcoesMes}</select>
    </div>
    <div class="card flush">${lista}</div>
    ${semData ? `<p class="section-eyebrow" style="margin-top:10px;">${semData} aluno(s) ainda sem data de nascimento no cadastro. Dá pra preencher na ficha do aluno, na aba "Alunos" — os contratos novos já gravam a data sozinhos.</p>` : ""}
    ${profSemData ? `<p class="section-eyebrow" style="margin-top:6px;">${profSemData} professor(es) ainda não informaram o aniversário na ficha.</p>` : ""}`;
}

/* Bloco "Financeiro" dentro da ficha do aluno: lista as mensalidades já
   lançadas (com o pill de status calculado na hora) e o formulário pra
   lançar uma nova cobrança. Marcar como pago abre um miniformulário
   (forma + data) por linha; nada disso mexe em contrato nem em boleto. */
function financeiroAlunoSection(aluno){
  const mensalidades = (aluno.financeiro.mensalidades || [])
    .slice()
    .sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || ""));

  const linhas = mensalidades.map(m => {
    const atrasada = mensalidadeEstaAtrasada(m);
    const pillClasse = m.status === "pago" ? "pill-green" : (atrasada ? "pill-red" : "pill-gold");
    const pillTexto = m.status === "pago"
      ? `${ICONS.check} Pago`
      : (atrasada ? `${ICONS.clock} Atrasada há ${diasAtraso(m.vencimento)}d` : `${ICONS.clock} Pendente`);
    const detalhePagamento = m.status === "pago"
      ? `<div style="font-size:12px;color:var(--slate);margin-top:2px;">${escapeHtml(formaPagamentoLabel(m.formaPagamento))}${m.dataPagamento ? ` · pago em ${escapeHtml(formatarDataBr(m.dataPagamento))}` : ""}</div>`
      : "";
    return `
      <div class="row" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${escapeHtml(competenciaLabel(m.competencia))}</div>
            <div style="font-size:12.5px;color:var(--slate);">${escapeHtml(formatarMoeda(m.valor))} · vence em ${escapeHtml(formatarDataBr(m.vencimento))}</div>
            ${detalhePagamento}
            ${anexosMensalidadeHtml(m)}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="pill ${pillClasse}">${pillTexto}</span>
            <button type="button" class="attendance-btn" data-action="excluir-mensalidade" data-mens-id="${escapeHtml(m.id)}" aria-label="Excluir cobrança" title="Excluir cobrança">${ICONS.trash}</button>
          </div>
        </div>
      </div>`;
  }).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma cobrança lançada ainda.</div>`;

  const formaAluno = state.alunoFinForma || "boleto";
  const alunoCamposForma = camposFormaPagamentoHtml("aluno-fin", formaAluno, {
    pix: state.alunoFinPix,
    pixTipo: state.alunoFinPixTipo,
    codigoBarras: state.alunoFinCodigoBarras,
    boletoArquivo: state.alunoFinBoletoArquivo,
    boletoLendo: state.alunoFinBoletoLendo,
    boletoComPix: state.alunoFinBoletoComPix,
    linkCartao: state.alunoFinLinkCartao,
  });

  return `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Financeiro</h3>
      <div class="card flush">${linhas}</div>
    </div>`;
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
        <span>
          <span style="font-weight:600;color:var(--ink);font-size:13.5px;display:block;">${escapeHtml(r.nome)}</span>
          ${r.parentesco ? `<span class="pill pill-gold" style="margin-top:3px;display:inline-block;">${escapeHtml(parentescoLabel(r.parentesco))}</span>` : `<span style="color:var(--slate);font-size:11.5px;">Parentesco não informado</span>`}
        </span>
        <span style="color:var(--slate);font-size:12px;text-align:right;">${escapeHtml(r.contato || "Sem contato informado")}${r.email ? `<br>${escapeHtml(r.email)}` : ""}</span>
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
        <div class="ficha-cabecalho-com-foto">
          ${avatarHtml(fotoDoAluno(aluno), aluno.foto, "avatar-foto-grande")}
          <div>
            <h2>${escapeHtml(aluno.nome)}</h2>
            <p class="section-eyebrow" style="margin:2px 0 0;">${escapeHtml(aluno.turma)}</p>
            ${aluno.idAluno ? `<span class="id-aluno-tag">ID ${escapeHtml(aluno.idAluno)}</span>` : ""}
          </div>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-aluno-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Contato do aluno</h3>
        <label class="teacher-label" for="aluno-detalhe-nome" style="display:block;">Nome do aluno</label>
        <input id="aluno-detalhe-nome" class="teacher-text-input" placeholder="Nome completo" value="${escapeHtml(state.alunoDetalheNomeInput)}" />
        <label class="teacher-label" for="aluno-detalhe-contato" style="display:block;margin-top:10px;">Contato</label>
        <input id="aluno-detalhe-contato" class="teacher-text-input" placeholder="WhatsApp (com DDD) ou e-mail" value="${escapeHtml(state.alunoDetalheContatoInput)}" />
        <label class="teacher-label" for="aluno-detalhe-nascimento" style="display:block;margin-top:10px;">Data de nascimento</label>
        <input id="aluno-detalhe-nascimento" type="date" class="teacher-text-input" value="${escapeHtml(state.alunoDetalheNascimentoInput)}" />
        <p class="section-eyebrow" style="margin:6px 0 0;">Com a data preenchida o aluno passa a aparecer na aba "Aniversários".</p>
        <label class="teacher-label" for="aluno-detalhe-sexo" style="display:block;margin-top:10px;">Aluno(a) é</label>
        <select id="aluno-detalhe-sexo" class="teacher-text-input">
          <option value="" ${!state.alunoDetalheSexoInput ? "selected" : ""} disabled>Selecione</option>
          <option value="masculino" ${state.alunoDetalheSexoInput === "masculino" ? "selected" : ""}>Menino</option>
          <option value="feminino" ${state.alunoDetalheSexoInput === "feminino" ? "selected" : ""}>Menina</option>
        </select>
        <p class="section-eyebrow" style="margin:4px 0 0;">Define a foto padrão que aparece na lista e na ficha.</p>
        <button type="button" class="teacher-primary-btn" data-action="salvar-aluno-contato" ${state.alunoDetalheSalvandoContato ? "disabled" : ""}>${state.alunoDetalheSalvandoContato ? "Salvando…" : "Salvar nome, contato e data"}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Situação na escola</h3>
        <select id="aluno-sit-situacao" class="teacher-text-input">
          <option value="ativo" ${state.alunoSitSituacao === "ativo" ? "selected" : ""}>Ativo</option>
          <option value="inativo" ${state.alunoSitSituacao === "inativo" ? "selected" : ""}>Inativo (pausou ou trancou)</option>
          <option value="cancelado" ${state.alunoSitSituacao === "cancelado" ? "selected" : ""}>Cancelado (saiu da escola)</option>
        </select>
        <label class="teacher-label" for="aluno-sit-matricula" style="display:block;margin-top:10px;">Matriculado em</label>
        <input id="aluno-sit-matricula" type="date" class="teacher-text-input" value="${escapeHtml(state.alunoSitMatricula)}" />
        ${state.alunoSitSituacao !== "ativo" ? `
        <label class="teacher-label" for="aluno-sit-data" style="display:block;margin-top:10px;">${state.alunoSitSituacao === "cancelado" ? "Data do cancelamento" : "Inativo desde"}</label>
        <input id="aluno-sit-data" type="date" class="teacher-text-input" value="${escapeHtml(state.alunoSitData)}" />
        <input id="aluno-sit-motivo" class="teacher-text-input" style="margin-top:8px;" placeholder="Motivo (opcional)" value="${escapeHtml(state.alunoSitMotivo)}" />` : ""}
        <p class="section-eyebrow" style="margin:6px 0 0;">Alimenta a aba Estatísticas (alunos novos, ativos, inativos e cancelamentos).</p>
        <button type="button" class="teacher-primary-btn" data-action="salvar-situacao-aluno" ${state.alunoSitSalvando ? "disabled" : ""}>${state.alunoSitSalvando ? "Salvando…" : "Salvar situação"}</button>
        ${state.alunoSitErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.alunoSitErro)}</p>` : ""}
        ${state.alunoSitMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.alunoSitMensagem)}</p>` : ""}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Turmas</h3>
        ${turmasHtml}
        ${state.alunoTurmaErro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(state.alunoTurmaErro)}</p>` : ""}
        ${state.alunoTurmaMensagem ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(state.alunoTurmaMensagem)}</p>` : ""}
      </div>

      ${contratosAlunoSection(aluno)}

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Acesso ao app</h3>
        <p class="section-eyebrow" style="margin:0 0 8px;">${aluno.email ? `Entra com <strong style="color:var(--ink);">${escapeHtml(aluno.email)}</strong>` : "E-mail de acesso não registrado neste cadastro."}</p>
        <button type="button" class="btn-secondary" data-action="abrir-acesso-usuario" data-tipo="aluno" data-id="${escapeHtml(aluno.id)}" data-uid="${escapeHtml(aluno.uid || "")}" data-nome="${escapeHtml(aluno.nome)}" data-email="${escapeHtml(aluno.email || "")}">${ICONS.key} Trocar senha / gerenciar acesso</button>
        ${(aluno.uid || aluno.email) ? (state.alunoLoginConfirmando ? `
        <div class="aluno-modal-confirm" style="margin-top:10px;">
          <p>Remover o login deste aluno? O cadastro e o histórico continuam; só o e-mail e a senha deixam de funcionar.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn-danger" data-action="confirmar-remover-login-aluno" ${state.alunoDetalheSalvandoContato ? "disabled" : ""}>Sim, remover login</button>
            <button type="button" class="btn-secondary" data-action="cancelar-remover-login-aluno">Cancelar</button>
          </div>
        </div>` : `
        <button type="button" class="btn-secondary" style="margin-top:8px;" data-action="remover-login-aluno">${ICONS.trash} Remover login do aluno</button>`) : ""}
      </div>

      ${alunoFichaSecretariaHtml(aluno)}

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Resumo</h3>
        <p class="section-eyebrow" style="margin:0;">Frequência: ${aluno.presenca.percentual}% · ${aluno.presenca.faltasMes} faltas no mês</p>
      </div>

      ${financeiroAlunoSection(aluno)}

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Responsáveis vinculados</h3>
        ${respHtml}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">Cadastrar responsável</h3>
        <input id="aluno-resp-nome" class="teacher-text-input" placeholder="Nome completo do responsável" value="${escapeHtml(state.alunoRespNome)}" />
        <input id="aluno-resp-contato" class="teacher-text-input" style="margin-top:8px;" placeholder="Contato (telefone ou e-mail) — opcional" value="${escapeHtml(state.alunoRespContato)}" />
        <div style="margin-top:8px;">${parentescoSelectHtml("aluno-resp-parentesco", state.alunoRespParentesco)}</div>
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
/* ================================================================== */
/* Avaliações — boletim de Inglês (Report Card) + avaliação institucional */
/* ------------------------------------------------------------------
   Toda a parte visual e de cálculo está em avaliacoes.js; aqui ficam só
   as leituras/gravações no Firestore e as telas que dependem do state.

   Quem vê o quê:
     aluno / responsável  -> Boletim (só se o aluno é de Inglês) e
                             Avaliação institucional (todos)
     secretaria           -> Boletim (preenche/edita) e resultado da
                             Avaliação institucional
     professor            -> só o Boletim das turmas de Inglês dele
   ------------------------------------------------------------------ */
function mensagemErroAvaliacoes(err){
  console.error("Erro nas avaliações:", err?.code, err);
  const codigo = err?.code ? ` (${err.code})` : "";
  if(err?.code === "permission-denied"){
    return `O servidor não liberou o acesso às avaliações${codigo}. Avise o suporte técnico: as regras do Firestore precisam liberar as coleções novas (veja AVALIACOES.md).`;
  }
  if(err?.code === "failed-precondition"){
    return `O Firestore pediu um índice para montar as avaliações${codigo}. Avise o suporte técnico (o link para criar aparece no console do navegador, F12).`;
  }
  return `Não foi possível carregar as avaliações agora${codigo}. Tente de novo.`;
}

/* Aluno que não é de Inglês não tem boletim: cai direto na avaliação institucional. */
function avalSubEfetiva(student){
  if(!student || !ehAlunoDeIngles(student.turma)) return "institucional";
  return state.aval.sub === "institucional" ? "institucional" : "boletim";
}

/* ---------------- lado do aluno / responsável ---------------- */
async function carregarAvaliacoesDoAluno(student, forcar = false){
  if(!student) return;
  if(avalSubEfetiva(student) === "boletim") return carregarBoletinsDoAluno(student, forcar);
  return carregarAvaliacaoInstitucionalDoAluno(student, forcar);
}

/* Boletins do aluno (coleção boletinsIngles) — mesmo padrão de cache do
   carregarBoletimDoAluno: uma leitura filtrando por escolaId + alunoKey. */
async function carregarBoletinsDoAluno(student, forcar = false){
  const a = state.aval;
  const cache = a.boletimCache[student.id] || (a.boletimCache[student.id] = { registros: [], carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const chave = chaveAluno(student.escolaId, student.nome);
    const snap = await getDocs(query(collection(db, "boletinsIngles"), where("escolaId", "==", student.escolaId), where("alunoKey", "==", chave)));
    cache.registros = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((x, y) => (y.atualizadoEm || "").localeCompare(x.atualizadoEm || ""));
    cache.carregadoEm = Date.now();
  } catch(err){
    cache.erro = mensagemErroAvaliacoes(err);
  } finally {
    cache.carregando = false;
    render();
  }
}

/* Uma resposta por pessoa, por aluno e por semestre: o id é fixo, então
   responder de novo atualiza em vez de duplicar. */
function avalInstDocId(periodo, uid, alunoNome){
  return `${periodo}_${uid}_${slugNome(alunoNome, "aluno")}`;
}

async function carregarAvaliacaoInstitucionalDoAluno(student, forcar = false){
  const a = state.aval;
  carregarConfigAvaliacaoInstitucional(student.escolaId, forcar);
  const cache = a.instCache[student.id] || (a.instCache[student.id] = { registro: null, carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const id = avalInstDocId(periodoAtual(), state.authUser.uid, student.nome);
    const snap = await getDoc(doc(db, "avaliacoesInstitucionais", id));
    cache.registro = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    cache.carregadoEm = Date.now();
    // refaz o formulário em cima da resposta carregada, se a pessoa ainda não digitou nada
    const f = a.instForm;
    const vazio = !f || (Object.keys(f.respostas || {}).length === 0 && !(f.comentario || "").trim());
    if(a.instFormAlunoId !== student.id || vazio) a.instFormAlunoId = null;
  } catch(err){
    cache.erro = mensagemErroAvaliacoes(err);
  } finally {
    cache.carregando = false;
    render();
  }
}

/* Formulário em edição do aluno atual (nasce da resposta já enviada, se houver). */
function avalInstFormDe(student){
  const a = state.aval;
  if(a.instFormAlunoId !== student.id || !a.instForm){
    const reg = a.instCache[student.id]?.registro;
    a.instForm = { respostas: { ...(reg?.respostas || {}) }, comentario: reg?.comentario || "" };
    a.instFormAlunoId = student.id;
  }
  return a.instForm;
}

async function enviarAvaliacaoInstitucional(student){
  const a = state.aval;
  const config = avalConfigAtual(student.escolaId);
  if(!config.ativo){
    a.instErro = "A secretaria bloqueou novas respostas no momento. Tente de novo mais tarde.";
    a.instOk = false;
    render();
    return;
  }
  const form = avalInstFormDe(student);
  const erro = validarAvaliacaoInstitucional(form, config.perguntas);
  if(erro){
    a.instErro = erro;
    a.instOk = false;
    render();
    return;
  }
  a.instErro = "";
  a.instOk = false;
  a.instSalvando = true;
  render();
  try {
    const periodo = periodoAtual();
    const uid = state.authUser.uid;
    const id = avalInstDocId(periodo, uid, student.nome);
    const cache = a.instCache[student.id] || (a.instCache[student.id] = { registro: null, carregando: false, erro: "", carregadoEm: 0 });
    const agora = new Date().toISOString();
    const payload = {
      periodo,
      escolaId: student.escolaId,
      autorId: uid,
      autorRole: state.perfil?.role === "responsavel" ? "responsavel" : "aluno",
      alunoKey: chaveAluno(student.escolaId, student.nome),
      curso: student.turma || "",
      respostas: respostasLimpas(form, config.perguntas),
      comentario: (form.comentario || "").trim(),
      criadoEm: cache.registro?.criadoEm || agora,
      atualizadoEm: agora,
    };
    await setDoc(doc(db, "avaliacoesInstitucionais", id), payload);
    cache.registro = { id, ...payload };
    cache.carregadoEm = Date.now();
    a.instOk = true;
  } catch(err){
    console.error("Erro ao enviar a avaliação institucional:", err?.code, err);
    a.instErro = "Não foi possível enviar sua avaliação. Tente de novo.";
  } finally {
    a.instSalvando = false;
    render();
  }
}

/* ---------------- lado de quem preenche o boletim (professor / secretaria) ---------------- */
function avalTurmasDeIngles(){
  const lista = state.screen === "instituicao" ? (state.instTurmas || []) : (state.data.professorTurmas || []);
  return lista.filter(t => ehAlunoDeIngles(t.disciplina || t.nome));
}

function avalTurmaAtual(){
  return avalTurmasDeIngles().find(t => t.id === state.aval.turmaId) || null;
}

/* Nome pré-preenchido em "Teacher’s Name": o próprio professor logado, ou
   o professor vinculado à turma (quando quem preenche é a secretaria). */
function avalNomeDoProfessor(turma){
  if(state.screen === "professor") return state.data.professorNome || "";
  const prof = (state.gestaoProfessores || []).find(p => p.id === turma.professorId);
  return prof?.nome || "";
}

async function carregarBoletinsDaTurma(turma){
  const a = state.aval;
  a.carregando = true;
  a.erro = "";
  render();
  try {
    /* A regra de leitura de boletinsIngles exige provar, pela própria consulta,
       que o professor é o dono (professorId) ou que a pessoa é da unidade
       (escolaId). Só com turmaId o Firestore recusa (permission-denied). */
    const filtroAcesso = state.screen === "professor"
      ? where("professorId", "==", state.authUser.uid)
      : where("escolaId", "==", turma.escolaId);
    const snap = await getDocs(query(collection(db, "boletinsIngles"), where("turmaId", "==", turma.id), filtroAcesso));
    if(a.turmaId !== turma.id) return;   // a pessoa já trocou de turma
    a.lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    a.listaTurmaId = turma.id;
  } catch(err){
    if(a.turmaId === turma.id){
      a.lista = [];
      a.listaTurmaId = turma.id;
      a.erro = mensagemErroAvaliacoes(err);
    }
  } finally {
    a.carregando = false;
    render();
  }
}

function avalAbrirAluno(alunoNome){
  const a = state.aval;
  const turma = avalTurmaAtual();
  if(!turma) return;
  const existente = (a.lista || []).find(b => b.alunoNome === alunoNome);
  if(existente){
    a.form = boletimParaForm(existente);
  } else {
    const ref = (a.lista || [])[0];   // repete livro/grupo/professor já usados na turma
    a.form = boletimFormVazio({
      livro: ref?.livro || "",
      grupo: ref?.grupo || turma.nome || "",
      professor: ref?.professorNome || avalNomeDoProfessor(turma),
    });
  }
  a.alunoNome = alunoNome;
  a.formErro = "";
  a.formOk = false;
  a.impressaoErro = "";
  render();
}

/* Campos de texto do editor guardam o valor sem re-renderizar (o cursor não pula). */
function avalAtualizarCampo(campo, valor){
  const f = state.aval.form;
  if(!f) return;
  if(campo.startsWith("extra.")){
    const k = campo.slice(6);
    if(Object.prototype.hasOwnProperty.call(f.extra, k)) f.extra[k] = valor;
    return;
  }
  if(["livro", "grupo", "professor", "feedback"].includes(campo)) f[campo] = valor;
}

/* Um documento por aluno por turma: reabrir e salvar de novo atualiza. */
async function salvarBoletimIngles(turma, alunoNome, form){
  const dados = formParaBoletim(form);
  const id = `${turma.id}_${slugNome(alunoNome, "aluno")}`;
  const payload = {
    alunoKey: chaveAluno(turma.escolaId, alunoNome),
    alunoNome,
    escolaId: turma.escolaId,
    turmaId: turma.id,
    turmaNome: turma.nome || "",
    livro: dados.livro,
    grupo: dados.grupo,
    professorNome: dados.professorNome,
    professorId: turma.professorId || (state.screen === "professor" ? state.authUser.uid : ""),
    sem1: dados.sem1,
    sem2: dados.sem2,
    extra: dados.extra,
    feedback: dados.feedback,
    atualizadoEm: new Date().toISOString(),
    atualizadoPorId: state.authUser.uid,
    atualizadoPorNome: state.screen === "professor" ? (state.data.professorNome || "") : (state.perfil?.nome || "Secretaria"),
  };
  await setDoc(doc(db, "boletinsIngles", id), payload);
  return { id, ...payload };
}

/* Ao abrir a aba: o professor com uma turma de Inglês só já cai nela. */
function avalAbrirNoProfessor(){
  const turmas = avalTurmasDeIngles();
  if(turmas.length === 1 && !state.aval.turmaId){
    state.aval.turmaId = turmas[0].id;
    carregarBoletinsDaTurma(turmas[0]);
  }
}

/* Secretaria: precisa das turmas (seletor), dos professores (nome no
   boletim) e, se estiver na sub-aba institucional, do resultado. */
function avalAbrirNaInstituicao(){
  const escolaId = state.escolaSelecionadaId;
  if(!escolaId) return;
  if((state.instTurmas === null || state.instTurmasEscolaId !== escolaId) && !state.instTurmasCarregando){
    carregarTurmasDaInstituicao(escolaId);
  }
  if((state.gestaoProfessores === null || state.gestaoEquipeEscolaId !== escolaId) && !state.gestaoEquipeCarregando){
    carregarEquipeDaEscola(escolaId);
  }
  if(state.aval.sub === "institucional"){
    carregarResultadosInstitucionais(escolaId);
    carregarConfigAvaliacaoInstitucional(escolaId);
  }
}

async function carregarResultadosInstitucionais(escolaId, forcar = false){
  const a = state.aval;
  if(a.resultadosCarregando) return;
  const r = a.resultados;
  if(!forcar && r && r.escolaId === escolaId && r.periodo === a.periodo && Date.now() - r.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  a.resultadosCarregando = true;
  a.resultadosErro = "";
  render();
  try {
    const periodo = a.periodo;
    const snap = await getDocs(query(collection(db, "avaliacoesInstitucionais"), where("escolaId", "==", escolaId), where("periodo", "==", periodo)));
    a.resultados = { escolaId, periodo, registros: snap.docs.map(d => ({ id: d.id, ...d.data() })), carregadoEm: Date.now() };
  } catch(err){
    a.resultadosErro = mensagemErroAvaliacoes(err);
  } finally {
    a.resultadosCarregando = false;
    render();
  }
}

/* ---------------- configuração (perguntas + liga/desliga) ---------------- */
/* Um só cache por escola: serve tanto pra secretaria (que edita) quanto
   pro aluno/responsável (que só lê, pra saber se está aberta e quais são
   as perguntas de hoje). Sem documento salvo ainda, vale o padrão. */
async function carregarConfigAvaliacaoInstitucional(escolaId, forcar = false){
  if(!escolaId) return;
  const a = state.aval;
  const cache = a.instConfigCache[escolaId] || (a.instConfigCache[escolaId] = { config: null, carregando: false, erro: "", carregadoEm: 0 });
  if(cache.carregando) return;
  if(!forcar && cache.carregadoEm && Date.now() - cache.carregadoEm < CALENDARIO_ATUALIZA_APOS_MS) return;

  cache.carregando = true;
  cache.erro = "";
  render();
  try {
    const snap = await getDoc(doc(db, "avaliacaoInstConfig", escolaId));
    cache.config = avalConfigDeDocumento(snap.exists() ? snap.data() : null);
    cache.carregadoEm = Date.now();
  } catch(err){
    cache.erro = mensagemErroAvaliacoes(err);
  } finally {
    cache.carregando = false;
    render();
  }
}

/* Configuração efetiva já carregada pra uma escola (ou o padrão, se
   ainda não chegou/não existe documento). */
function avalConfigAtual(escolaId){
  return state.aval.instConfigCache[escolaId]?.config || avalConfigPadrao();
}

/* Rascunho em edição da secretaria — nasce de uma cópia da configuração
   carregada, pra dar pra mexer (adicionar/remover/editar pergunta, ligar
   e desligar) sem afetar o que já está salvo até clicar em "Salvar". */
function avalConfigFormDe(escolaId){
  const a = state.aval;
  const cache = a.instConfigCache[escolaId];
  const carregado = !!(cache && cache.carregadoEm);
  // Nasce do padrão provisório antes da leitura terminar; assim que o
  // documento de verdade chega, o rascunho é refeito em cima dele UMA
  // vez só — depois disso, as edições da secretaria são preservadas
  // mesmo que o cache seja atualizado de novo em segundo plano.
  if(a.configEscolaId !== escolaId || !a.configForm || (carregado && !a.configFormCarregado)){
    const atual = avalConfigAtual(escolaId);
    a.configForm = { ativo: atual.ativo, perguntas: atual.perguntas.map(p => ({ ...p })) };
    a.configEscolaId = escolaId;
    a.configFormCarregado = carregado;
    a.configErro = "";
    a.configOk = false;
  }
  return a.configForm;
}

function avalConfigToggleAtivo(escolaId){
  const f = avalConfigFormDe(escolaId);
  f.ativo = !f.ativo;
  state.aval.configOk = false;
}

function avalConfigAtualizarPergunta(escolaId, idx, texto){
  const f = avalConfigFormDe(escolaId);
  if(f.perguntas[idx]) f.perguntas[idx].texto = texto;
  state.aval.configOk = false;
}

function avalConfigAdicionarPergunta(escolaId){
  const f = avalConfigFormDe(escolaId);
  f.perguntas.push({ id: novoIdPergunta("nova pergunta", f.perguntas), texto: "" });
  state.aval.configOk = false;
}

function avalConfigRemoverPergunta(escolaId, idx){
  const f = avalConfigFormDe(escolaId);
  if(f.perguntas.length <= 1) return;
  f.perguntas.splice(idx, 1);
  state.aval.configOk = false;
}

function avalConfigRestaurarPadrao(escolaId){
  const a = state.aval;
  const padrao = avalConfigPadrao();
  a.configForm = { ativo: a.configForm ? a.configForm.ativo : padrao.ativo, perguntas: padrao.perguntas };
  a.configEscolaId = escolaId;
  a.configOk = false;
}

async function salvarConfigAvaliacaoInstitucional(escolaId){
  const a = state.aval;
  const form = avalConfigFormDe(escolaId);
  const erro = validarConfigPerguntas(form.perguntas);
  if(erro){
    a.configErro = erro;
    a.configOk = false;
    render();
    return;
  }
  a.configErro = "";
  a.configOk = false;
  a.configSalvando = true;
  render();
  try {
    const payload = {
      ativo: !!form.ativo,
      perguntas: form.perguntas.map(p => ({ id: p.id, texto: p.texto.trim() })),
      atualizadoEm: new Date().toISOString(),
      atualizadoPorId: state.authUser.uid,
    };
    await setDoc(doc(db, "avaliacaoInstConfig", escolaId), payload);
    const cache = a.instConfigCache[escolaId] || (a.instConfigCache[escolaId] = { config: null, carregando: false, erro: "", carregadoEm: 0 });
    cache.config = avalConfigDeDocumento(payload);
    cache.carregadoEm = Date.now();
    a.configOk = true;
  } catch(err){
    console.error("Erro ao salvar a configuração da avaliação institucional:", err?.code, err);
    a.configErro = "Não foi possível salvar a configuração. Tente de novo.";
  } finally {
    a.configSalvando = false;
    render();
  }
}

/* ---------------- telas ---------------- */
const AVAL_SUBS = [
  { key: "boletim", label: "Boletim", desc: "Report Card de Inglês" },
  { key: "institucional", label: "Avaliação institucional", desc: "Sua opinião sobre o Educa+" },
];

/* Aluno e responsável (papel só muda o texto). */
function avaliacoesAlunoView(student, papel){
  if(!student){
    return `<h2 class="section-title">Avaliações</h2><p class="section-eyebrow">Nenhum aluno vinculado.</p>`;
  }
  const ingles = ehAlunoDeIngles(student.turma);
  const sub = avalSubEfetiva(student);
  const subs = ingles ? avalSubAbasHtml(AVAL_SUBS, sub) : "";
  const corpo = sub === "boletim" ? avalBoletimAlunoView(student) : avalInstitucionalAlunoView(student);
  return `
    <h2 class="section-title">Avaliações</h2>
    <p class="section-eyebrow">${escapeHtml(student.nome)} · ${escapeHtml(student.turma)}</p>
    ${subs}
    ${corpo}`;
}

function avalBoletimAlunoView(student){
  const a = state.aval;
  const cache = a.boletimCache[student.id] || { registros: [], carregando: false, erro: "" };
  const erroMsg = msg => `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:13px;">${escapeHtml(msg)}</p>`;

  if(cache.erro) return erroMsg(cache.erro);
  if(cache.carregando && cache.registros.length === 0) return `<p class="section-eyebrow">Carregando boletim…</p>`;
  if(cache.registros.length === 0){
    return `<div class="card flush"><div style="padding:20px;font-size:14px;color:var(--slate);">O boletim ainda não foi lançado pelo professor.</div></div>`;
  }
  return cache.registros.map(b => `
    <div class="teacher-panel aval-boletim">
      ${boletimHtml({ alunoNome: b.alunoNome || student.nome, form: boletimParaForm(b), editavel: false })}
      <div class="aval-acoes">
        <button type="button" class="attendance-btn" data-action="aval-imprimir" data-src="registro" data-id="${escapeHtml(b.id)}">Imprimir / salvar PDF</button>
        <span class="aval-atualizado">Atualizado em ${escapeHtml((b.atualizadoEm || "").slice(0, 10).split("-").reverse().join("/"))}</span>
      </div>
    </div>`).join("") + (a.impressaoErro ? erroMsg(a.impressaoErro) : "");
}

function avalInstitucionalAlunoView(student){
  const a = state.aval;
  const cache = a.instCache[student.id] || { registro: null, carregando: false, erro: "" };
  if(cache.erro){
    return `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:13px;">${escapeHtml(cache.erro)}</p>`;
  }
  if(cache.carregando && !cache.registro){
    return `<p class="section-eyebrow">Carregando avaliação…</p>`;
  }
  const config = avalConfigAtual(student.escolaId);
  return avaliacaoInstitucionalHtml({
    periodo: periodoAtual(),
    perguntas: config.perguntas,
    bloqueada: !config.ativo,
    form: avalInstFormDe(student),
    jaRespondeu: !!cache.registro,
    salvando: a.instSalvando,
    erro: a.instErro,
    ok: a.instOk,
  });
}

/* Professor: só o boletim das turmas de Inglês dele. */
function avaliacoesProfessorView(){
  return `
    <h2 class="section-title">Avaliações</h2>
    <p class="section-eyebrow">Boletim (Report Card) dos alunos de Inglês.</p>
    ${avalGestaoBoletimView(avalTurmasDeIngles())}`;
}

/* Secretaria: preenche o boletim e acompanha a avaliação institucional. */
function avaliacoesInstituicaoView(school){
  const sub = state.aval.sub === "institucional" ? "institucional" : "boletim";
  const subs = avalSubAbasHtml([
    { key: "boletim", label: "Boletim", desc: "Report Card dos alunos de Inglês" },
    { key: "institucional", label: "Avaliação institucional", desc: "Respostas de alunos e responsáveis" },
  ], sub);

  let corpo;
  if(sub === "boletim"){
    corpo = avalGestaoBoletimView(avalTurmasDeIngles());
  } else {
    const escolaId = state.escolaSelecionadaId;
    const configCache = state.aval.instConfigCache[escolaId] || { config: null, carregando: false };
    const config = avalConfigFormDe(escolaId);
    const painelConfig = avalConfigInstitucionalHtml({
      form: config,
      carregando: configCache.carregando && !configCache.config,
      salvando: state.aval.configSalvando,
      erro: state.aval.configErro,
      ok: state.aval.configOk,
    });

    const r = state.aval.resultados;
    const resultados = (r && r.escolaId === escolaId && r.periodo === state.aval.periodo) ? r : null;
    const painelResultados = resultadosInstitucionaisHtml({
      periodo: state.aval.periodo,
      perguntas: avalConfigAtual(escolaId).perguntas,
      resultados,
      carregando: state.aval.resultadosCarregando,
      erro: state.aval.resultadosErro,
    });
    corpo = `${painelConfig}<div style="height:24px;"></div>${painelResultados}`;
  }
  return `
    <h2 class="section-title">Avaliações</h2>
    <p class="section-eyebrow">${escapeHtml(school?.nome || "")}</p>
    ${subs}
    ${corpo}`;
}

/* Lista de turmas -> lista de alunos -> editor do Report Card.
   Compartilhada pelo professor e pela secretaria. */
function avalGestaoBoletimView(turmas){
  const a = state.aval;
  const erroMsg = msg => `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin:8px 0;">${escapeHtml(msg)}</p>`;

  if(state.screen === "instituicao" && state.instTurmasCarregando && turmas.length === 0){
    return `<p class="section-eyebrow">Carregando turmas…</p>`;
  }
  if(turmas.length === 0){
    return `<p class="section-eyebrow">Nenhuma turma de Inglês disponível ainda.</p>`;
  }

  const turma = turmas.find(t => t.id === a.turmaId) || null;
  const seletor = `<div class="teacher-class-list">${turmas.map(t => `
    <button type="button" class="teacher-class-card ${turma && t.id === turma.id ? "active" : ""}" data-action="aval-turma" data-id="${escapeHtml(t.id)}">
      <span>${escapeHtml(t.horario || "")}</span><strong>${escapeHtml(t.nome)}</strong><small>${escapeHtml(t.escola || "")} · ${(t.alunos || []).length} aluno(s)</small>
    </button>`).join("")}</div>`;

  if(!turma) return `<p class="section-eyebrow">Escolha a turma para preencher os boletins.</p>${seletor}`;
  if(a.carregando && a.listaTurmaId !== turma.id){
    return `${seletor}<p class="section-eyebrow">Carregando boletins desta turma…</p>`;
  }

  // ---- editor de um aluno ----
  if(a.alunoNome && a.form){
    return `
      ${seletor}
      <div class="teacher-panel">
        <div class="teacher-panel-head">
          <div><h2>${escapeHtml(a.alunoNome)}</h2><p>${escapeHtml(turma.nome)} · Report Card</p></div>
          <button type="button" class="attendance-btn" data-action="aval-voltar">${ICONS.chevronLeft} Voltar à lista</button>
        </div>
        ${boletimHtml({ alunoNome: a.alunoNome, form: a.form, editavel: true })}
        <div class="aval-acoes">
          <button type="button" class="teacher-primary-btn" data-action="aval-salvar" ${a.salvando ? "disabled" : ""}>${a.salvando ? "Salvando…" : "Salvar boletim"}</button>
          <button type="button" class="attendance-btn" data-action="aval-imprimir" data-src="form">Imprimir / salvar PDF</button>
        </div>
        ${a.formErro ? erroMsg(a.formErro) : ""}
        ${a.impressaoErro ? erroMsg(a.impressaoErro) : ""}
        ${a.formOk ? `<p class="teacher-success">Boletim salvo — já aparece para o aluno e o responsável.</p>` : ""}
      </div>`;
  }

  // ---- lista de alunos da turma ----
  const lista = state.aval.listaTurmaId === turma.id ? (a.lista || []) : [];
  const alunos = turma.alunos || [];
  const linhas = alunos.length ? alunos.map(nome => {
    const b = lista.find(x => x.alunoNome === nome);
    return `
      <div class="row">
        <div>
          <strong style="display:block;font-size:14px;color:var(--ink);">${escapeHtml(nome)}</strong>
          <span style="font-size:12px;color:var(--slate);">${b ? "Atualizado em " + escapeHtml((b.atualizadoEm || "").slice(0, 10).split("-").reverse().join("/")) : "Ainda não preenchido"}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="pill ${b ? "pill-green" : "pill-gold"}">${b ? "Preenchido" : "Pendente"}</span>
          <button type="button" class="attendance-btn" data-action="aval-abrir-aluno" data-aluno="${escapeHtml(nome)}">${b ? `${ICONS.pencil} Editar` : "Preencher"}</button>
        </div>
      </div>`;
  }).join("") : `<div style="padding:20px;font-size:14px;color:var(--slate);">Esta turma ainda não tem alunos.</div>`;

  return `
    ${seletor}
    <div class="teacher-panel">
      <div class="teacher-panel-head"><div><h2>${escapeHtml(turma.nome)}</h2><p>${escapeHtml(turma.escola || "")} · ${escapeHtml(turma.disciplina || "")}</p></div></div>
      ${a.erro ? erroMsg(a.erro) : ""}
      <div class="card flush">${linhas}</div>
    </div>`;
}

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
    // Aba Horários: guarda o valor sem re-renderizar, pro cursor não pular.
    if(t.dataset && t.dataset.hor){ horarios.input(t); return; }
    // Aba Avaliações: campos do boletim e comentário da avaliação institucional
    // guardam o valor sem re-renderizar, pro cursor não pular.
    if(t.dataset && t.dataset.avalCampo){
      avalAtualizarCampo(t.dataset.avalCampo, t.value);
      return;
    }
    if(t.dataset && t.dataset.avalInst){
      const alunoAval = calAlunoAtual();
      if(alunoAval && t.dataset.avalInst === "comentario") avalInstFormDe(alunoAval).comentario = t.value;
      return;
    }
    if(t.dataset && t.dataset.action === "aval-config-pergunta-texto"){
      avalConfigAtualizarPergunta(state.escolaSelecionadaId, Number(t.dataset.idx), t.value);
      return;
    }
    // Formulário de novo aviso (professor): guarda sem re-renderizar, pro cursor não pular.
    if(t.dataset && t.dataset.evCampo){
      if(state.cal.form) state.cal.form[t.dataset.evCampo] = t.value;
      return;
    }
    // Formulário de novo item do calendário da secretaria: mesma lógica.
    if(t.dataset && t.dataset.eviCampo){
      if(state.cal.formInst) state.cal.formInst[t.dataset.eviCampo] = t.value;
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
    if(t.id === "prof-busca"){
      const cursor = t.selectionStart;
      state.profBusca = t.value;
      render();
      const novo = document.getElementById("prof-busca");
      if(novo){ novo.focus(); novo.setSelectionRange(cursor, cursor); }
      return;
    }
    if(t.id === "resp-busca"){
      const cursor = t.selectionStart;
      state.respBusca = t.value;
      render();
      const novo = document.getElementById("resp-busca");
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
    if(t.dataset && t.dataset.anivMsg){
      if(state.aniversarioMsgRascunho) state.aniversarioMsgRascunho[t.dataset.anivMsg] = t.value;
      return;
    }
    if(t.dataset && t.dataset.ficha){
      fichaFormAtual()[t.dataset.ficha] = t.value;
      return;
    }
    if(t.dataset && t.dataset.fichaAluno){
      const alunoDaFicha = calAlunoAtual();
      if(alunoDaFicha) alunoFichaEstado(alunoDaFicha).form[t.dataset.fichaAluno] = t.value;
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
    if(t.id === "activity-name"){
      state.professorAtividadeNome = t.value;
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
    if(t.id === "new-user-email"){ state.novoUsuarioEmail = t.value; state.novoUsuarioEmailManual = true; return; }
    if(t.id === "new-user-senha"){ state.novoUsuarioSenha = t.value; return; }
    if(t.id === "new-user-turma"){ state.novoUsuarioTurma = t.value; return; }
    if(t.id === "new-user-contato"){ state.novoUsuarioContato = t.value; return; }
    if(t.id === "profile-name-input"){ state.perfilNomeInput = t.value; return; }
    if(t.id === "aluno-detalhe-nome"){ state.alunoDetalheNomeInput = t.value; return; }
    if(t.id === "aluno-detalhe-contato"){ state.alunoDetalheContatoInput = t.value; return; }
    if(t.id === "resp-modal-nome"){ state.respModalNomeInput = t.value; return; }
    if(t.id === "resp-modal-contato"){ state.respModalContato = t.value; return; }
    if(t.id === "resp-modal-email"){ state.respModalEmail = t.value; return; }
    if(t.id === "aluno-resp-nome"){ state.alunoRespNome = t.value; return; }
    if(t.id === "aluno-resp-contato"){ state.alunoRespContato = t.value; return; }
    if(t.id === "aluno-sit-matricula"){ state.alunoSitMatricula = t.value; return; }
    if(t.id === "aluno-sit-data"){ state.alunoSitData = t.value; return; }
    if(t.id === "aluno-sit-motivo"){ state.alunoSitMotivo = t.value; return; }
    if(t.id === "aluno-fin-competencia"){ state.alunoFinCompetencia = t.value; return; }
    if(t.id === "aluno-fin-valor"){ state.alunoFinValor = t.value; return; }
    if(t.id === "aluno-fin-vencimento"){ state.alunoFinVencimento = t.value; return; }
    if(t.id === "aluno-fin-pix"){ state.alunoFinPix = t.value; return; }
    if(t.id === "aluno-fin-codigo-barras"){ state.alunoFinCodigoBarras = t.value; return; }
    if(t.id === "aluno-fin-link-cartao"){ state.alunoFinLinkCartao = t.value; return; }
    if(t.id === "fin-consulta-busca"){ state.finConsultaBusca = t.value; atualizarListaConsultaFin(); return; }
    if(t.id === "fin-cobranca-busca"){ state.finCobrancaBusca = t.value; atualizarResultadosBuscaFin(); return; }
    if(t.id === "fin-cobranca-competencia"){ state.finCobrancaCompetencia = t.value; return; }
    if(t.id === "fin-cobranca-valor"){ state.finCobrancaValor = t.value; return; }
    if(t.id === "fin-cobranca-vencimento"){ state.finCobrancaVencimento = t.value; return; }
    if(t.id === "fin-cobranca-pix"){ state.finCobrancaPix = t.value; return; }
    if(t.id === "fin-cobranca-codigo-barras"){ state.finCobrancaCodigoBarras = t.value; return; }
    if(t.id === "fin-cobranca-link-cartao"){ state.finCobrancaLinkCartao = t.value; return; }
    // Campos do contrato: guardam o valor sem re-renderizar, senão o
    // cursor pula pra fora do input a cada tecla. O recálculo (parcelas,
    // término) acontece no "change", quando a pessoa sai do campo.
    if(t.dataset && t.dataset.contratoField){
      state.contrato[t.dataset.contratoField] = t.value;
      return;
    }
    if(t.dataset && t.dataset.respExtra){
      const alvo = t.dataset.escopo === "import"
        ? state.importContratosItens[Number(t.dataset.row)]?.contrato : state.contrato;
      const extra = alvo?.respsExtras?.[Number(t.dataset.idx)];
      if(extra){
        extra[t.dataset.respExtra] = t.value;
        if(t.dataset.respExtra === "nome") extra.email = "";  // nome mudou: login antigo não serve
      }
      if(t.dataset.importante) t.classList.toggle("is-faltando", !String(t.value).trim());
      return;
    }
    if(t.dataset && t.dataset.importCampo){
      const i = Number(t.dataset.row);
      const item = state.importContratosItens[i];
      if(item){
        item.contrato[t.dataset.importCampo] = t.value;
        // quem digita um responsável quer que ele seja cadastrado
        if(t.dataset.importCampo === "respNome") item.contrato.semResponsavel = !t.value.trim();
      }
      // tira (ou volta) o realce do campo na hora, sem redesenhar a tela
      if(t.dataset.importante) t.classList.toggle("is-faltando", !String(t.value).trim());
      return;
    }
    if(t.id === "nova-turma-nome"){ state.novaTurmaNome = t.value; return; }
    if(t.id === "nova-turma-horario"){ state.novaTurmaHorario = t.value; return; }
    if(t.id === "nova-turma-sala"){ state.novaTurmaSala = t.value; return; }
    if(t.id === "cert-form-modulo"){ state.certFormModulo = t.value; return; }
    if(t.id === "cert-form-link"){ state.certFormLink = t.value; return; }
  });

  app.addEventListener("change", async (e) => {
    const t = e.target;
    if(t.dataset && t.dataset.hor){ horarios.change(t); return; }
    if(t.id === "aval-inst-periodo"){
      state.aval.periodo = t.value;
      render();
      carregarResultadosInstitucionais(state.escolaSelecionadaId, true);
      return;
    }
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
    if(t.dataset && t.dataset.eviCampo){
      const f = state.cal.formInst;
      if(!f) return;
      f[t.dataset.eviCampo] = t.value;
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
    if(t.id === "aluno-sit-situacao"){
      state.alunoSitSituacao = t.value;
      if(t.value !== "ativo" && !state.alunoSitData) state.alunoSitData = dataDeHojeISO();
      render();
      return;
    }
    if(t.id === "aluno-fin-forma"){
      state.alunoFinForma = t.value;
      render();
      return;
    }
    if(t.id === "fin-cobranca-forma"){
      state.finCobrancaForma = t.value;
      render();
      return;
    }
    if(t.id === "aluno-fin-pix-tipo"){
      state.alunoFinPixTipo = t.value;
      render();
      return;
    }
    if(t.id === "fin-cobranca-pix-tipo"){
      state.finCobrancaPixTipo = t.value;
      render();
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
    if(t.dataset && t.dataset.alunoFinBoleto){
      const arq = t.files && t.files[0];
      t.value = "";
      if(!arq) return;
      if(arq.size > BOLETO_PDF_TAMANHO_MAX){
        state.alunoFinErro = `Esse PDF tem mais de ${Math.round(BOLETO_PDF_TAMANHO_MAX / 1024)}KB. Comprima o arquivo e tente de novo.`;
        render();
        return;
      }
      state.alunoFinErro = "";
      state.alunoFinBoletoLendo = true;
      render();
      try {
        const dados = await lerArquivoComoDataUrl(arq);
        state.alunoFinBoletoArquivo = { nome: arq.name, dados };
        const lido = await lerDadosDoBoletoPdf(arq).catch(() => null);
        aplicarDadosDoBoleto("aluno-fin", lido);
      } catch(err){
        state.alunoFinErro = "Não consegui ler esse PDF. Tente outro arquivo.";
      } finally {
        state.alunoFinBoletoLendo = false;
        render();
      }
      return;
    }
    if(t.dataset && t.dataset.finCobrancaBoleto){
      const arq = t.files && t.files[0];
      t.value = "";
      if(!arq) return;
      if(arq.size > BOLETO_PDF_TAMANHO_MAX){
        state.finCobrancaErro = `Esse PDF tem mais de ${Math.round(BOLETO_PDF_TAMANHO_MAX / 1024)}KB. Comprima o arquivo e tente de novo.`;
        render();
        return;
      }
      state.finCobrancaErro = "";
      state.finCobrancaBoletoLendo = true;
      render();
      try {
        const dados = await lerArquivoComoDataUrl(arq);
        state.finCobrancaBoletoArquivo = { nome: arq.name, dados };
        const lido = await lerDadosDoBoletoPdf(arq).catch(() => null);
        aplicarDadosDoBoleto("fin-cobranca", lido);
      } catch(err){
        state.finCobrancaErro = "Não consegui ler esse PDF. Tente outro arquivo.";
      } finally {
        state.finCobrancaBoletoLendo = false;
        render();
      }
      return;
    }
    if(t.id === "contrato-up-status"){
      state.contratoUpStatus = t.value === "assinado" ? "assinado" : "pendente";
      return;
    }
    if(t.dataset && t.dataset.contratoAnexo){
      const arquivos = Array.from(t.files || []);
      const alunoAnexo = (state.instAlunos || []).find(a => a.id === t.dataset.contratoAnexo);
      t.value = "";
      if(alunoAnexo && arquivos.length) await anexarContratosDoAluno(alunoAnexo, arquivos);
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
          const { texto, ocr } = await extrairTextoContrato(arquivo, (pg, tot) => {
            state.importContratosOcrAndamento = `${arquivo.name} — lendo página ${pg} de ${tot} (escaneado)…`;
            render();
          });
          const { contrato, avisos } = interpretarContratoTexto(texto);
          if(ocr) avisos.unshift("Documento escaneado, lido por OCR — confira CPF, RG, datas e valores com o PDF antes de importar.");
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
              : (err?.message === "tesseract-nao-carregado" ? "A biblioteca de leitura de escaneados (OCR) não carregou (conexão bloqueada?). Tente de novo." : "Não consegui ler este PDF. Preencha manualmente ou pule este arquivo.")],
            selecionado: false,
            criarAcesso: false,
            status: "",
            erro: "",
          });
        }
      }
      state.importContratosLendo = false;
      state.importContratosOcrAndamento = "";
      encerrarOcrWorker();  // libera a memória do OCR
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
      } else if(campo === "aluno2Cadastrado"){
        // mesmo atalho, para o segundo aluno
        if(t.value){ c.aluno2Nome = t.value; c.emailAluno2 = ""; }
      } else {
        c[campo] = t.value;
      }
      if(campo === "duracao") contratoRecalcular(c, { forcarParcelas: true });
      else contratoRecalcular(c);
      // o curso decide se o aluno recebe login (Recreação não recebe)
      if(campo === "curso" || campo === "alunoCadastrado" || campo === "aluno2Cadastrado") contratoSugerirAcessos(c, emailsUsadosDaUnidade());
      c.erro = "";
      render();
      return;
    }
    if(t.dataset && t.dataset.respExtra){
      const alvo = t.dataset.escopo === "import"
        ? state.importContratosItens[Number(t.dataset.row)]?.contrato : state.contrato;
      const extra = alvo?.respsExtras?.[Number(t.dataset.idx)];
      if(extra) extra[t.dataset.respExtra] = t.value;
      // nome novo: sugere login e senha (não redesenha, pra não tirar o cursor do campo)
      if(alvo && t.dataset.respExtra === "nome"){
        if(extra) extra.email = "";
        contratoSugerirAcessos(alvo, emailsUsadosDaUnidade());
      }
      return;
    }
    if(t.dataset && t.dataset.contratoField){
      // datas e valores: ao sair do campo, recalcula término/parcelas
      state.contrato[t.dataset.contratoField] = t.value;
      const recalcula = ["dataInicio","duracaoCustom","valorCurso","valorMaterial","numParcelas","qtdParcelasIniciais"];
      // nome mudou: o login antigo não serve mais, refaz do zero
      const sugereAcesso = ["alunoNome","aluno2Nome","respNome"];
      if(t.dataset.contratoField === "alunoNome") state.contrato.emailAluno = "";
      if(t.dataset.contratoField === "aluno2Nome") state.contrato.emailAluno2 = "";
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
    if(t.id === "new-user-name"){
      state.novoUsuarioNome = t.value;
      sugerirAcessoNovoUsuario();
      const campoEmail = document.getElementById("new-user-email");
      const campoSenha = document.getElementById("new-user-senha");
      if(campoEmail) campoEmail.value = state.novoUsuarioEmail || "";
      if(campoSenha) campoSenha.value = state.novoUsuarioSenha || "";
      garantirPessoasDaUnidade();
      return;
    }
    if(t.id === "new-user-turma"){
      state.novoUsuarioTurma = t.value;
      // Recreação não tem login do aluno: redesenha pra esconder/mostrar e-mail e senha.
      if(ehTurmaDeRecreacao(t.value)){ state.novoUsuarioEmail = ""; state.novoUsuarioSenha = ""; state.novoUsuarioEmailManual = false; }
      else sugerirAcessoNovoUsuario();
      render();
      return;
    }
    if(t.id === "new-user-sexo"){ state.novoUsuarioSexo = t.value; return; }
    if(t.id === "new-user-parentesco"){ state.novoUsuarioParentesco = t.value; return; }
    if(t.id === "aluno-resp-parentesco"){ state.alunoRespParentesco = t.value; return; }
    if(t.id === "resp-modal-parentesco"){ state.respModalParentesco = t.value; return; }
    if(t.id === "edit-professor-sexo"){ state.editProfessorSexo = t.value; return; }
    if(t.id === "new-user-role"){
      await mudarPapelNovoUsuario(t.value);
    }
  });

  app.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if(!el) return;
    const action = el.dataset.action;

    // Aba Horários: todas as ações começam com "hor-" (ver horarios.js)
    if(action.startsWith("hor-")){
      await horarios.click(el);
      return;
    }

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
        state.aval = avalNovoEstado();
        state.screen = "instituicao";
        render();
        carregarTurmasDaInstituicao(state.escolaSelecionadaId);
        break;

      case "avisos-popup-fechar":
        gravarAvisosVistos(state.avisosPopup.itens.map(e => e.id));
        state.avisosPopup.aberto = false;
        state.avisosPopup.itens = [];
        render();
        break;

      case "open-escola-picker":
        state.mobileMenuOpen = false;
        state.screen = "escola-picker";
        render();
        break;

      case "cancel-escola-picker":
        state.screen = "instituicao";
        render();
        break;

      case "set-aluno-tab":
        state.alunoTab = el.dataset.key;
        state.alunoFicha.erro = ""; state.alunoFicha.mensagem = "";
        state.cal.diaAberto = null;
        render();
        if(state.alunoTab === "calendario") carregarCalendarioDoAluno(state.data.aluno);
        else if(state.alunoTab === "notas") carregarBoletimDoAluno(state.data.aluno);
        else if(state.alunoTab === "certificados") carregarCertificadosDoAluno(state.data.aluno);
        else if(state.alunoTab === "aval"){ state.aval.instOk = false; state.aval.instErro = ""; carregarAvaliacoesDoAluno(state.data.aluno); }
        break;
      case "set-familia-tab":
        state.familiaTab = el.dataset.key;
        state.alunoFicha.erro = ""; state.alunoFicha.mensagem = "";
        state.cal.diaAberto = null;
        render();
        if(state.familiaTab === "calendario") carregarCalendarioDoAluno(calAlunoAtual());
        else if(state.familiaTab === "notas") carregarBoletimDoAluno(calAlunoAtual());
        else if(state.familiaTab === "certificados") carregarCertificadosDoAluno(calAlunoAtual());
        else if(state.familiaTab === "aval"){ state.aval.instOk = false; state.aval.instErro = ""; carregarAvaliacoesDoAluno(calAlunoAtual()); }
        else if(state.familiaTab === "contratos") carregarContratosDoAluno(state.familiaStudentId);
        break;
      case "switch-student":
        state.familiaStudentId = el.dataset.id;
        state.cal.diaAberto = null;
        render();
        if(state.familiaTab === "calendario") carregarCalendarioDoAluno(calAlunoAtual());
        else if(state.familiaTab === "notas") carregarBoletimDoAluno(calAlunoAtual());
        else if(state.familiaTab === "certificados") carregarCertificadosDoAluno(calAlunoAtual());
        else if(state.familiaTab === "aval"){ state.aval.instOk = false; state.aval.instErro = ""; carregarAvaliacoesDoAluno(calAlunoAtual()); }
        else if(state.familiaTab === "contratos") carregarContratosDoAluno(state.familiaStudentId);
        break;
      case "set-inst-tab":
        state.instTab = el.dataset.key;
        state.cal.diaAberto = null;
        if(state.instTab === "perfil"){
          state.perfilSubTab = "dados";
          state.fichaForm = null; state.fichaErro = ""; state.fichaMensagem = "";
        }
        render();
        if(state.instTab === "aval") avalAbrirNaInstituicao();
        if(state.instTab === "horarios") horarios.aoAbrir();
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
        if((state.instTab === "alunos" || state.instTab === "financeiro" || state.instTab === "estatisticas") && state.escolaSelecionadaId
          && (state.instAlunos === null || state.instAlunosEscolaId !== state.escolaSelecionadaId)
          && !state.instAlunosCarregando){
          carregarAlunosDaInstituicao(state.escolaSelecionadaId);
        }
        if(state.instTab === "certificados" && state.escolaSelecionadaId
          && (state.instTurmas === null || state.instTurmasEscolaId !== state.escolaSelecionadaId)
          && !state.instTurmasCarregando){
          carregarTurmasDaInstituicao(state.escolaSelecionadaId);
        }
        if(state.instTab === "calendario" && state.escolaSelecionadaId){
          carregarEventosDaInstituicao(state.escolaSelecionadaId);
          // precisa da lista de alunos e professores da unidade pra saber
          // quem marcar como destinatário quando a secretaria salvar um item
          garantirPessoasDaUnidade();
        }
        if(state.instTab === "gestao"){
          garantirPessoasDaUnidade();
        }
        // contratos precisa dos alunos (pendentes de assinatura, nomes já
        // cadastrados) e das turmas (seletor de turma)
        if(state.instTab === "contratos"){
          garantirPessoasDaUnidade();
          carregarContratosDaEscola(state.escolaSelecionadaId);
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

      case "set-fin-subtab":
        state.finSubTab = el.dataset.key;
        if(state.finSubTab === "lancar"){
          // limpa o formulário toda vez que entra na sub-aba, como fazia
          // o antigo botão "Lançar cobrança" ao abrir.
          state.finCobrancaAlunoId = "";
          state.finCobrancaBusca = "";
          state.finCobrancaCompetencia = competenciaAtual();
          state.finCobrancaValor = "";
          state.finCobrancaVencimento = "";
          state.finCobrancaForma = "boleto";
          state.finCobrancaPixTipo = "copiaCola";
          state.finCobrancaBoletoComPix = false;
          state.finCobrancaLinkCartao = "";
          state.finCobrancaPix = "";
          state.finCobrancaCodigoBarras = "";
          state.finCobrancaBoletoArquivo = null;
          state.finCobrancaErro = "";
          state.finCobrancaMensagem = "";
        }
        render();
        break;

      case "fin-lancar-para": {
        resetarFormCobrancaFin();
        state.finCobrancaAlunoId = el.dataset.id || "";
        state.finSubTab = "lancar";
        render();
        break;
      }

      case "marcar-cobranca-paga": {
        const aluno = (state.instAlunos || []).find(a => a.id === el.dataset.alunoId);
        const mensId = el.dataset.mensId;
        const atual = aluno && (aluno.financeiro.mensalidades || []).find(m => m.id === mensId);
        if(!atual || atual.status === "pago" || state.finStatusSalvandoId) break;
        state.finStatusSalvandoId = mensId;
        state.finStatusErro = "";
        render();
        try {
          const mensalidades = (aluno.financeiro.mensalidades || []).map(m =>
            m.id === mensId ? { ...m, status: "pago", dataPagamento: dataDeHojeISO() } : m);
          await updateDoc(doc(db, "alunos", aluno.id), { "financeiro.mensalidades": mensalidades });
          aluno.financeiro.mensalidades = mensalidades;
        } catch(err){
          state.finStatusErro = "Não foi possível marcar a cobrança como paga agora. Tente de novo.";
        } finally {
          state.finStatusSalvandoId = "";
          render();
        }
        break;
      }

      case "escolher-fin-aluno":
        state.finCobrancaAlunoId = el.dataset.id;
        state.finCobrancaBusca = "";
        state.finCobrancaErro = "";
        state.finCobrancaMensagem = "";
        render();
        break;

      case "trocar-fin-aluno":
        state.finCobrancaAlunoId = "";
        render();
        break;

      case "toggle-fin-cobranca-boleto-pix":
        state.finCobrancaBoletoComPix = !state.finCobrancaBoletoComPix;
        render();
        break;

      case "toggle-aluno-fin-boleto-pix":
        state.alunoFinBoletoComPix = !state.alunoFinBoletoComPix;
        render();
        break;

      case "set-acessos-grupo":
        state.gestaoAcessosGrupo = el.dataset.key;
        state.geracaoLoteConfirmando = false;
        render();
        break;

      case "ver-sem-login":
        state.gestaoSubTab = "acessos";
        state.gestaoAcessosGrupo = "semlogin";
        state.gestaoAcessosBusca = "";
        state.geracaoLoteConfirmando = false;
        render();
        garantirPessoasDaUnidade();
        break;

      case "gerar-senha-acesso": {
        const campo = document.getElementById("acesso-nova-senha");
        const nova = senhaProvisoria();
        if(campo) campo.value = nova;
        if(!state.acessoUid) state.acessoSenhaSugerida = nova;
        break;
      }

      case "gerar-login-e-senha-acesso": {
        const dominio = state.acessoTipo === "aluno" ? DOMINIO_ALUNO : DOMINIO_RESPONSAVEL;
        const usados = emailsUsadosDaUnidade();
        const atual = (document.getElementById("acesso-email")?.value || "").trim();
        if(atual) usados.push(atual);
        state.acessoEmail = escolherEmailLivre(state.acessoNome, dominio, usados);
        state.acessoSenhaSugerida = senhaProvisoria();
        render();
        break;
      }

      case "gerar-logins-lote":
        state.geracaoLoteConfirmando = true;
        state.geracaoLoteResultado = null;
        render();
        break;

      case "cancelar-gerar-logins-lote":
        state.geracaoLoteConfirmando = false;
        render();
        break;

      case "fechar-resultado-lote":
        state.geracaoLoteResultado = null;
        render();
        break;

      case "copiar-logins-lote": {
        const res = state.geracaoLoteResultado;
        if(!res) break;
        const texto = res.criados.map(c => `${c.nome} (${c.tipo === "aluno" ? "aluno" : "responsável"})\nLogin: ${c.email}\nSenha: ${c.senha}`).join("\n\n");
        try {
          await navigator.clipboard.writeText(texto);
          state.instituicaoMensagem = "Lista de logins copiada.";
        } catch(_e){
          state.instituicaoErro = "Não consegui copiar. Selecione e copie a tabela mostrada.";
        }
        render();
        break;
      }

      case "confirmar-gerar-logins-lote": {
        const alvos = pessoasSemLogin();
        state.geracaoLoteConfirmando = false;
        state.geracaoLoteRodando = true;
        state.geracaoLoteResultado = null;
        const criados = [];
        const falhas = [];
        const usados = emailsUsadosDaUnidade();
        render();
        for(let i = 0; i < alvos.length; i++){
          const { tipo, ref } = alvos[i];
          state.geracaoLoteProgresso = `${i + 1} de ${alvos.length}.`;
          render();
          const dominio = tipo === "aluno" ? DOMINIO_ALUNO : DOMINIO_RESPONSAVEL;
          const emails = variantesDeEmail(ref.nome, dominio).filter(e => !usados.includes(e.toLowerCase()));
          const senha = senhaProvisoria();
          try {
            if(emails.length === 0) throw new Error("sem login livre para esse nome");
            const r = tipo === "aluno"
              ? await criarLoginParaAluno(ref, emails, senha)
              : await criarLoginParaResponsavelComAlternativas(ref, emails, senha);
            ref.uid = r.uid;
            ref.email = r.email;
            usados.push(r.email.toLowerCase());
            criados.push({ nome: ref.nome, tipo, email: r.email, senha });
          } catch(err){
            falhas.push({
              nome: ref.nome,
              motivo: err?.code?.startsWith?.("auth/") ? mensagemErroFirebase(err.code) : (err?.code || err?.message || "erro"),
            });
          }
        }
        state.geracaoLoteRodando = false;
        state.geracaoLoteProgresso = "";
        state.geracaoLoteResultado = { criados, falhas };
        render();
        break;
      }

      case "set-new-user-role":
        await mudarPapelNovoUsuario(el.dataset.role);
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

      /* ---- Certificados (lado de quem anexa: secretaria/professor) ---- */
      case "set-cert-turma": {
        state.certTurmaId = el.dataset.id;
        state.certFormAlunoNome = null;
        state.certFormModulo = "";
        state.certFormLink = "";
        state.certFormErro = "";
        state.certExcluirConfirmId = null;
        render();
        const turmasCert = state.screen === "instituicao" ? (state.instTurmas || []) : (state.data.professorTurmas || []);
        const turmaCert = turmasCert.find(t => t.id === state.certTurmaId);
        if(turmaCert) carregarCertificadosDaTurma(turmaCert);
        break;
      }
      case "abrir-certificado-form":
        state.certFormAlunoNome = el.dataset.aluno;
        state.certFormModulo = "";
        state.certFormLink = "";
        state.certFormErro = "";
        render();
        break;
      case "cancelar-certificado-form":
        state.certFormAlunoNome = null;
        state.certFormModulo = "";
        state.certFormLink = "";
        state.certFormErro = "";
        render();
        break;
      case "salvar-certificado": {
        const alunoNomeCert = el.dataset.aluno;
        const moduloCert = (state.certFormModulo || "").trim();
        const linkCert = (state.certFormLink || "").trim();
        if(!moduloCert){
          state.certFormErro = "Informe o módulo.";
          render();
          break;
        }
        if(!/^https?:\/\//i.test(linkCert)){
          state.certFormErro = "Cole o link do Drive (começando com http:// ou https://).";
          render();
          break;
        }
        const turmasCertSalvar = state.screen === "instituicao" ? (state.instTurmas || []) : (state.data.professorTurmas || []);
        const turmaCertSalvar = turmasCertSalvar.find(t => t.id === state.certTurmaId);
        if(!turmaCertSalvar) break;
        state.certFormErro = "";
        state.certSalvando = true;
        render();
        try {
          const salvo = await salvarCertificado(turmaCertSalvar, alunoNomeCert, moduloCert, linkCert);
          state.certLista = [...(state.certLista || []).filter(c => c.id !== salvo.id), salvo];
          state.certFormAlunoNome = null;
          state.certFormModulo = "";
          state.certFormLink = "";
        } catch(err){
          state.certFormErro = "Não foi possível salvar o certificado. Tente de novo.";
        } finally {
          state.certSalvando = false;
          render();
        }
        break;
      }
      case "excluir-certificado": {
        const certId = el.dataset.id;
        if(state.certExcluirConfirmId !== certId){
          state.certExcluirConfirmId = certId;
          render();
          break;
        }
        state.certExcluirConfirmId = null;
        state.certExcluindoId = certId;
        render();
        try {
          await excluirCertificado(certId);
          state.certLista = (state.certLista || []).filter(c => c.id !== certId);
        } catch(err){
          state.certErro = "Não foi possível excluir o certificado. Tente de novo.";
        } finally {
          state.certExcluindoId = null;
          render();
        }
        break;
      }
      /* ---------------- Avaliações ---------------- */
      case "aval-sub": {
        const a = state.aval;
        a.sub = el.dataset.sub === "institucional" ? "institucional" : "boletim";
        a.instOk = false;
        a.instErro = "";
        a.impressaoErro = "";
        render();
        if(state.screen === "instituicao"){
          if(a.sub === "institucional"){
            carregarResultadosInstitucionais(state.escolaSelecionadaId);
            carregarConfigAvaliacaoInstitucional(state.escolaSelecionadaId);
          }
        } else {
          carregarAvaliacoesDoAluno(calAlunoAtual());
        }
        break;
      }
      case "aval-turma": {
        const a = state.aval;
        a.turmaId = el.dataset.id;
        a.alunoNome = null;
        a.form = null;
        a.formErro = "";
        a.formOk = false;
        a.impressaoErro = "";
        render();
        const turmaAval = avalTurmaAtual();
        if(turmaAval) carregarBoletinsDaTurma(turmaAval);
        break;
      }
      case "aval-abrir-aluno":
        avalAbrirAluno(el.dataset.aluno);
        break;
      case "aval-voltar":
        state.aval.alunoNome = null;
        state.aval.form = null;
        state.aval.formErro = "";
        state.aval.formOk = false;
        state.aval.impressaoErro = "";
        render();
        break;
      case "aval-marcar": {
        const f = state.aval.form;
        const crit = el.dataset.crit;
        const nivel = el.dataset.nivel;
        if(!f || !CRITERIOS_BOLETIM.some(c => c.id === crit) || !NIVEIS_BOLETIM.some(n => n.id === nivel)) break;
        const sem = el.dataset.sem === "2" ? "sem2" : "sem1";
        f[sem][crit] = f[sem][crit] === nivel ? "" : nivel;   // clicar de novo no X limpa a marcação
        state.aval.formOk = false;
        render();
        break;
      }
      case "aval-feedback-padrao":
        if(state.aval.form){
          state.aval.form.feedback = FEEDBACK_PADRAO;
          state.aval.formOk = false;
          render();
        }
        break;
      case "aval-salvar": {
        const a = state.aval;
        const turmaAval = avalTurmaAtual();
        if(!turmaAval || !a.form || !a.alunoNome || a.salvando) break;
        const erroForm = validarBoletimForm(a.form);
        if(erroForm){
          a.formErro = erroForm;
          a.formOk = false;
          render();
          break;
        }
        a.formErro = "";
        a.formOk = false;
        a.salvando = true;
        render();
        try {
          const salvo = await salvarBoletimIngles(turmaAval, a.alunoNome, a.form);
          a.lista = [...(a.lista || []).filter(b => b.id !== salvo.id), salvo];
          a.listaTurmaId = turmaAval.id;
          a.form = boletimParaForm(salvo);   // reflete a formatação final (ex.: 9 -> 9,0)
          a.formOk = true;
        } catch(err){
          console.error("Erro ao salvar o boletim:", err?.code, err);
          a.formErro = "Não foi possível salvar o boletim. Tente de novo.";
        } finally {
          a.salvando = false;
          render();
        }
        break;
      }
      case "aval-imprimir": {
        const a = state.aval;
        let dados = null;
        if(el.dataset.src === "form"){
          if(a.form && a.alunoNome){
            const erroForm = validarBoletimForm(a.form);
            if(erroForm){
              a.formErro = erroForm;
              render();
              break;
            }
            dados = { alunoNome: a.alunoNome, form: boletimParaForm(formParaBoletim(a.form)) };
          }
        } else {
          const registro = Object.values(a.boletimCache).flatMap(c => c.registros).find(r => r.id === el.dataset.id);
          if(registro) dados = { alunoNome: registro.alunoNome, form: boletimParaForm(registro) };
        }
        if(!dados) break;
        const abriu = abrirBoletimParaImpressao(dados);
        a.impressaoErro = abriu ? "" : "O navegador bloqueou a nova aba. Libere os pop-ups deste site e tente de novo.";
        if(!abriu) render();
        break;
      }
      case "aval-inst-nota": {
        const alunoAval = calAlunoAtual();
        if(!alunoAval) break;
        const config = avalConfigAtual(alunoAval.escolaId);
        const q = el.dataset.q;
        const nota = Number(el.dataset.nota);
        if(!config.ativo || !config.perguntas.some(p => p.id === q) || !(nota >= 1 && nota <= 5)) break;
        avalInstFormDe(alunoAval).respostas[q] = nota;
        state.aval.instOk = false;
        state.aval.instErro = "";
        render();
        break;
      }
      case "aval-inst-enviar": {
        const alunoAval = calAlunoAtual();
        if(alunoAval && !state.aval.instSalvando) await enviarAvaliacaoInstitucional(alunoAval);
        break;
      }
      case "aval-config-toggle":
        if(state.escolaSelecionadaId){
          avalConfigToggleAtivo(state.escolaSelecionadaId);
          render();
        }
        break;
      case "aval-config-pergunta-add":
        if(state.escolaSelecionadaId){
          avalConfigAdicionarPergunta(state.escolaSelecionadaId);
          render();
        }
        break;
      case "aval-config-pergunta-remover":
        if(state.escolaSelecionadaId){
          avalConfigRemoverPergunta(state.escolaSelecionadaId, Number(el.dataset.idx));
          render();
        }
        break;
      case "aval-config-restaurar":
        if(state.escolaSelecionadaId){
          avalConfigRestaurarPadrao(state.escolaSelecionadaId);
          render();
        }
        break;
      case "aval-config-salvar":
        if(state.escolaSelecionadaId && !state.aval.configSalvando){
          await salvarConfigAvaliacaoInstitucional(state.escolaSelecionadaId);
        }
        break;

      case "set-professor-tab":
        state.professorTab = el.dataset.key;
        state.cal.diaAberto = null;
        if(state.professorTab === "perfil"){
          state.perfilSubTab = "dados";
          state.fichaForm = null; state.fichaErro = ""; state.fichaMensagem = "";
          state.perfilSenhaErro = ""; state.perfilSenhaMensagem = "";
        }
        render();
        if(state.professorTab === "calendario") carregarEventosDoProfessor();
        else if(state.professorTab === "horarios") horarios.aoAbrir();
        else if(state.professorTab === "aval") avalAbrirNoProfessor();
        break;
      case "set-professor-class": {
        state.professorTurmaId = el.dataset.id;
        state.professorNotasSalvas = false;
        state.professorNotasErro = "";
        state.professorAtividadeEditandoId = null;
        state.professorAtividadeNome = "";
        state.professorAtividadeExcluirConfirmId = null;
        const turma = professorTurmaAtual();
        if(turma) await Promise.all([carregarRegistroDoDia(turma), carregarAtividadesDaTurma(turma)]);
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
      case "save-grades": {
        const turma = professorTurmaAtual();
        if(!turma) break;
        const bimestre = state.professorAvaliacaoBimestre === 2 ? 2 : 1;
        const nomeAtividade = (state.professorAtividadeNome || "").trim();
        if(!nomeAtividade){
          state.professorNotasErro = "Digite o nome da atividade ou avaliação antes de salvar.";
          render();
          break;
        }
        const notasPorAluno = {};
        let algumaNota = false;
        turma.alunos.forEach(aluno => {
          const valor = state.professorNotas[`${turma.id}-${aluno}`];
          if(valor !== undefined && String(valor).trim() !== ""){
            const num = Number(valor);
            if(!isNaN(num)){ notasPorAluno[aluno] = num; algumaNota = true; }
          }
        });
        if(!algumaNota){
          state.professorNotasErro = "Lance a nota de pelo menos um aluno antes de salvar.";
          render();
          break;
        }
        state.professorNotasErro = "";
        state.professorNotasSalvando = true;
        state.professorNotasSalvas = false;
        render();
        try {
          const atividadeSalva = await salvarAtividade(turma, bimestre, nomeAtividade, notasPorAluno, state.professorAtividadeEditandoId);
          const idx = (state.professorAtividadesTodas || []).findIndex(a => a.id === atividadeSalva.id);
          if(idx >= 0) state.professorAtividadesTodas[idx] = atividadeSalva;
          else state.professorAtividadesTodas.push(atividadeSalva);
          state.professorAtividadeEditandoId = null;
          state.professorAtividadeNome = "";
          turma.alunos.forEach(aluno => { delete state.professorNotas[`${turma.id}-${aluno}`]; });
          state.professorNotasSalvas = true;
        } catch(err){
          state.professorNotasErro = `Não foi possível salvar as notas agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.professorNotasSalvando = false;
          render();
        }
        break;
      }

      case "set-bimestre": {
        const turma = professorTurmaAtual();
        state.professorAvaliacaoBimestre = Number(el.dataset.bimestre) === 2 ? 2 : 1;
        state.professorAtividadeEditandoId = null;
        state.professorAtividadeNome = "";
        state.professorNotasSalvas = false;
        state.professorNotasErro = "";
        state.professorAtividadeExcluirConfirmId = null;
        if(turma) turma.alunos.forEach(aluno => { delete state.professorNotas[`${turma.id}-${aluno}`]; });
        render();
        break;
      }

      case "editar-atividade": {
        const turma = professorTurmaAtual();
        const atividade = (state.professorAtividadesTodas || []).find(a => a.id === el.dataset.id);
        if(!turma || !atividade) break;
        state.professorAtividadeEditandoId = atividade.id;
        state.professorAtividadeNome = atividade.nome || "";
        state.professorNotasSalvas = false;
        state.professorNotasErro = "";
        turma.alunos.forEach(aluno => {
          const nota = atividade.notas ? atividade.notas[aluno] : undefined;
          state.professorNotas[`${turma.id}-${aluno}`] = (nota === undefined || nota === null) ? "" : String(nota);
        });
        render();
        break;
      }

      case "cancelar-edicao-atividade": {
        const turma = professorTurmaAtual();
        state.professorAtividadeEditandoId = null;
        state.professorAtividadeNome = "";
        state.professorNotasSalvas = false;
        state.professorNotasErro = "";
        if(turma) turma.alunos.forEach(aluno => { delete state.professorNotas[`${turma.id}-${aluno}`]; });
        render();
        break;
      }

      case "excluir-atividade": {
        const turma = professorTurmaAtual();
        const id = el.dataset.id;
        if(!turma || !id) break;
        if(state.professorAtividadeExcluirConfirmId !== id){   // 1º toque só pede confirmação
          state.professorAtividadeExcluirConfirmId = id;
          render();
          break;
        }
        state.professorAtividadeExcluindoId = id;
        render();
        try {
          await excluirAtividade(turma, id);
          state.professorAtividadesTodas = (state.professorAtividadesTodas || []).filter(a => a.id !== id);
          if(state.professorAtividadeEditandoId === id){
            state.professorAtividadeEditandoId = null;
            state.professorAtividadeNome = "";
            turma.alunos.forEach(aluno => { delete state.professorNotas[`${turma.id}-${aluno}`]; });
          }
        } catch(err){
          state.professorAtividadesErro = `Não foi possível excluir a atividade agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.professorAtividadeExcluirConfirmId = null;
          state.professorAtividadeExcluindoId = null;
          render();
        }
        break;
      }

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
        const alunoRecreacao = role === "aluno" && ehTurmaDeRecreacao(state.novoUsuarioTurma);
        const precisaLogin = role === "professor" || role === "instituicao" || role === "responsavel" || (role === "aluno" && !alunoRecreacao);
        const nome = (state.novoUsuarioNome || "").trim();
        const email = alunoRecreacao ? "" : (state.novoUsuarioEmail || "").trim();
        const senha = alunoRecreacao ? "" : (state.novoUsuarioSenha || "");
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
          const contatoDigitado = (state.novoUsuarioContato || "").trim();
          const nomesVinculados = (state.instAlunos || [])
            .filter(a => state.novoUsuarioAlunosVinculados.includes(a.id)).map(a => a.nome);
          const criado = await criarUsuarioNaInstituicao({
            role, nome, email, senha, escolaId,
            escolasIds: escolasIdsProfessor,
            turma: turmaSelecionada,
            disciplinas: state.novoUsuarioDisciplinas,
            contato: state.novoUsuarioContato,
            alunosIds: state.novoUsuarioAlunosVinculados,
            sexo: state.novoUsuarioSexo,
            parentesco: role === "responsavel" ? state.novoUsuarioParentesco : "",
            // se o login gerado já estiver ocupado (homônimo em outra unidade), tenta a próxima variação
            emailsAlternativos: (role === "aluno" || role === "responsavel") && !state.novoUsuarioEmailManual
              ? variantesDeEmail(nome, role === "aluno" ? DOMINIO_ALUNO : DOMINIO_RESPONSAVEL).filter(e => e !== email)
              : [],
          });
          state.acessoGerado = (precisaLogin && email && senha) ? {
            role, nome, senha,
            email: criado?.email || email,
            contato: contatoDigitado,
            nomeAluno: nomesVinculados.join(" e "),
          } : null;
          state.instituicaoMensagem = alunoRecreacao
            ? `Aluno "${nome}" cadastrado (Recreação, sem login). Agora cadastre o responsável e vincule a este aluno.`
            : precisaLogin
            ? `Usuário "${nome}" criado com sucesso. Passe o e-mail e a senha provisória para a pessoa.`
            : `Cadastro de "${nome}" salvo com sucesso.`;
          // limpa o formulário, mantendo o papel selecionado
          state.novoUsuarioNome = "";
          state.novoUsuarioEmail = "";
          state.novoUsuarioSenha = "";
          state.novoUsuarioEmailManual = false;
          state.novoUsuarioTurma = "";
          state.novoUsuarioDisciplinas = [];
          state.novoUsuarioEscolasIds = [];
          state.novoUsuarioContato = "";
          state.novoUsuarioParentesco = "";
          state.novoUsuarioSexo = "";
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
        const quem = el.dataset.quem;
        if(quem.startsWith("extra-")){
          const x = (item.acessos.extras || [])[Number(quem.slice(6))];
          if(x) abrirWhatsappDeAcesso({
            ehResponsavel: true, acesso: x.acesso, nomeAluno: contratoNomesAlunos(c, true),
            nomeDestino: x.nome, contato: x.contato,
          });
          break;
        }
        const ehResp = quem === "resp";
        const ehAluno2 = quem === "aluno2";
        abrirWhatsappDeAcesso({
          ehResponsavel: ehResp,
          acesso: ehResp ? item.acessos.responsavel : ehAluno2 ? item.acessos.aluno2 : item.acessos.aluno,
          nomeAluno: contratoNomesAlunos(c, true),
          nomeDestino: ehResp ? c.respNome : ehAluno2 ? c.aluno2Nome : c.alunoNome,
          contato: ehResp ? c.contatoResp : ehAluno2 ? c.contatoAluno2 : c.contatoAluno,
        });
        break;
      }

      case "contrato-enviar-acesso": {
        const c = state.contrato;
        const r = c.resultadoAcessos;
        if(!r) break;
        const quem = el.dataset.quem;
        if(quem.startsWith("extra-")){
          const x = (r.extras || [])[Number(quem.slice(6))];
          if(x) abrirWhatsappDeAcesso({
            ehResponsavel: true, acesso: x.acesso, nomeAluno: contratoNomesAlunos(c, true),
            nomeDestino: x.nome, contato: x.contato,
          });
          break;
        }
        const ehResp = quem === "resp";
        const ehAluno2 = quem === "aluno2";
        abrirWhatsappDeAcesso({
          ehResponsavel: ehResp,
          acesso: ehResp ? r.responsavel : ehAluno2 ? r.aluno2 : r.aluno,
          nomeAluno: contratoNomesAlunos(c, true),
          nomeDestino: ehResp ? c.respNome : ehAluno2 ? c.aluno2Nome : c.alunoNome,
          contato: ehResp ? c.contatoResp : ehAluno2 ? c.contatoAluno2 : c.contatoAluno,
        });
        break;
      }

      case "resp-extra-add":
      case "resp-extra-remove": {
        const escopoImport = el.dataset.escopo === "import";
        const alvo = escopoImport ? state.importContratosItens[Number(el.dataset.row)]?.contrato : state.contrato;
        if(!alvo) break;
        alvo.respsExtras = alvo.respsExtras || [];
        if(action === "resp-extra-add"){
          alvo.respsExtras.push({ nome: "", parentesco: "", contato: "", email: "", senha: "" });
        } else {
          alvo.respsExtras.splice(Number(el.dataset.idx), 1);
        }
        render();
        if(action === "resp-extra-add"){
          // leva o cursor direto pro nome da pessoa recém-adicionada
          const idx = alvo.respsExtras.length - 1;
          document.querySelector(`[data-resp-extra="nome"][data-escopo="${el.dataset.escopo}"][data-row="${el.dataset.row}"][data-idx="${idx}"]`)?.focus();
        }
        break;
      }

      case "ver-contrato": {
        const meta = acharContratoSalvo(el.dataset.id);
        if(meta) await abrirContratoNoApp(meta);
        break;
      }

      case "fechar-contrato-vis":
        contratoVisFechar();
        render();
        break;

      case "baixar-contrato": {
        const meta = acharContratoSalvo(el.dataset.id);
        if(!meta) break;
        try { await baixarContratoSalvo(meta); }
        catch(err){ console.error("Erro ao baixar contrato:", err); alert("Não consegui baixar este contrato agora. Tente de novo."); }
        break;
      }

      case "contrato-salvo-enviar": {
        const meta = acharContratoSalvo(el.dataset.id);
        const aluno = meta && (state.instAlunos || []).find(a => a.id === meta.alunoId);
        if(!meta || !aluno) break;
        state.contratoOcupado[meta.id] = true;
        render();
        try {
          const arquivo = await arquivoDoContratoSalvo(meta);
          const destino = destinoDoContratoDoAluno(aluno);
          const resultado = await enviarContratoParaAssinatura({
            arquivo, alunoNome: aluno.nome, respNome: destino.nome, numero: destino.numero,
          });
          state.contratoEnvioMsg[meta.id] = textoResultadoEnvio(resultado);
          if(resultado === "compartilhado" || resultado === "manual") await marcarContratoSalvoEnviado(meta);
        } catch(err){
          console.error("Erro ao enviar contrato salvo:", err);
          state.contratoEnvioMsg[meta.id] = `Não consegui preparar o PDF${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        }
        delete state.contratoOcupado[meta.id];
        render();
        break;
      }

      case "contrato-salvo-assinado": {
        const meta = acharContratoSalvo(el.dataset.id);
        if(!meta) break;
        state.contratoOcupado[meta.id] = true;
        render();
        try {
          await marcarContratoSalvoAssinado(meta);
          delete state.contratoEnvioMsg[meta.id];
        } catch(err){
          console.error("Erro ao marcar contrato como assinado:", err);
          state.contratoEnvioMsg[meta.id] = `Não consegui salvar${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        }
        delete state.contratoOcupado[meta.id];
        render();
        break;
      }

      case "contrato-salvo-excluir": {
        const meta = acharContratoSalvo(el.dataset.id);
        if(!meta) break;
        if(!confirm(`Excluir o contrato "${meta.nome}"? O PDF sai do sistema e deixa de aparecer para os responsáveis.`)) break;
        state.contratoOcupado[meta.id] = true;
        render();
        try {
          await excluirContratoSalvo(meta);
        } catch(err){
          console.error("Erro ao excluir contrato:", err);
          state.contratoEnvioMsg[meta.id] = `Não consegui excluir${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        }
        delete state.contratoOcupado[meta.id];
        render();
        break;
      }

      case "contrato-pendente-salvar": {
        const alunoId = el.dataset.aluno;
        const aluno = (state.instAlunos || []).find(a => a.id === alunoId);
        const arquivo = state.contratoArquivosEnvio[alunoId];
        if(!aluno || !arquivo) break;
        const problema = validarArquivoContrato(arquivo);
        if(problema){ state.contratoEnvioMsg[alunoId] = problema; render(); break; }
        state.contratoEnvioMsg[alunoId] = "Salvando…";
        render();
        try {
          await salvarContratoPdf({
            alunoId, escolaId: state.escolaSelecionadaId, arquivo,
            status: "pendente", enviadoEm: aluno.contratoEnviadoEm || "",
          });
          await sincronizarResumoContratos(alunoId, state.escolaSelecionadaId);
          delete state.contratoArquivosEnvio[alunoId];
          delete state.contratoEnvioMsg[alunoId];
        } catch(err){
          console.error("Erro ao salvar contrato pendente:", err);
          state.contratoEnvioMsg[alunoId] = `Não consegui salvar${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
        }
        render();
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
            : (c.segundoAluno && !(c.aluno2Nome || "").trim()) ? "Falta o nome do segundo aluno."
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
            c.emailAluno2 = ""; c.senhaAluno2 = "";
            c.emailResp = ""; c.senhaResp = "";
            (c.respsExtras || []).forEach(e => { e.email = ""; e.senha = ""; });
            contratoSugerirAcessos(c, emailsLote);
          } else {
            c.emailAluno = ""; c.senhaAluno = "";
            c.emailAluno2 = ""; c.senhaAluno2 = "";
            c.emailResp = ""; c.senhaResp = "";
            (c.respsExtras || []).forEach(e => { e.email = ""; e.senha = ""; });
          }

          c.contratoStatus = item.assinado ? "assinado" : "pendente";

          const jaExistiaAntes = (state.instAlunos || [])
            .some(a => normalizarNome(a.nome) === normalizarNome(c.alunoNome));

          try {
            const resultado = await criarCadastrosDoContrato(c);
            if(jaExistiaAntes) resumo.atualizados++; else resumo.criados++;
            if(resultado.aluno) { emailsLote.push(resultado.aluno.email); resumo.comLogin++; }
            if(resultado.aluno2){ emailsLote.push(resultado.aluno2.email); resumo.comLogin++; }
            if(resultado.responsavel){ emailsLote.push(resultado.responsavel.email); resumo.comLogin++; }
            (resultado.extras || []).forEach(x => { emailsLote.push(x.acesso.email); resumo.comLogin++; });
            item.status = "ok";
            item.alunoId = resultado.alunoId || null;
            item.acessos = { aluno: resultado.aluno, aluno2: resultado.aluno2, responsavel: resultado.responsavel, extras: resultado.extras || [] };
            if(!item.assinado) resumo.pendentes++;
            item.avisos = resultado.avisos || [];

            // Deixa o PDF guardado no cadastro (um contrato por aluno do PDF,
            // pra o segundo irmão também ter o dele).
            if(item.arquivo){
              const problemaPdf = validarArquivoContrato(item.arquivo);
              if(problemaPdf){
                item.avisos.push(`O PDF não foi salvo no sistema: ${problemaPdf} Anexe pela ficha do aluno.`);
              } else {
                try {
                  for(const idAluno of [resultado.alunoId, resultado.alunoId2].filter(Boolean)){
                    await salvarContratoPdf({
                      alunoId: idAluno, escolaId: state.escolaSelecionadaId, arquivo: item.arquivo,
                      status: item.assinado ? "assinado" : "pendente",
                    });
                    await sincronizarResumoContratos(idAluno, state.escolaSelecionadaId);
                  }
                  item.avisos.push("PDF do contrato salvo no sistema (a secretaria e os responsáveis conseguem abrir).");
                } catch(errPdf){
                  console.error("Erro ao salvar o PDF do contrato importado:", errPdf);
                  item.avisos.push(`Cadastro feito, mas não consegui salvar o PDF no sistema${errPdf?.code ? ` (${errPdf.code})` : ""}. Anexe pela ficha do aluno.`);
                }
              }
            }
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

      case "contrato-segundo-aluno":
        state.contrato.segundoAluno = !state.contrato.segundoAluno;
        contratoSugerirAcessos(state.contrato, emailsUsadosDaUnidade());
        render();
        break;

      case "contrato-gerar-outro-login": {
        const c = state.contrato;
        const quem = el.dataset.quem;
        // guarda o login atual como "ocupado" e pede o próximo da fila,
        // junto com uma senha nova
        if(quem === "aluno2"){
          const usados = [...emailsUsadosDaUnidade(), c.emailAluno2, c.emailAluno];
          c.emailAluno2 = "";
          c.senhaAluno2 = senhaProvisoria();
          contratoSugerirAcessos(c, usados);
        } else if(quem === "aluno"){
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
        state.instituicaoMensagem = `Contrato de ${contratoNomesAlunos(c)} gerado. Confira na aba que abriu e mande imprimir.`;

        if(!c.criarAcessos){
          c.aberto = false;
          render();
          break;
        }

        c.salvandoAcessos = true;
        c.resultadoAcessos = null;
        contratoSugerirAcessos(c, emailsUsadosDaUnidade());  // só completa o que estiver em branco
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

      case "enviar-parabens":
        await enviarParabensComLogo({
          numero: el.dataset.numero, texto: el.dataset.texto,
          nome: el.dataset.nome, tipo: el.dataset.tipo,
        });
        break;
      case "abrir-aniv-msg": {
        const salvos = state.aniversarioMsgs || {};
        state.aniversarioMsgRascunho = {};
        TIPOS_MSG_ANIVERSARIO.forEach(t => {
          state.aniversarioMsgRascunho[t.key] = (typeof salvos[t.key] === "string" && salvos[t.key].trim()) ? salvos[t.key] : TEMPLATES_ANIVERSARIO_PADRAO[t.key];
        });
        state.aniversarioMsgErro = "";
        state.aniversarioMsgModalAberto = true;
        render();
        break;
      }
      case "fechar-aniv-msg":
        state.aniversarioMsgModalAberto = false;
        render();
        break;
      case "restaurar-aniv-msg":
        state.aniversarioMsgRascunho = { ...TEMPLATES_ANIVERSARIO_PADRAO };
        render();
        break;
      case "salvar-aniv-msg": {
        const escolaId = state.escolaSelecionadaId;
        const r = state.aniversarioMsgRascunho || {};
        const dados = {};
        TIPOS_MSG_ANIVERSARIO.forEach(t => {
          const v = String(r[t.key] || "").trim().slice(0, 800);
          // igual ao padrão = não grava (continua acompanhando o padrão)
          dados[t.key] = v === TEMPLATES_ANIVERSARIO_PADRAO[t.key] ? "" : v;
        });
        state.aniversarioMsgSalvando = true;
        state.aniversarioMsgErro = "";
        render();
        try {
          await setDoc(doc(db, "mensagensAniversario", escolaId), {
            ...dados, atualizadoEm: new Date().toISOString(), atualizadoPorId: state.authUser.uid,
          });
          state.aniversarioMsgs = dados;
          state.aniversarioMsgModalAberto = false;
          state.aniversarioAviso = "Mensagens salvas. Já valem para os próximos envios.";
        } catch(err){
          console.error("Erro ao salvar mensagens de aniversário:", err?.code, err);
          state.aniversarioMsgErro = err?.code === "permission-denied"
            ? "Sem permissão para salvar. Publique a regra de “mensagensAniversario” no Firestore."
            : "Não foi possível salvar agora. Tente de novo.";
        } finally {
          state.aniversarioMsgSalvando = false;
          render();
        }
        break;
      }

      case "toggle-manual-grupo":
        state.manuaisAbertos[el.dataset.key] = !state.manuaisAbertos[el.dataset.key];
        render();
        break;
      case "set-perfil-subtab":
        state.perfilSubTab = el.dataset.key;
        state.perfilSenhaErro = ""; state.perfilSenhaMensagem = "";
        state.fichaErro = ""; state.fichaMensagem = "";
        render();
        break;
      case "salvar-minha-ficha":
        await salvarMinhaFicha();
        break;
      case "salvar-ficha-aluno": {
        const alunoDaFicha = calAlunoAtual();
        if(alunoDaFicha) await salvarFichaDoAluno(alunoDaFicha, el.dataset.quem === "responsavel" ? "responsavel" : "aluno");
        break;
      }
      case "ciente-ficha-aluno": {
        const alunoDaFicha = calAlunoAtual();
        if(alunoDaFicha) await darCienciaFichaDoAluno(alunoDaFicha);
        break;
      }
      case "abrir-ficha-usuario":
        await abrirFichaUsuario(el.dataset.id, el.dataset.nome);
        break;
      case "fechar-ficha-usuario":
        state.fichaModalAberto = false;
        state.fichaModalDados = null;
        render();
        break;
      case "professor-toggle-turma":
        state.professorTurmaDetalheId = state.professorTurmaDetalheId === el.dataset.id ? null : el.dataset.id;
        render();
        break;
      case "professor-abrir-turma-em": {
        state.professorTurmaId = el.dataset.id;
        state.professorTab = el.dataset.tab === "avaliacoes" ? "avaliacoes" : "aulas";
        state.professorNotasSalvas = false;
        state.professorNotasErro = "";
        state.professorAtividadeEditandoId = null;
        state.professorAtividadeNome = "";
        state.professorAtividadeExcluirConfirmId = null;
        state.cal.diaAberto = null;
        const turma = professorTurmaAtual();
        render();
        if(turma) await Promise.all([carregarRegistroDoDia(turma), carregarAtividadesDaTurma(turma)]);
        break;
      }

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
        state.acessoSenhaSugerida = "";
        if(!uid && el.dataset.excluir !== "1" && (tipo === "aluno" || tipo === "responsavel")){
          const dominio = tipo === "aluno" ? DOMINIO_ALUNO : DOMINIO_RESPONSAVEL;
          if(!email) state.acessoEmail = escolherEmailLivre(state.acessoNome, dominio, emailsUsadosDaUnidade());
          state.acessoSenhaSugerida = senhaProvisoria();
        }
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
        if(state.acessoTipo !== "responsavel" && state.acessoTipo !== "aluno"){
          state.acessoErro = "Por enquanto só dá pra criar acesso de aluno e responsável por aqui. Para professor, use Gestão > Criar cadastro.";
          render();
          break;
        }
        const ehAlunoAcesso = state.acessoTipo === "aluno";
        const pessoaAcesso = ehAlunoAcesso
          ? (state.instAlunos || []).find(a => a.id === state.acessoDocId)
          : (state.gestaoResponsaveis || []).find(r => r.id === state.acessoDocId);
        if(!pessoaAcesso){
          state.acessoErro = "Cadastro não encontrado. Feche e abra a lista de novo.";
          render();
          break;
        }
        state.acessoCriandoLogin = true;
        render();
        try {
          let emailFinalAcesso = email;
          let uid;
          if(ehAlunoAcesso){
            const r = await criarLoginParaAluno(pessoaAcesso, [email], senha);
            uid = r.uid; emailFinalAcesso = r.email;
          } else {
            uid = await criarLoginParaResponsavel(pessoaAcesso, email, senha);
          }
          pessoaAcesso.uid = uid;
          pessoaAcesso.email = emailFinalAcesso;
          state.acessoUid = uid;
          state.acessoEmail = emailFinalAcesso;
          state.acessoSenhaSugerida = "";
          state.acessoMensagem = `Acesso criado. ${pessoaAcesso.nome} entra com ${emailFinalAcesso} e a senha ${senha}. Anote: ela não aparece de novo.`;
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

      case "gerar-idaluno-pendentes": {
        if(state.gerandoIdAluno) break;
        const pendentes = (state.instAlunos || []).filter(a => !a.idAluno);
        if(pendentes.length === 0) break;
        state.gerandoIdAluno = true;
        state.instituicaoErro = "";
        state.instituicaoMensagem = "";
        render();
        let feitos = 0;
        try {
          // Um de cada vez (não em paralelo) pra não gerar dois alunos
          // brigando pelo mesmo número no contador.
          for(const aluno of pendentes){
            const idAluno = await proximoIdAluno();
            await updateDoc(doc(db, "alunos", aluno.id), { idAluno });
            aluno.idAluno = idAluno;   // reflete na lista já carregada, sem precisar recarregar
            feitos++;
          }
          state.instituicaoMensagem = `IDALUNO gerado para ${feitos} ${feitos === 1 ? "aluno" : "alunos"}.`;
        } catch(err){
          console.error("Erro ao gerar IDALUNO:", err);
          state.instituicaoErro = feitos > 0
            ? `Gerei o IDALUNO de ${feitos} aluno(s) antes de dar erro. Toque em "Gerar IDALUNO" de novo pra continuar os que faltam.`
            : "Não consegui gerar o IDALUNO agora. Tente de novo.";
        } finally {
          state.gerandoIdAluno = false;
          render();
        }
        break;
      }

      case "abrir-aluno": {
        const id = el.dataset.id;
        const aluno = (state.instAlunos || []).find(a => a.id === id);
        state.alunoDetalheId = id;
        state.alunoLoginConfirmando = false;
        state.alunoDetalheNomeInput = aluno ? (aluno.nome || "") : "";
        state.alunoDetalheContatoInput = aluno ? (aluno.contato || "") : "";
        state.alunoDetalheNascimentoInput = aluno ? (aluno.nascimento || "") : "";
        state.alunoDetalheSexoInput = aluno ? (aluno.sexo || "") : "";
        state.alunoSitSituacao = aluno ? aluno.situacao : "ativo";
        state.alunoSitMatricula = aluno ? (aluno.matriculadoEm || "") : "";
        state.alunoSitData = aluno ? (aluno.situacaoEm || "") : "";
        state.alunoSitMotivo = aluno ? (aluno.motivoSaida || "") : "";
        state.alunoSitErro = "";
        state.alunoSitMensagem = "";
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        state.alunoExcluirConfirmando = false;
        state.alunoFinCompetencia = "";
        state.alunoFinValor = "";
        state.alunoFinVencimento = "";
        state.alunoFinForma = "boleto";
        state.alunoFinPixTipo = "copiaCola";
        state.alunoFinBoletoComPix = false;
        state.alunoFinLinkCartao = "";
        state.alunoFinPix = "";
        state.alunoFinCodigoBarras = "";
        state.alunoFinBoletoArquivo = null;
        state.alunoFinBoletoLendo = false;
        state.alunoFinErro = "";
        state.alunoFinMensagem = "";
        state.alunoRespVinculados = null;
        state.alunoRespNome = "";
        state.alunoRespContato = "";
        state.alunoRespErro = "";
        state.alunoRespMensagem = "";
        state.alunoTurmaSelecionada = "";
        state.alunoTurmaErro = "";
        state.alunoTurmaMensagem = "";
        state.contratoUpMsg = "";
        state.contratoUpErro = "";
        render();
        garantirTurmasDaUnidade();
        carregarResponsaveisDoAluno(id);
        carregarContratosDaEscola(state.escolaSelecionadaId);
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
        const nomeNovo = (document.getElementById("aluno-detalhe-nome")?.value || "").trim().replace(/\s+/g, " ");
        const contato = (document.getElementById("aluno-detalhe-contato")?.value || "").trim();
        const nascimento = (document.getElementById("aluno-detalhe-nascimento")?.value || "").trim();
        const sexo = document.getElementById("aluno-detalhe-sexo")?.value || "";
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        if(!nomeNovo){
          state.alunoDetalheErro = "O nome do aluno não pode ficar vazio.";
          render();
          break;
        }
        state.alunoDetalheSalvandoContato = true;
        render();
        try {
          const nomeAntigo = aluno.nome;
          const mudouNome = nomeNovo !== nomeAntigo;
          await updateDoc(doc(db, "alunos", aluno.id), { nome: nomeNovo, contato, nascimento, sexo });
          if(mudouNome) await propagarNovoNomeDoAluno(aluno, nomeAntigo, nomeNovo);
          aluno.nome = nomeNovo;
          aluno.contato = contato;
          aluno.nascimento = nascimento;
          aluno.sexo = sexo;
          state.alunoDetalheNomeInput = nomeNovo;
          state.alunoDetalheContatoInput = contato;
          state.alunoDetalheNascimentoInput = nascimento;
          state.alunoDetalheSexoInput = sexo;
          state.alunoDetalheMensagem = "Cadastro atualizado.";
        } catch(err){
          state.alunoDetalheErro = "Não foi possível salvar agora. Tente de novo.";
        } finally {
          state.alunoDetalheSalvandoContato = false;
          render();
        }
        break;
      }

      case "enviar-acesso-gerado": {
        const ag = state.acessoGerado;
        if(!ag) break;
        const ehResp = ag.role === "responsavel";
        const acesso = { email: ag.email, senha: ag.senha };
        const texto = ehResp
          ? MENSAGEM_ACESSO.paraResponsavel(primeiroNome(ag.nome), ag.nomeAluno || "seu filho(a)", linkDoApp(), acesso.email, acesso.senha)
          : MENSAGEM_ACESSO.paraAluno(primeiroNome(ag.nome), linkDoApp(), acesso.email, acesso.senha);
        const via = el.dataset.via;
        if(via === "whatsapp"){
          const numeroAcesso = telefoneValido(ag.contato);
          const linkAcesso = numeroAcesso
            ? whatsappLinkComTexto(numeroAcesso, texto)
            : `https://wa.me/?text=${encodeURIComponent(texto)}`;   // sem número: o WhatsApp deixa escolher o contato
          window.open(linkAcesso, "_blank", "noopener");
        } else if(via === "email"){
          window.location.href = `mailto:${encodeURIComponent(ag.contato)}?subject=${encodeURIComponent("Seu acesso ao Educa+")}&body=${encodeURIComponent(texto)}`;
        } else {
          try {
            await navigator.clipboard.writeText(texto);
            state.instituicaoMensagem = "Mensagem de acesso copiada.";
          } catch(_e){
            state.instituicaoErro = "Não consegui copiar. Selecione e copie o login e a senha mostrados no aviso.";
          }
          render();
        }
        break;
      }

      case "gerar-senha-novo-usuario": {
        state.novoUsuarioSenha = senhaProvisoria();
        const campoSenhaNovo = document.getElementById("new-user-senha");
        if(campoSenhaNovo) campoSenhaNovo.value = state.novoUsuarioSenha;
        break;
      }

      case "gerar-acesso-novo-usuario":
        sugerirAcessoNovoUsuario({ novoLogin: true });
        render();
        break;

      case "fechar-acesso-gerado":
        state.acessoGerado = null;
        render();
        break;

      case "remover-login-recreacao":
        state.removerLoginConfirmando = true;
        render();
        break;

      case "cancelar-remover-login-recreacao":
        state.removerLoginConfirmando = false;
        render();
        break;

      case "confirmar-remover-login-recreacao": {
        const alvo = alunosRecreacaoComLogin();
        state.removerLoginRodando = true;
        state.instituicaoErro = "";
        state.instituicaoMensagem = "";
        render();
        let feitos = 0, falhas = 0;
        for(const a of alvo){
          try { await removerLoginDoAluno(a); feitos++; }
          catch(err){ console.error("Erro ao remover login de", a.nome, err); falhas++; }
        }
        state.removerLoginRodando = false;
        state.removerLoginConfirmando = false;
        state.instituicaoMensagem = `Login removido de ${feitos} ${feitos === 1 ? "aluno" : "alunos"} da Recreação.`;
        if(falhas) state.instituicaoErro = `${falhas} ${falhas === 1 ? "aluno não pôde" : "alunos não puderam"} ser atualizado(s). Se o cadastro for antigo, publique a Cloud Function removerLoginAluno (pasta functions) e tente de novo.`;
        render();
        break;
      }

      case "remover-login-aluno":
        state.alunoLoginConfirmando = true;
        render();
        break;

      case "cancelar-remover-login-aluno":
        state.alunoLoginConfirmando = false;
        render();
        break;

      case "confirmar-remover-login-aluno": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno) break;
        state.alunoDetalheErro = "";
        state.alunoDetalheMensagem = "";
        try {
          await removerLoginDoAluno(aluno);
          state.alunoDetalheMensagem = "Login removido. O cadastro do aluno continua.";
        } catch(err){
          state.alunoDetalheErro = `Não foi possível remover o login agora${err?.code ? ` (${err.code})` : ""}.`;
        }
        state.alunoLoginConfirmando = false;
        render();
        break;
      }

      case "copiar-texto": {
        const texto = el.dataset.copiar || "";
        if(!texto) break;
        try {
          if(navigator.clipboard && navigator.clipboard.writeText){
            await navigator.clipboard.writeText(texto);
          } else {
            const area = document.createElement("textarea");
            area.value = texto;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            document.body.removeChild(area);
          }
          const original = el.textContent;
          el.textContent = "Copiado!";
          setTimeout(() => { el.textContent = original; }, 1500);
        } catch(err){
          console.error("Não consegui copiar:", err);
        }
        break;
      }

      /* ---------- Financeiro (sub-aba "Lançar cobrança") ----------
         Mesmo lançamento de cobrança da ficha do aluno, só que escolhendo
         o aluno por um <select>, pra não precisar abrir a ficha primeiro. */
      case "lancar-fin-cobranca": {
        const alunoId = state.finCobrancaAlunoId;
        const aluno = (state.instAlunos || []).find(a => a.id === alunoId);
        const competencia = (document.getElementById("fin-cobranca-competencia")?.value || "").trim();
        const valorTexto = (document.getElementById("fin-cobranca-valor")?.value || "").trim();
        const vencimento = (document.getElementById("fin-cobranca-vencimento")?.value || "").trim();
        const valor = Number(valorTexto.replace(",", "."));
        const forma = state.finCobrancaForma || "boleto";
        const pixTipoEscolhido = state.finCobrancaPixTipo || "copiaCola";
        state.finCobrancaErro = "";
        state.finCobrancaMensagem = "";
        if(!aluno){
          state.finCobrancaErro = "Escolha o aluno.";
          render();
          break;
        }
        if(!competencia || !vencimento || !valorTexto || !(valor > 0)){
          state.finCobrancaErro = "Preencha mês, valor e vencimento da cobrança.";
          render();
          break;
        }
        state.finCobrancaSalvando = true;
        render();
        try {
          // só guarda o Pix/boleto/link do jeito que combina com a forma
          // escolhida, pra não carregar algo digitado antes de trocar de
          // forma e esquecido no campo.
          //   pix    → copia-e-cola só se o tipo escolhido for esse (na
          //            "chave da escola" não há código pra guardar)
          //   boleto → o Pix copia-e-cola só entra se a secretaria marcou
          //            "incluir também"
          const incluiPix = forma === "pix" || (forma === "boleto" && state.finCobrancaBoletoComPix);
          const pixTipo = forma === "pix" ? pixTipoEscolhido : (incluiPix ? "copiaCola" : "");
          const pixCopiaCola = incluiPix && pixTipo === "copiaCola" ? state.finCobrancaPix.trim() : "";
          const nova = normalizeMensalidade({
            competencia, valor, vencimento, status: "pendente",
            criadoEm: dataDeHojeISO(),
            formaPagamento: forma,
            pixTipo,
            pixCopiaCola,
            codigoBarras: forma === "boleto" ? state.finCobrancaCodigoBarras.trim() : "",
            boletoPdfNome: forma === "boleto" ? (state.finCobrancaBoletoArquivo?.nome || "") : "",
            boletoPdfDados: forma === "boleto" ? (state.finCobrancaBoletoArquivo?.dados || "") : "",
            linkPagamento: forma === "cartao" ? state.finCobrancaLinkCartao.trim() : "",
          });
          const mensalidades = [...(aluno.financeiro.mensalidades || []), nova];
          await updateDoc(doc(db, "alunos", aluno.id), { "financeiro.mensalidades": mensalidades });
          aluno.financeiro.mensalidades = mensalidades;
          state.finCobrancaMensagem = `Cobrança lançada para ${aluno.nome}.`;
          state.finCobrancaAlunoId = "";
          state.finCobrancaBusca = "";
          state.finCobrancaCompetencia = competenciaAtual();
          state.finCobrancaValor = "";
          state.finCobrancaVencimento = "";
          state.finCobrancaForma = "boleto";
          state.finCobrancaPixTipo = "copiaCola";
          state.finCobrancaBoletoComPix = false;
          state.finCobrancaLinkCartao = "";
          state.finCobrancaPix = "";
          state.finCobrancaCodigoBarras = "";
          state.finCobrancaBoletoArquivo = null;
        } catch(err){
          state.finCobrancaErro = "Não foi possível lançar a cobrança agora. Tente de novo.";
        } finally {
          state.finCobrancaSalvando = false;
          render();
        }
        break;
      }

      case "lancar-mensalidade": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno) break;
        const competencia = (document.getElementById("aluno-fin-competencia")?.value || "").trim();
        const valorTexto = (document.getElementById("aluno-fin-valor")?.value || "").trim();
        const vencimento = (document.getElementById("aluno-fin-vencimento")?.value || "").trim();
        const valor = Number(valorTexto.replace(",", "."));
        const forma = state.alunoFinForma || "boleto";
        const pixTipoEscolhido = state.alunoFinPixTipo || "copiaCola";
        state.alunoFinErro = "";
        state.alunoFinMensagem = "";
        if(!competencia || !vencimento || !valorTexto || !(valor > 0)){
          state.alunoFinErro = "Preencha mês, valor e vencimento da cobrança.";
          render();
          break;
        }
        state.alunoFinSalvando = true;
        render();
        try {
          const incluiPix = forma === "pix" || (forma === "boleto" && state.alunoFinBoletoComPix);
          const pixTipo = forma === "pix" ? pixTipoEscolhido : (incluiPix ? "copiaCola" : "");
          const pixCopiaCola = incluiPix && pixTipo === "copiaCola" ? state.alunoFinPix.trim() : "";
          const nova = normalizeMensalidade({
            competencia, valor, vencimento, status: "pendente",
            criadoEm: dataDeHojeISO(),
            formaPagamento: forma,
            pixTipo,
            pixCopiaCola,
            codigoBarras: forma === "boleto" ? state.alunoFinCodigoBarras.trim() : "",
            boletoPdfNome: forma === "boleto" ? (state.alunoFinBoletoArquivo?.nome || "") : "",
            boletoPdfDados: forma === "boleto" ? (state.alunoFinBoletoArquivo?.dados || "") : "",
            linkPagamento: forma === "cartao" ? state.alunoFinLinkCartao.trim() : "",
          });
          const mensalidades = [...(aluno.financeiro.mensalidades || []), nova];
          await updateDoc(doc(db, "alunos", aluno.id), { "financeiro.mensalidades": mensalidades });
          aluno.financeiro.mensalidades = mensalidades;
          state.alunoFinCompetencia = "";
          state.alunoFinValor = "";
          state.alunoFinVencimento = "";
          state.alunoFinForma = "boleto";
          state.alunoFinPixTipo = "copiaCola";
          state.alunoFinBoletoComPix = false;
          state.alunoFinLinkCartao = "";
          state.alunoFinPix = "";
          state.alunoFinCodigoBarras = "";
          state.alunoFinBoletoArquivo = null;
          state.alunoFinMensagem = "Cobrança lançada.";
        } catch(err){
          state.alunoFinErro = "Não foi possível lançar a cobrança agora. Tente de novo.";
        } finally {
          state.alunoFinSalvando = false;
          render();
        }
        break;
      }

      case "salvar-situacao-aluno": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno || state.alunoSitSalvando) break;
        const situacao = state.alunoSitSituacao;
        const naoAtivo = situacao !== "ativo";
        const dados = {
          situacao,
          matriculadoEm: (state.alunoSitMatricula || "").trim(),
          situacaoEm: naoAtivo ? ((state.alunoSitData || "").trim() || dataDeHojeISO()) : "",
          motivoSaida: naoAtivo ? (state.alunoSitMotivo || "").trim() : "",
        };
        state.alunoSitSalvando = true;
        state.alunoSitErro = "";
        state.alunoSitMensagem = "";
        render();
        try {
          await updateDoc(doc(db, "alunos", aluno.id), dados);
          Object.assign(aluno, dados);
          state.alunoSitData = dados.situacaoEm;
          state.alunoSitMensagem = "Situação salva.";
        } catch(err){
          state.alunoSitErro = `Não foi possível salvar a situação agora${err.code ? ` (${err.code})` : ""}. Tente de novo.`;
        } finally {
          state.alunoSitSalvando = false;
          render();
        }
        break;
      }

      case "set-est-periodo":
        state.estPeriodo = el.dataset.key;
        render();
        break;

      case "excluir-mensalidade": {
        const aluno = (state.instAlunos || []).find(a => a.id === state.alunoDetalheId);
        if(!aluno) break;
        const mensId = el.dataset.mensId;
        const alvo = (aluno.financeiro.mensalidades || []).find(m => m.id === mensId);
        if(!alvo) break;
        const ok = window.confirm(`Excluir a cobrança de ${competenciaLabel(alvo.competencia)} (${formatarMoeda(alvo.valor)})? Essa ação não pode ser desfeita.`);
        if(!ok) break;
        state.alunoFinSalvando = true;
        state.alunoFinErro = "";
        render();
        try {
          const mensalidades = (aluno.financeiro.mensalidades || []).filter(m => m.id !== mensId);
          await updateDoc(doc(db, "alunos", aluno.id), { "financeiro.mensalidades": mensalidades });
          aluno.financeiro.mensalidades = mensalidades;
          state.alunoFinMensagem = "Cobrança excluída.";
        } catch(err){
          state.alunoFinErro = "Não foi possível excluir a cobrança agora. Tente de novo.";
        } finally {
          state.alunoFinSalvando = false;
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
            parentesco: state.alunoRespParentesco,
            escolaId: state.escolaSelecionadaId,
            alunosIds: [alunoId],
          });
          state.alunoRespNome = "";
          state.alunoRespContato = "";
          state.alunoRespParentesco = "";
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
        state.editProfessorSexo = professor?.sexo || "";
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
          await salvarEdicaoProfessor(uid, nome, state.editProfessorDisciplinas, state.editProfessorSexo);
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
        state.respModalNomeInput = responsavel ? responsavel.nome : (el.dataset.nome || "");
        state.respModalParentesco = responsavel ? (responsavel.parentesco || "") : "";
        state.respModalContato = responsavel ? (responsavel.contato || "") : "";
        state.respModalEmail = responsavel ? (responsavel.email || "") : "";
        state.respModalDadosErro = "";
        state.respModalDadosMsg = "";
        state.respModalErro = "";
        state.respModalMensagem = "";
        render();
        if(!state.gestaoAlunosEscola && state.escolaSelecionadaId) carregarAlunosParaVinculo(state.escolaSelecionadaId);
        break;
      }

      case "salvar-resp-dados": {
        const id = state.respModalId;
        const responsavel = (state.gestaoResponsaveis || []).find(r => r.id === id);
        if(!id || !responsavel) break;
        const nome = (state.respModalNomeInput || "").trim().replace(/\s+/g, " ");
        const contato = (state.respModalContato || "").trim();
        const email = (state.respModalEmail || "").trim().toLowerCase();
        const parentesco = state.respModalParentesco || "";
        state.respModalDadosErro = "";
        state.respModalDadosMsg = "";
        if(!nome){ state.respModalDadosErro = "O nome não pode ficar vazio."; render(); break; }
        if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ state.respModalDadosErro = "E-mail inválido."; render(); break; }
        const mudouEmail = email !== (responsavel.email || "").toLowerCase();
        if(mudouEmail && responsavel.uid && !email){ state.respModalDadosErro = "O e-mail de quem tem login não pode ficar vazio."; render(); break; }

        state.respModalDadosSalvando = true;
        render();
        const avisos = [];
        try {
          // 1) Cadastro: nome, parentesco, contato (e e-mail, se ainda não há login)
          const dados = { nome, contato, parentesco };
          if(mudouEmail && !responsavel.uid) dados.email = email;
          await updateDoc(doc(db, "responsaveis", id), dados);
          const nomeMudou = nome !== responsavel.nome;
          responsavel.nome = nome;
          responsavel.contato = contato;
          responsavel.parentesco = parentesco;
          if(mudouEmail && !responsavel.uid) responsavel.email = email;
          state.respModalNome = nome;

          // 2) Nome também no login (usuarios/{uid})
          if(responsavel.uid && nomeMudou){
            try { await updateDoc(doc(db, "usuarios", responsavel.uid), { nome }); }
            catch(e){ console.warn("Nome no login não atualizado:", e?.code || e); avisos.push("o nome no login não foi atualizado (veja as regras do Firestore)"); }
          }

          // 3) E-mail do login: só o Admin SDK consegue trocar (Cloud Function)
          if(mudouEmail && responsavel.uid){
            try {
              await chamarFuncaoAdmin("atualizarEmailUsuario", { uid: responsavel.uid, email });
              await updateDoc(doc(db, "responsaveis", id), { email });
              responsavel.email = email;
            } catch(err){
              const code = err?.code || "";
              if(code === "functions/not-found" || code === "functions/unavailable" || code === "functions/internal"){
                avisos.push("o e-mail do login NÃO foi trocado: falta publicar a Cloud Function atualizarEmailUsuario");
              } else if(code === "functions/already-exists"){
                avisos.push("o e-mail do login NÃO foi trocado: já existe outra conta com esse e-mail");
              } else {
                avisos.push(`o e-mail do login NÃO foi trocado${code ? ` (${code})` : ""}`);
              }
              state.respModalEmail = responsavel.email || "";
            }
          }
          state.respModalDadosMsg = avisos.length ? "Dados salvos." : "Dados do responsável atualizados.";
          if(avisos.length) state.respModalDadosErro = `Atenção: ${avisos.join("; ")}.`;
        } catch(err){
          state.respModalDadosErro = `Não foi possível salvar agora${err?.code ? ` (${err.code})` : ""}.`;
        } finally {
          state.respModalDadosSalvando = false;
          render();
        }
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
        else if(state.screen === "instituicao") carregarEventosDaInstituicao(state.escolaSelecionadaId, true);
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

      /* ---------------- Calendário da secretaria ---------------- */
      case "calinst-novo-evento": {
        state.cal.formInst = {
          tipo: "sem_aula", titulo: "", descricao: "",
          data: el.dataset.dia || hojeISO(),
          cursosTodos: true, cursosSelecionados: [],
          salvando: false, erro: "",
        };
        state.cal.diaAberto = null;
        render();
        break;
      }
      case "calinst-fechar-form":
        state.cal.formInst = null;
        render();
        break;

      case "calinst-toggle-todos-cursos": {
        const f = state.cal.formInst;
        if(!f) break;
        f.cursosTodos = !f.cursosTodos;
        // ao desmarcar "todos", parte de tudo marcado — a pessoa desmarca
        // só as exceções (ex.: tirar a Recreação de um feriado).
        if(!f.cursosTodos) f.cursosSelecionados = cursosDaEscola(state.data.escolas[state.escolaSelecionadaId]?.nome || "").slice();
        render();
        break;
      }
      case "calinst-toggle-curso": {
        const f = state.cal.formInst;
        const curso = el.dataset.curso;
        if(!f || !curso) break;
        f.cursosSelecionados = f.cursosSelecionados.includes(curso)
          ? f.cursosSelecionados.filter(c => c !== curso)
          : [...f.cursosSelecionados, curso];
        render();
        break;
      }

      case "calinst-salvar-evento": {
        const cal = state.cal;
        const f = cal.formInst;
        if(!f || f.salvando) break;
        const titulo = (f.titulo || "").trim();
        const escolaId = state.escolaSelecionadaId;

        const cursos = f.cursosTodos ? null : f.cursosSelecionados;

        let erro = "";
        if(!titulo) erro = "Digite o título.";
        else if(!dataValida(f.data)) erro = "Escolha uma data válida.";
        else if(!escolaId) erro = "Selecione a unidade primeiro.";
        else if(cursos && cursos.length === 0) erro = "Selecione ao menos um curso, ou marque \"Todos os cursos\".";
        if(erro){ f.erro = erro; render(); break; }

        f.erro = "";
        f.salvando = true;
        render();
        try {
          const dados = {
            escopo: "escola",
            tipo: Object.keys(TIPOS_INSTITUICAO).includes(f.tipo) ? f.tipo : "aviso",
            titulo,
            descricao: (f.descricao || "").trim(),
            data: f.data,
            escolaId,
            cursos,
            destinatarios: destinatariosDaEscola(escolaId, cursos),
            destinatariosProfessores: destinatariosProfessoresDaEscola(cursos),
            criadoPorId: state.authUser.uid,
            criadoPorNome: (state.perfil?.nome || "").trim() || "Secretaria",
            criadoEm: new Date().toISOString(),
          };
          const ref = doc(collection(db, "eventosCalendario"));
          await setDoc(ref, dados);
          const cache = cal.inst.cache[escolaId] || (cal.inst.cache[escolaId] = { eventos: [], carregando: false, erro: "", carregadoEm: Date.now() });
          cache.eventos.push({ id: ref.id, ...dados });
          // leva o calendário pro mês do item e abre o dia, pra a secretaria ver onde caiu
          const [ano, mes] = dados.data.split("-").map(Number);
          cal.ano = ano;
          cal.mes = mes - 1;
          cal.diaAberto = dados.data;
          cal.formInst = null;
        } catch(err){
          f.erro = `Não foi possível salvar agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
          f.salvando = false;
          console.error("Erro ao salvar item do calendário da secretaria:", err?.code, err);
        } finally {
          render();
        }
        break;
      }

      case "calinst-excluir-evento": {
        const cal = state.cal;
        const id = el.dataset.id;
        const escolaId = state.escolaSelecionadaId;
        const cache = cal.inst.cache[escolaId];
        if(cal.excluirConfirmId !== id){   // 1º toque só pede confirmação
          cal.excluirConfirmId = id;
          render();
          break;
        }
        cal.excluindoId = id;
        render();
        try {
          await deleteDoc(doc(db, "eventosCalendario", id));
          if(cache) cache.eventos = cache.eventos.filter(e => e.id !== id);
        } catch(err){
          if(cache) cache.erro = `Não foi possível excluir agora${err?.code ? ` (${err.code})` : ""}.`;
          cal.diaAberto = null;
        } finally {
          cal.excluirConfirmId = null;
          cal.excluindoId = null;
          render();
        }
        break;
      }

      /* ---------------- Importar calendário da SEED ---------------- */
      case "calseed-abrir":
        state.cal.seed = {
          itens: CALENDARIO_SEED_PR_2026
            .slice()
            .sort((a, b) => a.data.localeCompare(b.data))
            .map(it => ({ ...it, incluir: true })),
          cursosTodos: true, cursosSelecionados: [],
          enviando: false,
          erro: "",
        };
        render();
        break;
      case "calseed-fechar":
        state.cal.seed = null;
        render();
        break;
      case "calseed-marcar-todos":
        if(state.cal.seed) state.cal.seed.itens.forEach(i => { i.incluir = true; });
        render();
        break;
      case "calseed-desmarcar-todos":
        if(state.cal.seed) state.cal.seed.itens.forEach(i => { i.incluir = false; });
        render();
        break;
      case "calseed-toggle": {
        const idx = Number(el.dataset.idx);
        const item = state.cal.seed && state.cal.seed.itens[idx];
        if(item) item.incluir = !item.incluir;
        render();
        break;
      }
      case "calseed-toggle-todos-cursos": {
        const seed = state.cal.seed;
        if(!seed) break;
        seed.cursosTodos = !seed.cursosTodos;
        if(!seed.cursosTodos) seed.cursosSelecionados = cursosDaEscola(state.data.escolas[state.escolaSelecionadaId]?.nome || "").slice();
        render();
        break;
      }
      case "calseed-toggle-curso": {
        const seed = state.cal.seed;
        const curso = el.dataset.curso;
        if(!seed || !curso) break;
        seed.cursosSelecionados = seed.cursosSelecionados.includes(curso)
          ? seed.cursosSelecionados.filter(c => c !== curso)
          : [...seed.cursosSelecionados, curso];
        render();
        break;
      }
      case "calseed-confirmar": {
        const seed = state.cal.seed;
        if(!seed || seed.enviando) break;
        const selecionados = seed.itens.filter(i => i.incluir);
        const escolaId = state.escolaSelecionadaId;
        if(!escolaId){ seed.erro = "Selecione a unidade primeiro."; render(); break; }
        if(selecionados.length === 0){ seed.erro = "Selecione ao menos um item pra importar."; render(); break; }

        const cursos = seed.cursosTodos ? null : seed.cursosSelecionados;
        if(cursos && cursos.length === 0){ seed.erro = "Selecione ao menos um curso, ou marque \"Todos os cursos\"."; render(); break; }

        seed.erro = "";
        seed.enviando = true;
        render();
        try {
          // Mesmo público (cursos) pra todos os itens deste lote — dá pra
          // ajustar item a item depois, criando de novo pela tela se precisar.
          const destinatarios = destinatariosDaEscola(escolaId, cursos);
          const destinatariosProfessores = destinatariosProfessoresDaEscola(cursos);
          const criadoEm = new Date().toISOString();
          const criadoPorNome = (state.perfil?.nome || "").trim() || "Secretaria";

          const batch = writeBatch(db);
          const novos = [];
          selecionados.forEach(item => {
            const ref = doc(collection(db, "eventosCalendario"));
            const dados = {
              escopo: "escola",
              tipo: Object.keys(TIPOS_INSTITUICAO).includes(item.tipo) ? item.tipo : "aviso",
              titulo: item.titulo,
              descricao: item.descricao || "",
              data: item.data,
              escolaId,
              cursos,
              destinatarios,
              destinatariosProfessores,
              criadoPorId: state.authUser.uid,
              criadoPorNome,
              criadoEm,
              origemSeed: true,
            };
            batch.set(ref, dados);
            novos.push({ id: ref.id, ...dados });
          });
          await batch.commit();

          const cache = state.cal.inst.cache[escolaId] || (state.cal.inst.cache[escolaId] = { eventos: [], carregando: false, erro: "", carregadoEm: Date.now() });
          cache.eventos.push(...novos);
          state.cal.seed = null;
        } catch(err){
          seed.erro = `Não foi possível importar agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.`;
          seed.enviando = false;
          console.error("Erro ao importar calendário da SEED:", err?.code, err);
        } finally {
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
