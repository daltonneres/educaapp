export function criarConteudos({ state, render, ICONS, escapeHtml }) {
  function html() {
    return `
      <section class="feature-empty-state">
        <div class="feature-empty-icon">${ICONS.book}</div>
        <h3>Conteúdos</h3>
        <p>O módulo de conteúdos do semestre está em migração para a pasta de ensino.</p>
      </section>
    `;
  }

  return {
    nome: "Conteúdos",
    html,
    render() {
      if (typeof render === "function") render();
      return html();
    },
  };
}
