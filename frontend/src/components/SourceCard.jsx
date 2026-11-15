// One citation tag. Data comes from chunk metadata (Day 4), not the model's prose.
// props: {source: "gst-faq.pdf", page: 12}
function SourceCard({ source, page }) {
    return (
        <span className="source-tag">
            {source}, p.&nbsp;{page}
        </span>
    );
}

export default SourceCard;
