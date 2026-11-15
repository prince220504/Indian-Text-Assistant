import SourceCard from "./SourceCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// One chat message + its citation tags.
// props: { message: {role, text, sources?, error? }, ref? }
// React 19: `ref` arrives as a plain prop -- Chat uses it to scroll a new answer into view
function MessageBubble({ message, ref }) {
    if (message.role === "user") {
        return <div ref={ref} className="msg--user">{message.text}</div>;
    }
    if (message.error) {
        return <div ref={ref} className="msg--error" role="alert">{message.text}</div>;
    }

    return (
        <div ref={ref} className="msg--assistant on-cream">
            <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
            </div>

            {/* restored history has no source column -- ?. is why this doesn't throw */}
            {message.sources?.length > 0 && (
                <div className="sources" aria-label="Sources">
                    {message.sources.map((s, j) => (
                        <SourceCard key={j} source={s.source} page={s.page} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default MessageBubble;
