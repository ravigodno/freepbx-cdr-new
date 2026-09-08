import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Keyboard,
  Pencil,
  Upload,
  X,
} from "lucide-react";

interface Props {
  token: string;
  agentId?: number;
  enabled: boolean;
  canViewKnowledge: boolean;
  canViewTraining: boolean;
  canManageKnowledge?: boolean;
  canPublishKnowledge?: boolean;
}
type PriceRow = Record<string, string>;
const cleanHeader = (value: unknown, index: number) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim() || `Столбец ${index + 1}`;
const uniqueHeaders = (values: unknown[]) => {
  const used = new Map<string, number>();
  return values.map((item, index) => {
    const base = cleanHeader(item, index),
      count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
};
const headerScore = (row: unknown[]) => {
  const cells = row.map((item) => String(item ?? "").trim()).filter(Boolean),
    text = cells.join(" ").toLowerCase(),
    keywords = [
      "артикул",
      "назван",
      "наимен",
      "город",
      "адрес",
      "локац",
      "тип",
      "режим",
      "цена",
      "стоим",
      "описан",
      "остат",
    ];
  return cells.length * 10 + keywords.filter((word) => text.includes(word)).length * 25;
};
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/giu, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 60) || "price";
const value = (row: PriceRow, key: string) =>
  key ? String(row[key] ?? "").trim() : "";

export default function AgentKnowledgeTrainingPage({
  token,
  agentId,
  enabled,
  canViewKnowledge,
  canViewTraining,
  canManageKnowledge = false,
  canPublishKnowledge = false,
}: Props) {
  const [tab, setTab] = useState<"knowledge" | "training">("knowledge"),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [agents, setAgents] = useState<any[]>([]),
    [targetAgentId, setTargetAgentId] = useState(agentId || 0);
  const [sourceMode, setSourceMode] = useState<"text" | "document" | "price">(
      "text",
    ),
    [textName, setTextName] = useState(""),
    [textContent, setTextContent] = useState(""),
    [documentName, setDocumentName] = useState(""),
    [documentText, setDocumentText] = useState(""),
    [documentFile, setDocumentFile] = useState("");
  const [editing, setEditing] = useState<any>(null),
    [editName, setEditName] = useState(""),
    [editDescription, setEditDescription] = useState(""),
    [editContent, setEditContent] = useState(""),
    [editVersionId, setEditVersionId] = useState<number | null>(null);
  const [filename, setFilename] = useState(""),
    [priceName, setPriceName] = useState(""),
    [priceRows, setPriceRows] = useState<PriceRow[]>([]),
    [headersList, setHeadersList] = useState<string[]>([]),
    [map, setMap] = useState({
      name: "",
      sku: "",
      price: "",
      stock: "",
      description: "",
    });
  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );
  const request = async (path: string, method = "GET", data?: any) => {
    const response = await fetch(path, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      body = await response.json();
    if (!response.ok)
      throw new Error(String(body.error || body.message || "Ошибка запроса"));
    return body.data ?? body.rows;
  };
  const load = async () => {
    const allowed = tab === "knowledge" ? canViewKnowledge : canViewTraining;
    if (!allowed) {
      setRows([]);
      throw new Error("Недостаточно прав");
    }
    setRows(
      (await request(
        `/api/ai-platform/${tab}${tab === "training" && agentId ? `?agentId=${agentId}` : ""}`,
      )) || [],
    );
  };
  useEffect(() => {
    if (enabled) void load().catch((e) => setError(e.message));
  }, [agentId, enabled, headers, tab]);
  useEffect(() => {
    if (enabled)
      void request("/api/ai-platform/voice-agents")
        .then((value) => setAgents(value || []))
        .catch(() => setAgents([]));
  }, [agentId, enabled, headers]);
  const detect = (list: string[], patterns: RegExp[]) =>
    list.find((item) =>
      patterns.some((pattern) => pattern.test(item.toLowerCase())),
    ) || "";
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name))
        throw new Error("Поддерживаются XLSX, XLS и CSV");
      if (file.size > 10 * 1024 * 1024) throw new Error("Файл больше 10 МБ");
      const XLSX = await import("xlsx"),
        book = XLSX.read(await file.arrayBuffer(), { type: "array" }),
        sheet = book.Sheets[book.SheetNames[0]],
        matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: "",
          raw: false,
        }),
        candidates = matrix.slice(0, 30),
        headerIndex = candidates.reduce(
          (best, row, index) =>
            headerScore(row) > headerScore(candidates[best] || []) ? index : best,
          0,
        ),
        width = Math.max(...matrix.slice(headerIndex).map((row) => row.length), 0),
        list = uniqueHeaders(
          Array.from({ length: width }, (_, index) => matrix[headerIndex]?.[index]),
        ),
        parsed = matrix
          .slice(headerIndex + 1)
          .filter((row) => row.filter((item) => String(item ?? "").trim()).length >= 2)
          .slice(0, 10000)
          .map((row) =>
            Object.fromEntries(
              list.map((key, index) => [key, String(row[index] ?? "").trim()]),
            ),
          );
      if (!parsed.length) throw new Error("В файле нет строк с данными");
      setFilename(file.name);
      setPriceName(file.name.replace(/\.[^.]+$/, ""));
      setPriceRows(parsed);
      setHeadersList(list);
      setMap({
        name: detect(list, [/назван/, /наимен/, /товар/, /город/, /локац/, /^name$/]),
        sku: detect(list, [/артикул/, /^sku$/, /^код$/]),
        price: detect(list, [/цена/, /стоим/, /^price$/]),
        stock: detect(list, [/остат/, /налич/, /^stock$/]),
        description: detect(list, [/описан/, /характер/, /^description$/]),
      });
    } catch (e: any) {
      setError(e.message);
    }
  };
  const chooseDocument = async (file?: File) => {
    if (!file) return;
    setError("");
    setMessage("");
    setDocumentText("");
    try {
      if (!/\.(pdf|docx|txt|md)$/i.test(file.name))
        throw new Error("Поддерживаются PDF, DOCX, TXT и MD");
      if (file.size > 10 * 1024 * 1024) throw new Error("Файл больше 10 МБ");
      const buffer = await file.arrayBuffer();
      let extracted = "";
      if (/\.pdf$/i.test(file.name)) {
        const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.js");
        const pdf = await pdfjs.getDocument({
            data: new Uint8Array(buffer),
            disableWorker: true,
            // Mozilla's documented mitigation for CVE-2024-4367. Required
            // while this Node 16 deployment uses the compatible legacy build.
            isEvalSupported: false,
          }).promise,
          pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber),
            content = await page.getTextContent();
          pages.push(
            content.items.map((item: any) => String(item.str || "")).join(" "),
          );
        }
        extracted = pages.join("\n\n");
      } else if (/\.docx$/i.test(file.name)) {
        const mammoth: any = await import("mammoth/mammoth.browser");
        extracted = String(
          (await mammoth.extractRawText({ arrayBuffer: buffer })).value || "",
        );
      } else extracted = new TextDecoder("utf-8").decode(buffer);
      extracted = extracted.replace(/\u0000/g, "").trim();
      if (!extracted)
        throw new Error(
          /\.pdf$/i.test(file.name)
            ? "В PDF нет текстового слоя. Для скана потребуется OCR."
            : "В документе не найден текст",
        );
      setDocumentFile(file.name);
      setDocumentName(file.name.replace(/\.[^.]+$/, ""));
      setDocumentText(extracted.slice(0, 1_000_001));
    } catch (e: any) {
      setError(`Не удалось прочитать документ: ${e.message}`);
    }
  };
  const content = () =>
    priceRows
      .map((row, index) => {
        const title = map.name ? value(row, map.name) : "",
          fields = [
            `Запись: ${title || index + 1}`,
            ...headersList
              .map((header) => [header, value(row, header)] as const)
              .filter(([, item]) => item)
              .map(([header, item]) => `${header}: ${item}`),
          ];
        return fields.join("\n");
      })
      .join("\n---\n");
  const publish = async () => {
    if (!targetAgentId) return setError("Выберите AI-сотрудника");
    const normalized = content();
    if (normalized.length > 1_000_000)
      return setError(
        "Прайс после обработки больше 1 МБ. Разделите его на несколько файлов.",
      );
    setBusy(true);
    setError("");
    try {
      const source = await request("/api/ai-platform/knowledge", "POST", {
          agentId: targetAgentId,
          sourceKey: `${slug(priceName)}_${Date.now()}`,
          name: priceName,
          type: "document",
          description: `Прайс из ${filename}: ${priceRows.length} позиций`,
          metadata: {
            kind: "price_list",
            filename,
            rowCount: priceRows.length,
            columns: map,
            sourceColumns: headersList,
          },
        }),
        version = await request(
          `/api/ai-platform/knowledge/${source.id}/versions`,
          "POST",
          { content: normalized },
        );
      await request(`/api/ai-platform/knowledge/${source.id}/publish`, "POST", {
        versionId: version.id,
      });
      setMessage(`Прайс опубликован: ${priceRows.length} позиций`);
      setPriceRows([]);
      setFilename("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const publishText = async (kind: "manual_text" | "document") => {
    const name = kind === "manual_text" ? textName : documentName,
      contentValue = (
        kind === "manual_text" ? textContent : documentText
      ).trim();
    if (!targetAgentId) return setError("Выберите AI-сотрудника");
    if (!name.trim()) return setError("Укажите название базы знаний");
    if (!contentValue) return setError("Добавьте текст");
    if (contentValue.length > 1_000_000)
      return setError("Текст больше 1 МБ. Разделите его на несколько баз.");
    setBusy(true);
    setError("");
    try {
      const source = await request("/api/ai-platform/knowledge", "POST", {
          agentId: targetAgentId,
          sourceKey: `${slug(name)}_${Date.now()}`,
          name,
          type: kind === "document" ? "document" : "text",
          description:
            kind === "document"
              ? `Документ ${documentFile}`
              : "Информация, введённая вручную",
          metadata: {
            kind,
            filename: kind === "document" ? documentFile : null,
            characterCount: contentValue.length,
          },
        }),
        version = await request(
          `/api/ai-platform/knowledge/${source.id}/versions`,
          "POST",
          { content: contentValue },
        );
      await request(`/api/ai-platform/knowledge/${source.id}/publish`, "POST", {
        versionId: version.id,
      });
      setMessage("База знаний опубликована и подключена к AI-сотруднику");
      if (kind === "manual_text") {
        setTextName("");
        setTextContent("");
      } else {
        setDocumentName("");
        setDocumentText("");
        setDocumentFile("");
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openEditor = async (row: any) => {
    setBusy(true);
    setError("");
    try {
      const current = await request(
        `/api/ai-platform/knowledge/${row.id}/content`,
      );
      setEditing(row);
      setEditName(row.name || "");
      setEditDescription(row.description || "");
      setEditContent(current.content || "");
      setEditVersionId(current.status === "draft" ? current.versionId : null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveDetails = async () => {
    if (!editing || !editName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/ai-platform/knowledge/${editing.id}`, "PUT", {
        name: editName,
        description: editDescription,
      });
      setEditing({ ...editing, name: editName, description: editDescription });
      setMessage("Название и описание сохранены");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveEditDraft = async () => {
    if (!editing || !editContent.trim()) return;
    if (editContent.length > 1_000_000) return setError("Текст больше 1 МБ");
    setBusy(true);
    setError("");
    try {
      const version = await request(
        `/api/ai-platform/knowledge/${editing.id}/versions`,
        "POST",
        { content: editContent },
      );
      setEditVersionId(version.id);
      setMessage(
        `Новая версия ${version.version} сохранена черновиком. Рабочая версия пока не изменилась.`,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const publishEdit = async () => {
    if (
      !editing ||
      !editVersionId ||
      !confirm(
        "Опубликовать новую версию базы знаний? AI-сотрудник начнёт использовать её в новых ответах.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/ai-platform/knowledge/${editing.id}/publish`,
        "POST",
        { versionId: editVersionId },
      );
      setMessage("Новая версия базы знаний опубликована");
      setEditing(null);
      setEditVersionId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const setAssignment = async (row: any, assigned: boolean) => {
    if (!agentId) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/ai-platform/knowledge/${row.id}/assignment`, "POST", {
        agentId,
        enabled: assigned,
      });
      setMessage(assigned ? "База знаний подключена к сотруднику" : "База знаний отключена от сотрудника");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const archiveSource = async (row: any) => {
    if (!confirm(`Удалить базу знаний «${row.name}»? Она будет отключена от всех AI-сотрудников и перемещена в архив.`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/ai-platform/knowledge/${row.id}/archive`, "POST", { confirm: true });
      setMessage("База знаний удалена из рабочего списка и перемещена в архив");
      if (editing?.id === row.id) setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const canImport = canManageKnowledge && canPublishKnowledge;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("knowledge")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${tab === "knowledge" ? "bg-blue-600 text-white" : "border bg-white"}`}
        >
          <BookOpen className="h-4 w-4" />
          Базы знаний
        </button>
        <button
          onClick={() => setTab("training")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${tab === "training" ? "bg-blue-600 text-white" : "border bg-white"}`}
        >
          <GraduationCap className="h-4 w-4" />
          Обучение
        </button>
      </div>
      {tab === "knowledge" && canImport && (
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["text", "Ввести текст", Keyboard],
            ["document", "PDF или Word", FileText],
            ["price", "Таблица / прайс", FileSpreadsheet],
          ].map(([mode, label, Icon]: any) => (
            <button
              key={mode}
              onClick={() => {
                setSourceMode(mode);
                setError("");
                setMessage("");
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${sourceMode === mode ? "border-blue-600 bg-blue-50 text-blue-700" : "bg-white"}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "knowledge" && canImport && sourceMode === "text" && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-blue-600" />
            <h3 className="font-black">Текстовая база знаний</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Введите информацию о компании, правила, инструкции или ответы на
            частые вопросы.
          </p>
          {!agentId && (
            <AgentSelect
              value={targetAgentId}
              set={setTargetAgentId}
              agents={agents}
            />
          )}
          <label className="mt-4 block text-sm font-bold">
            Название базы
            <input
              value={textName}
              onChange={(e) => setTextName(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 font-normal"
              placeholder="Например: Информация о доставке"
            />
          </label>
          <label className="mt-4 block text-sm font-bold">
            Текст
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              rows={14}
              maxLength={1_000_001}
              className="mt-1 w-full rounded-xl border p-3 font-normal"
              placeholder="Введите достоверную информацию, которую AI-сотрудник сможет использовать в ответах клиентам."
            />
          </label>
          <div className="mt-2 text-right text-xs text-slate-500">
            {textContent.length.toLocaleString("ru-RU")} / 1 000 000 символов
          </div>
          <button
            disabled={busy || !textName.trim() || !textContent.trim()}
            onClick={() => void publishText("manual_text")}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-40"
          >
            {busy ? "Публикация…" : "Опубликовать и подключить"}
          </button>
        </section>
      )}
      {tab === "knowledge" && canImport && sourceMode === "document" && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-600" />
            <h3 className="font-black">Документ PDF или Word</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Поддерживаются PDF с текстовым слоем, DOCX, TXT и MD. Проверьте
            извлечённый текст перед публикацией.
          </p>
          {!agentId && (
            <AgentSelect
              value={targetAgentId}
              set={setTargetAgentId}
              agents={agents}
            />
          )}
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm font-bold hover:border-blue-400 hover:bg-blue-50">
            <Upload className="h-5 w-5" />
            {documentFile || "Выбрать PDF, DOCX, TXT или MD"}
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => void chooseDocument(e.target.files?.[0])}
            />
          </label>
          {documentText && (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-bold">
                Название базы
                <input
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  className="mt-1 w-full rounded-xl border p-2 font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Предварительный просмотр и исправление текста
                <textarea
                  value={documentText}
                  onChange={(e) => setDocumentText(e.target.value)}
                  rows={16}
                  className="mt-1 w-full rounded-xl border p-3 font-normal"
                />
              </label>
              <div className="text-right text-xs text-slate-500">
                Извлечено {documentText.length.toLocaleString("ru-RU")} символов
              </div>
              <button
                disabled={busy || !documentName.trim() || !documentText.trim()}
                onClick={() => void publishText("document")}
                className="rounded-xl bg-violet-600 px-5 py-3 font-bold text-white disabled:opacity-40"
              >
                {busy ? "Публикация…" : "Опубликовать и подключить"}
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "knowledge" && canImport && sourceMode === "price" && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <h3 className="font-black">Импорт прайса</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            PBXPuls сам найдёт строку заголовков и сохранит все заполненные
            столбцы. Сопоставление ниже необязательно и используется только
            для более удобного названия записей.
          </p>
          {!agentId && (
            <AgentSelect
              value={targetAgentId}
              set={setTargetAgentId}
              agents={agents}
            />
          )}
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm font-bold hover:border-blue-400 hover:bg-blue-50">
            <Upload className="h-5 w-5" />
            {filename || "Выбрать XLSX, XLS или CSV"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void chooseFile(e.target.files?.[0])}
            />
          </label>
          {priceRows.length > 0 && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-bold">
                  Название базы
                  <input
                    className="mt-1 w-full rounded-xl border p-2 font-normal"
                    value={priceName}
                    onChange={(e) => setPriceName(e.target.value)}
                  />
                </label>
                <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                  <b>{priceRows.length}</b> позиций · лист 1 · файл не
                  импортирован
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Column
                  label="Главное название (необязательно)"
                  current={map.name}
                  list={headersList}
                  set={(name) => setMap({ ...map, name })}
                />
                <Column
                  label="Артикул (необязательно)"
                  current={map.sku}
                  list={headersList}
                  set={(sku) => setMap({ ...map, sku })}
                />
                <Column
                  label="Цена (необязательно)"
                  current={map.price}
                  list={headersList}
                  set={(price) => setMap({ ...map, price })}
                />
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                Будут импортированы все столбцы ({headersList.length}): {headersList.join(" · ")}
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {headersList.slice(0, 8).map((header) => (
                        <th key={header} className="min-w-36 p-2">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {priceRows.slice(0, 10).map((row, index) => (
                      <tr key={index} className="border-t">
                        {headersList.slice(0, 8).map((header) => (
                          <td key={header} className="max-w-xs truncate p-2">
                            {value(row, header) || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                disabled={busy || !priceName || !priceRows.length}
                onClick={() => void publish()}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-40"
              >
                {busy ? "Публикация…" : "Импортировать и опубликовать"}
              </button>
            </div>
          )}
        </section>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Название</th>
              <th className="p-3">Тип</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Версия / дата</th>
              {tab === "knowledge" && agentId && <th className="p-3">Подключение</th>}
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3 font-semibold">{row.name || row.title}</td>
                <td className="p-3">
                  {row.metadata?.kind === "price_list" ? "Прайс" : row.type}
                </td>
                <td className="p-3">{row.status}</td>
                <td className="p-3">
                  {row.latest_version || row.created_at || "—"}
                </td>
                {tab === "knowledge" && agentId && (
                  <td className="p-3">
                    {(row.assignedAgentIds || []).includes(agentId) ? (
                      <button disabled={busy || !canManageKnowledge} onClick={() => void setAssignment(row, false)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50">Подключена · отключить</button>
                    ) : (
                      <button disabled={busy || !canManageKnowledge || row.status !== "published"} onClick={() => void setAssignment(row, true)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Подключить</button>
                    )}
                  </td>
                )}
                <td className="p-3 text-right">
                  {tab === "knowledge" && canManageKnowledge && (
                    <div className="flex justify-end gap-2">
                      <button disabled={busy} onClick={() => void openEditor(row)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5" />Редактировать</button>
                      <button disabled={busy} onClick={() => void archiveSource(row)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Удалить</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && !error && (
              <tr>
                <td colSpan={tab === "knowledge" && agentId ? 6 : 5} className="p-8 text-center text-slate-500">
                  Нет данных.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">Редактирование базы знаний</h3>
                <p className="text-sm text-slate-500">
                  Название сохраняется сразу, изменения текста — новой версией.
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <label className="text-sm font-bold">
                Название
                <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={191} className="mt-1 w-full rounded-xl border p-2 font-normal" />
              </label>
              <label className="text-sm font-bold">
                Описание
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-xl border p-2 font-normal" />
              </label>
              <button disabled={busy || !editName.trim()} onClick={() => void saveDetails()} className="self-end rounded-xl border px-4 py-2 text-sm font-bold">
                Сохранить название
              </button>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                setEditVersionId(null);
              }}
              rows={24}
              className="mt-4 w-full rounded-xl border p-3 font-mono text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {editContent.length.toLocaleString("ru-RU")} / 1 000 000
                символов
              </span>
              <div className="flex gap-2">
                <button
                  disabled={busy || !editContent.trim()}
                  onClick={() => void saveEditDraft()}
                  className="rounded-xl border px-4 py-2 text-sm font-bold"
                >
                  Сохранить новую версию
                </button>
                {canPublishKnowledge && (
                  <button
                    disabled={busy || !editVersionId}
                    onClick={() => void publishEdit()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    Опубликовать версию
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Column({
  label,
  current,
  list,
  set,
}: {
  label: string;
  current: string;
  list: string[];
  set: (value: string) => void;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <select
        className="mt-1 w-full rounded-xl border p-2 font-normal"
        value={current}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">Не выбрано</option>
        {list.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}
function AgentSelect({
  value,
  set,
  agents,
}: {
  value: number;
  set: (value: number) => void;
  agents: any[];
}) {
  return (
    <label className="mt-4 block text-sm font-bold">
      AI-сотрудник
      <select
        className="mt-1 block w-full rounded-xl border p-2 font-normal"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      >
        <option value={0}>Выберите сотрудника</option>
        {agents.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
