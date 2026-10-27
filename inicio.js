/* ==================================================================
   Educa+ — inicio.js
   ------------------------------------------------------------------
   Aba "Início": a tela que abre logo depois do login para a SECRETARIA
   (instituição) e para o PROFESSOR.

   O que ela mostra:
     1) Chamadas de hoje — quantas já foram feitas, quantas estão
        pendentes (a aula já terminou e não tem chamada) e quantas
        aulas estão acontecendo agora sem chamada.
     2) Próxima aula — contagem regressiva ("em 1h 20min"). Se não há
        mais aula hoje, mostra o próximo dia com aula.
     3) Pendências — lista das chamadas que precisam de atenção. O
        professor toca e já cai na chamada; a secretaria vê quem é o
        professor responsável.
     4) Aulas de hoje — linha do tempo do dia, com o status de cada uma.
     5) Acessados recentemente + Mais usados — o sistema registra
        quais abas a pessoa abre e monta os atalhos sozinho.

   Como se encaixa no app (igual horarios.js e suporte.js):
     • Este arquivo só monta HTML e guarda o histórico de uso. O estado
       geral, o render() e as consultas ao Firestore continuam no
       script.js — tudo chega pelo `ctx` de criarInicio(ctx).
     • As aulas vêm de horarios.aulasDoDia() (já considera remarcações
       e dias sem aula); as chamadas vêm do mesmo lugar que a aba
       "Aulas & Chamadas" (professor) e "Relatório do dia" (secretaria).
     • Ações próprias começam com "ini-" (data-action="ini-...").
     • O histórico de uso fica no localStorage do aparelho, separado por
       usuário (chave educa:uso:<uid>). Não grava nada no Firestore.
   ================================================================== */

const AULA_OK = ["normal", "alterada", "reposicao"];   // status de aula que realmente acontece
const TIQUE_MS = 30 * 1000;                            // o relógio da tela anda a cada 30 s
const TIQUES_PARA_ATUALIZAR = 10;                      // a cada 10 tiques (5 min) relê as chamadas
const MAX_RECENTES = 5;
const MAX_MAIS_USADOS = 4;
const DIAS_PROCURANDO_PROXIMA = 21;

/* Atalhos mostrados enquanto a pessoa ainda não tem histórico de uso. */
const ATALHOS_INICIAIS = {
  professor: ["aulas", "horarios", "turmas", "calendario"],
  instituicao: ["relatorio", "horarios", "alunos", "financeiro"],
};

