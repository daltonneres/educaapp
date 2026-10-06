/* ==================================================================
   Educa+ — dev.js
   ------------------------------------------------------------------
   Painel do DESENVOLVEDOR + configuração remota do app.

   Tudo vive em UM documento do Firestore: config/app
     manutencao: { ativa, mensagem, previsao, inicio, fim }
     aviso:      { ativo, tipo: "info" | "alerta", texto, inicio, fim }
     liberacao:  { ativa, mensagem, itens: { [perfil]: [moduloKey] }, publicadoEm, ate }
     modulos:    { [perfil]: { [moduloKey]: false } }   // só guarda o BLOQUEADO
     assinatura: string                                  // fecha todas as mensagens
                 perfil = instituicao | professor | familia | aluno

   Quem é dev: usuarios/{uid} com  dev: true  (além de role "instituicao"
   e escolasIds). Só se cria pelo console do Firebase.

   Como se encaixa (igual horarios.js / suporte.js):
     • Só monta HTML; estado e render() ficam no script.js (via ctx).
     • Ações começam com "dev-" (data-action="dev-...").
     • Campos têm data-dev="nome"; digitar NÃO re-renderiza.
   ================================================================== */

export const ASSINATURA_PADRAO = "Atenciosamente, Equipe EDUCA+ | DEV Dalton Neres";
const TEXTO_LIBERADO_PADRAO = "O app está retornando o seu funcionamento. Em caso de dúvidas, melhorias ou sugestões, entre em contato com a secretaria da sua unidade.";

export const PERFIS_DEV = [
  { key: "instituicao", label: "Secretaria / Instituição" },
  { key: "professor",   label: "Professores" },
  { key: "familia",     label: "Responsáveis" },
  { key: "aluno",       label: "Alunos" },
];

/* Módulos (abas) de cada perfil. "perfil" nunca é bloqueável. */
export const CATALOGO_MODULOS = {
  instituicao: [
    ["turmas", "Turmas"], ["calendario", "Calendário"], ["horarios", "Horários"],
    ["estatisticas", "Estatísticas"], ["financeiro", "Financeiro"], ["alunos", "Alunos"],
    ["aniversarios", "Aniversários"], ["professores", "Professores"], ["responsaveis", "Responsáveis"],
    ["contratos", "Contratos"], ["aval", "Avaliações"], ["certificados", "Certificados"], ["gestao", "Gestão"],
  ],
  professor: [
    ["calendario", "Calendário"], ["horarios", "Horários"], ["turmas", "Turmas"],
    ["aulas", "Aulas & chamada"], ["conteudos", "Conteúdos"], ["avaliacoes", "Notas & atividades"],
    ["aval", "Avaliações"], ["certificados", "Certificados"], ["suporte", "Suporte"],
  ],
  familia: [
    ["calendario", "Calendário"], ["notas", "Notas"], ["aval", "Avaliações"], ["presenca", "Presença"],
    ["certificados", "Certificados"], ["financeiro", "Financeiro"], ["contratos", "Contratos"],
    ["comunicados", "Comunicados"], ["ficha", "Ficha"], ["suporte", "Suporte"],
  ],
  aluno: [
    ["calendario", "Calendário"], ["notas", "Notas"], ["aval", "Avaliações"], ["presenca", "Presença"],
    ["certificados", "Certificados"], ["comunicados", "Comunicados"], ["ficha", "Minha ficha"], ["suporte", "Suporte"],
  ],
};
const labelModulo = (perfil, key) => (CATALOGO_MODULOS[perfil] || []).find(([k]) => k === key)?.[1] || key;

const TIPOS_MENSAGEM = [
  ["programada", "Manutenção programada"],
  ["agora", "Manutenção agora"],
  ["instabilidade", "Instabilidade"],
  ["aviso", "Aviso geral"],
  ["liberado", "Processos liberados"],
];

/* ---------- Gerador de mensagens (modelos + as palavras que você digitar) ---------- */
function gerarMensagens(tipo, palavras){
  const lista = String(palavras || "").split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const juntar = (a) => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1];
  const L = juntar(lista);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pick = (arr, i) => (i === 0 ? arr[0] : arr[Math.floor(Math.random() * arr.length)]);
  const motivo = (i) => L
    ? `${pick(["para", "visando", "com foco em"], i)} ${L}`
    : pick(["para melhor funcionamento", "visando o melhor funcionamento", "para garantir o melhor funcionamento"], i);

  const modelos = {
    programada: (i) => `${pick(["O app estará em manutenção programada", "Teremos uma manutenção programada no app", "O Educa+ passará por uma manutenção programada"], i)} ${motivo(i)}. ${pick(["Pedimos que, por gentileza, retorne seu acesso em breve.", "Agradecemos a sua compreensão e pedimos que volte a acessar o app em breve.", "Pedimos desculpas pelo transtorno e contamos com a sua compreensão."], i)}`,
    agora: (i) => `${pick(["O app está em manutenção neste momento", "Estamos realizando uma manutenção no app agora", "O Educa+ está temporariamente em manutenção"], i)} ${motivo(i)}. ${pick(["Pedimos que, por gentileza, retorne seu acesso em breve.", "Pedimos desculpas pelo transtorno e agradecemos a compreensão.", "Em breve o acesso será normalizado. Agradecemos a sua compreensão."], i)}`,
    instabilidade: (i) => `${pick(["Identificamos uma instabilidade no app", "O app está passando por uma instabilidade momentânea"], i)}${L ? ` envolvendo ${L}` : ""}. ${pick(["Nossa equipe já está trabalhando na solução. Por gentileza, tente acessar novamente em instantes.", "Seus dados estão seguros. Pedimos que tente novamente em alguns minutos."], i)}`,
    aviso: (i) => `${pick(["Atenção:", "Comunicado importante:", "Informamos:"], i)} ${L ? cap(L) + "." : "há uma novidade no app."} ${pick(["Agradecemos a sua atenção.", "Em caso de dúvidas, procure a secretaria da sua unidade."], i)}`,
    liberado: (i) => `${pick(["O app está retornando o seu funcionamento.", "O Educa+ voltou a funcionar normalmente.", "Os processos do app foram liberados e o funcionamento está sendo normalizado."], i)} ${L ? `Foram liberados: ${L}. ` : ""}${pick(["Em caso de dúvidas, melhorias ou sugestões, entre em contato com a secretaria da sua unidade.", "Para dúvidas, melhorias ou sugestões, fale com a secretaria da sua unidade."], i)}`,
  };
  const gerar = modelos[tipo] || modelos.programada;
  const saida = [gerar(0)];                       // a 1ª é sempre o modelo-base
  for(let t = 0; saida.length < 4 && t < 40; t++){
    const m = gerar(1 + t);
    if(!saida.includes(m)) saida.push(m);
  }
  return saida;
}

