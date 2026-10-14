// --- Firebase --- //
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlZAZjT8ZOWPf40Tf4lowdXcWxO179e1I",
  authDomain: "ana-makeup-bot.firebaseapp.com",
  projectId: "ana-makeup-bot",
  storageBucket: "ana-makeup-bot.firebasestorage.app",
  messagingSenderId: "448009074377",
  appId: "1:448009074377:web:fe1f01d20f35be123f7f18"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Elementos --- //
const loginContainer = document.getElementById("loginContainer");
const adminContainer = document.getElementById("adminContainer");
const usuarioInput = document.getElementById("usuario");
const senhaInput = document.getElementById("senha");
const btnLogin = document.getElementById("btnLogin");
const erroLogin = document.getElementById("erroLogin");
const btnLogout = document.getElementById("btnLogout");
const tabelaAgendamentos = document.getElementById("tabelaAgendamentos");
const totalAgendamentos = document.getElementById("totalAgendamentos");
const valorTotal = document.getElementById("valorTotal");
const pagamentosResumo = document.getElementById("pagamentosResumo");
const btnExportar = document.getElementById("btnExportar");
const btnApagarMes = document.getElementById("btnApagarMes");
const btnNovoAtendimento = document.getElementById("btnNovoAtendimento");

// --- Despesas: elementos --- //
const tabelaDespesas = document.getElementById("tabelaDespesas");
const valorDespesasEl = document.getElementById("valorDespesas");
const valorLiquidoEl = document.getElementById("valorLiquido");
const btnNovaDespesa = document.getElementById("btnNovaDespesa");
const modalDespesa = document.getElementById("modalDespesa");
const fecharModalDespesa = document.getElementById("fecharModalDespesa");
const salvarDespesaBtn = document.getElementById("salvarDespesa");

// Totais globais usados para calcular o valor líquido (bruto - despesas)
let totalBrutoGlobal = 0;
let totalDespesasGlobal = 0;

// Estado do filtro de mês: "todos" por padrão (antes controlado pela opção
// "Todos os Meses" dentro do <select>, agora controlado pelo botão dedicado)
let filtroMesAtual = "todos";

function atualizarResumoLiquido() {
  const liquido = totalBrutoGlobal - totalDespesasGlobal;
  if (valorLiquidoEl) {
    valorLiquidoEl.innerHTML = `<strong>Valor líquido: R$ ${liquido.toFixed(2)}</strong>`;
  }
}

// --- Login --- //
btnLogin.addEventListener("click", async () => {
  const email = usuarioInput.value.trim();
  const senha = senhaInput.value.trim();
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    erroLogin.style.display = "none";
  } catch {
    erroLogin.style.display = "block";
  }
});

// --- Logout --- //
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

// --- Observa login --- //
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginContainer.style.display = "none";
    adminContainer.style.display = "block";
    criarFiltros();
    carregarAgendamentos();
    carregarDespesas();
    verificarAniversariantesHoje();
    setTimeout(verificarFinalizacoes, 4000);
    // Espera o layout renderizar para calcular a posição do cabeçalho fixo
    requestAnimationFrame(ajustarHeaderFixo);
    setTimeout(ajustarHeaderFixo, 300); // recalcula após fontes/ícones carregarem
  } else {
    adminContainer.style.display = "none";
    loginContainer.style.display = "flex";
    usuarioInput.value = "";
    senhaInput.value = "";
  }
});

// --- Cabeçalho fixo: mantém os botões sempre visíveis, logo abaixo do
//     cabeçalho do site, independente da rolagem da página --- //
function ajustarHeaderFixo() {
  const siteHeaderEl = document.querySelector(".site-header");
  const adminHeaderEl = document.getElementById("adminHeader");
  const spacerEl = document.getElementById("adminHeaderSpacer");
  if (!siteHeaderEl || !adminHeaderEl || !spacerEl) return;

  const topOffset = siteHeaderEl.offsetHeight;
  adminHeaderEl.style.top = `${topOffset}px`;
  spacerEl.style.height = `${adminHeaderEl.offsetHeight + 10}px`;
}

window.addEventListener("resize", () => {
  if (adminContainer.style.display !== "none") ajustarHeaderFixo();
});

// --- Criar filtros de mês e dia --- //
// Meses do filtro: por padrão, do mês atual até 12 meses à frente.
// Os meses anteriores só aparecem se a opção "Mostrar meses anteriores" for marcada.
const nomesMesesFiltro = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let mostrarMesesAnteriores = false;

function mesesFiltro() {
  const lista = [];
  const hoje = new Date();
  const inicio = mostrarMesesAnteriores ? new Date(2025, 10, 1) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 12, 1);
  for (let d = inicio; d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    lista.push({
      nome: `${nomesMesesFiltro[d.getMonth()]} ${d.getFullYear()}`,
      mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    });
  }
  return lista;
}

function criarFiltros() {
  if (document.getElementById("filtrosContainer")) return;
  const filtrosContainer = document.createElement("div");
  filtrosContainer.id = "filtrosContainer";
  filtrosContainer.style.display = "none"; // começa escondido, some botão "🔍 Filtros" que revela
  filtrosContainer.style.justifyContent = "center";
  filtrosContainer.style.alignItems = "center";
  filtrosContainer.style.flexWrap = "wrap";
  filtrosContainer.style.gap = "10px";
  filtrosContainer.style.marginBottom = "15px";

  const selectMes = document.createElement("select");
  selectMes.id = "filtroMes";
  selectMes.style.padding = "6px";
  selectMes.style.borderRadius = "6px";

  const popularMesesFiltro = () => {
    const anterior = selectMes.value;
    selectMes.innerHTML = "";
    mesesFiltro().forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.mes;
      opt.textContent = m.nome;
      selectMes.appendChild(opt);
    });
    if ([...selectMes.options].some(o => o.value === anterior)) selectMes.value = anterior;
    else selectMes.value = mesAtualYM();
  };
  popularMesesFiltro();

  const inputDia = document.createElement("input");
  inputDia.type = "date";
  inputDia.id = "filtroDia";
  inputDia.style.padding = "6px";
  inputDia.style.borderRadius = "6px";

  const btnFiltrar = document.createElement("button");
  btnFiltrar.textContent = "🔍 Filtrar";
  btnFiltrar.className = "btnSecundario";
  btnFiltrar.onclick = () => {
    filtroMesAtual = selectMes.value;
    carregarAgendamentos();
    carregarDespesas();
  };

  const btnTodosMeses = document.createElement("button");
  btnTodosMeses.textContent = "📅 Mês atual em diante";
  btnTodosMeses.className = "btnSecundario";
  btnTodosMeses.onclick = () => {
    filtroMesAtual = "todos";
    inputDia.value = "";
    carregarAgendamentos();
    carregarDespesas();
  };

  const lblAnteriores = document.createElement("label");
  lblAnteriores.style.cssText = "display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--text-soft);cursor:pointer";
  const chkAnteriores = document.createElement("input");
  chkAnteriores.type = "checkbox";
  chkAnteriores.id = "chkMesesAnteriores";
  chkAnteriores.onchange = () => {
    mostrarMesesAnteriores = chkAnteriores.checked;
    popularMesesFiltro();
    carregarAgendamentos();
    carregarDespesas();
  };
  lblAnteriores.append(chkAnteriores, " Mostrar meses anteriores");

  filtrosContainer.append(selectMes, inputDia, btnFiltrar, btnTodosMeses, lblAnteriores);
  adminContainer.insertBefore(filtrosContainer, adminContainer.querySelector(".panel-title"));

  // Botão "🔍 Filtros" no cabeçalho abre/fecha o painel de filtros
  const btnFiltros = document.getElementById("btnFiltros");
  if (btnFiltros) {
    btnFiltros.onclick = () => {
      const aberto = filtrosContainer.style.display === "flex";
      filtrosContainer.style.display = aberto ? "none" : "flex";
    };
  }
}

// --- Disponibilidade: elementos e configuração --- //
const btnDisponibilidade = document.getElementById("btnDisponibilidade");
const modalDisponibilidade = document.getElementById("modalDisponibilidade");
const fecharDisponibilidade = document.getElementById("fecharDisponibilidade");
const salvarDisponibilidadeBtn = document.getElementById("salvarDisponibilidade");
const btnBloquearDia = document.getElementById("btnBloquearDia");
const btnBloquearHorario = document.getElementById("btnBloquearHorario");
const listaDiasBloqueados = document.getElementById("listaDiasBloqueados");
const listaHorariosBloqueados = document.getElementById("listaHorariosBloqueados");

const dispRef = doc(db, "disponibilidade", "config");

const DISPONIBILIDADE_PADRAO = {
  diasSemana: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
  periodos: {
    manha: { ativo: true, inicio: 6, fim: 11 },
    tarde: { ativo: true, inicio: 12, fim: 17 },
    noite: { ativo: true, inicio: 18, fim: 20 }
  },
  diasBloqueados: [],
  horariosBloqueados: {}
};

async function carregarConfigDisponibilidade() {
  try {
    const snap = await getDoc(dispRef);
    if (!snap.exists()) return JSON.parse(JSON.stringify(DISPONIBILIDADE_PADRAO));
    const dados = snap.data();
    return {
      diasSemana: { ...DISPONIBILIDADE_PADRAO.diasSemana, ...(dados.diasSemana || {}) },
      periodos: {
        manha: { ...DISPONIBILIDADE_PADRAO.periodos.manha, ...(dados.periodos?.manha || {}) },
        tarde: { ...DISPONIBILIDADE_PADRAO.periodos.tarde, ...(dados.periodos?.tarde || {}) },
        noite: { ...DISPONIBILIDADE_PADRAO.periodos.noite, ...(dados.periodos?.noite || {}) }
      },
      diasBloqueados: dados.diasBloqueados || [],
      horariosBloqueados: dados.horariosBloqueados || {}
    };
  } catch (e) {
    console.error("Erro ao carregar disponibilidade:", e);
    alert(
      "⚠️ Não foi possível carregar a Disponibilidade.\n\n" +
      "Erro: " + (e?.message || e) + "\n\n" +
      "Isso geralmente acontece porque as Regras de Segurança do Firestore ainda não liberam a coleção 'disponibilidade'. " +
      "Veja as instruções que te enviei para atualizar as regras no console do Firebase."
    );
    return JSON.parse(JSON.stringify(DISPONIBILIDADE_PADRAO));
  }
}

