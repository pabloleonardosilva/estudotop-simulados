"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  ChevronDown,
  FilePlus2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function looksLikeHtml(value: string) {
  return /<[a-z][\s\S]*>/i.test(value);
}

function toDisplayHtml(value: string) {
  if (!value) return "";
  if (looksLikeHtml(value)) return value;
  return escapeHtml(value).replace(/\n/g, "<br>");
}

const NOTE_BLOCK_ATTR = "data-note-block";
const NOTE_LABEL_ATTR = "data-note-label";
const NOTE_DIVIDER_ATTR = "data-note-divider";
const NOTE_DELETE_ATTR = "data-note-delete";

function noteLabelHtml(number: number) {
  return (
    `<button type="button" ${NOTE_DELETE_ATTR}="true" contenteditable="false" title="Excluir nota" aria-label="Excluir Nota ${number}" ` +
    `onmousedown="event.preventDefault()" ` +
    `style="float:right;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;border:1px solid #FCA5A5;background:#FEF2F2;color:#DC2626;font-size:12px;line-height:1;cursor:pointer;">✕</button>` +
    `<strong ${NOTE_LABEL_ATTR}="true" contenteditable="false" style="color:#07111F;">Nota ${number}: </strong>`
  );
}

/**
 * Recalcula os rótulos "Nota N:", os divisores e os botões de excluir entre
 * notas a partir do conteúdo bruto do editor. Cada bloco separado por linha em
 * branco vira uma nota. Rodar só no blur/carregamento (nunca a cada tecla,
 * senão quebra o cursor) — ao reprocessar um conteúdo já rotulado antes, os
 * wrappers antigos são "abertos" com uma quebra dupla no lugar, preservando a
 * fronteira entre notas para a nova divisão.
 */
