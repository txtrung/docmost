import type { Editor } from "@tiptap/core";

export function insertPlaneRoadmap(editor: Editor, insertAt: number, mermaid: string) {
  const at = Math.min(insertAt, editor.state.doc.content.size);
  return editor
    .chain()
    .focus()
    .insertContentAt(at, {
      type: "codeBlock",
      attrs: { language: "mermaid" },
      content: [{ type: "text", text: mermaid }],
    })
    .run();
}
