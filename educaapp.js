/* ================================================================== */
/* Mock data — famílias                                                 */
/* ================================================================== */
const STUDENTS = [
  {
    id: "s1",
    name: "Ana Beatriz Souza",
    turma: "5º Ano B",
    foto: "AB",
    notas: [
      { materia: "Matemática", nota: 8.5, bimestre: "3º Bim." },
      { materia: "Português", nota: 9.2, bimestre: "3º Bim." },
      { materia: "Ciências", nota: 7.8, bimestre: "3º Bim." },
      { materia: "História", nota: 8.9, bimestre: "3º Bim." },
      { materia: "Geografia", nota: 8.1, bimestre: "3º Bim." },
    ],
    presenca: {
      percentual: 96,
      faltasMes: 1,
      registros: [
        { data: "28/08", status: "presente" },
        { data: "27/08", status: "presente" },
        { data: "26/08", status: "falta" },
        { data: "25/08", status: "presente" },
        { data: "24/08", status: "presente" },
      ],
    },
    financeiro: {
      status: "Em dia",
      proxima: "10/09/2026",
      valor: "R$ 850,00",
      historico: [
        { mes: "Ago/2026", status: "Pago", data: "08/08/2026" },
        { mes: "Jul/2026", status: "Pago", data: "07/07/2026" },
        { mes: "Jun/2026", status: "Pago", data: "10/06/2026" },
      ],
    },
    comunicados: [
      { titulo: "Reunião de pais — 3º bimestre", data: "02/09", urgente: true },
      { titulo: "Passeio ao Museu de Ciências", data: "29/08", urgente: false },
    ],
  },
  {
    id: "s2",
    name: "Miguel Souza",
    turma: "2º Ano A",
    foto: "MS",
    notas: [
      { materia: "Matemática", nota: 9.6, bimestre: "3º Bim." },
      { materia: "Português", nota: 8.4, bimestre: "3º Bim." },
      { materia: "Ciências", nota: 9.0, bimestre: "3º Bim." },
    ],
    presenca: {
      percentual: 100,
      faltasMes: 0,
      registros: [
        { data: "28/08", status: "presente" },
        { data: "27/08", status: "presente" },
        { data: "26/08", status: "presente" },
        { data: "25/08", status: "presente" },
        { data: "24/08", status: "presente" },
      ],
    },
    financeiro: {
      status: "Em dia",
      proxima: "10/09/2026",
      valor: "R$ 690,00",
      historico: [
        { mes: "Ago/2026", status: "Pago", data: "05/08/2026" },
        { mes: "Jul/2026", status: "Pago", data: "04/07/2026" },
      ],
    },
    comunicados: [
      { titulo: "Reunião de pais — 3º bimestre", data: "02/09", urgente: true },
    ],
  },
];

/* O aluno logado diretamente (perfil "Sou aluno") — vê só os próprios dados,
   sem o seletor de irmãos e sem a aba financeira. */
const ALUNO_LOGADO = STUDENTS[1];