export function criarInicio(ctx){
  const { state, ICONS, horarios } = ctx;
  const esc = ctx.escapeHtml;

  let navAtual = [];        // itens do menu da tela atual (rótulo + ícone de cada aba)
  let ultimaVisita = "";    // evita contar o mesmo acesso várias vezes a cada render()
  let tiques = 0;
  let cacheInst = null;     // últimas chamadas da secretaria (evita "falso pendente" durante a atualização)

  /* ---------------- quem está usando ---------------- */
  const ehProfessor = () => state.screen === "professor";
  const papel = () => (ehProfessor() ? "professor" : "instituicao");

  function estaAtivo(){
    return (state.screen === "professor" && state.professorTab === "inicio")
      || (state.screen === "instituicao" && state.instTab === "inicio");
  }

  /* ================================================================
     Histórico de uso (localStorage)
     ================================================================ */
  const chaveUso = () => `educa:uso:${state.authUser ? state.authUser.uid : "anon"}`;

  function lerUso(){
    try {
      const bruto = JSON.parse(localStorage.getItem(chaveUso()) || "{}");
      return bruto && typeof bruto === "object" ? bruto : {};
    } catch(e){ return {}; }
  }
  function gravarUso(uso){
    try { localStorage.setItem(chaveUso(), JSON.stringify(uso)); } catch(e){ /* sem espaço / modo privado: segue sem histórico */ }
  }

  /* Chamado a cada render() das telas professor/instituição. Só conta quando a
     aba MUDOU (render acontece o tempo todo e não pode inflar o contador). */
  function registrarVisita(tab){
    if(!state.authUser || !tab) return;
    if(tab === "inicio"){ ultimaVisita = ""; return; }
    const marca = `${state.authUser.uid}|${state.screen}|${tab}`;
    if(marca === ultimaVisita) return;
    ultimaVisita = marca;
    const uso = lerUso();
    const atual = uso[tab] || { n: 0, ultimo: 0 };
    uso[tab] = { n: (Number(atual.n) || 0) + 1, ultimo: Date.now() };
    gravarUso(uso);
  }

  function definirNav(itens){ navAtual = Array.isArray(itens) ? itens : []; }

  /* Só entram atalhos de abas que existem no menu e não estão bloqueadas pelo painel Dev. */
  function usoValido(){
    const uso = lerUso();
    return Object.entries(uso)
      .map(([key, v]) => ({ key, n: Number(v && v.n) || 0, ultimo: Number(v && v.ultimo) || 0 }))
      .filter(x => x.key !== "inicio" && navAtual.some(i => i.key === x.key) && !ctx.moduloBloqueado(x.key));
  }

  /* ================================================================
     Tempo
     ================================================================ */
  const agoraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  /* 75 -> "1h 15min" · 40 -> "40 min" */
  function dur(min){
    min = Math.max(0, Math.round(min));
    if(min < 1) return "menos de 1 min";
    if(min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`;
  }

  function haQuanto(ts){
    const m = Math.round((Date.now() - ts) / 60000);
    if(m < 1) return "agora há pouco";
    if(m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if(h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
  }

  function addDias(iso, n){
    const [a, m, d] = iso.split("-").map(Number);
    const dt = new Date(a, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  function dataDoISO(iso){ const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }
  const faixa = (o) => `${o.inicio}${o.fim ? "–" + o.fim : ""}`;

  /* ================================================================
     Dados do dia (aulas + chamadas)
     ================================================================ */
  function nomeProfessor(l){
    const id = l.a.turma.professorId;
    return (state.gestaoProfessores || []).find(p => p.id === id)?.nome || (l.reg && l.reg.professorNome) || "";
  }

  /* De onde vêm as chamadas de hoje em cada perfil, e se já estão prontas. */
  function fonteDeDados(hoje){
    if(ehProfessor()){
      const pronto = horarios.pronto() && state.professorChamadasHojeData === hoje;
      return {
        pronto,
        erro: horarios.erro(),
        registros: pronto ? (state.professorChamadasHoje || {}) : null,
        atualizando: horarios.carregando() || state.professorChamadasHojeCarregando,
      };
    }
    const rd = state.relDia || {};
    const escolaOk = rd.data === hoje && rd.escolaId === state.escolaSelecionadaId;
    const lido = escolaOk && !rd.carregando && !rd.erro;
    if(lido) cacheInst = { escolaId: state.escolaSelecionadaId, data: hoje, registros: rd.registros || {} };
    const cache = cacheInst && cacheInst.escolaId === state.escolaSelecionadaId && cacheInst.data === hoje ? cacheInst : null;
    // Durante a atualização o relDia vem vazio — nunca usar isso como "ninguém fez chamada".
    const registros = lido ? rd.registros : (cache ? cache.registros : null);
    const turmasOk = state.instTurmas !== null && state.instTurmasEscolaId === state.escolaSelecionadaId;
    return {
      pronto: horarios.pronto() && turmasOk && registros !== null,
      erro: (escolaOk && rd.erro) || horarios.erro() || state.instTurmasErro || "",
      registros,
      atualizando: horarios.carregando() || !!rd.carregando || !!state.instTurmasCarregando,
    };
  }

  function modelo(registros, hoje){
    const agora = agoraMin();
    const todas = horarios.aulasDoDia(hoje).filter(o => AULA_OK.includes(o.status));

    // A chamada é por turma/dia: duas aulas da mesma turma no dia viram uma linha só.
    const porTurma = new Map();
    todas.forEach(o => {
      if(!porTurma.has(o.turma.id)) porTurma.set(o.turma.id, { ...o, faixas: [faixa(o)] });
      else porTurma.get(o.turma.id).faixas.push(faixa(o));
    });

    const linhas = [...porTurma.values()].map(a => {
      const reg = registros[a.turma.id] || null;
      const st = ctx.statusChamada(a, reg, hoje);
      const ini = ctx.hhmmParaMin(a.inicio);
      const fimInformado = ctx.hhmmParaMin(a.fim);
      const fim = fimInformado !== null ? fimInformado : (ini !== null ? ini + 60 : null);
      return { a, reg, st, ini, fim };
    });

    const proximaHoje = todas
      .map(o => ({ o, ini: ctx.hhmmParaMin(o.inicio) }))
      .filter(x => x.ini !== null && x.ini > agora)[0] || null;      // já vem em ordem de horário

    return {
      agora, linhas,
      feitas: linhas.filter(l => l.st === "feita").length,
      pendentes: linhas.filter(l => l.st === "atrasada"),
      andamento: linhas.filter(l => l.st === "andamento"),
      futuras: linhas.filter(l => l.st === "aguardando"),
      proximaHoje,
    };
  }

  /* Primeiro dia com aula depois de hoje (quando hoje já acabou). */
  function proximaAulaFutura(hoje){
    for(let i = 1; i <= DIAS_PROCURANDO_PROXIMA; i++){
      const iso = addDias(hoje, i);
      const lista = horarios.aulasDoDia(iso).filter(o => AULA_OK.includes(o.status));
      if(lista.length) return { iso, dias: i, o: lista[0] };
    }
    return null;
  }

  function textoDia(dias, iso){
    if(dias === 1) return "amanhã";
    if(dias < 7) return dataDoISO(iso).toLocaleDateString("pt-BR", { weekday: "long" });
    return dataDoISO(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  /* "começa em 40 min" / "termina em 15 min" / "terminou há 1h" */
  function textoTempo(l, agora){
    if(l.st === "feita" || l.ini === null) return "";
    if(agora < l.ini) return `começa em ${dur(l.ini - agora)}`;
    if(l.fim !== null && agora < l.fim) return `termina em ${dur(l.fim - agora)}`;
    if(l.fim !== null) return `terminou há ${dur(agora - l.fim)}`;
    return "";
  }

  /* ================================================================
     Blocos da tela
     ================================================================ */
  function cartaoChamadas(m){
    const total = m.linhas.length;
    const nomes = (lista) => {
      const n = lista.map(l => l.a.turma.nome);
      return n.length > 3 ? `${n.slice(0, 3).join(", ")} e mais ${n.length - 3}` : n.join(", ");
    };
    let tom = "navy", grande, sub;
    if(total === 0){
      grande = "Sem aulas hoje";
      sub = ehProfessor() ? "Você não tem aula prevista para hoje." : "Nenhuma aula prevista para hoje.";
    } else if(m.pendentes.length){
      tom = "red";
      grande = `${m.pendentes.length} chamada${m.pendentes.length === 1 ? "" : "s"} pendente${m.pendentes.length === 1 ? "" : "s"}`;
      sub = `A aula já terminou e não há chamada: ${nomes(m.pendentes)}`;
    } else if(m.andamento.length){
      tom = "gold";
      grande = m.andamento.length === 1 ? "Aula em andamento" : `${m.andamento.length} aulas em andamento`;
      sub = `Chamada ainda não feita: ${nomes(m.andamento)}`;
    } else if(m.feitas === total){
      tom = "green";
      grande = "Todas as chamadas feitas";
      sub = "Tudo em dia por hoje.";
    } else {
      tom = "green";
      grande = "Nenhuma chamada pendente";
      sub = `${m.futuras.length} aula${m.futuras.length === 1 ? "" : "s"} ainda por vir hoje.`;
    }
    const pct = total ? Math.round(m.feitas / total * 100) : 0;
    const extra = m.pendentes.length && m.andamento.length ? ` · ${m.andamento.length} em andamento` : "";
    return `
      <section class="ini-card ini-tone-${tom}">
        <div class="ini-card-rot">${ICONS.clipboard} Chamadas de hoje</div>
        <div class="ini-card-big">${esc(grande)}</div>
        <div class="ini-card-sub">${esc(sub)}</div>
        ${total ? `
          <div class="ini-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${m.feitas}"><span style="width:${pct}%"></span></div>
          <div class="ini-card-foot">${m.feitas} de ${total} chamada${total === 1 ? "" : "s"} feita${m.feitas === 1 ? "" : "s"}${esc(extra)}</div>` : ""}
      </section>`;
  }

  function cartaoProxima(m, hoje){
    const quem = (o) => ehProfessor() ? "" : (() => {
      const nome = (state.gestaoProfessores || []).find(p => p.id === o.turma.professorId)?.nome;
      return nome ? `Prof. ${nome}` : "";
    })();
    const detalhe = (o) => [o.inicio, o.turma.nome, o.sala ? `Sala ${o.sala}` : "", quem(o)].filter(Boolean).join(" · ");

    // Aula acontecendo agora (aparece junto da contagem da próxima)
    const agoraRolando = m.linhas.find(l => l.ini !== null && m.agora >= l.ini && l.fim !== null && m.agora < l.fim);
    const rolando = agoraRolando
      ? `<div class="ini-card-foot">Agora: ${esc(agoraRolando.a.turma.nome)} · termina em ${esc(dur(agoraRolando.fim - m.agora))}</div>` : "";

    if(m.proximaHoje){
      const falta = m.proximaHoje.ini - m.agora;
      return `
        <section class="ini-card ini-tone-${falta <= 15 ? "gold" : "navy"}">
          <div class="ini-card-rot">${ICONS.clock} Próxima aula</div>
          <div class="ini-card-big">em ${esc(dur(falta))}</div>
          <div class="ini-card-sub">${esc(detalhe(m.proximaHoje.o))}</div>
          ${rolando}
        </section>`;
    }

    const fut = proximaAulaFutura(hoje);
    if(fut){
      const quando = textoDia(fut.dias, fut.iso);
      return `
        <section class="ini-card ini-tone-navy">
          <div class="ini-card-rot">${ICONS.clock} Próxima aula</div>
          <div class="ini-card-big">${esc(quando.charAt(0).toUpperCase() + quando.slice(1))}, ${esc(fut.o.inicio)}</div>
          <div class="ini-card-sub">${esc([fut.o.turma.nome, fut.o.sala ? `Sala ${fut.o.sala}` : "", quem(fut.o)].filter(Boolean).join(" · "))}${fut.dias > 1 ? ` · em ${fut.dias} dias` : ""}</div>
          ${rolando}
        </section>`;
    }
    return `
      <section class="ini-card ini-tone-navy">
        <div class="ini-card-rot">${ICONS.clock} Próxima aula</div>
        <div class="ini-card-big">Nenhuma aula agendada</div>
        <div class="ini-card-sub">Não há aulas nos próximos ${DIAS_PROCURANDO_PROXIMA} dias. Confira a aba Horários.</div>
        ${rolando}
      </section>`;
  }

  /* Linha de uma aula. Para o professor é um botão que abre a chamada. */
  function linhaAula(l, m, opcoes = {}){
    const t = l.a.turma;
    const prof = nomeProfessor(l);
    const qtd = (t.alunos || []).length;
    const info = [t.disciplina, l.a.sala ? `Sala ${l.a.sala}` : "", `${qtd} aluno${qtd === 1 ? "" : "s"}`, !ehProfessor() && prof ? `Prof. ${prof}` : ""].filter(Boolean).join(" · ");
    const tempo = textoTempo(l, m.agora);
    const classe = `ini-linha ini-linha-${l.st}`;
    const miolo = `
      <div class="ini-linha-hora">${esc(l.a.inicio)}${l.a.fim ? `<small>${esc(l.a.fim)}</small>` : ""}</div>
      <div class="ini-linha-info">
        <strong>${esc(t.nome)}</strong>
        <span>${esc(info)}</span>
        ${tempo ? `<span class="ini-linha-tempo">${esc(tempo)}</span>` : ""}
        ${l.reg && l.reg.conteudoTexto ? `<span class="ini-linha-tempo">Conteúdo: ${esc(l.reg.conteudoTexto)}</span>` : ""}
      </div>
      <div class="ini-linha-status">
        ${ctx.pill(l.st, l.reg)}
        ${ehProfessor() ? `<span class="ini-linha-ir">${l.st === "feita" ? "Revisar" : "Fazer chamada"} ${ICONS.chevronRight}</span>` : ""}
      </div>`;
    return ehProfessor()
      ? `<button type="button" class="${classe}" data-action="ini-chamada" data-id="${esc(t.id)}">${miolo}</button>`
      : `<div class="${classe}${opcoes.destaque ? " destaque" : ""}">${miolo}</div>`;
  }

  function secaoPendencias(m){
    const itens = [...m.pendentes, ...m.andamento];
    if(!itens.length) return "";
    const titulo = ehProfessor() ? "Chamadas para fazer" : "Chamadas que precisam de atenção";
    return `
      <h3 class="ini-h3">${esc(titulo)}</h3>
      <div class="ini-lista">${itens.map(l => linhaAula(l, m, { destaque: true })).join("")}</div>`;
  }

  function secaoAulasDoDia(m){
    if(!m.linhas.length) return "";
    const rodape = ehProfessor() ? "" : `
      <div class="ini-rodape-lista"><button type="button" class="attendance-btn" data-action="set-inst-tab" data-key="relatorio">Abrir o relatório do dia</button></div>`;
    return `
      <h3 class="ini-h3">Aulas de hoje</h3>
      <div class="ini-lista">${m.linhas.map(l => linhaAula(l, m)).join("")}</div>
      ${rodape}`;
  }

  /* ---- Atalhos (acessados recentemente / mais usados) ---- */
  function botaoAtalho(key, legenda){
    const item = navAtual.find(i => i.key === key);
    if(!item) return "";
    const acao = ehProfessor() ? "set-professor-tab" : "set-inst-tab";
    return `
      <button type="button" class="ini-atalho" data-action="${acao}" data-key="${esc(key)}">
        <span class="ini-atalho-ico">${ICONS[item.icon] || ""}</span>
        <span class="ini-atalho-txt"><strong>${esc(item.label)}</strong>${legenda ? `<small>${esc(legenda)}</small>` : ""}</span>
      </button>`;
  }

  function secaoAtalhos(){
    const uso = usoValido();
    const recentes = [...uso].sort((a, b) => b.ultimo - a.ultimo).slice(0, MAX_RECENTES);
    const maisUsados = [...uso].sort((a, b) => b.n - a.n || b.ultimo - a.ultimo).slice(0, MAX_MAIS_USADOS);

    if(!uso.length){
      const iniciais = ATALHOS_INICIAIS[papel()]
        .filter(k => navAtual.some(i => i.key === k) && !ctx.moduloBloqueado(k));
      return `
        <h3 class="ini-h3">Atalhos</h3>
        <p class="ini-dica">Conforme você usa o sistema, as abas que você mais abre e as últimas que visitou aparecem aqui.</p>
        <div class="ini-atalhos">${iniciais.map(k => botaoAtalho(k, "")).join("")}</div>`;
    }

    return `
      <h3 class="ini-h3">Acessados recentemente</h3>
      <div class="ini-atalhos">${recentes.map(x => botaoAtalho(x.key, haQuanto(x.ultimo))).join("")}</div>
      <h3 class="ini-h3">Mais usados</h3>
      <div class="ini-atalhos">${maisUsados.map(x => botaoAtalho(x.key, `${x.n} acesso${x.n === 1 ? "" : "s"}`)).join("")}</div>
      <div class="ini-rodape-lista"><button type="button" class="ini-link" data-action="ini-limpar-uso">Limpar histórico de uso</button></div>`;
  }

  /* ================================================================
     Tela
     ================================================================ */
  function view(){
    const hoje = ctx.hojeISO();
    const dados = fonteDeDados(hoje);
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const escola = !ehProfessor() ? state.data.escolas[state.escolaSelecionadaId] : null;

    const topo = `
      <div class="ini-topo">
        <div>
          <h2 class="section-title" style="margin-bottom:2px;">Início</h2>
          <p class="section-eyebrow" style="margin:0;">${esc(ctx.dataExtenso())}${escola ? ` · ${esc(escola.nome)}` : ""}</p>
        </div>
        <div class="ini-topo-dir">
          <span class="ini-relogio">${esc(hora)}</span>
          <button type="button" class="attendance-btn" data-action="ini-atualizar" ${dados.atualizando ? "disabled" : ""}>${dados.atualizando ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </div>`;

    let corpo;
    if(!dados.pronto){
      corpo = dados.erro
        ? `<div class="ini-aviso ini-aviso-erro">${esc(dados.erro)}<button type="button" class="attendance-btn" data-action="ini-atualizar">Tentar de novo</button></div>`
        : `<div class="ini-aviso">Carregando as aulas e as chamadas de hoje…</div>`;
    } else {
      const m = modelo(dados.registros, hoje);
      const semTurmas = ehProfessor() && !(state.data.professorTurmas || []).length;
      corpo = semTurmas
        ? `<div class="teacher-empty-state"><strong>Nenhuma turma vinculada a você ainda.</strong><span>Fale com a secretaria para vincular suas turmas.</span></div>`
        : `
          ${dados.erro ? `<div class="ini-aviso ini-aviso-erro">${esc(dados.erro)}</div>` : ""}
          <div class="ini-cards">${cartaoChamadas(m)}${cartaoProxima(m, hoje)}</div>
          ${secaoPendencias(m)}
          ${secaoAulasDoDia(m)}`;
    }

    return `<div class="ini-wrap">${topo}${corpo}${secaoAtalhos()}</div>`;
  }

  /* ================================================================
     Carregamento e relógio
     ================================================================ */
  function aoAbrir(){
    tiques = 0;
    if(state.screen === "professor"){
      horarios.preparar(true);
      ctx.carregarChamadasProf();
    } else if(state.screen === "instituicao" && state.escolaSelecionadaId){
      horarios.aoAbrir();   // turmas, professores, remarcações e dias sem aula
      ctx.carregarRelatorioDia(state.escolaSelecionadaId, ctx.hojeISO());
    }
  }

  /* Chamado a cada 30 s pelo script.js: anda o relógio / contagens e, de vez em
     quando, relê as chamadas (o professor pode ter feito uma em outro aparelho). */
  function tique(){
    if(!estaAtivo()) return;
    const a = document.activeElement;
    if(a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName)) return;   // não atrapalha quem está digitando (ex.: busca do menu)
    tiques++;
    const hoje = ctx.hojeISO();
    const virouODia = ehProfessor() ? state.professorChamadasHojeData !== hoje : (state.relDia || {}).data !== hoje;
    if(virouODia || tiques % TIQUES_PARA_ATUALIZAR === 0) aoAbrir();
    else ctx.render();
  }

  function aoVoltarParaAba(){
    if(estaAtivo()) aoAbrir();
  }

  /* ================================================================
     Cliques
     ================================================================ */
  function click(el){
    switch(el.dataset.action){
      case "ini-chamada":
        ctx.abrirChamada(el.dataset.id);
        break;
      case "ini-atualizar":
        aoAbrir();
        break;
      case "ini-limpar-uso":
        gravarUso({});
        ctx.render();
        break;
    }
  }

  return { view, click, aoAbrir, tique, aoVoltarParaAba, estaAtivo, registrarVisita, definirNav, TIQUE_MS };
}
