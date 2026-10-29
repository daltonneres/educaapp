export function criarFamilia({ state, render, ICONS, escapeHtml }) {
  function html() {
    return `
      <section class="feature-empty-state">
        <div class="feature-empty-icon">${ICONS.user}</div>
        <h3>Família</h3>
        <p>Este módulo ainda está sendo reorganizado. A parte de responsáveis, alunos ligados e fichas da família ficará aqui.</p>
      </section>
    `;
  }

  return {
    nome: "Família",
    html,
    render() {
      if (typeof render === "function") render();
      return html();
    },
  };
}
