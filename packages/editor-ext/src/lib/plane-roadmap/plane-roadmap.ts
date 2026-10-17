import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface PlaneRoadmapOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface PlaneRoadmapAttributes {
  projectId?: string;
  grouping?: "cycles" | "modules" | "workItems";
  data?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    planeRoadmap: {
      insertPlaneRoadmap: (attributes?: PlaneRoadmapAttributes) => ReturnType;
    };
  }
}

export const PlaneRoadmap = Node.create<PlaneRoadmapOptions>({
  name: "planeRoadmap",

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
        renderHTML: (attributes: PlaneRoadmapAttributes) => ({
          "data-project-id": attributes.projectId || "",
        }),
      },
      grouping: {
        default: "modules",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-grouping");
          return value === "cycles" || value === "workItems" ? value : "modules";
        },
        renderHTML: (attributes: PlaneRoadmapAttributes) => ({
          "data-grouping":
            attributes.grouping === "cycles" || attributes.grouping === "workItems"
              ? attributes.grouping
              : "modules",
        }),
      },
      data: {
        default: "{}",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-model") || "{}",
        renderHTML: (attributes: PlaneRoadmapAttributes) => ({
          "data-model": attributes.data || "{}",
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
      insertPlaneRoadmap:
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