export function criarDev(ctx){
  const { state, render, db, doc, setDoc, onSnapshot, collection, query, orderBy, limit, getDocs, addDoc, ICONS, escapeHtml } = ctx;
  const ref = () => doc(db, "config", "app");
  const ui = {
    draft: null, msg: "", erro: "", salvando: false, aba: "status", preview: false,
    sugestoes: [], log: [], logCarregando: false, logErro: "",
  };
  const vistos = new Set();      // pop-ups já fechados nesta sessão (zera ao sair)
  let estavaLogado = false;
  let ultimaAssinatura = "";

  const cfg = () => state.config || {};
  const ehDev = () => state.perfil?.dev === true;
  const fmtData = (iso) => { try{ return new Date(iso).toLocaleString("pt-BR"); }catch(e){ return iso || "—"; } };

  /* ---------- Assinatura: fecha TODAS as mensagens ---------- */
  const assin = () => (cfg().assinatura || "").trim() || ASSINATURA_PADRAO;
  function semAss(texto){
    let t = String(texto || "");
    [assin(), ASSINATURA_PADRAO].forEach(s => { t = t.split(s).join(""); });
    return t.trim();
  }
  function comAss(texto){
    const t = String(texto || "").trim();
    if(!t) return "";
    return t.includes(assin()) ? t : `${t}\n\n${assin()}`;
  }

  /* ---------- Janelas de tempo (início/fim opcionais) ---------- */
  const tempo = (s) => { const v = s ? new Date(s).getTime() : NaN; return isNaN(v) ? null : v; };
  const fmtDT = (s) => { try{ return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }catch(e){ return s; } };
  function periodoTxt(ini, fim){
    if(ini && fim) return `de ${fmtDT(ini)} até ${fmtDT(fim)}`;
    if(fim) return `até ${fmtDT(fim)}`;
    if(ini) return `a partir de ${fmtDT(ini)}`;
    return "";
  }
  /* desligado | agendado (ainda não começou) | ativo | encerrado (o fim passou) */
  function estadoJanela(ligado, ini, fim){
    if(!ligado) return "desligado";
    const n = Date.now(), i = tempo(ini), f = tempo(fim);
    if(i !== null && n < i) return "agendado";
    if(f !== null && n > f) return "encerrado";
    return "ativo";
  }
  const estadoManut = () => estadoJanela(cfg().manutencao?.ativa, cfg().manutencao?.inicio, cfg().manutencao?.fim);
  const estadoAviso = () => estadoJanela(cfg().aviso?.ativo, cfg().aviso?.inicio, cfg().aviso?.fim);
  const libAtiva = () => !!cfg().liberacao?.ativa && (tempo(cfg().liberacao.ate) === null || Date.now() <= tempo(cfg().liberacao.ate));
  const sigEstados = () => estadoManut() + "|" + estadoAviso() + "|" + libAtiva();

  /* ---------- Ouvinte em tempo real ---------- */
  function iniciarConfig(){
    onSnapshot(ref(), (snap) => {
      const nova = snap.exists() ? snap.data() : {};
      if(JSON.stringify(nova) === JSON.stringify(state.config || {})) return;
      state.config = nova;
      ultimaAssinatura = sigEstados();
      render();
    }, (err) => console.warn("config/app indisponível:", err?.code || err));
    // Agendamentos: reavalia a cada 30s (começou/terminou?) e redesenha só se mudou.
    setInterval(() => {
      const a = sigEstados();
      if(a !== ultimaAssinatura){ ultimaAssinatura = a; render(); }
    }, 30000);
    document.addEventListener("input", (e) => {
      const t = e.target;
      if(t?.dataset?.dev && ui.draft) ui.draft[t.dataset.dev] = t.value;
    });
  }

  /* ---------- Consultas usadas pelo app ---------- */
  const emManutencao = () => estadoManut() === "ativo" && !ehDev();

  function moduloBloqueado(perfil, key){
    if(ehDev() || key === "perfil") return false;
    return cfg().modulos?.[perfil]?.[key] === false;
  }
  const filtrarNav = (perfil, itens) => itens.filter(i => !moduloBloqueado(perfil, i.key));

  function moduloIndisponivel(label){
    return `
      <div class="dev-bloqueio">
        <div class="dev-bloqueio-icone">${ICONS.shield}</div>
        <h2 class="section-title">${escapeHtml(label || "Este módulo")} está temporariamente indisponível</h2>
        <p class="section-eyebrow">Estamos fazendo ajustes. Tente novamente mais tarde ou fale com a secretaria.</p>
      </div>`;
  }

  function telaManutencao(){
    const m = cfg().manutencao || {};
    return `
    <div class="screen sign-in-screen">
      <div class="login-box modern-login-box" style="text-align:center;">
        <div class="login-logo-wrap"><img class="login-logo" src="imgs/logoeduca.jpeg" alt="Logo Educa+" /></div>
        <h2 style="color:var(--gold-light);margin:18px 0 8px;">Estamos em manutenção</h2>
        <p style="color:var(--cream);white-space:pre-line;">${escapeHtml(comAss(m.mensagem) || "O Educa+ voltará em instantes.")}</p>
        ${m.previsao || m.fim ? `<p style="color:var(--gold-light);margin-top:10px;">Previsão de retorno: <strong>${escapeHtml(m.previsao || fmtDT(m.fim))}</strong></p>` : ""}
        ${state.authUser ? `<button class="btn-secondary" style="margin-top:18px;" data-action="logout">Sair</button>` : ""}
      </div>
    </div>`;
  }

  /* Faixa fixa no topo (curta: sem a assinatura, que fica no pop-up). */
  function bannerHtml(){
    const c = cfg();
    const faixas = [];
    const em = estadoManut();
    if(em === "ativo" && ehDev()){
      faixas.push(`<div class="dev-banner dev-banner-alerta">🛠 Manutenção ATIVA — os outros usuários estão bloqueados. Só você vê o app.</div>`);
    } else if(em === "ativo" && state.screen === "login"){
      faixas.push(`<div class="dev-banner dev-banner-alerta">🛠 ${escapeHtml(semAss(c.manutencao.mensagem) || "Sistema em manutenção.")}${c.manutencao.previsao ? " Previsão: " + escapeHtml(c.manutencao.previsao) : ""}</div>`);
    }
    if(estadoAviso() === "ativo" && c.aviso.texto){
      faixas.push(`<div class="dev-banner dev-banner-${c.aviso.tipo === "alerta" ? "alerta" : "info"}">${escapeHtml(semAss(c.aviso.texto))}</div>`);
    }
    return faixas.join("");
  }

  /* ---------- Pop-up ao entrar (manutenção, aviso e processos liberados) ---------- */
  const PERFIL_DA_TELA = { aluno: "aluno", familia: "familia", professor: "professor", instituicao: "instituicao" };

  function itemLiberacao(lib, perfilView, todos){
    let extra = "";
    if(todos){
      extra = PERFIS_DEV.map(p => {
        const ls = (lib.itens?.[p.key] || []).map(k => labelModulo(p.key, k));
        return ls.length ? `${p.label}: ${ls.join(", ")}` : "";
      }).filter(Boolean).join("\n");
    } else if(perfilView){
      const ls = (lib.itens?.[perfilView] || []).map(k => labelModulo(perfilView, k));
      if(ls.length) extra = "Liberado: " + ls.join(", ");
    }
    return { key: `l|${lib.publicadoEm}`, icone: "✅", cor: "green", titulo: "Processos liberados", texto: comAss(lib.mensagem), extra };
  }

  function itensDe(manut, aviso, estM, estA){
    const out = [];
    const periodoM = periodoTxt(manut.inicio, manut.fim);
    if(estM === "ativo"){
      out.push({ key: `m1|${manut.mensagem}|${manut.inicio}|${manut.fim}`, icone: "🛠", cor: "red", titulo: "Sistema em manutenção",
        texto: comAss(manut.mensagem) || "O Educa+ voltará em instantes.", extra: periodoM || (manut.previsao ? "Previsão: " + manut.previsao : "") });
    } else if(estM === "agendado"){
      out.push({ key: `m2|${manut.mensagem}|${manut.inicio}|${manut.fim}`, icone: "🗓", cor: "gold", titulo: "Manutenção programada",
        texto: comAss(manut.mensagem) || "Haverá uma manutenção no sistema.", extra: periodoM });
    }
    if(estA === "ativo" && aviso.texto){
      out.push({ key: `a|${aviso.texto}|${aviso.inicio}|${aviso.fim}`, icone: "📣", cor: aviso.tipo === "alerta" ? "red" : "navy", titulo: "Aviso",
        texto: comAss(aviso.texto), extra: periodoTxt(aviso.inicio, aviso.fim) });
    }
    return out;
  }

  function popupItens(){
    const itens = itensDe(cfg().manutencao || {}, cfg().aviso || {}, estadoManut(), estadoAviso());
    if(libAtiva() && cfg().liberacao.mensagem) itens.push(itemLiberacao(cfg().liberacao, PERFIL_DA_TELA[state.screen], false));
    return itens;
  }

  function popupHtml(){
    const logado = !!state.authUser;
    if(estavaLogado && !logado) vistos.clear();   // saiu: no próximo login mostra de novo
    estavaLogado = logado;
    if(!["login", "escola-picker", "aluno", "familia", "professor", "instituicao"].includes(state.screen)) return "";

    let itens;
    if(ehDev()){
      if(!ui.preview) return "";          // o dev não é interrompido; só vê se pedir
      garantirDraft();
      const d = ui.draft;
      if(ui.aba === "liberados"){
        itens = d.libMensagem.trim() ? [itemLiberacao({ mensagem: d.libMensagem, itens: d.libItens, publicadoEm: "preview" }, null, true)] : [];
      } else {
        itens = itensDe({ mensagem: d.mensagem, previsao: d.previsao, inicio: d.mInicio, fim: d.mFim },
          { texto: d.avisoTexto, tipo: d.avisoTipo, inicio: d.aInicio, fim: d.aFim },
          d.mensagem.trim() ? (tempo(d.mInicio) !== null && tempo(d.mInicio) > Date.now() ? "agendado" : "ativo") : "desligado",
          d.avisoTexto.trim() ? "ativo" : "desligado");
      }
      if(!itens.length) itens = [{ key: "vazio", icone: "ℹ️", cor: "navy", titulo: "Nada para mostrar", texto: "Escreva uma mensagem para ver como fica o pop-up.", extra: "" }];
    } else {
      itens = popupItens().filter(i => !vistos.has(i.key));
    }
    if(!itens.length) return "";

    return `
    <div class="dev-popup-backdrop" data-action="noop">
      <div class="dev-popup" role="dialog" aria-modal="true" aria-label="Aviso do sistema">
        ${itens.map(i => `
          <div class="dev-popup-item ${i.cor}">
            <h3>${i.icone} ${escapeHtml(i.titulo)}</h3>
            <p>${escapeHtml(i.texto)}</p>
            ${i.extra ? `<small>${escapeHtml(i.extra)}</small>` : ""}
          </div>`).join("")}
        <button type="button" class="btn-gold" data-action="dev-popup-fechar">Entendi</button>
      </div>
    </div>`;
  }

  /* ---------- Itens no calendário (manutenção/aviso com período) ---------- */
  const isoLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  function diasEntre(iniISO, fimISO, max = 62){
    const [y1, m1, d1] = iniISO.split("-").map(Number);
    const [y2, m2, d2] = fimISO.split("-").map(Number);
    const cur = new Date(y1, m1 - 1, d1, 12), fim = new Date(y2, m2 - 1, d2, 12);
    const out = [];
    while(cur <= fim && out.length < max){ out.push(isoLocal(cur)); cur.setDate(cur.getDate() + 1); }
    return out;
  }
  function eventosCalendario(){
    const c = cfg();
    const itens = [];
    const add = (prefixo, titulo, texto, ini, fim) => {
      const de = ini ? ini.slice(0, 10) : isoLocal(new Date());
      const ate = fim ? fim.slice(0, 10) : de;
      const desc = [texto, periodoTxt(ini, fim)].filter(Boolean).join("\n\n");
      diasEntre(de, ate).forEach(iso => itens.push({
        id: `sistema-${prefixo}-${iso}`, escopo: "escola", tipo: "sistema", sistema: true,
        data: iso, titulo, descricao: desc, criadoEm: "0",
      }));
    };
    const m = c.manutencao || {}, av = c.aviso || {};
    if(m.ativa && (m.inicio || m.fim) && estadoManut() !== "encerrado") add("m", "🛠 Manutenção do sistema", comAss(m.mensagem), m.inicio, m.fim);
    if(av.ativo && (av.inicio || av.fim) && av.texto && estadoAviso() !== "encerrado") add("a", "📣 Aviso do sistema", comAss(av.texto), av.inicio, av.fim);
    return itens;
  }

  /* ---------- Painel ---------- */
  function garantirDraft(){
    if(ui.draft) return;
    const c = cfg();
    ui.draft = {
      mensagem: semAss(c.manutencao?.mensagem),
      previsao: c.manutencao?.previsao || "",
      mInicio: c.manutencao?.inicio || "", mFim: c.manutencao?.fim || "",
      aInicio: c.aviso?.inicio || "", aFim: c.aviso?.fim || "",
      avisoTexto: semAss(c.aviso?.texto),
      avisoTipo: c.aviso?.tipo || "info",
      palavras: "", tipoMsg: "programada",
      assinatura: assin(),
      libMensagem: semAss(c.liberacao?.mensagem) || TEXTO_LIBERADO_PADRAO,
      libDias: "3",
      libItens: JSON.parse(JSON.stringify(c.liberacao?.itens || {})),
    };
  }

  function abasHtml(){
    const abas = [["status", "Status"], ["avisos", "Manutenção e avisos"], ["liberados", "Processos liberados"], ["modulos", "Módulos"], ["historico", "Histórico"]];
    return `<div class="subtab-bar">${abas.map(([k, l]) => `
      <button type="button" class="subtab-btn ${ui.aba === k ? "active" : ""}" data-action="dev-aba" data-key="${k}"><span>${l}</span></button>`).join("")}</div>`;
  }

  function view(){
    if(!ehDev()) return "";
    garantirDraft();
    const corpo = ui.aba === "avisos" ? avisosHtml()
      : ui.aba === "liberados" ? liberadosHtml()
      : ui.aba === "modulos" ? modulosHtml()
      : ui.aba === "historico" ? logHtml()
      : statusHtml();
    return `
    <h2 class="section-title">Painel do desenvolvedor</h2>
    <p class="section-eyebrow">Mudanças valem na hora para todo mundo que está com o app aberto. Você (dev) nunca é bloqueado.</p>
    ${abasHtml()}
    ${ui.erro ? `<p class="teacher-error">${escapeHtml(ui.erro)}</p>` : ""}
    ${ui.msg ? `<p class="teacher-success">${escapeHtml(ui.msg)}</p>` : ""}
    ${corpo}`;
  }

  /* ----- Gerador de mensagens (aparece nas abas Manutenção e Liberados) ----- */
  function geradorHtml(destinos){
    const d = ui.draft;
    const botoes = (i) => destinos.map(([k, rotulo]) =>
      `<button type="button" class="btn-secondary dev-chip" data-action="dev-usar-msg" data-i="${i}" data-destino="${k}">${rotulo}</button>`).join("");
    return `
    <div class="dev-card">
      <div class="dev-card-head"><h3>✍️ Gerador de mensagens</h3></div>
      <p class="section-eyebrow">Digite algumas palavras (separadas por vírgula) e escolha o tipo. Toda mensagem termina com a assinatura abaixo.</p>
      <div class="dev-grid2">
        <div><label class="teacher-label">Palavras-chave</label>
          <input class="dev-input" type="text" data-dev="palavras" value="${escapeHtml(d.palavras)}" placeholder="ex.: melhorias, desempenho, segurança" /></div>
        <div><label class="teacher-label">Tipo</label>
          <select class="dev-input" data-dev="tipoMsg">${TIPOS_MENSAGEM.map(([k, l]) => `<option value="${k}" ${d.tipoMsg === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="dev-acoes"><button type="button" class="btn-gold" data-action="dev-gerar">${ui.sugestoes.length ? "Gerar novas" : "Gerar mensagens"}</button></div>
      ${ui.sugestoes.map((s, i) => `
        <div class="dev-sugestao">
          <p>${escapeHtml(s)}</p>
          <small class="dev-ass">${escapeHtml(assin())}</small>
          <div class="dev-chips"><span class="section-eyebrow" style="margin:0;align-self:center;">Usar em:</span>${botoes(i)}</div>
        </div>`).join("")}
      <label class="teacher-label" style="margin-top:12px;">Assinatura (fecha todas as mensagens)</label>
      <input class="dev-input" type="text" data-dev="assinatura" value="${escapeHtml(d.assinatura)}" />
      <div class="dev-acoes"><button type="button" class="btn-secondary" data-action="dev-assinatura-salvar" ${ui.salvando ? "disabled" : ""}>Salvar assinatura</button></div>
    </div>`;
  }

  /* ----- Aba: Manutenção e avisos ----- */
  function avisosHtml(){
    const c = cfg(), d = ui.draft;
    const manutAtiva = !!c.manutencao?.ativa;
    const rotuloEstado = { ativo: "ATIVA", agendado: "AGENDADA", encerrado: "encerrada", desligado: "desligada" }[estadoManut()];
    return `
    ${geradorHtml([["manut", "Manutenção"], ["aviso", "Aviso"]])}

    <div class="dev-card ${estadoManut() === "ativo" ? "dev-card-alerta" : ""}">
      <div class="dev-card-head"><h3>🛠 Manutenção — ${rotuloEstado}</h3></div>
      <p class="section-eyebrow">Ativa: secretaria, professores, responsáveis e alunos veem a tela de manutenção (app “fora do ar”).</p>
      <label class="teacher-label">Mensagem</label>
      <textarea class="dev-input" rows="4" data-dev="mensagem" placeholder="O que as pessoas vão ler (a assinatura entra sozinha no fim)">${escapeHtml(d.mensagem)}</textarea>
      <label class="teacher-label">Previsão de retorno (texto livre, opcional)</label>
      <input class="dev-input" type="text" data-dev="previsao" value="${escapeHtml(d.previsao)}" placeholder="ex.: hoje às 18h" />
      <p class="section-eyebrow">Período (opcional). <strong>Sem início</strong> = bloqueia agora. <strong>Início no futuro</strong> = fica agendada: avisa em pop-up e aparece no calendário de todos, e só bloqueia quando chegar a hora. O <strong>fim</strong> libera o app sozinho.</p>
      <div class="dev-grid2">
        <div><label class="teacher-label">Início</label><input class="dev-input" type="datetime-local" data-dev="mInicio" value="${escapeHtml(d.mInicio)}" /></div>
        <div><label class="teacher-label">Fim</label><input class="dev-input" type="datetime-local" data-dev="mFim" value="${escapeHtml(d.mFim)}" /></div>
      </div>
      <div class="dev-acoes">
        ${manutAtiva
          ? `<button type="button" class="btn-gold" data-action="dev-manut-desativar" ${ui.salvando ? "disabled" : ""}>Desativar / cancelar</button>
             <button type="button" class="btn-gold" data-action="dev-manut-desativar-avisar" ${ui.salvando ? "disabled" : ""}>Desativar e avisar que voltou</button>
             <button type="button" class="btn-secondary" data-action="dev-manut-salvar" ${ui.salvando ? "disabled" : ""}>Atualizar mensagem e período</button>`
          : `<button type="button" class="btn-danger" data-action="dev-manut-ativar" ${ui.salvando ? "disabled" : ""}>Ativar / agendar manutenção</button>`}
        <button type="button" class="btn-secondary" data-action="dev-preview-popup">Pré-visualizar pop-up</button>
      </div>
    </div>

    <div class="dev-card">
      <div class="dev-card-head"><h3>📣 Aviso (sem bloquear)</h3></div>
      <label class="teacher-label">Texto</label>
      <textarea class="dev-input" rows="3" data-dev="avisoTexto" placeholder="ex.: Hoje às 22h o sistema pode ficar lento por alguns minutos.">${escapeHtml(d.avisoTexto)}</textarea>
      <label class="teacher-label">Tipo</label>
      <select class="dev-input" data-dev="avisoTipo">
        <option value="info" ${d.avisoTipo === "info" ? "selected" : ""}>Informativo</option>
        <option value="alerta" ${d.avisoTipo === "alerta" ? "selected" : ""}>Alerta</option>
      </select>
      <div class="dev-grid2">
        <div><label class="teacher-label">Início (opcional)</label><input class="dev-input" type="datetime-local" data-dev="aInicio" value="${escapeHtml(d.aInicio)}" /></div>
        <div><label class="teacher-label">Fim (opcional)</label><input class="dev-input" type="datetime-local" data-dev="aFim" value="${escapeHtml(d.aFim)}" /></div>
      </div>
      <p class="section-eyebrow">Aparece em faixa no topo e em pop-up ao entrar. Com período definido, também entra no calendário de todos nos dias do período.</p>
      <div class="dev-acoes">
        <button type="button" class="btn-gold" data-action="dev-aviso-publicar" ${ui.salvando ? "disabled" : ""}>${c.aviso?.ativo ? "Atualizar aviso" : "Publicar aviso"}</button>
        ${c.aviso?.ativo ? `<button type="button" class="btn-secondary" data-action="dev-aviso-remover">Remover aviso</button>` : ""}
        <button type="button" class="btn-secondary" data-action="dev-preview-popup">Pré-visualizar pop-up</button>
      </div>
    </div>`;
  }

  /* ----- Aba: Processos liberados ----- */
  function liberadosHtml(){
    const c = cfg(), d = ui.draft, lib = c.liberacao || {};
    const grupos = PERFIS_DEV.map(p => {
      const marcados = d.libItens[p.key] || [];
      const chips = CATALOGO_MODULOS[p.key].map(([k, label]) => {
        const on = marcados.includes(k);
        return `<button type="button" class="dev-modulo ${on ? "on" : "off-neutro"}" data-action="dev-lib-toggle" data-perfil="${p.key}" data-key="${k}" aria-pressed="${on}">
          <span class="dev-modulo-dot"></span>${escapeHtml(label)}<small>${on ? "liberado" : "—"}</small></button>`;
      }).join("");
      return `
        <div class="dev-card">
          <div class="dev-card-head"><h3>${escapeHtml(p.label)}</h3>
            <button type="button" class="btn-secondary dev-chip" data-action="dev-lib-todos" data-perfil="${p.key}">Marcar todos</button></div>
          <div class="dev-modulos">${chips}</div>
        </div>`;
    }).join("");
    return `
    <div class="dev-card ${libAtiva() ? "" : ""}">
      <div class="dev-card-head"><h3>✅ Processos liberados — ${libAtiva() ? "NO AR" : "nenhum no ar"}</h3></div>
      <p class="section-eyebrow">Use depois de uma manutenção: todo mundo vê um pop-up ao entrar dizendo que o app voltou e quais processos foram liberados (cada perfil vê só os dele).</p>
      ${libAtiva() ? `<p class="section-eyebrow"><strong>Publicado em ${escapeHtml(fmtData(lib.publicadoEm))}</strong> · fica visível até ${escapeHtml(fmtData(lib.ate))}.</p>` : ""}
    </div>

    ${geradorHtml([["lib", "Processos liberados"]])}

    <div class="dev-card">
      <label class="teacher-label">Mensagem</label>
      <textarea class="dev-input" rows="4" data-dev="libMensagem" placeholder="A assinatura entra sozinha no fim">${escapeHtml(d.libMensagem)}</textarea>
      <label class="teacher-label">Exibir por quantos dias</label>
      <input class="dev-input" type="number" min="1" max="30" data-dev="libDias" value="${escapeHtml(d.libDias)}" style="max-width:120px;" />
      <p class="section-eyebrow">Marque abaixo o que foi liberado (opcional — sem marcar, aparece só a mensagem).</p>
      <div class="dev-acoes">
        <button type="button" class="btn-gold" data-action="dev-lib-publicar" ${ui.salvando ? "disabled" : ""}>${libAtiva() ? "Republicar" : "Publicar liberação"}</button>
        ${libAtiva() ? `<button type="button" class="btn-secondary" data-action="dev-lib-remover">Tirar do ar</button>` : ""}
        <button type="button" class="btn-secondary" data-action="dev-preview-popup">Pré-visualizar pop-up</button>
      </div>
    </div>
    ${grupos}`;
  }

  /* ----- Aba: Módulos ----- */
  function modulosHtml(){
    const c = cfg();
    const matriz = PERFIS_DEV.map(p => {
      const mods = CATALOGO_MODULOS[p.key].map(([k, label]) => {
        const aberto = c.modulos?.[p.key]?.[k] !== false;
        return `<button type="button" class="dev-modulo ${aberto ? "on" : "off"}" data-action="dev-modulo" data-perfil="${p.key}" data-key="${k}" aria-pressed="${aberto}">
          <span class="dev-modulo-dot"></span>${escapeHtml(label)}<small>${aberto ? "liberado" : "bloqueado"}</small></button>`;
      }).join("");
      return `
        <div class="dev-card">
          <div class="dev-card-head"><h3>${escapeHtml(p.label)}</h3>
            <button type="button" class="btn-secondary dev-chip" data-action="dev-liberar-todos" data-perfil="${p.key}">Liberar todos</button></div>
          <div class="dev-modulos">${mods}</div>
        </div>`;
    }).join("");
    return `<p class="section-eyebrow">Toque para liberar/bloquear. Bloqueado = some do menu e, se a pessoa estiver nele, aparece “indisponível”.</p>${matriz}`;
  }

  /* ----- Aba: Status atual ----- */
  function statusHtml(){
    const c = cfg();
    const m = c.manutencao || {}, av = c.aviso || {}, lib = c.liberacao || {};
    const bloqueadosDe = (p) => CATALOGO_MODULOS[p.key].filter(([k]) => c.modulos?.[p.key]?.[k] === false).map(([, l]) => l);
    const linhasModulos = PERFIS_DEV.map(p => {
      const b = bloqueadosDe(p);
      return `<li><strong>${escapeHtml(p.label)}:</strong> ${b.length ? escapeHtml(b.join(", ")) : "<span class=\"dev-ok\">tudo liberado</span>"}</li>`;
    }).join("");
    const totalBloq = PERFIS_DEV.reduce((n, p) => n + bloqueadosDe(p).length, 0);
    const em = estadoManut(), ea = estadoAviso();
    const corM = { ativo: "dev-badge-red", agendado: "dev-badge-gold", encerrado: "dev-badge-green", desligado: "dev-badge-green" }[em];
    const txM = { ativo: "ATIVA", agendado: "AGENDADA", encerrado: "Encerrada", desligado: "Desligada" }[em];
    const corA = { ativo: "dev-badge-gold", agendado: "dev-badge-gold", encerrado: "dev-badge-green", desligado: "dev-badge-green" }[ea];
    const txA = { ativo: "No ar", agendado: "Agendado", encerrado: "Encerrado", desligado: "Nenhum" }[ea];
    return `
    <div class="dev-card">
      <div class="dev-card-head"><h3>📊 Status atual</h3></div>
      <div class="dev-status">
        <div class="dev-status-item">
          <span class="dev-status-rotulo">Manutenção</span>
          <span class="dev-badge ${corM}">${txM}</span>
          ${m.ativa ? `<small>${escapeHtml(semAss(m.mensagem))}${periodoTxt(m.inicio, m.fim) ? "<br>" + escapeHtml(periodoTxt(m.inicio, m.fim)) : ""}${m.previsao ? "<br>retorno: " + escapeHtml(m.previsao) : ""}</small>` : ""}
        </div>
        <div class="dev-status-item">
          <span class="dev-status-rotulo">Aviso</span>
          <span class="dev-badge ${corA}">${txA}</span>
          ${av.ativo ? `<small>${escapeHtml(semAss(av.texto))}${periodoTxt(av.inicio, av.fim) ? "<br>" + escapeHtml(periodoTxt(av.inicio, av.fim)) : ""}</small>` : ""}
        </div>
        <div class="dev-status-item">
          <span class="dev-status-rotulo">Processos liberados</span>
          <span class="dev-badge ${libAtiva() ? "dev-badge-green" : "dev-badge-gold"}">${libAtiva() ? "No ar" : "Nenhum"}</span>
          ${libAtiva() ? `<small>até ${escapeHtml(fmtData(lib.ate))}</small>` : ""}
        </div>
        <div class="dev-status-item">
          <span class="dev-status-rotulo">Módulos bloqueados</span>
          <span class="dev-badge ${totalBloq ? "dev-badge-red" : "dev-badge-green"}">${totalBloq}</span>
        </div>
        <div class="dev-status-item">
          <span class="dev-status-rotulo">Última alteração</span>
          <small>${c.atualizadoEm ? `${escapeHtml(fmtData(c.atualizadoEm))}<br>por ${escapeHtml(c.atualizadoPorNome || "—")}` : "—"}</small>
        </div>
      </div>
      <ul class="dev-lista-modulos">${linhasModulos}</ul>
    </div>`;
  }

  /* ----- Histórico de alterações ----- */
  function logHtml(){
    const itens = ui.log.map(l => `
      <li class="dev-log-item">
        <span class="dev-log-quando">${escapeHtml(fmtData(l.em))}</span>
        <span class="dev-log-acao">${escapeHtml(l.acao || "")}</span>
        ${l.detalhe ? `<small>${escapeHtml(l.detalhe)}</small>` : ""}
        <small>por ${escapeHtml(l.porNome || "—")}</small>
      </li>`).join("");
    return `
    <div class="dev-card">
      <div class="dev-card-head"><h3>🕘 Histórico de alterações</h3>
        <button type="button" class="btn-secondary dev-chip" data-action="dev-log-atualizar">Atualizar</button></div>
      ${ui.logErro ? `<p class="teacher-error">${escapeHtml(ui.logErro)}</p>` : ""}
      ${ui.logCarregando ? `<p class="section-eyebrow">Carregando…</p>` : (itens ? `<ul class="dev-log">${itens}</ul>` : `<p class="section-eyebrow">Nenhuma alteração registrada ainda.</p>`)}
    </div>`;
  }

  async function carregarLog(){
    if(!ehDev()) return;
    ui.logCarregando = true; ui.logErro = ""; render();
    try{
      const snap = await getDocs(query(collection(db, "configLog"), orderBy("em", "desc"), limit(20)));
      ui.log = snap.docs.map(x => x.data());
    }catch(err){
      console.error(err);
      ui.logErro = err?.code === "permission-denied"
        ? "Sem permissão no histórico: publique as regras atualizadas (bloco configLog)."
        : "Não foi possível carregar o histórico.";
    }
    ui.logCarregando = false; render();
  }

  /* ---------- Ações ---------- */
  function periodoOk(ini, fim){
    if(tempo(ini) !== null && tempo(fim) !== null && tempo(fim) <= tempo(ini)){
      ui.erro = "O fim precisa ser depois do início."; ui.msg = ""; render(); return false;
    }
    return true;
  }

  async function salvar(parcial, ok, detalhe = ""){
    ui.salvando = true; ui.erro = ""; ui.msg = ""; render();
    try{
      await setDoc(ref(), {
        ...parcial,
        atualizadoPor: state.authUser?.uid || "",
        atualizadoPorNome: state.perfil?.nome || "",
        atualizadoEm: new Date().toISOString(),
      }, { merge: true });
      ui.msg = ok;
      try{
        await addDoc(collection(db, "configLog"), {
          acao: ok, detalhe, em: new Date().toISOString(),
          porId: state.authUser?.uid || "", porNome: state.perfil?.nome || "",
        });
      }catch(e){ console.warn("histórico não gravado:", e?.code || e); }
    }catch(err){
      console.error(err);
      ui.erro = err?.code === "permission-denied"
        ? "Sem permissão: publique as regras do Firestore para config/app."
        : "Não foi possível salvar agora. Tente de novo.";
    }
    ui.salvando = false; render();
    carregarLog();
  }

  function montarLiberacao(d){
    const dias = Math.min(30, Math.max(1, Number(d.libDias) || 3));
    const agora = new Date();
    return {
      ativa: true,
      mensagem: comAss(d.libMensagem),
      itens: d.libItens,
      publicadoEm: agora.toISOString(),
      ate: new Date(agora.getTime() + dias * 86400000).toISOString(),
    };
  }

  async function click(el){
    const a = el.dataset.action;
    // Fechar o pop-up vale pra qualquer pessoa (não só o dev).
    if(a === "dev-popup-fechar"){
      if(ehDev()) ui.preview = false;
      else popupItens().forEach(i => vistos.add(i.key));
      render();
      return;
    }
    const d = ui.draft || (garantirDraft(), ui.draft);
    if(!ehDev()) return;

    if(a === "dev-aba"){
      ui.aba = el.dataset.key; ui.msg = ""; ui.erro = ""; render();
      if(ui.aba === "historico") carregarLog();
    } else if(a === "dev-gerar"){
      ui.sugestoes = gerarMensagens(d.tipoMsg, d.palavras); render();
    } else if(a === "dev-usar-msg"){
      const texto = ui.sugestoes[Number(el.dataset.i)] || "";
      const destino = el.dataset.destino;
      if(destino === "manut") d.mensagem = texto;
      else if(destino === "aviso") d.avisoTexto = texto;
      else d.libMensagem = texto;
      ui.msg = "Mensagem aplicada. Revise e clique em salvar/publicar."; ui.erro = ""; render();
    } else if(a === "dev-assinatura-salvar"){
      await salvar({ assinatura: d.assinatura.trim() || ASSINATURA_PADRAO }, "Assinatura atualizada.", d.assinatura.trim());
    } else if(a === "dev-preview-popup"){
      ui.preview = true; render();
    } else if(a === "dev-manut-ativar" || a === "dev-manut-salvar"){
      if(!periodoOk(d.mInicio, d.mFim)) return;
      const ativa = a === "dev-manut-ativar" ? true : !!cfg().manutencao?.ativa;
      const manut = { ativa, mensagem: comAss(d.mensagem), previsao: d.previsao.trim(), inicio: d.mInicio || "", fim: d.mFim || "" };
      const futura = tempo(manut.inicio) !== null && tempo(manut.inicio) > Date.now();
      await salvar({ manutencao: manut },
        a === "dev-manut-ativar" ? (futura ? "Manutenção agendada." : "Manutenção ativada.") : "Mensagem e período atualizados.",
        [semAss(manut.mensagem), periodoTxt(manut.inicio, manut.fim)].filter(Boolean).join(" · "));
    } else if(a === "dev-manut-desativar"){
      await salvar({ manutencao: { ativa: false, mensagem: comAss(d.mensagem), previsao: d.previsao.trim(), inicio: d.mInicio || "", fim: d.mFim || "" } },
        "Manutenção desativada/cancelada. App liberado.", semAss(d.mensagem));
    } else if(a === "dev-manut-desativar-avisar"){
      await salvar({
        manutencao: { ativa: false, mensagem: comAss(d.mensagem), previsao: d.previsao.trim(), inicio: d.mInicio || "", fim: d.mFim || "" },
        liberacao: montarLiberacao(d),
      }, "Manutenção desativada e aviso de “app liberado” publicado.", semAss(d.libMensagem));
    } else if(a === "dev-aviso-publicar"){
      if(!d.avisoTexto.trim()){ ui.erro = "Escreva o texto do aviso."; render(); return; }
      if(!periodoOk(d.aInicio, d.aFim)) return;
      await salvar({ aviso: { ativo: true, tipo: d.avisoTipo, texto: comAss(d.avisoTexto), inicio: d.aInicio || "", fim: d.aFim || "" } }, "Aviso publicado.",
        [d.avisoTexto.trim(), periodoTxt(d.aInicio, d.aFim)].filter(Boolean).join(" · "));
    } else if(a === "dev-aviso-remover"){
      await salvar({ aviso: { ativo: false, tipo: d.avisoTipo, texto: comAss(d.avisoTexto), inicio: d.aInicio || "", fim: d.aFim || "" } }, "Aviso removido.");
    } else if(a === "dev-lib-toggle"){
      const { perfil, key } = el.dataset;
      const lista = d.libItens[perfil] || (d.libItens[perfil] = []);
      const i = lista.indexOf(key);
      if(i >= 0) lista.splice(i, 1); else lista.push(key);
      render();
    } else if(a === "dev-lib-todos"){
      const perfil = el.dataset.perfil;
      const todos = CATALOGO_MODULOS[perfil].map(([k]) => k);
      d.libItens[perfil] = (d.libItens[perfil] || []).length === todos.length ? [] : todos;
      render();
    } else if(a === "dev-lib-publicar"){
      if(!d.libMensagem.trim()){ ui.erro = "Escreva a mensagem de liberação."; render(); return; }
      await salvar({ liberacao: montarLiberacao(d) }, "Processos liberados publicados.", semAss(d.libMensagem));
    } else if(a === "dev-lib-remover"){
      await salvar({ liberacao: { ...(cfg().liberacao || {}), ativa: false } }, "Aviso de processos liberados retirado.");
    } else if(a === "dev-log-atualizar"){
      await carregarLog();
    } else if(a === "dev-modulo"){
      const { perfil, key } = el.dataset;
      const aberto = cfg().modulos?.[perfil]?.[key] !== false;
      await salvar({ modulos: { [perfil]: { [key]: !aberto } } }, `Módulo ${aberto ? "bloqueado" : "liberado"}.`, `${perfil} › ${key}`);
    } else if(a === "dev-liberar-todos"){
      const perfil = el.dataset.perfil;
      const todos = Object.fromEntries(CATALOGO_MODULOS[perfil].map(([k]) => [k, true]));
      await salvar({ modulos: { [perfil]: todos } }, "Todos os módulos liberados.", perfil);
    }
  }

  return { aoAbrir: carregarLog, popupHtml, eventosCalendario, iniciarConfig, emManutencao, moduloBloqueado, filtrarNav, moduloIndisponivel, telaManutencao, bannerHtml, view, click };
}
