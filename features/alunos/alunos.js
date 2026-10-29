export function criarAlunos({ state, render, ICONS, escapeHtml }) {
  function html() {
    return `
      <section class="feature-empty-state">
        <div class="feature-empty-icon">${ICONS.users2}</div>
        <h3>Alunos</h3>
        <p>Este módulo ainda está em migração para a estrutura por feature. A lógica da aba será movida para esta pasta.</p>
      </section>
    `;
  }

  return {
    nome: "Alunos",
    html,
    render() {
      if (typeof render === "function") render();
      return html();
    },
  };
}