/* ================================================================== */
/* Mock data — escolas (institucional)                                  */
/* ================================================================== */
const SCHOOLS = {
  salto: {
    nome: "Salto do Lontra",
    uf: "PR",
    data: "28 de agosto de 2026",
    turmas: [
      { nome: "1º Ano A", alunos: 24, faltasHoje: 1, frequencia: 97 },
      { nome: "2º Ano A", alunos: 26, faltasHoje: 0, frequencia: 99 },
      { nome: "3º Ano B", alunos: 25, faltasHoje: 4, frequencia: 89 },
      { nome: "4º Ano A", alunos: 27, faltasHoje: 2, frequencia: 93 },
      { nome: "5º Ano B", alunos: 28, faltasHoje: 3, frequencia: 94 },
      { nome: "6º Ano C", alunos: 30, faltasHoje: 6, frequencia: 86 },
    ],
    faltantes: [
      { nome: "Rafael Nunes Costa", turma: "6º Ano C", faltasMes: 6, ultima: "28/08" },
      { nome: "Bruna Alcântara Lima", turma: "3º Ano B", faltasMes: 5, ultima: "28/08" },
      { nome: "Yuri Passos Andrade", turma: "6º Ano C", faltasMes: 5, ultima: "27/08" },
      { nome: "Camila Duarte Reis", turma: "4º Ano A", faltasMes: 4, ultima: "26/08" },
    ],
    financeiro: {
      previsto: "R$ 148.900",
      recebido: "R$ 131.240",
      recebidoPct: "88% do previsto",
      variacao: "4% vs. julho",
      inadimplenciaValor: "R$ 17.660",
      inadimplenciaPct: "12% das mensalidades",
    },
    inadimplentes: [
      { nome: "Fam. Passos Andrade", aluno: "Yuri Passos Andrade", valor: "R$ 780,00", atraso: "32 dias" },
      { nome: "Fam. Cardoso Melo", aluno: "Heitor Cardoso Melo", valor: "R$ 690,00", atraso: "18 dias" },
      { nome: "Fam. Nogueira Braga", aluno: "Sofia Nogueira Braga", valor: "R$ 850,00", atraso: "9 dias" },
    ],
    alunos: [
      { nome: "Ana Beatriz Souza", turma: "5º Ano B" },
      { nome: "Miguel Souza", turma: "2º Ano A" },
      { nome: "Rafael Nunes Costa", turma: "6º Ano C" },
      { nome: "Bruna Alcântara Lima", turma: "3º Ano B" },
      { nome: "Yuri Passos Andrade", turma: "6º Ano C" },
      { nome: "Camila Duarte Reis", turma: "4º Ano A" },
    ],
  },
  novaprata: {
    nome: "Nova Prata do Iguaçu",
    uf: "PR",
    data: "28 de agosto de 2026",
    turmas: [
      { nome: "1º Ano A", alunos: 19, faltasHoje: 0, frequencia: 98 },
      { nome: "2º Ano B", alunos: 21, faltasHoje: 2, frequencia: 92 },
      { nome: "3º Ano A", alunos: 20, faltasHoje: 1, frequencia: 96 },
      { nome: "4º Ano B", alunos: 22, faltasHoje: 5, frequencia: 84 },
      { nome: "5º Ano A", alunos: 23, faltasHoje: 3, frequencia: 90 },
    ],
    faltantes: [
      { nome: "Heitor Cardoso Melo", turma: "4º Ano B", faltasMes: 7, ultima: "28/08" },
      { nome: "Sofia Nogueira Braga", turma: "5º Ano A", faltasMes: 4, ultima: "27/08" },
      { nome: "Lucas Martins Vieira", turma: "4º Ano B", faltasMes: 4, ultima: "26/08" },
    ],
    financeiro: {
      previsto: "R$ 98.400",
      recebido: "R$ 89.930",
      recebidoPct: "91% do previsto",
      variacao: "2% vs. julho",
      inadimplenciaValor: "R$ 8.470",
      inadimplenciaPct: "9% das mensalidades",
    },
    inadimplentes: [
      { nome: "Fam. Cardoso Melo", aluno: "Heitor Cardoso Melo", valor: "R$ 690,00", atraso: "24 dias" },
      { nome: "Fam. Martins Vieira", aluno: "Lucas Martins Vieira", valor: "R$ 610,00", atraso: "11 dias" },
    ],
    alunos: [
      { nome: "Heitor Cardoso Melo", turma: "4º Ano B" },
      { nome: "Sofia Nogueira Braga", turma: "5º Ano A" },
      { nome: "Lucas Martins Vieira", turma: "4º Ano B" },
    ],
  },
};

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
};

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

/* ================================================================== */
/* App state                                                            */
/* ================================================================== */
const state = {
  screen: "login",        // login | role | escola | aluno | familia | instituicao
  alunoTab: "notas",
  familiaTab: "notas",
  familiaStudentId: STUDENTS[0].id,
  escolaId: null,          // "salto" | "novaprata"
  instTab: "turmas",
  alunosBusca: "",
};