function relabelNotesHtml(html: string): string {
  if (typeof document === "undefined") return html;

  const clean = String(html || "").trim();
  if (!clean) return "";

  const temp = document.createElement("div");
  temp.innerHTML = clean;

  temp.querySelectorAll(`[${NOTE_LABEL_ATTR}], [${NOTE_DIVIDER_ATTR}], [${NOTE_DELETE_ATTR}]`).forEach((el) => el.remove());

  temp.querySelectorAll(`[${NOTE_BLOCK_ATTR}]`).forEach((el) => {
    el.appendChild(document.createElement("br"));
    el.appendChild(document.createElement("br"));
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  const blocks = temp.innerHTML
    .split(/(?:<div>\s*<br\s*\/?>\s*<\/div>\s*)+|(?:<br\s*\/?>\s*){2,}/gi)
    .map((block) => block.trim())
    .filter((block) => block.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().length > 0);

  if (!blocks.length) return "";

  return blocks
    .map((block, index) => {
      const divider =
        index === 0
          ? ""
          : `<hr ${NOTE_DIVIDER_ATTR}="true" style="border:none;border-top:1px dashed #D9E1EC;margin:18px 0;" />`;
      return `<div ${NOTE_BLOCK_ATTR}="true">${divider}${noteLabelHtml(index + 1)}${block}</div>`;
    })
    .join("");
}

export default function StudentNotebookEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const editor = ref.current;
    if (!editor || isFocusedRef.current) return;

    const normalized = relabelNotesHtml(toDisplayHtml(value));
    if (editor.innerHTML !== normalized) {
      editor.innerHTML = normalized;
    }
  }, [value]);

  function focusEditor() {
    ref.current?.focus();
  }

  function refreshHistoryState() {
    try {
      setCanUndo(document.queryCommandEnabled("undo"));
      setCanRedo(document.queryCommandEnabled("redo"));
    } catch {
      // queryCommandEnabled pode não ser suportado em algum navegador; ignora.
    }
  }

  function emitChange() {
    const editor = ref.current;
    if (!editor) return;
    onChange(editor.innerHTML);
    refreshHistoryState();
  }

  function applyCommand(command: string, argument?: string) {
    focusEditor();
    document.execCommand(command, false, argument);
    emitChange();
  }

  function insertChecklistItem() {
    focusEditor();
    document.execCommand(
      "insertHTML",
      false,
      '<div style="display:flex;align-items:flex-start;gap:8px;margin:4px 0;"><input type="checkbox" contenteditable="false" style="margin-top:6px;width:16px;height:16px;accent-color:#FF6A00;" />&nbsp;</div>',
    );
    emitChange();
  }

  function insertLink() {
    const url = window.prompt("Endereço do link:");
    if (!url) return;
    applyCommand("createLink", url);
  }

  function addNewNote() {
    const editor = ref.current;
    if (!editor) return;

    const relabeled = relabelNotesHtml(editor.innerHTML);
    const temp = document.createElement("div");
    temp.innerHTML = relabeled;
    const existingCount = temp.querySelectorAll(`[${NOTE_BLOCK_ATTR}]`).length;
    const nextNumber = existingCount + 1;

    const divider =
      existingCount === 0
        ? ""
        : `<hr ${NOTE_DIVIDER_ATTR}="true" style="border:none;border-top:1px dashed #D9E1EC;margin:18px 0;" />`;
    const marker = `note-new-${Date.now()}`;
    const newBlockHtml = `<div ${NOTE_BLOCK_ATTR}="true" data-note-marker="${marker}">${divider}${noteLabelHtml(nextNumber)}<br></div>`;

    editor.innerHTML = relabeled + newBlockHtml;
    onChange(editor.innerHTML);

    focusEditor();
    const newBlock = editor.querySelector(`[data-note-marker="${marker}"]`);
    if (newBlock) {
      newBlock.removeAttribute("data-note-marker");
      const range = document.createRange();
      range.selectNodeContents(newBlock);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    refreshHistoryState();
  }

  function handleEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      if (target.checked) target.setAttribute("checked", "checked");
      else target.removeAttribute("checked");
      emitChange();
      return;
    }

    const deleteButton = target.closest(`[${NOTE_DELETE_ATTR}]`);
    if (deleteButton) {
      const block = deleteButton.closest(`[${NOTE_BLOCK_ATTR}]`);
      const editor = ref.current;
      if (block && editor) {
        block.remove();
        const relabeled = relabelNotesHtml(editor.innerHTML);
        editor.innerHTML = relabeled;
        onChange(relabeled);
        refreshHistoryState();
      }
    }
  }

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[999] flex flex-col bg-white p-6"
          : "overflow-hidden rounded-[14px] border border-[#E4E9F0] bg-white"
      }
    >
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#E6EAF0] px-6">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={addNewNote}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#FFD7B0] bg-[#FFF7F1] px-3 text-sm font-bold text-[#F45100] transition hover:bg-[#FFEDE0]"
          >
            <FilePlus2 size={16} /> Nova nota
          </button>

          <ToolbarSeparator />

          <ToolbarButton title="Negrito" ariaLabel="Negrito" onClick={() => applyCommand("bold")}>
            <Bold size={18} />
          </ToolbarButton>
          <ToolbarButton title="Itálico" ariaLabel="Itálico" onClick={() => applyCommand("italic")}>
            <Italic size={18} />
          </ToolbarButton>
          <ToolbarButton title="Sublinhado" ariaLabel="Sublinhado" onClick={() => applyCommand("underline")}>
            <Underline size={18} />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton title="Lista com marcadores" ariaLabel="Lista com marcadores" onClick={() => applyCommand("insertUnorderedList")}>
            <List size={18} />
          </ToolbarButton>
          <ToolbarButton title="Lista numerada" ariaLabel="Lista numerada" onClick={() => applyCommand("insertOrderedList")}>
            <ListOrdered size={18} />
          </ToolbarButton>
          <ToolbarButton title="Checklist" ariaLabel="Inserir checklist" onClick={insertChecklistItem}>
            <ListChecks size={18} />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton title="Inserir link" ariaLabel="Inserir link" onClick={insertLink}>
            <Link2 size={18} />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton title="Desfazer" ariaLabel="Desfazer" onClick={() => applyCommand("undo")} disabled={!canUndo}>
            <Undo2 size={18} />
          </ToolbarButton>
          <ToolbarButton title="Refazer" ariaLabel="Refazer" onClick={() => applyCommand("redo")} disabled={!canRedo}>
            <Redo2 size={18} />
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Opções de texto"
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#1E293B] transition hover:bg-[#F4F6FA]"
          >
            Aa <ChevronDown size={14} />
          </button>

          <ToolbarButton
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            ariaLabel={fullscreen ? "Sair da tela cheia" : "Expandir editor em tela cheia"}
            onClick={() => setFullscreen((current) => !current)}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </ToolbarButton>
        </div>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;

          const editor = ref.current;
          if (!editor) return;

          const relabeled = relabelNotesHtml(editor.innerHTML);
          if (editor.innerHTML !== relabeled) {
            editor.innerHTML = relabeled;
          }
          onChange(relabeled);
          refreshHistoryState();
        }}
        onInput={emitChange}
        onClick={handleEditorClick}
        onKeyUp={refreshHistoryState}
        className={`${
          fullscreen ? "flex-1" : "min-h-[300px]"
        } overflow-auto whitespace-pre-wrap break-words px-9 py-7 text-[18px] leading-[1.62] text-[#111827] outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400`}
      />
    </div>
  );
}

function ToolbarButton({
  title,
  ariaLabel,
  onClick,
  disabled,
  children,
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#1E293B] transition hover:bg-[#F4F6FA] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[#E6EAF0]" />;
}
