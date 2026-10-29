/* ==================================================================
   Educa+ — edubug.js  (assistente que roda DENTRO do site)
   ------------------------------------------------------------------
   Edubug é o assistente virtual do Educa+. Um botão flutuante abre um
   pop-up com cara de celular (conversa estilo iMessage).

   NÃO usa IA externa, API, chave nem servidor: tudo roda no navegador,
   sem custo. Ele funciona com:
     • busca nos manuais do próprio app (os mesmos catálogos da aba
       Suporte e de "Meu perfil", sem digitar nada de novo);
     • atalhos pras abas ("abrir financeiro", "onde vejo o boleto?");
     • fluxos guiados que FAZEM coisas no site:
         – PROFESSOR: chamada de hoje (turma → toca em quem faltou →
           conteúdo → anexos → confirmar e salvar). Também entende a
           frase pronta: "8A faltaram Ana e João, conteúdo frações,
           obs: retomar o exercício 4";
         – PROFESSOR e EQUIPE: CONSULTA o banco ("a chamada da 8A foi
           feita?", "quem faltou hoje?", "chamadas pendentes", "qual o
           conteúdo de hoje na 8A?", "a Maria veio hoje?");
         – PROFESSOR: a chamada é conversada, um aluno por vez ("Fulano
           veio?" → ✅ ❌ 📝);
         – PROFESSOR: repetir a última aula como base da chamada de hoje;
         – PROFESSOR: anexar observação (da aula ou de um aluno) numa
           chamada que já foi salva hoje;
         – PROFESSOR: pedido de ajuste de aula (vai pro WhatsApp);
         – ALUNO / RESPONSÁVEL / PROFESSOR: mensagem pronta pro
           WhatsApp da secretaria;
     • CALCULADORA (todos os perfis): faz a conta escrita no chat
       (“15% de 480”, “12x7+3”, “média de 7, 8,5 e 6”) ou abre um teclado
       dentro da conversa (“calculadora”);
     • ANIVERSÁRIOS (equipe): sinalzinho 🎂 no botão quando tem aniversário
       hoje, aviso ao abrir (hoje e amanhã) com botão de parabéns no
       WhatsApp, e consulta (“quem faz aniversário amanhã?”);
     • quando não entende, diz que não achou e oferece a secretaria.

   Como se encaixa no app:
     • Monta o próprio DOM em #edubug-root (FORA do #app), então o
       render() do script.js não apaga a conversa.
     • O script.js só chama sincronizar() no fim do render().
     • Gravar no banco é com o `executar(acao)` que o script.js entrega
       (mesmas regras do Firestore de sempre), só depois do "Confirmar".

   COMO ENSINAR O EDUBUG:
     • Manual novo no app → aparece sozinho (ele lê os catálogos).
     • Nova palavra/sinônimo → acrescente em GRUPOS.
     • Nova aba → acrescente em ABAS (rótulo + palavras-chave).
   ================================================================== */

/* Logo do Edubug: coloque a imagem na pasta imgs/ (ex.: imgs/edubug.jpeg).
   Ele tenta estes nomes em ordem; se nenhum existir, fica o 🐞. */
const LOGOS = ["imgs/edubug.jpeg", "imgs/edubug.jpg", "imgs/Edubug.jpeg", "imgs/Edubug.jpg", "imgs/EduBug.jpeg", "imgs/EduBug.jpg", "imgs/edubug.png"];

const TELAS = ["aluno", "familia", "professor", "instituicao"];

/* ---- Abas que o Edubug sabe abrir (chave = a do menu do app) ---- */
const ABAS = {
  aluno: {
    calendario: ["Calendário", "calendario agenda avisos provas eventos"],
    notas: ["Notas", "notas boletim media"],
    aval: ["Avaliações", "avaliacao avaliacoes avaliar pesquisa"],
    presenca: ["Presença", "presenca faltas frequencia"],
    certificados: ["Certificados", "certificado certificados modulo"],
    comunicados: ["Comunicados", "comunicado comunicados aviso recado"],
    ficha: ["Minha ficha", "ficha saude alergia emergencia"],
    suporte: ["Suporte", "suporte ajuda manual manuais"],
  },
  responsavel: {
    calendario: ["Calendário", "calendario agenda avisos provas eventos vencimento"],
    notas: ["Notas", "notas boletim media"],
    aval: ["Avaliações", "avaliacao avaliacoes avaliar pesquisa"],
    presenca: ["Presença", "presenca faltas frequencia"],
    certificados: ["Certificados", "certificado certificados modulo"],
    financeiro: ["Financeiro", "financeiro boleto boletos pix mensalidade pagamento cobranca codigo barras"],
    contratos: ["Contratos", "contrato contratos assinar assinatura"],
    comunicados: ["Comunicados", "comunicado comunicados aviso recado"],
    ficha: ["Ficha", "ficha saude alergia emergencia"],
    suporte: ["Suporte", "suporte ajuda manual manuais"],
  },
  professor: {
    inicio: ["Início", "inicio home hoje"],
    calendario: ["Calendário", "calendario agenda eventos provas"],
    horarios: ["Horários", "horario horarios agenda remarcar cancelar lembrete anotacao"],
    turmas: ["Turmas", "turma turmas alunos"],
    aulas: ["Aulas & Chamadas", "aulas aula chamada chamadas presenca"],
    conteudos: ["Conteúdos", "conteudo conteudos semestre"],
    relconteudos: ["Conteúdos por turma", "conteudos turma relatorio"],
    avaliacoes: ["Notas & atividades", "notas atividades atividade prova boletim"],
    aval: ["Avaliações", "avaliacao avaliacoes institucional"],
    certificados: ["Certificados", "certificado certificados modulo"],
    suporte: ["Suporte", "suporte ajuda manual manuais"],
    perfil: ["Meu perfil", "perfil ficha senha"],
  },
  instituicao: {
    inicio: ["Início", "inicio home"],
    turmas: ["Turmas", "turma turmas"],
    cursos: ["Cursos e turmas", "curso cursos sala salas modalidade"],
    calendario: ["Calendário", "calendario agenda evento eventos dia sem aula prova"],
    horarios: ["Horários", "horario horarios agenda remarcar"],
    relatorio: ["Relatório do dia", "relatorio dia chamadas faltas hoje"],
    conteudos: ["Conteúdos", "conteudo conteudos"],
    relconteudos: ["Conteúdos por turma", "conteudos turma relatorio"],
    estatisticas: ["Estatísticas", "estatistica estatisticas faltas frequencia painel"],
    financeiro: ["Financeiro", "financeiro mensalidade mensalidades boleto boletos cobranca pix carne inadimplente lancar"],
    alunos: ["Alunos", "aluno alunos ficha matricula idaluno cadastro"],
    aniversarios: ["Aniversários", "aniversario aniversarios parabens"],
    solicitacoes: ["Solicitações", "solicitacao solicitacoes aviso avisos familias"],
    professores: ["Professores", "professor professores docente"],
    responsaveis: ["Responsáveis", "responsavel responsaveis familia"],
    contratos: ["Contratos", "contrato contratos assinatura assinar gerar"],
    aval: ["Avaliações", "avaliacao avaliacoes institucional"],
    certificados: ["Certificados", "certificado certificados"],
    senhas: ["Senhas e login", "senha senhas login acesso trocar criar excluir"],
    gestao: ["Gestão", "gestao cadastrar cadastro importar"],
    perfil: ["Meu perfil (manuais)", "perfil manual manuais ajuda"],
  },
};

const ACAO_NAV = {
  aluno: "set-aluno-tab", responsavel: "set-familia-tab",
  professor: "set-professor-tab", instituicao: "set-inst-tab",
};

const SUGESTOES = {
  professor: ["Fazer a chamada de hoje", "Como estão as chamadas de hoje?", "Repetir a última chamada", "Anexar observação", "Ajuste de aula", "🧮 Calculadora"],
  instituicao: ["Chamadas pendentes hoje", "Quem faltou hoje?", "Quem faz aniversário hoje?", "Como lanço uma mensalidade?", "Aluno não consegue entrar", "Importar turmas por PDF", "🧮 Calculadora"],
  responsavel: ["Onde vejo o boleto?", "Não consigo entrar no app", "Ver o contrato", "Falar com a secretaria", "🧮 Calculadora"],
  aluno: ["Onde vejo minhas notas?", "Não consigo entrar no app", "Ver meus avisos", "Falar com a secretaria", "🧮 Calculadora"],
};

/* ---- Sinônimos: palavras do mesmo assunto se ajudam na busca ---- */
const GRUPOS = [
  ["senha", "login", "entrar", "acesso", "logar", "esqueci", "redefinir", "conta"],
  ["boleto", "pix", "mensalidade", "cobranca", "pagar", "pagamento", "financeiro", "vencimento", "codigo", "barras", "carne", "fatura"],
  ["chamada", "presenca", "falta", "faltou", "frequencia", "cor", "alerta"],
  ["nota", "boletim", "media", "atividade", "prova", "report", "criterio"],
  ["contrato", "assinar", "assinatura", "assinado"],
  ["aula", "remarcar", "cancelar", "horario", "agenda", "lembrete"],
  ["certificado", "modulo"],
  ["calendario", "evento", "aviso", "comunicado", "solicitacao", "recado"],
  ["foto", "imagem", "avatar"],
  ["professor", "professora", "docente"],
  ["responsavel", "familia", "pai", "mae"],
  ["importar", "importacao", "pdf", "planilha", "lote"],
  ["erro", "problema", "travou", "falha", "salvar", "permissao", "bug"],
  ["aluno", "matricula", "cadastro", "cadastrar", "idaluno", "ficha"],
];

const PARADAS = new Set(("de da do das dos para pra por com sem que como qual quais uma uns umas ele ela eles elas meu minha meus minhas " +
  "nos nas nao sim mas mais muito tem tenho estou esta estao fazer faco faz posso consigo quero preciso gostaria onde quando " +
  "aqui isso esse essa este esta ver vejo abrir abre mostrar mostra ajuda ajudar educa app site favor").split(" "));

/* ---------------- texto ---------------- */
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const raiz = (p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p);
const palavras = (s) => norm(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PARADAS.has(p)).map(raiz);
const GRUPOS_RAIZ = GRUPOS.map((g) => new Set(g.map(raiz)));

function expandir(stems){
  const extra = new Set();
  stems.forEach((s) => GRUPOS_RAIZ.forEach((g) => { if(g.has(s)) g.forEach((x) => { if(!stems.includes(x)) extra.add(x); }); }));
  return [...extra];
}

const hojeBr = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const STATUS_ICONE = { presente: "✅", falta: "❌", justificada: "📝" };
const PROXIMO = { presente: "falta", falta: "justificada", justificada: "presente" };


/* Verbos na 1ª pessoa ("como crio uma turma") -> infinitivo, pra busca entender os dois jeitos. */
const FORMAS_VERBO = {
  crio: "criar", cria: "criar", criei: "criar", cadastro: "cadastrar", cadastra: "cadastrar", adiciono: "adicionar", adiciona: "adicionar",
  monto: "montar", faco: "fazer", gero: "gerar", gera: "gerar", importo: "importar", importa: "importar",
  mando: "enviar", envio: "enviar", manda: "enviar", anoto: "anotar", troco: "trocar", troca: "trocar", marco: "marcar",
  remarco: "remarcar", cancelo: "cancelar", edito: "editar", anexo: "anexar", publico: "publicar", imprimo: "imprimir",
};

