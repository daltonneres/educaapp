/* ==================================================================
   Educa+ — solicitacoes.js
   ------------------------------------------------------------------
   "Solicitações": avisos gerais que a EQUIPE ADMINISTRATIVA cria e que
   aparecem para as famílias (e, se a equipe quiser, para os alunos).
   Exemplos: "assinar o contrato", "preencher a ficha do aluno".

   Antes disso a aba Comunicados da família lia um campo "comunicados"
   do cadastro do aluno que ninguém preenchia — por isso não carregava
   aviso nenhum. Agora ela lê esta coleção.

   Firestore — solicitacoes/{id}
     escolaId, titulo, texto
     para:    "responsaveis" | "alunos" | "todos"
     acao:    "" | "contratos" | "ficha" | "financeiro"   (botão que leva à aba)
     prazo:   "AAAA-MM-DD" | ""
     urgente: boolean        // mostra a etiqueta "Importante"
     ativa:   boolean        // false = some da tela da família, sem apagar
     criadoPorId, criadoPorNome, criadoEm, atualizadoEm   (ISO string)

   Como se encaixa no app (igual ao suporte.js / horarios.js):
     • Este arquivo só monta HTML e fala com o Firestore; o estado geral
       e o render() ficam no script.js — tudo chega pelo `ctx`.
     • Todas as ações começam com "sol-" (data-action="sol-...").
     • Campos do formulário têm data-sol="nome"; digitar NÃO re-renderiza
       (o cursor não pula).
   ================================================================== */

/* Modelos prontos. "grupo" define a seção na tela. Para ACRESCENTAR um modelo,
   copie uma linha e mude os textos — não precisa mexer em mais nada. */
const GRUPOS = [
  { key: "cadastro",   titulo: "Cadastro e documentos" },
  { key: "financeiro", titulo: "Financeiro" },
  { key: "escola",     titulo: "Dia a dia da escola" },
];

