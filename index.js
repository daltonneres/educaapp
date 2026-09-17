/* ==================================================================
   Educa+ — Cloud Functions administrativas
   ------------------------------------------------------------------
   Duas funções, e só duas:

     definirSenhaUsuario({ uid, senha })  — define a senha de outra
       pessoa na hora (o caso do aluno que não tem e-mail de verdade e
       por isso nunca recebe o link de redefinição).

     excluirUsuarioAuth({ uid })          — apaga o login da pessoa no
       Firebase Authentication, pra ela não continuar entrando depois
       de o cadastro ter sido excluído.

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