function renderListasBloqueios(config) {
  listaDiasBloqueados.innerHTML = "";
  (config.diasBloqueados || []).slice().sort().forEach((data) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>🚫 ${data.split("-").reverse().join("/")}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Liberar";
    btn.onclick = async () => {
      await setDoc(dispRef, { diasBloqueados: arrayRemove(data) }, { merge: true });
      abrirModalDisponibilidade();
    };
    li.appendChild(btn);
    listaDiasBloqueados.appendChild(li);
  });

  listaHorariosBloqueados.innerHTML = "";
  Object.entries(config.horariosBloqueados || {}).forEach(([data, horarios]) => {
    (horarios || []).forEach((hora) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>🚫 ${data.split("-").reverse().join("/")} às ${hora}</span>`;
      const btn = document.createElement("button");
      btn.textContent = "Liberar";
      btn.onclick = async () => {
        await setDoc(dispRef, { horariosBloqueados: { [data]: arrayRemove(hora) } }, { merge: true });
        abrirModalDisponibilidade();
      };
      li.appendChild(btn);
      listaHorariosBloqueados.appendChild(li);
    });
  });
}

async function abrirModalDisponibilidade() {
  const config = await carregarConfigDisponibilidade();

  document.querySelectorAll(".chkDiaSemana").forEach((chk) => {
    const dia = chk.dataset.dia;
    chk.checked = config.diasSemana[dia] !== false;
  });

  document.getElementById("ativoManha").checked = config.periodos.manha.ativo !== false;
  document.getElementById("inicioManha").value = config.periodos.manha.inicio;
  document.getElementById("fimManha").value = config.periodos.manha.fim;

  document.getElementById("ativoTarde").checked = config.periodos.tarde.ativo !== false;
  document.getElementById("inicioTarde").value = config.periodos.tarde.inicio;
  document.getElementById("fimTarde").value = config.periodos.tarde.fim;

  document.getElementById("ativoNoite").checked = config.periodos.noite.ativo !== false;
  document.getElementById("inicioNoite").value = config.periodos.noite.inicio;
  document.getElementById("fimNoite").value = config.periodos.noite.fim;

  renderListasBloqueios(config);
  modalDisponibilidade.style.display = "flex";
}

if (btnDisponibilidade) {
  btnDisponibilidade.addEventListener("click", abrirModalDisponibilidade);
  fecharDisponibilidade.addEventListener("click", () => modalDisponibilidade.style.display = "none");

  salvarDisponibilidadeBtn.addEventListener("click", async () => {
    const diasSemana = {};
    document.querySelectorAll(".chkDiaSemana").forEach((chk) => {
      diasSemana[chk.dataset.dia] = chk.checked;
    });

    const periodos = {
      manha: {
        ativo: document.getElementById("ativoManha").checked,
        inicio: parseInt(document.getElementById("inicioManha").value, 10),
        fim: parseInt(document.getElementById("fimManha").value, 10)
      },
      tarde: {
        ativo: document.getElementById("ativoTarde").checked,
        inicio: parseInt(document.getElementById("inicioTarde").value, 10),
        fim: parseInt(document.getElementById("fimTarde").value, 10)
      },
      noite: {
        ativo: document.getElementById("ativoNoite").checked,
        inicio: parseInt(document.getElementById("inicioNoite").value, 10),
        fim: parseInt(document.getElementById("fimNoite").value, 10)
      }
    };

    try {
      await setDoc(dispRef, { diasSemana, periodos }, { merge: true });
      alert("✅ Configurações de disponibilidade salvas!");
    } catch (e) {
      console.error("Erro ao salvar disponibilidade:", e);
      alert("⚠️ Erro ao salvar: " + (e?.message || e) + "\n\nVerifique as Regras de Segurança do Firestore para a coleção 'disponibilidade'.");
    }
  });

  btnBloquearDia.addEventListener("click", async () => {
    const data = document.getElementById("dataBloqueioDia").value;
    if (!data) return alert("Escolha uma data para bloquear.");
    try {
      await setDoc(dispRef, { diasBloqueados: arrayUnion(data) }, { merge: true });
      document.getElementById("dataBloqueioDia").value = "";
      abrirModalDisponibilidade();
    } catch (e) {
      console.error("Erro ao bloquear dia:", e);
      alert("⚠️ Erro ao bloquear: " + (e?.message || e));
    }
  });

  btnBloquearHorario.addEventListener("click", async () => {
    const data = document.getElementById("dataBloqueioHorario").value;
    const hora = document.getElementById("horaBloqueioHorario").value;
    if (!data || !hora) return alert("Escolha a data e o horário para bloquear.");
    try {
      await setDoc(dispRef, { horariosBloqueados: { [data]: arrayUnion(hora) } }, { merge: true });
      document.getElementById("dataBloqueioHorario").value = "";
      document.getElementById("horaBloqueioHorario").value = "";
      abrirModalDisponibilidade();
    } catch (e) {
      console.error("Erro ao bloquear horário:", e);
      alert("⚠️ Erro ao bloquear: " + (e?.message || e));
    }
  });

  window.addEventListener("click", (e) => {
    if (e.target === modalDisponibilidade) modalDisponibilidade.style.display = "none";
  });
}

// --- Sincroniza a coleção pública "horariosOcupados" (sem dados pessoais) ---
// usada pelo chat do site para saber quais horários já não estão mais livres.
async function adicionarHorarioOcupado(data, horario) {
  if (!data || !horario) return;
  try {
    await addDoc(collection(db, "horariosOcupados"), { data, horario });
  } catch (e) {
    console.error("Erro ao registrar horário ocupado:", e);
  }
}

async function removerHorarioOcupado(data, horario) {
  if (!data || !horario) return;
  try {
    const snap = await getDocs(
      query(collection(db, "horariosOcupados"), where("data", "==", data), where("horario", "==", horario))
    );
    for (const docSnap of snap.docs) {
      await deleteDoc(doc(db, "horariosOcupados", docSnap.id));
    }
  } catch (e) {
    console.error("Erro ao liberar horário ocupado:", e);
  }
}

// --- Utilidades --- //
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function brl(n) {
  return "R$ " + Number(n || 0).toFixed(2).replace(".", ",");
}

function tempoRestante(prazoISO) {
  const ms = new Date(prazoISO).getTime() - Date.now();
  if (isNaN(ms)) return { expirado: false, texto: "" };
  if (ms <= 0) return { expirado: true, texto: "Prazo expirado" };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { expirado: false, texto: `${h}h${String(m).padStart(2, "0")}min restantes` };
}

function sinalBadge(ag) {
  if (!ag.sinalValor) return "-";
  if (ag.sinalStatus === "pago") return `<span class="badge-sinal pago">✅ Pago</span>`;
  const t = tempoRestante(ag.sinalPrazo);
  return t.expirado
    ? `<span class="badge-sinal expirado">⚠️ Expirado</span>`
    : `<span class="badge-sinal">⏳ Aguardando</span>`;
}

function atualizarBotaoSinais(pendentes) {
  const btn = document.getElementById("btnSinais");
  if (btn) btn.textContent = pendentes > 0 ? `💰 Sinais (${pendentes})` : "💰 Sinais";
}

const MSG_LOCAL =
  `📍 Local: *Espaço Ana Luiza Makeup*  \n` +
  `Salto Do Lontra-PR\n` +
  `🗺️ https://maps.app.goo.gl/n74UzXbv88cw8Mbq5?g_st=ipc`;

// Abre o WhatsApp; aceita uma janela já aberta (evita bloqueio de pop-up após await)
function abrirWhatsApp(telefone, msg, janela) {
  const tel = (telefone || "").replace(/\D/g, "");
  const link = `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
  if (janela && !janela.closed) janela.location.href = link;
  else window.open(link, "_blank");
}

// --- Pagamentos: chave Pix, % da taxa de reserva e prazo --- //
const btnPagamentos = document.getElementById("btnPagamentos");
const modalPagamentos = document.getElementById("modalPagamentos");
const pagRef = doc(db, "configuracoes", "pagamento");

async function abrirModalPagamentos() {
  let cfg = { tipoChave: "CPF", chavePix: "", titular: "", percentualSinal: 50, prazoHoras: 12 };
  try {
    const snap = await getDoc(pagRef);
    if (snap.exists()) cfg = { ...cfg, ...snap.data() };
  } catch (e) {
    console.error("Erro ao carregar pagamentos:", e);
    alert(
      "⚠️ Não foi possível carregar as configurações de Pagamentos.\n\n" +
      "Erro: " + (e?.message || e) + "\n\n" +
      "Verifique as Regras de Segurança do Firestore para a coleção 'configuracoes'."
    );
  }
  document.getElementById("tipoChavePix").value = cfg.tipoChave || "CPF";
  document.getElementById("chavePix").value = cfg.chavePix || "";
  document.getElementById("titularPix").value = cfg.titular || "";
  document.getElementById("percentualSinal").value = cfg.percentualSinal ?? 50;
  document.getElementById("prazoHoras").value = cfg.prazoHoras ?? 12;
  modalPagamentos.style.display = "flex";
}

if (btnPagamentos) {
  btnPagamentos.addEventListener("click", abrirModalPagamentos);
  document.getElementById("fecharPagamentos").addEventListener("click", () => modalPagamentos.style.display = "none");
  window.addEventListener("click", (e) => { if (e.target === modalPagamentos) modalPagamentos.style.display = "none"; });

  document.getElementById("salvarPagamentos").addEventListener("click", async () => {
    const tipoChave = document.getElementById("tipoChavePix").value;
    const chavePix = document.getElementById("chavePix").value.trim();
    const titular = document.getElementById("titularPix").value.trim();
    const percentualSinal = parseFloat(document.getElementById("percentualSinal").value);
    const prazoHoras = parseFloat(document.getElementById("prazoHoras").value);

    if (!chavePix) return alert("Informe a chave Pix.");
    if (!(percentualSinal > 0 && percentualSinal <= 100)) return alert("A taxa de reserva deve ficar entre 1% e 100%.");
    if (!(prazoHoras >= 1)) return alert("O prazo deve ser de pelo menos 1 hora.");

    try {
      await setDoc(pagRef, { tipoChave, chavePix, titular, percentualSinal, prazoHoras }, { merge: true });
      alert("✅ Configurações de pagamento salvas!");
      modalPagamentos.style.display = "none";
    } catch (e) {
      console.error("Erro ao salvar pagamentos:", e);
      alert("⚠️ Erro ao salvar: " + (e?.message || e) + "\n\nVerifique as Regras de Segurança do Firestore para a coleção 'configuracoes'.");
    }
  });
}

// --- Sinais: conferir quem já pagou a taxa de reserva --- //
const btnSinais = document.getElementById("btnSinais");
const modalSinais = document.getElementById("modalSinais");
const listaSinais = document.getElementById("listaSinais");

function msgPagamentoConfirmado(ag) {
  const nome = ag.nome || "Maravilhosa";
  const data = ag.data ? ag.data.split("-").reverse().join("/") : "-";
  const restante = Math.max(Number(ag.valor || 0) - Number(ag.desconto || 0) - Number(ag.sinalValor || 0), 0);
  return (
`Olá ${nome} 😍✨

Recebemos o pagamento da sua taxa de reserva (${brl(ag.sinalValor)}). Muito obrigada! 🥰

Seu horário está confirmado:
📅 *${data}* às *${ag.horario}*
💄 ${ag.procedimento}

O restante (${brl(restante)}) é pago no dia do atendimento. 💖

${MSG_LOCAL}

Lembrando:
• Cancelamentos com no mínimo 7 dias úteis de antecedência;
• Reagendamentos com no mínimo 20 minutos de antecedência do seu horário;
• Tolerância de atraso: 20 minutos.

Te esperamos com muito carinho! 💄✨`
  );
}

async function abrirModalSinais() {
  listaSinais.innerHTML = `<p class="sinal-vazio">Carregando...</p>`;
  modalSinais.style.display = "flex";

  let lista = [];
  try {
    const snap = await getDocs(collection(db, "agendamentos"));
    snap.forEach((d) => {
      const ag = d.data();
      if (!ag.sinalValor) return;
      ag.id = d.id;
      lista.push(ag);
    });
  } catch (e) {
    listaSinais.innerHTML = `<p class="sinal-vazio">Erro ao carregar: ${esc(e?.message || e)}</p>`;
    return;
  }

  // Aguardando primeiro (prazo mais próximo no topo); depois os já pagos (mais recentes primeiro)
  lista.sort((a, b) => {
    const pa = a.sinalStatus === "pago", pb = b.sinalStatus === "pago";
    if (pa !== pb) return pa ? 1 : -1;
    if (!pa) return new Date(a.sinalPrazo) - new Date(b.sinalPrazo);
    return new Date(b.sinalPagoEm || 0) - new Date(a.sinalPagoEm || 0);
  });

  atualizarBotaoSinais(lista.filter((a) => a.sinalStatus !== "pago").length);

  if (!lista.length) {
    listaSinais.innerHTML = `<p class="sinal-vazio">Nenhuma cliente com taxa de reserva até agora.</p>`;
    return;
  }

  listaSinais.innerHTML = "";
  lista.forEach((ag) => {
    const pago = ag.sinalStatus === "pago";
    const tempo = pago ? null : tempoRestante(ag.sinalPrazo);
    const expirado = !!tempo?.expirado;

    const card = document.createElement("div");
    card.className = "sinal-card" + (pago ? " pago" : expirado ? " expirado" : "");

    const statusTxt = pago ? "✅ Pago" : expirado ? "⚠️ Prazo expirado" : `⏳ ${tempo?.texto || "Aguardando"}`;
    const statusCls = pago ? "pago" : expirado ? "expirado" : "";
    const dataBr = ag.data ? ag.data.split("-").reverse().join("/") : "-";
    const restante = Math.max(Number(ag.valor || 0) - Number(ag.desconto || 0) - Number(ag.sinalValor || 0), 0);

    card.innerHTML = `
      <div class="sinal-topo">
        <span class="sinal-nome">${esc(ag.nome) || "-"}</span>
        <span class="sinal-status ${statusCls}">${statusTxt}</span>
      </div>
      <div class="sinal-info">
        📞 ${esc(ag.telefone) || "-"}<br>
        📅 ${dataBr} às ${esc(ag.horario) || "-"} · 💄 ${esc(ag.procedimento) || "-"}<br>
        💰 Reserva: <strong>${brl(ag.sinalValor)}</strong> (${esc(ag.sinalPercentual || 50)}%) via ${esc(ag.sinalForma || ag.formaPagamento || "-")} · Restante: ${brl(restante)}
      </div>
      <div class="sinal-acoes"></div>
    `;
    const acoes = card.querySelector(".sinal-acoes");

    if (!pago) {
      const btnOk = document.createElement("button");
      btnOk.className = "btnPrimario";
      btnOk.textContent = "✅ Pagamento recebido";
      btnOk.onclick = async () => {
        if (!confirm(`Confirmar que ${ag.nome || "a cliente"} já pagou a taxa de reserva de ${brl(ag.sinalValor)}?`)) return;
        const janela = window.open("", "_blank"); // abre antes do await para não ser bloqueada
        try {
          await updateDoc(doc(db, "agendamentos", ag.id), {
            sinalStatus: "pago",
            sinalPagoEm: new Date().toISOString()
          });
        } catch (e) {
          if (janela) janela.close();
          return alert("⚠️ Erro ao confirmar: " + (e?.message || e));
        }
        if ((ag.telefone || "").replace(/\D/g, "")) {
          abrirWhatsApp(ag.telefone, msgPagamentoConfirmado(ag), janela);
        } else {
          if (janela) janela.close();
          alert("Pagamento confirmado, mas a cliente não tem telefone cadastrado para avisar no WhatsApp.");
        }
        abrirModalSinais();
        carregarAgendamentos();
      };
      acoes.appendChild(btnOk);

      const btnLiberar = document.createElement("button");
      btnLiberar.className = "btnPerigo";
      btnLiberar.textContent = "🗑️ Liberar horário";
      btnLiberar.onclick = async () => {
        if (!confirm(`Excluir o agendamento de ${ag.nome || "a cliente"} e liberar ${dataBr} às ${ag.horario} para outras clientes?`)) return;
        await deleteDoc(doc(db, "agendamentos", ag.id));
        await removerHorarioOcupado(ag.data, ag.horario);
        abrirModalSinais();
        carregarAgendamentos();
      };
      acoes.appendChild(btnLiberar);
    } else {
      const btnDesfazer = document.createElement("button");
      btnDesfazer.className = "btnSecundario";
      btnDesfazer.textContent = "↩️ Desfazer confirmação";
      btnDesfazer.onclick = async () => {
        if (!confirm("Voltar este pagamento para 'aguardando'?")) return;
        await updateDoc(doc(db, "agendamentos", ag.id), { sinalStatus: "aguardando", sinalPagoEm: null });
        abrirModalSinais();
        carregarAgendamentos();
      };
      acoes.appendChild(btnDesfazer);
    }

    listaSinais.appendChild(card);
  });
}

if (btnSinais) {
  btnSinais.addEventListener("click", abrirModalSinais);
  document.getElementById("fecharSinais").addEventListener("click", () => modalSinais.style.display = "none");
  window.addEventListener("click", (e) => { if (e.target === modalSinais) modalSinais.style.display = "none"; });
}

// --- Aniversários --- //
const NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Aceita "15/03", "15/3", "15-03", "15/03/1990"... Retorna { dia, mes } ou null
function parseAniversario(txt) {
  const m = String(txt ?? "").match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
  if (!m) return null;
  const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { dia, mes };
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function msgAniversario(nome) {
  return (
`Olá ${nome || "Maravilhosa"}! 🎂✨

Passando para te desejar um feliz aniversário! 🎉💖
Que o seu mês seja cheio de beleza, alegria e muitas realizações.

Um carinho especial da Ana Luiza Fernandes Makeup! 🥰💄`
  );
}

async function buscarTodosAgendamentos() {
  const snap = await getDocs(collection(db, "agendamentos"));
  const lista = [];
  snap.forEach((d) => lista.push({ ...d.data(), id: d.id }));
  return lista;
}

const modalAniversarios = document.getElementById("modalAniversarios");
const listaAniversarios = document.getElementById("listaAniversarios");
const selectMesAniversario = document.getElementById("selectMesAniversario");
let cacheAniversarios = [];

function renderAniversariantes(mes) {
  const hoje = new Date();
  const hojeDia = hoje.getDate(), hojeMes = hoje.getMonth() + 1;

  // Uma entrada por cliente (telefone ou nome), guardando o atendimento mais recente
  const clientes = new Map();
  cacheAniversarios.forEach((ag) => {
    const niver = parseAniversario(ag.aniversario);
    if (!niver || niver.mes !== mes) return;
    const chave = (ag.telefone || "").replace(/\D/g, "") || (ag.nome || "").trim().toLowerCase();
    if (!chave) return;
    const atual = clientes.get(chave);
    if (!atual || (ag.data || "") > (atual.ultimaData || "")) {
      clientes.set(chave, {
        nome: ag.nome, telefone: ag.telefone, instagram: ag.instagram,
        dia: niver.dia, ultimaData: ag.data
      });
    }
  });

  const lista = [...clientes.values()].sort((a, b) => a.dia - b.dia);
  listaAniversarios.innerHTML = "";

  if (!lista.length) {
    listaAniversarios.innerHTML = `<p class="sinal-vazio">Nenhuma aniversariante em ${NOMES_MESES[mes - 1]}.</p>`;
    return;
  }

  lista.forEach((c) => {
    const ehHoje = mes === hojeMes && c.dia === hojeDia;
    const dataTxt = `${String(c.dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
    const card = document.createElement("div");
    card.className = "sinal-card" + (ehHoje ? " aniv-hoje" : "");
    card.innerHTML = `
      <div class="sinal-topo">
        <span class="sinal-nome">${esc(c.nome) || "-"}</span>
        <span class="sinal-status aniv">🎂 ${dataTxt}${ehHoje ? " · É hoje! 🎉" : ""}</span>
      </div>
      <div class="sinal-info">
        📞 ${esc(c.telefone) || "-"}
        ${c.instagram && c.instagram !== "Não informado" ? `<br>📸 ${esc(c.instagram)}` : ""}
        <br>📅 Último atendimento registrado: ${c.ultimaData ? c.ultimaData.split("-").reverse().join("/") : "-"}
      </div>
      <div class="sinal-acoes"></div>
    `;
    const btn = document.createElement("button");
    btn.className = "btnPrimario";
    btn.textContent = "💬 Parabenizar no WhatsApp";
    btn.onclick = () => {
      if (!(c.telefone || "").replace(/\D/g, "")) return alert("Telefone não informado!");
      abrirWhatsApp(c.telefone, msgAniversario(c.nome));
    };
    card.querySelector(".sinal-acoes").appendChild(btn);
    listaAniversarios.appendChild(card);
  });
}

async function abrirModalAniversarios() {
  if (!selectMesAniversario.options.length) {
    NOMES_MESES.forEach((nome, i) => {
      const opt = document.createElement("option");
      opt.value = i + 1;
      opt.textContent = nome;
      selectMesAniversario.appendChild(opt);
    });
  }
  selectMesAniversario.value = new Date().getMonth() + 1;
  listaAniversarios.innerHTML = `<p class="sinal-vazio">Carregando...</p>`;
  modalAniversarios.style.display = "flex";
  try {
    cacheAniversarios = await buscarTodosAgendamentos();
  } catch (e) {
    listaAniversarios.innerHTML = `<p class="sinal-vazio">Erro ao carregar: ${esc(e?.message || e)}</p>`;
    return;
  }
  renderAniversariantes(parseInt(selectMesAniversario.value, 10));
}

const btnAniversarios = document.getElementById("btnAniversarios");
if (btnAniversarios) {
  btnAniversarios.addEventListener("click", abrirModalAniversarios);
  selectMesAniversario.addEventListener("change", () => renderAniversariantes(parseInt(selectMesAniversario.value, 10)));
  document.getElementById("fecharAniversarios").addEventListener("click", () => modalAniversarios.style.display = "none");
  window.addEventListener("click", (e) => { if (e.target === modalAniversarios) modalAniversarios.style.display = "none"; });
}

// Pop-up no dia do atendimento: clientes atendidas hoje que fazem aniversário neste mês
const modalAniversarioHoje = document.getElementById("modalAniversarioHoje");
const listaAniversarioHoje = document.getElementById("listaAniversarioHoje");

async function verificarAniversariantesHoje() {
  if (!modalAniversarioHoje) return;
  if (sessionStorage.getItem("avisoAniversarioHoje") === hojeISO()) return; // 1x por sessão/dia

  let todos;
  try {
    todos = await buscarTodosAgendamentos();
  } catch (e) {
    console.error("Erro ao verificar aniversariantes de hoje:", e);
    return;
  }

  const hoje = new Date();
  const hojeDia = hoje.getDate(), hojeMes = hoje.getMonth() + 1;
  const atendimentosHoje = todos
    .filter((ag) => ag.data === hojeISO())
    .map((ag) => ({ ag, niver: parseAniversario(ag.aniversario) }))
    .filter((x) => x.niver && x.niver.mes === hojeMes)
    .sort((a, b) => (a.ag.horario || "").localeCompare(b.ag.horario || ""));

  if (!atendimentosHoje.length) return;
  sessionStorage.setItem("avisoAniversarioHoje", hojeISO());

  listaAniversarioHoje.innerHTML = "";
  atendimentosHoje.forEach(({ ag, niver }) => {
    const ehHoje = niver.dia === hojeDia;
    const dataTxt = `${String(niver.dia).padStart(2, "0")}/${String(niver.mes).padStart(2, "0")}`;
    const situacao = ehHoje ? "É hoje! 🎉" : niver.dia > hojeDia ? "Ainda este mês" : "Já passou neste mês";
    const card = document.createElement("div");
    card.className = "sinal-card aniv-hoje";
    card.innerHTML = `
      <div class="sinal-topo">
        <span class="sinal-nome">${esc(ag.nome) || "-"}</span>
        <span class="sinal-status aniv">🎂 ${dataTxt} · ${situacao}</span>
      </div>
      <div class="sinal-info">
        ⏰ Atendimento às ${esc(ag.horario) || "-"} · 💄 ${esc(ag.procedimento) || "-"}
      </div>
      <div class="sinal-acoes"></div>
    `;
    const btn = document.createElement("button");
    btn.className = "btnPrimario";
    btn.textContent = "💬 Parabenizar no WhatsApp";
    btn.onclick = () => {
      if (!(ag.telefone || "").replace(/\D/g, "")) return alert("Telefone não informado!");
      abrirWhatsApp(ag.telefone, msgAniversario(ag.nome));
    };
    card.querySelector(".sinal-acoes").appendChild(btn);
    listaAniversarioHoje.appendChild(card);
  });
  modalAniversarioHoje.style.display = "flex";
}

if (modalAniversarioHoje) {
  const fecharHoje = () => { modalAniversarioHoje.style.display = "none"; };
  document.getElementById("fecharAniversarioHoje").addEventListener("click", fecharHoje);
  document.getElementById("entendiAniversarioHoje").addEventListener("click", fecharHoje);
  window.addEventListener("click", (e) => { if (e.target === modalAniversarioHoje) fecharHoje(); });
}

// --- Meta mensal --- //
const metaRef = doc(db, "configuracoes", "meta");
const btnMeta = document.getElementById("btnMeta");
const modalMeta = document.getElementById("modalMeta");
const selectMesMeta = document.getElementById("selectMesMeta");
let metaCfg = { padrao: 0, meses: {} };
let metaCfgCarregada = false;
let cacheMeta = [];
let graficoLinha = null;
let graficoBarras = null;

function mesAtualYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nomeMesYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${NOMES_MESES[m - 1]} ${y}`;
}

function listarMesesYM(incluirAnteriores) {
  const lista = [];
  const hoje = new Date();
  const inicio = incluirAnteriores ? new Date(2025, 10, 1) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 12, 1);
  for (let d = inicio; d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return lista;
}

async function carregarMetaCfg(forcar) {
  if (metaCfgCarregada && !forcar) return;
  try {
    const snap = await getDoc(metaRef);
    const d = snap.exists() ? snap.data() : {};
    metaCfg = { padrao: Number(d.padrao) || 0, meses: d.meses || {} };
    metaCfgCarregada = true;
  } catch (e) {
    console.error("Erro ao carregar meta:", e);
  }
}

function metaDoMes(ym) {
  const v = Number(metaCfg.meses?.[ym]);
  return v > 0 ? v : (Number(metaCfg.padrao) || 0);
}

function valorFinalAg(ag) {
  return Math.max(Number(ag.valor || 0) - Number(ag.desconto || 0), 0);
}

// Reservas com prazo vencido e sem pagamento não contam para a meta
function contaNaMeta(ag) {
  if (ag.sinalValor && ag.sinalStatus === "aguardando" && tempoRestante(ag.sinalPrazo).expirado) return false;
  return true;
}

function calcularMeta(ags, ym) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const atual = mesAtualYM();
  const status = ym === atual ? "atual" : (ym < atual ? "passado" : "futuro");
  const hojeDia = status === "atual" ? new Date().getDate() : (status === "passado" ? lastDay : 0);

  const realDia = new Array(lastDay).fill(0);
  const projDia = new Array(lastDay).fill(0);
  let realizado = 0, projetado = 0, qtdConcl = 0, qtdTotal = 0;

  ags.forEach((ag) => {
    if (!ag.data || ag.data.slice(0, 7) !== ym || !contaNaMeta(ag)) return;
    const v = valorFinalAg(ag);
    const dia = parseInt(ag.data.slice(8, 10), 10);
    if (!(dia >= 1 && dia <= lastDay)) return;
    projetado += v; qtdTotal++; projDia[dia - 1] += v;
    if (ag.concluido === true) { realizado += v; qtdConcl++; realDia[dia - 1] += v; }
  });

  const meta = metaDoMes(ym);
  const aRealizar = projetado - realizado;
  const ticket = qtdTotal ? projetado / qtdTotal : 0;
  const faltaProj = Math.max(meta - projetado, 0);
  const diasRestantes = status === "atual" ? lastDay - hojeDia + 1 : (status === "futuro" ? lastDay : 0);

  let acR = 0, acP = 0;
  const acumReal = realDia.map((v, i) => { acR += v; return i + 1 <= hojeDia ? acR : null; });
  const acumProj = projDia.map((v) => (acP += v));

  return {
    ym, status, lastDay, hojeDia, meta, realizado, aRealizar, projetado, qtdConcl, qtdTotal, ticket,
    pct: meta ? (realizado / meta) * 100 : 0,
    pctProj: meta ? (projetado / meta) * 100 : 0,
    falta: Math.max(meta - realizado, 0),
    faltaProj, diasRestantes,
    porDia: diasRestantes > 0 ? Math.max(meta - realizado, 0) / diasRestantes : 0,
    atendFaltam: ticket > 0 ? Math.ceil(faltaProj / ticket) : 0,
    acumReal, acumProj
  };
}

function mensagemMeta(c) {
  const pick = (arr) => arr[new Date().getDate() % arr.length];
  if (!c.meta) {
    return pick([
      "✨ Defina a sua meta do mês e acompanhe cada passo da sua evolução. Metas dão direção — e você já mostra o quanto o seu trabalho encanta!",
      "🌱 Que tal escolher uma meta para este mês? Comece com um valor que te motive: o importante é ter um norte."
    ]);
  }
  if (c.pct >= 100) {
    return pick([
      "🏆 META BATIDA! Parabéns, Ana! Todo esse resultado vem do seu talento, da sua dedicação e do carinho com cada cliente. Comemore, você merece! 🥳",
      "🎉 Meta conquistada! Cada atendimento foi um passo até aqui. Aproveite o momento e sinta orgulho de você! 💖",
      "👑 Você bateu a meta! O seu trabalho é a prova de que dedicação traz resultado. Que venha ainda mais! ✨"
    ]);
  }
  if (c.status === "passado") {
    return c.pctProj >= 100
      ? "✅ Mês encerrado com a meta atingida. Parabéns pelo resultado, Ana! 💖"
      : pick([
        `🌷 Este mês fechou em ${c.pct.toFixed(0)}% da meta. Cada mês traz um aprendizado — olhe para o que funcionou e leve isso para o próximo. Você está construindo algo lindo!`,
        `💛 Nem todo mês é igual, e tudo bem. Você fechou com ${brl(c.realizado)} e isso já é fruto do seu esforço. Respire fundo e vamos para o próximo!`
      ]);
  }
  if (c.status === "futuro") {
    return "🗓️ Esse mês ainda vai começar. Os agendamentos já registrados aparecem aqui, e a sua meta pode ser ajustada quando quiser. Bora planejar com carinho! ✨";
  }
  if (c.pctProj >= 100) {
    return pick([
      "📅 Os seus agendamentos já cobrem a meta! Agora é só realizar cada atendimento com o capricho de sempre. 💄",
      "🌟 Meta garantida nos agendamentos! Falta concluir os atendimentos — você está no caminho certo."
    ]);
  }
  const esperado = (c.hojeDia / c.lastDay) * 100;
  if (c.pct >= 90) {
    return pick([
      `🔥 Você está a um passo! Faltam só ${brl(c.falta)} para a meta. Respire fundo e finalize com força!`,
      `🚀 Quase lá, Ana! Falta pouquinho (${brl(c.falta)}). A reta final é sua!`
    ]);
  }
  if (c.pct >= esperado) {
    return pick([
      `💪 Você está no ritmo ou à frente! Já são ${c.pct.toFixed(0)}% da meta com ${c.hojeDia} dias de mês. Continue assim!`,
      "🌸 Seu mês está caminhando muito bem. Cada atendimento aproxima você da meta — siga com a mesma energia!"
    ]);
  }
  return pick([
    "🤍 O mês ainda não decolou, e está tudo bem. Ainda há dias pela frente, e cada cliente atendida com carinho faz diferença. Um passo de cada vez!",
    "🌻 Dias mais calmos fazem parte do caminho. Aproveite para divulgar nas redes, falar com clientes antigas e cuidar de você. O seu trabalho é de muito valor!",
    "✨ Confie no seu processo. A sua qualidade já conquistou muitas clientes, e novas virão. Vamos com calma e constância!"
  ]);
}

function infoFormMeta(ym) {
  const info = document.getElementById("metaInfoForm");
  const temEspecifica = Number(metaCfg.meses?.[ym]) > 0;
  info.textContent = `Meta padrão: ${metaCfg.padrao > 0 ? brl(metaCfg.padrao) : "não definida"}` +
    (temEspecifica ? ` · ${nomeMesYM(ym)} usa meta específica de ${brl(metaCfg.meses[ym])}` : "");
  document.getElementById("usarMetaPadrao").style.display = temEspecifica && metaCfg.padrao > 0 ? "inline-block" : "none";
  document.getElementById("metaValor").value = metaDoMes(ym) || "";
}

function renderMeta(ym) {
  const c = calcularMeta(cacheMeta, ym);
  const cont = document.getElementById("metaConteudo");
  infoFormMeta(ym);

  const barReal = c.meta ? Math.min(c.pct, 100) : 0;
  const barProj = c.meta ? Math.min(Math.max(c.pctProj - c.pct, 0), 100 - barReal) : 0;
  const acima = c.meta && c.realizado > c.meta ? c.realizado - c.meta : 0;

  const cards = [];
  cards.push(["🎯 Meta bruta", c.meta ? brl(c.meta) : "—", ""]);
  cards.push(["✅ Realizado (concluído)", brl(c.realizado), `${c.qtdConcl} atendimento(s)`]);
  cards.push(["📅 A concluir (agendado)", brl(c.aRealizar), `${c.qtdTotal - c.qtdConcl} atendimento(s)`]);
  cards.push(["📈 Projetado", brl(c.projetado), c.meta ? `${c.pctProj.toFixed(0)}% da meta` : ""]);
  if (c.meta) {
    cards.push([acima > 0 ? "🏅 Acima da meta" : "🧗 Falta para a meta", acima > 0 ? brl(acima) : brl(c.falta), "considerando só o concluído", "destaque"]);
    if (c.status !== "passado" && c.projetado < c.meta) cards.push(["🔮 Falta além dos agendados", brl(c.faltaProj), ""]);
  }
  cards.push(["🎟️ Ticket médio", brl(c.ticket), ""]);
  if (c.meta && c.status === "atual" && c.falta > 0) {
    cards.push(["📆 Por dia restante", brl(c.porDia), `${c.diasRestantes} dia(s) incluindo hoje`]);
    if (c.atendFaltam > 0) cards.push(["💄 Atendimentos que faltam", String(c.atendFaltam), "além dos já agendados"]);
  }

  cont.innerHTML = `
    <div>
      <div class="meta-pct">${c.meta ? c.pct.toFixed(0) + "%" : "—"}</div>
      <div class="meta-barra" aria-label="Progresso da meta">
        <div class="real" style="width:${barReal}%"></div>
        <div class="proj" style="width:${barProj}%"></div>
      </div>
      <div class="meta-legenda">
        <span><i style="background:var(--verde)"></i>Realizado</span>
        <span><i style="background:var(--dourado)"></i>Agendado a concluir</span>
        <span><i style="background:#eadfe0"></i>Falta</span>
      </div>
    </div>
    <div class="meta-msg">${mensagemMeta(c)}</div>
    <div class="meta-cards">
      ${cards.map(([rot, val, sub, cls]) => `
        <div class="meta-card ${cls || ""}"><small>${rot}</small><strong>${val}</strong>${sub ? `<small>${sub}</small>` : ""}</div>`).join("")}
    </div>
    <p class="meta-grafico-titulo">Evolução no mês</p>
    <div class="meta-grafico"><canvas id="graficoMetaLinha"></canvas></div>
    <p class="meta-grafico-titulo">Últimos 6 meses</p>
    <div class="meta-grafico"><canvas id="graficoMetaBarras"></canvas></div>
  `;
  desenharGraficosMeta(c);
}

function desenharGraficosMeta(c) {
  if (typeof Chart === "undefined") return;
  if (graficoLinha) graficoLinha.destroy();
  if (graficoBarras) graficoBarras.destroy();
  const verde = "#556b2f", dourado = "#d4af37", cinza = "#9a8f91";
  const fmt = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const opcoes = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } } },
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmt(v) } } }
  };

  const dias = Array.from({ length: c.lastDay }, (_, i) => i + 1);
  const dsLinha = [
    { label: "Realizado", data: c.acumReal, borderColor: verde, backgroundColor: verde, tension: .25, spanGaps: false, pointRadius: 2 },
    { label: "Projetado (com agendados)", data: c.acumProj, borderColor: dourado, backgroundColor: dourado, borderDash: [6, 4], tension: .25, pointRadius: 0 }
  ];
  if (c.meta) {
    dsLinha.push({ label: "Ritmo ideal", data: dias.map((d) => (c.meta * d) / c.lastDay), borderColor: cinza, borderDash: [2, 4], pointRadius: 0 });
  }
  graficoLinha = new Chart(document.getElementById("graficoMetaLinha"), {
    type: "line", data: { labels: dias, datasets: dsLinha }, options: opcoes
  });

  // Últimos 6 meses terminando no mês selecionado
  const [y, m] = c.ym.split("-").map(Number);
  const rotulos = [], valores = [], metas = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    rotulos.push(`${NOMES_MESES[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`);
    valores.push(cacheMeta.filter((ag) => ag.data?.slice(0, 7) === ym && contaNaMeta(ag)).reduce((s, ag) => s + valorFinalAg(ag), 0));
    metas.push(metaDoMes(ym) || null);
  }
  graficoBarras = new Chart(document.getElementById("graficoMetaBarras"), {
    data: {
      labels: rotulos,
      datasets: [
        { type: "bar", label: "Bruto", data: valores, backgroundColor: verde, borderRadius: 6 },
        { type: "line", label: "Meta", data: metas, borderColor: dourado, backgroundColor: dourado, borderWidth: 2, pointRadius: 4, spanGaps: true }
      ]
    },
    options: opcoes
  });
}

async function atualizarBotaoMeta(ags) {
  if (!btnMeta) return;
  await carregarMetaCfg();
  const c = calcularMeta(ags, mesAtualYM());
  btnMeta.textContent = c.meta ? `🎯 Meta (${c.pct.toFixed(0)}%)` : "🎯 Meta";
}

function popularMesesMeta(incluirAnteriores) {
  const anterior = selectMesMeta.value;
  selectMesMeta.innerHTML = "";
  listarMesesYM(incluirAnteriores).forEach((ym) => {
    const opt = document.createElement("option");
    opt.value = ym;
    opt.textContent = nomeMesYM(ym);
    selectMesMeta.appendChild(opt);
  });
  selectMesMeta.value = [...selectMesMeta.options].some((o) => o.value === anterior) ? anterior : mesAtualYM();
}

async function abrirModalMeta() {
  modalMeta.style.display = "flex";
  document.getElementById("metaMostrarAnteriores").checked = false;
  popularMesesMeta(false);
  selectMesMeta.value = mesAtualYM();
  document.getElementById("metaConteudo").innerHTML = `<p class="sinal-vazio">Carregando...</p>`;
  try {
    await carregarMetaCfg(true);
    cacheMeta = await buscarTodosAgendamentos();
  } catch (e) {
    document.getElementById("metaConteudo").innerHTML = `<p class="sinal-vazio">Erro ao carregar: ${esc(e?.message || e)}</p>`;
    return;
  }
  renderMeta(selectMesMeta.value);
}

async function salvarMeta(tipo) {
  const ym = selectMesMeta.value;
  const v = parseFloat(document.getElementById("metaValor").value);
  if (!(v > 0)) return alert("Informe um valor de meta maior que zero.");
  try {
    if (tipo === "mes") {
      await setDoc(metaRef, { meses: { [ym]: v } }, { merge: true });
      metaCfg.meses = { ...(metaCfg.meses || {}), [ym]: v };
    } else {
      await setDoc(metaRef, { padrao: v }, { merge: true });
      metaCfg.padrao = v;
    }
  } catch (e) {
    console.error("Erro ao salvar meta:", e);
    return alert("⚠️ Erro ao salvar: " + (e?.message || e) + "\n\nVerifique as Regras de Segurança do Firestore para 'configuracoes/meta'.");
  }
  renderMeta(ym);
  atualizarBotaoMeta(cacheMeta);
}

if (btnMeta) {
  btnMeta.addEventListener("click", abrirModalMeta);
  selectMesMeta.addEventListener("change", () => renderMeta(selectMesMeta.value));
  document.getElementById("metaMostrarAnteriores").addEventListener("change", (e) => {
    popularMesesMeta(e.target.checked);
    renderMeta(selectMesMeta.value);
  });
  document.getElementById("salvarMetaMes").addEventListener("click", () => salvarMeta("mes"));
  document.getElementById("salvarMetaPadrao").addEventListener("click", () => salvarMeta("padrao"));
  document.getElementById("usarMetaPadrao").addEventListener("click", async () => {
    const ym = selectMesMeta.value;
    try {
      await setDoc(metaRef, { meses: { [ym]: deleteField() } }, { merge: true });
      delete metaCfg.meses[ym];
    } catch (e) {
      return alert("⚠️ Erro: " + (e?.message || e));
    }
    renderMeta(ym);
    atualizarBotaoMeta(cacheMeta);
  });
  document.getElementById("fecharMeta").addEventListener("click", () => modalMeta.style.display = "none");
  window.addEventListener("click", (e) => { if (e.target === modalMeta) modalMeta.style.display = "none"; });
}

// --- Finalização do atendimento --- //
// O pop-up aparece quando passam MINUTOS_APOS_HORARIO do horário marcado e o atendimento
// ainda não foi concluído. Considera os últimos 7 dias, para não avisar sobre dados muito antigos.
const MINUTOS_APOS_HORARIO = 60;
const modalFinalizacao = document.getElementById("modalFinalizacao");
const finalizacaoCorpo = document.getElementById("finalizacaoCorpo");
const finalizacaoContador = document.getElementById("finalizacaoContador");
let filaFinalizacao = [];
let finalizacaoAberta = false;
const adiadosFinalizacao = new Set();

function msgAgradecimento(nome) {
  return (
`Olá ${nome || "Maravilhosa"}! 💖✨

Muito obrigada por escolher a Ana Luiza Fernandes Makeup! Foi um prazer cuidar de você. 🥰

Espero que tenha amado o resultado! Se puder, me conta o que achou, e se quiser, marque o nosso Instagram: @analuizafernandesmakeup ✨

Já fico aguardando você para o próximo atendimento. Quando quiser agendar, é só me chamar ou usar o autoatendimento do site. 💄

Um beijo!`
  );
}

function msgAtrasoOuFalta(nome) {
  return (
`Olá ${nome || "Maravilhosa"}! 😊

O tempo máximo de espera é de 20 minutos. Como o atraso ultrapassou esse período, não conseguirei mais realizar seu atendimento hoje. Podemos remarcar novamente em um dia que você esteja com tempo?`
  );
}

function msgRemarcar(nome) {
  return (
`Olá ${nome || "Maravilhosa"}! 💕

Não conseguimos realizar o seu atendimento no horário marcado. Vamos remarcar para um dia que fique bom para você? Me conta qual dia e período são melhores. 😊`
  );
}

function fimDoAtendimento(ag) {
  const [y, m, d] = (ag.data || "").split("-").map(Number);
  const [h, mi] = (ag.horario || "").split(":").map(Number);
  if (isNaN(h) || isNaN(mi)) return new Date(y, m - 1, d, 23, 59);
  return new Date(y, m - 1, d, h, mi + MINUTOS_APOS_HORARIO);
}

function algumModalAberto() {
  return [...document.querySelectorAll(".modal")].some((m) => m.style.display === "flex");
}

async function verificarFinalizacoes() {
  if (!auth.currentUser || !modalFinalizacao || finalizacaoAberta || algumModalAberto()) return;

  const desde = new Date();
  desde.setDate(desde.getDate() - 7);
  const desdeISO = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-${String(desde.getDate()).padStart(2, "0")}`;

  let docs;
  try {
    const snap = await getDocs(query(collection(db, "agendamentos"), where("data", ">=", desdeISO)));
    docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.error("Erro ao verificar finalizações:", e);
    return;
  }

  const agora = new Date();
  filaFinalizacao = docs
    .filter((ag) => ag.concluido !== true && !ag.finalizacaoStatus && !adiadosFinalizacao.has(ag.id) && contaNaMeta(ag))
    .map((ag) => ({ ag, fim: fimDoAtendimento(ag) }))
    .filter((x) => x.fim <= agora)
    .sort((a, b) => a.fim - b.fim)
    .map((x) => x.ag);

  if (!filaFinalizacao.length || algumModalAberto()) return;
  finalizacaoAberta = true;
  modalFinalizacao.style.display = "flex";
  renderFinalizacao("pergunta");
}

function fecharFinalizacao(adiar) {
  if (adiar) filaFinalizacao.forEach((ag) => adiadosFinalizacao.add(ag.id));
  filaFinalizacao = [];
  finalizacaoAberta = false;
  modalFinalizacao.style.display = "none";
  carregarAgendamentos();
}

function proximaFinalizacao() {
  filaFinalizacao.shift();
  if (!filaFinalizacao.length) return fecharFinalizacao(false);
  renderFinalizacao("pergunta");
}

function botaoFin(texto, classe, onclick) {
  const b = document.createElement("button");
  b.className = classe;
  b.textContent = texto;
  b.onclick = onclick;
  return b;
}

function renderFinalizacao(etapa) {
  const ag = filaFinalizacao[0];
  if (!ag) return fecharFinalizacao(false);

  const dataBr = ag.data ? ag.data.split("-").reverse().join("/") : "-";
  const total = valorFinalAg(ag);
  const aReceber = ag.sinalValor && ag.sinalStatus === "pago" ? Math.max(total - Number(ag.sinalValor), 0) : total;
  finalizacaoContador.textContent = filaFinalizacao.length > 1
    ? `${filaFinalizacao.length} atendimentos aguardando finalização.`
    : "1 atendimento aguardando finalização.";

  finalizacaoCorpo.innerHTML = "";
  const card = document.createElement("div");
  card.className = "sinal-card";
  card.innerHTML = `
    <div class="sinal-topo">
      <span class="sinal-nome">${esc(ag.nome) || "-"}</span>
      <span class="sinal-status">📅 ${dataBr} às ${esc(ag.horario) || "-"}</span>
    </div>
    <div class="sinal-info">
      📞 ${esc(ag.telefone) || "-"}<br>
      💄 ${esc(ag.procedimento) || "-"}<br>
      💰 Total: <strong>${brl(total)}</strong>
      ${ag.sinalValor ? ` · Reserva: ${brl(ag.sinalValor)} (${ag.sinalStatus === "pago" ? "paga" : "NÃO confirmada"})` : ""}
      · A receber: <strong>${brl(aReceber)}</strong>
    </div>`;
  finalizacaoCorpo.appendChild(card);

  const pergunta = document.createElement("p");
  pergunta.style.cssText = "margin:10px 0 6px;font-weight:600;color:var(--verde)";
  const acoes = document.createElement("div");
  acoes.className = "sinal-acoes";

  if (etapa === "pergunta") {
    pergunta.textContent = "O procedimento foi realizado?";
    acoes.append(
      botaoFin("✅ Sim, foi realizado", "btnPrimario", async () => {
        try {
          await updateDoc(doc(db, "agendamentos", ag.id), {
            concluido: true, finalizacaoStatus: "realizado", concluidoEm: new Date().toISOString()
          });
        } catch (e) { return alert("⚠️ Erro ao finalizar: " + (e?.message || e)); }
        renderFinalizacao("agradecimento");
      }),
      botaoFin("❌ Não foi realizado", "btnPerigo", async () => {
        try {
          await updateDoc(doc(db, "agendamentos", ag.id), { finalizacaoStatus: "nao_realizado" });
        } catch (e) { return alert("⚠️ Erro ao registrar: " + (e?.message || e)); }
        renderFinalizacao("nao_realizado");
      }),
      botaoFin("⏳ Decidir depois", "btnFechar", () => {
        adiadosFinalizacao.add(ag.id);
        proximaFinalizacao();
      })
    );
  } else if (etapa === "agradecimento") {
    pergunta.textContent = "🎉 Atendimento concluído! Parabéns, Ana! Deseja enviar uma mensagem de agradecimento para a cliente?";
    acoes.append(
      botaoFin("💬 Enviar agradecimento no WhatsApp", "btnPrimario", () => {
        if (!(ag.telefone || "").replace(/\D/g, "")) { alert("Telefone não informado!"); return; }
        abrirWhatsApp(ag.telefone, msgAgradecimento(ag.nome));
        updateDoc(doc(db, "agendamentos", ag.id), { agradecimentoEnviadoEm: new Date().toISOString() }).catch(() => {});
        proximaFinalizacao();
      }),
      botaoFin("Agora não", "btnFechar", proximaFinalizacao)
    );
  } else if (etapa === "nao_realizado") {
    pergunta.textContent = "Registrado como não realizado. Deseja avisar a cliente?";
    acoes.append(
      botaoFin("⏰ Avisar atraso (20 min)", "btnSecundario", () => {
        if (!(ag.telefone || "").replace(/\D/g, "")) { alert("Telefone não informado!"); return; }
        abrirWhatsApp(ag.telefone, msgAtrasoOuFalta(ag.nome));
        proximaFinalizacao();
      }),
      botaoFin("🔁 Propor remarcação", "btnSecundario", () => {
        if (!(ag.telefone || "").replace(/\D/g, "")) { alert("Telefone não informado!"); return; }
        abrirWhatsApp(ag.telefone, msgRemarcar(ag.nome));
        proximaFinalizacao();
      }),
      botaoFin("Só registrar", "btnFechar", proximaFinalizacao)
    );
  }
  finalizacaoCorpo.append(pergunta, acoes);
}

if (modalFinalizacao) {
  document.getElementById("fecharFinalizacao").addEventListener("click", () => fecharFinalizacao(true));
  window.addEventListener("click", (e) => { if (e.target === modalFinalizacao) fecharFinalizacao(true); });
  // Reverifica a cada 5 minutos enquanto o painel estiver aberto e visível
  setInterval(() => { if (!document.hidden) verificarFinalizacoes(); }, 300000);
}

// --- Carregar agendamentos --- //
async function carregarAgendamentos() {
  const querySnapshot = await getDocs(collection(db, "agendamentos"));
  tabelaAgendamentos.innerHTML = "";

  const filtroMes = filtroMesAtual;
  const filtroDia = document.getElementById("filtroDia")?.value || "";

  let agendamentos = [];
  querySnapshot.forEach((docSnap) => {
    const ag = docSnap.data();
    if (!ag.data) return;
    ag.id = docSnap.id;
    agendamentos.push(ag);
  });

const ordemPeriodo = {
  "Manhã": 1,
  "Tarde": 2,
  "Noite": 3
};

agendamentos.sort((a, b) => {
  // 1️⃣ Ordena pela data
  const dataA = new Date(a.data);
  const dataB = new Date(b.data);
  if (dataA.getTime() !== dataB.getTime()) {
    return dataA - dataB;
  }

  // 2️⃣ Se for o mesmo dia, ordena pelo período
  const periodoA = ordemPeriodo[a.periodo] || 99;
  const periodoB = ordemPeriodo[b.periodo] || 99;
  if (periodoA !== periodoB) {
    return periodoA - periodoB;
  }

  // 3️⃣ Se ainda empatar, ordena pelo horário
  return (a.horario || "").localeCompare(b.horario || "");
});

  atualizarBotaoSinais(agendamentos.filter((a) => a.sinalStatus === "aguardando").length);
  atualizarBotaoMeta(agendamentos);

  let total = 0;
  let pagamentos = {};
  let contador = 0;

  agendamentos.forEach((ag) => {
    const dataBase = ag.data.slice(0, 7);
    if (filtroMes !== "todos" && dataBase !== filtroMes) return;
    if (filtroMes === "todos" && !filtroDia && !mostrarMesesAnteriores && dataBase < mesAtualYM()) return;
    if (filtroDia && ag.data !== filtroDia) return;

    const valor = Number(ag.valor || 0);
    const desconto = Number(ag.desconto || 0);
    const valorFinal = Math.max(valor - desconto, 0);
    const concluido = ag.concluido === true;

    contador++;
    total += valorFinal;
    if (ag.formaPagamento)
      pagamentos[ag.formaPagamento] = (pagamentos[ag.formaPagamento] || 0) + valorFinal;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(ag.nome) || "-"}</td>
      <td>${esc(ag.telefone) || "-"}</td>
      <td>${ag.aniversario && ag.aniversario !== "Não informado" ? esc(ag.aniversario) : "-"}</td>
      <td>${ag.data ? ag.data.split("-").reverse().join("/") : "-"}</td>
      <td>${esc(ag.periodo) || "-"}</td>
      <td>${esc(ag.horario) || "-"}</td>
      <td>${esc(ag.procedimento) || "-"}</td>
      <td>${esc(ag.formaPagamento) || "-"}</td>
      <td>R$ ${valor.toFixed(2)}</td>
      <td>${desconto > 0 ? "Sim (R$ " + desconto.toFixed(2) + ")" : "Não"}</td>
      <td><strong>R$ ${valorFinal.toFixed(2)}</strong></td>
      <td>${sinalBadge(ag)}</td>
      <td><input type="checkbox" class="chkConcluir" data-id="${ag.id}" ${concluido ? "checked" : ""}></td>
      <td>
        <button class="btnAcoes"
          data-id="${ag.id}"
          data-tel="${esc(ag.telefone)}"
          data-nome="${esc(ag.nome)}"
          data-data="${esc(ag.data)}"
          data-periodo="${esc(ag.periodo)}"
          data-horario="${esc(ag.horario)}"
          data-procedimento="${esc(ag.procedimento)}"
          data-valor="${(ag.valor - (ag.desconto || 0)).toFixed(2)}">
          ⚙️ Ações
        </button>
      </td>
    `;
    tabelaAgendamentos.appendChild(tr);
  });

  totalAgendamentos.textContent = `Total de agendamentos: ${contador}`;
  valorTotal.textContent = `Valor bruto (atendimentos): R$ ${total.toFixed(2)}`;
  totalBrutoGlobal = total;
  atualizarResumoLiquido();

  let resumoHTML = "<h4>Formas de Pagamento:</h4><ul>";
  for (const [forma, valor] of Object.entries(pagamentos))
    resumoHTML += `<li>${forma}: R$ ${valor.toFixed(2)}</li>`;
  resumoHTML += "</ul>";
  pagamentosResumo.innerHTML = resumoHTML;

  document.querySelectorAll(".chkConcluir").forEach((chk) => {
    chk.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const concluido = e.target.checked;
      await updateDoc(doc(db, "agendamentos", id), { concluido });
      if (concluido) alert("💖 Mais um atendimento concluído! Parabéns, Ana! 🎉✨");
    });
  });
}

// --- Despesas: carregar --- //
async function carregarDespesas() {
  if (!tabelaDespesas) return;
  const querySnapshot = await getDocs(collection(db, "despesas"));
  tabelaDespesas.innerHTML = "";

  const filtroMes = filtroMesAtual;
  const filtroDia = document.getElementById("filtroDia")?.value || "";

  let despesas = [];
  querySnapshot.forEach((docSnap) => {
    const d = docSnap.data();
    if (!d.data) return;
    d.id = docSnap.id;
    despesas.push(d);
  });

  despesas.sort((a, b) => new Date(a.data) - new Date(b.data));

  let totalDespesas = 0;

  despesas.forEach((d) => {
    const dataBase = d.data.slice(0, 7);
    if (filtroMes !== "todos" && dataBase !== filtroMes) return;
    if (filtroMes === "todos" && !filtroDia && !mostrarMesesAnteriores && dataBase < mesAtualYM()) return;
    if (filtroDia && d.data !== filtroDia) return;

    const valor = Number(d.valor || 0);
    totalDespesas += valor;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.nome || "-"}</td>
      <td>${d.data ? d.data.split("-").reverse().join("/") : "-"}</td>
      <td>${d.descricao || "-"}</td>
      <td>${d.formaPagamento || "-"}</td>
      <td>R$ ${valor.toFixed(2)}</td>
      <td>
        <button class="btnPerigo btnExcluirDespesa" data-id="${d.id}">🗑️ Excluir</button>
      </td>
    `;
    tabelaDespesas.appendChild(tr);
  });

  if (valorDespesasEl) valorDespesasEl.textContent = `Despesas: R$ ${totalDespesas.toFixed(2)}`;
  totalDespesasGlobal = totalDespesas;
  atualizarResumoLiquido();

  document.querySelectorAll(".btnExcluirDespesa").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
      await deleteDoc(doc(db, "despesas", id));
      carregarDespesas();
    });
  });
}

