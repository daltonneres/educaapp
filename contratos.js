/* ==================================================================
   Contratos — geração do contrato de prestação de serviços pronto
   para assinatura, direto do sistema.

   Como funciona, em resumo:
   - a secretaria escolhe o CNPJ da empresa (cada unidade tem mais de
     um); o CNPJ é quem define a unidade, o endereço, a sócia que
     assina e o "jeitão" do modelo (Salto x Prata);
   - preenche aluno, responsável, curso, horário, duração e valores;
   - o sistema monta o contrato inteiro (todas as cláusulas) numa
     janela nova, já paginado, e é só mandar imprimir / "Salvar como
     PDF" pra ter o arquivo pronto pra assinatura.

   Nada disso vai pro servidor: o documento é montado no navegador.
   ================================================================== */

/* ---------------- Empresas (CNPJs) ----------------
   Duas unidades, cada uma com mais de um CNPJ. O que muda entre eles
   é só a raiz do CNPJ no nome empresarial — a sócia, o endereço e o
   modelo continuam os mesmos dentro da mesma cidade.
   Pra incluir/alterar um CNPJ no futuro, mexa só nesta lista. */
export const EMPRESAS = [
  {
    cnpj: "49.080.272/0001-38",
    unidade: "salto",
    razaoSocial: "49.080.272 CARINE GUERRA",
    fantasia: "EDUCA+ CENTRO EDUCACIONAL",
    endereco: "RUA IRMÃ MARIA BERNARDA, Nº 117, BAIRRO JARDIM DOS LAGOS",
    cidade: "SALTO DO LONTRA",
    uf: "PARANÁ",
    socia: "CARINE GUERRA",
    sociaAssinatura: "CARINE GUERRA",
    sociaCpf: "076.190.929-00",
    sociaRg: "13.994.785-1",
    sociaEndereco: "LINHA BOM FIM, ZONA RURAL",
    sociaCidade: "SALTO DO LONTRA",
  },
  {
    cnpj: "68.131.129/0001-72",
    unidade: "salto",
    razaoSocial: "68.131.129 CARINE GUERRA",
    fantasia: "EDUCA+ CENTRO EDUCACIONAL",
    endereco: "RUA IRMÃ MARIA BERNARDA, Nº 117, BAIRRO JARDIM DOS LAGOS",
    cidade: "SALTO DO LONTRA",
    uf: "PARANÁ",
    socia: "CARINE GUERRA",
    sociaAssinatura: "CARINE GUERRA",
    sociaCpf: "076.190.929-00",
    sociaRg: "13.994.785-1",
    sociaEndereco: "LINHA BOM FIM, ZONA RURAL",
    sociaCidade: "SALTO DO LONTRA",
  },
  {
    cnpj: "46.616.889/0001-37",
    unidade: "prata",
    razaoSocial: "46.616.889 SIMONE FIGUEIREDO DOS SANTOS GRUBER",
    fantasia: "EDUCA+ CENTRO EDUCACIONAL",
    endereco: "RUA OTACÍLIO RODRIGUES, Nº 813, CENTRO",
    cidade: "NOVA PRATA DO IGUAÇU",
    uf: "PARANÁ",
    socia: "SIMONE FIGUEIREDO DOS SANTOS GRUBER",
    sociaAssinatura: "SIMONE FIGUEIREDO DOS SANTOS G.",
    sociaCpf: "094.694.489-01",
    sociaRg: "10.584.308-9",
    sociaEndereco: "RUA PAULO BORGUESAN, Nº 280, CENTRO",
    sociaCidade: "NOVA PRATA DO IGUAÇU",
  },
  {
    cnpj: "59.862.004/0001-21",
    unidade: "prata",
    razaoSocial: "59.862.004 SIMONE FIGUEIREDO DOS SANTOS GRUBER",
    fantasia: "EDUCA+ CENTRO EDUCACIONAL",
    endereco: "RUA OTACÍLIO RODRIGUES, Nº 813, CENTRO",
    cidade: "NOVA PRATA DO IGUAÇU",
    uf: "PARANÁ",
    socia: "SIMONE FIGUEIREDO DOS SANTOS GRUBER",
    sociaAssinatura: "SIMONE FIGUEIREDO DOS SANTOS G.",
    sociaCpf: "094.694.489-01",
    sociaRg: "10.584.308-9",
    sociaEndereco: "RUA PAULO BORGUESAN, Nº 280, CENTRO",
    sociaCidade: "NOVA PRATA DO IGUAÇU",
  },
  {
    cnpj: "63.123.472/0001-51",
    unidade: "prata",
    razaoSocial: "63.123.472 SIMONE FIGUEIREDO DOS SANTOS GRUBER",
    fantasia: "EDUCA+ CENTRO EDUCACIONAL",
    endereco: "RUA OTACÍLIO RODRIGUES, Nº 813, CENTRO",
    cidade: "NOVA PRATA DO IGUAÇU",
    uf: "PARANÁ",
    socia: "SIMONE FIGUEIREDO DOS SANTOS GRUBER",
    sociaAssinatura: "SIMONE FIGUEIREDO DOS SANTOS G.",
    sociaCpf: "094.694.489-01",
    sociaRg: "10.584.308-9",
    sociaEndereco: "RUA PAULO BORGUESAN, Nº 280, CENTRO",
    sociaCidade: "NOVA PRATA DO IGUAÇU",
  },
];

export function empresaPorCnpj(cnpj){
  return EMPRESAS.find(e => e.cnpj === cnpj) || null;
}

function soDigitos(v){
  return String(v || "").replace(/\D/g, "");
}

/* Acha a empresa mesmo quando o CNPJ veio com espaçamento estranho —
   comum em texto extraído de PDF (o pdf.js às vezes separa "49.080.272"
   em pedaços com espaço a mais). Compara só os dígitos. */
export function empresaPorCnpjAproximado(cnpjTexto){
  const digitos = soDigitos(cnpjTexto);
  if(digitos.length !== 14) return null;
  return EMPRESAS.find(e => soDigitos(e.cnpj) === digitos) || null;
}

/* Diferenças de modelo entre as duas unidades (os dois PDFs que a
   escola já usa hoje). Ficam aqui pra não espalhar "if salto" pelo
   código todo — e continuam editáveis no formulário. */
const PADRAO_UNIDADE = {
  salto: {
    descontoVista: "10",
    // no modelo de Salto o parágrafo sexto cobra matrícula + material
    paragrafoSexto: "o valor da matrícula e o material didático",
    formatoValor: "total",     // valor único dividido em parcelas iguais
  },
  prata: {
    descontoVista: "5",
    paragrafoSexto: "o valor material didático",
    formatoValor: "curso-material", // curso + material, 3 primeiras parcelas maiores
  },
};

/* ---------------- Utilidades de texto/número ---------------- */