const app = document.getElementById("app");

function render(){
  if(state.screen === "login") app.innerHTML = renderLogin();
  else if(state.screen === "role") app.innerHTML = renderRole();
  else if(state.screen === "escola") app.innerHTML = renderEscolaPicker();
  else if(state.screen === "aluno") app.innerHTML = renderAluno();
  else if(state.screen === "familia") app.innerHTML = renderFamilia();
  else if(state.screen === "instituicao") app.innerHTML = renderInstituicao();
  bindEvents();
}

/* ---------------- LOGIN ---------------- */
function renderLogin(){
  return `
  <div class="screen">
    <div class="login-box">
      <div class="brand-mark">${markSvg(56)}</div>
      <div class="brand-word">Educa<span class="plus">+</span></div>
      <div class="brand-sub">Centro Educacional</div>
      <form id="login-form" class="login-card" style="margin-top:30px;">
        <label class="field-label">E-mail</label>
        <input class="field-input" type="email" required placeholder="seunome@email.com" />
        <label class="field-label" style="margin-top:16px;">Senha</label>
        <input class="field-input" type="password" required placeholder="••••••••" />
        <div class="forgot-row">
          <button type="button" class="link-btn">Esqueci minha senha</button>
        </div>
        <button type="submit" class="btn-gold">Entrar</button>
      </form>
      <p class="login-foot">Precisa de acesso? Fale com a secretaria da unidade.</p>
    </div>
  </div>`;
}

/* ---------------- ROLE SELECT ---------------- */
function renderRole(){
  return `
  <div class="screen">
    <div class="picker-box">
      <button class="back-btn" data-action="back-to-login">${ICONS.chevronLeft} Voltar</button>
      <h1 class="picker-title">Como você acessa o Educa+?</h1>
      <p class="picker-desc">Escolha o tipo de acesso para ver as informações certas para você.</p>
      <div class="picker-grid three">
        <button class="picker-card" data-action="go-aluno">
          <div class="picker-icon">${ICONS.user}</div>
          <div>
            <div class="picker-card-title">Sou aluno</div>
            <div class="picker-card-desc">Minhas notas, presença e comunicados.</div>
          </div>
          <div class="picker-cta">Continuar ${ICONS.chevronRight}</div>
        </button>
        <button class="picker-card" data-action="go-familia">
          <div class="picker-icon">${ICONS.users2}</div>
          <div>
            <div class="picker-card-title">Sou responsável</div>
            <div class="picker-card-desc">Notas, presença, comunicados e financeiro dos meus filhos.</div>
          </div>
          <div class="picker-cta">Continuar ${ICONS.chevronRight}</div>
        </button>
        <button class="picker-card" data-action="go-escola">
          <div class="picker-icon">${ICONS.building}</div>
          <div>
            <div class="picker-card-title">Sou da instituição</div>
            <div class="picker-card-desc">Turmas, frequência, financeiro e gestão escolar.</div>
          </div>
          <div class="picker-cta">Continuar ${ICONS.chevronRight}</div>
        </button>
      </div>
    </div>
  </div>`;
}

/* ---------------- ESCOLA PICKER (só para o fluxo institucional) ---------------- */
function renderEscolaPicker(){
  return `
  <div class="screen">
    <div class="picker-box narrow">
      <button class="back-btn" data-action="back-to-role">${ICONS.chevronLeft} Voltar</button>
      <h1 class="picker-title">Qual unidade você acessa?</h1>
      <p class="picker-desc">Selecione a escola para carregar as turmas e o financeiro certos.</p>
      <div class="picker-grid">
        <button class="picker-card" data-action="select-escola" data-escola="salto">
          <div class="picker-icon">${ICONS.pin}</div>
          <div>
            <div class="picker-card-title">Salto do Lontra</div>
            <div class="picker-card-desc">Paraná — PR</div>
          </div>
          <div class="picker-cta">Entrar ${ICONS.chevronRight}</div>
        </button>
        <button class="picker-card" data-action="select-escola" data-escola="novaprata">
          <div class="picker-icon">${ICONS.pin}</div>
          <div>
            <div class="picker-card-title">Nova Prata do Iguaçu</div>
            <div class="picker-card-desc">Paraná — PR</div>
          </div>
          <div class="picker-cta">Entrar ${ICONS.chevronRight}</div>
        </button>
      </div>
    </div>
  </div>`;
}

