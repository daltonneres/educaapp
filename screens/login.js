/* Estrutura exclusiva da tela de login. */
function renderLogin(){
  return `
  <div class="screen sign-in-screen">
    <div class="login-box modern-login-box">
      <form id="login-form" class="login-card modern-login-card" novalidate>
        <div class="login-logo-wrap">
          <img class="login-logo" src="imgs/logoeduca.jpeg" alt="Logo Educa+" />
        </div>
        <div class="login-fields">
          <label class="sr-only" for="login-identifier">E-mail ou telefone</label>
          <input id="login-identifier" class="field-input modern-field-input" type="text" autocomplete="username" inputmode="email" placeholder="E-mail ou telefone" />
          <label class="sr-only" for="login-password">Senha</label>
          <input id="login-password" class="field-input modern-field-input" type="password" autocomplete="current-password" placeholder="Senha" />
          <p id="login-error" class="login-error" aria-live="polite"></p>
        </div>
        <div class="login-divider"></div>
        <button type="submit" class="btn-gold modern-sign-in-btn">Entrar</button>
        <div class="forgot-row modern-forgot-row">
          <button type="button" class="link-btn" data-action="forgot-password">Esqueci minha senha</button>
        </div>
        <p class="login-foot modern-login-foot">Precisa de acesso? <button type="button" class="inline-link" data-action="contact-secretaria">Fale com a secretaria.</button></p>
      </form>
    </div>
  </div>`;
}