/* Distância de edição (com troca de letras vizinhas: "contarto" -> "contrato" = 1). */
function distancia(a, b){
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for(let j = 1; j <= n; j++) d[0][j] = j;
  for(let i = 1; i <= m; i++){
    for(let j = 1; j <= n; j++){
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if(i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/* ---- Respostas diretas ("quero mais detalhes") ----
   Cada guia diz: pra quais perfis vale, quais palavras precisam aparecer na pergunta
   (cada grupo = "qualquer uma destas"; TODOS os grupos precisam bater), a aba de destino
   e o passo a passo curtinho. Mais grupos = mais específico = ganha na disputa.
   COMO ENSINAR: copie um bloco, troque as palavras, a aba (chave do ABAS) e os passos.
   Escreva as palavras no singular e sem acento. */
/* Última vez que os passos abaixo foram conferidos com as telas do app.
   Mudou algum botão/aba? Ajuste o guia correspondente e atualize esta data.
   No console (F12): edubugGuias() lista todos os guias. */
const GUIAS_REVISADOS_EM = "27/10/2026";
const GUIAS = [
  { papeis: ["instituicao"], quando: [["pdf"], ["lido", "ler", "leu", "erro", "escaneado", "problema", "funciona", "abre", "travou"]],
    aba: "gestao", titulo: "O PDF não foi lido",
    passos: [
      "PDF **escaneado** (foto/imagem) não tem texto para o app ler — a leitura falha ou erra.",
      "Exporte o PDF de novo com **texto selecionável** (se der pra marcar e copiar o texto, serve).",
      "Em **contratos**, o app tenta reconhecer pela imagem, mas pode errar: confira tudo antes de confirmar.",
      "Se nada resolver, **preencha à mão** na própria tela.",
    ] },
  { papeis: ["instituicao"], quando: [["entrar", "logar", "acesso", "login"], ["consegue", "consegui", "consigo", "erro", "problema", "bloqueado", "invalido"]],
    aba: "senhas", titulo: "A pessoa não consegue entrar",
    passos: [
      "Em **Senhas e login**, confira se a pessoa **tem login** criado.",
      "Veja se o **e-mail de acesso está certo** (uma letra trocada já impede).",
      "Se ela esqueceu, **troque a senha** por lá e avise a nova (quem não tem e-mail de verdade, como aluno, só resolve assim).",
      "Se o cadastro foi **excluído**, o login não volta: crie um **novo acesso**.",
    ] },
  /* ---------- EQUIPE ---------- */
  { papeis: ["instituicao"], dados: "contratosPendentes", quando: [["contrato"], ["lancar", "lanco", "gerar", "criar", "novo", "fazer", "emitir", "montar", "imprimir"]],
    aba: "contratos", titulo: "Gerar um contrato pronto para assinar",
    passos: [
      "Abra a aba **Contratos**.",
      "Escolha o **CNPJ**: ele define a unidade, o endereço e a sócia que aparecem no contrato.",
      "Preencha **aluno, curso, horário e valores**.",
      "Clique em **Imprimir / Salvar em PDF**.",
      "Depois, mande o PDF pelo WhatsApp e marque **Já assinado** quando ele voltar (fica em pendentes até lá).",
    ] },
  { papeis: ["instituicao"], quando: [["contrato"], ["importar", "lote", "pdf", "varios"]],
    aba: "gestao", titulo: "Importar contratos em lote",
    passos: [
      "Vá em **Gestão › Contratos › Importar**.",
      "Envie os PDFs dos contratos (todos de uma vez).",
      "Confira o que o app leu e **corrija o que veio errado**.",
      "Só então confirme. Se o PDF for escaneado, ele usa leitura por imagem e pode errar mais — vale conferir com calma.",
    ] },
  { papeis: ["instituicao"], quando: [["turma"], ["importar", "pdf", "lote", "lista"]],
    aba: "gestao", titulo: "Importar turmas por PDF",
    passos: [
      "Vá em **Gestão › Professores › Importar turmas**.",
      "Envie o PDF com a lista de turmas (precisa ter texto selecionável; PDF escaneado não é lido).",
      "Confira a **prévia** e **escolha o professor de cada linha**.",
      "Atenção às turmas que já existem, pra não duplicar. Depois confirme.",
    ] },
  { papeis: ["instituicao"], quando: [["turma"], ["criar", "nova", "novo", "cadastrar", "lancar", "lanco", "montar", "fazer", "adicionar"]],
    aba: "turmas", titulo: "Criar uma turma nova",
    passos: [
      "Abra a aba **Turmas**.",
      "Crie a turma informando **nome, disciplina, sala e horário**.",
      "Coloque os **alunos** na turma (dá pra tirar e trocar depois).",
      "Se aparecer \"Turmas sem horário definido\", use **Definir horário** na aba **Horários** pra marcar os dias e horas.",
    ] },
  { papeis: ["instituicao"], quando: [["lembrete", "aviso", "recado", "evento", "prova", "atividade"], ["calendario"]],
    aba: "calendario", titulo: "Lançar um lembrete/aviso no calendário da unidade",
    passos: [
      "Abra a aba **Calendário**.",
      "Escolha a **data** (para amanhã, é só pegar o dia seguinte).",
      "Escolha o tipo: **dia sem aula, prova, atividade ou aviso** e escreva o texto.",
      "Marque **quem recebe** (alunos, responsáveis e/ou professores) e o **curso**, se for só de um.",
      "Salve. O item aparece no calendário de quem você marcou.",
    ] },
  { papeis: ["instituicao"], quando: [["mensalidade", "cobranca", "boleto", "financeiro"], ["lancar", "lanco", "criar", "gerar", "novo", "anexar", "cadastrar"]],
    aba: "financeiro", titulo: "Lançar uma mensalidade",
    passos: [
      "Abra **Financeiro** (ou a ficha do aluno).",
      "Informe a **competência, o valor e o vencimento**.",
      "Anexe o **PDF do boleto**: o app preenche código de barras, Pix, valor e vencimento sozinho. Se não ler, digite à mão.",
      "A família passa a ver a cobrança no **dia 01** do mês de referência.",
    ] },
  { papeis: ["instituicao"], quando: [["senha", "login", "acesso", "entrar"], ["trocar", "redefinir", "esqueci", "criar", "excluir", "resetar", "nova", "consegue", "recuperar"]],
    aba: "senhas", titulo: "Resolver senha ou acesso de alguém",
    passos: [
      "Abra **Senhas e login**.",
      "Ache a pessoa e **troque a senha** (quem não tem e-mail de verdade, como aluno, também resolve aqui).",
      "Se ela nunca teve acesso, **crie o login**; se saiu da escola, dá pra **excluir** o acesso.",
      "Quem estava logado com a senha antiga é desconectado em até 1 hora.",
    ] },

  /* ---------- PROFESSOR ---------- */
  { papeis: ["professor"], quando: [["turma"], ["criar", "nova", "novo", "cadastrar", "montar", "fazer", "adicionar"]],
    aba: "horarios", titulo: "Criar turma com dias e horários",
    passos: [
      "Abra **Horários** e clique em **+ Nova turma**.",
      "Preencha **nome, professor, disciplina e sala**.",
      "Marque os **encontros da semana** (use **+ Adicionar outro dia** se tiver mais de um) e escolha os alunos.",
      "Se aparecer \"Turmas sem horário definido\", clique em **Definir horário**.",
    ] },
  { papeis: ["professor"], quando: [["lembrete", "recado", "aviso"]],
    aba: "horarios", titulo: "Enviar um lembrete para a turma",
    passos: [
      "Abra **Horários** e clique na aula/turma (ou use o botão **Lembrete**).",
      "Clique em **Enviar lembrete** e escreva o recado.",
      "Ele aparece no calendário dos **alunos e responsáveis da turma**.",
    ] },
  { papeis: ["professor"], quando: [["remarcar", "cancelar", "alterar", "mudar"]],
    aba: "horarios", titulo: "Remarcar ou cancelar uma aula",
    passos: [
      "Abra **Horários** e clique na aula.",
      "Clique em **Alterar horário** e escolha: só aquele dia, cancelar, ou mudar o horário fixo.",
      "Se der aviso de conflito, ajuste o horário.",
      "Pra desfazer, use **Voltar ao horário normal desta aula**.",
    ] },

  /* ---------- FAMÍLIA ---------- */
  { papeis: ["responsavel"], quando: [["boleto", "pix", "mensalidade", "pagar", "pagamento", "financeiro"]],
    aba: "financeiro", titulo: "Ver e pagar o boleto",
    passos: [
      "Abra a aba **Financeiro**.",
      "Ache o mês: aparecem o **vencimento e a forma de pagamento**.",
      "Pague pelo **Pix** (QR Code ou botão **Copiar Pix**) ou pelo **código de barras**.",
      "O vencimento também aparece marcado com \"$\" no **Calendário**.",
    ] },

  /* ---------- EQUIPE: cadastros e rotina ---------- */
  { papeis: ["instituicao"], quando: [["aluno"], ["cadastrar", "criar", "novo", "adicionar", "matricular", "matricula", "lancar", "lanco"]],
    aba: "gestao", titulo: "Cadastrar um aluno",
    passos: [
      "Vá em **Gestão** e abra o cadastro de **aluno**.",
      "Preencha **curso, menino/menina** (define a foto padrão), **contato, e-mail e senha provisória**.",
      "Salve: o **IDALUNO** é gerado sozinho (próximo número: 0001, 0002…).",
      "Depois, a ficha completa fica na aba **Alunos**.",
    ] },
  { papeis: ["instituicao"], quando: [["responsavel"], ["cadastrar", "criar", "novo", "adicionar", "vincular", "lancar", "lanco"]],
    aba: "gestao", titulo: "Cadastrar responsável e vincular aos filhos",
    passos: [
      "Vá em **Gestão** e abra o cadastro de **responsável**.",
      "Escolha os **alunos** (filhos) que ele acompanha e dê o **login** a ele.",
      "Pra ajustar vínculos depois, use a aba **Responsáveis**.",
    ] },
  { papeis: ["instituicao"], quando: [["professor"], ["cadastrar", "criar", "novo", "adicionar", "editar", "lancar", "lanco"]],
    aba: "gestao", titulo: "Cadastrar e editar professor",
    passos: [
      "Vá em **Gestão › Professores**.",
      "Informe **unidades, disciplinas, homem/mulher** (define a foto), **e-mail e senha**.",
      "Pra editar depois, abra o professor: o app atualiza cadastro, lista e vínculo com cada unidade de uma vez.",
    ] },
  { papeis: ["instituicao"], quando: [["equipe", "administrativo", "administrativa"], ["cadastrar", "criar", "novo", "adicionar", "lancar", "lanco", "login"]],
    aba: "gestao", titulo: "Cadastrar outra pessoa da equipe",
    passos: [
      "Vá em **Gestão** e crie o **login administrativo** da pessoa para a unidade.",
      "Esse acesso permite administrar a unidade (alunos, turmas, financeiro, contratos…). Dê só a quem precisa.",
    ] },
  { papeis: ["instituicao"], dados: "contratosPendentes", quando: [["assinatura", "assinado", "assinar", "pendente"], ["contrato", "pendente", "marcar", "enviar", "acompanhar", "whatsapp"]],
    aba: "contratos", titulo: "Acompanhar assinaturas pendentes",
    passos: [
      "Abra **Contratos › Aguardando assinatura**.",
      "Abra o contrato e **envie o PDF pelo WhatsApp**.",
      "Quando voltar assinado, marque como **assinado**.",
      "Se a página for recarregada no meio do caminho, o manual explica o que fazer.",
    ] },
  { papeis: ["instituicao", "professor"], quando: [["certificado"], ["anexar", "enviar", "lancar", "lanco", "criar", "dar", "gerar", "pedir", "como"]],
    aba: "certificados", titulo: "Certificados",
    passos: [
      "Abra a aba **Certificados**.",
      "Ao **fim do módulo**, anexe o **link do certificado** (do Drive) para o aluno.",
      "A **Recreação não entra** nesse fluxo.",
      "A família também pode pedir o certificado dela pela aba **Certificados**.",
    ] },
  { papeis: ["instituicao"], quando: [["aniversario", "parabens"], ["mensagem", "enviar", "whatsapp", "como", "mandar"]],
    aba: "aniversarios", titulo: "Aniversários e mensagem no WhatsApp",
    passos: [
      "Abra a aba **Aniversários**.",
      "Escolha o aniversariante: a **mensagem já vem pronta**.",
      "Ela vai para o **aluno**, se ele tiver WhatsApp, ou para o **responsável**.",
    ] },
  { papeis: ["instituicao"], quando: [["solicitacao", "aviso"], ["publicar", "criar", "novo", "enviar", "familia", "responsavel", "lancar", "lanco"]],
    aba: "solicitacoes", titulo: "Publicar solicitações para as famílias",
    passos: [
      "Abra a aba **Solicitações**.",
      "Escolha um **modelo pronto** (assinar contrato, preencher a ficha, entregar documentos…) ou escreva o seu.",
      "O aviso pode ter um **botão que leva a família à aba certa**.",
      "Dá pra **corrigir ou desativar** depois; o manual mostra o que a família vê.",
    ] },
  { papeis: ["instituicao"], quando: [["estatistica", "frequencia", "faltoso"]],
    aba: "estatisticas", titulo: "Estatísticas e alunos com faltas",
    passos: [
      "Abra **Estatísticas**: o painel mostra os **últimos 30 dias**.",
      "Role até a lista de **acompanhamento recomendado**: são os alunos com mais faltas.",
    ] },
  { papeis: ["instituicao"], quando: [["avaliacao"], ["institucional", "criar", "abrir", "bloquear", "resultado", "pergunta"]],
    aba: "aval", titulo: "Avaliação institucional",
    passos: [
      "Abra **Avaliações**.",
      "**Abra ou bloqueie** as respostas quando quiser.",
      "Dá pra **criar perguntas próprias**.",
      "O resultado vem **consolidado, sem identificar quem respondeu**.",
    ] },
  { papeis: ["instituicao"], quando: [["idaluno", "id"], ["gerar", "antigo", "sequencial", "numero", "numerar"]],
    aba: "alunos", titulo: "IDALUNO sequencial",
    passos: [
      "Todo aluno **novo** recebe o próximo número sozinho (0001, 0002…), valendo para todas as unidades.",
      "Para numerar os alunos **antigos**, use o botão **Gerar IDALUNO** na aba **Alunos**.",
    ] },
  { papeis: ["instituicao"], quando: [["foto"], ["aparece", "aparecer", "sumir", "sumiu", "erro", "problema", "trocar", "ficou"]],
    aba: "alunos", titulo: "A foto não aparece",
    passos: [
      "Confira no cadastro se o **menino/menina** (ou professor/professora) está informado — é isso que escolhe a foto.",
      "Confira se o **arquivo da imagem existe** e está com o **nome certo** na pasta de imagens.",
      "Corrija o cadastro ou o arquivo e recarregue. Sem foto, aparecem as iniciais.",
    ] },
  { papeis: ["instituicao"], quando: [["unidade", "escola"], ["trocar", "mudar", "alternar", "outra"]],
    titulo: "Trocar de unidade",
    passos: [
      "Use o **selo da unidade** no menu para alternar entre **Salto do Lontra** e **Nova Prata**.",
      "As listas e relatórios passam a mostrar só a unidade escolhida.",
    ] },

  /* ---------- PROFESSOR ---------- */
  { papeis: ["professor"], quando: [["conteudo"], ["lancar", "lanco", "criar", "cadastrar", "novo", "adicionar", "semestre"]],
    aba: "conteudos", titulo: "Conteúdos do semestre",
    passos: [
      "Abra **Conteúdos** para ver e cadastrar os conteúdos da disciplina.",
      "Na **chamada**, você escolhe um dos últimos conteúdos ou escreve um novo — ele já entra no banco sozinho.",
      "Pra ver por turma, use **Conteúdos por turma**.",
    ] },
  { papeis: ["professor"], quando: [["nota", "atividade"], ["lancar", "lanco", "criar", "cadastrar", "adicionar", "como", "novo"]],
    aba: "avaliacoes", titulo: "Notas e atividades",
    passos: [
      "Abra **Notas & atividades**.",
      "Crie a **atividade** e lance as **notas**, nas duas etapas.",
      "O **boletim do aluno é montado sozinho** a partir delas: ninguém digita de novo.",
    ] },
  { papeis: ["professor"], quando: [["anotacao", "anotar"]],
    aba: "horarios", titulo: "Anotações pessoais",
    passos: [
      "Abra **Horários** e use o botão **Anotar** (ou **Anotação**).",
      "Ela é **só sua**: pode ser solta ou ligada a uma turma.",
    ] },

  /* ---------- ALUNO E FAMÍLIA ---------- */
  { papeis: ["aluno", "responsavel"], quando: [["entrar", "acesso", "login", "senha"], ["consegue", "consegui", "consigo", "esqueci", "erro", "problema", "redefinir", "bloqueado"]],
    titulo: "Não consigo entrar no app",
    passos: [
      "Confira se o **e-mail e a senha** estão certos (sem espaço sobrando).",
      "Se você tem e-mail de verdade, use **Esqueci a senha** na tela de login e siga o link que chegar.",
      "Se o link não chega, ou o aluno não tem e-mail de verdade, a **secretaria troca a senha** na hora — eu deixo a mensagem pronta pra ela.",
    ] },
  { papeis: ["aluno", "responsavel"], quando: [["nota", "boletim"]],
    aba: "notas", titulo: "Notas e boletim",
    passos: [
      "Abra a aba **Notas**.",
      "O boletim é **montado sozinho** a partir das atividades que os professores lançam.",
    ] },
  { papeis: ["aluno", "responsavel"], quando: [["presenca", "falta", "faltou"]],
    aba: "presenca", titulo: "Presença e faltas",
    passos: [
      "Abra a aba **Presença** (e veja também o **Calendário**).",
      "As cores: **verde, amarelo e vermelho**; vale o **pior status do dia**.",
      "Um ícone de **observação do professor** aparece quando ele escreveu algo sobre a aula.",
    ] },
  { papeis: ["aluno", "responsavel"], quando: [["certificado"]],
    aba: "certificados", titulo: "Certificados",
    passos: [
      "Abra a aba **Certificados**.",
      "O certificado aparece ali quando a escola anexa o link, ao fim do módulo.",
      "Se ainda não apareceu, o manual mostra como **pedir o certificado**.",
    ] },
  { papeis: ["responsavel"], quando: [["contrato"]],
    aba: "contratos", titulo: "Ver o contrato",
    passos: [
      "Abra a aba **Contratos**.",
      "Ali ficam os contratos do(a) aluno(a). Se estiver **pendente**, a secretaria envia o PDF para assinar.",
    ] },
  { papeis: ["aluno", "responsavel"], quando: [["comunicado", "recado"]],
    aba: "comunicados", titulo: "Comunicados da escola",
    passos: [
      "Abra a aba **Comunicados**.",
      "Os avisos da escola ficam todos ali; os que têm data também aparecem no **Calendário**.",
    ] },
  { papeis: ["aluno", "responsavel"], quando: [["ficha", "alergia", "emergencia"]],
    aba: "ficha", titulo: "Ficha (saúde e emergência)",
    passos: [
      "Abra a aba **Ficha**.",
      "Preencha **contato de emergência, alergias, tipo sanguíneo** e o que mais pedir.",
      "Salve. A escola usa isso em caso de necessidade.",
    ] },
];

export function criarEdubug({ state, escapeHtml, contexto, manuais, executar, SECRETARIA_WHATSAPP, whatsappLinkComTexto, aniversarios = () => [], enviarParabens = null }){
  const S = { pos: { r: 18, b: 18 }, arrastou: false, uid: "", aberto: false, msgs: [], digitando: false, fluxo: null, ultima: "", fila: Promise.resolve(), avisouAniv: "", parabenizados: new Set() };
  let raizDom = null;

  /* ---------------- texto -> HTML seguro ---------------- */
  function formatar(texto){
    let h = escapeHtml(String(texto || ""));
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\n/g, "<br>");
    return h;
  }

  /* ---------------- mensagens do Edubug ---------------- */
  const bot = (texto, comp) => ({ role: "bot", texto, comp });
  const opcoes = (itens) => ({ tipo: "botoes", itens, fechado: false });

  /* Mostra "digitando…" e solta as mensagens uma a uma (dá ritmo de conversa). */
  function falar(lista, { rapido = false } = {}){
    S.fila = S.fila.then(async () => {
      for(const m of lista){
        if(!rapido){
          S.digitando = true; desenhar();
          await dormir(350 + Math.min(String(m.texto || "").length * 5, 650));
        }
        S.digitando = false;
        S.msgs.push(m);
        desenhar();
      }
    });
    return S.fila;
  }

  /* ---------------- navegação ---------------- */
  function irParaAba(chave){
    const acao = ACAO_NAV[contexto().papel];
    const btn = acao && document.querySelector(`#app [data-action="${acao}"][data-key="${chave}"]`);
    if(!btn){ falar([bot("Essa aba não está disponível pra você agora.")]); return; }
    btn.click();
    if(window.matchMedia("(max-width: 520px)").matches) alternar(false);
  }

  const botaoAba = (papel, chave) => ({
    rotulo: `Ir para ${ABAS[papel][chave][0]}`, estilo: "ok", eco: false,
    fn: () => irParaAba(chave),
  });

  function acharAba(papel, stems){
    const tabela = ABAS[papel] || {};
    const ext = expandir(stems);
    let melhor = null, segundo = 0;
    for(const [chave, [rotulo, kw]] of Object.entries(tabela)){
      const alvoR = new Set(palavras(rotulo));
      const alvoK = new Set(palavras(kw));
      let pts = 0;
      stems.forEach((s) => { if(alvoR.has(s)) pts += 3; else if(alvoK.has(s)) pts += 2; });
      ext.forEach((s) => { if(alvoK.has(s)) pts += 0.5; });
      if(!melhor || pts > melhor.pts){ segundo = melhor ? melhor.pts : 0; melhor = { chave, pts }; }
      else if(pts > segundo) segundo = pts;
    }
    return melhor && melhor.pts >= 2 && melhor.pts > segundo ? melhor : null;
  }

  /* ---------------- busca nos manuais ---------------- */
  function buscarManuais(stems){
    const ext = expandir(stems);
    const lista = (manuais() || []).filter((m) => m.url && m.url !== "#" && String(m.url).startsWith("manuais/"));
    const pontuados = lista.map((m) => {
      const t = new Set(palavras(m.titulo));
      const d = new Set(palavras(m.descricao));
      let pts = 0;
      stems.forEach((s) => { if(t.has(s)) pts += 3; if(d.has(s)) pts += 1.5; });
      ext.forEach((s) => { if(t.has(s)) pts += 1.5; if(d.has(s)) pts += 0.5; });
      return { m, pts };
    }).filter((x) => x.pts >= 3).sort((a, b) => b.pts - a.pts);
    if(!pontuados.length) return [];
    const corte = pontuados[0].pts * 0.5;
    const vistos = new Set();
    return pontuados.filter((x) => x.pts >= corte).map((x) => x.m)
      .filter((m) => { if(vistos.has(m.url)) return false; vistos.add(m.url); return true; })
      .slice(0, 3);
  }

  /* ---------------- WhatsApp da secretaria ---------------- */
  function unidadesSugeridas(){
    const dica = String(contexto().escolaId || "").toLowerCase();
    const achada = dica && SECRETARIA_WHATSAPP.find((e) => dica === e.id || dica.includes(e.id));
    return achada ? [achada] : SECRETARIA_WHATSAPP;
  }

  function textoZap(assunto, corpo){
    const c = contexto();
    const rotulo = { aluno: "Aluno(a)", responsavel: "Responsável", professor: "Professor(a)" }[c.papel] || "Usuário";
    const linhas = ["Olá! Preciso de ajuda no app Educa+.", "", `*Assunto:* ${assunto}`, `*${rotulo}:* ${c.nome || "—"}`];
    if(c.aluno && c.papel !== "aluno") linhas.push(`*Aluno(a):* ${c.aluno}`);
    if(c.turma) linhas.push(`*Turma:* ${c.turma}`);
    linhas.push("", corpo);
    return linhas.join("\n");
  }

  function botoesZap(mensagem){
    return opcoes(unidadesSugeridas().map((u) => ({
      rotulo: `Abrir WhatsApp — ${u.nome.replace(/^Escola /, "")}`, estilo: "zap", eco: false,
      fn: () => {
        window.open(whatsappLinkComTexto(u.numero, mensagem), "_blank", "noopener");
        falar([bot("WhatsApp aberto! É só conferir a mensagem e enviar. 👍")], { rapido: true });
      },
    })));
  }

  function iniciarZap(textoPronto){
    if(contexto().papel === "instituicao"){
      falar([bot("A equipe não tem WhatsApp da secretaria por aqui. Para erros do sistema, veja **Como falar com o suporte** nos manuais.", opcoes([botaoAba("instituicao", "perfil")]))]);
      return;
    }
    if(textoPronto){ mostrarZap(textoPronto); return; }
    S.fluxo = { tipo: "zap", espera: "zap-texto" };
    falar([bot("Certo! Me conte em poucas palavras o que está acontecendo, que eu deixo a mensagem pronta para a secretaria.")]);
  }

  function mostrarZap(corpo){
    S.fluxo = null;
    const msg = textoZap("Ajuda no app", corpo);
    falar([bot(`Pronto! Vai assim para a secretaria:\n\n“${corpo}”`, botoesZap(msg))]);
  }

  /* ---------------- ajuste de aula (professor) ---------------- */
  function iniciarAjuste(){
    const turmas = state.data.professorTurmas || [];
    if(!turmas.length){ falar([bot("Você ainda não tem turma vinculada. Fale com a secretaria para vincular suas turmas.")]); return; }
    S.fluxo = { tipo: "ajuste" };
    falar([bot("Chamada ou conteúdo de um dia que já passou só a secretaria corrige. Eu monto o pedido pra você. **Qual turma?**",
      opcoes(turmas.map((t) => ({ rotulo: t.nome, fn: () => { S.fluxo = { tipo: "ajuste", turma: t, espera: "ajuste-data" }; falar([bot("Qual foi o **dia da aula**? (ex.: 14/10, ontem)")]); } }))))]);
  }

  function lerData(txt){
    const t = norm(txt);
    const hoje = new Date();
    const dia = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    if(/anteontem/.test(t)){ hoje.setDate(hoje.getDate() - 2); return { texto: dia(hoje), data: hoje }; }
    if(/ontem/.test(t)){ hoje.setDate(hoje.getDate() - 1); return { texto: dia(hoje), data: hoje }; }
    const m = t.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
    if(!m) return null;
    let ano = m[3] ? Number(m[3]) : hoje.getFullYear();
    if(ano < 100) ano += 2000;
    const d = new Date(ano, Number(m[2]) - 1, Number(m[1]));
    if(isNaN(d) || d.getMonth() !== Number(m[2]) - 1) return null;
    return { texto: dia(d), data: d };
  }

  /* ---------------- chamada (professor) ---------------- */
  const turmasDoProfessor = () => state.data.professorTurmas || [];
  const dataBr = (iso) => String(iso || "").split("-").reverse().join("/");
  const juntar = (arr) => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " e " + arr[arr.length - 1];
  const compacto = (s) => norm(s).replace(/[^a-z0-9]/g, "");

  /* Mensagem imediata (fora da fila de "digitando…"): usada dentro de funções
     async que já estão rodando depois da fila — evita travar esperando a si mesma. */
  const dizer = (m) => { S.msgs.push(m); desenhar(); };

  function semTurma(){
    falar([bot("Você ainda não tem turma vinculada. Fale com a secretaria para vincular suas turmas.")]);
  }

  function iniciarChamada(op = {}){
    const turmas = turmasDoProfessor();
    if(!turmas.length){ semTurma(); return; }
    const pre = op.repetir ? { autoRepetir: true } : {};
    const citada = op.texto ? acharTurmaNoTexto(norm(op.texto)) : null;
    if(citada){ escolherTurma(citada, pre); return; }
    if(turmas.length === 1){ escolherTurma(turmas[0], pre); return; }
    S.fluxo = { tipo: "chamada" };
    falar([bot(op.repetir ? "Vamos repetir a última aula. **Qual turma?**" : "Claro! **Qual turma?** (✅ = já tem chamada hoje)",
      opcoes(turmas.map((t) => ({ rotulo: `${t.nome}${state.professorChamadasHoje?.[t.id] ? " ✅" : ""}`, fn: () => escolherTurma(t, pre) }))))]);
  }

  /* Monta o estado da chamada (sem falar nada). */
  function prepararChamada(t, pre = {}){
    const status = {};
    (t.alunos || []).forEach((n) => { status[n] = pre.status?.[n] || "presente"; });
    S.fluxo = {
      tipo: "chamada", turma: t, status, espera: "",
      conteudo: pre.conteudo || "", observacao: pre.observacao || "",
      obsAlunos: { ...(pre.obsAlunos || {}) }, base: "", conteudoBase: "", alvoObs: "", idx: 0,
    };
    return S.fluxo;
  }

  function escolherTurma(t, pre = {}){
    const nomes = t.alunos || [];
    if(!nomes.length){ S.fluxo = null; falar([bot(`A turma **${t.nome}** não tem alunos cadastrados. Peça à secretaria para incluí-los.`)]); return; }
    prepararChamada(t, pre);
    const ja = !!state.professorChamadasHoje?.[t.id];
    const cab = `Chamada de **${t.nome}**${t.disciplina ? " (" + t.disciplina + ")" : ""} — hoje, ${hojeBr()}.${ja ? "\n⚠️ Já existe chamada de hoje; salvar vai substituí-la." : ""}`;
    if(pre.autoRepetir){
      falar([bot(cab + "\n\nBuscando a última aula dessa turma…")]);
      (async () => { await S.fila; await repetirUltima(null); })();
      return;
    }
    falar([bot(cab + "\n\nVou perguntar **um por um** — é só tocar (ou responder “veio”, “faltou”, “justificada”). Prefere uma lista? Toque em **📋 Lista completa**.\n💡 Dá pra **ditar** tudo de uma vez também, ex.: “" + t.nome + " faltou Ana, conteúdo frações”.")]);
    perguntarAluno();
  }

  /* "Reproduz" a última aula: traz presenças e o conteúdo dela como ponto de partida. */
  async function repetirUltima(comp){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada" || !f.turma) return;
    S.digitando = true; desenhar();
    let r;
    try { r = await executar({ tipo: "ultima_chamada", turmaId: f.turma.id }); }
    catch(err){
      console.error("Edubug (última chamada):", err?.code, err);
      r = { ok: false, mensagem: `Não consegui buscar a última aula agora${err?.code ? ` (${err.code})` : ""}.` };
    }
    S.digitando = false;
    if(!S.fluxo || S.fluxo !== f) { desenhar(); return; }
    const nomes = f.turma.alunos || [];
    if(!r || !r.ok || !r.registro){
      dizer(bot((r && r.mensagem) || "Ainda não achei uma aula anterior dessa turma. Vamos marcar do zero:", comp ? undefined : { tipo: "alunos", fechado: false }));
      return;
    }
    const reg = r.registro;
    nomes.forEach((n) => { f.status[n] = reg.presencas?.[n] || "presente"; });
    f.base = reg.data;
    f.conteudoBase = reg.conteudoTexto || "";
    if(comp){ comp.fechado = true; comp.nota = "Lista substituída pela última aula."; }
    const faltaram = nomes.filter((n) => f.status[n] === "falta");
    const just = nomes.filter((n) => f.status[n] === "justificada");
    dizer(bot(
      `Usei a aula de **${dataBr(reg.data)}** como base${reg.conteudoTexto ? ` (conteúdo: “${reg.conteudoTexto.length > 80 ? reg.conteudoTexto.slice(0, 78) + "…" : reg.conteudoTexto}”)` : ""}.\n` +
      `${faltaram.length ? "❌ Faltaram: " + juntar(faltaram) : "Todos presentes"}${just.length ? "\n📝 Justificada: " + juntar(just) : ""}\n\n` +
      "Ajuste o que mudou hoje e toque em **Pronto, continuar**.",
      { tipo: "alunos", fechado: false }));
  }

  /* ---------------- chamada conversada: "Fulano veio?" ---------------- */
  const fecharBotoes = () => S.msgs.forEach((m) => { if(m.comp && m.comp.tipo === "botoes") m.comp.fechado = true; });

  function perguntarAluno(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada" || !f.turma) return;
    const nomes = f.turma.alunos || [];
    if(f.idx >= nomes.length){ fimDaLista(); return; }
    f.espera = "aluno-status";
    const itens = [
      { rotulo: "✅ Veio", estilo: "ok", fn: () => marcarAluno("presente") },
      { rotulo: "❌ Faltou", fn: () => marcarAluno("falta") },
      { rotulo: "📝 Justificada", fn: () => marcarAluno("justificada") },
    ];
    if(f.idx > 0) itens.push({ rotulo: "↩️ Voltar", fn: () => { f.idx = Math.max(0, f.idx - 1); perguntarAluno(); } });
    if(nomes.length - f.idx > 1) itens.push({ rotulo: f.idx === 0 ? "✅ Todos vieram" : "✅ Os demais vieram", fn: () => restantesPresentes() });
    itens.push({ rotulo: "📋 Lista completa", fn: () => listaCompleta() });
    if(f.idx === 0 && !f.base) itens.push({ rotulo: "🔁 Usar a última aula", fn: () => repetirUltima(null) });
    falar([bot(`**${f.idx + 1}/${nomes.length}** — **${nomes[f.idx]}** veio?`, opcoes(itens))], { rapido: true });
  }

  function marcarAluno(st){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada" || !f.turma) return;
    const n = (f.turma.alunos || [])[f.idx];
    if(!n) return;
    f.status[n] = st;
    f.idx++;
    perguntarAluno();
  }

  function restantesPresentes(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada" || !f.turma) return;
    const nomes = f.turma.alunos || [];
    for(let i = f.idx; i < nomes.length; i++) f.status[nomes[i]] = "presente";
    f.idx = nomes.length;
    fimDaLista();
  }

  function listaCompleta(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada") return;
    f.espera = "";
    falar([bot("Aqui está a lista. Toque nos nomes para marcar:", { tipo: "alunos", fechado: false })], { rapido: true });
  }

  function fimDaLista(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada" || !f.turma) return;
    f.espera = "";
    const nomes = f.turma.alunos || [];
    const faltas = nomes.filter((n) => f.status[n] === "falta");
    const just = nomes.filter((n) => f.status[n] === "justificada");
    falar([bot(`Chamada marcada: ${nomes.length - faltas.length - just.length} presente(s)${faltas.length ? " · ❌ " + juntar(faltas) : ""}${just.length ? " · 📝 " + juntar(just) : ""}.`)], { rapido: true });
    if(f.conteudo) mostrarResumo(); else perguntarConteudo();
  }

  function perguntarConteudo(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada") return;
    f.espera = "conteudo";
    const banco = (state.professorConteudosBanco?.[f.turma.disciplina] || []).slice(-5).reverse();
    const cut = (x) => x.length > 42 ? x.slice(0, 40) + "…" : x;
    const sugeridos = [];
    if(f.conteudoBase) sugeridos.push({ rotulo: "🔁 Mesmo da última: " + cut(f.conteudoBase), fn: () => definirConteudo(f.conteudoBase) });
    banco.filter((c) => c.texto && c.texto !== f.conteudoBase).forEach((c) => sugeridos.push({ rotulo: cut(c.texto), fn: () => definirConteudo(c.texto) }));
    falar([bot("E qual foi o **conteúdo da aula**? Digite aqui embaixo" + (sugeridos.length ? " ou toque em um já cadastrado:" : "."), sugeridos.length ? opcoes(sugeridos) : undefined)]);
  }

  function aposAlunos(comp){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada") return;
    comp.fechado = true;
    if(f.conteudo){ mostrarResumo(); return; }   // veio ditado ou já definido: vai direto pro resumo
    perguntarConteudo();
  }

  function definirConteudo(texto){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada") return;
    f.conteudo = String(texto).trim().slice(0, 600);
    perguntarAnexos();
  }

  /* Passo "anexar informação": observação da aula e/ou de um aluno. */
  function perguntarAnexos(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada") return;
    f.espera = "";
    const jaAnexou = !!f.observacao || Object.values(f.obsAlunos).some(Boolean);
    const itens = [
      { rotulo: "📝 Observação da aula", fn: () => { f.espera = "obs-aula"; falar([bot("Escreva a **observação da aula** (ex.: turma dividida em grupos, retomar o exercício 4).")]); } },
    ];
    if((f.turma.alunos || []).length) itens.push({ rotulo: "👤 Observação sobre um aluno", fn: () => escolherAlunoParaObs(f) });
    itens.push({ rotulo: jaAnexou ? "✔️ Ver o resumo" : "Não, ver o resumo", estilo: "ok", fn: mostrarResumo });
    falar([bot(jaAnexou ? "Anexado! Quer anexar mais alguma informação?" : "Quer **anexar** alguma informação a esta chamada?", opcoes(itens))]);
  }

  function escolherAlunoParaObs(f){
    const nomes = f.turma.alunos || [];
    falar([bot("Sobre **qual aluno**?", opcoes(nomes.map((n) => ({
      rotulo: n, fn: () => { f.espera = "obs-aluno"; f.alvoObs = n; falar([bot(`O que anotar sobre **${n}**?`)]); },
    }))))]);
  }

  function mostrarResumo(){
    const f = S.fluxo;
    if(!f || f.tipo !== "chamada") return;
    f.espera = "";
    const nomes = f.turma.alunos || [];
    const faltas = nomes.filter((n) => f.status[n] === "falta");
    const justificadas = nomes.filter((n) => f.status[n] === "justificada");
    const observacoesAlunos = {};
    nomes.forEach((n) => { const v = String(f.obsAlunos[n] || "").trim(); if(v) observacoesAlunos[n] = v; });
    const dados = {
      turmaId: f.turma.id, turmaNome: f.turma.nome || "", disciplina: f.turma.disciplina || "",
      total: nomes.length, presentes: nomes.length - faltas.length - justificadas.length,
      faltas, justificadas, conteudo: f.conteudo, observacao: String(f.observacao || "").trim(), observacoesAlunos,
      substitui: !!state.professorChamadasHoje?.[f.turma.id],
    };
    falar([bot("Confira antes de salvar:", { tipo: "resumo", dados, fechado: false })]);
  }

  async function confirmarChamada(comp){
    comp.fechado = true;
    S.fluxo = null;
    S.digitando = true; desenhar();
    let r;
    try { r = await executar({ tipo: "registrar_chamada", dados: comp.dados }); }
    catch(err){
      console.error("Edubug (chamada):", err?.code, err);
      r = { ok: false, mensagem: `Não foi possível salvar agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.` };
    }
    S.digitando = false;
    const turma = turmasDoProfessor().find((t) => t.id === comp.dados.turmaId);
    await falar([bot((r.ok ? "✅ " : "⚠️ ") + r.mensagem,
      opcoes(r.ok
        ? [
            ...(turma ? [{ rotulo: "📎 Anexar observação", fn: () => iniciarAnexo(turma) }] : []),
            { rotulo: "Fazer outra chamada", fn: () => iniciarChamada() },
            { rotulo: "Ver em Aulas & Chamadas", eco: false, fn: () => irParaAba("aulas") },
          ]
        : [{ rotulo: "Refazer a chamada", fn: () => iniciarChamada() }]))], { rapido: true });
  }

  /* ---------------- anexar a uma chamada JÁ salva hoje ---------------- */
  function iniciarAnexo(turma, texto){
    const turmas = turmasDoProfessor();
    if(!turmas.length){ semTurma(); return; }
    if(!turma && texto) turma = acharTurmaNoTexto(norm(texto));
    if(!turma && turmas.length === 1) turma = turmas[0];
    if(!turma){
      S.fluxo = { tipo: "anexo" };
      falar([bot("Em qual turma? (só dá pra anexar em chamadas de **hoje**)", opcoes(turmas.map((t) => ({ rotulo: `${t.nome}${state.professorChamadasHoje?.[t.id] ? " ✅" : ""}`, fn: () => iniciarAnexo(t) }))))]);
      return;
    }
    if(!state.professorChamadasHoje?.[turma.id]){
      S.fluxo = null;
      falar([bot(`A turma **${turma.nome}** ainda não tem chamada hoje. Quer fazer a chamada primeiro? Dá pra anexar a observação já nela.`, opcoes([{ rotulo: "Fazer a chamada", fn: () => escolherTurma(turma) }]))]);
      return;
    }
    const f = { tipo: "anexo", turma, espera: "", alvo: "" };
    S.fluxo = f;
    falar([bot(`Anexar em **${turma.nome}** (chamada de hoje). Sobre o quê?`, opcoes([
      { rotulo: "📝 Sobre a aula", fn: () => { f.espera = "anexo-texto"; f.alvo = ""; falar([bot("Escreva a **observação da aula**.")]); } },
      ...((turma.alunos || []).length ? [{ rotulo: "👤 Sobre um aluno", fn: () => falar([bot("Sobre **qual aluno**?", opcoes((turma.alunos || []).map((n) => ({
        rotulo: n, fn: () => { f.espera = "anexo-texto"; f.alvo = n; falar([bot(`O que anotar sobre **${n}**?`)]); },
      }))))]) }] : []),
    ]))]);
  }

  function montarAnexo(f, texto){
    f.espera = "";
    if(!texto){ falar([bot("Não recebi o texto. Escreva a observação, ou digite **cancelar**.")]); f.espera = "anexo-texto"; return; }
    falar([bot("Confira antes de anexar:", { tipo: "anexo", fechado: false, dados: { turmaId: f.turma.id, turmaNome: f.turma.nome || "", alvo: f.alvo || "", texto } })]);
  }

  async function confirmarAnexo(comp){
    comp.fechado = true;
    S.fluxo = null;
    S.digitando = true; desenhar();
    let r;
    try { r = await executar({ tipo: "anexar_observacao", dados: comp.dados }); }
    catch(err){
      console.error("Edubug (anexo):", err?.code, err);
      r = { ok: false, mensagem: `Não foi possível anexar agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.` };
    }
    S.digitando = false;
    const turma = turmasDoProfessor().find((t) => t.id === comp.dados.turmaId);
    await falar([bot((r.ok ? "✅ " : "⚠️ ") + r.mensagem,
      opcoes(r.ok
        ? [
            ...(turma ? [{ rotulo: "Anexar mais uma", fn: () => iniciarAnexo(turma) }] : []),
            { rotulo: "Ver em Aulas & Chamadas", eco: false, fn: () => irParaAba("aulas") },
          ]
        : []))], { rapido: true });
  }

  /* ---------------- chamada ditada em uma frase ---------------- */
  function acharTurmaNoTexto(t){
    const turmas = turmasDoProfessor();
    const ct = compacto(t);
    const cand = turmas.filter((x) => { const n = compacto(x.nome); return n.length >= 2 && ct.includes(n); });
    if(!cand.length) return null;
    return cand.sort((a, b) => compacto(b.nome).length - compacto(a.nome).length)[0];
  }

  function alunosCitados(textoNorm, turma){
    const nomes = turma.alunos || [];
    const primeiros = nomes.map((n) => norm(n).split(/[^a-z0-9]+/).filter(Boolean)[0] || "");
    const achados = [], ambiguos = [];
    nomes.forEach((n, i) => {
      let pos = textoNorm.indexOf(norm(n));
      if(pos < 0){
        const p = primeiros[i];
        if(p.length >= 3){
          const m = new RegExp(`\\b${p}\\b`).exec(textoNorm);
          if(m){
            if(primeiros.filter((x) => x === p).length > 1){ if(!ambiguos.includes(p)) ambiguos.push(p); }
            else pos = m.index;
          }
        }
      }
      if(pos >= 0) achados.push({ nome: n, pos });
    });
    return { achados, ambiguos };
  }

  function statusPorPosicao(textoNorm, pos){
    const re = /(justificad\w*|falt\w*|ausent\w*|presente\w*|menos|exceto|salvo)/g;
    let m, ant = null, prox = null;
    while((m = re.exec(textoNorm))){ if(m.index < pos) ant = m[1]; else if(!prox) prox = m[1]; }
    const kw = ant || prox || "falt";
    if(/^justific/.test(kw)) return "justificada";
    if(/^presente/.test(kw)) return "presente";
    return "falta";
  }

  /* Entende frases como: "8A faltaram Ana e João, justificada Bia. Conteúdo: frações. Obs: retomar ex. 4".
     Só assume o comando quando acha a turma e pelo menos uma falta/conteúdo — pergunta ("onde vejo a presença?") não entra. */
  function tentarChamadaRapida(texto){
    const t = norm(texto);
    if(/\?/.test(texto) || !/\b(falt|ausen|justific|chamada|presen)/.test(t)) return false;
    const turmas = turmasDoProfessor();
    if(!turmas.length) return false;

    let resto = texto, obs = "";
    const mObs = /\bobs(?:erva[cç][aã]o|erva[cç][oõ]es)?\s*:\s*([\s\S]+)$/i.exec(resto);
    if(mObs){ obs = mObs[1].trim(); resto = resto.slice(0, mObs.index); }
    let conteudo = "";
    const mCont = /(?:conte[uú]do|mat[eé]ria|assunto|vimos|trabalhamos|falamos (?:de|sobre)|aula (?:de|sobre))\s*:?\s*([\s\S]+)$/i.exec(resto);
    if(mCont){ conteudo = mCont[1].trim().replace(/[.;,\s]+$/, ""); resto = resto.slice(0, mCont.index); }

    const rt = norm(resto);
    const turma = acharTurmaNoTexto(rt) || (turmas.length === 1 ? turmas[0] : null);
    if(!turma) return false;

    const { achados, ambiguos } = alunosCitados(rt, turma);
    const todosPresentes = /\b(todos presentes|sem falta|ninguem faltou|nao faltou ninguem)\b/.test(rt);
    if(!achados.length && !conteudo && !todosPresentes && !ambiguos.length) return false;
    if(!(turma.alunos || []).length){ falar([bot(`A turma **${turma.nome}** não tem alunos cadastrados.`)]); return true; }

    const status = {};
    if(!todosPresentes) achados.forEach((a) => { status[a.nome] = statusPorPosicao(rt, a.pos); });
    prepararChamada(turma, { status, conteudo: conteudo.slice(0, 600), observacao: obs.slice(0, 600) });

    const faltas = Object.keys(status).filter((n) => status[n] === "falta");
    const just = Object.keys(status).filter((n) => status[n] === "justificada");
    const partes = [
      faltas.length ? `❌ faltou: ${juntar(faltas)}` : "",
      just.length ? `📝 justificada: ${juntar(just)}` : "",
      !faltas.length && !just.length ? "todos presentes" : "",
    ].filter(Boolean);
    const aviso = ambiguos.length ? `\n⚠️ Tem mais de um aluno chamado ${juntar(ambiguos.map((a) => a[0].toUpperCase() + a.slice(1)))}. Não marquei; use **Mudar quem faltou** pra escolher.` : "";
    falar([bot(`Entendi! **${turma.nome}**: ${partes.join(" · ")}.${aviso}`)]);
    if(conteudo) mostrarResumo(); else perguntarConteudo();
    return true;
  }

  /* ---------------- consultas ao banco (professor e equipe) ---------------- */
  const ISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ICONE_ST = { feita: "✅", atrasada: "❌", andamento: "⏳", aguardando: "⏳", "sem-aula": "➖", "sem-registro": "❔" };
  const ROTULO_ST = { feita: "chamada feita", atrasada: "chamada pendente", andamento: "aula em andamento", aguardando: "aguardando a aula", "sem-aula": "sem aula prevista", "sem-registro": "sem chamada registrada" };
  const ORDEM_ST = { atrasada: 0, andamento: 1, "sem-registro": 2, aguardando: 3, feita: 4, "sem-aula": 5 };
  const cortar = (linhas, max = 25) => linhas.length > max ? [...linhas.slice(0, max), `… e mais ${linhas.length - max}.`] : linhas;
  const horaDe = (reg) => reg && reg.registradoEm ? new Date(reg.registradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

  function dataDaPergunta(texto){
    if(/\bhoje\b/.test(norm(texto))) return { iso: ISO(new Date()), futura: false };
    const d = lerData(texto);
    return d ? { iso: ISO(d.data), futura: d.data > new Date() } : { iso: ISO(new Date()), futura: false };
  }

  function turmaNoResultado(res, texto){
    const ct = compacto(texto);
    const c = res.turmas.filter((x) => compacto(x.nome).length >= 2 && ct.includes(compacto(x.nome)));
    return c.sort((a, b) => compacto(b.nome).length - compacto(a.nome).length)[0] || null;
  }

  function alunosNoResultado(res, texto){
    const t = norm(texto), achados = [];
    res.turmas.forEach((tm) => {
      const nomes = tm.alunos || [];
      const prim = nomes.map((n) => norm(n).split(/[^a-z0-9]+/).filter(Boolean)[0] || "");
      nomes.forEach((n, i) => {
        if(t.includes(norm(n)) || (prim[i].length >= 3 && new RegExp(`\\b${prim[i]}\\b`).test(t))) achados.push({ tm, nome: n });
      });
    });
    return achados.slice(0, 6);
  }

  function linhaTurma(tm, comProf){
    const base = `${ICONE_ST[tm.st]} **${tm.nome}**`;
    if(tm.st === "feita"){
      const r = tm.reg;
      return `${base} — ${r.presentes}/${r.total} presentes${r.faltaram.length ? " · faltou: " + juntar(r.faltaram) : ""}${r.justificadasNomes.length ? " · justificada: " + juntar(r.justificadasNomes) : ""}`;
    }
    return `${base} — ${ROTULO_ST[tm.st]}${tm.horario ? " (" + tm.horario + ")" : ""}${comProf && tm.professor ? " · Prof. " + tm.professor : ""}`;
  }

  function detalheTurma(res, tm, quando, c){
    if(tm.st === "feita"){
      const r = tm.reg;
      const hr = horaDe(r);
      const l = [`✅ **Sim!** A chamada de **${tm.nome}** ${quando} foi feita${hr ? " às " + hr : ""}${tm.professor ? " por " + tm.professor : ""}.`,
        `👥 ${r.presentes}/${r.total} presentes${r.faltaram.length ? " · ❌ faltou: " + juntar(r.faltaram) : ""}${r.justificadasNomes.length ? " · 📝 justificada: " + juntar(r.justificadasNomes) : ""}`,
        `📚 Conteúdo: ${r.conteudoTexto || "não informado"}`];
      if(r.observacao) l.push(`📝 Observação: ${r.observacao}`);
      Object.keys(r.observacoesAlunos || {}).forEach((n) => { if(r.observacoesAlunos[n]) l.push(`👤 ${n}: ${r.observacoesAlunos[n]}`); });
      return l.join("\n");
    }
    const motivo = {
      atrasada: `❌ **Ainda não foi feita.** A aula de **${tm.nome}** já terminou${tm.horario ? " (" + tm.horario + ")" : ""} e não há chamada registrada.`,
      andamento: `⏳ A aula de **${tm.nome}** está em andamento${tm.horario ? " (" + tm.horario + ")" : ""}; a chamada ainda não foi feita.`,
      aguardando: `⏳ A aula de **${tm.nome}** ainda não começou${tm.horario ? " (" + tm.horario + ")" : ""}; sem chamada por enquanto.`,
      "sem-aula": `➖ **${tm.nome}** não tem aula prevista ${quando} e não há chamada registrada.`,
      "sem-registro": `❔ Não há chamada registrada para **${tm.nome}** ${quando}.`,
    }[tm.st];
    return motivo + (c.papel === "instituicao" && tm.professor ? `\nProfessor(a): ${tm.professor}.` : "");
  }

  function responderConsulta(tipo, res, texto, c){
    const quando = res.data === res.hoje ? "hoje" : "em " + dataBr(res.data);
    const cab = `**Chamadas ${quando}** (${dataBr(res.data)})`;
    const tm = turmaNoResultado(res, texto);
    const ops = [];
    const pendentesMinhas = res.turmas.filter((x) => ["atrasada", "andamento", "sem-registro"].includes(x.st));

    if(!res.turmas.length) return { texto: "Não encontrei turmas para consultar.", ops };

    if(tipo === "aluno"){
      const achados = alunosNoResultado(res, texto);
      const linhas = achados.map(({ tm: t, nome }) => {
        if(!t.reg) return `❔ **${nome}** (${t.nome}): a chamada ${quando} ainda não foi feita.`;
        const st = t.reg.presencas[nome] || "presente";
        const obs = (t.reg.observacoesAlunos || {})[nome];
        return `${{ presente: "✅", falta: "❌", justificada: "📝" }[st]} **${nome}** (${t.nome}) ${quando}: ${{ presente: "veio", falta: "faltou", justificada: "falta justificada" }[st]}.${obs ? "\n   Obs.: " + obs : ""}`;
      });
      return { texto: linhas.join("\n"), ops };
    }

    let texto2;
    if(tipo === "faltas"){
      if(tm){
        if(tm.st !== "feita") texto2 = detalheTurma(res, tm, quando, c);
        else if(!tm.reg.faltaram.length && !tm.reg.justificadasNomes.length) texto2 = `🎉 Ninguém faltou em **${tm.nome}** ${quando} (${tm.reg.presentes}/${tm.reg.total} presentes).`;
        else texto2 = `**${tm.nome}** ${quando}:\n${tm.reg.faltaram.length ? "❌ Faltou: " + juntar(tm.reg.faltaram) : "Sem faltas"}${tm.reg.justificadasNomes.length ? "\n📝 Justificada: " + juntar(tm.reg.justificadasNomes) : ""}`;
      } else {
        const feitas = res.turmas.filter((x) => x.st === "feita");
        const com = feitas.filter((x) => x.reg.faltaram.length || x.reg.justificadasNomes.length);
        const total = feitas.reduce((n, x) => n + x.reg.faltaram.length, 0);
        if(!feitas.length) texto2 = `Ainda não há nenhuma chamada registrada ${quando}.`;
        else if(!com.length) texto2 = `🎉 Sem faltas ${quando} nas ${feitas.length} chamada(s) já feitas.`;
        else texto2 = [`**Faltas ${quando}** — ${total} aluno(s) em ${feitas.length} chamada(s) feita(s):`,
          ...cortar(com.map((x) => `• **${x.nome}**: ${x.reg.faltaram.length ? juntar(x.reg.faltaram) : "—"}${x.reg.justificadasNomes.length ? " (justificada: " + juntar(x.reg.justificadasNomes) + ")" : ""}`))].join("\n");
        const faltam = res.turmas.filter((x) => x.st === "atrasada").length;
        if(faltam) texto2 += `\n\n⚠️ ${faltam} turma(s) ainda sem chamada; as faltas delas não entram aqui.`;
      }
    } else if(tipo === "conteudo"){
      if(tm){
        texto2 = tm.st === "feita"
          ? `📚 **${tm.nome}** ${quando}: ${tm.reg.conteudoTexto || "conteúdo não informado"}.${tm.reg.observacao ? "\n📝 Observação: " + tm.reg.observacao : ""}`
          : detalheTurma(res, tm, quando, c);
      } else {
        const feitas = res.turmas.filter((x) => x.st === "feita");
        texto2 = feitas.length
          ? [`**Conteúdos ${quando}:**`, ...cortar(feitas.map((x) => `• **${x.nome}**: ${x.reg.conteudoTexto || "não informado"}`))].join("\n")
          : `Ainda não há chamada (nem conteúdo) registrada ${quando}.`;
      }
    } else if(tm && (tipo === "status" || tipo === "pendentes" || tipo === "resumo")){
      texto2 = detalheTurma(res, tm, quando, c);
    } else if(tipo === "pendentes"){
      const pend = res.turmas.filter((x) => x.st === "atrasada" || x.st === "sem-registro");
      const and = res.turmas.filter((x) => x.st === "andamento").length;
      texto2 = pend.length
        ? [`❌ **${pend.length} chamada(s) pendente(s)** ${quando}:`, ...cortar(pend.map((x) => linhaTurma(x, c.papel === "instituicao")))].join("\n")
        : `🎉 Nenhuma chamada pendente ${quando}.`;
      if(and) texto2 += `\n\n⏳ ${and} aula(s) ainda em andamento.`;
    } else {
      const ord = [...res.turmas].sort((a, b) => ORDEM_ST[a.st] - ORDEM_ST[b.st]);
      const cont = (st) => res.turmas.filter((x) => x.st === st).length;
      const semAula = cont("sem-aula");
      texto2 = [cab,
        `✅ ${cont("feita")} feita(s) · ❌ ${cont("atrasada") + cont("sem-registro")} pendente(s) · ⏳ ${cont("andamento") + cont("aguardando")} a caminho${semAula ? ` · ➖ ${semAula} sem aula` : ""}`,
        "", ...cortar(ord.filter((x) => x.st !== "sem-aula").map((x) => linhaTurma(x, c.papel === "instituicao")))].join("\n");
      if(!res.horariosOk) texto2 += "\n\n(Não consegui ler os horários agora, então considerei todas as turmas.)";
    }

    if(c.papel === "professor" && res.data === res.hoje){
      (tm && tm.st !== "feita" ? [tm] : tm ? [] : pendentesMinhas).slice(0, 3).forEach((x) => {
        const turma = turmasDoProfessor().find((t) => t.id === x.id);
        if(turma) ops.push({ rotulo: `Fazer a chamada — ${x.nome}`, estilo: "ok", fn: () => escolherTurma(turma) });
      });
    }
    if(c.papel === "instituicao") ops.push(botaoAba("instituicao", "relatorio"));
    return { texto: texto2, ops };
  }

  /* Pergunta do tipo "a chamada da 8A foi feita?", "quem faltou hoje?", "chamadas pendentes"… */
  async function tentarConsulta(texto){
    const c = contexto();
    if(c.papel !== "professor" && c.papel !== "instituicao") return false;
    const t = norm(texto);
    let tipo = null;
    if(/\bquem (faltou|faltaram|nao veio|nao vieram|esta faltando)\b/.test(t) || (/\b(faltas|faltosos|ausentes)\b/.test(t) && /\b(hoje|ontem|anteontem)\b/.test(t))) tipo = "faltas";
    else if(/\bconteudo\b/.test(t) && /\b(qual|quais|que|foi|passou|deram|deu|trabalhad\w*|dado)\b/.test(t)) tipo = "conteudo";
    else if(/\b(pendente|pendentes|atrasad\w+|nao fizeram|nao fez|ainda nao|sem chamada|faltam fazer)\b/.test(t) && /\b(chamada|chamadas|turma|turmas|professor|professores)\b/.test(t)) tipo = "pendentes";
    else if(/\b(foi|ja|fizeram|fez|feita|feitas|registrad\w+|lancad\w+)\b/.test(t) && /\b(chamada|chamadas|presenca)\b/.test(t)) tipo = "status";
    else if(/\b(resumo|panorama|situacao|como (foi|esta|estao|ficou))\b/.test(t) && /\b(dia|hoje|ontem|chamadas?|aulas?)\b/.test(t)) tipo = "resumo";
    else if(/\?/.test(texto) && /\b(faltou|veio|compareceu|presente|estava presente)\b/.test(t)) tipo = "aluno";
    if(!tipo) return false;

    const d = dataDaPergunta(texto);
    if(d.futura){ await falar([bot("Essa data ainda não chegou, então não há chamada para consultar. 😉")], { rapido: true }); return true; }

    S.digitando = true; desenhar();
    let res;
    try { res = await executar({ tipo: "consultar_chamadas", data: d.iso }); }
    catch(err){
      console.error("Edubug (consulta):", err?.code, err);
      res = { ok: false, mensagem: `Não consegui consultar agora${err?.code ? ` (${err.code})` : ""}. Tente de novo.` };
    }
    S.digitando = false;
    if(!res || !res.ok){ await falar([bot("⚠️ " + ((res && res.mensagem) || "Não consegui consultar agora."))], { rapido: true }); return true; }
    if(tipo === "aluno" && !alunosNoResultado(res, texto).length){ desenhar(); return false; }   // não era sobre aluno: segue o fluxo normal

    const r = responderConsulta(tipo, res, texto, c);
    await falar([bot(r.texto, r.ops.length ? opcoes(r.ops) : undefined)], { rapido: true });
    return true;
  }

  /* ==================================================================
     CALCULADORA 🧮
     Duas formas de usar, as duas sem sair da conversa:
       • escrever a conta:  "15% de 480", "12x7+3", "raiz de 144",
         "1.500 mais 2.500,50", "100 menos 15%", "média de 7, 8,5 e 6";
       • abrir o teclado:   "calculadora" (ou o botão 🧮 das sugestões).
     Não usa eval(): a conta é lida por um analisador próprio, então
     nada do que a pessoa digita vira código.
     ================================================================== */
  const OPS_CALC = { "÷": "/", "×": "*", "−": "-", "+": "+", "^": "^" };

  function avaliar(expr){
    let e = String(expr).replace(/\s+/g, "").replace(/\.(?!\d)/g, "");
    const aberto = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
    if(aberto > 0) e += ")".repeat(aberto);                    // fecha parênteses que ficaram abertos
    const tok = e.match(/\d+(?:\.\d+)?|\.\d+|sqrt|[+\-*/^()%]/g) || [];
    if(!tok.length || tok.join("") !== e) throw new Error("sintaxe");
    let i = 0;
    const peek = () => tok[i];
    const prox = () => tok[i++];

    // soma/subtração: "200 + 10%" vale 220 (o % é sobre o número da esquerda, como no celular)
    function soma(){
      let a = produto();
      while(peek() === "+" || peek() === "-"){
        const op = prox(), b = produto();
        const bv = b.pct ? a.v * b.v : b.v;
        a = { v: op === "+" ? a.v + bv : a.v - bv };
      }
      return a;
    }
    function produto(){
      let a = unario();
      while(peek() === "*" || peek() === "/"){
        const op = prox(), b = unario();
        if(op === "/" && b.v === 0) throw new Error("div0");
        a = { v: op === "*" ? a.v * b.v : a.v / b.v };
      }
      return a;
    }
    function unario(){
      if(peek() === "-"){ prox(); const a = unario(); return { v: -a.v, pct: a.pct }; }
      if(peek() === "+"){ prox(); return unario(); }
      return potencia();
    }
    function potencia(){
      const a = sufixo();
      if(peek() === "^"){ prox(); const b = unario(); return { v: Math.pow(a.v, b.v) }; }
      return a;
    }
    function sufixo(){
      let a = primario();
      while(peek() === "%"){ prox(); a = { v: a.v / 100, pct: true }; }
      return a;
    }
    function primario(){
      const t = prox();
      if(t === undefined) throw new Error("sintaxe");
      if(t === "("){ const a = soma(); if(prox() !== ")") throw new Error("sintaxe"); return { v: a.v }; }
      if(t === "sqrt"){ const a = unario(); if(a.v < 0) throw new Error("raizneg"); return { v: Math.sqrt(a.v) }; }
      if(/^[\d.]/.test(t)) return { v: parseFloat(t) };
      throw new Error("sintaxe");
    }
    const r = soma();
    if(i !== tok.length) throw new Error("sintaxe");
    return r.v;
  }

  /* 0.1+0.2 vira 0,3 (e não 0,30000000000000004); formato brasileiro. */
  function fmtNum(v, casas = 8){
    if(!Number.isFinite(v)) throw new Error("inv");
    return Number(v.toPrecision(12)).toLocaleString("pt-BR", { maximumFractionDigits: casas });
  }

  /* Transforma o texto da pessoa em uma conta que o avaliar() entende.
     Devolve { expr, bruto } ou null se NÃO parecer uma conta (qualquer palavra
     sobrando já derruba: "mais detalhes", "8A faltou Ana"… não viram conta). */
  function lerConta(texto){
    let t = norm(texto).trim();
    t = t.replace(/^(?:(?:me )?(?:ajuda|ajude) a |(?:voce |vc )?(?:pode|poderia) |por favor |pf )*/, "");
    t = t.replace(/^(?:calcula(?:r|e)?|faca a conta de|faz a conta de|conta de|resultado d[eao]|quanto (?:e|eh|da|dao|fica|vai ficar|sera|seria|vale)|quanto)\s*/, "");
    t = t.replace(/[?=!\s]+$/, "").trim();
    if(!t) return null;
    const dt = t.match(/^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/);
    if(dt && Number(dt[1]) >= 1 && Number(dt[1]) <= 31 && Number(dt[2]) >= 1 && Number(dt[2]) <= 12) return null;   // data (14/10), não conta
    if(/^\+?\d{2,5}-\d{3,5}(-\d{3,5})?$/.test(t)) return null;         // telefone
    const bruto = t.replace(/\*/g, "×").replace(/(\d)\s*\/\s*(\d)/g, "$1 ÷ $2");

    t = t.replace(/(^|[^\d.,])([1-9]\d{0,2})((?:\.\d{3})+)(?!\d)/g, (m, a, b, c) => a + b + c.replace(/\./g, ""));   // 1.500 -> 1500
    t = t.replace(/(\d),(\d)/g, "$1.$2");                                                                          // 2,5 -> 2.5
    t = t.replace(/[×]/g, "*").replace(/[÷]/g, "/").replace(/[−–—]/g, "-");
    t = t.replace(/\s*por ?cento\b/g, "%");
    t = t.replace(/(\d+(?:\.\d+)?)\s*%\s*d[eoa]s?\s+(\d+(?:\.\d+)?)/g, "($1/100)*$2");                              // 15% de 480
    t = t.replace(/\bdividir\s+(\S+)\s+por\s+(\S+)/g, "($1/$2)")
         .replace(/\bmultiplicar\s+(\S+)\s+por\s+(\S+)/g, "($1*$2)")
         .replace(/\bsomar\s+(\S+)\s+(?:com|e|mais)\s+(\S+)/g, "($1+$2)");
    t = t.replace(/\braiz(?: quadrada)?(?: d[eoa])?\s*/g, "sqrt ");
    t = t.replace(/\bao quadrado\b/g, "^2").replace(/\bao cubo\b/g, "^3").replace(/\belevado a(?:o)?\b/g, "^");
    t = t.replace(/\b(?:multiplicado por|multiplicada por|vezes|vez)\b/g, "*")
         .replace(/\b(?:dividido por|dividida por|dividido|dividida)\b/g, "/")
         .replace(/\b(?:mais|somado com|somado a)\b/g, "+")
         .replace(/\b(?:menos)\b/g, "-");
    t = t.replace(/(\d)\s*x\s*(?=[\d(])/g, "$1*");                                                                  // 12x7

    if(!/^[\d+\-*/^().%\s]+$/.test(t.replace(/sqrt/g, ""))) return null;   // sobrou palavra: não é conta
    t = t.replace(/\s+/g, "");
    if(!/[\d)%][+\-*/^]|sqrt|%/.test(t)) return null;                        // número sozinho não é conta
    return { expr: t, bruto };
  }

  const PALAVRAS_MEDIA = new Set("media soma somar total mais de do da das dos e notas nota valores numeros numero calcula calcule calcular quanto qual a o os as ponderada aritmetica entre com".split(" "));
  function tentarMedia(texto){
    const t = norm(texto).replace(/[?!=]/g, " ");
    const tipo = /\bmedia\b/.test(t) ? "media" : /\b(soma|somar|total)\b/.test(t) ? "soma" : null;
    if(!tipo) return null;
    const nums = (t.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", ".")));
    if(nums.length < 2) return null;
    const resto = t.replace(/\d+(?:[.,]\d+)?/g, " ").split(/[^a-z]+/).filter(Boolean);
    if(resto.some((p) => !PALAVRAS_MEDIA.has(p))) return null;       // tem outra coisa na frase: não é pra calcular
    const total = nums.reduce((a, b) => a + b, 0);
    const lista = juntar(nums.map((n) => fmtNum(n)));
    return tipo === "media"
      ? `📊 Média de ${lista}: **${fmtNum(total / nums.length, 2)}**\n(soma ${fmtNum(total, 2)} ÷ ${nums.length})`
      : `➕ Soma de ${lista}: **${fmtNum(total, 2)}**`;
  }

  const botaoCalc = () => ({ rotulo: "🧮 Abrir calculadora", eco: false, fn: abrirCalculadora });

  function abrirCalculadora(){
    falar([bot("Aqui está a calculadora 🧮\nToque nas teclas — ou digite a conta aqui embaixo (ex.: **15% de 480**, **média de 7, 8,5 e 6**).",
      { tipo: "calc", expr: "", res: "", apos: false, raw: 0 })], { rapido: true });
  }

  async function tentarCalculo(texto){
    const media = tentarMedia(texto);
    if(media){ await falar([bot(media, opcoes([botaoCalc()]))], { rapido: true }); return true; }

    const conta = lerConta(texto);
    if(conta){
      let r;
      try{ r = fmtNum(avaliar(conta.expr)); }
      catch(e){
        const msg = { div0: "Não dá pra dividir por zero. 😅", raizneg: "Não existe raiz quadrada de número negativo.", inv: "Esse resultado não dá pra mostrar (número grande demais ou inválido)." }[e && e.message];
        if(msg){ await falar([bot(msg)], { rapido: true }); return true; }
        return false;   // conta mal formada: deixa seguir o fluxo normal
      }
      await falar([bot(`🧮 ${conta.bruto} = **${r}**`, opcoes([botaoCalc()]))], { rapido: true });
      return true;
    }
    const t = norm(texto).trim();
    if(/\bcalculadora\b/.test(t) || /^(calcula(r|e)?|fazer (uma )?conta|conta)$/.test(t)){ abrirCalculadora(); return true; }
    return false;
  }

  /* Teclado da calculadora (o cartão guarda a conta em comp.expr, em formato "de máquina"). */
  const TECLAS_CALC = [
    ["C", "fn"], ["⌫", "fn"], ["%", "fn"], ["÷", "op"],
    ["7"], ["8"], ["9"], ["×", "op"],
    ["4"], ["5"], ["6"], ["−", "op"],
    ["1"], ["2"], ["3"], ["+", "op"],
    ["(", "fn"], [")", "fn"], ["0"], [",", "fn"],
    ["√", "fn"], ["^", "fn"], ["=", "ok"],
  ];
  const bonitaCalc = (e) => String(e).replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−").replace(/\./g, ",").replace(/sqrt\(/g, "√(");

  function calcTecla(comp, k){
    if(k === "C"){ comp.expr = ""; comp.res = ""; comp.apos = false; return; }
    if(k === "="){
      if(!comp.expr) return;
      try{ const v = avaliar(comp.expr); comp.res = fmtNum(v); comp.raw = v; comp.apos = true; }
      catch(e){ comp.res = e && e.message === "div0" ? "÷ por zero" : "conta incompleta"; }
      return;
    }
    if(comp.apos){            // depois do "=": operador continua do resultado; número começa conta nova
      comp.apos = false;
      comp.expr = OPS_CALC[k] || k === "%" ? String(Number(comp.raw.toPrecision(12))) : (k === "⌫" ? String(Number(comp.raw.toPrecision(12))) : "");
    }
    const e = comp.expr, ult = e.slice(-1);
    if(k === "⌫"){ comp.expr = /sqrt\($/.test(e) ? e.slice(0, -5) : e.slice(0, -1); }
    else if(OPS_CALC[k]){
      const op = OPS_CALC[k];
      if(!e){ if(op === "-") comp.expr = "-"; }
      else if("+-*/^".includes(ult)){ if(e.length > 1 || op === "-") comp.expr = e.slice(0, -1) + op; }   // trocar de operador
      else if(ult === "("){ if(op === "-") comp.expr += op; }
      else comp.expr += op;
    }
    else if(k === ","){ const seg = e.split(/[^0-9.]/).pop(); if(!seg.includes(".")) comp.expr += seg ? "." : "0."; }
    else if(k === "%"){ if(/[0-9)%]$/.test(e)) comp.expr += "%"; }
    else if(k === "√"){ comp.expr += (/[0-9)%.]$/.test(e) ? "*" : "") + "sqrt("; }
    else if(k === "("){ comp.expr += (/[0-9)%]$/.test(e) ? "*" : "") + "("; }
    else if(k === ")"){
      const ab = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
      if(ab > 0 && /[0-9)%]$/.test(e)) comp.expr += ")";
    }
    else if(/^\d$/.test(k)){ comp.expr += (/[)%]$/.test(e) ? "*" : "") + k; }

    // prévia ao vivo do resultado (só quando já tem operação na conta)
    comp.res = "";
    if(/[+\-*/^%]|sqrt/.test(comp.expr.slice(1))){
      try{ comp.res = fmtNum(avaliar(comp.expr)); }catch(err){ comp.res = ""; }
    }
  }

  /* ==================================================================
     ANIVERSÁRIOS 🎂  (equipe da escola)
     Os dados vêm do script.js (a mesma lista da aba Aniversários, com a
     mensagem pronta e o WhatsApp do aluno ou do responsável). O Edubug:
       • põe um sinalzinho 🎂 no botão flutuante quando tem aniversário hoje;
       • ao abrir, avisa quem faz anos hoje (e amanhã) com botão de parabéns;
       • responde "quem faz aniversário hoje / amanhã / essa semana?".
     ================================================================== */
  const aniv = () => { try{ const l = aniversarios(); return Array.isArray(l) ? l : []; }catch(e){ return []; } };
  const VISTO_KEY = "edubug-aniv-visto-v1";
  const lerVisto = () => { try{ return localStorage.getItem(VISTO_KEY) || ""; }catch(e){ return ""; } };
  const gravarVisto = (v) => { try{ localStorage.setItem(VISTO_KEY, v); }catch(e){} };
  const sigHoje = (lista) => ISO(new Date()) + ":" + lista.map((a) => a.id).sort().join(",");
  const chaveAniv = (a) => ISO(new Date()) + ":" + a.id;
  const dd = (n) => String(n).padStart(2, "0");
  const quandoAniv = (a) => a.diasFaltam === 0 ? "hoje" : a.diasFaltam === 1 ? "amanhã" : `${dd(a.dia)}/${dd(a.mes)}`;

  function linhaAniv(a){
    const quem = `**${a.nome}**${a.detalhe ? " (" + a.detalhe + ")" : ""}`;
    const papel = a.tipo === "professor" ? " · professor(a)" : "";
    return `• ${quem} — faz ${a.idade} anos${papel}${a.destino ? "" : " · ⚠️ sem WhatsApp"}`;
  }

  /* Botões de parabéns (um por aniversariante que tem WhatsApp). */
  function chipsParabens(lista){
    return lista.filter((a) => a.destino).slice(0, 6).map((a) => ({
      rotulo: `🎉 Parabenizar ${a.primeiro}`, estilo: "zap", eco: false, fn: () => parabenizar(a),
    }));
  }

  /* Abre o WhatsApp com a mensagem pronta (e o cartão com a logo, igual à aba Aniversários).
     Roda direto do clique, senão o navegador bloqueia a janela. */
  function parabenizar(a){
    const d = a.destino;
    if(!d) return;
    S.parabenizados.add(chaveAniv(a));
    if(enviarParabens) enviarParabens({ numero: d.numero, texto: d.texto, nome: a.primeiro, tipo: a.tipo });
    else window.open(whatsappLinkComTexto(d.numero, d.texto), "_blank", "noopener");
    const para = d.quem === "responsavel" ? `o responsável (${d.quemNome})` : d.quem === "professor" ? "o(a) professor(a)" : "o aluno";
    const restantes = aniv().filter((x) => x.ehHoje && x.destino && !S.parabenizados.has(chaveAniv(x)));
    falar([
      bot(`WhatsApp aberto para ${para}! 🎉 É só conferir a mensagem e enviar.`),
      restantes.length
        ? bot("Quer parabenizar mais alguém?", opcoes(chipsParabens(restantes)))
        : bot("Esse era o último aniversariante de hoje com WhatsApp. 🥳"),
    ], { rapido: true });
  }

  function montarAviso(hoje, amanha){
    const partes = [];
    if(hoje.length){
      partes.push(`🎂 **${hoje.length === 1 ? "Hoje tem aniversário!" : `Hoje tem ${hoje.length} aniversários!`}**\n` + cortar(hoje.map(linhaAniv), 8).join("\n"));
    }
    if(amanha.length){
      partes.push(`📅 **Amanhã:** ${juntar(amanha.slice(0, 6).map((a) => a.nome))}${amanha.length > 6 ? ` e mais ${amanha.length - 6}` : ""}`);
    }
    if(hoje.some((a) => a.destino)) partes.push("Toque num nome pra abrir o WhatsApp com a mensagem já escrita.");
    const itens = [...chipsParabens(hoje), botaoAba("instituicao", "aniversarios")];
    return bot(partes.join("\n\n"), opcoes(itens));
  }

  /* Lembrete dentro da conversa: uma vez por conjunto de aniversariantes (hoje + amanhã). */
  function lembrarAniversarios(){
    const lista = aniv();
    const hoje = lista.filter((a) => a.ehHoje);
    const amanha = lista.filter((a) => a.diasFaltam === 1);
    if(!hoje.length && !amanha.length) return;
    const sig = sigHoje(hoje) + "|" + amanha.map((a) => a.id).sort().join(",");
    if(S.avisouAniv === sig) return;
    S.avisouAniv = sig;
    gravarVisto(sigHoje(hoje));
    S.msgs.push(montarAviso(hoje, amanha));
    atualizarBadge();
  }

  /* Sinalzinho 🎂 no botão flutuante: some depois que a pessoa abre a conversa e vê o aviso. */
  function atualizarBadge(){
    if(!raizDom) return;
    const hoje = aniv().filter((a) => a.ehHoje);
    const novo = hoje.length > 0 && lerVisto() !== sigHoje(hoje);
    const b = $(".eb-badge"), fab = $(".eb-fab");
    if(!b || !fab) return;
    b.hidden = !novo;
    if(novo) b.textContent = "🎂" + (hoje.length > 1 ? " " + hoje.length : "");
    fab.classList.toggle("eb-fab-aviso", novo);
    fab.title = novo ? `Hoje tem ${hoje.length} aniversariante${hoje.length > 1 ? "s" : ""} · clique para abrir` : "Clique para abrir · arraste para mover";
  }

  /* "quem faz aniversário hoje?", "aniversariantes da semana", "tem aniversário amanhã?"… */
  async function tentarAniversarios(texto){
    if(contexto().papel !== "instituicao") return false;
    const t = norm(texto);
    if(!/\b(aniversari\w*|parabens|parabenizar)\b/.test(t)) return false;
    if(/\b(como|passo|manual|personaliz\w*|editar|texto da mensagem)\b/.test(t)) return false;   // dúvida de uso: segue pros guias/manuais

    const lista = aniv();
    if(!lista.length){
      await falar([bot("Não achei aniversariantes por aqui. A lista pode ainda estar carregando, ou falta a **data de nascimento** no cadastro dos alunos.", opcoes([botaoAba("instituicao", "aniversarios")]))], { rapido: true });
      return true;
    }
    let sel, titulo;
    if(/\bamanha\b/.test(t)){ sel = lista.filter((a) => a.diasFaltam === 1); titulo = "Aniversários de amanhã"; }
    else if(/\b(semana|proxim\w*)\b/.test(t)){ sel = lista.filter((a) => a.diasFaltam <= 7); titulo = "Aniversários dos próximos 7 dias"; }
    else if(/\bmes\b/.test(t)){ sel = lista.filter((a) => a.diasFaltam <= 30); titulo = "Aniversários dos próximos 30 dias"; }
    else { sel = lista.filter((a) => a.ehHoje); titulo = "Aniversariantes de hoje"; }

    if(!sel.length){
      const prox = lista.filter((a) => a.diasFaltam > 0 && a.diasFaltam <= 30).slice(0, 5);
      await falar([bot(`🎈 Nenhum aniversário nesse período.${prox.length ? "\n\n**Os próximos:**\n" + prox.map((a) => `• **${a.nome}**${a.detalhe ? " (" + a.detalhe + ")" : ""} — ${quandoAniv(a)}`).join("\n") : ""}`, opcoes([botaoAba("instituicao", "aniversarios")]))], { rapido: true });
      return true;
    }
    const linhas = cortar(sel.map((a) => `${linhaAniv(a)}${a.diasFaltam > 0 ? " · " + quandoAniv(a) : ""}`), 15);
    const hojeSel = sel.filter((a) => a.ehHoje);
    await falar([bot(`🎂 **${titulo}** (${sel.length})\n` + linhas.join("\n"), opcoes([...chipsParabens(hojeSel), botaoAba("instituicao", "aniversarios")]))], { rapido: true });
    return true;
  }

  /* ---------------- entendimento do que a pessoa escreveu ---------------- */
  async function continuarFluxo(texto){
    const f = S.fluxo;
    if(!f || !f.espera) return false;
    if(/\b(cancelar|cancela|sair|deixa pra la|esquece)\b/.test(norm(texto)) || (/\bvoltar\b/.test(norm(texto)) && f.espera !== "aluno-status")){
      S.fluxo = null;
      await falar([bot("Tudo bem, cancelei. Em que mais posso ajudar?")]);
      return true;
    }
    if(f.espera === "aluno-status"){
      const t = norm(texto);
      if(t.split(/\s+/).length > 4){ fecharBotoes(); return false; }   // frase longa: provavelmente é a chamada ditada
      if(/\b(volta|voltar|anterior)\b/.test(t)){ fecharBotoes(); f.idx = Math.max(0, f.idx - 1); perguntarAluno(); return true; }
      if(/\b(demais|resto|restante|outros|todos)\b/.test(t) && /\b(veio|vieram|presente|presentes|ok)\b/.test(t)){ fecharBotoes(); restantesPresentes(); return true; }
      let st = null;
      if(/\bjustific/.test(t)) st = "justificada";
      else if(/\b(nao|n|faltou|falta|ausente)\b/.test(t)) st = "falta";
      else if(/\b(sim|s|veio|presente|aqui|ta|esta|ok)\b/.test(t)) st = "presente";
      if(!st){ falar([bot("Não entendi 😅 Toque num botão ou responda **veio**, **faltou** ou **justificada**.")], { rapido: true }); return true; }
      fecharBotoes(); marcarAluno(st); return true;
    }
    if(f.espera === "conteudo"){ definirConteudo(texto); return true; }
    if(f.espera === "obs-aula"){ f.observacao = texto.trim().slice(0, 600); perguntarAnexos(); return true; }
    if(f.espera === "obs-aluno"){
      const v = texto.trim().slice(0, 600);
      if(f.alvoObs) f.obsAlunos[f.alvoObs] = v;
      f.alvoObs = ""; perguntarAnexos(); return true;
    }
    if(f.espera === "anexo-texto"){ montarAnexo(f, texto.trim().slice(0, 600)); return true; }
    if(f.espera === "zap-texto"){ mostrarZap(texto.trim().slice(0, 600)); return true; }
    if(f.espera === "ajuste-data"){
      const d = lerData(texto);
      if(!d){ await falar([bot("Não entendi a data. Escreva assim: **14/10** ou **ontem**.")]); return true; }
      if(d.data > new Date()){ await falar([bot("Essa data ainda não chegou. Qual foi o dia da aula?")]); return true; }
      f.dataTexto = d.texto; f.espera = "ajuste-texto";
      await falar([bot(`Dia **${d.texto}**. Agora me diga **o que precisa ser ajustado** (ex.: “A Maria faltou, mas está presente”).`)]);
      return true;
    }
    if(f.espera === "ajuste-texto"){
      const t = f.turma;
      const msg = [
        "Olá! Preciso de um *ajuste de aula* no app Educa+.", "",
        `*Professor(a):* ${contexto().nome || "—"}`,
        `*Turma:* ${[t.nome, t.disciplina].filter(Boolean).join(" — ")}`,
        `*Dia da aula:* ${f.dataTexto}`, "", "*Ajuste solicitado:*", texto.trim().slice(0, 600),
      ].join("\n");
      S.fluxo = null;
      await falar([bot(`Pedido pronto!\n\n“${texto.trim().slice(0, 300)}”`, botoesZap(msg))]);
      return true;
    }
    return false;
  }

  const FALA = {
    oi: /^(oi+|ola+|opa|e ai|eai|bom dia|boa tarde|boa noite|hey|hello)\b/,
    obrigado: /\b(obrigad[oa]|valeu|brigad[oa]|muito bom|show)\b/,
    zap: /\b(secretaria|whats(app)?|atendente|atendimento|falar com (a )?(escola|alguem|pessoa|humano))\b/,
    chamada: /\b(fazer|registrar|lancar|salvar|marcar|abrir)?\s*(a )?(chamada|presenca de hoje|falta de hoje)\b|\bmarcar (falta|presenca)\b/,
    repetir: /\b(repet\w*|copiar|copia|mesma|igual)\b.*\b(chamada|aula|ultima)\b|\bultima (chamada|aula)\b/,
    anexar: /\b(anex\w*|anot\w*|acrescent\w*|adicion\w*|registr\w*)\b.*\b(observacao|observacoes|informacao|anotacao|obs)\b|\b(observacao|anotacao) (da|na|sobre|do|no)\b/,
    ajuste: /\b(ajuste|corrigir|corrigi|errei|errada?) .*(aula|chamada|conteudo)|\bajuste de aula\b/,
    capacidades: /\b(o que (voce|vc|tu) (faz|sabe|pode)|como (voce|vc) (funciona|ajuda)|quem (e|eh) (voce|vc)|ajuda$|menu)\b/,
    navVerbo: /\b(abrir|abre|ir|vai|leva|levar|me leva|mostrar|mostra|acessar|quero ver|onde (fica|esta|vejo|encontro|acho)|como (vejo|acesso))\b/,
  };


  /* ---------------- tolerância a erro de digitação ---------------- */
  function vocabulario(){
    const v = new Set();
    const add = (txt) => palavras(txt).forEach((p) => { if(p.length >= 4) v.add(p); });
    GRUPOS.forEach((g) => g.forEach((p) => { const r = raiz(norm(p)); if(r.length >= 4) v.add(r); }));
    Object.values(ABAS).forEach((tab) => Object.values(tab).forEach(([rot, kw]) => { add(rot); add(kw); }));
    GUIAS.forEach((g) => g.quando.forEach((gr) => gr.forEach((p) => { const r = raiz(p); if(r.length >= 4) v.add(r); })));
    (manuais() || []).forEach((m) => { add(m.titulo); add(m.descricao); });
    return v;
  }

  /* Palavra desconhecida parecida com UMA palavra que o Edubug conhece vira ela
     (boletu -> boleto, mensalidde -> mensalidade). Se houver empate, deixa como está. */
  function corrigirStems(stems){
    const voc = vocabulario();
    return stems.map((s) => {
      if(s.length < 4 || voc.has(s)) return s;
      const lim = s.length >= 7 ? 2 : 1;
      let melhor = null, d0 = 99, empate = false;
      for(const w of voc){
        if(Math.abs(w.length - s.length) > lim) continue;
        const d = distancia(s, w);
        if(d < d0){ d0 = d; melhor = w; empate = false; }
        else if(d === d0 && w !== melhor) empate = true;
      }
      return melhor && d0 <= lim && !empate ? melhor : s;
    });
  }

  /* ---------------- "resolveu?" e "quero mais detalhes" ---------------- */
  function acharGuia(papel, stems){
    const set = new Set(stems);
    let melhor = null;
    GUIAS.forEach((g) => {
      if(!g.papeis.includes(papel)) return;
      if(!g.quando.every((grupo) => grupo.some((p) => set.has(p) || set.has(raiz(p))))) return;
      if(!melhor || g.quando.length > melhor.quando.length) melhor = g;
    });
    return melhor;
  }

  function perguntarResolveu(pergunta){
    const c = contexto();
    const itens = [
      { rotulo: "✅ Resolveu", estilo: "ok", fn: () => { registrar("resolveu", S.busca?.texto); falar([bot("Que bom! 🐞 Se aparecer outra dúvida, é só chamar.")], { rapido: true }); } },
      { rotulo: "🔎 Quero mais detalhes", fn: () => { registrar("detalhes", S.busca?.texto); detalhar(); } },
    ];
    if(c.papel !== "instituicao") itens.push({ rotulo: "Falar com a secretaria", fn: () => iniciarZap(S.busca?.texto || S.ultima), eco: false });
    return bot(pergunta || "Isso resolveu a sua dúvida ou quer mais detalhes?", opcoes(itens));
  }

  /* Relê a pergunta original e responde direto: passo a passo + botão da aba. */
  async function detalhar(){
    const c = contexto();
    const b = S.busca || {};
    const stems = b.stems && b.stems.length ? b.stems : palavras(b.texto || S.ultima || "");
    const guia = acharGuia(c.papel, stems);
    const manual = (b.manuais && b.manuais[0]) || null;
    const chaveAba = guia && ABAS[c.papel]?.[guia.aba] ? guia.aba : (b.aba || null);
    const ops = chaveAba && ABAS[c.papel]?.[chaveAba] ? opcoes([botaoAba(c.papel, chaveAba)]) : undefined;
    const msgs = [];

    if(guia){
      let extra = "";
      if(guia.dados === "contratosPendentes"){
        try{
          const r = await executar({ tipo: "resumo_pendencias" });
          if(r && r.ok && Number.isFinite(r.contratosPendentes)){
            extra = r.contratosPendentes === 0 ? "\n\n📌 Hoje **não há** contratos aguardando assinatura."
              : `\n\n📌 Hoje há **${r.contratosPendentes}** contrato${r.contratosPendentes === 1 ? "" : "s"} aguardando assinatura.`;
          }
        }catch(e){}
      }
      msgs.push(bot(`**${guia.titulo}**\n\n` + guia.passos.map((p, i) => `${i + 1}. ${p}`).join("\n") + extra, ops));
      if(manual) msgs.push(bot("Quer ver ilustrado? Tem no manual:", { tipo: "manuais", itens: [manual] }));
    } else if(manual){
      registrar("sem-guia", b.texto);
      const rot = chaveAba ? ` Fica na aba **${ABAS[c.papel][chaveAba][0]}**.` : "";
      msgs.push(bot(`Resumindo, o manual **${manual.titulo}** explica assim: ${manual.descricao}${/[.!?]$/.test(manual.descricao || "") ? "" : "."}${rot}`, ops));
      msgs.push(bot("Passo a passo completo:", { tipo: "manuais", itens: [manual] }));
    } else if(ops){
      msgs.push(bot(`Isso fica na aba **${ABAS[c.papel][chaveAba][0]}**. Vou te levar até lá:`, ops));
    } else {
      const sem = c.papel === "instituicao"
        ? opcoes([botaoAba("instituicao", "perfil")])
        : opcoes([{ rotulo: "Falar com a secretaria", fn: () => iniciarZap(b.texto || S.ultima), eco: false }]);
      registrar("sem-guia", b.texto);
      await falar([bot("Reli a sua pergunta e não tenho um passo a passo pra ela ainda. " + (c.papel === "instituicao" ? "A lista completa está em **Meu perfil**." : "Posso deixar a mensagem pronta pra secretaria."), sem)]);
      return;
    }
    msgs.push(perguntarResolveu("Ficou claro agora?"));
    await falar(msgs);
  }

  /* Equipe: "lacunas do Edubug" → o que as pessoas perguntam e ele não soube responder. */
  async function mostrarLacunas(){
    let itens = null, origem = "do banco (todas as pessoas)";
    try{
      const r = await executar({ tipo: "listar_lacunas" });
      if(r && r.ok) itens = r.itens || [];
    }catch(e){}
    if(!itens){
      try{ itens = JSON.parse(localStorage.getItem(LAC_KEY) || "[]"); origem = "só deste navegador (o banco ainda não está liberado)"; }catch(e){ itens = []; }
    }
    const conta = (tipos) => {
      const m = new Map();
      itens.filter((x) => tipos.includes(x.tipo)).forEach((x) => {
        const k = norm(x.texto).replace(/[^a-z0-9 ]/g, "").trim();
        if(!k) return;
        const a = m.get(k) || { texto: x.texto, n: 0 };
        a.n++; m.set(k, a);
      });
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    };
    const nao = conta(["nao-achou"]), semGuia = conta(["sem-guia"]);
    const res = itens.filter((x) => x.tipo === "resolveu").length;
    const det = itens.filter((x) => x.tipo === "detalhes").length;
    if(!itens.length){ await falar([bot("Ainda não tenho registros. Conforme as pessoas conversarem comigo, eu anoto aqui o que não soube responder.")]); return; }
    const linhas = (l) => l.length ? l.map((x) => `• “${x.texto}” — ${x.n}×`).join("\n") : "• nada por enquanto 🎉";
    await falar([bot(`📊 **O que ensinar ao Edubug** (${origem})\n\n**Não achei nada para:**\n${linhas(nao)}\n\n**Pediram detalhes e eu não tinha passo a passo:**\n${linhas(semGuia)}\n\n✅ Resolveu: ${res}  ·  🔎 Quiseram mais detalhes: ${det}`)]);
  }

  async function receber(texto){
    texto = String(texto || "").trim().slice(0, 600);
    if(!texto) return;
    S.msgs.push({ role: "eu", texto });
    desenhar();
    await S.fila;

    if(await continuarFluxo(texto)) return;
    if(S.fluxo && S.fluxo.tipo) S.fluxo = null;   // mudou de assunto: abandona o fluxo anterior

    const c = contexto();
    const t = norm(texto);
    const stems = corrigirStems(palavras(texto));
    // "não consigo/consegue": 'consigo' é palavra ignorada na busca, então marcamos a dificuldade à parte
    if(/\bnao (consigo|consegu)/.test(t) && !stems.includes("consegue")) stems.push("consegue");
    // "como crio / lanço / mando…": soma o verbo no infinitivo, pra bater com os guias (mantém a palavra original)
    stems.slice().forEach((s) => { const b = FORMAS_VERBO[s]; if(b && !stems.includes(b)) stems.push(b); });

    if(FALA.oi.test(t) && stems.length <= 1){
      await falar([bot("Oi! 😊 Em que posso ajudar?", opcoes((SUGESTOES[c.papel] || []).map((r) => ({ rotulo: r, fn: () => receber(r), eco: false }))))]);
      return;
    }
    if(FALA.obrigado.test(t) && stems.length <= 1){ await falar([bot("Por nada! Se precisar, é só chamar. 🐞")]); return; }
    if(FALA.capacidades.test(t)){
      const extras = c.papel === "professor" ? "\n• Lanço a **chamada de hoje** perguntando aluno por aluno (ou ditando: “8A faltou Ana, conteúdo frações”)\n• **Repito a última aula** como base\n• **Anexo observações** da aula ou de um aluno\n• Monto o pedido de **ajuste de aula**" : "";
      await falar([bot(`Sou o Edubug, o assistente virtual do Educa+. Posso:\n• Achar a resposta nos **manuais** do app\n• Te levar até a **aba** certa${c.papel === "professor" || c.papel === "instituicao" ? "\n• **Consultar o banco**: “a chamada da 8A foi feita?”, “quem faltou hoje?”, “chamadas pendentes”" : ""}${extras}${c.papel === "instituicao" ? "\n• Avisar os **aniversariantes** (hoje e amanhã) e abrir o WhatsApp com os parabéns" : ""}\n• Fazer **contas** (“15% de 480”, “média de 7, 8,5 e 6”) ou abrir a **calculadora** 🧮${c.papel !== "instituicao" ? "\n• Deixar a mensagem pronta pra **secretaria** no WhatsApp" : ""}\n\nÉ só escrever o que precisa.`)]);
      return;
    }
    if(c.papel === "instituicao" && /(lacuna|nao soube|sem resposta|o que ensinar|ensinar.*edubug|edubug.*(nao sabe|aprender))/.test(t)){ await mostrarLacunas(); return; }
    if(await tentarCalculo(texto)) return;
    if(await tentarAniversarios(texto)) return;
    if(await tentarConsulta(texto)) return;
    if(c.papel === "professor" && FALA.ajuste.test(t)){ iniciarAjuste(); return; }
    if(c.papel === "professor"){
      if(FALA.repetir.test(t)){ iniciarChamada({ repetir: true, texto }); return; }
      if(FALA.anexar.test(t)){ iniciarAnexo(null, texto); return; }
      if(tentarChamadaRapida(texto)) return;
    }
    if(FALA.chamada.test(t) && !/\b(corrigir|ajuste|ontem|semana passada)\b/.test(t)){
      if(c.papel === "professor"){ iniciarChamada(); return; }
      await falar([bot("A chamada é feita pelo professor. Você pode ver a presença na aba **" + (c.papel === "instituicao" ? "Relatório do dia" : "Presença") + "**.", opcoes([botaoAba(c.papel, c.papel === "instituicao" ? "relatorio" : "presenca")]))]);
      return;
    }
    if(FALA.zap.test(t) && stems.filter((s) => !["secretaria", "whatsapp", "falar", "atendente"].includes(s)).length === 0){
      iniciarZap();
      return;
    }

    // ---- navegação + manuais ----
    S.ultima = texto;
    const guia = acharGuia(c.papel, stems);
    // se existe guia, a aba dele manda (resolve o empate tipo "Turmas" x "Cursos e turmas")
    const aba = guia && ABAS[c.papel]?.[guia.aba] ? { chave: guia.aba, pts: 5 } : acharAba(c.papel, stems);
    const manuaisAchados = buscarManuais(stems);
    const comVerbo = FALA.navVerbo.test(t);
    S.busca = { texto, stems, manuais: manuaisAchados, aba: aba ? aba.chave : null };

    if(aba && (comVerbo || !manuaisAchados.length || aba.pts >= 5)){
      const rot = ABAS[c.papel][aba.chave][0];
      const bots = [bot(comVerbo && !manuaisAchados.length ? `Claro! Fica na aba **${rot}**.` : `Isso está na aba **${rot}**.`, opcoes([botaoAba(c.papel, aba.chave)]))];
      if(manuaisAchados.length) bots.push(bot("Também achei nos manuais:", { tipo: "manuais", itens: manuaisAchados }));
      bots.push(perguntarResolveu());
      await falar(bots);
      return;
    }
    if(manuaisAchados.length){
      await falar([bot("Achei isso nos manuais:", { tipo: "manuais", itens: manuaisAchados }), perguntarResolveu()]);
      return;
    }

    // ---- tem passo a passo mas não tem aba nem manual: responde direto ----
    if(guia){
      await falar([bot("Tenho um passo a passo para isso:")]);
      await detalhar();
      return;
    }

    // ---- não achou ----
    registrar("nao-achou", texto);
    const ops = c.papel === "instituicao"
      ? [botaoAba("instituicao", "perfil")]
      : [{ rotulo: "Falar com a secretaria", fn: () => iniciarZap(S.ultima), eco: false }];
    await falar([bot(c.papel === "instituicao"
      ? "Não achei isso nos manuais. Tente com outras palavras (ex.: “senha”, “boleto”, “contrato”) ou veja a lista completa em **Meu perfil**. Se for um erro, mande o print para o suporte técnico."
      : "Não achei isso nos manuais. Tente com outras palavras (ex.: “senha”, “boleto”, “nota”) ou, se preferir, eu deixo a mensagem pronta para a secretaria.", opcoes(ops))]);
  }

  /* ---------------- posição: arrastar o botão e a janela ---------------- */
  const POS_KEY = "edubug-pos-v1";
  const POS_PADRAO = { r: 18, b: 18 };     // distância (px) da direita e de baixo
  const celular = () => window.matchMedia("(max-width: 520px)").matches;

  function lerPos(){
    try{
      const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if(p && Number.isFinite(p.r) && Number.isFinite(p.b)) return { r: p.r, b: p.b };
    }catch(e){}
    return { ...POS_PADRAO };
  }
  function salvarPos(){ try{ localStorage.setItem(POS_KEY, JSON.stringify(S.pos)); }catch(e){} }

  /* Mantém o elemento inteiro dentro da tela (8px de folga). */
  function limitar(w, h, p){
    const W = document.documentElement.clientWidth, H = window.innerHeight, folga = 8;
    return {
      r: Math.round(Math.min(Math.max(p.r, folga), Math.max(folga, W - w - folga))),
      b: Math.round(Math.min(Math.max(p.b, folga), Math.max(folga, H - h - folga))),
    };
  }
  const medidaFab = () => { const f = $(".eb-fab"); return [f.offsetWidth || 120, f.offsetHeight || 48]; };
  const medidaFone = () => [Math.min(380, document.documentElement.clientWidth), Math.min(700, window.innerHeight - 36)];
  const posDe = (ehFab) => { const [w, h] = ehFab ? medidaFab() : medidaFone(); return limitar(w, h, S.pos); };

  function aplicarPos(){
    if(!raizDom) return;
    const fab = $(".eb-fab"), fone = $(".eb-phone");
    const pf = posDe(true);
    fab.style.right = pf.r + "px";
    fab.style.bottom = `calc(${pf.b}px + env(safe-area-inset-bottom,0px))`;
    if(celular()){ fone.style.right = ""; fone.style.bottom = ""; return; }   // celular: tela cheia
    const pp = posDe(false);
    fone.style.right = pp.r + "px";
    fone.style.bottom = `calc(${pp.b}px + env(safe-area-inset-bottom,0px))`;
  }

  function iniciarArraste(ev, alvo, ehFab){
    if(ev.button !== undefined && ev.button !== 0) return;
    if(!ehFab && (celular() || ev.target.closest("button"))) return;   // fechar/nova não arrastam
    const base = posDe(ehFab);
    const ini = { x: ev.clientX, y: ev.clientY, r: base.r, b: base.b, mexeu: false };
    const [w, h] = ehFab ? medidaFab() : medidaFone();
    const mover = (e) => {
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if(!ini.mexeu && Math.hypot(dx, dy) < 6) return;     // evita "arrastar" sem querer num clique
      ini.mexeu = true;
      alvo.classList.add("eb-arrastando");
      S.pos = limitar(w, h, { r: ini.r - dx, b: ini.b - dy });
      aplicarPos();
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      alvo.classList.remove("eb-arrastando");
      if(ini.mexeu){
        salvarPos();
        if(ehFab){ S.arrastou = true; setTimeout(() => { S.arrastou = false; }, 80); }   // não deixa o "soltar" virar clique
      }
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  function voltarAoCanto(){ S.pos = { ...POS_PADRAO }; salvarPos(); aplicarPos(); }

  /* ---------------- registro de lacunas (pra você saber o que ensinar) ----------------
     Fica só neste navegador. Pra ver: abra o console (F12) e digite  edubugLacunas()  */
  const LAC_KEY = "edubug-lacunas-v1";
  function registrar(tipo, texto){
    const c = contexto();
    const item = { tipo, texto: String(texto || "").slice(0, 200), papel: c.papel, escolaId: String(c.escolaId || ""), em: new Date().toISOString() };
    try{    // cópia local (funciona mesmo sem internet ou sem a regra do Firestore)
      const l = JSON.parse(localStorage.getItem(LAC_KEY) || "[]");
      l.push(item);
      localStorage.setItem(LAC_KEY, JSON.stringify(l.slice(-300)));
    }catch(e){}
    // cópia central (a equipe enxerga tudo junto). Se falhar, ninguém percebe.
    try{ Promise.resolve(executar({ tipo: "registrar_lacuna", dados: item })).catch(() => {}); }catch(e){}
  }
  window.edubugGuias = () => {
    console.log(`Guias revisados em ${GUIAS_REVISADOS_EM}`);
    console.table(GUIAS.map((g) => ({ titulo: g.titulo, perfis: g.papeis.join(" / "), aba: g.aba || "—" })));
  };
  window.edubugLacunas = () => {
    let l = [];
    try{ l = JSON.parse(localStorage.getItem(LAC_KEY) || "[]"); }catch(e){}
    const cont = {};
    l.forEach((x) => { const k = x.tipo + " | " + x.texto; cont[k] = (cont[k] || 0) + 1; });
    console.table(Object.entries(cont).map(([k, n]) => ({ quantas: n, tipo_e_pergunta: k })).sort((a, b) => b.quantas - a.quantas));
    return l;
  };

  function novaConversa(){
    S.msgs = []; S.fluxo = null; S.digitando = false; S.fila = Promise.resolve(); S.busca = null; S.avisouAniv = "";
    cumprimentar();
    desenhar();
  }

  /* ---------------- DOM ---------------- */
  function garantirRaiz(){
    if(raizDom) return;
    raizDom = document.createElement("div");
    raizDom.id = "edubug-root";
    raizDom.innerHTML = `
      <button type="button" class="eb-fab" data-eb="abrir" title="Clique para abrir · arraste para mover" aria-label="Abrir o Edubug, assistente do Educa+">
        <span class="eb-fab-emoji" aria-hidden="true"><span class="eb-emoji-fb">🐞</span><img class="eb-logo" alt=""></span><span class="eb-fab-texto">Edubug</span><span class="eb-badge" hidden aria-hidden="true"></span>
      </button>
      <section class="eb-phone" role="dialog" aria-label="Edubug, assistente do Educa+" hidden>
        <div class="eb-ilha" aria-hidden="true"></div>
        <div class="eb-status" aria-hidden="true"><span class="eb-hora"></span><span class="eb-sinais">●●●● 5G</span></div>
        <header class="eb-topo" title="Arraste para mover · duplo clique volta para o canto">
          <div class="eb-avatar" aria-hidden="true"><span class="eb-emoji-fb">🐞</span><img class="eb-logo" alt=""></div>
          <div class="eb-titulo"><strong>Edubug</strong><span>Assistente virtual do Educa+</span></div>
          <button type="button" class="eb-novo" data-eb="nova" title="Nova conversa" aria-label="Nova conversa">↺</button>
          <button type="button" class="eb-fechar" data-eb="fechar" aria-label="Fechar">×</button>
        </header>
        <div class="eb-msgs" aria-live="polite"></div>
        <div class="eb-aviso">Assistente automático. Em caso de dúvida, fale com a secretaria.</div>
        <div class="eb-entrada">
          <textarea class="eb-campo" rows="1" maxlength="600" placeholder="Escreva aqui…" aria-label="Mensagem para o Edubug"></textarea>
          <button type="button" class="eb-enviar" data-eb="enviar" aria-label="Enviar">↑</button>
        </div>
      </section>`;
    raizDom.querySelectorAll(".eb-logo").forEach((img) => {
      let i = 0;
      img.addEventListener("error", () => { i++; if(i < LOGOS.length) img.src = LOGOS[i]; else img.remove(); });
      img.src = LOGOS[0];
    });
    document.body.appendChild(raizDom);
    raizDom.addEventListener("click", aoClicar);
    S.pos = lerPos();
    aplicarPos();
    window.addEventListener("resize", aplicarPos);
    const fabEl = raizDom.querySelector(".eb-fab");
    fabEl.addEventListener("pointerdown", (ev) => iniciarArraste(ev, fabEl, true));
    const foneEl = raizDom.querySelector(".eb-phone");
    raizDom.querySelectorAll(".eb-topo, .eb-status").forEach((h) => h.addEventListener("pointerdown", (ev) => iniciarArraste(ev, foneEl, false)));
    raizDom.querySelector(".eb-topo").addEventListener("dblclick", (ev) => { if(!ev.target.closest("button")) voltarAoCanto(); });
    const campo = raizDom.querySelector(".eb-campo");
    campo.addEventListener("keydown", (ev) => { if(ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); enviarDoCampo(); } });
    campo.addEventListener("input", () => { campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 110) + "px"; });
    document.addEventListener("keydown", (ev) => { if(ev.key === "Escape" && S.aberto) alternar(false); });
  }

  const $ = (sel) => raizDom.querySelector(sel);

  function alternar(abrir){
    S.aberto = abrir;
    $(".eb-phone").hidden = !abrir;
    $(".eb-fab").classList.toggle("eb-oculto", abrir);
    if(abrir){
      aplicarPos();
      $(".eb-hora").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      if(S.msgs.length === 0) cumprimentar(); else lembrarAniversarios();
      desenhar();
      atualizarBadge();
      setTimeout(() => $(".eb-campo")?.focus(), 60);
    }
  }

  function cumprimentar(){
    const c = contexto();
    const primeiro = String(c.nome || "").trim().split(/\s+/)[0];
    const itens = (SUGESTOES[c.papel] || []).map((r) => ({ rotulo: r, fn: () => receber(r), eco: false }));
    S.msgs.push(bot(`Oi${primeiro ? ", " + primeiro : ""}! Eu sou o **Edubug** 🐞, o assistente do Educa+.\n\nAjudo a achar respostas nos manuais, levo você até a aba certa${c.papel === "professor" ? ", lanço a chamada de hoje (aluno por aluno), anexo observações" : ""}${c.papel === "professor" || c.papel === "instituicao" ? ", consulto as chamadas do dia" : ""}, faço contas e, se precisar, deixo a mensagem pronta para a secretaria. Por onde começamos?`, opcoes(itens)));
    lembrarAniversarios();   // equipe: avisa quem faz anos hoje / amanhã
  }

  /* ---------------- desenho ---------------- */
  function compHtml(m, i){
    const comp = m.comp;
    if(!comp) return "";
    if(comp.tipo === "botoes"){
      if(comp.fechado) return "";
      return `<div class="eb-chips">${comp.itens.map((it, k) =>
        `<button type="button" class="eb-chip ${it.estilo ? "eb-chip-" + it.estilo : ""}" data-eb="op" data-m="${i}" data-i="${k}">${escapeHtml(it.rotulo)}</button>`).join("")}</div>`;
    }
    if(comp.tipo === "manuais"){
      return `<div class="eb-manuais">${comp.itens.map((x) => `
        <a class="eb-manual" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">
          <strong>${escapeHtml(x.titulo)}</strong><span>${escapeHtml(x.descricao || "")}</span><em>Abrir manual →</em>
        </a>`).join("")}</div>`;
    }
    if(comp.tipo === "calc"){
      return `<div class="eb-cartao eb-calc">
        <div class="eb-calc-visor"><div class="eb-calc-expr">${escapeHtml(bonitaCalc(comp.expr) || "0")}</div><div class="eb-calc-res">${comp.res ? "= " + escapeHtml(comp.res) : "&nbsp;"}</div></div>
        <div class="eb-calc-teclas">${TECLAS_CALC.map(([r, cls]) => `<button type="button" class="eb-tecla${cls ? " eb-tecla-" + cls : ""}" data-eb="calc" data-m="${i}" data-k="${escapeHtml(r)}" aria-label="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}</div>
      </div>`;
    }
    if(comp.tipo === "alunos"){
      const f = S.fluxo;
      if(comp.fechado || !f || f.tipo !== "chamada") return `<div class="eb-cartao eb-cartao-fechado">${escapeHtml(comp.nota || "Lista de presença enviada.")}</div>`;
      const nomes = f.turma.alunos || [];
      const faltas = nomes.filter((n) => f.status[n] === "falta").length;
      const just = nomes.filter((n) => f.status[n] === "justificada").length;
      return `<div class="eb-cartao">
        <div class="eb-alunos">${nomes.map((n, k) => `<button type="button" class="eb-aluno eb-st-${f.status[n]}" data-eb="aluno" data-m="${i}" data-i="${k}">${STATUS_ICONE[f.status[n]]} ${escapeHtml(n)}</button>`).join("")}</div>
        <div class="eb-cartao-linha eb-suave">${nomes.length - faltas - just} presentes · ${faltas} falta(s) · ${just} justificada(s)</div>
        <div class="eb-cartao-botoes"><button type="button" class="eb-btn eb-btn-ok" data-eb="alunos-ok" data-m="${i}">Pronto, continuar</button>
          ${f.base ? "" : `<button type="button" class="eb-btn" data-eb="repetir" data-m="${i}">🔁 Usar a última aula como base</button>`}</div>
      </div>`;
    }
    if(comp.tipo === "resumo"){
      const d = comp.dados;
      const corpo = `
        <div class="eb-cartao-titulo">📋 Chamada de hoje</div>
        <div class="eb-cartao-linha"><b>${escapeHtml(d.turmaNome)}</b>${d.disciplina ? " · " + escapeHtml(d.disciplina) : ""}</div>
        <div class="eb-cartao-linha">✅ ${d.presentes} presente${d.presentes === 1 ? "" : "s"} de ${d.total}</div>
        ${d.faltas.length ? `<div class="eb-cartao-linha">❌ Falta: ${escapeHtml(d.faltas.join(", "))}</div>` : ""}
        ${d.justificadas.length ? `<div class="eb-cartao-linha">📝 Justificada: ${escapeHtml(d.justificadas.join(", "))}</div>` : ""}
        <div class="eb-cartao-linha">📚 Conteúdo: ${escapeHtml(d.conteudo)}</div>
        ${d.observacao ? `<div class="eb-cartao-linha">📝 Observação: ${escapeHtml(d.observacao)}</div>` : ""}
        ${Object.keys(d.observacoesAlunos || {}).map((n) => `<div class="eb-cartao-linha">👤 ${escapeHtml(n)}: ${escapeHtml(d.observacoesAlunos[n])}</div>`).join("")}
        ${d.substitui ? `<div class="eb-cartao-alerta">Já existe chamada de hoje para esta turma. Confirmar vai substituí-la.</div>` : ""}`;
      if(comp.fechado) return `<div class="eb-cartao eb-cartao-fechado">${corpo}</div>`;
      return `<div class="eb-cartao">${corpo}<div class="eb-cartao-botoes">
        <button type="button" class="eb-btn eb-btn-ok" data-eb="confirmar" data-m="${i}">Confirmar e salvar</button>
        <button type="button" class="eb-btn" data-eb="anexar" data-m="${i}">📎 Anexar informação</button>
        <button type="button" class="eb-btn" data-eb="refazer" data-m="${i}">Mudar quem faltou</button>
        <button type="button" class="eb-btn" data-eb="conteudo" data-m="${i}">Mudar o conteúdo</button>
        <button type="button" class="eb-btn" data-eb="cancelar" data-m="${i}">Cancelar</button></div></div>`;
    }
    if(comp.tipo === "anexo"){
      const d = comp.dados;
      const corpo = `
        <div class="eb-cartao-titulo">📎 Anexar à chamada de hoje</div>
        <div class="eb-cartao-linha"><b>${escapeHtml(d.turmaNome)}</b></div>
        <div class="eb-cartao-linha">${d.alvo ? "👤 Sobre " + escapeHtml(d.alvo) : "📝 Sobre a aula"}:</div>
        <div class="eb-cartao-linha">“${escapeHtml(d.texto)}”</div>
        <div class="eb-cartao-alerta">Entra junto da chamada já salva. O que já estava escrito é mantido.</div>`;
      if(comp.fechado) return `<div class="eb-cartao eb-cartao-fechado">${corpo}</div>`;
      return `<div class="eb-cartao">${corpo}<div class="eb-cartao-botoes">
        <button type="button" class="eb-btn eb-btn-ok" data-eb="confirmar-anexo" data-m="${i}">Confirmar e anexar</button>
        <button type="button" class="eb-btn" data-eb="cancelar" data-m="${i}">Cancelar</button></div></div>`;
    }
    return "";
  }

  function desenhar({ manter = false } = {}){
    if(!raizDom) return;
    const caixa = $(".eb-msgs");
    const antes = caixa.scrollTop;
    const partes = S.msgs.map((m, i) => {
      if(m.role === "eu") return `<div class="eb-linha eb-eu"><div class="eb-balao">${formatar(m.texto)}</div></div>`;
      return `<div class="eb-linha eb-ele"><div class="eb-balao">${formatar(m.texto)}</div>${compHtml(m, i)}</div>`;
    });
    if(S.digitando) partes.push(`<div class="eb-linha eb-ele"><div class="eb-balao eb-digitando"><i></i><i></i><i></i></div></div>`);
    caixa.innerHTML = partes.join("");
    caixa.scrollTop = manter ? antes : caixa.scrollHeight;
  }

  /* ---------------- eventos ---------------- */
  function enviarDoCampo(){
    const campo = $(".eb-campo");
    const t = campo.value;
    campo.value = ""; campo.style.height = "auto";
    receber(t);
  }

  function aoClicar(ev){
    const el = ev.target.closest("[data-eb]");
    if(!el) return;
    const tipo = el.dataset.eb;
    if(tipo === "abrir"){ if(S.arrastou){ S.arrastou = false; return; } return alternar(true); }
    if(tipo === "nova") return novaConversa();
    if(tipo === "fechar") return alternar(false);
    if(tipo === "enviar") return enviarDoCampo();

    const m = S.msgs[Number(el.dataset.m)];
    const comp = m?.comp;
    if(!comp) return;

    if(tipo === "calc"){ calcTecla(comp, el.dataset.k); desenhar({ manter: true }); return; }
    if(tipo === "op"){
      const it = comp.itens[Number(el.dataset.i)];
      if(!it) return;
      comp.fechado = true;
      if(it.eco !== false) S.msgs.push({ role: "eu", texto: it.rotulo });
      desenhar();
      it.fn();           // síncrono: precisa do clique do usuário pra abrir o WhatsApp
      return;
    }
    const f = S.fluxo;
    if(tipo === "aluno" && f?.tipo === "chamada" && !comp.fechado){
      const nome = (f.turma.alunos || [])[Number(el.dataset.i)];
      if(nome){ f.status[nome] = PROXIMO[f.status[nome]]; desenhar({ manter: true }); }
      return;
    }
    if(tipo === "alunos-ok" && !comp.fechado) return aposAlunos(comp);
    if(tipo === "repetir" && !comp.fechado) return void repetirUltima(comp);
    if(tipo === "anexar" && !comp.fechado && f?.tipo === "chamada"){ comp.fechado = true; perguntarAnexos(); return; }
    if(tipo === "conteudo" && !comp.fechado && f?.tipo === "chamada"){ comp.fechado = true; f.conteudo = ""; perguntarConteudo(); return; }
    if(tipo === "confirmar-anexo" && !comp.fechado) return confirmarAnexo(comp);
    if(tipo === "confirmar" && !comp.fechado) return confirmarChamada(comp);
    if(tipo === "refazer" && !comp.fechado){
      comp.fechado = true;
      if(f?.tipo === "chamada"){ f.espera = ""; falar([bot("Sem problema. Ajuste quem faltou:", { tipo: "alunos", fechado: false })], { rapido: true }); }
      return;
    }
    if(tipo === "cancelar" && !comp.fechado){
      comp.fechado = true; S.fluxo = null;
      falar([bot("Cancelado. Nada foi salvo.")], { rapido: true });
    }
  }

  /* ---------------- ciclo de vida ---------------- */
  function limpar(){
    S.msgs = []; S.digitando = false; S.fluxo = null; S.aberto = false; S.fila = Promise.resolve(); S.avisouAniv = ""; S.parabenizados = new Set();
    if(raizDom){ $(".eb-phone").hidden = true; $(".eb-fab").classList.remove("eb-oculto"); }
  }

  /* Chamado no fim de cada render() do script.js. */
  function sincronizar(){
    const logado = TELAS.includes(state.screen) && state.authUser;
    if(!logado){
      if(raizDom) raizDom.style.display = "none";
      if(S.uid){ S.uid = ""; limpar(); }
      return;
    }
    garantirRaiz();
    raizDom.style.display = "";
    if(S.uid !== state.authUser.uid){ limpar(); S.uid = state.authUser.uid; }
    atualizarBadge();   // sinalzinho 🎂 (equipe): confere a cada atualização da tela
  }

  function resetar(){ limpar(); }

  return { sincronizar, resetar };
}