/* ---------------- SHELL (sidebar + main) ---------------- */
function shell({ navItems, active, headerSub, headerTitle, bodyHtml, navAction, schoolBadge }){
  const navBtns = navItems.map(item => `
    <button class="nav-btn ${active===item.key?'active':''}" data-action="${navAction}" data-key="${item.key}">
      ${ICONS[item.icon]} ${item.label}
    </button>`).join("");

  const mobileBtns = navItems.map(item => `
    <button class="mobile-nav-btn ${active===item.key?'active':''}" data-action="${navAction}" data-key="${item.key}">
      ${ICONS[item.icon]} <span>${item.label}</span>
    </button>`).join("");

  return `
  <div class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        ${markSvg(30)}
        <div>
          <div class="sidebar-brand-word">Educa<span class="plus">+</span></div>
          <div class="sidebar-brand-sub">CENTRO EDUCACIONAL</div>
        </div>
      </div>
      ${schoolBadge ? `<div class="sidebar-school">${schoolBadge}</div>` : ""}
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
    <nav class="mobile-nav">${mobileBtns}</nav>
  </div>`;
}

/* ---------------- ALUNO DASHBOARD (login direto do aluno) ---------------- */
function renderAluno(){
  const student = ALUNO_LOGADO;
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
    headerSub: `ALUNO · ${student.turma}`, headerTitle: student.name,
    bodyHtml: body,
    navAction: "set-aluno-tab",
  });
}

/* ---------------- FAMÍLIA (RESPONSÁVEL) DASHBOARD ---------------- */
function renderFamilia(){
  const student = STUDENTS.find(s => s.id === state.familiaStudentId);
  const navItems = [
    { key:"notas", label:"Notas", icon:"cap" },
    { key:"presenca", label:"Presença", icon:"clipboard" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"comunicados", label:"Comunicados", icon:"megaphone" },
  ];

  let switcher = "";
  if(STUDENTS.length > 1){
    switcher = `<div class="student-switch">` + STUDENTS.map(s => `
      <button class="student-chip ${s.id===state.familiaStudentId?'active':''}" data-action="switch-student" data-id="${s.id}">
        <span class="student-avatar">${s.foto}</span>
        <span class="student-chip-name">${s.name.split(" ")[0]}</span>
        <span class="student-chip-turma">· ${s.turma}</span>
      </button>`).join("") + `</div>`;
  }

  let body = "";
  if(state.familiaTab === "notas") body = notasView(student);
  else if(state.familiaTab === "presenca") body = presencaView(student);
  else if(state.familiaTab === "financeiro") body = financeiroFamiliaView(student);
  else if(state.familiaTab === "comunicados") body = comunicadosView(student);

  return shell({
    navItems, active: state.familiaTab,
    headerSub: "RESPONSÁVEL", headerTitle: student.name,
    bodyHtml: switcher + body,
    navAction: "set-familia-tab",
  });
}

function notasView(student){
  const media = (student.notas.reduce((a,n)=>a+n.nota,0)/student.notas.length).toFixed(1);
  const rows = student.notas.map(n => `
    <div class="row">
      <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${n.materia}</span>
      <span style="font-size:15px;font-weight:700;color:${n.nota>=7?'var(--green)':'var(--red)'}">${n.nota.toFixed(1)}</span>
    </div>`).join("");
  return `
    <h2 class="section-title" style="display:inline-block;margin-right:12px;">Boletim</h2>
    <span class="pill ${media>=7?'pill-green':'pill-red'}">Média geral ${media}</span>
    <p class="section-eyebrow">${student.turma} · ${student.notas[0]?.bimestre||''}</p>
    <div class="card flush">${rows}</div>`;
}

