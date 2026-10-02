/* ==================================================================
   Educa+ — Cloud Functions administrativas
   ------------------------------------------------------------------
   Quatro funções:

     definirSenhaUsuario({ uid, senha })  — define a senha de outra
       pessoa na hora (o caso do aluno que não tem e-mail de verdade e
       por isso nunca recebe o link de redefinição).

     excluirUsuarioAuth({ uid })          — apaga o login da pessoa no
       Firebase Authentication, pra ela não continuar entrando depois
       de o cadastro ter sido excluído.

     atualizarEmailUsuario({ uid, email }) — troca o e-mail de LOGIN de
       outra pessoa (Authentication + usuarios/{uid}.email). Usada na
       edição de responsáveis da Gestão.

     removerLoginAluno({ alunoId })       — tira só o ACESSO do aluno
       (login no Authentication + usuarios/{uid}) e limpa uid/e-mail do
       cadastro, mantendo o aluno, a turma e o histórico. Descobre o uid
       sozinha (pelo alunoId ou pelo e-mail), o que o navegador não
       consegue fazer nos cadastros antigos.

   Por que isso precisa de backend: o SDK do Firebase que roda no
   navegador só consegue mexer na conta que está logada naquele
   momento. Trocar a senha de OUTRA pessoa exige o Admin SDK, que só
   roda no servidor — é uma limitação do Firebase, não do app.

   Quem pode chamar: só um usuário logado cujo documento em
   usuarios/{uid} tenha role == "instituicao", e só sobre pessoas da(s)
   mesma(s) unidade(s) dele. Sem isso, qualquer usuário logado poderia
   chamar a função e trocar a senha do diretor.
   ================================================================== */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/* Se você publicar em outra região, troque aqui E na constante
   REGIAO_FUNCOES lá no script.js — os dois precisam bater. */
const REGIAO = "us-central1";

/* ------------------------------------------------------------------
   Confere se quem chamou é equipe administrativa e devolve as unidades
   dela. Lança erro (que o app já sabe traduzir) em qualquer outro caso.
   ------------------------------------------------------------------ */
async function escolasDoChamador(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login novamente.");
  }
  const snap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const dados = snap.data();
  if (!snap.exists || dados.role !== "instituicao") {
    throw new HttpsError("permission-denied", "Só a equipe administrativa pode fazer isso.");
  }
  const escolas = Array.isArray(dados.escolasIds)
    ? dados.escolasIds
    : (dados.escolaId ? [dados.escolaId] : []);
  if (escolas.length === 0) {
    throw new HttpsError("failed-precondition", "Seu usuário não está vinculado a nenhuma unidade.");
  }
  return escolas;
}

/* ------------------------------------------------------------------
   Descobre a(s) unidade(s) da pessoa-alvo, pra garantir que a secretaria
   de uma escola não mexa no acesso de alguém de outra.
   - professor / instituicao: escolasIds no próprio usuarios/{uid}
   - responsavel: escolaId no usuarios/{uid}
   - aluno: o usuarios/{uid} guarda alunoId; a escola está em alunos/{id}
   ------------------------------------------------------------------ */
