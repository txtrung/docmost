import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface TableOfContentsBlockOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface TableOfContentsBlockAttributes {
  numbered?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: (
        attributes?: TableOfContentsBlockAttributes,
      ) => ReturnType;
    };
  }
}

export const TableOfContentsBlock = Node.create<TableOfContentsBlockOptions>({
  name: "tableOfContents",

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      numbered: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-numbered") === "true",
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-numbered": attributes.numbered ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      insertTableOfContents:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
    };
  },

  addNodeView() {
    if (!this.options.view) return null;
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },
});
