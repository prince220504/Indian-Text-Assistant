// One citation pill. Data comes from chunk metadata (Day 4), not the model's prose.
// props: {source: "gst-faq.pdf", page: 12}
function SourceCard({source, page}) {
    return (
        <span className="text-xs bg-white border border-gray-300 rounded-full px-2 py-1 text-gray-600">
            {source} . p.{page}
        </span>
    );
}

export default SourceCard;