const MODELOS = {
  contrato:    { grupo: "cadastro", rotulo: "Assinar contrato",
    titulo: "Assinatura do contrato pendente",
    texto: "Pedimos que o responsável assine o contrato de prestação de serviços do(a) aluno(a). Dá para assinar pelo gov.br em poucos minutos, pela aba Contratos.",
    acao: "contratos", para: "responsaveis", urgente: true },
  ficha:       { grupo: "cadastro", rotulo: "Preencher ficha do aluno",
    titulo: "Preencher a ficha do aluno",
    texto: "Precisamos que a ficha de saúde e emergência do aluno esteja completa. Abra a aba Ficha e confira ou preencha os dados.",
    acao: "ficha", para: "responsaveis", urgente: false },
  dados:       { grupo: "cadastro", rotulo: "Corrigir dados cadastrais",
    titulo: "Conferir e corrigir os dados cadastrais",
    texto: "Por favor, confira os dados do aluno e do responsável (nome, telefone, e-mail e endereço). Se algo estiver errado ou desatualizado, avise a secretaria pelo WhatsApp, na aba Suporte, para corrigirmos.",
    acao: "", para: "responsaveis", urgente: false },
  contato:     { grupo: "cadastro", rotulo: "Atualizar telefone/WhatsApp",
    titulo: "Atualizar telefone e WhatsApp",
    texto: "Mudou de número? Envie o telefone e o WhatsApp atuais para a secretaria. Assim as mensagens da escola e o contato de emergência chegam certinho.",
    acao: "ficha", para: "responsaveis", urgente: false },
  documentos:  { grupo: "cadastro", rotulo: "Entregar documentos",
    titulo: "Entrega de documentos do aluno",
    texto: "Pedimos a entrega dos documentos do aluno (RG ou certidão de nascimento e comprovante de residência). Pode levar à secretaria ou enviar uma foto legível pelo WhatsApp.",
    acao: "", para: "responsaveis", urgente: false },
  autorizacao: { grupo: "cadastro", rotulo: "Autorização assinada",
    titulo: "Autorização pendente",
    texto: "Precisamos da autorização assinada pelo responsável (uso de imagem, saída ou passeio). Retire o termo na secretaria ou peça o envio pelo WhatsApp.",
    acao: "", para: "responsaveis", urgente: false },

  boleto:      { grupo: "financeiro", rotulo: "Cobrança do mês disponível",
    titulo: "Cobrança do mês disponível",
    texto: "A cobrança deste mês já está na aba Financeiro, com boleto e Pix copia e cola. Qualquer dúvida sobre valores, fale com a secretaria.",
    acao: "financeiro", para: "responsaveis", urgente: false },
  atraso:      { grupo: "financeiro", rotulo: "Mensalidade em aberto",
    titulo: "Mensalidade em aberto",
    texto: "Identificamos uma mensalidade em aberto. Confira na aba Financeiro. Se já pagou, envie o comprovante para a secretaria; se precisar combinar a regularização, é só chamar.",
    acao: "financeiro", para: "responsaveis", urgente: true },
  comprovante: { grupo: "financeiro", rotulo: "Enviar comprovante",
    titulo: "Enviar o comprovante de pagamento",
    texto: "Depois de pagar, envie o comprovante pelo WhatsApp da secretaria para darmos baixa mais rápido.",
    acao: "financeiro", para: "responsaveis", urgente: false },

  avaliacao:   { grupo: "escola", rotulo: "Responder avaliação",
    titulo: "Responda a avaliação do Educa+",
    texto: "Sua opinião ajuda a melhorar a escola. A avaliação leva poucos minutos e está na aba Avaliações.",
    acao: "aval", para: "todos", urgente: false },
  reuniao:     { grupo: "escola", rotulo: "Reunião de pais",
    titulo: "Reunião de pais e responsáveis",
    texto: "Teremos reunião com as famílias. Confira a data no Calendário e, se não puder comparecer, avise a secretaria.",
    acao: "calendario", para: "responsaveis", urgente: false },
  recesso:     { grupo: "escola", rotulo: "Recesso / sem aula",
    titulo: "Atenção: dia sem aula",
    texto: "Haverá dia sem aula. Veja a data no Calendário. As aulas voltam normalmente no dia seguinte, salvo aviso da escola.",
    acao: "calendario", para: "todos", urgente: false },
  material:    { grupo: "escola", rotulo: "Material / uniforme",
    titulo: "Material e uniforme",
    texto: "Lembramos que o aluno precisa estar com o material e o uniforme da escola. Em caso de dúvida, fale com a secretaria.",
    acao: "", para: "todos", urgente: false },
};

const ACOES = {
  "":          { rotulo: "Sem botão",             botao: "" },
  contratos:   { rotulo: "Levar para Contratos",  botao: "Ir para Contratos" },
  ficha:       { rotulo: "Levar para a Ficha",    botao: "Abrir a ficha" },
  financeiro:  { rotulo: "Levar para Financeiro", botao: "Ver Financeiro" },
  aval:        { rotulo: "Levar para Avaliações", botao: "Responder avaliação" },
  calendario:  { rotulo: "Levar para o Calendário", botao: "Abrir o calendário" },
};

const PARA = {
  responsaveis: "Responsáveis",
  alunos: "Alunos",
  todos: "Responsáveis e alunos",
};

const TITULO_MAX = 80;
const TEXTO_MAX = 600;

function formVazio(){
  return { titulo: "", texto: "", para: "responsaveis", acao: "", prazo: "", urgente: false };
}

