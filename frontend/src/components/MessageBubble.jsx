import SourceCard from "./SourceCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// One chat message + its citation pills.
// props: { message: {role, text, sources? } }
function MessageBubble({ message }) {
    const isUser = message.role === "user";

    return (
        <div className={isUser ? "ml-auto max-w-[80%]": "mr-auto max-w-[80%]"}>
            <div
                className={
                    isUser
                    ? "bg-blue-100 p-3 rounded-lg whitespace-pre-wrap"
                    : "bg-gray-100 p-3 rounded-lg markdown"
                }
            >
                {isUser ? message.text: <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>}
            </div>

            {/* restored history has no source column -- ?. is why this doesn't throw */}
            {message.sources?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                    {message.sources.map( (s, j) => (
                        <SourceCard key={j} source={s.source} page={s.page} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default MessageBubble;