// --- Despesas: modal Nova Despesa --- //
if (btnNovaDespesa && modalDespesa) {
  btnNovaDespesa.addEventListener("click", () => {
    modalDespesa.style.display = "flex";
  });

  fecharModalDespesa.addEventListener("click", () => {
    modalDespesa.style.display = "none";
  });

  salvarDespesaBtn.addEventListener("click", async () => {
    const nome = document.getElementById("nomeDespesa").value.trim();
    const data = document.getElementById("dataDespesa").value;
    const descricao = document.getElementById("descricaoDespesa").value.trim();
    const valor = parseFloat(document.getElementById("valorDespesa").value || 0);
    const formaPagamento = document.getElementById("pagamentoDespesa").value;

    if (!nome || !data || !valor) {
      alert("Preencha todos os campos da despesa!");
      return;
    }

    await addDoc(collection(db, "despesas"), { nome, data, descricao, valor, formaPagamento });

    alert("✅ Despesa adicionada!");
    modalDespesa.style.display = "none";
    document.getElementById("nomeDespesa").value = "";
    document.getElementById("dataDespesa").value = "";
    document.getElementById("descricaoDespesa").value = "";
    document.getElementById("valorDespesa").value = "";
    carregarDespesas();
  });
}

// --- Modal de Ações --- //
const modalAcoes = document.getElementById("modalAcoes");
const fecharAcoes = document.getElementById("fecharAcoes");
const btnFecharModalAcoes = document.getElementById("acaoFechar");