function presencaView(student){
  const rows = student.presenca.registros.map(r => `
    <div class="row">
      <span style="font-size:14px;color:var(--ink);">${r.data}</span>
      ${r.status==="presente"
        ? `<span class="pill pill-green">${ICONS.check} Presente</span>`
        : `<span class="pill pill-red">${ICONS.warn} Falta</span>`}
    </div>`).join("");
  return `
    <h2 class="section-title">Presença</h2>
    <p class="section-eyebrow">Ano letivo de 2026</p>
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
      <span style="color:var(--ink);">${h.mes}</span>
      <span style="color:var(--slate);">${h.data}</span>
      <span class="pill pill-green">${h.status}</span>
    </div>`).join("");
  return `
    <h2 class="section-title">Financeiro</h2>
    <p class="section-eyebrow">Mensalidades da matrícula</p>
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-size:13px;color:var(--slate);">Situação atual</div>
          <div style="margin-top:4px;"><span class="pill pill-green">${ICONS.check} ${student.financeiro.status}</span></div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--slate);">Próximo vencimento</div>
          <div style="font-size:15px;font-weight:600;color:var(--ink);margin-top:4px;">${student.financeiro.proxima}</div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--slate);">Valor</div>
          <div style="font-size:15px;font-weight:600;color:var(--ink);margin-top:4px;">${student.financeiro.valor}</div>
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
        <div style="font-size:15px;font-weight:600;color:var(--ink);">${c.titulo}</div>
        <div style="font-size:13px;color:var(--slate);margin-top:3px;">${c.data}</div>
      </div>
      ${c.urgente ? `<span class="pill pill-red">Importante</span>` : ""}
    </div>`).join("");
  return `
    <h2 class="section-title">Comunicados</h2>
    <p class="section-eyebrow">Avisos da turma e da escola</p>
    <div>${items}</div>`;
}

/* ---------------- INSTITUIÇÃO DASHBOARD ---------------- */
function renderInstituicao(){
  const school = SCHOOLS[state.escolaId] || SCHOOLS.salto;
  const navItems = [
    { key:"turmas", label:"Turmas & faltas", icon:"clipboard" },
    { key:"financeiro", label:"Financeiro", icon:"wallet" },
    { key:"alunos", label:"Alunos", icon:"users" },
  ];
  const titles = { turmas:"Turmas e faltas", financeiro:"Financeiro", alunos:"Alunos" };

  let body = "";
  if(state.instTab === "turmas") body = turmasView(school);
  else if(state.instTab === "financeiro") body = financeiroInstituicaoView(school);
  else if(state.instTab === "alunos") body = alunosView(school);

  return shell({
    navItems, active: state.instTab,
    headerSub: "ÁREA DA INSTITUIÇÃO", headerTitle: titles[state.instTab],
    bodyHtml: body,
    navAction: "set-inst-tab",
    schoolBadge: `${ICONS.pinSmall} ${school.nome} — ${school.uf}`,
  });
}