export function criarSolicitacoes(ctx){
  const {
    state, render, ICONS, escapeHtml, formatarDataBr, dataDeHojeISO,
    db, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where,
    abrirAbaFamilia, abaFamiliaDisponivel,
  } = ctx;

  const est = {
    inst: { escolaId: null, itens: [], carregando: false, carregado: false, erro: "" },
    fam:  { chave: "", itens: [], carregando: false, carregado: false, erro: "" },
    form: formVazio(),
    editandoId: null,        // id da solicitação que está sendo corrigida (null = nova)
    modelos: [],             // modelos salvos pela equipe da unidade
    modeloExcluirId: null,
    salvando: false,
    erroForm: "",
    msg: "",
    excluirConfirmId: null,
    ocupado: {},
  };

  /* ---------------- util ---------------- */
  function mensagemErro(err){
    const codigo = err?.code ? ` (${err.code})` : "";
    if(err?.code === "permission-denied"){
      return `O servidor não liberou as solicitações${codigo}. Avise o suporte técnico: as regras do Firestore precisam liberar a coleção "solicitacoes".`;
    }
    if(err?.code === "failed-precondition"){
      return `O Firestore pediu um índice${codigo}. Avise o suporte técnico (o link para criar aparece no console do navegador, F12).`;
    }
    if(err?.code === "unavailable"){
      return "Sem conexão com o servidor agora. Confira a internet e tente de novo.";
    }
    return `Não foi possível concluir${codigo}. Tente de novo.`;
  }

  function ordenar(itens){
    return [...itens].sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
  }

  function prazoPill(prazo){
    if(!prazo) return "";
    const vencido = prazo < dataDeHojeISO();
    return `<span class="pill ${vencido ? "pill-red" : "pill-gold"}">${vencido ? "Prazo vencido" : "Até"} ${escapeHtml(formatarDataBr(prazo))}</span>`;
  }

  /* ================================================================
     EQUIPE — aba "Solicitações"
     ================================================================ */
  async function carregarDaEscola(escolaId, forcar = false){
    if(!escolaId) return;
    const i = est.inst;
    if(i.carregando) return;
    if(!forcar && i.carregado && i.escolaId === escolaId) return;
    i.escolaId = escolaId; i.carregando = true; i.erro = "";
    render();
    try {
      const snaps = await getDocs(query(collection(db, "solicitacoes"), where("escolaId", "==", escolaId)));
      const todos = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
      i.itens = ordenar(todos.filter(x => !x.modelo));
      est.modelos = ordenar(todos.filter(x => x.modelo));
      i.carregado = true;
    } catch(err){
      console.error("Erro ao carregar solicitações:", err);
      i.erro = mensagemErro(err);
    } finally {
      i.carregando = false;
      render();
    }
  }

  async function salvar(){
    const f = est.form;
    const titulo = f.titulo.trim();
    const texto = f.texto.trim();
    est.erroForm = ""; est.msg = "";
    if(!titulo){ est.erroForm = "Dê um título para a solicitação."; render(); return; }
    if(!texto){ est.erroForm = "Escreva o que as famílias precisam fazer."; render(); return; }
    const editando = est.editandoId ? est.inst.itens.find(x => x.id === est.editandoId) : null;
    if(f.prazo && f.prazo < dataDeHojeISO() && !(editando && editando.prazo === f.prazo)){ est.erroForm = "O prazo não pode ser uma data que já passou."; render(); return; }
    const escolaId = state.escolaSelecionadaId;
    if(!escolaId){ est.erroForm = "Escolha a unidade primeiro."; render(); return; }

    est.salvando = true; render();
    try {
      const agora = new Date().toISOString();
      if(editando){
        const mudancas = {
          titulo, texto, para: f.para, acao: f.acao, prazo: f.prazo || "",
          urgente: !!f.urgente, atualizadoEm: agora,
        };
        await updateDoc(doc(db, "solicitacoes", editando.id), mudancas);
        Object.assign(editando, mudancas);
        est.editandoId = null;
        est.form = formVazio();
        est.msg = "Solicitação corrigida. A mudança já aparece para as famílias.";
        return;
      }
      const dados = {
        escolaId, titulo, texto,
        para: f.para, acao: f.acao, prazo: f.prazo || "",
        urgente: !!f.urgente, ativa: true,
        criadoPorId: state.authUser?.uid || "",
        criadoPorNome: (state.perfil?.nome || "Equipe").trim() || "Equipe",
        criadoEm: agora, atualizadoEm: agora,
      };
      const ref = await addDoc(collection(db, "solicitacoes"), dados);
      est.inst.itens = ordenar([{ id: ref.id, ...dados }, ...est.inst.itens]);
      est.form = formVazio();
      est.msg = "Solicitação publicada. As famílias já veem na aba Comunicados.";
    } catch(err){
      console.error("Erro ao salvar solicitação:", err);
      est.erroForm = mensagemErro(err);
    } finally {
      est.salvando = false;
      render();
    }
  }

  function iniciarEdicao(id){
    const item = est.inst.itens.find(x => x.id === id);
    if(!item) return;
    est.editandoId = id;
    est.form = {
      titulo: item.titulo || "", texto: item.texto || "",
      para: item.para || "responsaveis", acao: item.acao || "",
      prazo: item.prazo || "", urgente: !!item.urgente,
    };
    est.erroForm = ""; est.msg = ""; est.excluirConfirmId = null;
    render();
    const campo = document.getElementById("sol-f-titulo");
    if(campo) campo.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelarEdicao(){
    est.editandoId = null; est.form = formVazio();
    est.erroForm = ""; est.msg = "";
    render();
  }

  async function salvarComoModelo(){
    const f = est.form;
    const titulo = f.titulo.trim(), texto = f.texto.trim();
    est.erroForm = ""; est.msg = "";
    if(!titulo || !texto){ est.erroForm = "Preencha título e texto antes de guardar como modelo."; render(); return; }
    const escolaId = state.escolaSelecionadaId;
    if(!escolaId){ est.erroForm = "Escolha a unidade primeiro."; render(); return; }
    est.salvando = true; render();
    try {
      const agora = new Date().toISOString();
      // Modelos moram na mesma coleção, mas com ativa:false e modelo:true — assim
      // a consulta da família (ativa == true) nunca os enxerga.
      const dados = {
        escolaId, titulo, texto, para: f.para, acao: f.acao, prazo: "",
        urgente: !!f.urgente, ativa: false, modelo: true,
        criadoPorId: state.authUser?.uid || "",
        criadoPorNome: (state.perfil?.nome || "Equipe").trim() || "Equipe",
        criadoEm: agora, atualizadoEm: agora,
      };
      const ref = await addDoc(collection(db, "solicitacoes"), dados);
      est.modelos = ordenar([{ id: ref.id, ...dados }, ...est.modelos]);
      est.msg = "Modelo guardado. Ele aparece em \"Meus modelos\" para toda a equipe da unidade.";
    } catch(err){
      console.error("Erro ao guardar modelo:", err);
      est.erroForm = mensagemErro(err);
    } finally {
      est.salvando = false;
      render();
    }
  }

  async function excluirModelo(id){
    if(est.modeloExcluirId !== id){ est.modeloExcluirId = id; render(); return; }
    if(est.ocupado[id]) return;
    est.ocupado[id] = true; render();
    try {
      await deleteDoc(doc(db, "solicitacoes", id));
      est.modelos = est.modelos.filter(x => x.id !== id);
      est.modeloExcluirId = null;
    } catch(err){
      console.error("Erro ao excluir modelo:", err);
      est.erroForm = mensagemErro(err);
    } finally {
      delete est.ocupado[id];
      render();
    }
  }

  function aplicarModelo(m){
    est.editandoId = null;
    est.form = {
      ...formVazio(),
      titulo: m.titulo || "", texto: m.texto || "",
      para: m.para || "responsaveis", acao: m.acao || "",
      urgente: !!m.urgente, prazo: est.form.prazo,
    };
    est.erroForm = ""; est.msg = "";
    render();
  }

  async function alternar(id){
    const item = est.inst.itens.find(x => x.id === id);
    if(!item || est.ocupado[id]) return;
    est.ocupado[id] = true; est.msg = ""; est.erroForm = ""; render();
    try {
      const ativa = item.ativa === false;   // estava desativada → ativa
      const agora = new Date().toISOString();
      await updateDoc(doc(db, "solicitacoes", id), { ativa, atualizadoEm: agora });
      item.ativa = ativa; item.atualizadoEm = agora;
    } catch(err){
      console.error("Erro ao atualizar solicitação:", err);
      est.erroForm = mensagemErro(err);
    } finally {
      delete est.ocupado[id];
      render();
    }
  }

  async function excluir(id){
    if(est.excluirConfirmId !== id){
      est.excluirConfirmId = id; render();
      return;
    }
    if(est.ocupado[id]) return;
    est.ocupado[id] = true; est.erroForm = ""; est.msg = ""; render();
    try {
      await deleteDoc(doc(db, "solicitacoes", id));
      est.inst.itens = est.inst.itens.filter(x => x.id !== id);
      est.excluirConfirmId = null;
    } catch(err){
      console.error("Erro ao excluir solicitação:", err);
      est.erroForm = mensagemErro(err);
    } finally {
      delete est.ocupado[id];
      render();
    }
  }

  function campoSelect(campo, rotulo, opcoes){
    const f = est.form;
    return `
      <div style="flex:1;min-width:180px;">
        <label class="teacher-label" for="sol-f-${campo}">${rotulo}</label>
        <select id="sol-f-${campo}" class="teacher-text-input" data-sol="${campo}" ${est.salvando ? "disabled" : ""}>
          ${Object.entries(opcoes).map(([v, o]) => `<option value="${escapeHtml(v)}" ${f[campo] === v ? "selected" : ""}>${escapeHtml(typeof o === "string" ? o : o.rotulo)}</option>`).join("")}
        </select>
      </div>`;
  }

  function itemEquipeHtml(s){
    const inativa = s.ativa === false;
    const ocupado = !!est.ocupado[s.id];
    const confirmando = est.excluirConfirmId === s.id;
    return `
      <div class="card" style="margin-bottom:12px;${inativa ? "opacity:.65;" : ""}">
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
          <span class="pill ${inativa ? "pill-red" : "pill-green"}">${inativa ? "Desativada" : "Ativa"}</span>
          <span class="pill pill-gold">${escapeHtml(PARA[s.para] || PARA.responsaveis)}</span>
          ${s.urgente ? `<span class="pill pill-red">Importante</span>` : ""}
          ${prazoPill(s.prazo)}
        </div>
        <div style="font-size:15px;font-weight:600;color:var(--ink);">${escapeHtml(s.titulo)}</div>
        <p style="font-size:13.5px;color:var(--slate);margin:4px 0 0;white-space:pre-wrap;">${escapeHtml(s.texto)}</p>
        <div style="font-size:12px;color:var(--slate);margin-top:8px;">
          ${s.acao && ACOES[s.acao] ? `Botão: ${escapeHtml(ACOES[s.acao].botao)} · ` : ""}Criada por ${escapeHtml(s.criadoPorNome || "Equipe")}${s.criadoEm ? ` em ${escapeHtml(formatarDataBr(String(s.criadoEm).slice(0, 10)))}` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
          <button type="button" class="attendance-btn" data-action="sol-editar" data-id="${escapeHtml(s.id)}" ${ocupado ? "disabled" : ""}>Corrigir</button>
          <button type="button" class="attendance-btn" data-action="sol-alternar" data-id="${escapeHtml(s.id)}" ${ocupado ? "disabled" : ""}>${inativa ? "Reativar" : "Desativar"}</button>
          <button type="button" class="attendance-btn" data-action="sol-excluir" data-id="${escapeHtml(s.id)}" ${ocupado ? "disabled" : ""}>
            ${ocupado ? "Aguarde…" : (confirmando ? "Confirmar exclusão" : `${ICONS.trash || ""} Excluir`)}
          </button>
          ${confirmando && !ocupado ? `<button type="button" class="attendance-btn" data-action="sol-excluir-cancelar">Cancelar</button>` : ""}
        </div>
      </div>`;
  }

  function modelosHtml(bloq){
    const grupos = GRUPOS.map(g => {
      const botoes = Object.entries(MODELOS).filter(([, m]) => m.grupo === g.key).map(([k, m]) =>
        `<button type="button" class="attendance-btn" data-action="sol-modelo" data-key="${escapeHtml(k)}" ${bloq}>${escapeHtml(m.rotulo)}</button>`).join("");
      return `
        <div style="margin-bottom:10px;">
          <div style="font-size:12px;font-weight:600;color:var(--slate);margin-bottom:6px;">${escapeHtml(g.titulo)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">${botoes}</div>
        </div>`;
    }).join("");

    const meus = est.modelos.length ? `
        <div style="margin-bottom:10px;">
          <div style="font-size:12px;font-weight:600;color:var(--slate);margin-bottom:6px;">Meus modelos</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${est.modelos.map(m => `
              <span style="display:inline-flex;gap:4px;align-items:center;">
                <button type="button" class="attendance-btn" data-action="sol-modelo-meu" data-id="${escapeHtml(m.id)}" ${bloq}>${escapeHtml(m.titulo)}</button>
                <button type="button" class="attendance-btn" data-action="sol-modelo-excluir" data-id="${escapeHtml(m.id)}" aria-label="Excluir modelo" ${bloq || (est.ocupado[m.id] ? "disabled" : "")}>${est.modeloExcluirId === m.id ? "Excluir?" : "×"}</button>
              </span>`).join("")}
          </div>
        </div>` : "";

    return `
        <details ${est.form.titulo || est.form.texto ? "" : "open"} style="margin-bottom:12px;">
          <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:10px;">Começar de um modelo</summary>
          ${grupos}${meus}
          <p style="font-size:12px;color:var(--slate);margin:0;">O modelo só preenche o formulário: você pode mudar tudo antes de publicar.</p>
        </details>`;
  }

  function view(){
    const f = est.form;
    const i = est.inst;
    const bloq = est.salvando ? "disabled" : "";

    const lista = i.carregando && !i.itens.length
      ? `<p class="section-eyebrow">Carregando…</p>`
      : (i.itens.map(itemEquipeHtml).join("")
          || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhuma solicitação criada ainda.</div>`);

    return `
      <h2 class="section-title">Solicitações</h2>
      <p class="section-eyebrow">Avisos gerais para as famílias. Aparecem no topo do app e na aba Comunicados.</p>

      <div class="card" style="margin-bottom:18px;">
        ${est.editandoId ? `<p class="section-eyebrow" style="margin:0 0 10px;color:var(--ink);"><strong>Corrigindo uma solicitação já publicada.</strong> Ao salvar, as famílias passam a ver a versão nova.</p>` : modelosHtml(bloq)}

        <label class="teacher-label" for="sol-f-titulo">Título</label>
        <input id="sol-f-titulo" class="teacher-text-input" data-sol="titulo" maxlength="${TITULO_MAX}" value="${escapeHtml(f.titulo)}" placeholder="Ex.: Assinar o contrato" ${bloq} />

        <label class="teacher-label" for="sol-f-texto" style="margin-top:10px;display:block;">O que a família precisa fazer</label>
        <textarea id="sol-f-texto" class="teacher-text-input" data-sol="texto" rows="3" maxlength="${TEXTO_MAX}" placeholder="Explique em poucas linhas, em linguagem simples." ${bloq}>${escapeHtml(f.texto)}</textarea>

        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;">
          ${campoSelect("para", "Quem vê", PARA)}
          ${campoSelect("acao", "Botão no aviso", ACOES)}
          <div style="flex:1;min-width:160px;">
            <label class="teacher-label" for="sol-f-prazo">Prazo (opcional)</label>
            <input id="sol-f-prazo" type="date" class="teacher-text-input" data-sol="prazo" value="${escapeHtml(f.prazo)}" ${bloq} />
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;color:var(--ink);">
          <input type="checkbox" data-sol="urgente" ${f.urgente ? "checked" : ""} ${bloq} />
          Marcar como importante
        </label>

        ${est.erroForm ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;margin-top:8px;">${escapeHtml(est.erroForm)}</p>` : ""}
        ${est.msg ? `<p class="teacher-success" style="margin-top:8px;">${escapeHtml(est.msg)}</p>` : ""}

        <div style="display:flex;gap:8px;margin-top:12px;">
          <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="sol-salvar" ${bloq}>${est.salvando ? "Salvando…" : (est.editandoId ? "Salvar correção" : "Publicar solicitação")}</button>
          ${est.editandoId
            ? `<button type="button" class="attendance-btn" data-action="sol-editar-cancelar" ${bloq}>Cancelar correção</button>`
            : `<button type="button" class="attendance-btn" data-action="sol-limpar" ${bloq}>Limpar</button>
               <button type="button" class="attendance-btn" data-action="sol-modelo-salvar" ${bloq} title="Guarda este texto para reutilizar depois">Guardar como modelo</button>`}
        </div>
      </div>

      <p class="section-eyebrow" style="margin-bottom:8px;">Publicadas nesta unidade</p>
      ${i.erro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;">${escapeHtml(i.erro)}</p>` : ""}
      ${lista}`;
  }

  /* ================================================================
     FAMÍLIA / ALUNO — leitura
     ================================================================ */
  async function carregarParaFamilia(escolaIds, forcar = false){
    const ids = [...new Set((escolaIds || []).filter(Boolean))].sort();
    if(!ids.length) return;
    const chave = ids.join("|");
    const fam = est.fam;
    if(fam.carregando) return;
    if(!forcar && fam.carregado && fam.chave === chave) return;
    fam.chave = chave; fam.carregando = true; fam.erro = "";
    render();
    try {
      const snaps = await Promise.all(ids.map(id =>
        getDocs(query(collection(db, "solicitacoes"), where("escolaId", "==", id), where("ativa", "==", true)))
      ));
      fam.itens = ordenar(snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() }))));
      fam.carregado = true;
    } catch(err){
      console.error("Erro ao carregar solicitações da família:", err);
      fam.erro = mensagemErro(err);
    } finally {
      fam.carregando = false;
      render();
    }
  }

  /* Só o que vale pro perfil logado ("responsavel" ou "aluno") e pra unidade dele. */
  function visiveis(perfil, escolaIds){
    const permitidas = new Set(escolaIds || []);
    return est.fam.itens.filter(s =>
      s.ativa !== false
      && (!permitidas.size || permitidas.has(s.escolaId))
      && (s.para === "todos" || (perfil === "aluno" ? s.para === "alunos" : s.para !== "alunos"))
    );
  }

  function botaoAcao(s, grande){
    const a = ACOES[s.acao];
    if(!a || !a.botao || !abaFamiliaDisponivel(s.acao)) return "";
    return `<button type="button" class="${grande ? "teacher-primary-btn" : "attendance-btn"}" style="${grande ? "margin-top:0;" : ""}" data-action="sol-ir" data-key="${escapeHtml(s.acao)}">${escapeHtml(a.botao)}</button>`;
  }

  /* Faixa no topo do app. Some na aba Comunicados (a lista completa já está lá). */
  function avisoFamilia(perfil, escolaIds, abaAtual){
    if(abaAtual === "comunicados") return "";
    const itens = visiveis(perfil, escolaIds);
    if(!itens.length) return "";
    const urgente = itens.some(s => s.urgente || (s.prazo && s.prazo < dataDeHojeISO()));
    const primeira = itens[0];
    return `
      <div class="contrato-aviso" style="margin-bottom:14px;${urgente ? "border-color:var(--red);" : ""}">
        <strong>${itens.length === 1 ? "A escola enviou 1 solicitação" : `A escola enviou ${itens.length} solicitações`}</strong>
        ${itens.length === 1 ? ` — ${escapeHtml(primeira.titulo)}.` : ` — a mais recente: ${escapeHtml(primeira.titulo)}.`}
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" class="teacher-primary-btn" style="margin-top:0;" data-action="sol-ir" data-key="comunicados">Ver solicitações</button>
        </div>
      </div>`;
  }

  /* Bloco no topo da aba Comunicados. */
  function listaFamilia(perfil, escolaIds){
    const fam = est.fam;
    if(fam.carregando && !fam.itens.length) return `<p class="section-eyebrow">Carregando solicitações…</p>`;
    const erro = fam.erro ? `<p class="teacher-error" style="color:var(--red);font-size:12.5px;">${escapeHtml(fam.erro)}</p>` : "";
    const itens = visiveis(perfil, escolaIds);
    if(!itens.length) return erro;
    return `
      <p class="section-eyebrow" style="margin:0 0 8px;">Solicitações da escola</p>
      ${erro}
      ${itens.map(s => `
        <div class="card" style="margin-bottom:12px;border-left:4px solid ${s.urgente ? "var(--red)" : "var(--gold, #C9A24A)"};">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
            <span class="pill pill-gold">Solicitação</span>
            ${s.urgente ? `<span class="pill pill-red">Importante</span>` : ""}
            ${prazoPill(s.prazo)}
          </div>
          <div style="font-size:15px;font-weight:600;color:var(--ink);">${escapeHtml(s.titulo)}</div>
          <p style="font-size:13.5px;color:var(--slate);margin:4px 0 0;white-space:pre-wrap;">${escapeHtml(s.texto)}</p>
          ${botaoAcao(s, false) ? `<div style="margin-top:10px;">${botaoAcao(s, false)}</div>` : ""}
        </div>`).join("")}
      <p class="section-eyebrow" style="margin:18px 0 8px;">Outros comunicados</p>`;
  }

  /* ================================================================
     Entradas do script.js
     ================================================================ */
  function click(el){
    switch(el.dataset.action){
      case "sol-modelo": {
        const m = MODELOS[el.dataset.key];
        if(m) aplicarModelo(m);
        break;
      }
      case "sol-modelo-meu": {
        const m = est.modelos.find(x => x.id === el.dataset.id);
        if(m) aplicarModelo(m);
        break;
      }
      case "sol-modelo-salvar": salvarComoModelo(); break;
      case "sol-modelo-excluir": excluirModelo(el.dataset.id); break;
      case "sol-editar": iniciarEdicao(el.dataset.id); break;
      case "sol-editar-cancelar": cancelarEdicao(); break;
      case "sol-salvar":  salvar(); break;
      case "sol-limpar":  est.form = formVazio(); est.editandoId = null; est.erroForm = ""; est.msg = ""; render(); break;
      case "sol-alternar": alternar(el.dataset.id); break;
      case "sol-excluir":  excluir(el.dataset.id); break;
      case "sol-excluir-cancelar": est.excluirConfirmId = null; render(); break;
      case "sol-ir": abrirAbaFamilia(el.dataset.key); break;
    }
  }

  function input(t){
    const campo = t.dataset.sol;
    if(!(campo in est.form)) return;
    est.form[campo] = t.type === "checkbox" ? t.checked : t.value;
  }

  function aoAbrir(){
    est.msg = ""; est.erroForm = ""; est.excluirConfirmId = null;
    carregarDaEscola(state.escolaSelecionadaId);
  }

  /* Ao sair da conta ou trocar de unidade, esquece tudo. */
  function resetar(){
    est.inst = { escolaId: null, itens: [], carregando: false, carregado: false, erro: "" };
    est.fam = { chave: "", itens: [], carregando: false, carregado: false, erro: "" };
    est.form = formVazio(); est.editandoId = null;
    est.modelos = []; est.modeloExcluirId = null;
    est.salvando = false; est.erroForm = ""; est.msg = "";
    est.excluirConfirmId = null; est.ocupado = {};
  }

  return { view, click, input, aoAbrir, resetar, carregarParaFamilia, avisoFamilia, listaFamilia };
}
