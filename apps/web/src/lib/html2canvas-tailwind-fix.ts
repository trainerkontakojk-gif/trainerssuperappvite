const COMPUTED_PROPS: readonly string[] = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-self',
  'justify-content',
  'justify-self',
  'gap',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-column',
  'grid-row',
  'grid-column-end',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  'white-space',
  'text-overflow',
  'word-break',
  'color',
  'background-color',
  'background',
  'box-shadow',
  'outline',
  'overflow',
  'overflow-x',
  'overflow-y',
  'opacity',
  'visibility',
  'box-sizing',
  'object-fit',
  'object-position',
  'aspect-ratio',
  'vertical-align',
  'fill',
  'stroke',
  'stroke-width',
  'fill-opacity',
  'stroke-opacity',
  'stop-color',
];

const OKLCH = /oklch\([^)]+\)/gi;

function replaceOklch(value: string, fallback: string): string {
  if (!value || !/oklch/i.test(value)) return value;
  return value.replace(OKLCH, fallback);
}

export function sanitizeOklchInSubtree(root: Element): void {
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of nodes) {
    el.removeAttribute('class');

    if (el instanceof HTMLElement && el.style?.length) {
      const css = el.style.cssText;
      if (/oklch/i.test(css)) {
        el.style.cssText = replaceOklch(css, 'rgb(100, 116, 139)');
      }
    }

    for (const attr of ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color'] as const) {
      const v = el.getAttribute(attr);
      if (v && /oklch/i.test(v)) {
        el.setAttribute(attr, replaceOklch(v, attr === 'fill' || attr === 'stroke' ? '#64748b' : 'rgb(15, 23, 42)'));
      }
    }
  }
}

export function inlineComputedStylesForCapture(orig: Element, clone: Element): void {
  if (orig instanceof HTMLElement && clone instanceof HTMLElement) {
    const cs = window.getComputedStyle(orig);
    COMPUTED_PROPS.forEach((p) => {
      let v = cs.getPropertyValue(p);
      if (v && /oklch/i.test(v)) v = replaceOklch(v, p.includes('color') || p === 'fill' || p === 'stroke' ? 'rgb(15, 23, 42)' : 'transparent');
      if (v) clone.style.setProperty(p, v, 'important');
    });
    const bg = cs.getPropertyValue('background-color');
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      clone.style.setProperty('background-color', 'transparent', 'important');
    }
  }

  if (orig instanceof SVGElement && clone instanceof SVGElement) {
    const cs = window.getComputedStyle(orig);
    for (const p of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity'] as const) {
      let v = cs.getPropertyValue(p);
      if (v && /oklch/i.test(v)) v = replaceOklch(v, '#64748b');
      if (v) clone.setAttribute(p, v.trim());
    }
  }

  const origChildren = Array.from(orig.children);
  const cloneChildren = Array.from(clone.children);
  origChildren.forEach((child, i) => {
    if (cloneChildren[i]) inlineComputedStylesForCapture(child, cloneChildren[i]!);
  });
}

export function prepareHtml2CanvasClone(
  clonedDoc: Document,
  clonedRoot: HTMLElement,
  originalRoot: HTMLElement
): void {
  inlineComputedStylesForCapture(originalRoot, clonedRoot);
  clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => n.remove());
  sanitizeOklchInSubtree(clonedRoot);

  const html = clonedDoc.documentElement;
  html.style.colorScheme = 'light';
  html.style.setProperty('color', '#0f172a', 'important');
  html.style.setProperty('background-color', '#ffffff', 'important');
}
