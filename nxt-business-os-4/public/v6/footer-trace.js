// Pointer light is an enhancement. The idle trace and pause switch work without JavaScript.
(() => {
  const pointers = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  function update(event) {
    if (!pointers.matches) return;
    const mark = event.target.closest?.('.nxt-footer-signature');
    if (!mark || mark.querySelector('.nxt-trace-toggle').checked) return;
    const svg = mark.querySelector('svg');
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const gradient = svg.querySelector('radialGradient');
    gradient.setAttribute('cx', point.x);
    gradient.setAttribute('cy', point.y);
    mark.classList.add('has-lens');
  }
  document.addEventListener('pointermove', update, {passive:true});
  document.addEventListener('pointerout', event => {
    const mark = event.target.closest?.('.nxt-footer-signature');
    if (mark && !mark.contains(event.relatedTarget)) mark.classList.remove('has-lens');
  });
})();
