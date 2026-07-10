"use client";

import { ClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Code2, Eraser, Highlighter, Italic, Underline } from "lucide-react";
import { richTextToPlainText } from "@/lib/utils/rich-text";

const IMAGE_MARKER_REGEX = /(imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o|\b[\w][\w\s.-]*\.(?:png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?)/gi;

function highlightImageMarkersInHtml(html: string) {
  if (!html || typeof document === "undefined") return html;

  const root = document.createElement("div");
  root.innerHTML = html;

  root.querySelectorAll("img").forEach((image) => {
    image.setAttribute("data-image-highlight", "true");
    const existingStyle = image.getAttribute("style") || "";
    if (!/outline\s*:/i.test(existingStyle)) {
      image.setAttribute(
        "style",
        `${existingStyle};box-shadow:0 0 0 4px rgba(250,204,21,.45);outline:2px solid rgba(250,204,21,.9);background:rgba(254,240,138,.28);`.replace(/^;/, ""),
      );
    }
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest('mark, script, style, textarea, code')) {
      if (IMAGE_MARKER_REGEX.test(textNode.nodeValue || "")) textNodes.push(textNode);
      IMAGE_MARKER_REGEX.lastIndex = 0;
    }
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue || "";
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    value.replace(IMAGE_MARKER_REGEX, (match, _group, offset) => {
      if (offset > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, offset)));
      const span = document.createElement("span");
      span.setAttribute("data-image-marker", "true");
      span.style.cssText = "font-weight:700;color:#dc2626;font-size:1.3em;background:none;display:inline-block;line-height:1.4;";
      span.textContent = match;
      fragment.appendChild(span);
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return root.innerHTML;
}

function normalizeRichTextValue(input: string) {
  if (!input) return "";
  let output = input;

  if (
    output.includes("&lt;") ||
    output.includes("&gt;") ||
    output.includes("&amp;")
  ) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = output;
    output = textarea.value;
  }

  const normalized = output
    // Normaliza marks de destaque (highlight amarelo)
    .replace(
      /<mark([^>]*)>/gi,
      '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded font-semibold text-slate-950">',
    )
    // Converte spans com background amarelo (do toolbar de highlight) para <mark>,
    // capturando o conteúdo completo para fechar corretamente — NÃO afeta outros <span>
    .replace(
      /<span([^>]*background-color:\s*(?:rgb\(254,\s*240,\s*138\)|#fef08a|yellow)[^>]*)>([\s\S]*?)<\/span>/gi,
      '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded font-semibold text-slate-950">$2</mark>',
    );

  return highlightImageMarkersInHtml(normalized);
}

function sanitizeHtml(input: string) {
  return normalizeRichTextValue(input)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\s(?:href|src)=["']javascript:[^"']*["']/gi, "");
}


function createInlineImageHtml(src: string) {
  return `<img src="${src}" alt="Imagem colada" style="display:inline-block;max-width:100%;height:auto;resize:both;overflow:auto;vertical-align:middle;cursor:nwse-resize;border-radius:10px;" data-pasted-image="true" draggable="false" />`;
}

function insertHtmlAtCursor(html: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;
  const lastNode = fragment.lastChild;

  range.insertNode(fragment);

  if (lastNode) {
    const nextRange = document.createRange();
    nextRange.setStartAfter(lastNode);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  }

  return true;
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

function findHighlightElement(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const nodes = [selection.anchorNode, selection.focusNode];

  for (const node of nodes) {
    const element = node instanceof HTMLElement ? node : node?.parentElement;
    const highlight = element?.closest(
      'mark, [data-highlight="true"], span[style*="background-color"]',
    );

    if (highlight && editor.contains(highlight)) return highlight as HTMLElement;
  }

  return null;
}

export default function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  disabled = false,
  minRows = 3,
  compact = false,
  dark = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  minRows?: number;
  compact?: boolean;
  dark?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlValue, setHtmlValue] = useState(value || "");
  const resizingImageRef = useRef<{
    image: HTMLImageElement;
    startX: number;
    startWidth: number;
  } | null>(null);
  const pendingHtmlRef = useRef<string | null>(null);

  useEffect(() => {
    const editor = ref.current;
    if (!editor || isFocusedRef.current || htmlMode) return;

    const content = pendingHtmlRef.current ?? value ?? "";
    pendingHtmlRef.current = null;

    const normalizedValue = normalizeRichTextValue(content);
    if (editor.innerHTML !== normalizedValue) {
      editor.innerHTML = normalizedValue;
    }
  }, [value, htmlMode]);

  function toggleHtmlMode() {
    if (disabled) return;

    if (!htmlMode) {
      setHtmlValue(sanitizeHtml(ref.current?.innerHTML || value || ""));
      setHtmlMode(true);
      return;
    }

    // Switching back to visual: set content directly before unhiding the div
    const sanitized = sanitizeHtml(htmlValue);
    if (ref.current) {
      ref.current.innerHTML = normalizeRichTextValue(sanitized);
    }
    pendingHtmlRef.current = null;
    onChange(sanitized);
    setHtmlMode(false);
  }

  function emitChange() {
    const editor = ref.current;
    if (!editor || disabled) return;
    onChange(editor.innerHTML);
  }

  function focusEditor() {
    const editor = ref.current;
    if (!editor || disabled) return;
    editor.focus();
  }

  function clearSelectedImages() {
    const editor = ref.current;
    if (!editor) return;

    editor
      .querySelectorAll('img[data-resizing-selected="true"]')
      .forEach((image) => image.removeAttribute("data-resizing-selected"));
  }

  function handleEditorMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (disabled || htmlMode) return;

    const editor = ref.current;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const image = target?.closest("img") as HTMLImageElement | null;

    if (!editor || !image || !editor.contains(image)) {
      clearSelectedImages();
      return;
    }

    clearSelectedImages();
    image.setAttribute("data-resizing-selected", "true");

    const rect = image.getBoundingClientRect();
    const handleSize = 28;
    const startedOnResizeHandle =
      event.clientX >= rect.right - handleSize && event.clientY >= rect.bottom - handleSize;

    if (!startedOnResizeHandle) return;

    event.preventDefault();
    event.stopPropagation();

    resizingImageRef.current = {
      image,
      startX: event.clientX,
      startWidth: rect.width,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const resizing = resizingImageRef.current;
      const currentEditor = ref.current;
      if (!resizing || !currentEditor) return;

      const editorRect = currentEditor.getBoundingClientRect();
      const maxWidth = Math.max(96, editorRect.width - 24);
      const nextWidth = Math.min(
        maxWidth,
        Math.max(72, resizing.startWidth + moveEvent.clientX - resizing.startX),
      );

      resizing.image.style.width = `${Math.round(nextWidth)}px`;
      resizing.image.style.height = "auto";
      resizing.image.style.maxWidth = "100%";
      resizing.image.setAttribute("width", String(Math.round(nextWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      resizingImageRef.current = null;
      emitChange();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }


  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled || htmlMode) return;

    const editor = ref.current;
    if (!editor) return;

    const selectedImage = editor.querySelector<HTMLImageElement>('img[data-resizing-selected="true"]');
    if (!selectedImage) return;

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      selectedImage.remove();
      emitChange();
    }
  }

  async function handleEditorPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled || htmlMode) return;

    const imageItem = Array.from(event.clipboardData?.items || []).find((item) =>
      item.type.startsWith("image/"),
    );

    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();

    const selection = window.getSelection();
    const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src) return;

      focusEditor();
      if (savedRange) {
        const nextSelection = window.getSelection();
        nextSelection?.removeAllRanges();
        nextSelection?.addRange(savedRange);
      }
      insertHtmlAtCursor(createInlineImageHtml(src));
      emitChange();
    };
    reader.readAsDataURL(file);
  }

  function applyCommand(command: "bold" | "italic" | "underline") {
    focusEditor();
    document.execCommand(command, false);
    emitChange();
  }

  function applyAlignment(command: "justifyLeft" | "justifyCenter" | "justifyRight" | "justifyFull") {
    focusEditor();
    document.execCommand(command, false);
    emitChange();
  }

  function toggleHighlight() {
    const editor = ref.current;
    if (!editor || disabled) return;

    focusEditor();

    const existingHighlight = findHighlightElement(editor);
    if (existingHighlight) {
      unwrapElement(existingHighlight);
      emitChange();
      return;
    }

    document.execCommand("hiliteColor", false, "#fef08a");
    document.execCommand("backColor", false, "#fef08a");
    emitChange();
  }

  function clearFormatting() {
    const editor = ref.current;
    if (!editor || disabled) return;

    const plainText = richTextToPlainText(editor.innerHTML);
    editor.textContent = plainText;
    onChange(plainText);
  }

  return (
    <div className="w-full">
      {!compact && !disabled && (
        <div
          className={
            label
              ? "mb-2 flex items-center justify-between gap-2"
              : "mb-1 flex justify-end"
          }
        >
          {label && (
            <label className={`text-xs font-bold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
              {label}
            </label>
          )}

          <TextToolbar
            dark={dark}
            onBold={() => applyCommand("bold")}
            onItalic={() => applyCommand("italic")}
            onUnderline={() => applyCommand("underline")}
            onHighlight={toggleHighlight}
            onClearFormatting={clearFormatting}
            onToggleHtml={toggleHtmlMode}
            htmlMode={htmlMode}
            onAlignLeft={() => applyAlignment("justifyLeft")}
            onAlignCenter={() => applyAlignment("justifyCenter")}
            onAlignRight={() => applyAlignment("justifyRight")}
            onAlignJustify={() => applyAlignment("justifyFull")}
          />
        </div>
      )}

      <div className="relative">
        {compact && !disabled && (
          <div className="mb-1.5 flex justify-end">
            <TextToolbar
              compact
              dark={dark}
              onBold={() => applyCommand("bold")}
              onItalic={() => applyCommand("italic")}
              onUnderline={() => applyCommand("underline")}
              onHighlight={toggleHighlight}
              onClearFormatting={clearFormatting}
              onToggleHtml={toggleHtmlMode}
              htmlMode={htmlMode}
              onAlignLeft={() => applyAlignment("justifyLeft")}
              onAlignCenter={() => applyAlignment("justifyCenter")}
              onAlignRight={() => applyAlignment("justifyRight")}
              onAlignJustify={() => applyAlignment("justifyFull")}
            />
          </div>
        )}

        {htmlMode && (
          <textarea
            value={htmlValue}
            onChange={(event) => setHtmlValue(event.target.value)}
            onBlur={() => onChange(sanitizeHtml(htmlValue))}
            spellCheck={false}
            style={{ minHeight: `${Math.max(minRows, 1) * 2.75}rem` }}
            className={`w-full ${className} font-mono text-xs leading-6`}
          />
        )}
        <div
          ref={ref}
          contentEditable={!disabled && !htmlMode}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
            emitChange();
          }}
          onInput={emitChange}
          onPaste={handleEditorPaste}
          onMouseDown={handleEditorMouseDown}
          onKeyDown={handleEditorKeyDown}
          style={{ minHeight: `${Math.max(minRows, 1) * 2.75}rem`, display: htmlMode ? "none" : undefined }}
          className={`${className} richtext-editor overflow-auto whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 ${
            disabled ? "pointer-events-none opacity-80" : ""
          }`}
        />
      </div>
    </div>
  );
}

function TextToolbar({
  compact,
  dark,
  onBold,
  onItalic,
  onUnderline,
  onHighlight,
  onClearFormatting,
  onToggleHtml,
  htmlMode,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignJustify,
}: {
  compact?: boolean;
  dark?: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onHighlight: () => void;
  onClearFormatting: () => void;
  onToggleHtml: () => void;
  htmlMode: boolean;
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignJustify: () => void;
}) {
  const buttonClass = dark
    ? "inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.10] bg-white/[0.04] text-white/50 transition hover:border-orange-400/30 hover:bg-orange-400/10 hover:text-orange-300 active:scale-95"
    : "inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95";

  const highlightClass = dark
    ? `${buttonClass} border-amber-400/25 bg-amber-400/10 text-amber-300 hover:border-amber-400/40 hover:bg-amber-400/15 hover:text-amber-200`
    : `${buttonClass} border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 hover:text-amber-800`;

  const separatorClass = dark ? "h-5 w-px bg-white/[0.10]" : "h-5 w-px bg-slate-200";

  const htmlActiveClass = dark
    ? "border-white/20 bg-white/[0.15] text-white"
    : "border-slate-900 bg-slate-900 text-white";

  return (
    <div className={`inline-flex flex-wrap items-center gap-1 rounded-xl p-1 shadow-sm ${dark ? "border border-white/[0.10] bg-white/[0.04]" : "border border-slate-200 bg-white/80"}`}>
      <button type="button" title="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={onBold} className={buttonClass}>
        <Bold size={13} />
      </button>
      <button type="button" title="Itálico" onMouseDown={(e) => e.preventDefault()} onClick={onItalic} className={buttonClass}>
        <Italic size={13} />
      </button>
      <button type="button" title="Sublinhado" onMouseDown={(e) => e.preventDefault()} onClick={onUnderline} className={buttonClass}>
        <Underline size={13} />
      </button>
      <button type="button" title="Marca-texto amarelo" onMouseDown={(e) => e.preventDefault()} onClick={onHighlight} className={highlightClass}>
        <Highlighter size={13} />
      </button>
      <span className={separatorClass} aria-hidden />
      <button type="button" title="Alinhar à esquerda" onMouseDown={(e) => e.preventDefault()} onClick={onAlignLeft} className={buttonClass}>
        <AlignLeft size={13} />
      </button>
      <button type="button" title="Centralizar" onMouseDown={(e) => e.preventDefault()} onClick={onAlignCenter} className={buttonClass}>
        <AlignCenter size={13} />
      </button>
      <button type="button" title="Alinhar à direita" onMouseDown={(e) => e.preventDefault()} onClick={onAlignRight} className={buttonClass}>
        <AlignRight size={13} />
      </button>
      <button type="button" title="Justificado" onMouseDown={(e) => e.preventDefault()} onClick={onAlignJustify} className={buttonClass}>
        <AlignJustify size={13} />
      </button>
      <span className={separatorClass} aria-hidden />
      <button type="button" title="Código HTML" onMouseDown={(e) => e.preventDefault()} onClick={onToggleHtml} className={`${buttonClass} ${htmlMode ? htmlActiveClass : ""}`}>
        <Code2 size={13} />
      </button>
      <button type="button" title="Remover formatação" onMouseDown={(e) => e.preventDefault()} onClick={onClearFormatting} className={buttonClass}>
        <Eraser size={13} />
      </button>
    </div>
  );
}
