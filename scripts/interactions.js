/* Navegação, validação de formulário e ações da interface. */
function bindEvents(){
  const loginForm = document.getElementById("login-form");
  if(loginForm){
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const identifier = document.getElementById("login-identifier").value.trim();
      const password = document.getElementById("login-password").value;
      const error = document.getElementById("login-error");
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      const phoneDigits = identifier.replace(/\D/g, "");
      const isPhone = phoneDigits.length === 10 || phoneDigits.length === 11;

      if(!identifier || !password){
        error.textContent = "Informe seu e-mail ou telefone e sua senha para continuar.";
        return;
      }
      if(!isEmail && !isPhone){
        error.textContent = "Informe um e-mail ou telefone válido.";
        return;
      }
      state.screen = "role";
      render();
    });
  }

  app.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      const action = element.getAttribute("data-action");
      if(action === "back-to-login"){ state.screen = "login"; render(); }
      else if(action === "back-to-role"){ state.screen = "role"; render(); }
      else if(action === "go-aluno"){ state.screen = "aluno"; render(); }
      else if(action === "go-familia"){ state.screen = "familia"; render(); }
      else if(action === "go-escola"){ state.screen = "escola"; render(); }
      else if(action === "go-professor"){ state.screen = "professor"; render(); }
      else if(action === "select-escola"){ state.escolaId = element.getAttribute("data-escola"); state.screen = "instituicao"; render(); }
      else if(action === "logout"){ state.screen = "login"; state.escolaId = null; state.mobileMenuOpen = false; render(); }
      else if(action === "switch-student"){ state.familiaStudentId = element.getAttribute("data-id"); render(); }
      else if(action === "set-aluno-tab"){ state.alunoTab = element.getAttribute("data-key"); state.mobileMenuOpen = false; render(); }
      else if(action === "set-familia-tab"){ state.familiaTab = element.getAttribute("data-key"); state.mobileMenuOpen = false; render(); }
      else if(action === "set-inst-tab"){ state.instTab = element.getAttribute("data-key"); state.mobileMenuOpen = false; render(); }
      else if(action === "set-professor-tab"){ state.professorTab = element.getAttribute("data-key"); state.mobileMenuOpen = false; render(); }
      else if(action === "toggle-mobile-menu"){ state.mobileMenuOpen = !state.mobileMenuOpen; render(); }
      else if(action === "close-mobile-menu"){ state.mobileMenuOpen = false; render(); }
      else if(action === "set-professor-class"){
        state.professorTurmaId = element.getAttribute("data-id");
        state.professorRegistroSalvo = false;
        render();
      }
      else if(action === "create-user"){
        const name = document.getElementById("new-user-name").value.trim();
        const role = document.getElementById("new-user-role").value;
        state.instituicaoMensagem = name ? `${role} ${name} criado com sucesso.` : "Informe o nome para criar o usuário.";
        render();
      }
      else if(action === "generate-contract"){
        state.instituicaoMensagem = "Contrato de matrícula gerado para revisão.";
        render();
      }
      else if(action === "manage-plan"){
        state.instituicaoMensagem = "Gerenciamento de planos aberto (demonstração).";
        render();
      }
      else if(action === "generate-boleto"){
        state.instituicaoMensagem = "Boleto gerado para envio ao responsável.";
        render();
      }
      else if(action === "set-presence"){
        const key = `${state.professorTurmaId}-${element.getAttribute("data-student")}`;
        state.professorPresencas[key] = element.getAttribute("data-status");
        state.professorRegistroSalvo = false;
        render();
      }
      else if(action === "save-lesson-content"){
        state.professorConteudo = document.getElementById("lesson-content").value.trim();
        state.professorRegistroSalvo = true;
        render();
      }
      else if(action === "save-grades"){
        state.professorNotasSalvas = true;
        render();
      }
      else if(action === "send-notice"){
        const audience = document.getElementById("notice-audience").value;
        const recipient = document.getElementById("notice-recipient").value.trim();
        state.professorAvisoEnviado = `Recado enviado para ${recipient || audience}.`;
        render();
      }
      else if(action === "forgot-password"){
        document.getElementById("login-error").textContent = "Para recuperar o acesso, entre em contato com a secretaria da unidade.";
      }
      else if(action === "contact-secretaria"){
        document.getElementById("login-error").textContent = "A secretaria da unidade poderá criar ou recuperar seu acesso.";
      }
    });
  });

  const searchInput = document.getElementById("alunos-busca");
  if(searchInput){
    searchInput.addEventListener("input", (event) => {
      state.alunosBusca = event.target.value;
      const caret = event.target.selectionStart;
      render();
      const nextInput = document.getElementById("alunos-busca");
      if(nextInput){ nextInput.focus(); nextInput.setSelectionRange(caret, caret); }
    });
  }

  app.querySelectorAll("[data-observation]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.professorObservacoes[input.dataset.observation] = event.target.value;
    });
  });

  app.querySelectorAll("[data-grade]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.professorNotas[input.dataset.grade] = event.target.value;
    });
  });
}

render();
