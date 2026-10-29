export function criarFinanceiro({ state, render, ICONS, escapeHtml }) {
  function html() {
    return `
      <section class="feature-empty-state">
        <div class="feature-empty-icon">${ICONS.wallet}</div>
        <h3>Financeiro</h3>
        <p>Esta área está pronta para receber o módulo de cobranças, boletos, contratos e financeiro da escola.</p>
      </section>
    `;
  }

  return {
    nome: "Financeiro",
    html,
    render() {
      if (typeof render === "function") render();
      return html();
    },
  };
}
