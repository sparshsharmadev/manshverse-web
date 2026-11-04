import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];

export default function MarkdownText({ children }) {
  return <ReactMarkdown remarkPlugins={plugins}>{children}</ReactMarkdown>;
}
