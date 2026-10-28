import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * A size on a run of text, written as the span the rest of the system reads.
 *
 * Written here rather than pulled in: TipTap's own text-style extension is a
 * general attribute carrier, and all that is wanted is the one mark this
 * editor's output already has a spelling for — `<span style="font-size: Npx">`,
 * in the frame's pixels. Thirty lines against a dependency, and the thirty
 * lines are the ones that decide what gets stored.
 *
 * No clamp on the number. A size past the frame is something somebody asked
 * for, and the preview shows exactly what it does.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /** Sets the size of the selection, in frame pixels. */
      setFontSize: (size: number) => ReturnType;
      /** Gives the selection back to whatever size surrounds it. */
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const found = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(element.getAttribute('style') ?? '');
          return found ? Math.round(Number(found[1])) : null;
        },
        renderHTML: (attributes) =>
          attributes.size ? { style: `font-size: ${attributes.size}px` } : {}
      }
    };
  },

  parseHTML() {
    return [{ tag: 'span[style*="font-size"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size: number) =>
        ({ commands }) =>
          commands.setMark(this.name, { size }),
      unsetFontSize:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name)
    };
  }
});
