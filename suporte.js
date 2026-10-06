/* ==================================================================
   Educa+ — suporte.js
   ------------------------------------------------------------------
   Aba "Suporte" de ALUNOS, RESPONSÁVEIS e PROFESSORES.

   Tem duas partes:
     1) Manuais — a pasta "manuais/" do app, em grupos que abrem e
        fecham, com busca. Cada perfil vê só o que é pra ele.
     2) Falar com a escola — a pessoa escolhe o assunto, escreve o
        que está acontecendo e o app abre o WhatsApp da secretaria da
        unidade já com a mensagem pronta (nome, turma, aluno etc.).
        A pessoa só confere e aperta enviar no WhatsApp.

   Como se encaixa no app (igual ao horarios.js):
     • Este arquivo só monta HTML. O estado geral e o render() ficam
       no script.js — tudo chega pelo `ctx` de criarSuporte(ctx).
     • Todas as ações começam com "sup-" (data-action="sup-...").
     • Campos têm data-sup="nome-do-campo"; digitar NÃO re-renderiza
       (o cursor não pula).

   COMO ADICIONAR UM MANUAL NOVO: acrescente uma linha em MANUAIS_SUPORTE
   abaixo. "para" diz quem enxerga: "aluno", "responsavel", "professor".
   ================================================================== */

/* ---- Categorias (a ordem aqui é a ordem na tela) ---- */
const CATEGORIAS = [
  { key: "comecar",    titulo: "Primeiros passos",       descricao: "Entrar no app e conhecer cada aba." },
  { key: "dia",        titulo: "No dia a dia",           descricao: "Calendário, presença, notas e comunicados." },
  { key: "financeiro", titulo: "Financeiro e contratos", descricao: "Boletos, Pix e assinatura de contrato." },
  { key: "aula",       titulo: "Aulas e turmas",         descricao: "Chamada, conteúdos, notas e horários." },
  { key: "problemas",  titulo: "Quando algo dá errado",  descricao: "Erros comuns e como resolver." },
];

/* ---- Manuais ----
   url = caminho do arquivo dentro da pasta "manuais/" (pode ter #âncora).
   Itens com url vazia aparecem como "Em breve". */
const MANUAIS_SUPORTE = [
  // ---- Aluno e responsável
  { para: ["aluno", "responsavel"], categoria: "comecar", titulo: "Guia do aluno e do responsável",
    descricao: "Calendário, notas, avaliações, presença, certificados e comunicados: o que você vê em cada aba.",
    url: "manuais/guia-familia.html" },
  { para: ["aluno", "responsavel"], categoria: "problemas", titulo: "Não consigo entrar no app",
    descricao: "Mensagens de erro do login, senha esquecida e quando falar com a secretaria.",
    url: "manuais/ajuda-familia.html#entrar" },
  { para: ["aluno", "responsavel"], categoria: "dia", titulo: "Onde vejo avisos, provas e mudanças de aula",
    descricao: "O Calendário, as cores de presença e a aba Comunicados.",
    url: "manuais/ajuda-familia.html#avisos" },
  { para: ["aluno", "responsavel"], categoria: "dia", titulo: "Certificados",
    descricao: "Quando aparecem e como pedir à secretaria pelo WhatsApp.",
    url: "manuais/ajuda-familia.html#certificado" },
  { para: ["responsavel"], categoria: "financeiro", titulo: "Boletos, Pix e vencimentos",
    descricao: "Onde ver a cobrança de cada mês, copiar o Pix e o código de barras, baixar o boleto.",
    url: "manuais/ajuda-familia.html#financeiro" },
  { para: ["responsavel"], categoria: "financeiro", titulo: "Ver e baixar o contrato",
    descricao: "A aba Contratos: situação, Ver contrato e Baixar PDF.",
    url: "manuais/ajuda-familia.html#contratos" },

  // ---- Professor
  { para: ["professor"], categoria: "comecar", titulo: "Guia do professor: chamada, conteúdos e notas",
    descricao: "Aulas de hoje, Conteúdos do semestre e Notas e atividades — e como isso vira o boletim.",
    url: "manuais/guia-professor.html" },
  { para: ["professor"], categoria: "comecar", titulo: "Minha ficha",
    descricao: "Contato de emergência, alergias e saúde: o que preencher e quem enxerga.",
    url: "manuais/ficha.html" },
  { para: ["professor"], categoria: "aula", titulo: "Aba Horários: remarcar ou cancelar uma aula",
    descricao: "Só aquele dia, cancelamento ou horário fixo, com aviso às famílias.",
    url: "manuais/horarios.html#alterar" },
  { para: ["professor"], categoria: "aula", titulo: "Lembretes para a turma",
    descricao: "Recado que aparece no calendário dos alunos e responsáveis.",
    url: "manuais/horarios.html#lembrete" },
  { para: ["professor"], categoria: "aula", titulo: "Anotações pessoais",
    descricao: "Anotações que só você vê, soltas ou ligadas a uma turma.",
    url: "manuais/horarios.html#anotacoes" },
  { para: ["professor"], categoria: "aula", titulo: "Criar ou editar uma turma",
    descricao: "Dias, horários, sala, alunos e turmas sem horário definido.",
    url: "manuais/horarios.html#turma" },
  { para: ["professor"], categoria: "aula", titulo: "Como avisar as famílias: qual ferramenta usar",
    descricao: "Alterar aula, Lembrete, Calendário ou Anotação: quando usar cada um.",
    url: "manuais/avisar-familias.html" },
  { para: ["professor"], categoria: "dia", titulo: "Notas e atividades até o boletim",
    descricao: "Como as notas lançadas viram a média de cada etapa e o boletim.",
    url: "manuais/pedagogico.html#notas" },
  { para: ["professor"], categoria: "dia", titulo: "Boletim de Inglês (Report Card)",
    descricao: "Os seis critérios, extra grades, practice tests e o feedback.",
    url: "manuais/pedagogico.html#boletim" },
  { para: ["professor"], categoria: "dia", titulo: "Certificados",
    descricao: "Anexar o link do certificado do aluno ao fim do módulo.",
    url: "manuais/pedagogico.html#certificados" },
  { para: ["professor"], categoria: "dia", titulo: "Cores e alertas da presença",
    descricao: "Verde, amarelo e vermelho e o alerta de observação do professor.",
    url: "manuais/automatico.html#cores" },
  { para: ["professor"], categoria: "problemas", titulo: "\"Não foi possível salvar\" (permission-denied)",
    descricao: "O que a mensagem significa, o que conferir e quando acionar o suporte.",
    url: "manuais/ajuda.html#permissao" },
];

