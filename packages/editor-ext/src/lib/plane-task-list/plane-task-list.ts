import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface PlaneTaskListOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface PlaneTaskListAttributes {
  projectId?: string;
  filters?: string;
  columns?: string;
  sort?: string;
  limit?: number;
  displayMode?: "table" | "card" | "count";
  filterMode?: "form" | "query";
  query?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    planeTaskList: {
      insertPlaneTaskList: (attributes?: PlaneTaskListAttributes) => ReturnType;
    };
  }
}

export const PlaneTaskList = Node.create<PlaneTaskListOptions>({
  name: "planeTaskList",

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
      projectId: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-project-id") || "",
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-project-id": attributes.projectId || "",
        }),
      },
      filters: {
        default: "{}",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-filters") || "{}",
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-filters": attributes.filters || "{}",
        }),
      },
      columns: {
        default: '["title","state","assignees","priority","due","labels"]',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-columns") ||
          '["title","state","assignees","priority","due","labels"]',
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-columns":
            attributes.columns ||
            '["title","state","assignees","priority","due","labels"]',
        }),
      },
      sort: {
        default: "updated:desc",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-sort") || "updated:desc",
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-sort": attributes.sort || "updated:desc",
        }),
      },
      limit: {
        default: 50,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute("data-limit"));
          return Number.isFinite(value) && value > 0 ? value : 50;
        },
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-limit": String(attributes.limit || 50),
        }),
      },
      filterMode: {
        default: "form",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-filter-mode") === "query" ? "query" : "form",
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-filter-mode": attributes.filterMode === "query" ? "query" : "form",
        }),
      },
      query: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-query") || "",
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-query": attributes.query || "",
        }),
      },
      displayMode: {
        default: "table",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-display");
          return value === "card" || value === "count" ? value : "table";
        },
        renderHTML: (attributes: PlaneTaskListAttributes) => ({
          "data-display":
            attributes.displayMode === "card" || attributes.displayMode === "count"
              ? attributes.displayMode
              : "table",
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
      insertPlaneTaskList:
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
