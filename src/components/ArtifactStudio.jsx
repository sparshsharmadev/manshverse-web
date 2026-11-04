import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import AppIcon from "./AppIcon";
import { buildArtifactWebsite } from "../lib/artifacts";

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

export default function ArtifactStudio({ artifact, setArtifact, artifactEditing, setArtifactEditing, artifactFile, setArtifactFile, artifactPreviewRef, exportArtifact, saveArtifact, artifactSaving, versions = [], versionsLoading = false, onRestoreVersion, onClose }) {
  if (!artifact) return null;
  return <div className="artifact-overlay" onClick={onClose}>
    <section className="artifact-dialog" role="dialog" aria-modal="true" aria-labelledby="artifact-title" onClick={event => event.stopPropagation()}>
      <header className="artifact-header">
        <div><span className="artifact-eyebrow">ARTIFACT STUDIO</span><h2 id="artifact-title">{artifact.kind === "website" ? "Website preview" : "Document studio"}</h2></div>
        <button type="button" className="artifact-close" aria-label="Close document studio" onClick={onClose}><AppIcon name="close" size={17}/></button>
      </header>
      <label className="artifact-title-field">Document title<input value={artifact.title} maxLength={100} onChange={event => setArtifact(current => ({ ...current, title: event.target.value }))}/></label>
      <div className="artifact-tools">
        <div className="artifact-tabs" role="group" aria-label="Document mode">
          <button type="button" className={!artifactEditing ? "active" : ""} onClick={() => setArtifactEditing(false)}>{artifact.kind === "website" ? "Live preview" : "Preview"}</button>
          <button type="button" className={artifactEditing ? "active" : ""} onClick={() => setArtifactEditing(true)}>{artifact.kind === "website" ? "Code" : "Edit"}</button>
        </div>
        <span>{artifact.kind === "website" ? "Runs in a sandboxed preview" : "Markdown document"}</span>
      </div>
      {artifact.id && <details className="artifact-history">
        <summary>Version history {versionsLoading ? "· Loading…" : `· ${versions.length} saved version${versions.length === 1 ? "" : "s"}`}</summary>
        {versionsLoading ? <p>Loading version history…</p> : versions.length ? <div>{versions.map(version => <article key={version.id}><span>{new Date(version.created_at).toLocaleString()}</span><strong>{version.title}</strong><button type="button" onClick={() => onRestoreVersion(version)}>Restore this version</button></article>)}</div> : <p>Your saved edits will appear here.</p>}
      </details>}
      {artifact.kind === "website" ? artifactEditing ? (
        <div className="artifact-code-editor">
          <div className="artifact-file-list">{Object.keys(artifact.files || {}).map(file => <button type="button" className={artifactFile === file ? "active" : ""} key={file} onClick={() => setArtifactFile(file)}>{file}</button>)}</div>
          <textarea className="artifact-editor" aria-label={`Edit ${artifactFile}`} value={artifact.files?.[artifactFile] || ""} onChange={event => setArtifact(current => ({ ...current, files: { ...current.files, [artifactFile]: event.target.value } }))}/>
        </div>
      ) : <iframe className="artifact-website-preview" title={`${artifact.title} live preview`} sandbox="allow-scripts" srcDoc={buildArtifactWebsite(artifact.files)}/> : <>
        {artifactEditing && <textarea className="artifact-editor" aria-label="Edit document in Markdown" value={artifact.content} onChange={event => setArtifact(current => ({ ...current, content: event.target.value }))}/>}
        <div className={`artifact-preview-scroll ${artifactEditing ? "artifact-preview-hidden" : ""}`} aria-hidden={artifactEditing || undefined}><article className="artifact-preview" ref={artifactPreviewRef}><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{artifact.content}</ReactMarkdown></article></div>
      </>}
      <footer className="artifact-footer">
        <span>{artifact.id ? "Saved in your library" : "Save to keep editing later"} · PDF opens your browser’s print dialog</span>
        <div>
          <button type="button" className="artifact-primary" onClick={saveArtifact} disabled={artifactSaving}>{artifactSaving ? "Saving…" : artifact.id ? "Save changes" : "Save artifact"}</button>
          <button type="button" onClick={() => exportArtifact("md")}><AppIcon name="download" size={14}/> .md</button>
          <button type="button" onClick={() => exportArtifact("html")}><AppIcon name="download" size={14}/> .html</button>
          <button type="button" className="artifact-primary" onClick={() => exportArtifact("pdf")}><AppIcon name="print" size={14}/> Make PDF</button>
        </div>
      </footer>
    </section>
  </div>;
}