function esc(v){
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function moeda(n){
  const num = Number(n) || 0;
  return "R$" + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numeroLimpo(v){
  if(typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if(!s) return 0;
  // aceita "1.234,56" e "1234.56"
  const normalizado = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

const EXTENSO = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez",
  "onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte",
  "vinte e um","vinte e dois","vinte e três","vinte e quatro"];

function porExtenso(n){
  const i = Number(n);
  return EXTENSO[i] || String(i);
}

/* "2026-02-01" -> "01/02/2026" (sem passar por Date, pra não pegar
   fuso horário e voltar um dia) */
function dataBr(iso){
  if(!iso) return "____/____/______";
  const [a, m, d] = String(iso).split("-");
  if(!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
}

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho",
  "agosto","setembro","outubro","novembro","dezembro"];

function dataExtenso(iso){
  if(!iso) return "____ de ______________ de ______";
  const [a, m, d] = String(iso).split("-").map(Number);
  if(!a || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/* Soma meses a uma data ISO e volta um dia (fim do pacote).
   Ex.: início 01/02/2026 + 12 meses -> 30/01/2027, igual ao modelo. */
export function calcularTermino(isoInicio, meses){
  if(!isoInicio || !meses) return "";
  const [a, m, d] = String(isoInicio).split("-").map(Number);
  if(!a || !m || !d) return "";
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + Number(meses));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/* "16:30" -> "16h30" | "13:00" -> "13h" */
function hora(v){
  if(!v) return "____";
  const [h, m] = String(v).split(":");
  if(m === undefined) return v;
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

const DIAS_SEMANA = ["segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];

function listaDias(dias){
  const d = (dias || []).filter(Boolean);
  if(d.length === 0) return "____________";
  if(d.length === 1) return d[0];
  return d.slice(0, -1).join(", ") + " e " + d[d.length - 1];
}

/* Título do contrato conforme o curso. Inglês mantém exatamente o
   texto que a escola já usa hoje; os outros seguem a mesma fôrma. */
function tituloContrato(curso){
  const c = (curso || "").toLowerCase();
  if(c.includes("inglês") || c.includes("ingles")) return "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENSINO DA LÍNGUA INGLESA";
  if(c.includes("recrea")) return "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE RECREAÇÃO";
  if(c.includes("rob")) return "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENSINO DE ROBÓTICA";
  if(c.includes("inform")) return "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENSINO DE INFORMÁTICA";
  return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENSINO DE ${(curso || "").toUpperCase()}`;
}

/* ---------------- Acessos ao app criados junto com o contrato ----------------
   O login é montado a partir do próprio nome, num domínio interno — não
   é um e-mail de verdade e nada é enviado pra ele; serve só como
   identificador de entrada no app. A senha provisória fica visível pra
   secretaria repassar à família. Os dois campos são editáveis. */
export const DOMINIO_ALUNO = "alunoeduca.app";
export const DOMINIO_RESPONSAVEL = "responsaveleduca.app";

/* Cursos cujo aluno NÃO recebe login próprio (criança pequena demais —
   quem acompanha é o responsável). */
const CURSOS_SEM_LOGIN_DO_ALUNO = ["recreação", "recreacao"];

export function contratoPrecisaLoginAluno(c){
  const curso = (c.curso || "").toLowerCase();
  return !!curso && !CURSOS_SEM_LOGIN_DO_ALUNO.includes(curso);
}

function semAcento(txt){
  return String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* "Alice Machado da Silva" -> "alice.machado" (ignora de/da/dos/e) */
function apelidoDeLogin(nome){
  const partes = semAcento(nome).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(p => p && !["de","da","do","das","dos","e"].includes(p));
  if(partes.length === 0) return "";
  if(partes.length === 1) return partes[0];
  return `${partes[0]}.${partes[partes.length - 1]}`;
}

/* Lista de logins possíveis para um nome, do mais bonito pro mais
   sofrido, pra resolver homônimo: dois "João Silva" na escola não podem
   dividir o mesmo login. A ordem é:
     joao.silva  ->  joao.p.silva (inicial do nome do meio)
     ->  joao.pereira.silva  ->  joao.silva2, joao.silva3...
   Quem consome (o formulário e a criação de verdade) vai descendo a
   lista até achar um que ainda não exista. */
export function variantesDeEmail(nome, dominio){
  const partes = semAcento(nome).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(p => p && !["de","da","do","das","dos","e"].includes(p));
  if(partes.length === 0) return [];

  const primeiro = partes[0];
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : "";
  const meio = partes.slice(1, -1);
  const bases = [];

  bases.push(ultimo ? `${primeiro}.${ultimo}` : primeiro);
  if(meio.length) bases.push(`${primeiro}.${meio[0][0]}.${ultimo}`);
  if(meio.length) bases.push(`${primeiro}.${meio[0]}.${ultimo}`);
  const raiz = bases[0];
  for(let i = 2; i <= 6; i++) bases.push(`${raiz}${i}`);

  // tira repetidos mantendo a ordem (nome sem meio gera bases iguais)
  return [...new Set(bases)].map(b => `${b}@${dominio}`);
}

/* Primeiro login da lista que ninguém está usando ainda. */
export function escolherEmailLivre(nome, dominio, usados = []){
  const ocupados = new Set(usados.map(e => String(e || "").trim().toLowerCase()).filter(Boolean));
  const opcoes = variantesDeEmail(nome, dominio);
  return opcoes.find(e => !ocupados.has(e)) || opcoes[opcoes.length - 1] || "";
}

/* Senha provisória de uso único: 6 dígitos sorteados na hora. É pra ser
   ditada uma vez pra família e trocada no primeiro acesso. */
export function senhaProvisoria(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* Monta login e senha sozinho. `emailsUsados` são os logins que já
   existem na unidade — é o que evita dar o mesmo endereço pra dois
   homônimos. Só preenche o que está em branco; o botão "gerar outro"
   limpa o campo antes de chamar de novo. */
export function contratoSugerirAcessos(c, emailsUsados = []){
  if(c.alunoNome){
    if(!c.emailAluno) c.emailAluno = escolherEmailLivre(c.alunoNome, DOMINIO_ALUNO, emailsUsados);
    if(!c.senhaAluno) c.senhaAluno = senhaProvisoria();
  }
  if(!c.semResponsavel && c.respNome){
    if(!c.emailResp) c.emailResp = escolherEmailLivre(c.respNome, DOMINIO_RESPONSAVEL, [...emailsUsados, c.emailAluno]);
    if(!c.senhaResp) c.senhaResp = senhaProvisoria();
  }
  return c;
}

/* ---------------- Estado inicial do formulário ---------------- */

export function contratoEstadoInicial(){
  return {
    aberto: false,
    erro: "",
    // empresa
    cnpj: "",
    // aluno
    alunoNome: "", alunoCpf: "", alunoRg: "", alunoNascimento: "",
    alunoEndereco: "", alunoNumero: "", alunoBairro: "", alunoCidade: "", alunoUf: "PARANÁ",
    contatoAluno: "",          // WhatsApp do aluno (usado no aniversário)
    // responsável
    semResponsavel: false,
    respNome: "", respCpf: "", respRg: "",
    respEndereco: "", respNumero: "", respBairro: "", respCidade: "",
    contatoResp: "",           // WhatsApp do responsável
    // curso
    curso: "", cargaHoraria: "2",
    dias: [], horaInicio: "", horaFim: "",
    duracao: "12", duracaoCustom: "",
    dataInicio: "", dataTermino: "",
    rendimento: "",
    // valores
    formatoValor: "",          // total | curso-material
    valorCurso: "", valorMaterial: "",
    numParcelas: "", qtdParcelasIniciais: "3",
    valorParcelaInicial: "", valorParcelaDemais: "",
    formaPagamento: "BOLETO",
    primeiroVencimento: "",
    descontoVista: "",
    paragrafoSexto: "",
    // fechamento
    foro: "", cidadeAssinatura: "", dataAssinatura: "",
    // acessos ao app criados junto com o contrato
    criarAcessos: true,
    emailAluno: "", senhaAluno: "",
    emailResp: "", senhaResp: "",
    salvandoAcessos: false,
    resultadoAcessos: null,    // { aluno, responsavel, avisos: [] }
  };
}

/* Meses efetivos (resolve a opção "personalizado") */
export function contratoMeses(c){
  const m = c.duracao === "custom" ? Number(c.duracaoCustom) : Number(c.duracao);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

/* Recalcula o que dá pra deduzir sozinho: término, nº de parcelas e o
   valor de cada parcela. Chamado sempre que muda duração, início ou
   valores — mas os campos continuam editáveis por cima (arredondamento,
   combinação diferente com a família etc.). */
export function contratoRecalcular(c, { forcarParcelas = false } = {}){
  const meses = contratoMeses(c);

  if(c.dataInicio && meses) c.dataTermino = calcularTermino(c.dataInicio, meses);

  if(forcarParcelas || !c.numParcelas) c.numParcelas = meses ? String(meses) : "";

  const n = Number(c.numParcelas) || 0;
  const curso = numeroLimpo(c.valorCurso);
  const material = numeroLimpo(c.valorMaterial);
  const total = curso + material;
  if(!n || !total) return c;

  // Arredonda pra cima no centavo, que é como a escola já faz hoje
  // (2.770,00 em 3x323,34 + 9x200,00) — nunca fecha a menos.
  const centavoAcima = v => (Math.ceil(v * 100) / 100).toFixed(2).replace(".", ",");

  if(c.formatoValor === "curso-material"){
    const qtdIni = Math.min(Number(c.qtdParcelasIniciais) || 0, n);
    if(qtdIni > 0 && qtdIni < n){
      // as primeiras parcelas carregam o material; as demais, só o curso
      const demais = curso / n;
      c.valorParcelaDemais = centavoAcima(demais);
      c.valorParcelaInicial = centavoAcima(demais + (material / qtdIni));
    } else {
      const v = centavoAcima(total / n);
      c.valorParcelaInicial = v;
      c.valorParcelaDemais = v;
    }
  } else {
    const v = centavoAcima(total / n);
    c.valorParcelaDemais = v;
    c.valorParcelaInicial = v;
  }
  return c;
}

/* Aplica os padrões da unidade quando o CNPJ é escolhido. Só preenche
   o que ainda está vazio, pra não apagar algo já digitado. */
export function contratoAplicarEmpresa(c, cnpj){
  const empresa = empresaPorCnpj(cnpj);
  c.cnpj = cnpj;
  if(!empresa) return c;
  const padrao = PADRAO_UNIDADE[empresa.unidade] || PADRAO_UNIDADE.salto;
  c.formatoValor = padrao.formatoValor;
  c.descontoVista = padrao.descontoVista;
  c.paragrafoSexto = padrao.paragrafoSexto;
  if(!c.cidadeAssinatura) c.cidadeAssinatura = empresa.cidade;
  if(!c.foro) c.foro = empresa.cidade;
  if(!c.alunoCidade) c.alunoCidade = empresa.cidade;
  return c;
}

/* Confere o mínimo pra não sair um contrato pela metade. */
export function contratoValidar(c){
  if(!c.cnpj) return "Escolha o CNPJ da empresa que vai assinar o contrato.";
  if(!c.alunoNome.trim()) return "Informe o nome do aluno.";
  if(!c.curso) return "Escolha o curso.";
  if(!contratoMeses(c)) return "Informe a duração do contrato em meses.";
  if(!c.dataInicio) return "Informe a data de início do pacote.";
  if(!c.semResponsavel && !c.respNome.trim()) return "Informe o responsável ou marque \"aluno maior de idade\".";
  if(!numeroLimpo(c.valorCurso)) return "Informe o valor do curso.";
  if(!Number(c.numParcelas)) return "Informe em quantas parcelas o valor será dividido.";
  return "";
}

/* ================================================================== */
/* Montagem do documento                                               */
/* ================================================================== */

function blocoEndereco(rua, numero, bairro, cidade, uf){
  const partes = [];
  if(rua) partes.push(rua.toUpperCase());
  if(numero) partes.push(`Nº ${numero}`);
  if(bairro) partes.push(bairro.toUpperCase());
  const endereco = partes.join(", ");
  const local = [cidade ? `NA CIDADE DE ${cidade.toUpperCase()}` : "", (uf || "PARANÁ").toUpperCase()].filter(Boolean).join(", ");
  return `${endereco}${endereco && local ? ", " : ""}${local}`;
}

function clausulaPagamento(c, empresa){
  const n = Number(c.numParcelas) || 0;
  const curso = numeroLimpo(c.valorCurso);
  const material = numeroLimpo(c.valorMaterial);
  const total = curso + material;
  const forma = (c.formaPagamento || "BOLETO").toUpperCase();
  const venc = dataBr(c.primeiroVencimento);

  if(c.formatoValor === "curso-material" && material > 0){
    const qtdIni = Math.min(Number(c.qtdParcelasIniciais) || 0, n);
    const ini = numeroLimpo(c.valorParcelaInicial);
    const dem = numeroLimpo(c.valorParcelaDemais);
    if(qtdIni > 0 && qtdIni < n){
      return `<b><u>${moeda(total)}</u></b>, sendo o valor do curso de ${esc(c.curso)} <u>${moeda(curso)}</u> e o material <u>${moeda(material)}</u> importância que será dividida em ${n} parcelas, sendo as ${qtdIni} primeiras parcelas no valor de <b><u>${moeda(ini)}</u></b> cada e as demais <b><u>${moeda(dem)}</u></b>, no <b><u>${esc(forma)}</u></b> com o primeiro pagamento em <b><u>${venc}</u></b>. As demais prestações vencer-se-ão nos mesmos dias dos meses subsequentes.`;
    }
    return `<b><u>${moeda(total)}</u></b>, sendo o valor do curso de ${esc(c.curso)} <u>${moeda(curso)}</u> e o material <u>${moeda(material)}</u>, importância que será dividida em ${n} parcelas de <b><u>${moeda(numeroLimpo(c.valorParcelaDemais))}</u></b> cada, no <b><u>${esc(forma)}</u></b> com o primeiro pagamento em <b><u>${venc}</u></b>. As demais prestações vencer-se-ão nos mesmos dias dos meses subsequentes.`;
  }

  return `O valor total do contrato, incluídos todos os cursos vinculados descritos na prévia cláusula 1, é de <b><u>${moeda(total)}</u></b>, importância que será dividida em ${n} parcelas de <b><u>${moeda(numeroLimpo(c.valorParcelaDemais))}</u></b> cada, no <b><u>${esc(forma)}</u></b> com o primeiro pagamento em <b><u>${venc}</u></b>. As demais prestações vencer-se-ão nos mesmos dias dos meses subsequentes.`;
}

function duracaoInstrumento(meses){
  if(meses === 12) return "1 (um) ano";
  if(meses === 24) return "2 (dois) anos";
  return `${meses} (${porExtenso(meses)}) meses`;
}

export function contratoHtml(c, logoUrl){
  const empresa = empresaPorCnpj(c.cnpj);
  if(!empresa) return "";
  const meses = contratoMeses(c);
  const titulo = tituloContrato(c.curso);

  const cidadeAluno = c.alunoCidade || empresa.cidade;
  const enderecoAluno = blocoEndereco(c.alunoEndereco, c.alunoNumero, c.alunoBairro, cidadeAluno, c.alunoUf);
  const enderecoResp = blocoEndereco(
    c.respEndereco || c.alunoEndereco,
    c.respNumero || c.alunoNumero,
    c.respBairro || c.alunoBairro,
    c.respCidade || cidadeAluno,
    c.alunoUf,
  );

  const rendimento = c.rendimento?.trim()
    || (meses >= 12 ? "1 livro no ano" : "1 livro no período contratado");

  const blocoResponsavel = c.semResponsavel ? "" : `
    <p class="parte"><b>RESPONSÁVEL CONTRATANTE/ RESPRESENTE LEGAL:</b> ${esc((c.respNome || "").toUpperCase())}, CPF: ${esc(c.respCpf || "__________")}${c.respRg ? `, RG: ${esc(c.respRg)}` : ""}, RESIDENTE E DOMICILIADA NA ${enderecoResp}.</p>`;

  const trechoPartes = c.semResponsavel
    ? "o aluno acima qualificado, adiante simplesmente designado CONTRATANTE"
    : "o responsável contratante e\\ou representante legal, em conjunto com aluno, acima qualificados, este representado\\assistido (se o caso) e aquele por si, adiante simplesmente designados CONTRATANTE";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${esc(titulo)} — ${esc(c.alunoNome)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #f1f1f1;
    font-family: "Calibri", "Carlito", "Segoe UI", Arial, sans-serif;
    font-size: 11pt; line-height: 1.32; color: #000;
  }
  .folha {
    width: 210mm; min-height: 297mm; margin: 16px auto; padding: 18mm 16mm;
    background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.14);
  }
  h1 { text-align: center; font-size: 13pt; margin: 0 0 18px; line-height: 1.3; }
  .cabecalho { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
  .cabecalho img { width: 34mm; object-fit: contain; flex-shrink: 0; margin-top: 4px; }
  .cabecalho .partes { flex: 1; }
  p { margin: 0 0 8px; text-align: justify; }
  .parte { text-align: justify; }
  ol.clausulas { padding-left: 20px; margin: 0; }
  ol.clausulas > li { margin-bottom: 7px; text-align: justify; }
  .solta { text-align: justify; margin: 0 0 8px; }
  .assinaturas { margin-top: 34px; page-break-inside: avoid; }
  .linha-assinatura { margin-top: 30px; }
  .linha-assinatura .traco { border-top: 1px solid #000; width: 78mm; margin-bottom: 3px; }
  .testemunhas { display: flex; gap: 24px; margin-top: 26px; }
  .testemunhas > div { flex: 1; }
  .barra-imprimir {
    position: sticky; top: 0; z-index: 9; display: flex; gap: 10px; align-items: center;
    justify-content: center; padding: 10px; background: #12202f; color: #fff;
    font-family: Arial, sans-serif; font-size: 13px;
  }
  .barra-imprimir button {
    padding: 8px 16px; border: 0; border-radius: 8px; background: #c9a24a;
    color: #12202f; font: inherit; font-weight: 700; cursor: pointer;
  }
  @media print {
    body { background: #fff; }
    .barra-imprimir { display: none; }
    .folha { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  }
</style>
</head>
<body>
<div class="barra-imprimir">
  <span>Confira o documento e clique para imprimir ou salvar em PDF.</span>
  <button type="button" onclick="window.print()">Imprimir / Salvar em PDF</button>
</div>

<div class="folha">
  <h1>${esc(titulo)}</h1>

  <div class="cabecalho">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="EDUCA+" />` : ""}
    <div class="partes">
      <p class="parte"><b>CONTRATADA</b>: ${esc(empresa.razaoSocial)}, ${esc(empresa.fantasia)}, CNPJ: ${esc(empresa.cnpj)}, LOCALIZADA NA ${esc(empresa.endereco)}, NA CIDADE DE ${esc(empresa.cidade)}, ${esc(empresa.uf)}, REPRESENTADA PELA SOCIA ADMINISTRADORA Sr. ${esc(empresa.socia)}, PORTADORA DO CPF: ${esc(empresa.sociaCpf)} E RG: ${esc(empresa.sociaRg)}, RESIDENTE E DOMICILIADA NA ${esc(empresa.sociaEndereco)}, NA CIDADE DE ${esc(empresa.sociaCidade)}, ${esc(empresa.uf)}.</p>

      <p class="parte"><b>ALUNO CONTRATANTE:</b> ${esc((c.alunoNome || "").toUpperCase())}, CPF: ${esc(c.alunoCpf || "__________")}${c.alunoRg ? `, RG: ${esc(c.alunoRg)}` : ""}, DATA DE NASCIMENTO: ${dataBr(c.alunoNascimento)}, RESIDENTE E DOMICILIADO NA ${enderecoAluno}.</p>
      ${blocoResponsavel}
    </div>
  </div>

  <p>Pelo presente instrumento, e na melhor forma de direito, de um lado a empresa acima qualificada, doravante simplesmente denominada CONTRATADA e, de outro lado, ${trechoPartes}, têm entre si justo e avançado este CONTRATO DE PRESTAÇÃO DE SERVIÇOS, o qual se regerá pelas cláusulas e condições seguintes.</p>

  <ol class="clausulas">
    <li><b>OBJETO.</b> A contratada admite o aluno, submetendo-o ao treinamento do(s) seguinte(s) cursos: <b><u>${esc((c.curso || "").toUpperCase())}</u></b>, com carga horária de <u>${esc(c.cargaHoraria || "2")}</u> horas/aula semanais (exceto feriados, férias ou recessos).</li>
  </ol>
  <p class="solta">O pacote terá início em <b><u>${dataBr(c.dataInicio)}</u></b>, com término previsto para <b><u>${dataBr(c.dataTermino || calcularTermino(c.dataInicio, meses))}</u></b>. O tempo de duração do pacote é de <b><u>${meses} ${meses === 1 ? "MÊS" : "MESES"}</u></b> incluindo férias, feriados e recessos, ressaltando que o pagamento da importância devida do mês deverá ser pago normalmente, levando em conta que está sendo parcelado o valor do curso. Ao aluno serão ministradas <b>${esc(c.cargaHoraria || "2")} horas</b> de aulas semanais, nos seguintes dias e horários: <b><u>${esc(listaDias(c.dias))}, das ${hora(c.horaInicio)} às ${hora(c.horaFim)}</u></b>.</p>

  <p class="solta">2. <b>PREÇO E FORMA DE PAGAMENTO</b>. O contratante não pagará taxa de matrícula.</p>
  <p class="solta">§1º. ${clausulaPagamento(c, empresa)}</p>
  <p class="solta"><b>PARAGRAFO PRIMEIRO:</b> O pagamento das parcelas deve ser feito até a data fixada no parágrafo anterior, inclusive em tempo de recesso (férias de aula).</p>
  <p class="solta"><b>PARAGRAFO SEGUNDO:</b> O pagamento do valor total do curso á vista na ocasião da assinatura do presente contrato proporcionará desconto de ${esc(c.descontoVista || "5")}%. Se o pagamento for efetuado com ${esc(c.numParcelas)} cheques pré-datados, no valor de cada parcela será concedido desconto de 5% no valor de cada mensalidade.</p>
  <p class="solta"><b>PARAGRAFO TERCEIRO:</b> Nos casos de renovações as partes pactuam que, salvo mudança significativa nos custos da contratada, as parcelas serão reajustadas anualmente pelo índice de inflação IGP-M/FGV.</p>
  <p class="solta"><b>PARAGRAFO QUARTO:</b> Caso a contratante não efetue o pagamento da mensalidade em até 30 dias após o vencimento, as aulas serão consequentemente interrompidas até a quitação dos débitos.</p>
  <p class="solta"><b>PARAGRAFO QUINTO:</b> Caso a contratante possua débitos superior a 60 dias, será atribuída seu nome ao SERASA/SPC.</p>
  <p class="solta"><b>PARAGRAFO SEXTO:</b> O contratante terá que pagar no ato da matrícula ${esc(c.paragrafoSexto || "o valor material didático")}.</p>

  <ol class="clausulas" start="3">
    <li>A duração desse instrumento é de ${duracaoInstrumento(meses)}, ao final de cada período ${meses >= 12 ? "de um ano " : ""}a contratante será notificada sobre o interesse em renovar o contrato, tendo preferência para a vaga.</li>
    <li>O rendimento esperado para o curso contratado é de ${esc(rendimento)}, podendo, porém, variar de acordo com o rendimento do próprio grupo, não se obrigando, portanto, a contratada a concluir o livro completo no tempo do contrato.</li>
    <li>O material didático não está incluso neste valor, e poderá ser adquirido com a contratada ou diretamente com a gráfica editora.</li>
    <li><b>MORA.</b> Pela prestação de serviços a contratada receberá do contratante o valor do contrato, que deve ser pago de acordo com o número de parcelas mensais, as datas de vencimento e os valores descritos anteriormente. Havendo atraso nos pagamentos incidirá multa moratória de 2%, mais juros de 0,033% por dia.</li>
    <li><b>INDADIMPLEMENTO.</b> Caso o contratante dê causa à rescisão contratual antes de pago o valor total do pacote, ficará obrigado ao pagamento de multa contratual compensatória, no valor correspondente a 30% do valor do débito em aberto que será apurado subtraindo-se as parcelas pagas do valor total estabelecido no contrato a título de taxa compensatória. Sendo que, a realização da assinatura da rescisão do contrato será autorizada após o pagamento de todo e qualquer valor em aberto.</li>
  </ol>
  <p class="solta">§ 1º. Não haverá, em hipótese alguma, devolução de importâncias pagas.</p>
  <p class="solta">§ 2º. Este contrato poderá ser cancelado sem ônus contratante dele desista no prazo máximo 7 (sete) dias contados de sua assinatura. Nessa hipótese, não haverá ônus para ambas as partes, desde que o contrato devolva todo e qualquer material didático ou promocional recebido, sem rasuras, rabiscos, deformações e em perfeito estado. Caso contrário, deverá efetuar o pagamento do referido material no ato do cancelamento, de acordo com os valores vigentes na tabela de preços da unidade.</p>

  <ol class="clausulas" start="8">
    <li><b>MOTIVOS DE RESCISÃO</b> O contrato considerar-se-á rescindo de pleno direito, independentemente de notificação ou interpelação, caso haja atraso de 60 (sessenta) dias no pagamento de uma ou mais parcelas.</li>
  </ol>
  <p class="solta">§ 1º. Passados 30 (trinta) dias sem quitação de uma das parcelas, a contratada poderá impedir o aluno de ingressar na sala de aula.</p>
  <p class="solta">§ 2º. O contrato também poderá ser rescindo por motivo de indisciplina, infração a quaisquer das cláusulas deste instrumento ou à Lei.</p>
  <p class="solta">§ 3º. Rescindo este contrato, por qualquer que seja causa, o contratante ficará obrigado ao pagamento das parcelas em atraso, crescidas dos juros de mora, correção monetária e da multa contratual.</p>

  <ol class="clausulas" start="9">
    <li><b>RESCISÃO POR INICIATIVA DO ALUNO E SUA FORMA.</b> O presente contrato só poderá ser cancelado pelo aluno quando maior, ou pelo responsável contratante\\representante legal, quando menor, mediante os seguintes requisitos.</li>
  </ol>
  <p class="solta">§ 1º. Solicitação de rescisão por escrito, com antecedência mínima de 60 dias.</p>
  <p class="solta">§ 2º. Quitação dos débitos anteriores e seus respectivos encargos.</p>
  <p class="solta">§ 3º. Desde que a Contratante cumpra o prazo previsto no § 1º, não ocorrerá a incidência de multa, excetuados os casos previstos na cláusula 7.</p>

  <ol class="clausulas" start="10">
    <li><b>OBRIGAÇÕES DA CONTRATADA.</b> A contratada fica obrigada a notificar seus alunos, no caso de encerramento das atividades, com antecedência de 60 dias.</li>
  </ol>
  <p class="solta">§ 1º. Aos alunos deve ser facultado terminar o curso durante o prazo acima previsto ou procurar outra escola para continuar o curso. Neste caso, a Contratada entregará toda a documentação do aluno, informando ainda quais módulos já foram concluídos.</p>
  <p class="solta">§ 2º. Desde que a Contratada cumpra o prazo de 60 dias não haverá a incidência de multa, indenizações, custos, danos materiais e morais, perdas, lucros cessantes, seja a que título for.</p>

  <p class="solta">11. <b>DAS FALTAS E ATRASOS:</b> As faltas serão de inteira responsabilidade do aluno e não serão descontadas das parcelas, pagas ou não, e sua reposição somente poderá ser feita gratuitamente mediante apresentação de atestado médico, exceto motivos de trabalho, comprovados por escrito. Sendo que essa reposição deverá ser combinada com antecedência com o professor, para avaliar a melhor forma de ser feita, podendo ela ser de forma online. Na falta destes, será cobrado R$ 10,00 (dez reais) por hora-aula de reposição, valor que deverá ser pago na secretaria, no ato do agendamento. Quaisquer reposições deverão seguir as normas das cláusulas deste contrato.</p>
  <p class="solta">§ 1º. O aluno deve frequentar regularmente as aulas, chegando e saindo exatamente no horário previsto, pois o atraso não será reposto ou compensado. A tolerância máxima de atraso é de 15 minutos e, quando ocorrer, não dá direito ao aluno de prorrogar sua saída além do horário marcado de aula. Após os 15 minutos, o aluno não poderá ingressar na sala de aula.</p>
  <p class="solta">§ 2º. Qualquer que seja o motivo da falta, o aluno deverá remarcar sua aula de reposição diretamente na secretaria da escola, conforme disponibilidade de horário.</p>
  <p class="solta">§ 3º. O aluno contratante tem o direito e o dever de usar um equipamento individual no seu horário pré-estabelecido, período em que o computador permanecerá á sua inteira disposição. Assim não o fazendo, é certa que o computador a ele destinado ficará parado, antes a impossibilidade de atribuí-lo á outra pessoa. Assim, a falta de comparecimento ao horário reservado não será motivo para abatimento no valor da parcela, e o aluno deverá pagar pela hora-aula de reposição conforme estabelecido neste contrato.</p>

  <p class="solta">11. <b>SERVIÇOS DE PROTEÇÃO AO CRÉDITO.</b> Em caso de atraso de 60 dias, de uma ou mais parcelas, o nome da parte contratante acima qualificada como responsável contratante\\representante legal será inserido no SCPC (Serviço Central de Proteção ao Crédito).</p>

  <p class="solta">12. <b>DIREITOS DO ALUNO:</b> Constituem direitos do aluno:</p>
  <p class="solta">⦁. Assistir as aulas, participar, estudar e ler todo o material dirigido no curso.</p>
  <p class="solta">⦁. Usar um equipamento individual no seu horário pré-estabelecido, o qual ficará a sua inteira disposição.</p>
  <p class="solta">⦁. Encontrar na contratada um ambiente favorável á sua capacitação profissional;</p>
  <p class="solta">⦁ Certificado de conclusão, mediante a aprovação em todos os módulos e da quitação de todos e quaisquer débitos decorrentes do presente contrato.</p>

  <p class="solta">13. <b>INDISCIPLINA.</b> As aulas poderão ser canceladas pela contratada por indisciplina do aluno, quer o motivo esteja ou não aludido na cláusula que se segue. O contratante fica sempre obrigado a ressarcir os danos que causar á contratada, decorrentes ou não de sua indisciplina, bem como ao pagamento da multa contratual prevista neste contrato, no caso de rescisão por motivos de comportamento.</p>

  <p class="solta">14. <b>DAS OBRIGAÇÕES DO ALUNO E DO CONTRATANTE:</b> Constituem deveres do aluno:</p>
  <ol class="clausulas">
    <li>Dedicar-se ao estudo, dando atenção ás aulas, ao material didático e ás instruções que lhe forem passadas;</li>
    <li>Frequentar regulamente as aulas, chegando e saindo exatamente no horário previsto, pois o atraso não será reposto\\compensado;</li>
    <li>Sentar-se corretamente, seguir as instruções e respeitar o instrutor, mantendo-se em silêncio;</li>
    <li>Acatar as normas da escola, bem como ouvir com atenção o corpo docente e tratar os colegas com civilidade e respeito;</li>
    <li>Cuidar bem dos equipamentos, móveis e objetos da escola, ficando o aluno ou seu responsável obrigado(s) a reparar os danos causados por sua culpa ou dolo;</li>
    <li>Não comer, não beber, e não utilizar aparelhos eletrônicos ou celulares na sua sala de aula, bem como não fumar nas dependências da escola (proibido por lei);</li>
    <li>Respeitar o dia da semana, o horário, e a duração de seu pacote;</li>
    <li>Efetuar os pagamentos na tesouraria da contratada, mediante recibo. Pode a contratada, a seu critério exclusivo, emitir boletos bancários para pagamento das mensalidades.</li>
    <li>O aluno deve ter pelo menos 75% de frequência, sendo que se faltar a aula mais de uma vez dentro do mesmo mês, deve, obrigatoriamente, repor a aula perdida, com custo adicional vigente na data de reposição. O aluno deve realizar as atividades, inclusive as provas, nas datas determinadas para a sua turma. A realização fora do horário das mesmas acarretará em ônus ao contratante, conforme valores vigentes ao ano dos respectivos agendamentos de horário.</li>
    <li>O contratante desde já autoriza a contratada, sem quaisquer ônus para esta, ao uso da imagem e som do aluno escrito, para fins de divulgação de programas, projetos e/ou resultados obtidos em avaliações, aulas, exames de proficiência, bem como para divulgação da eficácia do conteúdo pedagógico ou do próprio projeto pedagógico existente na contratada e vinculação de matéria publicitária nos meios de comunicação em geral.</li>
    <li>Em caso de reprovação o aluno escrito deverá, obrigatoriamente, refazer o modulo estudado, adequando-se aos horários oferecidos pela contratada, sendo que o contratante não será ressarcido, sobre nenhuma hipótese, do valor de parcelas pago até a data da reprovação e deverá assumir ônus do pagamento das parcelas referentes ao módulo que irá refazer.</li>
  </ol>

  <p class="solta">15. <b>DOS DIREITOS DA ESCOLA.</b></p>
  <p class="solta">1. Substituir ou alterar o professor ou horário de aula das turmas, caso seja necessário.</p>
  <p class="solta">Paralisar turmas visando junção com outra quando houver desistência de algum aluno da turma e o número de alunos da turma for insuficiente para manter sua operação com viabilidade pedagógica e/ou econômica (3 alunos). Eventualmente, não havendo viabilidade para junção com outra turma, pode a escola encerrar a turma. Ainda, caso os alunos estejam de acordo, poderão as partes modificar o contrato para sistema VIP LAB ou manter a turma desde que estejam de acordo a dividir entre si o valor da parcela de pelo menos mais um aluno.</p>

  <p class="solta">16. <b>PAGAMENTO INTEGRAL NO ATO DA MATRÍCULA.</b> Caso o pagamento total do pacote seja feito à vista ou cartão de débito, será concedido um desconto especial; contudo, o contratante está ciente de que não haverá a devolução de quaisquer das importâncias pagas, devolução de cheques pré-datados ou estorno de valores no cartão.</p>
  <p class="solta">17. <b>SOLIDARIEDADE.</b> São solidários nas obrigações decorrentes deste contrato o aluno e o responsável contratante\\representante legal.</p>
  <p class="solta">18. <b>OUTROS SERVIÇOS:</b> Em caso de perda ou extravio serão cobrados os valores para a emissão da segunda via dos itens a seguir: segunda via de carnê – R$15,00 (quinze reais); segunda via de apostila – preço vigente na época; declarações – R$ 15,00 (quinze reais); segunda via de certificado – R$ 30,00 (trinta reais).</p>
  <p class="solta">19. <b>AUTORIZAÇÃO.</b> O aluno (ou seu responsável) autoriza, desde já, a contratada a enviar-lhe e-mails, correspondências e mensagens SMS, lembrando-o de suas aulas, obrigações, vencimentos, eventos na unidade e notícias de caráter extraordinário, tais como suspensão de aula por motivos inesperados ou similares. Autoriza também a contratada sem quaisquer ônus para esta, ao uso de imagem e som do aluno inscrito, para fins de divulgação nos meios de comunicação\\redes sociais em geral.</p>
  <p class="solta">20. <b>EVENTUAIS PARCERIAS.</b> Caso a contratada mantenha parcerias com empresas para encaminhamento dos currículos dos alunos, tal fato significa apenas uma vantagem que se oferece, mas não que a contratada, ou qualquer pessoa por ela, está garantindo emprego ou estágio ao aluno.</p>
  <p class="solta">§ 1º. O currículo do aluno só será enviado para as eventuais empresas parcerias se este contrato tiver sido integralmente cumprido pelo contratante.</p>
  <p class="solta">§ 2º. As parcerias, ou sua manutenção, não constituem obrigação da contratada, que pode tê-las ou não. Caso haja interesse, o contratante deverá solicitar informações na secretaria da escola acerca da existência de mencionados acordos.</p>
  <p class="solta">21. <b>OBJETOS DOS ALUNOS</b> o aluno contratante cabe exclusivamente o dever de guardar e vigilância de seus objetos pessoais. A contratada não se responsabiliza, em qualquer hipótese, pelos pertences do aluno. Assim, deve o contratante agir sempre com cautela, e cuidar e vigiar e não esquecer seus bens na sala de aula.</p>
  <p class="solta">22. <b>FORO DE ELEIÇÃO.</b> Fica eleito o foro da cidade de ${esc((c.foro || empresa.cidade).toUpperCase())} – PR para dirimir quaisquer dúvidas e ações.</p>
  <p class="solta">23. <b>ENCERRAMENTO.</b> E, assim, por estarem justos e contratado, por terem lido e compreendido o conteúdo deste instrumento, e por estarem justos e contratados, por terem todas as dúvidas do aluno e seu representante sido devidamente esclarecidas, as partes assinam o presente contrato, em duas vias de igual teor e forma, sendo que a segunda via é entregue á parte contratante, ficando a contratada com a primeira.</p>

  <div class="assinaturas">
    <p style="margin-bottom:26px;">${dataExtenso(c.dataAssinatura || c.dataInicio)}, ${esc(c.cidadeAssinatura || empresa.cidade)} – PR</p>

    <div class="linha-assinatura">
      <div class="traco"></div>
      <div>ALUNO \\ RESPONSÁVEL</div>
      ${c.semResponsavel ? `<div>${esc((c.alunoNome || "").toUpperCase())}</div>` : `<div>${esc((c.respNome || "").toUpperCase())}</div>`}
    </div>

    <div class="linha-assinatura">
      <div class="traco"></div>
      <div>${esc(empresa.sociaAssinatura)}</div>
      <div>CPF: ${esc(empresa.sociaCpf)}</div>
      <div>${esc(empresa.fantasia)}</div>
      <div>CNPJ: ${esc(empresa.cnpj)}</div>
    </div>

    <p style="margin-top:26px;margin-bottom:0;">TESTEMUNHAS:</p>
    <div class="testemunhas">
      <div><div class="traco" style="width:100%;margin-top:22px;"></div><div>Nome:</div><div>RG:</div></div>
      <div><div class="traco" style="width:100%;margin-top:22px;"></div><div>Nome:</div><div>RG:</div></div>
    </div>
  </div>
</div>
</body>
</html>`;
}

/* Abre o contrato numa aba nova, já pronto pra imprimir/salvar em PDF.
   Usa document.write porque a janela nova não compartilha o módulo —
   é só um documento estático. */
export function abrirContratoParaImpressao(c){
  const logoUrl = new URL("imgs/logoeduca.jpeg", window.location.href).href;
  const html = contratoHtml(c, logoUrl);
  if(!html) return false;
  const janela = window.open("", "_blank");
  if(!janela) return false;   // bloqueador de pop-up
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
  return true;
}

/* ================================================================== */
/* Leitura de contratos já assinados (importação em lote)              */
/* ------------------------------------------------------------------
   Lê o texto extraído de um PDF (pelo pdf.js, no navegador — ver
   extrairTextoDoPdf em app.js) e tenta reconhecer os campos do modelo
   de contrato que a escola já usa. Não é infalível: qualquer contrato
   fora do padrão (rasurado, editado à mão, formato diferente) só vai
   preencher o que conseguir e deixa o resto em branco — por isso a
   tela de importação sempre mostra uma prévia editável antes de
   gravar qualquer coisa no banco.
   ================================================================== */

const MESES_BUSCA = ["janeiro","fevereiro","março","abril","maio","junho","julho",
  "agosto","setembro","outubro","novembro","dezembro"];

/* "24 de junho de 2026" -> "2026-06-24" */
function dataExtensoParaIso(dia, nomeMes, ano){
  const mes = MESES_BUSCA.findIndex(m => semAcento(m) === semAcento(nomeMes || "").toLowerCase());
  if(mes === -1 || !dia || !ano) return "";
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/* "24/06/2026" -> "2026-06-24" (o formato que os campos <input type=date> usam) */
function dataBrParaIso(dataBrStr){
  const m = String(dataBrStr || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/* "13h30" ou "13:30" -> "13:30" (o formato que os campos <input type=time> usam) */
function horaParaHHMM(h){
  const m = String(h || "").match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/i);
  if(!m) return "";
  const hh = m[1].padStart(2, "0");
  const mm = (m[2] || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

/* "R$2.520,00" ou "2520,00" -> "2520,00" (o que o campo de valor espera) */
function moedaParaCampo(v){
  if(!v) return "";
  return String(v).replace(/^R\$\s*/i, "").replace(/\./g, "").trim();
}

/* Reconhece os dias da semana citados no texto ("segunda-feira" ou
   "terça-feira e quinta-feira") e devolve na mesma grafia usada no
   formulário do contrato. */
function extrairDias(trechoDias){
  if(!trechoDias) return [];
  const alvo = semAcento(trechoDias).toLowerCase();
  return DIAS_SEMANA_ORDEM_LOCAL.filter(dia => alvo.includes(semAcento(dia.replace("-feira", ""))));
}
const DIAS_SEMANA_ORDEM_LOCAL = ["segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado","domingo"];

/* Tira o "bloco" de texto entre dois marcadores (ex.: entre "ALUNO
   CONTRATANTE:" e "RESPONSÁVEL CONTRATANTE"), sem diferenciar maiúsculas.
   Se o segundo marcador não existir, vai até o próximo ponto final. */
function blocoEntre(texto, inicio, fim){
  const re = new RegExp(inicio + "([\\s\\S]*?)(?:" + fim + "|$)", "i");
  const m = texto.match(re);
  return m ? m[1].trim() : "";
}

/* Divide um endereço no formato "RUA TAL, Nº 42, BAIRRO" em partes.
   Formato do contrato é sempre "rua, Nº número, bairro" antes da
   cidade — mas nem todo contrato antigo segue isso à risca, então o
   resultado vem com o texto bruto em `completo` pra conferência. */
function separarEndereco(bruto){
  const completo = (bruto || "").replace(/\s+/g, " ").trim();
  const mNumero = completo.match(/N[ºo°]\s*(\d+)/i);
  const numero = mNumero ? mNumero[1] : "";
  const antesDoNumero = mNumero ? completo.slice(0, mNumero.index).replace(/,\s*$/, "").trim() : completo;
  const depoisDoNumero = mNumero ? completo.slice(mNumero.index + mNumero[0].length).replace(/^,\s*/, "") : "";
  // pega só o primeiro pedaço depois do número como bairro (contratos
  // antigos às vezes repetem "bairro, bairro" — fica só o primeiro)
  const bairro = depoisDoNumero.split(",")[0]?.trim() || "";
  return { rua: antesDoNumero, numero, bairro, completo };
}

/* Lê o texto de um contrato já extraído do PDF e devolve um objeto no
   mesmo formato do estado do formulário (contratoEstadoInicial),
   pronto pra entrar direto no preview de importação. Nenhum campo é
   inventado: o que não for encontrado fica em branco, e `_avisos`
   lista o que a secretaria deve conferir antes de confirmar. */
export function interpretarContratoTexto(texto){
  const t = (texto || "").replace(/\r/g, " ").replace(/[ \t]+/g, " ");
  const tPlano = t.replace(/\n/g, " ").replace(/\s+/g, " ");
  const c = contratoEstadoInicial();
  const avisos = [];

  // --- empresa (CNPJ) ---
  const mCnpj = tPlano.match(/CNPJ:?\s*([\d.\/\- ]{14,22})/i);
  const empresa = mCnpj ? empresaPorCnpjAproximado(mCnpj[1]) : null;
  if(empresa){
    contratoAplicarEmpresa(c, empresa.cnpj);
  } else {
    avisos.push("Não reconheci o CNPJ da contratada — escolha manualmente.");
  }

  // --- aluno ---
  const blocoAluno = blocoEntre(tPlano, "ALUNO CONTRATANTE:", "RESPONS[ÁA]VEL CONTRATANTE");
  if(blocoAluno){
    const nome = blocoAluno.split(",")[0]?.trim();
    if(nome) c.alunoNome = nome.replace(/\s+/g, " ")
      .toLowerCase().replace(/(^|\s)\p{L}/gu, l => l.toUpperCase());
    const mCpf = blocoAluno.match(/CPF:\s*([\d.\-]+)/i);
    if(mCpf) c.alunoCpf = mCpf[1];
    const mRg = blocoAluno.match(/RG:\s*([^,]+?)(?:,\s*DATA|,\s*RESIDENTE|$)/i);
    if(mRg) c.alunoRg = mRg[1].trim();
    const mNasc = blocoAluno.match(/DATA DE NASCIMENTO:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if(mNasc) c.alunoNascimento = dataBrParaIso(mNasc[1]);
    const mEndereco = blocoAluno.match(/RESIDENTE E DOMICILIAD[OA]\s*NA\s*(.+?),?\s*NA CIDADE DE\s*([^,]+)/i);
    if(mEndereco){
      const partes = separarEndereco(mEndereco[1]);
      c.alunoEndereco = partes.rua;
      c.alunoNumero = partes.numero;
      c.alunoBairro = partes.bairro;
      c.alunoCidade = mEndereco[2].trim();
    }
  } else {
    avisos.push("Não encontrei os dados do aluno neste PDF.");
  }
  if(!c.alunoNome) avisos.push("Nome do aluno não identificado — preencha antes de importar.");

  // --- responsável ---
  const blocoResp = blocoEntre(tPlano, "RESPONS[ÁA]VEL CONTRATANTE[^:]*:", "Pelo presente instrumento");
  if(blocoResp){
    const nome = blocoResp.split(",")[0]?.trim();
    if(nome){
      c.respNome = nome.replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\p{L}/gu, l => l.toUpperCase());
      c.semResponsavel = false;
    }
    const mCpf = blocoResp.match(/CPF:\s*([\d.\-]+)/i);
    if(mCpf) c.respCpf = mCpf[1];
    const mRg = blocoResp.match(/RG:\s*([^,]+?)(?:,\s*RESIDENTE|$)/i);
    if(mRg) c.respRg = mRg[1].trim();
    const mEndereco = blocoResp.match(/RESIDENTE E DOMICILIAD[OA]\s*NA\s*(.+?),?\s*NA CIDADE DE\s*([^,]+)/i);
    if(mEndereco){
      const partes = separarEndereco(mEndereco[1]);
      c.respEndereco = partes.rua;
      c.respNumero = partes.numero;
      c.respBairro = partes.bairro;
      c.respCidade = mEndereco[2].trim();
    }
  } else {
    c.semResponsavel = true;
    avisos.push("Não encontrei um responsável — marquei como \"aluno maior de idade\"; confira se está certo.");
  }

  // --- curso e carga horária ---
  const mCurso = tPlano.match(/seguinte\(?s?\)?\s*cursos?:\s*([^,]+?),\s*com carga hor[áa]ria de\s*(\d+)\s*horas/i);
  if(mCurso){
    c.curso = mCurso[1].trim().toLowerCase().replace(/(^|\s)\p{L}/gu, l => l.toUpperCase());
    c.cargaHoraria = mCurso[2];
  } else {
    avisos.push("Não identifiquei o curso — escolha manualmente.");
  }

  // --- dias e horário ---
  const mHorario = tPlano.match(/dias e hor[áa]rios:\s*([^.]+?),\s*das\s*(\d{1,2}\s*h\s*\d{0,2})\s*[àa]s\s*(\d{1,2}\s*h\s*\d{0,2})/i);
  if(mHorario){
    c.dias = extrairDias(mHorario[1]);
    c.horaInicio = horaParaHHMM(mHorario[2]);
    c.horaFim = horaParaHHMM(mHorario[3]);
  }

  // --- datas do pacote ---
  const mDatas = tPlano.match(/in[íi]cio em\s*(\d{2}\/\d{2}\/\d{4}),\s*com t[ée]rmino previsto para\s*(\d{2}\/\d{2}\/\d{4})/i);
  if(mDatas){
    c.dataInicio = dataBrParaIso(mDatas[1]);
    c.dataTermino = dataBrParaIso(mDatas[2]);
  } else {
    avisos.push("Não encontrei as datas de início/término do pacote.");
  }
  const mDuracao = tPlano.match(/dura[çc][ãa]o do pacote [ée] de\s*(\d+)\s*MESES?/i);
  if(mDuracao) c.duracao = ["3","6","12"].includes(mDuracao[1]) ? mDuracao[1] : "custom";
  if(c.duracao === "custom") c.duracaoCustom = mDuracao[1];

  // --- valores (dois formatos possíveis: total único, ou curso+material) ---
  // (usa [\s\S]*? em vez de uma classe negada como [^R$] — com a flag /i
  // uma classe negada exclui tanto "R" quanto "r", e a palavra "cursos"
  // tem um "r" minúsculo bem no meio do caminho, o que cortava a busca
  // cedo demais).
  const mCursoMaterial = tPlano.match(/R\$\s*([\d.,]+),?\s*sendo o valor do curso de[\s\S]*?R\$\s*([\d.,]+)\s*e o material\s*R\$\s*([\d.,]+)[\s\S]*?dividida em\s*(\d+)\s*parcelas/i);
  const mTotalUnico = tPlano.match(/valor total do contrato[\s\S]*?R\$\s*([\d.,]+),[\s\S]*?dividida em\s*(\d+)\s*parcelas de\s*R\$\s*([\d.,]+)/i);
  if(mCursoMaterial){
    c.formatoValor = "curso-material";
    c.valorCurso = moedaParaCampo(mCursoMaterial[2]);
    c.valorMaterial = moedaParaCampo(mCursoMaterial[3]);
    c.numParcelas = mCursoMaterial[4];
  } else if(mTotalUnico){
    c.formatoValor = "total";
    c.valorCurso = moedaParaCampo(mTotalUnico[1]);
    c.numParcelas = mTotalUnico[2];
  } else {
    avisos.push("Não consegui ler os valores do contrato — confira antes de importar.");
  }
  const mVencimento = tPlano.match(/primeiro pagamento em\s*(\d{2}\/\d{2}\/\d{4})/i);
  if(mVencimento) c.primeiroVencimento = dataBrParaIso(mVencimento[1]);
  const mForma = tPlano.match(/no\s*(BOLETO|PIX|CART[ÃA]O|DINHEIRO)\s*com o primeiro pagamento/i);
  if(mForma) c.formaPagamento = mForma[1].toUpperCase();

  // --- assinatura (data e cidade, no rodapé do contrato) ---
  const mAssinatura = tPlano.match(/(\d{1,2})\s*de\s*([a-zçãéô]+)\s*de\s*(\d{4}),\s*([^–\-]+?)\s*[–\-]\s*PR/i);
  if(mAssinatura){
    c.dataAssinatura = dataExtensoParaIso(mAssinatura[1], mAssinatura[2], mAssinatura[3]);
    c.cidadeAssinatura = mAssinatura[4].trim();
    if(!c.foro) c.foro = c.cidadeAssinatura;
  }

  if(c.formatoValor) contratoRecalcular(c);

  return { contrato: c, avisos };
}

/* ================================================================== */
/* Formulário (modal)                                                  */
/* ================================================================== */

function campo(label, field, valor, { tipo = "text", placeholder = "", largura = "" } = {}){
  return `
    <label class="contrato-campo" style="${largura ? `flex:1 1 ${largura};` : ""}">
      <span>${esc(label)}</span>
      <input type="${tipo}" class="teacher-text-input" data-contrato-field="${field}" value="${esc(valor || "")}" placeholder="${esc(placeholder)}" />
    </label>`;
}

function selectCampo(label, field, valor, opcoes, { largura = "" } = {}){
  return `
    <label class="contrato-campo" style="${largura ? `flex:1 1 ${largura};` : ""}">
      <span>${esc(label)}</span>
      <select class="teacher-text-input" data-contrato-select="${field}">
        ${opcoes.map(o => `<option value="${esc(o.valor)}" ${String(valor) === String(o.valor) ? "selected" : ""}>${esc(o.texto)}</option>`).join("")}
      </select>
    </label>`;
}

/* Mostra o login já pronto, sem campo pra digitar. O botão gera outra
   opção (útil quando a secretaria sabe que existe um homônimo fora da
   unidade, que o sistema não tem como enxergar daqui). */
function credencial(rotulo, email, senha, quem, nome){
  if(!nome || !nome.trim()){
    return `<p class="section-eyebrow" style="margin:0 0 8px;">Preencha o nome ${rotulo === "Aluno" ? "do aluno" : "do responsável"} para o login ser gerado.</p>`;
  }
  return `
    <div class="contrato-credencial">
      <div>
        <span class="contrato-credencial-rotulo">${esc(rotulo)}</span>
        <span class="contrato-credencial-login">${esc(email)}</span>
        <span class="contrato-credencial-senha">senha provisória: <b>${esc(senha)}</b></span>
      </div>
      <button type="button" class="btn-secondary" data-action="contrato-gerar-outro-login" data-quem="${esc(quem)}">Gerar outro</button>
    </div>`;
}

/* `cursos` vem da unidade selecionada no sistema; `alunos` é a lista já
   cadastrada, só pra preencher o nome rapidinho. */
export function contratoModal(c, { cursos = [], alunos = [] } = {}){
  if(!c.aberto) return "";

  const empresa = empresaPorCnpj(c.cnpj);
  const meses = contratoMeses(c);
  const total = numeroLimpo(c.valorCurso) + numeroLimpo(c.valorMaterial);
  const precisaLoginAluno = contratoPrecisaLoginAluno(c);

  // Painel que aparece depois de gerar: o que foi criado e com quais senhas.
  const r = c.resultadoAcessos;
  const linhaAcesso = (rotulo, item) => item ? `<li><b>${esc(rotulo)}:</b> ${esc(item.email)} · senha <b>${esc(item.senha)}</b></li>` : "";
  const resultadoHtml = r ? `
    <div class="aluno-modal-section">
      <p class="teacher-success" style="margin:0 0 6px;">Contrato gerado na outra aba.</p>
      ${(r.aluno || r.responsavel) ? `<ul class="contrato-acessos-lista">${linhaAcesso("Aluno", r.aluno)}${linhaAcesso("Responsável", r.responsavel)}</ul>` : ""}
      ${(r.avisos || []).map(a => `<p class="section-eyebrow" style="margin:4px 0 0;">${esc(a)}</p>`).join("")}
    </div>` : (c.salvandoAcessos ? `
    <div class="aluno-modal-section"><p class="section-eyebrow" style="margin:0;">Criando os cadastros e os logins…</p></div>` : "");

  const opcoesEmpresa = [{ valor: "", texto: "— escolha o CNPJ —" }].concat(
    EMPRESAS.map(e => ({ valor: e.cnpj, texto: `${e.cnpj} · ${e.cidade === "SALTO DO LONTRA" ? "Salto do Lontra" : "Nova Prata do Iguaçu"} (${e.socia.split(" ")[0]})` }))
  );

  const opcoesAluno = [{ valor: "", texto: "— digitar manualmente —" }].concat(
    alunos.map(a => ({ valor: a.nome, texto: a.nome + (a.turma ? ` · ${a.turma}` : "") }))
  );

  const opcoesCurso = [{ valor: "", texto: "— escolha o curso —" }].concat(
    (cursos.length ? cursos : ["Inglês", "Recreação", "Robótica", "Informática"]).map(x => ({ valor: x, texto: x }))
  );

  const blocoEmpresa = empresa ? `
    <p class="contrato-resumo">
      <b>${esc(empresa.razaoSocial)}</b><br />
      ${esc(empresa.endereco)}, ${esc(empresa.cidade)} – PR<br />
      Assina: ${esc(empresa.socia)} · CPF ${esc(empresa.sociaCpf)}<br />
      Modelo: ${empresa.unidade === "salto" ? "Salto do Lontra" : "Nova Prata do Iguaçu"}
    </p>` : `<p class="section-eyebrow" style="margin:6px 0 0;">Escolha o CNPJ — ele define a unidade, quem assina e o modelo do contrato.</p>`;

  const blocoResponsavel = c.semResponsavel ? "" : `
    <div class="contrato-linha">
      ${campo("Nome do responsável", "respNome", c.respNome, { largura: "260px" })}
      ${campo("CPF", "respCpf", c.respCpf, { largura: "140px", placeholder: "000.000.000-00" })}
      ${campo("RG", "respRg", c.respRg, { largura: "140px" })}
    </div>
    <div class="contrato-linha">
      ${campo("Endereço (se diferente do aluno)", "respEndereco", c.respEndereco, { largura: "240px", placeholder: "deixe vazio p/ usar o do aluno" })}
      ${campo("Nº", "respNumero", c.respNumero, { largura: "80px" })}
      ${campo("Bairro", "respBairro", c.respBairro, { largura: "140px" })}
      ${campo("Cidade", "respCidade", c.respCidade, { largura: "160px" })}
      ${campo("WhatsApp do responsável", "contatoResp", c.contatoResp, { largura: "180px", placeholder: "(46) 99999-9999" })}
    </div>`;

  const blocoValores = c.formatoValor === "curso-material" ? `
    <div class="contrato-linha">
      ${campo("Valor do curso (R$)", "valorCurso", c.valorCurso, { largura: "150px", placeholder: "2400,00" })}
      ${campo("Valor do material (R$)", "valorMaterial", c.valorMaterial, { largura: "150px", placeholder: "370,00" })}
      ${campo("Nº de parcelas", "numParcelas", c.numParcelas, { largura: "110px" })}
      ${campo("1ªs parcelas maiores", "qtdParcelasIniciais", c.qtdParcelasIniciais, { largura: "130px" })}
    </div>
    <div class="contrato-linha">
      ${campo("Valor das primeiras (R$)", "valorParcelaInicial", c.valorParcelaInicial, { largura: "160px" })}
      ${campo("Valor das demais (R$)", "valorParcelaDemais", c.valorParcelaDemais, { largura: "160px" })}
    </div>` : `
    <div class="contrato-linha">
      ${campo("Valor total do curso (R$)", "valorCurso", c.valorCurso, { largura: "170px", placeholder: "2520,00" })}
      ${campo("Material à parte (R$)", "valorMaterial", c.valorMaterial, { largura: "150px", placeholder: "opcional" })}
      ${campo("Nº de parcelas", "numParcelas", c.numParcelas, { largura: "110px" })}
      ${campo("Valor da parcela (R$)", "valorParcelaDemais", c.valorParcelaDemais, { largura: "150px" })}
    </div>`;

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-contrato-modal">
    <div class="aluno-modal contrato-modal" role="dialog" aria-modal="true" aria-label="Gerar contrato" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>Gerar contrato</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">Preencha os dados e o contrato sai pronto para assinatura.</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-contrato-modal" aria-label="Fechar">${"&times;"}</button>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">1. Empresa que vai assinar</h3>
        <div class="contrato-linha">
          ${selectCampo("CNPJ", "cnpj", c.cnpj, opcoesEmpresa, { largura: "320px" })}
        </div>
        ${blocoEmpresa}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">2. Aluno</h3>
        ${alunos.length ? `<div class="contrato-linha">${selectCampo("Puxar de um aluno já cadastrado", "alunoCadastrado", "", opcoesAluno, { largura: "320px" })}</div>` : ""}
        <div class="contrato-linha">
          ${campo("Nome completo", "alunoNome", c.alunoNome, { largura: "260px" })}
          ${campo("CPF", "alunoCpf", c.alunoCpf, { largura: "140px", placeholder: "000.000.000-00" })}
          ${campo("RG", "alunoRg", c.alunoRg, { largura: "130px" })}
          ${campo("Nascimento", "alunoNascimento", c.alunoNascimento, { tipo: "date", largura: "150px" })}
        </div>
        <div class="contrato-linha">
          ${campo("Endereço", "alunoEndereco", c.alunoEndereco, { largura: "240px", placeholder: "Rua ..." })}
          ${campo("Nº", "alunoNumero", c.alunoNumero, { largura: "80px" })}
          ${campo("Bairro", "alunoBairro", c.alunoBairro, { largura: "140px" })}
          ${campo("Cidade", "alunoCidade", c.alunoCidade, { largura: "160px" })}
          ${campo("WhatsApp do aluno", "contatoAluno", c.contatoAluno, { largura: "170px", placeholder: "(46) 99999-9999" })}
        </div>
        <p class="section-eyebrow" style="margin:6px 0 0;">O WhatsApp e a data de nascimento alimentam a aba "Aniversários". Sem o número do aluno, a mensagem vai para o responsável.</p>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">3. Responsável</h3>
        <label class="responsavel-vinculo-item" style="margin-bottom:8px;">
          <input type="checkbox" data-action="contrato-sem-responsavel" ${c.semResponsavel ? "checked" : ""} />
          <span>Aluno maior de idade (contrato sem responsável)</span>
        </label>
        ${blocoResponsavel}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">4. Curso, horário e duração</h3>
        <div class="contrato-linha">
          ${selectCampo("Curso", "curso", c.curso, opcoesCurso, { largura: "180px" })}
          ${campo("Horas/aula por semana", "cargaHoraria", c.cargaHoraria, { largura: "150px" })}
          ${campo("Início da aula", "horaInicio", c.horaInicio, { tipo: "time", largura: "130px" })}
          ${campo("Fim da aula", "horaFim", c.horaFim, { tipo: "time", largura: "130px" })}
        </div>
        <p class="section-eyebrow" style="margin:8px 0 4px;">Dias da semana</p>
        <div class="contrato-dias">
          ${DIAS_SEMANA.map(d => `
            <label class="responsavel-vinculo-item" style="flex:0 0 auto;">
              <input type="checkbox" data-action="contrato-dia" data-dia="${esc(d)}" ${c.dias.includes(d) ? "checked" : ""} />
              <span>${esc(d.replace("-feira", ""))}</span>
            </label>`).join("")}
        </div>
        <div class="contrato-linha" style="margin-top:10px;">
          ${selectCampo("Duração", "duracao", c.duracao, [
            { valor: "12", texto: "1 ano (12 meses)" },
            { valor: "6", texto: "6 meses" },
            { valor: "3", texto: "3 meses" },
            { valor: "custom", texto: "Personalizado" },
          ], { largura: "170px" })}
          ${c.duracao === "custom" ? campo("Quantos meses", "duracaoCustom", c.duracaoCustom, { largura: "120px" }) : ""}
          ${campo("Início do pacote", "dataInicio", c.dataInicio, { tipo: "date", largura: "160px" })}
          ${campo("Término previsto", "dataTermino", c.dataTermino, { tipo: "date", largura: "160px" })}
        </div>
        <div class="contrato-linha">
          ${campo("Rendimento esperado (cláusula 4)", "rendimento", c.rendimento, { largura: "300px", placeholder: meses >= 12 ? "1 livro no ano" : "1 livro no período contratado" })}
        </div>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">5. Valores e pagamento</h3>
        <div class="contrato-linha">
          ${selectCampo("Forma de descrever o valor", "formatoValor", c.formatoValor, [
            { valor: "total", texto: "Valor total em parcelas iguais (modelo Salto)" },
            { valor: "curso-material", texto: "Curso + material, primeiras parcelas maiores (modelo Prata)" },
          ], { largura: "340px" })}
          ${selectCampo("Forma de pagamento", "formaPagamento", c.formaPagamento, [
            { valor: "BOLETO", texto: "Boleto" },
            { valor: "PIX", texto: "Pix" },
            { valor: "CARTÃO", texto: "Cartão" },
            { valor: "DINHEIRO", texto: "Dinheiro" },
          ], { largura: "160px" })}
        </div>
        ${blocoValores}
        <div class="contrato-linha">
          ${campo("1º vencimento", "primeiroVencimento", c.primeiroVencimento, { tipo: "date", largura: "160px" })}
          ${campo("Desconto à vista (%)", "descontoVista", c.descontoVista, { largura: "140px" })}
          ${campo("No ato da matrícula paga-se (§ sexto)", "paragrafoSexto", c.paragrafoSexto, { largura: "260px" })}
        </div>
        ${total ? `<p class="contrato-resumo" style="margin-top:6px;">Total do contrato: <b>${moeda(total)}</b>${Number(c.numParcelas) ? ` em ${esc(c.numParcelas)}x` : ""}${meses ? ` · pacote de ${meses} ${meses === 1 ? "mês" : "meses"}` : ""}</p>` : ""}
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">6. Assinatura</h3>
        <div class="contrato-linha">
          ${campo("Cidade da assinatura", "cidadeAssinatura", c.cidadeAssinatura, { largura: "200px" })}
          ${campo("Data da assinatura", "dataAssinatura", c.dataAssinatura, { tipo: "date", largura: "170px" })}
          ${campo("Foro de eleição", "foro", c.foro, { largura: "200px" })}
        </div>
      </div>

      <div class="aluno-modal-section">
        <h3 class="teacher-label">7. Acesso ao app</h3>
        <label class="responsavel-vinculo-item" style="margin-bottom:8px;">
          <input type="checkbox" data-action="contrato-criar-acessos" ${c.criarAcessos ? "checked" : ""} />
          <span>Cadastrar o aluno e criar os logins junto com o contrato</span>
        </label>
        ${c.criarAcessos ? `
          ${precisaLoginAluno ? credencial("Aluno", c.emailAluno, c.senhaAluno, "aluno", c.alunoNome) : `
            <p class="section-eyebrow" style="margin:0 0 8px;">${c.curso ? `Aluno de <b>${esc(c.curso)}</b> não recebe login próprio — só o responsável acompanha pelo app.` : "Escolha o curso para saber se o aluno recebe login."}</p>`}
          ${c.semResponsavel ? "" : credencial("Responsável", c.emailResp, c.senhaResp, "resp", c.respNome)}
          <p class="section-eyebrow" style="margin:6px 0 0;">Login e senha saem prontos, montados a partir do nome. A senha tem 6 dígitos e é de uso único: dite pra família e oriente a trocar no primeiro acesso, em "Meu perfil".</p>
        ` : `<p class="section-eyebrow" style="margin:0;">Desmarcado: o contrato sai normalmente, mas nenhum cadastro ou login é criado.</p>`}
      </div>

      ${resultadoHtml}

      ${c.erro ? `<p class="teacher-error" style="color:var(--red,#C4544A);font-size:12.5px;margin:0 0 8px;">${esc(c.erro)}</p>` : ""}

      <div class="contrato-acoes">
        <button type="button" class="teacher-primary-btn" data-action="contrato-gerar" ${c.salvandoAcessos ? "disabled" : ""}>${c.salvandoAcessos ? "Gerando…" : "Gerar contrato para assinatura"}</button>
        <button type="button" class="teacher-primary-btn" style="background:transparent;color:var(--slate);border:1px solid rgba(18,32,50,.18);" data-action="fechar-contrato-modal">Cancelar</button>
      </div>
    </div>
  </div>`;
}

/* ================================================================== */
/* Modal "Importar contratos já assinados"                             */
/* ================================================================== */

/* Uma linha da prévia — um PDF já lido, com os campos que deram pra
   reconhecer. Fica compacto (só o essencial) porque pode vir junto
   com dezenas de outros; qualquer ajuste fino sobra pra editar depois
   na ficha do aluno. */
function itemImportacaoHtml(item, i, cursosDisponiveis){
  const c = item.contrato;
  const empresa = empresaPorCnpj(c.cnpj);
  const opcoesCurso = [{ valor: "", texto: "— curso —" }].concat(
    (cursosDisponiveis.length ? cursosDisponiveis : ["Inglês", "Recreação", "Robótica", "Informática"]).map(x => ({ valor: x, texto: x }))
  );

  const statusHtml = item.status === "salvando" ? `<span class="import-contrato-status is-salvando">Salvando…</span>`
    : item.status === "ok" ? `<span class="import-contrato-status is-ok">${ICONS.check} Importado</span>`
    : item.status === "erro" ? `<span class="import-contrato-status is-erro">${ICONS.warn} ${esc(item.erro || "Erro")}</span>`
    : "";

  const avisosHtml = item.avisos.length ? `
    <div class="import-contrato-avisos">
      ${item.avisos.map(a => `<span>${ICONS.warn} ${esc(a)}</span>`).join("")}
    </div>` : "";

  return `
    <div class="import-contrato-item${item.selecionado ? "" : " is-desmarcado"}" data-import-row="${i}">
      <label class="import-contrato-check">
        <input type="checkbox" data-action="import-contrato-toggle" data-row="${i}" ${item.selecionado ? "checked" : ""} ${item.status === "ok" ? "disabled" : ""} />
      </label>
      <div class="import-contrato-campos">
        <div class="import-contrato-arquivo">${esc(item.arquivoNome)}</div>
        <div class="contrato-linha">
          <input class="teacher-text-input" style="flex:1 1 220px;" placeholder="Nome do aluno" value="${esc(c.alunoNome)}" data-import-campo="alunoNome" data-row="${i}" />
          <input type="date" class="teacher-text-input" style="flex:1 1 150px;" value="${esc(c.alunoNascimento)}" data-import-campo="alunoNascimento" data-row="${i}" />
          <select class="teacher-text-input" style="flex:1 1 150px;" data-import-campo="curso" data-row="${i}">${opcoesCurso.map(o => `<option value="${esc(o.valor)}" ${c.curso === o.valor ? "selected" : ""}>${esc(o.texto)}</option>`).join("")}</select>
          <select class="teacher-text-input" style="flex:0 1 140px;" data-import-campo="cnpj" data-row="${i}">
            <option value="">— CNPJ —</option>
            ${EMPRESAS.map(e => `<option value="${esc(e.cnpj)}" ${c.cnpj === e.cnpj ? "selected" : ""}>${esc(e.cnpj)}</option>`).join("")}
          </select>
        </div>
        <div class="contrato-linha">
          <input class="teacher-text-input" style="flex:1 1 200px;" placeholder="${c.semResponsavel ? "Sem responsável (maior de idade)" : "Nome do responsável"}" value="${esc(c.respNome)}" data-import-campo="respNome" data-row="${i}" />
          <input class="teacher-text-input" style="flex:1 1 170px;" placeholder="WhatsApp do aluno" value="${esc(c.contatoAluno)}" data-import-campo="contatoAluno" data-row="${i}" />
          <input class="teacher-text-input" style="flex:1 1 170px;" placeholder="WhatsApp do responsável" value="${esc(c.contatoResp)}" data-import-campo="contatoResp" data-row="${i}" />
        </div>
        <div class="import-contrato-rodape">
          <span class="section-eyebrow" style="margin:0;">${empresa ? `${esc(empresa.cidade === "SALTO DO LONTRA" ? "Salto do Lontra" : "Nova Prata do Iguaçu")} · ` : ""}${c.dataInicio ? `início ${esc(c.dataInicio.split("-").reverse().join("/"))}` : "sem data de início"}</span>
          <label class="responsavel-vinculo-item" style="padding:2px 8px;">
            <input type="checkbox" data-action="import-contrato-toggle-acesso" data-row="${i}" ${item.criarAcesso ? "checked" : ""} />
            <span>Criar acesso ao app</span>
          </label>
          ${statusHtml}
        </div>
        ${avisosHtml}
      </div>
      <button type="button" class="secretaria-modal-close" style="color:var(--slate);align-self:flex-start;" data-action="import-contrato-remover" data-row="${i}" title="Remover da lista">${ICONS.close}</button>
    </div>`;
}

export function importarContratosModal(state_, { cursos = [] } = {}){
  if(!state_.importContratosModalAberto) return "";
  const itens = state_.importContratosItens;
  const selecionados = itens.filter(it => it.selecionado && it.status !== "ok").length;

  const areaUploadHtml = `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">Selecionar PDFs</h3>
      <p class="section-eyebrow" style="margin:0 0 10px;">Pode escolher vários de uma vez. O texto é lido aqui mesmo no navegador — o arquivo não é enviado pra nenhum servidor.</p>
      <label class="upload-dropzone${state_.importContratosLendo ? " is-loading" : ""}" for="import-contratos-pdf-files">
        <span class="upload-dropzone-icon">${state_.importContratosLendo ? ICONS.spinner : ICONS.upload}</span>
        <span class="upload-dropzone-text">
          <strong>${state_.importContratosLendo ? "Lendo os PDFs…" : "Toque pra escolher os contratos"}</strong>
          <span>Pode selecionar vários arquivos PDF de uma vez</span>
        </span>
        <input type="file" id="import-contratos-pdf-files" accept="application/pdf" multiple style="display:none;" ${state_.importContratosLendo ? "disabled" : ""} />
      </label>
    </div>`;

  const listaHtml = itens.length ? `
    <div class="aluno-modal-section">
      <h3 class="teacher-label">${itens.length} contrato(s) lido(s) — confira antes de importar</h3>
      <div class="import-contrato-lista">${itens.map((it, i) => itemImportacaoHtml(it, i, cursos)).join("")}</div>
    </div>` : "";

  const resumo = state_.importContratosResumo;
  const resumoHtml = resumo ? `
    <div class="aluno-modal-section">
      <p class="teacher-success" style="margin:0;">${resumo.criados} cadastro(s) novo(s), ${resumo.atualizados} atualizado(s), ${resumo.comLogin} com login criado.${resumo.erros ? ` ${resumo.erros} com erro — veja acima.` : ""}</p>
    </div>` : "";

  const progresso = state_.importContratosProgresso;
  const progressoHtml = state_.importContratosSalvando
    ? `<p class="section-eyebrow" style="margin:0 0 10px;">Importando ${progresso.feito} de ${progresso.total}…</p>`
    : "";

  return `
  <div class="aluno-modal-backdrop" data-action="fechar-importar-contratos-modal">
    <div class="aluno-modal contrato-modal" role="dialog" aria-modal="true" aria-label="Importar contratos" data-action="noop">
      <div class="aluno-modal-head">
        <div>
          <h2>Importar contratos já assinados</h2>
          <p class="section-eyebrow" style="margin:2px 0 0;">Reconhece os dados do modelo da escola. Confira a prévia antes de confirmar.</p>
        </div>
        <button type="button" class="secretaria-modal-close" style="color:var(--slate);" data-action="fechar-importar-contratos-modal" aria-label="Fechar">${ICONS.close}</button>
      </div>
      ${areaUploadHtml}
      ${listaHtml}
      ${progressoHtml}
      ${resumoHtml}
      ${itens.length ? `
      <div class="contrato-acoes">
        <button type="button" class="teacher-primary-btn" data-action="import-contrato-confirmar" ${state_.importContratosSalvando || !selecionados ? "disabled" : ""}>${state_.importContratosSalvando ? "Importando…" : `Importar ${selecionados} contrato(s) selecionado(s)`}</button>
        <button type="button" class="teacher-primary-btn" style="background:transparent;color:var(--slate);border:1px solid rgba(18,32,50,.18);" data-action="fechar-importar-contratos-modal">Fechar</button>
      </div>` : ""}
    </div>
  </div>`;
}
