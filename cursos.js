/* ==================================================================
   Educa+ — cursos.js
   ------------------------------------------------------------------
   Aba "Cursos e turmas" da secretaria. Em um só lugar a equipe
   personaliza o que antes estava fixo no código:

     • Cursos        — nome, título de exibição, descrição, ativar/desativar
     • Modalidades   — combos de cursos vendidos juntos ("Inglês + Informática")
     • Salas         — nome, capacidade, descrição, ativar/desativar
     • Turmas        — nome, descrição, curso e sala de cada turma

   Firestore — escolas/{escolaId}.catalogo      (um campo dentro do
   documento da unidade, então NÃO precisa de coleção nem de regra nova
   além de a secretaria poder gravar em "escolas", como já faz)
     cursos:      [{ id, nome, titulo, descricao, ativo }]
     modalidades: [{ id, nome, descricao, ativo }]     // nome = cursos unidos por " + "
     salas:       [{ id, nome, capacidade, descricao, ativo }]
     atualizadoEm, atualizadoPorNome

   Enquanto a unidade não tem `catalogo`, o app usa a lista padrão que
   está no script.js (CURSOS_POR_ESCOLA / MODALIDADES_POR_ESCOLA). Na
   primeira alteração salva aqui, a lista padrão é gravada junto e passa
   a valer para cadastro de aluno, professor, contrato e turma.

   Turmas (coleção "turmas"): ganham o campo `descricao`. O resto
   (nome, sala, disciplina) já existia.

   Regras que protegem os dados já existentes:
     • o nome de um curso é a "chave" usada em turmas, professores e
       contratos; por isso ele só pode ser trocado se nenhuma turma nem
       modalidade o usa. O "título de exibição" pode mudar sempre.
     • curso/modalidade em uso por turmas não pode ser excluído
       (só desativado: some das listas novas e as turmas antigas ficam).
     • trocar o nome de uma sala atualiza as turmas que a usam.

   Como se encaixa no app (igual ao solicitacoes.js / horarios.js):
     • este arquivo só monta HTML e fala com o Firestore; o estado geral
       e o render() ficam no script.js — tudo chega pelo `ctx`.
     • Todas as ações começam com "cur-" (data-action="cur-...").
     • Campos dos formulários têm data-cur="nome"; digitar NÃO
       re-renderiza (o cursor não pula).
   ================================================================== */

const LIM = { curso: 40, titulo: 60, descricao: 300, sala: 30, salaDescricao: 200, turma: 80 };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SUBS = [
  { key: "cursos", label: "Cursos" },
  { key: "modalidades", label: "Modalidades" },
  { key: "salas", label: "Salas" },
  { key: "turmas", label: "Turmas" },
];

const SEP = " + ";