let agendamentoSelecionado = null;

// Abrir modal
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btnAcoes")) {
    const btn = e.target;
    agendamentoSelecionado = { 
      id: btn.dataset.id,
      nome: btn.dataset.nome,
      telefone: btn.dataset.tel,
      data: btn.dataset.data,
      periodo: btn.dataset.periodo,
      horario: btn.dataset.horario,
      procedimento: btn.dataset.procedimento,
      valor: btn.dataset.valor
    };
    modalAcoes.style.display = "flex";
  }
});

// Fechar modal
fecharAcoes.onclick = () => modalAcoes.style.display = "none";
btnFecharModalAcoes.onclick = () => modalAcoes.style.display = "none";
window.onclick = (e) => { if (e.target === modalAcoes) modalAcoes.style.display = "none"; };

// --- Editar --- //
document.getElementById("acaoEditar").onclick = async () => {
  modalAcoes.style.display = "none";
  const docSnap = await getDocs(collection(db, "agendamentos"));
  const ag = docSnap.docs.find(d => d.id === agendamentoSelecionado.id)?.data();
  if (!ag) return alert("Erro ao carregar o atendimento!");

  document.getElementById("modalNovo").style.display = "flex";
  document.getElementById("nomeManual").value = ag.nome || "";
  document.getElementById("telefoneManual").value = ag.telefone || "";
  document.getElementById("dataManual").value = ag.data || "";
  document.getElementById("periodoManual").value = ag.periodo || "Manhã";
  document.getElementById("horaManual").value = ag.horario || "";
  document.getElementById("procedimentoManual").value = ag.procedimento || "";
  document.getElementById("pagamentoManual").value = ag.formaPagamento || "PIX";
  document.getElementById("valorManual").value = ag.valor || "";
  document.getElementById("descontoManual").value = ag.desconto || "";
  document.getElementById("obsManual").value = ag.observacoes || "";

  const btnSalvar = document.getElementById("salvarManual");
  btnSalvar.textContent = "💾 Salvar Alterações";
  btnSalvar.onclick = async () => {
    const nome = document.getElementById("nomeManual").value.trim();
    const telefone = document.getElementById("telefoneManual").value.trim();
    const data = document.getElementById("dataManual").value;
    const periodo = document.getElementById("periodoManual").value;
    const horario = document.getElementById("horaManual").value;
    const procedimento = document.getElementById("procedimentoManual").value.trim();
    const formaPagamento = document.getElementById("pagamentoManual").value;
    const valor = parseFloat(document.getElementById("valorManual").value || 0);
    const desconto = parseFloat(document.getElementById("descontoManual").value || 0);
    const obs = document.getElementById("obsManual").value.trim();

    await updateDoc(doc(db, "agendamentos", agendamentoSelecionado.id), {
      nome, telefone, data, periodo, horario, procedimento, formaPagamento, valor, desconto, observacoes: obs
    });

    // Atualiza a coleção pública de horários ocupados caso a data/horário tenham mudado
    if (ag.data !== data || ag.horario !== horario) {
      await removerHorarioOcupado(ag.data, ag.horario);
      await adicionarHorarioOcupado(data, horario);
    }

    alert("✅ Atendimento atualizado!");
    document.getElementById("modalNovo").style.display = "none";
    carregarAgendamentos();
    btnSalvar.textContent = "💾 Salvar Atendimento";
    btnSalvar.onclick = salvarNovoAtendimento;
  };
};