async function escolasDoAlvo(uid) {
  const snap = await db.doc(`usuarios/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Cadastro desta pessoa não encontrado.");
  }
  const dados = snap.data();

  if (dados.role === "aluno") {
    if (!dados.alunoId) return [];
    const aluno = await db.doc(`alunos/${dados.alunoId}`).get();
    const escolaId = aluno.exists ? aluno.data().escolaId : null;
    return escolaId ? [escolaId] : [];
  }

  if (Array.isArray(dados.escolasIds)) return dados.escolasIds;
  return dados.escolaId ? [dados.escolaId] : [];
}

async function garantirMesmaUnidade(request, uidAlvo) {
  const minhas = await escolasDoChamador(request);
  const dela = await escolasDoAlvo(uidAlvo);
  const cruza = dela.some((id) => minhas.includes(id));
  if (!cruza) {
    throw new HttpsError("permission-denied", "Esta pessoa não é da sua unidade.");
  }
}

/* ------------------------------------------------------------------
   Define a senha de outro usuário.
   ------------------------------------------------------------------ */
exports.definirSenhaUsuario = onCall({ region: REGIAO }, async (request) => {
  const uid = (request.data && request.data.uid) || "";
  const senha = (request.data && request.data.senha) || "";

  if (!uid) {
    throw new HttpsError("invalid-argument", "Informe o usuário.");
  }
  if (typeof senha !== "string" || senha.length < 6) {
    throw new HttpsError("invalid-argument", "A senha precisa ter pelo menos 6 caracteres.");
  }

  await garantirMesmaUnidade(request, uid);
  await admin.auth().updateUser(uid, { password: senha });

  // Invalida as sessões abertas: quem estava logado com a senha antiga
  // é desconectado no próximo refresh do token (até 1h).
  await admin.auth().revokeRefreshTokens(uid);

  return { ok: true };
});

/* ------------------------------------------------------------------
   Apaga o login de outro usuário. O app já apagou os documentos do
   Firestore antes de chamar aqui; esta função cuida só do Auth.
   ------------------------------------------------------------------ */
exports.excluirUsuarioAuth = onCall({ region: REGIAO }, async (request) => {
  const uid = (request.data && request.data.uid) || "";
  if (!uid) {
    throw new HttpsError("invalid-argument", "Informe o usuário.");
  }

  // A checagem de unidade lê usuarios/{uid}. Como o app costuma apagar
  // esse documento antes de chamar aqui, tratamos "não encontrado" como
  // caso normal: confirmamos só que quem chamou é equipe administrativa.
  try {
    await garantirMesmaUnidade(request, uid);
  } catch (err) {
    if (err.code === "not-found") {
      await escolasDoChamador(request);
    } else {
      throw err;
    }
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    // Login já removido antes: não é erro do ponto de vista da secretaria.
    if (err.code !== "auth/user-not-found") throw err;
  }

  return { ok: true };
});

/* ------------------------------------------------------------------
   Remove só o login de um aluno, mantendo o cadastro dele.
   Tudo aqui roda com o Admin SDK (ignora as regras do Firestore), mas
   só depois de conferir que o aluno é de uma unidade de quem chamou.
   ------------------------------------------------------------------ */
exports.removerLoginAluno = onCall({ region: REGIAO }, async (request) => {
  const alunoId = (request.data && request.data.alunoId) || "";
  if (!alunoId) {
    throw new HttpsError("invalid-argument", "Informe o aluno.");
  }

  const minhas = await escolasDoChamador(request);
  const ref = db.doc(`alunos/${alunoId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Cadastro do aluno não encontrado.");
  }
  const aluno = snap.data();
  if (!minhas.includes(aluno.escolaId)) {
    throw new HttpsError("permission-denied", "Este aluno não é da sua unidade.");
  }

  // 1) Acha o(s) uid(s): o gravado no aluno, quem aponta pra ele em
  //    usuarios (cadastros antigos não guardavam o uid) e, por último,
  //    o e-mail de acesso no Authentication.
  const uids = new Set();
  if (aluno.uid) uids.add(aluno.uid);
  const porAluno = await db.collection("usuarios").where("alunoId", "==", alunoId).get();
  porAluno.forEach((d) => uids.add(d.id));
  if (uids.size === 0 && aluno.email) {
    try {
      const u = await admin.auth().getUserByEmail(aluno.email);
      uids.add(u.uid);
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }
  }

  // 2) Apaga o login e o perfil de cada um.
  for (const uid of uids) {
    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }
    await db.doc(`usuarios/${uid}`).delete();
  }

  // 3) Limpa o acesso no cadastro do aluno.
  await ref.update({
    uid: admin.firestore.FieldValue.delete(),
    email: "",
  });

  return { ok: true, removido: uids.size > 0 || !!aluno.email };
});

/* ------------------------------------------------------------------
   Troca o e-mail de login de outra pessoa da mesma unidade.
   O app grava o e-mail em responsaveis/{id} depois que esta função
   responde ok; aqui cuidamos do Authentication e de usuarios/{uid}.
   ------------------------------------------------------------------ */
exports.atualizarEmailUsuario = onCall({ region: REGIAO }, async (request) => {
  const uid = (request.data && request.data.uid) || "";
  const email = String((request.data && request.data.email) || "").trim().toLowerCase();

  if (!uid) {
    throw new HttpsError("invalid-argument", "Informe o usuário.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "E-mail inválido.");
  }

  await garantirMesmaUnidade(request, uid);

  try {
    await admin.auth().updateUser(uid, { email, emailVerified: false });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Já existe outra conta com esse e-mail.");
    }
    if (err.code === "auth/invalid-email") {
      throw new HttpsError("invalid-argument", "E-mail inválido.");
    }
    throw err;
  }

  await db.doc(`usuarios/${uid}`).update({ email });
  return { ok: true };
});