function norm(s){
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function novoId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function idPadrao(prefixo, nome){
  return `p-${prefixo}-${norm(nome).replace(/[^a-z0-9]+/g, "-")}`;
}
/* "Inglês + Informática" -> ["Inglês", "Informática"] */
function partesDaModalidade(nome){
  return String(nome || "").split("+").map(x => x.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------
   Funções puras — o script.js também usa estas três pra montar as
   listas de curso/modalidade do resto do app.
   ------------------------------------------------------------------ */

/* Lê o que veio do Firestore e devolve um catálogo limpo (ou null se a
   unidade ainda não personalizou nada). */
export function normalizarCatalogo(raw){
  if(!raw || typeof raw !== "object") return null;
  const lista = (v) => Array.isArray(v) ? v.filter(x => x && typeof x === "object") : [];
  const txt = (v) => String(v == null ? "" : v).trim();
  const cap = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return {
    cursos: lista(raw.cursos)
      .map(c => ({ id: txt(c.id) || novoId(), nome: txt(c.nome), titulo: txt(c.titulo), descricao: txt(c.descricao), ativo: c.ativo !== false }))
      .filter(c => c.nome),
    modalidades: lista(raw.modalidades)
      .map(m => ({ id: txt(m.id) || novoId(), nome: txt(m.nome), descricao: txt(m.descricao), ativo: m.ativo !== false }))
      .filter(m => m.nome),
    salas: lista(raw.salas)
      .map(s => ({ id: txt(s.id) || novoId(), nome: txt(s.nome), capacidade: cap(s.capacidade), descricao: txt(s.descricao), ativo: s.ativo !== false }))
      .filter(s => s.nome),
  };
}

/* Nomes dos cursos ativos, ou null se não há catálogo (aí vale o padrão). */
export function cursosAtivosDoCatalogo(cat){
  if(!cat || !Array.isArray(cat.cursos)) return null;
  const nomes = cat.cursos.filter(c => c.ativo !== false && c.nome).map(c => c.nome);
  return nomes.length ? nomes : null;
}

/* Nomes das modalidades ativas, ou null se não há catálogo. Lista vazia é
   válida: a unidade pode não vender nenhum combo. */
export function modalidadesAtivasDoCatalogo(cat){
  if(!cat || !Array.isArray(cat.modalidades)) return null;
  return cat.modalidades.filter(m => m.ativo !== false && m.nome).map(m => m.nome);
}

/* Título de exibição de um curso ("Inglês" -> "Inglês Kids"), ou o próprio
   nome quando não há título personalizado. Modalidades voltam como estão. */
export function tituloDoCurso(cat, nome){
  if(!cat || !Array.isArray(cat.cursos)) return nome || "";
  const c = cat.cursos.find(x => x.nome === nome);
  return (c && c.titulo) || nome || "";
}

/* Quais salas ativas existem (nomes) — usado pela lista de sugestões do
   formulário de turma em Horários. */
export function salasAtivasDoCatalogo(cat){
  if(!cat || !Array.isArray(cat.salas)) return [];
  return cat.salas.filter(s => s.ativo !== false && s.nome).map(s => s.nome);
}

/* ------------------------------------------------------------------
   Conflitos de sala: duas turmas na mesma sala, no mesmo dia, com
   horários que se sobrepõem. Usa os `encontros` da turma.
   ------------------------------------------------------------------ */
function minutos(hhmm){
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function conflitosDeSala(turmas){
  const porSala = new Map();
  (turmas || []).forEach(t => {
    const sala = String(t.sala || "").trim();
    if(!sala || !Array.isArray(t.encontros)) return;
    t.encontros.forEach(e => {
      const ini = minutos(e && e.inicio);
      if(ini === null || !Number.isInteger(e.dia)) return;
      let fim = minutos(e.fim);
      if(fim === null || fim <= ini) fim = ini + 60;   // sem fim informado: considera 1h
      const chave = norm(sala);
      if(!porSala.has(chave)) porSala.set(chave, { sala, itens: [] });
      porSala.get(chave).itens.push({ turma: t, dia: e.dia, ini, fim });
    });
  });

  const out = [];
  const vistos = new Set();
  porSala.forEach(({ sala, itens }) => {
    for(let i = 0; i < itens.length; i++){
      for(let j = i + 1; j < itens.length; j++){
        const a = itens[i], b = itens[j];
        if(a.turma.id === b.turma.id || a.dia !== b.dia) continue;
        if(!(a.ini < b.fim && b.ini < a.fim)) continue;
        const par = [a.turma.id, b.turma.id].sort().join("|") + "|" + a.dia;
        if(vistos.has(par)) continue;
        vistos.add(par);
        out.push({ sala, dia: a.dia, a: a.turma, b: b.turma });
      }
    }
  });
  return out;
}

/* ================================================================== */

export function criarCursos(ctx){
  const { state, render, ICONS, db, doc, updateDoc } = ctx;
  const esc = ctx.escapeHtml;

  function estadoVazio(escolaId){
    return {
      escolaId: escolaId || null,
      sub: "cursos",
      editando: null,        // { tipo, id ("novo" ou o id do item), f: {...}, erro }
      confirma: "",          // "tipo:id" aguardando o segundo clique de "Excluir"
      ocupado: false,
      msg: "",
      erro: "",
    };
  }
  let est = estadoVazio(null);

  /* Trocou de unidade? Esquece edição em andamento. */
  function sincronizar(){
    if(est.escolaId !== state.escolaSelecionadaId) est = estadoVazio(state.escolaSelecionadaId);
  }

  /* ---------------- dados da unidade ---------------- */
  const escolaAtual = () => state.data.escolas?.[est.escolaId] || null;
  const turmasProntas = () => Array.isArray(state.instTurmas) && state.instTurmasEscolaId === est.escolaId;
  const turmas = () => turmasProntas() ? state.instTurmas : [];

  function salasDasTurmas(){
    const vistos = new Set();
    const out = [];
    turmas().forEach(t => {
      const nome = String(t.sala || "").trim();
      if(!nome || vistos.has(norm(nome))) return;
      vistos.add(norm(nome));
      out.push({ id: idPadrao("s", nome), nome, capacidade: null, descricao: "", ativo: true });
    });
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  }

  /* O catálogo que vale agora: o salvo, ou o padrão (ainda não gravado). */
  function catalogoEfetivo(){
    const salvo = escolaAtual()?.catalogo;
    if(salvo) return { ...salvo, personalizado: true };
    const p = ctx.padraoDoCatalogo(escolaAtual()?.nome || "");
    return {
      personalizado: false,
      cursos: p.cursos.map(n => ({ id: idPadrao("c", n), nome: n, titulo: "", descricao: "", ativo: true })),
      modalidades: p.modalidades.map(n => ({ id: idPadrao("m", n), nome: n, descricao: "", ativo: true })),
      salas: salasDasTurmas(),
    };
  }

  function copiaDoCatalogo(){
    const c = catalogoEfetivo();
    return JSON.parse(JSON.stringify({ cursos: c.cursos, modalidades: c.modalidades, salas: c.salas }));
  }

  /* ---------------- quem usa o quê ---------------- */
  const turmasDoCurso = (nome) => turmas().filter(t => partesDaModalidade(t.disciplina).some(p => p === nome));
  const turmasDaModalidade = (nome) => turmas().filter(t => String(t.disciplina || "").trim() === nome);
  const turmasDaSala = (nome) => turmas().filter(t => norm(t.sala) === norm(nome));
  const modalidadesComCurso = (cat, nome) => cat.modalidades.filter(m => partesDaModalidade(m.nome).includes(nome));

  /* ---------------- gravação ---------------- */
  function mensagemErro(err, alvo = "escolas"){
    const codigo = err?.code ? ` (${err.code})` : "";
    if(err?.code === "permission-denied"){
      return alvo === "escolas"
        ? `O servidor não liberou a gravação${codigo}. Avise o suporte técnico: as regras do Firestore precisam deixar a equipe administrativa gravar o campo "catalogo" no documento da própria unidade (coleção "escolas").`
        : `O servidor não liberou a gravação${codigo}. Avise o suporte técnico: as regras do Firestore precisam deixar a equipe administrativa alterar a coleção "turmas".`;
    }
    if(err?.code === "unavailable") return "Sem conexão com o servidor agora. Confira a internet e tente de novo.";
    return `Não foi possível salvar${codigo}. Tente de novo.`;
  }

  function falha(texto){
    if(est.editando) est.editando.erro = texto;
    else est.erro = texto;
  }

  /* Grava o catálogo inteiro. Devolve true/false. */
  async function gravarCatalogo(cat){
    const completo = {
      cursos: cat.cursos, modalidades: cat.modalidades, salas: cat.salas,
      atualizadoEm: new Date().toISOString(),
      atualizadoPorNome: String(state.perfil?.nome || "").trim(),
    };
    await updateDoc(doc(db, "escolas", est.escolaId), { catalogo: completo });
    escolaAtual().catalogo = normalizarCatalogo(completo);
  }

  /* Envolve uma alteração: bloqueia cliques repetidos, mostra erro/sucesso. */
  async function executar(msgOk, fn, alvo = "escolas"){
    if(est.ocupado) return false;
    est.ocupado = true; est.msg = ""; est.erro = "";
    if(est.editando) est.editando.erro = "";
    render();
    try {
      await fn();
      est.msg = msgOk;
      est.editando = null;
      est.confirma = "";
      return true;
    } catch(err){
      console.error("Cursos e turmas:", err?.code, err);
      falha(mensagemErro(err, (err && err.alvoMensagem) || alvo));
      return false;
    } finally {
      est.ocupado = false;
      render();
    }
  }

  /* Erro de validação (não é falha de rede): mostra no formulário. */
  function invalido(texto){
    falha(texto);
    render();
  }

  function exigirTurmas(){
    if(turmasProntas()) return true;
    invalido("Aguarde um instante: as turmas da unidade ainda estão carregando. Tente de novo em seguida.");
    return false;
  }

  /* ================================================================
     CURSOS
     ================================================================ */
  function salvarCurso(){
    const e = est.editando, f = e.f;
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const nome = f.nome.trim(), titulo = f.titulo.trim(), descricao = f.descricao.trim();
    const existente = e.id === "novo" ? null : cat.cursos.find(c => c.id === e.id);

    let erro = "";
    if(!nome) erro = "Digite o nome do curso.";
    else if(nome.includes("+")) erro = "O nome do curso não pode ter o sinal \"+\" (ele é usado para juntar cursos nas modalidades).";
    else if(nome.length > LIM.curso) erro = `O nome pode ter no máximo ${LIM.curso} letras.`;
    else if(cat.cursos.some(c => c.id !== e.id && norm(c.nome) === norm(nome))) erro = "Já existe um curso com esse nome.";
    else if(titulo.length > LIM.titulo) erro = `O título pode ter no máximo ${LIM.titulo} letras.`;
    else if(descricao.length > LIM.descricao) erro = `A descrição pode ter no máximo ${LIM.descricao} letras.`;
    else if(existente && existente.nome !== nome && (turmasDoCurso(existente.nome).length || modalidadesComCurso(cat, existente.nome).length)){
      erro = "Este curso está em uso (turmas ou modalidades), então o nome não pode mudar. Use o título de exibição para mostrar outro nome.";
    }
    if(erro) return invalido(erro);

    if(existente){
      existente.nome = nome; existente.titulo = titulo; existente.descricao = descricao;
    } else {
      cat.cursos.push({ id: novoId(), nome, titulo, descricao, ativo: true });
    }
    executar(existente ? "Curso atualizado." : "Curso criado. Ele já aparece nas listas do app.", () => gravarCatalogo(cat));
  }

  function alternarCurso(id){
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const c = cat.cursos.find(x => x.id === id);
    if(!c) return;
    let aviso = "";
    if(c.ativo){
      if(cat.cursos.filter(x => x.ativo).length <= 1){
        est.erro = "A unidade precisa ter pelo menos um curso ativo."; est.msg = ""; render(); return;
      }
      c.ativo = false;
      const afetadas = modalidadesComCurso(cat, c.nome).filter(m => m.ativo);
      afetadas.forEach(m => { m.ativo = false; });
      if(afetadas.length) aviso = ` As modalidades ${afetadas.map(m => `"${m.nome}"`).join(", ")} também foram desativadas.`;
    } else {
      c.ativo = true;
    }
    executar(c.ativo ? "Curso reativado." : `Curso desativado: some das listas novas, mas as turmas que já usam continuam.${aviso}`, () => gravarCatalogo(cat));
  }

  function excluirCurso(id){
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const c = cat.cursos.find(x => x.id === id);
    if(!c) return;
    const nTurmas = turmasDoCurso(c.nome).length;
    const mods = modalidadesComCurso(cat, c.nome);
    if(nTurmas || mods.length){
      const motivos = [];
      if(nTurmas) motivos.push(`${nTurmas} turma${nTurmas === 1 ? "" : "s"}`);
      if(mods.length) motivos.push(`${mods.length} modalidade${mods.length === 1 ? "" : "s"}`);
      est.erro = `Não dá para excluir "${c.nome}": ele está em ${motivos.join(" e ")}. Desative o curso em vez de excluir.`;
      est.msg = ""; est.confirma = ""; render(); return;
    }
    if(c.ativo && cat.cursos.filter(x => x.ativo).length <= 1){
      est.erro = "A unidade precisa ter pelo menos um curso ativo."; est.msg = ""; est.confirma = ""; render(); return;
    }
    if(!confirmar("curso", id)) return;
    cat.cursos = cat.cursos.filter(x => x.id !== id);
    executar("Curso excluído.", () => gravarCatalogo(cat));
  }

  /* ================================================================
     MODALIDADES
     ================================================================ */
  function nomePrevia(){
    const e = est.editando;
    if(!e || e.tipo !== "modalidade") return "";
    const cat = catalogoEfetivo();
    const ordenados = cat.cursos.filter(c => e.f.comp.includes(c.nome)).map(c => c.nome);
    return ordenados.length ? ordenados.join(SEP) : "Escolha pelo menos dois cursos";
  }

  function salvarModalidade(){
    const e = est.editando, f = e.f;
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const existente = e.id === "novo" ? null : cat.modalidades.find(m => m.id === e.id);
    const comp = cat.cursos.filter(c => f.comp.includes(c.nome)).map(c => c.nome);
    const nome = comp.join(SEP);
    const descricao = f.descricao.trim();

    let erro = "";
    if(comp.length < 2) erro = "Escolha pelo menos dois cursos para formar uma modalidade.";
    else if(cat.modalidades.some(m => m.id !== e.id && norm(m.nome) === norm(nome))) erro = "Já existe uma modalidade com esses cursos.";
    else if(descricao.length > LIM.descricao) erro = `A descrição pode ter no máximo ${LIM.descricao} letras.`;
    else if(existente && existente.nome !== nome && turmasDaModalidade(existente.nome).length){
      erro = "Esta modalidade está em uso por turmas, então os cursos dela não podem mudar. Crie outra modalidade ou desative esta.";
    }
    if(erro) return invalido(erro);

    if(existente){
      existente.nome = nome; existente.descricao = descricao;
    } else {
      cat.modalidades.push({ id: novoId(), nome, descricao, ativo: true });
    }
    executar(existente ? "Modalidade atualizada." : "Modalidade criada. Ela já aparece nas listas do app.", () => gravarCatalogo(cat));
  }

  function alternarModalidade(id){
    const cat = copiaDoCatalogo();
    const m = cat.modalidades.find(x => x.id === id);
    if(!m) return;
    if(!m.ativo){
      const inativos = partesDaModalidade(m.nome).filter(n => !cat.cursos.some(c => c.nome === n && c.ativo));
      if(inativos.length){
        est.erro = `Para reativar esta modalidade, reative antes o(s) curso(s): ${inativos.join(", ")}.`; est.msg = ""; render(); return;
      }
    }
    m.ativo = !m.ativo;
    executar(m.ativo ? "Modalidade reativada." : "Modalidade desativada: some das listas novas, mas as turmas que já usam continuam.", () => gravarCatalogo(cat));
  }

  function excluirModalidade(id){
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const m = cat.modalidades.find(x => x.id === id);
    if(!m) return;
    const n = turmasDaModalidade(m.nome).length;
    if(n){
      est.erro = `Não dá para excluir "${m.nome}": ${n} turma${n === 1 ? " usa" : "s usam"} esta modalidade. Desative em vez de excluir.`;
      est.msg = ""; est.confirma = ""; render(); return;
    }
    if(!confirmar("modalidade", id)) return;
    cat.modalidades = cat.modalidades.filter(x => x.id !== id);
    executar("Modalidade excluída.", () => gravarCatalogo(cat));
  }

  /* ================================================================
     SALAS
     ================================================================ */
  function salvarSala(){
    const e = est.editando, f = e.f;
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const existente = e.id === "novo" ? null : cat.salas.find(s => s.id === e.id);
    const nome = f.nome.trim(), descricao = f.descricao.trim();
    const capTxt = String(f.capacidade || "").trim();
    const cap = capTxt === "" ? null : Number(capTxt);

    let erro = "";
    if(!nome) erro = "Digite o nome ou número da sala.";
    else if(nome.length > LIM.sala) erro = `O nome pode ter no máximo ${LIM.sala} letras.`;
    else if(cat.salas.some(s => s.id !== e.id && norm(s.nome) === norm(nome))) erro = "Já existe uma sala com esse nome.";
    else if(cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 999)) erro = "A capacidade precisa ser um número inteiro entre 1 e 999 (ou deixe em branco).";
    else if(descricao.length > LIM.salaDescricao) erro = `A descrição pode ter no máximo ${LIM.salaDescricao} letras.`;
    if(erro) return invalido(erro);

    const antigo = existente ? existente.nome : null;
    if(existente){
      existente.nome = nome; existente.capacidade = cap; existente.descricao = descricao;
    } else {
      cat.salas.push({ id: novoId(), nome, capacidade: cap, descricao, ativo: true });
    }

    /* Renomear a sala acompanha as turmas que a usam (elas guardam o nome
       como texto). Turmas primeiro: se falhar, o catálogo não muda e dá
       pra tentar de novo sem sobrar nada pela metade. */
    const afetadas = antigo && antigo !== nome ? turmasDaSala(antigo) : [];
    executar(
      afetadas.length
        ? `Sala atualizada. ${afetadas.length} turma${afetadas.length === 1 ? "" : "s"} passou${afetadas.length === 1 ? "" : "ram"} a mostrar o novo nome.`
        : (existente ? "Sala atualizada." : "Sala criada. Ela já aparece como sugestão no cadastro de turmas."),
      async () => {
        for(const t of afetadas){
          try {
            await updateDoc(doc(db, "turmas", t.id), { sala: nome });
          } catch(err){
            err.alvoMensagem = "turmas";
            throw err;
          }
          t.sala = nome;
        }
        await gravarCatalogo(cat);
      }
    );
  }

  function alternarSala(id){
    const cat = copiaDoCatalogo();
    const s = cat.salas.find(x => x.id === id);
    if(!s) return;
    s.ativo = !s.ativo;
    executar(s.ativo ? "Sala reativada." : "Sala desativada: deixa de ser sugerida, mas as turmas que já usam continuam.", () => gravarCatalogo(cat));
  }

  function excluirSala(id){
    if(!exigirTurmas()) return;
    const cat = copiaDoCatalogo();
    const s = cat.salas.find(x => x.id === id);
    if(!s) return;
    if(!confirmar("sala", id)) return;
    cat.salas = cat.salas.filter(x => x.id !== id);
    executar("Sala excluída da lista. As turmas que usavam esse nome continuam com ele.", () => gravarCatalogo(cat));
  }

  /* ================================================================
     TURMAS
     ================================================================ */
  async function salvarTurma(){
    const e = est.editando, f = e.f;
    const turma = turmas().find(t => t.id === e.id);
    if(!turma) return invalido("Turma não encontrada. Atualize a página e tente de novo.");
    const nome = f.nome.trim(), descricao = f.descricao.trim();
    let erro = "";
    if(!nome) erro = "Digite o nome da turma.";
    else if(nome.length > LIM.turma) erro = `O nome pode ter no máximo ${LIM.turma} letras.`;
    else if(descricao.length > LIM.descricao) erro = `A descrição pode ter no máximo ${LIM.descricao} letras.`;
    else if(!f.disciplina) erro = "Escolha o curso da turma.";
    if(erro) return invalido(erro);

    const dados = { nome, descricao, sala: f.sala.trim(), disciplina: f.disciplina };
    executar("Turma atualizada.", async () => {
      await updateDoc(doc(db, "turmas", turma.id), dados);
      Object.assign(turma, dados);
    }, "turmas");
  }

  /* ================================================================
     Ações comuns
     ================================================================ */
  /* Primeiro clique pede confirmação, segundo executa. */
  function confirmar(tipo, id){
    const chave = `${tipo}:${id}`;
    if(est.confirma === chave) return true;
    est.confirma = chave; est.msg = ""; est.erro = "";
    render();
    return false;
  }

  function abrirForm(tipo, id){
    est.msg = ""; est.erro = ""; est.confirma = "";
    const cat = catalogoEfetivo();
    let f;
    if(tipo === "curso"){
      const c = id === "novo" ? null : cat.cursos.find(x => x.id === id);
      f = { nome: c?.nome || "", titulo: c?.titulo || "", descricao: c?.descricao || "" };
    } else if(tipo === "modalidade"){
      const m = id === "novo" ? null : cat.modalidades.find(x => x.id === id);
      f = { comp: m ? partesDaModalidade(m.nome) : [], descricao: m?.descricao || "" };
    } else if(tipo === "sala"){
      const s = id === "novo" ? null : cat.salas.find(x => x.id === id);
      f = { nome: s?.nome || "", capacidade: s?.capacidade ? String(s.capacidade) : "", descricao: s?.descricao || "" };
    } else {
      const t = turmas().find(x => x.id === id);
      if(!t) return;
      f = { nome: t.nome || "", descricao: t.descricao || "", sala: t.sala || "", disciplina: t.disciplina || "" };
    }
    est.editando = { tipo, id, f, erro: "" };
    render();
    const primeiro = document.querySelector("[data-cur-foco]");
    if(primeiro){ primeiro.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }

  function restaurarPadrao(){
    if(!confirmar("padrao", "tudo")) return;
    executar("Voltou à lista padrão do app. As turmas existentes não foram alteradas.", async () => {
      await updateDoc(doc(db, "escolas", est.escolaId), { catalogo: ctx.deleteField() });
      escolaAtual().catalogo = null;
    });
  }

  /* ================================================================
     HTML
     ================================================================ */
  const campo = (rotulo, html, dica = "") =>
    `<label class="hor-campo"><span class="teacher-label">${rotulo}</span>${html}${dica ? `<small>${dica}</small>` : ""}</label>`;

  function texto(c, valor, { max, ph = "", off = false, foco = false } = {}){
    return `<input class="teacher-text-input" data-cur="${c}" ${max ? `maxlength="${max}"` : ""} value="${esc(valor)}" placeholder="${esc(ph)}" ${off || est.ocupado ? "disabled" : ""} ${foco ? "data-cur-foco" : ""} />`;
  }
  function area(c, valor, max, ph = ""){
    return `<textarea class="teacher-text-input" data-cur="${c}" rows="3" maxlength="${max}" placeholder="${esc(ph)}" ${est.ocupado ? "disabled" : ""}>${esc(valor)}</textarea>`;
  }

  function rodapeForm(rotuloSalvar){
    const e = est.editando;
    return `
      ${e.erro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:10px;">${esc(e.erro)}</p>` : ""}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="cur-salvar" ${est.ocupado ? "disabled" : ""}>${est.ocupado ? "Salvando…" : rotuloSalvar}</button>
        <button type="button" class="attendance-btn" data-action="cur-cancelar" ${est.ocupado ? "disabled" : ""}>Cancelar</button>
      </div>`;
  }

  const moldura = (titulo, corpo) => `
    <div class="card" style="margin-bottom:12px;border-left:4px solid var(--navy);">
      <div style="font-size:14px;font-weight:700;color:var(--ink);">${esc(titulo)}</div>
      ${corpo}
    </div>`;

  function estaEditando(tipo, id){
    const e = est.editando;
    return !!e && e.tipo === tipo && e.id === id;
  }

  function botoesItem(tipo, id, ativo, { podeExcluir = true } = {}){
    const bloq = est.ocupado ? "disabled" : "";
    const confirmando = est.confirma === `${tipo}:${id}`;
    return `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <button type="button" class="attendance-btn" data-action="cur-editar" data-t="${tipo}" data-id="${esc(id)}" ${bloq}>${ICONS.pencil || ""} Editar</button>
        ${tipo === "turma" ? "" : `<button type="button" class="attendance-btn" data-action="cur-alternar" data-t="${tipo}" data-id="${esc(id)}" ${bloq}>${ativo ? "Desativar" : "Reativar"}</button>`}
        ${podeExcluir ? `<button type="button" class="attendance-btn" data-action="cur-excluir" data-t="${tipo}" data-id="${esc(id)}" ${bloq}>${confirmando ? "Confirmar exclusão" : `${ICONS.trash || ""} Excluir`}</button>` : ""}
        ${confirmando ? `<button type="button" class="attendance-btn" data-action="cur-confirma-cancelar">Cancelar</button>` : ""}
      </div>`;
  }

  const vazio = (titulo, sub) => `<div class="teacher-empty-state"><strong>${esc(titulo)}</strong><span>${esc(sub)}</span></div>`;
  const pillAtivo = (ativo) => `<span class="pill ${ativo ? "pill-green" : "pill-red"}">${ativo ? "Ativo" : "Desativado"}</span>`;
  const pillUso = (n, singular, plural) => n ? `<span class="pill pill-gold">${n} ${n === 1 ? singular : plural}</span>` : "";

  /* ---------- Cursos ---------- */
  function formCurso(){
    const e = est.editando, f = e.f;
    const cat = catalogoEfetivo();
    const existente = e.id === "novo" ? null : cat.cursos.find(c => c.id === e.id);
    const emUso = existente ? (turmasDoCurso(existente.nome).length + modalidadesComCurso(cat, existente.nome).length) : 0;
    return moldura(existente ? "Editar curso" : "Novo curso", `
      ${campo("Nome do curso", texto("nome", f.nome, { max: LIM.curso, ph: "Ex.: Espanhol", off: emUso > 0, foco: true }),
        emUso ? "Em uso por turmas ou modalidades, por isso o nome não muda. Use o título abaixo para mostrar outro nome." : "É o nome que o sistema usa em turmas, professores e contratos.")}
      ${campo("Título de exibição (opcional)", texto("titulo", f.titulo, { max: LIM.titulo, ph: "Ex.: Inglês Kids" }), "Aparece na lista de turmas no lugar do nome, se você preencher.")}
      ${campo("Descrição (opcional)", area("descricao", f.descricao, LIM.descricao, "Para quem é, o que o aluno aprende, duração…"))}
      ${rodapeForm(existente ? "Salvar curso" : "Criar curso")}`);
  }

  function cartaoCurso(c, cat){
    if(estaEditando("curso", c.id)) return formCurso();
    const n = turmasDoCurso(c.nome).length;
    return `
      <div class="card" style="margin-bottom:12px;${c.ativo ? "" : "opacity:.65;"}">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
          ${pillAtivo(c.ativo)}${pillUso(n, "turma", "turmas")}
        </div>
        <div style="font-size:15px;font-weight:600;color:var(--ink);">${esc(c.titulo || c.nome)}</div>
        ${c.titulo ? `<div style="font-size:12.5px;color:var(--slate);margin-top:2px;">Nome no sistema: ${esc(c.nome)}</div>` : ""}
        ${c.descricao ? `<p style="font-size:13.5px;color:var(--slate);margin:6px 0 0;white-space:pre-wrap;">${esc(c.descricao)}</p>` : ""}
        ${botoesItem("curso", c.id, c.ativo)}
      </div>`;
  }

  function subCursos(cat){
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <p class="section-eyebrow" style="margin:0;">Os cursos que a unidade oferece. Valem para cadastro de aluno, professor, contrato e turma.</p>
        <button type="button" class="teacher-primary-btn" style="margin-top:0;white-space:nowrap;" data-action="cur-novo" data-t="curso" ${est.ocupado ? "disabled" : ""}>+ Novo curso</button>
      </div>
      ${estaEditando("curso", "novo") ? formCurso() : ""}
      ${cat.cursos.map(c => cartaoCurso(c, cat)).join("") || vazio("Nenhum curso ainda.", "Crie o primeiro curso pelo botão acima.")}`;
  }

  /* ---------- Modalidades ---------- */
  function formModalidade(){
    const e = est.editando, f = e.f;
    const cat = catalogoEfetivo();
    const existente = e.id === "novo" ? null : cat.modalidades.find(m => m.id === e.id);
    const travada = !!existente && turmasDaModalidade(existente.nome).length > 0;
    const opcoes = cat.cursos.filter(c => c.ativo || f.comp.includes(c.nome));
    const lista = opcoes.length
      ? `<div class="responsavel-vinculo-list">${opcoes.map(c => `
          <label class="responsavel-vinculo-item">
            <input type="checkbox" data-cur="comp" data-nome="${esc(c.nome)}" ${f.comp.includes(c.nome) ? "checked" : ""} ${travada || est.ocupado ? "disabled" : ""} />
            <span>${esc(c.titulo || c.nome)}${c.titulo ? ` · ${esc(c.nome)}` : ""}${c.ativo ? "" : " (desativado)"}</span>
          </label>`).join("")}</div>`
      : `<p class="hor-vazio-txt">Crie ao menos dois cursos antes de montar uma modalidade.</p>`;
    return moldura(existente ? "Editar modalidade" : "Nova modalidade", `
      <span class="teacher-label" style="margin-top:12px;display:block;" data-cur-foco>Cursos que fazem parte</span>
      ${lista}
      ${travada ? `<p class="hor-vazio-txt" style="margin-top:6px;">Em uso por turmas: os cursos não podem mudar.</p>` : ""}
      <p style="font-size:13px;color:var(--slate);margin:10px 0 0;">Nome da modalidade: <strong id="cur-preview" style="color:var(--ink);">${esc(nomePrevia())}</strong></p>
      ${campo("Descrição (opcional)", area("descricao", f.descricao, LIM.descricao, "O que está incluso, carga horária, valores combinados…"))}
      ${rodapeForm(existente ? "Salvar modalidade" : "Criar modalidade")}`);
  }

  function cartaoModalidade(m){
    if(estaEditando("modalidade", m.id)) return formModalidade();
    const n = turmasDaModalidade(m.nome).length;
    return `
      <div class="card" style="margin-bottom:12px;${m.ativo ? "" : "opacity:.65;"}">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
          ${pillAtivo(m.ativo)}${pillUso(n, "turma", "turmas")}
        </div>
        <div style="font-size:15px;font-weight:600;color:var(--ink);">${esc(m.nome)}</div>
        ${m.descricao ? `<p style="font-size:13.5px;color:var(--slate);margin:6px 0 0;white-space:pre-wrap;">${esc(m.descricao)}</p>` : ""}
        ${botoesItem("modalidade", m.id, m.ativo)}
      </div>`;
  }

  function subModalidades(cat){
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <p class="section-eyebrow" style="margin:0;">Combos de cursos vendidos juntos. Aparecem ao lado dos cursos nas listas do app.</p>
        <button type="button" class="teacher-primary-btn" style="margin-top:0;white-space:nowrap;" data-action="cur-novo" data-t="modalidade" ${est.ocupado ? "disabled" : ""}>+ Nova modalidade</button>
      </div>
      ${estaEditando("modalidade", "novo") ? formModalidade() : ""}
      ${cat.modalidades.map(cartaoModalidade).join("") || vazio("Nenhuma modalidade.", "A unidade só vende cursos avulsos. Crie uma modalidade para juntar dois ou mais cursos.")}`;
  }

  /* ---------- Salas ---------- */
  function formSala(){
    const e = est.editando, f = e.f;
    const cat = catalogoEfetivo();
    const existente = e.id === "novo" ? null : cat.salas.find(s => s.id === e.id);
    const n = existente ? turmasDaSala(existente.nome).length : 0;
    return moldura(existente ? "Editar sala" : "Nova sala", `
      <div class="hor-dois">
        ${campo("Nome ou número", texto("nome", f.nome, { max: LIM.sala, ph: "Ex.: 3 ou Laboratório", foco: true }),
          n ? `Ao trocar o nome, ${n} turma${n === 1 ? "" : "s"} acompanha${n === 1 ? "" : "m"}.` : "")}
        ${campo("Capacidade (opcional)", `<input class="teacher-text-input" data-cur="capacidade" inputmode="numeric" maxlength="3" value="${esc(f.capacidade)}" placeholder="Ex.: 12" ${est.ocupado ? "disabled" : ""} />`, "Quantos alunos cabem.")}
      </div>
      ${campo("Descrição (opcional)", area("descricao", f.descricao, LIM.salaDescricao, "Andar, equipamentos, observações…"))}
      ${rodapeForm(existente ? "Salvar sala" : "Criar sala")}`);
  }

  function cartaoSala(s){
    if(estaEditando("sala", s.id)) return formSala();
    const usam = turmasDaSala(s.nome);
    const acima = s.capacidade ? usam.filter(t => (t.alunos || []).length > s.capacidade) : [];
    return `
      <div class="card" style="margin-bottom:12px;${s.ativo ? "" : "opacity:.65;"}">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
          ${pillAtivo(s.ativo)}
          ${s.capacidade ? `<span class="pill pill-gold">${ICONS.users || ""} até ${s.capacidade}</span>` : ""}
          ${pillUso(usam.length, "turma", "turmas")}
        </div>
        <div style="font-size:15px;font-weight:600;color:var(--ink);">Sala ${esc(s.nome)}</div>
        ${s.descricao ? `<p style="font-size:13.5px;color:var(--slate);margin:6px 0 0;white-space:pre-wrap;">${esc(s.descricao)}</p>` : ""}
        ${usam.length ? `<div style="font-size:12.5px;color:var(--slate);margin-top:8px;">Usada por: ${esc(usam.slice(0, 5).map(t => t.nome).join(", "))}${usam.length > 5 ? ` e mais ${usam.length - 5}` : ""}</div>` : ""}
        ${acima.length ? `<div style="font-size:12.5px;color:var(--red);margin-top:6px;">${ICONS.warn || ""} Acima da capacidade: ${esc(acima.map(t => `${t.nome} (${(t.alunos || []).length} alunos)`).join(", "))}</div>` : ""}
        ${botoesItem("sala", s.id, s.ativo)}
      </div>`;
  }

  function avisoConflitos(){
    if(!turmasProntas()) return "";
    const lista = conflitosDeSala(turmas());
    if(!lista.length) return "";
    const hora = (t, dia) => {
      const e = (t.encontros || []).find(x => x.dia === dia);
      return e ? `${e.inicio}${e.fim ? `–${e.fim}` : ""}` : "";
    };
    return `
      <div class="contrato-aviso" style="margin-bottom:14px;border-color:var(--red);">
        <strong>${ICONS.warn || ""} ${lista.length} conflito${lista.length === 1 ? "" : "s"} de sala</strong>
        <div style="font-size:13px;margin-top:6px;">
          ${lista.slice(0, 12).map(c => `<div>Sala ${esc(c.sala)}, ${DIAS[c.dia]}: <strong>${esc(c.a.nome)}</strong> (${esc(hora(c.a, c.dia))}) e <strong>${esc(c.b.nome)}</strong> (${esc(hora(c.b, c.dia))})</div>`).join("")}
          ${lista.length > 12 ? `<div>… e mais ${lista.length - 12}.</div>` : ""}
        </div>
        <div style="font-size:12.5px;color:var(--slate);margin-top:6px;">Ajuste a sala na aba Turmas ou o horário em Horários.</div>
      </div>`;
  }

  function subSalas(cat){
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <p class="section-eyebrow" style="margin:0;">As salas da unidade. Ficam como sugestão ao criar ou editar uma turma.</p>
        <button type="button" class="teacher-primary-btn" style="margin-top:0;white-space:nowrap;" data-action="cur-novo" data-t="sala" ${est.ocupado ? "disabled" : ""}>+ Nova sala</button>
      </div>
      ${avisoConflitos()}
      ${estaEditando("sala", "novo") ? formSala() : ""}
      ${cat.salas.map(cartaoSala).join("") || vazio("Nenhuma sala cadastrada.", "Crie as salas da unidade para escolher na hora de montar as turmas.")}`;
  }

  /* ---------- Turmas ---------- */
  function formTurma(){
    const e = est.editando, f = e.f;
    const cat = catalogoEfetivo();
    const disciplinas = [...cat.cursos.filter(c => c.ativo).map(c => c.nome), ...cat.modalidades.filter(m => m.ativo).map(m => m.nome)];
    if(f.disciplina && !disciplinas.includes(f.disciplina)) disciplinas.push(f.disciplina);
    const salas = cat.salas.filter(s => s.ativo).map(s => s.nome);
    if(f.sala && !salas.some(n => norm(n) === norm(f.sala))) salas.push(f.sala);
    const rotuloDisc = (d) => {
      const c = cat.cursos.find(x => x.nome === d);
      return c && c.titulo ? `${c.titulo} (${d})` : d;
    };
    return moldura("Editar turma", `
      ${campo("Nome da turma", texto("nome", f.nome, { max: LIM.turma, ph: "Ex.: Inglês — Turma A", foco: true }))}
      ${campo("Descrição (opcional)", area("descricao", f.descricao, LIM.descricao, "Nível, objetivo, observações para a equipe…"))}
      <div class="hor-dois">
        ${campo("Curso", `<select class="teacher-text-input" data-cur="disciplina" ${est.ocupado ? "disabled" : ""}>
          ${disciplinas.map(d => `<option value="${esc(d)}" ${f.disciplina === d ? "selected" : ""}>${esc(rotuloDisc(d))}</option>`).join("")}
        </select>`)}
        ${campo("Sala", `<select class="teacher-text-input" data-cur="sala" ${est.ocupado ? "disabled" : ""}>
          <option value="" ${!f.sala ? "selected" : ""}>Sem sala definida</option>
          ${salas.map(n => `<option value="${esc(n)}" ${norm(f.sala) === norm(n) ? "selected" : ""}>Sala ${esc(n)}</option>`).join("")}
        </select>`, "As salas vêm da aba Salas.")}
      </div>
      <p class="hor-vazio-txt" style="margin-top:10px;">Dias, horários, professor e alunos continuam na aba Horários e na ficha do aluno.</p>
      ${rodapeForm("Salvar turma")}`);
  }

  function cartaoTurma(t, cat, conflitaIds){
    if(estaEditando("turma", t.id)) return formTurma();
    const qtd = (t.alunos || []).length;
    const c = cat.cursos.find(x => x.nome === t.disciplina);
    return `
      <div class="card" style="margin-bottom:12px;">
        <div style="font-size:15px;font-weight:600;color:var(--ink);">${esc(t.nome)}</div>
        ${t.descricao ? `<p style="font-size:13.5px;color:var(--slate);margin:4px 0 0;white-space:pre-wrap;">${esc(t.descricao)}</p>` : ""}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
          ${t.disciplina ? `<span class="pill pill-gold">${esc((c && c.titulo) || t.disciplina)}</span>` : ""}
          ${t.sala ? `<span class="pill pill-gold">Sala ${esc(t.sala)}</span>` : `<span class="pill pill-red">Sem sala</span>`}
          ${t.horario ? `<span class="pill pill-gold">${esc(t.horario)}</span>` : ""}
          <span class="pill pill-gold">${qtd} aluno${qtd === 1 ? "" : "s"}</span>
          ${conflitaIds.has(t.id) ? `<span class="pill pill-red">${ICONS.warn || ""} Conflito de sala</span>` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
          <button type="button" class="attendance-btn" data-action="cur-editar" data-t="turma" data-id="${esc(t.id)}" ${est.ocupado ? "disabled" : ""}>${ICONS.pencil || ""} Editar</button>
          <button type="button" class="attendance-btn" data-action="cur-ir-horarios" ${est.ocupado ? "disabled" : ""}>Dias e horários</button>
        </div>
      </div>`;
  }

  function subTurmas(cat){
    if(state.instTurmasCarregando && !turmasProntas()) return `<p class="section-eyebrow">Carregando turmas…</p>`;
    if(state.instTurmasErro) return `<p class="teacher-error" style="color:var(--red);font-size:13px;">${esc(state.instTurmasErro)}</p>`;
    const lista = [...turmas()].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { numeric: true }));
    const conflitaIds = new Set();
    conflitosDeSala(lista).forEach(c => { conflitaIds.add(c.a.id); conflitaIds.add(c.b.id); });
    return `
      <p class="section-eyebrow" style="margin:0 0 12px;">Ajuste nome, descrição, curso e sala de cada turma. Para criar uma turma nova, use a aba Turmas ou Horários.</p>
      ${lista.map(t => cartaoTurma(t, cat, conflitaIds)).join("") || vazio("Nenhuma turma cadastrada ainda.", "Crie a primeira turma na aba Turmas.")}`;
  }

  /* ---------- Tela ---------- */
  function view(){
    sincronizar();
    const escola = escolaAtual();
    const cat = catalogoEfetivo();
    const contagem = {
      cursos: cat.cursos.length,
      modalidades: cat.modalidades.length,
      salas: cat.salas.length,
      turmas: turmasProntas() ? turmas().length : "…",
    };

    const barra = `<div class="subtab-bar">${SUBS.map(s => `
      <button type="button" class="subtab-btn ${est.sub === s.key ? "active" : ""}" data-action="cur-sub" data-k="${s.key}">
        <span>${s.label} (${contagem[s.key]})</span>
      </button>`).join("")}</div>`;

    const corpo = est.sub === "modalidades" ? subModalidades(cat)
      : est.sub === "salas" ? subSalas(cat)
      : est.sub === "turmas" ? subTurmas(cat)
      : subCursos(cat);

    const aviso = !cat.personalizado ? `
      <div class="contrato-aviso" style="margin-bottom:14px;">
        <strong>Esta unidade ainda usa a lista padrão do app.</strong>
        Assim que você salvar a primeira alteração aqui, a lista passa a ser da unidade e vale para cadastro de aluno, professor, contrato e turma.
      </div>` : "";

    const restaurar = cat.personalizado ? `
      <div style="margin-top:22px;padding-top:14px;border-top:1px solid rgba(18,32,50,.1);">
        <button type="button" class="attendance-btn" data-action="cur-restaurar-padrao" ${est.ocupado ? "disabled" : ""}>${est.confirma === "padrao:tudo" ? "Confirmar: voltar à lista padrão" : "Voltar à lista padrão do app"}</button>
        ${est.confirma === "padrao:tudo" ? `<button type="button" class="attendance-btn" data-action="cur-confirma-cancelar">Cancelar</button>` : ""}
        <p style="font-size:12px;color:var(--slate);margin:8px 0 0;">Apaga só a personalização de cursos, modalidades e salas desta unidade. Turmas, alunos e professores não mudam.</p>
      </div>` : "";

    return `
      <h2 class="section-title">Cursos e turmas</h2>
      <p class="section-eyebrow">${esc(escola?.nome || "")} · Personalize cursos, modalidades, salas e turmas da unidade.</p>
      ${aviso}
      ${barra}
      ${est.erro ? `<p class="teacher-error" style="color:var(--red);font-size:13px;margin:12px 0 0;">${esc(est.erro)}</p>` : ""}
      ${est.msg ? `<p class="teacher-success" style="margin:12px 0 0;">${esc(est.msg)}</p>` : ""}
      <div style="margin-top:16px;">${corpo}</div>
      ${restaurar}`;
  }

  /* ================================================================
     Entradas do script.js
     ================================================================ */
  function click(el){
    sincronizar();
    const a = el.dataset.action;
    if(a !== "cur-excluir" && a !== "cur-restaurar-padrao" && est.confirma){ est.confirma = ""; }
    switch(a){
      case "cur-sub":
        if(est.ocupado) return;
        est.sub = el.dataset.k; est.editando = null; est.msg = ""; est.erro = ""; est.confirma = "";
        render();
        break;
      case "cur-novo": abrirForm(el.dataset.t, "novo"); break;
      case "cur-editar": abrirForm(el.dataset.t, el.dataset.id); break;
      case "cur-cancelar":
        if(est.ocupado) return;
        est.editando = null; render();
        break;
      case "cur-salvar": {
        const e = est.editando;
        if(!e || est.ocupado) return;
        if(e.tipo === "curso") salvarCurso();
        else if(e.tipo === "modalidade") salvarModalidade();
        else if(e.tipo === "sala") salvarSala();
        else salvarTurma();
        break;
      }
      case "cur-alternar": {
        if(est.ocupado) return;
        const t = el.dataset.t, id = el.dataset.id;
        est.msg = ""; est.erro = "";
        if(t === "curso") alternarCurso(id);
        else if(t === "modalidade") alternarModalidade(id);
        else if(t === "sala") alternarSala(id);
        break;
      }
      case "cur-excluir": {
        if(est.ocupado) return;
        const t = el.dataset.t, id = el.dataset.id;
        if(t === "curso") excluirCurso(id);
        else if(t === "modalidade") excluirModalidade(id);
        else if(t === "sala") excluirSala(id);
        break;
      }
      case "cur-confirma-cancelar": est.confirma = ""; render(); break;
      case "cur-restaurar-padrao": if(!est.ocupado) restaurarPadrao(); break;
      case "cur-ir-horarios": ctx.abrirHorarios(); break;
    }
  }

  function input(t){
    const e = est.editando;
    if(!e) return;
    const c = t.dataset.cur;
    if(c === "comp"){
      const nome = t.dataset.nome;
      e.f.comp = t.checked ? [...new Set([...e.f.comp, nome])] : e.f.comp.filter(n => n !== nome);
      const pv = document.getElementById("cur-preview");
      if(pv) pv.textContent = nomePrevia();
      return;
    }
    if(c in e.f) e.f[c] = t.value;
  }

  function aoAbrir(){
    sincronizar();
    est.msg = ""; est.erro = ""; est.confirma = ""; est.editando = null;
    ctx.garantirTurmas();
  }

  function resetar(){
    est = estadoVazio(null);
  }

  /* Lista de nomes de sala ativas da unidade, pra sugerir no formulário de turma. */
  function salasDaEscola(escolaId){
    return salasAtivasDoCatalogo(state.data.escolas?.[escolaId]?.catalogo);
  }

  return { view, click, input, aoAbrir, resetar, salasDaEscola };
}
