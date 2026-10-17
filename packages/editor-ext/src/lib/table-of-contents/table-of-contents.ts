import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

function levelAttr(value: unknown, fallback: number): number {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 6) return fallback;
  return level;
}

export interface TableOfContentsBlockOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export type TocStyle = "list" | "flat";

export interface TableOfContentsBlockAttributes {
  minLevel?: number;
  maxLevel?: number;
  style?: TocStyle;
  numbered?: boolean;
  sticky?: boolean;
  includePattern?: string;
  excludePattern?: string;
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
      minLevel: {
        default: 1,
        parseHTML: (element: HTMLElement) =>
          levelAttr(element.getAttribute("data-min-level"), 1),
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-min-level": String(levelAttr(attributes.minLevel, 1)),
        }),
      },
      maxLevel: {
        default: 3,
        parseHTML: (element: HTMLElement) =>
          levelAttr(element.getAttribute("data-max-level"), 3),
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-max-level": String(levelAttr(attributes.maxLevel, 3)),
        }),
      },
      style: {
        default: "list",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-style") === "flat" ? "flat" : "list",
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-style": attributes.style === "flat" ? "flat" : "list",
        }),
      },
      numbered: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-numbered") === "true",
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-numbered": attributes.numbered ? "true" : "false",
        }),
      },
      includePattern: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-include") || "",
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-include": attributes.includePattern || "",
        }),
      },
      excludePattern: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-exclude") || "",
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-exclude": attributes.excludePattern || "",
        }),
      },
      sticky: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-sticky") === "true",
        renderHTML: (attributes: TableOfContentsBlockAttributes) => ({
          "data-sticky": attributes.sticky ? "true" : "false",
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
