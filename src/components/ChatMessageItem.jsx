import { memo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import AppIcon from "./AppIcon";

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];
const fixLatex = value => value?.replace(/\\\[/g,"$$").replace(/\\\]/g,"$$").replace(/\\\(/g,"$").replace(/\\\)/g,"$").trim() || "";
const parseThinking = value => {
  const thinking = value?.match(/<artifact-plan>([\s\S]*?)<\/artifact-plan>/i)?.[1]?.trim() || null;
  const answer = String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<artifact-plan>[\s\S]*?<\/artifact-plan>/gi, "").trim();
  return { thinking, answer };
};
const parseArtifactQuestions = content => {
  const questions = [];
  const answer = String(content || "").replace(/\[\[MCQ:\s*([^|\]]+?)\s*\|\s*([^\]]+)\]\]/g, (_match, question, choices) => {
    const options = choices.split("|").map(option => option.trim()).filter(Boolean);
    if (options.length >= 2) questions.push({ question: question.trim(), options });
    return "";
  }).trim();
  return { answer, questions };
};
const formatMessageTime = value => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }).format(date);
};

const PreBlock = ({ children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  return <div className="message-code-block">
    <button type="button" onClick={() => { navigator.clipboard.writeText(ref.current?.textContent || ""); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <><AppIcon name="check" size={12}/> Copied</> : "Copy"}
    </button>
    <pre ref={ref} {...props}>{children}</pre>
  </div>;
};
const markdownComponents = { pre:PreBlock };

const ChatMessageItem = memo(function ChatMessageItem({ msg, index, userName, userInitial, userAvatar, personaId, personaName, personaBackground, shadowMode, isCopied, isRemembered, onCopy, onRate, onRetry, onEdit, onRemember, onArtifact, onChoice }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [mcqSelections, setMcqSelections] = useState({});
  if (msg.type === "routing") return <div className="routing-chip"><ReactMarkdown>{msg.content}</ReactMarkdown></div>;
  const { thinking, answer: parsedAnswer } = parseThinking(msg.content);
  const { answer, questions } = parseArtifactQuestions(parsedAnswer);
  const isUser = msg.role === "user";
  const author = isUser ? userName : (personaName || msg.modelLabel);
  return <div className="msg">
    <div className="msg-head">
      <div className={`msg-av ${isUser ? "user" : "assistant"}`} style={isUser
        ? { background:"rgba(255,255,255,0.06)", color:"#ccc", border:"1px solid rgba(255,255,255,0.08)" }
        : { background:personaName ? personaBackground : "rgba(108,71,255,0.15)", color:personaName ? "#fff" : "var(--atm-accent)", border:personaName ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(108,71,255,0.3)" }}>
        {isUser && userAvatar && !avatarFailed ? <img className="msg-avatar-image" src={userAvatar} alt="" onError={() => setAvatarFailed(true)}/> : isUser ? userInitial : personaName ? <AppIcon name={personaId || "sparkles"} size={18}/> : <img className="msg-avatar-image" src="/manshverse-logo.svg" alt=""/>}
      </div>
      <div className="msg-name" style={{ color:isUser ? "#888" : (personaName ? "#fff" : "var(--atm-accent)") }}>{author}</div>
      <time className="msg-time" dateTime={msg.createdAt || undefined}>{formatMessageTime(msg.createdAt)}</time>
      {msg.role === "assistant" && shadowMode && <span className="shadow-message-badge"><AppIcon name="eye" size={11}/> Shadow</span>}
    </div>
    <div className={`msg-body ${msg.role}`}>
      {msg.streaming && !msg.content && <div className="stream-status" role="status" aria-live="polite"><span className="stream-dots"><i/><i/><i/></span><span>{msg.modelLabel === "Mansh Mode" ? "Choosing a model and thinking…" : `${msg.modelLabel || "Manshverse"} is thinking…`}</span></div>}
      {thinking && <div className="artifact-build-plan"><span><AppIcon name="sparkles" size={12}/> Build plan</span><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{fixLatex(thinking)}</ReactMarkdown></div>}
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>{fixLatex(answer || msg.content)}</ReactMarkdown>
      {msg.failed && <div className="message-failure" role="status"><span>{msg.failureMessage || "This response did not finish."}</span><strong>Your partial answer is kept above. Retry to continue.</strong></div>}
      {questions.length > 0 && !msg.streaming && <section className="artifact-mcq" aria-label="Artifact setup questions"><strong>Quick choices</strong>{questions.map((item, questionIndex) => <div className="artifact-mcq-question" key={`${questionIndex}-${item.question}`}><span>{item.question}</span><div>{item.options.map((option, optionIndex) => <button type="button" className={mcqSelections[questionIndex] === option ? "selected" : ""} key={`${optionIndex}-${option}`} aria-pressed={mcqSelections[questionIndex] === option} onClick={() => setMcqSelections(previous => ({ ...previous, [questionIndex]:option }))}>{String.fromCharCode(65 + optionIndex)}. {option}</button>)}</div></div>)}<button type="button" className="artifact-mcq-continue" disabled={Object.keys(mcqSelections).length < questions.length} onClick={() => onChoice(questions.map((item, questionIndex) => ({ question:item.question, answer:mcqSelections[questionIndex] })))}>Continue with these choices <span aria-hidden="true">→</span></button></section>}
      {msg.streaming && <span className="msg-cursor"/>}
    </div>
    {!msg.streaming && <div className="msg-actions">
      <button className={`act-btn ${isCopied ? "ok" : ""}`} onClick={() => onCopy(index, msg.content)}>{isCopied ? <><AppIcon name="check" size={12}/> Copied</> : <><AppIcon name="copy" size={12}/> Copy</>}</button>
      {isUser ? <><button className="act-btn" onClick={() => onEdit(index, msg)} aria-label="Edit message" title="Edit message"><AppIcon name="edit" size={12}/> Edit</button><button className={`act-btn ${isRemembered ? "ok" : ""}`} onClick={() => onRemember(msg)} aria-label={isRemembered ? "Saved to memory" : "Save to memory"} title={isRemembered ? "Saved to memory" : "Save to memory"}><AppIcon name={isRemembered ? "check" : "save"} size={12}/>{isRemembered ? "Saved" : "Remember"}</button></> : <>
        {questions.length === 0 && <button className="act-btn" onClick={() => onArtifact(msg)} aria-label="Create an artifact from this response" title="Create document or artifact"><AppIcon name="document" size={12}/> Create</button>}
        <button className={`act-btn ${msg.rating === "up" ? "selected" : ""}`} onClick={() => onRate(index, "up")} aria-label={msg.rating === "up" ? "Remove like" : "Like response"} title={msg.rating === "up" ? "Unlike" : "Helpful"}><AppIcon name="thumbUp" size={12}/></button>
        <button className={`act-btn ${msg.rating === "down" ? "selected" : ""}`} onClick={() => onRate(index, "down")} aria-label={msg.rating === "down" ? "Remove dislike" : "Dislike response"} title={msg.rating === "down" ? "Remove dislike" : "Not helpful"}><AppIcon name="thumbDown" size={12}/></button>
        <button className="act-btn" onClick={() => onRetry(index)} aria-label="Retry response" title="Regenerate response"><AppIcon name="refresh" size={12}/> Retry</button>
        {msg.failed && msg.modelId !== "openai/gpt-oss-20b" && <button className="act-btn" onClick={() => onRetry(index, "openai/gpt-oss-20b")} aria-label="Retry with GPT OSS 20B">Try faster model</button>}
      </>}
    </div>}
  </div>;
});

export default ChatMessageItem;