// --- WhatsApp --- //
document.getElementById("acaoWhats").onclick = () => {
  modalAcoes.style.display = "none";
  const nome = agendamentoSelecionado.nome || "Maravilhosa";
  const tel = (agendamentoSelecionado.telefone || "").replace(/\D/g, "");
  const data = agendamentoSelecionado.data
    ? agendamentoSelecionado.data.split("-").reverse().join("/")
    : "-";

  const msg = `
Olá ${nome} 😍✨

Seu atendimento está confirmado para *${data}*, período *${agendamentoSelecionado.periodo}*, às *${agendamentoSelecionado.horario}*.
Procedimento: *${agendamentoSelecionado.procedimento}*.
Valor: *R$ ${agendamentoSelecionado.valor}* 💖

📍 Local: *Espaço Ana Luiza Makeup*  
Salto Do Lontra-PR
🗺️ https://maps.app.goo.gl/n74UzXbv88cw8Mbq5?g_st=ipc

Te esperamos com muito carinho! 💄✨
`;

  if (!tel) return alert("Telefone não informado!");
  const link = `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
  window.open(link, "_blank");
};

// --- Aviso de atraso (tolerância de 20 minutos) --- //
document.getElementById("acaoAtraso").onclick = () => {
  modalAcoes.style.display = "none";
  const nome = agendamentoSelecionado.nome || "Maravilhosa";
  if (!(agendamentoSelecionado.telefone || "").replace(/\D/g, "")) return alert("Telefone não informado!");
  const msg =
`Olá ${nome}! 😊

O tempo máximo de espera é de 20 minutos. Como o atraso ultrapassou esse período, não conseguirei mais realizar seu atendimento hoje. Podemos remarcar novamente em um dia que você esteja com tempo?`;
  abrirWhatsApp(agendamentoSelecionado.telefone, msg);
};

// --- Agradecimento (a qualquer momento) --- //
document.getElementById("acaoAgradecer").onclick = () => {
  modalAcoes.style.display = "none";
  if (!(agendamentoSelecionado.telefone || "").replace(/\D/g, "")) return alert("Telefone não informado!");
  abrirWhatsApp(agendamentoSelecionado.telefone, msgAgradecimento(agendamentoSelecionado.nome));
};

// --- Excluir --- //
document.getElementById("acaoExcluir").onclick = async () => {
  if (!confirm("Tem certeza que deseja excluir este atendimento?")) return;
  await deleteDoc(doc(db, "agendamentos", agendamentoSelecionado.id));
  await removerHorarioOcupado(agendamentoSelecionado.data, agendamentoSelecionado.horario);
  alert("🗑️ Atendimento excluído!");
  modalAcoes.style.display = "none";
  carregarAgendamentos();
};

// --- Apagar todos DESATIVADO por segurança --- //
/*
btnApagarTudo.addEventListener("click", async () => {
  if (!confirm("Tem certeza que deseja apagar todos os agendamentos?")) return;
  const querySnapshot = await getDocs(collection(db, "agendamentos"));
  for (const docSnap of querySnapshot.docs)
    await deleteDoc(doc(db, "agendamentos", docSnap.id));
  alert("Todos foram apagados!");
  carregarAgendamentos();
});
*/

// --- Novo Atendimento --- //
btnNovoAtendimento.addEventListener("click", () => {
  document.getElementById("modalNovo").style.display = "flex";
});

const btnFecharModal = document.getElementById("fecharModal");
btnFecharModal.addEventListener("click", () => {
  document.getElementById("modalNovo").style.display = "none";
});

async function salvarNovoAtendimento() {
  const nome = document.getElementById("nomeManual").value.trim();
  const telefone = document.getElementById("telefoneManual")?.value.trim() || "";
  const data = document.getElementById("dataManual").value;
  const periodo = document.getElementById("periodoManual").value;
  const horario = document.getElementById("horaManual").value;
  const procedimento = document.getElementById("procedimentoManual").value.trim();
  const formaPagamento = document.getElementById("pagamentoManual").value;
  const valor = parseFloat(document.getElementById("valorManual").value || 0);
  const desconto = parseFloat(document.getElementById("descontoManual").value || 0);
  const obs = document.getElementById("obsManual").value.trim();

  if (!nome || !data || !horario || !procedimento) {
    alert("Preencha todos os campos obrigatórios!");
    return;
  }

  await addDoc(collection(db, "agendamentos"), {
    nome, telefone, data, periodo, horario, procedimento,
    formaPagamento, valor, desconto, observacoes: obs, concluido: false
  });
  await adicionarHorarioOcupado(data, horario);

  alert("✅ Atendimento adicionado!");
  document.getElementById("modalNovo").style.display = "none";
  document.querySelectorAll("#modalNovo input, #modalNovo textarea").forEach(el => el.value = "");
  carregarAgendamentos();
}
document.getElementById("salvarManual").onclick = salvarNovoAtendimento;

document.addEventListener("DOMContentLoaded", () => {
  loginContainer.style.display = "flex";
});

async function exportarPDF(mes) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  // --- Página 1: Agendamentos --- //
  const querySnapshot = await getDocs(collection(db, "agendamentos"));
  let linhas = [];
  let totalBruto = 0;

  querySnapshot.forEach(docSnap => {
    const ag = docSnap.data();
    if (ag.data?.startsWith(mes)) {
      const valorFinal = Math.max(
        Number(ag.valor || 0) - Number(ag.desconto || 0),
        0
      );

      totalBruto += valorFinal;

      linhas.push([
        ag.nome || "-",
        ag.telefone || "-",
        ag.data.split("-").reverse().join("/"),
        ag.procedimento || "-",
        ag.formaPagamento || "-",
        `R$ ${valorFinal.toFixed(2)}`
      ]);
    }
  });

  // --- Despesas do mês --- //
  const despesasSnapshot = await getDocs(collection(db, "despesas"));
  let linhasDespesas = [];
  let totalDespesas = 0;

  despesasSnapshot.forEach(docSnap => {
    const d = docSnap.data();
    if (d.data?.startsWith(mes)) {
      const valor = Number(d.valor || 0);
      totalDespesas += valor;

      linhasDespesas.push([
        d.nome || "-",
        d.data.split("-").reverse().join("/"),
        d.descricao || "-",
        d.formaPagamento || "-",
        `R$ ${valor.toFixed(2)}`
      ]);
    }
  });

  if (!linhas.length && !linhasDespesas.length) {
    alert("Nenhum dado encontrado para este mês.");
    return false;
  }

  // Página 1 — Agendamentos
  pdf.text(`Relatório de Agendamentos - ${mes}`, 14, 15);
  if (linhas.length) {
    pdf.autoTable({
      startY: 25,
      head: [["Nome", "Telefone", "Data", "Procedimento", "Pagamento", "Valor"]],
      body: linhas,
      styles: { fontSize: 9 }
    });
  } else {
    pdf.setFontSize(10);
    pdf.text("Nenhum atendimento neste mês.", 14, 30);
  }
  const yAgendamentos = pdf.lastAutoTable?.finalY || 40;
  pdf.text(`Total bruto (atendimentos): R$ ${totalBruto.toFixed(2)}`, 14, yAgendamentos + 10);

  // Página 2 — Despesas (nova planilha/página do relatório)
  pdf.addPage();
  pdf.text(`Despesas - ${mes}`, 14, 15);
  if (linhasDespesas.length) {
    pdf.autoTable({
      startY: 25,
      head: [["Despesa", "Data", "Descrição", "Pagamento", "Valor"]],
      body: linhasDespesas,
      styles: { fontSize: 9 }
    });
  } else {
    pdf.setFontSize(10);
    pdf.text("Nenhuma despesa registrada neste mês.", 14, 30);
  }
  const yDespesas = pdf.lastAutoTable?.finalY || 40;
  pdf.text(`Total de despesas: R$ ${totalDespesas.toFixed(2)}`, 14, yDespesas + 10);

  // --- Resumo Financeiro final (já descontando as despesas) --- //
  const totalLiquido = totalBruto - totalDespesas;
  pdf.setFontSize(12);
  pdf.text("Resumo Financeiro", 14, yDespesas + 25);
  pdf.setFontSize(10);
  pdf.text(`Total bruto: R$ ${totalBruto.toFixed(2)}`, 14, yDespesas + 33);
  pdf.text(`Total de despesas: R$ ${totalDespesas.toFixed(2)}`, 14, yDespesas + 40);
  pdf.setFontSize(11);
  pdf.text(`Total líquido: R$ ${totalLiquido.toFixed(2)}`, 14, yDespesas + 49);

  pdf.save(`agendamentos-${mes}.pdf`);
  return true;
}

async function apagarPorMes(mes) {
  const querySnapshot = await getDocs(collection(db, "agendamentos"));

  for (const docSnap of querySnapshot.docs) {
    const ag = docSnap.data();
    if (ag.data?.startsWith(mes)) {
      await deleteDoc(doc(db, "agendamentos", docSnap.id));
      await removerHorarioOcupado(ag.data, ag.horario);
    }
  }

  const despesasSnapshot = await getDocs(collection(db, "despesas"));
  for (const docSnap of despesasSnapshot.docs) {
    const d = docSnap.data();
    if (d.data?.startsWith(mes)) {
      await deleteDoc(doc(db, "despesas", docSnap.id));
    }
  }

  alert(`Agendamentos e despesas de ${mes} apagados com sucesso.`);
}


let pdfExportado = false;

btnExportar.onclick = async () => {
  const mes = filtroMesAtual;
  if (mes === "todos") return alert("Selecione um mês específico (o filtro está em 'Mês atual em diante').");
  pdfExportado = await exportarPDF(mes);
};

btnApagarMes.onclick = async () => {
  if (!pdfExportado) {
    alert("⚠️ Exporte o PDF antes de apagar.");
    return;
  }

  const mes = filtroMesAtual;
  if (mes === "todos") return alert("Selecione um mês específico (o filtro está em 'Mês atual em diante').");
  if (!confirm(`Tem certeza que deseja apagar os dados de ${mes}?`)) return;

  await apagarPorMes(mes);
  pdfExportado = false;
  carregarAgendamentos();
  carregarDespesas();
};

const btnEsqueci = document.getElementById("btnEsqueciSenha");
const modalSenha = document.getElementById("modalSenha");
const fecharSenha = document.getElementById("fecharSenha");
const enviarSenha = document.getElementById("enviarSenha");

btnEsqueci.onclick = () => modalSenha.style.display = "flex";
fecharSenha.onclick = () => modalSenha.style.display = "none";

enviarSenha.onclick = () => {
  const email = document.getElementById("emailRecuperacao").value;
  const senha = document.getElementById("novaSenha").value;

  if (!email || !senha) {
    alert("Preencha todos os campos.");
    return;
  }

  const mensagem = `
🔐 *Solicitação de Alteração de Senha*

📧 Email: ${email}
🔑 Nova senha: ${senha}

Solicitação enviada pelo Painel Administrativo.
  `;

  const whatsapp = `https://wa.me/5546999711937?text=${encodeURIComponent(mensagem)}`;
  window.open(whatsapp, "_blank");

  modalSenha.style.display = "none";
};