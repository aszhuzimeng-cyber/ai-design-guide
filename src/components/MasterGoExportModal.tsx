import { useState } from "react";
import { X } from "lucide-react";
import type { MasterGoCanvasImportResult } from "../mastergoExport";

export function MasterGoExportModal({
  result,
  onClose,
}: {
  result: MasterGoCanvasImportResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"path" | "prompt" | null>(null);
  const prompt = `把 ${result.relativePath} 全量同步覆盖到当前页面根节点。`;

  const copyText = async (text: string, kind: "path" | "prompt") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1800);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="export-modal mastergo-export-modal"
        role="dialog"
        aria-labelledby="mastergo-export-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="close icon-button" type="button" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
        <h2 id="mastergo-export-title">已导入 MasterGo 画布</h2>
        <p>
          {result.canvas.message || "页面 HTML 已写入工作区，并尝试推送到 MasterGo 桌面客户端当前页面。"}
        </p>
        {result.canvas.warning ? (
          <p className="mastergo-export-note" role="status">
            {result.canvas.warning}
          </p>
        ) : null}
        <p className="mastergo-export-note">
          导入时会将预览页转为 <strong>MasterGo 协议</strong>（Tailwind + Flex 布局）再落盘，画布应能还原导航、分区、卡片与按钮结构。与浏览器预览仍可能有字号/间距差异；Lucide 图标会替换为 Font Awesome 占位。
        </p>
        <p className="mastergo-export-note">
          若画布没有变化：请确认 <strong>MasterGo 桌面客户端</strong>已打开当前设计文件（本机服务 <code>127.0.0.1:50678</code>）。导入会调用 <code>createPage</code> 在画布生成节点。
        </p>
        <ol className="mastergo-export-steps">
          <li>生成页点击「导入画布」会写入 <code>.mastergo/design/*.html</code> 与 <code>*.canvas.html</code>，并调用本机 MasterGo <code>createPage</code> 落盘。</li>
          <li>成功时左侧图层面板应出现新的页面根节点（含 <code>data-node-id</code>）；复杂页面可能需要等待 10–30 秒。</li>
          <li>若提示「未生成可见节点」，请重启 MasterGo 客户端后重试，或使用下方 Cursor 指令手动同步。</li>
        </ol>
        <div className="mastergo-export-field">
          <label htmlFor="mastergo-export-path">文件路径</label>
          <div className="mastergo-export-row">
            <code id="mastergo-export-path">{result.relativePath}</code>
            <button className="secondary" type="button" onClick={() => void copyText(result.relativePath, "path")}>
              {copied === "path" ? "已复制" : "复制路径"}
            </button>
          </div>
        </div>
        {result.canvas.targetNodeId ? (
          <div className="mastergo-export-field">
            <label>画布节点</label>
            <div className="mastergo-export-row">
              <code>{result.canvas.targetNodeId}</code>
            </div>
          </div>
        ) : null}
        <div className="mastergo-export-field">
          <label htmlFor="mastergo-export-prompt">备用 Cursor 指令</label>
          <textarea id="mastergo-export-prompt" className="mastergo-export-prompt" readOnly value={prompt} rows={3} />
          <button className="primary" type="button" onClick={() => void copyText(prompt, "prompt")}>
            {copied === "prompt" ? "已复制指令" : "复制 Cursor 指令"}
          </button>
        </div>
      </div>
    </div>
  );
}
