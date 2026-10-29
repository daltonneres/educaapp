export function criarRelatorios({ state, render, ICONS, escapeHtml }) {
  function html() {
    return `
      <section class="feature-empty-state">
        <div class="feature-empty-icon">${ICONS.chart}</div>
        <h3>Relatórios</h3>
        <p>Este módulo ainda está sendo reorganizado em feature específica para relatórios, presença, notas e acompanhamento.</p>
      </section>
    `;
  }

  return {
    nome: "Relatórios",
    html,
    render() {
      if (typeof render === "function") render();
      return html();
    },
  };
}