function turmasView(school){
  const cards = school.turmas.map(t => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:15.5px;font-weight:600;color:var(--ink);">${t.nome}</div>
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
    </div>`).join("");

  const faltantes = school.faltantes.map(a => `
    <div class="row">
      <div>
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${a.nome}</div>
        <div style="font-size:12.5px;color:var(--slate);">${a.turma} · última falta em ${a.ultima}</div>
      </div>
      <span class="pill pill-red">${a.faltasMes} faltas</span>
    </div>`).join("");

  return `
    <h2 class="section-title">Frequência de hoje</h2>
    <p class="section-eyebrow">${school.data}</p>
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
        <div style="font-size:14.5px;font-weight:600;color:var(--ink);">${x.nome}</div>
        <div style="font-size:12.5px;color:var(--slate);">${x.aluno} · ${x.valor}</div>
      </div>
      <span class="pill pill-red">${ICONS.clock} ${x.atraso}</span>
    </div>`).join("");

  return `
    <h2 class="section-title">Visão geral</h2>
    <p class="section-eyebrow">Agosto de 2026</p>
    <div class="grid-cards">
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Receita prevista</div>
        <div style="font-family:var(--font-display);font-size:26px;color:var(--ink);">${f.previsto}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:6px;color:var(--green);font-size:12.5px;">${ICONS.trendUp} ${f.variacao}</div>
      </div>
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Recebido</div>
        <div style="font-family:var(--font-display);font-size:26px;color:var(--ink);">${f.recebido}</div>
        <div style="font-size:12.5px;color:var(--slate);margin-top:6px;">${f.recebidoPct}</div>
      </div>
      <div class="card">
        <div style="font-size:13px;color:var(--slate);margin-bottom:6px;">Inadimplência</div>
        <div style="font-family:var(--font-display);font-size:26px;color:var(--red);">${f.inadimplenciaValor}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:6px;color:var(--red);font-size:12.5px;">${ICONS.trendDown} ${f.inadimplenciaPct}</div>
      </div>
    </div>
    <h2 class="section-title">Famílias em atraso</h2>
    <p class="section-eyebrow">Ordenado por dias de atraso</p>
    <div class="card flush">${inad}</div>`;
}

function alunosView(school){
  const busca = state.alunosBusca.toLowerCase();
  const filtrados = school.alunos.filter(s => s.nome.toLowerCase().includes(busca));
  const rows = filtrados.map(s => `
    <div class="row">
      <span style="font-size:14.5px;color:var(--ink);font-weight:500;">${s.nome}</span>
      <span style="font-size:12.5px;color:var(--slate);">${s.turma}</span>
    </div>`).join("") || `<div style="padding:20px;font-size:14px;color:var(--slate);">Nenhum aluno encontrado.</div>`;

  return `
    <h2 class="section-title">Alunos matriculados</h2>
    <p class="section-eyebrow">${school.alunos.length} alunos ativos em ${school.nome}</p>
    <div class="search-wrap">
      ${ICONS.search}
      <input class="search-input" id="alunos-busca" placeholder="Buscar aluno pelo nome" value="${state.alunosBusca}" />
    </div>
    <div class="card flush">${rows}</div>`;
}

/* ================================================================== */
/* Event binding                                                       */
/* ================================================================== */
function bindEvents(){
  const loginForm = document.getElementById("login-form");
  if(loginForm){
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      state.screen = "role";
      render();
    });
  }

  app.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", () => {
      const action = el.getAttribute("data-action");
      if(action === "back-to-login"){ state.screen = "login"; render(); }
      else if(action === "back-to-role"){ state.screen = "role"; render(); }
      else if(action === "go-aluno"){ state.screen = "aluno"; render(); }
      else if(action === "go-familia"){ state.screen = "familia"; render(); }
      else if(action === "go-escola"){ state.screen = "escola"; render(); }
      else if(action === "select-escola"){ state.escolaId = el.getAttribute("data-escola"); state.screen = "instituicao"; render(); }
      else if(action === "logout"){ state.screen = "login"; state.escolaId = null; render(); }
      else if(action === "switch-student"){ state.familiaStudentId = el.getAttribute("data-id"); render(); }
      else if(action === "set-aluno-tab"){ state.alunoTab = el.getAttribute("data-key"); render(); }
      else if(action === "set-familia-tab"){ state.familiaTab = el.getAttribute("data-key"); render(); }
      else if(action === "set-inst-tab"){ state.instTab = el.getAttribute("data-key"); render(); }
    });
  });

  const buscaInput = document.getElementById("alunos-busca");
  if(buscaInput){
    buscaInput.addEventListener("input", (e) => {
      state.alunosBusca = e.target.value;
      const caret = e.target.selectionStart;
      render();
      const input2 = document.getElementById("alunos-busca");
      if(input2){ input2.focus(); input2.setSelectionRange(caret, caret); }
    });
  }
}

render();