/* ---- Assuntos do formulário ---- */
const ASSUNTOS = [
  { key: "acesso",     titulo: "Acesso / senha",  desc: "Não consigo entrar" },
  { key: "erro",       titulo: "Erro no app",     desc: "Algo não funciona" },
  { key: "financeiro", titulo: "Financeiro",      desc: "Boleto, Pix, cobrança", so: ["responsavel"] },
  { key: "dados",      titulo: "Dados errados",   desc: "Nome, turma, contato" },
  { key: "duvida",     titulo: "Dúvida de uso",   desc: "Como faço para…?" },
  { key: "outro",      titulo: "Outro assunto",   desc: "Falar com a secretaria" },
];

const PAPEL_ROTULO = { aluno: "Aluno(a)", responsavel: "Responsável", professor: "Professor(a)" };

export function criarSuporte(ctx){
  const { state, render, ICONS, SECRETARIA_WHATSAPP, whatsappLinkComTexto } = ctx;
  const esc = ctx.escapeHtml;

  const S = { assunto: "", unidade: "", mensagem: "", erro: "", enviado: false };

  /* ---------------- quem está usando ---------------- */
  function eu(){
    if(state.screen === "professor"){
      return {
        papel: "professor",
        nome: state.data.professorNome || state.perfil?.nome || "",
        turma: "", aluno: "",
        escolaDica: "",
      };
    }
    if(state.screen === "familia"){
      const alunos = state.data.familiaAlunos || [];
      const al = alunos.find(a => a.id === state.familiaStudentId) || alunos[0] || {};
      return {
        papel: "responsavel",
        nome: state.perfil?.nome || "",
        turma: al.turma || "",
        aluno: alunos.length > 1 ? alunos.map(a => a.nome).join(" / ") : (al.nome || ""),
        escolaDica: al.escolaId || "",
      };
    }
    const al = state.data.aluno || {};
    return { papel: "aluno", nome: al.nome || state.perfil?.nome || "", turma: al.turma || "", aluno: "", escolaDica: al.escolaId || "" };
  }

  /* Tenta adivinhar a unidade pelo cadastro; senão a pessoa escolhe. */
  function unidadePadrao(pessoa){
    const dica = String(pessoa.escolaDica || "").toLowerCase();
    const achada = SECRETARIA_WHATSAPP.find(e => dica && (dica === e.id || dica.includes(e.id)));
    if(achada) return achada.id;
    if(state.perfil?.role === "professor"){
      const ids = Array.isArray(state.perfil.escolasIds) ? state.perfil.escolasIds : [];
      const p = SECRETARIA_WHATSAPP.find(e => ids.some(i => String(i).toLowerCase().includes(e.id)));
      if(p) return p.id;
    }
    return SECRETARIA_WHATSAPP.length === 1 ? SECRETARIA_WHATSAPP[0].id : "";
  }

  function assuntosDoPapel(papel){
    return ASSUNTOS.filter(a => !a.so || a.so.includes(papel));
  }

  /* ---------------- manuais ---------------- */
  function manuaisDoPapel(papel){
    return MANUAIS_SUPORTE.filter(m => m.para.includes(papel));
  }

  function manuaisHtml(papel){
    const lista = manuaisDoPapel(papel);
    if(!lista.length){
      return `<div class="card flush"><div style="padding:20px;font-size:14px;color:var(--slate);">Os manuais ainda não foram publicados. Use o formulário abaixo para falar com a escola.</div></div>`;
    }
    const grupos = CATEGORIAS.map(cat => {
      const itens = lista.filter(m => m.categoria === cat.key);
      if(!itens.length) return "";
      const cards = itens.map(m => {
        const pronto = !!(m.url && m.url !== "#");
        const busca = esc(`${m.titulo} ${m.descricao}`.toLowerCase());
        const miolo = `
          <span class="manual-item-icon">${ICONS.fileText || ICONS.clipboard}</span>
          <span class="manual-item-text">
            <span class="manual-item-title">${esc(m.titulo)}</span>
            <span class="manual-item-desc">${esc(m.descricao)}</span>
            ${pronto ? "" : `<span class="manual-item-meta"><span class="manual-tag manual-tag-breve">Em breve</span></span>`}
          </span>`;
        return pronto
          ? `<a class="manual-item sup-manual" data-busca="${busca}" href="${esc(m.url)}" target="_blank" rel="noopener">${miolo}${ICONS.chevronRight}</a>`
          : `<div class="manual-item manual-item-breve sup-manual" data-busca="${busca}">${miolo}</div>`;
      }).join("");
      return `
        <details class="sup-grupo" ${lista.length <= 4 ? "open" : ""}>
          <summary class="manual-grupo-head">
            <span class="manual-grupo-icon">${ICONS.lifebuoy || ICONS.clipboard}</span>
            <div><h3>${esc(cat.titulo)} <span class="manual-grupo-count">${itens.length}</span></h3><p>${esc(cat.descricao)}</p></div>
          </summary>
          <div class="card flush manual-list">${cards}</div>
        </details>`;
    }).join("");

    return `
      <input type="search" class="teacher-text-input sup-busca" data-sup="busca" placeholder="Buscar nos manuais… (ex.: senha, boleto, chamada)" aria-label="Buscar nos manuais" />
      <div id="sup-manuais">${grupos}</div>
      <p id="sup-busca-vazio" class="section-eyebrow" style="display:none;margin-top:10px;">Nenhum manual encontrado. Tente outra palavra ou fale com a escola logo abaixo.</p>`;
  }

  /* ---------------- formulário ---------------- */
  function formularioHtml(pessoa){
    if(!S.unidade) S.unidade = unidadePadrao(pessoa);
    const assuntos = assuntosDoPapel(pessoa.papel);
    if(S.assunto && !assuntos.some(a => a.key === S.assunto)) S.assunto = "";

    const chipsAssunto = assuntos.map(a => `
      <button type="button" class="suporte-tipo ${S.assunto === a.key ? "ativo" : ""}" data-action="sup-assunto" data-key="${a.key}" aria-pressed="${S.assunto === a.key}">
        <strong>${esc(a.titulo)}</strong><span>${esc(a.desc)}</span>
      </button>`).join("");

    const chipsUnidade = SECRETARIA_WHATSAPP.map(e => `
      <button type="button" class="suporte-unidade ${S.unidade === e.id ? "ativo" : ""}" data-action="sup-unidade" data-id="${e.id}" aria-pressed="${S.unidade === e.id}">${esc(e.nome)}</button>`).join("");

    const un = SECRETARIA_WHATSAPP.find(e => e.id === S.unidade);
    const resumo = [
      `<strong>${esc(PAPEL_ROTULO[pessoa.papel])}:</strong> ${esc(pessoa.nome || "—")}`,
      pessoa.aluno ? `<strong>Aluno(a):</strong> ${esc(pessoa.aluno)}` : "",
      pessoa.turma ? `<strong>Turma:</strong> ${esc(pessoa.turma)}` : "",
    ].filter(Boolean).join(" · ");

    return `
      <div class="teacher-panel suporte-modal" style="max-width:640px;">
        <h3>${ICONS.lifebuoy || ""} Falar com a escola</h3>
        <p class="section-eyebrow">Preencha abaixo. Vamos abrir o WhatsApp da secretaria com a mensagem pronta — você só confere e envia.</p>

        <label class="teacher-label">Qual é o assunto?</label>
        <div class="suporte-tipos">${chipsAssunto}</div>

        <label class="teacher-label">Para qual unidade?</label>
        <div class="suporte-unidades">${chipsUnidade}</div>

        <label class="teacher-label" for="sup-mensagem">O que está acontecendo?</label>
        <textarea id="sup-mensagem" class="teacher-text-input suporte-textarea" data-sup="mensagem" maxlength="800"
          placeholder="Explique com suas palavras. Se for um erro, diga em qual aba aconteceu e o que a tela mostrou.">${esc(S.mensagem)}</textarea>

        <p class="suporte-destino">${resumo}<br>Será enviado para: <strong>${esc(un ? un.nome : "escolha a unidade acima")}</strong></p>

        ${S.erro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin-top:8px;">${esc(S.erro)}</p>` : ""}
        ${S.enviado ? `<p class="teacher-success" style="margin-top:8px;">WhatsApp aberto! Se a conversa não apareceu, libere pop-ups para este site e tente de novo.</p>` : ""}

        <button type="button" class="teacher-primary-btn" data-action="sup-enviar">${ICONS.send || ""} Enviar pelo WhatsApp</button>
      </div>`;
  }

  /* ---------------- tela ---------------- */
  function view(){
    const pessoa = eu();
    return `
      <h2 class="section-title">Suporte</h2>
      <p class="section-eyebrow">Consulte os manuais ou fale direto com a secretaria da escola.</p>
      <h3 class="section-title" style="font-size:16px;margin-top:18px;">Manuais</h3>
      ${manuaisHtml(pessoa.papel)}
      <div style="margin-top:26px;">${formularioHtml(pessoa)}</div>`;
  }

  /* ---------------- mensagem do WhatsApp ---------------- */
  function montarTexto(pessoa){
    const assunto = ASSUNTOS.find(a => a.key === S.assunto);
    const linhas = [
      "Olá! Preciso de ajuda no app Educa+.",
      "",
      `*Assunto:* ${assunto ? assunto.titulo : "—"}`,
      `*${PAPEL_ROTULO[pessoa.papel]}:* ${pessoa.nome || "—"}`,
    ];
    if(pessoa.aluno) linhas.push(`*Aluno(a):* ${pessoa.aluno}`);
    if(pessoa.turma) linhas.push(`*Turma:* ${pessoa.turma}`);
    linhas.push("", S.mensagem.trim());
    return linhas.join("\n");
  }

  /* ---------------- eventos ---------------- */
  function input(t){
    const campo = t.dataset.sup;
    if(campo === "mensagem"){ S.mensagem = t.value; S.erro = ""; return; }
    if(campo === "busca") filtrar(t.value);
  }

  /* Filtra os manuais direto no DOM (sem re-render, o campo não perde o foco). */
  function filtrar(valor){
    const termo = String(valor || "").trim().toLowerCase();
    const raiz = document.getElementById("sup-manuais");
    if(!raiz) return;
    let total = 0;
    raiz.querySelectorAll(".sup-manual").forEach(el => {
      const bate = !termo || (el.dataset.busca || "").includes(termo);
      el.style.display = bate ? "" : "none";
      if(bate) total++;
    });
    raiz.querySelectorAll(".sup-grupo").forEach(g => {
      const visiveis = g.querySelectorAll('.sup-manual:not([style*="display: none"])').length;
      g.style.display = visiveis ? "" : "none";
      if(termo && visiveis) g.open = true;
    });
    const vazio = document.getElementById("sup-busca-vazio");
    if(vazio) vazio.style.display = total === 0 ? "" : "none";
  }

  function click(el){
    const acao = el.dataset.action;
    if(acao === "sup-assunto"){
      S.assunto = el.dataset.key; S.erro = ""; S.enviado = false; render(); return;
    }
    if(acao === "sup-unidade"){
      S.unidade = el.dataset.id; S.erro = ""; S.enviado = false; render(); return;
    }
    if(acao === "sup-enviar"){
      const pessoa = eu();
      if(!S.assunto){ S.erro = "Escolha o assunto."; render(); return; }
      if(!S.unidade){ S.erro = "Escolha para qual unidade enviar."; render(); return; }
      if(S.mensagem.trim().length < 5){ S.erro = "Conte um pouco do que está acontecendo."; render(); return; }
      const un = SECRETARIA_WHATSAPP.find(e => e.id === S.unidade);
      if(!un) return;
      window.open(whatsappLinkComTexto(un.numero, montarTexto(pessoa)), "_blank", "noopener");
      S.erro = ""; S.enviado = true; S.mensagem = "";
      render();
    }
  }

  /* Chamado ao sair da aba / trocar de conta. */
  function resetar(){ S.assunto = ""; S.unidade = ""; S.mensagem = ""; S.erro = ""; S.enviado = false; }

  return { view, click, input, resetar };
}
